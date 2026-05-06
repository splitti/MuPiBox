export type PlaytimeDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type PlaytimeLimitsMinutes = Partial<Record<PlaytimeDayKey, number>>

export interface PlaytimeBonus {
  date: string // YYYY-MM-DD; only honored if matches today's logical day
  minutes: number
}

export interface PlaytimeLimitConfig {
  enabled: boolean
  resetHour?: number
  maxOverrunMinutes?: number
  limitsMinutes?: PlaytimeLimitsMinutes
  todayBonus?: PlaytimeBonus
}

export interface PlaybackOverrideConfig {
  allowUntil?: number // epoch ms; while now < this, all blocks are bypassed
  forceBlockUntil?: number // epoch ms; while now < this, playback is forced-blocked
}

// === Quiet Hours ===

export interface QuietHoursWindow {
  from: string // HH:MM
  to: string // HH:MM, may be < from to span midnight
  label?: string
}

export type QuietHoursSchedule = Partial<Record<PlaytimeDayKey, QuietHoursWindow[]>>

export interface QuietHoursConfig {
  enabled: boolean
  maxOverrunMinutes?: number
  schedule?: QuietHoursSchedule
}

// === Combined playback status ===

// 'normal'  → no restriction, playback unrestricted
// 'grace'   → over a limit (playtime or quiet entry), current track allowed to finish
// 'blocked' → fully stopped, frontend overlays the screen
export type PlaytimePlayState = 'normal' | 'grace' | 'blocked'

// Identifies *what* is currently restricting playback (when state !== 'normal').
// 'playtime' = daily-limit-based, 'quiet' = time-window-based, 'override' = parent
// triggered an explicit force-block (e.g. via Telegram /quietnow).
export type PlaybackBlockSource = 'playtime' | 'quiet' | 'override'

export type PlaytimeStatus = PlaytimeStatusActive | PlaytimeStatusDisabled

export interface PlaytimeStatusDisabled {
  enabled: false
}

export interface PlaytimeSubStatus {
  enabled: boolean
  state: PlaytimePlayState
  date: string
  dayKey: PlaytimeDayKey
  limitMinutes: number
  usedSeconds: number
  remainingSeconds: number
  graceEndsInSeconds: number
  resetHour: number
}

export interface QuietHoursSubStatus {
  enabled: boolean
  state: PlaytimePlayState
  inWindow: boolean
  label?: string
  graceEndsInSeconds: number
}

export interface PlaytimeStatusActive {
  enabled: true
  state: PlaytimePlayState
  blockSource: PlaybackBlockSource | null
  playtime: PlaytimeSubStatus
  quiet: QuietHoursSubStatus
  override?: {
    allowUntil: number
    forceBlockUntil: number
  }
}
