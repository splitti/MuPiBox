import fs from 'node:fs'
import { randomBytes } from 'node:crypto'

// The lock files the library and the resume list share with the shell scripts (/tmp/.data.lock, /tmp/.resume.lock):
// created with O_EXCL; the scripts write them empty (set -C) and the media scan touches its lock every 10 s.
//
// A lock was taken over by its age alone (older than 30 s = left over from a crash), so a slow write still holding it
// ran side by side with the next one, and the release unlinked whatever lock stood there - also somebody else's.
// Now the backend writes "<pid> <token>" into its locks, touches them every 10 s while it holds them, removes only its
// own, and takes one over only when its holder is gone: the process no longer runs, or (an empty lock of a script) it
// was not touched for 30 s.
const STALE_MS = 30_000
const OWNED_STALE_MS = 10 * 60_000 // a living pid whose lock is not touched any more: a reused pid, not a holder
const REFRESH_MS = 10_000

const held = new Map<string, { token: string; timer: NodeJS.Timeout }>()

function isAlive(pid: number): boolean {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// Why a lock that stands there may be taken over; null = it may not
export function staleReason(lockPath: string): string | null {
  let stat: fs.Stats
  let content = ''
  try {
    stat = fs.statSync(lockPath)
    content = fs.readFileSync(lockPath, 'utf8').trim()
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'gone' : null
  }
  const ageMs = Date.now() - stat.mtimeMs
  const pid = Number(/^(\d+) \S+$/.exec(content)?.[1])
  if (pid > 0) {
    if (held.has(lockPath) && held.get(lockPath)?.token === content.split(' ')[1]) return null
    if (pid === process.pid) return `left by this process (${content})` // its token is not held any more
    if (!isAlive(pid)) return `holder pid ${pid} ended`
    return ageMs > OWNED_STALE_MS ? `holder pid ${pid} did not touch it for ${Math.round(ageMs / 1000)}s` : null
  }
  return ageMs > STALE_MS ? `untouched for ${Math.round(ageMs / 1000)}s` : null
}

function tryCreate(lockPath: string): 'acquired' {
  const token = randomBytes(8).toString('hex')
  const fd = fs.openSync(lockPath, 'wx') // throws EEXIST
  try {
    fs.writeSync(fd, `${process.pid} ${token}\n`)
  } finally {
    fs.closeSync(fd)
  }
  const timer = setInterval(() => {
    const now = new Date()
    try {
      if (fs.readFileSync(lockPath, 'utf8').trim() === `${process.pid} ${token}`) fs.utimesSync(lockPath, now, now)
    } catch {
      // gone: the release below stops this
    }
  }, REFRESH_MS)
  timer.unref()
  held.set(lockPath, { token, timer })
  return 'acquired'
}

// Synchronous on purpose: check, take over and create happen without another caller of this process in between.
export function acquireLock(lockPath: string, context: string): 'acquired' | 'locked' | 'error' {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return tryCreate(lockPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} failed to acquire lock:`, err)
        return 'error'
      }
    }
    if (attempt === 1) break
    const reason = staleReason(lockPath)
    if (!reason) return 'locked'
    if (reason !== 'gone') {
      console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} taking over lock ${lockPath}: ${reason}`)
      try {
        fs.unlinkSync(lockPath)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} stale-lock unlink failed:`, err)
          return 'error'
        }
      }
    }
  }
  return 'locked'
}

// Removes the lock only while it is still the one this process took
export function releaseLock(lockPath: string, context: string): void {
  const mine = held.get(lockPath)
  if (!mine) return
  held.delete(lockPath)
  clearInterval(mine.timer)
  try {
    if (fs.readFileSync(lockPath, 'utf8').trim() !== `${process.pid} ${mine.token}`) {
      console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} - lock ${lockPath} not ours any more, left alone`)
      return
    }
    fs.unlinkSync(lockPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} - failed to unlink lock:`, err)
    }
  }
}

// Waits up to ~10 s for the lock, runs the work while holding it
export async function withLock<T>(lockPath: string, context: string, work: () => Promise<T>): Promise<T | 'locked'> {
  for (let i = 0; i < 40; i++) {
    const got = acquireLock(lockPath, context)
    if (got === 'error') throw new Error(`lock ${lockPath} could not be taken`)
    if (got === 'acquired') {
      try {
        return await work()
      } finally {
        releaseLock(lockPath, context)
      }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return 'locked'
}
