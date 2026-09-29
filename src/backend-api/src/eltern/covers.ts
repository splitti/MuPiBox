// Own cover pictures (e.g. for radio streams): square images in media/cover, which the admin interface served as
// http://<box>/cover/<name> (/var/www/cover links there). The same checks as its cover page: a plain file name, JPEG,
// PNG, GIF or WEBP, square, 300 to 1200 px.

import { randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import type { Request, Router } from 'express'
import { setCoverHidden } from '../hidden-covers'
import { type CoverCandidate, fetchCoverImage, searchDeezer, searchItunes } from '../online-covers'
import { requireCsrf, requireSession } from './middleware'
import type { LocalLibraryDeps } from './upload'

export interface CustomCoverDeps {
  /** The folder of the pictures (/home/dietpi/MuPiBox/media/cover). */
  dir: string
  /** The box's host name for the address of a picture (mupibox.host). */
  host: () => string
}

const NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp)$/i
const MAX_BYTES = 10 * 1024 * 1024
const CONTENT_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Width and height from the file's header (JPEG, PNG, GIF, WEBP); undefined for anything else. */
export function imageSize(b: Buffer): { type: string; width: number; height: number } | undefined {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b.length >= 10 && b.toString('latin1', 0, 4) === 'GIF8') return { type: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16)
    if (chunk === 'VP8 ') return { type: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { type: 'webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
    return undefined
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      const len = b.readUInt16BE(i + 2)
      // start of frame (not DHT, JPG or DAC, which share the range)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return undefined
}

export function registerCustomCoverRoutes(router: Router, deps: ChoiceDeps): void {
  const address = (name: string) => `http://${deps.host()}/cover/${encodeURIComponent(name)}`
  registerCoverChoiceRoutes(router, deps, address)

  /** GET /api/app/covers - the pictures, newest first, with their address. */
  router.get('/covers', requireSession, async (_req, res) => {
    let names: string[] = []
    try {
      names = (await fsp.readdir(deps.dir)).filter((n) => NAME.test(n))
    } catch {
      // no folder yet: no pictures
    }
    const covers = await Promise.all(
      names.map(async (name) => {
        const st = await fsp.stat(path.join(deps.dir, name)).catch(() => undefined)
        return { name, size: st?.size ?? 0, at: st?.mtimeMs ?? 0, url: address(name) }
      }),
    )
    res.json({ covers: covers.sort((a, b) => b.at - a.at) })
  })

  /** GET /api/app/covers/file/:name - a picture, for the preview in the app (does not need the web server). */
  router.get('/covers/file/:name', requireSession, (req, res) => {
    const name = String(req.params.name)
    if (!NAME.test(name)) {
      res.status(400).end()
      return
    }
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(path.join(deps.dir, name), (err) => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })

  /**
   * PUT /api/app/covers/upload?name=<file name>  body: the picture's bytes.
   * A picture of the same name is replaced (answer: replaced true).
   */
  router.put('/covers/upload', requireSession, requireCsrf, async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name : ''
    if (!NAME.test(name)) {
      res.status(400).json({ error: 'bad_name' })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > MAX_BYTES) {
          res.status(413).json({ error: 'too_large' })
          req.destroy()
          return
        }
        chunks.push(chunk as Buffer)
      }
    } catch {
      if (!res.headersSent) res.status(400).json({ error: 'upload_failed' })
      return
    }
    const bytes = Buffer.concat(chunks)
    const info = imageSize(bytes)
    if (!info) {
      res.status(415).json({ error: 'not_an_image' })
      return
    }
    if (info.width !== info.height) {
      res.status(422).json({ error: 'not_square', width: info.width, height: info.height })
      return
    }
    if (info.width < 300 || info.width > 1200) {
      res.status(422).json({ error: 'bad_size', width: info.width, height: info.height })
      return
    }
    const target = path.join(deps.dir, name)
    const replaced = await fsp.stat(target).then(() => true, () => false)
    const tmp = path.join(deps.dir, `.${name}.${process.pid}.part`)
    try {
      await fsp.mkdir(deps.dir, { recursive: true })
      await fsp.writeFile(tmp, bytes, { mode: 0o664 })
      await fsp.rename(tmp, target)
    } catch (err) {
      await fsp.unlink(tmp).catch(() => undefined)
      console.warn(`${new Date().toLocaleString()}: [covers] ${name}: ${(err as Error).message}`)
      res.status(500).json({ error: 'write_failed' })
      return
    }
    res.json({ ok: true, name, url: address(name), replaced })
  })

  /** POST /api/app/covers/delete {name} */
  router.post('/covers/delete', requireSession, requireCsrf, async (req, res) => {
    const name = String((req.body as { name?: unknown } | undefined)?.name ?? '')
    if (!NAME.test(name)) {
      res.status(400).json({ error: 'bad_name' })
      return
    }
    try {
      await fsp.unlink(path.join(deps.dir, name))
    } catch {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    res.json({ ok: true })
  })
}

// ---------- Choosing a cover in the app: search iTunes/Deezer or take an own picture, for a folder or an entry ----------

// A chosen picture: the app sends it squared and at most 1200 px (canvas), the search results are at most 2 MB
const MAX_CHOSEN_BYTES = 5 * 1024 * 1024
const MIN_CHOSEN_EDGE = 200
const COVER_BASE = 'cover'
// the one before is kept next to it (once), in case the new one was the wrong choice
const PREVIOUS_BASE = 'cover-previous'
// stored by the box next to a scanned picture (online covers): it would come before a chosen cover
const BOX_ONLINE_COVER = 'cover-online.jpg'
const PICTURE_EXTENSIONS = ['.jpg', '.jpeg', '.jfif', '.png', '.webp']

type Applied = { status: number; body: Record<string, unknown> }
type ChoiceDeps = CustomCoverDeps & {
  local?: LocalLibraryDeps
  nas?: (folder: string, bytes: Buffer, ext: '.jpg' | '.png') => Promise<'ok' | 'not_selected' | 'offline' | 'denied' | 'failed'>
  nasSelected?: (folder: string) => Promise<boolean>
}

// A folder of the SD card as a cover target (local:<category>/<folder>[/…]): its parts, when it is one
function localTargetParts(target: string, local: LocalLibraryDeps): string[] | undefined {
  const parts = target.slice(6).split('/').filter(Boolean)
  if (parts.length < 2 || !local.categories.includes(parts[0]) || parts.some((p) => p === '.' || p === '..' || p.includes('\\'))) return undefined
  const categoryDir = path.join(local.root, parts[0])
  return path.join(local.root, ...parts).startsWith(categoryDir + path.sep) ? parts : undefined
}

function registerCoverChoiceRoutes(router: Router, deps: ChoiceDeps, address: (name: string) => string): void {
  /**
   * GET /api/app/cover-search?q=<text> - albums at iTunes and Deezer with a picture, taken in turns (at most 24).
   * The search term goes to Apple and Deezer; the app says so.
   */
  router.get('/cover-search', requireSession, async (req, res) => {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 100)
    if (q.length < 2) {
      res.status(400).json({ error: 'query_too_short' })
      return
    }
    const [itunes, deezer] = await Promise.allSettled([searchItunes(q, 12, 1000), searchDeezer(q, 12, true)])
    if (itunes.status === 'rejected' && deezer.status === 'rejected') {
      console.warn(`${new Date().toLocaleString()}: [cover-search] ${String(itunes.reason)} / ${String(deezer.reason)}`)
      res.status(502).json({ error: 'search_failed' })
      return
    }
    const a = itunes.status === 'fulfilled' ? itunes.value : []
    const b = deezer.status === 'fulfilled' ? deezer.value : []
    const results: CoverCandidate[] = []
    const seen = new Set<string>()
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      for (const c of [a[i], b[i]]) {
        if (!c) continue
        const key = `${c.title}|${c.artist}`.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        results.push(c)
      }
    }
    res.json({
      results: results.slice(0, 24).map((c) => ({ source: c.source, title: c.title, artist: c.artist, image: c.imageUrl, thumb: c.thumbUrl })),
    })
  })

  /**
   * POST /api/app/cover-hide {target, hide} - a folder (local:<path> / nas:<path>) shown without a cover (hide: true)
   * or with its pictures again (false); nothing is deleted, see hidden-covers.ts.
   */
  router.post('/cover-hide', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { target?: unknown; hide?: unknown }
    const target = String(body.target ?? '')
    const hide = body.hide !== false
    let type: 'local' | 'nas'
    let folder: string
    if (target.startsWith('local:') && deps.local) {
      const parts = localTargetParts(target, deps.local)
      if (!parts) {
        res.status(400).json({ error: 'invalid_path' })
        return
      }
      try {
        if (!(await fsp.lstat(path.join(deps.local.root, ...parts))).isDirectory()) throw new Error('not a folder')
      } catch {
        res.status(404).json({ error: 'item_not_found' })
        return
      }
      type = 'local'
      folder = parts.join('/')
    } else if (target.startsWith('nas:') && deps.nasSelected) {
      folder = target.slice(4)
      if (!(await deps.nasSelected(folder))) {
        res.status(403).json({ error: 'nas_not_selected' })
        return
      }
      type = 'nas'
    } else {
      res.status(400).json({ error: 'invalid_target' })
      return
    }
    try {
      await setCoverHidden(type, folder, hide)
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [cover-hide] ${target}: ${(err as Error).message}`)
      res.status(500).json({ error: 'write_failed' })
      return
    }
    console.log(`${new Date().toLocaleString()}: [cover-hide] ${target} ${hide ? 'without a cover' : 'with its cover again'}`)
    // (the display reads its lists again)
    deps.local?.changed()
    res.json({ ok: true, hidden: hide })
  })

  /** POST /api/app/cover-apply {target, image} - takes a search result's picture (see applyCover for the target). */
  router.post('/cover-apply', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { target?: unknown; image?: unknown }
    let bytes: Buffer
    try {
      bytes = await fetchCoverImage(String(body.image ?? ''))
    } catch (err) {
      const bad = (err as Error).message === 'bad_address'
      if (!bad) console.warn(`${new Date().toLocaleString()}: [cover-apply] ${(err as Error).message}`)
      res.status(bad ? 400 : 502).json({ error: bad ? 'bad_address' : 'download_failed' })
      return
    }
    const r = await applyCover(String(body.target ?? ''), bytes, deps, address)
    res.status(r.status).json(r.body)
  })

  /** PUT /api/app/cover-apply?target=  body: an own picture (JPEG or PNG, squared by the app). */
  router.put('/cover-apply', requireSession, requireCsrf, async (req, res) => {
    const bytes = await readBody(req, MAX_CHOSEN_BYTES)
    if (!bytes) {
      if (!res.headersSent) res.status(413).json({ error: 'too_large' })
      return
    }
    const r = await applyCover(typeof req.query.target === 'string' ? req.query.target : '', bytes, deps, address)
    res.status(r.status).json(r.body)
  })
}

async function readBody(req: Request, max: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > max) {
        req.destroy()
        return undefined
      }
      chunks.push(chunk as Buffer)
    }
  } catch {
    return undefined
  }
  return Buffer.concat(chunks)
}

/**
 * Puts a chosen picture in place:
 *   own:<name>    - into the own pictures (media/cover) as <name>-<random>.jpg; answers its address, which the app puts
 *                   into the entry's cover field (radio streams, Spotify entries, …)
 *   local:<path>  - as cover.jpg into a folder of the SD card (category/artist[/album…]); a cover there before is kept
 *                   as cover-previous.jpg, the box's own cover-online.jpg goes (it would come first)
 *   nas:<path>    - the same in a selected folder of the NAS (needs write permission for the box's NAS account)
 */
export async function applyCover(target: string, bytes: Buffer, deps: ChoiceDeps, address: (name: string) => string): Promise<Applied> {
  const info = imageSize(bytes)
  if (!info || (info.type !== 'jpeg' && info.type !== 'png')) return { status: 415, body: { error: 'not_an_image' } }
  if (Math.min(info.width, info.height) < MIN_CHOSEN_EDGE) return { status: 422, body: { error: 'too_small', width: info.width, height: info.height } }
  const ext = info.type === 'png' ? '.png' : '.jpg'

  if (target.startsWith('own:')) {
    const base =
      target
        .slice(4)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'cover'
    const name = `${base}-${randomBytes(3).toString('hex')}${ext}`
    try {
      await fsp.mkdir(deps.dir, { recursive: true })
      await writeAtomically(path.join(deps.dir, name), bytes)
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [cover-apply] ${name}: ${(err as Error).message}`)
      return { status: 500, body: { error: 'write_failed' } }
    }
    return { status: 200, body: { ok: true, url: address(name) } }
  }

  if (target.startsWith('local:') && deps.local) {
    const parts = localTargetParts(target, deps.local)
    if (!parts) return { status: 400, body: { error: 'invalid_path' } }
    const dir = path.join(deps.local.root, ...parts)
    let names: string[]
    try {
      if (!(await fsp.lstat(dir)).isDirectory()) throw new Error('not a folder')
      names = await fsp.readdir(dir)
    } catch {
      return { status: 404, body: { error: 'item_not_found' } }
    }
    // (the new picture is written first: a full card leaves the old cover where it was)
    const tmp = path.join(dir, `.${COVER_BASE}${ext}.${randomBytes(4).toString('hex')}.part`)
    try {
      await fsp.writeFile(tmp, bytes, { mode: 0o664 })
      for (const n of names) {
        const e = path.extname(n).toLowerCase()
        if (!PICTURE_EXTENSIONS.includes(e)) continue
        const b = n.slice(0, -e.length).toLowerCase()
        if (b === COVER_BASE) await fsp.rename(path.join(dir, n), path.join(dir, `${PREVIOUS_BASE}${e}`))
        else if (n.toLowerCase() === BOX_ONLINE_COVER) await fsp.unlink(path.join(dir, n))
      }
      await fsp.rename(tmp, path.join(dir, `${COVER_BASE}${ext}`))
    } catch (err) {
      await fsp.unlink(tmp).catch(() => undefined)
      console.warn(`${new Date().toLocaleString()}: [cover-apply] ${dir}: ${(err as Error).message}`)
      return { status: 500, body: { error: 'write_failed' } }
    }
    console.log(`${new Date().toLocaleString()}: [cover-apply] ${parts.join('/')}/${COVER_BASE}${ext}`)
    // (a folder shown without a cover before: with the chosen one now)
    await setCoverHidden('local', parts.join('/'), false).catch(() => undefined)
    deps.local.changed()
    return { status: 200, body: { ok: true, path: `${parts.join('/')}/${COVER_BASE}${ext}` } }
  }
  if (target.startsWith('nas:') && deps.nas) {
    const folder = target.slice(4)
    const r = await deps.nas(folder, bytes, ext)
    if (r === 'ok') {
      await setCoverHidden('nas', folder, false).catch(() => undefined)
      return { status: 200, body: { ok: true, path: `${folder.replace(/\/+$/, '')}/cover${ext}` } }
    }
    const why = { not_selected: [403, 'nas_not_selected'], offline: [503, 'nas_offline'], denied: [403, 'nas_denied'], failed: [502, 'nas_failed'] } as const
    return { status: why[r][0], body: { error: why[r][1] } }
  }
  return { status: 400, body: { error: 'invalid_target' } }
}

async function writeAtomically(file: string, bytes: Buffer): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.part`)
  try {
    await fsp.writeFile(tmp, bytes, { mode: 0o664 })
    await fsp.rename(tmp, file)
  } catch (err) {
    await fsp.unlink(tmp).catch(() => undefined)
    throw err
  }
}
