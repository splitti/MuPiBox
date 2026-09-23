export interface NasConfig {
  address?: string
  https?: boolean
  account?: string
  password?: string
  rememberMe?: boolean
  artistFolders?: string[]
  downloadFolders?: string[]
  hiddenFolders?: string[]
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
