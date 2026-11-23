// Jellyfin's pictures for the display and the app (docs/jellyfin-5.1.md): /api/jellyfin/image/<id>?w=<width> - fetched
// with the box's token (it never leaves the box) and kept in the cache, so a cover shows while Jellyfin is away too.
// A kept picture is asked for again after a week (a new cover in Jellyfin comes then).

import { promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Express, Request, Response } from 'express'
import { localOnly, localOrElternSession } from '../request-guard'
import type { JellyfinSession } from './client'
import { JellyfinError, request, requestJson } from './client'
import { artistAlbums, type EntryKind, isJellyfinId, tracksOf } from './library'

export interface JellyfinMediaDeps {
  /** the box's session with Jellyfin, null when not signed in or switched off */
  session: () => JellyfinSession | null
  /** "für schwaches WLAN umwandeln" (MP3 192 kbit) */
  transcode: () => boolean
  /** "Fortschritt mit Jellyfin teilen" (J5) */
  shareProgress: () => boolean
  /** what Jellyfin has as played to its end: the box's green tick (heard.ts) */
  heardFinished?: (key: string) => void
  cacheDir: string
}

const WIDTHS = [160, 400, 800]
const FRESH_MS = 7 * 24 * 3600 * 1000
// (at most this many pictures kept - a big library browsed in the app)
const MAX_FILES = 3000

export const imageWidth = (v: unknown) => {
  const n = Number(v)
  return WIDTHS.find((w) => w >= (Number.isFinite(n) && n > 0 ? n : 400)) ?? 800
}

export interface JellyfinMedia {
  /** whether Jellyfin answered the last look (once a minute while signed in; true until the first one) */
  reachable: () => boolean
  /** "played" in Jellyfin as the box's green tick, for the library's entries - asked at most every 10 minutes */
  syncTicks: (entries: () => { kind: string; id: string }[]) => void
  /** another user came into place (users.ts): his library gets its ticks anew, at the next look */
  forgetTicks: () => void
}

export function registerJellyfinMedia(app: Express, deps: JellyfinMediaDeps): JellyfinMedia {
  // J5: the tracks reported as started and not stopped yet; places not to overwrite (track -> seconds); ticks taken over
  const open = new Set<string>()
  const keepPlace = new Map<string, number>()
  const ticked = new Set<string>()
  // (whether Jellyfin answers: away - a server off or asleep - the display leaves its entries out, as TIDAL switched off)
  let answers = true
  const look = async () => {
    const s = deps.session()
    if (!s) return
    try {
      const r = await request(s, s, '/System/Ping', { timeoutMs: 5000 })
      await r.body?.cancel().catch(() => undefined)
      answers = r.ok
    } catch {
      answers = false
    }
  }
  setInterval(() => void look(), 60000).unref()
  void look()
  let ticksAt = 0
  const dir = path.join(deps.cacheDir, 'jellyfin-covers')
  let pruning = false
  let prunedAt = 0
  const prune = async () => {
    // (at most once a minute, and then down to 90 %: a big library browsed in the app read the whole folder for every
    // new picture once it was full)
    if (pruning || Date.now() - prunedAt < 60000) return
    pruning = true
    prunedAt = Date.now()
    try {
      const names = await fsp.readdir(dir)
      if (names.length <= MAX_FILES) return
      // (by last access: atime set on a hit, see below - pictures of the library looked at stay)
      const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fsp.stat(path.join(dir, n)).catch(() => null))?.atimeMs ?? 0 })))
      stats.sort((a, b) => a.t - b.t)
      for (const { n } of stats.slice(0, names.length - Math.floor(MAX_FILES * 0.9))) await fsp.rm(path.join(dir, n), { force: true })
    } catch {
      // (no folder yet)
    } finally {
      pruning = false
    }
  }

  /** GET /api/jellyfin/tracks?kind=album|playlist|book&id= - the tracks to play, for the player, the display and the app */
  app.get('/api/jellyfin/tracks', localOrElternSession, async (req: Request, res: Response) => {
    const kind = String(req.query.kind ?? '')
    const id = String(req.query.id ?? '')
    if (!['album', 'playlist', 'book'].includes(kind) || !isJellyfinId(id)) return void res.status(400).json({ error: 'bad_request' })
    const s = deps.session()
    if (!s) return void res.status(409).json({ error: 'jellyfin_off' })
    try {
      const list = await tracksOf(s, kind as EntryKind, id)
      if (!list) return void res.status(404).json({ error: 'not_found' })
      // J5, progress shared with Jellyfin: where the account left it - a track begun and not finished (heard on a
      // phone), else in an audiobook the first track not played yet - and all played: the box's green tick
      let resumeAt: { track: number; percent: number } | undefined
      if (deps.shareProgress() && list.tracks.length) {
        const begun = list.tracks.find((t) => t.position > 0 && !t.played)
        if (begun) resumeAt = { track: begun.number, percent: begun.duration > 0 ? Math.min(99, Math.round((begun.position * 100) / begun.duration)) : 0 }
        // (made into MP3 the track starts from its beginning - the place in Jellyfin is not overwritten until the box
        // has played past it, see /progress)
        if (begun && deps.transcode()) keepPlace.set(begun.id, begun.position)
        else if (kind === 'book' && list.tracks.some((t) => t.played)) {
          const next = list.tracks.find((t) => !t.played)
          if (next) resumeAt = { track: next.number, percent: 0 }
        }
        // (once per start of the server: a tick the parents took away in the app is not set again at every look)
        const key = `jellyfin:${kind}:${id}`
        if (list.tracks.every((t) => t.played) && !ticked.has(key)) {
          ticked.add(key)
          deps.heardFinished?.(key)
        }
      }
      res.json({ ...list, ...(resumeAt ? { resumeAt } : {}) })
    } catch (err) {
      res.status(err instanceof JellyfinError && err.problem === 'unauthorized' ? 401 : 502).json({ error: err instanceof JellyfinError ? err.problem : 'unreachable' })
    }
  })

  /**
   * POST /api/jellyfin/progress {id, event: start|progress|stop, position, paused} - the player tells what plays (only on
   * the box itself). With "Fortschritt mit Jellyfin teilen" on, Jellyfin hears it as from its own apps: where the
   * account is in a track, and - stopped near its end - that it was played. Off: nothing goes to Jellyfin.
   */
  app.post('/api/jellyfin/progress', localOnly, async (req: Request, res: Response) => {
    const b = (req.body ?? {}) as { id?: unknown; event?: unknown; position?: unknown; paused?: unknown }
    const id = String(b.id ?? '')
    const event = String(b.event ?? '')
    const position = Number(b.position)
    if (!isJellyfinId(id) || !['start', 'progress', 'stop'].includes(event)) return void res.status(400).json({ error: 'bad_request' })
    const s = deps.session()
    // (switched off while a track was reported: its stop still goes - else Jellyfin shows it playing until it gives up)
    if (!s || (!deps.shareProgress() && !(event === 'stop' && open.has(id)))) return void res.status(204).end()
    if (event === 'start') open.add(id)
    if (event === 'stop') open.delete(id)
    // (a place from a phone the box could not start at - an MP3 made by Jellyfin has no seeking: kept until the box is past it)
    const kept = keepPlace.get(id)
    if (kept !== undefined) {
      if (Number.isFinite(position) && position >= kept) keepPlace.delete(id)
      else return void res.status(204).end()
    }
    const body = {
      ItemId: id,
      PositionTicks: Number.isFinite(position) && position > 0 ? Math.round(position * 10_000_000) : 0,
      IsPaused: b.paused === true,
      CanSeek: !deps.transcode(),
      PlayMethod: deps.transcode() ? 'Transcode' : 'DirectStream',
    }
    const path = event === 'start' ? '/Sessions/Playing' : event === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped'
    try {
      const r = await request(s, s, path, { method: 'POST', body, token: s.token, timeoutMs: 8000 })
      await r.body?.cancel().catch(() => undefined)
      res.status(r.ok ? 204 : 502).end()
    } catch {
      res.status(502).end()
    }
  })

  /** GET /api/jellyfin/artist/:id/albums - the albums of a whole artist in the library (the display lists them) */
  app.get('/api/jellyfin/artist/:id/albums', localOrElternSession, async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isJellyfinId(id)) return void res.status(400).json({ error: 'bad_id' })
    const s = deps.session()
    if (!s) return void res.status(409).json({ error: 'jellyfin_off' })
    try {
      res.json({ albums: await artistAlbums(s, id) })
    } catch (err) {
      res.status(err instanceof JellyfinError && err.problem === 'unauthorized' ? 401 : 502).json({ error: err instanceof JellyfinError ? err.problem : 'unreachable' })
    }
  })

  /**
   * GET /api/jellyfin/stream/:id - the audio of a track for the player (only on the box itself): the original file with
   * Range (seeking), or with "für schwaches WLAN umwandeln" MP3 192 kbit made by Jellyfin. The token stays here.
   */
  app.get('/api/jellyfin/stream/:id', localOnly, async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isJellyfinId(id)) return void res.status(400).end()
    const s = deps.session()
    if (!s) return void res.status(409).end()
    const stop = new AbortController()
    res.on('close', () => stop.abort())
    // (an answer within 20 s - mpv gives a track up after as long (--network-timeout=20, mpv-wrapper.js); waiting longer
    // here would only hold a request nobody reads. The reading itself has no time limit, it lasts as long as the track)
    const answer = setTimeout(() => stop.abort(), 20000)
    const path = deps.transcode()
      ? `/Audio/${id}/universal?${new URLSearchParams({ UserId: s.userId, DeviceId: s.deviceId, Container: 'mp3', TranscodingContainer: 'mp3', TranscodingProtocol: 'http', AudioCodec: 'mp3', MaxStreamingBitrate: '192000', AudioBitRate: '192000' })}`
      : `/Audio/${id}/stream?static=true`
    try {
      const range = typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined
      const r = await request(s, s, path, { token: s.token, timeoutMs: 0, signal: stop.signal, headers: { Accept: '*/*', ...(range ? { Range: range } : {}) } })
      clearTimeout(answer)
      res.status(r.status)
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = r.headers.get(h)
        if (v) res.setHeader(h, v)
      }
      // (HEAD: only the headers - the body would start a whole transcoding for nothing)
      if (!r.body || req.method === 'HEAD') {
        await r.body?.cancel().catch(() => undefined)
        return void res.end()
      }
      Readable.fromWeb(r.body as unknown as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res)
    } catch {
      clearTimeout(answer)
      if (!res.headersSent) res.status(502).end()
      else res.destroy()
    }
  })

  // (one fetch per picture at a time - the display and the app asking at once share it)
  const fetching = new Map<string, Promise<boolean>>()
  const fetchTo = (s: JellyfinSession, id: string, w: number, file: string) => {
    let p = fetching.get(file)
    if (!p) {
      p = (async () => {
        const r = await request(s, s, `/Items/${id}/Images/Primary?maxWidth=${w}&quality=85&format=Jpg`, { token: s.token, timeoutMs: 15000, headers: { Accept: 'image/*' } })
        if (!r.ok) {
          await r.body?.cancel().catch(() => undefined)
          if (r.status === 404) throw Object.assign(new Error('no picture'), { none: true })
          return false
        }
        const bytes = Buffer.from(await r.arrayBuffer())
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) return false
        await fsp.mkdir(dir, { recursive: true })
        const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
        await fsp.writeFile(tmp, bytes)
        await fsp.rename(tmp, file)
        void prune()
        return true
      })().finally(() => fetching.delete(file))
      fetching.set(file, p)
    }
    return p
  }

  app.get('/api/jellyfin/image/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isJellyfinId(id)) return void res.status(400).end()
    // (switched off or signed out: nothing of Jellyfin, also not from the cache)
    const s = deps.session()
    if (!s) return void res.status(404).end()
    const w = imageWidth(req.query.w)
    const file = path.join(dir, `${id.toLowerCase()}-${w}.jpg`)
    const kept = await fsp.stat(file).catch(() => null)
    const send = () => {
      res.setHeader('Cache-Control', 'public, max-age=86400')
      // (dotfiles allowed: the cache lies under ~/.mupibox - sendFile refuses a path with a dot folder otherwise)
      res.type('jpg').sendFile(file, { dotfiles: 'allow' }, (err) => err && !res.headersSent && res.status(404).end())
    }
    if (kept && Date.now() - kept.mtimeMs < FRESH_MS) {
      // (looked at: the last to go when the cache is pruned - its access time, the fetch time stays in mtime)
      void fsp.utimes(file, new Date(), kept.mtime).catch(() => undefined)
      return send()
    }
    try {
      if (await fetchTo(s, id, w, file)) return send()
      // (Jellyfin away or the token refused: the kept one, if any)
      return kept ? send() : void res.status(404).end()
    } catch (err) {
      if (kept && !(err as { none?: boolean }).none) send()
      else res.status(404).end()
    }
  })

  return {
    reachable: () => answers,
    forgetTicks: () => {
      ticked.clear()
      ticksAt = 0
    },
    syncTicks: (entries) => {
      const s = deps.session()
      if (!s || !deps.shareProgress() || !deps.heardFinished || Date.now() - ticksAt < 10 * 60 * 1000) return
      ticksAt = Date.now()
      // (the library read only when it is time to ask)
      const wanted = entries().filter((e) => ['album', 'playlist', 'book'].includes(e.kind) && isJellyfinId(e.id) && !ticked.has(`jellyfin:${e.kind}:${e.id}`))
      if (!wanted.length) return
      void (async () => {
        try {
          // (Jellyfin's "played" of an album or a folder: all its tracks played; asked in rows of 100)
          for (let i = 0; i < wanted.length; i += 100) {
            const part = wanted.slice(i, i + 100)
            const body = await requestJson<{ Items?: { Id?: string; UserData?: { Played?: boolean } }[] }>(s, s, `/Items?userId=${s.userId}&Ids=${part.map((e) => e.id).join(',')}`, { token: s.token, timeoutMs: 15000 })
            for (const item of body?.Items ?? []) {
              const entry = part.find((e) => e.id.toLowerCase() === String(item.Id ?? '').toLowerCase())
              if (!entry || item.UserData?.Played !== true) continue
              const key = `jellyfin:${entry.kind}:${entry.id}`
              ticked.add(key)
              deps.heardFinished?.(key)
            }
          }
        } catch {
          // (Jellyfin away: asked again in 10 minutes)
        }
      })()
    },
  }
}
