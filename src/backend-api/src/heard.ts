import fs from 'node:fs'
import path from 'node:path'
import type { Request, Router } from 'express'
import { requireCsrf, requireSession } from './app-api/middleware'
import { writeJsonSync } from './json-file'

/**
 * What of the library was heard (5.1, issue #180): an album or episode started (a yellow tick at its cover in the list of
 * the display) or heard to its end (a green one). Podcast episodes have their own (episode-state.ts) - this is the rest:
 * an album of the box's own files, of the NAS, of TIDAL and of Spotify.
 *
 *   started   - one minute of it played (a tap and back again is no start)
 *   finished  - its last track played to its last 30 s, or to its end. It stays so when it is heard again.
 *
 * The player tells the two moments (POST /api/heard/note, see spotify-control.js "Heard"); the parents can set it in the
 * app (heard or not heard). Kept in heard.json next to the library - written only when something changes.
 *
 * The key of what was heard - the same in the display (heard-key.ts), the app and the player:
 *   lib:<folder>                   a folder of the box's library (its path below the media folder)
 *   nas:<path>                     a NAS folder
 *   tidal:<album|playlist>:<id>    an album or a playlist of TIDAL
 *   jellyfin:<album|playlist|book>:<id>  an album, a playlist or an audiobook of Jellyfin
 *   audible:book:<asin>            a book of Audible (a whole series has none: its books do)
 *   spotify:<kind>:<id>            what Spotify plays: album, playlist, episode, show
 */

export const HEARD_KEY = /^(lib|nas|tidal|jellyfin|audible|spotify):[^\n]{1,400}$/
const MAX_ENTRIES = 5000

export type HeardState = 'started' | 'finished'
type Entry = { s?: number; f?: number }

export function heardSettings(mb: Record<string, unknown> | undefined): { enabled: boolean } {
  return { enabled: mb?.heardMarks !== false }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
function ok(key: string): string | null {
  return HEARD_KEY.test(key) ? key : null
}

/**
 * The key of an entry of the library or of the resume list (a Media of the display, a row of data.json), or null - what
 * gets no tick: a radio, a podcast (episode-state.ts), a folder that holds folders, an artist of TIDAL as a whole.
 */
export function heardKeyOf(item: Record<string, unknown> | null | undefined): string | null {
  if (!item) return null
  const type = str(item.type)
  if (type === 'nas' || str(item.nasPath)) {
    if (item.nasIsContainer === true || !str(item.nasPath)) return null
    return ok(`nas:${str(item.nasPath)}`)
  }
  if (type === 'library') {
    if (item.libraryIsContainer === true) return null
    if (str(item.libraryPath)) return ok(`lib:${str(item.libraryPath)}`)
    // (an old row: category/artist/title, as the player plays it)
    const category = str(item.category) === 'resume' ? str(item.resumelocalalbum) : str(item.category)
    return str(item.artist) && str(item.title) ? ok(`lib:${category || 'audiobook'}/${str(item.artist)}/${str(item.title)}`) : null
  }
  if (type === 'tidal') {
    if (item.tidalKind === 'artist' || !str(item.id)) return null
    return ok(`tidal:${item.tidalKind === 'playlist' ? 'playlist' : 'album'}:${str(item.id)}`)
  }
  if (type === 'jellyfin') {
    const kind = str(item.jellyfinKind) || 'album'
    if (kind === 'artist' || !['album', 'playlist', 'book'].includes(kind) || !str(item.id)) return null
    return ok(`jellyfin:${kind}:${str(item.id)}`)
  }
  if (type === 'audible') {
    if (item.audibleKind === 'series' || !/^[A-Z0-9]{10}$/.test(str(item.id))) return null
    return ok(`audible:book:${str(item.id)}`)
  }
  if (type === 'spotify') {
    // (as the display plays it, see player.service.ts playMedia)
    if (str(item.playlistid)) return ok(`spotify:playlist:${str(item.playlistid)}`)
    if (str(item.id)) return ok(`spotify:album:${str(item.id)}`)
    if (str(item.showid)) return ok(`spotify:episode:${str(item.showid)}`)
    if (str(item.audiobookid)) return ok(`spotify:show:${str(item.audiobookid)}`)
  }
  return null
}

export class HeardStore {
  private data: Record<string, Entry> | null = null

  constructor(
    private readonly dir: string,
    /** The resume list (resume.json): what is in it counts as started when the store is made the first time. */
    private readonly resumeEntries: () => unknown[] = () => [],
  ) {}

  private get file() {
    return path.join(this.dir, 'heard.json')
  }

  /** Read anew when next asked (after a switch of the user: his file is in place now - users.ts) */
  forget(): void {
    this.data = null
  }

  private load(): Record<string, Entry> {
    if (this.data) return this.data
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      this.data = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, Entry>) : {}
    } catch (err) {
      this.data = {}
      // (the first time: what "Weiterhören" holds was started already - the ticks are not all empty at the start)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const now = Date.now()
        for (const m of this.resumeEntries()) {
          const key = heardKeyOf(m as Record<string, unknown>)
          if (key) this.data[key] = { s: now }
        }
        this.save()
      }
    }
    return this.data
  }

  private save() {
    const all = this.data ?? {}
    // (the oldest go when there are too many)
    const keys = Object.keys(all)
    if (keys.length > MAX_ENTRIES) {
      const last = (e: Entry) => Math.max(e.s ?? 0, e.f ?? 0)
      for (const k of keys.sort((a, b) => last(all[a]) - last(all[b])).slice(0, keys.length - MAX_ENTRIES)) delete all[k]
    }
    try {
      writeJsonSync(this.file, all)
    } catch (err) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] heard.json not saved: ${(err as Error).message}`)
    }
  }

  /** Every key with its state */
  all(): Record<string, HeardState> {
    const out: Record<string, HeardState> = {}
    for (const [k, e] of Object.entries(this.load())) {
      if (e?.f) out[k] = 'finished'
      else if (e?.s) out[k] = 'started'
    }
    return out
  }

  stateOf(key: string): HeardState | null {
    const e = this.load()[key]
    return e?.f ? 'finished' : e?.s ? 'started' : null
  }

  /** The player: one minute of it played, or its end reached. A finished one stays finished. Returns whether it changed. */
  note(key: string, state: HeardState): boolean {
    if (!HEARD_KEY.test(key)) return false
    const all = this.load()
    const e = all[key] ?? {}
    if (state === 'started' && (e.s || e.f)) return false
    if (state === 'finished' && e.f) return false
    const now = Date.now()
    all[key] = state === 'finished' ? { s: e.s ?? now, f: now } : { s: now }
    this.save()
    return true
  }

  /** The parents: these as heard to the end, or as not heard at all */
  set(keys: string[], state: 'finished' | 'unheard'): number {
    const all = this.load()
    const now = Date.now()
    let changed = 0
    for (const key of keys) {
      if (!HEARD_KEY.test(key)) continue
      if (state === 'unheard') {
        if (all[key]) {
          delete all[key]
          changed++
        }
      } else if (!all[key]?.f) {
        all[key] = { s: all[key]?.s ?? now, f: now }
        changed++
      }
    }
    if (changed) this.save()
    return changed
  }
}

/**
 * The app (Bibliothek): GET  /api/app/heard          {enabled, items: {key: started|finished}}
 *                        POST /api/app/heard          {keys: [...], state: finished|unheard} - as heard, as not heard
 */
export function registerHeardAppRoutes(
  router: Router,
  store: HeardStore,
  enabled: () => boolean,
  // (several users: the ticks of the user the app named, and his lock around a change - ../users.ts)
  forRequest: (req: Request) => { store: HeardStore; run: <T>(work: () => T) => T | 'locked' } = () => ({ store, run: (work) => work() }),
): void {
  router.get('/heard', requireSession, (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ enabled: enabled(), items: forRequest(req).store.all() })
  })
  router.post('/heard', requireSession, requireCsrf, (req, res) => {
    const body = (req.body ?? {}) as { keys?: unknown; state?: unknown }
    const keys = Array.isArray(body.keys) ? body.keys : null
    if (!keys || keys.length === 0 || keys.length > 2000 || !keys.every((k) => typeof k === 'string' && HEARD_KEY.test(k))) {
      res.status(400).json({ error: 'keys' })
      return
    }
    if (body.state !== 'finished' && body.state !== 'unheard') {
      res.status(400).json({ error: 'state' })
      return
    }
    const target = forRequest(req)
    const changed = target.run(() => target.store.set(keys as string[], body.state as 'finished' | 'unheard'))
    if (changed === 'locked') {
      res.status(409).json({ error: 'busy' })
      return
    }
    res.json({ changed, items: target.store.all() })
  })
}
