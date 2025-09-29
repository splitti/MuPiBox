// Spotify Media Info service models (Puppeteer scraping)

import type { SpotifyArtist, SpotifyPlaylistImage, SpotifyPlaylistOwner, SpotifyTrack } from './spotify-shared.model'

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

export interface SpotifyAlbumMetadata {
  name: string
  uri: string
  external_urls: {
    spotify: string
  }
  images: SpotifyPlaylistImage[] // Reuse the same image interface
  artists: SpotifyArtist[]
  release_date?: string
  total_tracks: number
}

export interface SpotifyAlbumData {
  album: SpotifyAlbumMetadata
  tracks: SpotifyTrack[]
}

// Puppeteer-scraped data structures from Spotify's internal APIs
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

export interface AlbumPathfinderResponse {
  data: {
    albumUnion: {
      __typename: string
      name: string
      uri: string
      artists: {
        items: Array<{
          id: string
          uri: string
          profile: {
            name: string
          }
          visuals?: {
            avatarImage?: {
              sources: Array<{
                url: string
                width: number
                height: number
              }>
            }
          }
        }>
        totalCount: number
      }
      coverArt: {
        sources: Array<{
          url: string
          width: number
          height: number
        }>
        extractedColors?: any
      }
      date: {
        isoString: string
        precision: string
      }
      tracksV2: {
        items: Array<{
          track: {
            name: string
            uri: string
            trackNumber: number
            discNumber: number
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
            playability: {
              playable: boolean
            }
          }
          uid: string
        }>
        totalCount: number
      }
      type: string
      label?: string
      copyright?: {
        items: Array<{
          text: string
          type: string
        }>
      }
    }
  }
}
