export type PlaytimeDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type PlaytimeLimitsMinutes = Partial<Record<PlaytimeDayKey, number>>

export interface PlaytimeLimitConfig {
  enabled: boolean
  resetHour?: number
  maxOverrunMinutes?: number
  limitsMinutes?: PlaytimeLimitsMinutes
}

// 'normal'  → under daily limit, playback unrestricted
// 'grace'   → over limit, current track allowed to finish; new commands blocked
// 'blocked' → fully stopped, frontend overlays the screen
export type PlaytimePlayState = 'normal' | 'grace' | 'blocked'

export type PlaytimeStatus = PlaytimeStatusEnabled | PlaytimeStatusDisabled

export interface PlaytimeStatusDisabled {
  enabled: false
}

export interface PlaytimeStatusEnabled {
  enabled: true
  state: PlaytimePlayState
  date: string
  dayKey: PlaytimeDayKey
  limitMinutes: number
  usedSeconds: number
  remainingSeconds: number
  graceEndsInSeconds: number
  resetHour: number
}
