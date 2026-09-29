export type PlaytimeDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type PlaytimePlayState = 'normal' | 'grace' | 'blocked'

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
