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

export interface SpotifyPlaylistMetadata {
  name: string
  description: string
  uri: string
  external_urls: {
    spotify: string
  }
  images: SpotifyPlaylistImage[]
  owner: SpotifyPlaylistOwner
  public: boolean
  followers?: {
    total: number
  }
  tracks: {
    total: number
  }
}

export interface SpotifyPlaylistData {
  playlist: SpotifyPlaylistMetadata
  tracks: SpotifyTrack[]
}

export interface PathfinderResponse {
  data: {
    playlistV2: {
      name: string
      description: string
      uri: string
      images: {
        items: Array<{
          sources: Array<{
            url: string
            width: number
            height: number
          }>
        }>
      }
      owner: {
        data: {
          name: string
          uri: string
        }
      }
      content: {
        totalCount: number
        items: Array<{
          itemV2: {
            data: {
              name: string
              uri: string
              duration: {
                totalMilliseconds: number
              }
              artists: {
                items: Array<{
                  uri: string
                  profile: {
                    name: string
                  }
                }>
              }
              albumOfTrack: {
                uri: string
                name: string
                coverArt: {
                  sources: Array<{
                    url: string
                    width: number
                    height: number
                  }>
                }
              }
              playability: {
                playable: boolean
              }
            }
          }
        }>
      }
    }
  }
}
