// The SMB helper: a small process of its own that reads the mounted share (nas_smb.sh mounts it under
// /run/mupibox/nas) and hands it to the server over HTTP on 127.0.0.1 - lists as JSON, files with Range.
//
// Why a process of its own: a NAS that hangs or vanishes blocks every file access to its mount for up to a minute, in
// the thread pool of the process that made it. In the server that stopped all its file accesses (config, covers,
// photos) - here only the helper waits, the server sees a request that does not answer, kills the helper and mounts
// the share again later (nas/smb.ts). Only Node's own modules: it is bundled into nas-smb-helper.js on its own.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

export interface SmbHelperEntry {
  name: string
  isdir: boolean
  size: number
  mtimeMs: number
}

const TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.m3u': 'audio/x-mpegurl',
}

const MAX_UPLOAD = 25 * 1024 * 1024

/** A path below the mount point, or undefined for one that leaves it (".." or NUL). */
export function smbHelperResolve(root: string, nasPath: unknown): string | undefined {
  if (typeof nasPath !== 'string' || nasPath.includes('\0')) return undefined
  const parts = nasPath.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) return undefined
  return path.join(root, ...parts)
}

// The HTTP status of a failed file access: gone, refused - or the NAS did not answer (503: the server takes it as away)
function statusOf(error: unknown): number {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return 404
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 403
  if (code === 'EEXIST' || code === 'ENOTEMPTY') return 412
  if (code === 'EISDIR') return 409
  return 503
}

function send(res: http.ServerResponse, status: number, body?: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' })
  res.end(text)
}

function fail(res: http.ServerResponse, error: unknown) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  send(res, statusOf(error), { code: (error as NodeJS.ErrnoException)?.code ?? 'EIO' })
}

// The folder's entries. A folder is known from the listing itself; size and date of a file take a request to the NAS
// each (3 SMB requests: a big folder of tracks is hundreds) - foldersOnly (the folder index) leaves the files out.
async function list(dir: string, foldersOnly: boolean): Promise<SmbHelperEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: SmbHelperEntry[] = []
  const rest: typeof entries = []
  for (const entry of entries) {
    if (entry.isDirectory()) out.push({ name: entry.name, isdir: true, size: 0, mtimeMs: 0 })
    else if (!foldersOnly || !entry.isFile()) rest.push(entry) // (a link or unknown type: stat says what it is)
  }
  // a few at a time
  let next = 0
  const worker = async () => {
    while (next < rest.length) {
      const entry = rest[next++]
      try {
        const info = await stat(path.join(dir, entry.name))
        if (foldersOnly && !info.isDirectory()) continue
        out.push({ name: entry.name, isdir: info.isDirectory(), size: info.isDirectory() ? 0 : info.size, mtimeMs: Math.round(info.mtimeMs) })
      } catch (error) {
        const status = statusOf(error)
        if (status === 404) continue // gone in the meantime, or a link to nowhere
        if (status === 503) throw error
        if (!foldersOnly) out.push({ name: entry.name, isdir: false, size: 0, mtimeMs: 0 }) // not readable: as the listing says
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, rest.length) }, worker))
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// "bytes=a-b", "bytes=a-", "bytes=-n" of a file of size bytes: [start, end] or 'invalid' (416); undefined: the whole file
export function smbHelperRange(header: string | undefined, size: number): [number, number] | 'invalid' | undefined {
  if (!header) return undefined
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return undefined // several ranges or another unit: the whole file, as allowed
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || end < start) return 'invalid'
  return [start, end]
}

async function readFileRange(file: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const handle = await open(file, 'r')
  try {
    const info = await handle.stat()
    if (info.isDirectory()) {
      await handle.close()
      send(res, 404, { code: 'EISDIR' })
      return
    }
    const size = info.size
    const range = smbHelperRange(req.headers.range, size)
    if (range === 'invalid') {
      await handle.close()
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    const [start, end] = range ?? [0, size - 1]
    const headers: Record<string, string | number> = {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': size === 0 ? 0 : end - start + 1,
      'Last-Modified': info.mtime.toUTCString(),
    }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    res.writeHead(range ? 206 : 200, headers)
    if (req.method === 'HEAD' || size === 0) {
      await handle.close()
      res.end()
      return
    }
    const stream = handle.createReadStream({ start, end, highWaterMark: 256 * 1024 })
    stream.on('error', () => res.destroy())
    res.on('close', () => stream.destroy())
    stream.pipe(res)
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
  }
}

async function readBody(req: http.IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_UPLOAD) return undefined
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch (error) {
    if (statusOf(error) === 404) return false
    throw error
  }
}

/**
 * The helper's HTTP server on 127.0.0.1 (port 0: any free one). root: the mount point; token: required in
 * "x-mupibox-token" (other programs on the box must not read the NAS through it).
 */
export function startSmbHelper(root: string, token: string, port = 0): Promise<http.Server> {
  const expected = Buffer.from(token)
  const server = http.createServer(async (req, res) => {
    const given = Buffer.from(String(req.headers['x-mupibox-token'] ?? ''))
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      send(res, 401)
      return
    }
    const url = new URL(req.url ?? '/', 'http://helper')
    const target = smbHelperResolve(root, url.searchParams.get('path') ?? '/')
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /probe': {
          // a name that is not there: the NAS has to be asked (a cached folder answers "ok" while the NAS hangs)
          try {
            await stat(path.join(root, `.mupibox-probe-${randomBytes(6).toString('hex')}`))
          } catch (error) {
            if (statusOf(error) !== 404) throw error
          }
          send(res, 200, { ok: true })
          return
        }
        case 'GET /list':
          if (!target) return send(res, 400)
          send(res, 200, await list(target, url.searchParams.get('folders') === '1'))
          return
        case 'GET /stat': {
          if (!target) return send(res, 400)
          const info = await stat(target)
          send(res, 200, { isdir: info.isDirectory(), size: info.isDirectory() ? 0 : info.size, mtimeMs: Math.round(info.mtimeMs) })
          return
        }
        case 'GET /file':
        case 'HEAD /file':
          if (!target) return send(res, 400)
          await readFileRange(target, req, res)
          return
        case 'PUT /file': {
          if (!target || target === root) return send(res, 400)
          const data = await readBody(req)
          if (!data) return send(res, 413)
          await mkdir(path.dirname(target), { recursive: true })
          // without overwrite an existing file stays (412), as WebDAV's "Overwrite: F"
          await writeFile(target, data, { flag: url.searchParams.get('overwrite') === '1' ? 'w' : 'wx' })
          send(res, 201, { ok: true })
          return
        }
        case 'POST /move': {
          const to = smbHelperResolve(root, url.searchParams.get('to'))
          if (!target || !to || target === root || to === root) return send(res, 400)
          if (url.searchParams.get('overwrite') !== '1' && (await exists(to))) return send(res, 412)
          await rename(target, to)
          send(res, 201, { ok: true })
          return
        }
        case 'DELETE /file':
          if (!target || target === root) return send(res, 400)
          await unlink(target)
          send(res, 204)
          return
        default:
          send(res, 404, { code: 'ROUTE' })
      }
    } catch (error) {
      fail(res, error)
    }
  })
  // (long recordings stream for an hour: no request timeout of the server's own)
  server.requestTimeout = 0
  server.keepAliveTimeout = 30_000
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
