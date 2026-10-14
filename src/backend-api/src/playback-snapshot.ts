/**
 * What plays on the box right now, from the player's HTTP API (port 5005): the app's "Jetzt läuft" (GET /api/app/playback)
 * and the Home Assistant API (ha/ha-api.ts) read the same.
 *
 * The player's /local fields (playing, currentTrackname, album) are mplayer-side and stay empty during Spotify playback:
 * for Spotify the truth is /state (is_playing, item.*) - the getMyCurrentPlaybackState response of the Spotify API.
 */

export interface PlaybackCovers {
  /** a NAS or local album: the cover the box shows for it */
  playingAlbumCover?: (type: string, folder: string) => Promise<string | null>
  /** a track's own picture (a playlist of different stories) */
  playingTrackCover?: (file: string) => Promise<string | null>
}

export interface PlaybackSnapshot {
  playing: boolean
  /** 'mplayer' (library, NAS, radio, podcasts), 'spotify', or '' (nothing) */
  player: string
  /** what kind of thing plays: local, nas, rss, radio, spotify ... ('' when nothing) */
  source: string
  title: string
  artist: string
  album: string
  /** a path of the box (/cover/..., /api/...) or an https address of Spotify */
  coverUrl: string | null
  progressMs: number | null
  durationMs: number | null
  volume: number | null
}

const PLAYER = 'http://127.0.0.1:5005'

/** The snapshot; throws when the player does not answer */
export async function playbackSnapshot(covers: PlaybackCovers = {}): Promise<PlaybackSnapshot> {
  const localRes = await fetch(`${PLAYER}/local`, { signal: AbortSignal.timeout(3000) })
  if (!localRes.ok) throw new Error(`player answered ${localRes.status}`)
  const local = (await localRes.json()) as Record<string, unknown>
  const player = String(local.currentPlayer ?? '')

  let playing = false
  let title = ''
  let artist = ''
  let album = ''
  let coverUrl: string | null = null
  let progressMs: number | null = null
  let durationMs: number | null = null
  if (player === 'mplayer') {
    playing = local.playing === true
    title = String(local.currentTrackname ?? '')
    album = String(local.album ?? '')
    // (the file's position and length in seconds, as the display shows them under the progress bar)
    if (typeof local.positionSeconds === 'number' && Number.isFinite(local.positionSeconds)) progressMs = Math.round(local.positionSeconds * 1000)
    if (typeof local.durationSeconds === 'number' && local.durationSeconds > 0) durationMs = Math.round(local.durationSeconds * 1000)
    // A NAS or local album: path is its folder (NAS path, or <category>/<artist>/<album> in the library);
    // the artist is the folder above, the cover the one the box shows for it.
    const source = String(local.currentType ?? '')
    const folder = String(local.path ?? '')
    // a radio station or podcast: the picture it was started with (the app passes it on, spotify-control.js ?cover=)
    if ((source === 'rss' || source === 'radio') && typeof local.cover === 'string' && local.cover) coverUrl = local.cover
    if ((source === 'nas' || source === 'local') && folder) {
      const parts = folder.split('/').filter(Boolean)
      // (<category>/<artist>/<album>: the artist is the folder above the album; an album with its files right in
      // <category>/<album> has none - the category's name is not its artist)
      artist = source === 'local' ? (parts.length >= 3 ? parts[parts.length - 2] : '') : (parts[parts.length - 2] ?? '')
      // the track's own picture (a playlist of different stories) before the album's
      const trackFile = typeof local.trackFile === 'string' ? local.trackFile : ''
      coverUrl = (trackFile ? await covers.playingTrackCover?.(trackFile) : null) ?? (await covers.playingAlbumCover?.(source, folder)) ?? null
    }
  } else if (player === 'spotify') {
    try {
      const stateRes = await fetch(`${PLAYER}/state`, { signal: AbortSignal.timeout(3000) })
      if (stateRes.ok) {
        const state = (await stateRes.json()) as {
          is_playing?: boolean
          progress_ms?: number
          item?: {
            name?: string
            duration_ms?: number
            artists?: Array<{ name?: string }>
            album?: { name?: string; images?: Array<{ url?: string }> }
            show?: { name?: string; publisher?: string; images?: Array<{ url?: string }> }
            images?: Array<{ url?: string }>
          }
        }
        playing = state.is_playing === true
        if (typeof state.progress_ms === 'number') progressMs = state.progress_ms
        if (typeof state.item?.duration_ms === 'number') durationMs = state.item.duration_ms
        if (state.item?.name) title = String(state.item.name)
        if (state.item?.album?.name) album = String(state.item.album.name)
        if (state.item?.show?.name) {
          artist = String(state.item.show.name)
          if (!album && state.item.show.publisher) album = String(state.item.show.publisher)
        } else if (Array.isArray(state.item?.artists) && state.item.artists[0]?.name) {
          artist = String(state.item.artists[0].name)
        }
        // Cover art priority: episode-own > show > album. Spotify orders images largest-first, so [0] is the
        // highest-res available.
        const candidates = [state.item?.images?.[0]?.url, state.item?.show?.images?.[0]?.url, state.item?.album?.images?.[0]?.url].filter(
          (u): u is string => typeof u === 'string' && u.length > 0,
        )
        if (candidates.length > 0) coverUrl = candidates[0]
      }
    } catch {
      /* state fetch failed → stays not-playing */
    }
  }
  return {
    playing,
    player,
    source: String(local.currentType ?? ''),
    title,
    artist,
    album,
    coverUrl,
    progressMs,
    durationMs,
    volume: typeof local.volume === 'number' ? local.volume : null,
  }
}
