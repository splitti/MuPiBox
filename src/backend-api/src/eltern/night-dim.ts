// "Abends dunkler": the display dims in the evening - within a time window, and if so set also while quiet hours
// run - and has its normal brightness (mupibox.displayBrightness) again in the morning. Into the window it can dim
// gradually over some minutes. Checked every minute; the backlight is only written when its value changes.

import { promises as fsp } from 'node:fs'
import { execFile } from 'node:child_process'

export interface NightDim {
  enabled: boolean
  /** start and end of the window, "HH:MM" (over midnight: from > to) */
  from: string
  to: string
  /** brightness in the window, percent (never brighter than the normal one) */
  level: number
  /** minutes over which it dims at the start of the window (0: at once) */
  fade: number
  /** also while a quiet-hours window runs (bedtime, homework) */
  withQuiet: boolean
}

export const NIGHT_DIM_DEFAULT: NightDim = { enabled: false, from: '19:00', to: '07:00', level: 30, fade: 30, withQuiet: false }
export const NIGHT_DIM_FADES = [0, 15, 30, 60]
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** The setting as stored (mupibox.nightDim), completed with the defaults. */
export function nightDimOf(cfg: unknown): NightDim {
  const raw = ((cfg as { mupibox?: { nightDim?: unknown } } | undefined)?.mupibox?.nightDim ?? {}) as Partial<NightDim>
  const d = NIGHT_DIM_DEFAULT
  return {
    enabled: raw.enabled === true,
    from: typeof raw.from === 'string' && TIME.test(raw.from) ? raw.from : d.from,
    to: typeof raw.to === 'string' && TIME.test(raw.to) ? raw.to : d.to,
    level: Number.isInteger(raw.level) && (raw.level as number) >= 5 && (raw.level as number) <= 100 ? (raw.level as number) : d.level,
    fade: NIGHT_DIM_FADES.includes(raw.fade as number) ? (raw.fade as number) : d.fade,
    withQuiet: raw.withQuiet === true,
  }
}

/** A setting from the app, checked; null when something is not right. */
export function parseNightDim(body: unknown): NightDim | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.enabled !== 'boolean' || typeof b.withQuiet !== 'boolean') return null
  if (typeof b.from !== 'string' || !TIME.test(b.from) || typeof b.to !== 'string' || !TIME.test(b.to) || b.from === b.to) return null
  if (!Number.isInteger(b.level) || (b.level as number) < 5 || (b.level as number) > 100) return null
  if (!NIGHT_DIM_FADES.includes(b.fade as number)) return null
  return { enabled: b.enabled, from: b.from, to: b.to, level: b.level as number, fade: b.fade as number, withQuiet: b.withQuiet }
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** The brightness the display should have now (percent), and whether it is dimmed. */
export function nightBrightness(nd: NightDim, base: number, now: Date, quietNow: boolean): { value: number; dimmed: boolean } {
  if (!nd.enabled) return { value: base, dimmed: false }
  const level = Math.min(base, nd.level)
  const from = minutesOf(nd.from)
  const length = (minutesOf(nd.to) - from + 1440) % 1440
  const since = (now.getHours() * 60 + now.getMinutes() - from + 1440) % 1440
  if (since < length) {
    // (gradually at the start of the window)
    const share = nd.fade > 0 && since < nd.fade ? since / nd.fade : 1
    return { value: Math.round(base + (level - base) * share), dimmed: true }
  }
  if (nd.withQuiet && quietNow) return { value: level, dimmed: true }
  return { value: base, dimmed: false }
}

// whether a quiet-hours window runs now (the player's state, /tmp/playtime.json)
async function quietNow(): Promise<boolean> {
  try {
    const s = JSON.parse(await fsp.readFile('/tmp/playtime.json', 'utf8')) as { quiet?: { inWindow?: boolean } }
    return s.quiet?.inWindow === true
  } catch {
    return false
  }
}

let lastWritten: number | null = null
let dimmedNow = false

/** Whether the display is dimmed right now (for the app's page). */
export const nightDimmed = (): boolean => dimmedNow

/** Sets the backlight to what the setting says now (only when that changed, or when `force`). */
export async function applyNightDim(cfg: unknown, force = false): Promise<void> {
  const mb = (cfg as { mupibox?: { displayBrightness?: unknown } } | undefined)?.mupibox
  const base = typeof mb?.displayBrightness === 'number' ? mb.displayBrightness : 100
  const nd = nightDimOf(cfg)
  const { value, dimmed } = nightBrightness(nd, base, new Date(), nd.withQuiet ? await quietNow() : false)
  dimmedNow = dimmed
  // (nothing to do while it is off and was never dimmed here: the brightness is the app's own)
  if (!force && (value === lastWritten || (!nd.enabled && lastWritten === null))) return
  const dirs = await fsp.readdir('/sys/class/backlight').catch(() => [] as string[])
  for (const dir of dirs) {
    const max = Number.parseInt(await fsp.readFile(`/sys/class/backlight/${dir}/max_brightness`, 'utf8').catch(() => '255'), 10) || 255
    const raw = String(Math.max(1, Math.round((value / 100) * max)))
    await new Promise<void>((resolve) => execFile('sudo', ['sh', '-c', `echo ${raw} > /sys/class/backlight/${dir}/brightness`], { timeout: 5000 }, () => resolve()))
  }
  lastWritten = value
}

/** Every minute (from the start of the server). */
export function startNightDim(getConfig: () => unknown): void {
  const tick = () => void applyNightDim(getConfig()).catch(() => undefined)
  setTimeout(tick, 20_000)
  setInterval(tick, 60_000).unref()
}
