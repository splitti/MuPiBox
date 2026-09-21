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
  volume?: number
  // Radio streams and podcasts are buffered before they start: how far that is (0-100).
  loading?: boolean
  loadProgress?: number
}
