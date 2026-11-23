// The photo display's albums of Synology Photos (5.1, Bibliothek › Fotos › Synology Photos): a login of its own at DSM
// (address, account, password - dsm.ts; best an account just for the box) - its own albums and the ones shared with it in
// Synology Photos become albums on the display. So a family gives the box an album by sharing it with the box's account
// ("Betrachter"). The sync, the two ways (kept on the box, live) and the live pictures are the same as for Immich
// (remote.ts); Synology's thumbnails ("xl" for the full view, "sm" for the grid) are the pictures. A clip comes as it is on
// the NAS (4K HEVC from a phone, say) and is made on the box (video.ts) - so live albums show no clips. The password is kept
// encrypted and never shown again.
//
// What is chosen is an album ("12") or a folder of Synology Photos: "f<id>" in the personal space, "t<id>" in the shared
// space (Synology calls it "team space", API SYNO.FotoTeam). A folder is one album on the display with its pictures and
// those of the folders below it (as for the NAS folders). The "smart" albums of the personal space are choices too:
// "rec" recently added, "vid" videos, "p<id>" a person Synology Photos knows (by name), "l<id>" a place, "g<id>" a tag and
// "c<id>" a subject (what Synology's recognition found). The same in capitals (P, L, G, C) are those of the shared space:
// a family keeps its named people there, as a rule (SYNO.FotoTeam answers the same questions).
// Tried against a DSM 7.3 with Synology Photos 1.9: Browse.Person / Geocoding / GeneralTag / Concept list their entries
// ({id, name, item_count}); the pictures of a person and of a place come with Browse.Item list person_id / geocoding_id
// (the counts agree), a subject only through the search by its name (Search.Search list_item keyword, about the same
// count). Favorites have no list there. NOTE: a parameter DSM does not know is ignored without a word and the whole library
// comes back - so a list that gives more pictures than its category has is thrown away (see `listed`).

import path from 'node:path'
import type { Request, Response, Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { DsmCertificateError, type DsmCertificateInfo, DsmLoginRefused, type DsmTarget, dsmCall } from './dsm'
import { CACHE_LIMITS_MB, type RemoteClient, type RemoteItem, RemoteAway, RemotePhotoSync, RemoteRefused, registerRemote, SYNC_MINUTES, typeOf } from './remote'
import { photoSettings } from './settings'
import { albums, PHOTOS_DIR, photoBytes, SYNOLOGY_LIVE_DIR, SYNOLOGY_PHOTO_DIR } from './store'

export interface PhotoSynologyDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** the box's way to keep a secret in the config (the NAS password's) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

const ALBUMS_MAX = 100
const STATE_FILE = path.join(PHOTOS_DIR, 'synology-sync.json')
// what the box keeps of a choice: an album's id in Synology Photos (a number), a folder's (f<id> personal, t<id> shared space)
// or a smart album (rec, vid, p<id>, l<id>, g<id>, c<id>; in capitals for the shared space)
const ALBUM_ID = /^(?:[ft]?\d{1,12}|[plgcPLGC]\d{1,12}|rec|vid)$/
// how many pictures the smart albums that have no end take at most (the newest ones)
const RECENT_MAX = 300
const VIDEOS_MAX = 2000
// how deep and how wide the folders below a chosen one are followed
const FOLDER_DEPTH = 8
const FOLDERS_MAX = 400
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i
// how many items one question asks for
const PAGE = 500

export interface SynologySettings {
  /** switched on in the app (after the test and the choice of albums) */
  enabled: boolean
  /** DSM: https://host:port or http://host:port */
  url: string
  account: string
  /** the password as kept (encrypted); '' none */
  password: string
  /** the confirmed certificate of an https DSM ('': the system trusts it, or http) */
  certFingerprint: string
  albumIds: string[]
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** DSM's address as the box keeps it: http(s)://host:port - https and 5001 when nothing else is said (5000 for http) */
export function cleanSynologyUrl(raw: unknown): string | null {
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
  if (!u.hostname || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null
  const port = u.port || (u.protocol === 'https:' ? '5001' : '5000')
  return `${u.protocol}//${u.hostname}:${port}`
}

export function synologySettings(cfg: unknown): SynologySettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).synology)
  return {
    enabled: n.enabled === true,
    url: cleanSynologyUrl(n.url) ?? '',
    account: typeof n.account === 'string' ? n.account.slice(0, 100) : '',
    password: typeof n.password === 'string' ? n.password : '',
    certFingerprint: typeof n.certFingerprint === 'string' && FINGERPRINT.test(n.certFingerprint) ? n.certFingerprint.toUpperCase() : '',
    albumIds: Array.isArray(n.albumIds) ? [...new Set(n.albumIds.filter((x): x is string => typeof x === 'string' && ALBUM_ID.test(x)))].slice(0, ALBUMS_MAX) : [],
    keepCopy: n.keepCopy !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as SynologySettings['syncMinutes']) : 360,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as SynologySettings['cacheLimitMb']) : 2048,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written); the password comes in plain, kept encrypted */
export function applySynologySettings(cfg: Record<string, unknown>, patch: unknown, encrypt: (plain: string) => string = (x) => x): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).synology) }
  const before = { url: cleanSynologyUrl(next.url), account: next.account }
  if (p.url !== undefined) {
    const url = cleanSynologyUrl(p.url)
    if (!url) return 'url'
    next.url = url
  }
  if (p.account !== undefined) {
    if (typeof p.account !== 'string' || !p.account.trim() || p.account.length > 100) return 'account'
    next.account = p.account.trim()
  }
  // (the password kept belongs to the address and the account it was given for: another one gets it only typed in anew)
  const moved = cleanSynologyUrl(next.url) !== before.url || next.account !== before.account
  if (p.password !== undefined) {
    if (typeof p.password !== 'string' || !p.password || p.password.length > 200) return 'password'
    next.password = encrypt(p.password)
  } else if (moved && next.password) return 'password'
  if (p.certFingerprint !== undefined) {
    if (typeof p.certFingerprint !== 'string' || (p.certFingerprint !== '' && !FINGERPRINT.test(p.certFingerprint))) return 'certFingerprint'
    next.certFingerprint = p.certFingerprint.toUpperCase()
  } else if (cleanSynologyUrl(next.url) !== before.url) next.certFingerprint = ''
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
  // (from the first version: the port of the NAS's DSM - an address of its own now)
  delete next.port
  const photos = { ...obj(cfg.photos) }
  photos.sources = { ...obj(photos.sources), synology: next }
  cfg.photos = photos
  return null
}

/* ---------- talking to Synology Photos ---------- */

interface SynoAlbum {
  id: number
  name?: string
  item_count?: number
  passphrase?: string
  additional?: { thumbnail?: { cache_key?: string; unit_id?: number } }
}
interface SynoItem {
  id: number
  type?: string
  time?: number
  additional?: {
    resolution?: { width?: number; height?: number }
    thumbnail?: { cache_key?: string; unit_id?: number; xl?: string; sm?: string }
    video_meta?: { duration?: number }
  }
}

interface SynoFolder {
  id: number
  name?: string
}

/** A folder's name as shown: Synology gives its path ("/2023/Italy") - the last part; a number when there is none */
export function folderName(name: unknown, id: number): string {
  const last = typeof name === 'string' ? name.split('/').filter(Boolean).pop() : undefined
  return last?.trim() || `Ordner ${id}`
}

// the albums the account sees, for a minute: own ones and the ones shared with it (those are read with their passphrase)
let albumCache: { at: number; key: string; list: Map<string, SynoAlbum & { shared: boolean }> } | null = null

export class SynologyClient implements RemoteClient {
  /** a clip comes as it is on the NAS: the display cannot play it as it comes - live albums show no clips */
  readonly liveClips = false

  constructor(private readonly target: DsmTarget) {}

  /** the address and the account (the album list of a minute ago is theirs) */
  private get key(): string {
    return `${this.target.url}\n${this.target.account}`
  }

  /** A question to Synology Photos: its data; RemoteRefused when it says no, RemoteAway when the NAS does not answer */
  private async call<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const r = await this.raw(params, { signal })
    const j = await this.json(r)
    return j as T
  }

  protected async raw(params: Record<string, string>, init: { signal?: AbortSignal; timeoutMs?: number; fresh?: boolean } = {}): Promise<globalThis.Response> {
    return dsmCall(this.target, params, init)
  }

  private async json(r: globalThis.Response): Promise<unknown> {
    if (!r.ok) {
      await r.body?.cancel().catch(() => undefined)
      throw new RemoteRefused(r.status, 'Synology')
    }
    let j: { success?: boolean; data?: unknown; error?: { code?: number } }
    try {
      j = (await r.json()) as typeof j
    } catch {
      throw new RemoteAway('Synology: no JSON')
    }
    if (j?.success !== true) throw synoError(Number(j?.error?.code) || 0)
    return j.data ?? {}
  }

  /** Every album the account sees: its own and the ones shared with it (each once) */
  async albums(signal?: AbortSignal, fresh = false): Promise<Map<string, SynoAlbum & { shared: boolean }>> {
    if (!fresh && albumCache && albumCache.key === this.key && Date.now() - albumCache.at < 60_000) return albumCache.list
    const list = new Map<string, SynoAlbum & { shared: boolean }>()
    const extra = JSON.stringify(['thumbnail'])
    for (const [api, method, version, shared] of [
      ['SYNO.Foto.Browse.Album', 'list', '2', false],
      ['SYNO.Foto.Sharing.Misc', 'list_shared_with_me_album', '2', true],
    ] as const) {
      for (let offset = 0; offset < 1000; offset += PAGE) {
        const d = await this.call<{ list?: SynoAlbum[] }>({ api, method, version, offset: String(offset), limit: String(PAGE), additional: extra }, signal)
        const page = Array.isArray(d.list) ? d.list : []
        for (const a of page) if (a && Number.isInteger(a.id) && !list.has(String(a.id))) list.set(String(a.id), { ...a, shared })
        if (page.length < PAGE) break
      }
    }
    albumCache = { at: Date.now(), key: this.key, list }
    return list
  }

  /** What a choice is: an album, or a folder of the personal or of the shared space ("Team" for Synology) */
  static kindOf(ref: string): { kind: 'album' | 'personal' | 'shared' | 'smart'; id: string } | null {
    if (!ALBUM_ID.test(ref)) return null
    if (ref === 'rec' || ref === 'vid' || /^[plgcPLGC]/.test(ref)) return { kind: 'smart', id: ref }
    if (ref.startsWith('f')) return { kind: 'personal', id: ref.slice(1) }
    if (ref.startsWith('t')) return { kind: 'shared', id: ref.slice(1) }
    return { kind: 'album', id: ref }
  }

  /** The API names of a space: its own for the shared space */
  private static api(kind: 'personal' | 'shared'): string {
    return kind === 'shared' ? 'SYNO.FotoTeam' : 'SYNO.Foto'
  }

  /** How an album's pictures are asked for: its own by its id, one shared with the account by its passphrase */
  private async albumParams(ref: string, signal?: AbortSignal): Promise<Record<string, string>> {
    let a = (await this.albums(signal)).get(ref)
    // (not in the list of a minute ago: asked again - an album shared just now)
    if (!a) a = (await this.albums(signal, true)).get(ref)
    if (!a) throw new RemoteRefused(404, 'Synology')
    return a.shared && a.passphrase ? { passphrase: a.passphrase } : { album_id: ref }
  }

  /** The folders directly in a folder of a space (id '0': the top of the space) */
  async folders(kind: 'personal' | 'shared', id: string, signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
    if (!/^\d{1,12}$/.test(id)) throw new RemoteRefused(404, 'Synology')
    const out: { id: string; name: string }[] = []
    for (let offset = 0; offset < 5000; offset += PAGE) {
      const d = await this.call<{ list?: SynoFolder[] }>({ api: `${SynologyClient.api(kind)}.Browse.Folder`, method: 'list', version: '1', id, offset: String(offset), limit: String(PAGE) }, signal)
      const page = Array.isArray(d.list) ? d.list : []
      for (const f of page) if (f && Number.isInteger(f.id) && !out.some((x) => x.id === String(f.id))) out.push({ id: String(f.id), name: folderName(f.name, f.id) })
      if (page.length < PAGE) break
    }
    return out
  }

  // a folder's name (Synology gives a path); a question that does not work out gives a name from its number - the pictures
  // are what counts, and a NAS that is away answers the next question the same way
  private async folderLabel(kind: 'personal' | 'shared', id: string, signal: AbortSignal): Promise<string> {
    try {
      const d = await this.call<{ folder?: SynoFolder } & Partial<SynoFolder>>({ api: `${SynologyClient.api(kind)}.Browse.Folder`, method: 'get', version: '1', id }, signal)
      const f = d.folder ?? d
      return folderName(f.name, Number(id))
    } catch (err) {
      if (signal.aborted || (err instanceof RemoteRefused && err.status === 404)) throw err
      return folderName(undefined, Number(id))
    }
  }

  /** The pictures in a folder and in the folders below it */
  private async folder(kind: 'personal' | 'shared', id: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    const api = SynologyClient.api(kind)
    const name = await this.folderLabel(kind, id, signal)
    const items = new Map<string, RemoteItem>()
    const extra = JSON.stringify(['thumbnail', 'resolution', 'orientation', 'video_meta'])
    const todo: { id: string; depth: number }[] = [{ id, depth: 0 }]
    const seen = new Set<string>([id])
    while (todo.length) {
      const here = todo.shift()!
      for (let offset = 0; offset < 20_000; offset += PAGE) {
        const d = await this.call<{ list?: SynoItem[] }>({ api: `${api}.Browse.Item`, method: 'list', version: '1', folder_id: here.id, offset: String(offset), limit: String(PAGE), additional: extra }, signal)
        const page = Array.isArray(d.list) ? d.list : []
        for (const x of page) {
          const item = itemOf(x, videos)
          if (item && !items.has(item.ref)) items.set(item.ref, item)
        }
        if (page.length < PAGE) break
      }
      if (here.depth >= FOLDER_DEPTH) continue
      let below: { id: string }[]
      try {
        below = await this.folders(kind, here.id, signal)
      } catch (err) {
        // (a folder below that is gone or not for this account leaves the rest of them as they are)
        if (err instanceof RemoteRefused && (err.status === 404 || err.status === 403)) continue
        throw err
      }
      for (const f of below) {
        if (seen.has(f.id) || seen.size >= FOLDERS_MAX) continue
        seen.add(f.id)
        todo.push({ id: f.id, depth: here.depth + 1 })
      }
    }
    return { name, items: [...items.values()] }
  }

  /** What Synology Photos recognised or the user named in a space: its people, places, tags and subjects */
  async named(kind: 'person' | 'place' | 'tag' | 'subject', signal?: AbortSignal, space: 'personal' | 'shared' = 'personal'): Promise<{ id: string; name: string; count: number; note: string }[]> {
    const api = `${SynologyClient.api(space)}.Browse.${{ person: 'Person', place: 'Geocoding', tag: 'GeneralTag', subject: 'Concept' }[kind]}`
    type Entry = { id?: number; name?: string; item_count?: number; visibility?: boolean; country?: string }
    const out: { id: string; name: string; count: number; note: string }[] = []
    for (let offset = 0; offset < 5000; offset += PAGE) {
      const d = await this.call<{ list?: Entry[] }>({ api, method: 'list', version: '1', offset: String(offset), limit: String(PAGE) }, signal)
      const page = Array.isArray(d.list) ? d.list : []
      for (const x of page) {
        // (a person without a name is one of many faces nobody looked at; a subject switched off in Synology Photos stays off)
        if (!x || !Number.isInteger(x.id) || typeof x.name !== 'string' || !x.name.trim() || x.visibility === false) continue
        out.push({ id: String(x.id), name: x.name.trim(), count: Number(x.item_count) || 0, note: kind === 'place' && typeof x.country === 'string' ? x.country : '' })
      }
      if (page.length < PAGE) break
    }
    return out
  }

  /** The named people (the albums of faces) */
  people(signal?: AbortSignal, space: 'personal' | 'shared' = 'personal'): Promise<{ id: string; name: string; count: number; note: string }[]> {
    return this.named('person', signal, space)
  }

  // the items a list of the personal space gives, page after page up to `max` (newest first when `newest`).
  // `known`: how many pictures the category has - more than that means the filter was not taken (DSM ignores what it does not
  // know) and the whole library came: nothing of it is used.
  private async listed(params: Record<string, string>, signal: AbortSignal, videos: boolean, max: number, newest = false, known?: number): Promise<RemoteItem[]> {
    const extra = JSON.stringify(['thumbnail', 'resolution', 'orientation', 'video_meta'])
    const got: { item: RemoteItem; time: number }[] = []
    let raw = 0
    for (let offset = 0; offset < max; offset += PAGE) {
      const d = await this.call<{ list?: SynoItem[] }>({ version: '1', ...params, offset: String(offset), limit: String(PAGE), additional: extra }, signal)
      const page = Array.isArray(d.list) ? d.list : []
      raw += page.length
      // (the count of a category may be a little behind: some room before it counts as the whole library)
      if (known !== undefined && raw > known + Math.max(20, known * 0.2)) throw new RemoteRefused(404, 'Synology (filter not taken)')
      for (const x of page) {
        const item = itemOf(x, videos)
        if (item) got.push({ item, time: Number(x.time) || 0 })
      }
      if (page.length < PAGE) break
    }
    if (newest) got.sort((a, b) => b.time - a.time)
    const seen = new Set<string>()
    return got
      .map((g) => g.item)
      .filter((x) => !seen.has(x.ref) && !!seen.add(x.ref))
      .slice(0, max)
  }

  /** A smart album: recently added, videos (personal space), a person, a place, a tag, a subject (of either space) */
  private async smart(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    if (ref === 'rec') return { name: 'Zuletzt hinzugefügt', items: await this.listed({ api: 'SYNO.Foto.Browse.RecentlyAdded', method: 'list' }, signal, videos, RECENT_MAX, true) }
    if (ref === 'vid') {
      // (only the clips of the answer: a DSM that does not take the filter gives the whole library, photos too)
      const items = videos ? await this.listed({ api: 'SYNO.Foto.Browse.Item', method: 'list', type: 'video' }, signal, videos, VIDEOS_MAX, true) : []
      return { name: 'Videos', items: items.filter((x) => x.kind === 'video') }
    }
    const space = ref[0] === ref[0].toUpperCase() ? 'shared' : 'personal'
    const api = SynologyClient.api(space)
    const kind = { p: 'person', l: 'place', g: 'tag', c: 'subject' }[ref[0].toLowerCase() as 'p' | 'l' | 'g' | 'c'] as 'person' | 'place' | 'tag' | 'subject'
    const id = ref.slice(1)
    const one = (await this.named(kind, signal, space)).find((x) => x.id === id)
    // (one gone, or without a name now: not there any more)
    if (!one) throw new RemoteRefused(404, 'Synology')
    if (kind === 'subject') {
      // (no filter for it: the search by its name finds nearly the same pictures)
      return { name: one.name, items: await this.listed({ api: `${api}.Search.Search`, method: 'list_item', keyword: one.name }, signal, videos, 20_000) }
    }
    const filter = { person: 'person_id', place: 'geocoding_id', tag: 'general_tag_id' }[kind]
    return { name: one.name, items: await this.listed({ api: `${api}.Browse.Item`, method: 'list', [filter]: id }, signal, videos, 20_000, false, one.count) }
  }

  async album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    const what = SynologyClient.kindOf(ref)
    if (!what) throw new RemoteRefused(404, 'Synology')
    if (what.kind === 'smart') {
      try {
        return await this.smart(what.id, signal, videos)
      } catch (err) {
        if (!(err instanceof SynoNoSuchQuestion) || signal.aborted) throw err
        // (a question every Synology Photos knows: answered, this one has no such smart album - it is not there; not
        // answered either, Synology Photos is not running now and its error goes on as the service being away)
        await this.call({ api: 'SYNO.Foto.Browse.Album', method: 'list', version: '2', offset: '0', limit: '1' }, signal)
        throw new RemoteRefused(404, 'Synology (no such smart album)')
      }
    }
    if (what.kind !== 'album') return this.folder(what.kind, what.id, signal, videos)
    const where = await this.albumParams(ref, signal)
    const name = String((await this.albums(signal)).get(ref)?.name ?? '')
    const items: RemoteItem[] = []
    const extra = JSON.stringify(['thumbnail', 'resolution', 'orientation', 'video_meta'])
    for (let offset = 0; offset < 20_000; offset += PAGE) {
      const d = await this.call<{ list?: SynoItem[] }>({ api: 'SYNO.Foto.Browse.Item', method: 'list', version: '1', offset: String(offset), limit: String(PAGE), additional: extra, ...where }, signal)
      const page = Array.isArray(d.list) ? d.list : []
      for (const x of page) {
        const item = itemOf(x, videos)
        if (item) items.push(item)
      }
      if (page.length < PAGE) break
    }
    return { name, items }
  }

  /** The API and the parameters a picture of a choice is asked with (a folder's pictures need no album) */
  private async source(ref: string, signal?: AbortSignal): Promise<{ api: string; where: Record<string, string> }> {
    const what = SynologyClient.kindOf(ref)
    if (!what) throw new RemoteRefused(404, 'Synology')
    // (a smart album of the shared space - capital letter - has its pictures there)
    if (what.kind === 'smart') return { api: SynologyClient.api(/^[PLGC]/.test(what.id) ? 'shared' : 'personal'), where: {} }
    if (what.kind !== 'album') return { api: SynologyClient.api(what.kind), where: {} }
    return { api: 'SYNO.Foto', where: await this.albumParams(ref, signal) }
  }

  /** A picture: Synology's "xl" (about 1280 px) for the full view and the box, its "sm" for the grid - WebP */
  async picture(albumRef: string, item: { ref: string; ver: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response> {
    const { api, where } = await this.source(albumRef, signal)
    const r = await this.raw(
      { api: `${api}.Thumbnail`, method: 'get', version: '2', mode: 'download', id: item.ref, type: 'unit', size: size === 'full' ? 'xl' : 'sm', cache_key: item.ver, ...(where.passphrase ? { passphrase: where.passphrase } : {}) },
      { signal },
    )
    return this.file(r)
  }

  /** A clip as it is on the NAS (made on the box) */
  async clip(albumRef: string, item: { ref: string }, init: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<globalThis.Response> {
    const { api, where } = await this.source(albumRef, init.signal)
    const r = await this.raw(
      { api: `${api}.Download`, method: 'download', version: '2', unit_id: JSON.stringify([Number(item.ref)]), ...(where.passphrase ? { passphrase: where.passphrase } : {}) },
      { signal: init.signal, timeoutMs: init.timeoutMs ?? 30 * 60_000 },
    )
    return this.file(r)
  }

  /** Whether the NAS is back: Synology Photos answers the login with the albums */
  async check(signal: AbortSignal): Promise<void> {
    await this.albums(signal, true)
  }

  /** The login, asked anew (the assistant's test) */
  async login(signal?: AbortSignal): Promise<void> {
    const r = await this.raw({ api: 'SYNO.Foto.Browse.Album', method: 'list', version: '2', offset: '0', limit: '1' }, { signal, fresh: true })
    await this.json(r)
  }

  // a file DSM sends - or its answer in JSON when it does not (an error)
  private async file(r: globalThis.Response): Promise<globalThis.Response> {
    if (r.ok && r.body && !/json|html/i.test(r.headers.get('content-type') ?? '')) return r
    await this.json(r)
    throw new RemoteRefused(404, 'Synology')
  }
}

/** DSM's answer to a question it does not know (or to every one, while Synology Photos is not running) */
class SynoNoSuchQuestion extends RemoteRefused {}

/** What DSM's error code of a question means for the box */
function synoError(code: number): Error {
  // (no right: 105 the session may not, 402 not for this account)
  if (code === 105 || code === 402) return new RemoteRefused(403, `Synology (${code})`)
  // (not there: 608/609/620/641 - an album or a picture gone, unshared)
  if ([608, 609, 620, 641, 642].includes(code)) return new RemoteRefused(404, `Synology (${code})`)
  // (102-104 and 120: no such question - a smart album this version of Synology Photos does not know, but the same answer
  // comes for every question while Synology Photos is not running, as while its package is updated at night: the service
  // away, the pictures on the box stay. Only a smart album tells the two apart, see `album`)
  if ([102, 103, 104, 120].includes(code)) return new SynoNoSuchQuestion(502, `Synology (${code})`)
  return new RemoteRefused(502, `Synology (${code})`)
}

// an item of an album as the sync takes it; null: not a picture or a clip for the box (no thumbnail yet, a clip without videos)
function itemOf(x: SynoItem, videos: boolean): RemoteItem | null {
  if (!x || !Number.isInteger(x.id)) return null
  const clip = x.type === 'video'
  if (clip && !videos) return null
  if (x.type !== 'photo' && x.type !== 'live' && !clip) return null
  const t = x.additional?.thumbnail
  // (the thumbnail is the picture - and its key says when it changed; one not made yet comes at the next sync)
  if (!t?.cache_key || (!clip && t.xl !== 'ready')) return null
  const time = Number(x.time)
  return {
    ref: String(x.id),
    kind: clip ? 'video' : 'photo',
    ver: String(t.cache_key),
    // (as shown: Synology gives the size already turned)
    w: Number(x.additional?.resolution?.width) || 0,
    h: Number(x.additional?.resolution?.height) || 0,
    taken: Number.isFinite(time) && time > 0 ? new Date(time * 1000).toISOString().slice(0, 19) : null,
    duration: clip ? Math.round((Number(x.additional?.video_meta?.duration) || 0) / 1000) : 0,
  }
}

export type SynologyTest =
  | { ok: true; account: string | null; albums: number; shared: number; pictures: number }
  | { ok: false; error: 'unauthorized' | 'noPhotos' | 'twoFactor' | 'blocked' | 'expired' | 'unreachable' }
  | { ok: false; error: 'certificate'; certificate: DsmCertificateInfo | null }

/** The test of the assistant: the certificate, the login at DSM, and the account's albums */
export async function testSynology(client: SynologyClient, account: string | null): Promise<SynologyTest> {
  try {
    await client.login(AbortSignal.timeout(20_000))
    const list = await client.albums(AbortSignal.timeout(20_000), true)
    const all = [...list.values()]
    return { ok: true, account, albums: all.length, shared: all.filter((a) => a.shared).length, pictures: all.reduce((n, a) => n + (Number(a.item_count) || 0), 0) }
  } catch (err) {
    if (err instanceof DsmLoginRefused) {
      const c = err.code
      return { ok: false, error: c === 402 ? 'noPhotos' : c === 403 || c === 404 || c === 406 ? 'twoFactor' : c === 407 ? 'blocked' : c >= 408 && c <= 410 ? 'expired' : 'unauthorized' }
    }
    if (err instanceof DsmCertificateError) return { ok: false, error: 'certificate', certificate: err.certificate ?? null }
    if (err instanceof RemoteRefused && err.status === 403) return { ok: false, error: 'noPhotos' }
    return { ok: false, error: 'unreachable' }
  }
}

/* ---------- the app's side ---------- */

/** The login as kept; null: none, or its password cannot be read on this box */
function keptTarget(deps: PhotoSynologyDeps, cfg: MupiboxConfig | undefined): DsmTarget | null {
  const s = synologySettings(cfg)
  if (!s.url || !s.account || !s.password) return null
  const password = deps.secret ? deps.secret.decrypt(s.password) : s.password
  return password ? { url: s.url, account: s.account, password, fingerprint: s.certFingerprint || undefined } : null
}

function synologyClient(deps: PhotoSynologyDeps, cfg: MupiboxConfig | undefined): SynologyClient | null {
  const target = synologySettings(cfg).enabled ? keptTarget(deps, cfg) : null
  return target ? new SynologyClient(target) : null
}

/**
 *   GET  /api/app/photos/synology            the settings, the NAS (its account), the sync's state, albums, cache
 *   POST /api/app/photos/synology/test       the login of the NAS's account and its albums
 *   GET  /api/app/photos/synology/albums     the albums the account sees (to tick) with their numbers
 *   GET  /api/app/photos/synology/folders    the folders of the personal or the shared space (?space=&id=) to tick
 *   GET  /api/app/photos/synology/smart      the smart albums (recently added, videos, people, places, tags, subjects) to tick
 *   GET  /api/app/photos/synology/thumb/:id  an album's picture for that list (through the box)
 *   POST /api/app/photos/synology            {enabled?, albumIds?, keepCopy?, syncMinutes?, cacheLimitMb?, port?}
 *   POST /api/app/photos/synology/sync       a sync now
 *   POST /api/app/photos/synology/remove     off: the albums and their pictures off the box
 */
export function registerPhotoSynologyRoutes(router: Router, deps: PhotoSynologyDeps): RemotePhotoSync {
  const sync = new RemotePhotoSync(
    {
      source: 'synology',
      label: 'Synology Photos',
      stateFile: STATE_FILE,
      photoDir: SYNOLOGY_PHOTO_DIR,
      liveDir: SYNOLOGY_LIVE_DIR,
      settings: (cfg) => {
        const s = synologySettings(cfg)
        // (switched on with a login - one switched on before it had a login of its own waits for the assistant)
        return { set: s.enabled && !!s.url && !!s.account && !!s.password, albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb }
      },
      client: (cfg) => synologyClient(deps, cfg),
      unreadable: 'the password cannot be read on this box, the pictures stay - enter it again in the app',
    },
    deps.getMupiboxConfig,
  )
  registerRemote(sync)
  sync.start()
  // (a suggestion for the address: the host of the NAS signed in to under Bibliothek › NAS)
  const nasHost = () => {
    const a = obj(obj(deps.getMupiboxConfig()).nas).address
    if (typeof a !== 'string' || !a.trim()) return null
    try {
      return new URL(/^https?:\/\//i.test(a.trim()) ? a.trim() : `http://${a.trim()}`).hostname || null
    } catch {
      return null
    }
  }

  const answer = async () => {
    const s = synologySettings(deps.getMupiboxConfig())
    const list = (await albums()).filter((a) => a.source === 'synology')
    return {
      settings: { enabled: s.enabled, url: s.url, account: s.account, hasPassword: !!s.password, certFingerprint: s.certFingerprint, albumIds: s.albumIds, keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb },
      nasHost: nasHost(),
      connected: s.enabled && !!s.url && !!s.account && !!s.password,
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: (await photoBytes(SYNOLOGY_PHOTO_DIR)) + (await photoBytes(SYNOLOGY_LIVE_DIR)),
    }
  }
  // (the album list and its pictures before it is switched on: with the login as kept)
  const tryClient = () => {
    const target = keptTarget(deps, deps.getMupiboxConfig())
    return target ? new SynologyClient(target) : null
  }

  router.get('/photos/synology', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  // the test: {url, account, password?, fingerprint?} - without a password the one kept, only for the address and the
  // account it was given for; a fingerprint: the certificate confirmed in the app
  router.post('/photos/synology/test', requireSession, requireCsrf, async (req, res) => {
    const b = obj(req.body)
    const url = cleanSynologyUrl(b.url)
    if (!url) return void res.status(400).json({ error: 'url' })
    const account = typeof b.account === 'string' ? b.account.trim() : ''
    if (!account || account.length > 100) return void res.status(400).json({ error: 'account' })
    let password = typeof b.password === 'string' ? b.password : ''
    if (!password) {
      const kept = keptTarget(deps, deps.getMupiboxConfig())
      if (!kept || kept.url !== url || kept.account !== account) return void res.status(400).json({ error: 'password' })
      password = kept.password
    }
    const fingerprint = typeof b.fingerprint === 'string' && FINGERPRINT.test(b.fingerprint) ? b.fingerprint.toUpperCase() : undefined
    const kept = synologySettings(deps.getMupiboxConfig())
    // (the certificate confirmed before, for the same address)
    const pin = fingerprint ?? (kept.url === url && kept.certFingerprint ? kept.certFingerprint : undefined)
    const result = await testSynology(new SynologyClient({ url, account, password, fingerprint: pin }), account)
    res.json(result.ok ? { ...result, fingerprint: pin ?? '' } : result)
  })

  router.get('/photos/synology/albums', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = tryClient()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    try {
      const list = await client.albums(AbortSignal.timeout(20_000), true)
      res.json({
        albums: [...list.values()]
          .map((a) => ({ id: String(a.id), name: String(a.name ?? ''), count: Number(a.item_count) || 0, shared: a.shared, thumb: a.additional?.thumbnail?.cache_key ? String(a.id) : null }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      })
    } catch (err) {
      res.status(err instanceof RemoteRefused && (err.status === 401 || err.status === 403) ? 401 : 502).json({ error: err instanceof RemoteRefused ? 'unauthorized' : 'unreachable' })
    }
  })

  // the folders of a space of Synology Photos to tick: ?space=personal|shared&id=<folder, 0: the top>
  router.get('/photos/synology/folders', requireSession, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = tryClient()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    const space = req.query.space === 'shared' ? 'shared' : req.query.space === 'personal' ? 'personal' : null
    const id = typeof req.query.id === 'string' && /^\d{1,12}$/.test(req.query.id) ? req.query.id : '0'
    if (!space) return void res.status(400).json({ error: 'space' })
    try {
      const list = await client.folders(space, id, AbortSignal.timeout(20_000))
      const prefix = space === 'shared' ? 't' : 'f'
      res.json({
        space,
        id,
        folders: list.map((f) => ({ id: f.id, ref: `${prefix}${f.id}`, name: f.name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      })
    } catch (err) {
      // (the shared space may be off, or not for this account: the app says so instead of "not reachable")
      if (err instanceof RemoteRefused && (err.status === 403 || err.status === 404 || err.status === 502)) return void res.status(409).json({ error: 'not_available' })
      res.status(err instanceof RemoteRefused && err.status === 401 ? 401 : 502).json({ error: err instanceof RemoteRefused ? 'unauthorized' : 'unreachable' })
    }
  })

  // the smart albums to tick: recently added and videos of the personal space; people, places, tags and subjects of both spaces
  router.get('/photos/synology/smart', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const client = tryClient()
    if (!client) return void res.status(409).json({ error: 'not_connected' })
    // (videos only where the display shows them: "Videos anzeigen" and the pictures kept on the box - live albums show no
    // clips; one chosen before stays in the list, to be taken out)
    const cfg = deps.getMupiboxConfig()
    const s = synologySettings(cfg)
    const videosShown = photoSettings(cfg).showVideos && s.keepCopy
    const collections = [{ ref: 'rec', kind: 'recent' }, ...(videosShown || s.albumIds.includes('vid') ? [{ ref: 'vid', kind: 'videos' }] : [])]
    const kinds = [
      ['people', 'person', 'p'],
      ['places', 'place', 'l'],
      ['tags', 'tag', 'g'],
      ['subjects', 'subject', 'c'],
    ] as const
    const spaces = ['personal', 'shared'] as const
    // (each list on its own: a DSM without one - or with its recognition off - still gives the others)
    const wanted = kinds.flatMap(([key, kind, prefix]) => spaces.map((space) => ({ key, kind, space, prefix: space === 'shared' ? prefix.toUpperCase() : prefix })))
    const results = await Promise.allSettled(wanted.map((w) => client.named(w.kind, AbortSignal.timeout(20_000), w.space)))
    const refused = results.find((r) => r.status === 'rejected' && r.reason instanceof RemoteRefused && r.reason.status === 401)
    if (refused) return void res.status(401).json({ error: 'unauthorized' })
    if (results.every((r) => r.status === 'rejected' && !(r.reason instanceof RemoteRefused))) return void res.status(502).json({ error: 'unreachable' })
    const body: Record<string, unknown> = { collections }
    for (const [key] of kinds) body[key] = []
    wanted.forEach((w, i) => {
      const r = results[i]
      if (r.status !== 'fulfilled') return
      const list = r.value
        .map((x) => ({ ref: `${w.prefix}${x.id}`, name: x.name, count: x.count, note: x.note, space: w.space }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      ;(body[w.key] as unknown[]).push(...list)
    })
    res.json(body)
  })

  router.get('/photos/synology/thumb/:id', requireSession, async (req: Request, res: Response) => {
    const client = tryClient()
    const id = String(req.params.id)
    if (!client || !/^\d{1,12}$/.test(id)) return void res.status(404).end()
    try {
      const a = (await client.albums()).get(id)
      const t = a?.additional?.thumbnail
      if (!t?.cache_key || !Number.isInteger(t.unit_id)) return void res.status(404).end()
      const r = await client.picture(id, { ref: String(t.unit_id), ver: String(t.cache_key) }, 'grid')
      const buf = Buffer.from(await r.arrayBuffer())
      res.setHeader('Content-Type', typeOf(buf))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buf)
    } catch {
      res.status(404).end()
    }
  })

  router.post('/photos/synology', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    const before = synologySettings(deps.getMupiboxConfig())
    try {
      await deps.updateMupiboxConfig((cfg) => {
        error = applySynologySettings(cfg, req.body, deps.secret ? (x) => deps.secret!.encrypt(x) : undefined)
      })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    const after = synologySettings(deps.getMupiboxConfig())
    // (switched on, albums, the way they are kept or the login changed: a sync takes it over at once)
    if (
      after.enabled &&
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
  router.post('/photos/synology/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/synology/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/synology/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const photos = { ...obj(cfg.photos) }
        const sources = { ...obj(photos.sources) }
        delete sources.synology
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
