// Phase 14b — Categorizer.
// Pure functions for deciding the box-category of a sync item, plus
// playlist-description parsing for the override tags `[mupibox:category=X]`
// and `[mupibox:episode-only]`.
//
// All routes through this module are deterministic and side-effect-free —
// makes the matching rules easy to unit-test without touching Spotify's
// API.

import { type CategoryType, SYNC_ALLOWED_CATEGORIES } from './category-types'
import type { SpotifySyncConfig } from './types'

/** Tags the description-parser recognises. */
const TAG_CATEGORY = /\[mupibox:category=([a-zA-Z]+)\]/i
const TAG_EPISODE_ONLY = /\[mupibox:episode-only\]/i

/**
 * Parses a playlist description for MuPiBox-specific override tags.
 * Returns the override category (if any, and only if it's a sync-allowed
 * category) and whether episode-only mode is set.
 *
 * Out-of-range categories (e.g. `[mupibox:category=other]`) are silently
 * rejected — Smart-Sync produces only `audiobook` and `music`.
 */
export function parseDescriptionOverrides(description: string | undefined | null): {
  categoryOverride?: CategoryType
  episodeOnly: boolean
} {
  if (!description) return { episodeOnly: false }

  const result: { categoryOverride?: CategoryType; episodeOnly: boolean } = {
    episodeOnly: TAG_EPISODE_ONLY.test(description),
  }

  const categoryMatch = description.match(TAG_CATEGORY)
  if (categoryMatch) {
    const raw = categoryMatch[1].toLowerCase()
    if ((SYNC_ALLOWED_CATEGORIES as readonly string[]).includes(raw)) {
      result.categoryOverride = raw as CategoryType
    }
    // unrecognised / out-of-range: leave undefined; caller falls back to
    // playlist-name + heuristic resolution.
  }

  return result
}

/**
 * Maps a playlist name to a box category, following the resolution order
 * from spec §6.3:
 *   1. Description override (handled separately — caller passes it in)
 *   2. Playlist-name suffix lookup in config.category_mapping
 *   3. Default from config.category_mapping.default
 *
 * The Spotify-API-derived heuristic fallbacks (album_type='audiobook',
 * track.type='episode') live in the resolver — this function is just the
 * playlist-name part because that's the only stable signal known up-front.
 */
export function resolvePlaylistCategory(
  playlistName: string,
  prefix: string,
  mapping: SpotifySyncConfig['category_mapping'],
): CategoryType {
  const suffix = extractSuffixAfterPrefix(playlistName, prefix)
  if (suffix) {
    // exact match first
    const exact = mapping[suffix]
    if (exact && exact !== 'default' && (SYNC_ALLOWED_CATEGORIES as readonly string[]).includes(exact)) {
      return exact as CategoryType
    }
    // case-insensitive fallback for typo-tolerance
    const lowerKeys = Object.keys(mapping).filter((k) => k.toLowerCase() === suffix.toLowerCase())
    if (lowerKeys.length) {
      const value = mapping[lowerKeys[0]]
      if (value && value !== 'default' && (SYNC_ALLOWED_CATEGORIES as readonly string[]).includes(value)) {
        return value as CategoryType
      }
    }
  }
  const fallback = mapping.default
  if (fallback && fallback !== 'default' && (SYNC_ALLOWED_CATEGORIES as readonly string[]).includes(fallback)) {
    return fallback as CategoryType
  }
  return 'music'
}

/**
 * Strips the configured prefix from a playlist name and returns the
 * remaining suffix without the separator. Accepts `prefix-suffix`,
 * `prefix suffix`, or just `prefix` (returns empty string).
 * Anything not starting with the prefix returns undefined.
 *
 * Examples (prefix="MuPiBox"):
 *   "MuPiBox-Hörspiele"  -> "Hörspiele"
 *   "MuPiBox Schlaflieder" -> "Schlaflieder"
 *   "MuPiBox"            -> ""
 *   "MuPiBoxFavorites"   -> undefined (no separator → not a managed playlist)
 *   "mupibox-musik"      -> undefined (case-sensitive — guards against
 *                                       accidentally pulling in unrelated
 *                                       lowercase playlists)
 */
export function extractSuffixAfterPrefix(playlistName: string, prefix: string): string | undefined {
  if (playlistName === prefix) return ''
  if (playlistName.startsWith(`${prefix}-`)) return playlistName.slice(prefix.length + 1)
  if (playlistName.startsWith(`${prefix} `)) return playlistName.slice(prefix.length + 1)
  return undefined
}

/**
 * Does this playlist name match the active prefix? Used by the discovery
 * stage to filter the user's full /me/playlists response down to the ones
 * the box should pull from.
 */
export function playlistMatchesPrefix(playlistName: string, prefix: string): boolean {
  return extractSuffixAfterPrefix(playlistName, prefix) !== undefined
}

/**
 * Heuristic fallback when the playlist-name resolution yields the default
 * and the album_type / track_type signal `audiobook`/`episode`. Used by
 * the resolver (§6.3 step 2) when no description override and no
 * informative suffix is present.
 */
export function resolveItemCategoryFromAlbumType(
  albumType: string | undefined,
  trackType: string | undefined,
): CategoryType | undefined {
  if (trackType === 'episode') return 'audiobook'
  if (albumType === 'audiobook') return 'audiobook'
  return undefined
}
