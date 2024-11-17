export type CategoryType = 'audiobook' | 'music' | 'other'
export type SourceType = 'spotifyQuery' | 'spotifyUrl' | 'rss' | 'local' | 'radio'
export type SpotifyUrlType = 'artist' | 'playlist' | 'album' | 'show'

export enum AlbumSorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

export interface AlbumRange {
  start?: number
  end?: number
}

export interface BaseAlbumGroup {
  name: string
  img?: string
  category: CategoryType
  sourceType: SourceType
}

export interface SpotifyQueryAlbumGroup extends BaseAlbumGroup {
  sourceType: 'spotifyQuery'
  query: string
  range?: AlbumRange
  sorting: AlbumSorting
}

export interface SpotifyUrlAlbumGroup extends BaseAlbumGroup {
  sourceType: 'spotifyUrl'
  url: string
  urlType: SpotifyUrlType
  range?: AlbumRange
  shuffle: boolean
  sorting: AlbumSorting
}

export interface RssAlbumGroup extends BaseAlbumGroup {
  sourceType: 'rss'
  url: string
  range?: AlbumRange
  sorting: AlbumSorting
}

export interface RadioAlbumGroup extends BaseAlbumGroup {
  sourceType: 'radio'
  url: string
}

export interface LocalAlbumGroup extends BaseAlbumGroup {
  sourceType: 'local'
  shuffle: boolean
  sorting: AlbumSorting
}

export type AlbumGroup =
  | SpotifyQueryAlbumGroup
  | SpotifyUrlAlbumGroup
  | RssAlbumGroup
  | RadioAlbumGroup
  | LocalAlbumGroup
