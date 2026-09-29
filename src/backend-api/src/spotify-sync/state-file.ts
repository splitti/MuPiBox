// Phase 14b — state-file persistence.
// Reads / writes /tmp/.spotify_sync_state.json. Tmpfs-backed so it
// doesn't survive reboots (deliberate — counters and "last run" info
// only make sense within one box uptime).

import * as fs from 'node:fs'
import { EMPTY_SYNC_STATE, type SyncStateFile } from './types'

const STATE_FILE_PATH = '/tmp/.spotify_sync_state.json'

export function readStateFile(path: string = STATE_FILE_PATH): SyncStateFile {
  try {
    if (!fs.existsSync(path)) return { ...EMPTY_SYNC_STATE }
    const raw = fs.readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SyncStateFile>
    // Defensive merge with EMPTY_SYNC_STATE so missing fields (older
    // schemas, partial writes) don't crash callers.
    return {
      ...EMPTY_SYNC_STATE,
      ...parsed,
      failure_counters: { ...EMPTY_SYNC_STATE.failure_counters, ...(parsed.failure_counters ?? {}) },
    }
  } catch (err) {
    console.warn(
      `${new Date().toLocaleString()}: [spotify-sync] state-file read failed (${(err as Error).message}), returning empty`,
    )
    return { ...EMPTY_SYNC_STATE }
  }
}

/** Atomic write tmpfile + rename. State file is tiny, no race-recovery needed. */
export function writeStateFile(state: SyncStateFile, path: string = STATE_FILE_PATH): void {
  try {
    const tmp = `${path}.tmp.${process.pid}`
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, path)
  } catch (err) {
    console.warn(
      `${new Date().toLocaleString()}: [spotify-sync] state-file write failed: ${(err as Error).message}`,
    )
  }
}
