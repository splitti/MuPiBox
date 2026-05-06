import type { PlaytimeLimitConfig, QuietHoursConfig } from './playtime.model'

export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  playtimeLimit?: PlaytimeLimitConfig
  quietHours?: QuietHoursConfig
  [key: string]: unknown
}
