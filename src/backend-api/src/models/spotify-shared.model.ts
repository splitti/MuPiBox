// Shared Spotify interfaces used by both services

export interface SpotifyArtist {
  name: string
  uri: string
  external_urls?: {
    spotify: string
  }
}

export interface SpotifyAlbum {
  name: string
  uri: string
  images?: Array<{
    url: string
    width: number
    height: number
  }>
  external_urls?: {
    spotify: string
  }
}

export interface SpotifyTrack {
  name: string
  uri: string
  duration_ms: number
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  external_urls?: {
    spotify: string
  }
  preview_url?: string
  explicit?: boolean
  popularity?: number
}

export interface SpotifyPlaylistOwner {
  display_name: string
  external_urls?: {
    spotify: string
  }
  uri: string
}

export interface SpotifyPlaylistImage {
  url: string
  width: number
  height: number
}
