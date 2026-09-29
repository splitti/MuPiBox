// Uploading tracks and whole folders from the parents' web app onto the SD card, into the local media folders
// (media/<category>/<artist>/<album>/...). The box reads those folders live (/api/library/*), so a new album is there
// as soon as its files are; changed() tells the display to read its list again (see /api/data-version).
//
// One file per request, its bytes as the body (no multipart: nothing to parse, nothing kept in memory). It is written
// to a hidden ".part" file next to its place and renamed when it is complete: the box never lists or plays half a
// file, and an interrupted upload leaves nothing behind.

import { randomBytes } from 'node:crypto'
import { createWriteStream, promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Request, Router } from 'express'
import { requireCsrf, requireSession } from './middleware'

export interface LocalLibraryDeps {
  /** The media folder (/home/dietpi/MuPiBox/media). */
  root: string
  /** Its category folders (audiobook, music, other). */
  categories: string[]
  /** Called after a file was added: the display reads its lists again. */
  changed: () => void
}

// What the box plays (as nasAudioExtensions / the player's localAudioPattern) and the pictures it takes as covers
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.wma', '.ogg', '.m4a']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.jfif', '.png', '.webp']
// Kept free on the SD card (as for the NAS downloads): the box needs room for its logs, caches and updates
const RESERVE_BYTES = 512 * 1024 * 1024

// Whether a path really is inside a folder of the media: the name alone said so, but a symbolic link on the way
// (e.g. media/music/x -> /home/dietpi) led the upload or the deletion outside. The deepest part that exists is
// resolved; what does not exist yet is made below it. The category folder itself is held to the media folder (the
// one fixed border): a category that is a link elsewhere (media/music -> /home/dietpi) is no place to write or delete.
const within = (real: string, base: string) => real === base || real.startsWith(base + path.sep)
async function reallyInside(target: string, folder: string, root: string): Promise<boolean> {
  const top = await fsp.realpath(root).catch(() => null)
  const base = await fsp.realpath(folder).catch(() => null)
  if (!top || !base || base === top || !within(base, top)) return false
  let existing = target
  while (!(await fsp.lstat(existing).then(() => true, () => false))) {
    const up = path.dirname(existing)
    if (up === existing) return false
    existing = up
  }
  const real = await fsp.realpath(existing).catch(() => null)
  return real !== null && within(real, base)
}
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024
// Folder depth below the album (e.g. CD1/, CD2/ of an uploaded folder)
const MAX_SUB_DEPTH = 4

/**
 * One name of a folder or file as it may stand on the card: no path separators or characters Windows (Samba)
 * cannot show, no control characters, no leading dot (hidden) and no trailing dot or space. undefined when nothing
 * is left.
 */
export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  let name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  // at most 200 bytes (ext4 allows 255 per name; the ".part" name adds some)
  while (Buffer.byteLength(name, 'utf8') > 200) name = Array.from(name).slice(0, -1).join('').trimEnd()
  return name === '' || name === '.' || name === '..' ? undefined : name
}

function query(req: Request, key: string): string {
  const value = req.query[key]
  return typeof value === 'string' ? value : ''
}

async function subfolders(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  } catch {
    return []
  }
}

async function freeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fsp.statfs(dir)
    return st.bavail * st.bsize
  } catch {
    return null
  }
}

export function registerLocalUploadRoutes(router: Router, deps: LocalLibraryDeps): void {
  /**
   * GET /api/app/local/folders?category=&artist=
   * The artists of a category (without artist) or the albums of an artist, for the choice in the upload form,
   * and the free space on the card.
   */
  router.get('/local/folders', requireSession, async (req, res) => {
    const category = query(req, 'category')
    if (!deps.categories.includes(category)) {
      res.status(400).json({ error: 'unknown category' })
      return
    }
    let dir = path.join(deps.root, category)
    if (query(req, 'artist') !== '') {
      const artist = cleanName(query(req, 'artist'))
      if (!artist) {
        res.json({ folders: [], free: await freeBytes(deps.root), reserve: RESERVE_BYTES })
        return
      }
      dir = path.join(dir, artist)
    }
    res.json({ folders: await subfolders(dir), free: await freeBytes(deps.root), reserve: RESERVE_BYTES })
  })

  /**
   * PUT /api/app/local/upload?category=&artist=&album=&path=<file, or sub/folders/file>
   * Body: the file's bytes. Lands in media/<category>/<artist>/<album>/<path> (album may be empty: then right in
   * the artist's folder, e.g. for an uploaded folder that holds several albums). An existing file of that name is
   * replaced.
   */
  router.put('/local/upload', requireSession, requireCsrf, async (req, res) => {
    const category = query(req, 'category')
    const artist = cleanName(query(req, 'artist'))
    const albumRaw = query(req, 'album')
    const album = albumRaw.trim() === '' ? '' : cleanName(albumRaw)
    const parts = query(req, 'path').split(/[/\\]/).filter((p) => p.trim() !== '')
    const cleanParts = parts.map(cleanName)
    if (!deps.categories.includes(category) || !artist || album === undefined) {
      res.status(400).json({ error: 'bad target' })
      return
    }
    if (cleanParts.length === 0 || cleanParts.length > MAX_SUB_DEPTH + 1 || cleanParts.some((p) => p === undefined)) {
      res.status(400).json({ error: 'bad file name' })
      return
    }
    const names = cleanParts as string[]
    const fileName = names[names.length - 1]
    const ext = path.extname(fileName).toLowerCase()
    if (!AUDIO_EXTENSIONS.includes(ext) && !IMAGE_EXTENSIONS.includes(ext)) {
      res.status(415).json({ error: 'file type not supported' })
      return
    }
    const size = Number.parseInt(String(req.headers['content-length'] ?? ''), 10)
    if (!Number.isFinite(size) || size <= 0) {
      res.status(411).json({ error: 'length required' })
      return
    }
    if (size > MAX_FILE_BYTES) {
      res.status(413).json({ error: 'file too large' })
      return
    }
    const free = await freeBytes(deps.root)
    if (free !== null && free - size < RESERVE_BYTES) {
      res.status(507).json({ error: 'not enough space', free, reserve: RESERVE_BYTES })
      return
    }

    const dir = path.join(deps.root, category, artist, album, ...names.slice(0, -1))
    const target = path.join(dir, fileName)
    // (cleanName leaves no separators or dot names, this is the second lock on the door)
    if (!target.startsWith(path.join(deps.root, category) + path.sep)) {
      res.status(400).json({ error: 'bad target' })
      return
    }
    if (!(await reallyInside(dir, path.join(deps.root, category), deps.root))) {
      res.status(400).json({ error: 'bad target' })
      return
    }
    const part = path.join(dir, `.${fileName}.${randomBytes(4).toString('hex')}.part`)
    try {
      await fsp.mkdir(dir, { recursive: true })
      await pipeline(req, createWriteStream(part, { flags: 'wx' }))
      const written = (await fsp.stat(part)).size
      if (written !== size) throw new Error(`incomplete: ${written} of ${size} bytes`)
      await fsp.rename(part, target)
    } catch (err) {
      await fsp.unlink(part).catch(() => undefined)
      // folders made for it and still empty go again (an empty artist would show on the box)
      for (let d = dir; d.startsWith(path.join(deps.root, category) + path.sep); d = path.dirname(d)) {
        if (!(await fsp.rmdir(d).then(() => true, () => false))) break
      }
      console.warn(`${new Date().toLocaleString()}: [upload] ${target}: ${(err as Error).message}`)
      if (!res.headersSent && !req.destroyed) res.status(500).json({ error: 'upload failed' })
      return
    }
    deps.changed()
    res.json({ ok: true, path: path.relative(deps.root, target).split(path.sep).join('/') })
  })

  /**
   * POST /api/app/local/delete  {path: "<category>/<artist>[/<album>…]"}
   * Deletes a folder of the local media (an artist with all its albums, or one album) from the SD card. A category
   * itself cannot be deleted. The artist's folder goes too when its last album was deleted (an empty artist would
   * show on the box).
   */
  router.post('/local/delete', requireSession, requireCsrf, async (req, res) => {
    const raw = typeof (req.body as { path?: unknown } | undefined)?.path === 'string' ? (req.body as { path: string }).path : ''
    const parts = raw.split('/').filter(Boolean)
    if (parts.length < 2 || !deps.categories.includes(parts[0]) || parts.some((p) => p === '.' || p === '..' || p.includes('\\'))) {
      res.status(400).json({ error: 'invalid_path' })
      return
    }
    const categoryDir = path.join(deps.root, parts[0])
    const target = path.join(deps.root, ...parts)
    if (!target.startsWith(categoryDir + path.sep)) {
      res.status(400).json({ error: 'invalid_path' })
      return
    }
    try {
      const st = await fsp.lstat(target)
      if (!st.isDirectory()) throw new Error('not a folder')
    } catch {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    // (a folder below a link to elsewhere is not one of the media)
    if (!(await reallyInside(target, categoryDir, deps.root)) || (await fsp.realpath(target)) === (await fsp.realpath(categoryDir))) {
      res.status(400).json({ error: 'invalid_path' })
      return
    }
    try {
      await fsp.rm(target, { recursive: true })
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [local delete] ${target}: ${(err as Error).message}`)
      res.status(500).json({ error: 'delete_failed' })
      return
    }
    // the parent folders left empty go too (not the category)
    for (let d = path.dirname(target); d.startsWith(categoryDir + path.sep); d = path.dirname(d)) {
      if ((await subfolders(d)).length > 0 || !(await fsp.rmdir(d).then(() => true, () => false))) break
    }
    console.log(`${new Date().toLocaleString()}: [local delete] ${parts.join('/')}`)
    deps.changed()
    res.json({ ok: true })
  })
}
