export interface MupiboxConfig {
  spotify?: {
    disableScraperForPlaylists?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}
