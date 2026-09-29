import fs from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'

/**
 * Folders shown without a cover: chosen in the app ("Cover entfernen"). Nothing is deleted - the folder's pictures
 * (its own, one found in a subfolder, an online cover) stay where they are and are just not shown; choosing a cover
 * again, or "Cover wieder zeigen", takes the folder off the list.
 *
 * Keys: nas:/<NAS path> and local:<category>/<folder>[/…] (the library path), as the cover picker's targets.
 */

const FILE = '/home/dietpi/.mupibox/hidden-covers.json'

// (the same folder however the path is written: without empty or trailing parts)
export function hiddenCoverKey(type: 'nas' | 'local', folder: string): string {
  const parts = folder.split('/').filter(Boolean)
  return type === 'nas' ? `nas:/${parts.join('/')}` : `local:${parts.join('/')}`
}

const hidden: Set<string> = (() => {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set<string>()
  }
})()

/** Whether the folder is to be shown without a cover. */
export function coverHidden(type: 'nas' | 'local', folder: string): boolean {
  return hidden.size > 0 && hidden.has(hiddenCoverKey(type, folder))
}

let writing: Promise<void> = Promise.resolve()

/** Puts the folder on the list (hide) or takes it off; written at once (a rare choice of the parents). */
export function setCoverHidden(type: 'nas' | 'local', folder: string, hide: boolean): Promise<void> {
  const key = hiddenCoverKey(type, folder)
  if (hidden.has(key) === hide) return Promise.resolve()
  if (hide) hidden.add(key)
  else hidden.delete(key)
  const list = JSON.stringify([...hidden].sort(), null, 1)
  // (one write after the other; a failed one does not stop the next)
  writing = writing
    .catch(() => undefined)
    .then(async () => {
      const tmp = `${FILE}.tmp`
      await writeFile(tmp, list)
      await rename(tmp, FILE)
    })
  return writing
}
