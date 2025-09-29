// Spotify API service models (Official Web API)

// Request/Response interfaces for Spotify API service
export interface SpotifySearchRequest {
  query: string
  category: 'album' | 'artist' | 'show' | 'audiobook' | 'playlist'
  limit?: number
  offset?: number
}

export interface SpotifyApiAlbumSearchResult {
  id: string
  name: string
  artists: Array<{ name: string }>
  images: Array<{ url: string; width?: number; height?: number }>
  release_date: string
}

export interface SpotifyApiArtistAlbumsResult {
  id: string
  name: string
  artists: Array<{ name: string }>
  images: Array<{ url: string; width?: number; height?: number }>
  release_date: string
}

export interface SpotifyApiShowEpisodesResult {
  id: string
  name: string
  images: Array<{ url: string; width?: number; height?: number }>
  release_date?: string
}

export interface SpotifyApiAlbumDetails {
  id: string
  name: string
  artists: Array<{ name: string }>
  images: Array<{ url: string; width?: number; height?: number }>
  release_date: string
  tracks: {
    items: Array<{
      id: string
      uri: string
      name: string
      track_number: number
    }>
  }
  total_tracks: number
}

export interface SpotifyApiPlaylistDetails {
  id: string
  name: string
  images: Array<{ url: string; width?: number; height?: number }>
  tracks: {
    total: number
    items: Array<{
      track: {
        id: string
        uri: string
        name: string
      }
    }>
  }
}

export interface SpotifyApiShowDetails {
  id: string
  name: string
  images: Array<{ url: string; width?: number; height?: number }>
  episodes: { total: number }
  total_episodes: number
}

export interface SpotifyApiAudiobookDetails {
  id: string
  name: string
  images: Array<{ url: string; width?: number; height?: number }>
  authors: Array<{ name: string }>
  chapters?: {
    total: number
    items: Array<{
      id: string
      uri: string
      name: string
    }>
  }
}

export interface SpotifyApiEpisodeDetails {
  id: string
  name: string
  show: Array<{ name: string }>
  images: Array<{ url: string; width?: number; height?: number }>
  release_date?: string
}

export interface SpotifyApiArtistDetails {
  id: string
  name: string
  images: Array<{ url: string; width?: number; height?: number }>
}

export interface SpotifyValidationRequest {
  id: string
  type: 'album' | 'show' | 'audiobook' | 'artist' | 'playlist'
}

export interface SpotifyValidationResponse {
  valid: boolean
  id: string
  type: string
}

// Frontend-compatible media format (matches existing Media interface)
export interface SpotifyMediaResponse {
  id?: string
  audiobookid?: string
  showid?: string
  playlistid?: string
  artist: string
  title: string
  cover: string
  artistcover?: string
  release_date?: string
  type: 'spotify'
  category: string
  index: number
  shuffle?: boolean
  resumespotifyduration_ms?: number
  resumespotifyprogress_ms?: number
  resumespotifytrack_number?: number
}

// Cached data structure for API responses
export interface CachedSpotifyData {
  data: any
  timestamp: number
  expiresAt: number
}
