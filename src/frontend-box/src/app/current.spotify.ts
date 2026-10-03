export interface CurrentSpotify {
  // what the SDK plays in: spotify:album:<id>, spotify:playlist:<id>, spotify:show:<id>
  context_uri?: string
  // whether the track belongs to that album or playlist - false once Spotify's autoplay went on with other tracks
  // after its end (the context stays the same then); undefined when not known (list of tracks not complete)
  in_context?: boolean
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
