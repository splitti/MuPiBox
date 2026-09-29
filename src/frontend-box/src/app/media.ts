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
  // Full NAS path of this entry's folder, used for NAS media (type: 'nas')
  // to browse/stream it live instead of resolving a local file path.
  nasPath?: string
  // True for a NAS folder with subfolders holding audio: it is drilled into like
  // an artist level instead of being played.
  nasIsContainer?: boolean
  // Local files (type: 'library'): folder below ~/MuPiBox/media, e.g.
  // "audiobook/Artist/Album", read live from disk at any depth. Entries without
  // it are old-style library entries from data.json (category/artist/title).
  libraryPath?: string
  // True for a local folder with subfolders holding audio: it opens the next level.
  libraryIsContainer?: boolean
  // The audio files lying directly in such a folder (NAS or local), next to its subfolders: listed first.
  ownFiles?: boolean
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

  // ─── Phase 14a — Smart-Sync data layer ────────────────────────────────
  // `source` discriminates user-curated entries from those pulled in by
  // the Spotify-playlist sync. Optional in TypeScript because pre-migration
  // entries in data.json don't carry the field yet — use mediaSource(m)
  // helper below which defaults missing values to 'manual'.
  source?: 'manual' | 'spotify-sync'

  // Smart-Sync bookkeeping. Only meaningful when source === 'spotify-sync'.
  spotify_sync_playlists?: string[]   // playlist IDs referencing this item
  spotify_sync_added?: string          // ISO timestamp, first seen
  spotify_sync_last_seen?: string      // ISO timestamp, last present in any playlist
  spotify_sync_mode?: 'album' | 'episode-only'  // see phase14_smart_sync.md §6.3.1

  // Override fields (decision Q8=B). Parents can edit these per item even
  // when source === 'spotify-sync'; subsequent sync runs touch only the
  // non-override base field. Frontend renders the effective value via
  // mediaEffective*(m) helpers below: <field>_override ?? <field>.
  artist_override?: string
  title_override?: string
  category_override?: CategoryType
  cover_override?: string
  artistcover_override?: string
}

// Phase 14a helpers — single point of truth for source + override semantics.
// Used everywhere instead of bare property access so the migration window
// (data.json entries without `source`) is transparent to call sites, and
// override resolution doesn't fan out into ad-hoc `?? `-chains all over
// the codebase.
export const mediaSource = (m: Pick<Media, 'source'> | null | undefined): 'manual' | 'spotify-sync' =>
  m?.source ?? 'manual'

export const isSyncManaged = (m: Pick<Media, 'source'> | null | undefined): boolean =>
  mediaSource(m) === 'spotify-sync'

export const mediaEffectiveArtist = (m: Pick<Media, 'artist' | 'artist_override'>): string | undefined =>
  m.artist_override ?? m.artist

export const mediaEffectiveTitle = (m: Pick<Media, 'title' | 'title_override'>): string | undefined =>
  m.title_override ?? m.title

export const mediaEffectiveCategory = (m: Pick<Media, 'category' | 'category_override'>): CategoryType =>
  m.category_override ?? m.category

export const mediaEffectiveCover = (m: Pick<Media, 'cover' | 'cover_override'>): string | undefined =>
  m.cover_override ?? m.cover

export const mediaEffectiveArtistCover = (m: Pick<Media, 'artistcover' | 'artistcover_override'>): string | undefined =>
  m.artistcover_override ?? m.artistcover

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
