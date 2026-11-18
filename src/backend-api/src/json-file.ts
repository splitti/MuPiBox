import fs from 'node:fs'
import { promises as fsp } from 'node:fs'

// A file of the box's data (the library, the resume list, what was heard, the photos' list ...) written the same way
// everywhere: next to it, onto the card (fsync), then renamed over it - a power cut (a box on battery) or a crash leaves
// the old file or the new one, never half of one. And only when its content changed: the SD card wears with every
// write, and many of these were written again with what they held already.
//
// Each writer did this on its own before - some without fsync (after a power cut the renamed file could be empty), some
// with one fixed temporary name (two writes at once wrote into each other's file).

export interface WriteOptions {
  /** compare with the file first and leave it as it is when it holds the same (default: true) */
  ifChanged?: boolean
  /** the file's mode (default: what the process makes) */
  mode?: number
}

let seq = 0
const tmpOf = (file: string): string => `${file}.tmp.${process.pid}.${++seq}`

/** Written (true) or left as it was, holding the same already (false) */
export async function writeFileWhole(file: string, text: string, { ifChanged = true, mode }: WriteOptions = {}): Promise<boolean> {
  if (ifChanged) {
    const before = await fsp.readFile(file, 'utf8').catch(() => null)
    if (before === text) return false
  }
  const tmp = tmpOf(file)
  try {
    const fh = await fsp.open(tmp, 'w', mode)
    try {
      await fh.writeFile(text)
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fsp.rename(tmp, file)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
  return true
}

/** The same, synchronous: for writers that must not let another caller in between (the library's lock) */
export function writeFileWholeSync(file: string, text: string, { ifChanged = true, mode }: WriteOptions = {}): boolean {
  if (ifChanged) {
    let before: string | null = null
    try {
      before = fs.readFileSync(file, 'utf8')
    } catch {
      // none yet
    }
    if (before === text) return false
  }
  const tmp = tmpOf(file)
  try {
    const fd = fs.openSync(tmp, 'w', mode)
    try {
      fs.writeFileSync(fd, text)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmp, file)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
  return true
}

/**
 * The temporary files a power cut left in a folder ("<file>.tmp.<pid>.<n>" of these writers) - at the server's start,
 * when none of its writes runs. Those of the scripts ("<file>.tmp.<pid>") are theirs.
 */
export async function sweepTempFiles(dir: string): Promise<void> {
  for (const f of await fsp.readdir(dir).catch(() => [] as string[])) {
    if (/\.tmp\.\d+\.\d+$/.test(f)) await fsp.rm(`${dir}/${f}`, { force: true }).catch(() => undefined)
  }
}

/** JSON of `value` (spaces: as JSON.stringify), written as above */
export function writeJson(file: string, value: unknown, { spaces, ...options }: WriteOptions & { spaces?: number } = {}): Promise<boolean> {
  return writeFileWhole(file, JSON.stringify(value, null, spaces), options)
}

export function writeJsonSync(file: string, value: unknown, { spaces, ...options }: WriteOptions & { spaces?: number } = {}): boolean {
  return writeFileWholeSync(file, JSON.stringify(value, null, spaces), options)
}
