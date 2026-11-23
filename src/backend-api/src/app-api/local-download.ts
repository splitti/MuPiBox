// Getting content of the SD card / USB stick back from the box (wish of hyperbit): a track as it lies on the card, an
// album or a whole folder as a ZIP. The ZIP is made while it is downloaded - zip stores the files without compressing
// them (MP3s hardly get smaller), so the Pi hardly computes and needs no room for a file in between; the folder
// structure stays in it, covers too. Only with the app's login and only inside the media folders (as upload.ts:
// a symbolic link on the way out of them does not count).

import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import type { Request, Response, Router } from 'express'
import { requireSession } from './middleware'
import { AUDIO_EXTENSIONS, type LocalLibraryDeps, reallyInside } from './upload'

// a folder listed for its size goes this deep and counts this many files at most (a wrong path at the top of a category)
const MAX_DEPTH = 8
const MAX_FILES = 20000

interface Summary {
  files: number
  audio: number
  bytes: number
}

/** The path of a folder or file of the media (category/artist/album/...), checked: undefined when it is none. */
async function resolve(deps: LocalLibraryDeps, raw: string, kind: 'dir' | 'file'): Promise<string | undefined> {
  const parts = raw.split('/').filter(Boolean)
  if (parts.length < 2 || !deps.categories.includes(parts[0]) || parts.some((p) => p === '.' || p === '..' || p.includes('\\'))) return undefined
  const categoryDir = path.join(deps.root, parts[0])
  const target = path.join(deps.root, ...parts)
  if (!target.startsWith(categoryDir + path.sep)) return undefined
  const st = await fsp.lstat(target).catch(() => undefined)
  if (!st || (kind === 'dir' ? !st.isDirectory() : !st.isFile())) return undefined
  if (!(await reallyInside(target, categoryDir, deps.root))) return undefined
  return target
}

const isAudio = (name: string) => AUDIO_EXTENSIONS.includes(path.extname(name).toLowerCase())

/** How many files (and of them tracks) a folder holds and how large they are, its subfolders included. */
async function summarize(dir: string, depth = 0, acc: Summary = { files: 0, audio: 0, bytes: 0 }): Promise<Summary> {
  if (depth > MAX_DEPTH || acc.files >= MAX_FILES) return acc
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await summarize(full, depth + 1, acc)
    else if (e.isFile()) {
      const st = await fsp.stat(full).catch(() => undefined)
      if (!st) continue
      acc.files++
      acc.bytes += st.size
      if (isAudio(e.name)) acc.audio++
      if (acc.files >= MAX_FILES) break
    }
  }
  return acc
}

const query = (req: Request, key: string) => (typeof req.query[key] === 'string' ? (req.query[key] as string) : '')

// a file name for Content-Disposition: plain ASCII as the fallback, the real one as filename* (RFC 5987)
function attachment(res: Response, name: string): void {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`)
}

export function registerLocalDownloadRoutes(router: Router, deps: LocalLibraryDeps): void {
  /**
   * GET /api/app/local/info?path=<category/artist/album>
   * A folder of the media for its download: all its files (subfolders included) and their size, the tracks right in
   * it (name, path, size) and per subfolder the same sums.
   */
  router.get('/local/info', requireSession, async (req, res) => {
    const dir = await resolve(deps, query(req, 'path'), 'dir')
    if (!dir) {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    const rel = query(req, 'path').split('/').filter(Boolean).join('/')
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    const tracks: { name: string; path: string; size: number }[] = []
    const children: Record<string, Summary> = {}
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) {
      if (e.name.startsWith('.')) continue
      if (e.isFile() && isAudio(e.name)) {
        const st = await fsp.stat(path.join(dir, e.name)).catch(() => undefined)
        if (st) tracks.push({ name: e.name, path: `${rel}/${e.name}`, size: st.size })
      } else if (e.isDirectory()) {
        children[e.name] = await summarize(path.join(dir, e.name))
      }
    }
    res.json({ ...(await summarize(dir)), tracks, children })
  })

  /** GET /api/app/local/download?path=<category/.../file> - one file as it lies on the card. */
  router.get('/local/download', requireSession, async (req, res) => {
    const file = await resolve(deps, query(req, 'path'), 'file')
    if (!file) {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    attachment(res, path.basename(file))
    res.sendFile(file, { dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'download_failed' })
    })
  })

  /** GET /api/app/local/zip?path=<category/artist/album> - a folder with everything in it as a ZIP, made while it goes. */
  router.get('/local/zip', requireSession, async (req, res) => {
    const dir = await resolve(deps, query(req, 'path'), 'dir')
    if (!dir) {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    const name = path.basename(dir)
    // -0: stored, not compressed; -y: a symbolic link stays a link (never followed out of the folder); -q: no talk;
    // hidden files (.part of an upload running) stay out
    const zip = spawn('zip', ['-r', '-0', '-y', '-q', '-', name, '-x', '*/.*', '.*'], { cwd: path.dirname(dir), stdio: ['ignore', 'pipe', 'pipe'] })
    let started = false
    let stderr = ''
    zip.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-500)
    })
    zip.stdout.once('data', () => {
      started = true
    })
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Cache-Control', 'no-store')
    attachment(res, `${name}.zip`)
    zip.stdout.pipe(res)
    // (the phone went away: no zip runs on for nobody)
    res.on('close', () => {
      if (zip.exitCode === null) zip.kill('SIGTERM')
    })
    zip.on('error', (err) => {
      console.warn(`${new Date().toLocaleString()}: [local zip] ${name}: ${err.message}`)
      if (!started && !res.headersSent) res.status(500).json({ error: 'zip_failed' })
      else res.destroy()
    })
    zip.on('close', (code) => {
      if (code && code !== 0 && code !== 143) {
        console.warn(`${new Date().toLocaleString()}: [local zip] ${name}: zip ended with ${code} ${stderr.trim()}`)
        if (!res.writableEnded) res.destroy()
      }
    })
    console.log(`${new Date().toLocaleString()}: [local zip] ${path.relative(deps.root, dir)}`)
  })
}
