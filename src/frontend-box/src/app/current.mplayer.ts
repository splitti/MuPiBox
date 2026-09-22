export interface CurrentMPlayer {
  activePlaylist?: string
  totalPlaylist?: number
  activeEpisode?: string
  activeShow?: string
  totalShows?: number
  currentPlayer?: string
  playing?: boolean
  pause?: boolean
  album?: string
  currentTrackname?: string
  currentTracknr?: number
  totalTracks?: number
  progressTime?: number
  /** Position and length of the running track in seconds (local player only). */
  timePos?: number
  length?: number
  volume?: number
}
