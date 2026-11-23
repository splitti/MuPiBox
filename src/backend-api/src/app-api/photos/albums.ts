// The photo display's albums (5.1): the app's Bibliothek › Fotos (overview, an album, uploading - the parents' login)
// and what the box's display reads (/api/photos/..., only the albums shown there, never a source or an account).

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Express, Request, Response, Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { checkRemotesNow, remoteOf } from './remote'
import { VIDEO_EXTENSIONS, videoQueue } from './video'
import { extOf, NotAPicture, PHOTO_EXTENSIONS, PhotoAborted, photoFiles, processPhoto } from './process'
import { photoSettings, type PhotoOrder } from './settings'
import {
  album as findAlbum,
  albumDir,
  albums,
  assetBase,
  cardSpace,
  coverOf,
  IMMICH_PHOTO_DIR,
  INCOMING_DIR,
  isId,
  NAS_PHOTO_DIR,
  newId,
  type PhotoAlbum,
  type PhotoAsset,
  photoBytes,
  SERVICE_SOURCES,
  ICLOUD_PHOTO_DIR,
  PHOTOPRISM_PHOTO_DIR,
  NEXTCLOUD_PHOTO_DIR,
  SYNOLOGY_PHOTO_DIR,
  sweepLeftovers,
  update,
} from './store'

export interface PhotoAlbumDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  /** several users switched on (../../users.ts): each has the albums he does not see on the display, in his part of the
   *  configuration (photos.hiddenAlbums) - the box's own switch (album.display) stays for all */
  usersOn?: () => boolean
  /** the albums hidden for the user the app named (?user=), null: none named */
  hiddenOf?: (req: Request) => Promise<string[] | null>
  /** shown or hidden for the user the app named; false: none named (the box's switch then) */
  setVisible?: (req: Request, id: string, visible: boolean, shownForAll: boolean) => Promise<boolean>
}

// The albums hidden for the user in place (the display's), when several users are on
function hiddenInPlace(deps: PhotoAlbumDeps): Set<string> {
  if (!deps.usersOn?.()) return new Set()
  const list = (deps.getMupiboxConfig()?.photos as { hiddenAlbums?: unknown } | undefined)?.hiddenAlbums
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
}

// what stays free on the card (the box needs room for its own: logs, covers, updates)
const RESERVE_BYTES = 300 * 1024 * 1024
// a photo from a phone: up to 50 MB (a RAW-like PNG); a video comes later with its own limit
const MAX_PHOTO_BYTES = 50 * 1024 * 1024
// what a picture takes on the box in its three sizes, for the check before an upload (see process.ts)
const STORED_BYTES_PER_PHOTO = 450 * 1024
const TITLE_MAX = 40
// the screensaver's list at most (at 3 s a picture: over an hour)
const SCREENSAVER_MAX = 1500
// touched while photos are looked at on the display - read by idle_shutdown.sh
const AWAKE_FILE = '/tmp/mupibox-photos-awake'

const cleanTitle = (raw: unknown): string | null => {
  // eslint-disable-next-line no-control-regex
  const t = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null
}

// (v: a clip's video)
const SIZE_SUFFIX: Record<string, string> = { f: '.jpg', s: '.s.jpg', b: '.b.jpg', v: '.mp4' }
// a clip from a phone: up to 1 GB as it comes (made smaller on the box)
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024

/** The pictures of an album in the order chosen (Einstellungen › Fotos › Reihenfolge) */
export function ordered(assets: PhotoAsset[], order: PhotoOrder): PhotoAsset[] {
  const list = [...assets]
  if (order === 'newest') return list.sort((a, b) => b.added.localeCompare(a.added))
  if (order === 'taken') return list.sort((a, b) => (a.taken ?? a.added).localeCompare(b.taken ?? b.added))
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const summary = (a: PhotoAlbum) => ({
  id: a.id,
  title: a.title,
  source: a.source,
  display: a.display,
  position: a.position,
  count: a.assets.length,
  videos: a.assets.filter((x) => x.kind === 'video').length,
  cover: coverOf(a) ?? null,
  // (a NAS album: its folder; an album of a photo service: its id there, and whether it is shown live)
  ...(a.source === 'nas' || SERVICE_SOURCES.includes(a.source) ? { ref: a.ref ?? null } : {}),
  ...(SERVICE_SOURCES.includes(a.source) ? { live: a.live === true } : {}),
  ...(a.faces?.length ? { faces: a.faces.length } : {}),
})

/** The face of a person of an album of people (Immich), as kept by its sync - none kept: 404 (a picture is shown instead) */
async function sendFace(req: Request, res: Response, onlyShown: boolean, hidden: Set<string> = new Set()): Promise<void> {
  const { album: albumId, n } = req.params as Record<string, string>
  const a = isId(albumId) ? await findAlbum(albumId) : undefined
  const id = a?.faces?.[Number(n)]
  const file = a && (!onlyShown || (a.display && !hidden.has(a.id))) && /^\d$/.test(n) && id ? remoteOf(a.source)?.faceFile(id) : null
  if (!file) return void res.status(404).end()
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } }, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
}

/** Sends one size of a picture of an album (s: grid, f: full, b: background) - only one the list knows */
async function sendPicture(req: Request, res: Response, onlyShown: boolean, hidden: Set<string> = new Set()): Promise<void> {
  const { album: albumId, asset: assetId, size } = req.params as Record<string, string>
  const suffix = SIZE_SUFFIX[size]
  if (!isId(albumId) || !isId(assetId) || !suffix) return void res.status(400).end()
  const a = await findAlbum(albumId)
  const asset = a?.assets.find((x) => x.id === assetId)
  if (!a || (onlyShown && (!a.display || hidden.has(a.id))) || !asset) return void res.status(404).end()
  // (a clip still waiting to be made has no picture yet; only a clip has a video)
  if (asset.ready === false || (size === 'v' && asset.kind !== 'video')) return void res.status(404).end()
  // (an album of a photo service shown live: the picture comes from the service; one kept on the box whose picture is not
  // there yet - switched from live a moment ago, the cache's limit reached - too)
  const remote = remoteOf(a.source)
  if (remote && (a.live || !(await fsp.access(`${assetBase(a, assetId)}${suffix}`).then(() => true, () => false)))) {
    return void remote.live.send(req, res, a.ref ?? '', { ref: asset.ref ?? '', ver: asset.ver ?? '' }, size)
  }
  // (an id is never used for another picture: kept by the browser for long)
  // (dotfiles: the data folder is below /home/dietpi/.mupibox - express refuses a path with a dot folder by default)
  res.sendFile(`${assetBase(a, assetId)}${suffix}`, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=31536000, immutable', ...(size === 'v' ? { 'Content-Type': 'video/mp4' } : {}) } }, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
}

async function sumOf(file: string): Promise<string> {
  const hash = createHash('sha1')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

// An upload's ticket (made by the app, one per file): to stop it from the app (POST /photos/upload/cancel). Kept as
// long as its upload runs (a big photo over a weak WLAN takes long), then two minutes more - a cancel may come late; a
// cancel before its upload: two minutes for the upload to come.
interface UploadTicket {
  stop: AbortController
  /** set when the upload placed its picture (in the list's turn) */
  placed?: { album: string; asset: string }
  /** its upload runs now: never forgotten meanwhile */
  active?: boolean
  timer?: NodeJS.Timeout
}
const TICKET = /^[a-f0-9]{16}$/
const tickets = new Map<string, UploadTicket>()
function holdTicket(ticket: string, entry: UploadTicket): void {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = undefined
  entry.active = true
  tickets.set(ticket, entry)
}
function releaseTicket(ticket: string, entry: UploadTicket): void {
  entry.active = false
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    if (tickets.get(ticket) === entry && !entry.active) tickets.delete(ticket)
  }, 2 * 60_000)
  entry.timer.unref()
  tickets.set(ticket, entry)
}

export function registerPhotoAlbumRoutes(router: Router, deps: PhotoAlbumDeps): void {
  // (once at the start: what an upload left when the box went off - an upload waits for it)
  const swept = sweepLeftovers().catch((err) => console.warn(`${new Date().toLocaleString()}: [photos] cleanup: ${(err as Error).message}`))
  // (the clips that wait to be made - after a restart too)
  videoQueue.start()

  /** GET /api/app/photos/overview - the albums (with their state), the numbers and the card's space */
  // (?light=1: without the card's space - the library's line asks only for the numbers, counting the pictures' bytes
  // takes a while with thousands of them)
  router.get('/photos/overview', requireSession, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const list = await albums()
    // (the pictures on the card: the uploaded ones and those of the NAS folders in the cache)
    const [space, used, nasUsed, immichUsed, synologyUsed, nextcloudUsed, icloudUsed, photoprismUsed] = req.query.light
      ? [null, 0, 0, 0, 0, 0, 0, 0]
      : await Promise.all([cardSpace(), photoBytes(), photoBytes(NAS_PHOTO_DIR), photoBytes(IMMICH_PHOTO_DIR), photoBytes(SYNOLOGY_PHOTO_DIR), photoBytes(NEXTCLOUD_PHOTO_DIR), photoBytes(ICLOUD_PHOTO_DIR), photoBytes(PHOTOPRISM_PHOTO_DIR)])
    // (several users: shown on the display for the user the app names - see PhotoAlbumDeps)
    const hidden = new Set((await deps.hiddenOf?.(req)) ?? [])
    res.json({
      enabled: photoSettings(deps.getMupiboxConfig()).enabled,
      albums: list.map((a) => ({ ...summary(a), display: a.display && !hidden.has(a.id) })),
      totals: { photos: list.reduce((n, a) => n + a.assets.length, 0), videos: 0, albums: list.length },
      storage: space ? { total: space.total, free: space.free, photos: used + nasUsed + immichUsed + synologyUsed + nextcloudUsed + icloudUsed + photoprismUsed } : null,
    })
  })

  /** GET /api/app/photos/albums/:id - an album with its pictures (newest first, as they came) */
  router.get('/photos/albums/:id', requireSession, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const a = isId(req.params.id) ? await findAlbum(req.params.id) : undefined
    if (!a) return void res.status(404).json({ error: 'no such album' })
    // (several users: shown on the display for the user the app names, as in the overview)
    const hidden = new Set((await deps.hiddenOf?.(req)) ?? [])
    res.json({ ...summary(a), display: a.display && !hidden.has(a.id), assets: ordered(a.assets, 'newest').map(({ id, w, h, taken, added, kind, ready, duration }) => ({ id, w, h, taken, added, kind, ready: ready !== false, duration: duration ?? null })) })
  })

  /** POST /api/app/photos/albums {title} - a new album for uploads (shown on the display, last place) */
  router.post('/photos/albums', requireSession, requireCsrf, async (req, res) => {
    const title = cleanTitle((req.body as { title?: unknown } | undefined)?.title)
    if (!title) return void res.status(400).json({ error: 'title' })
    const created = await update((lib) => {
      const a: PhotoAlbum = { id: newId(), title, source: 'upload', display: true, position: lib.albums.length, created: new Date().toISOString(), assets: [] }
      lib.albums.push(a)
      return a
    })
    res.json(summary(created))
  })

  /** POST /api/app/photos/albums/order {ids} - the order on the display (ids not named keep their order behind) */
  router.post('/photos/albums/order', requireSession, requireCsrf, async (req, res) => {
    const ids = (req.body as { ids?: unknown } | undefined)?.ids
    if (!Array.isArray(ids) || !ids.every(isId)) return void res.status(400).json({ error: 'ids' })
    await update((lib) => {
      const place = new Map((ids as string[]).map((id, i) => [id, i]))
      for (const a of lib.albums) a.position = place.get(a.id) ?? ids.length + a.position
    })
    res.json({ ok: true, albums: (await albums()).map(summary) })
  })

  /** POST /api/app/photos/albums/:id {title?, display?, cover?} - rename (uploads only), show/hide, its picture */
  router.post('/photos/albums/:id', requireSession, requireCsrf, async (req, res) => {
    if (!isId(req.params.id)) return void res.status(400).json({ error: 'id' })
    const body = (req.body ?? {}) as { title?: unknown; display?: unknown; cover?: unknown }
    const title = body.title === undefined ? undefined : cleanTitle(body.title)
    if (title === null) return void res.status(400).json({ error: 'title' })
    if (body.display !== undefined && typeof body.display !== 'boolean') return void res.status(400).json({ error: 'display' })
    if (body.cover !== undefined && !isId(body.cover)) return void res.status(400).json({ error: 'cover' })
    // (several users: "am Display zeigen" for the user the app names - his list; an album hidden for all so far is shown
    // for the box then, and stays hidden for the others)
    const before = isId(req.params.id) ? await findAlbum(req.params.id) : undefined
    // (what is refused below is refused before a user's list changes)
    if (!before) return void res.status(404).json({ error: 'missing' })
    if (title !== undefined && before.source !== 'upload') return void res.status(400).json({ error: 'not_upload' })
    if (typeof body.cover === 'string' && !before.assets.some((x) => x.id === body.cover)) return void res.status(400).json({ error: 'no_asset' })
    const forUser = typeof body.display === 'boolean' && deps.setVisible ? await deps.setVisible(req, before.id, body.display, before.display) : false
    const result = await update((lib) => {
      const a = lib.albums.find((x) => x.id === req.params.id)
      if (!a) return 'missing'
      if (title !== undefined) {
        if (a.source !== 'upload') return 'not_upload'
        a.title = title
      }
      if (typeof body.display === 'boolean' && (!forUser || body.display)) a.display = body.display
      if (typeof body.cover === 'string') {
        if (!a.assets.some((x) => x.id === body.cover)) return 'no_asset'
        a.cover = body.cover
      }
      return summary(a)
    })
    if (typeof result === 'string') return void res.status(result === 'missing' ? 404 : 400).json({ error: result })
    res.json(forUser ? { ...result, display: body.display === true } : result)
  })

  /** POST /api/app/photos/albums/:id/delete - an uploaded album with its pictures, from the card */
  router.post('/photos/albums/:id/delete', requireSession, requireCsrf, async (req, res) => {
    if (!isId(req.params.id)) return void res.status(400).json({ error: 'id' })
    const gone = await update((lib) => {
      const a = lib.albums.find((x) => x.id === req.params.id)
      if (!a || a.source !== 'upload') return null
      lib.albums = lib.albums.filter((x) => x !== a)
      return a
    })
    if (!gone) return void res.status(404).json({ error: 'no such album' })
    await fsp.rm(albumDir(gone), { recursive: true, force: true })
    res.json({ ok: true })
  })

  /** POST /api/app/photos/albums/:id/assets/delete {ids} - pictures of an uploaded album, from the card */
  router.post('/photos/albums/:id/assets/delete', requireSession, requireCsrf, async (req, res) => {
    const ids = (req.body as { ids?: unknown } | undefined)?.ids
    if (!isId(req.params.id) || !Array.isArray(ids) || ids.length === 0 || !ids.every(isId)) return void res.status(400).json({ error: 'ids' })
    const gone = new Set(ids as string[])
    const a = await update((lib) => {
      const x = lib.albums.find((y) => y.id === req.params.id)
      if (!x || x.source !== 'upload') return null
      x.assets = x.assets.filter((p) => !gone.has(p.id))
      if (x.cover && gone.has(x.cover)) delete x.cover
      return x
    })
    if (!a) return void res.status(404).json({ error: 'no such album' })
    for (const id of gone) for (const f of photoFiles(assetBase(a, id))) await fsp.rm(f, { force: true })
    res.json({ ok: true, count: a.assets.length })
  })

  /** POST /api/app/photos/upload/check {files, bytes} - is there room for this choice (before it starts)? */
  router.post('/photos/upload/check', requireSession, requireCsrf, async (req, res) => {
    const files = Number((req.body as { files?: unknown } | undefined)?.files)
    if (!Number.isInteger(files) || files < 0 || files > 10_000) return void res.status(400).json({ error: 'files' })
    // (clips: their bytes twice - as they came until they are made, and the made ones)
    const videoBytes = Number((req.body as { videoBytes?: unknown } | undefined)?.videoBytes) || 0
    const space = await cardSpace()
    const needed = files * STORED_BYTES_PER_PHOTO + Math.max(0, Math.min(videoBytes, 100 * MAX_VIDEO_BYTES)) * 2
    // (missing: how much is lacking for this choice - "Für diese Auswahl fehlen etwa 1,1 GB")
    const missing = space ? Math.max(0, needed + RESERVE_BYTES - space.free) : 0
    res.json({ needed, free: space?.free ?? null, enough: space ? space.free - needed > RESERVE_BYTES : true, missing })
  })

  /**
   * POST /api/app/photos/upload/cancel {ticket} - the app stopped this upload: it is not finished, and when it was placed
   * just now it is taken out again (the app has said "Abgebrochen"). A cancel before its upload came: that one stops at once.
   */
  router.post('/photos/upload/cancel', requireSession, requireCsrf, async (req, res) => {
    const ticket = String((req.body as { ticket?: unknown } | undefined)?.ticket ?? '')
    if (!TICKET.test(ticket)) return void res.status(400).json({ error: 'ticket' })
    const entry = tickets.get(ticket) ?? { stop: new AbortController() }
    // (its upload still runs: kept until it ends - its own end starts the two minutes)
    if (!entry.active) releaseTicket(ticket, entry)
    entry.stop.abort()
    // (in the list's turn, after the upload's own: what it placed is known by then)
    const removed = await update((lib) => {
      const placed = entry.placed
      if (!placed) return null
      entry.placed = undefined
      const a = lib.albums.find((x) => x.id === placed.album)
      if (!a || !a.assets.some((x) => x.id === placed.asset)) return null
      a.assets = a.assets.filter((x) => x.id !== placed.asset)
      if (a.cover === placed.asset) delete a.cover
      return placed
    })
    if (removed) for (const f of photoFiles(assetBase({ id: removed.album }, removed.asset))) await fsp.rm(f, { force: true })
    res.json({ ok: true, removed: Boolean(removed) })
  })

  /**
   * PUT /api/app/photos/upload?album=<id>&name=<file name>&ticket=<16 hex>  Body: the file's bytes.
   * One picture into an uploaded album, made into its sizes at once (no original kept). The answer for the app's list:
   * {ok, asset} or {skipped: 'format' | 'duplicate' | 'broken' | 'space'}.
   */
  router.put('/photos/upload', requireSession, requireCsrf, async (req, res) => {
    const albumId = String(req.query.album ?? '')
    const name = String(req.query.name ?? '')
    const ext = extOf(name)
    if (!isId(albumId)) return void res.status(400).json({ error: 'album' })
    const target = await findAlbum(albumId)
    if (!target || target.source !== 'upload') return void res.status(404).json({ error: 'no such album' })
    const isVideo = VIDEO_EXTENSIONS.includes(ext)
    if (!PHOTO_EXTENSIONS.includes(ext) && !isVideo) return void res.json({ skipped: 'format' })
    const size = Number.parseInt(String(req.headers['content-length'] ?? ''), 10)
    if (!Number.isFinite(size) || size <= 0) return void res.status(411).json({ error: 'length required' })
    if (size > (isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES)) return void res.json({ skipped: isVideo ? 'large' : 'format' })
    const space = await cardSpace()
    // (a clip: as it came until it is made - about as much again for the made one)
    if (space && space.free - (isVideo ? size * 2 : size + STORED_BYTES_PER_PHOTO) < RESERVE_BYTES) return void res.json({ skipped: 'space' })

    await swept
    await fsp.mkdir(INCOMING_DIR, { recursive: true })
    const part = path.join(INCOMING_DIR, `${randomBytes(6).toString('hex')}${ext}.part`)
    const id = newId()
    const out = assetBase(target, id)
    // the app stopped the upload (its sheet closed): the picture is not made and not placed - the app has said
    // "Abgebrochen", a photo turning up afterwards would be one nobody wanted. Said by the app's cancel with the upload's
    // ticket (lighttpd on port 80 keeps the way to the server open when the browser lets go), or seen directly.
    const ticket = TICKET.test(String(req.query.ticket ?? '')) ? String(req.query.ticket) : null
    const entry: UploadTicket = (ticket && tickets.get(ticket)) || { stop: new AbortController() }
    if (ticket) holdTicket(ticket, entry)
    const gone = entry.stop
    res.on('close', () => {
      if (!res.writableFinished) gone.abort()
    })
    try {
      await pipeline(req, createWriteStream(part, { flags: 'wx' }))
      if ((await fsp.stat(part)).size !== size) throw new Error('incomplete')
      const sum = await sumOf(part)
      if (target.assets.some((x) => x.sum === sum)) return void res.json({ skipped: 'duplicate' })
      await fsp.mkdir(albumDir(target), { recursive: true })
      if (isVideo) {
        // a clip: kept as it came, made in the background (video.ts) - the app shows it as "Wird vorbereitet"
        if (gone.signal.aborted) return
        await fsp.rename(part, `${out}.pending`)
        const asset: PhotoAsset = { id, w: 0, h: 0, taken: null, added: new Date().toISOString(), kind: 'video', sum, ready: false, duration: 0 }
        const placed = await update((lib) => {
          if (gone.signal.aborted) return 'aborted'
          const a = lib.albums.find((x) => x.id === albumId)
          if (!a) return false
          if (a.assets.some((x) => x.sum === sum)) return 'duplicate'
          a.assets.push(asset)
          entry.placed = { album: albumId, asset: id }
          return true
        })
        if (placed !== true) {
          for (const f of photoFiles(out)) await fsp.rm(f, { force: true })
          if (placed === 'aborted') return
          return void (placed === 'duplicate' ? res.json({ skipped: 'duplicate' }) : res.status(404).json({ error: 'no such album' }))
        }
        void videoQueue.kick()
        return void res.json({ ok: true, preparing: true, video: true, asset: { id, w: 0, h: 0 } })
      }
      let facts
      try {
        facts = await processPhoto(part, out, ext, gone.signal)
      } catch (err) {
        if (err instanceof NotAPicture) return void res.json({ skipped: 'broken' })
        if (err instanceof PhotoAborted) return
        throw err
      }
      const asset: PhotoAsset = { id, w: facts.w, h: facts.h, taken: facts.taken, added: new Date().toISOString(), kind: 'photo', sum }
      const placed = await update((lib) => {
        // (asked once more in the list's turn: the app may have stopped while the list was busy)
        if (gone.signal.aborted) return 'aborted'
        const a = lib.albums.find((x) => x.id === albumId)
        if (!a) return false
        // (the same picture twice at once - two uploads of it side by side: once)
        if (a.assets.some((x) => x.sum === sum)) return 'duplicate'
        a.assets.push(asset)
        // (in the list's turn: a cancel after this one takes it out again)
        entry.placed = { album: albumId, asset: id }
        return true
      })
      if (placed !== true) {
        for (const f of photoFiles(out)) await fsp.rm(f, { force: true })
        if (placed === 'aborted') return
        return void (placed === 'duplicate' ? res.json({ skipped: 'duplicate' }) : res.status(404).json({ error: 'no such album' }))
      }
      res.json({ ok: true, asset: { id, w: asset.w, h: asset.h } })
    } catch (err) {
      for (const f of photoFiles(out)) await fsp.rm(f, { force: true })
      const message = (err as Error).message
      console.warn(`${new Date().toLocaleString()}: [photos] upload ${name}: ${message}`)
      // (the request is read to its end by now - whether the app still waits shows the answer's side)
      if (!res.headersSent && !res.destroyed) res.status(message === 'heif-convert missing' ? 503 : 500).json({ error: message === 'heif-convert missing' ? 'heif_missing' : 'upload failed' })
    } finally {
      await fsp.rm(part, { force: true })
      if (ticket) releaseTicket(ticket, entry)
    }
  })

  /** GET /api/app/photos/file/:album/:asset/:size - a picture for the app (s grid, f full view, b background) */
  router.get('/photos/file/:album/:asset/:size', requireSession, (req, res) => void sendPicture(req, res, false))

  /** GET /api/app/photos/face/:album/:n - the n-th face of an album of people (its tile in the app) */
  router.get('/photos/face/:album/:n', requireSession, (req, res) => void sendFace(req, res, false))
}

/**
 * The display's side (port 8200: the box itself, or the app's session - see the server's gate): only when the photo
 * display is on, only albums shown there and with pictures; no source, no account.
 *   GET /api/photos/albums           the albums in their order, with their first two pictures (the stack)
 *   GET /api/photos/album/:id        the pictures of an album in the order chosen
 *   GET /api/photos/screensaver      whether the screensaver runs and how (?list=1: and its pictures)
 *   POST /api/photos/screensaver/check  which pictures of a running screensaver are still there
 *   GET /api/photos/file/:album/:asset/:size
 *   GET /api/photos/face/:album/:n   a face of an album of people (Immich)
 */
export function registerPhotoDisplayRoutes(app: Express, deps: PhotoAlbumDeps): void {
  const on = () => photoSettings(deps.getMupiboxConfig()).enabled
  // the pictures of an album the display shows: clips only with "Videos anzeigen" and once they are made
  const shownAssets = (a: PhotoAlbum, videos = photoSettings(deps.getMupiboxConfig()).showVideos) => a.assets.filter((x) => x.kind !== 'video' || (videos && x.ready !== false))
  const withShown = (a: PhotoAlbum): PhotoAlbum => ({ ...a, assets: shownAssets(a) })
  app.get('/api/photos/albums', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const s = photoSettings(deps.getMupiboxConfig())
    if (!s.enabled) return void res.json({ enabled: false, albums: [] })
    const hidden = hiddenInPlace(deps)
    const list = (await albums()).map(withShown).filter((a) => a.display && !hidden.has(a.id) && a.assets.length > 0)
    // (albums shown live from a photo service while it is away: "Gerade nicht da" on the display; ?check=1 - "Nochmal",
    // or the display asking while albums are not there - asks the services first)
    if (req.query.check === '1') await checkRemotesNow()
    const away = (a: PhotoAlbum) => a.live === true && remoteOf(a.source)?.live.away() === true
    res.json({
      enabled: true,
      startAsSlideshow: s.startAsSlideshow,
      slideshowSeconds: s.slideshowSeconds,
      albums: list.map((a) => {
        // (the stack: pictures - a clip's own picture too, when it is shown)
        const first = coverOf(a)
        const second = a.assets.find((x) => x.id !== first)?.id ?? null
        // (an album of people: their faces on the stack - the display asks for each, one not kept falls back to the picture)
        return { id: a.id, title: a.title, count: a.assets.length, pictures: [first, second].filter(Boolean), ...(a.faces?.length ? { faces: a.faces.length } : {}), ...(away(a) ? { away: true } : {}) }
      }),
    })
  })
  app.get('/api/photos/album/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const a = on() && isId(req.params.id) ? await findAlbum(req.params.id) : undefined
    if (!a || !a.display || hiddenInPlace(deps).has(a.id)) return void res.status(404).json({ error: 'no such album' })
    const order = photoSettings(deps.getMupiboxConfig()).order
    const shown = shownAssets(a)
    if (!shown.length) return void res.status(404).json({ error: 'no such album' })
    res.json({ id: a.id, title: a.title, assets: ordered(shown, order).map(({ id, w, h, kind, duration }) => ({ id, w, h, ...(kind === 'video' ? { kind, duration: duration ?? 0 } : {}) })) })
  })
  // the screensaver: when it starts and how; with ?list=1 also its pictures (when it starts) - from every album shown
  // on the display, as one list in the order chosen ("Gemischt": all mixed; else album by album, in the albums' order)
  app.get('/api/photos/screensaver', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const s = photoSettings(deps.getMupiboxConfig())
    if (!s.enabled || !s.screensaver.enabled) return void res.json({ enabled: false })
    if (req.query.list !== '1') return void res.json({ ...s.screensaver, slideshowSeconds: s.slideshowSeconds })
    // (pictures only: no clip in the screensaver)
    const hidden = hiddenInPlace(deps)
    const shown = (await albums()).map((a) => ({ ...a, assets: a.assets.filter((x) => x.kind !== 'video') })).filter((a) => a.display && !hidden.has(a.id) && a.assets.length > 0)
    let pictures = shown.flatMap((a) => ordered(a.assets, s.order === 'shuffle' ? 'newest' : s.order).map((x) => ({ album: a.id, id: x.id })))
    if (s.order === 'shuffle') {
      for (let i = pictures.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pictures[i], pictures[j]] = [pictures[j], pictures[i]]
      }
    }
    // (enough for far longer than the display stays on)
    pictures = pictures.slice(0, SCREENSAVER_MAX)
    res.json({ ...s.screensaver, slideshowSeconds: s.slideshowSeconds, pictures })
  })
  // a running screensaver's pictures, which of them are still there and shown (hidden or deleted in the app meanwhile:
  // left out) - asked with its own list, the list above is only a part of them when there are many
  app.post('/api/photos/screensaver/check', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const s = photoSettings(deps.getMupiboxConfig())
    if (!s.enabled || !s.screensaver.enabled) return void res.json({ enabled: false })
    const asked: unknown[] = Array.isArray(req.body?.pictures) ? req.body.pictures.slice(0, SCREENSAVER_MAX) : []
    const hidden = hiddenInPlace(deps)
    const there = new Set((await albums()).filter((a) => a.display && !hidden.has(a.id)).flatMap((a) => a.assets.map((x) => `${a.id}/${x.id}`)))
    const pictures = asked.filter(
      (p): p is { album: string; id: string } =>
        !!p && typeof p === 'object' && isId((p as { album?: unknown }).album) && isId((p as { id?: unknown }).id) && there.has(`${(p as { album: string }).album}/${(p as { id: string }).id}`),
    )
    res.json({ enabled: true, pictures: pictures.map(({ album, id }) => ({ album, id })) })
  })
  app.get('/api/photos/file/:album/:asset/:size', (req, res) => {
    if (!on()) return void res.status(404).end()
    void sendPicture(req, res, true, hiddenInPlace(deps))
  })
  app.get('/api/photos/face/:album/:n', (req, res) => {
    if (!on()) return void res.status(404).end()
    void sendFace(req, res, true, hiddenInPlace(deps))
  })
  // photos looked at on the display (touched in the last minutes): the switching off when idle (idle_shutdown.sh)
  // counts the next two minutes as not idle - only the display itself, not a phone's session
  app.post('/api/photos/awake', (req, res) => {
    const ip = req.socket.remoteAddress ?? ''
    if (!on() || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ip)) return void res.status(404).end()
    const now = new Date()
    fsp
      .utimes(AWAKE_FILE, now, now)
      .catch(() => fsp.writeFile(AWAKE_FILE, ''))
      .then(
        () => res.json({ ok: true }),
        () => res.status(500).end(),
      )
  })
}
