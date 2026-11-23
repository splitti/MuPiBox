// The Winamp theme's skins: a classic Winamp 2.x skin is a .wsz (a zip) of bitmaps. The parents' app uploads one; here
// it is unpacked into one folder of lower-case bitmaps next to a skin.json (the sizes of the bitmaps, the analyser's
// colours from viscolor.txt, the playlist's colours from pledit.txt) that the display reads - see
// frontend-box/src/app/winamp. No zip library: a skin is a small, plain zip, read here with node:zlib.

import { inflateRawSync } from 'node:zlib'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { WWW_DIR } from '../paths'

export const WINAMP_SKIN_DIR = `${WWW_DIR}/theme-data/winamp/skin`
/** every skin that was uploaded, one folder each (the display only reads WINAMP_SKIN_DIR: the one chosen is copied there) */
export const WINAMP_SKIN_LIBRARY = `${WWW_DIR}/theme-data/winamp/skins`
export interface SkinDirs {
  active: string
  library: string
}
const DEFAULT_DIRS: SkinDirs = { active: WINAMP_SKIN_DIR, library: WINAMP_SKIN_LIBRARY }

const MAX_ENTRIES = 600
const MAX_FILE = 4 * 1024 * 1024
const MAX_TOTAL = 20 * 1024 * 1024
// what the display uses (everything else in a skin - cursors, region.txt, readmes - is left out)
const KEEP = /^(main|cbuttons|titlebar|shufrep|numbers|nums_ex|playpaus|posbar|volume|balance|monoster|text|eqmain|eq_ex|pledit|gen|genex|mb|video|avs)\.bmp$/

export interface SkinMeta {
  /** the folder name in the library (the skin in WINAMP_SKIN_DIR carries it too: which one is chosen) */
  id?: string
  name: string
  version: number
  files: Record<string, [number, number]>
  viscolors: string[]
  pledit: { normal: string; current: string; normalBg: string; selectedBg: string; font: string }
}

export interface ZipEntry {
  name: string
  data: Buffer
}

/** The files of a zip (stored or deflated); throws on anything that is not a plain zip. */
export interface ZipLimits {
  /** the largest file, unpacked (default: for a skin) */
  maxFile?: number
  /** all files together, unpacked */
  maxTotal?: number
  /** a file over maxFile is an error (default: it is left out, as a skin may carry things the display does not use) */
  strict?: boolean
}

export function readZip(buf: Buffer, limits: ZipLimits = {}): ZipEntry[] {
  const maxFile = limits.maxFile ?? MAX_FILE
  const maxTotal = limits.maxTotal ?? MAX_TOTAL
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip')
  const count = buf.readUInt16LE(eocd + 10)
  let pos = buf.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new Error('too many files')
  const entries: ZipEntry[] = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('broken zip')
    const method = buf.readUInt16LE(pos + 10)
    const compressed = buf.readUInt32LE(pos + 20)
    const size = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const local = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen)
    pos += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (size > maxFile) {
      if (limits.strict) throw new Error(`${name.slice(0, 40)} is too large`)
      continue
    }
    if (total + size > maxTotal) throw new Error('too large')
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('broken zip')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + compressed)
    // (what really comes out counts, not what the archive says: a file that says it is small and unpacks to much more
    // went past the limit of the whole - at most what is left of it, and it must be the size it said)
    let data: Buffer | null = null
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, Math.min(maxFile, maxTotal - total)) })
    if (!data) continue
    if (data.length !== size) throw new Error('broken zip')
    total += data.length
    if (total > maxTotal) throw new Error('too large')
    entries.push({ name, data })
  }
  return entries
}

/** Width and height of a Windows bitmap, or undefined when it is not one (or absurdly large). */
export function bmpSize(data: Buffer): [number, number] | undefined {
  if (data.length < 26 || data.toString('latin1', 0, 2) !== 'BM') return undefined
  const w = data.readInt32LE(18)
  const h = Math.abs(data.readInt32LE(22))
  return w > 0 && h > 0 && w <= 2048 && h <= 2048 ? [w, h] : undefined
}

export function parseViscolors(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
    if (!m) continue
    out.push(`#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`)
    if (out.length === 24) break
  }
  return out
}

export function parsePledit(text: string): SkinMeta['pledit'] {
  const get = (key: string, fallback: string) => {
    const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(#?[0-9a-fA-F]{6})\\s*$`, 'm'))
    return m ? `#${m[1].replace('#', '').toUpperCase()}` : fallback
  }
  const font = text.match(/^\s*Font\s*=\s*([^\r\n]+)/m)?.[1]?.trim().replace(/[^\w \-]/g, '') || 'Arial'
  return {
    normal: get('Normal', '#00FF00'),
    current: get('Current', '#FFFFFF'),
    normalBg: get('NormalBG', '#000000'),
    selectedBg: get('SelectedBG', '#0000C6'),
    font,
  }
}

/** The skin's files from a .wsz, ready to be written: lower-case names, only bitmaps the display uses, plus skin.json. */
export function skinFiles(wsz: Buffer, name: string, version: number): { files: Map<string, Buffer>; meta: SkinMeta } {
  const entries = readZip(wsz)
  const files = new Map<string, Buffer>()
  const sizes: Record<string, [number, number]> = {}
  let viscolors: string[] = []
  let pledit = parsePledit('')
  for (const entry of entries) {
    // (some skins keep everything in a folder: the file name is what counts)
    const base = path.posix.basename(entry.name.replace(/\\/g, '/')).toLowerCase()
    if (KEEP.test(base)) {
      const size = bmpSize(entry.data)
      if (!size) continue
      files.set(base, entry.data)
      sizes[base] = size
    } else if (base === 'viscolor.txt') {
      viscolors = parseViscolors(entry.data.toString('latin1'))
    } else if (base === 'pledit.txt') {
      pledit = parsePledit(entry.data.toString('latin1'))
    }
  }
  if (!sizes['main.bmp'] || !sizes['cbuttons.bmp']) throw new Error('not a Winamp skin')
  const meta: SkinMeta = { name, version, files: sizes, viscolors, pledit }
  return { files, meta }
}

/** Writes a skin over the installed one: first into a folder next to it, then swapped, so the display never sees half of it. */
export async function installSkin(wsz: Buffer, name: string, dir = WINAMP_SKIN_DIR): Promise<SkinMeta> {
  const { files, meta } = skinFiles(wsz, name.replace(/\.wsz$/i, '').slice(0, 60) || 'Skin', Date.now())
  const tmp = `${dir}.new`
  await fsp.rm(tmp, { recursive: true, force: true })
  await fsp.mkdir(tmp, { recursive: true })
  for (const [file, data] of files) await fsp.writeFile(path.join(tmp, file), data)
  await fsp.writeFile(path.join(tmp, 'skin.json'), JSON.stringify(meta))
  await fsp.rm(dir, { recursive: true, force: true })
  await fsp.rename(tmp, dir)
  return meta
}

export async function readSkinMeta(dir = WINAMP_SKIN_DIR): Promise<SkinMeta | undefined> {
  try {
    return JSON.parse(await fsp.readFile(path.join(dir, 'skin.json'), 'utf8')) as SkinMeta
  } catch {
    return undefined
  }
}

export async function removeSkin(dir = WINAMP_SKIN_DIR): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true })
}

// ---------- the library of uploaded skins ----------

export interface StoredSkin {
  id: string
  name: string
  version: number
  /** the one the display shows */
  active: boolean
}

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const slug = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'skin'

async function copyFolder(from: string, to: string): Promise<void> {
  await fsp.rm(to, { recursive: true, force: true })
  await fsp.mkdir(to, { recursive: true })
  for (const f of await fsp.readdir(from)) await fsp.copyFile(path.join(from, f), path.join(to, f))
}

const exists = (p: string) =>
  fsp
    .stat(p)
    .then(() => true)
    .catch(() => false)

/**
 * A new skin goes into the library and is the one shown (the display reads the folder `active`). Its id is made of its
 * name, so a folder of the library tells what it is.
 */
export async function addSkin(wsz: Buffer, fileName: string, dirs: SkinDirs = DEFAULT_DIRS): Promise<{ id: string; meta: SkinMeta }> {
  const name = fileName.replace(/\.wsz$/i, '').slice(0, 60) || 'Skin'
  const { files, meta } = skinFiles(wsz, name, Date.now())
  const id = `${slug(name)}-${Date.now().toString(36)}`
  meta.id = id
  const tmp = path.join(dirs.library, `.${id}.new`)
  await fsp.rm(tmp, { recursive: true, force: true })
  await fsp.mkdir(tmp, { recursive: true })
  for (const [file, data] of files) await fsp.writeFile(path.join(tmp, file), data)
  await fsp.writeFile(path.join(tmp, 'skin.json'), JSON.stringify(meta))
  await fsp.rename(tmp, path.join(dirs.library, id))
  const active = await activateSkin(id, dirs)
  return { id, meta: active ?? meta }
}

/** The skin of the library the display shows from now on; undefined when there is none with that id. */
export async function activateSkin(id: string, dirs: SkinDirs = DEFAULT_DIRS): Promise<SkinMeta | undefined> {
  if (!ID.test(id)) return undefined
  const from = path.join(dirs.library, id)
  if (!(await exists(path.join(from, 'skin.json')))) return undefined
  const tmp = `${dirs.active}.new`
  await copyFolder(from, tmp)
  // (a new version: the display loads the bitmaps again, also when the same skin is chosen once more)
  const meta = { ...(JSON.parse(await fsp.readFile(path.join(tmp, 'skin.json'), 'utf8')) as SkinMeta), id, version: Date.now() }
  await fsp.writeFile(path.join(tmp, 'skin.json'), JSON.stringify(meta))
  await fsp.rm(dirs.active, { recursive: true, force: true })
  await fsp.rename(tmp, dirs.active)
  return meta
}

/**
 * All skins of the library, the one shown marked. A skin that was uploaded before the library existed (it is only in
 * WINAMP_SKIN_DIR) is taken into it first.
 */
export async function listSkins(dirs: SkinDirs = DEFAULT_DIRS): Promise<StoredSkin[]> {
  await fsp.mkdir(dirs.library, { recursive: true })
  let active = await readSkinMeta(dirs.active)
  if (active && (!active.id || !(await exists(path.join(dirs.library, active.id))))) {
    const id = `${slug(active.name)}-${Date.now().toString(36)}`
    await copyFolder(dirs.active, path.join(dirs.library, id))
    const json = { ...active, id }
    await fsp.writeFile(path.join(dirs.library, id, 'skin.json'), JSON.stringify(json))
    await fsp.writeFile(path.join(dirs.active, 'skin.json'), JSON.stringify(json))
    active = json
  }
  const out: StoredSkin[] = []
  for (const entry of await fsp.readdir(dirs.library, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ID.test(entry.name)) continue
    const meta = await readSkinMeta(path.join(dirs.library, entry.name))
    if (meta) out.push({ id: entry.name, name: meta.name, version: meta.version, active: active?.id === entry.name })
  }
  // (the newest first)
  return out.sort((a, b) => b.version - a.version)
}

/** The skin that comes with the theme (the update copies themes/winamp/ into theme-data/winamp/) and the mark that it was offered. */
export const DEFAULT_SKIN_FILE = `${WWW_DIR}/theme-data/winamp/base-2.91.wsz`
export const DEFAULT_SKIN_MARK = `${WWW_DIR}/theme-data/winamp/.default-skin-done`

/**
 * The classic base skin (base-2.91) is the first skin of a box, so the theme shows something at once. Only once: when the
 * box has a skin already, or one was taken out of the list later, nothing comes back. Nothing happens when its file is not
 * there (yet): the next start tries again. Returns whether the skin was added.
 */
export async function ensureDefaultSkin(file = DEFAULT_SKIN_FILE, mark = DEFAULT_SKIN_MARK, dirs: SkinDirs = DEFAULT_DIRS): Promise<boolean> {
  if (await exists(mark)) return false
  let wsz: Buffer
  try {
    wsz = await fsp.readFile(file)
  } catch {
    return false
  }
  const has = (await listSkins(dirs)).length > 0
  if (!has) await addSkin(wsz, path.basename(file), dirs)
  await fsp.writeFile(mark, new Date().toISOString())
  return !has
}

/** Takes a skin out of the library; the one shown is taken away too when it is that one. */
export async function removeSkinById(id: string, dirs: SkinDirs = DEFAULT_DIRS): Promise<boolean> {
  if (!ID.test(id)) return false
  const dir = path.join(dirs.library, id)
  if (!(await exists(dir))) return false
  await fsp.rm(dir, { recursive: true, force: true })
  if ((await readSkinMeta(dirs.active))?.id === id) await fsp.rm(dirs.active, { recursive: true, force: true })
  return true
}
