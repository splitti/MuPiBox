export enum MediaSorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

export type CategoryType = 'audiobook' | 'music' | 'other' | 'nas' | 'resume'

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
  // Full NAS path of this entry's folder, used for NAS media (type: 'nas')
  // to browse/stream it live instead of resolving a local file path.
  nasPath?: string
  // True for a NAS folder that only contains subfolders (no audio files): it is
  // drilled into like an artist level instead of being played.
  nasIsContainer?: boolean
  // Local files (type: 'library'): folder below ~/MuPiBox/media, e.g.
  // "audiobook/Artist/Album", read live from disk at any depth. Entries without
  // it are old-style library entries from data.json (category/artist/title).
  libraryPath?: string
  // True for a local folder that only contains subfolders: it opens the next level.
  libraryIsContainer?: boolean
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
