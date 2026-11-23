// The photo display (5.1, see docs/fotoanzeige-5.1.md): its settings in mupiboxconfig.json under `photos`. Off by
// default - while off, nothing about photos shows in the app or on the display, the data stay on the box.
// Read with their defaults filled in (a box from before has no `photos` at all); written only through
// applyPhotoSettings, which takes nothing but the known fields in their ranges.

export type PhotoOrder = 'shuffle' | 'newest' | 'taken'
export type SlideshowSeconds = 8 | 5 | 3
export type PhotoLimitMode = 'separate' | 'shared'
export type PhotoDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const PHOTO_DAY_KEYS: PhotoDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export interface PhotoSettings {
  enabled: boolean
  /** an album opens as a slideshow, without the grid ("for the youngest") */
  startAsSlideshow: boolean
  slideshowSeconds: SlideshowSeconds
  order: PhotoOrder
  /** video clips in the albums (in the slideshow without sound); off: only pictures */
  showVideos: boolean
  screensaver: {
    enabled: boolean
    /** minutes without a touch before it starts (1-30) */
    afterMinutes: number
    /** also while something plays (else only in silence) */
    duringPlayback: boolean
  }
  /** "Bildzeit" (Spielzeit › Bildzeit): an account of its own, or counted on the listening time */
  limitMode: PhotoLimitMode
  /** the own account has a limit (off: the photos have no limit) */
  limitEnabled: boolean
  /** minutes per weekday of the own account */
  dailyMinutes: Record<PhotoDayKey, number>
  /** the display warns this many minutes before the end (0: no warning) */
  warnMinutes: 0 | 2 | 5 | 10
  /** the grid open and untouched: the time stops after this (0: never) */
  idlePauseSeconds: 0 | 60 | 120 | 300
}

export const PHOTO_DEFAULTS: PhotoSettings = {
  enabled: false,
  startAsSlideshow: false,
  slideshowSeconds: 5,
  order: 'shuffle',
  showVideos: false,
  screensaver: { enabled: false, afterMinutes: 5, duringPlayback: false },
  limitMode: 'separate',
  limitEnabled: true,
  dailyMinutes: { mon: 20, tue: 20, wed: 20, thu: 20, fri: 20, sat: 20, sun: 20 },
  warnMinutes: 5,
  idlePauseSeconds: 120,
}
const WARN = [0, 2, 5, 10] as const
const IDLE = [0, 60, 120, 300] as const
const dayMinutes = (v: unknown): number | null => {
  const m = Number(v)
  return v !== null && v !== '' && Number.isInteger(m) && m >= 0 && m <= 1440 ? m : null
}

const ORDERS: PhotoOrder[] = ['shuffle', 'newest', 'taken']
const SECONDS: SlideshowSeconds[] = [8, 5, 3]

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The settings of the configuration, every field filled in (unknown or broken values: the default). */
export function photoSettings(cfg: unknown): PhotoSettings {
  const p = obj(obj(cfg).photos)
  const s = obj(p.screensaver)
  const minutes = Number(s.afterMinutes)
  return {
    enabled: p.enabled === true,
    startAsSlideshow: p.startAsSlideshow === true,
    slideshowSeconds: SECONDS.includes(p.slideshowSeconds as SlideshowSeconds) ? (p.slideshowSeconds as SlideshowSeconds) : PHOTO_DEFAULTS.slideshowSeconds,
    order: ORDERS.includes(p.order as PhotoOrder) ? (p.order as PhotoOrder) : PHOTO_DEFAULTS.order,
    showVideos: p.showVideos === true,
    screensaver: {
      enabled: s.enabled === true,
      afterMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 30 ? minutes : PHOTO_DEFAULTS.screensaver.afterMinutes,
      duringPlayback: s.duringPlayback === true,
    },
    limitMode: p.limitMode === 'shared' ? 'shared' : 'separate',
    limitEnabled: p.limitEnabled !== false,
    dailyMinutes: Object.fromEntries(PHOTO_DAY_KEYS.map((d) => [d, dayMinutes(obj(p.dailyMinutes)[d]) ?? PHOTO_DEFAULTS.dailyMinutes[d]])) as Record<PhotoDayKey, number>,
    warnMinutes: (WARN as readonly number[]).includes(Number(p.warnMinutes)) ? (Number(p.warnMinutes) as PhotoSettings['warnMinutes']) : PHOTO_DEFAULTS.warnMinutes,
    idlePauseSeconds: (IDLE as readonly number[]).includes(Number(p.idlePauseSeconds)) ? (Number(p.idlePauseSeconds) as PhotoSettings['idlePauseSeconds']) : PHOTO_DEFAULTS.idlePauseSeconds,
  }
}

export type PhotoSettingsPatch = Partial<Omit<PhotoSettings, 'screensaver' | 'dailyMinutes'>> & {
  screensaver?: Partial<PhotoSettings['screensaver']>
  dailyMinutes?: Partial<PhotoSettings['dailyMinutes']>
}

/**
 * A change from the app, checked: every field must be one of its own values (a wrong one: the reason, nothing
 * written). Returns the error or null; on null `target` (the configuration's `photos`) holds the change.
 */
export function applyPhotoSettings(target: Record<string, unknown>, patch: unknown): string | null {
  const p = obj(patch)
  const bool = (v: unknown) => typeof v === 'boolean'
  const changes: Record<string, unknown> = {}
  for (const key of ['enabled', 'startAsSlideshow', 'showVideos', 'limitEnabled'] as const) {
    if (p[key] === undefined) continue
    if (!bool(p[key])) return `${key} must be true or false`
    changes[key] = p[key]
  }
  if (p.slideshowSeconds !== undefined) {
    if (!SECONDS.includes(p.slideshowSeconds as SlideshowSeconds)) return 'slideshowSeconds must be 8, 5 or 3'
    changes.slideshowSeconds = p.slideshowSeconds
  }
  if (p.order !== undefined) {
    if (!ORDERS.includes(p.order as PhotoOrder)) return 'order must be shuffle, newest or taken'
    changes.order = p.order
  }
  if (p.limitMode !== undefined) {
    if (p.limitMode !== 'separate' && p.limitMode !== 'shared') return 'limitMode must be separate or shared'
    changes.limitMode = p.limitMode
  }
  if (p.warnMinutes !== undefined) {
    if (!(WARN as readonly unknown[]).includes(p.warnMinutes)) return 'warnMinutes must be 0, 2, 5 or 10'
    changes.warnMinutes = p.warnMinutes
  }
  if (p.idlePauseSeconds !== undefined) {
    if (!(IDLE as readonly unknown[]).includes(p.idlePauseSeconds)) return 'idlePauseSeconds must be 0, 60, 120 or 300'
    changes.idlePauseSeconds = p.idlePauseSeconds
  }
  if (p.dailyMinutes !== undefined) {
    const d = obj(p.dailyMinutes)
    const days: Record<string, unknown> = { ...obj(target.dailyMinutes) }
    for (const [key, v] of Object.entries(d)) {
      if (!PHOTO_DAY_KEYS.includes(key as PhotoDayKey)) return `dailyMinutes.${key} is no weekday`
      const m = dayMinutes(v)
      if (m === null) return `dailyMinutes.${key} must be 0-1440`
      days[key] = m
    }
    changes.dailyMinutes = days
  }
  let screensaver: Record<string, unknown> | undefined
  if (p.screensaver !== undefined) {
    const s = obj(p.screensaver)
    screensaver = { ...obj(target.screensaver) }
    for (const key of ['enabled', 'duringPlayback'] as const) {
      if (s[key] === undefined) continue
      if (!bool(s[key])) return `screensaver.${key} must be true or false`
      screensaver[key] = s[key]
    }
    if (s.afterMinutes !== undefined) {
      const m = Number(s.afterMinutes)
      if (!Number.isInteger(m) || m < 1 || m > 30) return 'screensaver.afterMinutes must be 1-30'
      screensaver.afterMinutes = m
    }
  }
  Object.assign(target, changes)
  if (screensaver) target.screensaver = screensaver
  return null
}

/** The logical day as the player counts it (the listening time's reset hour: with 4, 2 o'clock is still yesterday) */
export function logicalDate(now: Date, resetHour: number): string {
  const shifted = new Date(now.getTime() - resetHour * 3600 * 1000)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`
}

export type PhotoTimeAction = 'extend' | 'free' | 'reset'

/**
 * A parent's action on today's photo time (Spielzeit › Bildzeit), into `photos.today` - the player reads it:
 * extend +minutes (adds up), free (no limit for the rest of the day), reset (today's count from 0 - a time, done
 * once; minutes added and "free" stay). Another day's entry is replaced. Returns the error or null.
 */
export function applyPhotoTimeAction(cfg: Record<string, unknown>, action: unknown, minutes: unknown, now = new Date()): string | null {
  if (action !== 'extend' && action !== 'free' && action !== 'reset') return 'action must be extend, free or reset'
  const resetHour = Number(obj(cfg.playtimeLimit).resetHour)
  const date = logicalDate(now, Number.isInteger(resetHour) && resetHour >= 0 && resetHour < 24 ? resetHour : 0)
  const photos = { ...obj(cfg.photos) }
  const old = obj(photos.today)
  const today: Record<string, unknown> = old.date === date ? { ...old } : { date }
  if (action === 'extend') {
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1 || m > 1440) return 'minutes must be 1-1440'
    const before = Number(today.bonusMinutes)
    today.bonusMinutes = Math.min(1440, (Number.isFinite(before) && before > 0 ? before : 0) + m)
  } else if (action === 'free') today.free = true
  // (only the count: minutes added and "free" stay)
  else today.reset = now.getTime()
  photos.today = today
  cfg.photos = photos
  return null
}
