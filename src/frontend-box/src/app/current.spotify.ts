export interface CurrentSpotify {
  progress_ms?: number
  item?: {
    album?: {
      name?: string
      total_tracks?: number
      images?: Array<{
        url?: string
        height?: number
        width?: number
      }>
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
  playlist?: {
    name?: string
    total_tracks?: number
    current_track_position?: number
  }
  show_details?: {
    name?: string
    total_episodes?: number
    current_episode_position?: number
  }
  audiobook?: {
    name?: string
    total_chapters?: number
    current_chapter_position?: number
  }
}
