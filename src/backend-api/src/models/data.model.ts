import { CategoryType } from './folder.model'

export type SourceType = 'spotify' | 'library' | 'rss' | 'radio'

export interface BaseData {
  type: string
  // ============ The following three are values of the folder ================
  category: CategoryType
  // If no artist is given, the artist is tried to be taken from the source
  // (e.g., Spotify show name).
  artist?: string
  // This is the optional folder image url.
  artistcover?: string
}
