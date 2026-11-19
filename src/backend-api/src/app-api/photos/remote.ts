// The photo display's albums of a photo service (5.1, Bibliothek › Fotos › Immich / Synology Photos): what is the same for
// every service - the sync of the albums chosen, the two ways to keep them, the live pictures, a service away. A service
// (immich.ts, synology.ts) only says how an album is read and how a picture or a clip is fetched.
//   Fotos auf der Box speichern on (default): the box fetches a display size of each picture, makes the display's sizes
//                 of it (process.ts) and keeps them in the cache - shown also while the service is away;
//   off (live):   only the list of the pictures is kept; a picture comes from the service when it is shown, the ones
//                 shown last in a small cache. The service away: such an album is "gerade nicht da".

import { createHash, randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { NotAPicture, PhotoAborted, photoFiles, processPhoto } from './process'
import { photoSettings } from './settings'
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, videoQueue } from './video'
import { albumDir, assetBase, cardSpace, INCOMING_DIR, newId, type PhotoAlbum, type PhotoAsset, type PhotoSource, PHOTOS_DIR, photoBytes, rejectedClips, update } from './store'

export const SYNC_MINUTES = [0, 15, 60, 360, 1440] as const
export const CACHE_LIMITS_MB = [0, 500, 1024, 2048, 4096, 8192] as const
// what the live pictures may take at most
const LIVE_CACHE_BYTES = 200 * 1024 * 1024
export const PICTURES_MAX = 20_000
export const FILE_MAX_BYTES = 30 * 1024 * 1024
const RESERVE_BYTES = 300 * 1024 * 1024
// a picture's or an album's id at a service, as the box keeps it (a UUID, a number)
export const REMOTE_REF = /^[A-Za-z0-9_-]{1,64}$/
// an album's: also one of Immich's albums of people (up to three ids - immich.ts peopleRef)
const REMOTE_ALBUM_REF = /^[A-Za-z0-9_-]{1,128}$/
// a face kept: asked for again after a week (a better one chosen in Immich)
const FACE_DAYS = 7
const FACE_MAX_BYTES = 2 * 1024 * 1024

/* ---------- what goes wrong ---------- */

export class RemoteAway extends Error {}
export class RemoteRefused extends Error {
  constructor(
    readonly status: number,
    label = 'the service',
  ) {
    super(`${label} answered ${status}`)
  }
}
/** The service cannot answer now: not reachable, or it (or a proxy in front of it) says it has trouble or too much to do */
// (a time limit that ran out - asking, or reading the answer - is the service not answering. Where a request of the box
// itself may be called off - the sync stopped, the display gone - that is checked before.)
const timedOut = (err: unknown): boolean => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
// (the connection lost while an answer was read: a socket's error - the stream of an https answer with a confirmed
// certificate gives ECONNRESET "aborted" when its time limit runs out -, or fetch's "terminated" with the socket's error
// as its cause. Not an error of the card or of a file here: those are no service away.)
const NET_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'])
const lostConnection = (err: unknown): boolean => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null
  return !!e && (NET_CODES.has(String(e.code)) || NET_CODES.has(String(e.cause?.code)) || (err instanceof TypeError && err.message === 'terminated'))
}
export const remoteDown = (err: unknown): boolean =>
  err instanceof RemoteAway || timedOut(err) || lostConnection(err) || (err instanceof RemoteRefused && (err.status >= 500 || err.status === 429))
/** The key or the login is not (or no longer) accepted, or it lacks a right */
export const remoteRefusedKey = (err: unknown): boolean => err instanceof RemoteRefused && (err.status === 401 || err.status === 403)

/* ---------- what a service gives ---------- */

/** A picture or a clip of an album at a service */
export interface RemoteItem {
  ref: string
  kind: 'photo' | 'video'
  /** what changes when the picture changes there (a checksum, a cache key) */
  ver: string
  /** its size as shown (turned as its orientation says); 0: not known */
  w: number
  h: number
  /** when it was taken, "YYYY-MM-DDTHH:MM:SS" (local time) */
  taken: string | null
  /** a clip's length in seconds (0: not known) */
  duration: number
  /** false: a picture the service cannot show in a display size (no preview of it) - kept on the box from its original,
   *  left out live */
  liveOk?: boolean
}

export interface RemoteClient {
  /** an album with its pictures (clips only with "Videos anzeigen"); RemoteRefused 404: there is no such album any more.
   *  faces: an album of people - their ids, whose faces (face()) the display shows on its stack */
  album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[]; faces?: string[] }>
  /** a person's face (an album of people) */
  face?(id: string, signal?: AbortSignal): Promise<globalThis.Response>
  /** a picture: "full" a display size (kept on the box, the full view), "grid" a small one */
  picture(albumRef: string, item: { ref: string; ver: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response>
  /** a clip, as it is kept and made on the box (or passed on live: liveClips); range a part of it */
  clip(albumRef: string, item: { ref: string; ver: string }, init: { signal?: AbortSignal; range?: string; timeoutMs?: number }): Promise<globalThis.Response>
  /** clips are shown live as they come (the service makes them for browsers); false: live albums show no clips */
  liveClips: boolean
  /** a short question with the login, to see whether the service is back */
  check(signal: AbortSignal): Promise<void>
}

export interface RemoteSettings {
  /** set up (an address and a key, a login) */
  set: boolean
  albumIds: string[]
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
  /** an album that is the day's (Immich's memories): a sync after midnight too, whatever the interval */
  daily?: boolean
}

export interface RemoteSpec {
  source: Extract<PhotoSource, 'immich' | 'synology' | 'nextcloud' | 'icloud' | 'photoprism'>
  /** how the logs name it */
  label: string
  stateFile: string
  /** where the pictures kept on the box lie, and the live ones */
  photoDir: string
  liveDir: string
  /** where the faces of albums of people lie ("<id>.jpg") - a service with such albums */
  faceDir?: string
  settings(cfg: MupiboxConfig | undefined): RemoteSettings
  /** the client with the login as kept; null: none, or the login cannot be used on this box */
  client(cfg: MupiboxConfig | undefined): RemoteClient | null
  /** what the log says when it is set up but its login cannot be used here */
  unreadable: string
}

/* ---------- the sync ---------- */

export interface RemoteSyncState {
  running: boolean
  done: number
  total: number
  lastSync: string | null
  offlineSince: string | null
  cacheFull: boolean
  /** the key or the login is no longer accepted (deleted or changed at the service) */
  unauthorized: boolean
  /** albums chosen that the service no longer has */
  missing: number
  /** the last sync stopped before its end (the service away or in trouble): the next one comes soon - only a sync that
   *  gets to its end clears it, not a live picture that came meanwhile */
  retry: boolean
  /** away because its certificate is not the one confirmed (renewed - Let's Encrypt every 60 to 90 days): the app says
   *  so - to be confirmed anew - instead of only "not reachable" */
  certificate?: boolean
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
// (pinned-fetch.ts's CertificateError, known by its certificate: that file builds on this one - imported here, the two
// would need each other before either is ready)
const certificateRefused = (err: unknown): boolean => err instanceof RemoteAway && 'certificate' in err

export class RemotePhotoSync {
  private state: RemoteSyncState = { running: false, done: 0, total: 0, lastSync: null, offlineSince: null, cacheFull: false, unauthorized: false, missing: 0, retry: false }
  private lastTry = 0
  private again = false
  private stop: AbortController | null = null
  private loaded: Promise<void>
  /** the live pictures (see RemoteLive) */
  readonly live: RemoteLive

  constructor(
    readonly spec: RemoteSpec,
    private readonly getConfig: () => MupiboxConfig | undefined,
  ) {
    this.live = new RemoteLive(this)
    this.loaded = fsp
      .readFile(spec.stateFile, 'utf8')
      .then((raw) => {
        const s = obj(JSON.parse(raw))
        this.state.lastSync = typeof s.lastSync === 'string' ? s.lastSync : null
        this.state.offlineSince = typeof s.offlineSince === 'string' ? s.offlineSince : null
        this.state.cacheFull = s.cacheFull === true
        this.state.unauthorized = s.unauthorized === true
        this.state.retry = s.retry === true
      })
      .catch(() => undefined)
  }

  status(): RemoteSyncState {
    return { ...this.state }
  }

  /** The service answered with the login (a live picture came, or the check): it is back - the albums show again before the next sync */
  reachable(): void {
    if (this.state.offlineSince || this.state.unauthorized) {
      this.state.offlineSince = null
      this.state.unauthorized = false
      this.state.certificate = false
      void this.save()
    }
  }

  /** The service refused the login (a live picture, the check): as the sync - asked again at most every 15 minutes */
  refused(): void {
    if (!this.state.unauthorized) {
      this.state.unauthorized = true
      void this.save()
    }
  }

  client(cfg = this.getConfig()): RemoteClient | null {
    return this.spec.client(cfg)
  }

  start(): void {
    const tick = () => {
      const cfg = this.getConfig()
      const s = this.spec.settings(cfg)
      if (!photoSettings(cfg).enabled || s.syncMinutes === 0 || this.state.running || !s.set) return
      const every = (this.state.offlineSince || this.state.retry ? Math.min(15, s.syncMinutes) : s.syncMinutes) * 60_000
      // (a new day: the day's album anew - the last try was on another day of the box's clock)
      const newDay = s.daily === true && this.lastTry > 0 && new Date(this.lastTry).toDateString() !== new Date().toDateString()
      if (Date.now() - this.lastTry >= every || newDay) void this.run()
    }
    setTimeout(() => {
      tick()
      setInterval(tick, 60_000).unref?.()
    }, 120_000).unref?.()
  }

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

  cancel(): void {
    this.stop?.abort()
    this.again = false
  }

  private async save(): Promise<void> {
    const { lastSync, offlineSince, cacheFull, unauthorized, retry } = this.state
    await fsp.mkdir(PHOTOS_DIR, { recursive: true }).catch(() => undefined)
    const tmp = `${this.spec.stateFile}.${process.pid}.tmp`
    await fsp.writeFile(tmp, JSON.stringify({ lastSync, offlineSince, cacheFull, unauthorized, retry })).catch(() => undefined)
    await fsp.rename(tmp, this.spec.stateFile).catch(() => undefined)
  }

  private log(msg: string): void {
    console.log(`${new Date().toLocaleString()}: [photos] ${this.spec.label}: ${msg}`)
  }

  private async sync(): Promise<void> {
    await this.loaded
    this.lastTry = Date.now()
    const { source } = this.spec
    const cfg = this.getConfig()
    const s = this.spec.settings(cfg)
    if (!photoSettings(cfg).enabled) return
    const client = this.client(cfg)
    // (set up, but no login that can be used - the config of another box: its key cannot be read here): nothing on the
    // box changes, the app asks for it; taking the albums off is "Verbindung trennen"
    if (!client) {
      if (s.set) {
        this.state.unauthorized = true
        this.log(this.spec.unreadable)
        await this.save()
      }
      return
    }
    const stop = new AbortController()
    this.stop = stop
    Object.assign(this.state, { running: true, done: 0, total: 0 })
    try {
      const videos = photoSettings(cfg).showVideos
      // the albums chosen as the service has them now; the service away: nothing changes on the box
      const found = new Map<string, { name: string; items: RemoteItem[]; faces?: string[] }>()
      let missing = 0
      {
        for (const id of s.albumIds) {
          if (stop.signal.aborted) return
          try {
            found.set(id, await client.album(id, stop.signal, videos))
          } catch (err) {
            if (stop.signal.aborted) return
            if (err instanceof RemoteRefused && err.status === 404) {
              missing++
              continue
            }
            if (remoteRefusedKey(err)) {
              this.state.unauthorized = true
              this.log('the login is not accepted any more, the pictures on the box stay')
            } else {
              if (!this.state.offlineSince) this.state.offlineSince = new Date().toISOString()
              this.state.retry = true
              this.state.certificate = certificateRefused(err)
              this.log(`not reachable (${(err as Error).message}), the pictures on the box stay`)
            }
            await this.save()
            return
          }
        }
      }
      Object.assign(this.state, { offlineSince: null, unauthorized: false, missing, certificate: false })
      // (the faces of the albums of people, for the display - before the pictures: they are few and shown first)
      await this.keepFaces(client, [...found.values()].flatMap((f) => f.faces ?? []), stop.signal)
      if (stop.signal.aborted) return

      // the albums: new ones go into the list with their first picture (live: at once); gone or no longer chosen out
      const live = !s.keepCopy
      const gone: PhotoAlbum[] = []
      const plan = await update((lib) => {
        const now = new Date().toISOString()
        for (const a of lib.albums.filter((x) => x.source === source)) if (!a.ref || !found.has(a.ref)) gone.push(a)
        lib.albums = lib.albums.filter((a) => !gone.includes(a))
        const out: Array<{ album: PhotoAlbum; items: RemoteItem[]; fresh: boolean; was: boolean }> = []
        for (const [ref, f] of found) {
          const a = lib.albums.find((x) => x.source === source && x.ref === ref)
          const title = (f.name || this.spec.label).slice(0, 40)
          if (a) {
            // (its name follows the service; the way it is kept, the switch)
            const was = a.live === true
            a.title = title
            a.live = live
            if (f.faces?.length) a.faces = f.faces
            else delete a.faces
            out.push({ album: { ...a, assets: [...a.assets] }, items: f.items, fresh: false, was })
          } else
            out.push({
              album: { id: newId(), title, source, display: true, position: 0, created: now, assets: [], ref, live, ...(f.faces?.length ? { faces: f.faces } : {}) },
              items: f.items,
              fresh: true,
              was: live,
            })
        }
        return out
      })
      for (const a of gone) await fsp.rm(albumDir(a), { recursive: true, force: true }).catch(() => undefined)

      // live: the list only (the pictures come when shown) - what was kept on the box before goes. A service whose clips
      // the display cannot play as they come: its live albums show no clips.
      if (live) {
        await update((lib) => {
          for (const { album, items } of plan) {
            let a = lib.albums.find((x) => x.id === album.id)
            const shown = items.filter((x) => x.liveOk !== false && (client.liveClips || x.kind === 'photo'))
            if (!a) {
              if (!shown.length) continue
              a = { ...album, assets: [], position: lib.albums.length }
              lib.albums.push(a)
            }
            const before = new Map(a.assets.map((x) => [x.ref, x]))
            a.assets = shown.slice(0, PICTURES_MAX).map((x) => {
              const old = before.get(x.ref)
              // (a clip waiting to be made when the album was kept: live it is ready at once; its length as the service
              // says now - Immich 3 gives it in another form, the clips of before had none)
              if (old && old.ver === x.ver) return old.kind === 'video' ? { ...old, ready: true, duration: x.duration || old.duration } : old
              const base = { id: newId(), w: x.w, h: x.h, taken: x.taken, added: new Date().toISOString(), ref: x.ref, ver: x.ver }
              return x.kind === 'video' ? { ...base, kind: 'video' as const, ready: true, duration: x.duration } : { ...base, kind: 'photo' as const }
            })
            if (a.cover && !a.assets.some((x) => x.id === a?.cover)) delete a.cover
          }
          lib.albums = lib.albums.filter((a) => a.source !== source || a.assets.length > 0)
        })
        for (const { album, was } of plan) if (!was) await fsp.rm(albumDir(album), { recursive: true, force: true }).catch(() => undefined)
        this.state.cacheFull = false
        this.state.lastSync = new Date().toISOString()
        this.state.retry = false
        await this.save()
        return
      }

      // kept on the box: as the NAS folders - gone out at once, changed ones replaced when the new one is made, new in
      const work: Array<{ album: PhotoAlbum; item: RemoteItem; old?: PhotoAsset; fresh: boolean }> = []
      // (clips not taken before - too long, no clip - while unchanged)
      const rejected = await rejectedClips()
      for (const { album, items, fresh } of plan) {
        const wanted = new Map(items.map((x) => [x.ref, x]))
        const drop: PhotoAsset[] = []
        const replace = new Map<string, PhotoAsset>()
        // (a clip kept without its length, which the service tells now - Immich 3: the clips of before had none; one
        // with a length is left as it is - the box's own, once made, may differ by a second)
        const lengths = new Map<string, number>()
        for (const x of album.assets) {
          const f = x.ref ? wanted.get(x.ref) : undefined
          if (!f) {
            drop.push(x)
            continue
          }
          if (x.kind === 'video' && f.duration && !x.duration) lengths.set(x.id, f.duration)
          // (a clip still waiting to be made: its file as it came is there)
          const file = x.kind === 'video' && x.ready === false ? `${assetBase(album, x.id)}.pending` : `${assetBase(album, x.id)}.jpg`
          const there = x.ver === f.ver && (await fsp.access(file).then(() => true, () => false))
          if (there) wanted.delete(f.ref)
          else replace.set(f.ref, x)
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
        if (lengths.size) {
          await update((lib) => {
            const a = lib.albums.find((y) => y.id === album.id)
            for (const x of a?.assets ?? []) if (lengths.has(x.id)) x.duration = lengths.get(x.id)
          })
        }
        // (a clip the service says is too long, or one not taken before while unchanged: not fetched)
        const takes = (x: RemoteItem) => !rejected.has(`${source}:${x.ref}|${x.ver}`) && !(x.kind === 'video' && x.duration > VIDEO_MAX_SECONDS + 1)
        for (const x of items) if (wanted.has(x.ref) && takes(x)) work.push({ album, item: x, old: replace.get(x.ref), fresh })
      }
      this.state.total = work.length

      const limit = s.cacheLimitMb > 0 ? s.cacheLimitMb * 1024 * 1024 : Number.POSITIVE_INFINITY
      let used = await photoBytes(this.spec.photoDir)
      let full = false
      // (stopped in the middle: the service away or in trouble, or the login refused - no finished sync)
      let broken = false
      await fsp.mkdir(INCOMING_DIR, { recursive: true })
      for (const { album, item: x, old, fresh } of work) {
        if (stop.signal.aborted) return
        const space = await cardSpace()
        let oldBytes = 0
        if (old) for (const f of photoFiles(assetBase(album, old.id))) oldBytes += (await fsp.stat(f).catch(() => ({ size: 0 }))).size
        // (a display size of a picture makes about 250 KB on the box)
        if ((!old && used + 250 * 1024 > limit) || (space && space.free < RESERVE_BYTES + FILE_MAX_BYTES)) {
          full = true
          break
        }
        const part = path.join(INCOMING_DIR, `${source}-${randomBytes(6).toString('hex')}.jpg.part`)
        const id = newId()
        const out = assetBase(album, id)
        const clip = x.kind === 'video'
        // (the kind of the picture as the service sends it: an original in HEIC - an iPhone photo Nextcloud makes no
        // preview of - goes through heif-convert; taken for a JPEG it was dropped and fetched again at every sync)
        let ext = '.jpg'
        try {
          if (clip) {
            const r = await client.clip(album.ref ?? '', x, { signal: stop.signal })
            // (at most what leaves room for the made one and the reserve)
            const room = space ? Math.floor((space.free - RESERVE_BYTES) / 2) : VIDEO_MAX_BYTES
            if (room <= 0 || !(await streamTo(r, part, Math.min(VIDEO_MAX_BYTES, room)))) continue
          } else {
            const r = await client.picture(album.ref ?? '', x, 'full', stop.signal)
            const size = Number(r.headers.get('content-length'))
            if (Number.isFinite(size) && size > FILE_MAX_BYTES) {
              await r.body?.cancel().catch(() => undefined)
              continue
            }
            if (/image\/hei[cf]/i.test(r.headers.get('content-type') ?? '')) ext = '.heic'
            await fsp.writeFile(part, Buffer.from(await r.arrayBuffer()))
          }
          await fsp.mkdir(albumDir(album), { recursive: true })
          // (a clip: kept as it came, made in the background - video.ts)
          if (clip) await fsp.rename(part, `${out}.pending`)
          const facts = clip ? { w: 0, h: 0, taken: null } : await processPhoto(part, out, ext, stop.signal)
          let newBytes = 0
          for (const f of photoFiles(out)) newBytes += (await fsp.stat(f).catch(() => ({ size: 0 }))).size
          if (used - oldBytes + newBytes > limit) {
            for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
            full = true
            break
          }
          // (the display size carries no date: the one the service knows)
          const asset: PhotoAsset = clip
            ? { id, w: 0, h: 0, taken: x.taken, added: new Date().toISOString(), kind: 'video', ready: false, duration: x.duration, ref: x.ref, ver: x.ver }
            : { id, w: facts.w, h: facts.h, taken: x.taken ?? facts.taken, added: new Date().toISOString(), kind: 'photo', ref: x.ref, ver: x.ver }
          const placed = await update((lib) => {
            let a = lib.albums.find((y) => y.id === album.id)
            if (!a && fresh && !lib.albums.some((y) => y.source === source && y.ref === album.ref)) {
              a = { ...album, assets: [], position: lib.albums.length }
              lib.albums.push(a)
            }
            if (!a || a.assets.some((y) => y.ref === x.ref && y.id !== old?.id)) return false
            const at = old ? a.assets.findIndex((y) => y.id === old.id) : -1
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
          if (err instanceof PhotoAborted || stop.signal.aborted) return
          for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
          // (the service went away in the middle, or it has trouble - a proxy in front of it answering 502, say -, or the
          // login is no longer accepted: not one try per picture, the rest at the next sync)
          if (remoteDown(err) || remoteRefusedKey(err)) {
            // (a login without the right for the pictures: the app says so, as for one refused; the service away: "nicht
            // erreichbar", and the next try comes soon - the pictures fetched so far stay)
            if (remoteRefusedKey(err)) this.state.unauthorized = true
            else if (!this.state.offlineSince) this.state.offlineSince = new Date().toISOString()
            this.log(`stopped: ${(err as Error).message} - the rest at the next sync`)
            broken = true
            if (!remoteRefusedKey(err)) this.state.retry = true
            break
          }
          if (!(err instanceof NotAPicture)) this.log(`${x.ref}: ${(err as Error).message}`)
          // (a picture the box cannot read - a RAW file Nextcloud makes no preview of: up to 30 MB fetched and written at
          // every sync, never shown - remembered as a clip that cannot be made, until it changes at the service)
          else {
            const key = `${source}:${x.ref}|${x.ver}`
            await update((lib) => {
              if (!(lib.rejected ?? []).includes(key)) lib.rejected = [...(lib.rejected ?? []), key].slice(-1000)
            }).catch(() => undefined)
          }
        } finally {
          await fsp.rm(part, { force: true }).catch(() => undefined)
          this.state.done++
        }
      }
      await update((lib) => {
        lib.albums = lib.albums.filter((a) => a.source !== source || a.assets.length > 0)
      })
      this.state.cacheFull = full
      if (!broken) Object.assign(this.state, { lastSync: new Date().toISOString(), retry: false })
      await this.save()
    } catch (err) {
      this.log(`sync failed: ${(err as Error).message}`)
    } finally {
      this.state.running = false
      if (this.stop === stop) this.stop = null
    }
  }

  /** The face of a person whose album is on the box (null: none kept) */
  faceFile(id: string): string | null {
    return this.spec.faceDir && REMOTE_REF.test(id) ? path.join(this.spec.faceDir, `${id}.jpg`) : null
  }

  // the faces of the albums of people: fetched when not there or older than a week (one that does not come: the one
  // kept stays, the display shows a picture instead when there is none); those of no album any more go
  private async keepFaces(client: RemoteClient, ids: string[], signal: AbortSignal): Promise<void> {
    const dir = this.spec.faceDir
    if (!dir) return
    const wanted = new Set(ids.filter((id) => REMOTE_REF.test(id)))
    if (wanted.size && client.face) {
      await fsp.mkdir(dir, { recursive: true }).catch(() => undefined)
      for (const id of wanted) {
        if (signal.aborted) return
        const file = path.join(dir, `${id}.jpg`)
        const st = await fsp.stat(file).catch(() => null)
        if (st && Date.now() - st.mtimeMs < FACE_DAYS * 86_400_000) continue
        try {
          const r = await client.face(id, signal)
          const buf = Buffer.from(await r.arrayBuffer())
          if (!buf.length || buf.length > FACE_MAX_BYTES) continue
          await fsp.writeFile(`${file}.tmp`, buf)
          await fsp.rename(`${file}.tmp`, file)
        } catch {
          await fsp.rm(`${file}.tmp`, { force: true }).catch(() => undefined)
        }
      }
    }
    for (const name of await fsp.readdir(dir).catch(() => [] as string[])) {
      if (!wanted.has(name.replace(/\.jpg$/, ''))) await fsp.rm(path.join(dir, name), { force: true }).catch(() => undefined)
    }
  }

  /** "Verbindung trennen": every album of the service and its pictures off the box (at the service all stays) */
  async removeAll(): Promise<number> {
    this.cancel()
    const { source } = this.spec
    const gone = await update((lib) => {
      const out = lib.albums.filter((a) => a.source === source)
      lib.albums = lib.albums.filter((a) => a.source !== source)
      return out
    })
    await fsp.rm(this.spec.photoDir, { recursive: true, force: true }).catch(() => undefined)
    await fsp.rm(this.spec.liveDir, { recursive: true, force: true }).catch(() => undefined)
    if (this.spec.faceDir) await fsp.rm(this.spec.faceDir, { recursive: true, force: true }).catch(() => undefined)
    Object.assign(this.state, { lastSync: null, offlineSince: null, cacheFull: false, unauthorized: false, missing: 0, retry: false })
    await this.save()
    return gone.length
  }
}

/* ---------- live pictures ---------- */

// what a picture is by its first bytes (thumbnails of the services are WebP or JPEG)
export const typeOf = (b: Buffer): string => (b.subarray(0, 4).toString('latin1') === 'RIFF' ? 'image/webp' : b[0] === 0x89 ? 'image/png' : 'image/jpeg')

/** The pictures of a service's albums shown live: from the small cache, else from the service */
export class RemoteLive {
  private pruning = 0
  // the last time a live picture could not come from the service (0: the last one came)
  private failedAt = 0
  private lastCheck = 0

  constructor(private readonly sync: RemotePhotoSync) {}

  /**
   * The service is away for the albums shown live (the display shows them as "Gerade nicht da"): the last sync did not
   * reach it or the login was refused - or a picture asked for just now did not come.
   */
  away(): boolean {
    const s = this.sync.status()
    return !!s.offlineSince || s.unauthorized || Date.now() - this.failedAt < 2 * 60_000
  }

  /**
   * Asked again now (the display's "Nochmal", and its own questions while albums are not there): the service answers the
   * login within 5 s - it is back, the albums show again. At most every 10 s.
   */
  async checkNow(): Promise<void> {
    // (a login refused: at most every 15 minutes - the display asks every 2 minutes, and a server that counts failed
    // logins (Nextcloud's brute-force protection, fail2ban) locked the box out, also after the password was right again)
    const gap = this.sync.status().unauthorized ? 15 * 60_000 : 10_000
    if (!this.away() || Date.now() - this.lastCheck < gap) return
    this.lastCheck = Date.now()
    const client = this.sync.client()
    if (!client) return
    try {
      await client.check(AbortSignal.timeout(5000))
      this.failedAt = 0
      this.sync.reachable()
    } catch (err) {
      // still away (the login refused: kept as the sync keeps it - the 15 minutes above)
      if (remoteRefusedKey(err)) this.sync.refused()
      else this.failedAt = Date.now()
    }
  }

  /**
   * A picture of an album shown live (albums.ts sendPicture), or one kept on the box that is not there yet: the grid and
   * the background a small one, the full view a display size, "v" the clip. The service away: 404 (the display shows the
   * album as not there).
   */
  async send(req: Request, res: Response, albumRef: string, item: { ref: string; ver: string }, size: string): Promise<void> {
    const client = this.sync.client()
    if (!REMOTE_REF.test(item.ref) || !REMOTE_ALBUM_REF.test(albumRef)) return void res.status(404).end()
    // a clip: passed on as it comes, a part of it when the player asks for one (not kept - too big for the live cache)
    // (the login refused: the service is not asked for every picture - each a failed login, and a server that counts them
    // locked the box out; checkNow asks again)
    const refused = () => this.sync.status().unauthorized
    if (size === 'v') {
      if (!client?.liveClips || refused()) return void res.status(404).end()
      const stop = new AbortController()
      // (what came first: the display closing - its own abort - or the service's stream failing, which closes the answer too)
      let displayGone = false
      let sourceFailed = false
      res.on('close', () => {
        if (!sourceFailed && !res.writableFinished) displayGone = true
        stop.abort()
      })
      try {
        const range = typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined
        const r = await client.clip(albumRef, item, { signal: stop.signal, range })
        this.failedAt = 0
        this.sync.reachable()
        res.status(r.status)
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const v = r.headers.get(h)
          if (v) res.setHeader(h, v)
        }
        res.setHeader('Cache-Control', 'private, no-store')
        const source = Readable.fromWeb(r.body as import('node:stream/web').ReadableStream)
        source.once('error', () => {
          if (!displayGone) sourceFailed = true
        })
        await pipeline(source, res)
      } catch (err) {
        // (the display went away - its own abort, not the service; the service's stream failed - it is away for now)
        // (as a picture: away only when the service does not answer a short question either)
        if (remoteRefusedKey(err)) {
          this.failedAt = Date.now()
          this.sync.refused()
        } else if (!displayGone && (sourceFailed || remoteDown(err))) void this.confirmAway()
        if (!res.headersSent) res.status(404).end()
        else res.destroy()
      }
      return
    }
    const kind = size === 'f' ? 'full' : 'grid'
    const dir = this.sync.spec.liveDir
    // (the version in the name: a picture changed at the service is not shown from the cache as it was)
    const file = path.join(dir, `${item.ref}.${createHash('sha1').update(item.ver).digest('hex').slice(0, 10)}.${kind}`)
    const send = (buf: Buffer) => {
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=86400')
      res.end(buf)
    }
    try {
      const kept = await fsp.readFile(file)
      // (touched: the ones shown last stay longest)
      await fsp.utimes(file, new Date(), new Date()).catch(() => undefined)
      return send(kept)
    } catch {
      // not kept yet
    }
    if (!client || refused()) return void res.status(404).end()
    try {
      const r = await client.picture(albumRef, item, kind)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > FILE_MAX_BYTES) return void res.status(404).end()
      this.failedAt = 0
      this.sync.reachable()
      send(buf)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(`${file}.tmp`, buf)
      await fsp.rename(`${file}.tmp`, file)
      void this.prune()
    } catch (err) {
      // (the login refused: as the sync; the service not answering for this one picture - a big one over a slow line, a
      // service busy for a moment: away only when it does not answer a short question either - one slow picture made
      // every live album "Gerade nicht da" for two minutes)
      if (remoteRefusedKey(err)) {
        this.failedAt = Date.now()
        this.sync.refused()
      } else if (remoteDown(err)) void this.confirmAway()
      if (!res.headersSent) res.status(404).end()
    }
  }

  // a picture did not come: the service asked shortly (at most every 10 s) - no answer, it is away
  private confirming: Promise<void> | null = null
  private confirmAway(): Promise<void> {
    if (this.confirming) return this.confirming
    this.confirming = (async () => {
      const client = this.sync.client()
      if (!client) return
      try {
        await client.check(AbortSignal.timeout(5000))
        this.sync.reachable()
      } catch (err) {
        this.failedAt = Date.now()
        if (remoteRefusedKey(err)) this.sync.refused()
      }
    })().finally(() => {
      setTimeout(() => (this.confirming = null), 10_000).unref?.()
    })
    return this.confirming
  }

  // the live cache within its limit: the ones shown longest ago go (at most every 5 minutes)
  private async prune(): Promise<void> {
    if (Date.now() - this.pruning < 5 * 60_000) return
    this.pruning = Date.now()
    const dir = this.sync.spec.liveDir
    const names = await fsp.readdir(dir).catch(() => [] as string[])
    const files = await Promise.all(names.map(async (n) => ({ n, st: await fsp.stat(path.join(dir, n)).catch(() => null) })))
    const list = files.filter((f) => f.st?.isFile()).sort((a, b) => (b.st?.mtimeMs ?? 0) - (a.st?.mtimeMs ?? 0))
    let total = 0
    for (const f of list) {
      total += f.st?.size ?? 0
      if (total > LIVE_CACHE_BYTES) await fsp.rm(path.join(dir, f.n), { force: true }).catch(() => undefined)
    }
  }
}

// a response's body into a file, at most maxBytes (false: too big - nothing kept)
export async function streamTo(r: globalThis.Response, file: string, maxBytes: number): Promise<boolean> {
  const announced = Number(r.headers.get('content-length'))
  if (Number.isFinite(announced) && announced > maxBytes) {
    await r.body?.cancel().catch(() => undefined)
    return false
  }
  const out = await fsp.open(file, 'w')
  let n = 0
  try {
    for await (const chunk of Readable.fromWeb(r.body as import('node:stream/web').ReadableStream)) {
      n += (chunk as Buffer).length
      if (n > maxBytes) return false
      await out.write(chunk as Buffer)
    }
    return true
  } finally {
    await out.close()
    if (n > maxBytes) await fsp.rm(file, { force: true })
  }
}

/** The services' live parts, for the display's routes (albums.ts): which album is away, a check of all, a picture */
const services = new Map<string, RemotePhotoSync>()
export function registerRemote(sync: RemotePhotoSync): void {
  services.set(sync.spec.source, sync)
}
export function remoteOf(source: string): RemotePhotoSync | undefined {
  return services.get(source)
}
export async function checkRemotesNow(): Promise<void> {
  await Promise.all([...services.values()].map((s) => s.live.checkNow()))
}
