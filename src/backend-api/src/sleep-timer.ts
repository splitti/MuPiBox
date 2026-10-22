import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'

/**
 * The box's power-off timer ("Schlaftimer") for the app's server: one per box, kept by scripts/mupibox/sleep_timer.sh
 * (the countdown runs as the systemd unit mupi-sleep-timer, its deadline in /run/mupibox/sleep_timer.json). The app,
 * Home Assistant (API v1 /sleep_timer and /state), the old admin interface and Telegram all go through that script,
 * so each of them sees and changes the same countdown.
 *
 * Reading needs no root: the state file is readable by all, and whether the countdown runs is asked with
 * "systemctl is-active" - a file that is there alone says nothing (it stayed behind when a countdown ended before).
 * Starting and stopping go through the script with sudo; it answers only once the old countdown has ended.
 */

export interface SleepTimerState {
  active: boolean
  /** the deadline as RFC 3339 with the box's time zone ("2026-10-17T00:45:00+02:00"), null without a timer */
  ends_at: string | null
  /** seconds to the deadline, rounded up; 0 without a timer (and at the deadline, while the box shuts down) */
  remaining_s: number
  /** true once the countdown ran out and began the shutdown: then it can no longer be stopped */
  shutting_down: boolean
}

export class SleepTimerError extends Error {
  constructor(
    /** shutting_down: the box shuts down already (nothing changed); unavailable: the timer could not be changed */
    readonly code: 'shutting_down' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

export const SLEEP_TIMER_SCRIPT = '/usr/local/bin/mupibox/sleep_timer.sh'
const STATE_FILE = '/run/mupibox/sleep_timer.json'
const UNIT = 'mupi-sleep-timer'
/** the longest timer the box's own pages offer (24 h); the Home Assistant API allows up to 720 minutes */
export const SLEEP_TIMER_MAX_MINUTES = 1440

const INACTIVE: SleepTimerState = { active: false, ends_at: null, remaining_s: 0, shutting_down: false }

interface Io {
  readState: () => Promise<string>
  unitActive: () => Promise<boolean>
  runScript: (args: string[]) => Promise<{ code: number; stdout: string }>
  now: () => number
}

const realIo: Io = {
  readState: () => fsp.readFile(STATE_FILE, 'utf8'),
  unitActive: () =>
    new Promise((resolve) => {
      execFile('systemctl', ['is-active', UNIT], { timeout: 5000 }, (_err, stdout) => resolve(/^(active|activating|reloading)\s*$/.test(String(stdout ?? ''))))
    }),
  runScript: (args) =>
    new Promise((resolve) => {
      // (only validated integers and fixed words as arguments - no shell)
      execFile('sudo', [SLEEP_TIMER_SCRIPT, ...args], { timeout: 120_000 }, (err, stdout) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 99) : 0
        resolve({ code, stdout: String(stdout ?? '') })
      })
    }),
  now: () => Date.now(),
}
let io: Io = realIo

/** For tests: replaces what is read and run (undefined: back to the box) */
export function setSleepTimerIo(replacement: Partial<Io> | undefined): void {
  io = replacement ? { ...realIo, ...replacement } : realIo
}

/** "2026-10-17T00:45:00+02:00" - the box's local time with its offset */
export function rfc3339Local(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  )
}

/** The state from the kept file and whether its countdown runs */
export async function sleepTimerState(): Promise<SleepTimerState> {
  let kept: { deadline?: unknown; phase?: unknown }
  try {
    kept = JSON.parse(await io.readState()) as { deadline?: unknown; phase?: unknown }
  } catch {
    return { ...INACTIVE }
  }
  const deadline = Number(kept.deadline)
  if (!Number.isInteger(deadline) || deadline <= 0) return { ...INACTIVE }
  const shuttingDown = kept.phase === 'shutdown'
  // (a deadline whose countdown no longer runs - ended without the script, e.g. killed: no timer)
  if (!shuttingDown && !(await io.unitActive())) return { ...INACTIVE }
  return {
    active: true,
    ends_at: rfc3339Local(deadline),
    remaining_s: Math.max(0, Math.ceil((deadline * 1000 - io.now()) / 1000)),
    shutting_down: shuttingDown,
  }
}

// one change at a time from this server (the script takes its own lock as well, for the other callers)
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

async function change(args: string[], what: string): Promise<SleepTimerState> {
  const r = await io.runScript(args)
  if (r.code === 3) throw new SleepTimerError('shutting_down', 'The timer ran out - the box is shutting down')
  if (r.code !== 0) throw new SleepTimerError('unavailable', `The timer could not be ${what} (${r.code})`)
  // the state as it is now (read again: the script's answer is only what it saw)
  return sleepTimerState()
}

/** Starts the timer, a running one is replaced - once this resolves the old one can no longer switch the box off */
export function startSleepTimer(seconds: number): Promise<SleepTimerState> {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > SLEEP_TIMER_MAX_MINUTES * 60) {
    return Promise.reject(new RangeError(`seconds must be an integer from 1 to ${SLEEP_TIMER_MAX_MINUTES * 60}`))
  }
  return serial(() => change(['start', String(seconds)], 'started'))
}

/** Stops the timer - also when none runs */
export function stopSleepTimer(): Promise<SleepTimerState> {
  return serial(() => change(['stop'], 'stopped'))
}

// ---- Home Assistant API v1 (contract: splitti/MuPiBox-homeassistant docs/classic-api-contract.md, sleep timer) ----

/** The longest timer the shared Home Assistant contract allows */
export const HA_SLEEP_TIMER_MAX_MINUTES = 720

/** The object of the contract: no more and no less than these three fields */
export function haSleepTimer(t: SleepTimerState): { active: boolean; ends_at: string | null; remaining_s: number } {
  return t.active ? { active: true, ends_at: t.ends_at, remaining_s: t.remaining_s } : { active: false, ends_at: null, remaining_s: 0 }
}

/**
 * The body of POST /sleep_timer as the contract wants it: Content-Type application/json, an object with the one field
 * "minutes", a JSON integer 0..720 (0 stops). Type failures (missing, null, text, a fraction, other fields, no object)
 * are invalid_request, an integer out of range invalid_value.
 */
export function parseHaSleepTimerRequest(
  isJson: boolean,
  body: unknown,
): { ok: true; minutes: number } | { ok: false; error: 'invalid_request' | 'invalid_value'; message: string } {
  if (!isJson) return { ok: false, error: 'invalid_request', message: 'Content-Type must be application/json' }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_request', message: 'The body must be a JSON object' }
  const keys = Object.keys(body)
  if (keys.some((k) => k !== 'minutes')) return { ok: false, error: 'invalid_request', message: 'Only the field "minutes" is allowed' }
  const minutes = (body as { minutes?: unknown }).minutes
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return { ok: false, error: 'invalid_request', message: 'minutes must be a JSON integer' }
  if (minutes < 0 || minutes > HA_SLEEP_TIMER_MAX_MINUTES) return { ok: false, error: 'invalid_value', message: `minutes must be from 0 to ${HA_SLEEP_TIMER_MAX_MINUTES}` }
  return { ok: true, minutes }
}

// Whether this box has the shared timer (the script of this version and systemd-run) - only then Home Assistant is told
// the capability "sleep_timer" (asked again after 5 minutes: an update in between)
let availableAt = 0
let available = false
export async function sleepTimerAvailable(): Promise<boolean> {
  if (Date.now() - availableAt < 5 * 60_000) return available
  availableAt = Date.now()
  try {
    const [script] = await Promise.all([fsp.readFile(SLEEP_TIMER_SCRIPT, 'utf8'), fsp.access('/usr/bin/systemd-run')])
    available = script.includes('systemd-run') && script.includes('sleep_timer.json')
  } catch {
    available = false
  }
  return available
}
