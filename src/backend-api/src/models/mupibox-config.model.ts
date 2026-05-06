import type { PlaytimeLimitConfig } from './playtime.model'

export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  playtimeLimit?: PlaytimeLimitConfig
  [key: string]: unknown
}
