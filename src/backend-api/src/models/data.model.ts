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
}

export interface RssData extends BaseData {
  artist: string // Creating RssData requires the folder name!
  id: string // This is the url to the rss feed.
}

export interface RadioData extends BaseData {
  artist: string // Creating RadioData requires the folder name!
  id: string // The stream url.
  title: string // The name of the radio stream.
}

export interface SpotifyData extends BaseData {
  spotify_url: string
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

export type Data = RadioData | RssData | SpotifyAlbumData | SpotifyArtistData | SpotifyPlaylistData | SpotifyShowData
