export enum MediaSorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

export type CategoryType = 'audiobook' | 'music' | 'other' | 'resume'

export interface Media {
  index?: number
  artist?: string // done
  title?: string
  query?: string
  id?: string // done
  artistid?: string // done
  showid?: string // done
  playlistid?: string // done
  release_date?: string
  cover?: string
  type: string // done
  category: CategoryType // done
  artistcover?: string // done
  shuffle?: boolean
  aPartOfAll?: boolean
  aPartOfAllMin?: number
  aPartOfAllMax?: number
  sorting?: MediaSorting
  duration?: string
  spotify_url?: string // done
  resumespotifytrack_number?: number
  resumespotifyprogress_ms?: number
  resumespotifyduration_ms?: number
  resumelocalalbum?: CategoryType
  resumelocalcurrentTracknr?: number
  resumelocalprogressTime?: number
  resumerssprogressTime?: number
}
