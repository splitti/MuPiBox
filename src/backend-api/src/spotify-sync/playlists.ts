// Phase 14b — playlist discovery + track resolution.
//
// Two responsibilities:
//   1. discoverPlaylists() — pull /me/playlists, filter to the configured
//      MuPiBox-prefix (Q5 decision), parse description for override tags
//      (Q1=C episode-only, §6.3.1 category override).
//   2. resolveSyncItems() — fetch tracks for each discovered playlist,
//      group by album/show identifier per spec §6.2, with album-promotion
//      default (Q1=C base) and episode-only opt-out, plus compilation
//      handling (Various-Artists albums grouped by track artist instead
//      of album artist).
//
// Both functions take an access token + a thin HTTP client; they don't
// touch the token store or the file system. State machine wires the
// auth refresh in around them.

import {
  parseDescriptionOverrides,
  playlistMatchesPrefix,
  resolveItemCategoryFromAlbumType,
  resolvePlaylistCategory,
} from './categorizer'
import type { CategoryType } from './category-types'
import type { DiscoveredPlaylist, SpotifySyncConfig, SyncItem } from './types'
import { type AlbumPage, artistAlbums } from '../artist-albums-store'

const API_BASE = 'https://api.spotify.com/v1'
const HTTP_TIMEOUT_MS = 10_000
// (entries of a playlist per page: 50 is the most Spotify allows since its February 2026 changes - was 100, which
// Spotify apps under the new rules refuse)
const TRACKS_PAGE_LIMIT = 50
const PLAYLISTS_PAGE_LIMIT = 50

/** What a 401 / 429 / 5xx / network failure should look like to callers. */
export type SpotifyApiError =
  | { kind: 'auth'; reason: string }
  | { kind: 'rate-limit'; reason: string; retryAfterSeconds: number }
  | { kind: 'network'; reason: string }
  | { kind: 'internal'; reason: string }

export class SpotifyApiException extends Error {
  constructor(public readonly detail: SpotifyApiError) {
    super(detail.reason)
  }
}

/** GET helper with 401/429/timeout handling. Throws SpotifyApiException. */
async function spotifyGet<T>(path: string, accessToken: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    const e = err as Error
    throw new SpotifyApiException({ kind: 'network', reason: `${path}: ${e?.message ?? String(err)}` })
  }
  if (response.status === 401) {
    throw new SpotifyApiException({ kind: 'auth', reason: `401 from ${path}` })
  }
  if (response.status === 429) {
    // (how long Spotify blocks this app: its Retry-After header, in seconds - in the reason, so the log and the app
    // say it)
    const header = response.headers.get('retry-after')
    const parsed = Number.parseInt(header ?? '', 10)
    const retryAfter = Number.isFinite(parsed) && parsed > 0 ? parsed : 60
    throw new SpotifyApiException({
      kind: 'rate-limit',
      reason: `429 from ${path} (Spotify: wait ${retryAfter} s${header ? '' : ', no Retry-After given'})`,
      retryAfterSeconds: retryAfter,
    })
  }
  if (!response.ok) {
    throw new SpotifyApiException({
      kind: 'internal',
      reason: `${response.status} ${response.statusText} from ${path}`,
    })
  }
  try {
    return (await response.json()) as T
  } catch (err) {
    throw new SpotifyApiException({
      kind: 'internal',
      reason: `JSON parse failure from ${path}: ${(err as Error).message}`,
    })
  }
}

/** Discover all sync-managed playlists for the active user. */
// failures: what could not be read in this run (an explicit playlist, a pinned album, an artist) - the diff removes
// nothing then, see computeSyncDiff
export async function discoverPlaylists(accessToken: string, config: SpotifySyncConfig, failures: string[] = []): Promise<DiscoveredPlaylist[]> {
  if (config.playlist_explicit_ids.length > 0) {
    // Mode A: explicit IDs. Skip /me/playlists scan.
    const out: DiscoveredPlaylist[] = []
    for (const id of config.playlist_explicit_ids) {
      try {
        const p = await spotifyGet<{ id: string; name: string; description?: string; items?: { total?: number }; tracks?: { total?: number } }>(
          `/playlists/${id}?fields=id,name,description,items(total)`,
          accessToken,
        )
        out.push(buildDiscoveredPlaylist(p))
      } catch (err) {
        // (a login failure, Spotify blocking the app or no network end the run - see resolveSyncItems)
        if (err instanceof SpotifyApiException && err.detail.kind !== 'internal') throw err
        // Skip individually-failing playlists; sync over what we got (adding and updating - not removing).
        failures.push(`playlist ${id}`)
        console.warn(`${new Date().toLocaleString()}: [spotify-sync] discover: explicit playlist ${id} failed: ${(err as Error).message}`)
      }
    }
    return out
  }
  // Mode B: prefix match.
  const matched: DiscoveredPlaylist[] = []
  let offset = 0
  let next = true
  const prefix = config.playlist_prefix.trim()
  if (prefix.length < 2) {
    console.warn(`${new Date().toLocaleString()}: [spotify-sync] discover: playlist_prefix too short ("${prefix}"), skipping`)
    return []
  }
  while (next) {
    const page = await spotifyGet<{
      items: Array<{ id: string; name: string; description?: string; items?: { total?: number }; tracks?: { total?: number } }>
      next: string | null
    }>(`/me/playlists?limit=${PLAYLISTS_PAGE_LIMIT}&offset=${offset}`, accessToken)
    for (const item of page.items ?? []) {
      if (playlistMatchesPrefix(item.name, prefix)) {
        matched.push(buildDiscoveredPlaylist(item))
      }
    }
    next = page.next !== null && (page.items?.length ?? 0) === PLAYLISTS_PAGE_LIMIT
    offset += PLAYLISTS_PAGE_LIMIT
    // Safety net against runaway pagination — Spotify caps at ~50 user
    // playlists per offset and ~~thousand total; 50 pages = 2500 items.
    if (offset > 50 * PLAYLISTS_PAGE_LIMIT) break
  }
  return matched
}

function buildDiscoveredPlaylist(p: {
  id: string
  name: string
  description?: string
  items?: { total?: number }
  tracks?: { total?: number }
}): DiscoveredPlaylist {
  const overrides = parseDescriptionOverrides(p.description)
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    categoryOverride: overrides.categoryOverride,
    episodeOnly: overrides.episodeOnly,
    // (`tracks` is named `items` since Spotify's February 2026 changes)
    trackCount: p.items?.total ?? p.tracks?.total ?? 0,
  }
}

/** Spotify-API track shape that we actually look at. Other fields ignored. */
interface SpotifyTrackResponse {
  id?: string | null
  uri?: string
  type?: 'track' | 'episode'
  name?: string
  artists?: Array<{ id?: string; name?: string }>
  album?: {
    id?: string
    name?: string
    album_type?: 'album' | 'single' | 'compilation' | 'audiobook' | string
    images?: Array<{ url?: string }>
    artists?: Array<{ id?: string; name?: string }>
    release_date?: string
  }
  show?: {
    id?: string
    name?: string
    publisher?: string
    images?: Array<{ url?: string }>
  }
}

/** All tracks for one playlist, paginated. */
async function fetchPlaylistTracks(playlistId: string, accessToken: string): Promise<SpotifyTrackResponse[]> {
  const out: SpotifyTrackResponse[] = []
  // Spotify's February 2026 changes: a playlist's entries come from /playlists/{id}/items (/tracks is gone for
  // Spotify apps created since, and for the others it follows), and each entry carries the track as `item` (was
  // `track`). Apps under the old rules answer both, so the new names work for every app; `track` is still read as a
  // fallback. The fields= projection keeps the response small. `null` entries occur for removed/unavailable items.
  const fields =
    'items(item(id,uri,type,name,artists(id,name),album(id,name,album_type,images,artists(id,name),release_date),show(id,name,publisher,images))),next'
  let offset = 0
  while (true) {
    const page = await spotifyGet<{
      items: Array<{ item?: SpotifyTrackResponse | null; track?: SpotifyTrackResponse | null }>
      next: string | null
    }>(`/playlists/${playlistId}/items?fields=${encodeURIComponent(fields)}&limit=${TRACKS_PAGE_LIMIT}&offset=${offset}`, accessToken)
    for (const i of page.items ?? []) {
      const track = i?.item ?? i?.track
      if (track) out.push(track)
    }
    // (Spotify's own paging decides - a page it shortened still has a next one)
    const got = page.items?.length ?? 0
    if (!page.next || got === 0) break
    offset += got
    if (offset > 5000) break
  }
  return out
}

/**
 * Batch-fetch artist cover images for a set of artist IDs. The per-track album
 * payload only carries artist id+name (not images), so SyncItems otherwise come
 * back with artistCover undefined and the box falls back to the album/episode
 * cover for the artist tile. Spotify allows up to 50 IDs per /artists call.
 * Failures are non-fatal — a missing cover just keeps the album-cover fallback.
 */
async function fetchArtistCovers(artistIds: string[], accessToken: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(artistIds)]
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50)
    try {
      const resp = await spotifyGet<{ artists: Array<{ id?: string; images?: Array<{ url?: string }> } | null> }>(
        `/artists?ids=${batch.join(',')}`,
        accessToken,
      )
      for (const a of resp.artists ?? []) {
        const url = pickImage(a?.images)
        if (a?.id && url) out.set(a.id, url)
      }
    } catch (err) {
      // a block (429), a login or network failure ends the run: applied without the pictures, the entries would lose
      // the artist pictures they have
      if (err instanceof SpotifyApiException && err.detail.kind !== 'internal') throw err
      // Spotify's February 2026 changes removed the request for several artists at once (GET /artists?ids=) for
      // Spotify apps under the new rules: one by one then
      for (const id of batch) {
        try {
          const a = await spotifyGet<{ id?: string; images?: Array<{ url?: string }> }>(`/artists/${encodeURIComponent(id)}`, accessToken)
          const url = pickImage(a?.images)
          if (a?.id && url) out.set(a.id, url)
        } catch (one) {
          if (one instanceof SpotifyApiException && one.detail.kind !== 'internal') throw one
          console.warn(`${new Date().toLocaleString()}: [spotify-sync] artist-cover fetch failed: ${(one as Error).message}`)
        }
      }
    }
  }
  return out
}

/**
 * Walk over discovered playlists, fetch tracks for each, build SyncItems
 * with album-promotion / episode-only / compilation handling. Result is
 * de-duplicated by group_key so the same album referenced from two
 * playlists ends up as one item with both playlist IDs in its references.
 *
 * Statistics for the state file (per-playlist track counts) come back
 * alongside.
 */
export async function resolveSyncItems(
  playlists: DiscoveredPlaylist[],
  accessToken: string,
  config: SpotifySyncConfig,
  failures: string[] = [],
): Promise<{ items: Map<string, SyncItem>; perPlaylistCounts: Map<string, number> }> {
  const items = new Map<string, SyncItem>()
  const perPlaylistCounts = new Map<string, number>()

  for (const playlist of playlists) {
    // One playlist that cannot be read is skipped (the run adds and updates, but removes nothing - see
    // computeSyncDiff); it used to end the whole run with INTERNAL_ERROR, and then nothing at all came in - also not
    // the artists and albums below. A login, rate-limit or network failure still ends the run.
    let tracks: SpotifyTrackResponse[]
    try {
      tracks = await fetchPlaylistTracks(playlist.id, accessToken)
    } catch (err) {
      if (err instanceof SpotifyApiException && err.detail.kind !== 'internal') throw err
      failures.push(`playlist ${playlist.name || playlist.id}`)
      console.warn(`${new Date().toLocaleString()}: [spotify-sync] playlist ${playlist.id} (${playlist.name}) not read: ${(err as Error).message}`)
      continue
    }
    perPlaylistCounts.set(playlist.id, tracks.length)
    for (const track of tracks) {
      const resolved = resolveSingleTrack(track, playlist, config)
      if (!resolved) continue
      const existing = items.get(resolved.groupKey)
      if (existing) {
        if (!existing.playlistIds.includes(playlist.id)) existing.playlistIds.push(playlist.id)
      } else {
        items.set(resolved.groupKey, resolved)
      }
    }
  }

  // Phase 17b: explicit single albums pinned via the WebApp search, independent
  // of any playlist. Fetch each album once and build an album-promotion item;
  // skip if a playlist already produced the same album (dedupe by groupKey).
  for (const pin of config.explicit_albums ?? []) {
    const albumId = pin?.id
    if (!albumId || items.has(`album:${albumId}`)) continue
    try {
      const album = await spotifyGet<{
        id?: string
        name?: string
        album_type?: string
        artists?: Array<{ id?: string; name?: string }>
        images?: Array<{ url?: string }>
        release_date?: string
      }>(`/albums/${encodeURIComponent(albumId)}`, accessToken)
      const item = buildExplicitAlbumItem(album, pin.category)
      if (item) items.set(item.groupKey, item)
    } catch (err) {
      // Spotify blocking the app (429), a login or network failure: the run ends here - asking on for the next albums
      // and artists only kept the block going (state-machine: RATE_LIMITED waits for Spotify's time)
      if (err instanceof SpotifyApiException && err.detail.kind !== 'internal') throw err
      failures.push(`album ${albumId}`)
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] explicit album ${albumId} fetch failed: ${(err as Error).message}`,
      )
    }
  }

  // Phase 17c: whole-artist subscriptions. Pull the artist's albums, sort by
  // release date (≈ chronological), apply the optional [range_from..range_to]
  // window (1-indexed, Phase 17d), and add each as an album-promotion item.
  for (const sub of config.artists ?? []) {
    if (!sub?.id) continue
    try {
      const albums = await fetchArtistAlbums(sub.id, accessToken, sub.album_types ?? 'album')
      albums.sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
      const from = Math.max(1, sub.range_from ?? 1)
      const to = sub.range_to && sub.range_to > 0 ? sub.range_to : albums.length
      const excluded = new Set(sub.exclude_album_ids ?? [])
      for (const album of albums.slice(from - 1, to)) {
        if (!album?.id || items.has(`album:${album.id}`) || excluded.has(album.id)) continue
        const item = buildExplicitAlbumItem(album, sub.category)
        if (!item) continue
        // The album belongs to the subscribed artist, also where Spotify names someone else first (a choir, a speaker,
        // a publisher before him): it was filed under that other artist and missing from the subscribed one.
        const own = album.artists?.find((a) => a?.id === sub.id)
        item.artist = own?.name || sub.name || item.artist
        item.artistId = sub.id
        items.set(item.groupKey, item)
      }
    } catch (err) {
      // (as for the albums above: a block, a login or network failure ends the run)
      if (err instanceof SpotifyApiException && err.detail.kind !== 'internal') throw err
      failures.push(`artist ${sub.name || sub.id}`)
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] artist subscription ${sub.id} failed: ${(err as Error).message}`,
      )
    }
  }

  // Fill in artist cover images. The track payload only carries artist
  // id+name, so artistCover was always undefined and the box used the album
  // (episode) cover for the artist tile. Batch-fetch the real artist images.
  const artistIds = [...items.values()]
    .map((it) => it.artistId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (artistIds.length > 0) {
    const covers = await fetchArtistCovers(artistIds, accessToken)
    for (const it of items.values()) {
      if (it.artistId && !it.artistCover) {
        const c = covers.get(it.artistId)
        if (c) it.artistCover = c
      }
    }
  }

  return { items, perPlaylistCounts }
}

/**
 * Per-track resolution to a SyncItem. Returns undefined when the track
 * is unusable (no IDs, episode without show, etc.) — caller skips silently.
 *
 * Group-key strategy:
 *   - track.type === 'episode' OR album.album_type === 'audiobook':
 *       audiobook-mode. Group by show.id (when episode) or album.id
 *       (when audiobook). With episode-only override on the playlist,
 *       the per-episode track.id wins.
 *   - album.album_type === 'compilation' AND first album artist is
 *       'Various Artists': compilation-mode. Group key = `${trackArtistId}:${albumId}`.
 *       Forces each contributing artist to a separate library entry.
 *   - default: album-promotion. Group by album.id, regardless of which
 *       tracks of the album are in the playlist.
 */
function resolveSingleTrack(
  track: SpotifyTrackResponse,
  playlist: DiscoveredPlaylist,
  config: SpotifySyncConfig,
): SyncItem | undefined {
  const trackId = track.id ?? undefined
  const isEpisode = track.type === 'episode'
  const albumType = track.album?.album_type
  const isAudiobook = albumType === 'audiobook'
  const isCompilation = albumType === 'compilation' && /^various artists$/i.test(track.album?.artists?.[0]?.name ?? '')

  // Resolve category — playlist-description override wins over playlist-name
  // suffix wins over album-type heuristic wins over default.
  const categoryFromPlaylist = playlist.categoryOverride
    ? playlist.categoryOverride
    : resolvePlaylistCategory(playlist.name, config.playlist_prefix, config.category_mapping)
  const categoryFromAlbum = resolveItemCategoryFromAlbumType(albumType, track.type)
  const category: CategoryType = playlist.categoryOverride
    ? playlist.categoryOverride
    : (categoryFromAlbum ?? categoryFromPlaylist)

  // Episode-only mode: each track in the playlist becomes its own
  // library entry, keyed by track.id, with type 'audiobook' category.
  if (playlist.episodeOnly) {
    if (!trackId) return undefined
    return {
      groupKey: `episode:${trackId}`,
      mode: 'episode-only',
      identifierField: 'id',
      type: 'spotify',
      category: 'audiobook',
      title: track.name ?? track.show?.name ?? '',
      artist: track.show?.name ?? track.artists?.[0]?.name ?? '',
      artistId: undefined,
      cover: pickImage(track.show?.images ?? track.album?.images),
      artistCover: undefined,
      playlistIds: [playlist.id],
    }
  }

  if (isEpisode && track.show?.id) {
    // Whole-show grouping (Q1=C default).
    return {
      groupKey: `show:${track.show.id}`,
      mode: 'album',
      identifierField: 'showid',
      type: 'spotify',
      category: 'audiobook',
      title: track.show.name ?? '',
      artist: track.show.publisher ?? '',
      artistId: undefined,
      cover: pickImage(track.show.images),
      artistCover: undefined,
      playlistIds: [playlist.id],
    }
  }

  if (isAudiobook && track.album?.id) {
    return {
      groupKey: `audiobook:${track.album.id}`,
      mode: 'album',
      identifierField: 'audiobookid',
      type: 'spotify',
      category: 'audiobook',
      title: track.album.name ?? '',
      artist: track.album.artists?.[0]?.name ?? '',
      artistId: track.album.artists?.[0]?.id,
      cover: pickImage(track.album.images),
      releaseDate: track.album.release_date,
      artistCover: undefined,
      playlistIds: [playlist.id],
    }
  }

  if (isCompilation && track.album?.id) {
    const trackArtist = track.artists?.[0]
    if (!trackArtist?.id) return undefined
    return {
      groupKey: `compilation:${trackArtist.id}:${track.album.id}`,
      mode: 'album',
      identifierField: 'id',
      type: 'spotify',
      category,
      title: track.album.name ?? '',
      artist: trackArtist.name ?? '',
      artistId: trackArtist.id,
      cover: pickImage(track.album.images),
      releaseDate: track.album.release_date,
      artistCover: undefined,
      playlistIds: [playlist.id],
    }
  }

  // Default: album promotion — entire album becomes one library entry.
  if (track.album?.id) {
    return {
      groupKey: `album:${track.album.id}`,
      mode: 'album',
      identifierField: 'id',
      type: 'spotify',
      category,
      title: track.album.name ?? '',
      artist: track.album.artists?.[0]?.name ?? track.artists?.[0]?.name ?? '',
      artistId: track.album.artists?.[0]?.id ?? track.artists?.[0]?.id,
      cover: pickImage(track.album.images),
      releaseDate: track.album.release_date,
      artistCover: undefined,
      playlistIds: [playlist.id],
    }
  }

  return undefined
}

/** Minimal album shape used by explicit-album + artist-subscription resolution. */
export type SimpleAlbum = {
  id?: string
  name?: string
  artists?: Array<{ id?: string; name?: string }>
  images?: Array<{ url?: string }>
  release_date?: string
}

/** Fetch all of an artist's albums (paginated, deduped by id, capped at ~300).
 *  Phase 17c. include_groups defaults to 'album'. */
export async function fetchArtistAlbums(
  artistId: string,
  accessToken: string,
  albumTypes = 'album',
): Promise<SimpleAlbum[]> {
  // Kept on the SD card and afterwards checked with one page (artist-albums-store.ts): the sync every 15 minutes and the
  // app's album list asked Spotify for all ~30 pages of a big artist each time - that ran Spotify apps into blocks.
  const fetchPage = async (offset: number): Promise<AlbumPage> => {
    const limit = artistAlbumsPageLimit
    try {
      const page = await spotifyGet<AlbumPage & { limit?: number }>(
        `/artists/${encodeURIComponent(artistId)}/albums?include_groups=${encodeURIComponent(albumTypes)}&market=DE&limit=${limit}&offset=${offset}`,
        accessToken,
      )
      if (typeof page.limit === 'number' && page.limit > 0 && page.limit < limit) artistAlbumsPageLimit = page.limit
      return page
    } catch (err) {
      // Spotify apps under the February 2026 rules get at most 10 albums per page (older apps 50): refused with
      // 400, the page is asked again with 10 - and every page after it (the app does not change while the box runs)
      if (limit > 10 && err instanceof SpotifyApiException && err.detail.kind === 'internal' && err.detail.reason.startsWith('400')) {
        artistAlbumsPageLimit = 10
        console.warn(`${new Date().toLocaleString()}: [spotify-sync] artist albums: Spotify allows 10 per page for this app (was asked ${limit})`)
        return fetchPage(offset)
      }
      throw err
    }
  }
  // (a copy: the callers sort it)
  return [...(await artistAlbums(artistId, albumTypes, fetchPage))] as SimpleAlbum[]
}
// (see fetchArtistAlbums: albums per page Spotify allows this app)
let artistAlbumsPageLimit = 50

/** Build an album-promotion SyncItem from a fetched Spotify album object
 *  (Phase 17b explicit-album pins). Category is the parent's pick from the
 *  WebApp, falling back to 'music' when none was stored. artistCover is filled
 *  by the fetchArtistCovers step like for playlist items. */
function buildExplicitAlbumItem(
  album: { id?: string; name?: string; artists?: Array<{ id?: string; name?: string }>; images?: Array<{ url?: string }>; release_date?: string },
  pinCategory: CategoryType | undefined,
): SyncItem | undefined {
  if (!album?.id) return undefined
  return {
    groupKey: `album:${album.id}`,
    mode: 'album',
    identifierField: 'id',
    type: 'spotify',
    category: pinCategory ?? 'music',
    title: album.name ?? '',
    artist: album.artists?.[0]?.name ?? '',
    artistId: album.artists?.[0]?.id,
    cover: pickImage(album.images),
    releaseDate: album.release_date,
    artistCover: undefined,
    playlistIds: [],
  }
}

/** Pick a cover image URL — Spotify orders images by size desc; we want
 *  the second-largest (640×640 typical) for a balance of quality and
 *  bandwidth. Falls back to the first available. */
function pickImage(images: Array<{ url?: string }> | undefined): string | undefined {
  if (!images || images.length === 0) return undefined
  // Spotify-API contract: images sorted largest-first. images[1] is the
  // medium size; if there's only one, use it.
  return images[1]?.url ?? images[0]?.url
}
