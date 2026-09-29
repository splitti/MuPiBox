// Phase 14d — Telegram push notifications for sync failures.
//
// Triggered from the state machine after every run. Threshold logic
// matches Q3=B:
//   - AUTH_FAILED         -> notify immediately (if notify_on_auth_failure_immediately)
//   - NETWORK_ERROR /
//     INTERNAL_ERROR      -> notify when the per-kind counter hits the
//                            configured threshold (notify_on_failure_after_attempts)
//   - RATE_LIMITED        -> never notify (the box waits the Retry-After)
//   - COMPLETED           -> notify only when notify_on_sync is true
//                            (default off — parents don't want a ping every 15 min)
//   - Conflicts new in last run -> notify_on_conflict
//
// Mechanism: spawn /usr/local/bin/mupibox/telegram_send_message.py with
// the message as argv (escaping minimal — same shell-arg style the
// existing telegram_*.py scripts use). Best-effort; failures here are
// logged but don't break the sync cycle.
//
// State is read from /tmp/.spotify_sync_state.json (kept by the state
// machine) so notify can be invoked separately and remain consistent.

import { spawn } from 'node:child_process'
import type { SpotifySyncConfig, SyncFailureKind, SyncStateFile } from './types'
import type { RunSyncResult } from './state-machine'

const TELEGRAM_SCRIPT = '/usr/local/bin/mupibox/telegram_send_message.py'

// The number of conflicts of the last conflict message (goes down with them, so new ones are reported again)
let lastReportedConflicts = 0

/** Best-effort message send via the existing Python helper. `key` is a text of telegram_i18n.py's TEXTS: the
 *  script sends it in the bot's language (German/English) with the values filled in. */
function pushMessage(key: string, values: Record<string, string | number> = {}): void {
  const args = ['--key', key, ...Object.entries(values).map(([name, value]) => `${name}=${value}`)]
  try {
    const child = spawn('/usr/bin/python3', [TELEGRAM_SCRIPT, ...args], {
      stdio: 'ignore',
      detached: false,
    })
    child.on('error', (err) => {
      console.warn(
        `${new Date().toLocaleString()}: [spotify-sync] telegram notify spawn failed: ${err.message}`,
      )
    })
  } catch (err) {
    console.warn(
      `${new Date().toLocaleString()}: [spotify-sync] telegram notify spawn threw: ${(err as Error).message}`,
    )
  }
}

/**
 * Inspect the freshly-finished run + the carried-forward failure
 * counters and decide whether to send a telegram push.
 *
 * `previousAuthCount` is the AUTH counter value BEFORE this run incremented
 * it — used so we only notify once per AUTH_FAILED transition (not on
 * every subsequent failed run that also hits AUTH_FAILED).
 */
export function maybeNotifyAfterRun(
  result: RunSyncResult,
  state: SyncStateFile,
  config: SpotifySyncConfig,
  previousCounts: Partial<Record<SyncFailureKind, number>>,
): void {
  if (!config.enabled) return

  // Auth: notify immediately, but only the FIRST time we transition into
  // AUTH_FAILED (i.e. previous AUTH counter was zero/undefined and the
  // new state is AUTH_FAILED/AUTH_NEEDS_REAUTH).
  if (
    config.notify_on_auth_failure_immediately &&
    (result.state === 'AUTH_FAILED' || result.state === 'AUTH_NEEDS_REAUTH') &&
    (previousCounts.auth ?? 0) === 0
  ) {
    pushMessage('n_sync_auth_failed')
    return
  }

  // Network/Internal: cumulative threshold. Notify once when the counter
  // crosses the threshold (not on every subsequent failure of the same kind).
  const threshold = Math.max(1, config.notify_on_failure_after_attempts)
  const kinds: SyncFailureKind[] = ['network', 'internal']
  for (const kind of kinds) {
    const before = previousCounts[kind] ?? 0
    const now = state.failure_counters[kind] ?? 0
    if (now >= threshold && before < threshold) {
      pushMessage(kind === 'network' ? 'n_sync_failures_network' : 'n_sync_failures_internal', { count: now })
      return
    }
  }

  // Conflicts: notify when this run produced new conflicts (count up vs.
  // previous state file's conflict count). Only fires if user opted in.
  // Only when there are more than at the last message: the same conflicts used to be reported again after every run
  // (every 15 min) for as long as they stood.
  if (result.state === 'COMPLETED') {
    const reported = lastReportedConflicts
    lastReportedConflicts = Math.min(reported, result.conflictsCount)
    if (config.notify_on_conflict && result.conflictsCount > reported) {
      lastReportedConflicts = result.conflictsCount
      pushMessage('n_sync_conflicts', { count: result.conflictsCount })
      return
    }
  }

  // Completed sync summary — opt-in only.
  if (config.notify_on_sync && result.state === 'COMPLETED') {
    if (result.additions > 0 || result.removals > 0) {
      pushMessage('n_sync_summary', { adds: result.additions, rems: result.removals })
    }
  }
}
