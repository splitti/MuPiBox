// Spotify albums added by a link (the app's "Link einfügen", the box's add page, Telegram) were kept as their id only:
// the display asked Spotify for every one of them whenever it made its lists, and one Spotify did not answer for
// (blocking the box's requests, a timeout) became a tile without a name - left out of the start page (seen by hefti:
// albums there after a restart, gone again later). Their name, cover, artist and release date are written into
// data.json once, through the Spotify cache: the display shows them from there (media.service storedSpotifyAlbum)
// without asking Spotify at all. What the parents set themselves (the name of the tile = artist, an own cover) stays.

import { readFile } from 'node:fs/promises'
import { withLock } from './file-lock'
import type { SpotifyApiService } from './services/spotify-api.service'
import { spotifyBlock } from './spotify-block'

export interface AlbumFillDeps {
  dataFile: string
  dataLock: string
  spotify: () => SpotifyApiService | undefined
  /** data.json written (atomically, with the backup of the version before) */
  write: (data: unknown[]) => Promise<void>
}

type Row = Record<string, unknown>

// (a few at a time: one run asks Spotify for at most this many albums, the rest come with the next one)
const MAX_PER_RUN = 40
const EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_AFTER_MS = 90 * 1000

const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

/** A row of a Spotify album that has only its id (no name or no cover of its own). */
export function isBareAlbum(m: unknown): m is Row {
  const r = m as Row | null
  if (!r || typeof r !== 'object' || r.type !== 'spotify' || !text(r.id)) return false
  if (text(r.artistid) || text(r.query) || text(r.playlistid) || text(r.showid) || text(r.audiobookid)) return false
  return !text(r.title) || !text(r.cover)
}

// the smallest cover at least 300 px wide (as the display's pickCoverUrl), else the first
function coverOf(images: { url?: string; width?: number | null }[] | undefined): string | undefined {
  if (!images?.length) return undefined
  const sized = images.filter((i) => i?.url && typeof i.width === 'number' && i.width >= 300)
  sized.sort((a, b) => (a.width as number) - (b.width as number))
  return sized[0]?.url ?? images[0]?.url
}

let running = false
// albums Spotify said it does not know (until a restart of the server)
const unknown = new Set<string>()

export async function fillSpotifyAlbums(deps: AlbumFillDeps, why: string): Promise<number> {
  const spotify = deps.spotify()
  if (running || !spotify || spotifyBlock()) return 0
  running = true
  try {
    const data = JSON.parse(await readFile(deps.dataFile, 'utf8')) as unknown
    if (!Array.isArray(data)) return 0
    const ids = [...new Set(data.filter(isBareAlbum).map((m) => m.id as string))].filter((id) => !unknown.has(id)).slice(0, MAX_PER_RUN)
    if (ids.length === 0) return 0
    const found = new Map<string, { name?: string; artists?: { name?: string }[]; images?: { url?: string; width?: number | null }[]; release_date?: string }>()
    for (const id of ids) {
      // (Spotify started blocking meanwhile: each further request only keeps the block going)
      if (spotifyBlock()) break
      try {
        const album = await spotify.getAlbum(id)
        if (text(album?.name)) found.set(id, album)
      } catch (err) {
        // asked again at the next run - not an album Spotify does not know (any more): not every 6 h until a restart
        const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { status?: number })?.status
        if (status === 400 || status === 404) unknown.add(id)
      }
    }
    if (found.size === 0) return 0
    const changed = await withLock(deps.dataLock, 'spotify album fill', async () => {
      // (read again under the lock: the library may have changed while Spotify was asked)
      const fresh = JSON.parse(await readFile(deps.dataFile, 'utf8')) as unknown
      if (!Array.isArray(fresh)) return 0
      let count = 0
      for (const m of fresh) {
        if (!isBareAlbum(m)) continue
        const album = found.get(m.id as string)
        if (!album) continue
        if (!text(m.title)) m.title = album.name
        if (!text(m.cover)) {
          const cover = coverOf(album.images)
          if (cover) m.cover = cover
        }
        if (!text(m.artist) && text(album.artists?.[0]?.name)) m.artist = album.artists?.[0]?.name
        if (!text(m.release_date) && text(album.release_date)) m.release_date = album.release_date
        count++
      }
      if (count > 0) await deps.write(fresh)
      return count
    })
    if (typeof changed === 'number' && changed > 0) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Spotify albums with name and cover now (${why}): ${changed}`)
      return changed
    }
    return 0
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] Spotify album fill (${why}) failed:`, err instanceof Error ? err.message : err)
    return 0
  } finally {
    running = false
  }
}

/** Once shortly after the start (the old rows), then every 6 h (rows a block kept from being filled). */
export function startSpotifyAlbumFill(deps: AlbumFillDeps): void {
  setTimeout(() => void fillSpotifyAlbums(deps, 'start'), FIRST_AFTER_MS).unref()
  setInterval(() => void fillSpotifyAlbums(deps, 'every 6 h'), EVERY_MS).unref()
}
