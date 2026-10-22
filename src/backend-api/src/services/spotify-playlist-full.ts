import type { SpotifyTrack } from '../models/spotify-shared.model'
import { spotifyGet } from '../spotify-sync/playlists'

// (entries per page: 50 is the most Spotify allows since its February 2026 changes - see spotify-sync/playlists.ts)
const PAGE_LIMIT = 50
// (20 pages at most: a longer list is not a child's playlist, and each page is a request against the box's limits)
const MAX_TRACKS = 1000

interface PlaylistItemsPage {
  items?: Array<{ item?: ItemResponse | null; track?: ItemResponse | null }>
  next?: string | null
}

interface ItemResponse {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: Array<{ name?: string }>
}

/** A playlist's tracks at Spotify's snapshot (its version). */
export interface FullPlaylist {
  snapshot: string
  tracks: SpotifyTrack[]
}

// One playlist after the other: the display asks for several at once (spotify-media-info.service.ts reads 3 in the
// background), and their pages back to back are what Spotify answers with a block
let queue: Promise<unknown> = Promise.resolve()

/**
 * Every track of a playlist, page by page (Spotify's Web API, the user's access token). The embed page the playlist
 * is read from (spotify-media-info.service.ts) is cut at 100 tracks: a playlist of 340 showed 100.
 * `null` entries (removed / unavailable items) are left out, as in the embed list.
 * `kept`: the list as read before - Spotify still naming its snapshot, it is taken as it is (one request instead of
 * all pages).
 */
export function fetchFullPlaylistTracks(playlistId: string, accessToken: string, kept?: FullPlaylist): Promise<FullPlaylist> {
  const run = queue.then(() => readPlaylist(playlistId, accessToken, kept))
  queue = run.catch(() => undefined)
  return run
}

async function readPlaylist(playlistId: string, accessToken: string, kept?: FullPlaylist): Promise<FullPlaylist> {
  const id = encodeURIComponent(playlistId)
  const head = await spotifyGet<{ snapshot_id?: string }>(`/playlists/${id}?fields=snapshot_id`, accessToken, 'display')
  const snapshot = head.snapshot_id ?? ''
  if (kept && snapshot && kept.snapshot === snapshot) return kept

  const out: SpotifyTrack[] = []
  const fields = encodeURIComponent('items(item(uri,name,duration_ms,artists(name))),next')
  let offset = 0
  while (offset < MAX_TRACKS) {
    const page = await spotifyGet<PlaylistItemsPage>(
      `/playlists/${id}/items?fields=${fields}&limit=${PAGE_LIMIT}&offset=${offset}`,
      accessToken,
      'display',
    )
    for (const entry of page.items ?? []) {
      const item = entry?.item ?? entry?.track
      if (!item) continue
      out.push({
        name: item.name || 'Unknown Track',
        uri: item.uri || '',
        duration_ms: item.duration_ms || 0,
        artists: (item.artists ?? []).map((a) => ({ name: a.name ?? '', uri: '' })),
        album: { name: '', uri: '', images: [] },
      })
    }
    // (Spotify's own paging decides - a page it shortened still has a next one)
    const got = page.items?.length ?? 0
    if (!page.next || got === 0) break
    offset += got
  }
  return { snapshot, tracks: out }
}
