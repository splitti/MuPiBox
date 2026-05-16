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
  // Marks this Media as a resume entry. New code uses this flag exclusively;
  // the historical convention of overwriting `category` with the literal
  // 'resume' is still recognised on read for entries written by older
  // versions, but no longer produced.
  isResume?: boolean
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
  // Marks an item whose Spotify metadata fetch failed (network blip,
  // region lock, removed from catalogue, etc.). Set by spotify.service's
  // catchError fallbacks so the item still occupies its slot in the list
  // instead of silently vanishing — callers / templates can render it
  // greyed-out or with an "unavailable" badge later.
  unavailable?: boolean
  // Set by /api/addresume to Date.now() on every save. Frontend sorts the
  // resume page by this DESC so "most recently played" lands at position 1
  // even when the entry was already in the file (addresume's update-in-
  // place pattern leaves the array index untouched). Optional because
  // pre-existing entries written before this field was introduced will be
  // back-filled lazily by the backend with synthetic stamps preserving
  // file order.
  lastPlayedAt?: number
}

// Reads as "is this Media a resume entry?" — true for entries written by the
// new isResume-flag path AND for legacy entries where category was overwritten
// with 'resume'. Use everywhere instead of bare category comparisons so the
// same filter works through the migration window.
export const isResumeEntry = (m: Pick<Media, 'isResume' | 'category'> | null | undefined): boolean =>
  !!m && (m.isResume === true || m.category === 'resume')

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
