// The photo display's NAS folders (5.1, Bibliothek › Fotos › NAS-Ordner): folders chosen on the NAS the box is signed in
// to (Bibliothek › NAS - the same access, chosen apart from the audio folders) become albums. The box fetches their
// pictures over WebDAV, makes them into the display's sizes (process.ts) and keeps them in cache/photos/nas - shown
// also while the NAS is away. A sync now and then (and on request) takes new, changed and gone pictures over; the cache
// has a limit. Albums of the NAS are only looked at in the app: no rename, no delete (that happens on the NAS).

import { randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { extOf, NotAPicture, PHOTO_EXTENSIONS, PhotoAborted, photoFiles, processPhoto } from './process'
import { photoSettings } from './settings'
import { VIDEO_EXTENSIONS, VIDEO_MAX_BYTES, videoQueue } from './video'
import { albumDir, albums, rejectedClips, assetBase, cardSpace, INCOMING_DIR, NAS_PHOTO_DIR, newId, type PhotoAlbum, type PhotoAsset, PHOTOS_DIR, photoBytes, update } from './store'

/** A file or folder on the NAS as the server's WebDAV listing gives it */
export interface PhotoNasEntry {
  name: string
  path: string
  isdir: boolean
  size?: number
  version?: string
}

/** What the server gives the photos of its NAS access (server.ts) */
export interface PhotoNasAccess {
  /** a folder's children; undefined: no NAS signed in, or it is away. Throws when the NAS answers with an error. */
  list(folder: string): Promise<PhotoNasEntry[] | undefined>
  /** a NAS file into a local one (at most maxBytes); false: not fetched (away, too big, an error) */
  download(file: string, dest: string, maxBytes: number, signal: AbortSignal): Promise<boolean>
  /** a NAS is set up and signed in to stay (its address as the name the app shows) */
  info(): { connected: boolean; name: string | null }
}

export interface PhotoNasDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  nas?: PhotoNasAccess
}

const SYNC_MINUTES = [0, 15, 60, 360, 1440] as const
const CACHE_LIMITS_MB = [0, 500, 1024, 2048, 4096, 8192] as const
export interface NasPhotoSettings {
  /** the folders chosen (NAS paths, /…) */
  folders: string[]
  /** every subfolder an album of its own (else its pictures in the album of the folder chosen) */
  subfoldersAsAlbums: boolean
  /** minutes between two syncs (0: only by hand) */
  syncMinutes: (typeof SYNC_MINUTES)[number]
  /** what the pictures may take in the cache, MB (0: no limit) */
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}
const DEFAULTS: NasPhotoSettings = { folders: [], subfoldersAsAlbums: true, syncMinutes: 360, cacheLimitMb: 2048 }
const FOLDERS_MAX = 50
// how deep below a chosen folder the sync looks, and how many pictures it takes at most (all albums together)
const DEPTH_MAX = 6
const PICTURES_MAX = 20_000
// a picture on the NAS: up to 60 MB (a big PNG), as for an upload about 50
const FILE_MAX_BYTES = 60 * 1024 * 1024
// what stays free on the card (as for an upload)
const RESERVE_BYTES = 300 * 1024 * 1024
const STATE_FILE = path.join(PHOTOS_DIR, 'nas-sync.json')

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
/** a NAS path as the box writes it: /a/b, no "..", no empty parts */
export function cleanNasPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 1000) return null
  const parts = raw.split('/').filter(Boolean)
  // eslint-disable-next-line no-control-regex
  if (parts.length === 0 || parts.some((p) => p === '.' || p === '..' || /[\u0000-\u001f]/.test(p))) return null
  return `/${parts.join('/')}`
}

export function nasPhotoSettings(cfg: unknown): NasPhotoSettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).nas)
  const folders = Array.isArray(n.folders) ? [...new Set(n.folders.map(cleanNasPath).filter((f): f is string => f !== null))].slice(0, FOLDERS_MAX) : []
  return {
    folders,
    subfoldersAsAlbums: n.subfoldersAsAlbums !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as NasPhotoSettings['syncMinutes']) : DEFAULTS.syncMinutes,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as NasPhotoSettings['cacheLimitMb']) : DEFAULTS.cacheLimitMb,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written); on null `cfg` holds it. */
export function applyNasPhotoSettings(cfg: Record<string, unknown>, patch: unknown): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).nas) }
  if (p.folders !== undefined) {
    if (!Array.isArray(p.folders) || p.folders.length > FOLDERS_MAX) return 'folders'
    const folders = p.folders.map(cleanNasPath)
    if (folders.some((f) => f === null)) return 'folders'
    next.folders = [...new Set(folders)]
  }
  if (p.subfoldersAsAlbums !== undefined) {
    if (typeof p.subfoldersAsAlbums !== 'boolean') return 'subfoldersAsAlbums'
    next.subfoldersAsAlbums = p.subfoldersAsAlbums
  }
  if (p.syncMinutes !== undefined) {
    if (!(SYNC_MINUTES as readonly unknown[]).includes(p.syncMinutes)) return 'syncMinutes'
    next.syncMinutes = p.syncMinutes
  }
  if (p.cacheLimitMb !== undefined) {
    if (!(CACHE_LIMITS_MB as readonly unknown[]).includes(p.cacheLimitMb)) return 'cacheLimitMb'
    next.cacheLimitMb = p.cacheLimitMb
  }
  const photos = { ...obj(cfg.photos) }
  photos.sources = { ...obj(photos.sources), nas: next }
  cfg.photos = photos
  return null
}

const isPicture = (e: PhotoNasEntry) => !e.isdir && PHOTO_EXTENSIONS.includes(extOf(e.name)) && !e.name.startsWith('.')
const isClip = (e: PhotoNasEntry) => !e.isdir && VIDEO_EXTENSIONS.includes(extOf(e.name)) && !e.name.startsWith('.')
// (clips only with "Videos anzeigen": they are big, and nobody would see them)
const isMedia = (videos: boolean) => (e: PhotoNasEntry) => isPicture(e) || (videos && isClip(e))
const byName = (a: PhotoNasEntry, b: PhotoNasEntry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
const titleOf = (folder: string) => (folder.split('/').filter(Boolean).pop() ?? folder).slice(0, 40)
const under = (p: string, folder: string) => p === folder || p.startsWith(`${folder}/`)
const versionOf = (e: PhotoNasEntry) => e.version ?? String(e.size ?? '')

/** What the sync is doing, for the app */
interface SyncState {
  running: boolean
  done: number
  total: number
  /** the last sync that reached the NAS (ISO) */
  lastSync: string | null
  /** the NAS could not be reached since (ISO); null: it was there the last time */
  offlineSince: string | null
  /** the cache's limit stopped the sync: not all pictures are on the box */
  cacheFull: boolean
  /** folders the NAS answered with an error (gone, no right to read) */
  failed: string[]
  /** pictures the last sync found in the folders chosen (0 with folders chosen: none there - or no right to read the
   * files, the NAS then lists only the folders) */
  found: number | null
}

export class NasPhotoSync {
  private state: SyncState = { running: false, done: 0, total: 0, lastSync: null, offlineSince: null, cacheFull: false, failed: [], found: null }
  private lastTry = 0
  private again = false
  private stop: AbortController | null = null
  private loaded: Promise<void>

  constructor(private readonly deps: PhotoNasDeps) {
    this.loaded = fsp
      .readFile(STATE_FILE, 'utf8')
      .then((raw) => {
        const s = obj(JSON.parse(raw))
        this.state.lastSync = typeof s.lastSync === 'string' ? s.lastSync : null
        this.state.offlineSince = typeof s.offlineSince === 'string' ? s.offlineSince : null
        this.state.cacheFull = s.cacheFull === true
        this.state.found = typeof s.found === 'number' ? s.found : null
      })
      .catch(() => undefined)
  }

  status(): SyncState {
    return { ...this.state, failed: [...this.state.failed] }
  }

  /** Every minute: a sync when its time has come (on, folders chosen, not by hand only); the NAS away: again in 15 min */
  start(): void {
    const tick = () => {
      const cfg = this.deps.getMupiboxConfig()
      const s = nasPhotoSettings(cfg)
      if (!photoSettings(cfg).enabled || s.syncMinutes === 0 || this.state.running) return
      if (!s.folders.length && !this.state.lastSync) return
      const every = (this.state.offlineSince ? Math.min(15, s.syncMinutes) : s.syncMinutes) * 60_000
      if (Date.now() - this.lastTry >= every) void this.run()
    }
    // (the first a little after the start: the box has other things to do then)
    setTimeout(() => {
      tick()
      setInterval(tick, 60_000).unref?.()
    }, 90_000).unref?.()
  }

  /** A sync now (from the app, or after a change of the folders); one running: another one right after it */
  run(): Promise<void> {
    if (this.state.running) {
      this.again = true
      return Promise.resolve()
    }
    return this.sync().finally(() => {
      if (this.again) {
        this.again = false
        void this.run()
      }
    })
  }

  /** The folders no longer used (or the photo display off for good): the running sync stops */
  cancel(): void {
    this.stop?.abort()
    this.again = false
  }

  private async save(): Promise<void> {
    const { lastSync, offlineSince, cacheFull, found } = this.state
    await fsp.mkdir(PHOTOS_DIR, { recursive: true }).catch(() => undefined)
    const tmp = `${STATE_FILE}.${process.pid}.tmp`
    await fsp.writeFile(tmp, JSON.stringify({ lastSync, offlineSince, cacheFull, found })).catch(() => undefined)
    await fsp.rename(tmp, STATE_FILE).catch(() => undefined)
  }

  private log(msg: string): void {
    console.log(`${new Date().toLocaleString()}: [photos] NAS: ${msg}`)
  }

  private async sync(): Promise<void> {
    await this.loaded
    const nas = this.deps.nas
    this.lastTry = Date.now()
    const cfg = this.deps.getMupiboxConfig()
    const s = nasPhotoSettings(cfg)
    if (!nas || !photoSettings(cfg).enabled) return
    const stop = new AbortController()
    this.stop = stop
    Object.assign(this.state, { running: true, done: 0, total: 0 })
    try {
      // the albums the folders give: with "Unterordner als eigene Alben" every folder with pictures, else one per folder
      // chosen with all pictures below it. A folder the NAS did not list: its albums stay as they are.
      const videos = photoSettings(cfg).showVideos
      const targets = new Map<string, { title: string; files: PhotoNasEntry[] }>()
      const failed: string[] = []
      let away = false
      let count = 0
      const walk = async (folder: string, depth: number, into: string | null): Promise<void> => {
        if (stop.signal.aborted || away || count >= PICTURES_MAX) return
        let entries: PhotoNasEntry[] | undefined
        try {
          entries = await nas.list(folder)
        } catch (err) {
          this.log(`${folder} not listed: ${(err as Error).message}`)
          failed.push(folder)
          return
        }
        if (entries === undefined) {
          away = true
          return
        }
        const pictures = entries.filter(isMedia(videos)).sort(byName).slice(0, PICTURES_MAX - count)
        count += pictures.length
        const album = into ?? folder
        if (pictures.length) {
          const t = targets.get(album) ?? { title: titleOf(album), files: [] }
          t.files.push(...pictures)
          targets.set(album, t)
        }
        if (depth >= DEPTH_MAX) return
        for (const d of entries.filter((e) => e.isdir).sort(byName)) await walk(d.path, depth + 1, into)
      }
      for (const folder of s.folders) await walk(folder, 0, s.subfoldersAsAlbums ? null : folder)
      if (stop.signal.aborted) return
      if (away) {
        // the NAS is away (switched off, the WLAN): nothing changes on the box - its pictures stay
        if (!this.state.offlineSince) this.state.offlineSince = new Date().toISOString()
        this.log('not reachable, the pictures on the box stay')
        await this.save()
        return
      }
      this.state.offlineSince = null
      this.state.failed = failed
      this.state.found = [...targets.values()].reduce((n, t) => n + t.files.length, 0)
      // a folder the NAS did not list: what came from it stays - an album at or below it, and (one album per folder chosen)
      // the album of the folder chosen above it with the pictures of it; only within what is chosen now (an album of a
      // folder no longer chosen goes, whatever the NAS answered)
      const unread = (p: string) => failed.some((f) => under(p, f))
      const chosen = (ref: string) => s.folders.some((f) => under(ref, f))
      const kept = (ref: string | undefined) => !!ref && chosen(ref) && (unread(ref) || (!s.subfoldersAsAlbums && failed.some((f) => under(f, ref))))

      // the albums: made for new folders, taken out for folders no longer chosen or gone (not for a folder not listed)
      const gone: PhotoAlbum[] = []
      const plan = await update((lib) => {
        const now = new Date().toISOString()
        const nasAlbums = lib.albums.filter((a) => a.source === 'nas')
        for (const a of nasAlbums) {
          if (a.ref && targets.has(a.ref)) continue
          if (kept(a.ref)) continue
          gone.push(a)
        }
        lib.albums = lib.albums.filter((a) => !gone.includes(a))
        // (an album new to the box goes into the list with its first picture: none in the app's list with "0 Fotos"
        // while a long first sync is still busy elsewhere)
        const out: Array<{ album: PhotoAlbum; files: PhotoNasEntry[]; fresh: boolean }> = []
        for (const [ref, t] of targets) {
          const a = lib.albums.find((x) => x.source === 'nas' && x.ref === ref)
          // (one still without a picture - from a sync before: out of the list too, until its first one is there)
          if (a && a.assets.length === 0) {
            lib.albums = lib.albums.filter((x) => x !== a)
            out.push({ album: { ...a, assets: [] }, files: t.files, fresh: true })
          } else if (a) out.push({ album: { ...a, assets: [...a.assets] }, files: t.files, fresh: false })
          else out.push({ album: { id: newId(), title: t.title, source: 'nas', display: true, position: 0, created: now, assets: [], ref }, files: t.files, fresh: true })
        }
        return out
      })
      for (const a of gone) await fsp.rm(albumDir(a), { recursive: true, force: true }).catch(() => undefined)
      if (gone.length) this.log(`${gone.length} album(s) no longer chosen, taken out`)

      // the pictures of each album: gone from the NAS out at once; changed ones (or their files gone from the cache)
      // replaced only when the new one is made - a failed fetch keeps the old one; new ones in. A picture from a folder
      // the NAS did not list stays as it is.
      const work: Array<{ album: PhotoAlbum; file: PhotoNasEntry; old?: PhotoAsset; fresh: boolean }> = []
      // (clips not taken before - too long, no clip - while unchanged)
      const rejected = await rejectedClips()
      for (const { album, files, fresh } of plan) {
        const wanted = new Map(files.map((f) => [f.path, f]))
        const drop: PhotoAsset[] = []
        const replace = new Map<string, PhotoAsset>()
        for (const x of album.assets) {
          const f = x.ref ? wanted.get(x.ref) : undefined
          if (!f) {
            if (!(x.ref && unread(x.ref))) drop.push(x)
            continue
          }
          // (a clip still waiting to be made: its file as it came is there)
          const file = x.kind === 'video' && x.ready === false ? `${assetBase(album, x.id)}.pending` : `${assetBase(album, x.id)}.jpg`
          const there = x.ver === versionOf(f) && (await fsp.access(file).then(() => true, () => false))
          if (there) wanted.delete(f.path)
          else replace.set(f.path, x)
        }
        if (drop.length) {
          const ids = new Set(drop.map((x) => x.id))
          await update((lib) => {
            const a = lib.albums.find((y) => y.id === album.id)
            if (!a) return
            a.assets = a.assets.filter((x) => !ids.has(x.id))
            if (a.cover && ids.has(a.cover)) delete a.cover
          })
          for (const x of drop) for (const f of photoFiles(assetBase(album, x.id))) await fsp.rm(f, { force: true }).catch(() => undefined)
        }
        for (const file of files) if (wanted.has(file.path) && !rejected.has(`nas:${file.path}|${versionOf(file)}`)) work.push({ album, file, old: replace.get(file.path), fresh })
      }
      this.state.total = work.length

      // fetched one after the other, within the cache's limit and the card's room
      const limit = s.cacheLimitMb > 0 ? s.cacheLimitMb * 1024 * 1024 : Number.POSITIVE_INFINITY
      let used = await photoBytes(NAS_PHOTO_DIR)
      let full = false
      await fsp.mkdir(INCOMING_DIR, { recursive: true })
      for (const { album, file, old, fresh } of work) {
        if (stop.signal.aborted) return
        const space = await cardSpace()
        // (a changed picture: its old files go when the new ones are there - they count as freed for the limit; the card
        // needs room for both for a moment)
        let oldBytes = 0
        if (old) for (const f of photoFiles(assetBase(album, old.id))) oldBytes += (await fsp.stat(f).catch(() => ({ size: 0 }))).size
        // (a new picture: its sizes guessed from the file before it is fetched; a changed one is checked by what it makes -
        // it often takes as much as the old one)
        // (a clip: as it comes and once made - twice its size on the card for a while)
        const need = isClip(file) ? 2 * (file.size ?? VIDEO_MAX_BYTES) : (file.size ?? 0)
        if ((!old && used + (file.size ?? 0) / 4 > limit) || (space && space.free - need < RESERVE_BYTES)) {
          full = true
          break
        }
        const ext = extOf(file.name)
        const part = path.join(INCOMING_DIR, `nas-${randomBytes(6).toString('hex')}${ext}.part`)
        const id = newId()
        const out = assetBase(album, id)
        try {
          const clip = isClip(file)
          // (a clip: at most what leaves room for the made one and the reserve)
          const room = space ? Math.floor((space.free - RESERVE_BYTES) / 2) : VIDEO_MAX_BYTES
          if (!(await nas.download(file.path, part, clip ? Math.min(VIDEO_MAX_BYTES, room) : FILE_MAX_BYTES, stop.signal))) {
            if (stop.signal.aborted) return
            continue
          }
          await fsp.mkdir(albumDir(album), { recursive: true })
          // (a clip: kept as it came, made in the background - video.ts; its picture and video come then)
          if (clip) await fsp.rename(part, `${out}.pending`)
          const facts = clip ? { w: 0, h: 0, taken: null } : await processPhoto(part, out, ext, stop.signal)
          let newBytes = 0
          for (const f of photoFiles(out)) newBytes += (await fsp.stat(f).catch(() => ({ size: 0 }))).size
          // (more than the limit takes, with the old ones gone: not taken - a changed picture keeps its old one)
          if (used - oldBytes + newBytes > limit) {
            for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
            full = true
            break
          }
          const asset: PhotoAsset = clip
            ? { id, w: 0, h: 0, taken: null, added: new Date().toISOString(), kind: 'video', ready: false, duration: 0, ref: file.path, ver: versionOf(file) }
            : { id, w: facts.w, h: facts.h, taken: facts.taken, added: new Date().toISOString(), kind: 'photo', ref: file.path, ver: versionOf(file) }
          const placed = await update((lib) => {
            let a = lib.albums.find((x) => x.id === album.id)
            // (a new album: in the list with its first picture, at the end)
            if (!a && fresh && !lib.albums.some((x) => x.source === 'nas' && x.ref === album.ref)) {
              a = { ...album, assets: [], position: lib.albums.length }
              lib.albums.push(a)
            }
            // (the album taken out meanwhile - the folders changed in the app; or the picture there already)
            if (!a || a.assets.some((x) => x.ref === file.path && x.id !== old?.id)) return false
            // (a changed picture: the new one in the old one's place, its album picture too)
            const at = old ? a.assets.findIndex((x) => x.id === old.id) : -1
            if (at >= 0) a.assets[at] = asset
            else a.assets.push(asset)
            if (old && a.cover === old.id) a.cover = id
            return true
          })
          if (!placed) for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
          else {
            used += newBytes
            if (clip) void videoQueue.kick()
            if (old) {
              for (const f of photoFiles(assetBase(album, old.id))) await fsp.rm(f, { force: true }).catch(() => undefined)
              used -= oldBytes
            }
          }
        } catch (err) {
          if (err instanceof PhotoAborted) return
          // (a file that is no picture, HEIC not set up yet, an error of the NAS: this one is left, the next one comes)
          if (!(err instanceof NotAPicture)) this.log(`${file.path}: ${(err as Error).message}`)
          for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
        } finally {
          await fsp.rm(part, { force: true }).catch(() => undefined)
          this.state.done++
        }
      }
      // (albums of the NAS left without a picture - all of its pictures gone there, or from a sync before this one)
      await update((lib) => {
        lib.albums = lib.albums.filter((a) => a.source !== 'nas' || a.assets.length > 0 || kept(a.ref))
      })
      this.state.cacheFull = full
      this.state.lastSync = new Date().toISOString()
      if (full) this.log('the cache limit (or the card) is reached, not all pictures fetched')
      await this.save()
    } catch (err) {
      this.log(`sync failed: ${(err as Error).message}`)
    } finally {
      this.state.running = false
      if (this.stop === stop) this.stop = null
    }
  }

  /** "Ordner nicht mehr verwenden": every NAS album and its pictures off the box (on the NAS all stays) */
  async removeAll(): Promise<number> {
    this.cancel()
    const gone = await update((lib) => {
      const out = lib.albums.filter((a) => a.source === 'nas')
      lib.albums = lib.albums.filter((a) => a.source !== 'nas')
      return out
    })
    await fsp.rm(NAS_PHOTO_DIR, { recursive: true, force: true }).catch(() => undefined)
    Object.assign(this.state, { lastSync: null, offlineSince: null, cacheFull: false, failed: [], found: null })
    await this.save()
    return gone.length
  }
}

/**
 * The app's side:
 *   GET  /api/app/photos/nas            the NAS (signed in?), the settings, the sync's state, the albums, the cache
 *   GET  /api/app/photos/nas/browse?path=  a folder's subfolders with their number of pictures
 *   POST /api/app/photos/nas            {folders?, subfoldersAsAlbums?, syncMinutes?, cacheLimitMb?} - saved, then a sync
 *   POST /api/app/photos/nas/sync       a sync now
 *   POST /api/app/photos/nas/remove     the folders no longer used: their albums off the box
 */
export function registerPhotoNasRoutes(router: Router, deps: PhotoNasDeps): NasPhotoSync {
  const sync = new NasPhotoSync(deps)
  sync.start()

  const answer = async () => {
    const list = (await albums()).filter((a) => a.source === 'nas')
    return {
      nas: deps.nas?.info() ?? { connected: false, name: null },
      settings: nasPhotoSettings(deps.getMupiboxConfig()),
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: await photoBytes(NAS_PHOTO_DIR),
    }
  }

  router.get('/photos/nas', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  router.get('/photos/nas/browse', requireSession, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const nas = deps.nas
    const folder = req.query.path === undefined || req.query.path === '' || req.query.path === '/' ? '/' : cleanNasPath(req.query.path)
    if (!folder) return void res.status(400).json({ error: 'path' })
    if (!nas || !nas.info().connected) return void res.status(409).json({ error: 'no_nas' })
    let entries: PhotoNasEntry[] | undefined
    try {
      entries = await nas.list(folder)
    } catch {
      return void res.status(404).json({ error: 'not_listed' })
    }
    if (entries === undefined) return void res.status(502).json({ error: 'nas_unreachable' })
    const dirs = entries.filter((e) => e.isdir).sort(byName).slice(0, 200)
    const videos = photoSettings(deps.getMupiboxConfig()).showVideos
    // (the number of pictures in each subfolder - its own, not those further below; for the first 60, 4 at a time)
    const counts = new Map<string, { pictures: number; folders: number }>()
    let next = 0
    const worker = async () => {
      for (let i = next++; i < Math.min(dirs.length, 60); i = next++) {
        const inner = await nas.list(dirs[i].path).catch(() => undefined)
        if (inner) counts.set(dirs[i].path, { pictures: inner.filter(isMedia(videos)).length, folders: inner.filter((e) => e.isdir).length })
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    res.json({
      path: folder,
      pictures: entries.filter(isMedia(videos)).length,
      folders: dirs.map((d) => ({ name: d.name, path: d.path, pictures: counts.get(d.path)?.pictures ?? null, folders: counts.get(d.path)?.folders ?? null })),
    })
  })

  router.post('/photos/nas', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    try {
      await deps.updateMupiboxConfig((cfg) => {
        error = applyNasPhotoSettings(cfg, req.body)
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    // (folders or the way they become albums changed: a sync takes it over at once)
    const b = obj(req.body)
    if (b.folders !== undefined || b.subfoldersAsAlbums !== undefined) void sync.run()
    res.json(await answer())
  })

  // the running sync stopped (a big NAS takes hours the first time): what came so far stays, the next one at its time
  router.post('/photos/nas/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/nas/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    // (its state a moment later: running)
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/nas/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        applyNasPhotoSettings(cfg, { folders: [] })
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    const removed = await sync.removeAll()
    res.json({ ...(await answer()), removed })
  })

  return sync
}
