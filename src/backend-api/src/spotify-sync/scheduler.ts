// Phase 14b — scheduler.
// Sets up the recurring cron-style sync timer and exposes a manual
// trigger entry point with 60s throttling (Q6 manual_throttle_seconds).
// Single ownership: only one timer per process, never overlapping
// scheduled runs (the sync-lock would catch overlaps anyway, but the
// timer is also kept honest).
//
// Lifetimes follow the box's pm2/systemd-managed backend-api process —
// stop() exists for tests but isn't called in production.

import { runSync, type RunSyncDeps, type RunSyncResult } from './state-machine'
import type { SyncTrigger } from './types'
import { loadSpotifySyncConfig } from './config-loader'

const MANUAL_THROTTLE_PATH = '/tmp/.last_sync_trigger'

let timerHandle: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<RunSyncResult> | null = null
// Trailing-edge run: when a manual trigger is throttled, we don't drop it —
// we arm a single timer that fires one run when the cooldown elapses, so a
// burst of WebApp edits still all land without waiting for the next poll.
let trailingTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Schedule the next sync after `delaySeconds`. Re-arms itself after each
 * run finishes (success or failure) — failures get the configured
 * polling interval too, no exponential back-off; rate-limit returns from
 * runSync include the retryAfterSeconds value which we honour.
 */
export function startScheduler(deps: RunSyncDeps): void {
  if (timerHandle) {
    // Already running — defensively clear so we don't end up with two
    // overlapping cycles after a hot-reload.
    clearTimeout(timerHandle)
    timerHandle = null
  }
  const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
  // Boot-after-60s lead-in: the box might be still finishing startup
  // when backend-api comes up; don't ambush the I2C bus / network in
  // the first minute.
  scheduleNext(60, deps)
  console.log(
    `${new Date().toLocaleString()}: [spotify-sync] scheduler started (enabled=${config.enabled}, interval=${config.polling_interval_seconds}s)`,
  )
}

function scheduleNext(delaySeconds: number, deps: RunSyncDeps): void {
  if (timerHandle) clearTimeout(timerHandle)
  timerHandle = setTimeout(async () => {
    timerHandle = null
    // Fallback, falls schon das Laden der Config wirft: lieber in einer
    // Minute nochmal versuchen als den Scheduler verlieren.
    let next = 60
    try {
      const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
      if (!config.enabled) {
        // Re-poll the config periodically even when disabled, so the user
        // can flip the toggle in the WebApp without a backend restart.
        next = config.polling_interval_seconds
      } else {
        const result = await runOnce('cron', deps)
        // Honour rate-limit retry-after if present, else standard interval.
        next =
          result.state === 'RATE_LIMITED' && result.retryAfterSeconds ? result.retryAfterSeconds : config.polling_interval_seconds
      }
    } catch (err) {
      // runSync() endet mit try/finally ohne catch, kann also durchwerfen.
      // Ohne dieses catch bliebe die Neuplanung unten aus und der Scheduler
      // wäre bis zum nächsten Backend-Neustart still tot -- ohne Hinweis im
      // UI, weil /status weiter den letzten erfolgreichen Lauf zeigt.
      console.error(`${new Date().toLocaleString()}: [spotify-sync] scheduled run threw: ${(err as Error).message}`)
    }
    // Muss in JEDEM Pfad passieren, sonst endet die Kette hier.
    scheduleNext(next, deps)
  }, delaySeconds * 1000)
  // Keep the event loop responsive — sync polling isn't a reason to
  // pin the process awake. (No-op on Node22 if there's other activity.)
  if (typeof timerHandle.unref === 'function') timerHandle.unref()
}

/**
 * Manual trigger. Returns 'queued' if a run started now, 'scheduled' if the
 * cooldown is active (a single trailing run is armed for when it ends),
 * 'running' if a sync is already in flight, or 'disabled' if spotify_sync
 * is off.
 */
export async function triggerManualSync(
  source: Extract<SyncTrigger, 'webapp' | 'telegram'>,
  deps: RunSyncDeps,
): Promise<
  | { ok: true; status: 'queued'; estimatedSeconds: number }
  | { ok: true; status: 'scheduled'; scheduledInSeconds: number }
  | { ok: false; status: 'running' }
  | { ok: false; status: 'disabled' }
> {
  const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
  if (!config.enabled) return { ok: false, status: 'disabled' }
  const cooldownLeft = getManualThrottleRemaining(config.manual_throttle_seconds)

  if (inflight) {
    // A run is in flight, but it may have started *before* this edit's config
    // write — so it might not include the change. Arm a trailing run so the
    // edit still lands without waiting for the next 15-min poll.
    armTrailingRun(source, deps, cooldownLeft)
    return { ok: false, status: 'running' }
  }
  if (cooldownLeft > 0) {
    // Throttled — don't drop the request; arm one trailing run for when the
    // cooldown ends. A burst of edits coalesces into a single run.
    armTrailingRun(source, deps, cooldownLeft)
    return { ok: true, status: 'scheduled', scheduledInSeconds: cooldownLeft }
  }
  markManualTrigger()
  // An immediate run supersedes any pending trailing run.
  if (trailingTimer) {
    clearTimeout(trailingTimer)
    trailingTimer = null
  }
  // Fire and forget — caller polls /status. Estimate is a hand-tuned
  // ~3s typical run; not load-bearing for correctness, only for UX.
  runOnce(source, deps).catch((err) => {
    console.error(`${new Date().toLocaleString()}: [spotify-sync] manual run threw: ${(err as Error).message}`)
  })
  return { ok: true, status: 'queued', estimatedSeconds: 3 }
}

/**
 * Arm a single trailing sync run for `delaySeconds` from now (idempotent —
 * a pending timer is left as-is so a burst of edits coalesces into one run).
 * When it fires it re-arms itself if a run is still in flight, so the edit
 * always gets a run that starts *after* it.
 */
function armTrailingRun(source: SyncTrigger, deps: RunSyncDeps, delaySeconds: number): void {
  if (trailingTimer) return
  const fire = (): void => {
    if (inflight) {
      // Current run still going — wait and retry so our edit gets a fresh run.
      trailingTimer = setTimeout(fire, 5000)
      if (typeof trailingTimer.unref === 'function') trailingTimer.unref()
      return
    }
    trailingTimer = null
    markManualTrigger()
    runOnce(source, deps).catch((err) => {
      console.error(`${new Date().toLocaleString()}: [spotify-sync] trailing run threw: ${(err as Error).message}`)
    })
  }
  trailingTimer = setTimeout(fire, Math.max(0, delaySeconds) * 1000 + 250)
  if (typeof trailingTimer.unref === 'function') trailingTimer.unref()
}

/** Returns the seconds left on the manual-trigger cooldown, or 0 if free. */
function getManualThrottleRemaining(throttleSeconds: number): number {
  try {
    const fs = require('node:fs') as typeof import('node:fs')
    if (!fs.existsSync(MANUAL_THROTTLE_PATH)) return 0
    const stat = fs.statSync(MANUAL_THROTTLE_PATH)
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000
    if (ageSeconds >= throttleSeconds) return 0
    return Math.ceil(throttleSeconds - ageSeconds)
  } catch {
    return 0
  }
}

/** Touch the trigger marker so subsequent manual triggers see the cooldown. */
function markManualTrigger(): void {
  try {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(MANUAL_THROTTLE_PATH, String(Date.now()))
  } catch {
    // tmpfs full or similar — non-fatal, just no cooldown enforcement.
  }
}

/** Internal: run sync, tracking inflight state for the running-guard. */
async function runOnce(trigger: SyncTrigger, deps: RunSyncDeps): Promise<RunSyncResult> {
  if (inflight) return inflight
  inflight = runSync(trigger, deps).finally(() => {
    inflight = null
  })
  return inflight
}

/** Stop the scheduler — only used in tests. */
export function stopScheduler(): void {
  if (timerHandle) {
    clearTimeout(timerHandle)
    timerHandle = null
  }
}
