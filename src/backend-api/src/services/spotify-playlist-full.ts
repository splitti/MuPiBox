import type { SpotifyTrack } from '../models/spotify-shared.model'
import { spotifyGet } from '../spotify-sync/playlists'

// (entries per page: 50 is the most Spotify allows since its February 2026 changes - see spotify-sync/playlists.ts)
const PAGE_LIMIT = 50
const MAX_TRACKS = 5000

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

/**
 * Every track of a playlist, page by page (Spotify's Web API, the user's access token). The embed page the playlist
 * is read from (spotify-media-info.service.ts) is cut at 100 tracks: a playlist of 340 showed 100.
 * `null` entries (removed / unavailable items) are left out, as in the embed list.
 */
export async function fetchFullPlaylistTracks(playlistId: string, accessToken: string): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = []
  const fields = encodeURIComponent('items(item(uri,name,duration_ms,artists(name))),next')
  let offset = 0
  while (true) {
    const page = await spotifyGet<PlaylistItemsPage>(
      `/playlists/${encodeURIComponent(playlistId)}/items?fields=${fields}&limit=${PAGE_LIMIT}&offset=${offset}`,
      accessToken,
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
    if (offset > MAX_TRACKS) break
  }
  return out
}
