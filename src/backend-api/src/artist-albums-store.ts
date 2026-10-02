// The albums of a Spotify artist, kept on the SD card (cache/artist-albums): for the display's artist entries and the
// Smart-Sync's artist subscriptions. A big artist has hundreds of albums - 30 pages of 10 for Spotify apps under its
// 2026 rules - and asking for all of them again and again ran those apps into blocks of many hours.
//
// Spotify lists an artist's albums newest first (checked with artists of 25, 177 and 294 albums). So once the whole
// list is kept, a check asks for the first page only: the albums not known yet are the new ones, and Spotify's total
// says whether that is all (else - an album removed, or one added with an older date - the whole list is asked again).
// A check at most every 6 hours, the whole list at least once a week. Written only when the list changed.

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface StoredAlbum {
  id?: string
  name?: string
  album_type?: string
  artists?: Array<{ id?: string; name?: string }>
  images?: Array<{ url?: string; width?: number | null; height?: number | null }>
  release_date?: string
}

export interface AlbumPage {
  items?: StoredAlbum[]
  total?: number
  next?: string | null
}

/** One page of the artist's albums from `offset` on (the caller picks how many per page). */
export type FetchAlbumPage = (offset: number) => Promise<AlbumPage>

const DIR = path.join(process.cwd(), 'cache', 'artist-albums')
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FULL_EVERY_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ALBUMS = 500
const PAGE_PAUSE_MS = 400

interface Kept {
  albums: StoredAlbum[]
  total: number
  /** when the whole list was asked (ms) */
  fullAt: number
}

const memory = new Map<string, Kept & { checkedAt: number }>()
const running = new Map<string, Promise<StoredAlbum[]>>()

const keyOf = (artistId: string, groups: string) => `${artistId}_${groups}`.replace(/[^A-Za-z0-9_-]/g, '-')
const fileOf = (key: string) => path.join(DIR, `${key}.json`)

function read(key: string): (Kept & { checkedAt: number }) | undefined {
  const inMemory = memory.get(key)
  if (inMemory) return inMemory
  try {
    const kept = JSON.parse(fs.readFileSync(fileOf(key), 'utf8')) as Kept
    if (!Array.isArray(kept?.albums)) return undefined
    // (checked when the server started: a first check after a restart asks one page)
    const entry = { ...kept, checkedAt: 0 }
    memory.set(key, entry)
    return entry
  } catch {
    return undefined
  }
}

function keep(key: string, kept: Kept, changed: boolean): void {
  memory.set(key, { ...kept, checkedAt: Date.now() })
  if (!changed) return
  try {
    fs.mkdirSync(DIR, { recursive: true })
    const tmp = `${fileOf(key)}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(kept))
    fs.renameSync(tmp, fileOf(key))
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [artist-albums] could not keep ${key}: ${(err as Error).message}`)
  }
}

// only what the box uses (the list of a big artist stays small on the card)
const slim = (a: StoredAlbum): StoredAlbum => ({
  id: a.id,
  name: a.name,
  album_type: a.album_type,
  artists: (a.artists ?? []).map((x) => ({ id: x?.id, name: x?.name })),
  images: (a.images ?? []).map((i) => ({ url: i?.url, width: i?.width ?? null, height: i?.height ?? null })),
  release_date: a.release_date,
})

// the whole lists queue up: many pages of several artists at the same moment is what Spotify answers with a block
let queue: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}

async function wholeList(fetchPage: FetchAlbumPage): Promise<{ albums: StoredAlbum[]; total: number }> {
  const albums: StoredAlbum[] = []
  const seen = new Set<string>()
  let offset = 0
  let total = 0
  while (albums.length < MAX_ALBUMS) {
    const page = await fetchPage(offset)
    const items = page.items ?? []
    if (typeof page.total === 'number') total = page.total
    for (const a of items) {
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id)
        albums.push(slim(a))
      }
    }
    // (Spotify's own paging decides - a page it shortened to fewer than asked for still has a next one)
    if (!page.next || items.length === 0) break
    offset += items.length
    // a pause between the pages: a whole list of 30 pages at once is what Spotify answers with a block
    await new Promise((resolve) => setTimeout(resolve, PAGE_PAUSE_MS))
  }
  return { albums, total: total || albums.length }
}

/**
 * The artist's albums, newest first: kept, checked with one page, or asked whole (see above).
 * staleOnError: when Spotify cannot be asked (a block, no network), a kept list is handed out instead of the error -
 * the display goes on showing it; the sync wants the error (to stop and wait for a block).
 */
export async function artistAlbums(
  artistId: string,
  groups: string,
  fetchPage: FetchAlbumPage,
  opts: { staleOnError?: boolean } = {},
): Promise<StoredAlbum[]> {
  const key = keyOf(artistId, groups)
  const busy = running.get(key)
  if (busy) return busy
  const work = (async () => {
    const kept = read(key)
    const now = Date.now()
    if (kept && now - kept.checkedAt < CHECK_EVERY_MS) return kept.albums
    try {
      if (kept && now - kept.fullAt < FULL_EVERY_MS) {
        const first = await fetchPage(0)
        const known = new Set(kept.albums.map((a) => a.id))
        const fresh = (first.items ?? []).filter((a) => a?.id && !known.has(a.id)).map(slim)
        if (typeof first.total === 'number' && first.total === kept.albums.length + fresh.length) {
          const albums = [...fresh, ...kept.albums]
          keep(key, { albums, total: first.total, fullAt: kept.fullAt }, fresh.length > 0)
          if (fresh.length) console.log(`${new Date().toLocaleString()}: [artist-albums] ${artistId}: ${fresh.length} new (1 request)`)
          return albums
        }
      }
      // one whole list after the other (the display asks all its artists at once when it starts)
      const whole = await oneAtATime(() => wholeList(fetchPage))
      keep(key, { albums: whole.albums, total: whole.total, fullAt: now }, true)
      console.log(`${new Date().toLocaleString()}: [artist-albums] ${artistId}: whole list asked, ${whole.albums.length} albums`)
      return whole.albums
    } catch (err) {
      if (opts.staleOnError && kept) return kept.albums
      throw err
    }
  })()
  running.set(key, work)
  try {
    return await work
  } finally {
    running.delete(key)
  }
}
