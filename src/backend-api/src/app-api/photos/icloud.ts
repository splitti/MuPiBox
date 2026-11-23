// The photo display's shared albums of iCloud (5.1, Bibliothek › Fotos › iCloud): a shared album of the iPhone's Photos app
// with its public website switched on ("Öffentliche Website") - its link (https://photos.icloud.com/shared/album/<key>) is
// all the box needs, no Apple account. The box reads the album the way Apple's own web page does for a visitor (CloudKit:
// the link resolved to the album and a short-lived key, then its records) - not an official interface: should Apple change
// it, these albums are away until the box follows. The owner's name and address in Apple's answer are never kept or shown.
// Pictures: Apple's own renditions (a JPEG of about 2048 px, a small one for the grid); clips: its MP4 of 720p (H.264), so
// live albums show clips too. The sync, the two ways and the live pictures are the same as for every service (remote.ts).

import path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../../models/mupibox-config.model'
import { requireCsrf, requireSession } from '../middleware'
import { CACHE_LIMITS_MB, type RemoteClient, type RemoteItem, RemoteAway, RemotePhotoSync, RemoteRefused, REMOTE_REF, registerRemote, SYNC_MINUTES } from './remote'
import { photoSettings } from './settings'
import { albums, ICLOUD_LIVE_DIR, ICLOUD_PHOTO_DIR, PHOTOS_DIR, photoBytes } from './store'

export interface PhotoIcloudDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const ALBUMS_MAX = 30
const STATE_FILE = path.join(PHOTOS_DIR, 'icloud-sync.json')
const LABEL = 'iCloud'
// an album's key in its link
const KEY = /^[A-Za-z0-9_-]{10,40}$/
const CLOUDKIT = 'https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production'

export interface IcloudAlbumSetting {
  key: string
  /** its name when it was added (the sync takes the current one) */
  title: string
}

export interface IcloudSettings {
  albums: IcloudAlbumSetting[]
  keepCopy: boolean
  syncMinutes: (typeof SYNC_MINUTES)[number]
  cacheLimitMb: (typeof CACHE_LIMITS_MB)[number]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/**
 * The album's key from its link: https://photos.icloud.com/shared/album/<key> (also with www.icloud.com); 'old' for a link
 * of the former kind (www.icloud.com/sharedalbum/#B…), which Apple no longer answers that way; null: no album link.
 */
export function icloudKeyOf(raw: unknown): string | 'old' | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (/^(https:\/\/)?(www\.)?icloud\.com\/sharedalbum\/#?B/i.test(t)) return 'old'
  const m = /^(?:https:\/\/)?(?:photos\.|www\.)?icloud\.com\/(?:photos\/)?shared\/album\/([A-Za-z0-9_-]{10,40})\/?(?:[?#].*)?$/i.exec(t)
  return m ? m[1] : null
}

export function icloudSettings(cfg: unknown): IcloudSettings {
  const n = obj(obj(obj(obj(cfg).photos).sources).icloud)
  const list = Array.isArray(n.albums) ? n.albums.map(obj).filter((a) => typeof a.key === 'string' && KEY.test(a.key)) : []
  const seen = new Set<string>()
  return {
    albums: list
      .filter((a) => !seen.has(a.key as string) && seen.add(a.key as string))
      .slice(0, ALBUMS_MAX)
      .map((a) => ({ key: a.key as string, title: typeof a.title === 'string' ? a.title.slice(0, 80) : '' })),
    keepCopy: n.keepCopy !== false,
    syncMinutes: (SYNC_MINUTES as readonly number[]).includes(Number(n.syncMinutes)) ? (Number(n.syncMinutes) as IcloudSettings['syncMinutes']) : 360,
    cacheLimitMb: (CACHE_LIMITS_MB as readonly number[]).includes(Number(n.cacheLimitMb)) ? (Number(n.cacheLimitMb) as IcloudSettings['cacheLimitMb']) : 2048,
  }
}

/** A change from the app, checked (a wrong field: the reason, nothing written): an album added or removed, the settings */
export function applyIcloudSettings(cfg: Record<string, unknown>, patch: unknown): string | null {
  const p = obj(patch)
  const next: Record<string, unknown> = { ...obj(obj(obj(cfg.photos).sources).icloud) }
  let list = icloudSettings(cfg).albums
  if (p.add !== undefined) {
    const a = obj(p.add)
    if (typeof a.key !== 'string' || !KEY.test(a.key)) return 'add'
    if (!list.some((x) => x.key === a.key)) {
      if (list.length >= ALBUMS_MAX) return 'full'
      list = [...list, { key: a.key, title: typeof a.title === 'string' ? a.title.slice(0, 80) : '' }]
    }
  }
  if (p.remove !== undefined) {
    if (typeof p.remove !== 'string' || !KEY.test(p.remove)) return 'remove'
    list = list.filter((x) => x.key !== p.remove)
  }
  next.albums = list
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
  photos.sources = { ...obj(photos.sources), icloud: next }
  cfg.photos = photos
  return null
}

/* ---------- talking to iCloud ---------- */

type Field = { value?: unknown; type?: string }
type CkRecord = { recordName?: string; recordType?: string; recordChangeTag?: string; deleted?: boolean; fields?: Record<string, Field> }
interface Access {
  zoneID: unknown
  token: string
  partition: string
  title: string
  until: number
}
interface AlbumRecords {
  name: string
  items: RemoteItem[]
  /** per item: Apple's download addresses of its renditions (valid about an hour) */
  urls: Map<string, { grid?: string; full?: string; clip?: string }>
  until: number
}

// the key to an album (20 minutes), its records with their addresses (until the first of them runs out)
const accesses = new Map<string, Access>()
const recordsOf = new Map<string, AlbumRecords>()
// the reads of an album for the pictures shown live, while they run: one for all who ask (the grid asks for six at a
// time - six reads of the whole album, all its records in memory, and Apple answered 429)
const reading = new Map<string, Promise<AlbumRecords>>()
// Apple refused the key of an album resolved before (before its time): resolved anew, once
class KeyRefused extends RemoteAway {}

const num = (f: Field | undefined): number => (typeof f?.value === 'number' ? f.value : Number(f?.value) || 0)
const str = (f: Field | undefined): string => (typeof f?.value === 'string' ? f.value : '')
// a rendition's download address ("${f}" stands for a file name) and when it runs out (its "e", seconds)
function rendition(f: Field | undefined, name: string): { url: string; until: number } | null {
  const v = obj(f?.value)
  if (typeof v.downloadURL !== 'string' || !/^https:\/\//.test(v.downloadURL)) return null
  const url = v.downloadURL.replace('${f}', name)
  const e = Number(new URL(url).searchParams.get('e'))
  return { url, until: Number.isFinite(e) && e > 0 ? e * 1000 : Date.now() + 30 * 60_000 }
}

export class IcloudClient implements RemoteClient {
  /** Apple makes an MP4 (H.264) of each clip: shown live as it comes */
  readonly liveClips = true

  constructor(private readonly keys: string[]) {}

  // resolve: the album's link resolved - only Apple's no there means the album is gone
  private async post(url: string, body: unknown, signal?: AbortSignal, resolve = false): Promise<Record<string, unknown>> {
    let r: globalThis.Response
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)]), redirect: 'error' })
    } catch (err) {
      if (signal?.aborted) throw err
      throw new RemoteAway(`${LABEL}: ${(err as Error).message}`)
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => undefined)
      if (r.status === 429 || r.status >= 500) throw new RemoteRefused(r.status, LABEL)
      // (an album deleted: Apple says "not found" when it is resolved - the album is gone. Any other no - a change at
      // Apple, a refused request - is not taken for "gone": that deleted the albums kept on the box)
      if (r.status === 404 || (resolve && r.status === 410)) throw new RemoteRefused(404, LABEL)
      // (reading a resolved album, any other no - its key refused before its time, a change at Apple: not taken for
      // "gone" - that deleted the albums kept on the box; tried again at the next sync)
      throw r.status === 401 || r.status === 403 ? new KeyRefused(`${LABEL}: ${r.status}`) : new RemoteAway(`${LABEL}: ${r.status}`)
    }
    try {
      return obj(await r.json())
    } catch {
      throw new RemoteAway(`${LABEL}: no JSON`)
    }
  }

  /** The album's link resolved: where it is, a key for it (20 minutes), its name */
  async access(key: string, signal?: AbortSignal, fresh = false): Promise<Access> {
    const kept = accesses.get(key)
    if (!fresh && kept && Date.now() < kept.until) return kept
    const q = `remapEnums=true&getCurrentSyncToken=true&sharing_url_key=${encodeURIComponent(key)}`
    const j = await this.post(`${CLOUDKIT}/public/records/resolve?${q}`, { shortGUIDs: [{ value: key }] }, signal, true)
    const r = obj((Array.isArray(j.results) ? j.results : [])[0])
    // (Apple answers many a no inside a "200": only "not there" or "not allowed" is an album gone; throttled, try again
    // later, an error of its own - the album is away for now, the pictures on the box stay)
    if (typeof r.serverErrorCode === 'string') {
      if (/^(NOT_FOUND|ACCESS_DENIED|ZONE_NOT_FOUND|SHARE_NOT_FOUND)$/.test(r.serverErrorCode)) throw new RemoteRefused(404, LABEL)
      throw new RemoteAway(`${LABEL}: ${r.serverErrorCode}`)
    }
    const anon = obj(r.anonymousPublicAccess)
    const share = obj(r.share)
    if (!r.zoneID || typeof anon.token !== 'string' || typeof anon.databasePartition !== 'string' || !/^https:\/\/[a-z0-9-]+\.icloud\.com(:443)?$/i.test(anon.databasePartition)) {
      // (resolved, but without public access: the album is no longer public)
      throw new RemoteRefused(404, LABEL)
    }
    const ttl = Number(anon.tokenTTL) || 20 * 60_000
    const access = { zoneID: r.zoneID, token: anon.token, partition: anon.databasePartition, title: str(obj(share.fields)['cloudkit.title'] as Field).slice(0, 80), until: Date.now() + Math.max(60_000, ttl - 60_000) }
    accesses.set(key, access)
    return access
  }

  /** The album's records: its pictures and clips with their renditions' addresses */
  private async read(key: string, signal: AbortSignal | undefined, videos: boolean, fresh = false): Promise<AlbumRecords> {
    const a = await this.access(key, signal, fresh)
    const q = `remapEnums=true&getCurrentSyncToken=true&sharing_url_key=${encodeURIComponent(key)}&publicAccessAuthToken=${encodeURIComponent(a.token)}`
    const all: CkRecord[] = []
    let syncToken: string | undefined
    for (let page = 0; page < 200; page++) {
      let j: Record<string, unknown>
      try {
        j = await this.post(`${a.partition}/database/1/com.apple.photos.cloud/production/shared/changes/zone?${q}`, { zones: [{ zoneID: a.zoneID, reverse: false, ...(syncToken ? { syncToken } : {}) }] }, signal)
      } catch (err) {
        // (the key refused before its time: the link resolved anew - a link no longer public is "gone" there)
        if (err instanceof KeyRefused && !fresh) return this.read(key, signal, videos, true)
        throw err
      }
      const z = obj((Array.isArray(j.zones) ? j.zones : [])[0])
      // (an error of the zone inside a "200": not an empty album - an empty one dropped all its pictures kept on the box)
      if (typeof z.serverErrorCode === 'string' || !Array.isArray(z.records)) {
        if (z.serverErrorCode === 'ACCESS_DENIED' && !fresh) return this.read(key, signal, videos, true)
        throw new RemoteAway(`${LABEL}: ${typeof z.serverErrorCode === 'string' ? z.serverErrorCode : 'no records'}`)
      }
      if (Array.isArray(z.records)) all.push(...(z.records as CkRecord[]))
      syncToken = typeof z.syncToken === 'string' ? z.syncToken : undefined
      if (z.moreComing !== true || !syncToken) break
    }
    const masters = new Map<string, CkRecord>()
    for (const r of all) if (r.recordType === 'CPLMaster' && !r.deleted && r.recordName) masters.set(r.recordName, r)
    const items: RemoteItem[] = []
    const urls = new Map<string, { grid?: string; full?: string; clip?: string }>()
    let until = Date.now() + 60 * 60_000
    for (const r of all) {
      if (r.recordType !== 'CPLAsset' || r.deleted || !r.recordName || !REMOTE_REF.test(r.recordName)) continue
      const f = r.fields ?? {}
      if (num(f.isHidden) || num(f.trashReason)) continue
      const m = masters.get(String(obj(f.masterRef?.value).recordName ?? ''))
      if (!m) continue
      const mf = m.fields ?? {}
      const clip = num(mf.dataClassType) === 2 || /movie|mpeg-4|video/i.test(str(mf.itemType))
      if (clip && !videos) continue
      // (the asset's own renditions are the edited picture; without an edit only the master has them)
      const grid = rendition(f.resJPEGThumbRes, 'thumb.jpg') ?? rendition(mf.resJPEGThumbRes, 'thumb.jpg')
      const full = rendition(f.resJPEGMedRes, 'photo.jpg') ?? rendition(mf.resJPEGMedRes, 'photo.jpg')
      const movie = clip ? (rendition(f.resVidMedRes, 'clip.mp4') ?? rendition(mf.resVidMedRes, 'clip.mp4') ?? rendition(mf.resVidSmallRes, 'clip.mp4')) : null
      if (!full || (clip && !movie)) continue
      for (const x of [grid, full, movie]) if (x) until = Math.min(until, x.until)
      urls.set(r.recordName, { grid: grid?.url, full: full.url, clip: movie?.url })
      const w = num(f.resJPEGMedWidth) || num(mf.resJPEGMedWidth)
      const h = num(f.resJPEGMedHeight) || num(mf.resJPEGMedHeight)
      const at = num(f.assetDate)
      items.push({
        ref: r.recordName,
        kind: clip ? 'video' : 'photo',
        ver: `${r.recordChangeTag ?? ''}.${m.recordChangeTag ?? ''}`,
        w,
        h,
        // (the time where it was taken: Apple keeps the moment and the zone's offset)
        taken: at > 0 ? new Date(at + num(f.timeZoneOffset) * 1000).toISOString().slice(0, 19) : null,
        duration: clip ? Math.round(num(f.duration) / 1000) : 0,
      })
    }
    const result = { name: a.title, items, urls, until }
    recordsOf.set(key, result)
    return result
  }

  async album(ref: string, signal: AbortSignal, videos: boolean): Promise<{ name: string; items: RemoteItem[] }> {
    if (!KEY.test(ref)) throw new RemoteRefused(404, LABEL)
    const r = await this.read(ref, signal, videos)
    return { name: r.name, items: r.items }
  }

  // an item's address: from the records read (read again when its addresses run out within two minutes)
  private async urlOf(albumRef: string, ref: string, kind: 'grid' | 'full' | 'clip', signal?: AbortSignal): Promise<string> {
    let r = recordsOf.get(albumRef)
    if (!r || Date.now() > r.until - 120_000 || !r.urls.has(ref)) {
      // (one read for all who ask meanwhile - without the signal of the first: its end would end it for the others;
      // each of its requests has its own time limit)
      let p = reading.get(albumRef)
      if (!p) {
        p = this.read(albumRef, undefined, true).finally(() => reading.delete(albumRef))
        reading.set(albumRef, p)
      }
      r = await p
    }
    const u = r.urls.get(ref)?.[kind] ?? (kind === 'grid' ? r.urls.get(ref)?.full : undefined)
    if (!u) throw new RemoteRefused(404, LABEL)
    return u
  }

  private async download(url: string, init: { signal?: AbortSignal; range?: string; timeoutMs?: number }): Promise<globalThis.Response> {
    let r: globalThis.Response
    try {
      r = await fetch(url, {
        headers: init.range ? { Range: init.range } : {},
        signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(init.timeoutMs ?? 30_000)]),
        redirect: 'error',
      })
    } catch (err) {
      if (init.signal?.aborted) throw err
      throw new RemoteAway(`${LABEL}: ${(err as Error).message}`)
    }
    if (!(r.ok || r.status === 206) || !r.body) {
      await r.body?.cancel().catch(() => undefined)
      throw new RemoteRefused(r.status, LABEL)
    }
    return r
  }

  // a rendition fetched; an address run out meanwhile (410, 403): the records read again, once
  private async fetchItem(albumRef: string, ref: string, kind: 'grid' | 'full' | 'clip', init: { signal?: AbortSignal; range?: string; timeoutMs?: number }): Promise<globalThis.Response> {
    try {
      return await this.download(await this.urlOf(albumRef, ref, kind, init.signal), init)
    } catch (err) {
      if (!(err instanceof RemoteRefused && (err.status === 410 || err.status === 403))) throw err
      recordsOf.delete(albumRef)
      return this.download(await this.urlOf(albumRef, ref, kind, init.signal), init)
    }
  }

  picture(albumRef: string, item: { ref: string }, size: 'full' | 'grid', signal?: AbortSignal): Promise<globalThis.Response> {
    return this.fetchItem(albumRef, item.ref, size, { signal })
  }

  clip(albumRef: string, item: { ref: string }, init: { signal?: AbortSignal; range?: string; timeoutMs?: number }): Promise<globalThis.Response> {
    return this.fetchItem(albumRef, item.ref, 'clip', { ...init, timeoutMs: init.timeoutMs ?? 30 * 60_000 })
  }

  /** Whether iCloud is back: the first album's link resolves again */
  async check(signal: AbortSignal): Promise<void> {
    if (this.keys[0]) await this.access(this.keys[0], signal, true)
  }
}

export type IcloudTest =
  | { ok: true; key: string; title: string; photos: number; videos: number }
  | { ok: false; error: 'link' | 'oldLink' | 'gone' | 'unreachable' }

/** The test of a link: an album there, public, its name and how many pictures and clips (nothing about its owner) */
export async function testIcloud(link: unknown): Promise<IcloudTest> {
  const key = icloudKeyOf(link)
  if (key === 'old') return { ok: false, error: 'oldLink' }
  if (!key) return { ok: false, error: 'link' }
  try {
    const c = new IcloudClient([key])
    const a = await c.access(key, AbortSignal.timeout(20_000), true)
    const r = await c.album(key, AbortSignal.timeout(30_000), true)
    return { ok: true, key, title: a.title, photos: r.items.filter((x) => x.kind === 'photo').length, videos: r.items.filter((x) => x.kind === 'video').length }
  } catch (err) {
    if (err instanceof RemoteRefused && err.status === 404) return { ok: false, error: 'gone' }
    return { ok: false, error: 'unreachable' }
  }
}

/* ---------- the app's side ---------- */

/**
 *   GET  /api/app/photos/icloud          the albums (link keys and names), the settings, the sync's state, cache
 *   POST /api/app/photos/icloud/add      {link} - tested, then added (a sync takes it over)
 *   POST /api/app/photos/icloud          {remove?, keepCopy?, syncMinutes?, cacheLimitMb?}
 *   POST /api/app/photos/icloud/sync     a sync now
 *   POST /api/app/photos/icloud/remove   off: every album and its pictures off the box
 */
export function registerPhotoIcloudRoutes(router: Router, deps: PhotoIcloudDeps): RemotePhotoSync {
  const sync = new RemotePhotoSync(
    {
      source: 'icloud',
      label: LABEL,
      stateFile: STATE_FILE,
      photoDir: ICLOUD_PHOTO_DIR,
      liveDir: ICLOUD_LIVE_DIR,
      settings: (cfg) => {
        const s = icloudSettings(cfg)
        return { set: s.albums.length > 0, albumIds: s.albums.map((a) => a.key), keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb }
      },
      client: (cfg) => {
        const s = icloudSettings(cfg)
        return s.albums.length ? new IcloudClient(s.albums.map((a) => a.key)) : null
      },
      unreadable: 'no album',
    },
    deps.getMupiboxConfig,
  )
  registerRemote(sync)
  sync.start()

  const answer = async () => {
    const s = icloudSettings(deps.getMupiboxConfig())
    const list = (await albums()).filter((a) => a.source === 'icloud')
    return {
      settings: { keepCopy: s.keepCopy, syncMinutes: s.syncMinutes, cacheLimitMb: s.cacheLimitMb },
      // (each album with its name on the box when it is there, its count)
      albumList: s.albums.map((a) => {
        const on = list.find((x) => x.ref === a.key)
        return { key: a.key, title: on?.title || a.title, count: on?.assets.length ?? null }
      }),
      connected: s.albums.length > 0,
      sync: sync.status(),
      albums: list.length,
      pictures: list.reduce((n, a) => n + a.assets.length, 0),
      cacheBytes: (await photoBytes(ICLOUD_PHOTO_DIR)) + (await photoBytes(ICLOUD_LIVE_DIR)),
    }
  }
  const save = async (patch: unknown): Promise<string | null> => {
    let error: string | null = null
    await deps.updateMupiboxConfig((cfg) => {
      error = applyIcloudSettings(cfg, patch)
    })
    return error
  }

  router.get('/photos/icloud', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await answer())
  })

  router.post('/photos/icloud/add', requireSession, requireCsrf, async (req, res) => {
    const test = await testIcloud(obj(req.body).link)
    if (!test.ok) return void res.json({ ...test, ...(await answer()) })
    let error: string | null
    try {
      error = await save({ add: { key: test.key, title: test.title } })
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    void sync.run()
    res.json({ ...test, ...(await answer()) })
  })

  router.post('/photos/icloud', requireSession, requireCsrf, async (req, res) => {
    const before = icloudSettings(deps.getMupiboxConfig())
    let error: string | null
    try {
      error = await save(req.body)
    } catch {
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    if (error) return void res.status(400).json({ error })
    const after = icloudSettings(deps.getMupiboxConfig())
    // (the last album taken away: no sync any more - its pictures go at once; one of several, the way they are kept: a sync
    // takes it over at once)
    if (!after.albums.length && before.albums.length) await sync.removeAll()
    else if (before.keepCopy !== after.keepCopy || before.albums.length !== after.albums.length) void sync.run()
    res.json(await answer())
  })

  // the running sync stopped: what came so far stays, the next one at its time
  router.post('/photos/icloud/sync/cancel', requireSession, requireCsrf, async (_req, res) => {
    sync.cancel()
    await new Promise((r) => setTimeout(r, 500))
    res.json(await answer())
  })

  router.post('/photos/icloud/sync', requireSession, requireCsrf, async (_req, res) => {
    if (!photoSettings(deps.getMupiboxConfig()).enabled) return void res.status(409).json({ error: 'photos_off' })
    void sync.run()
    await new Promise((r) => setTimeout(r, 300))
    res.json(await answer())
  })

  router.post('/photos/icloud/remove', requireSession, requireCsrf, async (_req, res) => {
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const photos = { ...obj(cfg.photos) }
        const sources = { ...obj(photos.sources) }
        delete sources.icloud
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
