import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pickEpisodes } from './episode-pick'

/**
 * Podcast episodes kept on the SD card, to be heard without internet (in the car, on holiday) - for any podcast,
 * the ARD Sounds shows among them.
 *
 * Per podcast (its library entry, field "offline"): the newest N episodes are kept (of the ones chosen for the box,
 * field "episodePick", see episode-pick.ts), the next ones come as they appear and the ones that drop out of the
 * newest N go again. Single episodes can be kept as well ("pinned"); those
 * stay until they are deleted. All of a podcast's files go when the podcast leaves the library.
 *
 * A file is named after the SHA-1 of the episode's key (<sha1>.<ext>, see episodeKey): the player looks for it by the
 * address it is given and plays the file when there is one (backend-player, offlineEpisodeFile) - with or without
 * network, and resume keeps working with the address. index.json holds what the app shows (podcast, title, size,
 * pinned), by key.
 *
 * One download at a time; each is written to a .part file and renamed when complete, and never fills the card
 * beyond a reserve.
 *
 * Rights: an episode is only kept when its source releases it for download. A podcast feed is meant to be downloaded
 * (its enclosure); an ARD show (ard-sounds.ts) names per episode whether the ARD allows it (allowDownload with a
 * downloadUrl) - without that it is only streamed, its stream address is never saved instead. An episode with an
 * end of its time online (the ARD's endDate) is deleted then, a pinned one too.
 */

export const OFFLINE_EXTENSIONS = ['.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.opus']
const RESERVE_BYTES = 1024 * 1024 * 1024
const MAX_FILE_BYTES = 1024 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000
export const MAX_KEEP = 50

export interface OfflineFile {
  name: string
  /** the episode's address as the feed named it last */
  url: string
  feed: string
  title: string
  bytes: number
  at: number
  pinned: boolean
  /** when it has to go (the end of its time online, ms), if its source names one */
  until?: number
}

/** An episode as the feed names it */
export interface OfflineEpisode {
  url: string
  title: string
  /**
   * Where it may be downloaded: undefined = from its own address (a podcast feed); a string = from there (the ARD's
   * downloadUrl); null = not at all (the ARD does not release it - streaming only)
   */
  download?: string | null
  /** the end of its time online (ms), if any */
  until?: number | null
}

interface Job {
  url: string
  /** the address that is downloaded (the episode's own, or the ARD's download address) */
  source: string
  feed: string
  title: string
  pinned: boolean
  until?: number
}

/** Whether an episode may be kept on the card now */
export const mayKeep = (e: OfflineEpisode, now = Date.now()) => e.download !== null && !(e.until && e.until <= now)

export interface OfflineDeps {
  dir: string
  /** A GET of an address the box did not choose, checked on every hop (server.ts, openRemote) */
  openRemote: (url: string, signal: AbortSignal) => Promise<Response>
  /** A podcast's episodes, newest first (from the feed cache), or null when it cannot be read now */
  episodes: (feed: string) => Promise<OfflineEpisode[] | null>
  /**
   * Every podcast of the library, how many of its newest episodes to keep and its choice of episodes, or null when
   * the library cannot be read now (then nothing is removed: an empty list would mean "no podcast any more" and
   * delete every file)
   */
  feeds: () => Promise<{ feed: string; keep: number; pick?: string }[] | null>
  /** Something was added or removed (the display reads its lists again) */
  changed: () => void
}

/**
 * What stays the same of an episode's address from one fetch of the feed to the next. Some podcast hosts put values
 * for statistics or ads into the query of the MP3 address, new at every fetch: the position, the file on the card
 * and resume went with the address and were lost. When the path names the audio file itself, the query (and the
 * scheme) is left out; an address like ".../download.php?id=123" is kept whole - there the query names the episode.
 * The player works it out the same way (backend-player, episodeKey).
 */
export function episodeKey(url: string): string {
  try {
    const u = new URL(url)
    if (/\.(mp3|m4a|mp4|aac|ogg|oga|opus|wav|flac)$/i.test(u.pathname)) return `${u.host.toLowerCase()}${u.pathname}`
  } catch {
    // no URL: as it is
  }
  return url
}

export const offlineName = (url: string) => {
  let ext = '.mp3'
  try {
    const e = path.extname(new URL(url).pathname).toLowerCase()
    if (OFFLINE_EXTENSIONS.includes(e)) ext = e
  } catch {
    // no URL: .mp3
  }
  return `${crypto.createHash('sha1').update(episodeKey(url)).digest('hex')}${ext}`
}

export class PodcastOffline {
  private files: Record<string, OfflineFile> = {}
  private loading: Promise<void> | null = null
  private queue: Job[] = []
  private current: (Job & { done: number; total: number }) | null = null
  private abort: AbortController | null = null
  private lastError: { url: string; title: string; error: string; at: number } | null = null
  private syncing = false

  constructor(private readonly deps: OfflineDeps) {}

  private get indexFile() {
    return path.join(this.deps.dir, 'index.json')
  }

  // (read once; every caller waits for that same read - requests at the start, e.g. the display asking for all
  // podcasts at once, saw an empty list until it was done)
  private load(): Promise<void> {
    // (a failed save of the tidied list keeps what was read: the next save writes it)
    this.loading ??= this.readIndex().catch(() => undefined)
    return this.loading
  }

  private async readIndex(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.indexFile, 'utf8')) as { files?: Record<string, OfflineFile> }
      this.files = data.files && typeof data.files === 'object' ? data.files : {}
    } catch {
      this.files = {}
    }
    let changed = false
    for (const [k, f] of Object.entries(this.files)) {
      // (a file that is gone - deleted by hand, a card swapped - is not kept in the list)
      if (!(await stat(path.join(this.deps.dir, f.name)).catch(() => null))) {
        delete this.files[k]
        changed = true
        continue
      }
      // a list of before the keys: by the address, the file named after it - taken over under its key
      const url = f.url ?? k
      const key = episodeKey(url)
      const name = offlineName(url)
      if (key === k && f.url && f.name === name) continue
      if (f.name !== name) await rename(path.join(this.deps.dir, f.name), path.join(this.deps.dir, name)).catch(() => undefined)
      delete this.files[k]
      this.files[key] = { ...f, url, name }
      changed = true
    }
    if (changed) await this.save()
  }

  /** The kept file of this episode (by its key), or undefined */
  async fileOf(url: string): Promise<OfflineFile | undefined> {
    await this.load()
    return this.files[episodeKey(url)]
  }

  private async save(): Promise<void> {
    await mkdir(this.deps.dir, { recursive: true })
    const tmp = `${this.indexFile}.tmp`
    await writeFile(tmp, JSON.stringify({ files: this.files }))
    await rename(tmp, this.indexFile)
  }

  /** A podcast's episodes, newest first, as the downloads see them */
  episodes(feed: string) {
    return this.deps.episodes(feed)
  }

  async list(feed?: string): Promise<Record<string, OfflineFile>> {
    await this.load()
    if (!feed) return { ...this.files }
    return Object.fromEntries(Object.entries(this.files).filter(([, f]) => f.feed === feed))
  }

  async status(feed?: string) {
    const files = await this.list(feed)
    const inFeed = (j: Job) => !feed || j.feed === feed
    return {
      files,
      bytes: Object.values(files).reduce((n, f) => n + f.bytes, 0),
      queued: this.queue.filter(inFeed).map((j) => j.url),
      current: this.current && inFeed(this.current) ? { url: this.current.url, title: this.current.title, done: this.current.done, total: this.current.total } : null,
      lastError: this.lastError && (!feed || this.queue.length === 0) ? this.lastError : null,
      free: await this.freeBytes(),
      reserve: RESERVE_BYTES,
    }
  }

  private async freeBytes(): Promise<number> {
    await mkdir(this.deps.dir, { recursive: true }).catch(() => undefined)
    const info = await statfs(this.deps.dir).catch(() => null)
    return info ? Number(info.bavail) * Number(info.bsize) : 0
  }

  /**
   * Keep this episode (pinned: until it is deleted or its time online ends; else as one of the newest N). Throws
   * not_downloadable when its source does not release it (see mayKeep).
   */
  async add(episode: OfflineEpisode, feed: string, pinned: boolean): Promise<void> {
    await this.load()
    const { url, title } = episode
    if (!/^https?:\/\//.test(url)) throw new Error('not an http(s) address')
    if (!mayKeep(episode)) throw new Error('not_downloadable')
    const source = episode.download ?? url
    if (!/^https?:\/\//.test(source)) throw new Error('not an http(s) address')
    const until = episode.until ?? undefined
    const key = episodeKey(url)
    const have = this.files[key]
    if (have) {
      // (the address as the feed names it now: the app and the offline list compare with it)
      if ((pinned && !have.pinned) || have.url !== url || have.until !== until) {
        have.pinned ||= pinned
        have.url = url
        have.until = until
        await this.save()
      }
      return
    }
    const sameKey = (j: Job) => episodeKey(j.url) === key
    const queued = this.queue.find(sameKey) ?? (this.current && sameKey(this.current) ? this.current : undefined)
    if (queued) {
      queued.pinned ||= pinned
      return
    }
    this.queue.push({ url, source, feed, title, pinned, until })
    void this.work()
  }

  /** Deletes the episode's file (or takes it out of the queue) */
  async remove(url: string): Promise<boolean> {
    await this.load()
    const key = episodeKey(url)
    this.queue = this.queue.filter((j) => episodeKey(j.url) !== key)
    if (this.current && episodeKey(this.current.url) === key) this.abort?.abort()
    const f = this.files[key]
    if (!f) return false
    delete this.files[key]
    await rm(path.join(this.deps.dir, f.name), { force: true })
    await this.save()
    this.deps.changed()
    return true
  }

  private async work(): Promise<void> {
    if (this.current) return
    while (this.queue.length) {
      const job = this.queue.shift() as Job
      this.current = { ...job, done: 0, total: 0 }
      this.abort = new AbortController()
      try {
        await this.download(this.current, this.abort.signal)
        this.deps.changed()
      } catch (error) {
        if (!this.abort.signal.aborted) {
          this.lastError = { url: job.url, title: job.title, error: String((error as Error).message ?? error), at: Date.now() }
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] podcast download failed (${job.title}): ${this.lastError.error}`)
        }
      } finally {
        this.current = null
        this.abort = null
      }
    }
  }

  private async download(job: Job & { done: number; total: number }, outer: AbortSignal): Promise<void> {
    await mkdir(this.deps.dir, { recursive: true })
    const name = offlineName(job.url)
    const target = path.join(this.deps.dir, name)
    const part = `${target}.part`
    // (cancelled from the app, or taking longer than an hour)
    const both = new AbortController()
    const timer = setTimeout(() => both.abort(new Error('download took too long')), DOWNLOAD_TIMEOUT_MS)
    outer.addEventListener('abort', () => both.abort(outer.reason), { once: true })
    const signal = both.signal
    try {
      await this.fetchTo(job, signal, name, target, part)
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchTo(job: Job & { done: number; total: number }, signal: AbortSignal, name: string, target: string, part: string): Promise<void> {
    const response = await this.deps.openRemote(job.source, signal)
    const type = response.headers.get('content-type') ?? ''
    if (type && /^(text|application\/(json|xml|xhtml))/i.test(type)) {
      await response.body?.cancel()
      throw new Error(`no audio file (${type})`)
    }
    const room = (await this.freeBytes()) - RESERVE_BYTES
    const advertised = Number.parseInt(response.headers.get('content-length') ?? '0', 10) || 0
    job.total = advertised
    if (advertised > MAX_FILE_BYTES || advertised > room || room <= 0) {
      await response.body?.cancel()
      throw new Error(advertised > MAX_FILE_BYTES ? 'file too large' : 'not_enough_space')
    }
    const limit = Math.min(room, MAX_FILE_BYTES)
    const count = new Transform({
      transform(chunk: Buffer, _enc, done) {
        job.done += chunk.length
        done(job.done > limit ? new Error(job.done > MAX_FILE_BYTES ? 'file too large' : 'not_enough_space') : null, chunk)
      },
    })
    if (!response.body) throw new Error('empty answer')
    try {
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), count, createWriteStream(part), { signal })
      if (job.done === 0) throw new Error('empty file')
      await rename(part, target)
    } catch (error) {
      await rm(part, { force: true })
      throw error
    }
    this.files[episodeKey(job.url)] = {
      name,
      url: job.url,
      feed: job.feed,
      title: job.title,
      bytes: job.done,
      at: Date.now(),
      pinned: job.pinned,
      ...(job.until ? { until: job.until } : {}),
    }
    await this.save()
  }

  /**
   * One podcast as its setting says: its newest `keep` episodes (of the chosen ones, `pick`) that may be kept there
   * (the missing ones queued), the others that came that way deleted. Pinned ones stay - unless their source no
   * longer releases them.
   */
  async syncFeed(feed: string, keep: number, pick?: string): Promise<void> {
    await this.load()
    const episodes = await this.deps.episodes(feed)
    if (!episodes) return // (feed not readable now: nothing is deleted on that basis)
    const wanted = pickEpisodes(episodes, pick).filter((e) => mayKeep(e)).slice(0, Math.max(0, Math.min(keep, MAX_KEEP)))
    const wantedKeys = new Set(wanted.map((e) => episodeKey(e.url)))
    for (const e of wanted) await this.add(e, feed, false)
    this.queue = this.queue.filter((j) => j.feed !== feed || j.pinned || wantedKeys.has(episodeKey(j.url)))
    const byKey = new Map(episodes.map((e) => [episodeKey(e.url), e]))
    for (const [key, f] of Object.entries(this.files)) {
      if (f.feed !== feed) continue
      const now = byKey.get(key)
      // (released no longer, or its end date moved: taken from the feed as it is now)
      if (now && !mayKeep(now)) await this.remove(f.url)
      else if (!f.pinned && !wantedKeys.has(key)) await this.remove(f.url)
      else if (now && (now.until ?? undefined) !== f.until) await this.add(now, feed, f.pinned)
    }
  }

  /** Files whose time online is over: deleted (pinned ones too) - also when no feed can be read now */
  async removeExpired(now = Date.now()): Promise<void> {
    await this.load()
    for (const f of Object.values(this.files)) if (f.until && f.until <= now) await this.remove(f.url)
    this.queue = this.queue.filter((j) => !(j.until && j.until <= now))
  }

  /** Every podcast of the library; the files of podcasts no longer in it go */
  async syncAll(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      await this.removeExpired()
      const feeds = await this.deps.feeds()
      if (!feeds) return
      const inLibrary = new Set(feeds.map((f) => f.feed))
      for (const f of Object.values(this.files)) if (!inLibrary.has(f.feed)) await this.remove(f.url)
      for (const { feed, keep, pick } of feeds) {
        const has = Object.values(this.files).some((f) => f.feed === feed)
        if (keep > 0 || has) await this.syncFeed(feed, keep, pick).catch(() => undefined)
      }
      await this.cleanStrays()
    } finally {
      this.syncing = false
    }
  }

  // Files in the folder that the list does not know (a crash between writing and noting it): gone
  private async cleanStrays(): Promise<void> {
    const known = new Set(Object.values(this.files).map((f) => f.name))
    const busy = this.current ? `${offlineName(this.current.url)}.part` : ''
    for (const name of await readdir(this.deps.dir).catch(() => [] as string[])) {
      if (name === 'index.json' || known.has(name) || name === busy) continue
      if (OFFLINE_EXTENSIONS.some((e) => name.endsWith(e) || name.endsWith(`${e}.part`))) await rm(path.join(this.deps.dir, name), { force: true })
    }
  }

  /** Runs syncAll a few minutes after the start and then every hour */
  start(): void {
    const run = () => void this.syncAll().catch((e) => console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] podcast offline sync: ${e}`))
    setTimeout(run, 3 * 60 * 1000).unref()
    setInterval(run, 60 * 60 * 1000).unref()
  }
}
