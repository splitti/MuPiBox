// Phase 14b — scheduler.
// Sets up the recurring cron-style sync timer and exposes a manual
// trigger entry point with 60s throttling (Q6 manual_throttle_seconds).
// Single ownership: only one timer per process, never overlapping
// scheduled runs (the sync-lock would catch overlaps anyway, but the
// timer is also kept honest).
//
// Lifetimes follow the box's pm2/systemd-managed backend-api process —
// stop() exists for tests but isn't called in production.

import { onSpotifyBlockCleared } from '../spotify-block'
import { runSync, type RunSyncDeps, type RunSyncResult } from './state-machine'
import type { SyncTrigger } from './types'
import { loadSpotifySyncConfig } from './config-loader'

const MANUAL_THROTTLE_PATH = '/tmp/.last_sync_trigger'

let timerHandle: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<RunSyncResult> | null = null
/** A run of the sync under way (a switch of the user waits for it - users.ts) */
export const isSyncRunning = (): boolean => inflight !== null
// Trailing-edge run: when a manual trigger is throttled, we don't drop it —
// we arm a single timer that fires one run when the cooldown elapses, so a
// burst of WebApp edits still all land without waiting for the next poll.
// One per library (several users: the one in place and each one not in place - a request for one did not
// take over or drop the one armed for another), with whether it may run with Smart-Sync off (asked so by the app, see
// triggerManualSync).
interface Trailing {
  timer: ReturnType<typeof setTimeout> | null
  allowWhenOff: boolean
}
const trailing = new Map<string, Trailing>()
const trailingKey = (deps: RunSyncDeps) => deps.stateFilePath ?? ''

/** A user who is not in place (several users, users.ts): his library and his subscriptions, synced as well */
export interface OtherSyncUser {
  id: string
  deps: RunSyncDeps
}
// (the users not in place now - read at every run: one may have come into place meanwhile; none without several users)
let othersOf: () => OtherSyncUser[] = () => []
// when each of them was synced last (his own interval counts)
const otherLastRun = new Map<string, number>()

/**
 * Schedule the next sync after `delaySeconds`. Re-arms itself after each
 * run finishes (success or failure) — failures get the configured
 * polling interval too, no exponential back-off; rate-limit returns from
 * runSync include the retryAfterSeconds value which we honour.
 */
export function startScheduler(deps: RunSyncDeps, opts: { others?: () => OtherSyncUser[] } = {}): void {
  if (opts.others) othersOf = opts.others
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
  onSpotifyBlockCleared(() => scheduleNext(60, deps))
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
    // (the users not in place: each one with Smart-Sync on, when his interval is over - at least a minute later the next
    // look, so one whose interval is shorter than that of the one in place is not kept waiting)
    try {
      const soonest = await runOthersDue()
      if (soonest !== null) next = Math.min(next, Math.max(60, soonest))
    } catch (err) {
      console.error(`${new Date().toLocaleString()}: [spotify-sync] run of another user threw: ${(err as Error).message}`)
    }
    // Muss in JEDEM Pfad passieren, sonst endet die Kette hier.
    // (at most a day: a Retry-After of weeks overflowed setTimeout, which then fired at once - again and again)
    scheduleNext(Math.max(1, Math.min(next, 86400)), deps)
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
  // (the app after a change of the artists or albums it manages: also with Smart-Sync off - then a run of only those,
  // see runSync. The bot's /resync and the timer stay off with it.)
  opts: { subscriptions?: boolean } = {},
): Promise<
  | { ok: true; status: 'queued'; estimatedSeconds: number; subscriptionsOnly?: boolean }
  | { ok: true; status: 'scheduled'; scheduledInSeconds: number; subscriptionsOnly?: boolean }
  | { ok: false; status: 'running' }
  | { ok: false; status: 'disabled' }
> {
  const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
  const allowWhenOff = opts.subscriptions === true && source === 'webapp'
  if (!config.enabled && !allowWhenOff) return { ok: false, status: 'disabled' }
  const only = config.enabled ? {} : { subscriptionsOnly: true }
  const cooldownLeft = getManualThrottleRemaining(config.manual_throttle_seconds)

  if (inflight) {
    // A run is in flight, but it may have started *before* this edit's config
    // write — so it might not include the change. Arm a trailing run so the
    // edit still lands without waiting for the next 15-min poll.
    armTrailingRun(source, deps, cooldownLeft, allowWhenOff)
    return { ok: false, status: 'running' }
  }
  if (cooldownLeft > 0) {
    // Throttled — don't drop the request; arm one trailing run for when the
    // cooldown ends. A burst of edits coalesces into a single run.
    armTrailingRun(source, deps, cooldownLeft, allowWhenOff)
    return { ok: true, status: 'scheduled', scheduledInSeconds: cooldownLeft, ...only }
  }
  markManualTrigger()
  // An immediate run supersedes any pending trailing run.
  let allow = allowWhenOff
  const armed = trailing.get(trailingKey(deps))
  if (armed) {
    if (armed.timer) clearTimeout(armed.timer)
    trailing.delete(trailingKey(deps))
    allow = allow || armed.allowWhenOff
  }
  // Fire and forget — caller polls /status. Estimate is a hand-tuned
  // ~3s typical run; not load-bearing for correctness, only for UX.
  runOnce(source, deps, allow).catch((err) => {
    console.error(`${new Date().toLocaleString()}: [spotify-sync] manual run threw: ${(err as Error).message}`)
  })
  return { ok: true, status: 'queued', estimatedSeconds: 3, ...only }
}

/**
 * Arm a single trailing sync run for `delaySeconds` from now (idempotent —
 * a pending timer is left as-is so a burst of edits coalesces into one run).
 * When it fires it re-arms itself if a run is still in flight, so the edit
 * always gets a run that starts *after* it.
 */
function armTrailingRun(source: SyncTrigger, deps: RunSyncDeps, delaySeconds: number, allowWhenOff = false): void {
  const key = trailingKey(deps)
  const armed = trailing.get(key)
  // (one asked with allowWhenOff while another is armed for the same library: the armed one takes it on)
  if (armed) {
    armed.allowWhenOff ||= allowWhenOff
    return
  }
  const entry: Trailing = { timer: null, allowWhenOff }
  trailing.set(key, entry)
  const fire = (): void => {
    if (trailing.get(key) !== entry) return
    if (inflight) {
      // Current run still going — wait and retry so our edit gets a fresh run.
      entry.timer = setTimeout(fire, 5000)
      if (typeof entry.timer.unref === 'function') entry.timer.unref()
      return
    }
    trailing.delete(key)
    markManualTrigger()
    runOnce(source, deps, entry.allowWhenOff).catch((err) => {
      console.error(`${new Date().toLocaleString()}: [spotify-sync] trailing run threw: ${(err as Error).message}`)
    })
  }
  entry.timer = setTimeout(fire, Math.max(0, delaySeconds) * 1000 + 250)
  if (typeof entry.timer.unref === 'function') entry.timer.unref()
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
async function runOnce(trigger: SyncTrigger, deps: RunSyncDeps, allowWhenOff = false): Promise<RunSyncResult> {
  if (inflight) return inflight
  inflight = runSync(trigger, deps, { allowWhenOff }).finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * The users not in place whose interval is over: synced one after the other (one run at a time - a switch of the user
 * waits for it). Returns the seconds until the next of them is due, or null when none has Smart-Sync on.
 */
async function runOthersDue(now = Date.now): Promise<number | null> {
  let soonest: number | null = null
  const others = othersOf()
  for (const id of [...otherLastRun.keys()]) if (!others.some((o) => o.id === id)) otherLastRun.delete(id)
  for (const o of others) {
    const config = loadSpotifySyncConfig(o.deps.getMupiboxConfig())
    if (!config.enabled) continue
    const due = (otherLastRun.get(o.id) ?? 0) + config.polling_interval_seconds * 1000
    if (due <= now()) {
      if (inflight) await inflight.catch(() => undefined)
      otherLastRun.set(o.id, now())
      const result = await runOnce('cron', o.deps)
      // (Spotify asks the box to wait: the others wait as well)
      if (result.state === 'RATE_LIMITED') return result.retryAfterSeconds ?? config.polling_interval_seconds
    }
    const left = Math.ceil(((otherLastRun.get(o.id) ?? 0) + config.polling_interval_seconds * 1000 - now()) / 1000)
    soonest = soonest === null ? left : Math.min(soonest, left)
  }
  return soonest
}

/** The deps of a user not in place, or undefined (the one in place, or none such) */
export function otherSyncUser(id: string): RunSyncDeps | undefined {
  return othersOf().find((o) => o.id === id)?.deps
}

/** Stop the scheduler — only used in tests. */
export function stopScheduler(): void {
  if (timerHandle) {
    clearTimeout(timerHandle)
    timerHandle = null
  }
}
