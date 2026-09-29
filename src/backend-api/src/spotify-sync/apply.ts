// Phase 14b — apply.
// Mutates data.json based on a SyncDiff. All I/O happens here. Uses the
// existing acquireLock pattern from server.ts (passed in by the caller)
// so the lock semantics match the rest of the codebase — no double-lock,
// no stale-recovery duplication.
//
// Override-field protection (Q8=B): updates only touch the non-override
// base fields. artist_override, title_override, category_override,
// cover_override, artistcover_override stay untouched so user
// adjustments survive sync runs.

import * as fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { backupBeforeWrite } from '../file-backup'
import type { BoxLibraryEntry, SyncDiff, SyncItem } from './types'

/**
 * Apply the diff to data.json. Caller already holds the data lock and
 * passes the exact `library` array that `computeSyncDiff` matched against
 * — apply mutates that array and writes it atomically.
 *
 * IMPORTANT: `library` MUST be the same array instance the diff was built
 * from. Removals/updates are matched by object identity (the diff carries
 * references into this array), so re-reading data.json here would yield
 * fresh objects that never match — silently dropping every removal and
 * update. (That was the Phase-14b bug fixed in Phase 17e.)
 *
 * Atomic via tmp+rename (B8 / acquireLock pattern). Returns the post-
 * apply library so the state file can be updated with accurate counts.
 */
export async function applyDiff(
  diff: SyncDiff,
  library: BoxLibraryEntry[],
  dataFilePath: string,
  now: Date = new Date(),
): Promise<{ libraryAfter: BoxLibraryEntry[]; appliedAdditions: number; appliedUpdates: number; appliedRemovals: number }> {
  const isoNow = now.toISOString()

  // Removals first — by reference, so the indices we use for updates
  // remain stable. Build a set for O(1) membership test.
  const removalSet = new Set<BoxLibraryEntry>(diff.removals)
  let after: BoxLibraryEntry[] = library.filter((entry) => !removalSet.has(entry))
  const appliedRemovals = library.length - after.length

  // Updates: mutate in place. Override fields stay untouched; sync base
  // fields get overwritten with the new SyncItem data.
  let appliedUpdates = 0
  for (const { existing, item } of diff.updates) {
    // `existing` is a reference into the original `library` array; after
    // filter it may not be in `after`. Re-resolve by identity.
    const target = after.find((e) => e === existing)
    if (!target) continue
    applyUpdate(target, item, isoNow)
    appliedUpdates++
  }

  // Additions: append new entries.
  for (const item of diff.additions) {
    after.push(buildLibraryEntry(item, isoNow))
  }
  const appliedAdditions = diff.additions.length

  // Re-index. /api/add does this implicitly via array.push without an
  // index; we explicitly renumber to keep deterministic order.
  after = renumber(after)

  // Atomic write: tmp + rename. Same {spaces: 2} indent as the rest of
  // the backend (matches the Phase-10 M5 helper output).
  const serialized = `${JSON.stringify(after, null, 2)}\n`
  // Nothing changed (the usual case every 15 minutes): leave the file alone. Rewriting identical
  // content wore the SD card and changed data.json's mtime, which the box display takes as "the
  // library changed" - it reloaded its lists and lost the scroll position.
  try {
    if ((await fsPromises.readFile(dataFilePath, 'utf8')) === serialized) {
      return { libraryAfter: after, appliedAdditions, appliedUpdates, appliedRemovals }
    }
  } catch {
    // unreadable: write it below
  }
  backupBeforeWrite(dataFilePath)
  const tmpPath = `${dataFilePath}.tmp.${process.pid}`
  await fsPromises.writeFile(tmpPath, serialized, 'utf8')
  // rename on the same filesystem is atomic on POSIX — what /api/add and
  // the Phase-3 trap-and-mv scripts rely on too.
  fs.renameSync(tmpPath, dataFilePath)

  return { libraryAfter: after, appliedAdditions, appliedUpdates, appliedRemovals }
}

/** Mutate an existing sync-managed library entry to match a fresh SyncItem.
 *  Override fields are explicitly NOT touched (Q8=B). */
function applyUpdate(target: BoxLibraryEntry, item: SyncItem, isoNow: string): void {
  target.artist = item.artist
  target.title = item.title
  target.category = item.category
  target.cover = item.cover
  target.artistcover = item.artistCover
  target.spotify_sync_last_seen = isoNow
  target.spotify_sync_playlists = [...item.playlistIds]
  target.spotify_sync_mode = item.mode
  // IDs deliberately not re-written — they're the match key; if they
  // mismatched we wouldn't be here. Note that `type` stays whatever it
  // was, which for sync items is always 'spotify'.
}

/** Build a brand-new library entry from a SyncItem (for additions). */
function buildLibraryEntry(item: SyncItem, isoNow: string): BoxLibraryEntry {
  // Strip the prefix from the group key to get the bare ID for the
  // identifier field. Compilation items use composite keys; for those
  // the album-id portion is the last `:`-segment.
  const idValue = extractIdValue(item)
  const entry: BoxLibraryEntry = {
    type: item.type,
    category: item.category,
    source: 'spotify-sync',
    artist: item.artist,
    title: item.title,
    cover: item.cover,
    artistcover: item.artistCover,
    spotify_sync_added: isoNow,
    spotify_sync_last_seen: isoNow,
    spotify_sync_playlists: [...item.playlistIds],
    spotify_sync_mode: item.mode,
  }
  entry[item.identifierField] = idValue
  // Compilation items also carry the artist id for the disambiguation
  // check in findLibraryMatch.
  if (item.groupKey.startsWith('compilation:') && item.artistId) {
    entry.artistid = item.artistId
  }
  return entry
}

/** Bare-ID extraction matching the matchesIdentifier logic in diff.ts. */
function extractIdValue(item: SyncItem): string {
  if (item.groupKey.startsWith('compilation:')) {
    // compilation:<artistId>:<albumId> — identifier field is `id` (album).
    const parts = item.groupKey.split(':')
    return parts[parts.length - 1] ?? ''
  }
  const colonIdx = item.groupKey.indexOf(':')
  return colonIdx >= 0 ? item.groupKey.slice(colonIdx + 1) : item.groupKey
}

/** Renumber `index` to 0..N-1 — preserves /api/add semantics. */
function renumber(library: BoxLibraryEntry[]): BoxLibraryEntry[] {
  for (let i = 0; i < library.length; i++) {
    library[i].index = i
  }
  return library
}
