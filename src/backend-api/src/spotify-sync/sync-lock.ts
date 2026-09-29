// Phase 14b — sync mutex.
// Atomic file-lock for the sync run itself (NOT the data.json lock, that
// one is owned by server.ts). Same wx + stale-recovery pattern as the
// existing acquireLock in server.ts, but kept local to spotify-sync/
// so this module doesn't depend on server.ts internals.
//
// Single-instance guarantee: if a sync is already running, manual
// triggers return 'locked' and cron triggers skip the slot.

import * as fs from 'node:fs'

const SYNC_LOCK_PATH = '/tmp/.spotify_sync.lock'

export type AcquireResult = 'acquired' | 'locked' | 'error'

/** Try to claim the sync lock. Returns 'acquired' on success, 'locked' if
 *  another run holds a fresh lock, 'error' on filesystem trouble. Steals
 *  stale locks older than `staleMs`. */
export function acquireSyncLock(staleMs: number, lockPath: string = SYNC_LOCK_PATH): AcquireResult {
  const tryOpen = (): AcquireResult => {
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'))
      return 'acquired'
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return 'locked'
      console.error(
        `${new Date().toLocaleString()}: [spotify-sync] sync-lock open failed:`,
        (err as Error).message,
      )
      return 'error'
    }
  }

  const first = tryOpen()
  if (first !== 'locked') return first

  // EEXIST — check whether it's stale, then maybe steal.
  try {
    const stat = fs.statSync(lockPath)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs > staleMs) {
      try {
        fs.unlinkSync(lockPath)
      } catch {
        // raced — somebody else stole it. Treat as locked.
        return 'locked'
      }
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] sync-lock: stole stale lock (age ${Math.round(ageMs / 1000)}s)`,
      )
      const second = tryOpen()
      return second === 'locked' ? 'locked' : second
    }
  } catch {
    // lock file disappeared between stat and unlink — retry
    const second = tryOpen()
    return second === 'locked' ? 'locked' : second
  }
  return 'locked'
}

/** Release the sync lock. Idempotent — silently OK if already gone. */
export function releaseSyncLock(lockPath: string = SYNC_LOCK_PATH): void {
  try {
    fs.unlinkSync(lockPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] sync-lock release failed:`,
        (err as Error).message,
      )
    }
  }
}
