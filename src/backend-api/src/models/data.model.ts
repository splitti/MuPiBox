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
  // TODO: Can this be undefined. Assume `audiobook`
  category: CategoryType
  // `artist` is the folder name.
  // If it is not set, the folder name is tried to be taken from the source
  // (e.g., Spotify show name).
  artist?: string
  // This is the optional folder image url.
  artistcover?: string

  // TODO: cover etc.
  title?: string
  cover?: string
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
}

export interface SpotifyBaseData extends BaseData, HasMultipleMedia {
  type: 'spotify'
  shuffle?: boolean
}

export interface SpotifyQueryData extends SpotifyBaseData {
  artist: string // Creating SpotifyQueryData requires the folder name!
  query: string
}

export interface SpotifyArtistData extends SpotifyBaseData {
  artistid: string
  spotify_url?: string
}

export interface SpotifyAlbumData extends SpotifyBaseData {
  id: string
  spotify_url?: string
}

export interface SpotifyShowData extends SpotifyBaseData {
  showid: string
  spotify_url?: string
}

export interface SpotifyAudiobookData extends SpotifyBaseData {
  audiobookid: string
  spotify_url?: string
}

export interface SpotifyPlaylistData extends SpotifyBaseData {
  playlistid: string
  spotify_url?: string
}

export type SpotifyData =
  | SpotifyQueryData
  | SpotifyAlbumData
  | SpotifyArtistData
  | SpotifyPlaylistData
  | SpotifyShowData
  | SpotifyAudiobookData

export type Data = LocalData | RadioData | RssData | SpotifyData

/**
 * Returns true if the data is of type {@link RssData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link RssData}, false otherwise.
 */
export const isRssData = (data: Data): data is RssData => {
  return data.type === 'rss'
}

/**
 * Returns true if the data is of type {@link RadioData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link RadioData}, false otherwise.
 */
export const isRadioData = (data: Data): data is RadioData => {
  return data.type === 'radio'
}

/**
 * Returns true if the data is of type {@link SpotifyData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyData}, false otherwise.
 */
export const isSpotifyData = (data: Data): data is SpotifyData => {
  return data.type === 'spotify'
}

/**
 * Returns true if the data is of type {@link SpotifyShowData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyShowData}, false otherwise.
 */
export const isSpotifyShowData = (data: Data): data is SpotifyShowData => {
  return isSpotifyData(data) && 'showid' in data
}

/**
 * Returns true if the data is of type {@link SpotifyArtistData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyArtistData}, false otherwise.
 */
export const isSpotifyArtistData = (data: Data): data is SpotifyArtistData => {
  return isSpotifyData(data) && 'artistid' in data
}

/**
 * Returns true if the data is of type {@link SpotifyPlaylistData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyPlaylistData}, false otherwise.
 */
export const isSpotifyPlaylistData = (data: Data): data is SpotifyPlaylistData => {
  return isSpotifyData(data) && 'playlistid' in data
}

/**
 * Returns true if the data is of type {@link SpotifyAlbumData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyAlbumData}, false otherwise.
 */
export const isSpotifyAlbumData = (data: Data): data is SpotifyAlbumData => {
  return isSpotifyData(data) && 'id' in data
}

/**
 * Returns true if the data is of type {@link SpotifyQueryData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyQueryData}, false otherwise.
 */
export const isSpotifyQueryData = (data: Data): data is SpotifyQueryData => {
  return isSpotifyData(data) && 'query' in data
}

/**
 * Returns true if the data is of type {@link SpotifyAudiobookData}.
 * @param data - The data to check.
 * @returns - True if the data is of type {@link SpotifyAudiobookData}, false otherwise.
 */
export const isSpotifyAudiobookData = (data: Data): data is SpotifyAudiobookData => {
  return isSpotifyData(data) && 'audiobookid' in data
}
