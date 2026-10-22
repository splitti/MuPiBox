// Spotify Media Info service models

import type { SpotifyPlaylistImage, SpotifyTrack } from './spotify-shared.model'

export interface SpotifyPlaylistMetadata {
  name: string
  images: SpotifyPlaylistImage[]
  tracks: {
    total: number
  }
}

export interface SpotifyPlaylistData {
  playlist: SpotifyPlaylistMetadata
  tracks: SpotifyTrack[]
  /** the list is complete (the embed page gives 100 tracks at most; the rest came from the Web API) */
  fullList?: boolean
  /** Spotify's snapshot (version) of the playlist the full list was read at: the same one again, it is kept */
  fullListSnapshot?: string
  /** when loading the rest failed for a reason that may pass (a block, the network) - asked again after an hour (ms) */
  fullListAttemptAt?: number
}

export interface SpotifyAlbumMetadata {
  name: string
  images: SpotifyPlaylistImage[]
  total_tracks: number
}

export interface SpotifyAlbumData {
  album: SpotifyAlbumMetadata
  tracks: SpotifyTrack[]
}
