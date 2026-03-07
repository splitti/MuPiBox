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
