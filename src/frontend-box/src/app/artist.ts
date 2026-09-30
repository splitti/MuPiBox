import type { Media } from './media'

export interface Artist {
  name: string
  albumCount: string
  cover: string
  coverMedia: Media
  // A podcast with a new episode (a dot on its tile)
  hasNew?: boolean
}
