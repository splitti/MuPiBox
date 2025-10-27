import { Data } from './data.model'

export type CategoryType = 'audiobook' | 'music' | 'other'

export enum Sorting {
  AlphabeticalAscending = 'AlphabeticalAscending',
  AlphabeticalDescending = 'AlphabeticalDescending',
  ReleaseDateAscending = 'ReleaseDateAscending',
  ReleaseDateDescending = 'ReleaseDateDescending',
}

/**
 * This represents a top-level folder on the box ui.
 */
export interface Folder {
  name: string
  category: CategoryType
  img?: string
  sorting?: Sorting
}

/**
 * A top-level folder on the box ui with its associated {@link Data} children.
 */
export interface FolderWithChildren extends Folder {
  children: Data[]
}
