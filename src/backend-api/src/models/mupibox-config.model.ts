export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  synology?: {
    address?: string
    https?: boolean
    account?: string
    password?: string
    rememberMe?: boolean
    artistFolders?: string[]
    downloadFolders?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}
