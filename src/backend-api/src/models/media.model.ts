import { CategoryType } from './folder.model'

export type MediaType = 'rss' | 'local' | 'radio' | 'spotifyPlaylist' | 'spotifyEpisode'

export interface BaseMedia {
  type: MediaType
  name: string
  img: string
}

export interface LocalMedia extends BaseMedia {
  type: 'local'
  category: CategoryType
  folderName: string
}

export interface RssMedia extends BaseMedia {
  type: 'rss'
  url: string
  folderName: string
}

export interface RadioMedia extends BaseMedia {
  type: 'radio'
  url: string
  folderName: string
}

export interface SpotifyPlaylistMedia extends BaseMedia {
  type: 'spotifyPlaylist'
  id: string
}

export interface SpotifyEpisodeMedia extends BaseMedia {
  type: 'spotifyEpisode'
  id: string
}
