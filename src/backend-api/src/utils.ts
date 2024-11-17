import { PathLike } from 'node:fs'
import { readFile } from 'node:fs/promises'

export const readJsonFile = async (filePath: PathLike): Promise<any> => {
  const file = await readFile(filePath, 'utf-8')
  return JSON.parse(file)
}
