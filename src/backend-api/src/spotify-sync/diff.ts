// Phase 14b — diff.
// Pure-data step. Takes the resolved SyncItem map (output of
// resolveSyncItems) and the current box library, returns the SyncDiff
// describing exactly which adds / updates / removals / conflicts the
// apply step should perform.
//
// No I/O, no side effects — keeps the matching rules testable.

import type { BoxLibraryEntry, ConflictReport, SyncDiff, SyncItem } from './types'

/**
 * Match a SyncItem against the library by its identifierField. Items live
 * under different keys depending on group-strategy (album.id, show.id,
 * track.id for episode-only, etc.); the SyncItem.identifierField tells us
 * which library field to match against.
 *
 * Only considers library entries that are explicitly spotify-typed or
 * untyped — manual/library/radio/rss entries with the same Spotify ID
 * would be a freak data scenario, but we still match those to surface a
 * conflict.
 */
function findLibraryMatch(item: SyncItem, library: BoxLibraryEntry[]): BoxLibraryEntry | undefined {
  // identifierField in the SyncItem tells us which library key carries
  // the canonical ID for this group strategy.
  for (const entry of library) {
    const candidate = entry[item.identifierField]
    if (typeof candidate !== 'string' || !candidate) continue
    if (matchesIdentifier(item, entry, candidate)) {
      return entry
    }
  }
  return undefined
}

function matchesIdentifier(item: SyncItem, entry: BoxLibraryEntry, candidate: string): boolean {
  // Compilation items use a composite `${artistId}:${albumId}` group key
  // but their library identifier is just album.id — disambiguate by
  // checking artistid additionally so a non-compilation album with the
  // same id (it shouldn't happen, but…) doesn't match a compilation item.
  if (item.groupKey.startsWith('compilation:')) {
    const [, artistId, albumId] = item.groupKey.split(':')
    if (candidate !== albumId) return false
    return entry.artistid === artistId
  }
  // Standard case: identifier field equality.
  return candidate === extractIdFromGroupKey(item.groupKey)
}

function extractIdFromGroupKey(groupKey: string): string {
  // groupKey is `<prefix>:<id>` (or `compilation:<artistId>:<albumId>` —
  // handled above). For simple cases, strip the prefix.
  const colonIdx = groupKey.indexOf(':')
  return colonIdx >= 0 ? groupKey.slice(colonIdx + 1) : groupKey
}

/**
 * Has the sync-managed entry's metadata or playlist-membership changed
 * vs. what the new SyncItem says? Used to decide whether an existing
 * spotify-sync entry needs a write back or can be left alone (skip
 * unnecessary I/O / fs.watch fires).
 */
function syncEntryDiffersFromItem(entry: BoxLibraryEntry, item: SyncItem): boolean {
  if (entry.artist !== item.artist) return true
  if (entry.title !== item.title) return true
  if (entry.category !== item.category) return true
  if (entry.cover !== item.cover) return true
  if (entry.artistcover !== item.artistCover) return true
  if (entry.spotify_sync_mode !== item.mode) return true
  // Playlist-membership: compare as sets.
  const existingPlaylists = new Set(entry.spotify_sync_playlists ?? [])
  const newPlaylists = new Set(item.playlistIds)
  if (existingPlaylists.size !== newPlaylists.size) return true
  for (const id of newPlaylists) {
    if (!existingPlaylists.has(id)) return true
  }
  return false
}

/**
 * Build the diff between resolved SyncItems and the box library.
 *
 * Manual entries with the same Spotify identifier as a SyncItem become
 * informational conflicts — they're never touched (Q4 decision, manual
 * wins). The conflict report surfaces them in the Eltern-WebApp so
 * parents can choose to "let sync manage" or "ignore".
 */
export function computeSyncDiff(syncItems: Map<string, SyncItem>, library: BoxLibraryEntry[]): SyncDiff {
  const additions: SyncItem[] = []
  const updates: SyncDiff['updates'] = []
  const conflicts: ConflictReport[] = []

  // Mark which library entries got matched (for the orphan-removal step).
  const matchedLibrary = new Set<BoxLibraryEntry>()

  for (const item of syncItems.values()) {
    const match = findLibraryMatch(item, library)
    if (!match) {
      additions.push(item)
      continue
    }
    matchedLibrary.add(match)
    const source = match.source ?? 'manual'
    if (source === 'manual') {
      conflicts.push({
        groupKey: item.groupKey,
        identifierField: item.identifierField,
        manualArtist: match.artist,
        manualTitle: match.title,
        inPlaylists: [...item.playlistIds],
        note: 'Manual entry takes precedence — sync left it untouched',
      })
      continue
    }
    // source === 'spotify-sync' (or anything else that drifted in)
    if (syncEntryDiffersFromItem(match, item)) {
      updates.push({ existing: match, item })
    }
    // else: same data — no update needed, but `matchedLibrary` is set so
    // we don't accidentally classify it as a removal.
  }

  // Orphan-removal: sync-managed library entries that no longer appear
  // in any MuPiBox-playlist.
  const removals: BoxLibraryEntry[] = []
  for (const entry of library) {
    if ((entry.source ?? 'manual') !== 'spotify-sync') continue
    if (matchedLibrary.has(entry)) continue
    removals.push(entry)
  }

  return { additions, updates, removals, conflicts }
}
