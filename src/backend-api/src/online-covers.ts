import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Covers from the internet for albums (NAS or local folders) that have no picture of their own.
 *
 * The iTunes Search API and the Deezer API (both free, no key) are asked with the folder name, alone and together
 * with the series (the folder above). A result is only taken when it clearly is this album - better no cover than
 * a wrong one:
 *   - every word of the album name is in the result's title,
 *   - and something confirms it: the same episode number ("084" / "Folge 84"), the series name in the result, or
 *     (iTunes) an audiobook/children genre,
 *   - a different episode number rules a result out.
 * Lookups run in the background, one at a time and spaced out, when the box shows such an album; each album is
 * looked up once (a miss is remembered too). The pictures are kept on the box. It sends folder names to Apple and
 * Deezer, so it is off unless switched on (mupibox.onlineCovers).
 */

export type OnlineCoverStatus = 'found' | 'none' | 'rejected'
export interface OnlineCoverEntry {
  status: OnlineCoverStatus
  file?: string // <sha1>.jpg in the cover folder
  source?: 'itunes' | 'deezer' | 'spotify'
  matchedTitle?: string
  matchedArtist?: string
  series: string
  album: string
  at: number
  // Stored as cover.jpg in the album folder itself (mupibox.onlineCoversSave): 'nas' / 'local', or 'denied' when the
  // NAS account may not write there.
  savedTo?: 'nas' | 'local' | 'denied'
  // the file name it was stored under (cover.jpg, or cover-online.jpg next to a picture of the folder's own)
  savedName?: string
  // why it was looked up: the album has no picture, or only one that is not square (e.g. a scanned cassette inlay)
  reason?: 'missing' | 'notSquare'
  score?: number // how well the result fit (see scoreCandidate)
}

// Folder names that name no album of their own ("CD 01", "Teil 2"): nothing to look up.
const PART_FOLDER = /^(cd|disc|disk|teil|part|seite|side|kassette|mc)\s*\d+$/i

interface Candidate {
  source: 'itunes' | 'deezer' | 'spotify'
  title: string
  artist: string
  imageUrl: string
  genre?: string
}

/** A result for the cover choice in the app: a small picture for the list, a large one to take. */
export interface CoverCandidate extends Candidate {
  thumbUrl: string
}

/** Albums at iTunes for a search term; `size` is the edge of the picture taken (600 for the automatic lookup). */
export async function searchItunes(term: string, limit = 10, size = 600): Promise<CoverCandidate[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, media: 'music', entity: 'album', country: 'DE', limit: String(limit) })}`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`iTunes ${r.status}`)
  const body = (await r.json()) as {
    results?: Array<{ collectionName?: string; artistName?: string; artworkUrl100?: string; primaryGenreName?: string }>
  }
  return (body.results ?? [])
    .filter((x) => x.collectionName && x.artworkUrl100)
    .map((x) => ({
      source: 'itunes' as const,
      title: String(x.collectionName),
      artist: String(x.artistName ?? ''),
      imageUrl: String(x.artworkUrl100).replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`),
      thumbUrl: String(x.artworkUrl100).replace(/\/\d+x\d+bb\./, '/300x300bb.'),
      genre: x.primaryGenreName,
    }))
}

/** Albums at Deezer for a search term; `large` takes the 1000 px picture instead of the 500 px one. */
export async function searchDeezer(q: string, limit = 10, large = false): Promise<CoverCandidate[]> {
  const r = await fetch(`https://api.deezer.com/search/album?${new URLSearchParams({ q, limit: String(limit) })}`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`Deezer ${r.status}`)
  const body = (await r.json()) as {
    data?: Array<{ title?: string; artist?: { name?: string }; cover_medium?: string; cover_big?: string; cover_xl?: string; genre_id?: number }>
  }
  return (body.data ?? [])
    .filter((x) => x.title && x.cover_big)
    .map((x) => ({
      source: 'deezer' as const,
      title: String(x.title),
      artist: String(x.artist?.name ?? ''),
      imageUrl: String((large && x.cover_xl) || x.cover_big),
      thumbUrl: String(x.cover_medium || x.cover_big),
      genre: x.genre_id !== undefined ? DEEZER_GENRES[x.genre_id] : undefined,
    }))
}

/**
 * Albums at Spotify for a search term (the cover choice in the app only), with the box's Spotify login - the player's
 * token; none without a login.
 */
export async function searchSpotify(q: string, limit = 10): Promise<CoverCandidate[]> {
  const t = await fetch('http://127.0.0.1:5005/spotify/token', { signal: AbortSignal.timeout(3000) })
  const token = (await t.text()).trim()
  if (!t.ok || !token || token.startsWith('{')) return []
  const r = await fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: 'album', limit: String(limit), market: 'DE' })}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`Spotify ${r.status}`)
  const body = (await r.json()) as {
    albums?: { items?: Array<{ name?: string; artists?: Array<{ name?: string }>; images?: Array<{ url?: string; width?: number }> }> }
  }
  return (body.albums?.items ?? [])
    .filter((x) => x.name && x.images?.some((i) => i.url))
    .map((x) => {
      // (the largest picture to take, one of about 300 px for the list)
      const images = (x.images ?? []).filter((i) => i.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
      return {
        source: 'spotify' as const,
        title: String(x.name),
        artist: String(x.artists?.[0]?.name ?? ''),
        imageUrl: String(images[0].url),
        thumbUrl: String((images.find((i) => (i.width ?? 0) <= 320) ?? images[0]).url),
      }
    })
}

// Where a chosen picture may be fetched from: the picture servers of iTunes, Deezer and Spotify, nothing else (the
// address comes from the app)
const COVER_HOSTS = /^(?:is\d+-ssl\.mzstatic\.com|(?:e-)?cdns?-images\.dzcdn\.net|i\.scdn\.co)$/

/** The bytes of a picture of a search result (iTunes/Deezer/Spotify only, https, no redirects, at most 2 MB). */
export async function fetchCoverImage(address: string): Promise<Buffer> {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new Error('bad_address')
  }
  if (url.protocol !== 'https:' || !COVER_HOSTS.test(url.hostname) || url.username || url.password || url.port) {
    throw new Error('bad_address')
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  const type = r.headers.get('content-type') ?? ''
  if (!r.ok || !type.startsWith('image/')) throw new Error(`download ${r.status} ${type}`)
  const data = Buffer.from(await r.arrayBuffer())
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) throw new Error(`size ${data.length}`)
  return data
}

const SPACING_MS = 3000 // between two requests to the same service
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
// Deezer only gives genre ids: 457 Hörbücher, 462 Hörbücher auf Deutsch, 95 Kids
const DEEZER_GENRES: Record<number, string> = { 457: 'Hörbücher', 462: 'Hörbücher', 95: 'Kinder' }
const KIDS_GENRES = /h(ö|oe)r(buch|bücher|spiel)|kinder|children|spoken|gesprochen|audiobook/i

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// folder names that say nothing about the album ("Hörspiele/Pumuckl" - but also "Hörspiele/Pollyanna")
const GENERIC_FOLDERS = new Set([
  'horspiele',
  'horspiel',
  'horbucher',
  'horbuch',
  'musik',
  'music',
  'audio',
  'kinder',
  'kindermusik',
  'lieder',
  'songs',
  'alben',
  'albums',
  'mp3',
  'nas',
  'media',
  'medien',
  'freigabe',
  'audiobook',
  'audiobooks',
  'other',
])

/** The series (folder above) when it means something, else '' */
export function usefulSeries(series: string): string {
  const n = normalize(series)
  return n.length < 3 || GENERIC_FOLDERS.has(n.replace(/ /g, '')) ? '' : series
}

/** "029  Originalmusik" -> { number: 29, words: 'Originalmusik' }; "03_Pollyanna" -> 3 / 'Pollyanna' */
export function splitEpisode(folderName: string): { number?: number; name: string } {
  const cleaned = folderName.replace(/_/g, ' ').trim()
  const m = /^(\d{1,4})\s*(?:[-.:)]\s*)?(.*)$/.exec(cleaned)
  if (m && m[2]) return { number: Number.parseInt(m[1], 10), name: m[2].trim() }
  return { name: cleaned }
}

function numbersIn(text: string): number[] {
  return (normalize(text).match(/\b\d{1,4}\b/g) ?? []).map((n) => Number.parseInt(n, 10))
}

/** How well a result fits the album; below 2 it is not taken (see the top of this file). */
export function scoreCandidate(series: string, album: string, c: Candidate): number {
  const { number, name } = splitEpisode(album)
  const title = normalize(c.title)
  const both = ` ${title} ${normalize(c.artist)} `
  const words = normalize(name)
    .split(' ')
    .filter((w) => w.length >= 3 || /^\d+$/.test(w))
  if (words.length === 0) return 0
  // whole words; long ones may also sit inside a longer word ("Abenteuerwälder" in "Abenteuerwäldern")
  const padded = ` ${title} `
  if (!words.every((w) => padded.includes(` ${w} `) || (w.length >= 8 && title.includes(w)))) return 0
  let score = 1
  if (number !== undefined) {
    const found = numbersIn(c.title)
    if (found.includes(number)) score += 2
    else if (found.length > 0 && /\b(folge|teil|band|episode|fall|nr)\b/.test(title)) return 0 // another episode
  }
  const seriesCompact = normalize(series).replace(/ /g, '')
  if (seriesCompact.length >= 4 && both.replace(/ /g, '').includes(seriesCompact)) score += 2
  // Without episode number or series the name has to be the whole title, apart from additions in brackets or before/
  // after a colon or dash ("Pollyanna (Das immer fröhliche Mädchen)", "Folge 1: In 80 Tagen um die Welt") - else
  // "Christliche" takes "Christliche Kinderlieder" and "Asterix & Obelix" "34: Asterix & Obelix feiern Geburtstag".
  if (score === 1) {
    const withoutBrackets = (text: string) => text.replace(/[([{].*?[)\]}]/g, ' ')
    const names = [normalize(name), normalize(withoutBrackets(name))]
    const parts = [title, ...withoutBrackets(c.title).split(/:| - /).map((part) => normalize(part))]
    if (!parts.some((part) => names.includes(part))) return 0
  }
  if (c.genre && KIDS_GENRES.test(c.genre)) score += 1
  if (/\bsingle\b/.test(title)) score -= 1
  return score
}

// v: browsers kept a 404 of the first version (sent with a one-day cache) - a new URL goes past it
function coverUrl(file: string): string {
  return `/api/online-cover/${file}?v=2`
}

export class OnlineCovers {
  private index: Record<string, OnlineCoverEntry> = {}
  private readonly indexPath: string
  private queue: Array<{ key: string; series: string; album: string; reason: 'missing' | 'notSquare' }> = []
  private queued = new Set<string>()
  private running = false
  private lastRequest = { itunes: 0, deezer: 0 }
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly dir: string,
    private readonly isEnabled: () => boolean,
    // called after a cover was found (stores it in the album folder, when switched on)
    private readonly onFound?: (key: string) => Promise<void>,
  ) {
    this.indexPath = path.join(dir, 'index.json')
    try {
      this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'))
    } catch {
      this.index = {}
    }
  }

  static key(type: 'nas' | 'local', folderPath: string): string {
    return `${type}:${folderPath}`
  }

  /**
   * The online cover's URL for an album without a picture of its own, or undefined. Unknown albums are queued for
   * a lookup (when switched on), so the cover shows the next time.
   */
  coverFor(
    type: 'nas' | 'local',
    folderPath: string,
    series: string,
    album: string,
    reason: 'missing' | 'notSquare' = 'missing',
  ): string | undefined {
    const key = OnlineCovers.key(type, folderPath)
    const entry = this.index[key]
    if (entry?.status === 'found' && entry.file) return coverUrl(entry.file)
    if (!entry && this.isEnabled() && !this.queued.has(key)) {
      this.queued.add(key)
      // a scanned picture is on show already, a missing one is not: those go first
      if (reason === 'notSquare') this.queue.unshift({ key, series, album, reason })
      else this.queue.push({ key, series, album, reason })
      void this.work()
    }
    return undefined
  }

  isOn(): boolean {
    return this.isEnabled()
  }

  /** Albums still waiting for their lookup. */
  pending(): number {
    return this.queued.size
  }

  list(): Array<OnlineCoverEntry & { key: string; url?: string }> {
    return Object.entries(this.index)
      .map(([key, e]) => ({ key, ...e, url: e.file ? coverUrl(e.file) : undefined }))
      .sort((a, b) => b.at - a.at)
  }

  get(key: string): OnlineCoverEntry | undefined {
    return this.index[key]
  }

  update(key: string, change: Partial<OnlineCoverEntry>): void {
    const entry = this.index[key]
    if (!entry) return
    this.index[key] = { ...entry, ...change }
    this.scheduleSave()
  }

  /** A wrong cover: the picture goes, and this album is never looked up again. */
  reject(key: string): boolean {
    const entry = this.index[key]
    if (!entry) return false
    if (entry.file) fs.rmSync(path.join(this.dir, entry.file), { force: true })
    this.index[key] = { ...entry, status: 'rejected', file: undefined, savedTo: undefined, at: Date.now() }
    this.scheduleSave()
    return true
  }

  /** Forget the misses (and, with `alsoRejected`, the rejected ones), so they are looked up again. */
  /** These albums are looked up again (when shown or at the next library walk). */
  forget(keys: string[]): number {
    let n = 0
    for (const key of keys) {
      const entry = this.index[key]
      if (!entry) continue
      if (entry.file) fs.rmSync(path.join(this.dir, entry.file), { force: true })
      delete this.index[key]
      n++
    }
    this.scheduleSave()
    return n
  }

  retry(alsoRejected = false): number {
    let n = 0
    for (const [key, e] of Object.entries(this.index)) {
      if (e.status === 'none' || (alsoRejected && e.status === 'rejected')) {
        delete this.index[key]
        n++
      }
    }
    this.scheduleSave()
    return n
  }

  filePath(file: string): string | undefined {
    return /^[a-f0-9]{40}\.jpg$/.test(file) ? path.join(this.dir, file) : undefined
  }

  private async work(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0 && this.isEnabled()) {
        const job = this.queue.shift()
        if (!job) break
        try {
          this.index[job.key] = { ...(await this.lookUp(job.series, job.album, job.reason)), reason: job.reason }
          if (this.index[job.key].status === 'found' && this.onFound) {
            await this.onFound(job.key).catch((error) =>
              console.warn(`${new Date().toLocaleString()}: [OnlineCovers] storing ${job.album}: ${(error as Error).message}`),
            )
          }
        } catch (error) {
          // network trouble: not remembered, it is tried again the next time the album is shown
          console.warn(`${new Date().toLocaleString()}: [OnlineCovers] ${job.album}: ${(error as Error).message}`)
        } finally {
          this.queued.delete(job.key)
        }
        this.scheduleSave()
      }
    } finally {
      this.running = false
    }
  }

  private async lookUp(
    folderAbove: string,
    album: string,
    reason: 'missing' | 'notSquare' = 'missing',
  ): Promise<OnlineCoverEntry> {
    const base = { series: folderAbove, album, at: Date.now() }
    if (PART_FOLDER.test(album.trim())) return { ...base, status: 'none' }
    const series = usefulSeries(folderAbove)
    const { name } = splitEpisode(album)
    const queries = [...new Set([`${series} ${name}`.trim(), name])].filter((q) => q.length >= 3)
    // In place of a picture the album has (a scanned inlay) only a confirmed result: episode number or series -
    // a title that merely matches (a podcast episode "Aus der Tiefe" for a children's story of that name) would
    // replace the right picture with a wrong one.
    const minScore = reason === 'notSquare' ? 3 : 2
    let best: { c: Candidate; score: number } | undefined
    for (const q of queries) {
      for (const c of [...(await this.itunes(q)), ...(await this.deezer(q))]) {
        const score = scoreCandidate(series, album, c)
        if (score >= minScore && (!best || score > best.score)) best = { c, score }
      }
      if (best && best.score >= 3) break
    }
    if (!best) return { ...base, status: 'none' }
    const file = `${crypto.createHash('sha1').update(best.c.imageUrl).digest('hex')}.jpg`
    await this.download(best.c.imageUrl, path.join(this.dir, file))
    console.log(`${new Date().toLocaleString()}: [OnlineCovers] "${album}" -> ${best.c.source}: ${best.c.artist} - ${best.c.title}`)
    return {
      ...base,
      status: 'found',
      score: best.score,
      file,
      source: best.c.source,
      matchedTitle: best.c.title,
      matchedArtist: best.c.artist,
    }
  }

  private async spaced(service: 'itunes' | 'deezer'): Promise<void> {
    const wait = this.lastRequest[service] + SPACING_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequest[service] = Date.now()
  }

  private async itunes(term: string): Promise<Candidate[]> {
    await this.spaced('itunes')
    return searchItunes(term)
  }

  private async deezer(q: string): Promise<Candidate[]> {
    await this.spaced('deezer')
    return searchDeezer(q)
  }

  private async download(url: string, target: string): Promise<void> {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.startsWith('image/')) throw new Error(`cover download ${r.status} ${type}`)
    const data = Buffer.from(await r.arrayBuffer())
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) throw new Error(`cover size ${data.length}`)
    fs.mkdirSync(this.dir, { recursive: true })
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, target)
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        fs.mkdirSync(this.dir, { recursive: true })
        const tmp = `${this.indexPath}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(this.index))
        fs.renameSync(tmp, this.indexPath)
      } catch (error) {
        console.warn(`${new Date().toLocaleString()}: [OnlineCovers] saving the index failed: ${(error as Error).message}`)
      }
    }, 2000)
  }
}
