import fs from 'node:fs'
import path from 'node:path'
import { episodeKey } from './podcast-offline'

/**
 * What the display and the app show at a podcast's episodes: "new" and how far it was heard.
 *
 *   new   - it came out after the podcast was added (not all 400 episodes of a show added today), within the last
 *           N days (mupibox.newEpisodeDays, 3/7/14, default 7), and nobody has started it yet. mupibox.newEpisodes
 *           switches it off.
 *   heard - how far (percent) and whether to the end, from the player's positions (episode-positions.json);
 *           mupibox.episodeProgress switches the display of it off.
 *
 * When a podcast was added: the first time the box served its feed (podcast-first-seen.json, next to the library) -
 * a podcast already there at the update counts from then on, so nothing of it turns "new" at once.
 */

export interface EpisodeStateSettings {
  newEpisodes: boolean
  newEpisodeDays: number
  episodeProgress: boolean
}

export function episodeStateSettings(mb: Record<string, unknown> | undefined): EpisodeStateSettings {
  const days = Number(mb?.newEpisodeDays)
  return {
    newEpisodes: mb?.newEpisodes !== false,
    newEpisodeDays: [3, 7, 14].includes(days) ? days : 7,
    episodeProgress: mb?.episodeProgress !== false,
  }
}

type Position = { pos?: number; len?: number; done?: boolean }

export class EpisodeState {
  private firstSeen: Record<string, number> | null = null
  private firstSeenDirty = false
  private positions: { mtime: number; data: Record<string, Position> } = { mtime: -1, data: {} }

  constructor(
    private readonly configDir: string,
    private readonly settings: () => EpisodeStateSettings,
  ) {
    setInterval(() => this.saveFirstSeen(), 60_000).unref()
  }

  private get firstSeenFile() {
    return path.join(this.configDir, 'podcast-first-seen.json')
  }

  /** When the box first served this podcast's feed (now, if it never did) */
  firstSeenOf(feed: string): number {
    if (!this.firstSeen) {
      try {
        this.firstSeen = JSON.parse(fs.readFileSync(this.firstSeenFile, 'utf8')) ?? {}
      } catch {
        this.firstSeen = {}
      }
    }
    const seen = (this.firstSeen as Record<string, number>)[feed]
    if (seen) return seen
    const now = Date.now()
    ;(this.firstSeen as Record<string, number>)[feed] = now
    this.firstSeenDirty = true
    return now
  }

  private saveFirstSeen() {
    if (!this.firstSeenDirty || !this.firstSeen) return
    this.firstSeenDirty = false
    const tmp = `${this.firstSeenFile}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.firstSeen))
      fs.renameSync(tmp, this.firstSeenFile)
    } catch {
      this.firstSeenDirty = true
    }
  }

  // The player's positions, read again when the file changed
  private positionOf(url: string): Position | undefined {
    const file = path.join(this.configDir, 'episode-positions.json')
    try {
      const mtime = fs.statSync(file).mtimeMs
      if (mtime !== this.positions.mtime)
        this.positions = { mtime, data: JSON.parse(fs.readFileSync(file, 'utf8')) ?? {} }
    } catch {
      this.positions = { mtime: -1, data: {} }
    }
    return this.positions.data[episodeKey(url)] ?? this.positions.data[url]
  }

  /** The state of one episode: isNew, percent heard (0-100), heard to the end */
  of(feed: string, url: string, published: number | null): { isNew: boolean; percent: number; done: boolean } {
    const s = this.settings()
    const p = this.positionOf(url)
    const started = !!p
    const done = !!p?.done
    const percent =
      p && !done && p.len && p.pos ? Math.max(1, Math.min(99, Math.round((p.pos / p.len) * 100))) : done ? 100 : 0
    let isNew = false
    if (s.newEpisodes && published && !started) {
      isNew = published > this.firstSeenOf(feed) && published > Date.now() - s.newEpisodeDays * 24 * 3600 * 1000
    }
    return { isNew, percent: s.episodeProgress ? percent : 0, done: s.episodeProgress ? done : false }
  }

  /**
   * A feed as the display reads it (the cache's shape, see server.ts) with the state on each episode: _new, _pct,
   * _done. Changes the object it is given.
   */
  annotateFeed(feed: string, parsed: any): any {
    const raw = parsed?.rss?.channel?.item
    const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as any[]
    // (every podcast the display asks for is "seen" from now on, also one without episodes)
    this.firstSeenOf(feed)
    const text = (v: any) => (typeof v === 'string' ? v : (v?._text ?? v?._cdata ?? ''))
    for (const it of items) {
      const url = it?.enclosure?._attributes?.url
      if (typeof url !== 'string') continue
      const when = Date.parse(text(it.pubDate))
      const st = this.of(feed, url, Number.isFinite(when) ? when : null)
      if (st.isNew) it._new = true
      if (st.percent) it._pct = st.percent
      if (st.done) it._done = true
    }
    return parsed
  }
}
