// Playing an Audible book (docs/audible-5.1.md, A3): the box asks Audible for a streaming licence (format HLS, AAC-LC
// only). Audible answers with an HLS playlist that points into ONE plain AAC file (ADTS, not encrypted - A0) in pieces of
// 20 s with their byte ranges. The box never decrypts anything.
//
// mpv cannot jump in plain AAC (no index: it reads up to the place - minutes for a place hours in), so the box serves
// each chapter as a file of its own and starts it where it is asked to (?at=<seconds>): the byte place comes from the
// playlist's 20-s pieces (linear inside a piece), moved to the next AAC frame. A chapter is a track of the box.

import { type AudibleSession, apiJson, AudibleError } from './client'
import { isAsin } from './library'

export interface Chapter {
  /** 1-based */
  number: number
  name: string
  /** where it begins in the book, seconds */
  start: number
  /** seconds */
  duration: number
}

export interface Piece {
  /** begins at, seconds */
  t: number
  dur: number
  off: number
  len: number
}

export interface PlayInfo {
  asin: string
  /** the AAC file all pieces are in */
  file: string
  pieces: Piece[]
  /** length of the book after the pieces, seconds */
  total: number
  /** the file's end (after the last piece) */
  end: number
  /** Audible's mark of this licence (for reporting the position, A5) */
  acr: string
  at: number
}

const LICENCE_MS = 20 * 60 * 1000
const CHAPTERS_MS = 24 * 3600 * 1000

/** An HLS playlist of Audible (VOD, #EXT-X-BYTERANGE, every piece in the same file) - null when it is not one */
export function parsePieces(m3u8: string, base: string): { file: string; pieces: Piece[] } | null {
  if (!m3u8.startsWith('#EXTM3U') || /#EXT-X-KEY:(?!METHOD=NONE)/.test(m3u8)) return null
  const pieces: Piece[] = []
  let file = ''
  let dur = Number.NaN
  let range: { len: number; off: number } | null = null
  let t = 0
  let next = 0
  for (const line of m3u8.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) dur = Number.parseFloat(line.slice(8))
    else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const m = /^#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/.exec(line)
      range = m ? { len: Number(m[1]), off: m[2] !== undefined ? Number(m[2]) : next } : null
    } else if (line && !line.startsWith('#')) {
      if (!Number.isFinite(dur) || dur <= 0 || !range) return null
      let url: URL
      try {
        url = new URL(line, base)
      } catch {
        return null
      }
      // (all in one file - else the byte places would not add up)
      const path = url.origin + url.pathname
      if (!file) file = url.toString()
      else if (path !== new URL(file).origin + new URL(file).pathname) return null
      pieces.push({ t, dur, off: range.off, len: range.len })
      t += dur
      next = range.off + range.len
      dur = Number.NaN
      range = null
    }
  }
  return pieces.length && file.startsWith('https://') ? { file, pieces } : null
}

/** The byte place of a time in the book (linear inside its 20-s piece); after the end: the file's end */
export function byteAt(info: Pick<PlayInfo, 'pieces' | 'end'>, seconds: number): number {
  if (!(seconds > 0)) return info.pieces[0]?.off ?? 0
  for (const p of info.pieces) {
    if (seconds < p.t + p.dur) return p.off + Math.floor(((seconds - p.t) / p.dur) * p.len)
  }
  return info.end
}

/** The first AAC (ADTS) frame in the bytes, followed by another one: its index, -1 none */
export function adtsStart(b: Uint8Array): number {
  const sync = (i: number) => b[i] === 0xff && (b[i + 1] & 0xf6) === 0xf0
  // (a frame whose length runs past the bytes cannot be checked: taken only when no checked one comes)
  let unchecked = -1
  for (let i = 0; i + 7 < b.length; i++) {
    if (!sync(i)) continue
    const len = ((b[i + 3] & 0x03) << 11) | (b[i + 4] << 3) | (b[i + 5] >> 5)
    if (len < 7) continue
    if (i + len + 1 >= b.length) {
      if (unchecked < 0) unchecked = i
      continue
    }
    if (sync(i + len)) return i
  }
  return unchecked
}

/** Chapters of a book from Audible's chapter_info (flat; sub chapters in their order) */
export function chaptersOf(info: unknown): Chapter[] {
  const flat: { title: string; start: number; length: number }[] = []
  const walk = (list: unknown, depth: number) => {
    if (!Array.isArray(list) || depth > 4) return
    for (const c of list) {
      const x = (c ?? {}) as Record<string, unknown>
      const start = Number(x.start_offset_ms)
      const length = Number(x.length_ms)
      // (a chapter with parts of its own: the parts are the tracks - the chapter itself only a heading)
      if (Array.isArray(x.chapters) && x.chapters.length) {
        const head = { title: String(x.title ?? ''), start, length: Number(x.chapters[0]?.start_offset_ms) - start }
        if (Number.isFinite(head.start) && head.length >= 1000) flat.push(head)
        walk(x.chapters, depth + 1)
      } else if (Number.isFinite(start) && start >= 0 && Number.isFinite(length) && length > 0) flat.push({ title: String(x.title ?? ''), start, length })
    }
  }
  walk((info as { chapters?: unknown })?.chapters, 0)
  flat.sort((a, b) => a.start - b.start)
  return flat.map((c, i) => ({
    number: i + 1,
    name: c.title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200) || `Kapitel ${i + 1}`,
    start: c.start / 1000,
    duration: c.length / 1000,
  }))
}

/** What the box needs to play books, kept per book: the chapters (a day) and the licence with its pieces (20 min) */
export class AudiblePlayer {
  private licences = new Map<string, PlayInfo>()
  private chapterLists = new Map<string, { at: number; chapters: Chapter[]; title: string }>()
  private aligned = new Map<string, number>()
  private loading = new Map<string, Promise<PlayInfo>>()
  // (a licence Audible refused - a title out of the subscription, a format the box cannot play: not asked again for every
  // chapter, for 5 minutes)
  private refused = new Map<string, { until: number; problem: 'refused' | 'unauthorized' }>()

  constructor(private readonly fetchText: (url: string) => Promise<string> = defaultFetchText) {}

  async chapters(session: AudibleSession, asin: string): Promise<{ title: string; chapters: Chapter[] }> {
    if (!isAsin(asin)) throw new AudibleError('notFound')
    const kept = this.chapterLists.get(asin)
    if (kept && Date.now() - kept.at < CHAPTERS_MS) return kept
    const body = await apiJson<{ content_metadata?: { chapter_info?: unknown; content_reference?: { content_title?: unknown } } }>(session, 'GET', `content/${asin}/metadata`, {
      query: { response_groups: 'chapter_info,content_reference', chapter_titles_type: 'Tree' },
    })
    const chapters = chaptersOf(body?.content_metadata?.chapter_info)
    if (!chapters.length) throw new AudibleError('notFound')
    const entry = { at: Date.now(), chapters, title: String(body?.content_metadata?.content_reference?.content_title ?? '') }
    if (this.chapterLists.size > 200) this.chapterLists.clear()
    this.chapterLists.set(asin, entry)
    return entry
  }

  /** The licence and its pieces (asked anew after 20 min, or when the file refused the address: fresh) */
  async info(session: AudibleSession, asin: string, fresh = false): Promise<PlayInfo> {
    const kept = this.licences.get(asin)
    if (!fresh && kept && Date.now() - kept.at < LICENCE_MS) return kept
    const running = this.loading.get(asin)
    if (running) return running
    const no = this.refused.get(asin)
    if (no && Date.now() < no.until) throw new AudibleError(no.problem)
    const p = (async () => {
      const body = await apiJson<{ content_license?: { license_response?: unknown; acr?: unknown; status_code?: unknown } }>(session, 'POST', `content/${asin}/licenserequest`, {
        json: {
          quality: 'High',
          response_groups: 'content_reference',
          consumption_type: 'Streaming',
          // (only AAC-LC: the ffmpeg of the box does not surely decode xHE-AAC)
          supported_media_features: { codecs: ['mp4a.40.2'], drm_types: ['Hls'] },
          spatial: false,
        },
      })
      const lic = body?.content_license
      const address = typeof lic?.license_response === 'string' ? lic.license_response : ''
      // (not granted - a title out of the subscription, or a format the box cannot play)
      if (!address.startsWith('https://')) throw new AudibleError('refused')
      const parsed = parsePieces(await this.fetchText(address), address)
      if (!parsed) throw new AudibleError('refused')
      const last = parsed.pieces[parsed.pieces.length - 1]
      const info: PlayInfo = { asin, ...parsed, total: last.t + last.dur, end: last.off + last.len, acr: typeof lic?.acr === 'string' ? lic.acr : '', at: Date.now() }
      if (this.licences.size > 50) this.licences.clear()
      this.licences.set(asin, info)
      return info
    })()
      .catch((err) => {
        if (err instanceof AudibleError && (err.problem === 'refused' || err.problem === 'unauthorized')) {
          if (this.refused.size > 200) this.refused.clear()
          this.refused.set(asin, { until: Date.now() + 5 * 60 * 1000, problem: err.problem })
        }
        throw err
      })
      .finally(() => this.loading.delete(asin))
    this.loading.set(asin, p)
    return p
  }

  /** The byte place of a time, on an AAC frame (asked once per place: a few kB of the file) */
  async frameAt(info: PlayInfo, seconds: number, read: (from: number, to: number) => Promise<Uint8Array>): Promise<number> {
    const rough = byteAt(info, seconds)
    if (rough >= info.end) return info.end
    const key = `${info.asin}:${rough}`
    const kept = this.aligned.get(key)
    if (kept !== undefined) return kept
    const bytes = await read(rough, Math.min(info.end, rough + 8192) - 1)
    const i = adtsStart(bytes)
    const at = i >= 0 ? rough + i : rough
    if (this.aligned.size > 5000) this.aligned.clear()
    this.aligned.set(key, at)
    return at
  }

  forget(asin?: string): void {
    if (asin) {
      this.licences.delete(asin)
      this.refused.delete(asin)
    }
    else {
      this.licences.clear()
      this.chapterLists.clear()
      this.refused.clear()
    }
  }
}

async function defaultFetchText(url: string): Promise<string> {
  let r: Response
  try {
    r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
  } catch {
    throw new AudibleError('unreachable')
  }
  if (!r.ok) throw new AudibleError(r.status === 403 ? 'unauthorized' : 'unreachable', r.status)
  return r.text()
}

export const audiblePlayer = new AudiblePlayer()
