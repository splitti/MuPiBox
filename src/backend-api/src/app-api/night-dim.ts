// "Abends dunkler": the display dims in the evening - within a time window, and if so set also while quiet hours
// run - and has its normal brightness (mupibox.displayBrightness) again in the morning. Into the window it can dim
// gradually over some minutes. Checked every minute; the backlight is only written when its value changes.
// The window can start at sunset instead of a fixed time ("An Sonnenuntergang anpassen"): the sunset is worked out here from the
// place of the box (latitude and longitude the parents chose in the app) - no service is asked, so it works without internet.

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
  /** the window starts at sunset (at the place below) instead of at `from`; without a place `from` is used */
  sunset: boolean
  /** the place of the box, degrees (north and east are positive), and its name as the parents saw it */
  lat: number | null
  lon: number | null
  place: string
}

export const NIGHT_DIM_DEFAULT: NightDim = { enabled: false, from: '19:00', to: '07:00', level: 30, fade: 30, withQuiet: false, sunset: false, lat: null, lon: null, place: '' }
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
    sunset: raw.sunset === true,
    lat: validCoordinate(raw.lat, 90) ? (raw.lat as number) : null,
    lon: validCoordinate(raw.lon, 180) ? (raw.lon as number) : null,
    place: typeof raw.place === 'string' ? cleanPlace(raw.place) : '',
  }
}

const validCoordinate = (value: unknown, limit: number): boolean => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
// (a name for the page: no control characters, not too long)
const cleanPlace = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80)

/** A setting from the app, checked; null when something is not right. */
export function parseNightDim(body: unknown): NightDim | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.enabled !== 'boolean' || typeof b.withQuiet !== 'boolean') return null
  if (typeof b.from !== 'string' || !TIME.test(b.from) || typeof b.to !== 'string' || !TIME.test(b.to)) return null
  // (equal times are no window - but by the sun they are not used)
  if (b.from === b.to && b.sunset !== true) return null
  if (!Number.isInteger(b.level) || (b.level as number) < 5 || (b.level as number) > 100) return null
  if (!NIGHT_DIM_FADES.includes(b.fade as number)) return null
  // (the place: both coordinates or none; sunset needs them)
  const lat = b.lat === undefined || b.lat === null ? null : b.lat
  const lon = b.lon === undefined || b.lon === null ? null : b.lon
  if ((lat === null) !== (lon === null) || (lat !== null && (!validCoordinate(lat, 90) || !validCoordinate(lon, 180)))) return null
  const sunset = b.sunset === undefined ? false : b.sunset
  if (typeof sunset !== 'boolean' || (sunset && lat === null)) return null
  if (b.place !== undefined && typeof b.place !== 'string') return null
  return {
    enabled: b.enabled,
    from: b.from,
    to: b.to,
    level: b.level as number,
    fade: b.fade as number,
    withQuiet: b.withQuiet,
    sunset,
    lat: lat as number | null,
    lon: lon as number | null,
    place: typeof b.place === 'string' ? cleanPlace(b.place) : '',
  }
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * The sunset (or sunrise) of a day at a place, in minutes after UTC midnight of that day (may be over 1440 or below 0 far from Greenwich);
 * null when the sun does not set (rise) that day (polar day or night). The sunrise equation (Meeus' mean anomaly and equation of the centre,
 * -0.833 degrees for the refraction and the size of the sun), good to about two minutes - plenty for a lamp that dims.
 */
function sunEventUtcMinutes(lat: number, lon: number, year: number, month: number, day: number, rising: boolean): number | null {
  const rad = Math.PI / 180
  const julian = Date.UTC(year, month - 1, day, 12) / 86_400_000 + 2_440_587.5
  const n = Math.round(julian - 2_451_545.0)
  const meanNoon = n - lon / 360
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360
  const centre = 1.9148 * Math.sin(anomaly * rad) + 0.02 * Math.sin(2 * anomaly * rad) + 0.0003 * Math.sin(3 * anomaly * rad)
  const longitude = (anomaly + centre + 180 + 102.9372) % 360
  const transit = 2_451_545.0 + meanNoon + 0.0053 * Math.sin(anomaly * rad) - 0.0069 * Math.sin(2 * longitude * rad)
  const declination = Math.asin(Math.sin(longitude * rad) * Math.sin(23.4397 * rad))
  const cosHour = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(declination)) / (Math.cos(lat * rad) * Math.cos(declination))
  if (!(cosHour >= -1 && cosHour <= 1)) return null
  const event = transit + ((rising ? -1 : 1) * Math.acos(cosHour)) / (2 * Math.PI)
  const ms = (event - 2_440_587.5) * 86_400_000
  // (minutes since 00:00 UTC of the civil day the calculation was made for)
  return (ms - Date.UTC(year, month - 1, day)) / 60_000
}

export const sunsetUtcMinutes = (lat: number, lon: number, year: number, month: number, day: number) => sunEventUtcMinutes(lat, lon, year, month, day, false)
export const sunriseUtcMinutes = (lat: number, lon: number, year: number, month: number, day: number) => sunEventUtcMinutes(lat, lon, year, month, day, true)

/** The sunset of the day `date` falls on, as minutes of the local day (0..1439); null when there is none. */
export const sunsetMinutes = (lat: number, lon: number, date: Date): number | null => localMinutes(sunsetUtcMinutes, lat, lon, date)
/** The sunrise of the day `date` falls on, as minutes of the local day (0..1439); null when there is none. */
export const sunriseMinutes = (lat: number, lon: number, date: Date): number | null => localMinutes(sunriseUtcMinutes, lat, lon, date)

function localMinutes(utcOf: typeof sunsetUtcMinutes, lat: number, lon: number, date: Date): number | null {
  const utc = utcOf(lat, lon, date.getFullYear(), date.getMonth() + 1, date.getDate())
  if (utc === null) return null
  // (the zone of the box: what its clock says is local time)
  const local = Math.round(utc - new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTimezoneOffset())
  return ((local % 1440) + 1440) % 1440
}

const clock = (minutes: number | null) => (minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)

/** "HH:MM" of today's sunset at the place of the setting; null without a place, '' when the sun does not set today. */
export function sunsetLabel(nd: NightDim, now: Date): string | null {
  return nd.lat === null || nd.lon === null ? null : clock(sunsetMinutes(nd.lat, nd.lon, now))
}

/** "HH:MM" of today's sunrise at the place of the setting; null without a place, '' when the sun does not rise today. */
export function sunriseLabel(nd: NightDim, now: Date): string | null {
  return nd.lat === null || nd.lon === null ? null : clock(sunriseMinutes(nd.lat, nd.lon, now))
}

// the window today, in minutes of the day: from sunset to sunrise when the setting says so and has a place (and the sun both sets and
// rises today - not in polar day or night), else the fixed times
function windowOf(nd: NightDim, now: Date): { from: number; to: number } {
  if (nd.sunset && nd.lat !== null && nd.lon !== null) {
    const from = sunsetMinutes(nd.lat, nd.lon, now)
    const to = sunriseMinutes(nd.lat, nd.lon, now)
    if (from !== null && to !== null) return { from, to }
  }
  return { from: minutesOf(nd.from), to: minutesOf(nd.to) }
}

/** The brightness the display should have now (percent), and whether it is dimmed. */
export function nightBrightness(nd: NightDim, base: number, now: Date, quietNow: boolean): { value: number; dimmed: boolean } {
  if (!nd.enabled) return { value: base, dimmed: false }
  const level = Math.min(base, nd.level)
  const { from, to } = windowOf(nd, now)
  const length = (to - from + 1440) % 1440
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
