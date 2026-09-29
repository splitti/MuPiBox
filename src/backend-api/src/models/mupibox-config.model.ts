import type { PlaybackOverrideConfig, PlaytimeLimitConfig, QuietHoursConfig } from './playtime.model'

// A saved selection of the NAS tab ("Show", "Hide", "Download local"), bound to the NAS login it was made with.
export interface NasProfile {
  created: number
  address: string
  account: string
  artistFolders: string[]
  hiddenFolders: string[]
  downloadFolders: string[]
  folderCategories?: Record<string, NasBoxCategory>
  folderSplit?: string[]
}

/** A category tab of the box a shown NAS folder can be put into (instead of the NAS tab). */
export type NasBoxCategory = 'audiobook' | 'music' | 'other'

export interface NasConfig {
  address?: string
  https?: boolean
  account?: string
  password?: string
  rememberMe?: boolean
  artistFolders?: string[]
  downloadFolders?: string[]
  hiddenFolders?: string[]
  // Shown folders ("Show") that appear in a category tab of the box (Hörspiele, Musik, Sonstiges) instead of the NAS
  // tab; folderSplit: of those, the ones whose subfolders appear one by one (a collection of series: each series is
  // a tile of its own, its episodes inside) - else the folder is one tile.
  folderCategories?: Record<string, NasBoxCategory>
  folderSplit?: string[]
  profiles?: Record<string, NasProfile>
  activeProfile?: string
  // SHA-256 fingerprint of the NAS certificate confirmed in the admin interface (https with a self-signed one)
  certFingerprint?: string
  [key: string]: unknown
}

export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  nas?: NasConfig
  // Old name of "nas" (config files written before the rename). Read as a fallback, never written.
  synology?: NasConfig
  playtimeLimit?: PlaytimeLimitConfig
  quietHours?: QuietHoursConfig
  playbackOverride?: PlaybackOverrideConfig
  [key: string]: unknown
}
