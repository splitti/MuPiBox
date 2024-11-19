import { PathLike } from 'node:fs'
import { readFile } from 'node:fs/promises'

/**
 * Reads a file from disk and parses it as JSON.
 * 
 * @param filePath - The path of the JSON file.
 * @returns - A promise of the JSON data.
 */
export const readJsonFile = async (filePath: PathLike): Promise<any> => {
  const file = await readFile(filePath, 'utf-8')
  return JSON.parse(file)
}

/**
 * Splits a given list into chunks of given size.
 * 
 * @param array - The list that should be split into chunks.
 * @param chunkSize - The maximum number of elements in each chunk.
 */
export function* chunks<T>(array: T[], chunkSize: number): Generator<T[], void> {
  for (let i = 0; i < array.length; i += chunkSize) {
    yield array.slice(i, i + chunkSize)
  }
}
