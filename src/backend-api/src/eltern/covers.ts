// Own cover pictures (e.g. for radio streams): square images in media/cover, which the admin interface served as
// http://<box>/cover/<name> (/var/www/cover links there). The same checks as its cover page: a plain file name, JPEG,
// PNG, GIF or WEBP, square, 300 to 1200 px.

import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import type { Router } from 'express'
import { requireCsrf, requireSession } from './middleware'

export interface CustomCoverDeps {
  /** The folder of the pictures (/home/dietpi/MuPiBox/media/cover). */
  dir: string
  /** The box's host name for the address of a picture (mupibox.host). */
  host: () => string
}

const NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp)$/i
const MAX_BYTES = 10 * 1024 * 1024
const CONTENT_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Width and height from the file's header (JPEG, PNG, GIF, WEBP); undefined for anything else. */
export function imageSize(b: Buffer): { type: string; width: number; height: number } | undefined {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b.length >= 10 && b.toString('latin1', 0, 4) === 'GIF8') return { type: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16)
    if (chunk === 'VP8 ') return { type: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { type: 'webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
    return undefined
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      const len = b.readUInt16BE(i + 2)
      // start of frame (not DHT, JPG or DAC, which share the range)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return undefined
}

export function registerCustomCoverRoutes(router: Router, deps: CustomCoverDeps): void {
  const address = (name: string) => `http://${deps.host()}/cover/${encodeURIComponent(name)}`

  /** GET /api/eltern/covers - the pictures, newest first, with their address. */
  router.get('/covers', requireSession, async (_req, res) => {
    let names: string[] = []
    try {
      names = (await fsp.readdir(deps.dir)).filter((n) => NAME.test(n))
    } catch {
      // no folder yet: no pictures
    }
    const covers = await Promise.all(
      names.map(async (name) => {
        const st = await fsp.stat(path.join(deps.dir, name)).catch(() => undefined)
        return { name, size: st?.size ?? 0, at: st?.mtimeMs ?? 0, url: address(name) }
      }),
    )
    res.json({ covers: covers.sort((a, b) => b.at - a.at) })
  })

  /** GET /api/eltern/covers/file/:name - a picture, for the preview in the app (does not need the web server). */
  router.get('/covers/file/:name', requireSession, (req, res) => {
    const name = String(req.params.name)
    if (!NAME.test(name)) {
      res.status(400).end()
      return
    }
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(path.join(deps.dir, name), (err) => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })

  /**
   * PUT /api/eltern/covers/upload?name=<file name>  body: the picture's bytes.
   * A picture of the same name is replaced (answer: replaced true).
   */
  router.put('/covers/upload', requireSession, requireCsrf, async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name : ''
    if (!NAME.test(name)) {
      res.status(400).json({ error: 'bad_name' })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > MAX_BYTES) {
          res.status(413).json({ error: 'too_large' })
          req.destroy()
          return
        }
        chunks.push(chunk as Buffer)
      }
    } catch {
      if (!res.headersSent) res.status(400).json({ error: 'upload_failed' })
      return
    }
    const bytes = Buffer.concat(chunks)
    const info = imageSize(bytes)
    if (!info) {
      res.status(415).json({ error: 'not_an_image' })
      return
    }
    if (info.width !== info.height) {
      res.status(422).json({ error: 'not_square', width: info.width, height: info.height })
      return
    }
    if (info.width < 300 || info.width > 1200) {
      res.status(422).json({ error: 'bad_size', width: info.width, height: info.height })
      return
    }
    const target = path.join(deps.dir, name)
    const replaced = await fsp.stat(target).then(() => true, () => false)
    const tmp = path.join(deps.dir, `.${name}.${process.pid}.part`)
    try {
      await fsp.mkdir(deps.dir, { recursive: true })
      await fsp.writeFile(tmp, bytes, { mode: 0o664 })
      await fsp.rename(tmp, target)
    } catch (err) {
      await fsp.unlink(tmp).catch(() => undefined)
      console.warn(`${new Date().toLocaleString()}: [covers] ${name}: ${(err as Error).message}`)
      res.status(500).json({ error: 'write_failed' })
      return
    }
    res.json({ ok: true, name, url: address(name), replaced })
  })

  /** POST /api/eltern/covers/delete {name} */
  router.post('/covers/delete', requireSession, requireCsrf, async (req, res) => {
    const name = String((req.body as { name?: unknown } | undefined)?.name ?? '')
    if (!NAME.test(name)) {
      res.status(400).json({ error: 'bad_name' })
      return
    }
    try {
      await fsp.unlink(path.join(deps.dir, name))
    } catch {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    res.json({ ok: true })
  })
}
