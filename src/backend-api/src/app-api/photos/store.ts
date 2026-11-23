// The photo display's albums and pictures (5.1): the list of the albums in data/photos/library.json and each album's
// pictures in data/photos/albums/<album>.json (data/: kept by every update, part of the backup), the pictures of an
// uploaded album in data/photos/upload/<album>/ in their three sizes (see process.ts). The list is read once and kept;
// every change goes through update() - one after the other, each file written next to it and renamed (never half a
// file on the card).
//
// One file per album, and only what changed is written: with everything in library.json, every picture a sync took
// wrote the whole list anew - 6.6 MB with 32,000 pictures of Immich, for each picture of an import, and again at every
// sync though nothing had changed. A list from before (the pictures in library.json, version 1 - also from a backup)
// is read as it is and split at its next change.

import { createHash, randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { writeFileWhole } from '../../json-file'
import { CACHE_DIR, DATA_DIR } from '../../paths'

export const PHOTOS_DIR = path.join(DATA_DIR, 'photos')
const LIBRARY_FILE = path.join(PHOTOS_DIR, 'library.json')
/** each album's pictures, "<album>.json" */
export const ALBUMS_DIR = path.join(PHOTOS_DIR, 'albums')
const albumFile = (id: string): string => path.join(ALBUMS_DIR, `${id}.json`)
export const UPLOAD_DIR = path.join(PHOTOS_DIR, 'upload')
export const INCOMING_DIR = path.join(PHOTOS_DIR, 'incoming')
/** The pictures of NAS folders, in their sizes: fetched again when gone (cache/ - may be emptied any time) */
export const NAS_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'nas')
/** The pictures of Immich albums kept on the box (Fotos auf der Box speichern), the same way */
export const IMMICH_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'immich')
/** Immich shown live: the pictures shown last (a small cache with a limit) */
export const IMMICH_LIVE_DIR = path.join(CACHE_DIR, 'photos', 'immich-live')
/** The faces of the people whose albums come from Immich ("<person id>.jpg"), for the display's stacks */
export const IMMICH_FACE_DIR = path.join(CACHE_DIR, 'photos', 'immich-faces')
/** The same for the albums of Synology Photos */
export const SYNOLOGY_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'synology')
export const SYNOLOGY_LIVE_DIR = path.join(CACHE_DIR, 'photos', 'synology-live')
/** The same for the albums of Nextcloud */
export const NEXTCLOUD_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'nextcloud')
export const NEXTCLOUD_LIVE_DIR = path.join(CACHE_DIR, 'photos', 'nextcloud-live')
/** The same for the shared albums of iCloud */
export const ICLOUD_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'icloud')
export const ICLOUD_LIVE_DIR = path.join(CACHE_DIR, 'photos', 'icloud-live')
/** The same for the albums of PhotoPrism */
export const PHOTOPRISM_PHOTO_DIR = path.join(CACHE_DIR, 'photos', 'photoprism')
export const PHOTOPRISM_LIVE_DIR = path.join(CACHE_DIR, 'photos', 'photoprism-live')

export type PhotoSource = 'upload' | 'nas' | 'immich' | 'synology' | 'nextcloud' | 'icloud' | 'photoprism'
/** the sources whose albums come from a photo service (remote.ts): an id there, kept on the box or shown live */
export const SERVICE_SOURCES: readonly PhotoSource[] = ['immich', 'synology', 'nextcloud', 'icloud', 'photoprism']

export interface PhotoAsset {
  id: string
  w: number
  h: number
  /** when it was taken (EXIF), else null */
  taken: string | null
  /** when it came onto the box (ISO) */
  added: string
  kind: 'photo' | 'video'
  /** a clip: false while it waits to be made (video.ts); its length in seconds */
  ready?: boolean
  duration?: number
  /** a fingerprint of the file as it came (sha1): the same picture twice in an album is left out */
  sum?: string
  /** a NAS album's picture: its file on the NAS, and the file's version there (ETag / date / size); an Immich
   * album's: the asset's id there and its checksum */
  ref?: string
  ver?: string
}

export interface PhotoAlbum {
  id: string
  title: string
  source: PhotoSource
  /** shown on the display (the switch "am Display zeigen") */
  display: boolean
  /** the place on the display (and in the app's list), 0 first */
  position: number
  /** the album's own picture (an asset id); else the first */
  cover?: string
  created: string
  assets: PhotoAsset[]
  /** a NAS album: its folder on the NAS; an Immich album: its id there */
  ref?: string
  /** an Immich album shown live: its pictures are not kept on the box, they come from Immich when shown */
  live?: boolean
  /** an album of people (Immich): their ids there, whose faces the display shows on the stack */
  faces?: string[]
}

interface Library {
  version: 2
  albums: PhotoAlbum[]
  /** clips of NAS and Immich the box would not take ("<source>:<ref>|<version>": longer than 3 minutes, no clip) - not
   * fetched again while unchanged, also when their album has gone meanwhile */
  rejected?: string[]
}

let cache: Library | null = null
let chain: Promise<unknown> = Promise.resolve()
// What is on the card as written (or read) last: the list's text and a fingerprint of each album's pictures - a file
// whose content is the same is not written again. null: not known (nothing written since the list was read).
let written: { index: string; albums: Map<string, string> } | null = null
const fingerprint = (text: string): string => createHash('sha1').update(text).digest('hex')

const ID = /^[a-f0-9]{10}$/
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
export const newId = (): string => randomBytes(5).toString('hex')

// One reading of the list at a time: a reader (albums(), album()) and update() asking while the list is not read yet
// share it. Two readings side by side put back the list of before over a change written meanwhile (the next change
// wrote it without that picture), and the older one's clean-up took the file of an album just made. A reading begun
// before the list was let go (thawLibrary, forgetCache) changes nothing any more (generation).
let loading: Promise<Library> | null = null
let generation = 0

function load(): Promise<Library> {
  if (cache) return Promise.resolve(cache)
  if (!loading) {
    const gen = generation
    const run = readLibrary(gen).finally(() => {
      if (loading === run) loading = null
    })
    loading = run
  }
  return loading
}

async function readLibrary(gen: number): Promise<Library> {
  // (nothing moved or deleted by a reading begun before the list was let go, nor while a backup is being restored - the
  // list and the albums' files are being unpacked then, a missing or half list is no broken one)
  const mayTidy = () => gen === generation && !frozen
  let text: string | null
  // (no list yet: null; any other trouble reading it (the card): not taken - see below)
  text = await fsp.readFile(LIBRARY_FILE, 'utf8').catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  let raw: Partial<Omit<Library, 'version'>> | null = null
  if (text !== null) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Partial<Library>
    } catch {
      // (not JSON: a broken list, below)
    }
  }
  if (text === null || raw === null) {
    // No list yet: none. A broken one is kept beside it for a look, and the albums' files with it - the next list
    // written would not name them, and the reading after it would take them away (only both together tell which
    // pictures belong to which album). Album files without any list (deleted by hand): kept aside the same way.
    const stamp = Date.now()
    if (text !== null && mayTidy()) await fsp.rename(LIBRARY_FILE, `${LIBRARY_FILE}.broken-${stamp}`).catch(() => undefined)
    if ((await fsp.readdir(ALBUMS_DIR).catch(() => [] as string[])).length > 0 && mayTidy()) {
      await fsp.rename(ALBUMS_DIR, `${ALBUMS_DIR}.broken-${stamp}`).catch(() => undefined)
    }
    const empty: Library = { version: 2, albums: [] }
    if (mayTidy()) {
      written = null
      cache = empty
    }
    return empty
  }
  const current = () => gen === generation
  const listed = Array.isArray(raw.albums) ? raw.albums.filter((a) => a && isId(a.id)) : []
  const albums: PhotoAlbum[] = []
  const onCard = new Map<string, string>()
  for (const a of listed) {
    // (a list from before: its pictures in it - taken as they are, also over an album's file left from a newer list
    // (a backup of before restored); the files are written at the next change)
    if (Array.isArray(a.assets)) {
      albums.push(a)
      continue
    }
    let assets: PhotoAsset[] = []
    const file = albumFile(a.id)
    // (no file: an album without pictures yet. Any other trouble reading it (the card): the list is not taken - an
    // empty album would be written over the file at the next change)
    const t = await fsp.readFile(file, 'utf8').catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null
      throw err
    })
    if (t !== null) {
      try {
        const parsed = JSON.parse(t) as unknown
        if (!Array.isArray(parsed)) throw new Error('not a list')
        assets = parsed as PhotoAsset[]
        onCard.set(a.id, fingerprint(t))
      } catch {
        // (a broken file: kept beside it for a look, the album without pictures - a sync fetches them again)
        if (mayTidy()) await fsp.rename(file, `${file}.broken-${Date.now()}`).catch(() => undefined)
      }
    }
    albums.push({ ...a, assets })
  }
  const rejected = Array.isArray(raw.rejected) ? raw.rejected.filter((x): x is string => typeof x === 'string').slice(-1000) : []
  const lib: Library = { version: 2, albums, rejected }
  if (!current()) return lib
  // The files of albums the list does not name (deleted while the box went off between writing the list and removing
  // the file, or left by a backup restored over a newer list): away - only with a list that could be read.
  const ids = new Set(albums.map((a) => a.id))
  for (const f of await fsp.readdir(ALBUMS_DIR).catch(() => [] as string[])) {
    const m = /^([a-f0-9]{10})\.json$/.exec(f)
    if (m && !ids.has(m[1]) && mayTidy()) await fsp.rm(path.join(ALBUMS_DIR, f), { force: true }).catch(() => undefined)
  }
  if (current()) {
    written = { index: text, albums: onCard }
    cache = lib
  }
  return lib
}

/**
 * The list as it is on the card, copied into `dir` (library.json, albums/<album>.json) for a backup: taken between two
 * changes - a zip of the files themselves could take the list of one moment and an album's file of another. false: no
 * list on the card.
 */
export function copyLibraryTo(dir: string): Promise<boolean> {
  const run = chain.then(async () => {
    const list = await fsp.readFile(LIBRARY_FILE).catch(() => null)
    if (list === null) return false
    await fsp.mkdir(path.join(dir, 'albums'), { recursive: true })
    await fsp.writeFile(path.join(dir, 'library.json'), list)
    for (const f of await fsp.readdir(ALBUMS_DIR).catch(() => [] as string[])) {
      // (a file a reading tidied away meanwhile - one the list does not name: left out)
      if (/^[a-f0-9]{10}\.json$/.test(f)) {
        await fsp.copyFile(path.join(ALBUMS_DIR, f), path.join(dir, 'albums', f)).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOENT') throw err
        })
      }
    }
    return true
  })
  chain = run.catch(() => undefined)
  return run
}

// (next to it, on the card (fsync), then renamed over it: never half a file after a power cut - json-file.ts; whether it
// changed is known here already)
const writeWhole = (file: string, text: string) => writeFileWhole(file, text, { ifChanged: false })

// The list onto the card: an album's file only when its pictures changed, the list of the albums only when it
// changed; first the albums, then the list (a new album's pictures are there when the list names it), the files of
// albums gone last (the list no longer names them).
async function persist(lib: Library): Promise<void> {
  const known = written ?? { index: '', albums: new Map<string, string>() }
  await fsp.mkdir(ALBUMS_DIR, { recursive: true })
  const ids = new Set<string>()
  for (const a of lib.albums) {
    ids.add(a.id)
    const text = JSON.stringify(a.assets)
    const sum = fingerprint(text)
    if (known.albums.get(a.id) === sum) continue
    await writeWhole(albumFile(a.id), text)
    known.albums.set(a.id, sum)
    written = known
  }
  const index = JSON.stringify({ version: 2, albums: lib.albums.map(({ assets: _assets, ...rest }) => rest), rejected: lib.rejected })
  if (index !== known.index) {
    await writeWhole(LIBRARY_FILE, index)
    known.index = index
    written = known
  }
  for (const id of [...known.albums.keys()]) {
    if (ids.has(id)) continue
    await fsp.rm(albumFile(id), { force: true }).catch(() => undefined)
    known.albums.delete(id)
  }
  written = known
}

/** The albums as the box knows them (sorted by their place). Do not change what comes back - use update(). */
export async function albums(): Promise<PhotoAlbum[]> {
  const lib = await load()
  return [...lib.albums].sort((a, b) => a.position - b.position)
}

export async function album(id: string): Promise<PhotoAlbum | undefined> {
  return (await load()).albums.find((a) => a.id === id)
}

// a backup being restored: no change of the list any more (a sync or a clip finishing would write the list of before
// over the restored one) - the box restarts after it; a failed restore lets go again
let frozen = false
export async function freezeLibrary(): Promise<void> {
  frozen = true
  await chain.catch(() => undefined)
}
export function thawLibrary(): void {
  frozen = false
  forgetCache()
}

/** A change of the list, one after the other; `mutate` gets a copy and returns what the caller wants back. */
export function update<T>(mutate: (lib: Library) => T): Promise<T> {
  if (frozen) return Promise.reject(new Error('photo library frozen (a backup is being restored)'))
  const run = chain.then(async () => {
    if (frozen) throw new Error('photo library frozen (a backup is being restored)')
    const current = await load()
    const copy = JSON.parse(JSON.stringify(current)) as Library
    const result = mutate(copy)
    // (the places again 0, 1, 2 … in their order: a deleted album leaves no gap)
    copy.albums.sort((a, b) => a.position - b.position).forEach((a, i) => (a.position = i))
    await persist(copy)
    cache = copy
    return result
  })
  chain = run.catch(() => undefined)
  return run
}

const SOURCE_DIR: Record<PhotoSource, string> = { upload: UPLOAD_DIR, nas: NAS_PHOTO_DIR, immich: IMMICH_PHOTO_DIR, synology: SYNOLOGY_PHOTO_DIR, nextcloud: NEXTCLOUD_PHOTO_DIR, icloud: ICLOUD_PHOTO_DIR, photoprism: PHOTOPRISM_PHOTO_DIR }
export const albumDir = (a: Pick<PhotoAlbum, 'id'> & { source?: PhotoSource }): string => path.join(SOURCE_DIR[a.source ?? 'upload'] ?? UPLOAD_DIR, a.id)
/** The path of an asset's files without their size suffix (see process.ts) */
export const assetBase = (a: Pick<PhotoAlbum, 'id'> & { source?: PhotoSource }, assetId: string): string => path.join(albumDir(a), assetId)

/** The album's picture: its own, else the first one */
export const coverOf = (a: PhotoAlbum): string | undefined =>
  a.cover && a.assets.some((x) => x.id === a.cover) ? a.cover : (a.assets.find((x) => x.ready !== false) ?? a.assets[0])?.id

/** Bytes taken by the pictures (data/photos, or another folder - the NAS pictures' cache), counted on the card */
export async function photoBytes(dir = PHOTOS_DIR): Promise<number> {
  let total = 0
  const walk = async (dir: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) total += (await fsp.stat(p).catch(() => ({ size: 0 }))).size
    }
  }
  await walk(dir)
  return total
}

/**
 * What an upload left behind when the box went off in the middle (once at the server's start, before an upload is
 * taken): the originals on their way in (incoming/ - they may still carry the place where a photo was taken) and the
 * half-made sizes of a picture (*.tmp, *.heic.jpg). Pictures that are made are never touched here - a list that could
 * not be read must not cost a single photo.
 */
export async function sweepLeftovers(): Promise<void> {
  await fsp.rm(INCOMING_DIR, { recursive: true, force: true }).catch(() => undefined)
  for (const f of await fsp.readdir(PHOTOS_DIR).catch(() => [] as string[])) {
    // (the temporary names of before and of json-file.ts)
    if (/^library\.json\.(\d+\.tmp|tmp\.\d+\.\d+)$/.test(f)) await fsp.rm(path.join(PHOTOS_DIR, f), { force: true }).catch(() => undefined)
  }
  for (const f of await fsp.readdir(ALBUMS_DIR).catch(() => [] as string[])) {
    if (/^[a-f0-9]{10}\.json\.(\d+\.tmp|tmp\.\d+\.\d+)$/.test(f)) await fsp.rm(path.join(ALBUMS_DIR, f), { force: true }).catch(() => undefined)
  }
  for (const root of [UPLOAD_DIR, NAS_PHOTO_DIR, IMMICH_PHOTO_DIR]) {
    let dirs: import('node:fs').Dirent[]
    try {
      dirs = await fsp.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of dirs) {
      if (!d.isDirectory() || !isId(d.name)) continue
      const dir = path.join(root, d.name)
      const files = await fsp.readdir(dir).catch(() => [] as string[])
      for (const f of files) {
        if (f.endsWith('.tmp') || f.endsWith('.heic.jpg') || f.endsWith('.part')) await fsp.rm(path.join(dir, f), { force: true }).catch(() => undefined)
      }
    }
  }
}

/** Space on the card: all, free (what a user may still write) */
export async function cardSpace(): Promise<{ total: number; free: number } | null> {
  try {
    const st = await fsp.statfs(DATA_DIR)
    return { total: st.blocks * st.bsize, free: st.bavail * st.bsize }
  } catch {
    return null
  }
}

/** Forget the list read before (a backup restored; tests): read anew when next asked */
export function forgetCache(): void {
  generation++
  loading = null
  cache = null
  written = null
}

/** The clips of NAS and Immich not taken before ("<source>:<ref>|<version>") */
export async function rejectedClips(): Promise<Set<string>> {
  return new Set((await load()).rejected ?? [])
}
