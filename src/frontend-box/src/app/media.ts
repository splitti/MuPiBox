export enum MediaSorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

export type CategoryType = 'audiobook' | 'music' | 'other' | 'resume'

export interface Media {
  index?: number
  artist?: string
  title?: string
  query?: string
  id?: string
  artistid?: string
  showid?: string
  playlistid?: string
  audiobookid?: string
  release_date?: string
  cover?: string
  type: string
  category: CategoryType
  artistcover?: string
  shuffle?: boolean
  aPartOfAll?: boolean
  aPartOfAllMin?: number
  aPartOfAllMax?: number
  sorting?: MediaSorting
  duration?: string
  spotify_url?: string
  resumespotifytrack_number?: number
  resumespotifyprogress_ms?: number
  resumespotifyduration_ms?: number
  resumelocalalbum?: CategoryType
  resumelocalcurrentTracknr?: number
  resumelocalprogressTime?: number
  resumerssprogressTime?: number
}

// Cache interface for storing album/playlist/show information
export interface MediaInfoCache {
  total_tracks?: number
  total_episodes?: number
  album_name?: string
  playlist_name?: string
  show_name?: string
  currentId?: string
  mediaType?: 'album' | 'playlist' | 'show'
}
