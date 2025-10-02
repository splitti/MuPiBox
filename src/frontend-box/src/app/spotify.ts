export interface SpotifyAlbumsResponseImage {
  height: number
  url: string
}

export interface SpotifyAlbumsResponseArtist {
  name: string
}

export interface SpotifyAlbumsResponseItem {
  images: SpotifyAlbumsResponseImage[]
  name: string
  id: string
  artists: SpotifyAlbumsResponseArtist[]
  release_date: string
}

export interface SpotifyAlbumsResponse {
  albums: {
    total: number
    items: SpotifyAlbumsResponseItem[]
  }
}

export interface SpotifyArtistsAlbumsResponse {
  total?: number
  items?: SpotifyAlbumsResponseItem[]
}

export interface SpotifyShowResponse {
  name?: string
  episodes?: {
    total?: number
    items?: SpotifyShowResponseItem[]
  }
  images: SpotifyAlbumsResponseImage[]
}

export interface SpotifyShowResponseItem {
  images: SpotifyAlbumsResponseImage[]
  name: string
  id: string
  release_date: string
}

export interface SpotifyEpisodesResponse {
  total?: number
  items?: SpotifyEpisodesResponseItem[]
}

export interface SpotifyEpisodesResponseItem {
  images?: SpotifyAlbumsResponseImage[]
  name?: string
  id?: string
  release_date?: string
}

export interface SpotifyArtistResponse {
  name?: string
  images: SpotifyAlbumsResponseImage[]
}

export interface SpotifyEpisodeResponseItem {
  images: SpotifyAlbumsResponseImage[]
  name: string
  id: string
  show: SpotifyAlbumsResponseArtist[]
  release_date?: string
}

export interface SpotifyAudiobooksResponseItem {
  images: SpotifyAlbumsResponseImage[]
  name: string
  id: string
  authors: SpotifyAlbumsResponseArtist[]
  release_date: string
}

export interface SpotifyConfig {
  clientId: string
  clientSecret: string
  deviceName: string
}

// Spotify Web Playback SDK interfaces
export interface SpotifyWebPlaybackArtist {
  name: string
  uri: string
}

export interface SpotifyWebPlaybackAlbum {
  name: string
  uri: string
  images: Array<{
    url: string
    height: number | null
    width: number | null
  }>
}

export interface SpotifyWebPlaybackTrack {
  id: string | null
  uri: string
  name: string
  artists: SpotifyWebPlaybackArtist[]
  album: SpotifyWebPlaybackAlbum
  is_playable: boolean
  media_type: string
  type: string
  duration_ms: number
}

export interface SpotifyWebPlaybackState {
  context: {
    uri: string | null
    metadata: any
  }
  disallows: {
    pausing?: boolean
    peeking_next?: boolean
    peeking_prev?: boolean
    resuming?: boolean
    seeking?: boolean
    skipping_next?: boolean
    skipping_prev?: boolean
  }
  paused: boolean
  position: number
  repeat_mode: number
  shuffle: boolean
  track_window: {
    current_track: SpotifyWebPlaybackTrack
    previous_tracks: SpotifyWebPlaybackTrack[]
    next_tracks: SpotifyWebPlaybackTrack[]
  }
  loading: boolean
  playback_id: string
  playback_quality: string
  playback_features: {
    hifi_status: string
  }
  timestamp: number
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  getCurrentState(): Promise<SpotifyWebPlaybackState | null>
  setName(name: string): Promise<void>
  getVolume(): Promise<number>
  setVolume(volume: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  previousTrack(): Promise<void>
  nextTrack(): Promise<void>
  activateElement(): Promise<void>
  addListener(event: string, callback: (data: any) => void): void
  removeListener(event: string, callback?: (data: any) => void): void
}

export interface Spotify {
  Player: new (config: SpotifyPlayerConfig) => SpotifyPlayer
}

export interface SpotifyPlayerConfig {
  name: string
  getOAuthToken: (callback: (token: string) => void) => void
  volume?: number
}

declare global {
  interface Window {
    Spotify: Spotify
    onSpotifyWebPlaybackSDKReady: () => void
  }
}
