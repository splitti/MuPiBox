export interface CurrentSpotify {
  progress_ms?: number
  item?: {
    album?: {
      name?: string
      total_tracks?: number
    }
    show?: {
      name?: string
      total_episodes?: number
    }
    duration_ms?: number
    id?: string
    name?: string
    track_number?: number
  }
  currently_playing_type?: string
  is_playing?: boolean
}
