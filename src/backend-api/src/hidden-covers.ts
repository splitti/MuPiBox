import fs from 'node:fs'
import { writeFileWhole } from './json-file'
import { DATA_DIR } from './paths'

/**
 * Folders shown without a cover: chosen in the app ("Cover entfernen"). Nothing is deleted - the folder's pictures
 * (its own, one found in a subfolder, an online cover) stay where they are and are just not shown; choosing a cover
 * again, or "Cover wieder zeigen", takes the folder off the list.
 *
 * Keys: nas:/<NAS path> and local:<category>/<folder>[/…] (the library path), as the cover picker's targets.
 */

const FILE = `${DATA_DIR}/hidden-covers.json`

// (the same folder however the path is written: without empty or trailing parts)
export function hiddenCoverKey(type: 'nas' | 'local', folder: string): string {
  const parts = folder.split('/').filter(Boolean)
  return type === 'nas' ? `nas:/${parts.join('/')}` : `local:${parts.join('/')}`
}

// (read when first asked - and again after a switch of the user, whose list it is: users.ts)
let list: Set<string> | null = null
function hiddenSet(): Set<string> {
  if (list) return list
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    list = new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    list = new Set<string>()
  }
  return list
}

/** Whether the folder is to be shown without a cover. */
export function coverHidden(type: 'nas' | 'local', folder: string): boolean {
  const hidden = hiddenSet()
  return hidden.size > 0 && hidden.has(hiddenCoverKey(type, folder))
}

let writing: Promise<void> = Promise.resolve()

/** The list on the card (what is being written, done) - before a switch of the user moves the file */
export function hiddenCoversWritten(): Promise<void> {
  return writing.catch(() => undefined)
}

/** Read anew when next asked (another user's list is in place) */
export function forgetHiddenCovers(): void {
  list = null
}

/** Puts the folder on the list (hide) or takes it off; written at once (a rare choice of the parents). */
export function setCoverHidden(type: 'nas' | 'local', folder: string, hide: boolean): Promise<void> {
  const hidden = hiddenSet()
  const key = hiddenCoverKey(type, folder)
  if (hidden.has(key) === hide) return Promise.resolve()
  if (hide) hidden.add(key)
  else hidden.delete(key)
  const list = JSON.stringify([...hidden].sort(), null, 1)
  // (one write after the other; a failed one does not stop the next)
  writing = writing
    .catch(() => undefined)
    .then(async () => {
      await writeFileWhole(FILE, list)
    })
  return writing
}
