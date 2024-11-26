import { CategoryType, Sorting } from './folder.model'

export type SourceType = 'spotify' | 'library' | 'rss' | 'radio'

/**
 * TODO
 */
export interface HasMultipleMedia {
  aPartOfAll?: boolean
  aPartOfAllMin?: number
  aPartOfAllMax?: number
  sorting?: Sorting
}

export interface BaseData {
  index?: number
  type: SourceType
  // ============ The following three are values of the folder ================
  category: CategoryType
  // `artist` is the folder name.
  // If it is not set, the folder name is tried to be taken from the source
  // (e.g., Spotify show name).
  artist?: string
  // This is the optional folder image url.
  artistcover?: string

  // TODO: cover etc.
  title?: string
}

export interface LocalData extends BaseData {
  type: 'library'
  artist: string // This is always set for local data since it is the file folder name.
  title: string // see above
}

export interface RssData extends BaseData, HasMultipleMedia {
  type: 'rss'
  artist: string // Creating RssData requires the folder name!
  id: string // This is the url to the rss feed.
  duration?: string
}

export interface RadioData extends BaseData {
  type: 'radio'
  artist: string // Creating RadioData requires the folder name!
  id: string // The stream url.
  title: string // The name of the radio stream.
  cover?: string
}

export interface SpotifyBaseData extends BaseData, HasMultipleMedia {
  type: 'spotify'
  spotify_url: string
  shuffle?: boolean
}

// TODO: Check again if this can be merged with SPotifyBaseData. Does not seem to exist for spotify search query!
export interface SpotifyQueryData extends BaseData {
  type: 'spotify'
  artist: string // Creating SpotifyQueryData requires the folder name!
  query: string
}

export interface SpotifyArtistData extends SpotifyBaseData {
  artistid: string
}

export interface SpotifyAlbumData extends SpotifyBaseData {
  id: string
}

export interface SpotifyShowData extends SpotifyBaseData {
  showid: string
}

export interface SpotifyPlaylistData extends SpotifyBaseData {
  playlistid: string
}

export type SpotifyData =
  | SpotifyQueryData
  | SpotifyAlbumData
  | SpotifyArtistData
  | SpotifyPlaylistData
  | SpotifyShowData

export type Data = LocalData | RadioData | RssData | SpotifyData
