export type PlaytimeDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type PlaytimeStatus = PlaytimeStatusEnabled | PlaytimeStatusDisabled

export interface PlaytimeStatusDisabled {
  enabled: false
}

export interface PlaytimeStatusEnabled {
  enabled: true
  date: string
  dayKey: PlaytimeDayKey
  limitMinutes: number
  usedSeconds: number
  remainingSeconds: number
  blocked: boolean
  resetHour: number
}
