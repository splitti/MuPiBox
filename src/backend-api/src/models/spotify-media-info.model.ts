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
  /** when the rest of a playlist of 100 tracks or more was last asked for (ms) */
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
