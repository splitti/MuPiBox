// A saved selection of the NAS tab ("Show", "Hide", "Download local"), bound to the NAS login it was made with.
export interface NasProfile {
  created: number
  address: string
  account: string
  artistFolders: string[]
  hiddenFolders: string[]
  downloadFolders: string[]
}

export interface NasConfig {
  address?: string
  https?: boolean
  account?: string
  password?: string
  rememberMe?: boolean
  artistFolders?: string[]
  downloadFolders?: string[]
  hiddenFolders?: string[]
  profiles?: Record<string, NasProfile>
  activeProfile?: string
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
  [key: string]: unknown
}
