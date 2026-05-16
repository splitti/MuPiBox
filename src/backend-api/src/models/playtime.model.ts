export type PlaytimeDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type PlaytimeLimitsMinutes = Partial<Record<PlaytimeDayKey, number>>

export interface PlaytimeLimitConfig {
  enabled: boolean
  resetHour?: number
  maxOverrunMinutes?: number
  limitsMinutes?: PlaytimeLimitsMinutes
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
// 'playtime' = daily-limit-based, 'quiet' = time-window-based.
export type PlaybackBlockSource = 'playtime' | 'quiet'

export type PlaytimeStatus = PlaytimeStatusEnabled | PlaytimeStatusDisabled

export interface PlaytimeStatusDisabled {
  enabled: false
}

export interface PlaytimeStatusEnabled {
  enabled: true
  state: PlaytimePlayState
  blockSource: PlaybackBlockSource | null
  // Set when blockSource === 'quiet' and the active window has a label.
  quietLabel?: string
  date: string
  dayKey: PlaytimeDayKey
  limitMinutes: number
  usedSeconds: number
  remainingSeconds: number
  graceEndsInSeconds: number
  resetHour: number
}
