import { CategoryType } from './folder.model'

export type MediaType = 'rss' | 'local' | 'radio' | 'spotifyPlaylist' | 'spotifyEpisode' | 'spotifyAlbum'

export interface BaseMedia {
  type: MediaType
  name: string
  category: CategoryType
  folderName: string
  img: string
  allowShuffle: boolean
  shuffle: boolean
}

export interface LocalMedia extends BaseMedia {
  type: 'local'
  allowShuffle: false
  shuffle: false
}

export interface RssMedia extends BaseMedia {
  type: 'rss'
  url: string
  releaseDate: string
  allowShuffle: false
  shuffle: false
}

export interface RadioMedia extends BaseMedia {
  type: 'radio'
  url: string
  allowShuffle: false
  shuffle: false
}

export interface SpotifyPlaylistMedia extends BaseMedia {
  type: 'spotifyPlaylist'
  id: string
  allowShuffle: boolean
  shuffle: boolean
  // TODO: releaseDate
}

export interface SpotifyEpisodeMedia extends BaseMedia {
  type: 'spotifyEpisode'
  id: string
  releaseDate: string
  allowShuffle: boolean
  shuffle: boolean
}

export interface SpotifyAlbumMedia extends BaseMedia {
  type: 'spotifyAlbum'
  id: string
  // TODO: releaseDate
  allowShuffle: boolean
  shuffle: boolean
}

export type SpotifyMedia = SpotifyEpisodeMedia | SpotifyPlaylistMedia | SpotifyAlbumMedia

export type Media = RssMedia | RadioMedia | LocalMedia | SpotifyMedia
