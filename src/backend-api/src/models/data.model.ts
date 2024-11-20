import { CategoryType } from './folder.model'

export type SourceType = 'spotify' | 'library' | 'rss' | 'radio'

export interface BaseData {
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
}

export interface LocalData extends BaseData {
  type: 'library'
  artist: string // This is always set for local data since it is the file folder name.
  title: string // see above
}

export interface RssData extends BaseData {
  type: 'rss'
  artist: string // Creating RssData requires the folder name!
  id: string // This is the url to the rss feed.
}

export interface RadioData extends BaseData {
  type: 'radio'
  artist: string // Creating RadioData requires the folder name!
  id: string // The stream url.
  title: string // The name of the radio stream.
}

export interface SpotifyData extends BaseData {
  type: 'spotify'
  spotify_url: string
}

export interface SpotifyQueryData extends SpotifyData {
  artist: string // Creating SpotifyQueryData requires the folder name!
  query: string
}

export interface SpotifyArtistData extends SpotifyData {
  artistid: string
}

export interface SpotifyAlbumData extends SpotifyData {
  id: string
}

export interface SpotifyShowData extends SpotifyData {
  showid: string
}

export interface SpotifyPlaylistData extends SpotifyData {
  playlistid: string
}

export type Data =
  | LocalData
  | RadioData
  | RssData
  | SpotifyQueryData
  | SpotifyAlbumData
  | SpotifyArtistData
  | SpotifyPlaylistData
  | SpotifyShowData
