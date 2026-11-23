// The photo display's albums of Nextcloud (5.1, Bibliothek › Fotos › Nextcloud): the albums of the Nextcloud app "Fotos"
// (Photos) of an account - its own and the ones shared with it - become albums on the display. A login of its own: the
// address of the Nextcloud, the user name and an app password (Persönliche Einstellungen › Sicherheit), kept encrypted and
// never shown again; https with a self-signed certificate over the confirmed fingerprint (pinned-fetch.ts). The sync, the
// two ways (kept on the box, live) and the live pictures are the same as for every service (remote.ts). The pictures are
// the Photos app's previews in a display size; a picture Nextcloud makes no preview of (an iPhone photo without HEIC
// previews there) is kept on the box from its original and left out live. A clip comes as it was uploaded (HEVC from a
// phone, say) and is made on the box (video.ts) - so live albums show no clips.

import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Request, Response, Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { CertificateError, type CertificateInfo, serviceFetch } from './pinned-fetch'
import { CACHE_LIMITS_MB, type RemoteClient, type RemoteItem, RemoteAway, RemotePhotoSync, RemoteRefused, registerRemote, SYNC_MINUTES, typeOf } from './remote'
import { photoSettings } from './settings'
import { albums, NEXTCLOUD_LIVE_DIR, NEXTCLOUD_PHOTO_DIR, PHOTOS_DIR, photoBytes } from './store'

export interface PhotoNextcloudDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** the box's way to keep a secret in the config (the NAS password's) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

const ALBUMS_MAX = 100
const STATE_FILE = path.join(PHOTOS_DIR, 'nextcloud-sync.json')
// an album as the box keeps it: a hash of where it is ("albums/<name>" or "sharedalbums/<name> (<owner>)")
const ALBUM_ID = /^[0-9a-f]{40}$/
const FILE_ID = /^\d{1,15}$/
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i
const LABEL = 'Nextcloud'

export interface NextcloudSettings {
  /** switched on in the app (after the test and the choice of albums) */
  enabled: boolean
  /** the Nextcloud: https://host[:port][/path] */
  url: string
  /** the login name, and the user's id the Photos app's paths take (from the test) */
  account: string
  userId: string
  /** the app password as kept (encrypted); '' none */
  password: string
  certFingerprint: string
  albumIds: string[]
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The Nextcloud's address as the box keeps it: http(s)://host[:port][/path], no slash at the end, no index.php */
export function cleanNextcloudUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let t = raw.trim()
  if (!t || t.length > 300) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null
  // (an address copied from the browser: /index.php/apps/... or /apps/... at the end goes)
  const p = u.pathname.replace(/\/(index\.php)(\/.*)?$/i, '').replace(/\/apps\/.*$/i, '').replace(/\/+$/, '')
  return `${u.protocol}//${u.host}${p}`
}

export function nextcloudSettings(cfg: unknown): NextcloudSettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).nextcloud)
  return {
    enabled: n.enabled === true,
    url: cleanNextcloudUrl(n.url) ?? '',
    account: typeof n.account === 'string' ? n.account.slice(0, 100) : '',
    userId: typeof n.userId === 'string' ? n.userId.slice(0, 100) : '',
    password: typeof n.password === 'string' ? n.password : '',
    certFingerprint: typeof n.certFingerprint === 'string' && FINGERPRINT.test(n.certFingerprint) ? n.certFingerprint.toUpperCase() : '',
    albumIds: Array.isArray(n.albumIds) ? [...new Set(n.albumIds.filter((x): x is string => typeof x === 'string' && ALBUM_ID.test(x)))].slice(0, ALBUMS_MAX) : [],
    keepCopy: n.keepCopy !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as NextcloudSettings['syncMinutes']) : 360,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as NextcloudSettings['cacheLimitMb']) : 2048,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written); the password comes in plain, kept encrypted */
export function applyNextcloudSettings(cfg: Record<string, unknown>, patch: unknown, encrypt: (plain: string) => string = (x) => x): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).nextcloud) }
  const before = { url: cleanNextcloudUrl(next.url), account: next.account }
  if (p.url !== undefined) {
    const url = cleanNextcloudUrl(p.url)
    if (!url) return 'url'
    next.url = url
  }
  if (p.account !== undefined) {
    if (typeof p.account !== 'string' || !p.account.trim() || p.account.length > 100) return 'account'
    next.account = p.account.trim()
  }
  if (p.userId !== undefined) {
    if (typeof p.userId !== 'string' || !p.userId || p.userId.length > 100 || /[/\\]/.test(p.userId)) return 'userId'
    next.userId = p.userId
  }
  // (the password kept belongs to the address and the account it was given for: another one gets it only typed in anew)
  const moved = cleanNextcloudUrl(next.url) !== before.url || next.account !== before.account
  if (p.password !== undefined) {
    if (typeof p.password !== 'string' || !p.password || p.password.length > 200) return 'password'
    next.password = encrypt(p.password)
  } else if (moved && next.password) return 'password'
  if (p.certFingerprint !== undefined) {
    if (typeof p.certFingerprint !== 'string' || (p.certFingerprint !== '' && !FINGERPRINT.test(p.certFingerprint))) return 'certFingerprint'
    next.certFingerprint = p.certFingerprint.toUpperCase()
  } else if (cleanNextcloudUrl(next.url) !== before.url) next.certFingerprint = ''
  if (p.enabled !== undefined) {
    if (typeof p.enabled !== 'boolean') return 'enabled'
    next.enabled = p.enabled
  }
  if (p.albumIds !== undefined) {
    if (!Array.isArray(p.albumIds) || p.albumIds.length > ALBUMS_MAX || !p.albumIds.every((x) => typeof x === 'string' && ALBUM_ID.test(x))) return 'albumIds'
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
  photos.sources = { ...obj(photos.sources), nextcloud: next }
  cfg.photos = photos
  return null
}

/* ---------- talking to Nextcloud ---------- */

export interface NextcloudTarget {
  url: string
  account: string
  password: string
  /** the user's id in the paths of the Photos app ('' : not known yet - asked for) */
  userId: string
  fingerprint?: string
}

interface NcAlbum {
  /** its key at the box (ALBUM_ID) */
  id: string
  /** "albums/<name>/" or "sharedalbums/<name> (<owner>)/" below the user's photos */
  path: string
  name: string
  shared: boolean
  count: number
  /** the file id of its last photo (its picture in the app's list) */
  lastPhoto: string | null
}

const albumKey = (path: string): string => createHash('sha1').update(path).digest('hex')

// the WebDAV answer of a PROPFIND as responses: href and the properties of the ones found (by their local name)
const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unxml = (s: string): string => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(Number.parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10)) : (XML_ENTITIES[e] ?? m)))
export function parseMultistatus(xml: string): Array<{ href: string; props: Record<string, string> }> {
  const out: Array<{ href: string; props: Record<string, string> }> = []
  for (const block of xml.split(/<[a-z0-9]+:response[\s>]/i).slice(1)) {
    const href = /<[a-z0-9]+:href>([^<]*)<\/[a-z0-9]+:href>/i.exec(block)?.[1]
    if (!href) continue
    const props: Record<string, string> = {}
    // (only the properties found: a propstat with 200)
    for (const stat of block.split(/<[a-z0-9]+:propstat[\s>]/i).slice(1)) {
      if (!/<[a-z0-9]+:status>[^<]*\s200\s/i.test(stat)) continue
      const inner = /<[a-z0-9]+:prop>([\s\S]*?)<\/[a-z0-9]+:prop>/i.exec(stat)?.[1] ?? ''
      for (const m of inner.matchAll(/<([a-z0-9]+):([a-z0-9_-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1:\2>/gi)) {
        props[m[2]] = m[3].includes('<') ? m[3] : unxml(m[3])
      }
    }
    out.push({ href: unxml(href), props })
  }
  return out
}

const ALBUM_PROPS = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><nc:nbItems/><nc:last-photo/></d:prop></d:propfind>`
const FILE_PROPS = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><oc:fileid/><d:getetag/><d:getcontenttype/><d:getlastmodified/><nc:has-preview/><nc:metadata-photos-size/><nc:metadata-photos-original_date_time/><nc:metadata-files-live-photo/></d:prop></d:propfind>`

// the albums of a minute ago, per address and account; the files of an album seen last (for a picture's original)
let albumCache: { at: number; key: string; list: Map<string, NcAlbum> } | null = null
const fileHrefs = new Map<string, string>()

export class NextcloudClient implements RemoteClient {
  /** a clip comes as it was uploaded: the display cannot play every one as it comes - live albums show no clips */
  readonly liveClips = false

  constructor(readonly target: NextcloudTarget) {}

  private get key(): string {
    return `${this.target.url}\n${this.target.account}`
  }

  private auth(): string {
    return `Basic ${Buffer.from(`${this.target.account}:${this.target.password}`, 'utf8').toString('base64')}`
  }

  /** A request to the Nextcloud with the login; RemoteRefused for an answer that is no success, RemoteAway when it does not answer */
  async request(p: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(init.timeoutMs ?? 30_000)])
    const r = await serviceFetch(
      new URL(`${this.target.url}${p}`),
      this.target.fingerprint,
      { method: init.method ?? 'GET', headers: { Authorization: this.auth(), 'OCS-APIRequest': 'true', ...init.headers }, body: init.body, signal },
      LABEL,
      init.signal,
    )
    if (!r.ok && r.status !== 207 && r.status !== 206) {
      await r.body?.cancel().catch(() => undefined)
      throw new RemoteRefused(r.status, LABEL)
    }
    return r
  }

  private async propfind(p: string, body: string, signal?: AbortSignal): Promise<Array<{ href: string; props: Record<string, string> }>> {
    const r = await this.request(p, { method: 'PROPFIND', headers: { Depth: '1', 'Content-Type': 'application/xml' }, body, signal })
    const text = await r.text().catch((err: Error) => {
      if (signal?.aborted) throw err
      throw new RemoteAway(`${LABEL}: ${err.message}`)
    })
    return parseMultistatus(text)
  }

  /** The account: its id (for the paths of the Photos app) and the name it shows */
  async user(signal?: AbortSignal): Promise<{ id: string; name: string | null }> {
    const r = await this.request('/ocs/v2.php/cloud/user?format=json', { signal })
    const j = (await r.json().catch(() => null)) as { ocs?: { data?: { id?: string; displayname?: string } } } | null
    const id = j?.ocs?.data?.id
    if (typeof id !== 'string' || !id) throw new RemoteAway(`${LABEL}: no user`)
    return { id, name: typeof j?.ocs?.data?.displayname === 'string' ? j.ocs.data.displayname : null }
  }

  private photosBase(): string {
    return `/remote.php/dav/photos/${encodeURIComponent(this.target.userId)}/`
  }

  /** Every album of the Photos app the account sees: its own and the ones shared with it (each once) */
  async albums(signal?: AbortSignal, fresh = false): Promise<Map<string, NcAlbum>> {
    if (!fresh && albumCache && albumCache.key === this.key && Date.now() - albumCache.at < 60_000) return albumCache.list
    const list = new Map<string, NcAlbum>()
    for (const kind of ['albums', 'sharedalbums'] as const) {
      let found: Array<{ href: string; props: Record<string, string> }>
      try {
        found = await this.propfind(`${this.photosBase()}${kind}/`, ALBUM_PROPS, signal)
      } catch (err) {
        // (no shared albums at an older Nextcloud: only the own ones)
        if (kind === 'sharedalbums' && err instanceof RemoteRefused && err.status === 404) continue
        throw err
      }
      for (const { href, props } of found) {
        const m = new RegExp(`/${kind}/([^/]+)/$`).exec(href)
        if (!m) continue
        const name = decodeURIComponent(m[1])
        const path = `${kind}/${m[1]}/`
        const lastPhoto = FILE_ID.test(props['last-photo'] ?? '') && props['last-photo'] !== '-1' ? props['last-photo'] : null
        const album = { id: albumKey(path), path, name, shared: kind === 'sharedalbums', count: Number(props.nbItems) || 0, lastPhoto }
        if (!list.has(album.id)) list.set(album.id, album)
      }
    }
    albumCache = { at: Date.now(), key: this.key, list }
    return list
  }

  private async albumOf(ref: string, signal?: AbortSignal): Promise<NcAlbum> {
    let a = (await this.albums(signal)).get(ref)
    // (not in the list of a minute ago: asked again - an album made or shared just now)
    if (!a) a = (await this.albums(signal, true)).get(ref)
    if (!a) throw new RemoteRefused(404, LABEL)
    return a
  }

  async album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    if (!ALBUM_ID.test(ref)) throw new RemoteRefused(404, LABEL)
    const a = await this.albumOf(ref, signal)
    const items: RemoteItem[] = []
    for (const { href, props } of await this.propfind(`${this.photosBase()}${a.path}`, FILE_PROPS, signal)) {
      const id = props.fileid
      if (!FILE_ID.test(id ?? '')) continue
      const type = String(props.getcontenttype ?? '')
      const clip = type.startsWith('video/')
      if (!clip && !type.startsWith('image/')) continue
      // (the movie of a live photo: its still is the picture)
      if (clip && (!videos || props['metadata-files-live-photo'])) continue
      fileHrefs.set(id, href)
      const size = props['metadata-photos-size'] ?? ''
      // (width and height inside, with or without a namespace)
      const w = Number(/<(?:[a-z0-9]+:)?width>(\d+)</i.exec(size)?.[1]) || 0
      const h = Number(/<(?:[a-z0-9]+:)?height>(\d+)</i.exec(size)?.[1]) || 0
      const t = Number(props['metadata-photos-original_date_time'])
      const modified = Date.parse(props.getlastmodified ?? '')
      const when = Number.isFinite(t) && t > 0 ? t * 1000 : modified
      items.push({
        ref: id,
        kind: clip ? 'video' : 'photo',
        ver: String(props.getetag ?? '').replace(/"/g, '') || String(modified || ''),
        w,
        h,
        taken: Number.isFinite(when) && when > 0 ? new Date(when).toISOString().slice(0, 19) : null,
        duration: 0,
        ...(clip || props['has-preview'] === 'true' ? {} : { liveOk: false }),
      })
    }
    return { name: a.name, items }
  }

  /** A picture: the Photos app's preview (about 1280 px for the full view and the box, 256 for the grid); none: the original */
  async picture(albumRef: string, item: { ref: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response> {
    if (!FILE_ID.test(item.ref)) throw new RemoteRefused(404, LABEL)
    const px = size === 'full' ? 1280 : 256
    try {
      return await this.request(`/index.php/apps/photos/api/v1/preview/${item.ref}?x=${px}&y=${px}`, { signal })
    } catch (err) {
      // (no preview: a picture Nextcloud cannot make one of - its original, made on the box)
      if (!(err instanceof RemoteRefused && err.status === 404)) throw err
      return this.original(albumRef, item.ref, signal)
    }
  }

  /** A clip as it was uploaded (made on the box) */
  clip(albumRef: string, item: { ref: string }, init: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    return this.original(albumRef, item.ref, init.signal, init.timeoutMs ?? 30 * 60_000)
  }

  private async original(albumRef: string, fileId: string, signal?: AbortSignal, timeoutMs?: number): Promise<globalThis.Response> {
    let href = fileHrefs.get(fileId)
    if (!href) {
      // (not seen since the server started: the album is read again)
      await this.album(albumRef, signal ?? AbortSignal.timeout(30_000), true)
      href = fileHrefs.get(fileId)
    }
    if (!href || !href.startsWith(new URL(`${this.target.url}/`).pathname)) throw new RemoteRefused(404, LABEL)
    return this.request(href.slice(new URL(`${this.target.url}/`).pathname.length - 1), { signal, timeoutMs })
  }

  /** Whether the Nextcloud is back: the albums with the login */
  async check(signal: AbortSignal): Promise<void> {
    await this.albums(signal, true)
  }
}

export type NextcloudTest =
  | { ok: true; account: string | null; userId: string; albums: number; shared: number; pictures: number }
  | { ok: false; error: 'unauthorized' | 'noPhotos' | 'unreachable' }
  | { ok: false; error: 'certificate'; certificate: CertificateInfo | null }

/** The test of the assistant: the certificate, the login, the Photos app and the account's albums */
export async function testNextcloud(target: Omit<NextcloudTarget, 'userId'>): Promise<NextcloudTest> {
  try {
    const probe = new NextcloudClient({ ...target, userId: '' })
    const user = await probe.user(AbortSignal.timeout(20_000))
    const list = await new NextcloudClient({ ...target, userId: user.id }).albums(AbortSignal.timeout(20_000), true)
    const all = [...list.values()]
    return { ok: true, account: user.name ?? target.account, userId: user.id, albums: all.length, shared: all.filter((a) => a.shared).length, pictures: all.reduce((n, a) => n + a.count, 0) }
  } catch (err) {
    if (err instanceof CertificateError) return { ok: false, error: 'certificate', certificate: err.certificate ?? null }
    if (err instanceof RemoteRefused && err.status === 401) return { ok: false, error: 'unauthorized' }
    // (the Photos app is off or missing: its paths are not there)
    if (err instanceof RemoteRefused && (err.status === 404 || err.status === 405)) return { ok: false, error: 'noPhotos' }
    return { ok: false, error: 'unreachable' }
  }
}

/* ---------- the app's side ---------- */

/** The login as kept; null: none, or its password cannot be read on this box */
function keptTarget(deps: PhotoNextcloudDeps, cfg: MupiboxConfig | undefined): NextcloudTarget | null {
  const s = nextcloudSettings(cfg)
  if (!s.url || !s.account || !s.password || !s.userId) return null
  const password = deps.secret ? deps.secret.decrypt(s.password) : s.password
  return password ? { url: s.url, account: s.account, password, userId: s.userId, fingerprint: s.certFingerprint || undefined } : null
}

function nextcloudClient(deps: PhotoNextcloudDeps, cfg: MupiboxConfig | undefined): NextcloudClient | null {
  const target = nextcloudSettings(cfg).enabled ? keptTarget(deps, cfg) : null
  return target ? new NextcloudClient(target) : null
}

/**
 *   GET  /api/app/photos/nextcloud            the settings (the password only as "set"), the sync's state, albums, cache
 *   POST /api/app/photos/nextcloud/test       {url, account, password?, fingerprint?} - the assistant's test
 *   GET  /api/app/photos/nextcloud/albums     the albums the account sees (to tick) with their numbers
 *   GET  /api/app/photos/nextcloud/thumb/:id  an album's picture for that list (through the box)
 *   POST /api/app/photos/nextcloud            {url?, account?, userId?, password?, certFingerprint?, enabled?, albumIds?, keepCopy?, syncMinutes?, cacheLimitMb?}
 *   POST /api/app/photos/nextcloud/sync       a sync now
 *   POST /api/app/photos/nextcloud/remove     off: the login, the albums and their pictures off the box
 */
export function registerPhotoNextcloudRoutes(router: Router, deps: PhotoNextcloudDeps): RemotePhotoSync {
  const ready = (s: NextcloudSettings) => s.enabled && !!s.url && !!s.account && !!s.password && !!s.userId
  const sync = new RemotePhotoSync(
    {
      source: 'nextcloud',
      label: LABEL,
      stateFile: STATE_FILE,
      photoDir: NEXTCLOUD_PHOTO_DIR,
      liveDir: NEXTCLOUD_LIVE_DIR,
      settings: (cfg) => {
        const s = nextcloudSettings(cfg)
        return { set: ready(s), albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb }
      },
      client: (cfg) => nextcloudClient(deps, cfg),
      unreadable: 'the app password cannot be read on this box, the pictures stay - enter it again in the app',
    },
    deps.getMupiboxConfig,
  )
  registerRemote(sync)
  sync.start()

  const answer = async () => {
    const s = nextcloudSettings(deps.getMupiboxConfig())
    const list = (await albums()).filter((a) => a.source === 'nextcloud')
    return {
      settings: { enabled: s.enabled, url: s.url, account: s.account, hasPassword: !!s.password, certFingerprint: s.certFingerprint, albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb },
      connected: ready(s),
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: (await photoBytes(NEXTCLOUD_PHOTO_DIR)) + (await photoBytes(NEXTCLOUD_LIVE_DIR)),
    }
  }
  // (the album list and its pictures before it is switched on: with the login as kept)
  const tryClient = () => {
    const target = keptTarget(deps, deps.getMupiboxConfig())
    return target ? new NextcloudClient(target) : null
  }

  router.get('/photos/nextcloud', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  // the test: without a password the one kept, only for the address and the account it was given for; a fingerprint: the
  // certificate confirmed in the app
  router.post('/photos/nextcloud/test', requireSession, requireCsrf, async (req, res) => {
    const b = obj(req.body)
    const url = cleanNextcloudUrl(b.url)
    if (!url) return void res.status(400).json({ error: 'url' })
    const account = typeof b.account === 'string' ? b.account.trim() : ''
    if (!account || account.length > 100) return void res.status(400).json({ error: 'account' })
    const kept = nextcloudSettings(deps.getMupiboxConfig())
    let password = typeof b.password === 'string' ? b.password : ''
    if (!password) {
      const t = keptTarget(deps, deps.getMupiboxConfig()) ?? (kept.url && kept.password ? { url: kept.url, account: kept.account, password: deps.secret ? (deps.secret.decrypt(kept.password) ?? '') : kept.password } : null)
      if (!t?.password || t.url !== url || t.account !== account) return void res.status(400).json({ error: 'password' })
      password = t.password
    }
    const fingerprint = typeof b.fingerprint === 'string' && FINGERPRINT.test(b.fingerprint) ? b.fingerprint.toUpperCase() : undefined
    // (the certificate confirmed before, for the same address)
    const pin = fingerprint ?? (kept.url === url && kept.certFingerprint ? kept.certFingerprint : undefined)
    const result = await testNextcloud({ url, account, password, fingerprint: pin })
    res.json(result.ok ? { ...result, fingerprint: pin ?? '' } : result)
  })

  router.get('/photos/nextcloud/albums', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = tryClient()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    try {
      const list = await client.albums(AbortSignal.timeout(20_000), true)
      res.json({
        albums: [...list.values()]
          .map((a) => ({ id: a.id, name: a.name, count: a.count, shared: a.shared, thumb: a.lastPhoto ? a.id : null }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      })
    } catch (err) {
      res.status(err instanceof RemoteRefused && err.status === 401 ? 401 : 502).json({ error: err instanceof RemoteRefused && err.status === 401 ? 'unauthorized' : 'unreachable' })
    }
  })

  router.get('/photos/nextcloud/thumb/:id', requireSession, async (req: Request, res: Response) => {
    const client = tryClient()
    const id = String(req.params.id)
    if (!client || !ALBUM_ID.test(id)) return void res.status(404).end()
    try {
      const a = (await client.albums()).get(id)
      if (!a?.lastPhoto) return void res.status(404).end()
      const r = await client.request(`/index.php/apps/photos/api/v1/preview/${a.lastPhoto}?x=256&y=256`)
      const buf = Buffer.from(await r.arrayBuffer())
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buf)
    } catch {
      res.status(404).end()
    }
  })

  router.post('/photos/nextcloud', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    const before = nextcloudSettings(deps.getMupiboxConfig())
    try {
      await deps.updateMupiboxConfig((cfg) => {
        error = applyNextcloudSettings(cfg, req.body, deps.secret ? (x) => deps.secret!.encrypt(x) : undefined)
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    const after = nextcloudSettings(deps.getMupiboxConfig())
    // (switched on, albums, the way they are kept or the login changed: a sync takes it over at once)
    if (
      ready(after) &&
      (!before.enabled ||
        before.keepCopy !== after.keepCopy ||
        before.url !== after.url ||
        before.account !== after.account ||
        before.password !== after.password ||
        before.certFingerprint !== after.certFingerprint ||
        before.albumIds.join() !== after.albumIds.join())
    )
      void sync.run()
    res.json(await answer())
  })

  // the running sync stopped: what came so far stays, the next one at its time
  router.post('/photos/nextcloud/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/nextcloud/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/nextcloud/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const photos = { ...obj(cfg.photos) }
        const sources = { ...obj(photos.sources) }
        delete sources.nextcloud
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
