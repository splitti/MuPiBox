// The photo display's Immich albums (5.1, Bibliothek › Fotos › Immich): albums of an Immich server in the home network
// (address and an API key with read rights) become albums on the display - kept on the box (Immich's "preview" of each
// picture, made into the display's sizes, in cache/photos/immich) or live (its "thumbnail" for the grid, its "preview"
// for the full view); the sync, the two ways and the live pictures are the same for every service (remote.ts). Albums of
// Immich are only looked at in the app: changes happen in Immich. The key is kept encrypted and never shown again.
//
// Besides its albums (5.1): people Immich knows by their faces - one, or two or three together (the pictures they are
// all on) - and the favourites, each an album on the box with the newest pictures; a person's album shows the face on
// the display (kept with the album's pictures). See docs/immich-personen-5.1.md.
//
// And Immich's memories (5.1): "on this day" of the years before and the birthdays of people Immich knows - those of the
// day as one album, made anew at every sync and after midnight (Immich makes them a week ahead, each for its day).

import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Request, Response, Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { boxLanguage } from '../../speech'
import { requireCsrf, requireSession } from '../middleware'
import { CACHE_LIMITS_MB, PICTURES_MAX, type RemoteClient, type RemoteItem, RemoteAway, RemotePhotoSync, RemoteRefused, registerRemote, remoteDown, SYNC_MINUTES, typeOf } from './remote'
import { photoSettings } from './settings'
import { albums, IMMICH_FACE_DIR, IMMICH_LIVE_DIR, IMMICH_PHOTO_DIR, PHOTOS_DIR, photoBytes } from './store'

export interface PhotoImmichDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** the box's way to keep a secret in the config (the NAS password's) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

/** The oldest Immich with the API used here (/api/server/version, /api/albums, /api/assets/:id/thumbnail) */
export const IMMICH_MIN_VERSION = { major: 1, minor: 106, patch: 0 }
export const IMMICH_MIN_TEXT = '1.106'

const ALBUMS_MAX = 100
const STATE_FILE = path.join(PHOTOS_DIR, 'immich-sync.json')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** At most this many albums of people, each of one to three people (more together: hardly a picture has them all) */
export const PEOPLE_ALBUMS_MAX = 20
export const PEOPLE_TOGETHER_MAX = 3
/**
 * How many pictures a person's album and the favourites take at most (Fotos › Immich › Bilder je Album; 0: all, up to the
 * 20,000 of every album). Not set: 1000 when the pictures are kept on the box (room on the card, the time to make them),
 * all when they are shown live (only their list is kept). More found: a choice spread over all the years - the same
 * pictures at every sync (by their id), a new one only now and then takes the place of another.
 */
export const SEARCH_LIMITS = [500, 1000, 2000, 5000, 0] as const
export const SEARCH_LIMIT_KEPT = 1000
export const searchLimitOf = (s: Pick<ImmichSettings, 'searchLimit' | 'keepCopy'>): number => s.searchLimit ?? (s.keepCopy ? SEARCH_LIMIT_KEPT : 0)
/** The favourites' album, as the box knows it (its "ref") */
export const FAVORITES_REF = 'favorites'
const PEOPLE_PREFIX = 'people-'
/** A people album's ref: "people-<id>[_<id>…]" (the order kept as chosen) */
export const peopleRef = (ids: string[]): string => `${PEOPLE_PREFIX}${ids.join('_')}`
/** The people of a ref; null: no people album */
export function peopleOfRef(ref: string): string[] | null {
  if (!ref.startsWith(PEOPLE_PREFIX)) return null
  const ids = ref.slice(PEOPLE_PREFIX.length).split('_')
  return ids.length >= 1 && ids.length <= PEOPLE_TOGETHER_MAX && ids.every((x) => UUID.test(x)) ? ids : null
}
// the favourites' name on the box, in its language (Einstellungen › Sprache) - the other albums' names come from Immich
const FAVORITES_NAME: Record<string, string> = {
  de: 'Favoriten',
  en: 'Favourites',
  cs: 'Oblíbené',
  da: 'Favoritter',
  el: 'Αγαπημένα',
  es: 'Favoritos',
  fi: 'Suosikit',
  fr: 'Favoris',
  it: 'Preferiti',
  nb: 'Favoritter',
  nl: 'Favorieten',
  pl: 'Ulubione',
  pt: 'Favoritos',
  ru: 'Избранное',
  sv: 'Favoriter',
  tr: 'Favoriler',
  uk: 'Улюблені',
}

/** The memories' album, as the box knows it (its "ref") */
export const MEMORIES_REF = 'memories'
// its name on the box, in its language
const MEMORIES_NAME: Record<string, string> = {
  de: 'Erinnerungen',
  en: 'Memories',
  cs: 'Vzpomínky',
  da: 'Minder',
  el: 'Αναμνήσεις',
  es: 'Recuerdos',
  fi: 'Muistot',
  fr: 'Souvenirs',
  it: 'Ricordi',
  nb: 'Minner',
  nl: 'Herinneringen',
  pl: 'Wspomnienia',
  pt: 'Memórias',
  ru: 'Воспоминания',
  sv: 'Minnen',
  tr: 'Anılar',
  uk: 'Спогади',
}
/** The day as the box has it (its time zone), YYYY-MM-DD - the memories of this day */
export const localDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface ImmichSettings {
  /** the server, http(s)://host:port, without /api */
  url: string
  /** the key as kept (encrypted); '' none */
  apiKey: string
  /** the account the key belongs to (name or e-mail, from the test) */
  account: string | null
  albumIds: string[]
  /** albums of people: each one to three people (their ids in Immich) - the pictures they are all on */
  people: string[][]
  /** the favourites (the heart in Immich) as an album */
  favorites: boolean
  /** Immich's memories of the day as an album */
  memories: boolean
  /** pictures at most of an album of people and of the favourites (SEARCH_LIMITS; 0 all); null: as the way they are kept */
  searchLimit: (typeof SEARCH_LIMITS)[number] | null
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

// the albums of people as kept: each one to three different ids, each set once (in any order)
function peopleList(v: unknown): string[][] | null {
  if (!Array.isArray(v) || v.length > PEOPLE_ALBUMS_MAX) return null
  const out: string[][] = []
  const seen = new Set<string>()
  for (const g of v) {
    if (!Array.isArray(g) || g.length < 1 || g.length > PEOPLE_TOGETHER_MAX || !g.every((x) => typeof x === 'string' && UUID.test(x))) return null
    const ids = [...new Set(g as string[])]
    const key = [...ids].sort().join()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ids)
  }
  return out
}

/** The server's address as the box keeps it: http(s)://host[:port][/path], no "/api", no slash at the end */
export function cleanImmichUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s || s.length > 300) return null
  // (another scheme: not an Immich address; none: http)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname || u.username || u.password || u.search || u.hash) return null
  const p = u.pathname.replace(/\/+$/, '').replace(/\/api$/i, '')
  return `${u.protocol}//${u.host}${p}`
}

export function immichSettings(cfg: unknown): ImmichSettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).immich)
  return {
    url: cleanImmichUrl(n.url) ?? '',
    apiKey: typeof n.apiKey === 'string' ? n.apiKey : '',
    account: typeof n.account === 'string' && n.account ? n.account.slice(0, 100) : null,
    albumIds: Array.isArray(n.albumIds) ? [...new Set(n.albumIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, ALBUMS_MAX) : [],
    people: peopleList(n.people) ?? [],
    favorites: n.favorites === true,
    memories: n.memories === true,
    searchLimit: (SEARCH_LIMITS as readonly number[]).includes(n.searchLimit as number) ? (n.searchLimit as ImmichSettings['searchLimit']) : null,
    keepCopy: n.keepCopy !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as ImmichSettings['syncMinutes']) : 360,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as ImmichSettings['cacheLimitMb']) : 2048,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written); the key comes in plain, kept encrypted */
export function applyImmichSettings(cfg: Record<string, unknown>, patch: unknown, encrypt: (plain: string) => string = (x) => x): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).immich) }
  if (p.url !== undefined) {
    const url = cleanImmichUrl(p.url)
    if (!url) return 'url'
    // (the key kept belongs to the server it was given for: another server gets it only typed in anew)
    if (url !== cleanImmichUrl(next.url) && next.apiKey && p.apiKey === undefined) return 'apiKey'
    next.url = url
  }
  if (p.apiKey !== undefined) {
    if (typeof p.apiKey !== 'string' || p.apiKey.trim().length < 10 || p.apiKey.length > 200) return 'apiKey'
    next.apiKey = encrypt(p.apiKey.trim())
  }
  if (p.account !== undefined) {
    if (p.account !== null && typeof p.account !== 'string') return 'account'
    next.account = typeof p.account === 'string' ? p.account.slice(0, 100) : null
  }
  if (p.albumIds !== undefined) {
    if (!Array.isArray(p.albumIds) || p.albumIds.length > ALBUMS_MAX || !p.albumIds.every((x) => typeof x === 'string' && UUID.test(x))) return 'albumIds'
    next.albumIds = [...new Set(p.albumIds as string[])]
  }
  if (p.people !== undefined) {
    const list = peopleList(p.people)
    if (!list) return 'people'
    next.people = list
  }
  if (p.favorites !== undefined) {
    if (typeof p.favorites !== 'boolean') return 'favorites'
    next.favorites = p.favorites
  }
  if (p.memories !== undefined) {
    if (typeof p.memories !== 'boolean') return 'memories'
    next.memories = p.memories
  }
  if (p.searchLimit !== undefined) {
    if (!(SEARCH_LIMITS as readonly unknown[]).includes(p.searchLimit)) return 'searchLimit'
    next.searchLimit = p.searchLimit
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
  photos.sources = { ...obj(photos.sources), immich: next }
  cfg.photos = photos
  return null
}

/* ---------- talking to Immich ---------- */

// (what goes wrong is the same for every service - see remote.ts)
export { RemoteAway as ImmichAway, remoteDown as immichDown }
const ImmichAway = RemoteAway
export class ImmichRefused extends RemoteRefused {
  constructor(status: number) {
    super(status, 'Immich')
  }
}

interface ImmichAlbum {
  id: string
  albumName: string
  assetCount: number
  albumThumbnailAssetId: string | null
  assets?: ImmichAsset[]
}
export interface ImmichAsset {
  id: string
  type: string
  /** a clip's length, "0:00:24.000000" (Immich 3: 24000, milliseconds) */
  duration?: string | number | null
  isTrashed?: boolean
  /** "timeline", "archive", "hidden" (a live photo's movie, a picture of a stack) or "locked" (Immich 1.133 on) */
  visibility?: string
  fileCreatedAt?: string
  localDateTime?: string
  checksum?: string
  updatedAt?: string
  exifInfo?: { exifImageWidth?: number | null; exifImageHeight?: number | null; orientation?: string | number | null } | null
  /** the size as shown (Immich 3 - a memory's pictures come without their EXIF) */
  width?: number | null
  height?: number | null
}
/** A memory of Immich: "on this day" (data.year) or a birthday (data.personName); shown from showAt to hideAt */
interface ImmichMemory {
  type?: string
  memoryAt?: string
  data?: { year?: number; personName?: string }
  assets?: ImmichAsset[]
}

export class ImmichClient implements RemoteClient {
  /** Immich makes its clips for browsers: shown live as they come */
  readonly liveClips = true

  constructor(
    readonly url: string,
    readonly key: string,
    /** the box's language (the favourites' name) */
    readonly language = 'de',
    /** pictures at most of an album of people and of the favourites (0: all - searchLimitOf) */
    readonly limit = 0,
  ) {}

  private async call(
    p: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean; headers?: Record<string, string>; timeoutMs?: number } = {},
  ): Promise<globalThis.Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers }
    if (init.auth !== false) headers['x-api-key'] = this.key
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const timeout = AbortSignal.timeout(init.timeoutMs ?? 20_000)
    try {
      return await fetch(`${this.url}${p}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
        redirect: 'error',
      })
    } catch (err) {
      if (init.signal?.aborted) throw err
      throw new ImmichAway((err as Error).message)
    }
  }

  async json<T>(p: string, init: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
    const r = await this.call(p, init)
    if (!r.ok) {
      await r.body?.cancel().catch(() => undefined)
      throw new ImmichRefused(r.status)
    }
    try {
      return (await r.json()) as T
    } catch {
      throw new ImmichAway('no JSON')
    }
  }

  /** The server's version; null: an Immich older than 1.106 (or no Immich at all) */
  async version(): Promise<{ major: number; minor: number; patch: number } | null> {
    try {
      const v = await this.json<{ major: number; minor: number; patch: number }>('/api/server/version', { auth: false })
      return Number.isInteger(v.major) && Number.isInteger(v.minor) ? v : null
    } catch (err) {
      if (err instanceof ImmichRefused && err.status === 404) return null
      throw err
    }
  }

  /** Own and shared albums, each once */
  async albums(signal?: AbortSignal): Promise<ImmichAlbum[]> {
    const [own, shared] = await Promise.all([this.json<ImmichAlbum[]>('/api/albums', { signal }), this.json<ImmichAlbum[]>('/api/albums?shared=true', { signal }).catch(() => [] as ImmichAlbum[])])
    const out = new Map<string, ImmichAlbum>()
    for (const a of [...(Array.isArray(own) ? own : []), ...(Array.isArray(shared) ? shared : [])]) if (a && typeof a.id === 'string') out.set(a.id, a)
    return [...out.values()]
  }

  /** An album with its pictures as the sync takes them - an album of Immich, of people (with their faces) or the favourites */
  async album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[]; faces?: string[] }> {
    if (ref === FAVORITES_REF) {
      const items = await this.searchChosen({ isFavorite: true }, signal, videos)
      return { name: FAVORITES_NAME[this.language] ?? FAVORITES_NAME.en, items: items.map(itemOf) }
    }
    if (ref === MEMORIES_REF) {
      const items = spreadChoice(await this.memories(localDay(), signal, videos), this.limit)
      return { name: MEMORIES_NAME[this.language] ?? MEMORIES_NAME.en, items: items.map(itemOf) }
    }
    const people = peopleOfRef(ref)
    if (people) {
      // (each person still there - one deleted or merged in Immich: the album is "no longer there", RemoteRefused 404)
      const names: string[] = []
      for (const id of people) names.push(String((await this.json<{ name?: string }>(`/api/people/${id}`, { signal })).name ?? '').trim())
      const items = await this.searchChosen({ personIds: people }, signal, videos)
      return { name: names.filter(Boolean).join(' & '), items: items.map(itemOf), faces: people }
    }
    const a = await this.assets(ref, signal, videos)
    return { name: a.name, items: a.assets.map(itemOf) }
  }

  /**
   * The pictures of a search (people, favourites) the box shows: all of them (the newest 20,000 at most), more than the
   * limit - a choice spread over all the years (spreadChoice), newest first
   */
  private async searchChosen(query: Record<string, unknown>, signal: AbortSignal, videos: boolean): Promise<ImmichAsset[]> {
    const out: ImmichAsset[] = []
    // (newest first - an Immich that does not know the order is asked without it)
    let order = true
    for (let page = 1; page && out.length < PICTURES_MAX; ) {
      let r: { assets?: { items?: ImmichAsset[]; nextPage?: string | null } }
      try {
        r = await this.json('/api/search/metadata', { method: 'POST', body: { ...query, page, size: 1000, withExif: true, ...(order ? { order: 'desc' } : {}) }, signal })
      } catch (err) {
        if (order && page === 1 && err instanceof ImmichRefused && err.status === 400) {
          order = false
          continue
        }
        throw err
      }
      out.push(...shownAssets(r.assets?.items ?? [], videos))
      page = r.assets?.nextPage ? Number(r.assets.nextPage) : 0
    }
    return spreadChoice(out.slice(0, PICTURES_MAX), this.limit)
  }

  /**
   * The pictures of the memories Immich shows on this day (YYYY-MM-DD): the newest year first, a birthday before them;
   * each picture once. None that day: an empty list (the album is not on the display then) - so too when the key lacks
   * memory.read (403): that is no key refused, the other albums go on (the app says what is missing).
   */
  async memories(day: string, signal: AbortSignal, videos: boolean): Promise<ImmichAsset[]> {
    let list: ImmichMemory[]
    try {
      list = await this.json<ImmichMemory[]>(`/api/memories?for=${day}`, { signal })
    } catch (err) {
      if (err instanceof ImmichRefused && err.status === 403) return []
      throw err
    }
    const memories = (Array.isArray(list) ? list : []).filter((m) => m && Array.isArray(m.assets))
    const at = (m: ImmichMemory) => (typeof m.memoryAt === 'string' ? m.memoryAt : '')
    memories.sort((a, b) => (a.type === 'birthday') !== (b.type === 'birthday') ? (a.type === 'birthday' ? -1 : 1) : at(b).localeCompare(at(a)))
    const seen = new Set<string>()
    const out: ImmichAsset[] = []
    for (const m of memories)
      for (const x of shownAssets(m.assets ?? [], videos))
        if (!seen.has(x.id) && out.length < PICTURES_MAX) {
          seen.add(x.id)
          out.push(x)
        }
    return out
  }

  /** The people Immich knows by name (not those hidden there), by name */
  async people(signal?: AbortSignal): Promise<Array<{ id: string; name: string }>> {
    const out: Array<{ id: string; name: string }> = []
    for (let page = 1; page && page <= 20; ) {
      const r = await this.json<{ people?: Array<{ id?: unknown; name?: unknown; isHidden?: unknown }>; hasNextPage?: boolean }>(`/api/people?withHidden=false&page=${page}&size=500`, { signal })
      for (const p of r.people ?? []) {
        const name = typeof p.name === 'string' ? p.name.trim() : ''
        if (typeof p.id === 'string' && UUID.test(p.id) && name && p.isHidden !== true) out.push({ id: p.id, name: name.slice(0, 60) })
      }
      page = r.hasNextPage ? page + 1 : 0
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  }

  /** A person's face (JPEG) */
  async face(personId: string, signal?: AbortSignal): Promise<globalThis.Response> {
    const r = await this.call(`/api/people/${personId}/thumbnail`, { signal, headers: { Accept: 'image/*' } })
    if (!r.ok || !r.body) {
      await r.body?.cancel().catch(() => undefined)
      throw new ImmichRefused(r.status)
    }
    return r
  }

  /** An album with its pictures (not trashed); newer Immich versions leave the assets out of the album: searched then */
  async assets(id: string, signal?: AbortSignal, videos = false): Promise<{ name: string; assets: ImmichAsset[] }> {
    const a = await this.json<ImmichAlbum>(`/api/albums/${id}?withoutAssets=false`, { signal })
    let assets = Array.isArray(a.assets) ? a.assets : null
    if (!assets || (assets.length === 0 && a.assetCount > 0)) {
      assets = []
      for (let page = 1; page && assets.length < PICTURES_MAX; ) {
        const r = await this.json<{ assets?: { items?: ImmichAsset[]; nextPage?: string | null } }>('/api/search/metadata', {
          method: 'POST',
          body: { albumIds: [id], page, size: 1000, withExif: true },
          signal,
        })
        assets.push(...(r.assets?.items ?? []))
        page = r.assets?.nextPage ? Number(r.assets.nextPage) : 0
      }
    }
    return { name: String(a.albumName ?? ''), assets: shownAssets(assets, videos) }
  }

  /** A clip as Immich plays it (made by Immich for browsers - H.264 most often); range: a part of it (the display seeking) */
  async clip(_album: string, item: { ref: string }, init: { signal?: AbortSignal; range?: string; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    const r = await this.call(`/api/assets/${item.ref}/video/playback`, {
      signal: init.signal,
      headers: { Accept: '*/*', ...(init.range ? { Range: init.range } : {}) },
      timeoutMs: init.timeoutMs ?? 30 * 60_000,
    })
    if (!(r.ok || r.status === 206) || !r.body) {
      await r.body?.cancel().catch(() => undefined)
      throw new ImmichRefused(r.status)
    }
    return r
  }

  /** A picture for the sync and the live albums: its preview for the full view, its thumbnail for the grid */
  picture(_album: string, item: { ref: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response> {
    return this.thumbnail(item.ref, size === 'full' ? 'preview' : 'thumbnail', signal)
  }

  /** Whether Immich is back: it answers the key with its albums */
  async check(signal: AbortSignal): Promise<void> {
    await this.json('/api/albums', { signal })
  }

  /** A picture of Immich's (preview: its display size, JPEG; thumbnail: small, WebP or JPEG) */
  async thumbnail(assetId: string, size: 'preview' | 'thumbnail', signal?: AbortSignal): Promise<globalThis.Response> {
    const r = await this.call(`/api/assets/${assetId}/thumbnail?size=${size}`, { signal })
    if (!r.ok || !r.body) {
      await r.body?.cancel().catch(() => undefined)
      throw new ImmichRefused(r.status)
    }
    return r
  }
}

export type ImmichTest =
  | { ok: true; version: string; account: string | null; albums: number; assets: number; people: boolean; memories: boolean }
  | { ok: false; error: 'unreachable' | 'unauthorized' | 'permissions' | 'unsupportedVersion' }

/**
 * The test of the assistant: the server there, new enough, the key accepted, and it has the rights the box needs - a key made
 * with chosen rights answers 403 where one is missing: album.read (the albums), asset.view (the pictures, the clips), asset.read
 * (the pictures of an album, searched in newer versions). user.read only gives the name of the account.
 */
export async function testImmich(client: ImmichClient): Promise<ImmichTest> {
  let v: Awaited<ReturnType<ImmichClient['version']>>
  try {
    v = await client.version()
  } catch {
    return { ok: false, error: 'unreachable' }
  }
  if (!v) return { ok: false, error: 'unsupportedVersion' }
  const m = IMMICH_MIN_VERSION
  if (v.major < m.major || (v.major === m.major && v.minor < m.minor)) return { ok: false, error: 'unsupportedVersion' }
  let list: ImmichAlbum[]
  try {
    list = await client.albums()
  } catch (err) {
    if (err instanceof ImmichRefused && err.status === 401) return { ok: false, error: 'unauthorized' }
    if (err instanceof ImmichRefused && err.status === 403) return { ok: false, error: 'permissions' }
    return { ok: false, error: 'unreachable' }
  }
  // (the other rights, tried on an album with a picture: anything but a refusal - an older Immich without the search, say - is no
  // missing right)
  const sample = list.find((a) => typeof a.albumThumbnailAssetId === 'string' && UUID.test(a.albumThumbnailAssetId))
  if (sample) {
    const denied = async (attempt: () => Promise<unknown>) => {
      try {
        await attempt()
        return false
      } catch (err) {
        return err instanceof ImmichRefused && err.status === 403
      }
    }
    if (await denied(async () => (await client.thumbnail(sample.albumThumbnailAssetId as string, 'thumbnail')).body?.cancel())) return { ok: false, error: 'permissions' }
    if (await denied(() => client.json('/api/search/metadata', { method: 'POST', body: { albumIds: [sample.id], page: 1, size: 1 } }))) return { ok: false, error: 'permissions' }
  }
  // (the account: only when the key may read it - a key with the album rights only has no name to show)
  const me = await client.json<{ name?: string; email?: string }>('/api/users/me').catch(() => null)
  // (the people: only with person.read - without it the albums work all the same, the app says what is missing)
  const people = await client.json('/api/people?withHidden=false&page=1&size=1').then(
    () => true,
    () => false,
  )
  // (the memories: only with memory.read - the same)
  const memories = await client.json(`/api/memories?for=${localDay()}`).then(
    () => true,
    () => false,
  )
  return {
    ok: true,
    version: `${v.major}.${v.minor}.${v.patch}`,
    account: me?.name || me?.email || null,
    albums: list.length,
    assets: list.reduce((n, a) => n + (Number(a.assetCount) || 0), 0),
    people,
    memories,
  }
}


/* ---------- an Immich asset as the sync takes it ---------- */

// the size of a picture as Immich knows it, turned as it is shown (EXIF orientation 5-8: on its side)
function dims(x: ImmichAsset): { w: number; h: number } {
  // (no EXIF - a memory's picture: the size Immich gives it, as shown)
  if (!x.exifInfo && Number(x.width) > 0 && Number(x.height) > 0) return { w: Number(x.width), h: Number(x.height) }
  const w = Number(x.exifInfo?.exifImageWidth) || 0
  const h = Number(x.exifInfo?.exifImageHeight) || 0
  const o = Number(x.exifInfo?.orientation)
  return o >= 5 && o <= 8 ? { w: h, h: w } : { w, h }
}
const versionOf = (x: ImmichAsset) => String(x.checksum ?? x.updatedAt ?? '')
// a clip's length in seconds: Immich up to 2.x "H:MM:SS.ffffff", 3.x milliseconds as a number (every clip was "0:00",
// and a clip too long for the box was fetched before it was found out)
export const clipSeconds = (d: string | number | null | undefined): number => {
  if (typeof d === 'number') return Number.isFinite(d) && d > 0 ? Math.max(1, Math.round(d / 1000)) : 0
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(String(d ?? ''))
  return m ? Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0
}
const takenOf = (x: ImmichAsset) => {
  const t = x.localDateTime ?? x.fileCreatedAt
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(t) ? t.slice(0, 19) : null
}
/**
 * At most `limit` of the pictures (0: all), spread over all the years: those whose id has the smallest fingerprint - by
 * chance from every year, and the same ones at every sync (a picture kept on the box is not fetched again and again; a
 * new one in Immich takes the place of another only as often as its fingerprint is among the smallest). In their order.
 */
export function spreadChoice<T extends { id: string }>(list: T[], limit: number): T[] {
  if (!limit || list.length <= limit) return list
  const rank = (x: T) => createHash('sha1').update(x.id).digest('hex')
  const chosen = new Set(
    list
      .map((x) => ({ x, r: rank(x) }))
      .sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0))
      .slice(0, limit)
      .map((y) => y.x),
  )
  return list.filter((x) => chosen.has(x))
}

/**
 * The assets the box takes: pictures, clips only with "Videos anzeigen", nothing in the trash, nothing hidden or locked in
 * Immich - a search for people or favourites also brings a live photo's movie ("hidden"; in an album it is no asset of
 * its own, its still is)
 */
export function shownAssets(list: ImmichAsset[], videos: boolean): ImmichAsset[] {
  return list.filter(
    (x) => x && (x.type === 'IMAGE' || (videos && x.type === 'VIDEO')) && !x.isTrashed && x.visibility !== 'hidden' && x.visibility !== 'locked' && typeof x.id === 'string' && UUID.test(x.id),
  )
}
const itemOf = (x: ImmichAsset): RemoteItem =>({ ref: x.id, kind: x.type === 'VIDEO' ? 'video' : 'photo', ver: versionOf(x), ...dims(x), taken: takenOf(x), duration: clipSeconds(x.duration) })

/** What the sync takes from Immich: the albums, the albums of people, the favourites, the memories of the day */
export const immichRefs = (s: ImmichSettings): string[] => [...s.albumIds, ...s.people.map(peopleRef), ...(s.favorites ? [FAVORITES_REF] : []), ...(s.memories ? [MEMORIES_REF] : [])]

/** Immich for the sync of the albums (remote.ts) */
function immichSpec(deps: PhotoImmichDeps) {
  return {
    source: 'immich' as const,
    label: 'Immich',
    stateFile: STATE_FILE,
    photoDir: IMMICH_PHOTO_DIR,
    liveDir: IMMICH_LIVE_DIR,
    faceDir: IMMICH_FACE_DIR,
    settings: (cfg: MupiboxConfig | undefined) => {
      const s = immichSettings(cfg)
      // (the memories: a sync after midnight too - they are the day's)
      return { set: !!s.url && !!s.apiKey, albumIds: immichRefs(s), keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb, daily: s.memories }
    },
    client: (cfg: MupiboxConfig | undefined) => immichClient(deps, cfg),
    unreadable: 'the key cannot be read on this box, the pictures stay - enter it again in the app',
  }
}

/** The client with the key as kept; null: none set up (or the key cannot be read on this box) */
function immichClient(deps: PhotoImmichDeps, cfg: MupiboxConfig | undefined): ImmichClient | null {
  const s = immichSettings(cfg)
  if (!s.url || !s.apiKey) return null
  const key = deps.secret ? deps.secret.decrypt(s.apiKey) : s.apiKey
  return key ? new ImmichClient(s.url, key, boxLanguage(cfg), searchLimitOf(s)) : null
}


/* ---------- the app's side ---------- */

/**
 *   GET  /api/app/photos/immich             the settings (the key only as "set"), the sync's state, albums, cache
 *   POST /api/app/photos/immich/test        {url, apiKey?} - the assistant's test (without a key: the one kept)
 *   GET  /api/app/photos/immich/albums      the albums in Immich (to tick) with their numbers
 *   GET  /api/app/photos/immich/thumb/:id   an album's picture from Immich for that list (through the box)
 *   GET  /api/app/photos/immich/people      the people Immich knows by name (to tick)
 *   GET  /api/app/photos/immich/face/:id    a person's face for that list (through the box)
 *   POST /api/app/photos/immich             {url?, apiKey?, account?, albumIds?, people?, favorites?, memories?, searchLimit?, keepCopy?, syncMinutes?, cacheLimitMb?}
 *   POST /api/app/photos/immich/sync        a sync now
 *   POST /api/app/photos/immich/remove      "Verbindung trennen": address, key, albums and pictures off the box
 */
export function registerPhotoImmichRoutes(router: Router, deps: PhotoImmichDeps): RemotePhotoSync {
  const sync = new RemotePhotoSync(immichSpec(deps), deps.getMupiboxConfig)
  registerRemote(sync)
  sync.start()
  const kept = () => immichClient(deps, deps.getMupiboxConfig())

  const answer = async () => {
    const s = immichSettings(deps.getMupiboxConfig())
    const list = (await albums()).filter((a) => a.source === 'immich')
    return {
      settings: {
        url: s.url,
        account: s.account,
        albumIds: s.albumIds,
        people: s.people,
        favorites: s.favorites,
        memories: s.memories,
        searchLimit: s.searchLimit,
        keepCopy: s.keepCopy,
        syncMinutes: s.syncMinutes,
        cacheLimitMb: s.cacheLimitMb,
        hasKey: !!s.apiKey,
      },
      peopleMax: PEOPLE_ALBUMS_MAX,
      togetherMax: PEOPLE_TOGETHER_MAX,
      // (the pictures at most of an album of people now - 0 all - and the choices; "all" means up to this)
      searchLimit: searchLimitOf(s),
      searchLimits: SEARCH_LIMITS,
      picturesMax: PICTURES_MAX,
      connected: !!(s.url && s.apiKey),
      minVersion: IMMICH_MIN_TEXT,
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: (await photoBytes(IMMICH_PHOTO_DIR)) + (await photoBytes(IMMICH_LIVE_DIR)),
    }
  }

  router.get('/photos/immich', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  router.post('/photos/immich/test', requireSession, requireCsrf, async (req, res) => {
    const b = obj(req.body)
    const url = cleanImmichUrl(b.url)
    if (!url) return void res.status(400).json({ error: 'url' })
    let key = typeof b.apiKey === 'string' ? b.apiKey.trim() : ''
    if (!key) {
      // (the key kept only for the server it was given for - never to another address)
      const client = kept()
      if (!client || client.url !== url) return void res.status(400).json({ error: 'apiKey' })
      key = client.key
    }
    res.json(await testImmich(new ImmichClient(url, key)))
  })

  router.get('/photos/immich/albums', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = kept()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    try {
      const list = await client.albums()
      res.json({
        albums: list
          .map((a) => ({ id: a.id, name: String(a.albumName ?? ''), count: Number(a.assetCount) || 0, thumb: a.albumThumbnailAssetId && UUID.test(a.albumThumbnailAssetId) ? a.albumThumbnailAssetId : null }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      })
    } catch (err) {
      res.status(err instanceof ImmichRefused && (err.status === 401 || err.status === 403) ? 401 : 502).json({ error: err instanceof ImmichRefused ? 'unauthorized' : 'unreachable' })
    }
  })

  // the people Immich knows by name, to tick (403: the key may not read them - person.read missing)
  router.get('/photos/immich/people', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = kept()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    try {
      res.json({ people: await client.people() })
    } catch (err) {
      const refused = err instanceof ImmichRefused
      res.status(refused && err.status === 403 ? 403 : refused && err.status === 401 ? 401 : 502).json({ error: refused && err.status === 403 ? 'permissions' : refused ? 'unauthorized' : 'unreachable' })
    }
  })

  // a person's face for that list (through the box)
  router.get('/photos/immich/face/:id', requireSession, async (req: Request, res: Response) => {
    const client = kept()
    if (!client || !UUID.test(req.params.id)) return void res.status(404).end()
    try {
      const buf = Buffer.from(await (await client.face(req.params.id)).arrayBuffer())
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buf)
    } catch {
      res.status(404).end()
    }
  })

  router.get('/photos/immich/thumb/:id', requireSession, async (req: Request, res: Response) => {
    const client = kept()
    if (!client || !UUID.test(req.params.id)) return void res.status(404).end()
    try {
      const r = await client.thumbnail(req.params.id, 'thumbnail')
      const buf = Buffer.from(await r.arrayBuffer())
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buf)
    } catch {
      res.status(404).end()
    }
  })

  router.post('/photos/immich', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    const before = immichSettings(deps.getMupiboxConfig())
    try {
      await deps.updateMupiboxConfig((cfg) => {
        error = applyImmichSettings(cfg, req.body, deps.secret ? (x) => deps.secret!.encrypt(x) : undefined)
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    const after = immichSettings(deps.getMupiboxConfig())
    // (albums, the way they are kept, the server or its key changed: a sync takes it over at once)
    if (
      after.url &&
      (before.url !== after.url ||
        before.apiKey !== after.apiKey ||
        before.keepCopy !== after.keepCopy ||
        searchLimitOf(before) !== searchLimitOf(after) ||
        immichRefs(before).join() !== immichRefs(after).join())
    )
      void sync.run()
    res.json(await answer())
  })

  // the running sync stopped: what came so far stays, the next one at its time
  router.post('/photos/immich/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/immich/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/immich/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const photos = { ...obj(cfg.photos) }
        const sources = { ...obj(photos.sources) }
        delete sources.immich
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

