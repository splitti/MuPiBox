// Phase 14b — Spotify Smart-Sync types.
// Single point of truth for all sync-internal data shapes. Domain types
// are kept independent from Spotify-API response types where possible so
// the rest of the codebase doesn't have to import spotify-web-api-node
// transitively.

import type { CategoryType } from './category-types'

/** State-Machine vertices (see docs/phase14_smart_sync.md §5). */
export type SyncState =
  | 'IDLE'
  | 'FETCHING_PLAYLISTS'
  | 'RESOLVING_TRACKS'
  | 'DIFFING'
  | 'APPLYING'
  | 'COMPLETED'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'AUTH_NEEDS_REAUTH'

/** Trigger source for a sync run (informational, ends up in state file). */
export type SyncTrigger = 'cron' | 'boot' | 'network-up' | 'webapp' | 'telegram'

/** How an item is held in the box library — see §6.3.1. */
export type SyncMode = 'album' | 'episode-only'

/** Failure category for the threshold-based notification logic (§12.3.1). */
export type SyncFailureKind = 'auth' | 'network' | 'rate-limit' | 'internal'

/** A single album pinned via the Eltern-WebApp search (Phase 17b), independent
 *  of any playlist. `category` is the parent's pick at add-time. */
export interface ExplicitAlbum {
  id: string
  name?: string
  category?: CategoryType
}

/** A whole-artist subscription (Phase 17c). The sync pulls the artist's albums
 *  (album_types, default 'album'), sorts by release_date, and — when a range is
 *  set — keeps only albums [range_from..range_to] (1-indexed, Phase 17d).
 *  `exclude_album_ids` drops individual albums inside that window (Phase 17e). */
export interface ArtistSubscription {
  id: string
  name?: string
  category?: CategoryType
  album_types?: string
  range_from?: number
  range_to?: number
  exclude_album_ids?: string[]
}

/** Per-box configuration (read from mupiboxconfig.json.spotify_sync). */
export interface SpotifySyncConfig {
  enabled: boolean
  playlist_prefix: string
  playlist_explicit_ids: string[]
  explicit_albums: ExplicitAlbum[]
  artists: ArtistSubscription[]
  polling_interval_seconds: number
  manual_throttle_seconds: number
  stale_lock_minutes: number
  category_mapping: Record<string, CategoryType | 'default'>
  auto_detect_categories: boolean
  album_promotion: boolean
  conflict_strategy: 'manual_wins'
  notify_on_sync: boolean
  notify_on_conflict: boolean
  notify_on_failure_after_attempts: number
  notify_on_auth_failure_immediately: boolean
}

/** Defaults applied when fields are missing in mupiboxconfig.json. */
export const DEFAULT_SPOTIFY_SYNC_CONFIG: SpotifySyncConfig = {
  enabled: false,
  playlist_prefix: 'MuPiBox',
  playlist_explicit_ids: [],
  explicit_albums: [],
  artists: [],
  polling_interval_seconds: 900, // 15 min (Q6=B)
  manual_throttle_seconds: 60,
  stale_lock_minutes: 10,
  category_mapping: {
    default: 'music',
    Hörspiele: 'audiobook',
    Hörbücher: 'audiobook',
    Hoerspiele: 'audiobook',
    Hoerbuecher: 'audiobook',
    Hörbuch: 'audiobook',
    Hoerbuch: 'audiobook',
    Audio: 'audiobook',
    Audiobooks: 'audiobook',
    'Audio Drama': 'audiobook',
    Hoerspiel: 'audiobook',
    Musik: 'music',
    Music: 'music',
    Schlafenszeit: 'music',
    Schlaflieder: 'music',
    Bedtime: 'music',
    Lullabies: 'music',
  },
  auto_detect_categories: true,
  album_promotion: true,
  conflict_strategy: 'manual_wins',
  notify_on_sync: false,
  notify_on_conflict: true,
  notify_on_failure_after_attempts: 3, // Q3=B
  notify_on_auth_failure_immediately: true, // Q3=B
}

/** Polling-interval clamp range — exposed for use by REST handlers. */
export const POLLING_INTERVAL_SECONDS_MIN = 300 // 5 min
export const POLLING_INTERVAL_SECONDS_MAX = 3600 // 1 h

/** Token store, persisted in mupiboxconfig.json.spotify (see §4.6). */
export interface SpotifyTokenStore {
  clientId: string
  clientSecret?: string // empty/missing -> PKCE flow (14+++)
  accessToken: string
  refreshToken: string
  tokenScopes?: string[] // tracks granted scopes for re-auth detection
  tokenExpiresAt?: string // ISO8601
  tokenUpdatedAt?: string // ISO8601
}

/** Required scopes for Smart-Sync to function. */
export const REQUIRED_SYNC_SCOPES = ['playlist-read-private', 'playlist-read-collaborative'] as const

/**
 * A single item produced by Track-Resolution (§6.2). The diff stage matches
 * these against the box library to decide add/update/remove/conflict.
 */
export interface SyncItem {
  /** Canonical identifier for matching against library (album.id, show.id, etc.). */
  groupKey: string
  /** Per-item mode: 'album' for whole-album / whole-show, 'episode-only' for single episode. */
  mode: SyncMode
  /** What field in `Media` carries the group identifier in the box library. */
  identifierField: 'id' | 'artistid' | 'showid' | 'audiobookid' | 'playlistid'
  /** Spotify-derived raw metadata, copied into Media fields on add/update. */
  artist?: string
  artistId?: string
  title?: string
  cover?: string
  artistCover?: string
  /** Box-side category resolved by the categorizer (see §6.3). */
  category: CategoryType
  /** Playlists that reference this item — used for multi-playlist tracking (§6.5). */
  playlistIds: string[]
  /** Item type tag in box library — currently always 'spotify'. */
  type: 'spotify'
}

/** Result of comparing resolved sync_items against the current library. */
export interface SyncDiff {
  additions: SyncItem[]
  updates: Array<{ existing: BoxLibraryEntry; item: SyncItem }>
  removals: BoxLibraryEntry[]
  conflicts: ConflictReport[]
}

/** Reported informational conflict (manual entry + sync-pulled entry for same item). */
export interface ConflictReport {
  groupKey: string
  identifierField: SyncItem['identifierField']
  manualArtist?: string
  manualTitle?: string
  inPlaylists: string[]
  note: string
}

/**
 * Subset of Media (frontend) as the sync code needs to think about it.
 * Kept separate from the frontend Media type so server.ts is the only
 * place that bridges between data.json's any-shape and typed sync logic.
 */
export interface BoxLibraryEntry {
  index?: number
  type: string
  category: CategoryType
  source?: 'manual' | 'spotify-sync'
  artist?: string
  title?: string
  cover?: string
  artistcover?: string
  id?: string
  artistid?: string
  showid?: string
  audiobookid?: string
  playlistid?: string
  // Sync bookkeeping
  spotify_sync_playlists?: string[]
  spotify_sync_added?: string
  spotify_sync_last_seen?: string
  spotify_sync_mode?: SyncMode
  // Override fields (Q8=B)
  artist_override?: string
  title_override?: string
  category_override?: CategoryType
  cover_override?: string
  artistcover_override?: string
  // Allow unknown fields — data.json carries many legacy keys.
  [key: string]: unknown
}

/** Discovered playlist, normalised from spotify-web-api-node responses. */
export interface DiscoveredPlaylist {
  id: string
  name: string
  description?: string
  categoryOverride?: CategoryType // from [mupibox:category=X] tag in description
  episodeOnly: boolean // true if [mupibox:episode-only] in description
  trackCount: number
}

/** What gets written to /tmp/.spotify_sync_state.json (§6.6). */
export interface SyncStateFile {
  last_sync_start: string | null
  last_sync_end: string | null
  last_sync_duration_ms: number | null
  last_sync_trigger: SyncTrigger | null
  last_sync_status: SyncState
  playlists_seen: Array<{ id: string; name: string; items: number }>
  additions_count: number
  updates_count: number
  removals_count: number
  conflicts: ConflictReport[]
  failure_counters: Partial<Record<SyncFailureKind, number>>
  next_scheduled_sync: string | null
  current_state: SyncState
}

/** Standard empty-state for initialisation / after-disconnect. */
export const EMPTY_SYNC_STATE: SyncStateFile = {
  last_sync_start: null,
  last_sync_end: null,
  last_sync_duration_ms: null,
  last_sync_trigger: null,
  last_sync_status: 'IDLE',
  playlists_seen: [],
  additions_count: 0,
  updates_count: 0,
  removals_count: 0,
  conflicts: [],
  failure_counters: {},
  next_scheduled_sync: null,
  current_state: 'IDLE',
}
