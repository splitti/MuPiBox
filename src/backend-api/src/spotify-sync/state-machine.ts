// Phase 14b — state machine.
// Orchestrates the full sync cycle: token refresh → discovery → resolve →
// diff → apply → state-file write. Maps thrown SpotifyApiExceptions and
// other failures to SyncState values + failure-counter increments per
// the Q3=B notification rules.
//
// The caller (scheduler / REST trigger) hands in dependency callbacks
// for everything stateful — the data-lock helpers from server.ts, the
// config-update helper, and the current MupiboxConfig getter. Keeps
// this module pure-enough to test in isolation.

import { getValidAccessToken, requiresReAuth } from './auth'
import { loadSpotifySyncConfig, loadSpotifyTokenStore } from './config-loader'
import { applyDiff } from './apply'
import { computeSyncDiff } from './diff'
import { maybeNotifyAfterRun } from './notify'
import { discoverPlaylists, resolveSyncItems, SpotifyApiException } from './playlists'
import { readStateFile, writeStateFile } from './state-file'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
import {
  type BoxLibraryEntry,
  type SyncDiff,
  type SyncFailureKind,
  type SyncState,
  type SyncStateFile,
  type SyncTrigger,
} from './types'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import * as fs from 'node:fs'

/** Dependencies injected from server.ts. */
export interface RunSyncDeps {
  /** Path to box library JSON. */
  dataFile: string
  /** Path to box config JSON (read fresh via mupiboxConfigCache invalidation). */
  getMupiboxConfig: () => MupiboxConfig | undefined
  /** updateMupiboxConfig from server.ts — atomic mutation + cache invalidation. */
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** acquireLock / releaseLock from server.ts for /tmp/.data.lock. */
  acquireDataLock: () => 'acquired' | 'locked' | 'error'
  releaseDataLock: () => void
  /** Optional override paths — for tests. */
  syncLockPath?: string
  stateFilePath?: string
}

/** What runSync returns to the caller (also persisted to state file). */
export interface RunSyncResult {
  state: SyncState
  trigger: SyncTrigger
  startedAt: string
  endedAt: string
  durationMs: number
  additions: number
  updates: number
  removals: number
  conflictsCount: number
  reason?: string
  retryAfterSeconds?: number
}

/**
 * Run one sync cycle. Idempotent under failure — leaves the state file
 * with the latest run outcome, never partially applies a diff.
 */
export async function runSync(trigger: SyncTrigger, deps: RunSyncDeps): Promise<RunSyncResult> {
  const startedAt = new Date()
  const startedAtIso = startedAt.toISOString()
  const previousState = readStateFile(deps.stateFilePath)
  let failureCounters = { ...previousState.failure_counters }
  // Phase 14d: snapshot of pre-run counters so notify can detect
  // transitions (first AUTH_FAILED, threshold-crossing for network/internal).
  const previousFailureCounters = { ...previousState.failure_counters }

  const finalise = (
    state: SyncState,
    counts: { additions: number; updates: number; removals: number; conflictsCount: number; conflicts?: SyncStateFile['conflicts'] } = {
      additions: 0,
      updates: 0,
      removals: 0,
      conflictsCount: 0,
    },
    extras: { reason?: string; retryAfterSeconds?: number; nextScheduled?: string | null } = {},
  ): RunSyncResult => {
    const endedAt = new Date()
    const result: RunSyncResult = {
      state,
      trigger,
      startedAt: startedAtIso,
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      additions: counts.additions,
      updates: counts.updates,
      removals: counts.removals,
      conflictsCount: counts.conflictsCount,
      reason: extras.reason,
      retryAfterSeconds: extras.retryAfterSeconds,
    }
    // Persist to state file.
    const persisted: SyncStateFile = {
      last_sync_start: result.startedAt,
      last_sync_end: result.endedAt,
      last_sync_duration_ms: result.durationMs,
      last_sync_trigger: trigger,
      last_sync_status: state,
      playlists_seen: previousState.playlists_seen, // overridden on success below
      additions_count: result.additions,
      updates_count: result.updates,
      removals_count: result.removals,
      conflicts: counts.conflicts ?? previousState.conflicts,
      failure_counters: failureCounters,
      next_scheduled_sync: extras.nextScheduled ?? previousState.next_scheduled_sync,
      current_state: 'IDLE',
    }
    writeStateFile(persisted, deps.stateFilePath)
    // Phase 14d: send Telegram push for AUTH_FAILED (immediate), and for
    // NETWORK/INTERNAL failures crossing the configured threshold.
    try {
      maybeNotifyAfterRun(result, persisted, config, previousFailureCounters)
    } catch (err) {
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] notify hook threw (non-fatal): ${(err as Error).message}`,
      )
    }
    return result
  }

  // 0. Config enabled?
  const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
  if (!config.enabled) {
    failureCounters = {} // reset on disable
    return finalise('IDLE', undefined, { reason: 'spotify_sync.enabled is false' })
  }

  // 1. Sync-lock — single-instance guarantee
  const syncLock = acquireSyncLock(config.stale_lock_minutes * 60 * 1000, deps.syncLockPath)
  if (syncLock === 'locked') {
    return finalise('IDLE', undefined, { reason: 'another sync run is in progress' })
  }
  if (syncLock === 'error') {
    return finalise('INTERNAL_ERROR', undefined, { reason: 'sync-lock filesystem error' })
  }

  try {
    // 2. Token check
    const tokenStore = loadSpotifyTokenStore(deps.getMupiboxConfig())
    if (!tokenStore) {
      return finalise('AUTH_NEEDS_REAUTH', undefined, { reason: 'no Spotify tokens configured' })
    }
    if (requiresReAuth(tokenStore)) {
      return finalise('AUTH_NEEDS_REAUTH', undefined, {
        reason: 'token scopes lack playlist-read-private/collaborative',
      })
    }

    // 3. Get valid access token (refresh if needed)
    const tokenResult = await getValidAccessToken(tokenStore, deps.updateMupiboxConfig)
    if (!tokenResult.ok) {
      const { failure } = tokenResult
      const kind: SyncFailureKind =
        failure.kind === 'auth' ? 'auth' : failure.kind === 'rate-limit' ? 'rate-limit' : failure.kind === 'network' ? 'network' : 'internal'
      failureCounters = bumpFailureCounter(failureCounters, kind)
      const mappedState: SyncState =
        kind === 'auth' ? 'AUTH_FAILED' : kind === 'rate-limit' ? 'RATE_LIMITED' : kind === 'network' ? 'NETWORK_ERROR' : 'INTERNAL_ERROR'
      return finalise(mappedState, undefined, {
        reason: failure.reason,
        retryAfterSeconds: failure.retryAfterSeconds,
      })
    }
    const accessToken = tokenResult.token

    // 4. Discovery
    let playlistsDiscovered
    try {
      playlistsDiscovered = await discoverPlaylists(accessToken, config)
    } catch (err) {
      return mapSpotifyError(err, (kind) => { failureCounters = bumpFailureCounter(failureCounters, kind) }, finalise)
    }

    // 5. Resolve tracks
    let resolved
    try {
      resolved = await resolveSyncItems(playlistsDiscovered, accessToken, config)
    } catch (err) {
      return mapSpotifyError(err, (kind) => { failureCounters = bumpFailureCounter(failureCounters, kind) }, finalise)
    }

    // 6. Read library + diff + apply — all under the data lock. Holding the
    //    lock across the read guards against /api/add/edit/delete racing us,
    //    and (critically) the array we hand to applyDiff is the exact same
    //    array computeSyncDiff matched against: removals/updates carry object
    //    references into it, so a separate re-read would break identity and
    //    silently drop every removal/update (the Phase-14b bug fixed here).
    const dataLock = deps.acquireDataLock()
    if (dataLock !== 'acquired') {
      // data.json is being written by /api/add/edit/delete — retry next cron tick
      return finalise('INTERNAL_ERROR', undefined, { reason: `data.json lock unavailable (${dataLock})` })
    }
    let diff: SyncDiff
    let applyResult: Awaited<ReturnType<typeof applyDiff>>
    try {
      const raw = fs.readFileSync(deps.dataFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        deps.releaseDataLock()
        return finalise('INTERNAL_ERROR', undefined, { reason: 'data.json root is not an array' })
      }
      const library = parsed as BoxLibraryEntry[]
      diff = computeSyncDiff(resolved.items, library)
      applyResult = await applyDiff(diff, library, deps.dataFile, new Date())
    } catch (err) {
      deps.releaseDataLock()
      failureCounters = bumpFailureCounter(failureCounters, 'internal')
      return finalise('INTERNAL_ERROR', undefined, { reason: `apply failed: ${(err as Error).message}` })
    }
    deps.releaseDataLock()

    // 9. Success — reset failure counters
    failureCounters = {}
    const playlistsSeen = playlistsDiscovered.map((p) => ({
      id: p.id,
      name: p.name,
      items: resolved.perPlaylistCounts.get(p.id) ?? 0,
    }))
    // Persist the success-path state file with full playlists_seen.
    const endedAt = new Date()
    const persistedSuccess: SyncStateFile = {
      last_sync_start: startedAtIso,
      last_sync_end: endedAt.toISOString(),
      last_sync_duration_ms: endedAt.getTime() - startedAt.getTime(),
      last_sync_trigger: trigger,
      last_sync_status: 'COMPLETED',
      playlists_seen: playlistsSeen,
      additions_count: applyResult.appliedAdditions,
      updates_count: applyResult.appliedUpdates,
      removals_count: applyResult.appliedRemovals,
      conflicts: diff.conflicts,
      failure_counters: failureCounters,
      next_scheduled_sync: new Date(Date.now() + config.polling_interval_seconds * 1000).toISOString(),
      current_state: 'IDLE',
    }
    writeStateFile(persistedSuccess, deps.stateFilePath)
    const successResult: RunSyncResult = {
      state: 'COMPLETED',
      trigger,
      startedAt: startedAtIso,
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      additions: applyResult.appliedAdditions,
      updates: applyResult.appliedUpdates,
      removals: applyResult.appliedRemovals,
      conflictsCount: diff.conflicts.length,
    }
    // Phase 14d: notify only fires for opt-in notify_on_sync or for new
    // conflicts; counters are reset above so failure-thresholds don't trip.
    try {
      maybeNotifyAfterRun(successResult, persistedSuccess, config, previousFailureCounters)
    } catch (err) {
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] notify hook (success path) threw: ${(err as Error).message}`,
      )
    }
    return successResult
  } finally {
    releaseSyncLock(deps.syncLockPath)
  }
}

/** Increment failure counter for the given kind. */
function bumpFailureCounter(
  counters: Partial<Record<SyncFailureKind, number>>,
  kind: SyncFailureKind,
): Partial<Record<SyncFailureKind, number>> {
  return { ...counters, [kind]: (counters[kind] ?? 0) + 1 }
}

/** Map SpotifyApiException to a finalise() call. */
function mapSpotifyError(
  err: unknown,
  // bumps the caller's counters: bumpFailureCounter() returns a new object, and the result used
  // to be dropped here, so discovery/resolve failures never reached the Telegram thresholds
  bump: (kind: SyncFailureKind) => void,
  finalise: (state: SyncState, c?: { additions: number; updates: number; removals: number; conflictsCount: number }, e?: { reason?: string; retryAfterSeconds?: number }) => RunSyncResult,
): RunSyncResult {
  if (err instanceof SpotifyApiException) {
    const k = err.detail.kind
    const kind: SyncFailureKind = k === 'auth' ? 'auth' : k === 'rate-limit' ? 'rate-limit' : k === 'network' ? 'network' : 'internal'
    bump(kind)
    const mappedState: SyncState =
      kind === 'auth' ? 'AUTH_FAILED' : kind === 'rate-limit' ? 'RATE_LIMITED' : kind === 'network' ? 'NETWORK_ERROR' : 'INTERNAL_ERROR'
    return finalise(mappedState, undefined, {
      reason: err.detail.reason,
      retryAfterSeconds: 'retryAfterSeconds' in err.detail ? err.detail.retryAfterSeconds : undefined,
    })
  }
  return finalise('INTERNAL_ERROR', undefined, { reason: `unexpected error: ${(err as Error).message}` })
}
