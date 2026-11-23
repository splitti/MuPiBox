// The photo display's albums of PhotoPrism (5.1, Bibliothek › Fotos › PhotoPrism): the albums of a PhotoPrism become
// albums on the display. A login of its own: the address of the PhotoPrism and an app password (Einstellungen › Konto ›
// Apps und Geräte), kept encrypted and never shown again; https with a self-signed certificate over the confirmed
// fingerprint (pinned-fetch.ts). The sync, the two ways (kept on the box, live) and the live pictures are the same as for
// every service (remote.ts). The pictures are PhotoPrism's thumbnails in a display size; a clip comes as PhotoPrism plays
// it in the browser (MP4, H.264 - made there when it is not), so clips are shown live too. Private and archived photos
// stay out, as in PhotoPrism's own album view for others.

import path from 'node:path'
import type { Request, Response, Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { CertificateError, type CertificateInfo, serviceFetch } from './pinned-fetch'
import { CACHE_LIMITS_MB, PICTURES_MAX, type RemoteClient, type RemoteItem, RemoteAway, RemotePhotoSync, RemoteRefused, registerRemote, SYNC_MINUTES, typeOf } from './remote'
import { photoSettings } from './settings'
import { albums, PHOTOPRISM_LIVE_DIR, PHOTOPRISM_PHOTO_DIR, PHOTOS_DIR, photoBytes } from './store'

export interface PhotoPhotoprismDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** the box's way to keep a secret in the config (the NAS password's) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

const ALBUMS_MAX = 100
const STATE_FILE = path.join(PHOTOS_DIR, 'photoprism-sync.json')
// PhotoPrism's ids (an album "a…", a photo "p…") and the hashes of its files
const UID = /^[a-z0-9]{16}$/
const HASH = /^[0-9a-f]{40}$/
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i
const LABEL = 'PhotoPrism'
const PAGE = 500

export interface PhotoprismSettings {
  /** switched on in the app (after the test and the choice of albums) */
  enabled: boolean
  /** the PhotoPrism: http(s)://host[:port][/path] */
  url: string
  /** the account's name as PhotoPrism shows it (from the test; only shown) */
  account: string
  /** the app password as kept (encrypted); '' none */
  password: string
  certFingerprint: string
  albumIds: string[]
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The PhotoPrism's address as the box keeps it: http(s)://host[:port][/path], no slash at the end, no page of its own.
 *  Without http(s):// in front: http at PhotoPrism's own port 2342, else https */
export function cleanPhotoprismUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let t = raw.trim()
  if (!t || t.length > 300) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null
  if (!/^https?:\/\//i.test(t)) t = `${/^[^/]*:2342(\/|$)/.test(t) ? 'http' : 'https'}://${t}`
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null
  // (an address copied from the browser: /library/... or /api/... at the end goes)
  const p = u.pathname.replace(/\/(library|api)(\/.*)?$/i, '').replace(/\/+$/, '')
  return `${u.protocol}//${u.host}${p}`
}

export function photoprismSettings(cfg: unknown): PhotoprismSettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).photoprism)
  return {
    enabled: n.enabled === true,
    url: cleanPhotoprismUrl(n.url) ?? '',
    account: typeof n.account === 'string' ? n.account.slice(0, 100) : '',
    password: typeof n.password === 'string' ? n.password : '',
    certFingerprint: typeof n.certFingerprint === 'string' && FINGERPRINT.test(n.certFingerprint) ? n.certFingerprint.toUpperCase() : '',
    albumIds: Array.isArray(n.albumIds) ? [...new Set(n.albumIds.filter((x): x is string => typeof x === 'string' && UID.test(x)))].slice(0, ALBUMS_MAX) : [],
    keepCopy: n.keepCopy !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as PhotoprismSettings['syncMinutes']) : 360,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as PhotoprismSettings['cacheLimitMb']) : 2048,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written); the password comes in plain, kept encrypted */
export function applyPhotoprismSettings(cfg: Record<string, unknown>, patch: unknown, encrypt: (plain: string) => string = (x) => x): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).photoprism) }
  const beforeUrl = cleanPhotoprismUrl(next.url)
  if (p.url !== undefined) {
    const url = cleanPhotoprismUrl(p.url)
    if (!url) return 'url'
    next.url = url
  }
  if (p.account !== undefined) {
    if (typeof p.account !== 'string' || p.account.length > 100) return 'account'
    next.account = p.account.trim()
  }
  // (the password kept belongs to the address it was given for: another one gets it only typed in anew)
  const moved = cleanPhotoprismUrl(next.url) !== beforeUrl
  if (p.password !== undefined) {
    if (typeof p.password !== 'string' || !p.password.trim() || p.password.length > 200) return 'password'
    // (trimmed as the test does: an app password pasted with a blank or a line break at its end passed the test and
    // was refused right after saving)
    next.password = encrypt(p.password.trim())
  } else if (moved && next.password) return 'password'
  if (p.certFingerprint !== undefined) {
    if (typeof p.certFingerprint !== 'string' || (p.certFingerprint !== '' && !FINGERPRINT.test(p.certFingerprint))) return 'certFingerprint'
    next.certFingerprint = p.certFingerprint.toUpperCase()
  } else if (moved) next.certFingerprint = ''
  if (p.enabled !== undefined) {
    if (typeof p.enabled !== 'boolean') return 'enabled'
    next.enabled = p.enabled
  }
  if (p.albumIds !== undefined) {
    if (!Array.isArray(p.albumIds) || p.albumIds.length > ALBUMS_MAX || !p.albumIds.every((x) => typeof x === 'string' && UID.test(x))) return 'albumIds'
    next.albumIds = [...new Set(p.albumIds as string[])]
  }
  if (p.keepCopy !== undefined) {
    if (typeof p.keepCopy !== 'boolean') return 'keepCopy'
    next.keepCopy = p.keepCopy
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
  photos.sources = { ...obj(photos.sources), photoprism: next }
  cfg.photos = photos
  return null
}

/* ---------- talking to PhotoPrism ---------- */

export interface PhotoprismTarget {
  url: string
  password: string
  fingerprint?: string
}

interface PpAlbum {
  UID: string
  Title: string
  PhotoCount: number
  /** the hash of its cover picture */
  Thumb: string
}

interface PpFile {
  Hash?: string
  Video?: boolean
  Primary?: boolean
  Codec?: string
  Duration?: number
}

interface PpPhoto {
  UID?: string
  Type?: string
  Hash?: string
  Width?: number
  Height?: number
  TakenAtLocal?: string
  Duration?: number
  EditedAt?: string | null
  Files?: PpFile[]
}

/** What a picture's version holds: the hash of its picture, and a clip's video after a dot (both PhotoPrism's) */
export function photoprismVer(p: PpPhoto): { kind: 'photo' | 'video'; ver: string } | null {
  if (!HASH.test(p.Hash ?? '')) return null
  if (p.Type !== 'video') return { kind: 'photo', ver: p.Hash as string }
  const files = p.Files ?? []
  const video = files.find((f) => f.Video && f.Codec === 'avc1') ?? files.find((f) => f.Video)
  return video && HASH.test(video.Hash ?? '') ? { kind: 'video', ver: `${p.Hash}.${video.Hash}` } : null
}

// the token for thumbnails and videos (in their address), per address and password, read again after ten minutes
let previewCache: { key: string; at: number; token: string } | null = null

export class PhotoprismClient implements RemoteClient {
  /** PhotoPrism plays a clip as MP4 (H.264) in the browser: the display does as well */
  readonly liveClips = true

  constructor(readonly target: PhotoprismTarget) {}

  private get key(): string {
    return `${this.target.url}\n${this.target.password}`
  }

  /** A request to the PhotoPrism (with the app password unless bare); RemoteRefused for an answer that is no success, RemoteAway when it does not answer */
  async request(p: string, init: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number; bare?: boolean } = {}): Promise<globalThis.Response> {
    const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(init.timeoutMs ?? 30_000)])
    const r = await serviceFetch(
      new URL(`${this.target.url}${p}`),
      this.target.fingerprint,
      { method: 'GET', headers: { ...(init.bare ? {} : { Authorization: `Bearer ${this.target.password}` }), ...init.headers }, signal },
      LABEL,
      init.signal,
    )
    if (!r.ok && r.status !== 206) {
      await r.body?.cancel().catch(() => undefined)
      throw new RemoteRefused(r.status, LABEL)
    }
    return r
  }

  private async json<T>(p: string, signal?: AbortSignal): Promise<T> {
    const r = await this.request(p, { signal, headers: { Accept: 'application/json' } })
    return (await r.json().catch((err: Error) => {
      if (signal?.aborted) throw err
      throw new RemoteAway(`${LABEL}: ${err.message}`)
    })) as T
  }

  /** The account's name, and that the app password is taken */
  async user(signal?: AbortSignal): Promise<string | null> {
    const s = await this.json<{ user?: { DisplayName?: string; Name?: string } }>('/api/v1/session', signal)
    const name = s?.user?.DisplayName || s?.user?.Name
    return typeof name === 'string' && name ? name.slice(0, 100) : null
  }

  /** The token thumbnails and videos are asked for with */
  async previewToken(signal?: AbortSignal, fresh = false): Promise<string> {
    if (!fresh && previewCache?.key === this.key && Date.now() - previewCache.at < 10 * 60_000) return previewCache.token
    const c = await this.json<{ previewToken?: string }>('/api/v1/config', signal)
    if (!TOKEN.test(c?.previewToken ?? '')) throw new RemoteAway(`${LABEL}: no preview token`)
    previewCache = { key: this.key, at: Date.now(), token: c.previewToken as string }
    return previewCache.token
  }

  /** A thumbnail or a video by its address with the preview token; a token renewed in PhotoPrism: read again once */
  private async preview(make: (token: string) => string, init: { signal?: AbortSignal; range?: string; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    const ask = async (fresh: boolean) => {
      const r = await this.request(make(await this.previewToken(init.signal, fresh)), { signal: init.signal, timeoutMs: init.timeoutMs, headers: init.range ? { Range: init.range } : {}, bare: true })
      // (an original PhotoPrism cannot read - its storage not mounted: it answers 200 with an icon in SVG or a text, which
      // was kept as the picture and never fetched again; this one picture is left out - a sync goes on with the others)
      if (/svg|text|html/i.test(r.headers.get('content-type') ?? '')) {
        await r.body?.cancel().catch(() => undefined)
        throw new RemoteRefused(404, LABEL)
      }
      return r
    }
    try {
      return await ask(false)
    } catch (err) {
      if (!(err instanceof RemoteRefused && (err.status === 401 || err.status === 403))) throw err
      return ask(true)
    }
  }

  /** The albums (not folders, moments or months), by their name */
  async albums(signal?: AbortSignal): Promise<PpAlbum[]> {
    const out: PpAlbum[] = []
    for (let offset = 0; out.length < 1000; offset += PAGE) {
      const page = await this.json<PpAlbum[]>(`/api/v1/albums?count=${PAGE}&offset=${offset}&type=album&order=name`, signal)
      if (!Array.isArray(page)) throw new RemoteAway(`${LABEL}: no albums`)
      out.push(...page.filter((a) => UID.test(a?.UID ?? '')))
      if (page.length < PAGE) break
    }
    return out
  }

  async album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    if (!UID.test(ref)) throw new RemoteRefused(404, LABEL)
    // (gone: 404 - a search for its pictures would only come back empty)
    const a = await this.json<PpAlbum>(`/api/v1/albums/${ref}`, signal)
    const items: RemoteItem[] = []
    for (let offset = 0; items.length < PICTURES_MAX; offset += PAGE) {
      const page = await this.json<PpPhoto[]>(`/api/v1/photos?count=${PAGE}&offset=${offset}&s=${ref}&merged=true&public=true`, signal)
      if (!Array.isArray(page)) throw new RemoteAway(`${LABEL}: no photos`)
      for (const p of page) {
        const v = photoprismVer(p)
        if (!v || !UID.test(p.UID ?? '') || (v.kind === 'video' && !videos)) continue
        const taken = typeof p.TakenAtLocal === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(p.TakenAtLocal) && !p.TakenAtLocal.startsWith('0001') ? p.TakenAtLocal.slice(0, 19) : null
        items.push({
          ref: p.UID as string,
          kind: v.kind,
          ver: v.ver,
          w: Number(p.Width) || 0,
          h: Number(p.Height) || 0,
          taken,
          // (nanoseconds)
          duration: v.kind === 'video' ? Math.round((Number(p.Duration) || 0) / 1e9) : 0,
        })
      }
      if (page.length < PAGE) break
    }
    return { name: typeof a?.Title === 'string' && a.Title ? a.Title : ref, items }
  }

  /** A picture: PhotoPrism's thumbnail, 1280 px for the full view and the box, 500 for the grid */
  picture(_albumRef: string, item: { ref: string; ver: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response> {
    const hash = item.ver.split('.')[0]
    if (!HASH.test(hash)) throw new RemoteRefused(404, LABEL)
    return this.preview((token) => `/api/v1/t/${hash}/${token}/${size === 'full' ? 'fit_1280' : 'tile_500'}`, { signal })
  }

  /** A clip as PhotoPrism plays it (MP4, H.264; range a part of it) */
  clip(_albumRef: string, item: { ref: string; ver: string }, init: { signal?: AbortSignal; range?: string; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    const hash = item.ver.split('.')[1] ?? ''
    if (!HASH.test(hash)) throw new RemoteRefused(404, LABEL)
    return this.preview((token) => `/api/v1/videos/${hash}/${token}/avc`, { ...init, timeoutMs: init.timeoutMs ?? 30 * 60_000 })
  }

  async albumThumb(hash: string, signal?: AbortSignal): Promise<globalThis.Response> {
    if (!HASH.test(hash)) throw new RemoteRefused(404, LABEL)
    return this.preview((token) => `/api/v1/t/${hash}/${token}/tile_224`, { signal })
  }

  /** Whether the PhotoPrism is back: the albums with the login */
  async check(signal: AbortSignal): Promise<void> {
    await this.json<unknown>('/api/v1/albums?count=1&type=album', signal)
  }
}

export type PhotoprismTest =
  | { ok: true; account: string | null; albums: number; pictures: number }
  | { ok: false; error: 'unauthorized' | 'notPhotoprism' | 'unreachable' }
  | { ok: false; error: 'certificate'; certificate: CertificateInfo | null }

/** The test of the assistant: the certificate, the app password and the albums */
export async function testPhotoprism(target: PhotoprismTarget): Promise<PhotoprismTest> {
  try {
    const client = new PhotoprismClient(target)
    const account = await client.user(AbortSignal.timeout(20_000))
    const list = await client.albums(AbortSignal.timeout(20_000))
    await client.previewToken(AbortSignal.timeout(20_000), true)
    return { ok: true, account, albums: list.length, pictures: list.reduce((n, a) => n + (Number(a.PhotoCount) || 0), 0) }
  } catch (err) {
    if (err instanceof CertificateError) return { ok: false, error: 'certificate', certificate: err.certificate ?? null }
    if (err instanceof RemoteRefused && (err.status === 401 || err.status === 403)) return { ok: false, error: 'unauthorized' }
    // (an answer, but not PhotoPrism's: another address, or a page in front of it)
    if (err instanceof RemoteRefused && (err.status === 404 || err.status === 405)) return { ok: false, error: 'notPhotoprism' }
    if (err instanceof RemoteAway && /no (albums|user|preview)|JSON|Unexpected token/i.test(err.message)) return { ok: false, error: 'notPhotoprism' }
    return { ok: false, error: 'unreachable' }
  }
}

/* ---------- the app's side ---------- */

/** The login as kept; null: none, or its password cannot be read on this box */
function keptTarget(deps: PhotoPhotoprismDeps, cfg: MupiboxConfig | undefined): PhotoprismTarget | null {
  const s = photoprismSettings(cfg)
  if (!s.url || !s.password) return null
  const password = deps.secret ? deps.secret.decrypt(s.password) : s.password
  return password ? { url: s.url, password, fingerprint: s.certFingerprint || undefined } : null
}

function photoprismClient(deps: PhotoPhotoprismDeps, cfg: MupiboxConfig | undefined): PhotoprismClient | null {
  const target = photoprismSettings(cfg).enabled ? keptTarget(deps, cfg) : null
  return target ? new PhotoprismClient(target) : null
}

/**
 *   GET  /api/app/photos/photoprism            the settings (the password only as "set"), the sync's state, albums, cache
 *   POST /api/app/photos/photoprism/test       {url, password?, fingerprint?} - the assistant's test
 *   GET  /api/app/photos/photoprism/albums     the albums (to tick) with their numbers
 *   GET  /api/app/photos/photoprism/thumb/:h   an album's picture for that list (through the box)
 *   POST /api/app/photos/photoprism            {url?, account?, password?, certFingerprint?, enabled?, albumIds?, keepCopy?, syncMinutes?, cacheLimitMb?}
 *   POST /api/app/photos/photoprism/sync       a sync now
 *   POST /api/app/photos/photoprism/remove     off: the login, the albums and their pictures off the box
 */
export function registerPhotoPhotoprismRoutes(router: Router, deps: PhotoPhotoprismDeps): RemotePhotoSync {
  const ready = (s: PhotoprismSettings) => s.enabled && !!s.url && !!s.password
  const sync = new RemotePhotoSync(
    {
      source: 'photoprism',
      label: LABEL,
      stateFile: STATE_FILE,
      photoDir: PHOTOPRISM_PHOTO_DIR,
      liveDir: PHOTOPRISM_LIVE_DIR,
      settings: (cfg) => {
        const s = photoprismSettings(cfg)
        return { set: ready(s), albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb }
      },
      client: (cfg) => photoprismClient(deps, cfg),
      unreadable: 'the app password cannot be read on this box, the pictures stay - enter it again in the app',
    },
    deps.getMupiboxConfig,
  )
  registerRemote(sync)
  sync.start()

  const answer = async () => {
    const s = photoprismSettings(deps.getMupiboxConfig())
    const list = (await albums()).filter((a) => a.source === 'photoprism')
    return {
      settings: { enabled: s.enabled, url: s.url, account: s.account, hasPassword: !!s.password, certFingerprint: s.certFingerprint, albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb },
      connected: ready(s),
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: (await photoBytes(PHOTOPRISM_PHOTO_DIR)) + (await photoBytes(PHOTOPRISM_LIVE_DIR)),
    }
  }
  // (the album list and its pictures before it is switched on: with the login as kept)
  const tryClient = () => {
    const target = keptTarget(deps, deps.getMupiboxConfig())
    return target ? new PhotoprismClient(target) : null
  }

  router.get('/photos/photoprism', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  // the test: without a password the one kept, only for the address it was given for; a fingerprint: the certificate
  // confirmed in the app
  router.post('/photos/photoprism/test', requireSession, requireCsrf, async (req, res) => {
    const b = obj(req.body)
    const url = cleanPhotoprismUrl(b.url)
    if (!url) return void res.status(400).json({ error: 'url' })
    const kept = photoprismSettings(deps.getMupiboxConfig())
    let password = typeof b.password === 'string' ? b.password.trim() : ''
    if (password.length > 200) return void res.status(400).json({ error: 'password' })
    if (!password) {
      const plain = kept.password ? (deps.secret ? (deps.secret.decrypt(kept.password) ?? '') : kept.password) : ''
      if (!plain || kept.url !== url) return void res.status(400).json({ error: 'password' })
      password = plain
    }
    const fingerprint = typeof b.fingerprint === 'string' && FINGERPRINT.test(b.fingerprint) ? b.fingerprint.toUpperCase() : undefined
    // (the certificate confirmed before, for the same address)
    const pin = fingerprint ?? (kept.url === url && kept.certFingerprint ? kept.certFingerprint : undefined)
    const result = await testPhotoprism({ url, password, fingerprint: pin })
    res.json(result.ok ? { ...result, fingerprint: pin ?? '' } : result)
  })

  router.get('/photos/photoprism/albums', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = tryClient()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    try {
      const list = await client.albums(AbortSignal.timeout(20_000))
      res.json({
        albums: list
          .map((a) => ({ id: a.UID, name: typeof a.Title === 'string' && a.Title ? a.Title : a.UID, count: Number(a.PhotoCount) || 0, thumb: HASH.test(a.Thumb ?? '') ? a.Thumb : null }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      })
    } catch (err) {
      const refused = err instanceof RemoteRefused && (err.status === 401 || err.status === 403)
      res.status(refused ? 401 : 502).json({ error: refused ? 'unauthorized' : 'unreachable' })
    }
  })

  router.get('/photos/photoprism/thumb/:hash', requireSession, async (req: Request, res: Response) => {
    const client = tryClient()
    const hash = String(req.params.hash)
    if (!client || !HASH.test(hash)) return void res.status(404).end()
    try {
      const r = await client.albumThumb(hash)
      const buf = Buffer.from(await r.arrayBuffer())
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buf)
    } catch {
      res.status(404).end()
    }
  })

  router.post('/photos/photoprism', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    const before = photoprismSettings(deps.getMupiboxConfig())
    try {
      await deps.updateMupiboxConfig((cfg) => {
        error = applyPhotoprismSettings(cfg, req.body, deps.secret ? (x) => deps.secret!.encrypt(x) : undefined)
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    const after = photoprismSettings(deps.getMupiboxConfig())
    // (switched on, albums, the way they are kept or the login changed: a sync takes it over at once)
    if (
      ready(after) &&
      (!before.enabled ||
        before.keepCopy !== after.keepCopy ||
        before.url !== after.url ||
        before.password !== after.password ||
        before.certFingerprint !== after.certFingerprint ||
        before.albumIds.join() !== after.albumIds.join())
    )
      void sync.run()
    res.json(await answer())
  })

  // the running sync stopped: what came so far stays, the next one at its time
  router.post('/photos/photoprism/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/photoprism/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/photoprism/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const photos = { ...obj(cfg.photos) }
        const sources = { ...obj(photos.sources) }
        delete sources.photoprism
        photos.sources = sources
        cfg.photos = photos
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    const removed = await sync.removeAll()
    res.json({ ...(await answer()), removed })
  })

  return sync
}
