import { BaseData } from './data.model'

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
 * This extends {@link Folder} with information how many (offline) child entries this folder
 * has. Note that this counts the entries from the data.json, in the box ui, more cards might
 * be shown since a single entry can result in multiple cards (e.g., for spotify albums).
 * We use these provided numbers to show/hide entries on the box ui depending if there
 * is a internet connection.
 */
export interface FolderWithNumChildren extends Folder {
  numChildEntries: number
  numOfflineChildEntries: number
}

/**
 * TODO
 */
export interface FolderWithChildren extends Folder {
  children: BaseData[]
}
