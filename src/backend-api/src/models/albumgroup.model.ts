export type CategoryType = 'audiobook' | 'music' | 'other'
export type SourceType = 'spotifyQuery' | 'spotifyUrl' | 'rss' | 'local' | 'stream'

export interface AlbumGroup {
  name: string
  img: string
  category: CategoryType
  sourceType: SourceType
}
