import type { PlaybackOverrideConfig, PlaytimeLimitConfig, QuietHoursConfig } from './playtime.model'

export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  playtimeLimit?: PlaytimeLimitConfig
  quietHours?: QuietHoursConfig
  playbackOverride?: PlaybackOverrideConfig
  [key: string]: unknown
}
