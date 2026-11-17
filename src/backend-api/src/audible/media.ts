// Audible for the display, the app and the player (docs/audible-5.1.md): the covers (/api/audible/image/<id>, Amazon's
// public pictures, kept in the cache so they show without internet too). Switched off or signed out: nothing of Audible
// is served, also not from the cache.

import { randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Express, Request, Response } from 'express'
import { localOnly, localOrElternSession } from '../request-guard'
import { AudibleError, type AudibleSession, apiJson, hosts, MARKETS } from './client'
import { type AudibleBook, audibleLibrary, isAsin, isImageId, seriesOf } from './library'
import { audiblePlayer } from './play'

export interface AudibleMediaDeps {
  /** the box's session with Audible, null when not signed in or switched off */
  session: () => AudibleSession | null
  /** the registered device (the library is kept per device) */
  deviceKey: () => string
  /** "Hörposition mit Audible teilen" (A5) */
  shareProgress: () => boolean
  /** what Audible has as heard to its end: the box's green tick (heard.ts) */
  heardFinished?: (key: string) => void
  cacheDir: string
}

// (Amazon makes a picture in the size asked for: _SL<size>_)
const SIZES = [160, 500]
const FRESH_MS = 30 * 24 * 3600 * 1000
const MAX_FILES = 3000

export const coverSize = (v: unknown) => {
  const n = Number(v)
  return SIZES.find((w) => w >= (Number.isFinite(n) && n > 0 ? n : 500)) ?? 500
}

/** Where Amazon has a cover in a size */
export const coverAddress = (id: string, size: number) => `https://m.media-amazon.com/images/I/${id}._SL${size}_.jpg`

/** Where the account last was in a book (seconds), as Audible keeps it - null none */
export async function lastPosition(s: AudibleSession, asin: string): Promise<number | null> {
  const body = await apiJson<{ asin_last_position_heard_annots?: { last_position_heard?: { position_ms?: unknown; status?: unknown } }[] }>(s, 'GET', 'annotations/lastpositions', { query: { asins: asin }, timeoutMs: 8000 })
  const at = body?.asin_last_position_heard_annots?.[0]?.last_position_heard
  const ms = Number(at?.position_ms)
  return at?.status === 'Exists' && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null
}

export interface AudibleMedia {
  /** whether Audible answered the last look (once a minute while signed in; true until the first one) */
  reachable: () => boolean
  /** "finished" in Audible as the box's green tick, for the library's entries - looked at most every 10 minutes */
  syncTicks: (entries: () => { kind: string; id: string }[]) => void
}

export function registerAudibleMedia(app: Express, deps: AudibleMediaDeps): AudibleMedia {
  // (whether Audible answers at all - no internet: the display leaves its entries out, as Jellyfin's when its server is
  // away. Asked without the device key: any answer of Audible's server counts)
  let answers = true
  const look = async () => {
    const s = deps.session()
    if (!s) return
    try {
      const r = await fetch(`${hosts.audible(MARKETS[s.country].domain)}/1.0/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
      await r.body?.cancel().catch(() => undefined)
      answers = true
    } catch {
      answers = false
    }
  }
  setInterval(() => void look(), 60000).unref()
  void look()
  const dir = path.join(deps.cacheDir, 'audible-covers')
  let pruning = false
  let prunedAt = 0
  const prune = async () => {
    // (at most once a minute, and then down to 90 % - by last access, the pictures looked at stay)
    if (pruning || Date.now() - prunedAt < 60000) return
    pruning = true
    prunedAt = Date.now()
    try {
      const names = await fsp.readdir(dir)
      if (names.length <= MAX_FILES) return
      const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fsp.stat(path.join(dir, n)).catch(() => null))?.atimeMs ?? 0 })))
      stats.sort((a, b) => a.t - b.t)
      for (const { n } of stats.slice(0, names.length - Math.floor(MAX_FILES * 0.9))) await fsp.rm(path.join(dir, n), { force: true })
    } catch {
      // (no folder yet)
    } finally {
      pruning = false
    }
  }

  // (one fetch per picture at a time - the display and the app asking at once share it)
  const fetching = new Map<string, Promise<boolean>>()
  const fetchTo = (id: string, size: number, file: string) => {
    let p = fetching.get(file)
    if (!p) {
      p = (async () => {
        let r: globalThis.Response
        try {
          r = await fetch(coverAddress(id, size), { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { Accept: 'image/*' } })
        } catch {
          return false
        }
        if (!r.ok || !String(r.headers.get('content-type') ?? '').startsWith('image/')) {
          await r.body?.cancel().catch(() => undefined)
          if (r.status === 404) throw Object.assign(new Error('no picture'), { none: true })
          return false
        }
        const bytes = Buffer.from(await r.arrayBuffer())
        if (!bytes.length || bytes.length > 4 * 1024 * 1024) return false
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

  const failed = (res: Response, err: unknown) => {
    const p = err instanceof AudibleError ? err.problem : 'unreachable'
    res.status(p === 'unauthorized' ? 401 : p === 'notFound' ? 404 : p === 'rateLimited' ? 429 : p === 'refused' ? 403 : 502).json({ error: p })
  }

  /** GET /api/audible/tracks?id=<asin> - a book's chapters (its tracks), for the player, the display and the app */
  app.get('/api/audible/tracks', localOrElternSession, async (req: Request, res: Response) => {
    const asin = String(req.query.id ?? '')
    if (!isAsin(asin)) return void res.status(400).json({ error: 'bad_request' })
    const s = deps.session()
    if (!s) return void res.status(409).json({ error: 'audible_off' })
    try {
      const { title, chapters } = await audiblePlayer.chapters(s, asin)
      // (the book's title: Audible's chapter answer may leave it out - the library has it)
      // (the licence asked for now: a book Audible will not stream is not started at all - and the first chapter
      // starts sooner)
      // A5, the position shared with Audible: where the account left the book (heard on a phone) - asked at the same
      // time as the licence. Undefined: not known (Audible did not answer) - the box then tells Audible no place of its
      // own for this start, else it would overwrite the account's with its beginning
      const share = deps.shareProgress()
      const [, at] = await Promise.all([audiblePlayer.info(s, asin), share ? lastPosition(s, asin).catch(() => undefined) : Promise.resolve(null)])
      // (the book's title from the library the box keeps - not waited for when it has none: asked for in the background)
      const key = deps.deviceKey()
      const books = title ? null : audibleLibrary.stale(key)
      if (!title && !books) void audibleLibrary.books(s, key).catch(() => undefined)
      const name = title || books?.find((b) => b.asin === asin)?.title || ''
      // (its chapter and the part of it; near the end - heard through: from the beginning, no place)
      let resumeAt: { track: number; percent: number } | undefined
      const end = chapters[chapters.length - 1]
      if (typeof at === 'number' && at > 5 && end && at < end.start + end.duration - 30) {
        const i = chapters.findIndex((c) => at < c.start + c.duration)
        const c = chapters[i >= 0 ? i : chapters.length - 1]
        resumeAt = { track: c.number, percent: Math.max(0, Math.min(99, ((at - c.start) * 100) / c.duration)) }
      }
      res.json({ name, tracks: chapters, ...(resumeAt ? { resumeAt } : {}), ...(share && at === undefined ? { positionUnknown: true } : {}) })
    } catch (err) {
      failed(res, err)
    }
  })

  /**
   * POST /api/audible/progress {asin, position} - the player tells where it is in a book (seconds from its start; only on
   * the box itself). With "Hörposition mit Audible teilen" on, Audible keeps it as from its own apps (the phone goes on
   * there); off: nothing goes to Audible.
   */
  app.post('/api/audible/progress', localOnly, async (req: Request, res: Response) => {
    const b = (req.body ?? {}) as { asin?: unknown; position?: unknown }
    const asin = String(b.asin ?? '')
    const position = Number(b.position)
    if (!isAsin(asin) || !Number.isFinite(position) || position < 0 || position > 1_000_000) return void res.status(400).json({ error: 'bad_request' })
    const s = deps.session()
    if (!s || !deps.shareProgress()) return void res.status(204).end()
    try {
      // (Audible's mark of the licence the box plays with - asked for anew when the kept one is old)
      const info = await audiblePlayer.info(s, asin)
      if (!info.acr) return void res.status(204).end()
      await apiJson(s, 'PUT', `lastpositions/${asin}`, { json: { acr: info.acr, asin, position_ms: Math.round(position * 1000) }, timeoutMs: 10000 })
      res.status(204).end()
    } catch {
      res.status(502).end()
    }
  })

  /** GET /api/audible/series/<asin>/books - a whole series in the library: the account's books of it, in its order */
  app.get('/api/audible/series/:asin/books', localOrElternSession, async (req: Request, res: Response) => {
    const asin = String(req.params.asin)
    if (!isAsin(asin)) return void res.status(400).json({ error: 'bad_request' })
    const s = deps.session()
    if (!s) return void res.status(409).json({ error: 'audible_off' })
    const key = deps.deviceKey()
    try {
      const books = await audibleLibrary.books(s, key).catch((err) => {
        // (Audible away: the books known)
        const kept = audibleLibrary.stale(key)
        if (kept && !(err instanceof AudibleError && err.problem === 'unauthorized')) return kept
        throw err
      })
      const series = seriesOf(books).find((x) => x.asin === asin)
      const byAsin = new Map(books.map((b) => [b.asin, b]))
      res.json({
        name: series?.title ?? '',
        books: (series?.books ?? []).map((y) => byAsin.get(y.asin)).filter((b): b is AudibleBook => !!b).map((b) => ({ ...b, sequence: series?.books.find((y) => y.asin === b.asin)?.sequence ?? '' })),
      })
    } catch (err) {
      failed(res, err)
    }
  })

  /**
   * GET /api/audible/stream/<asin>/<chapter>?at=<seconds> - a chapter's audio for the player (only on the box itself):
   * the bytes of the book's AAC file from the chapter's place (or "at" seconds into it) to its end, with Range. The box's
   * licence and key stay here; an address of Audible that ran out is asked anew and the bytes go on.
   */
  app.get('/api/audible/stream/:asin/:chapter', localOnly, async (req: Request, res: Response) => {
    const asin = String(req.params.asin)
    const number = Number(req.params.chapter)
    if (!isAsin(asin) || !Number.isInteger(number) || number < 1 || number > 5000) return void res.status(400).end()
    const s = deps.session()
    if (!s) return void res.status(409).end()
    const stop = new AbortController()
    res.on('close', () => stop.abort())
    // (an answer within 20 s - mpv gives a track up after as long; the reading itself lasts as long as the chapter)
    const answer = setTimeout(() => stop.abort(), 20000)
    try {
      const { chapters } = await audiblePlayer.chapters(s, asin)
      const ch = chapters[number - 1]
      if (!ch) {
        clearTimeout(answer)
        return void res.status(404).end()
      }
      const at = Math.max(0, Math.min(ch.duration - 1, Number(req.query.at) || 0))
      let info = await audiblePlayer.info(s, asin, false, true)
      const read = async (from: number, to: number, signal?: AbortSignal) => {
        const get = (i: typeof info) => fetch(i.file, { redirect: 'error', signal: signal ?? AbortSignal.timeout(20000), headers: { Range: `bytes=${from}-${to}` } })
        let r = await get(info)
        // (the address ran out: a new licence, the same file and places)
        if (r.status === 403 || r.status === 410) {
          await r.body?.cancel().catch(() => undefined)
          info = await audiblePlayer.info(s, asin, true)
          r = await get(info)
        }
        return r
      }
      const bytes = async (from: number, to: number) => {
        const r = await read(from, to)
        if (r.status !== 206) {
          await r.body?.cancel().catch(() => undefined)
          throw new AudibleError('unreachable', r.status)
        }
        return new Uint8Array(await r.arrayBuffer())
      }
      const start = await audiblePlayer.frameAt(info, ch.start + at, bytes)
      // (the next chapter's beginning - the lengths Audible gives may not add up exactly)
      const end = number < chapters.length ? await audiblePlayer.frameAt(info, chapters[number].start, bytes) : info.end
      const size = end - start
      if (size <= 0) {
        clearTimeout(answer)
        return void res.status(416).end()
      }
      // (a Range of mpv is about this chapter's bytes: moved to the place in the file)
      let from = 0
      let to = size - 1
      const range = typeof req.headers.range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null
      if (range && (range[1] || range[2])) {
        if (range[1]) {
          from = Number(range[1])
          if (range[2]) to = Math.min(size - 1, Number(range[2]))
        } else from = Math.max(0, size - Number(range[2]))
        if (from >= size || from > to) {
          clearTimeout(answer)
          res.setHeader('Content-Range', `bytes */${size}`)
          return void res.status(416).end()
        }
      }
      res.setHeader('Content-Type', 'audio/aac')
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Length', String(to - from + 1))
      if (range) res.setHeader('Content-Range', `bytes ${from}-${to}/${size}`)
      res.status(range ? 206 : 200)
      if (req.method === 'HEAD') {
        clearTimeout(answer)
        return void res.end()
      }
      const r = await read(start + from, start + to, stop.signal)
      clearTimeout(answer)
      // (only the bytes asked for: a server that ignored the Range would send the whole file from its start)
      if (r.status !== 206 || !r.body) {
        await r.body?.cancel().catch(() => undefined)
        return void res.destroy()
      }
      Readable.fromWeb(r.body as unknown as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res)
    } catch (err) {
      clearTimeout(answer)
      if (!res.headersSent) {
        // (the chapter's headers were set already for an answer that does not come)
        for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) res.removeHeader(h)
        const p = err instanceof AudibleError ? err.problem : 'unreachable'
        res.status(p === 'unauthorized' ? 401 : p === 'notFound' ? 404 : 502).end()
      } else res.destroy()
    }
  })

  /** GET /api/audible/image/<id>?w= - a cover (Amazon's picture id from the library) */
  app.get('/api/audible/image/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isImageId(id)) return void res.status(400).end()
    if (!deps.session()) return void res.status(404).end()
    const size = coverSize(req.query.w)
    const file = path.join(dir, `${id}-${size}.jpg`)
    const kept = await fsp.stat(file).catch(() => null)
    const send = () => {
      res.setHeader('Cache-Control', 'public, max-age=86400')
      // (dotfiles allowed: the cache lies under ~/.mupibox - sendFile refuses a path with a dot folder otherwise)
      res.type('jpg').sendFile(file, { dotfiles: 'allow' }, (err) => err && !res.headersSent && res.status(404).end())
    }
    if (kept && Date.now() - kept.mtimeMs < FRESH_MS) {
      void fsp.utimes(file, new Date(), kept.mtime).catch(() => undefined)
      return send()
    }
    try {
      if (await fetchTo(id, size, file)) return send()
      return kept ? send() : void res.status(404).end()
    } catch (err) {
      if (kept && !(err as { none?: boolean }).none) send()
      else res.status(404).end()
    }
  })

  // (once per start of the server: a tick the parents took away in the app is not set again at every look)
  const ticked = new Set<string>()
  let ticksAt = 0
  return {
    reachable: () => answers,
    syncTicks: (entries) => {
      const s = deps.session()
      if (!s || !deps.shareProgress() || !deps.heardFinished || Date.now() - ticksAt < 10 * 60 * 1000) return
      ticksAt = Date.now()
      const list = entries()
      const bookIds = new Set(list.filter((e) => e.kind === 'book').map((e) => e.id))
      const seriesIds = new Set(list.filter((e) => e.kind === 'series').map((e) => e.id))
      if (!bookIds.size && !seriesIds.size) return
      void (async () => {
        try {
          // (the library the box keeps - "finished" comes with it, no request of its own)
          // (the books kept are enough for two hours - the whole library is not asked for again only for the ticks)
          const key = deps.deviceKey()
          const kept = audibleLibrary.age(key) < 2 * 3600 * 1000 ? audibleLibrary.stale(key) : null
          for (const b of kept ?? (await audibleLibrary.books(s, key))) {
            const key = `audible:book:${b.asin}`
            // (per device: another account has its own heard-through books)
            if (!b.finished || ticked.has(`${deps.deviceKey()}:${key}`) || !(bookIds.has(b.asin) || b.series.some((x) => seriesIds.has(x.asin)))) continue
            ticked.add(`${deps.deviceKey()}:${key}`)
            deps.heardFinished?.(key)
          }
        } catch {
          // (Audible away: looked at again in 10 minutes)
        }
      })()
    },
  }
}
