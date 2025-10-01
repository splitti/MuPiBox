export enum MediaSorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

export type CategoryType = 'audiobook' | 'music' | 'other' | 'resume'

export interface Media {
  index?: number // done
  artist?: string // done
  title?: string // done
  query?: string // done
  id?: string // done
  artistid?: string // done
  showid?: string // done
  playlistid?: string // done
  audiobookid?: string // to verify
  release_date?: string
  cover?: string
  type: string // done
  category: CategoryType // done
  artistcover?: string // done
  shuffle?: boolean // done
  aPartOfAll?: boolean // done
  aPartOfAllMin?: number // done
  aPartOfAllMax?: number // done
  sorting?: MediaSorting // done
  duration?: string // done
  spotify_url?: string // done
  resumespotifytrack_number?: number
  resumespotifyprogress_ms?: number
  resumespotifyduration_ms?: number
  resumelocalalbum?: CategoryType
  resumelocalcurrentTracknr?: number
  resumelocalprogressTime?: number
  resumerssprogressTime?: number
}

// Cache interface for storing album/playlist/show/audiobook information
export interface MediaInfoCache {
  total_tracks?: number
  total_episodes?: number
  total_chapters?: number
  album_name?: string
  playlist_name?: string
  show_name?: string
  audiobook_name?: string
  currentId?: string
  mediaType?: 'album' | 'playlist' | 'show' | 'audiobook'
  tracks?: any[]
  episodes?: any[]
  chapters?: any[]
}
