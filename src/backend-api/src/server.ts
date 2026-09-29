import { exec, execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import https from 'node:https'
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import tls from 'node:tls'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import type {
  NextFunction as ExpressNextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express'
import jsonfile from 'jsonfile'
import ky from 'ky'
import xmlparser from 'xml-js'
import { LogRequest, LogResponse } from './models/log.model'
import type { MupiboxConfig, NasBoxCategory, NasConfig, NasProfile } from './models/mupibox-config.model'
import type { PlaytimeStatus } from './models/playtime.model'
import { ServerConfig } from './models/server.model'
import type { SpotifyValidationRequest, SpotifyValidationResponse } from './models/spotify-api.model'
import { CoverCacheService } from './services/cover-cache.service'
import { SpotifyApiService } from './services/spotify-api.service'
import { SpotifyMediaInfo } from './services/spotify-media-info.service'
import { createSpotifySyncRouter } from './spotify-sync/routes'
import { startScheduler } from './spotify-sync/scheduler'
import type { RunSyncDeps } from './spotify-sync/state-machine'
import { buildElternLandingHandler, createElternApiRouter } from './eltern/routes'
import { startSpotifyLoginWatch } from './eltern/spotify-auth-age'
import { startTlsWatch } from './eltern/tls'
import { startBucketCleanup, parseCookie } from './eltern/middleware'
import { SESSION_COOKIE, validateSession } from './eltern/auth'
import { type IncomingMessage, request as httpRequest } from 'node:http'
import type { Duplex } from 'node:stream'
import { SUDO_BACKUP_SNIPPET, backupBeforeWrite } from './file-backup'
import { readEmbeddedPicture } from './embedded-cover'
import { acquireLock, releaseLock, staleReason } from './file-lock'
import { coverHidden } from './hidden-covers'
import { OnlineCovers } from './online-covers'
import { browserGuard, corsOptionsFor, isAllowedHost, isLoopback, localOnly, localOrElternSession, PROXY_PORT, setConfiguredHosts, viaProxy } from './request-guard'

// Force IPv4 for DNS lookups to avoid EAI_AGAIN errors on Raspberry Pi
// This fixes issues where IPv6 is misconfigured or not supported
dns.setDefaultResultOrder('ipv4first')

const execFileAsync = promisify(execFile)

const testServe = process.env.NODE_ENV === 'test'
const devServe = process.env.NODE_ENV === 'development'
const productionServe = !(testServe || devServe)

// Configuration files.
let configBasePath = './server/config'
if (!productionServe) {
  configBasePath = './config' // This uses the package.json path as pwd.
}

async function readJsonFile(path: string) {
  const file = await readFile(path, 'utf8')
  return JSON.parse(file)
}

let config: ServerConfig | undefined
readJsonFile(`${configBasePath}/config.json`).then((configFile) => {
  config = configFile

  // Initialize Spotify API service once config is loaded
  if (config?.spotify) {
    try {
      spotifyApiService = new SpotifyApiService(config)
      console.info('Spotify API service initialized')
    } catch (error) {
      console.error('Failed to initialize Spotify API service:', error)
    }
  } else {
    console.warn('No Spotify configuration found, Spotify API service will not be available')
  }
}).catch((error) => {
  // a missing or broken config.json was an unhandled rejection
  console.error(`${new Date().toLocaleString()}: [mupibox-backend-api] could not read ${configBasePath}/config.json: ${error}`)
})
// Phase-X: SD-backed LRU cache for Spotify cover images. Frontend rewrites
// i.scdn.co URLs to /api/spotify/cover/:imageId so the box serves covers
// from its own SD+RAM after the first miss -- caps Chromium's parallel
// connection limit to one host and saves repeat CDN round-trips.
const coverCacheService = new CoverCacheService(path.join(process.cwd(), 'cache'))
// Covers from iTunes/Deezer for NAS and local albums without a picture (see online-covers.ts). Off unless
// mupibox.onlineCovers is switched on in the admin interface (Cover page).
const onlineCovers = new OnlineCovers(
  path.join(process.cwd(), 'cache', 'online-covers'),
  () => (getMupiboxConfigSync()?.mupibox as { onlineCovers?: boolean } | undefined)?.onlineCovers === true,
  (key) => saveOnlineCoverToFolder(key),
)
// mupibox.onlineCoversSave: a found cover is also stored as cover.jpg in the album folder (NAS: needs write permission)
const onlineCoversSaveEnabled = () =>
  (getMupiboxConfigSync()?.mupibox as { onlineCoversSave?: boolean } | undefined)?.onlineCoversSave === true
const ONLINE_COVER_FILE_NAME = 'cover.jpg'
const ONLINE_COVER_NEXT_TO_SCAN = 'cover-online.jpg'

// Stores a found online cover as cover.jpg in its album folder - only when the folder has no picture of its own, never
// over an existing file (WebDAV "Overwrite: F", local "wx"). Then the album has its cover on the NAS / on disk for
// every player, not just in this box's cache. A NAS account without write permission is noted ('denied').
async function saveOnlineCoverToFolder(key: string, evenIfDenied = false): Promise<void> {
  if (!onlineCoversSaveEnabled()) return
  const entry = onlineCovers.get(key)
  if (entry?.status !== 'found' || !entry.file) return
  if (entry.savedTo === 'nas' || entry.savedTo === 'local' || (entry.savedTo === 'denied' && !evenIfDenied)) return
  const source = onlineCovers.filePath(entry.file)
  if (!source) return
  const data = await readFile(source)
  const type = key.slice(0, key.indexOf(':'))
  const folder = key.slice(key.indexOf(':') + 1)
  // next to a picture of the folder's own that is not square: as cover-online.jpg (the scan stays)
  const name = entry.reason === 'notSquare' ? ONLINE_COVER_NEXT_TO_SCAN : ONLINE_COVER_FILE_NAME
  const mayWrite = (files: NasFileEntry[]) =>
    entry.reason === 'notSquare' ? !files.some((f) => f.name.toLowerCase() === name) : !pickCoverImage(files)

  if (type === 'nas') {
    if (!(await nasPathSelected(folder))) return
    const session = await getActiveNasSession()
    if (!session) return
    const files = await withNasSession((s) => nasListFilesLive(s, folder))
    if (!files || !mayWrite(files)) return // not readable now, or it has a picture meanwhile
    const response = await nasFetch(session, `${nasUrl(session, folder)}/${name}`, {
      method: 'PUT',
      headers: { Authorization: session.auth, 'Content-Type': 'image/jpeg', Overwrite: 'F' },
      body: data,
      signal: AbortSignal.timeout(20000),
    })
    await response.arrayBuffer().catch(() => undefined)
    if (response.ok) {
      onlineCovers.update(key, { savedTo: 'nas', savedName: name })
      nasListCache.delete(normalizeNasPath(folder))
      console.log(`${new Date().toLocaleString()}: [OnlineCovers] saved ${folder}/${name} on the NAS`)
    } else if (response.status === 401 || response.status === 403 || response.status === 405) {
      onlineCovers.update(key, { savedTo: 'denied' })
      console.log(`${new Date().toLocaleString()}: [OnlineCovers] no write permission on the NAS for ${folder} (${response.status})`)
    } else {
      console.warn(`${new Date().toLocaleString()}: [OnlineCovers] saving ${folder}/${ONLINE_COVER_FILE_NAME} failed: HTTP ${response.status}`)
    }
    return
  }

  if (type === 'local') {
    const rel = libraryRel(folder)
    if (!rel || !mayWrite(await libraryListFiles(rel))) return
    try {
      await writeFile(path.join(libraryRoot, rel, name), data, { flag: 'wx' })
      onlineCovers.update(key, { savedTo: 'local', savedName: name })
      console.log(`${new Date().toLocaleString()}: [OnlineCovers] saved ${rel}/${name}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') onlineCovers.update(key, { savedTo: 'denied' })
      else console.warn(`${new Date().toLocaleString()}: [OnlineCovers] saving ${rel}/${ONLINE_COVER_FILE_NAME} failed: ${error}`)
    }
  }
}

// Discarding a cover that was stored in its album folder removes that file again - only our own: same size as the
// cover we stored (a picture put there by hand meanwhile stays).
async function removeSavedOnlineCover(key: string): Promise<void> {
  const entry = onlineCovers.get(key)
  if (!entry?.file || (entry.savedTo !== 'nas' && entry.savedTo !== 'local')) return
  const source = onlineCovers.filePath(entry.file)
  const size = source ? (await stat(source).catch(() => undefined))?.size : undefined
  if (size === undefined) return
  const folder = key.slice(key.indexOf(':') + 1)
  if (entry.savedTo === 'nas') {
    const session = await getActiveNasSession()
    if (!session) return
    const files = await withNasSession((s) => nasListFilesLive(s, folder))
    const ours = files?.find((f) => f.name === (entry.savedName ?? ONLINE_COVER_FILE_NAME) && f.additional?.size === size)
    if (!ours) return
    const response = await nasFetch(session, nasUrl(session, ours.path), {
      method: 'DELETE',
      headers: { Authorization: session.auth },
      signal: AbortSignal.timeout(15000),
    })
    await response.arrayBuffer().catch(() => undefined)
    nasListCache.delete(normalizeNasPath(folder))
    return
  }
  const rel = libraryRel(folder)
  if (!rel) return
  const localFile = path.join(libraryRoot, rel, entry.savedName ?? ONLINE_COVER_FILE_NAME)
  if ((await stat(localFile).catch(() => undefined))?.size === size) await rm(localFile, { force: true })
}

const mupiboxConfigPath = '/etc/mupibox/mupiboxconfig.json'
const mupiboxConfigDir = path.dirname(mupiboxConfigPath)
const mupiboxConfigFile = path.basename(mupiboxConfigPath)
const dataFile = `${configBasePath}/data.json`
const resumeFile = `${configBasePath}/resume.json`
const activedataFile = `${configBasePath}/active_data.json`
const activeresumeFile = `${configBasePath}/active_resume.json`
const networkFile = `${configBasePath}/network.json`
const wlanFile = `${configBasePath}/wlan.json`
const monitorFile = `${configBasePath}/monitor.json`
const albumstopFile = `${configBasePath}/albumstop.json`
const mupihat = '/tmp/mupihat.json'
const playtimeFile = '/tmp/playtime.json'
const dataLock = '/tmp/.data.lock'
const resumeLock = '/tmp/.resume.lock'

// RSS feed cache: persisted on disk (not /tmp) so cached podcast covers and feed
// data survive a reboot.
const rssCacheDataDir = `${configBasePath}/rss-cache`
// The folder of this file: __dirname in the bundle (esbuild, CommonJS); run directly as an ES module (the tests, via
// tsx) there is no __dirname, and the tests failed before the first one ran.
const serverDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const rssCoverDir = path.join(serverDir, 'www', 'rss-covers')
const rssCoverPublicBase = '/rss-covers'

// AR5-6: proactively clear any lock file left behind by a previous pm2 crash.
// Without this, a mid-write crash leaves /tmp/.data.lock or /tmp/.resume.lock
// on disk forever, and every subsequent /api/add|edit|delete|addresume|
// deleteresume hits the `locked` branch until the box reboots. The
// acquireLock helper below also handles stale locks at acquisition time, but
// this start-up pass keeps the file system tidy and surfaces the cleanup in
// the boot logs.
;[dataLock, resumeLock].forEach((lockPath) => {
  const reason = staleReason(lockPath)
  if (!reason || reason === 'gone') return
  try {
    fs.unlinkSync(lockPath)
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] startup: removed stale lock ${lockPath} (${reason})`)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] startup: error removing ${lockPath}:`, err)
    }
  }
})

// Phase 14a — Smart-Sync data-layer migration.
// Pre-14 library entries have no `source` field. Smart-Sync needs to
// distinguish manual entries (untouchable) from sync-managed ones, so a
// missing field is ambiguous. One-shot migration on startup: read
// data.json, add `source: 'manual'` to every entry that doesn't carry it
// yet, then atomically write back. Idempotent: subsequent boots no-op
// when every entry already has the field. Safe to run pre-14 (before
// any sync runs) because the only possible legacy value IS 'manual'.
;(() => {
  try {
    if (!fs.existsSync(dataFile)) return
    const raw = fs.readFileSync(dataFile, 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn(
        `${new Date().toLocaleString()}: [MuPiBox-Server] startup: data.json parse failed, skipping source-field migration`,
      )
      return
    }
    if (!Array.isArray(parsed)) return
    let migrated = 0
    for (const item of parsed as Array<Record<string, unknown>>) {
      if (item && typeof item === 'object' && item.source === undefined) {
        item.source = 'manual'
        migrated++
      }
    }
    if (migrated === 0) return
    // Atomic write — same tmp+rename pattern as acquireLock/save flows.
    const tmpPath = `${dataFile}.tmp.${process.pid}`
    fs.writeFileSync(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    fs.renameSync(tmpPath, dataFile)
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] startup: source-field migration touched ${migrated} entries in data.json`,
    )
  } catch (err) {
    console.error(
      `${new Date().toLocaleString()}: [MuPiBox-Server] startup: source-field migration failed (non-fatal, will retry next boot):`,
      err,
    )
  }
})()

let mupiboxConfigCache: MupiboxConfig | undefined
let mupiboxConfigLoadPromise: Promise<MupiboxConfig | undefined> | null = null

const setupMupiboxConfigWatch = () => {
  try {
    // Watch the directory so atomic replace (write+rename) still triggers.
    fs.watch(mupiboxConfigDir, { persistent: false }, (_event, filename) => {
      if (!filename || filename.toString() === mupiboxConfigFile) {
        mupiboxConfigCache = undefined
      }
    })
  } catch (error) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to watch mupibox config for changes:`, error)
  }
}

setupMupiboxConfigWatch()

// Initialize Spotify services
const spotifyMediaInfo = new SpotifyMediaInfo()
let spotifyApiService: SpotifyApiService | undefined

// We export the app so we can use it in testing.
export const app = express()
// req.ip from X-Forwarded-For only when the request came from the box itself: the web server of port 80 passing the
// app on (see PROXY_PORT). From anywhere else the header is ignored, a client on the network cannot forge its address.
app.set('trust proxy', 'loopback')
// Spotify's way back after the login (the Redirect URI in the parents' Spotify app, see eltern/oauth.ts
// buildRedirectUri): https://<box>/app/spotify-callback is handled as /api/app/spotify-oauth/callback; the addresses
// of before (/api/eltern/…) stay for Spotify apps that still name them
app.use((req, _res, next) => {
  if (req.path === '/app/spotify-callback') {
    const query = req.url.indexOf('?')
    req.url = `/api/app/spotify-oauth/callback${query >= 0 ? req.url.slice(query) : ''}`
  }
  next()
})
// Refuse requests a foreign web page makes through a visitor's browser, then CORS for the box
// itself only (was: cors() for every origin). See request-guard.ts.
app.use(browserGuard)
app.use(cors(corsOptionsFor))

// The box's own display page and its API were open to everyone in the network (port 8200): the children's interface to
// look at and operate, the library to change. With "Anmeldung verlangen" on (interfacelogin.state) they are for the box
// itself (its display, the scripts, the Telegram bot, the admin interface's PHP - all on 127.0.0.1) or a parent signed
// in to the app (its session cookie, the one of the admin interface's login too). The app itself (/app) and its own
// API (/api/app, before /api/eltern: login, magic links, …) check for themselves. Without the login switch the box stays open, as chosen.
const loginRequired = () =>
  (getMupiboxConfigSync() as { interfacelogin?: { state?: unknown } } | undefined)?.interfacelogin?.state === true
app.use((req, res, next) => {
  const p = req.path
  if (isLoopback(req) || p === '/app' || p.startsWith('/app/') || p.startsWith('/api/app/') || p.startsWith('/api/eltern/') || p === '/parents' || p === '/eltern' || !loginRequired()) {
    next()
    return
  }
  if (validateSession(parseCookie(req, SESSION_COOKIE))) {
    next()
    return
  }
  if (p.startsWith('/api/')) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  // the display page from another device: to the app's login
  res.redirect(302, '/app/?portal')
})

// The player (port 5005) listens on the box itself only. The display page opened from another device (the admin
// interface's "Display content", a browser in the network) reaches it through here - behind the check above. Only
// requests of the box's pages (they send X-Requested-With, which a foreign page cannot without a CORS preflight that
// is refused) are passed on; the body is passed through as it came.
app.use('/api/player', (req, res) => {
  if (!req.headers['x-requested-with']) {
    res.status(403).send('forbidden')
    return
  }
  const headers = { ...req.headers, host: '127.0.0.1:5005' }
  delete headers.cookie
  delete headers.origin
  delete headers.referer
  const upstream = httpRequest({ host: '127.0.0.1', port: 5005, method: req.method, path: req.url, headers, timeout: 60000 }, (answer) => {
    res.status(answer.statusCode ?? 502)
    for (const name of ['content-type', 'content-length', 'cache-control']) {
      const value = answer.headers[name]
      if (value !== undefined) res.setHeader(name, value)
    }
    answer.pipe(res)
  })
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')))
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'player not reachable' })
    else res.end()
  })
  req.pipe(upstream)
})

// --- Lists of the home page, kept for the display ---------------------------
//
// Switching a category on the display waited for the whole list to be made again: every data.json entry of the
// category looked up (Spotify artists with all their album pages, podcasts, playlists). The display now keeps the
// resolved entries of each category (with the data.json version they belong to) and shows them at once; it makes
// them again in the background when data.json changed or they are old. They are kept here as well, so a display
// that starts (or is reloaded) has them from the first tap. Only the display writes them; one file on the SD,
// written when a list was made again (not on every switch).
const homeCacheFile = path.join(process.cwd(), 'cache', 'home-lists.json')
const homeCacheCategories = ['audiobook', 'music', 'other']
let homeCache: Record<string, { version: string; at: number; media: unknown[] }> = {}
try {
  homeCache = JSON.parse(fs.readFileSync(homeCacheFile, 'utf8'))
} catch {
  // none yet
}
let homeCacheWrite: Promise<void> = Promise.resolve()

app.get('/api/home-lists', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(homeCache)
})

app.put('/api/home-lists/:category', express.json({ limit: '20mb' }), (req, res) => {
  const category = String(req.params.category)
  const body = req.body as { version?: unknown; media?: unknown }
  if (!homeCacheCategories.includes(category) || typeof body?.version !== 'string' || !Array.isArray(body.media)) {
    res.status(400).json({ error: 'category, version and media are needed' })
    return
  }
  homeCache[category] = { version: body.version, at: Date.now(), media: body.media }
  // one write after the other, each to a new file that then replaces the old one (never half a file)
  homeCacheWrite = homeCacheWrite.then(async () => {
    try {
      await mkdir(path.dirname(homeCacheFile), { recursive: true })
      await writeFile(`${homeCacheFile}.tmp`, JSON.stringify(homeCache))
      await rename(`${homeCacheFile}.tmp`, homeCacheFile)
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Could not keep the home lists: ${error}`)
    }
  })
  res.json({ ok: true })
})

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// We only want to serve the Angular app as static files in production so that we can start
// the Angular development server during development to be able to hot-reload and debug.
// We explicitely check for !== 'development' for now so we do not need to set this env in
// production.
if (productionServe) {
  // Static path to compiled Angular app
  app.use(express.static(path.join(serverDir, 'www')))
}

// MED-2: harden /api/rssfeed against SSRF.
//
// The endpoint takes a user-supplied URL and ky-fetches it server-side,
// so a caller can pivot the box into reaching anything routable from
// the box's network — most notably the LAN's internal services
// (router admin pages, NAS shares, other boxes' admin UIs). The
// endpoint itself is auth-protected (frontend only), but treating
// an authenticated frontend as fully trusted means any XSS or admin-
// CSRF leak gives the attacker LAN-pivot for free. Defence in depth:
//
//   1. Schema allowlist: http: and https: only. Strips file:, ftp:,
//      gopher:, data:, javascript: etc. that ky would otherwise honour.
//   2. Host-resolve allowlist: reject private IPv4 ranges (RFC1918,
//      loopback, link-local, IPv4-mapped IPv6). Done by a synchronous
//      check on the parsed hostname; we don't resolve DNS to keep the
//      check fast and simple, but we DO block raw IP literals.
//   3. Hard timeout (10s) + max-content-length (5 MB) — RSS feeds are
//      small text, anything bigger is either misconfigured or hostile.
const PRIVATE_IP_REGEXES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12
  /^169\.254\./, // link-local
  /^0\./,
  /^::1$/,
  /^::ffff:127\./i,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (carrier-grade NAT)
  /^fe[89ab][0-9a-f]:/i, // IPv6 link-local fe80::/10
  /^f[cd][0-9a-f]{2}:/i, // IPv6 unique local fc00::/7 (was only the literal prefixes fc00:/fd00:)
]
const isPrivateHost = (host: string): boolean => {
  // Strip brackets from IPv6 literals
  let h = host.replace(/^\[|\]$/g, '').toLowerCase()
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it maps to - also in the form the URL parser
  // writes it (::ffff:a00:1), as NAT64 (64:ff9b::a00:1) or IPv4-compatible (::a00:1): these passed as "public" before
  h = h.replace(/^(?:::ffff:|64:ff9b::|::)(\d+\.\d+\.\d+\.\d+)$/, '$1')
  const hex = /^(?:::ffff:|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (hex) {
    const hi = Number.parseInt(hex[1], 16)
    const lo = Number.parseInt(hex[2], 16)
    h = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  // any other form of these prefixes is nothing a feed lives on
  if (/^(::ffff:|64:ff9b:)/.test(h)) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::') return true
  return PRIVATE_IP_REGEXES.some((r) => r.test(h))
}

// Single guard for EVERY server-side fetch of a caller-supplied URL. The rules
// used to live inline in /api/rssfeed only, and the RSS episode-image proxy
// added later fetched whatever URL it was handed — which reopened the exact
// LAN-pivot the inline checks were written to close. Keeping the policy in one
// place means the next endpoint that proxies a URL cannot silently miss it.
type RemoteUrlCheck = { url: URL } | { error: string; status: number }
const checkRemoteUrl = (raw: string): RemoteUrlCheck => {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { error: 'Invalid URL', status: 400 }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http(s) URLs are allowed', status: 400 }
  }
  if (isPrivateHost(parsed.hostname)) {
    return { error: 'Private / loopback hosts are not allowed', status: 403 }
  }
  return { url: parsed }
}

// Episode artwork is a few hundred KB; anything past this is either broken or
// hostile. Without a cap the whole body was read into memory before anything
// looked at its size — enough to OOM a Pi from a single request.
const RSS_IMAGE_MAX_BYTES = 8_000_000

// Reads a response body but aborts as soon as the cap is exceeded, so an
// oversized (or endless) body never fully lands in memory. Falls back to
// arrayBuffer() when the runtime gives us no readable stream.
async function readBodyCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) {
    const whole = Buffer.from(await response.arrayBuffer())
    if (whole.length > maxBytes) throw new Error(`response exceeds ${maxBytes} bytes`)
    return whole
  }
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`response exceeds ${maxBytes} bytes`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

class RemoteFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

// The address a connection really goes to is checked as well: fetch() looked the name up once more after the check
// above, so a DNS answer that changed in between (rebinding) could still lead to 127.0.0.1 or the LAN.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    const list = (addresses ?? []) as dns.LookupAddress[]
    if (!err && (list.length === 0 || list.some((a) => isPrivateHost(a.address)))) {
      err = new Error(`${hostname} resolves to a private / loopback address`) as NodeJS.ErrnoException
    }
    if (err) return callback(err, '', 0)
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

// A GET as fetch() does it, but over a connection made with guardedLookup; redirects are not followed (the caller
// checks every hop). No Accept-Encoding: the body comes as it is.
function fetchPinned(url: URL, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? https.request : httpRequest
    const req = request(url, { method: 'GET', lookup: guardedLookup, signal, headers: { 'user-agent': 'MuPiBox', accept: '*/*' } }, (res) => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(res.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const status = res.statusCode ?? 502
      // (no body allowed with these - a stream for them made the Response constructor throw here, in a callback
      // nothing caught: the whole process ended. Any other surprise is a failed fetch, not a crash either.)
      const empty = status === 204 || status === 205 || status === 304
      try {
        if (status < 200 || status > 599) throw new Error(`unexpected status ${status}`)
        if (empty) res.resume()
        resolve(new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status, headers }))
      } catch (err) {
        res.destroy()
        reject(err)
      }
    })
    req.on('error', reject)
    req.end()
  })
}

// The one way to fetch a URL the box did not choose (RSS feeds, podcast covers, episode images).
// checkRemoteUrl() alone looked at the host name as written: a DNS name pointing at 127.0.0.1 or
// a LAN device, or a redirect to one, still reached it - the cached feed path did not even call
// it, and could hit the player's GET commands on 127.0.0.1:5005. And .text()/.arrayBuffer()
// read whole bodies before any size check. Here every hop (redirects are followed by hand) is
// checked after DNS resolution, and the body is capped while it streams in.
async function fetchRemote(
  raw: string,
  opts: { maxBytes: number; timeoutMs: number; contentType?: RegExp },
): Promise<{ body: Buffer; contentType: string }> {
  const signal = AbortSignal.timeout(opts.timeoutMs)
  let current = raw
  for (let hop = 0; hop <= 5; hop++) {
    const checked = checkRemoteUrl(current)
    if ('error' in checked) {
      throw new RemoteFetchError(checked.error, checked.status)
    }
    const hostname = checked.url.hostname.replace(/^\[|\]$/g, '')
    const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some((a) => isPrivateHost(a.address))) {
      throw new RemoteFetchError(`${hostname} resolves to a private / loopback address`, 403)
    }
    const response = await fetchPinned(checked.url, signal)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) {
        throw new RemoteFetchError(`redirect ${response.status} without location`, 502)
      }
      current = new URL(location, checked.url).toString()
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new RemoteFetchError(`remote answered ${response.status}`, 502)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (opts.contentType && contentType && !opts.contentType.test(contentType)) {
      await response.body?.cancel()
      throw new RemoteFetchError(`unsupported content-type: ${contentType}`, 415)
    }
    const advertised = Number.parseInt(response.headers.get('content-length') ?? '0', 10)
    if (advertised > opts.maxBytes) {
      await response.body?.cancel()
      throw new RemoteFetchError(`response advertises ${advertised} bytes, cap is ${opts.maxBytes}`, 413)
    }
    try {
      return { body: await readBodyCapped(response, opts.maxBytes), contentType }
    } catch (error) {
      throw new RemoteFetchError(String(error), 413)
    }
  }
  throw new RemoteFetchError('too many redirects', 502)
}

// File extension from the image's first bytes - not from the URL. A "cover" whose URL ended
// in .html was stored and served as .html from the box's own origin.
function imageExtensionOf(buffer: Buffer): string | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png'
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('latin1'))) return '.gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return '.webp'
  }
  return undefined
}

// Routes
app.get('/api/rssfeed', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl !== 'string') {
    res.status(500).send('Given url is not a string.')
    return
  }
  // fetchRemote() checks every hop after DNS resolution, rejects non-feed content types before
  // reading the body and caps it at 5 MB while it streams in. The former HEAD probe followed
  // redirects unchecked (and Express answers HEAD like GET - one redirect to 127.0.0.1:5005 ran
  // a player command).
  try {
    const { body } = await fetchRemote(rssUrl, {
      maxBytes: 5_000_000,
      timeoutMs: 10000,
      contentType: /xml|rss|atom|text\/plain|octet-stream/i,
    })
    res.send(xmlparser.xml2json(body.toString('utf8'), { compact: true, nativeType: true }))
  } catch (error) {
    const status = error instanceof RemoteFetchError ? error.status : 500
    res.status(status).send(status === 500 ? 'External url responded with error code.' : String((error as Error).message))
  }
})

// --------------------------------------------
// RSS feed cache (podcast covers + feed data)
// --------------------------------------------
// Cached on disk (not /tmp) so covers and the feed survive a reboot. Cached data is
// served immediately if present; a fresh copy is fetched in the background and only
// written back to disk (and re-downloads the cover) if the newest episode changed.

function rssCacheKeyFor(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex')
}

function rssCacheFilePath(cacheKey: string): string {
  return path.join(rssCacheDataDir, `${cacheKey}.json`)
}

// A cached feed can reference a local cover file that no longer exists on disk
// (e.g. lost during a deploy) even though the JSON cache itself survived - that
// silently breaks the cover forever, since the cover is otherwise only
// re-checked when a new episode appears. Detect that case so it can self-heal.
function rssCoverFileMissing(localUrl?: string): boolean {
  if (!localUrl || !localUrl.startsWith(`${rssCoverPublicBase}/`)) {
    return false
  }
  const fileName = localUrl.slice(rssCoverPublicBase.length + 1)
  return !fs.existsSync(path.join(rssCoverDir, fileName))
}

function extractRssText(node: unknown): string | undefined {
  if (node === undefined || node === null) {
    return undefined
  }
  if (typeof node === 'string') {
    return node
  }
  if (typeof node === 'object') {
    if ('_text' in (node as Record<string, unknown>)) {
      return String((node as Record<string, unknown>)._text)
    }
    if ('_cdata' in (node as Record<string, unknown>)) {
      return String((node as Record<string, unknown>)._cdata)
    }
  }
  return undefined
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, entity: string) => {
    if (entity.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity] ?? _m
  })
}

// Text of the first <name>...</name> in `block`, in the shape xml-js gives it (_text / _cdata).
function rssTagText(block: string, name: string): { _text: string } | { _cdata: string } | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  if (!match) {
    return undefined
  }
  const inner = match[1].trim()
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return cdata ? { _cdata: cdata[1] } : { _text: decodeXmlEntities(inner) }
}

// Value of an attribute of the first <tag ...> in `block`.
function rssTagAttribute(block: string, tag: string, attribute: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}\\s[^>]*?\\b${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`))
  const value = match ? (match[2] ?? match[3]) : undefined
  return value === undefined ? undefined : decodeXmlEntities(value)
}

// Reads the channel and its episodes in the same shape as xml-js (compact) would, but with
// only the fields the kiosk uses. Returns undefined if the text does not look like a feed.
function parseRssFeedFast(xml: string): any | undefined {
  const firstItem = xml.search(/<item[\s>]/)
  if (firstItem < 0) {
    return undefined
  }
  const head = xml.slice(0, firstItem)
  const items = (xml.slice(firstItem).match(/<item[\s>][\s\S]*?<\/item>/g) ?? []).map((block) => {
    const item: Record<string, unknown> = {}
    const title = rssTagText(block, 'title')
    const pubDate = rssTagText(block, 'pubDate')
    const guid = rssTagText(block, 'guid')
    const enclosureUrl = rssTagAttribute(block, 'enclosure', 'url')
    const imageUrl = rssTagAttribute(block, 'itunes:image', 'href')
    if (title) item.title = title
    if (pubDate) item.pubDate = pubDate
    if (guid) item.guid = guid
    if (enclosureUrl) item.enclosure = { _attributes: { url: enclosureUrl } }
    if (imageUrl) item['itunes:image'] = { _attributes: { href: imageUrl } }
    return item
  })
  if (items.length === 0) {
    return undefined
  }
  const imageBlock = head.match(/<image>[\s\S]*?<\/image>/)?.[0] ?? ''
  const channelImage = (imageBlock && rssTagText(imageBlock, 'url')) || undefined
  const coverUrl = channelImage ? extractRssText(channelImage) : rssTagAttribute(head, 'itunes:image', 'href')
  const title = rssTagText(head.replace(/<image>[\s\S]*?<\/image>/, ''), 'title')
  return {
    _slim: true,
    rss: { channel: { title: title ?? { _text: '' }, image: { url: { _text: coverUrl ?? '' } }, item: items } },
  }
}

function latestEpisodeFingerprint(feed: any): string | undefined {
  const items = feed?.rss?.channel?.item
  const firstItem = Array.isArray(items) ? items[0] : items
  if (!firstItem) {
    return undefined
  }
  const guid = extractRssText(firstItem.guid)
  const pubDate = extractRssText(firstItem.pubDate)
  const title = extractRssText(firstItem.title)
  return guid ?? `${pubDate ?? ''}|${title ?? ''}`
}

async function downloadRssCover(coverUrl: string, cacheKey: string): Promise<string | undefined> {
  try {
    // Checked fetch, capped like the episode images, and the extension comes from the image
    // bytes: taking it from the URL stored whatever the server sent (e.g. an .html page) under
    // that name in the statically served cover folder.
    const { body: buffer } = await fetchRemote(coverUrl, { maxBytes: RSS_IMAGE_MAX_BYTES, timeoutMs: 15000 })
    const extension = imageExtensionOf(buffer)
    if (!extension) {
      throw new Error('not a JPEG/PNG/GIF/WebP image')
    }
    const coverFileName = `${cacheKey}${extension}`
    await mkdir(rssCoverDir, { recursive: true })
    await writeFile(path.join(rssCoverDir, coverFileName), buffer)
    return `${rssCoverPublicBase}/${coverFileName}`
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to cache RSS cover ${coverUrl}: ${error}`)
    return undefined
  }
}

// Some feeds (looking at you, Kylskåpsradion) are several MB and their server can
// take 4-6+ seconds to respond. Cap the fetch at 5s as requested: on a slow day this
// specific feed may occasionally miss the window and fall back to the empty feed
// below (self-healing - nothing bad gets cached, so the next visit tries again),
// but no single feed can ever stall a response past this.
const rssFetchTimeoutMs = 5000

// Long podcasts are several MB of XML, and parsing that completely (xml-js) blocks the whole
// backend for many seconds on the Pi. The kiosk only needs the <title>, <enclosure>,
// <pubDate> and <itunes:image> of every episode (plus the channel title and cover), so
// those are read straight out of the text - about a hundred times faster - and only they
// are kept in the cache. A feed is refreshed at most every rssRefreshIntervalMs and never
// twice at once. The full parser is only a fallback for feeds that do not look as expected.
const rssRefreshIntervalMs = 15 * 60 * 1000
const rssLastRefresh = new Map<string, number>()
const rssRefreshing = new Set<string>()

/** A minimal, well-formed empty feed, used as a last-resort fallback so a single
 * unreachable podcast never breaks the whole category listing (the frontend
 * merges all podcasts' feeds into one Observable with no per-item error handling). */
function emptyRssFeed(): any {
  return { rss: { channel: { title: { _text: '' }, image: { url: { _text: '' } }, item: [] } } }
}

/**
 * Fetches the given RSS feed and, if the newest episode differs from what's cached
 * (or nothing is cached yet), writes the feed to disk right away (keeping whatever
 * cover URL is already cached, if any) and kicks off the cover re-download in the
 * background - the caller is never blocked on an image download.
 * Returns the feed that should be served (freshly fetched one, or the untouched
 * previous cache if nothing changed).
 */
async function refreshRssCache(rssUrl: string, cacheKey: string): Promise<any> {
  const cacheFile = rssCacheFilePath(cacheKey)
  let previousFeed: any = null
  if (fs.existsSync(cacheFile)) {
    try {
      previousFeed = JSON.parse(await readFile(cacheFile, 'utf8'))
    } catch {
      previousFeed = null
    }
  }

  // Checked on every hop and capped while streaming (this path had no URL check at all, see fetchRemote)
  const xml = (await fetchRemote(rssUrl, { maxBytes: 5_000_000, timeoutMs: rssFetchTimeoutMs })).body.toString('utf8')
  const feed =
    parseRssFeedFast(xml) ??
    JSON.parse(
      xmlparser.xml2json(
        xml.replace(/<(description|content:encoded|itunes:summary|itunes:subtitle)(\s[^>]*)?>[\s\S]*?<\/\1>/g, ''),
        { compact: true, nativeType: true },
      ),
    )

  const hasNewEpisode = latestEpisodeFingerprint(feed) !== latestEpisodeFingerprint(previousFeed)
  const previousCoverUrl = extractRssText(previousFeed?.rss?.channel?.image?.url)
  const coverMissing = rssCoverFileMissing(previousCoverUrl)
  // A cache written by an older version holds every tag of the feed; rewrite it slim.
  const previousIsSlim = previousFeed?._slim === true

  if (previousFeed && !hasNewEpisode && !coverMissing && previousIsSlim) {
    // Nothing changed and the cached cover file is still there - keep serving as-is.
    return previousFeed
  }

  // Keep showing the previously cached cover (if any, and if it still actually exists
  // on disk) immediately; the fresh cover is downloaded below without holding up this
  // response. If the cached cover file is missing, fall back to the live remote URL
  // instead so the image still shows while the local copy is re-downloaded.
  const remoteCoverUrl = extractRssText(feed?.rss?.channel?.image?.url)
  if (feed?.rss?.channel?.image) {
    feed.rss.channel.image.url = { _text: (coverMissing ? undefined : previousCoverUrl) ?? remoteCoverUrl }
  }

  await mkdir(rssCacheDataDir, { recursive: true })
  await writeFile(cacheFile, JSON.stringify(feed), 'utf8')
  void warmRssEpisodeCovers(feed, 12)

  if (remoteCoverUrl) {
    downloadRssCover(remoteCoverUrl, cacheKey)
      .then(async (localCoverUrl) => {
        if (!localCoverUrl) {
          return
        }
        feed.rss.channel.image.url = { _text: localCoverUrl }
        await writeFile(cacheFile, JSON.stringify(feed), 'utf8')
      })
      .catch((error) => {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to refresh RSS cover in background: ${error}`)
      })
  }

  return feed
}

// A minute after start: refresh every configured podcast so that its list and the pictures
// of its newest episodes are ready before somebody opens it.
async function warmConfiguredPodcasts(): Promise<void> {
  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8')) as { type?: string; id?: string }[]
    for (const entry of data) {
      if (entry.type === 'rss' && typeof entry.id === 'string') {
        const key = rssCacheKeyFor(entry.id)
        rssLastRefresh.set(key, Date.now())
        try {
          const feed = await refreshRssCache(entry.id, key)
          void warmRssEpisodeCovers(feed, 12)
        } catch {
          // Offline or feed down - it will be tried again when opened.
        }
      }
    }
  } catch {
    // No data file yet.
  }
}
setTimeout(() => void warmConfiguredPodcasts(), 60 * 1000).unref()

app.get('/api/rssfeed/cached', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl !== 'string') {
    res.status(400).send('Given url is not a string.')
    return
  }

  const cacheKey = rssCacheKeyFor(rssUrl)
  const cacheFile = rssCacheFilePath(cacheKey)

  if (fs.existsSync(cacheFile)) {
    try {
      // The cache file already is the JSON answer - send it as it is (no parse / stringify).
      const cached = await readFile(cacheFile)
      res.type('application/json').send(cached)
      // Refresh in the background for next time; don't make the caller wait for it.
      const due = Date.now() - (rssLastRefresh.get(cacheKey) ?? 0) > rssRefreshIntervalMs
      if (due && !rssRefreshing.has(cacheKey)) {
        rssRefreshing.add(cacheKey)
        rssLastRefresh.set(cacheKey, Date.now())
        refreshRssCache(rssUrl, cacheKey)
          .catch((error) => {
            console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Background RSS refresh failed: ${error}`)
          })
          .finally(() => rssRefreshing.delete(cacheKey))
      }
      return
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to read cached RSS feed: ${error}`)
      // Fall through to a synchronous fetch below.
    }
  }

  // No usable cache yet - fetch synchronously so there is something to show.
  try {
    const feed = await refreshRssCache(rssUrl, cacheKey)
    res.json(feed)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] RSS fetch failed: ${error}`)
    // Respond with a valid-but-empty feed rather than an HTTP error: the frontend
    // merges every podcast's feed into one Observable with no per-item error
    // handling, so a single unreachable/slow feed would otherwise blank the whole
    // category listing instead of just this one tile.
    res.json(emptyRssFeed())
  }
})

const imageContentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

// On-demand image cache/proxy for per-episode podcast covers. Podcasts can have a
// distinct cover per episode (hundreds of them for long-running shows), so we don't
// pre-download all of them - each is fetched and cached the first time it's actually
// requested (i.e. when the episode scrolls into view on the frontend, thanks to lazy
// loading there), and served straight from disk on every request after that.
// Served as a plain buffer (not res.sendFile) since sendFile's internal file
// resolution intermittently reported a freshly-written, verified-to-exist file as
// not found on this device.
// Episode pictures come from slow CDNs and are often 2 MB each. They are fetched at most
// rssImageParallel at a time (a list of 150 episodes must not open 150 downloads at once),
// fetched only once per picture, and handed to the kiosk as small thumbnails (see above).
const rssImageParallel = 3
const rssImageTimeoutMs = 45000

// Downloads wait in line. Whoever is looking at the list is served first: a picture that
// somebody is waiting for goes before the ones prepared in the background, and among those the
// newest request goes first (that is where the user has just scrolled to - the older requests
// are for covers that were scrolled past). Requests whose browser has already given up are dropped.
interface RssImageJob {
  url: string
  file: string
  priority: number // 1 = a browser is waiting, 0 = background preparation
  seq: number
  watchers: (() => boolean)[] // still interested? (one per waiting browser)
  started: boolean
  promise: Promise<string | undefined>
  start: () => void
}
let rssImageRunning = 0
let rssImageSeq = 0
const rssImageQueue: RssImageJob[] = []
const rssImageJobs = new Map<string, RssImageJob>()

function rssImageLocalFile(imageUrl: string): { file: string; extension: string } | undefined {
  try {
    const key = rssCacheKeyFor(imageUrl)
    // Only image extensions: the folder is served statically, and the URL's extension (.html,
    // .svg, ...) decided how the stored file was delivered.
    const urlExtension = path.extname(new URL(imageUrl).pathname).split('?')[0].toLowerCase()
    const extension = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExtension) ? urlExtension : '.jpg'
    return { file: path.join(rssCoverDir, `${key}${extension}`), extension }
  } catch {
    return undefined
  }
}

function rssImageJobWanted(job: RssImageJob): boolean {
  return job.priority === 0 || job.watchers.some((stillWaiting) => stillWaiting())
}

function runNextRssImage(): void {
  while (rssImageRunning < rssImageParallel && rssImageQueue.length > 0) {
    // Highest priority first, then the newest request.
    let best = 0
    for (let i = 1; i < rssImageQueue.length; i++) {
      const a = rssImageQueue[i]
      const b = rssImageQueue[best]
      if (a.priority > b.priority || (a.priority === b.priority && a.seq > b.seq)) {
        best = i
      }
    }
    const [job] = rssImageQueue.splice(best, 1)
    if (rssImageJobWanted(job)) {
      rssImageRunning++
      job.started = true
      job.start()
    } else {
      rssImageJobs.delete(job.file)
      job.start = () => undefined
      cancelRssImageJob(job)
    }
  }
}

const cancelledRssImages = new WeakSet<RssImageJob>()
function cancelRssImageJob(job: RssImageJob): void {
  cancelledRssImages.add(job)
  ;(job as RssImageJob & { cancel?: () => void }).cancel?.()
}

// Returns the local copy of a remote picture, downloading it first if needed.
// `stillWaiting` tells whether the requesting browser is still there; without it the
// request is a background preparation.
function ensureRssImage(imageUrl: string, stillWaiting?: () => boolean): Promise<string | undefined> {
  // Same guard as /api/rssfeed. Both entry points reach here with a URL the
  // box did not choose: the /api/rssfeed/image query parameter, and the
  // itunes:image hrefs out of a podcast feed (warmRssEpisodeCovers) — so a
  // prepared feed could drive internal requests with no user interaction at
  // all. Rejecting here covers both callers.
  const checked = checkRemoteUrl(imageUrl)
  if ('error' in checked) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] refused RSS image URL (${checked.error}): ${imageUrl}`)
    return Promise.resolve(undefined)
  }

  const local = rssImageLocalFile(imageUrl)
  if (!local) {
    return Promise.resolve(undefined)
  }
  if (fs.existsSync(local.file)) {
    return Promise.resolve(local.file)
  }
  const existing = rssImageJobs.get(local.file)
  if (existing) {
    if (stillWaiting) {
      existing.watchers.push(stillWaiting)
      if (!existing.started) {
        existing.priority = 1
        existing.seq = ++rssImageSeq
      }
    }
    return existing.promise
  }

  const job = {
    url: imageUrl,
    file: local.file,
    priority: stillWaiting ? 1 : 0,
    seq: ++rssImageSeq,
    watchers: stillWaiting ? [stillWaiting] : [],
    started: false,
  } as RssImageJob
  job.promise = new Promise<string | undefined>((resolve) => {
    ;(job as RssImageJob & { cancel?: () => void }).cancel = () => resolve(undefined)
    job.start = () => {
      void (async () => {
        try {
          // Checked on every redirect hop after DNS resolution, capped while streaming (the
          // advertised size is rejected first), and only real images are stored.
          const { body: buffer } = await fetchRemote(imageUrl, {
            maxBytes: RSS_IMAGE_MAX_BYTES,
            timeoutMs: rssImageTimeoutMs,
          })
          if (!imageExtensionOf(buffer)) {
            throw new Error('not a JPEG/PNG/GIF/WebP image')
          }
          await mkdir(rssCoverDir, { recursive: true })
          const temp = `${local.file}.${process.pid}.tmp`
          await writeFile(temp, buffer)
          await rename(temp, local.file)
          resolve(local.file)
        } catch (error) {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to proxy/cache RSS episode image ${imageUrl}: ${error}`)
          resolve(undefined)
        } finally {
          rssImageRunning--
          rssImageJobs.delete(local.file)
          runNextRssImage()
        }
      })()
    }
  })
  rssImageJobs.set(local.file, job)
  rssImageQueue.push(job)
  runNextRssImage()
  return job.promise
}

async function sendRssImage(res: express.Response, file: string, thumbSize: number | undefined): Promise<void> {
  if (thumbSize && isThumbnailable(file)) {
    const info = await stat(file)
    const thumb = await getThumbnail(file, thumbSize, `rss|${file}|${info.size}`)
    if (thumb) {
      await sendThumbnail(res, thumb)
      return
    }
  }
  const contentType = imageContentTypes[path.extname(file).toLowerCase()] ?? 'image/jpeg'
  res.set('Cache-Control', 'public, max-age=604800').type(contentType).send(await readFile(file))
}

// `url`: a remote picture (fetched and cached on first use); `local`: a picture that already
// is in the cover cache (channel covers). `w`: ask for a thumbnail of at most that size.
app.get('/api/rssfeed/image', async (req, res) => {
  const thumbSize = parseThumbSize(req.query.w)
  let file: string | undefined

  if (typeof req.query.local === 'string') {
    const name = path.basename(req.query.local)
    file = path.join(rssCoverDir, name)
    if (!fs.existsSync(file)) {
      res.status(404).send('Not found')
      return
    }
  } else if (typeof req.query.url === 'string') {
    let clientGone = false
    res.on('close', () => {
      clientGone = !res.writableEnded
    })
    file = await ensureRssImage(req.query.url, () => !clientGone)
    if (!file) {
      res.status(502).send('Failed to fetch image.')
      return
    }
  } else {
    res.status(400).send('Given url is not a string.')
    return
  }

  try {
    await sendRssImage(res, file, thumbSize)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to send RSS image ${file}: ${error}`)
    res.status(500).send('Failed to read image.')
  }
})

// A podcast's own picture (the channel cover the box shows on its tile), for the app's library: from the feed as
// the box has cached it - no feed is fetched here, a podcast the box never opened has none yet (404).
app.get('/api/rssfeed/cover', async (req, res) => {
  if (typeof req.query.url !== 'string') {
    res.status(400).send('Given url is not a string.')
    return
  }
  let address: string | undefined
  try {
    const feed = JSON.parse(await readFile(rssCacheFilePath(rssCacheKeyFor(req.query.url)), 'utf8'))
    address = extractRssText(feed?.rss?.channel?.image?.url)
  } catch {
    // not cached (yet)
  }
  let file: string | undefined
  if (address?.startsWith(`${rssCoverPublicBase}/`)) {
    const local = path.join(rssCoverDir, path.basename(address))
    if (fs.existsSync(local)) file = local
  } else if (address && /^https?:\/\//i.test(address)) {
    file = await ensureRssImage(address)
  }
  if (!file) {
    res.status(404).send('Not found')
    return
  }
  try {
    await sendRssImage(res, file, parseThumbSize(req.query.w))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to send RSS cover ${file}: ${error}`)
    res.status(500).send('Failed to read image.')
  }
})

// The newest episodes are what gets opened first: fetch their pictures ahead of time.
async function warmRssEpisodeCovers(feed: any, count: number): Promise<void> {
  const items = feed?.rss?.channel?.item
  if (!Array.isArray(items)) {
    return
  }
  for (const item of items.slice(0, count)) {
    const href = item?.['itunes:image']?._attributes?.href
    if (typeof href !== 'string') {
      continue
    }
    const file = await ensureRssImage(href)
    if (file && isThumbnailable(file)) {
      try {
        const info = await stat(file)
        await getThumbnail(file, 400, `rss|${file}|${info.size}`)
      } catch {
        // Nothing to warm.
      }
    }
  }
}

app.get('/api/data', (_req, res) => {
  // Mirror /api/resume: when active_data.json is missing the frontend would
  // otherwise hang on its loading spinner, because the previous code's missing
  // else-branch never sent a response.
  if (!fs.existsSync(activedataFile)) {
    res.json([])
    return
  }
  jsonfile.readFile(activedataFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/data read active_data.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json([])
    } else {
      res.json(data)
    }
  })
})

// The boot screen of this start (bootscreen_update.sh / splash_screen.sh, with the box name): the display shows it
// until its start page is ready (index.html), so there is no black and white between boot screen and display.
app.get('/api/bootscreen/current-splash', (_req, res) => {
  const dir = '/home/dietpi/MuPiBox/sysmedia/images/bootscreen'
  let scene = ''
  try {
    scene = fs.readFileSync(`${dir}/current`, 'utf8').trim()
  } catch {
    // none yet
  }
  const file = /^[a-z0-9-]+$/.test(scene) ? `${dir}/splash-${scene}.png` : '/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/splash-karte.png'
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

// Changes whenever files were added to the local media folders from the web app (upload): the display then reads
// its lists again. Apart from data.json's version, which also stands for the kept lists of the home page (their
// Spotify part would be looked up again for nothing).
let localLibraryVersion = Date.now()

app.get('/api/data-version', (_req, res) => {
  // Cheap change-token for the box frontend's library-change poll (Phase 17g).
  // activedataFile is a symlink to data.json (or offline_data.json) reconciled
  // by check_network.sh; statSync follows it. mtime+size flips whenever the
  // Smart-Sync rewrites the library, so the frontend can re-fetch /api/data
  // only when something actually changed — no full-list polling.
  try {
    const st = fs.statSync(activedataFile)
    res.json({ version: `${Math.floor(st.mtimeMs)}-${st.size}`, local: String(localLibraryVersion), nasTab: nasTabWanted(nasSettings(getMupiboxConfigSync())) })
  } catch {
    res.json({ version: '0', local: String(localLibraryVersion), nasTab: nasTabWanted(nasSettings(getMupiboxConfigSync())) })
  }
})

app.get('/api/resume', (_req, res) => {
  // Mirror /api/data and /api/activeresume: callers always expect an array.
  // Until the first save resume.json doesn't exist (created on demand by
  // check_network.sh or by the first /api/addresume), and the previous 404
  // crashed callers that did `.length` / `.findIndex` on the response.
  if (!fs.existsSync(resumeFile)) {
    res.json([])
    return
  }
  tryReadFile(resumeFile)
    .then((data) => {
      if (Array.isArray(data)) backfillLastPlayedAt(data, Date.now())
      res.json(data)
    })
    .catch((error) => {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/resume read resume.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json([])
    })
})

// Phase-X cover proxy. Frontend converts every i.scdn.co/image/<id> URL to
// /api/spotify/cover/<id>; we serve from the SD+RAM cache after first miss.
// imageId is validated as alphanumeric inside CoverCacheService -- any
// crafted path traversal attempt returns 400.
app.get('/api/spotify/cover/:imageId', async (req, res) => {
  const buf = await coverCacheService.get(req.params.imageId)
  if (!buf) {
    res.status(404).type('text/plain').send('cover not available')
    return
  }
  // Long max-age + immutable since Spotify image IDs are content-addressed:
  // a given imageId always resolves to the same bytes, so the browser can
  // cache aggressively. ETag echoes the imageId for conditional requests.
  res.set('Content-Type', 'image/jpeg')
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.set('ETag', `"${req.params.imageId}"`)
  res.send(buf)
})

// Online covers of NAS and local albums (online-covers.ts). The file names are sha1 hashes, checked in filePath().
app.get('/api/online-cover/:file', (req, res) => {
  const file = onlineCovers.filePath(req.params.file)
  if (!file) {
    res.status(400).type('text/plain').send('invalid name')
    return
  }
  // dotfiles: the cache lies below /home/dietpi/.mupibox, which sendFile refuses by default (404). Only a picture
  // may be kept by the browser: a cached "not found" would hide the cover for a day.
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'public, max-age=86400' } }, (err) => {
    if (err && !res.headersSent) res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('cover not available')
  })
})

// For the admin interface (Cover page): what was found, throw away a wrong one, look up the misses again.
//
// The library walk goes through every selected NAS folder (and, for online covers, the local library):
//  - NAS: it renews the folder index (see nasFolderFacts) bottom-up from the listings it reads anyway, makes the
//    thumbnail of every album's own cover (so a list of 200 albums shows its covers at once, from the SD), and
//  - asks for an online cover for albums without a picture (when switched on) - not only the albums shown.
// A few minutes after every start of the box and every 6 hours while it runs (the box is usually off at night).
// Reading ~3700 folders takes a few minutes; thumbnails and online lookups are only made for what is new or changed.
const onlineCoverScan = { running: false, folders: 0, finishedAt: 0 }

// A listing for the walk: one failed request (WiFi hiccup) marks the NAS offline for 30 s, and every folder after it
// failed at once - the first scan stopped after 164 of about 2100 folders. So: wait for that to pass, try 3 times.
async function listForWalk(
  folder: string,
  listFiles: (f: string) => Promise<NasFileEntry[]>,
): Promise<NasFileEntry[] | undefined> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await listFiles(folder)
    } catch (error) {
      if (attempt === 3) {
        console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] library walk: cannot read ${folder}: ${error}`)
        return undefined
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, nasOfflineUntil - Date.now()) + 5000))
    }
  }
  return undefined
}

// One NAS folder and everything below it; returns the folder's facts (stored in the index).
async function nasIndexWalk(folder: string, version: string | undefined, depth: number, hidden: string[]): Promise<NasFolderFacts | undefined> {
  if (depth > 8 || nasIsHidden(normalizeNasPath(folder), hidden)) return undefined
  const files = await listForWalk(folder, nasListFiles)
  if (!files) return undefined
  onlineCoverScan.folders++
  const subfolders = nasRealSubfolders(files)
  const childFacts = new Map<string, NasFolderFacts>()
  for (const sub of subfolders) {
    const facts = await nasIndexWalk(sub.path, sub.version, depth + 1, hidden)
    if (facts) childFacts.set(sub.path, facts)
  }
  const audio = nasHasAudio(files)
  // as folderIsContainer(): with titles of its own only when a subfolder holds audio (or albums) itself
  const container =
    subfolders.length > 0 && (!audio || [...childFacts.values()].some((f) => f.audio || f.container))
  const own = pickCoverImage(files)
  let below: string | undefined
  if (!own) {
    // as nasFindCoverBelow(): the first picture in one of the first five subfolders (a "Scans" folder too)
    for (const sub of files.filter((f) => f.isdir).slice(0, 5)) {
      const known = childFacts.get(sub.path)
      below = known ? known.own : pickCoverImage((await listForWalk(sub.path, nasListFiles)) ?? [])?.path
      if (below) break
    }
  }
  const facts: NasFolderFacts = { v: version, audio, container, own: own?.path, ownV: own?.version, below, at: Date.now() }
  nasFolderIndexStore(normalizeNasPath(folder), facts)
  if (own) {
    const thumb = await nasCoverThumbnail(own.path, NAS_COVER_THUMB_SIZE, own.version).catch(() => undefined)
    await measureCoverShape(`nas:${own.path}`, thumb)
    // an album whose picture is far from square (scanned cassette inlay): its online cover is shown instead
    if (audio && !container && coverIsNotSquare(`nas:${own.path}`)) onlineAlbumCover('nas', folder, 'notSquare')
  }
  // an album (or a folder with titles of its own next to subfolders) without a picture
  if (audio && !own) onlineAlbumCover('nas', folder)
  return facts
}

async function scanAlbumsForOnlineCovers(): Promise<void> {
  if (onlineCoverScan.running) return
  onlineCoverScan.running = true
  onlineCoverScan.folders = 0
  try {
    const nas = nasSettings(await getMupiboxConfig())
    const hidden = (nas?.hiddenFolders ?? []).map(normalizeNasPath)
    if ((nas?.artistFolders ?? []).length > 0 && (await getActiveNasSession())) {
      for (const folder of nas?.artistFolders ?? []) {
        await nasIndexWalk(normalizeNasPath(folder), undefined, 0, hidden)
      }
    }
    if (onlineCovers.isOn()) {
      const visitLocal = async (folder: string, depth: number): Promise<void> => {
        if (depth > 8) return
        const files = await listForWalk(folder, libraryListFiles)
        if (!files) return
        onlineCoverScan.folders++
        const own = pickCoverImage(files)
        if (nasHasAudio(files) && !own) onlineAlbumCover('local', folder)
        if (own && nasHasAudio(files)) {
          // measured on its thumbnail (the one the lists show); not square: its online cover is shown instead
          const absolute = path.join(libraryRoot, own.path)
          const info = await stat(absolute).catch(() => undefined)
          const thumb = info
            ? await getThumbnail(absolute, NAS_COVER_THUMB_SIZE, `lib|${absolute}|${info.mtimeMs}|${info.size}`)
            : undefined
          await measureCoverShape(`local:${own.path}`, thumb)
          if (coverIsNotSquare(`local:${own.path}`)) onlineAlbumCover('local', folder, 'notSquare')
        }
        for (const sub of nasRealSubfolders(files)) await visitLocal(sub.path, depth + 1)
      }
      for (const category of libraryCategories) await visitLocal(category, 0)
    }
  } catch (error) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] library walk failed: ${error}`)
  } finally {
    onlineCoverScan.running = false
    onlineCoverScan.finishedAt = Date.now()
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] library walk: ${onlineCoverScan.folders} folders, ${onlineCovers.pending()} albums waiting for an online cover`,
    )
  }
}
setTimeout(() => void scanAlbumsForOnlineCovers(), 3 * 60 * 1000).unref()
setInterval(() => void scanAlbumsForOnlineCovers(), 6 * 3600 * 1000).unref()

app.get('/api/online-covers', localOrElternSession, (_req, res) => {
  res.json({
    success: true,
    entries: onlineCovers.list(),
    pending: onlineCovers.pending(),
    scanning: onlineCoverScan.running,
  })
})
app.post('/api/online-covers/scan', localOrElternSession, (_req, res) => {
  void scanAlbumsForOnlineCovers()
  res.json({ success: true })
})
app.post('/api/online-covers/reject', localOrElternSession, async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key : ''
  await removeSavedOnlineCover(key).catch((error) =>
    console.warn(`${new Date().toLocaleString()}: [OnlineCovers] removing the stored cover of ${key} failed: ${error}`),
  )
  res.json({ success: onlineCovers.reject(key) })
})
// Stores every found cover not stored yet (e.g. after switching the option on, or after write permission was given
// on the NAS) - in the background, one after the other.
let onlineCoversSaving = false
app.post('/api/online-covers/save-all', localOrElternSession, (_req, res) => {
  if (!onlineCoversSaveEnabled()) {
    res.json({ success: false, error: 'Saving covers into the album folders is switched off.' })
    return
  }
  const keys = onlineCovers
    .list()
    .filter((e) => e.status === 'found' && e.savedTo !== 'nas' && e.savedTo !== 'local')
    .map((e) => e.key)
  res.json({ success: true, queued: onlineCoversSaving ? 0 : keys.length })
  if (onlineCoversSaving) return
  onlineCoversSaving = true
  void (async () => {
    for (const key of keys) {
      await saveOnlineCoverToFolder(key, true).catch((error) =>
        console.warn(`${new Date().toLocaleString()}: [OnlineCovers] storing ${key}: ${error}`),
      )
    }
  })().finally(() => {
    onlineCoversSaving = false
  })
})
// Single albums looked up afresh (e.g. after the matching got stricter): a cover the box stored in the album folder
// is removed first.
app.post('/api/online-covers/forget', localOrElternSession, async (req, res) => {
  const keys = Array.isArray(req.body?.keys) ? (req.body.keys as unknown[]).filter((k): k is string => typeof k === 'string') : []
  for (const key of keys) {
    await removeSavedOnlineCover(key).catch(() => undefined)
  }
  res.json({ success: true, forgotten: onlineCovers.forget(keys) })
})
app.post('/api/online-covers/retry', localOrElternSession, (req, res) => {
  res.json({ success: true, cleared: onlineCovers.retry(req.body?.alsoRejected === true) })
})

// Cover of a Spotify entry that has none stored in data.json (added by hand: just an album or artist id), for the
// parents' web app. The lookup goes through the cached Spotify API calls, then the browser is sent to the cover
// proxy above, so every image is fetched from Spotify once.
const SPOTIFY_COVER_KINDS = new Set(['album', 'artist', 'playlist', 'show', 'audiobook'])
app.get('/api/spotify/cover-for/:kind/:id', async (req, res) => {
  const { kind, id } = req.params
  if (!SPOTIFY_COVER_KINDS.has(kind) || !/^[A-Za-z0-9]{10,40}$/.test(id)) {
    res.status(400).type('text/plain').send('bad request')
    return
  }
  if (!spotifyApiService) {
    res.status(503).type('text/plain').send('Spotify not available')
    return
  }
  try {
    const api = spotifyApiService
    const item =
      kind === 'album'
        ? await api.getAlbum(id)
        : kind === 'artist'
          ? await api.getArtist(id)
          : kind === 'playlist'
            ? await api.getPlaylist(id)
            : kind === 'show'
              ? await api.getShow(id)
              : await api.getAudiobook(id)
    // the smallest image that is still sharp in a list (>= 300 px), else the biggest there is
    const images = [...(item?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    const image = images.find((i) => (i.width ?? 0) >= 300) ?? images[images.length - 1]
    const imageId = image?.url?.match(/^https:\/\/i\.scdn\.co\/image\/([A-Za-z0-9]+)$/)?.[1]
    if (!imageId) {
      res.status(404).type('text/plain').send('no cover')
      return
    }
    res.set('Cache-Control', 'public, max-age=86400')
    res.redirect(302, `/api/spotify/cover/${imageId}`)
  } catch {
    res.status(404).type('text/plain').send('no cover')
  }
})

app.get('/api/mupihat', (_req, res) => {
  // Same hang-without-file as /api/data: a box without a MuPiHAT board
  // simply has no /tmp/mupihat.json — return an empty object rather than
  // letting the request stall.
  if (!fs.existsSync(mupihat)) {
    res.json({})
    return
  }
  jsonfile.readFile(mupihat, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/mupihat read mupihat.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json({})
    } else {
      // (the battery does not charge although the power supply is plugged in, see checkCharging; the values do not
      // change any more, see checkHatFresh)
      res.json({
        ...data,
        ...(chargeProblemSince === null ? {} : { ChargeProblemSince: new Date(chargeProblemSince).toISOString() }),
        ...(hatStaleWarned && hatStaleSince !== null ? { BatteryStaleSince: new Date(hatStaleSince).toISOString() } : {}),
      })
    }
  })
})

// Playback time tracking written by backend-player to /tmp/playtime.json (tmpfs).
// Missing/unreadable file means the player hasn't ticked yet or the feature is off —
// either way, surfaces as "disabled" so the frontend can hide the UI safely.
// The player writes playtime.json on its own tick: right after "Ruhe sofort" / "Ruhe beenden" it still told the state
// before. The parents' override is taken from the config here (what they just set), the rest as the player wrote it.
function withLiveOverride(data: Record<string, unknown>): Record<string, unknown> {
  const ov = (getMupiboxConfigSync() as { playbackOverride?: { forceBlockUntil?: unknown; allowUntil?: unknown } } | undefined)?.playbackOverride
  if (!ov || typeof ov !== 'object') return data
  const current = (data.override as Record<string, unknown> | undefined) ?? {}
  return { ...data, override: { ...current, forceBlockUntil: Number(ov.forceBlockUntil) || 0, allowUntil: Number(ov.allowUntil) || 0 } }
}

app.get('/api/playtime', (_req, res) => {
  const disabled: PlaytimeStatus = { enabled: false }
  if (!fs.existsSync(playtimeFile)) {
    res.json(disabled)
    return
  }
  jsonfile.readFile(playtimeFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/playtime read playtime.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json(disabled)
    } else {
      res.json(data && typeof data === 'object' ? withLiveOverride(data as Record<string, unknown>) : data)
    }
  })
})

// Atomically apply a mutation to /etc/mupibox/mupiboxconfig.json.
// Used by the parent-control endpoints below (extend / release / quietnow).
// The player picks up the change ~50 ms later via fs.watch (see spotify-control.js).
// All config writes of this process run one after the other: two overlapping read-modify-write
// cycles (e.g. the sync scheduler's token refresh and a caps save from the parents' app) used to
// share one fixed tmp file - one could copy the other's half-written file into place, or delete
// it under the other's feet, and one change was lost either way.
let mupiboxConfigWriteChain: Promise<unknown> = Promise.resolve()
// Same lock file as the admin interface's save_mupiboxconfig() (includes/save_config.php).
const MUPIBOX_CONFIG_LOCK = '/tmp/.mupiboxconfig.lock'

// Holds the shared config lock (flock on MUPIBOX_CONFIG_LOCK, the same one the admin interface's
// save_mupiboxconfig() takes) for as long as the returned release function is not called. Node
// has no flock of its own, so a small `flock ... sh` child holds it: it prints once it has the
// lock and exits (dropping it) when its stdin is closed.
function acquireMupiboxConfigLock(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    // The PHP side opens the lock file for writing: if this process creates it, make it writable
    // for everyone. If PHP created it (not writable for us), flock still works on a read-only fd.
    if (!fs.existsSync(MUPIBOX_CONFIG_LOCK)) {
      try {
        fs.writeFileSync(MUPIBOX_CONFIG_LOCK, '', { flag: 'a', mode: 0o666 })
        fs.chmodSync(MUPIBOX_CONFIG_LOCK, 0o666)
      } catch {
        // flock below creates it if needed
      }
    }
    // The lock file is opened read-only by the shell (exec 9<) and flock works on that fd. Letting flock
    // open it itself uses O_CREAT, which the kernel refuses in /tmp for a file owned by another user
    // (fs.protected_regular) - the file is www-data's once the admin interface has created it, even
    // though it is world-writable - and the holder would exit at once.
    const holder = spawn('sh', ['-c', 'exec 9<"$1" && flock 9 && echo locked && read _', 'config-lock', MUPIBOX_CONFIG_LOCK], {
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      holder.kill()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('timed out waiting for the config lock')), 15000)
    holder.on('error', fail)
    holder.on('exit', () => fail(new Error('config lock holder exited early')))
    holder.stdout.once('data', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(() => holder.stdin.end())
    })
  })
}

async function replaceMupiboxConfigFile(content: Record<string, unknown>): Promise<void> {
  const tmpPath = `/tmp/.mupiboxconfig.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.json`
  await writeFile(tmpPath, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o644 })
  try {
    // /tmp is a RAM disk and /etc is on the SD card, so a plain mv would copy into the target in
    // place. Copy next to it first, then rename on the same filesystem: a reader never sees half a
    // file. The caller holds the config lock.
    // The version replaced here is kept as .bak and as a daily copy in backup/ (see file-backup.ts).
    await execFileAsync('sh', ['-c', `${SUDO_BACKUP_SNIPPET}; sudo cp "$1" "$2.new" && sudo mv -f "$2.new" "$2"`, 'replace-config', tmpPath, mupiboxConfigPath])
  } finally {
    await fs.promises.rm(tmpPath, { force: true })
  }
}

// `mutate` changes the freshly read config in place; returning false skips the write (nothing changed).
function updateMupiboxConfig(mutate: (cfg: Record<string, unknown>) => void | false): Promise<void> {
  const run = mupiboxConfigWriteChain.then(async () => {
    // Read, change and replace all under the shared lock: with only the replace locked, the admin
    // interface could save between our read and our write, and its change was overwritten.
    const release = await acquireMupiboxConfigLock()
    try {
      const current = (await readJsonFile(mupiboxConfigPath)) as Record<string, unknown>
      if (mutate(current) === false) {
        return
      }
      await replaceMupiboxConfigFile(current)
    } finally {
      release()
    }
    // Local cache invalidation (server's own mupiboxConfigCache) — fs.watch on the
    // dir already does this, but be explicit so /api/config returns the new value
    // immediately on the next call.
    mupiboxConfigCache = undefined
  })
  // the chain continues after a failed write too
  mupiboxConfigWriteChain = run.catch(() => {})
  return run
}

// === Phase 18 Item 4: Play-Log poller =========================================
// Records what's playing on the box by polling the player's own HTTP API on
// localhost:5005 every 10 s. State machine emits "start" when something new
// begins playing and "stop" (with duration) when it ends or changes. We
// deliberately do NOT modify spotify-control.js — that runs the audio and
// must stay rock-solid.

const PLAY_LOG_PATH = '/home/dietpi/.mupibox/play_log.jsonl'
const PLAY_LOG_POLL_MS = 10_000
const PLAYER_HOST = 'http://127.0.0.1:5005'

let lastPlayFingerprint: string | null = null
let lastPlayStartTs: number | null = null
let lastPlayMeta: { source: string; title: string; artist: string; album: string } | null = null

async function fetchCurrentPlayerState(): Promise<
  { fingerprint: string | null; meta: typeof lastPlayMeta } | null
> {
  try {
    const localRes = await fetch(`${PLAYER_HOST}/local`, { signal: AbortSignal.timeout(4000) })
    if (!localRes.ok) return null
    const local = (await localRes.json()) as Record<string, unknown>
    // Player playing if mplayer says so (playing:true) OR spotify says it's
    // not paused. currentTrackname empty means nothing real to log.
    const player = String(local.currentPlayer ?? '')
    const playing =
      (player === 'mplayer' && local.playing === true) ||
      (player === 'spotify' && local.pause === false)
    if (!playing) return { fingerprint: null, meta: null }

    const source = String(local.currentType ?? 'unknown')
    let title = String(local.currentTrackname ?? '')
    let artist = ''
    const album = String(local.album ?? '')

    if (player === 'spotify') {
      try {
        const stateRes = await fetch(`${PLAYER_HOST}/state`, { signal: AbortSignal.timeout(4000) })
        if (stateRes.ok) {
          const state = (await stateRes.json()) as {
            item?: { name?: string; artists?: Array<{ name?: string }>; show?: { name?: string } }
          }
          if (state.item?.name) title = String(state.item.name)
          if (state.item?.show?.name) artist = String(state.item.show.name)
          else if (Array.isArray(state.item?.artists) && state.item.artists[0]?.name) {
            artist = String(state.item.artists[0].name)
          }
        }
      } catch {
        // keep currentMeta-derived values
      }
    }
    if (!title) return { fingerprint: null, meta: null }
    const fingerprint = `${source}|${artist}|${album}|${title}`
    return { fingerprint, meta: { source, title, artist, album } }
  } catch {
    return null
  }
}

function appendPlayLogLine(entry: Record<string, unknown>): void {
  fs.appendFile(PLAY_LOG_PATH, `${JSON.stringify(entry)}\n`, (err) => {
    if (err) console.warn(`${new Date().toLocaleString()}: [play-log] append failed: ${err.message}`)
  })
}

// Der Hör-Verlauf wuchs bis hierher unbegrenzt -- anders als battery_log,
// das seit Phase 18 Item 6 auf 8 Tage getrimmt wird. Nach gut drei Monaten
// standen 2,1 MB auf der SD-Karte, und /api/app/playlog liest die Datei
// bei JEDEM Aufruf komplett ein. Unbegrenztes Wachstum heisst also nicht nur
// SD-Wear, sondern auch stetig steigende Latenz der Hör-Verlauf-Seite.
// 90 Tage lassen Raum für längere Auswertungen (der Endpoint selbst braucht
// höchstens 7) und deckeln die Datei bei rund 2 MB.
const PLAY_LOG_KEEP_DAYS = 90
const PLAY_LOG_TRIM_EVERY_TICKS = 360 // bei 10s-Takt ≈ einmal pro Stunde
let playLogTickCount = 0

function trimPlayLog(): void {
  try {
    if (!fs.existsSync(PLAY_LOG_PATH)) return
    const cutoffMs = Date.now() - PLAY_LOG_KEEP_DAYS * 24 * 3600 * 1000
    const raw = fs.readFileSync(PLAY_LOG_PATH, 'utf8')
    const kept: string[] = []
    for (const ln of raw.split('\n')) {
      if (!ln) continue
      try {
        const e = JSON.parse(ln) as { ts?: string }
        if (e.ts && Date.parse(e.ts) >= cutoffMs) kept.push(ln)
      } catch {
        /* skip malformed */
      }
    }
    if (kept.length === raw.split('\n').filter(Boolean).length) return // nichts zu tun
    const tmp = `${PLAY_LOG_PATH}.tmp.${process.pid}`
    fs.writeFileSync(tmp, kept.length ? `${kept.join('\n')}\n` : '', 'utf8')
    fs.renameSync(tmp, PLAY_LOG_PATH)
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [play-log] trim failed: ${(err as Error).message}`)
  }
}

// When the player stops answering, the last track is closed at the moment it was last seen playing.
// Skipping those ticks forever kept the old track "playing": a player that hung for two hours put
// two hours on the history although nothing was heard.
const PLAY_LOG_STALE_MS = 60_000
let lastPlaySeenTs: number | null = null

function closePlayLogEntry(endMs: number, sync = false): void {
  if (lastPlayFingerprint !== null && lastPlayStartTs !== null && lastPlayMeta !== null) {
    const line = {
      ts: new Date(endMs).toISOString(),
      event: 'stop',
      duration_seconds: Math.max(0, Math.round((endMs - lastPlayStartTs) / 1000)),
      ...lastPlayMeta,
    }
    if (sync) {
      try {
        fs.appendFileSync(PLAY_LOG_PATH, `${JSON.stringify(line)}\n`)
      } catch {
        /* shutting down, nothing else to do */
      }
    } else {
      appendPlayLogLine(line)
    }
  }
  lastPlayFingerprint = null
  lastPlayStartTs = null
  lastPlayMeta = null
  lastPlaySeenTs = null
}

/** Start of the track the history is timing right now (null when nothing plays). */
function currentPlayLogStart(): number | null {
  return lastPlayStartTs
}

async function tickPlayLog(): Promise<void> {
  const state = await fetchCurrentPlayerState()
  const now = Date.now()
  if (state === null) {
    // transient — skip this tick, unless the player has been gone for a while
    if (lastPlaySeenTs !== null && now - lastPlaySeenTs > PLAY_LOG_STALE_MS) closePlayLogEntry(lastPlaySeenTs)
    return
  }
  if (state.fingerprint === lastPlayFingerprint) {
    if (lastPlayFingerprint !== null) lastPlaySeenTs = now
    return // no change
  }

  closePlayLogEntry(now)
  if (state.fingerprint !== null && state.meta !== null) {
    appendPlayLogLine({
      ts: new Date(now).toISOString(),
      event: 'start',
      ...state.meta,
    })
    lastPlayFingerprint = state.fingerprint
    lastPlayStartTs = now
    lastPlayMeta = state.meta
    lastPlaySeenTs = now
  }
}

function startPlayLogPoller(): void {
  const timer = setInterval(() => {
    // .catch statt void: tickPlayLog() macht einen HTTP-Call zum Player,
    // und eine abgelehnte Promise ohne Handler beendet unter Node >= 15
    // den ganzen Prozess.
    tickPlayLog().catch((err) => {
      console.warn(`${new Date().toLocaleString()}: [play-log] tick failed: ${(err as Error).message}`)
    })
    if (++playLogTickCount >= PLAY_LOG_TRIM_EVERY_TICKS) {
      playLogTickCount = 0
      trimPlayLog()
    }
  }, PLAY_LOG_POLL_MS)
  if (typeof timer.unref === 'function') timer.unref()
  // pm2 restart / shutdown: close the running track, otherwise the history counts it until the next start.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      closePlayLogEntry(lastPlaySeenTs ?? Date.now(), true)
      process.exit(0)
    })
  }
}

// === End Phase 18 Item 4 =======================================================

// === Phase 18 Item 6: Battery-Log poller =======================================
// /tmp/.rrd only tracks CPU/RAM/temp, NOT the battery. So we sample
// /api/mupihat ourselves once a minute and write a jsonl. Trim to keep
// roughly the last 8 days (more than enough for a 24h chart; cap stops
// the file growing without bound).

const BATTERY_LOG_PATH = '/home/dietpi/.mupibox/battery_log.jsonl'
const BATTERY_LOG_POLL_MS = 60_000
const BATTERY_LOG_KEEP_DAYS = 8
const BATTERY_LOG_TRIM_EVERY_TICKS = 60 // ≈ every hour
let batteryLogTickCount = 0

function readMupihatSnapshot(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(mupihat)) return null
    const raw = fs.readFileSync(mupihat, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function trimBatteryLog(): void {
  try {
    if (!fs.existsSync(BATTERY_LOG_PATH)) return
    const cutoffMs = Date.now() - BATTERY_LOG_KEEP_DAYS * 24 * 3600 * 1000
    const raw = fs.readFileSync(BATTERY_LOG_PATH, 'utf8')
    const kept: string[] = []
    for (const ln of raw.split('\n')) {
      if (!ln) continue
      try {
        const e = JSON.parse(ln) as { ts?: string }
        if (e.ts && Date.parse(e.ts) >= cutoffMs) kept.push(ln)
      } catch {
        /* skip malformed */
      }
    }
    const tmp = `${BATTERY_LOG_PATH}.tmp.${process.pid}`
    fs.writeFileSync(tmp, kept.length ? `${kept.join('\n')}\n` : '', 'utf8')
    fs.renameSync(tmp, BATTERY_LOG_PATH)
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [battery-log] trim failed: ${(err as Error).message}`)
  }
}

function tickBatteryLog(): void {
  const snap = readMupihatSnapshot()
  if (!snap) return
  // (values the MuPiHAT service no longer updates are not logged: they drew a flat line for hours)
  if (!checkHatFresh()) return
  const entry = {
    ts: new Date().toISOString(),
    vbat: typeof snap.Vbat === 'number' ? snap.Vbat : null,
    vbus: typeof snap.Vbus === 'number' ? snap.Vbus : null,
    ibat: typeof snap.Ibat === 'number' ? snap.Ibat : null,
    percent: typeof snap.Bat_Percent === 'number' ? snap.Bat_Percent : null,
    charger_status: typeof snap.Charger_Status === 'string' ? snap.Charger_Status : null,
    temp: typeof snap.Temp === 'number' ? snap.Temp : null,
  }
  fs.appendFile(BATTERY_LOG_PATH, `${JSON.stringify(entry)}\n`, (err) => {
    if (err) console.warn(`${new Date().toLocaleString()}: [battery-log] append failed: ${err.message}`)
  })
  batteryLogTickCount++
  if (batteryLogTickCount >= BATTERY_LOG_TRIM_EVERY_TICKS) {
    batteryLogTickCount = 0
    trimBatteryLog()
  }
  checkCharging(snap)
}

// === The battery values do not change any more ===
// The MuPiHAT service can hang without ending (systemd's restart does not help then): /tmp/mupihat.json stays as it
// was - on 28.09. for hours, the battery log drew a flat line and the charging check had nothing to go by. After
// 5 minutes the service is restarted once; if that does not help, after 10 minutes a notice in the app (/api/mupihat
// BatteryStaleSince) and one Telegram message. Only with the MuPiHAT switched on.
const HAT_FRESH_MS = 3 * 60_000
const HAT_RESTART_AFTER_MS = 5 * 60_000
const HAT_WARN_AFTER_MS = 10 * 60_000
let hatStaleSince: number | null = null
let hatRestarted = false
let hatStaleWarned = false

/** false: the values are older than 3 minutes (and the service is restarted / the parents told, see above) */
function checkHatFresh(): boolean {
  let written: number
  try {
    written = fs.statSync(mupihat).mtimeMs
  } catch {
    return false
  }
  const age = Date.now() - written
  if (age < HAT_FRESH_MS) {
    hatStaleSince = null
    hatRestarted = false
    hatStaleWarned = false
    return true
  }
  const hat = (getMupiboxConfigSync()?.mupihat as { hat_active?: unknown } | undefined) ?? {}
  if (hat.hat_active !== true) return false
  hatStaleSince = written
  if (!hatRestarted && age >= HAT_RESTART_AFTER_MS) {
    hatRestarted = true
    console.warn(`${new Date().toLocaleString()}: [battery] MuPiHAT values ${Math.round(age / 60_000)} min old - restarting mupi_hat`)
    execFile('sudo', ['systemctl', 'restart', 'mupi_hat'], { timeout: 60_000 }, () => undefined)
  }
  if (!hatStaleWarned && age >= HAT_WARN_AFTER_MS) {
    hatStaleWarned = true
    console.warn(`${new Date().toLocaleString()}: [battery] MuPiHAT values still ${Math.round(age / 60_000)} min old after the restart`)
    execFile('/usr/bin/python3', ['/usr/local/bin/mupibox/telegram_send_message.py', '--key', 'n_battery_stale', `mins=${Math.round(age / 60_000)}`], { timeout: 60_000 }, () => undefined)
  }
  return false
}

// === The battery does not charge although the power supply is plugged in ===
// The charger chip of the MuPiHAT can get stuck with the power supply plugged in: its converter stops (VINDPM at 22 V,
// input limit 500 mA), the box runs on the battery all night. Nothing in the chip's registers brings it back - only
// unplugging the power supply for a moment does. So: after 10 minutes like this, a notice in the app (/api/mupihat
// ChargeProblemSince) and one Telegram message per case.
const CHARGE_PROBLEM_AFTER_MS = 10 * 60_000
let notChargingSince: number | null = null
let chargeProblemSince: number | null = null
let chargingAgainTicks = 0

function checkCharging(snap: Record<string, unknown>): void {
  // (values older than 3 minutes: the MuPiHAT service does not read the chip - nothing to judge by)
  const fresh = (() => {
    try {
      return Date.now() - fs.statSync(mupihat).mtimeMs < 3 * 60_000
    } catch {
      return false
    }
  })()
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const vbus = num(snap.Vbus)
  const ibat = num(snap.Ibat)
  const percent = num(snap.Bat_Percent)
  const status = typeof snap.Charger_Status === 'string' ? snap.Charger_Status : ''
  if (!fresh || snap.BatteryConnected !== 1 || vbus === null || percent === null) return
  const plugged = vbus >= 4500
  const full = percent >= 95 || /termination|done|top-?off/i.test(status)
  const stuck = plugged && !full && /not charging/i.test(status) && (ibat ?? 0) <= 50
  if (stuck) {
    chargingAgainTicks = 0
    notChargingSince ??= Date.now()
    if (chargeProblemSince === null && Date.now() - notChargingSince >= CHARGE_PROBLEM_AFTER_MS) {
      chargeProblemSince = notChargingSince
      console.warn(`${new Date().toLocaleString()}: [battery] not charging with the power supply plugged in (${vbus} mV, ${ibat} mA)`)
      execFile('/usr/bin/python3', ['/usr/local/bin/mupibox/telegram_send_message.py', '--key', 'n_battery_not_charging', `soc=${percent} %`], { timeout: 60_000 }, () => undefined)
    }
    return
  }
  // (over again after two good readings in a row: one reading of a changing charger is no proof)
  if (++chargingAgainTicks >= 2) {
    notChargingSince = null
    chargeProblemSince = null
  }
}

function startBatteryLogPoller(): void {
  // First tick after 5 s so we have a starting datapoint without waiting a full minute.
  setTimeout(() => {
    tickBatteryLog()
    const timer = setInterval(tickBatteryLog, BATTERY_LOG_POLL_MS)
    if (typeof timer.unref === 'function') timer.unref()
  }, 5000).unref?.()
}

// === End Phase 18 Item 6 =======================================================

// Logical-day computation must match the player's `getLogicalDay` so `todayBonus`
// works consistently across processes (resetHour shifts when "today" begins).
function computeLogicalDate(now: Date, resetHour: number): string {
  const shifted = new Date(now.getTime() - resetHour * 3600 * 1000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// POST /api/playtime/extend  body: { minutes: number }
// Adds bonus minutes to today's playtime cap. If the day rolls over at the
// configured resetHour, the bonus auto-clears (player checks the date field).
// Calling extend repeatedly accumulates: existing bonus for today is kept and
// added to. Always uses the *current* day at the time of call, so e.g. an
// /extend at 23:30 with resetHour=4 still applies to "today" until 04:00.
app.post('/api/playtime/extend', localOrElternSession, async (req, res) => {
  const minutes = Number(req.body?.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    res.status(400).json({ error: 'minutes must be a positive number <= 1440' })
    return
  }
  try {
    await updateMupiboxConfig((cfg) => {
      let pl = cfg.playtimeLimit as Record<string, unknown> | undefined
      if (!pl || typeof pl !== 'object') {
        pl = {}
        cfg.playtimeLimit = pl
      }
      const resetHour = Number.isInteger(pl.resetHour) ? (pl.resetHour as number) : 0
      const today = computeLogicalDate(new Date(), resetHour)
      const existing = (pl.todayBonus as { date?: string; minutes?: number } | undefined) || {}
      const existingMinutes =
        existing.date === today && Number.isFinite(existing.minutes) ? Number(existing.minutes) : 0
      pl.todayBonus = { date: today, minutes: Math.min(1440, existingMinutes + minutes) }
    })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/extend +${minutes} min`)
    res.status(200).json({ ok: true, addedMinutes: minutes })
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/extend failed:`, err)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/playtime/release  body: { minutes?: number }
// Sets `playbackOverride.allowUntil = now + minutes*60_000`. While that timestamp
// is in the future, all blocks are bypassed. Default 60 min if not specified.
app.post('/api/playtime/release', localOrElternSession, async (req, res) => {
  const minutes = req.body?.minutes !== undefined ? Number(req.body.minutes) : 60
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    res.status(400).json({ error: 'minutes must be a positive number <= 1440' })
    return
  }
  const until = Date.now() + minutes * 60_000
  try {
    await updateMupiboxConfig((cfg) => {
      let ov = cfg.playbackOverride as Record<string, unknown> | undefined
      if (!ov || typeof ov !== 'object') {
        ov = {}
        cfg.playbackOverride = ov
      }
      ov.allowUntil = until
      // The last parent action wins: releasing also ends a running "quiet now". The player lets a force block
      // win over a release, so without this the box stayed blocked although the app said "override active".
      ov.forceBlockUntil = 0
    })
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/release for ${minutes} min (until ${new Date(until).toLocaleString()})`,
    )
    res.status(200).json({ ok: true, minutes, until })
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/release failed:`, err)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/playtime/limit  body: { day: 'mon'|...|'sun', minutes: number }
// Sets the daily playtime cap for one weekday in mupiboxconfig.json. Used by
// the Telegram /limit set bot command so parents can adjust a single day
// without opening the admin UI. Live-reload in the player picks the change up
// within ~50 ms; no restart needed.
const PLAYTIME_DAY_KEYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
app.post('/api/playtime/limit', localOrElternSession, async (req, res) => {
  const day = String(req.body?.day || '').toLowerCase()
  const minutes = Number(req.body?.minutes)
  if (!PLAYTIME_DAY_KEYS.has(day)) {
    res.status(400).json({ error: 'day must be one of mon|tue|wed|thu|fri|sat|sun' })
    return
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
    res.status(400).json({ error: 'minutes must be in [0, 1440]' })
    return
  }
  try {
    await updateMupiboxConfig((cfg) => {
      let pl = cfg.playtimeLimit as Record<string, unknown> | undefined
      if (!pl || typeof pl !== 'object') {
        pl = {}
        cfg.playtimeLimit = pl
      }
      let limits = pl.limitsMinutes as Record<string, unknown> | undefined
      if (!limits || typeof limits !== 'object') {
        limits = {}
        pl.limitsMinutes = limits
      }
      limits[day] = minutes
    })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/limit ${day}=${minutes} min`)
    res.status(200).json({ ok: true, day, minutes })
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/limit failed:`, err)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/quiethours/now  body: { minutes?: number }
// Sets `playbackOverride.forceBlockUntil = now + minutes*60_000`. Forces playback
// off immediately (kid sees the override overlay). Default 60 min.
app.post('/api/quiethours/now', localOrElternSession, async (req, res) => {
  const minutes = req.body?.minutes !== undefined ? Number(req.body.minutes) : 60
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    res.status(400).json({ error: 'minutes must be a positive number <= 1440' })
    return
  }
  const until = Date.now() + minutes * 60_000
  try {
    await updateMupiboxConfig((cfg) => {
      let ov = cfg.playbackOverride as Record<string, unknown> | undefined
      if (!ov || typeof ov !== 'object') {
        ov = {}
        cfg.playbackOverride = ov
      }
      ov.forceBlockUntil = until
      // ... and "quiet now" ends a running release (see /api/playtime/release)
      ov.allowUntil = 0
    })
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] /api/quiethours/now for ${minutes} min (until ${new Date(until).toLocaleString()})`,
    )
    res.status(200).json({ ok: true, minutes, until })
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/quiethours/now failed:`, err)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/playtime/override/clear - ends a parent's "quiet now" or "release" early: the planned times and the daily
// limit count again at once (before, the only way out of "quiet now" was a release, which also lifted the limit)
app.post('/api/playtime/override/clear', localOrElternSession, async (_req, res) => {
  try {
    await updateMupiboxConfig((cfg) => {
      const ov = cfg.playbackOverride as Record<string, unknown> | undefined
      if (ov && typeof ov === 'object') {
        ov.forceBlockUntil = 0
        ov.allowUntil = 0
      }
    })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/override/clear`)
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/playtime/override/clear failed:`, err)
    res.status(500).json({ error: 'internal error' })
  }
})

app.get('/api/activeresume', (_req, res) => {
  // active_resume.json is a symlink that scripts/mupibox/check_network.sh
  // creates the first time the network state is determined. Until that runs
  // (briefly after boot) the symlink is missing — without an explicit empty
  // response the request hung silently and the resume page stuck on Loading.
  if (!fs.existsSync(activeresumeFile)) {
    res.json([])
    return
  }
  jsonfile.readFile(activeresumeFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/activeresume read active_resume.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json([])
    } else {
      // Lazy back-fill in-memory: legacy entries written before the
      // lastPlayedAt field gain synthetic stamps so frontend's DESC sort
      // produces the same visible order as the old blind .reverse() until
      // a real save persists a fresh stamp. No write here — file gets the
      // back-fill on the next /api/addresume call.
      if (Array.isArray(data)) backfillLastPlayedAt(data, Date.now())
      res.json(data)
    }
  })
})

app.get('/api/network', (_req, res) => {
  if (fs.existsSync(networkFile)) {
    tryReadFile(networkFile)
      .then((data) => {
        res.json(data)
      })
      .catch((error) => {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/network read network.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.status(500).send('Internal Server Error')
      })
  } else {
    res.status(404).send(`File Not Found: ${networkFile}`)
  }
})

app.get('/api/monitor', (req, res) => {
  const isLocalhost = isLoopback(req) || (!viaProxy(req) && req.hostname.indexOf('localhost') !== -1)

  if (fs.existsSync(monitorFile) && isLocalhost) {
    jsonfile.readFile(monitorFile, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/monitor read monitor.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json({ monitor: 'On' })
      } else {
        res.json(data)
      }
    })
  } else {
    res.json({ monitor: 'On' })
  }
})

app.get('/api/albumstop', (_req, res) => {
  if (fs.existsSync(albumstopFile)) {
    jsonfile.readFile(albumstopFile, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/albumstop read albumstop.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json({})
      } else {
        res.json(data)
      }
    })
  } else {
    res.json({})
  }
})

app.get('/api/wlan', (_req, res) => {
  // Same shape as /api/data and /api/mupihat — empty array when the file
  // hasn't been written yet, instead of an open connection that never closes.
  if (!fs.existsSync(wlanFile)) {
    res.json([])
    return
  }
  jsonfile.readFile(wlanFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/wlan read wlan.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      res.json([])
    } else {
      // Queued entries carry the WiFi password in plain text; nobody reading this needs it.
      res.json(redactSecrets(data))
    }
  })
})

app.post('/api/addwlan', (req, res) => {
  // Same rule as add_wifi.sh (and WPA itself): no password = open network, else 8..63 characters.
  const pw = req.body?.pw
  if (pw !== undefined && pw !== '' && (typeof pw !== 'string' || pw.length < 8 || pw.length > 63)) {
    res.status(400).send('WiFi password must be 8 to 63 characters')
    return
  }
  jsonfile.readFile(wlanFile, (error, data) => {
    let out = data

    if (error) out = []
    out.push(req.body)

    writeJsonAtomic(wlanFile, out, (writeError) => {
      // The previous code did `if (writeError) throw error` — async-throw
      // inside a node-style callback isn't catchable by Express, so it
      // crashed the entire backend-api process. Send a 500 instead.
      if (writeError) {
        console.error(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/addwlan write failed:`,
          writeError,
        )
        res.status(500).send('Failed to persist WLAN entry')
        return
      }
      res.status(200).send('ok')
    })
  })
})

// --------------------------------------------
// WiFi: already configured networks (wpa_supplicant)
// --------------------------------------------

interface WifiConfiguredNetwork {
  id: number
  ssid: string
  current: boolean
}

function parseWpaCliNetworks(stdout: string): WifiConfiguredNetwork[] {
  return stdout
    .split('\n')
    .slice(1) // header line: "network id / ssid / bssid / flags"
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('\t')
      return {
        id: Number.parseInt(parts[0], 10),
        ssid: parts[1] ?? '',
        current: (parts[3] ?? '').includes('[CURRENT]'),
      }
    })
    .filter((network) => !Number.isNaN(network.id))
}

// The WiFi adapter in use: a USB adapter if there is one, else the onboard one (mupi_wifi_iface.sh).
// The name is asked for at most every few seconds, an adapter can be plugged in or removed at any time.
let wifiInterfaceCache: { name: string; at: number } | undefined
async function wifiInterface(): Promise<string> {
  if (wifiInterfaceCache && Date.now() - wifiInterfaceCache.at < 3000) {
    return wifiInterfaceCache.name
  }
  let name = 'wlan0'
  try {
    const { stdout } = await execFileAsync('/usr/local/bin/mupibox/mupi_wifi_iface.sh', [])
    if (/^wl[\w.-]+$/.test(stdout.trim())) {
      name = stdout.trim()
    }
  } catch {
    // Without the script the onboard adapter is used, as before.
  }
  wifiInterfaceCache = { name, at: Date.now() }
  return name
}

// Which link carries the default route right now: WiFi, ethernet (a network cable), or none. The WiFi
// settings page uses this to switch itself into a LAN view when the box is connected by cable.
async function activeLink(): Promise<{ type: 'wifi' | 'ethernet' | 'none'; interface?: string }> {
  try {
    const { stdout } = await execFileAsync('ip', ['-4', 'route', 'show', 'default'])
    const routed = /\bdev (\S+)/.exec(stdout)?.[1]
    if (!routed) {
      return { type: 'none' }
    }
    const isWireless = fs.existsSync(`/sys/class/net/${routed}/wireless`)
    return { type: isWireless ? 'wifi' : 'ethernet', interface: routed }
  } catch {
    return { type: 'none' }
  }
}

app.get('/api/network/link', async (_req, res) => {
  try {
    res.json(await activeLink())
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading the active link: ${error}`)
    res.status(500).send('error')
  }
})

// Turns the onboard WiFi radio on or off via rfkill (mupi_onboard_wifi.sh), independent of a USB WiFi
// adapter that may also be plugged in. Immediate, no reboot needed.
const ONBOARD_WIFI_SCRIPT = '/usr/local/bin/mupibox/mupi_onboard_wifi.sh'

app.get('/api/network/onboard-wifi', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync(ONBOARD_WIFI_SCRIPT, ['status'])
    const status = stdout.trim()
    res.json({ available: status !== 'unavailable', enabled: status === 'on' })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading onboard WiFi state: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/network/onboard-wifi', localOrElternSession, async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
    await execFileAsync('sudo', [ONBOARD_WIFI_SCRIPT, enabled ? 'on' : 'off'])
    res.send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error toggling onboard WiFi: ${error}`)
    res.status(500).send('error')
  }
})

app.get('/api/wifi/configured', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'list_networks'])
    res.json(parseWpaCliNetworks(stdout))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error listing wifi networks: ${error}`)
    res.status(500).send('error')
  }
})

// The WiFi link as it is right now, for the WiFi page: network.json is only rewritten by a cron job every
// 30 seconds, so a network change would show up there with a delay - and it names the adapter that is not
// necessarily the one in use.
app.get('/api/wifi/status', async (_req, res) => {
  try {
    const wifi = await wifiInterface()
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'status'])
    const field = (name: string) => new RegExp('^' + name + '=(.*)$', 'm').exec(stdout)?.[1]
    const state = field('wpa_state') ?? 'UNKNOWN'
    const connected = state === 'COMPLETED'
    let signalDbm: number | undefined
    if (connected) {
      try {
        const { stdout: poll } = await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'signal_poll'])
        const rssi = /^RSSI=(-?\d+)/m.exec(poll)?.[1]
        signalDbm = rssi === undefined ? undefined : Number.parseInt(rssi, 10)
      } catch {
        // no signal value right now
      }
    }
    let gateway: string | undefined
    try {
      const { stdout: route } = await execFileAsync('ip', ['-4', 'route', 'show', 'default', 'dev', wifi])
      gateway = /via (\S+)/.exec(route)?.[1]
    } catch {
      // no default route on this adapter
    }
    const frequency = field('freq')
    res.json({
      interface: wifi,
      state,
      ssid: connected ? field('ssid') : undefined,
      band: connected && frequency ? wifiBandOf(Number.parseInt(frequency, 10)) : undefined,
      ip: connected ? field('ip_address') : undefined,
      gateway: connected ? gateway : undefined,
      signalDbm,
      signal: signalDbm === undefined ? undefined : wifiSignalPercent(signalDbm),
    })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading wifi status: ${error}`)
    res.status(500).send('error')
  }
})

// wpa_cli prints SSIDs with non-ASCII / special bytes as \xNN escapes.
function decodeWpaSsid(raw: string): string {
  const bytes: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && raw[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 2, i + 4))) {
      bytes.push(Number.parseInt(raw.slice(i + 2, i + 4), 16))
      i += 3
    } else if (raw[i] === '\\' && raw[i + 1] === '\\') {
      bytes.push(0x5c)
      i += 1
    } else {
      bytes.push(...Buffer.from(raw[i]))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

interface WifiScanEntry {
  signalDbm: number
  secured: boolean
  bands: string[] // "2.4", "5" (and "6"): every band the network is broadcast on
}

function wifiBandOf(frequencyMhz: number): string | undefined {
  if (frequencyMhz >= 2400 && frequencyMhz < 2500) {
    return '2.4'
  }
  if (frequencyMhz >= 4900 && frequencyMhz < 5900) {
    return '5'
  }
  if (frequencyMhz >= 5925) {
    return '6'
  }
  return undefined
}

// "bssid / frequency / signal level / flags / ssid" per line; the strongest access
// point wins when a network is broadcast by several.
function parseWpaCliScanResults(stdout: string): Map<string, WifiScanEntry> {
  const networks = new Map<string, WifiScanEntry>()
  for (const line of stdout.split('\n').slice(1)) {
    const parts = line.trim().split('\t')
    if (parts.length < 5) {
      continue
    }
    const signalDbm = Number.parseInt(parts[2], 10)
    const ssid = decodeWpaSsid(parts.slice(4).join('\t'))
    // Hidden networks show up with an empty or all-zero SSID.
    if (Number.isNaN(signalDbm) || ssid.replaceAll('\0', '').trim() === '') {
      continue
    }
    const band = wifiBandOf(Number.parseInt(parts[1], 10))
    const previous = networks.get(ssid)
    const bands = new Set(previous?.bands ?? [])
    if (band) {
      bands.add(band)
    }
    if (!previous || signalDbm > previous.signalDbm) {
      networks.set(ssid, { signalDbm, secured: /WPA|WEP|RSN/.test(parts[3]), bands: [...bands] })
    } else {
      previous.bands = [...bands]
    }
  }
  return networks
}

// Rough dBm -> percent (-100 dBm = 0 %, -50 dBm and better = 100 %).
function wifiSignalPercent(signalDbm: number): number {
  return Math.min(100, Math.max(0, 2 * (signalDbm + 100)))
}

// Which band the box may use for a saved network: both (auto) or only one of them. Kept in the network's
// freq_list in wpa_supplicant.conf.
type WifiBandChoice = 'auto' | '2.4' | '5'
const WIFI_BAND_FREQUENCIES: Record<'2.4' | '5', number[]> = {
  '2.4': [2412, 2417, 2422, 2427, 2432, 2437, 2442, 2447, 2452, 2457, 2462, 2467, 2472],
  '5': [
    5180, 5200, 5220, 5240, 5260, 5280, 5300, 5320, 5500, 5520, 5540, 5560, 5580, 5600, 5620, 5640, 5660, 5680, 5700, 5720,
    5745, 5765, 5785, 5805, 5825, 5845, 5865, 5885, // incl. U-NII-4 (channels 169-177): a router there was cut off with "5 GHz"
  ],
}

// This wpa_supplicant takes a network's freq_list from wpa_cli and reads it from the config file, but does not
// write it back: every save_config drops it. The band choice is therefore kept in the file by MuPiBox itself,
// as one entry per network block (in file order = the order of wpa_cli list_networks), and put back after each
// save_config (wifiSaveConfig). It is only read from the file when wpa_supplicant starts.
const WPA_CONF = '/etc/wpa_supplicant/wpa_supplicant.conf'
interface WifiBandEntry {
  ssid: string | undefined
  frequencies: string // "2412 2417 ..." or '' for both bands
}

function wifiBlocks(text: string): { ssid: string | undefined; body: string }[] {
  return [...text.matchAll(/network\s*=\s*\{([\s\S]*?)\n\s*\}/g)].map((m) => ({
    ssid: /^\s*ssid="(.*)"\s*$/m.exec(m[1])?.[1],
    body: m[1],
  }))
}

function wifiFrequenciesOf(body: string): string {
  const list = /^\s*freq_list=(?:"([^"]*)"|(.*))\s*$/m.exec(body)
  return (list?.[1] ?? list?.[2] ?? '').trim()
}

// The file is often root:root 600 (add_wifi.sh sets that), so it is read through sudo.
async function readWpaConf(): Promise<string> {
  const { stdout } = await execFileAsync('sudo', ['cat', WPA_CONF])
  return stdout
}

async function wifiBandEntries(): Promise<WifiBandEntry[]> {
  try {
    return wifiBlocks(await readWpaConf()).map((b) => ({ ssid: b.ssid, frequencies: wifiFrequenciesOf(b.body) }))
  } catch {
    return []
  }
}

// Writes the entries' freq_list lines into the config file (block by block, only where the SSID still matches).
async function wifiWriteBandEntries(entries: WifiBandEntry[]): Promise<void> {
  const text = await readWpaConf()
  // Nothing to put back and nothing to remove: leave the file alone.
  if (!entries.some((e) => e.frequencies) && !/^s*freq_list=/m.test(text)) return
  let index = 0
  const updated = text.replace(/(network\s*=\s*\{)([\s\S]*?)(\n\s*\})/g, (whole, open: string, body: string, close: string) => {
    const entry = entries[index++]
    const ssid = /^\s*ssid="(.*)"\s*$/m.exec(body)?.[1]
    if (!entry || entry.ssid !== ssid) return whole
    const without = body.replace(/\n[ \t]*freq_list=.*/g, '')
    return `${open}${without}${entry.frequencies ? `\n\tfreq_list=${entry.frequencies}` : ''}${close}`
  })
  if (updated === text) return
  const tmpPath = `/tmp/.wpa_supplicant.${process.pid}.${Date.now()}.conf`
  const nextPath = `${WPA_CONF}.mupibox-new`
  await writeFile(tmpPath, updated, { mode: 0o600 })
  try {
    // Replaced atomically (new file next to it, same owner and mode, then rename): a cp truncated the file
    // first, and a power cut in that moment (box on battery) left the box without any WLAN after reboot.
    await execFileAsync('sudo', ['cp', tmpPath, nextPath])
    await execFileAsync('sudo', ['chown', '--reference', WPA_CONF, nextPath])
    await execFileAsync('sudo', ['chmod', '--reference', WPA_CONF, nextPath])
    await execFileAsync('sudo', ['mv', '-f', nextPath, WPA_CONF])
  } finally {
    await fs.promises.rm(tmpPath, { force: true })
  }
}

// wpa_cli save_config, keeping the band choices. adjust() changes the entries first (a network removed, a band set).
// One save at a time: two requests at once (a double tap, delete + band) read and wrote the file over each other.
let wifiSaveChain: Promise<unknown> = Promise.resolve()
// Returns false if the network change was saved but the band choices could not be put back into the file: the
// save itself worked, so deleting a network or changing a password must not fail because of that.
function wifiSaveConfig(wifi: string, adjust?: (entries: WifiBandEntry[]) => void): Promise<boolean> {
  const run = wifiSaveChain.then(async () => {
    const entries = await wifiBandEntries()
    adjust?.(entries)
    await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'save_config'])
    try {
      await wifiWriteBandEntries(entries)
      return true
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Could not keep the WLAN band choices: ${error}`)
      return false
    }
  })
  wifiSaveChain = run.catch(() => undefined)
  return run
}

// The band choice of every saved network, in the order of wpa_cli list_networks. A position whose SSID does not
// match its block counts as 'auto'.
async function wifiBandChoices(ssidsInOrder: string[]): Promise<WifiBandChoice[]> {
  const entries = await wifiBandEntries()
  return ssidsInOrder.map((ssid, index) => {
    const entry = entries[index]
    if (!entry || (entry.ssid !== undefined && entry.ssid !== ssid) || !entry.frequencies) return 'auto'
    const bands = new Set(
      entry.frequencies
        .split(/\s+/)
        .map((f) => wifiBandOf(Number.parseInt(f, 10)))
        .filter((b) => b !== undefined),
    )
    return bands.size === 1 && bands.has('2.4') ? '2.4' : bands.size === 1 && bands.has('5') ? '5' : 'auto'
  })
}

// The ethernet stanza of /etc/network/interfaces (DietPi's ifupdown config), for the LAN view of the WiFi
// settings page. address/netmask/gateway are kept even in dhcp mode (ifupdown ignores them there) so DietPi's
// own dietpi-config screen and MuPiBox's admin UI recall the same values when switching back to static.
const INTERFACES_FILE = '/etc/network/interfaces'
interface EthernetConfig {
  iface: string
  dhcp: boolean
  ip: string
  mask: string
  gateway: string
  dns: string
}

async function readInterfacesFile(): Promise<string> {
  const { stdout } = await execFileAsync('sudo', ['cat', INTERFACES_FILE])
  return stdout
}

// Finds the "iface ethN inet dhcp|static" line and the address/netmask/gateway/dns-nameservers lines that
// follow it (dns-nameservers may be commented out, DietPi's way of disabling it without losing the value).
function parseEthernetStanza(text: string): (EthernetConfig & { blockStart: number; blockEnd: number }) | null {
  const ifaceMatch = /^iface[ \t]+(eth\w*)[ \t]+inet[ \t]+(dhcp|static)[ \t]*$/m.exec(text)
  if (!ifaceMatch || ifaceMatch.index === undefined) {
    return null
  }
  const blockStart = ifaceMatch.index
  const rest = text.slice(blockStart + ifaceMatch[0].length)
  const bodyMatch = /^((?:\n[ \t]*#?[ \t]*(?:address|netmask|gateway|dns-nameservers)[ \t]+\S+)*)/.exec(rest)
  const body = bodyMatch?.[0] ?? ''
  const field = (name: string) => new RegExp(`^[ \t]*#?[ \t]*${name}[ \t]+(\\S+)`, 'm').exec(body)?.[1] ?? ''
  return {
    iface: ifaceMatch[1],
    dhcp: ifaceMatch[2] === 'dhcp',
    ip: field('address'),
    mask: field('netmask'),
    gateway: field('gateway'),
    dns: field('dns-nameservers'),
    blockStart,
    blockEnd: blockStart + ifaceMatch[0].length + body.length,
  }
}

function renderEthernetStanza(cfg: EthernetConfig): string {
  const lines = [`iface ${cfg.iface} inet ${cfg.dhcp ? 'dhcp' : 'static'}`]
  if (cfg.ip) lines.push(`address ${cfg.ip}`)
  if (cfg.mask) lines.push(`netmask ${cfg.mask}`)
  if (cfg.gateway) lines.push(`gateway ${cfg.gateway}`)
  // Kept but commented out under dhcp, same as DietPi does, so a later switch to static recalls it.
  if (cfg.dns) lines.push(`${cfg.dhcp ? '#' : ''}dns-nameservers ${cfg.dns}`)
  return lines.join('\n')
}

async function writeEthernetConfig(next: EthernetConfig): Promise<void> {
  const text = await readInterfacesFile()
  const parsed = parseEthernetStanza(text)
  if (!parsed) {
    throw new Error('no ethernet interface configured in /etc/network/interfaces')
  }
  const updated = text.slice(0, parsed.blockStart) + renderEthernetStanza({ ...next, iface: parsed.iface }) + text.slice(parsed.blockEnd)
  if (updated === text) {
    return
  }
  const tmpPath = `/tmp/.interfaces.${process.pid}.${Date.now()}`
  const nextPath = `${INTERFACES_FILE}.mupibox-new`
  await writeFile(tmpPath, updated, { mode: 0o644 })
  try {
    // Same atomic replace as the WPA config (new file next to it, same owner and mode, then rename) so a
    // power cut mid-write cannot leave the box without a valid interfaces file.
    await execFileAsync('sudo', ['cp', tmpPath, nextPath])
    await execFileAsync('sudo', ['chown', '--reference', INTERFACES_FILE, nextPath])
    await execFileAsync('sudo', ['chmod', '--reference', INTERFACES_FILE, nextPath])
    await execFileAsync('sudo', ['mv', '-f', nextPath, INTERFACES_FILE])
  } finally {
    await fs.promises.rm(tmpPath, { force: true })
  }
}

// One save at a time, same reasoning as wifiSaveConfig: two requests at once could read and write the file
// over each other.
let ethernetSaveChain: Promise<unknown> = Promise.resolve()
function saveEthernetConfig(next: EthernetConfig): Promise<void> {
  const run = ethernetSaveChain.then(() => writeEthernetConfig(next))
  ethernetSaveChain = run.catch(() => undefined)
  return run
}

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

app.get('/api/network/ethernet', async (_req, res) => {
  try {
    const parsed = parseEthernetStanza(await readInterfacesFile())
    if (!parsed) {
      res.status(404).send('no ethernet interface configured')
      return
    }
    let currentIp: string | undefined
    let currentGateway: string | undefined
    try {
      const { stdout } = await execFileAsync('ip', ['-4', 'addr', 'show', parsed.iface])
      currentIp = /inet (\S+)\//.exec(stdout)?.[1]
    } catch {
      // interface down or unknown
    }
    try {
      const { stdout } = await execFileAsync('ip', ['-4', 'route', 'show', 'default', 'dev', parsed.iface])
      currentGateway = /via (\S+)/.exec(stdout)?.[1]
    } catch {
      // no default route on this interface
    }
    let linkUp = false
    try {
      const { stdout } = await execFileAsync('ip', ['link', 'show', parsed.iface])
      linkUp = /<[^>]*\bUP\b[^>]*>/.test(stdout)
    } catch {
      // interface unknown
    }
    res.json({
      interface: parsed.iface,
      dhcp: parsed.dhcp,
      ip: parsed.ip,
      mask: parsed.mask,
      gateway: parsed.gateway,
      dns: parsed.dns,
      currentIp,
      currentGateway,
      linkUp,
      // switched off (POST /power): stays down, also after a restart
      off: fs.existsSync(LAN_OFF_FILE),
    })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading ethernet config: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/network/ethernet', localOrElternSession, async (req, res) => {
  try {
    const dhcp = Boolean(req.body?.dhcp)
    const ip = String(req.body?.ip ?? '').trim()
    const mask = String(req.body?.mask ?? '').trim()
    const gateway = String(req.body?.gateway ?? '').trim()
    const dns = String(req.body?.dns ?? '').trim()
    if (!dhcp) {
      const required: [string, string][] = [
        ['Static IP', ip],
        ['Static mask', mask],
        ['Static gateway', gateway],
      ]
      for (const [label, value] of required) {
        if (!IPV4_PATTERN.test(value)) {
          res.status(400).send(`${label} is not a valid IPv4 address`)
          return
        }
      }
    }
    if (dns && !IPV4_PATTERN.test(dns)) {
      res.status(400).send('Static DNS is not a valid IPv4 address')
      return
    }
    const parsed = parseEthernetStanza(await readInterfacesFile())
    if (!parsed) {
      res.status(404).send('no ethernet interface configured')
      return
    }
    await saveEthernetConfig({ iface: parsed.iface, dhcp, ip, mask, gateway, dns })
    res.send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error saving ethernet config: ${error}`)
    res.status(500).send('error')
  }
})

const LAN_OFF_FILE = '/etc/mupibox/lan.off'

// Brings the ethernet port itself up or down (administratively), independent of its DHCP/STATIC config.
// Immediate - unlike /restart above, this can cut a connection that is currently going over this same
// interface (e.g. the admin page reached through the LAN cable) with no way to undo it remotely.
app.post('/api/network/ethernet/power', localOrElternSession, async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
    const parsed = parseEthernetStanza(await readInterfacesFile())
    if (!parsed) {
      res.status(404).send('no ethernet interface configured')
      return
    }
    // (the switch is kept in LAN_OFF_FILE: mupi_ethernet.sh leaves the port down while it exists, also after a
    // restart - a port only set down was taken for a pulled cable and set up again at once)
    if (enabled) {
      await execFileAsync('sudo', ['rm', '-f', LAN_OFF_FILE])
      await execFileAsync('sudo', ['ip', 'link', 'set', parsed.iface, 'up'])
    } else {
      await execFileAsync('sudo', ['touch', LAN_OFF_FILE])
      await execFileAsync('sudo', ['ip', 'link', 'set', parsed.iface, 'down'])
    }
    res.send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error powering ethernet ${req.body?.enabled ? 'up' : 'down'}: ${error}`)
    res.status(500).send('error')
  }
})

// Restarts the ethernet interface so a saved config takes effect, mirroring the WiFi "Restart" button.
app.post('/api/network/ethernet/restart', localOrElternSession, async (_req, res) => {
  try {
    const parsed = parseEthernetStanza(await readInterfacesFile())
    if (!parsed) {
      res.status(404).send('no ethernet interface configured')
      return
    }
    // (ifup@eth0.service starts nothing any more, see config/services/ifup@eth0.service.d/mupibox.conf: the new
    // config is applied by taking the interface down and up here; a port switched off stays off)
    if (!fs.existsSync(LAN_OFF_FILE)) {
      await execFileAsync('sudo', ['ifdown', '--force', parsed.iface]).catch(() => undefined)
      await execFileAsync('sudo', ['ip', 'link', 'set', parsed.iface, 'up'])
      await execFileAsync('sudo', ['ifup', '--allow=hotplug', parsed.iface], { timeout: 30000 }).catch(() => undefined)
      execFile('sudo', ['/usr/local/bin/mupibox/mupi_wifi_select.sh'], { timeout: 300000 }, () => undefined)
    }
    res.send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error restarting ethernet: ${error}`)
    res.status(500).send('error')
  }
})

interface WifiNetworkInfo {
  ssid: string
  id?: number
  current: boolean
  available: boolean
  signalDbm?: number
  signal?: number
  secured?: boolean
  bands?: string[] // bands the network is available on ("2.4", "5", "6")
  connectedBand?: string // the band in use, for the connected network only
  band?: WifiBandChoice // saved networks: which band the box may use for it
}

// Networks in range (strongest first) merged with the saved ones; saved networks
// that are not in range are listed last and marked as not available.
app.get('/api/wifi/networks', async (req, res) => {
  try {
    if (req.query.refresh !== '0') {
      try {
        await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'scan'])
        await new Promise((resolve) => setTimeout(resolve, 3500))
      } catch {
        // A scan may already be running or the adapter busy - the last results are still usable.
      }
    }

    const { stdout: configuredOutput } = await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'list_networks'])
    let scanned = new Map<string, WifiScanEntry>()
    try {
      const { stdout: scanOutput } = await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'scan_results'])
      scanned = parseWpaCliScanResults(scanOutput)
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading wifi scan results: ${error}`)
    }

    // The band the box is connected on right now.
    let connectedBand: string | undefined
    try {
      const { stdout: statusOutput } = await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'status'])
      const frequency = /^freq=(\d+)/m.exec(statusOutput)?.[1]
      connectedBand = frequency ? wifiBandOf(Number.parseInt(frequency, 10)) : undefined
    } catch {
      // Not connected or wpa_cli busy: no band to show.
    }

    const networks: WifiNetworkInfo[] = []
    const configuredNetworks = parseWpaCliNetworks(configuredOutput)
    const bandChoices = await wifiBandChoices(configuredNetworks.map((n) => n.ssid))
    for (const [position, configured] of configuredNetworks.entries()) {
      const ssid = decodeWpaSsid(configured.ssid)
      const found = scanned.get(ssid)
      scanned.delete(ssid)
      networks.push({
        ssid,
        id: configured.id,
        current: configured.current,
        // The connected network is in range by definition, even if the scan missed it.
        available: found !== undefined || configured.current,
        signalDbm: found?.signalDbm,
        signal: found ? wifiSignalPercent(found.signalDbm) : undefined,
        secured: found?.secured,
        bands: found?.bands,
        connectedBand: configured.current ? connectedBand : undefined,
        band: bandChoices[position],
      })
    }
    for (const [ssid, found] of scanned) {
      networks.push({
        ssid,
        current: false,
        available: true,
        signalDbm: found.signalDbm,
        signal: wifiSignalPercent(found.signalDbm),
        secured: found.secured,
        bands: found.bands,
      })
    }

    networks.sort((a, b) => {
      if (a.available !== b.available) {
        return a.available ? -1 : 1
      }
      return (b.signalDbm ?? -200) - (a.signalDbm ?? -200) || a.ssid.localeCompare(b.ssid)
    })
    res.json(networks)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error listing wifi networks: ${error}`)
    res.status(500).send('error')
  }
})

app.delete('/api/wifi/configured/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (Number.isNaN(id)) {
    res.status(400).send('invalid id')
    return
  }

  try {
    const wifi = await wifiInterface()
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'list_networks'])
    const position = parseWpaCliNetworks(stdout).findIndex((n) => n.id === id)
    await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'remove_network', String(id)])
    await wifiSaveConfig(wifi, (entries) => {
      if (position >= 0) entries.splice(position, 1)
    })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Removed wifi network ${id}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error removing wifi network ${id}: ${error}`)
    res.status(500).send('error')
  }
})

// Lets the box use only the 2.4 or only the 5 GHz band for a saved network, or both again ('auto').
// Only makes sense for a network that is broadcast on both bands; the page offers it only then.
app.post('/api/wifi/configured/:id/band', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  const band: unknown = req.body?.band
  if (Number.isNaN(id) || (band !== 'auto' && band !== '2.4' && band !== '5')) {
    res.status(400).send('invalid request')
    return
  }

  try {
    const wifi = await wifiInterface()
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'list_networks'])
    const saved = parseWpaCliNetworks(stdout)
    const position = saved.findIndex((n) => n.id === id)
    if (position < 0) {
      res.status(404).send('unknown network')
      return
    }
    const frequencies = band === 'auto' ? [] : WIFI_BAND_FREQUENCIES[band]
    // The choice belongs to the network, not to one profile: a network saved twice under the same name (added
    // again) would otherwise stay usable on the other band through the profile that was not changed -
    // wpa_supplicant simply connects with the better one. (Only the exact same name counts.)
    const sameNetwork = saved.map((network, index) => ({ network, index })).filter(({ network }) => network.ssid === saved[position].ssid)
    for (const { network } of sameNetwork) {
      // In effect at once (an empty value lifts the limit) ...
      await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'set_network', String(network.id), 'freq_list', frequencies.join(' ')])
    }
    // ... and kept in the file for the next start of wpa_supplicant
    await wifiSaveConfig(wifi, (entries) => {
      for (const { index } of sameNetwork) {
        if (entries[index]) entries[index].frequencies = frequencies.join(' ')
      }
    })
    // Connected right now: connect again so the choice takes effect (a few seconds without network).
    if (sameNetwork.some(({ network }) => network.current)) {
      await execFileAsync('sudo', ['wpa_cli', '-i', wifi, 'reassociate'])
    }
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Wifi network ${id}: band ${band}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error setting band of wifi network ${id}: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/wifi/configured/:id/password', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  const password: string = req.body?.password ?? ''
  if (Number.isNaN(id) || password.length < 8 || password.length > 63) {
    res.status(400).send('invalid request')
    return
  }

  try {
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'set_network', String(id), 'psk', `"${password}"`])
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'enable_network', String(id)])
    await wifiSaveConfig(await wifiInterface())
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Updated password for wifi network ${id}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error updating wifi network ${id}: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/add', (req, res) => {
  const lockResult = acquireLock(dataLock, '/api/add')
  if (lockResult === 'locked') {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/add data.json is locked`)
    res.status(200).send('locked')
    return
  }
  if (lockResult === 'error') {
    res.status(200).send('error')
    return
  }
  jsonfile.readFile(dataFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/add read data.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      releaseLock(dataLock, '/api/add')
      res.status(200).send('error')
      return
    }
    // Phase 14a: stamp every Add-Page / Telegram / Admin entry with
    // source='manual'. Smart-Sync uses this discriminator to leave manual
    // entries untouched. The Spotify-sync service (Phase 14b) sets
    // source='spotify-sync' on its own writes and bypasses /api/add.
    const newEntry = { source: 'manual', ...req.body }
    if (newEntry.source !== 'manual' && newEntry.source !== 'spotify-sync') {
      newEntry.source = 'manual'
    }
    data.push(newEntry)
    renumberLibrary(data)
    writeJsonAtomic(dataFile, data, (writeError) => {
      releaseLock(dataLock, '/api/add')
      if (writeError) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/add write failed:`, writeError)
        res.status(500).send('error')
        return
      }
      res.status(200).send('ok')
    })
  })
})

// data.json, resume.json and wlan.json were written straight into the target file: a power cut
// or a crash mid-write left a cut-off JSON (the library or the resume list unreadable). Written
// next to the target and renamed over it instead, so a reader sees the old or the new file.
function writeJsonAtomic(file: string, data: unknown, callback: (error: Error | null) => void): void {
  // The library: keep the version this write replaces (a bad edit once wiped an entry and there was nothing to go back to).
  if (file === dataFile) backupBeforeWrite(file)
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  jsonfile.writeFile(tmp, data, { spaces: 4 }, (writeError) => {
    if (writeError) {
      fs.rm(tmp, { force: true }, () => callback(writeError))
      return
    }
    fs.rename(tmp, file, (renameError) => {
      if (renameError) {
        fs.rm(tmp, { force: true }, () => callback(renameError))
        return
      }
      callback(null)
    })
  })
}

// Stable composite key for resume entries. Plain `id` matching is unreliable
// because Library/RSS items often don't carry an `id`; without a stable key
// every id-less save would either overwrite the first id-less entry or pile
// up duplicates. Mirror the resolution order frontend uses to dispatch
// playback (playlistid/showid/audiobookid/id), and fall back to artist::title
// as a last resort.
const resumeKeyOf = (m: { type?: string; id?: string; playlistid?: string; showid?: string; audiobookid?: string; artist?: string; title?: string }) =>
  [
    m?.type || '',
    m?.playlistid || m?.showid || m?.audiobookid || m?.id || `${m?.artist || ''}::${m?.title || ''}`,
  ].join('|')

// AR5-18: when mplayer fires playlist-finish, backend-player POSTs
// /api/deleteresume to remove the now-completed album from the resume list.
// At the same instant the frontend's player page notices the playback ended
// and POSTs /api/addresume to save "where we last were". The file lock here
// serialises the two writes, but the order is non-deterministic: if
// addresume wins after deleteresume, the resume entry gets resurrected and
// the kid is offered "weiterhören" at the very last second of an album that
// just finished — defeating the whole point of deleteresume on playlist-end.
//
// Mitigation: track recently-deleted composite keys for a short rejection
// window. While a key is in this map, an addresume for that key is silently
// skipped (still 200 ok). 2.5s comfortably covers the worst case: mplayer
// playlist-finish → backend-player HTTP → /api/deleteresume → frontend
// observes paused state → /api/addresume, with SD-induced delays.
const RESUME_REJECT_AFTER_DELETE_MS = 2500
const recentResumeDeletes = new Map<string, number>()
const noteResumeDeleted = (key: string) => {
  recentResumeDeletes.set(key, Date.now())
}
const wasResumeJustDeleted = (key: string): boolean => {
  const stamp = recentResumeDeletes.get(key)
  if (stamp === undefined) return false
  if (Date.now() - stamp > RESUME_REJECT_AFTER_DELETE_MS) {
    recentResumeDeletes.delete(key)
    return false
  }
  return true
}
// Tidy the map every minute so a long-running backend doesn't accumulate
// keys forever. Lookups already self-expire, but stale entries hold memory
// until they're looked up — a periodic sweep bounds the worst case.
setInterval(() => {
  const cutoff = Date.now() - RESUME_REJECT_AFTER_DELETE_MS
  for (const [k, t] of recentResumeDeletes) {
    if (t < cutoff) recentResumeDeletes.delete(k)
  }
}, 60_000).unref?.()

// Back-fill lastPlayedAt for legacy resume entries that pre-date the field.
// Reasoning: the previous addresume implementation did update-in-place when
// an entry already existed, so an item the user was actively replaying
// stayed at its original index — and idx 0 typically holds the item that
// was last replayed in-place. Set synthetic stamps so idx 0 gets the
// LARGEST stamp (most-recently-updated) and idx N the smallest. After
// frontend's DESC sort that places the user's last-replayed item at
// position 1 (left). Real saves use Date.now(), which is always larger
// than these synthetic stamps, so a fresh playback always wins.
// Idempotent: no-ops once every entry has a numeric stamp.
function backfillLastPlayedAt(data: any[], now: number): void {
  const baseTime = now - data.length * 1000 - 60000
  const lastIdx = data.length - 1
  data.forEach((entry: any, idx: number) => {
    if (typeof entry.lastPlayedAt !== 'number') {
      // Invert: idx 0 → largest stamp (lastIdx ms), idx N → smallest.
      entry.lastPlayedAt = baseTime + (lastIdx - idx)
    }
  })
}

// Resilient resume.json reader. ENOENT (fresh box, file not yet created) and
// JSON parse errors both used to leave the endpoint stuck — every save would
// 200 "error" until somebody manually fixed the file. Now: missing file is
// treated as "[]"; corrupt file is moved aside to resume.json.bak.<epoch>
// (so it can still be inspected) and the live save proceeds against an empty
// array. The contract is "next save lands no matter what" — losing one
// session of accumulated resume entries on rare corruption beats wedging the
// feature for the rest of the box's lifetime.
const readResumeOrRecover = (context: string, cb: (data: any[]) => void) => {
  jsonfile.readFile(resumeFile, (error, data) => {
    if (!error) {
      cb(Array.isArray(data) ? data : [])
      return
    }
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      cb([])
      return
    }
    const backupPath = `${resumeFile}.bak.${Date.now()}`
    fs.rename(resumeFile, backupPath, (renameErr) => {
      if (renameErr) {
        console.error(
          `${new Date().toLocaleString()}: [MuPiBox-Server] ${context} - resume.json unreadable and archive failed (${renameErr.message}); starting fresh.`,
        )
      } else {
        console.warn(
          `${new Date().toLocaleString()}: [MuPiBox-Server] ${context} - resume.json was unreadable, archived to ${backupPath} and starting fresh. Original error: ${error.message}`,
        )
      }
      cb([])
    })
  })
}

app.post('/api/addresume', (req, res) => {
  const lockResult = acquireLock(resumeLock, '/api/addresume')
  if (lockResult === 'locked') {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume resume.json is locked`)
    res.status(200).send('locked')
    return
  }
  if (lockResult === 'error') {
    res.status(200).send('error')
    return
  }
  readResumeOrRecover('/api/addresume', (data) => {
    const now = Date.now()
    const incomingKey = resumeKeyOf(req.body)
    // AR5-18: if backend-player just told us this album finished naturally
    // (POST /api/deleteresume within the last RESUME_REJECT_AFTER_DELETE_MS),
    // refuse to recreate the entry that the frontend's paused-state observer
    // is now racing to save. Respond ok so the frontend doesn't treat the
    // skip as a failure.
    if (wasResumeJustDeleted(incomingKey)) {
      releaseLock(resumeLock, '/api/addresume')
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume skipped (key=${incomingKey} was just deleted on playlist-finish).`)
      res.status(200).send('ok')
      return
    }
    backfillLastPlayedAt(data, now)
    // Always stamp the incoming entry — it was just played now, so it
    // should sort to position 1 on the resume page after frontend's
    // DESC sort by lastPlayedAt.
    const incoming = { ...req.body, lastPlayedAt: now }
    const index = data.findIndex((item: any) => resumeKeyOf(item) === incomingKey)
    if (index !== -1) {
      data[index] = incoming
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Resume entry replaced (key=${incomingKey}).`)
    } else {
      data.push(incoming)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Resume entry added (key=${incomingKey}).`)
    }
    writeJsonAtomic(resumeFile, data, (writeError) => {
      releaseLock(resumeLock, '/api/addresume')
      if (writeError) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume write failed:`, writeError)
        res.status(500).send('error')
        return
      }
      res.status(200).send('ok')
    })
  })
})

// Drop a single resume entry by composite key. Used by the backend-player
// when a library playlist finishes naturally (mplayer playlist-finish) so
// "weiterhören" doesn't keep offering the position of an album the kid has
// listened all the way through. Body shape mirrors a Media (only the key
// fields matter — type + one of playlistid/showid/audiobookid/id, or
// artist::title as a fallback). Idempotent: if no entry matches, 200 ok.
app.post('/api/deleteresume', (req, res) => {
  const lockResult = acquireLock(resumeLock, '/api/deleteresume')
  if (lockResult === 'locked') {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume resume.json is locked`)
    res.status(200).send('locked')
    return
  }
  if (lockResult === 'error') {
    res.status(200).send('error')
    return
  }
  readResumeOrRecover('/api/deleteresume', (data) => {
    const targetKey = resumeKeyOf(req.body)
    // AR5-18: even if no entry matched (idempotent path), still mark the
    // key as recently-deleted. The race window covers the frontend's
    // pending addresume regardless of whether anything was on disk yet.
    noteResumeDeleted(targetKey)
    const remaining = data.filter((item: any) => resumeKeyOf(item) !== targetKey)
    if (remaining.length === data.length) {
      releaseLock(resumeLock, '/api/deleteresume')
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume no entry matched (key=${targetKey}).`)
      res.status(200).send('ok')
      return
    }
    writeJsonAtomic(resumeFile, remaining, (writeError) => {
      releaseLock(resumeLock, '/api/deleteresume')
      if (writeError) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume write failed:`, writeError)
        res.status(500).send('error')
        return
      }
      console.log(
        `${new Date().toLocaleString()}: [MuPiBox-Server] Resume entry removed (key=${targetKey}, ${data.length - remaining.length} match(es)).`,
      )
      res.status(200).send('ok')
    })
  })
})

// Checks for /api/edit and /api/delete. The parents' web app sends the entry as it knew it
// ("original"); if the library changed in between (Smart-Sync, another edit), the index may point to a
// different entry by now, and editing or deleting it would hit the wrong one.
const LIBRARY_ID_KEYS = ['type', 'id', 'artistid', 'playlistid', 'showid', 'audiobookid', 'title', 'artist', 'category']
function sameLibraryEntry(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return LIBRARY_ID_KEYS.every((k) => (x[k] ?? null) === (y[k] ?? null))
}
// Every entry of data.json carries its place as "index" (add_index.sh, the Smart-Sync): edit and delete find an entry by
// it. After an entry was added or deleted here the places moved - they are counted again, else every later edit or
// delete in the app met "library changed" (the display sends the player's INDEX for the same reason).
function renumberLibrary(data: unknown[]): void {
  data.forEach((entry, i) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) (entry as Record<string, unknown>).index = i
  })
}

function libraryIndexProblem(data: unknown, index: unknown, original: unknown): string | null {
  if (!Array.isArray(data)) return 'library unreadable'
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= data.length) return 'bad index'
  if (original !== undefined && !sameLibraryEntry(data[index], original)) return 'library changed'
  return null
}

app.post('/api/delete', (req, res) => {
  const lockResult = acquireLock(dataLock, '/api/delete')
  if (lockResult === 'locked') {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete data.json is locked`)
    res.status(200).send('locked')
    return
  }
  if (lockResult === 'error') {
    res.status(200).send('error')
    return
  }
  jsonfile.readFile(dataFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/delete read data.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      releaseLock(dataLock, '/api/delete')
      res.status(200).send('error')
      return
    }
    const problem = libraryIndexProblem(data, req.body?.index, req.body?.original)
    if (problem) {
      releaseLock(dataLock, '/api/delete')
      res.status(problem === 'library changed' ? 409 : 400).send(problem)
      return
    }
    data.splice(req.body.index, 1)
    renumberLibrary(data)
    writeJsonAtomic(dataFile, data, (writeError) => {
      releaseLock(dataLock, '/api/delete')
      if (writeError) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete write failed:`, writeError)
        res.status(500).send('error')
        return
      }
      res.status(200).send('ok')
    })
  })
})

app.post('/api/edit', (req, res) => {
  // The new entry comes as { index, data }. Without data (the web app used to send the fields next to
  // index) splice() put null into the library, and that entry was gone.
  const entry = req.body?.data
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    res.status(400).send('data missing')
    return
  }
  const lockResult = acquireLock(dataLock, '/api/edit')
  if (lockResult === 'locked') {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit data.json is locked`)
    res.status(200).send('locked')
    return
  }
  if (lockResult === 'error') {
    res.status(200).send('error')
    return
  }
  jsonfile.readFile(dataFile, (error, data) => {
    if (error) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/edit read data.json`)
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
      releaseLock(dataLock, '/api/edit')
      res.status(200).send('error')
      return
    }
    const problem = libraryIndexProblem(data, req.body.index, req.body.original)
    if (problem) {
      releaseLock(dataLock, '/api/edit')
      res.status(problem === 'library changed' ? 409 : 400).send(problem)
      return
    }
    data.splice(req.body.index, 1, entry)
    renumberLibrary(data)
    writeJsonAtomic(dataFile, data, (writeError) => {
      releaseLock(dataLock, '/api/edit')
      if (writeError) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit write failed:`, writeError)
        res.status(500).send('error')
        return
      }
      res.status(200).send('ok')
    })
  })
})

app.get('/api/spotify/config', (_req, res) => {
  if (config?.spotify === undefined) {
    res.status(500).send('Could load spotify config.')
    return
  }
  // Only what the box frontend uses. `...config.spotify` sent the client secret (and whatever
  // else is in that block) to anyone in the LAN - this endpoint has no login.
  res.status(200).send({
    clientId: config.spotify.clientId,
    deviceName: config['node-sonos-http-api'].server,
  })
})

// Unified playlist endpoint with API + Scraper fallback and optimized caching
app.get('/api/spotify/playlist/:playlistId', async (req, res) => {
  const playlistId = req.params.playlistId
  const forceRefresh = req.query.refresh === 'true'

  if (!playlistId) {
    res.status(400).json({ error: 'Playlist ID is required' })
    return
  }

  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const mupiboxConfig = await getMupiboxConfig()
  const disableScraperForPlaylists = Boolean(mupiboxConfig?.spotify?.disableScraperForPlaylists)

  if (disableScraperForPlaylists) {
    try {
      console.log(
        `${new Date().toLocaleString()}: [MuPiBox-Server] Scraper disabled for playlists, using API only: ${playlistId}`,
      )
      const apiData = await spotifyApiService.getPlaylist(playlistId, forceRefresh)
      res.status(200).json(apiData)
    } catch (apiError) {
      console.error(
        `${new Date().toLocaleString()}: [MuPiBox-Server] API failed for playlist ${playlistId} (scraper disabled):`,
        apiError,
      )
      res.status(500).json({
        error: 'Failed to fetch playlist data',
        message: apiError instanceof Error ? apiError.message : 'Unknown error',
      })
    }
    return
  }

  // Step 1: Check scraper cache first (fastest - no API call needed)
  const cachedScraperData = await spotifyMediaInfo.getCachedPlaylistData(playlistId)

  if (cachedScraperData) {
    // Return cached data immediately for best performance
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] ⚡ Returning cached scraper data for playlist: ${cachedScraperData.playlist.name}`,
    )
    res.status(200).json(cachedScraperData)

    // Trigger background update (fire-and-forget) to keep cache fresh
    // This runs async after response is sent
    setImmediate(async () => {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] API failed in background, updating via scraper`)
      await spotifyMediaInfo.fetchPlaylistData(playlistId)
    })

    return
  }

  // Step 2: No cache exists - fetch synchronously (try API first, then scraper)
  try {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Fetching playlist via API: ${playlistId}`)

    // Try API first (fast for public/accessible playlists)
    const apiData = await spotifyApiService.getPlaylist(playlistId, forceRefresh)
    res.status(200).json(apiData)

    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] Successfully fetched playlist via API: ${apiData.name}`,
    )

    // Always try to fetch playlist via scraper
    await spotifyMediaInfo.fetchPlaylistData(playlistId)
  } catch (_apiError) {
    console.log(
      `${new Date().toLocaleString()}: [MuPiBox-Server] API failed for playlist ${playlistId}, trying scraper fallback...`,
    )

    // API failed - use scraper immediately
    try {
      const scraperData = await spotifyMediaInfo.fetchPlaylistData(playlistId)
      res.status(200).json(scraperData)

      console.log(
        `${new Date().toLocaleString()}: [MuPiBox-Server] Successfully fetched playlist via scraper: ${scraperData.playlist.name}`,
      )
    } catch (scraperError) {
      console.error(
        `${new Date().toLocaleString()}: [MuPiBox-Server] Both API and scraper failed for playlist ${playlistId}:`,
        scraperError,
      )
      res.status(500).json({
        error: 'Failed to fetch playlist data',
        message: scraperError instanceof Error ? scraperError.message : 'Unknown error',
      })
    }
  }
})

// Search albums
app.get('/api/spotify/search/albums', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const query = req.query.query as string
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!query) {
    res.status(400).json({ error: 'Query parameter is required' })
    return
  }

  try {
    const results = await spotifyApiService.searchAlbums(query, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error searching albums:`, error)
    res.status(500).json({
      error: 'Failed to search albums',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Phase 17a — combined artist/album/track catalog search for the Eltern-WebApp
// "Bibliothek erweitern" browse screen. Read-only; reuses the box Spotify token.
app.get('/api/spotify/search', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }
  const query = typeof req.query.q === 'string' ? req.query.q : (req.query.query as string)
  if (!query || query.trim().length < 2) {
    res.status(400).json({ error: 'query (q) of at least 2 characters required' })
    return
  }
  const allowed = ['artist', 'album', 'track']
  const rawTypes = typeof req.query.types === 'string' ? req.query.types : 'artist,album,track'
  const types = rawTypes
    .split(',')
    .map((t) => t.trim())
    .filter((t) => allowed.includes(t))
  const limit = Number.parseInt(req.query.limit as string, 10) || 8
  try {
    // biome-ignore lint/suspicious/noExplicitAny: types narrowed to the allow-list above
    const results = await spotifyApiService.searchAll(query.trim(), (types.length ? types : allowed) as any, limit)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error searching Spotify:`, error)
    res.status(500).json({ error: 'Failed to search', message: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// Get artist albums
app.get('/api/spotify/artist/:artistId/albums', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const artistId = req.params.artistId
  const albumTypes = (req.query.album_type as string) || 'album,single,compilation'
  const limit = Number.parseInt(req.query.limit as string, 10) || 5
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!artistId) {
    res.status(400).json({ error: 'Artist ID is required' })
    return
  }

  try {
    const results = await spotifyApiService.getArtistAlbums(artistId, albumTypes, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting artist albums:`, error)
    res.status(500).json({
      error: 'Failed to get artist albums',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get show episodes
app.get('/api/spotify/show/:showId/episodes', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const showId = req.params.showId
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!showId) {
    res.status(400).json({ error: 'Show ID is required' })
    return
  }

  try {
    const results = await spotifyApiService.getShowEpisodes(showId, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting show episodes:`, error)
    res.status(500).json({
      error: 'Failed to get show episodes',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get album details
app.get('/api/spotify/album/:albumId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const albumId = req.params.albumId

  if (!albumId) {
    res.status(400).json({ error: 'Album ID is required' })
    return
  }

  try {
    const album = await spotifyApiService.getAlbum(albumId)
    res.status(200).json(album)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting album:`, error)
    res.status(500).json({
      error: 'Failed to get album',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get playlist tracks
app.get('/api/spotify/playlist/:playlistId/tracks', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const playlistId = req.params.playlistId
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0
  const forceRefresh = req.query.refresh === 'true'

  if (!playlistId) {
    res.status(400).json({ error: 'Playlist ID is required' })
    return
  }

  try {
    const tracks = await spotifyApiService.getPlaylistTracks(playlistId, limit, offset, forceRefresh)
    res.status(200).json(tracks)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting playlist tracks:`, error)
    res.status(500).json({
      error: 'Failed to get playlist tracks',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get show details
app.get('/api/spotify/show/:showId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const showId = req.params.showId

  if (!showId) {
    res.status(400).json({ error: 'Show ID is required' })
    return
  }

  try {
    const show = await spotifyApiService.getShow(showId)
    res.status(200).json(show)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting show:`, error)
    res.status(500).json({
      error: 'Failed to get show',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get audiobook details
app.get('/api/spotify/audiobook/:audiobookId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const audiobookId = req.params.audiobookId

  if (!audiobookId) {
    res.status(400).json({ error: 'Audiobook ID is required' })
    return
  }

  try {
    const audiobook = await spotifyApiService.getAudiobook(audiobookId)
    res.status(200).json(audiobook)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting audiobook:`, error)
    res.status(500).json({
      error: 'Failed to get audiobook',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get episode details
app.get('/api/spotify/episode/:episodeId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const episodeId = req.params.episodeId

  if (!episodeId) {
    res.status(400).json({ error: 'Episode ID is required' })
    return
  }

  try {
    const episode = await spotifyApiService.getEpisode(episodeId)
    res.status(200).json(episode)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting episode:`, error)
    res.status(500).json({
      error: 'Failed to get episode',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get artist details
app.get('/api/spotify/artist/:artistId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const artistId = req.params.artistId

  if (!artistId) {
    res.status(400).json({ error: 'Artist ID is required' })
    return
  }

  try {
    const artist = await spotifyApiService.getArtist(artistId)
    res.status(200).json(artist)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error getting artist:`, error)
    res.status(500).json({
      error: 'Failed to get artist',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Validate Spotify resource
// The stream a radio playlist file (.m3u / .pls) names: its first address - the player wants the stream itself. Read
// by the box (a browser may not read another site's file); an HLS list (#EXT-X-, .m3u8) is played as it is.
app.get('/api/stream/resolve', localOrElternSession, async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim() : ''
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'bad_url' })
    return
  }
  try {
    const { body } = await fetchRemote(url, { maxBytes: 256 * 1024, timeoutMs: 8000 })
    const text = body.toString('utf8')
    const found = /^\s*\[playlist\]/im.test(text)
      ? /^\s*File\d+\s*=\s*(https?:\/\/\S+)/im.exec(text)?.[1]
      : /#EXT-X-/i.test(text)
        ? undefined
        : /(?:^|\r?\n)(?:\s*#.*\r?\n)*\s*(https?:\/\/\S+)/i.exec(text)?.[1]
    res.json({ url: found ?? url, resolved: !!found })
  } catch (error) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] stream playlist ${url}: ${(error as Error).message}`)
    res.json({ url, resolved: false })
  }
})

app.post('/api/spotify/validate', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const { id, type } = req.body as SpotifyValidationRequest

  if (!id || !type) {
    res.status(400).json({ error: 'ID and type are required' })
    return
  }

  try {
    // First try the Spotify API validation
    const valid = await spotifyApiService.validateSpotifyResource(id, type)

    if (valid) {
      const response: SpotifyValidationResponse = { valid: true, id, type }
      res.status(200).json(response)
      return
    }

    // If API validation failed and it's a playlist, try fallback
    if (type === 'playlist') {
      console.log(
        `${new Date().toLocaleString()}: [MuPiBox-Server] Spotify API validation failed for playlist ${id}, trying fallback...`,
      )

      try {
        const playlistData = await spotifyMediaInfo.fetchPlaylistData(id)
        if (playlistData.playlist?.name) {
          console.log(
            `${new Date().toLocaleString()}: [MuPiBox-Server] Scraper validation successful for playlist ${id}`,
          )
          const response: SpotifyValidationResponse = { valid: true, id, type }
          res.status(200).json(response)
          return
        }
      } catch (scraperError) {
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] Scraper validation also failed for playlist ${id}:`,
          scraperError instanceof Error ? scraperError.message : String(scraperError),
        )
      }
    }

    // All validation methods failed
    const response: SpotifyValidationResponse = { valid: false, id, type }
    res.status(200).json(response)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error validating Spotify resource:`, error)
    res.status(500).json({
      error: 'Failed to validate resource',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/sonos', (_req, res) => {
  if (config === undefined) {
    res.status(500).send('Could not load server config.')
    return
  }
  // Send server address and port of the node-sonos-http-api instance to the client
  res.status(200).send(config['node-sonos-http-api'])
})

// Keys whose values are secrets. The endpoint is unauthenticated and was readable by any web page
// (cors *), and it returned the whole file: Spotify client secret and tokens, Telegram bot token,
// MQTT and Synology passwords, the admin password hash and the parents' password hash + salt.
// The box frontend only needs display settings, so these keys are dropped at any depth.
const SECRET_CONFIG_KEYS = /^(password|pass|pwd|pw|psk|secret|clientsecret|token|accesstoken|refreshtoken|hash|salt|sid|apikey|api_key|username|user|cookie)$/i

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (!SECRET_CONFIG_KEYS.test(key)) {
        out[key] = redactSecrets(child)
      }
    }
    return out
  }
  return value
}

app.get('/api/config', (_req, res) => {
  fs.readFile(mupiboxConfigPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading mupibox config: ${err.message}`)
      res.status(500).send('Error reading mupibox configuration')
      return
    }

    try {
      const mupiboxConfig = JSON.parse(data)
      res.json(redactSecrets(mupiboxConfig))
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError)
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error parsing mupibox config: ${errorMessage}`)
      res.status(500).send('Error parsing mupibox configuration')
    }
  })
})

app.post('/api/logs', (req, res) => {
  try {
    const logRequest = req.body as LogRequest

    if (!logRequest.entries || !Array.isArray(logRequest.entries)) {
      res.status(400).json({
        success: false,
        message: 'Invalid log request format. Expected entries array.',
        entriesReceived: 0,
      } as LogResponse)
      return
    }

    // Process each log entry
    for (const entry of logRequest.entries) {
      const timestamp = entry.timestamp || new Date().toISOString()
      const source = entry.source || 'Frontend'
      const level = entry.level || 'log'

      // Format the message similar to existing server logs
      const sourceWithUrl = entry.url ? `${source}|${entry.url}` : source
      const logMessage = `${timestamp}: [MuPiBox-${sourceWithUrl}] ${entry.message}`

      // Output to appropriate console method
      switch (level) {
        case 'error':
          console.error(logMessage, ...(entry.args || []))
          break
        case 'warn':
          console.warn(logMessage, ...(entry.args || []))
          break
        case 'debug':
          console.debug(logMessage, ...(entry.args || []))
          break
        default:
          console.log(logMessage, ...(entry.args || []))
          break
      }
    }

    res.status(200).json({
      success: true,
      message: 'Logs received successfully',
      entriesReceived: logRequest.entries.length,
    } as LogResponse)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error processing logs: ${errorMessage}`)

    res.status(500).json({
      success: false,
      message: 'Error processing logs',
      entriesReceived: 0,
    } as LogResponse)
  }
})

app.post('/api/screen/off', (_req, res) => {
  exec('DISPLAY=:0 xset dpms force off', (error, _stdout, stderr) => {
    if (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error turning off screen: ${error.message}`)
      res.status(500).send('error')
      return
    }
    if (stderr) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Stderr turning off screen: ${stderr}`)
      res.status(500).send('error')
      return
    }
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Screen turned off`)
    res.status(200).send('ok')
  })
})

app.post('/api/shutdown', (_req, res) => {
  exec('sudo su - -c "/usr/local/bin/mupibox/./shutdown.sh &"', (error, _stdout, stderr) => {
    if (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error executing shutdown: ${error.message}`)
      res.status(500).send('error')
      return
    }
    if (stderr) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Stderr executing shutdown: ${stderr}`)
      res.status(500).send('error')
      return
    }
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] System shutdown initiated`)
    res.status(200).send('ok')
  })
})

app.post('/api/reboot', (_req, res) => {
  exec('sudo su - -c "/usr/local/bin/mupibox/./restart.sh &"', (error, _stdout, stderr) => {
    if (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error executing restart: ${error.message}`)
      res.status(500).send('error')
      return
    }
    if (stderr) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Stderr executing restart: ${stderr}`)
      res.status(500).send('error')
      return
    }
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] System restart initiated`)
    res.status(200).send('ok')
  })
})

// --------------------------------------------
// Bluetooth
// --------------------------------------------

const macAddressPattern = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/

function isValidMac(mac: unknown): mac is string {
  return typeof mac === 'string' && macAddressPattern.test(mac)
}

interface BluetoothDevice {
  mac: string
  name: string
}

app.get('/api/bluetooth/status', async (_req, res) => {
  try {
    const { stdout: showOutput } = await execFileAsync('bluetoothctl', ['show'])
    const powered = /Powered:\s*yes/.test(showOutput)

    if (!powered) {
      res.json({ powered: false, paired: [] })
      return
    }

    // Note: "paired-devices" is only available in newer bluez releases; "devices Paired" works from bluez 5.65+.
    const { stdout: pairedOutput } = await execFileAsync('bluetoothctl', ['devices', 'Paired'])
    const devices: BluetoothDevice[] = pairedOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Device '))
      .map((line) => {
        const [, mac, ...nameParts] = line.split(' ')
        return { mac, name: nameParts.join(' ') || mac }
      })

    const paired = await Promise.all(
      devices.map(async (device) => {
        try {
          const { stdout: infoOutput } = await execFileAsync('bluetoothctl', ['info', device.mac])
          return { ...device, connected: /Connected:\s*yes/.test(infoOutput) }
        } catch {
          return { ...device, connected: false }
        }
      }),
    )

    res.json({ powered: true, paired })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading bluetooth status: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/bluetooth/power', async (req, res) => {
  const script = req.body?.on === true ? 'start_bt.sh' : 'stop_bt.sh'

  try {
    await execFileAsync(`/usr/local/bin/mupibox/${script}`, [])
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Bluetooth power: ran ${script}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error running ${script}: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/bluetooth/scan', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('/usr/local/bin/mupibox/scan_bt.sh', [], { timeout: 20000 })

    const devices: BluetoothDevice[] = stdout
      .split('\n')
      .slice(1) // first line is "Scanning ..."
      .map((line) => line.split('\t'))
      .filter((parts) => isValidMac(parts[1]))
      .map((parts) => ({ mac: parts[1], name: parts[2]?.trim() || parts[1] }))

    res.json(devices)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error scanning for bluetooth devices: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/bluetooth/pair', async (req, res) => {
  const mac = req.body?.mac
  if (!isValidMac(mac)) {
    res.status(400).send('invalid mac address')
    return
  }

  try {
    await execFileAsync('/usr/local/bin/mupibox/pair_bt.sh', [mac], { timeout: 25000 })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Paired bluetooth device ${mac}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error pairing bluetooth device ${mac}: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/bluetooth/remove', async (req, res) => {
  const mac = req.body?.mac
  if (!isValidMac(mac)) {
    res.status(400).send('invalid mac address')
    return
  }

  try {
    await execFileAsync('/usr/local/bin/mupibox/remove_bt.sh', [mac], { timeout: 15000 })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Removed bluetooth device ${mac}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error removing bluetooth device ${mac}: ${error}`)
    res.status(500).send('error')
  }
})

// --------------------------------------------
// NAS integration
// --------------------------------------------
// Browses and streams media from a NAS live over WebDAV (works with Synology,
// QNAP, TrueNAS, ...) - no SMB/CIFS mount, no data.json caching. Every read hits
// the NAS directly, so changes made on the NAS show up the next time a
// category/page is opened, with no manual "update media" step required.

// Runs fn over items with at most `limit` calls in flight at once. An artist folder with two
// dozen albums used to fire one WebDAV request per album (plus one more for each album's cover)
// all at the same instant - fine on a LAN, but over the internet (a QuickConnect/DDNS address,
// not a local NAS) that burst blew past the server's concurrent-connection handling and most
// requests timed out, so covers (and sometimes whole albums) silently failed to load.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// The NAS settings. Configs written before the rename still have them under "synology"; a "nas" section
// that only holds the template defaults (no address) must not hide those.
function nasSettings(config: MupiboxConfig | undefined): NasConfig | undefined {
  if (config?.nas?.address) {
    return config.nas
  }
  return config?.synology ?? config?.nas
}

interface NasSession {
  base: string // WebDAV base URL without trailing slash, may contain a path prefix
  auth: string // Authorization header value (HTTP Basic)
  // SHA-256 fingerprint of the NAS's own (self-signed) certificate the parents confirmed: https then trusts exactly
  // this certificate (see nasFetch)
  fingerprint?: string
}

// The certificate of an https NAS is not trusted (self-signed, as Synology's own), or not the one confirmed.
class NasCertificateError extends Error {
  constructor(readonly certificate: NasCertificateInfo | undefined) {
    super('NAS certificate not trusted')
  }
}

interface NasCertificateInfo {
  fingerprint: string
  subject: string
  issuer: string
  validTo: string
}

// What the NAS presents on https, without trusting it: shown in the admin interface to be confirmed.
function nasPeekCertificate(base: string, timeoutMs = 8000): Promise<NasCertificateInfo | undefined> {
  const url = new URL(base)
  if (url.protocol !== 'https:') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    })
    const done = (info: NasCertificateInfo | undefined) => {
      socket.destroy()
      resolve(info)
    }
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      done(
        cert?.fingerprint256
          ? {
              fingerprint: cert.fingerprint256,
              subject: String(cert.subject?.CN ?? cert.subject?.O ?? ''),
              issuer: String(cert.issuer?.CN ?? cert.issuer?.O ?? ''),
              validTo: String(cert.valid_to ?? ''),
            }
          : undefined,
      )
    })
    socket.once('timeout', () => done(undefined))
    socket.once('error', () => done(undefined))
  })
}

// Every request to the NAS goes through here. With a confirmed certificate (https with Synology's own, self-signed
// one - fetch() refuses it) the TLS connection is made first, its certificate compared with the confirmed
// fingerprint, and only then is the request - with the login - sent over it. Anything else goes through fetch().
async function nasFetch(
  session: NasSession,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Buffer; signal?: AbortSignal } = {},
): Promise<Response> {
  const target = new URL(url)
  if (!session.fingerprint || target.protocol !== 'https:') {
    return await fetch(url, { ...init, body: init.body as RequestInit['body'] })
  }
  const fingerprint = session.fingerprint
  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const s = tls.connect({
      host: target.hostname,
      port: Number(target.port || 443),
      servername: net.isIP(target.hostname) ? undefined : target.hostname,
      rejectUnauthorized: false, // checked by the fingerprint below
    })
    const onAbort = () => {
      s.destroy()
      reject(init.signal?.reason ?? new Error('aborted'))
    }
    if (init.signal?.aborted) return onAbort()
    init.signal?.addEventListener('abort', onAbort, { once: true })
    s.once('secureConnect', () => {
      init.signal?.removeEventListener('abort', onAbort)
      const cert = s.getPeerCertificate()
      if (!cert?.fingerprint256 || cert.fingerprint256.toUpperCase() !== fingerprint.toUpperCase()) {
        s.destroy()
        reject(
          new NasCertificateError(
            cert?.fingerprint256
              ? {
                  fingerprint: cert.fingerprint256,
                  subject: String(cert.subject?.CN ?? ''),
                  issuer: String(cert.issuer?.CN ?? ''),
                  validTo: String(cert.valid_to ?? ''),
                }
              : undefined,
          ),
        )
        return
      }
      resolve(s)
    })
    s.once('error', (error) => {
      init.signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
  return await new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        method: init.method ?? 'GET',
        hostname: target.hostname,
        port: Number(target.port || 443),
        path: `${target.pathname}${target.search}`,
        headers: init.headers,
        createConnection: () => socket,
        signal: init.signal,
      },
      (res) => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((v) => headers.append(name, v))
          else if (value !== undefined) headers.set(name, String(value))
        }
        const status = res.statusCode ?? 502
        const noBody = status === 204 || status === 304 || init.method === 'HEAD'
        if (noBody) res.resume()
        resolve(
          new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), {
            status,
            statusText: res.statusMessage,
            headers,
          }),
        )
      },
    )
    req.once('error', (error) => {
      socket.destroy()
      reject(error)
    })
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })
}

let nasSessionCache: NasSession | undefined

class NasSessionExpiredError extends Error {}

// The NAS answered, but with an API-level error (e.g. folder no longer exists) -
// unlike a network failure this does not mean the NAS is offline.
class NasApiError extends Error {}

// Local copies of NAS folders ("Download local") live here, mirroring the NAS
// path (e.g. /music/Artist/Album -> <root>/music/Artist/Album), so they stay
// playable when the NAS or the network is not available.
const nasLocalRoot = '/home/dietpi/MuPiBox/media/NAS'
const nasDownloadMarker = '.mupibox-nas-download'

const nasAudioExtensions = ['.mp3', '.flac', '.wav', '.wma', '.ogg', '.m4a']

// Resolves the address field into a WebDAV base URL. Accepts "host", "host:port",
// "host:port/path" or a complete http(s):// URL. The HTTPS checkbox picks the
// scheme when the address itself has none.
function nasResolveBase(address: string, useHttps: boolean): string {
  const trimmed = address.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `${useHttps ? 'https' : 'http'}://${trimmed}`
}

function nasBasicAuth(account: string, password: string): string {
  return `Basic ${Buffer.from(`${account}:${password}`, 'utf8').toString('base64')}`
}

function nasUrl(session: NasSession, nasPath: string): string {
  const encoded = nasPath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${session.base}/${encoded}`
}

async function nasLogin(
  base: string,
  account: string,
  password: string,
  timeoutMs = 10000,
  fingerprint?: string,
): Promise<{ success: boolean; session?: NasSession; error?: string; certificate?: NasCertificateInfo }> {
  const session: NasSession = { base, auth: nasBasicAuth(account, password), fingerprint: fingerprint || undefined }
  try {
    const response = await nasFetch(session, nasUrl(session, '/'), {
      method: 'PROPFIND',
      headers: { Authorization: session.auth, Depth: '1' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'Wrong account name or password (or no WebDAV permission for this account).' }
    }
    if (response.status === 207 || response.status === 200) {
      // A NAS always shows at least one folder. An empty answer means this is not the WebDAV
      // service (e.g. the DSM web page on port 443 answers, but lists nothing), or the account
      // may not use WebDAV.
      if (parsePropfind(body, session, '/').length === 0) {
        return {
          success: false,
          error: 'The NAS answered but lists no folders - check the WebDAV port in the address (Synology: 5006 for https, 5005 for http) and that the account may use WebDAV.',
        }
      }
      return { success: true, session }
    }
    if (response.status === 404) {
      return { success: false, error: 'WebDAV service not found at this address/port - check the address and that WebDAV is enabled on the NAS.' }
    }
    return { success: false, error: `The NAS answered with HTTP ${response.status}. Is this the WebDAV address/port?` }
  } catch (error) {
    if (error instanceof NasCertificateError) {
      // A confirmed certificate, but the NAS now shows another one (renewed on the NAS - or not the NAS).
      return {
        success: false,
        error: 'The certificate of the NAS is not the one confirmed before. If it was renewed on the NAS, compare the new fingerprint below and confirm it.',
        certificate: error.certificate,
      }
    }
    const cause = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : ''
    if (/certificate|SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/i.test(cause)) {
      // Synology's own certificate is self-signed: show it, so it can be confirmed once (then trusted by its
      // fingerprint, see nasFetch).
      return {
        success: false,
        error:
          "The NAS uses a certificate that is not signed by a known authority (e.g. Synology's own). Check its fingerprint below and confirm it - or use HTTP.",
        certificate: await nasPeekCertificate(base),
      }
    }
    return { success: false, error: 'Could not reach the NAS. Check the address (with WebDAV port) and network connection.' }
  }
}

let nasSessionPromise: Promise<NasSession | undefined> | undefined
let nasOfflineUntil = 0
// The last session that worked. A stream keeps using it while the NAS is marked offline: one slow folder listing
// (another request) must not cut off the album that is playing - the stream has its own retries.
let nasLastSession: NasSession | undefined

// After a network failure, skip the NAS for a short while so the kids' UI can fall
// back to the local downloads immediately instead of waiting on timeouts every time.
function nasMarkOffline(): void {
  nasOfflineUntil = Date.now() + 30000
  nasSessionCache = undefined
}

async function nasLoginWithRememberedCredentials(): Promise<NasSession | undefined> {
  const config = await getMupiboxConfig()
  const syn = nasSettings(config)
  if (!syn?.rememberMe || !syn.address || !syn.account || !syn.password) {
    return undefined
  }
  const password = nasDecrypt(syn.password)
  if (password === undefined) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] The stored NAS password can not be decrypted on this box - please sign in to the NAS again.`)
    return undefined
  }
  const base = nasResolveBase(syn.address, Boolean(syn.https))
  // A NAS that is switched off answers at once (no route / refused); one whose disks sleep needs 10-20 s to wake
  // up. 4 s marked such a NAS offline for 30 s, and every tap in that time failed.
  const result = await nasLogin(base, syn.account, password, 15000, syn.certFingerprint)
  if (!result.success || !result.session) {
    if (/reach/i.test(result.error ?? '')) {
      nasMarkOffline()
    }
    return undefined
  }
  nasSessionCache = result.session
  nasLastSession = result.session
  if (!syn.password.startsWith(nasSecretPrefix)) {
    // A clear-text password from an older config: store it encrypted from now on.
    updateNasConfig({ password: nasEncrypt(password) }).catch(() => undefined)
  }
  return nasSessionCache
}

// Returns a cached session, or transparently logs back in using the
// remembered credentials (if any) - existing installs won't have a
// "nas" config section at all, so every field is read defensively.
async function getActiveNasSession(): Promise<NasSession | undefined> {
  if (nasSessionCache) {
    return nasSessionCache
  }
  if (Date.now() < nasOfflineUntil) {
    return undefined
  }
  // Several requests often arrive at once (e.g. one per artist): share one login.
  if (!nasSessionPromise) {
    nasSessionPromise = nasLoginWithRememberedCredentials().finally(() => {
      nasSessionPromise = undefined
    })
  }
  return await nasSessionPromise
}

// Runs `fn` with an active session, retrying exactly once (with a fresh
// login) if the session turned out to be expired.
async function withNasSession<T>(fn: (session: NasSession) => Promise<T>): Promise<T | undefined> {
  let session = await getActiveNasSession()
  if (!session) {
    return undefined
  }
  try {
    return await fn(session)
  } catch (error) {
    if (error instanceof NasSessionExpiredError) {
      nasSessionCache = undefined
      session = await getActiveNasSession()
      if (!session) {
        return undefined
      }
      return await fn(session)
    }
    throw error
  }
}

interface NasFileEntry {
  name: string
  path: string
  isdir: boolean
  additional?: { size?: number }
  // ETag or last-modified date from the NAS: changes when the file changes (thumbnail cache key)
  version?: string
}

// Not shown and not played: hidden files (macOS "._01.mp3" companions, ".DS_Store"), DSM's "@eaDir" thumbnail
// folders, recycle bin and snapshots.
function nasIsSystemEntry(name: string): boolean {
  return name.startsWith('.') || name.startsWith('@') || name === '#recycle' || name === '#snapshot'
}

const xmlEntities: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }

function decodeXml(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos);/g, (m) => xmlEntities[m] ?? m)
}

// Parses a WebDAV PROPFIND (Depth: 1) answer into the children of `folderPath`.
function parsePropfind(xml: string, session: NasSession, folderPath: string): NasFileEntry[] {
  const basePrefix = decodeURIComponent(new URL(session.base).pathname).replace(/\/+$/, '')
  const folder = `/${folderPath.split('/').filter(Boolean).join('/')}`
  const entries: NasFileEntry[] = []
  const responses = xml.match(/<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/gi) ?? []
  for (const block of responses) {
    const hrefMatch = block.match(/<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i)
    if (!hrefMatch) {
      continue
    }
    let hrefPath = decodeXml(hrefMatch[1].trim())
    if (/^https?:\/\//i.test(hrefPath)) {
      hrefPath = new URL(hrefPath).pathname
    }
    try {
      hrefPath = decodeURIComponent(hrefPath)
    } catch {
      // keep as is
    }
    if (basePrefix && hrefPath.startsWith(basePrefix)) {
      hrefPath = hrefPath.slice(basePrefix.length)
    }
    hrefPath = `/${hrefPath.split('/').filter(Boolean).join('/')}`
    if (hrefPath === folder) {
      continue // the folder itself
    }
    const name = hrefPath.split('/').pop() ?? hrefPath
    if (nasIsSystemEntry(name)) {
      continue
    }
    const isdir = /<(?:\w+:)?collection\s*\/?>/i.test(block)
    const sizeMatch = block.match(/<(?:\w+:)?getcontentlength[^>]*>(\d+)</i)
    const versionMatch =
      block.match(/<(?:\w+:)?getetag[^>]*>([^<]+)</i) ?? block.match(/<(?:\w+:)?getlastmodified[^>]*>([^<]+)</i)
    entries.push({
      name,
      path: hrefPath,
      isdir,
      additional: sizeMatch ? { size: Number(sizeMatch[1]) } : undefined,
      version: versionMatch ? decodeXml(versionMatch[1].trim()) : undefined,
    })
  }
  return entries
}

async function nasListFilesLive(session: NasSession, folderPath: string, _withSize = false): Promise<NasFileEntry[]> {
  const response = await nasFetch(session, `${nasUrl(session, folderPath)}/`, {
    method: 'PROPFIND',
    headers: { Authorization: session.auth, Depth: '1', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getetag/><getlastmodified/></prop></propfind>',
    // 20 s: a NAS waking its disks answers after 10-20 s (8 s marked it offline for 30 s)
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  if (response.status === 401) {
    // The login is no longer accepted (password changed, session on the NAS side gone): withNasSession()
    // signs in again once.
    throw new NasSessionExpiredError('WebDAV 401')
  }
  if (response.status !== 207 && response.status !== 200) {
    // Folder gone / no permission: the NAS answered, so it is not offline.
    throw new NasApiError(`WebDAV error ${response.status}`)
  }
  return parsePropfind(text, session, folderPath)
}

// --- Local copies ("Download local") --------------------------------------

function nasPathParts(nasPath: string): string[] | undefined {
  const parts = nasPath.split('/').filter(Boolean)
  return parts.some((part) => part === '..' || part === '.') ? undefined : parts
}

function normalizeNasPath(nasPath: string): string {
  return `/${(nasPathParts(nasPath) ?? []).join('/')}`
}

// The box plays and lists only what the parents selected in the admin interface ("Show in
// MuPiBox" / "Download local"). These routes proxied ANY path with the box's NAS login - with an
// account that can read more than music, anyone in the LAN could fetch e.g. /Privat/Steuern.pdf.
async function nasPathSelected(raw: string): Promise<boolean> {
  const parts = nasPathParts(raw)
  if (!parts) return false
  const settings = nasSettings(await getMupiboxConfig())
  const selected = [...(settings?.artistFolders ?? []), ...(settings?.downloadFolders ?? [])].map(normalizeNasPath)
  const hidden = (settings?.hiddenFolders ?? []).map(normalizeNasPath)
  const wanted = normalizeNasPath(raw)
  // A folder marked "Hide in MuPiBox" is left out together with everything below it (as in the NAS tab).
  return selected.some((folder) => wanted === folder || wanted.startsWith(`${folder}/`)) && !nasIsHidden(wanted, hidden)
}

// A cover chosen in the app for a folder of the NAS (the cover picker, see eltern/covers.ts): written as cover.jpg
// (cover.png) into that folder with the box's NAS login - only in the folders the parents selected. A cover there
// before is kept as cover-previous.*, the box's own cover-online.jpg goes (it would come first); when the upload fails
// the cover before comes back. An account without write permission: 'denied'.
async function writeNasCover(folder: string, bytes: Buffer, ext: '.jpg' | '.png'): Promise<'ok' | 'not_selected' | 'offline' | 'denied' | 'failed'> {
  if (!(await nasPathSelected(folder))) return 'not_selected'
  const session = await getActiveNasSession()
  if (!session) return 'offline'
  const files = await withNasSession((s) => nasListFilesLive(s, folder))
  if (!files) return 'offline'
  const dir = nasUrl(session, folder)
  const denied = (status: number) => status === 401 || status === 403 || status === 405
  const call = async (url: string, method: string, headers: Record<string, string> = {}, body?: Buffer) => {
    const r = await nasFetch(session, url, { method, headers: { Authorization: session.auth, ...headers }, body, signal: AbortSignal.timeout(20000) })
    await r.arrayBuffer().catch(() => undefined)
    return r.status
  }
  const moved: Array<{ from: string; to: string }> = []
  try {
    for (const f of files) {
      if (f.isdir) continue
      const e = path.extname(f.name).toLowerCase()
      if (!['.jpg', '.jpeg', '.jfif', '.png', '.webp'].includes(e)) continue
      const from = `${dir}/${encodeURIComponent(f.name)}`
      if (f.name.slice(0, -e.length).toLowerCase() === 'cover') {
        const to = `${dir}/cover-previous${e}`
        const status = await call(from, 'MOVE', { Destination: to, Overwrite: 'T' })
        if (denied(status)) return 'denied'
        if (status >= 300) return 'failed'
        moved.push({ from, to })
      } else if (f.name.toLowerCase() === 'cover-online.jpg') {
        await call(from, 'DELETE')
      }
    }
    const status = await call(`${dir}/cover${ext}`, 'PUT', { 'Content-Type': ext === '.png' ? 'image/png' : 'image/jpeg', Overwrite: 'T' }, bytes)
    if (status >= 300) {
      // (the cover before back in its place)
      for (const m of moved) await call(m.to, 'MOVE', { Destination: m.from, Overwrite: 'T' }).catch(() => undefined)
      return denied(status) ? 'denied' : 'failed'
    }
  } catch (error) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS cover ${folder}: ${(error as Error).message}`)
    return 'failed'
  }
  // (the folder and the one above list their picture anew: the library shows the new one)
  nasListCache.delete(normalizeNasPath(folder))
  nasListCache.delete(normalizeNasPath(path.posix.dirname(normalizeNasPath(folder))))
  console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS cover ${folder}/cover${ext}`)
  return 'ok'
}

const nasPathWithinSelection: express.RequestHandler = async (req, res, next) => {
  const raw = typeof req.query.path === 'string' ? req.query.path : ''
  if (await nasPathSelected(raw)) {
    next()
    return
  }
  res.status(403).send('path outside the selected NAS folders')
}

function nasLocalPath(nasPath: string): string | undefined {
  const parts = nasPathParts(nasPath)
  return parts ? path.join(nasLocalRoot, ...parts) : undefined
}

// True if this NAS folder (or one of its parents) was completely downloaded.
function nasIsDownloaded(nasPath: string): boolean {
  const parts = nasPathParts(nasPath)
  const target = nasLocalPath(nasPath)
  if (!parts || !target || !fs.existsSync(target)) {
    return false
  }
  for (let length = parts.length; length >= 1; length--) {
    const dir = path.join(nasLocalRoot, ...parts.slice(0, length))
    if (fs.existsSync(path.join(dir, nasDownloadMarker))) {
      return true
    }
  }
  return false
}

async function nasLocalListFiles(nasPath: string): Promise<NasFileEntry[] | undefined> {
  const dir = nasLocalPath(nasPath)
  if (!dir || !fs.existsSync(dir)) {
    return undefined
  }
  const normalized = normalizeNasPath(nasPath)
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => !entry.name.startsWith('.') && !entry.name.endsWith('.part'))
    .map((entry) => ({ name: entry.name, path: `${normalized}/${entry.name}`, isdir: entry.isDirectory() }))
}

// Live listings are kept for a minute: opening a folder lists every subfolder (and looks below them for covers
// and albums), and going back from the player opened it all again - "Christliche" (161 folders) took 2 s every
// time. Requests for the same folder at the same time share one PROPFIND. Changes on the NAS show up after at
// most a minute; a new NAS login or "Reload covers" empties the cache.
const NAS_LIST_CACHE_MS = 60 * 1000
const NAS_LIST_CACHE_MAX = 600
const nasListCache = new Map<string, { at: number; files: Promise<NasFileEntry[] | undefined> }>()

function nasListCacheClear(): void {
  nasListCache.clear()
}

function nasListFilesLiveCached(folderPath: string): Promise<NasFileEntry[] | undefined> {
  const key = normalizeNasPath(folderPath)
  const hit = nasListCache.get(key)
  if (hit && Date.now() - hit.at < NAS_LIST_CACHE_MS) {
    return hit.files
  }
  const entry = { at: Date.now(), files: withNasSession((session) => nasListFilesLive(session, folderPath)) }
  nasListCache.delete(key) // re-insert: the map's order is the age order for the eviction below
  nasListCache.set(key, entry)
  const forget = () => {
    if (nasListCache.get(key) === entry) nasListCache.delete(key)
  }
  // a failed or session-less listing is not kept
  entry.files.then((files) => files === undefined && forget(), forget)
  while (nasListCache.size > NAS_LIST_CACHE_MAX) {
    nasListCache.delete(nasListCache.keys().next().value as string)
  }
  return entry.files
}

// Lists a NAS folder: live from the NAS, and from whatever is stored locally if the NAS is unreachable.
// A downloaded folder is listed live too while the NAS is known to answer (a session is active), so episodes added
// on the NAS after the download show up (and play from the NAS; the downloaded files still play from here, see
// /api/nas/stream). Without an active session it is listed from the copy straight away - no waiting on a NAS that
// is off.
async function nasListFiles(folderPath: string): Promise<NasFileEntry[]> {
  if (nasIsDownloaded(folderPath) && (!nasSessionCache || Date.now() < nasOfflineUntil)) {
    const local = await nasLocalListFiles(folderPath)
    if (local) {
      return local
    }
  }
  try {
    const live = await nasListFilesLiveCached(folderPath)
    if (live !== undefined) {
      return live
    }
  } catch (error) {
    if (!(error instanceof NasApiError || error instanceof NasSessionExpiredError)) {
      nasMarkOffline()
    }
  }
  const local = await nasLocalListFiles(folderPath)
  if (local) {
    return local
  }
  throw new Error(`NAS folder not available: ${folderPath}`)
}

// The folder's picture: "cover", "folder", "front" or "albumart" first, then any other picture except an obvious
// back side / booklet page - the first image in the NAS's order was often "back.jpg".
function pickCoverImage(files: NasFileEntry[]): NasFileEntry | undefined {
  const images = files.filter((f) => !f.isdir && /\.(jpe?g|jfif|png|webp)$/i.test(f.name))
  const base = (f: NasFileEntry) => f.name.replace(/\.[^.]+$/, '').toLowerCase()
  return (
    // stored by the box next to a picture that is not square (see saveOnlineCoverToFolder)
    images.find((f) => base(f) === 'cover-online') ??
    // a cover chosen in the app (cover-apply) before folder.jpg / AlbumArt*.jpg of a ripping program
    images.find((f) => base(f) === 'cover') ??
    images.find((f) => /^(cover|folder|front|albumart\w*)$/.test(base(f))) ??
    images.find((f) => /cover|front/.test(base(f)) && !/back/.test(base(f))) ??
    images.find((f) => !/back|rueck|rück|inlay|booklet|cd\d?$|disc/.test(base(f))) ??
    images[0]
  )
}

function nasFindCoverImage(files: NasFileEntry[]): string | undefined {
  return pickCoverImage(files)?.path
}

// A folder without a picture of its own (e.g. an artist folder holding only album subfolders)
// gets the first cover found one level below it, in listing order - checked one subfolder at a
// time (not in parallel) and stops at the first hit, so this stays cheap even for a folder with
// many subfolders. Only one level deep, unlike the local library's multi-level version.
async function nasFindCoverBelow(files: NasFileEntry[]): Promise<string | undefined> {
  for (const sub of files.filter((f) => f.isdir).slice(0, 5)) {
    try {
      const subFiles = await nasListFiles(sub.path)
      const cover = nasFindCoverImage(subFiles)
      if (cover) {
        return cover
      }
    } catch {
      // Unreadable folder - try the next one.
    }
  }
  return undefined
}

// Changes when the covers are reloaded (and at every start of the backend). It is part of the cover
// address, so a browser that still holds an older picture of the same address (from the time covers were
// cached for a day) asks for the picture again instead of showing the old one.
let nasCoverVersion = Date.now()

// Only used for covers, which are asked for as small thumbnails.
function nasStreamUrl(filePath: string): string {
  return `/api/nas/stream?path=${encodeURIComponent(filePath)}&w=400&v=${nasCoverVersion}`
}

// Subfolders that hold no album: DSM's "@eaDir", recycle bin and snapshots, and picture folders next to the audio.
const nasPictureFolder = /^(covers?|scans?|artworks?|booklet|bilder|images?|pictures?)$/i
function nasHasAudio(files: NasFileEntry[]): boolean {
  return files.some((f) => !f.isdir && nasAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
}

// A folder with subfolders is a "container": the kids' UI drills into it like an artist level instead of trying to
// play it. This allows any number of nesting levels. Audio files lying next to the subfolders are not lost: the
// folder's listing starts with an entry that plays just them (see ownFilesOnly below). Before, such a folder counted
// as an album, and its subfolders could not be reached.
// With audio files of its own, a folder is a container only when one of its subfolders holds audio, in it or one
// level below ("Staffel 1/Folge 1"): an "eBook" folder next to an audiobook's files leaves it an album. Checked for
// such mixed folders only; it stops at the first audio found and looks at no more than 10 × 6 folders.
function nasRealSubfolders(files: NasFileEntry[]): NasFileEntry[] {
  return files.filter((f) => f.isdir && !nasIndexSkip(f.name) && !nasPictureFolder.test(f.name))
}

async function folderIsContainer(
  files: NasFileEntry[],
  listFiles: (folder: string) => Promise<NasFileEntry[]>,
): Promise<boolean> {
  const subfolders = nasRealSubfolders(files)
  if (subfolders.length === 0) return false
  if (!nasHasAudio(files)) return true
  const list = async (folder: string) => {
    try {
      return await listFiles(folder)
    } catch {
      return [] // unreadable: look at the next one
    }
  }
  for (const sub of subfolders.slice(0, 10)) {
    const inner = await list(sub.path)
    if (nasHasAudio(inner)) return true
    for (const deeper of nasRealSubfolders(inner).slice(0, 5)) {
      if (nasHasAudio(await list(deeper.path))) return true
    }
  }
  return false
}

// --- Folder index ------------------------------------------------------------------------------------------------
// What a folder list needs of each subfolder - does it hold audio, is it a folder of albums, which picture - is kept
// here together with the subfolder's ETag/date on the NAS, on the SD card (survives a restart). Opening a folder then
// reads just that one folder live (so new or removed folders show at once) and takes every unchanged subfolder from
// the index; only new or changed ones are read. Before, every subfolder was read (and below it looked for covers
// and albums): an artist with 200 albums needed 200+ requests and several seconds. The library walk (see
// scanAlbumsForOnlineCovers) renews the index in the background.
interface NasFolderFacts {
  v?: string // the folder's ETag/date on the NAS when these facts were read
  audio: boolean
  container: boolean // see folderIsContainer()
  own?: string // its own picture
  ownV?: string // that picture's ETag/date (thumbnail cache key)
  below?: string // without an own picture: one found in a subfolder (see nasFindCoverBelow)
  at: number
}
const nasFolderIndexFile = path.join(process.cwd(), 'cache', 'nas-folders.json')
let nasFolderIndex: Record<string, NasFolderFacts> = (() => {
  try {
    return JSON.parse(fs.readFileSync(nasFolderIndexFile, 'utf8')) as Record<string, NasFolderFacts>
  } catch {
    return {}
  }
})()
let nasFolderIndexTimer: NodeJS.Timeout | undefined

function nasFolderIndexStore(key: string, facts: NasFolderFacts): void {
  nasFolderIndex[key] = facts
  nasFolderIndexSaveSoon()
}

function nasFolderIndexClear(): void {
  nasFolderIndex = {}
  nasFolderIndexSaveSoon()
}

// Written at most once a minute (SD card), atomically.
function nasFolderIndexSaveSoon(): void {
  if (nasFolderIndexTimer) return
  nasFolderIndexTimer = setTimeout(() => {
    nasFolderIndexTimer = undefined
    void (async () => {
      try {
        await mkdir(path.dirname(nasFolderIndexFile), { recursive: true })
        const tmp = `${nasFolderIndexFile}.tmp`
        await writeFile(tmp, JSON.stringify(nasFolderIndex))
        await rename(tmp, nasFolderIndexFile)
      } catch (error) {
        console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] saving the NAS folder index failed: ${error}`)
      }
    })()
  }, 60 * 1000)
}

// The facts of one folder: from the index when its ETag/date (from the listing of the folder above) is unchanged,
// else read now. Without a version (the marked top folders) always read now.
async function nasFolderFacts(folderPath: string, version?: string): Promise<NasFolderFacts> {
  const key = normalizeNasPath(folderPath)
  const known = nasFolderIndex[key]
  if (known && version !== undefined && known.v === version) return known
  const files = await nasListFiles(folderPath)
  const own = pickCoverImage(files)
  const facts: NasFolderFacts = {
    v: version,
    audio: nasHasAudio(files),
    container: await folderIsContainer(files, nasListFiles),
    own: own?.path,
    ownV: own?.version,
    below: own ? undefined : await nasFindCoverBelow(files),
    at: Date.now(),
  }
  nasFolderIndexStore(key, facts)
  return facts
}

// Builds the ready-to-use Media entry for one NAS folder. ownFilesOnly: the entry that plays the audio files of a
// container folder itself (first in its listing).
async function nasBuildMediaEntry(
  folderPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
  ownFilesOnly = false,
  version?: string,
): Promise<Record<string, unknown>> {
  return nasEntryFromFacts(folderPath, artistName, title, await nasFolderFacts(folderPath, version), fallbackCoverPath, ownFilesOnly)
}

function nasEntryFromFacts(
  folderPath: string,
  artistName: string,
  title: string,
  facts: NasFolderFacts,
  fallbackCoverPath?: string,
  ownFilesOnly = false,
): Record<string, unknown> {
  const ownCoverPath = facts.own ?? (ownFilesOnly ? undefined : facts.below)
  const isContainer = !ownFilesOnly && facts.container
  // (the parents chose "no cover" for this folder in the app: none, whatever pictures it has)
  const hidden = coverHidden('nas', folderPath)
  // An album without a picture: its own cover from the internet beats the series' picture from the folder above.
  // An album whose picture is not square (scanned cassette inlay): its online cover, if one was found.
  const cover = hidden
    ? undefined
    : ((facts.own && !isContainer ? onlineInsteadOfOwn('nas', folderPath, facts.own) : undefined) ??
      (ownCoverPath ? nasStreamUrl(ownCoverPath) : undefined) ??
      (isContainer ? undefined : onlineAlbumCover('nas', folderPath)) ??
      (fallbackCoverPath ? nasStreamUrl(fallbackCoverPath) : undefined))
  return {
    type: 'nas',
    category: 'nas',
    artist: artistName,
    title,
    nasPath: folderPath,
    nasIsContainer: isContainer,
    ...(ownFilesOnly ? { ownFiles: true } : {}),
    ...(hidden ? { coverHidden: true } : {}),
    cover,
    artistcover: cover,
  }
}

// Online cover of an album folder (NAS path or library path), see online-covers.ts; asks for a lookup when there is
// none yet. The folder above names the series ("Pumuckl/029 Originalmusik").
function onlineAlbumCover(
  type: 'nas' | 'local',
  folderPath: string,
  reason: 'missing' | 'notSquare' = 'missing',
): string | undefined {
  const parts = folderPath.split('/').filter(Boolean)
  const album = parts.at(-1)
  // (a folder the parents want without a cover: not looked up either)
  if (!album || coverHidden(type, folderPath)) return undefined
  return onlineCovers.coverFor(type, folderPath, parts.at(-2) ?? '', album, reason)
}

// --- Cover shapes -------------------------------------------------------------------------------------------------
// Width / height of the albums' own pictures, measured on their thumbnails (made by the library walk). A picture far
// from square - mostly a scanned cassette inlay - gets the album's online cover in its place (when one is found and
// not discarded); the picture on the NAS / on disk stays as it is. Keys: nas:<NAS path> / local:<library path>.
const coverShapesFile = path.join(process.cwd(), 'cache', 'cover-shapes.json')
let coverShapes: Record<string, number> = (() => {
  try {
    return JSON.parse(fs.readFileSync(coverShapesFile, 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
})()
let coverShapesTimer: NodeJS.Timeout | undefined

function coverShapeStore(key: string, ratio: number): void {
  if (coverShapes[key] === ratio) return
  coverShapes[key] = ratio
  if (coverShapesTimer) return
  coverShapesTimer = setTimeout(() => {
    coverShapesTimer = undefined
    void (async () => {
      try {
        const tmp = `${coverShapesFile}.tmp`
        await writeFile(tmp, JSON.stringify(coverShapes))
        await rename(tmp, coverShapesFile)
      } catch (error) {
        console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] saving the cover shapes failed: ${error}`)
      }
    })()
  }, 60 * 1000)
}

function coverIsNotSquare(key: string): boolean {
  const ratio = coverShapes[key]
  return ratio !== undefined && (ratio < 0.85 || ratio > 1.18)
}

// Width / height of a JPEG (the thumbnails are JPEGs): from its SOF marker.
function jpegRatio(b: Buffer): number | undefined {
  if (b[0] !== 0xff || b[1] !== 0xd8) return undefined
  let p = 2
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) return undefined
    const marker = b[p + 1]
    const length = b.readUInt16BE(p + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = b.readUInt16BE(p + 5)
      const width = b.readUInt16BE(p + 7)
      return height > 0 ? Math.round((width / height) * 1000) / 1000 : undefined
    }
    p += 2 + length
  }
  return undefined
}

async function measureCoverShape(key: string, thumb: string | undefined): Promise<void> {
  if (!thumb) return
  const ratio = jpegRatio(await readFileRange(thumb, 0, 65535).catch(() => Buffer.alloc(0)))
  if (ratio !== undefined) coverShapeStore(key, ratio)
}

// The online cover shown instead of an album's own picture that is not square (asks for it when not known yet).
function onlineInsteadOfOwn(type: 'nas' | 'local', folderPath: string, ownPicture: string): string | undefined {
  return coverIsNotSquare(`${type}:${ownPicture}`) ? onlineAlbumCover(type, folderPath, 'notSquare') : undefined
}

// The NAS login password is kept in the config file encrypted (AES-256-GCM), so the configuration
// backup does not carry it in clear text. The key is derived from this box's hardware serial: a backup
// restored on the same box keeps working, on another box the password can not be read and the NAS
// login has to be entered again. A clear-text password from an older config is still accepted and is
// encrypted the next time the login is saved.
const nasSecretPrefix = 'enc:v1:'
let nasKeyCache: Buffer | undefined

function nasKey(): Buffer {
  if (!nasKeyCache) {
    let seed = ''
    try {
      seed = fs.readFileSync('/proc/cpuinfo', 'utf8').match(/^Serial\s*:\s*(\S+)/m)?.[1] ?? ''
    } catch {
      // not a Raspberry Pi
    }
    if (!seed) {
      try {
        seed = fs.readFileSync('/etc/machine-id', 'utf8').trim()
      } catch {
        // no machine id either
      }
    }
    nasKeyCache = crypto.scryptSync(`mupibox-nas:${seed}`, 'mupibox-nas-login-v1', 32)
  }
  return nasKeyCache
}

function nasEncrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', nasKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return nasSecretPrefix + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

// Returns the clear text, or undefined if the value can not be decrypted (e.g. config from another box).
function nasDecrypt(value: string): string | undefined {
  if (!value.startsWith(nasSecretPrefix)) {
    return value
  }
  try {
    const raw = Buffer.from(value.slice(nasSecretPrefix.length), 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', nasKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return undefined
  }
}

// Changes go through the shared config writer (updateMupiboxConfig): it serialises them with every
// other config write of this server and holds the flock the admin interface uses, so neither several
// requests at once (e.g. one per folder when "Save selection" is pressed) nor a save in the admin
// interface overwrite each other. `change` is either the values to set or a function that computes them
// from the current settings (returning undefined = no write).
function updateNasConfig(
  change: Record<string, unknown> | ((settings: NasConfig | undefined) => Record<string, unknown> | undefined),
): Promise<void> {
  return updateMupiboxConfig((cfg) => {
    const current = cfg as MupiboxConfig
    const partial = typeof change === 'function' ? change(nasSettings(current)) : change
    if (!partial) {
      return false
    }
    // Old config files call this section "synology": carry its values over to "nas" and drop the old key.
    const merged = { ...(nasSettings(current) ?? {}), ...partial }
    delete cfg.synology
    cfg.nas = merged
  })
}

// --- Profiles: named selections of the NAS tab ---------------------------------------------------
// Every profile remembers the "Show", "Hide" and "Download local" folders and the NAS login (address +
// account, never the password) it was made with. Exactly one profile is active; saving the selection
// updates it. A profile can only be loaded while the same NAS/account is connected. They live in the
// config file, so the configuration backup contains them.

const nasDefaultProfile = 'standard'
const nasProfileNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} .()-]{0,39}$/u

function nasAddressKey(address: string | undefined): string {
  return (address ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()
}

// A profile created before any login (no address/account yet) is not bound to a NAS and fits any login.
function nasProfileMatchesLogin(profile: NasProfile, settings: NasConfig | undefined): boolean {
  if (!profile.address && !profile.account) {
    return true
  }
  return (
    nasAddressKey(profile.address) === nasAddressKey(settings?.address) &&
    profile.account.trim().toLowerCase() === (settings?.account ?? '').trim().toLowerCase()
  )
}

function nasGetProfile(profiles: Record<string, NasProfile>, name: string): NasProfile | undefined {
  return Object.hasOwn(profiles, name) ? profiles[name] : undefined
}

function nasProfileSnapshot(settings: NasConfig | undefined, created = Date.now()): NasProfile {
  return {
    created,
    address: settings?.address ?? '',
    account: settings?.account ?? '',
    artistFolders: [...(settings?.artistFolders ?? [])],
    hiddenFolders: [...(settings?.hiddenFolders ?? [])],
    downloadFolders: [...(settings?.downloadFolders ?? [])],
    folderCategories: { ...(settings?.folderCategories ?? {}) },
    folderSplit: [...(settings?.folderSplit ?? [])],
  }
}

// The profiles of the config; "standard" always exists (made from the current selection if it is missing).
function nasProfilesOf(settings: NasConfig | undefined): { profiles: Record<string, NasProfile>; active: string } {
  const profiles = { ...(settings?.profiles ?? {}) }
  if (!nasGetProfile(profiles, nasDefaultProfile)) {
    profiles[nasDefaultProfile] = nasProfileSnapshot(settings)
  }
  const active = settings?.activeProfile && nasGetProfile(profiles, settings.activeProfile) ? settings.activeProfile : nasDefaultProfile
  return { profiles, active }
}

// Keeps the active profile in step with a change of the selection (used by /mark). Also stores the
// profile list the first time, so "standard" is part of the config from then on.
function nasTrackActiveProfile(settings: NasConfig | undefined, changes: Record<string, unknown>): Record<string, unknown> {
  const { profiles, active } = nasProfilesOf(settings)
  const profile = nasGetProfile(profiles, active)
  if (!profile || !nasProfileMatchesLogin(profile, settings)) {
    return { profiles, activeProfile: active } // other NAS/login than the profile: leave the profile as it is
  }
  const pick = (key: 'artistFolders' | 'hiddenFolders' | 'downloadFolders'): string[] =>
    (changes[key] as string[] | undefined) ?? settings?.[key] ?? []
  return {
    profiles: {
      ...profiles,
      [active]: {
        ...profile,
        address: profile.address || (settings?.address ?? ''),
        account: profile.account || (settings?.account ?? ''),
        artistFolders: pick('artistFolders'),
        hiddenFolders: pick('hiddenFolders'),
        downloadFolders: pick('downloadFolders'),
        folderCategories: (changes.folderCategories as NasConfig['folderCategories']) ?? settings?.folderCategories ?? {},
        folderSplit: (changes.folderSplit as string[] | undefined) ?? settings?.folderSplit ?? [],
      },
    },
    activeProfile: active,
  }
}

async function nasFolderExists(session: NasSession, folderPath: string): Promise<boolean> {
  const response = await nasFetch(session, `${nasUrl(session, folderPath)}/`, {
    method: 'PROPFIND',
    headers: { Authorization: session.auth, Depth: '0' },
    signal: AbortSignal.timeout(8000),
  })
  await response.text().catch(() => '')
  // A folder that is gone is a 404; a share (top level) that does not exist is answered with 405 by Synology.
  const topLevel = folderPath.split('/').filter(Boolean).length <= 1
  if (response.status === 404 || response.status === 410 || (response.status === 405 && topLevel)) {
    return false
  }
  if (response.status === 207 || response.status === 200) {
    return true
  }
  throw new NasApiError(`WebDAV error ${response.status}`)
}

app.get('/api/nas/profiles', localOrElternSession, async (_req, res) => {
  try {
    // Store the profile list once, so "standard" exists in the config (and thus in the backup).
    await updateNasConfig((settings) => {
      const { profiles, active } = nasProfilesOf(settings)
      return settings?.profiles && nasGetProfile(settings.profiles, nasDefaultProfile) ? undefined : { profiles, activeProfile: active }
    })
    const settings = nasSettings(await getMupiboxConfig())
    const { profiles, active } = nasProfilesOf(settings)
    const list = Object.keys(profiles)
      .sort((x, y) => (x === nasDefaultProfile ? -1 : y === nasDefaultProfile ? 1 : x.localeCompare(y)))
      .map((name) => ({
        name,
        active: name === active,
        created: profiles[name].created,
        address: profiles[name].address,
        account: profiles[name].account,
        matchesLogin: nasProfileMatchesLogin(profiles[name], settings),
        shown: profiles[name].artistFolders.length,
        hidden: profiles[name].hiddenFolders.length,
        download: profiles[name].downloadFolders.length,
      }))
    res.json({ success: true, active, profiles: list })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS profiles: ${error}`)
    res.status(500).json({ success: false })
  }
})

// Stores the current (saved) selection under `name` and makes it the active profile. An existing name is
// only replaced with overwrite: true.
app.post('/api/nas/profiles/create', localOrElternSession, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!nasProfileNamePattern.test(name)) {
    res.status(400).json({ success: false, error: 'invalid_name' })
    return
  }
  if (!(await getActiveNasSession())) {
    res.status(401).json({ success: false, error: 'not_logged_in' })
    return
  }
  try {
    let exists = false
    await updateNasConfig((settings) => {
      const { profiles } = nasProfilesOf(settings)
      const old = nasGetProfile(profiles, name)
      if (old && req.body?.overwrite !== true) {
        exists = true
        return undefined
      }
      return { profiles: { ...profiles, [name]: nasProfileSnapshot(settings, old?.created) }, activeProfile: name }
    })
    res.json(exists ? { success: false, error: 'exists' } : { success: true })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to create NAS profile: ${error}`)
    res.status(500).json({ success: false })
  }
})

// Makes a profile the active selection. Refused if another NAS/account is connected than the one the
// profile was made with. Folders that no longer exist on the NAS are reported (`missing`), not removed.
app.post('/api/nas/profiles/load', localOrElternSession, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const session = await getActiveNasSession()
  if (!session) {
    res.status(401).json({ success: false, error: 'not_logged_in' })
    return
  }
  try {
    const before = nasSettings(await getMupiboxConfig())
    const profile = nasGetProfile(nasProfilesOf(before).profiles, name)
    if (!profile) {
      res.status(404).json({ success: false, error: 'unknown_profile' })
      return
    }
    if (!nasProfileMatchesLogin(profile, before)) {
      res.json({ success: false, error: 'different_login' })
      return
    }
    await updateNasConfig((settings) => {
      const { profiles } = nasProfilesOf(settings)
      const bound = { ...profile, address: profile.address || (settings?.address ?? ''), account: profile.account || (settings?.account ?? '') }
      return {
        artistFolders: [...bound.artistFolders],
        hiddenFolders: [...bound.hiddenFolders],
        downloadFolders: [...bound.downloadFolders],
        folderCategories: { ...(bound.folderCategories ?? {}) },
        folderSplit: [...(bound.folderSplit ?? [])],
        profiles: { ...profiles, [name]: bound },
        activeProfile: name,
      }
    })
    localLibraryVersion = Date.now()
    const paths = Array.from(new Set([...profile.artistFolders, ...profile.hiddenFolders, ...profile.downloadFolders]))
    let unverified = 0
    const exists = await mapWithConcurrency(paths, 4, async (folderPath) => {
      try {
        return await nasFolderExists(session, folderPath)
      } catch {
        unverified++ // could not be checked (network) - not reported as missing
        return true
      }
    })
    res.json({ success: true, missing: paths.filter((_, index) => !exists[index]), unverified })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to load NAS profile: ${error}`)
    res.status(500).json({ success: false })
  }
})

// Takes folders that no longer exist out of a profile (and out of the selection if it is the active one).
app.post('/api/nas/profiles/remove-missing', localOrElternSession, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const drop = new Set(Array.isArray(req.body?.paths) ? req.body.paths.filter((p: unknown) => typeof p === 'string') : [])
  try {
    let found = false
    await updateNasConfig((settings) => {
      const { profiles, active } = nasProfilesOf(settings)
      const profile = nasGetProfile(profiles, name)
      if (!profile) {
        return undefined
      }
      found = true
      const strip = (list: string[] | undefined): string[] => (list ?? []).filter((p) => !drop.has(p))
      const change: Record<string, unknown> = {
        profiles: {
          ...profiles,
          [name]: {
            ...profile,
            artistFolders: strip(profile.artistFolders),
            hiddenFolders: strip(profile.hiddenFolders),
            downloadFolders: strip(profile.downloadFolders),
            folderCategories: nasKeepCategories(profile.folderCategories, strip(profile.artistFolders)),
            folderSplit: strip(profile.folderSplit),
          },
        },
      }
      if (name === active) {
        change.artistFolders = strip(settings?.artistFolders)
        change.hiddenFolders = strip(settings?.hiddenFolders)
        change.downloadFolders = strip(settings?.downloadFolders)
        change.folderCategories = nasKeepCategories(settings?.folderCategories, change.artistFolders as string[])
        change.folderSplit = strip(settings?.folderSplit)
      }
      return change
    })
    res.json({ success: found })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to clean NAS profile: ${error}`)
    res.status(500).json({ success: false })
  }
})

app.post('/api/nas/profiles/delete', localOrElternSession, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  if (name === nasDefaultProfile) {
    res.json({ success: false, error: 'standard' })
    return
  }
  try {
    let error: string | undefined
    await updateNasConfig((settings) => {
      const { profiles, active } = nasProfilesOf(settings)
      if (!nasGetProfile(profiles, name)) {
        error = 'unknown_profile'
        return undefined
      }
      if (name === active) {
        error = 'active'
        return undefined
      }
      const { [name]: _removed, ...others } = profiles
      return { profiles: others, activeProfile: active }
    })
    res.json(error ? { success: false, error } : { success: true })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to delete NAS profile: ${error}`)
    res.status(500).json({ success: false })
  }
})

// NAS administration (login, browsing the whole NAS, profiles, index, selecting folders, downloads): the admin
// interface calls these routes server-side through localhost (nas.php), the new app with its parents' session and
// CSRF token (localOrElternSession). Open to the LAN they exposed the box's NAS login and the whole NAS to anyone.
app.post('/api/nas/login', localOrElternSession, async (req, res) => {
  const { address, https: useHttps, account, password, rememberMe, certFingerprint } = req.body ?? {}
  if (typeof address !== 'string' || !address || typeof account !== 'string' || !account || typeof password !== 'string' || !password) {
    res.status(400).json({ success: false, error: 'address, account and password are required.' })
    return
  }

  const base = nasResolveBase(address, Boolean(useHttps))
  // A certificate fingerprint the parents confirmed in the admin interface (SHA-256, "AB:CD:..."): only for https.
  const fingerprint =
    base.startsWith('https:') && typeof certFingerprint === 'string' && /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(certFingerprint)
      ? certFingerprint.toUpperCase()
      : undefined
  // A wrong password may be answered slowly by some NAS models: be generous here.
  const result = await nasLogin(base, account, password, 25000, fingerprint)
  if (!result.success || !result.session) {
    res.json({ success: false, error: result.error, certificate: result.certificate })
    return
  }

  nasSessionCache = result.session
  nasLastSession = result.session
  nasOfflineUntil = 0
  nasListCacheClear() // another NAS or account: its folders

  if (rememberMe === true) {
    try {
      await updateNasConfig({
        address,
        https: Boolean(useHttps),
        account,
        password: nasEncrypt(password),
        rememberMe: true,
        certFingerprint: fingerprint ?? '',
      })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save NAS login: ${error}`)
    }
  }

  res.json({ success: true })
})

// --- Folder index for the admin page's "Filter folders" ----------------------
// Walking a big NAS folder by folder takes minutes, so the admin page filters against an index
// (folder paths only, no files) that the backend builds in the background and keeps on disk.
// It is only used for that filter - the tree and the kids' NAS tab always list the NAS live.
// Rebuilt on demand ("Refresh index") and automatically once it is older than a day.

const nasIndexPath = '/home/dietpi/.mupibox/nas-folder-index.json'
const nasIndexMaxAgeMs = 24 * 60 * 60 * 1000
const nasIndexRetryMs = 10 * 60 * 1000
const nasIndexMaxDepth = 12
const nasIndexMaxFolders = 200000

interface NasFolderIndex {
  updated: number
  folders: string[]
}

let nasIndexCache: NasFolderIndex | undefined
let nasIndexLoaded = false
let nasIndexLastAttempt = 0
const nasIndexJob = { running: false, folders: 0, error: '' }

async function loadNasIndex(): Promise<NasFolderIndex | undefined> {
  if (!nasIndexLoaded) {
    nasIndexLoaded = true
    try {
      const parsed = JSON.parse(await readFile(nasIndexPath, 'utf8'))
      if (Array.isArray(parsed?.folders) && typeof parsed.updated === 'number') {
        nasIndexCache = parsed
      }
    } catch {
      // No index yet.
    }
  }
  return nasIndexCache
}

// Recycle bins, snapshots and DSM's "@eaDir" thumbnail folders are noise for the filter.
function nasIndexSkip(name: string): boolean {
  return name.startsWith('@') || name === '#recycle' || name === '#snapshot'
}

async function buildNasIndex(): Promise<void> {
  if (nasIndexJob.running) {
    return
  }
  nasIndexJob.running = true
  nasIndexJob.folders = 0
  nasIndexJob.error = ''
  nasIndexLastAttempt = Date.now()
  try {
    const found: string[] = []
    let skipped = 0
    let level = ['/']
    // Level by level, at most 4 requests in flight (same limit as elsewhere: a big NAS behind a
    // DDNS address does not cope with bursts).
    for (let depth = 0; level.length > 0 && depth < nasIndexMaxDepth && found.length < nasIndexMaxFolders; depth++) {
      const listings = await mapWithConcurrency(level, 4, async (folder) => {
        try {
          const files = await withNasSession((session) => nasListFilesLive(session, folder))
          if (files === undefined) {
            throw new Error('Not logged in to the NAS')
          }
          return files
        } catch (error) {
          if (folder === '/') {
            throw error
          }
          skipped++ // one unreadable folder must not fail the whole run
          return []
        }
      })
      const next: string[] = []
      for (const files of listings) {
        for (const file of files) {
          if (file.isdir && !nasIndexSkip(file.name)) {
            found.push(file.path)
            next.push(file.path)
          }
        }
      }
      nasIndexJob.folders = found.length
      level = next
    }
    const index: NasFolderIndex = { updated: Date.now(), folders: found }
    await mkdir(path.dirname(nasIndexPath), { recursive: true })
    const tmp = `${nasIndexPath}.tmp`
    await writeFile(tmp, JSON.stringify(index), 'utf8')
    await rename(tmp, nasIndexPath)
    nasIndexCache = index
    nasIndexLoaded = true
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS folder index built: ${found.length} folders (${skipped} unreadable skipped)`)
  } catch (error) {
    nasIndexJob.error = error instanceof Error ? error.message : String(error)
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS folder index failed: ${nasIndexJob.error}`)
  } finally {
    nasIndexJob.running = false
  }
}

// The NAS login as it is stored (never the password) and whether the box is signed in, plus the saved selection,
// for the NAS page of the app. A remembered login is tried here if there is no session yet (at most 8 s).
app.get('/api/nas/state', localOrElternSession, async (_req, res) => {
  const syn = nasSettings(await getMupiboxConfig())
  const session = nasSessionCache ?? (await Promise.race([getActiveNasSession(), new Promise<undefined>((r) => setTimeout(() => r(undefined), 8000))]))
  res.json({
    success: true,
    address: syn?.address ?? '',
    https: syn?.https === true,
    account: syn?.account ?? '',
    rememberMe: syn?.rememberMe === true,
    hasPassword: Boolean(syn?.password),
    loggedIn: Boolean(session),
    offline: Date.now() < nasOfflineUntil,
    artistFolders: syn?.artistFolders ?? [],
    hiddenFolders: syn?.hiddenFolders ?? [],
    downloadFolders: syn?.downloadFolders ?? [],
    folderCategories: syn?.folderCategories ?? {},
    folderSplit: syn?.folderSplit ?? [],
  })
})

// Signs the box off the NAS: the session is dropped and the remembered password deleted (with it kept, the next
// request would just sign in again). Address and account stay for the next login; the NAS tab of the box is empty
// until then, the downloaded folders stay playable.
app.post('/api/nas/logout', localOrElternSession, async (_req, res) => {
  nasSessionCache = undefined
  nasLastSession = undefined
  nasListCacheClear()
  try {
    await updateNasConfig({ password: '', rememberMe: false })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS logout: ${error}`)
    res.status(500).json({ success: false })
    return
  }
  console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS: signed out, remembered password deleted`)
  res.json({ success: true })
})

app.get('/api/nas/index/status', localOrElternSession, async (_req, res) => {
  const index = await loadNasIndex()
  const stale = !index || Date.now() - index.updated > nasIndexMaxAgeMs
  if (stale && !nasIndexJob.running && Date.now() - nasIndexLastAttempt > nasIndexRetryMs && (await getActiveNasSession())) {
    void buildNasIndex()
  }
  res.json({
    success: true,
    exists: Boolean(index),
    updated: index?.updated ?? 0,
    count: index?.folders.length ?? 0,
    running: nasIndexJob.running,
    folders: nasIndexJob.folders,
    error: nasIndexJob.running ? '' : nasIndexJob.error,
  })
})

app.post('/api/nas/index/refresh', localOrElternSession, async (_req, res) => {
  if (!(await getActiveNasSession())) {
    res.status(401).json({ success: false, error: 'not_logged_in' })
    return
  }
  void buildNasIndex()
  res.json({ success: true, running: true })
})

// Folders whose own name contains q (case-insensitive), as full paths.
app.get('/api/nas/index/search', localOrElternSession, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
  const index = await loadNasIndex()
  if (!index || q === '') {
    res.json({ success: Boolean(index), paths: [], truncated: false })
    return
  }
  const limit = 3000
  const paths: string[] = []
  let truncated = false
  for (const folder of index.folders) {
    if (folder.slice(folder.lastIndexOf('/') + 1).toLowerCase().includes(q)) {
      if (paths.length >= limit) {
        truncated = true
        break
      }
      paths.push(folder)
    }
  }
  res.json({ success: true, paths, truncated })
})

// A folder marked "Hide in MuPiBox" is left out of the NAS tab together with everything below it.
function nasIsHidden(folderPath: string, hidden: string[]): boolean {
  return hidden.some((h) => folderPath === h || folderPath.startsWith(`${h}/`))
}

// --- NAS folders in the box's categories ---------------------------------------------------------------------
// A shown folder can be put into a category tab (Hörspiele, Musik, Sonstiges) next to Spotify and the SD card, instead
// of the NAS tab (settings.folderCategories). A collection of series ("Hörspiele" with "Benjamin Blümchen", …) can show
// its subfolders one by one (settings.folderSplit): each series a tile of its own with its episodes inside, as an
// artist of the SD card. The NAS tab keeps the shown folders without a category; with none left it is not shown.
const nasBoxCategories: readonly NasBoxCategory[] = ['audiobook', 'music', 'other']
const isNasBoxCategory = (value: unknown): value is NasBoxCategory => nasBoxCategories.includes(value as NasBoxCategory)

function nasCategoryOf(settings: NasConfig | undefined, folder: string): NasBoxCategory | undefined {
  const category = settings?.folderCategories?.[folder]
  return isNasBoxCategory(category) ? category : undefined
}

// The shown folders (not hidden)
function nasShownFolders(settings: NasConfig | undefined): string[] {
  const hidden = settings?.hiddenFolders ?? []
  return (settings?.artistFolders ?? []).filter((p) => !nasIsHidden(p, hidden))
}

// The categories of the folders that are still shown (a folder no longer shown takes its category with it)
function nasKeepCategories(categories: Record<string, unknown> | undefined, shown: string[]): Record<string, NasBoxCategory> {
  const keep: Record<string, NasBoxCategory> = {}
  for (const folder of shown) {
    const category = categories?.[folder]
    if (isNasBoxCategory(category)) keep[folder] = category
  }
  return keep
}

/** Whether the box shows its NAS tab: shown folders without a category are left for it. */
function nasTabWanted(settings: NasConfig | undefined): boolean {
  return nasShownFolders(settings).some((p) => !nasCategoryOf(settings, p))
}

app.get('/api/nas/browse', localOrElternSession, async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''

  try {
    const result = await withNasSession(async (session) => {
      const config = await getMupiboxConfig()
      const markedFolders = new Set(nasSettings(config)?.artistFolders ?? [])
      const downloadFolders = new Set(nasSettings(config)?.downloadFolders ?? [])
      const hiddenFolders = new Set(nasSettings(config)?.hiddenFolders ?? [])

      const files = await nasListFilesLive(session, folderPath || '/')
      const entries = files.filter((f) => f.isdir).map((f) => ({ name: f.name, path: f.path, isDirectory: true }))

      return entries.map((e) => ({
        ...e,
        isMarked: markedFolders.has(e.path),
        isHidden: hiddenFolders.has(e.path),
        isDownload: downloadFolders.has(e.path),
        isDownloaded: nasIsDownloaded(e.path),
      }))
    })

    if (result === undefined) {
      res.status(401).json({ success: false, error: 'not_logged_in' })
      return
    }
    res.json({ success: true, path: folderPath, entries: result })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to browse NAS path ${folderPath}: ${error}`)
    res.status(502).json({ success: false, error: 'nas_unreachable' })
  }
})

// `list` selects which selection is changed: "artist" (Show in MuPiBox, default),
// "hidden" (Hide in MuPiBox) or "download" (Download local). A folder is either shown or
// hidden, never both: setting one removes the other.
// Saves the whole selection of the admin page in ONE config write. The page used to send three /mark
// requests per folder shown in the tree (Show, Hide, Download), each rewriting the config file: with a few
// dozen folders in the tree that took a long time on a Pi, whatever was ticked.
//   shown: the folders that were on the page; show / hide / download: which of them are ticked.
// Folders that were not on the page keep their state. A folder is either shown or hidden (hidden wins).
app.post('/api/nas/selection', localOrElternSession, async (req, res) => {
  const list = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? (value as string[]) : undefined
  const shown = list(req.body?.shown)
  const show = list(req.body?.show)
  const hide = list(req.body?.hide)
  const download = list(req.body?.download)
  if (!shown || !show || !hide || !download) {
    res.status(400).json({ success: false, error: 'shown, show, hide and download must be lists of paths.' })
    return
  }
  // (optional: the category of the shown folders on the page - a folder not named here goes back to the NAS tab - and
  // which of them show their subfolders one by one)
  const categoriesBody = req.body?.categories as unknown
  const categories =
    categoriesBody && typeof categoriesBody === 'object' && !Array.isArray(categoriesBody)
      ? Object.fromEntries(Object.entries(categoriesBody as Record<string, unknown>).filter(([, c]) => isNasBoxCategory(c)))
      : undefined
  const split = list(req.body?.split)
  if (categoriesBody !== undefined && categories === undefined) {
    res.status(400).json({ success: false, error: 'categories must map paths to audiobook, music or other.' })
    return
  }

  try {
    const shownSet = new Set(shown)
    const hideSet = new Set(hide)
    // what was not on the page stays as it is; what was on the page becomes what is ticked
    const merge = (existing: string[] | undefined, ticked: string[]): string[] =>
      Array.from(new Set([...(existing ?? []).filter((p) => !shownSet.has(p)), ...ticked.filter((p) => shownSet.has(p))]))
    await updateNasConfig((settings) => {
      const artistFolders = merge(settings?.artistFolders, show.filter((p) => !hideSet.has(p)))
      // the page's folders get the categories sent (none: the NAS tab), the others keep theirs
      const withCategories = categories
        ? { ...Object.fromEntries(Object.entries(settings?.folderCategories ?? {}).filter(([p]) => !shownSet.has(p))), ...Object.fromEntries(Object.entries(categories).filter(([p]) => shownSet.has(p))) }
        : settings?.folderCategories
      const update: Record<string, unknown> = {
        artistFolders,
        hiddenFolders: merge(settings?.hiddenFolders, hide),
        downloadFolders: merge(settings?.downloadFolders, download),
        folderCategories: nasKeepCategories(withCategories, artistFolders),
        folderSplit: (split ? merge(settings?.folderSplit, split) : settings?.folderSplit ?? []).filter((p) => artistFolders.includes(p)),
      }
      // nothing changed: no config write (and no backup copy) for a "Save selection" without changes
      const same = (a: unknown, b: unknown) => JSON.stringify([...((a as string[]) ?? [])].sort()) === JSON.stringify([...((b as string[]) ?? [])].sort())
      const sameMap = (a: unknown, b: unknown) =>
        JSON.stringify(Object.entries((a as Record<string, string>) ?? {}).sort()) === JSON.stringify(Object.entries((b as Record<string, string>) ?? {}).sort())
      if (
        same(update.artistFolders, settings?.artistFolders) &&
        same(update.hiddenFolders, settings?.hiddenFolders) &&
        same(update.downloadFolders, settings?.downloadFolders) &&
        sameMap(update.folderCategories, settings?.folderCategories) &&
        same(update.folderSplit, settings?.folderSplit)
      ) {
        return undefined
      }
      return { ...update, ...nasTrackActiveProfile(settings, update) }
    })
    // (the box reads its lists and tabs again, see /api/data-version)
    localLibraryVersion = Date.now()
    res.json({ success: true })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save NAS selection: ${error}`)
    res.status(500).json({ success: false })
  }
})

app.post('/api/nas/mark', localOrElternSession, async (req, res) => {
  const { path: folderPath, marked, list } = req.body ?? {}
  if (typeof folderPath !== 'string' || typeof marked !== 'boolean') {
    res.status(400).json({ success: false, error: 'path and marked are required.' })
    return
  }
  const key = list === 'download' ? 'downloadFolders' : list === 'hidden' ? 'hiddenFolders' : 'artistFolders'
  const opposite = key === 'artistFolders' ? 'hiddenFolders' : key === 'hiddenFolders' ? 'artistFolders' : undefined

  try {
    let next: string[] = []
    await updateNasConfig((settings) => {
      const existing = (settings?.[key] as string[] | undefined) ?? []
      next = marked ? Array.from(new Set([...existing, folderPath])) : existing.filter((p) => p !== folderPath)
      const update: Record<string, unknown> = { [key]: next }
      if (marked && opposite) {
        const other = (settings?.[opposite] as string[] | undefined) ?? []
        if (other.includes(folderPath)) {
          update[opposite] = other.filter((p) => p !== folderPath)
        }
      }
      const shownNow = (update.artistFolders as string[] | undefined) ?? settings?.artistFolders ?? []
      update.folderCategories = nasKeepCategories(settings?.folderCategories, shownNow)
      update.folderSplit = (settings?.folderSplit ?? []).filter((p) => shownNow.includes(p))
      return { ...update, ...nasTrackActiveProfile(settings, update) }
    })
    localLibraryVersion = Date.now()
    res.json({ success: true, [key]: next })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save NAS selection: ${error}`)
    res.status(500).json({ success: false })
  }
})

// The subfolders of one NAS folder as ready-to-use Media entries (one level deeper), live from the NAS or from the
// local copy. asTiles: each subfolder a tile of its own (a collection shown one by one in a category of the box,
// see folderSplit) - its own name as the artist, not the folder above. offline: some failed because the NAS dropped
// out meanwhile (the list would miss albums without saying so).
async function nasFolderEntries(folderPath: string, asTiles = false): Promise<{ entries: Record<string, unknown>[]; offline: boolean }> {
  const files = await nasListFiles(folderPath)
  const hiddenFolders = nasSettings(await getMupiboxConfig())?.hiddenFolders ?? []
  const parentName = folderPath.split('/').filter(Boolean).pop() ?? folderPath
  const parentCoverPath = nasFindCoverImage(files)

  const subfolders = files.filter((f) => f.isdir && !nasIsHidden(f.path, hiddenFolders))
  const factsOf = new Map<string, NasFolderFacts>()
  const entries = await mapWithConcurrency(subfolders, 4, async (sub) => {
    try {
      // from the folder index when the subfolder is unchanged (its ETag/date in this listing)
      const facts = await nasFolderFacts(sub.path, sub.version)
      factsOf.set(sub.path, facts)
      // A folder with nothing to play (only pictures, an eBook, ...) is no tile.
      if (!facts.audio && !facts.container) {
        return null
      }
      // (a tile of its own: its own name and picture, not the collection's)
      return asTiles ? nasEntryFromFacts(sub.path, sub.name, sub.name, facts) : nasEntryFromFacts(sub.path, parentName, sub.name, facts, parentCoverPath)
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable NAS folder ${sub.path}: ${error}`)
      return undefined
    }
  })
  const offline = entries.some((entry) => entry === undefined) && Date.now() < nasOfflineUntil
  // Audio files next to subfolders with albums: first comes an entry that plays them.
  if (nasHasAudio(files) && subfolders.some((sub) => factsOf.get(sub.path)?.audio || factsOf.get(sub.path)?.container)) {
    const own = pickCoverImage(files)
    const ownFacts: NasFolderFacts = { audio: true, container: false, own: own?.path, ownV: own?.version, at: Date.now() }
    entries.unshift(nasEntryFromFacts(folderPath, parentName, parentName, ownFacts, undefined, true))
  }
  return { entries: entries.filter((entry): entry is Record<string, unknown> => !!entry), offline }
}

// The shown NAS folders as tiles of the box.
//   ?category=nas                       the NAS tab: folders without a category
//   ?category=audiobook|music|other     that category tab: its folders, a collection split into its subfolders
//   (none)                              all shown folders, one entry each (the app's library); ?expand=1 splits the
//                                       collections as in the tabs (the app's "Hören")
// Every entry says where it is shown: nasCategory ('nas' or the category); a collection shown one by one: nasSplit.
app.get('/api/nas/artists', async (req, res) => {
  try {
    const settings = nasSettings(await getMupiboxConfig())
    const wanted = typeof req.query.category === 'string' ? req.query.category : ''
    const shown = nasShownFolders(settings)
    const folders =
      wanted === 'nas'
        ? shown.filter((p) => !nasCategoryOf(settings, p))
        : isNasBoxCategory(wanted)
          ? shown.filter((p) => nasCategoryOf(settings, p) === wanted)
          : shown
    const expand = isNasBoxCategory(wanted) || req.query.expand === '1'
    const split = new Set(settings?.folderSplit ?? [])

    // One entry per shown folder (a split collection: its subfolders). Deeper levels are loaded on demand via
    // /api/nas/children as the user navigates, so this stays cheap.
    const lists = await mapWithConcurrency(folders, 4, async (folderPath) => {
      const category = nasCategoryOf(settings, folderPath)
      const where = { nasCategory: category ?? 'nas', ...(category && split.has(folderPath) ? { nasSplit: true } : {}) }
      try {
        if (expand && category && split.has(folderPath)) {
          const { entries } = await nasFolderEntries(folderPath, true)
          return entries.map((entry) => ({ ...entry, ...where }))
        }
        const name = folderPath.split('/').filter(Boolean).pop() ?? folderPath
        return [{ ...(await nasBuildMediaEntry(folderPath, name, name)), ...where }]
      } catch (error) {
        // Skip just this one folder (deleted on the NAS since it was marked, or
        // NAS offline and never downloaded) instead of failing the whole category.
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unavailable NAS folder ${folderPath}: ${error}`)
        return undefined
      }
    })
    const found = lists.filter((list) => list !== undefined).flat()
    // Folders are marked but none could be read: the NAS (or its login) is not reachable right now. Say so
    // instead of returning an empty list that looks like "nothing marked", so the UI can try again.
    if (folders.length > 0 && lists.every((list) => list === undefined)) {
      res.status(503).json([])
      return
    }
    res.json(found)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS artists: ${error}`)
    res.json([])
  }
})

// Lists the subfolders of one NAS folder as ready-to-use Media entries (one
// level deeper). Live from the NAS, or from the local copy when downloaded /
// when the NAS is not reachable. Used by the kids' UI to drill down.
app.get('/api/nas/children', nasPathWithinSelection, async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json([])
    return
  }
  try {
    const { entries, offline } = await nasFolderEntries(folderPath)
    // Folders that failed because the NAS dropped out meanwhile (not: a folder without permission): the list would
    // be missing albums without telling. 503 lets the box and the web app try again, as for /api/nas/artists.
    if (offline) {
      res.status(503).json([])
      return
    }
    res.json(entries)
  } catch (error) {
    // The folder itself could not be read (NAS not reachable): not an empty folder.
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS children of ${folderPath}: ${error}`)
    res.status(503).json([])
  }
})

// --- CUE sheets --------------------------------------------------------------------------------------
// A ripped album is often ONE audio file (e.g. "Album.flac", the whole CD) with a "Album.cue" next to it that
// lists the tracks by start time. Without reading the cue the folder has one "track" named like the file.

interface NasCueTrack {
  title: string
  startSeconds: number
}

// Cue files are UTF-8 (often with a BOM) or an old single-byte code page.
function nasDecodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

// Returns the tracks of a cue sheet that describes ONE audio file, or undefined (several FILE entries,
// fewer than two tracks, start times that do not increase: not a layout this can play by seeking).
function nasParseCue(text: string): NasCueTrack[] | undefined {
  const tracks: NasCueTrack[] = []
  let files = 0
  let current: NasCueTrack | undefined
  let hasIndex = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const quoted = (): string => line.match(/"([^"]*)"/)?.[1] ?? line.replace(/^\S+\s+/, '').trim()
    if (/^FILE\s/i.test(line)) {
      files++
    } else if (/^TRACK\s+\d+\s+AUDIO/i.test(line)) {
      current = { title: '', startSeconds: 0 }
      hasIndex = false
      tracks.push(current)
    } else if (/^TITLE\s/i.test(line) && current) {
      current.title = quoted()
    } else if (/^INDEX\s+01\s/i.test(line) && current && !hasIndex) {
      const m = line.match(/(\d+):(\d+):(\d+)\s*$/)
      if (!m) {
        return undefined
      }
      current.startSeconds = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 75 // 75 frames per second
      hasIndex = true
    }
  }
  if (files !== 1 || tracks.length < 2) {
    return undefined
  }
  for (let i = 1; i < tracks.length; i++) {
    if (!(tracks[i].startSeconds > tracks[i - 1].startSeconds)) {
      return undefined
    }
  }
  return tracks
}

// The text of a NAS file: from the local copy if the folder was downloaded, otherwise live from the NAS.
// A cue sheet is a few KB: anything much bigger (a mis-named file) is not read into memory.
const NAS_TEXT_MAX_BYTES = 1024 * 1024

async function nasReadTextFile(nasPath: string): Promise<string | undefined> {
  const local = nasLocalPath(nasPath)
  const localSize = local ? await stat(local).then((s) => s.size, () => undefined) : undefined
  if (local && localSize !== undefined) {
    return localSize > NAS_TEXT_MAX_BYTES ? undefined : nasDecodeText(await readFile(local))
  }
  const buffer = await withNasSession(async (session) => {
    const response = await nasFetch(session, nasUrl(session, nasPath), { headers: { Authorization: session.auth }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) {
      throw new NasApiError(`WebDAV error ${response.status}`)
    }
    if (Number(response.headers.get('content-length') ?? 0) > NAS_TEXT_MAX_BYTES) {
      await response.body?.cancel().catch(() => {})
      return undefined
    }
    return Buffer.from(await response.arrayBuffer())
  })
  return buffer ? nasDecodeText(buffer) : undefined
}

// The audio files of a NAS folder in the order they are played (the track list, and the next track to load ahead).
function nasFolderTracks(files: NasFileEntry[]): NasFileEntry[] {
  return files
    .filter((f) => !f.isdir && nasAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

app.get('/api/nas/tracklist', nasPathWithinSelection, async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json({ error: 'path is required' })
    return
  }

  try {
    const files = await nasListFiles(folderPath)
    const audio = nasFolderTracks(files)

    // One audio file plus a cue sheet: the tracks come from the cue (played by seeking in the file).
    const cues = files.filter((f) => !f.isdir && f.name.toLowerCase().endsWith('.cue'))
    if (audio.length === 1 && cues.length > 0) {
      const audioBase = audio[0].name.replace(/\.[^.]+$/, '').toLowerCase()
      const cue = cues.find((c) => c.name.replace(/\.[^.]+$/, '').toLowerCase() === audioBase) ?? cues[0]
      try {
        const text = await nasReadTextFile(cue.path)
        const cueTracks = text ? nasParseCue(text) : undefined
        if (cueTracks) {
          res.json(
            cueTracks.map((track, index) => ({
              position: index + 1,
              name: track.title || `Track ${index + 1}`,
              path: audio[0].path,
              startSeconds: track.startSeconds,
              cue: true,
            })),
          )
          return
        }
      } catch (error) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Could not read the cue sheet ${cue.path}: ${error}`)
      }
    }

    res.json(audio.map((f, index) => ({ position: index + 1, name: f.name, path: f.path })))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS tracklist for ${folderPath}: ${error}`)
    res.status(502).json([])
  }
})

const nasContentTypes: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// The headers of an answer with HTTP Range support (seeking) for a file of this size: the bytes to send, or
// undefined when the range cannot be served (416 is sent then).
function nasAnswerRange(req: express.Request, res: express.Response, file: string, size: number): { start: number; end: number } | undefined {
  res.setHeader('Content-Type', nasContentTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')

  let start = 0
  let end = size - 1
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (match && (match[1] !== '' || match[2] !== '')) {
    if (match[1] === '') {
      start = Math.max(0, size - Number(match[2]))
    } else {
      start = Number(match[1])
      if (match[2] !== '') {
        end = Math.min(end, Number(match[2]))
      }
    }
    if (start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`)
      res.end()
      return undefined
    }
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  }

  res.setHeader('Content-Length', String(end - start + 1))
  return { start, end }
}

// Serves a downloaded file from disk, including HTTP Range support (seeking).
function nasServeLocalFile(req: express.Request, res: express.Response, file: string, size: number): void {
  const range = nasAnswerRange(req, res, file, size)
  if (!range) return
  // pipeline: a read error (file deleted meanwhile, SD error) must not become an uncaught exception that ends the
  // backend, and the file is closed when the player drops the connection (every seek).
  pipeline(fs.createReadStream(file, range), res).catch(() => undefined)
}

// --- The next NAS track in memory ---------------------------------------
//
// Between two NAS tracks there was 1-3 s of silence: to open a track, mplayer asks for the file three times (start,
// end for the ID3 tag, start again), each one a round trip to the NAS, and then fills its buffer in small steps.
// While a track plays, the next one of its folder is therefore loaded into memory, and the player's requests for it
// are answered from there at once - as fast as a local file. Only the track playing and the next one are kept
// (nothing is written to the SD), a track bigger than NAS_PREFETCH_MAX_BYTES or one that would leave the box short
// of memory is streamed from the NAS as before.
const NAS_PREFETCH_MAX_BYTES = 100 * 1024 * 1024
const NAS_PREFETCH_KEEP_FREE_BYTES = 400 * 1024 * 1024
const NAS_PREFETCH_IDLE_MS = 30 * 60 * 1000

type NasPrefetch = { path: string; data?: Buffer; loading?: AbortController }
let nasPrefetched: NasPrefetch[] = []
let nasPrefetchIdle: NodeJS.Timeout | undefined

// Memory still available to programs (MemAvailable: free plus what the page cache would give back).
function availableMemoryBytes(): number {
  try {
    const kb = /^MemAvailable:\s+(\d+)\s+kB/m.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1]
    if (kb) return Number(kb) * 1024
  } catch {
    // not Linux
  }
  return os.freemem()
}

// Everything loaded is given back once no NAS track was asked for a while (playback stopped).
function nasPrefetchTouch(): void {
  clearTimeout(nasPrefetchIdle)
  nasPrefetchIdle = setTimeout(() => {
    for (const entry of nasPrefetched) entry.loading?.abort()
    nasPrefetched = []
  }, NAS_PREFETCH_IDLE_MS)
  nasPrefetchIdle.unref()
}

// The track from memory, when it is loaded completely.
function nasPrefetchedData(filePath: string): Buffer | undefined {
  const normalized = normalizeNasPath(filePath)
  return nasPrefetched.find((entry) => entry.path === normalized && entry.data)?.data
}

// The player asked for filePath: keep it (if it is in memory) and load the track after it.
async function nasPrefetchNext(filePath: string): Promise<void> {
  nasPrefetchTouch()
  const current = normalizeNasPath(filePath)
  const folder = current.split('/').slice(0, -1).join('/') || '/'
  let next: NasFileEntry | undefined
  try {
    const tracks = nasFolderTracks(await nasListFiles(folder))
    const index = tracks.findIndex((f) => normalizeNasPath(f.path) === current)
    next = index >= 0 ? tracks[index + 1] : undefined
  } catch {
    return
  }
  const nextPath = next ? normalizeNasPath(next.path) : undefined
  // only the track playing and the next one stay (a jump to another track or folder drops the rest)
  for (const entry of nasPrefetched) {
    if (entry.path !== current && entry.path !== nextPath) entry.loading?.abort()
  }
  nasPrefetched = nasPrefetched.filter((entry) => entry.path === current || entry.path === nextPath)
  // a downloaded copy is read from the SD anyway
  const nextLocal = nextPath ? nasLocalPath(nextPath) : undefined
  if (!nextPath || nasPrefetched.some((entry) => entry.path === nextPath) || (nextLocal && fs.existsSync(nextLocal))) return

  const session = (await getActiveNasSession()) ?? nasLastSession
  if (!session) return
  const entry: NasPrefetch = { path: nextPath, loading: new AbortController() }
  nasPrefetched.push(entry)
  const abort = entry.loading as AbortController
  let stall: NodeJS.Timeout | undefined
  const armStall = () => {
    clearTimeout(stall)
    stall = setTimeout(() => abort.abort(), NAS_STALL_MS)
  }
  try {
    armStall()
    const response = await nasFetch(session, nasUrl(session, nextPath), { headers: { Authorization: session.auth }, signal: abort.signal })
    const size = Number(response.headers.get('content-length'))
    if (response.status !== 200 || !response.body || !Number.isFinite(size) || size <= 0 || size > NAS_PREFETCH_MAX_BYTES || availableMemoryBytes() - size < NAS_PREFETCH_KEEP_FREE_BYTES) {
      abort.abort()
      throw new Error(`not loaded ahead (answer ${response.status}, ${size} bytes)`)
    }
    const data = Buffer.allocUnsafe(size)
    let filled = 0
    for await (const chunk of Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)) {
      armStall()
      const piece = chunk as Buffer
      if (filled + piece.length > size) throw new Error('longer than announced')
      piece.copy(data, filled)
      filled += piece.length
    }
    if (filled !== size) throw new Error(`only ${filled} of ${size} bytes`)
    entry.data = data
    entry.loading = undefined
  } catch (error) {
    nasPrefetched = nasPrefetched.filter((e) => e !== entry)
    if (!abort.signal.aborted) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Could not load the next NAS track ${nextPath} ahead: ${error}`)
    }
  } finally {
    clearTimeout(stall)
  }
}

// Streams a NAS file to the player and carries on where it left off when the connection to the NAS breaks.
//
// The player (mplayer) reads the file from this box over HTTP. Passed through 1:1, a NAS connection that
// dies (WiFi drop, NAS busy) ended the answer early, and mplayer took that for the end of the song and jumped
// to the next one. Here the connection to the NAS is taken up again with a Range request from the byte that
// was sent last; the player's own connection to this box never breaks, so it just waits (its buffer runs
// dry, it pauses) and plays on where it stopped.
//
// There is no total time limit for the transfer (a long song over a slow link would have been cut off), only
// a stall limit: no data for NAS_STALL_MS counts as a broken connection.
const NAS_STALL_MS = 15000
const NAS_OUTAGE_GIVE_UP_MS = 5 * 60 * 1000

async function nasStreamWithResume(req: express.Request, res: express.Response, firstSession: NasSession, filePath: string): Promise<void> {
  let session = firstSession
  let clientGone = false
  let controller: AbortController | undefined
  res.once('close', () => {
    clientGone = true
    controller?.abort()
  })

  let started = false // headers sent
  let next = 0 // next byte to send
  let last: number | undefined // last byte of the wanted range (unknown for an answer without length)
  let range = typeof req.headers.range === 'string' ? req.headers.range : undefined
  let outageSince = 0
  let attempt = 0

  while (!clientGone) {
    controller = new AbortController()
    const abort = controller
    let stall: NodeJS.Timeout | undefined
    const armStall = () => {
      clearTimeout(stall)
      stall = setTimeout(() => abort.abort(), NAS_STALL_MS)
    }
    try {
      armStall()
      const headers: Record<string, string> = { Authorization: session.auth }
      if (range) {
        headers.Range = range
      }
      const upstream = await nasFetch(session, nasUrl(session, filePath), { headers, signal: abort.signal })

      if (!started) {
        if (upstream.status === 404 || upstream.status === 401 || upstream.status === 403) {
          res.status(upstream.status === 404 ? 404 : 502).send('Failed to fetch file from NAS.')
          return
        }
        res.status(upstream.status)
        for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const value = upstream.headers.get(header)
          if (value) {
            res.setHeader(header, value)
          }
        }
        const contentRange = /^bytes (\d+)-(\d+)\//.exec(upstream.headers.get('content-range') ?? '')
        const contentLength = Number(upstream.headers.get('content-length'))
        if (upstream.status === 206 && contentRange) {
          next = Number(contentRange[1])
          last = Number(contentRange[2])
        } else if (upstream.status === 200 && Number.isFinite(contentLength) && contentLength > 0) {
          next = 0
          last = contentLength - 1
        }
        started = true
        res.flushHeaders()
      } else if (upstream.status !== 206) {
        // Anything but a partial answer would start the file from the beginning again: try once more.
        throw new Error(`NAS answered ${upstream.status} to the resume request`)
      }

      if (!upstream.body) {
        res.end()
        return
      }
      for await (const chunk of Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)) {
        armStall()
        if (clientGone) {
          return
        }
        outageSince = 0
        attempt = 0
        next += (chunk as Buffer).length
        if (!res.write(chunk)) {
          // Waiting for the player (paused, full buffer) is no NAS stall: without this, every pause longer
          // than NAS_STALL_MS dropped the NAS connection and reconnected it again every 15 s.
          clearTimeout(stall)
          await new Promise<void>((resolve) => {
            const done = () => {
              res.off('drain', done)
              res.off('close', done)
              resolve()
            }
            res.on('drain', done)
            res.on('close', done)
          })
          // the next chunk comes from the NAS again: watch it
          armStall()
        }
      }
      clearTimeout(stall)
      if (last === undefined || next > last) {
        res.end() // complete
        return
      }
      throw new Error(`connection closed after ${next} of ${last + 1} bytes`)
    } catch (error) {
      clearTimeout(stall)
      if (clientGone) {
        return
      }
      if (!started) {
        // Nothing sent yet: a few tries to connect before the player is told it failed.
        attempt++
        if (attempt >= 3) {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to stream NAS file ${filePath}: ${error}`)
          res.status(502).send('Failed to fetch file from NAS.')
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 1500))
        session = (await getActiveNasSession()) ?? session
        continue
      }
      if (last === undefined) {
        // An answer without a length cannot be taken up again.
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS stream of ${filePath} broke off and cannot be resumed: ${error}`)
        res.destroy()
        return
      }
      outageSince ||= Date.now()
      if (Date.now() - outageSince > NAS_OUTAGE_GIVE_UP_MS) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS unreachable for ${NAS_OUTAGE_GIVE_UP_MS / 1000} s, giving up on ${filePath} at byte ${next}`)
        res.destroy()
        return
      }
      attempt++
      if (attempt === 1) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Lost the NAS connection at byte ${next} of ${last + 1} (${filePath}): ${error}. Resuming ...`)
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 1000 * attempt)))
      session = (await getActiveNasSession()) ?? session
      range = `bytes=${next}-${last}`
    }
  }
}

app.get('/api/nas/stream', nasPathWithinSelection, async (req, res) => {
  const filePath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!filePath) {
    res.status(400).send('path is required')
    return
  }
  // This route needs no login (the box's own UI and the remote control use it): only what the box plays or shows -
  // audio, covers, cue sheets - not any other file (PDF, documents) lying in a selected folder.
  if (!nasDownloadExtensions.some((ext) => filePath.toLowerCase().endsWith(ext))) {
    res.status(403).send('not a media file')
    return
  }

  // A downloaded copy always wins: no network needed, and it works offline.
  const localFile = nasLocalPath(filePath)
  const thumbSize = parseThumbSize(req.query.w)
  if (localFile) {
    try {
      const info = await stat(localFile)
      if (info.isFile()) {
        if (thumbSize && isThumbnailable(localFile)) {
          const thumb = await getThumbnail(localFile, thumbSize, `lib|${localFile}|${info.mtimeMs}|${info.size}`)
          if (thumb) {
            await sendThumbnail(res, thumb)
            return
          }
        }
        nasServeLocalFile(req, res, localFile, info.size)
        return
      }
    } catch {
      // Not downloaded - fall through to the NAS.
    }
  }

  // A track the player plays: from memory when it was loaded ahead, and the one after it is loaded now.
  const isTrack = !thumbSize && nasAudioExtensions.some((ext) => filePath.toLowerCase().endsWith(ext))
  if (isTrack) {
    void nasPrefetchNext(filePath)
    const data = nasPrefetchedData(filePath)
    if (data) {
      const range = nasAnswerRange(req, res, filePath, data.length)
      if (range) res.end(data.subarray(range.start, range.end + 1))
      return
    }
  }

  // While the NAS is marked offline (after another request failed), a stream still tries with the last session
  // that worked: the album that is playing must not skip every track for 30 s.
  const session = (await getActiveNasSession()) ?? nasLastSession
  if (!session) {
    res.status(401).send('Not logged in to the NAS, or the NAS is not reachable.')
    return
  }

  try {
    if (thumbSize && isThumbnailable(filePath) && !req.headers.range) {
      const thumb = await nasCoverThumbnail(filePath, thumbSize, await nasPictureVersion(filePath), session)
      if (thumb) {
        await sendThumbnail(res, thumb)
        return
      }
    }

    await nasStreamWithResume(req, res, session, filePath)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to stream NAS file ${filePath}: ${error}`)
    res.status(502).send('Failed to fetch file from NAS.')
  }
})

// The size the lists ask their covers in (nasStreamUrl: &w=400) - the library walk makes these in advance.
const NAS_COVER_THUMB_SIZE = 400

// A picture's ETag/date: from the folder index (its folder's own cover), else from the (cached) listing of its
// folder. The thumbnail is made again only when the picture changed (the day as key made every shown cover again each
// day, as a new file on the SD).
async function nasPictureVersion(filePath: string): Promise<string | undefined> {
  const normalized = normalizeNasPath(filePath)
  const folder = normalized.split('/').slice(0, -1).join('/') || '/'
  const facts = nasFolderIndex[folder]
  if (facts?.own === normalized && facts.ownV) return facts.ownV
  const files = await nasListFiles(folder).catch(() => [] as NasFileEntry[])
  return files.find((f) => f.path === normalized)?.version
}

// The thumbnail of a NAS picture (made once, kept on the SD, see getThumbnail).
async function nasCoverThumbnail(
  filePath: string,
  size: number,
  version: string | undefined,
  session?: NasSession,
): Promise<string | undefined> {
  const seed = `nas|${filePath}|${version ?? Math.floor(Date.now() / 86400000)}`
  return await getThumbnail(`nas:${filePath}`, size, seed, async () => {
    const active = session ?? (await getActiveNasSession()) ?? nasLastSession
    if (!active) return undefined
    const full = await nasFetch(active, nasUrl(active, filePath), {
      headers: { Authorization: active.auth },
      signal: AbortSignal.timeout(20000),
    })
    if (!full.ok) {
      return undefined
    }
    const tmp = path.join('/tmp', `.nasthumb-${crypto.randomBytes(6).toString('hex')}${path.extname(filePath)}`)
    await writeFile(tmp, Buffer.from(await full.arrayBuffer()))
    return tmp
  })
}

// --- Download local ("Download selected") ---------------------------------

const nasDownloadExtensions = [...nasAudioExtensions, '.cue', '.jpg', '.jpeg', '.jfif', '.png', '.webp']

interface NasDownloadStatus {
  running: boolean
  message: string
  filesDone: number
  filesTotal: number
  // Data that still has to be copied (files already present in full are not counted) and what was copied so far.
  bytesDone: number
  bytesTotal: number
  cancelRequested: boolean
  cancelled: boolean
  // Set when the download was not started because the selection does not fit on this MuPiBox.
  spaceError?: { needed: number; free: number; reserve: number }
  error?: string
}

const nasDownloadStatus: NasDownloadStatus = {
  running: false,
  message: 'Idle',
  filesDone: 0,
  filesTotal: 0,
  bytesDone: 0,
  bytesTotal: 0,
  cancelRequested: false,
  cancelled: false,
}
let nasDownloadAbort: AbortController | undefined

// This much stays free for the system (logs, caches, updates): the download only starts if the
// selection fits in the free space minus this reserve.
const nasDownloadReserveBytes = 512 * 1024 * 1024

async function nasFreeBytes(): Promise<number> {
  const info = await statfs(nasLocalRoot)
  return Number(info.bavail) * Number(info.bsize)
}

// How much data would really be copied: files that already exist locally in full are skipped.
async function nasBytesNeeded(files: NasFileToDownload[]): Promise<number> {
  let needed = 0
  for (const file of files) {
    if (file.size < 0) {
      continue // size not known: can not be counted
    }
    const target = nasLocalPath(file.nasPath)
    try {
      if (target && (await stat(target)).size === file.size) {
        continue
      }
    } catch {
      // not downloaded yet
    }
    needed += file.size
  }
  return needed
}

function nasFormatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

interface NasFileToDownload {
  nasPath: string
  size: number
}

// A subfolder that cannot be read is noted in `failed` (its folder then gets no marker and nothing is removed
// locally) instead of ending the whole download.
async function nasCollectFiles(
  session: NasSession,
  folderPath: string,
  out: NasFileToDownload[],
  failed: string[],
): Promise<void> {
  const files = await nasListFilesLive(session, folderPath, true)
  for (const file of files) {
    if (file.isdir) {
      try {
        await nasCollectFiles(session, file.path, out, failed)
      } catch (error) {
        if (error instanceof NasSessionExpiredError) throw error
        failed.push(file.path)
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS download: cannot read ${file.path}: ${error}`)
      }
    } else if (nasDownloadExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      out.push({ nasPath: file.path, size: file.additional?.size ?? -1 })
    }
  }
}

// `signal` is for a download outside "Download selected" (e.g. "Reload covers"): it gets its own time limit and its
// bytes are not counted in the download progress.
async function nasDownloadFile(nasPath: string, size: number, force = false, signal?: AbortSignal): Promise<void> {
  const target = nasLocalPath(nasPath)
  if (!target) {
    return
  }
  if (!force) {
    try {
      const existing = await stat(target)
      if (size < 0 || existing.size === size) {
        return
      }
    } catch {
      // Not downloaded yet.
    }
  }
  await mkdir(path.dirname(target), { recursive: true })

  const done = await withNasSession(async (session) => {
    // No data for NAS_STALL_MS = a dead connection (WiFi gone without a reset): without this the download hung for
    // ever, "running" stayed set, and every later download was refused.
    const stall = new AbortController()
    let stallTimer: NodeJS.Timeout | undefined
    const armStall = () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => stall.abort(new Error('NAS download stalled')), NAS_STALL_MS)
    }
    const outer = signal ?? nasDownloadAbort?.signal
    armStall()
    const response = await nasFetch(session, nasUrl(session, nasPath), {
      headers: { Authorization: session.auth },
      signal: outer ? AbortSignal.any([outer, stall.signal]) : stall.signal,
    }).catch((error) => {
      clearTimeout(stallTimer)
      throw error
    })
    if (!response.ok || !response.body) {
      clearTimeout(stallTimer)
      throw new NasApiError(`WebDAV download error ${response.status}`)
    }
    // Write to a temp name first so a half-finished file is never mistaken for a
    // complete one (and never gets played).
    const partFile = `${target}.part`
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        armStall()
        if (!signal) nasDownloadStatus.bytesDone += chunk.length
        callback(null, chunk)
      },
    })
    try {
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
        counter,
        fs.createWriteStream(partFile),
      )
    } catch (error) {
      await rm(partFile, { force: true }) // cancelled or failed: no half file is left behind
      throw error
    } finally {
      clearTimeout(stallTimer)
    }
    await rename(partFile, target)
    return true
  })
  if (!done) {
    throw new Error('NAS not reachable')
  }
}

// Deletes everything under the local NAS folder that is not inside (or on the
// way to) one of the folders in `keep`. Never touches anything outside nasLocalRoot.
async function nasPruneExcept(nasDir: string, keep: string[]): Promise<void> {
  const dir = nasLocalPath(nasDir)
  if (!dir) {
    return
  }
  let entries: fs.Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const base = nasDir === '/' ? '' : nasDir
  for (const entry of entries) {
    const child = `${base}/${entry.name}`
    if (keep.includes(child)) {
      continue
    }
    // Cover images of parent folders belong to the folders below them.
    if (!entry.isDirectory() && /\.(jpe?g|jfif|png|webp)$/i.test(entry.name)) {
      continue
    }
    if (entry.isDirectory() && keep.some((k) => k.startsWith(`${child}/`))) {
      await nasPruneExcept(child, keep)
      continue
    }
    await rm(path.join(dir, entry.name), { recursive: true, force: true })
  }
}

async function nasLocalHasImage(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.some((entry) => entry.isFile() && /\.(jpe?g|jfif|png|webp)$/i.test(entry.name))
  } catch {
    return false
  }
}

// A downloaded folder is often shown under an artist whose cover lives in a parent
// folder (e.g. /music/Artist/cover.jpg). Fetch those covers too, so the artist
// still has its picture when the NAS is not reachable.
async function nasDownloadParentCovers(folder: string, checked: Set<string>): Promise<void> {
  const parts = nasPathParts(folder) ?? []
  for (let length = 1; length < parts.length; length++) {
    const ancestor = `/${parts.slice(0, length).join('/')}`
    if (checked.has(ancestor)) {
      continue
    }
    checked.add(ancestor)

    const dir = nasLocalPath(ancestor)
    if (dir && (await nasLocalHasImage(dir))) {
      continue
    }
    const files = await withNasSession((session) => nasListFilesLive(session, ancestor, true))
    const cover = files ? pickCoverImage(files) : undefined
    if (cover) {
      await nasDownloadFile(cover.path, cover.additional?.size ?? -1)
    }
  }
}

// Files in the local copy of a downloaded folder that are no longer on the NAS (deleted or renamed there) - only
// the kinds of files the download makes, only below this folder, and only called for a folder that was read
// completely.
async function nasRemoveDeletedFiles(folder: string, onNas: Set<string>): Promise<void> {
  const walk = async (nasDir: string): Promise<void> => {
    const dir = nasLocalPath(nasDir)
    if (!dir) return
    let entries: fs.Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = `${normalizeNasPath(nasDir)}/${entry.name}`.replace(/^\/\//, '/')
      if (entry.isDirectory()) {
        await walk(child)
      } else if (
        nasDownloadExtensions.some((ext) => entry.name.toLowerCase().endsWith(ext)) &&
        !onNas.has(normalizeNasPath(child))
      ) {
        await rm(path.join(dir, entry.name), { force: true })
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS download: removed ${child} (no longer on the NAS)`)
      }
    }
  }
  await walk(folder)
}

async function runNasSync(): Promise<void> {
  const status = nasDownloadStatus
  Object.assign(status, {
    running: true,
    message: 'Checking selection...',
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    cancelRequested: false,
    cancelled: false,
    spaceError: undefined,
    error: undefined,
  })
  nasDownloadAbort = new AbortController()

  try {
    const config = await getMupiboxConfig()
    if (!config) {
      // Without the selection we cannot tell what to keep - never delete blindly.
      throw new Error('Could not read the MuPiBox configuration.')
    }
    const desired = Array.from(new Set((nasSettings(config)?.downloadFolders ?? []).map(normalizeNasPath))).filter(
      (folder) => folder !== '/',
    )
    await mkdir(nasLocalRoot, { recursive: true })

    status.message = 'Removing local copies that are no longer selected...'
    await nasPruneExcept('/', desired)

    // The (small) covers of the parent folders are fetched after the space check below, so a
    // download that does not fit really leaves nothing behind.
    const downloadParentCovers = async (): Promise<void> => {
      if (desired.length === 0 || !(await getActiveNasSession())) {
        return
      }
      status.message = 'Downloading covers of parent folders...'
      const checkedParents = new Set<string>()
      for (const folder of desired) {
        try {
          await nasDownloadParentCovers(folder, checkedParents)
        } catch (error) {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS parent cover download failed for ${folder}: ${error}`)
        }
      }
    }

    if (desired.length === 0) {
      status.message = 'Nothing is selected for download.'
      return
    }

    if (!(await getActiveNasSession())) {
      throw new Error('The NAS is not reachable - nothing was downloaded.')
    }

    // Every selected folder is read again, the downloaded ones too: new episodes are fetched, changed files
    // replaced, and files deleted on the NAS removed here (files already there in full are skipped, see
    // nasDownloadFile). Before, a downloaded folder was never looked at again.
    status.message = 'Reading folders on the NAS...'
    const plan: { folder: string; files: NasFileToDownload[]; complete: boolean }[] = []
    for (const folder of desired) {
      if (status.cancelRequested) {
        break
      }
      const files: NasFileToDownload[] = []
      const failedFolders: string[] = []
      let collected: boolean | undefined
      try {
        collected = await withNasSession(async (session) => {
          files.length = 0
          failedFolders.length = 0
          await nasCollectFiles(session, folder, files, failedFolders)
          return true
        })
      } catch (error) {
        if (!(error instanceof NasApiError)) throw error
        // this folder is gone or not readable: the others go on
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS download: cannot read ${folder}: ${error}`)
        plan.push({ folder, files: [], complete: false })
        continue
      }
      if (!collected) {
        // The NAS dropped out while reading: an empty plan would mark the folder "done" with nothing in it.
        throw new Error('The NAS stopped answering while the folders were read - nothing was downloaded.')
      }
      plan.push({ folder, files, complete: failedFolders.length === 0 })
      status.filesTotal += files.length
    }

    if (status.cancelRequested) {
      status.cancelled = true
      status.message = 'Cancelled - nothing was downloaded.'
      return
    }

    // Does the selection fit? Nothing is downloaded if it does not.
    const needed = await nasBytesNeeded(plan.flatMap((entry) => entry.files))
    const free = await nasFreeBytes()
    status.bytesTotal = needed
    if (needed > free - nasDownloadReserveBytes) {
      status.spaceError = { needed, free, reserve: nasDownloadReserveBytes }
      status.message = `Not enough free space: the selection needs ${nasFormatBytes(needed)}, only ${nasFormatBytes(free)} are free (${nasFormatBytes(nasDownloadReserveBytes)} stay reserved for the system). Nothing was downloaded.`
      status.error = status.message
      return
    }

    await downloadParentCovers()

    let failed = plan.filter((entry) => !entry.complete).length
    for (const { folder, files, complete } of plan) {
      let folderFailed = 0
      for (const file of files) {
        if (status.cancelRequested) {
          break
        }
        status.message = `Downloading ${file.nasPath}`
        try {
          await nasDownloadFile(file.nasPath, file.size)
        } catch (error) {
          if (status.cancelRequested) {
            break
          }
          folderFailed++
          failed++
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS download failed for ${file.nasPath}: ${error}`)
        }
        status.filesDone++
      }
      if (status.cancelRequested) {
        break // this folder is incomplete: no marker
      }

      // The marker is only written once the whole folder is complete (every subfolder read, every file there):
      // a folder with the marker plays from here when the NAS is not reachable. Never for a folder without
      // files - its empty copy would stand for the folder.
      const localDir = nasLocalPath(folder)
      if (folderFailed === 0 && complete && files.length > 0 && localDir) {
        await mkdir(localDir, { recursive: true })
        await nasRemoveDeletedFiles(folder, new Set(files.map((file) => normalizeNasPath(file.nasPath))))
        await writeFile(
          path.join(localDir, nasDownloadMarker),
          JSON.stringify({ nasPath: folder, completedAt: new Date().toISOString() }),
        )
      }
    }

    if (status.cancelRequested) {
      status.cancelled = true
      status.message = `Cancelled - ${status.filesDone} of ${status.filesTotal} files were downloaded (${nasFormatBytes(status.bytesDone)}). Run "Download selected" again to continue.`
      return
    }
    status.message =
      failed === 0
        ? `Done - ${status.filesDone} files downloaded.`
        : `Finished with ${failed} failed files or folders - run "Download selected" again to retry.`
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error)
    status.message = `Failed: ${status.error}`
  } finally {
    status.running = false
    nasDownloadAbort = undefined
  }
}

app.post('/api/nas/download/cancel', localOrElternSession, (_req, res) => {
  if (!nasDownloadStatus.running) {
    res.json({ success: false, error: 'No download is running.' })
    return
  }
  nasDownloadStatus.cancelRequested = true
  nasDownloadStatus.message = 'Cancelling...'
  nasDownloadAbort?.abort()
  res.json({ success: true })
})

app.post('/api/nas/download/sync', localOrElternSession, (_req, res) => {
  // both write into the same .part files, so not at the same time as "Reload covers" either
  if (nasDownloadStatus.running || nasCoverRefreshRunning) {
    res.status(409).json({ success: false, error: 'A download or a cover reload is already running.' })
    return
  }
  runNasSync().catch((error) => {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS sync crashed: ${error}`)
  })
  res.json({ success: true })
})

// "Reload covers": a cover that was swapped on the NAS under the same file name shows up again.
// 1. The thumbnails made from covers are dropped (they are made again the next time they are shown).
// 2. The cover pictures inside the downloaded NAS folders are fetched again (a folder that is downloaded
//    completely is not checked again by "Download selected", so a changed cover would stay old).
let nasCoverRefreshRunning = false

async function clearThumbnails(): Promise<number> {
  let removed = 0
  try {
    for (const name of await readdir(thumbDir)) {
      // a thumbnail being written right now: its rename would fail and switch thumbnails off for a while
      if (name.endsWith('.tmp')) continue
      await rm(path.join(thumbDir, name), { force: true })
      removed++
    }
  } catch {
    // No cache folder yet.
  }
  return removed
}

async function nasRefreshLocalCovers(): Promise<{ updated: number; reachable: boolean }> {
  if (!(await getActiveNasSession())) {
    return { updated: 0, reachable: false }
  }
  let updated = 0
  const walk = async (nasDir: string, localDir: string, depth: number): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await readdir(localDir, { withFileTypes: true })
    } catch {
      return
    }
    // Only folders that exist on the NAS and here; a listing that fails (folder gone) is skipped.
    const files = await withNasSession((session) => nasListFilesLive(session, nasDir === '' ? '/' : nasDir, true)).catch(() => undefined)
    for (const file of files ?? []) {
      if (!file.isdir && /\.(jpe?g|jfif|png|webp)$/i.test(file.name)) {
        // only pictures that are here already: the walk also lists folders above downloaded ones (and the NAS root),
        // whose other pictures were never fetched
        const target = nasLocalPath(file.path)
        if (!target || !(await stat(target).then(() => true, () => false))) continue
        try {
          await nasDownloadFile(file.path, file.additional?.size ?? -1, true, AbortSignal.timeout(30_000))
          updated++
        } catch (error) {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Cover reload failed for ${file.path}: ${error}`)
        }
      }
    }
    if (depth >= 12) {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await walk(`${nasDir}/${entry.name}`, path.join(localDir, entry.name), depth + 1)
      }
    }
  }
  await walk('', nasLocalRoot, 0)
  return { updated, reachable: true }
}

app.post('/api/nas/covers/refresh', localOrElternSession, async (_req, res) => {
  if (nasCoverRefreshRunning || nasDownloadStatus.running) {
    res.status(409).json({ success: false, error: 'A download or a cover reload is already running.' })
    return
  }
  nasCoverRefreshRunning = true
  try {
    nasCoverVersion = Date.now()
    nasListCacheClear()
    nasFolderIndexClear()
    const thumbnails = await clearThumbnails()
    const local = await nasRefreshLocalCovers()
    res.json({ success: true, thumbnails, covers: local.updated, nasReachable: local.reachable })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Cover reload failed: ${error}`)
    res.status(500).json({ success: false, error: 'The covers could not be reloaded.' })
  } finally {
    nasCoverRefreshRunning = false
  }
})

app.get('/api/nas/download/status', localOrElternSession, (_req, res) => {
  res.json(nasDownloadStatus)
})

// --------------------------------------------
// Local library (~/MuPiBox/media/<category>/...)
// --------------------------------------------
// The local audiobook/music/other folders are read live from disk on every
// request, in any folder depth - the same idea as the NAS tab. Changes made in
// the file explorer (Samba share) therefore show up the next time a tab is
// opened, with no "reload media database" step. Spotify, podcast and radio
// entries are not touched here; they still come from data.json.

const libraryRoot = '/home/dietpi/MuPiBox/media'
const libraryCategories = ['audiobook', 'music', 'other']

// Normalizes a relative library path like "audiobook/Artist/Album"; undefined if
// it is not inside one of the library categories (also blocks "..").
function libraryRel(relPath: string): string | undefined {
  const parts = nasPathParts(relPath)
  if (!parts || parts.length === 0 || !libraryCategories.includes(parts[0])) {
    return undefined
  }
  return parts.join('/')
}

async function libraryListFiles(relPath: string): Promise<NasFileEntry[]> {
  const rel = libraryRel(relPath)
  if (!rel) {
    throw new Error(`Invalid library path: ${relPath}`)
  }
  const entries = await readdir(path.join(libraryRoot, rel), { withFileTypes: true })
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, path: `${rel}/${entry.name}`, isdir: entry.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

// Same choice as on the NAS (pickCoverImage).
function libraryFindCover(files: NasFileEntry[]): string | undefined {
  return pickCoverImage(files)?.path
}

// An artist folder without a picture of its own gets the cover of the first album
// below it (as the old media database did) - looked up a couple of levels deep.
async function libraryFindCoverBelow(files: NasFileEntry[], depth: number): Promise<string | undefined> {
  if (depth <= 0) {
    return undefined
  }
  for (const sub of files.filter((f) => f.isdir).slice(0, 5)) {
    try {
      const subFiles = await libraryListFiles(sub.path)
      const cover = libraryFindCover(subFiles) ?? (await libraryFindCoverBelow(subFiles, depth - 1))
      if (cover) {
        return cover
      }
    } catch {
      // Unreadable folder - try the next one.
    }
  }
  return undefined
}

// --------------------------------------------
// Cover thumbnails
// --------------------------------------------
// Covers are often 1000-1400 px large, but the kiosk shows them at 300 px. Decoding and
// uploading that many big images makes a list with many albums load slowly on the Pi.
// Covers are therefore requested with a maximum size (&w=400) and served as small JPEGs
// that are made once with Python's PIL (package python3-pil) and kept in a cache folder.
// If PIL is missing or a picture cannot be converted, the original file is sent instead.

const thumbDir = '/home/dietpi/.mupibox/thumbs'
const thumbMaxParallel = 2
let thumbsUnavailableUntil = 0
let thumbRunning = 0
const thumbWaiting: (() => void)[] = []
const thumbJobs = new Map<string, Promise<string | undefined>>()

const thumbScript = `
import sys
from PIL import Image
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
try:
    im.draft('RGB', (size * 2, size * 2))
except Exception:
    pass
if im.mode in ('RGBA', 'LA', 'P'):
    im = im.convert('RGBA')
    background = Image.new('RGB', im.size, (255, 255, 255))
    background.paste(im, mask=im.split()[-1])
    im = background
else:
    im = im.convert('RGB')
im.thumbnail((size, size), Image.LANCZOS)
im.save(dst, 'JPEG', quality=82, optimize=True)
`

async function withThumbSlot<T>(work: () => Promise<T>): Promise<T> {
  if (thumbRunning >= thumbMaxParallel) {
    await new Promise<void>((resolve) => thumbWaiting.push(resolve))
  }
  thumbRunning++
  try {
    return await work()
  } finally {
    thumbRunning--
    thumbWaiting.shift()?.()
  }
}

// Returns the path of the thumbnail (created if needed), or undefined if none can be made.
// `seed` must change whenever the source picture changes.
function getThumbnail(
  src: string,
  size: number,
  seed: string,
  fetchSource?: () => Promise<string | undefined>,
): Promise<string | undefined> {
  if (Date.now() < thumbsUnavailableUntil) {
    return Promise.resolve(undefined)
  }
  const key = crypto.createHash('sha1').update(`${seed}|${size}`).digest('hex')
  const target = path.join(thumbDir, `${key}.jpg`)
  const running = thumbJobs.get(key)
  if (running) {
    return running
  }
  const job = (async () => {
    try {
      const info = await stat(target)
      // In use: moved up once a month (one small metadata write), so pruneThumbnails() keeps it.
      if (Date.now() - info.mtimeMs > 30 * 24 * 3600 * 1000) {
        const now = new Date()
        await fs.promises.utimes(target, now, now).catch(() => undefined)
      }
      return target
    } catch {
      // not made yet
    }
    await mkdir(thumbDir, { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    let source = src
    let fetched: string | undefined
    try {
      if (fetchSource) {
        fetched = await fetchSource()
        if (!fetched) {
          return undefined
        }
        source = fetched
      }
      await withThumbSlot(() =>
        execFileAsync('nice', ['-n', '10', 'python3', '-c', thumbScript, source, temp, String(size)], { timeout: 30000 }),
      )
      await rename(temp, target)
      return target
    } catch (error) {
      await rm(temp, { force: true })
      if (/No module named|ModuleNotFoundError|ENOENT/.test(String(error))) {
        // PIL (or python3) is not installed - do not try again for a while.
        thumbsUnavailableUntil = Date.now() + 10 * 60 * 1000
      }
      return undefined
    } finally {
      if (fetched) {
        await rm(fetched, { force: true })
      }
    }
  })().finally(() => thumbJobs.delete(key))
  thumbJobs.set(key, job)
  return job
}

// Thumbnails of covers that were changed or removed stay in the cache folder; drop the ones not used for two
// months (a used one is moved up monthly, see getThumbnail). At the start and then once a day - the backend runs
// for weeks.
async function pruneThumbnails(): Promise<void> {
  try {
    const limit = Date.now() - 60 * 24 * 3600 * 1000
    for (const name of await readdir(thumbDir)) {
      const file = path.join(thumbDir, name)
      if ((await stat(file)).mtimeMs < limit) {
        await rm(file, { force: true })
      }
    }
  } catch {
    // No cache folder yet.
  }
}
void pruneThumbnails()
setInterval(() => void pruneThumbnails(), 24 * 3600 * 1000).unref()

// Makes the thumbnails of all local covers in the background a while after start, so that
// the first look at a folder does not have to wait for them.
async function warmLibraryThumbnails(dir: string, depth: number): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && depth < 6 && !entry.name.startsWith('.')) {
      await warmLibraryThumbnails(full, depth + 1)
    } else if (entry.isFile() && isThumbnailable(entry.name)) {
      try {
        const info = await stat(full)
        await getThumbnail(full, 400, `lib|${full}|${info.mtimeMs}|${info.size}`)
      } catch {
        // Skip unreadable files.
      }
    }
  }
}
setTimeout(() => void warmLibraryThumbnails(libraryRoot, 0), 90 * 1000).unref()

function parseThumbSize(value: unknown): number | undefined {
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? Math.min(Math.max(Math.round(size), 64), 800) : undefined
}

function isThumbnailable(file: string): boolean {
  return /\.(jpe?g|jfif|png|webp)$/i.test(file)
}

// --- Track covers -------------------------------------------------------------------------------------------------
// The picture embedded in the audio file that plays (ID3 / FLAC, see embedded-cover.ts): like Spotify, a playlist of
// different stories shows each one's own cover. "file" is nas:<NAS path> or local:<library path> (the player sets it
// as trackFile). The picture is read once (only the head of the file) and kept as a thumbnail on the SD; files
// without one are remembered for a while.
const trackCoverMissing = new Map<string, number>()
const TRACK_COVER_MISSING_MS = 6 * 3600 * 1000

async function trackCover(file: string): Promise<string | undefined> {
  const colon = file.indexOf(':')
  const type = file.slice(0, colon)
  const filePath = file.slice(colon + 1)
  if (!/\.(mp3|flac)$/i.test(filePath)) return undefined // the formats embedded-cover.ts reads
  let seed: string
  let read: (start: number, end: number) => Promise<Buffer>
  if (type === 'nas') {
    if (!(await nasPathSelected(filePath))) return undefined
    const normalized = normalizeNasPath(filePath)
    const folder = normalized.split('/').slice(0, -1).join('/') || '/'
    const entry = (await nasListFiles(folder).catch(() => [] as NasFileEntry[])).find((f) => f.path === normalized)
    if (!entry) return undefined
    seed = `track|${normalized}|${entry.version ?? entry.additional?.size ?? ''}`
    const local = nasLocalPath(normalized)
    const localCopy = local && fs.existsSync(local) ? local : undefined
    read = async (start, end) => {
      if (localCopy) return await readFileRange(localCopy, start, end)
      const session = (await getActiveNasSession()) ?? nasLastSession
      if (!session) throw new Error('NAS not reachable')
      const response = await nasFetch(session, nasUrl(session, normalized), {
        headers: { Authorization: session.auth, Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(15000),
      })
      if (response.status !== 206 && response.status !== 200) throw new Error(`HTTP ${response.status}`)
      const data = Buffer.from(await response.arrayBuffer())
      // a server that ignores the range sends the whole file from the start
      return response.status === 200 ? data.subarray(start, end + 1) : data
    }
  } else if (type === 'local') {
    const rel = libraryRel(filePath)
    if (!rel) return undefined
    const absolute = path.join(libraryRoot, rel)
    const info = await stat(absolute).catch(() => undefined)
    if (!info?.isFile()) return undefined
    seed = `track|local|${rel}|${info.mtimeMs}|${info.size}`
    read = (start, end) => readFileRange(absolute, start, end)
  } else {
    return undefined
  }
  const missingSince = trackCoverMissing.get(seed)
  if (missingSince && Date.now() - missingSince < TRACK_COVER_MISSING_MS) return undefined
  const thumb = await getThumbnail(`track:${file}`, NAS_COVER_THUMB_SIZE, seed, async () => {
    const picture = await readEmbeddedPicture(read).catch(() => undefined)
    if (!picture) return undefined
    const tmp = path.join('/tmp', `.trackcover-${crypto.randomBytes(6).toString('hex')}${picture.mime === 'image/png' ? '.png' : '.jpg'}`)
    await writeFile(tmp, picture.data)
    return tmp
  })
  if (!thumb) {
    if (trackCoverMissing.size > 5000) trackCoverMissing.clear()
    trackCoverMissing.set(seed, Date.now())
  }
  return thumb
}

async function readFileRange(file: string, start: number, end: number): Promise<Buffer> {
  const handle = await fs.promises.open(file, 'r')
  try {
    const buffer = Buffer.alloc(Math.max(0, end - start + 1))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

app.get('/api/track-cover', async (req, res) => {
  const file = typeof req.query.file === 'string' ? req.query.file : ''
  const thumb = file ? await trackCover(file).catch(() => undefined) : undefined
  if (!thumb) {
    res.status(404).set('Cache-Control', 'no-store').send('no track cover')
    return
  }
  await sendThumbnail(res, thumb)
})

function sendThumbnail(res: express.Response, thumb: string): Promise<void> {
  return stat(thumb).then((info) => {
    // Revalidated on every use (a cheap 304 on the box itself) instead of cached blindly for a day, so a
    // reloaded cover (thumbnail made again, newer time) is shown at once.
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Last-Modified', info.mtime.toUTCString())
    const since = Date.parse(String(res.req?.headers?.['if-modified-since'] ?? ''))
    if (Number.isFinite(since) && Math.floor(info.mtimeMs / 1000) * 1000 <= since) {
      res.status(304).end()
      return
    }
    res.setHeader('Content-Length', String(info.size))
    pipeline(fs.createReadStream(thumb), res).catch(() => undefined)
  })
}

// Covers are asked for as small thumbnails (see above).
// Cover of the NAS or local album mplayer plays (the parents' web app shows it in "now playing"): the album
// folder's picture, else its online cover, else its parent's picture - as the NAS tab and the library show them.
// The folder pictures are kept 10 minutes per folder, as the web app asks every few seconds and a NAS listing is a
// network round trip.
const playingCoverCache = new Map<
  string,
  {
    album?: { type: 'nas' | 'local'; path: string }
    own: string | null
    ownPicture?: string
    parent: string | null
    at: number
  }
>()
async function playingAlbumCover(type: string, folder: string): Promise<string | null> {
  const key = `${type}|${folder}`
  let cached = playingCoverCache.get(key)
  if (!cached || Date.now() - cached.at >= 10 * 60 * 1000) {
    let album: { type: 'nas' | 'local'; path: string } | undefined
    let own: string | null = null
    let ownPicture: string | undefined
    let parentCover: string | null = null
    try {
      const parent = folder.split('/').slice(0, -1).join('/')
      if (type === 'nas' && (await nasPathSelected(folder))) {
        album = { type: 'nas', path: folder }
        const image = nasFindCoverImage(await nasListFiles(folder))
        const parentImage =
          !image && (await nasPathSelected(parent)) ? nasFindCoverImage(await nasListFiles(parent)) : undefined
        own = image ? nasStreamUrl(image) : null
        ownPicture = image
        parentCover = parentImage ? nasStreamUrl(parentImage) : null
      } else if (type === 'local' && libraryRel(folder)) {
        album = { type: 'local', path: libraryRel(folder) ?? folder }
        const image = libraryFindCover(await libraryListFiles(folder))
        const parentImage = !image && libraryRel(parent) ? libraryFindCover(await libraryListFiles(parent)) : undefined
        own = image ? libraryFileUrl(image) : null
        ownPicture = image
        parentCover = parentImage ? libraryFileUrl(parentImage) : null
      }
    } catch {
      own = null
      parentCover = null
    }
    if (playingCoverCache.size > 50) playingCoverCache.clear()
    cached = { album, own, ownPicture, parent: parentCover, at: Date.now() }
    playingCoverCache.set(key, cached)
  }
  // (an album the parents want without a cover, see hidden-covers.ts)
  if (cached.album && coverHidden(cached.album.type, cached.album.path)) return null
  if (cached.own) {
    // a picture far from square: the album's online cover, as in the lists
    const replaced =
      cached.album && cached.ownPicture
        ? onlineInsteadOfOwn(cached.album.type, cached.album.path, cached.ownPicture)
        : undefined
    return replaced ?? cached.own
  }
  const online = cached.album ? onlineAlbumCover(cached.album.type, cached.album.path) : undefined
  return online ?? cached.parent
}

function libraryFileUrl(relPath: string): string {
  return `/api/library/file?path=${encodeURIComponent(relPath)}&w=400`
}

async function libraryBuildEntry(
  relPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
  ownFilesOnly = false, // as in nasBuildMediaEntry
): Promise<Record<string, unknown>> {
  const files = await libraryListFiles(relPath)
  const isContainer = !ownFilesOnly && (await folderIsContainer(files, libraryListFiles))
  // (the parents chose "no cover" for this folder in the app, see hidden-covers.ts)
  const hidden = coverHidden('local', relPath)
  const ownPicture = hidden ? undefined : libraryFindCover(files)
  const ownCoverPath = hidden ? undefined : (ownPicture ?? (isContainer ? await libraryFindCoverBelow(files, 2) : undefined))
  const cover = hidden
    ? undefined
    : ((ownPicture && !isContainer ? onlineInsteadOfOwn('local', relPath, ownPicture) : undefined) ??
      (ownCoverPath ? libraryFileUrl(ownCoverPath) : undefined) ??
      (isContainer ? undefined : onlineAlbumCover('local', relPath)) ??
      (fallbackCoverPath ? libraryFileUrl(fallbackCoverPath) : undefined))
  return {
    type: 'library',
    category: relPath.split('/')[0],
    artist: artistName,
    title,
    libraryPath: relPath,
    // A folder with only subfolders (no audio files) opens the next level instead of playing.
    libraryIsContainer: isContainer,
    ...(ownFilesOnly ? { ownFiles: true } : {}),
    ...(hidden ? { coverHidden: true } : {}),
    cover,
    artistcover: cover,
  }
}

// Top-level folders of one category = the "artists" shown in that tab.
app.get('/api/library/artists', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : ''
  if (!libraryCategories.includes(category)) {
    res.json([])
    return
  }

  try {
    const top = await libraryListFiles(category)
    const entries = await Promise.all(
      top
        .filter((f) => f.isdir)
        .map(async (folder) => {
          try {
            return await libraryBuildEntry(folder.path, folder.name, folder.name)
          } catch (error) {
            console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable folder ${folder.path}: ${error}`)
            return undefined
          }
        }),
    )
    res.json(entries.filter((entry) => entry !== undefined))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list library category ${category}: ${error}`)
    res.json([])
  }
})

// Subfolders of one library folder, one level deeper.
app.get('/api/library/children', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!libraryRel(folderPath)) {
    res.status(400).json([])
    return
  }

  try {
    const files = await libraryListFiles(folderPath)
    const parentName = folderPath.split('/').filter(Boolean).pop() ?? folderPath
    const parentCoverPath = libraryFindCover(files)

    const entries = await Promise.all(
      files
        .filter((f) => f.isdir)
        .map(async (sub) => {
          try {
            // a folder with nothing to play is no tile (as on the NAS)
            const subFiles = await libraryListFiles(sub.path)
            if (!nasHasAudio(subFiles) && !(await folderIsContainer(subFiles, libraryListFiles))) {
              return null
            }
            return await libraryBuildEntry(sub.path, parentName, sub.name, parentCoverPath)
          } catch (error) {
            console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable folder ${sub.path}: ${error}`)
            return undefined
          }
        }),
    )
    // Audio files next to the subfolders: first comes an entry that plays them.
    if (nasHasAudio(files) && (await folderIsContainer(files, libraryListFiles))) {
      entries.unshift(await libraryBuildEntry(libraryRel(folderPath) ?? folderPath, parentName, parentName, undefined, true))
    }
    res.json(entries.filter((entry) => entry))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list library folder ${folderPath}: ${error}`)
    res.json([])
  }
})

// Cover images (and audio) of library folders, with Range support.
app.get('/api/library/file', async (req, res) => {
  const rel = libraryRel(typeof req.query.path === 'string' ? req.query.path : '')
  const contentType = rel ? nasContentTypes[path.extname(rel).toLowerCase()] : undefined
  if (!rel || !contentType) {
    res.status(400).send('Invalid path')
    return
  }

  const file = path.join(libraryRoot, rel)
  try {
    const info = await stat(file)
    if (!info.isFile()) {
      res.status(404).send('Not found')
      return
    }
    const thumbSize = parseThumbSize(req.query.w)
    if (thumbSize && isThumbnailable(file)) {
      const thumb = await getThumbnail(file, thumbSize, `lib|${file}|${info.mtimeMs}|${info.size}`)
      if (thumb) {
        await sendThumbnail(res, thumb)
        return
      }
    }
    nasServeLocalFile(req, res, file, info.size)
  } catch {
    res.status(404).send('Not found')
  }
})

app.post('/api/telegram/screen', (req, res) => {
  fs.readFile(mupiboxConfigPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading config: ${err.message}`)
      res.status(500).send('error')
      return
    }

    try {
      const mupiboxConfig = JSON.parse(data)
      if (
        !mupiboxConfig.telegram?.active ||
        !mupiboxConfig.telegram?.token?.length ||
        !mupiboxConfig.telegram?.chatId?.length
      ) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Telegram notification disabled.`)
        res.status(400).send('telegram_not_configured')
        return
      }
      // every track with a screenshot only when the parents asked for playback messages (see the player's
      // telegramPlaybackNotices)
      if (mupiboxConfig.telegram.notifyPlayback !== true) {
        res.status(204).end()
        return
      }

      // One argument per line, passed without a shell: the old code wrapped each line in "..." and
      // ran it through exec(), where $(...) and backticks inside double quotes are still executed.
      const message = typeof req.body?.message === 'string' ? req.body.message : ''
      const args = message ? message.split('\n') : []

      // pm2 starts this process without TERM: a tool below the script then printed "'unknown': unknown terminal
      // type" to stderr on every call, which counted as a failure although the message had been sent.
      const childEnv = { ...process.env, TERM: process.env.TERM || 'dumb' }
      execFile('/usr/bin/python3', ['/usr/local/bin/mupibox/telegram_notify_screen.py', ...args], { env: childEnv }, (error, _stdout, stderr) => {
        if (error) {
          console.error(
            `${new Date().toLocaleString()}: [MuPiBox-Server] Error sending telegram notification: ${error.message}`,
          )
          res.status(500).send('error')
          return
        }
        if (stderr) {
          // exit code 0: sent. Whatever came on stderr is a warning, not a failure.
          console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] Telegram notification warning: ${stderr.trim()}`)
        }
        res.status(200).send('ok')
      })
    } catch (parseError) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error parsing config: ${parseError}`)
      res.status(500).send('error')
    }
  })
})

const tryReadFile = (filePath: string, retries = 3, delayMs = 1000) => {
  return new Promise((resolve, reject) => {
    const attempt = (remainingRetries: number) => {
      jsonfile.readFile(filePath, (error, data) => {
        if (error) {
          if (remainingRetries > 0) {
            console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading ${filePath}, retrying...`)
            setTimeout(() => attempt(remainingRetries - 1), delayMs)
          } else {
            reject(error)
          }
        } else {
          resolve(data)
        }
      })
    }
    attempt(retries)
  })
}

const getMupiboxConfig = async (): Promise<MupiboxConfig | undefined> => {
  if (mupiboxConfigCache !== undefined) {
    return mupiboxConfigCache
  }

  if (mupiboxConfigLoadPromise) {
    return await mupiboxConfigLoadPromise
  }

  mupiboxConfigLoadPromise = (async () => {
    try {
      const configData = (await readJsonFile(mupiboxConfigPath)) as MupiboxConfig
      mupiboxConfigCache = configData
      return configData
    } catch (error) {
      console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to read mupibox config:`, error)
      return undefined
    } finally {
      mupiboxConfigLoadPromise = null
    }
  })()

  return await mupiboxConfigLoadPromise
}

// Synchronous config accessor for the Smart-Sync + Eltern deps, which read
// config from synchronous code paths. Reading the raw mupiboxConfigCache
// variable directly was a bug: it is undefined on a cold boot (nothing awaits
// the async getMupiboxConfig() at startup) AND right after every
// updateMupiboxConfig() call (which invalidates the cache, see ~line 423).
// In both windows Smart-Sync/Eltern saw `undefined` and fell back to
// DEFAULT_SPOTIFY_SYNC_CONFIG (prefix "MuPiBox", token "not configured") even
// though /etc/mupibox/mupiboxconfig.json was fully set up. Lazily (re)warm the
// cache with a synchronous read — the config is small and changes rarely.
const getMupiboxConfigSync = (): MupiboxConfig | undefined => {
  if (mupiboxConfigCache !== undefined) return mupiboxConfigCache
  try {
    mupiboxConfigCache = JSON.parse(fs.readFileSync(mupiboxConfigPath, 'utf8')) as MupiboxConfig
    return mupiboxConfigCache
  } catch (error) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] getMupiboxConfigSync read failed:`, error)
    return undefined
  }
}

// Phase 14b — Spotify Smart-Sync wiring.
// Dependency-bundle gives the sync module access to box-level helpers
// (data-lock, config update, config getter) without making it import
// server.ts internals directly.
const spotifySyncDeps: RunSyncDeps = {
  dataFile,
  getMupiboxConfig: getMupiboxConfigSync,
  updateMupiboxConfig,
  acquireDataLock: () => acquireLock(dataLock, '/api/spotify-sync'),
  releaseDataLock: () => releaseLock(dataLock, '/api/spotify-sync'),
}
app.use('/api/spotify-sync', createSpotifySyncRouter(spotifySyncDeps))

// Phase 14c — the routes of the app (JSON API under /api/app/*; /api/eltern/* the address of before, for links and
// scripts still using it). The magic-link landing handler at /app redeems
// ?token=... into a session cookie and redirects to /app (without the query) so the app loads cleanly.
app.use(
  ['/api/app', '/api/eltern'],
  createElternApiRouter({
    getMupiboxConfig: getMupiboxConfigSync,
    updateMupiboxConfig,
    activeDataPath: activedataFile,
    currentPlayLogStart,
    nasPathSelected,
    playingAlbumCover,
    playingTrackCover: async (file: string) =>
      (await trackCover(file).catch(() => undefined)) ? `/api/track-cover?file=${encodeURIComponent(file)}` : null,
    nasCover: writeNasCover,
    nasSelected: nasPathSelected,
    localLibrary: {
      root: libraryRoot,
      categories: libraryCategories,
      changed: () => {
        localLibraryVersion = Date.now()
      },
    },
  }),
)
// The parents' web app (/parents, first /eltern) is replaced by the app: its addresses lead there, with a login link's
// token (bookmarks, home-screen icons, Telegram messages sent before)
app.use(['/parents', '/eltern'], (req, res) => {
  const query = req.originalUrl.indexOf('?')
  res.redirect(302, `/app${query >= 0 ? req.originalUrl.slice(query) : ''}`)
})

// The MuPiBox app (one app for everything, see docs/eine-app/). Login: session cookie, password, or a magic link from
// the QR code on the display or Telegram (redeemed by the landing handler).
app.get('/app', buildElternLandingHandler())
// The app on a phone's home screen: its name is the box's (as on the display), its addresses stay under /app on
// whichever port it was added from (relative to this file)
app.get('/app/manifest.webmanifest', (_req, res) => {
  const mb = getMupiboxConfigSync()?.mupibox as { boxName?: unknown } | undefined
  const name = typeof mb?.boxName === 'string' && mb.boxName.trim() ? mb.boxName.trim() : 'MuPiBox'
  res.setHeader('Cache-Control', 'no-cache')
  res.type('application/manifest+json').send(
    JSON.stringify({
      id: '/app/',
      name,
      short_name: name,
      description: 'MuPiBox',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: '#0F1522',
      theme_color: '#0F1522',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
  )
})
// The remote control of the display (VNC): noVNC's page comes from here, its connection goes through the app (see
// proxyVncUpgrade) - x11vnc and websockify listen on the box itself only, no longer in the whole Wi-Fi without a password
const noVncDir = '/usr/share/novnc'
app.use('/app/vnc', express.static(noVncDir, { index: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }))

// The websocket of noVNC (/app/vnc/websockify): for a parent signed in to the app (its session cookie - no second
// password), from a page of the box itself (a foreign page's websocket carries its own Origin), passed on to websockify
function proxyVncUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const refuse = (status: string) => {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] VNC connection refused (${status}): ${req.url} host=${req.headers.host ?? ''} origin=${req.headers.origin ?? ''}`)
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
  }
  if (!(req.url ?? '').startsWith('/app/vnc/websockify')) return refuse('404 Not Found')
  const host = req.headers.host
  let sameBox = isAllowedHost(host)
  if (sameBox && req.headers.origin) {
    try {
      sameBox = new URL(req.headers.origin).host.toLowerCase() === String(host).toLowerCase()
    } catch {
      sameBox = false
    }
  }
  if (!sameBox) return refuse('403 Forbidden')
  if (!validateSession(parseCookie(req as express.Request, SESSION_COOKIE))) return refuse('401 Unauthorized')
  const upstream = net.connect(6080, '127.0.0.1', () => {
    const lines = [`GET /websockify HTTP/${req.httpVersion}`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => refuse('502 Bad Gateway'))
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
}

app.use(
  '/app',
  express.static(path.join(serverDir, 'mupi-app'), {
    // (no browser cache period: new versions of the page arrive at once, revalidated by ETag)
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache')
    },
  }),
)

// Catch-all handler: send back Angular's index.html file for any non-API routes
// This must be placed after all API routes but before starting the server
if (productionServe) {
  app.get(/.*/, (_req, res) => {
    res.sendFile('index.html', { root: path.join(serverDir, 'www') })
  })
}

// Zentraler Fehler-Handler. Muss nach allen Routen stehen und zwingend vier
// Parameter haben -- daran erkennt Express eine Error-Middleware. Express 5
// leitet auch abgelehnte Promises aus async-Handlern hierher, so dass ein
// Fehler in einer der ~98 Routen als sauberes JSON-500 endet statt als
// unbehandelte Rejection.
app.use((err: Error, _req: ExpressRequest, res: ExpressResponse, _next: ExpressNextFunction) => {
  console.error(
    `${new Date().toLocaleString()}: [mupibox-backend-api] unhandled route error: ${err?.message}`,
    err?.stack,
  )
  if (res.headersSent) return
  res.status(500).json({ error: 'internal error' })
})

// Prozessweites Sicherheitsnetz für alles ausserhalb des Request-Pfads:
// Timer, Poller, Scheduler. Node beendet sich seit v15 bei einer
// unbehandelten Rejection -- für ein Gerät im Kinderzimmer ist ein
// protokollierter Fehler die bessere Wahl als ein Neustart mitten im
// Hörspiel. uncaughtException bleibt dagegen fatal: Danach kann der
// Prozesszustand inkonsistent sein, da ist ein sauberer pm2-Neustart
// ehrlicher als Weiterlaufen.
process.on('unhandledRejection', (reason) => {
  console.error(
    `${new Date().toLocaleString()}: [mupibox-backend-api] unhandled promise rejection:`,
    reason instanceof Error ? `${reason.message}\n${reason.stack}` : reason,
  )
})
process.on('uncaughtException', (err) => {
  console.error(`${new Date().toLocaleString()}: [mupibox-backend-api] uncaught exception: ${err.message}`, err.stack)
  process.exit(1)
})

if (!testServe) {
  const server = app.listen(8200)
  server.on('upgrade', proxyVncUpgrade)
  // A request may take up to 5 minutes by default: too short for a large file uploaded from the web app over WiFi
  server.requestTimeout = 60 * 60 * 1000
  console.log(`${new Date().toLocaleString()}: [mupibox-backend-api] Server started at http://localhost:8200`)
  // the same app for the web server of port 80/443 (lighttpd proxies /app, /api, ... here; see request-guard.ts)
  const proxied = app.listen(PROXY_PORT, '127.0.0.1')
  proxied.on('upgrade', proxyVncUpgrade)
  proxied.requestTimeout = 60 * 60 * 1000
  proxied.on('error', (err) => console.error(`${new Date().toLocaleString()}: [mupibox-backend-api] port ${PROXY_PORT}: ${err.message}`))
  // Spotify-sync scheduler — only in production / dev, not under tests.
  // Boot-after-60s lead-in inside startScheduler so initial config load
  // has time to finish before the first sync attempt.
  startScheduler(spotifySyncDeps)
  // The Spotify login's 6 months: reminders before the end, a message when Spotify refused it (eltern/spotify-auth-age.ts)
  startSpotifyLoginWatch({ getMupiboxConfig: getMupiboxConfigSync, updateMupiboxConfig })
  startTlsWatch({ getMupiboxConfig: getMupiboxConfigSync, updateMupiboxConfig })
  setConfiguredHosts(() => {
    const linkHost = (getMupiboxConfigSync()?.tls as { linkHost?: unknown } | undefined)?.linkHost
    return typeof linkHost === 'string' && linkHost !== '' ? [linkHost.toLowerCase()] : []
  })
  // Eltern-WebApp rate-limit map cleanup tick.
  startBucketCleanup()
  // Phase 18 Item 4: Play-Log poller — sniffs localhost:5005 (the player's
  // own HTTP API) every 10 s and writes a jsonl log of track-starts/-stops
  // so the Eltern-WebApp can show what was played today / this week. No
  // player change needed — zero risk to audio.
  startPlayLogPoller()
  // Phase 18 Item 6: Battery-Log poller — writes /api/mupihat snapshots
  // every 60 s into a jsonl so the WebApp can plot a 24h chart. No RRD —
  // the existing /tmp/.rrd only tracks CPU/RAM. Forward-looking: chart
  // fills up over the next few hours.
  startBatteryLogPoller()
  // Phase 18 Item 1: apply mupibox.startupVolume on backend-api start so the
  // box doesn't pick up wherever the last session left off (which can be loud
  // — especially after a charge cycle when the kid had cranked it up). The
  // 1.5 s delay lets the audio subsystem settle on a cold boot.
  setTimeout(() => {
    try {
      const v = (getMupiboxConfigSync()?.mupibox as { startupVolume?: number } | undefined)?.startupVolume
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) {
        execFile('/usr/bin/amixer', ['sset', 'Master', `${Math.floor(v)}%`], { timeout: 3000 }, (err) => {
          if (err) {
            console.warn(`${new Date().toLocaleString()}: [startup-volume] amixer failed: ${err.message}`)
          } else {
            console.log(`${new Date().toLocaleString()}: [startup-volume] applied ${Math.floor(v)}%`)
          }
        })
      }
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [startup-volume] error: ${(err as Error).message}`)
    }
  }, 1500).unref?.()
}
