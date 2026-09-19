import { exec, execFile } from 'node:child_process'
import crypto from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import cors from 'cors'
import express from 'express'
import jsonfile from 'jsonfile'
import ky from 'ky'
import xmlparser from 'xml-js'
import { LogRequest, LogResponse } from './models/log.model'
import type { MupiboxConfig } from './models/mupibox-config.model'
import { ServerConfig } from './models/server.model'
import type { SpotifyValidationRequest, SpotifyValidationResponse } from './models/spotify-api.model'
import { SpotifyApiService } from './services/spotify-api.service'
import { SpotifyMediaInfo } from './services/spotify-media-info.service'

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
})
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
const dataLock = '/tmp/.data.lock'
const resumeLock = '/tmp/.resume.lock'

// RSS feed cache: persisted on disk (not /tmp) so cached podcast covers and feed
// data survive a reboot.
const rssCacheDataDir = `${configBasePath}/rss-cache`
const rssCoverDir = path.join(__dirname, 'www', 'rss-covers')
const rssCoverPublicBase = '/rss-covers'

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
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// We only want to serve the Angular app as static files in production so that we can start
// the Angular development server during development to be able to hot-reload and debug.
// We explicitely check for !== 'development' for now so we do not need to set this env in
// production.
if (productionServe) {
  // Static path to compiled Angular app
  app.use(express.static(path.join(__dirname, 'www')))
}

// Routes
app.get('/api/rssfeed', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl !== 'string') {
    res.status(500).send('Given url is not a string.')
    return
  }
  ky.get(rssUrl)
    .text()
    .then((response) => {
      res.send(xmlparser.xml2json(response, { compact: true, nativeType: true }))
    })
    .catch(() => {
      res.status(500).send('External url responded with error code.')
    })
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
    const extension = path.extname(new URL(coverUrl).pathname).split('?')[0] || '.jpg'
    const coverFileName = `${cacheKey}${extension}`
    const buffer = Buffer.from(await ky.get(coverUrl, { timeout: 15000 }).arrayBuffer())
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

  const xml = await ky.get(rssUrl, { timeout: rssFetchTimeoutMs }).text()
  const feed = JSON.parse(xmlparser.xml2json(xml, { compact: true, nativeType: true }))

  const hasNewEpisode = latestEpisodeFingerprint(feed) !== latestEpisodeFingerprint(previousFeed)
  const previousCoverUrl = extractRssText(previousFeed?.rss?.channel?.image?.url)
  const coverMissing = rssCoverFileMissing(previousCoverUrl)

  if (previousFeed && !hasNewEpisode && !coverMissing) {
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
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
      res.json(cached)
      // Refresh in the background for next time; don't make the caller wait for it.
      refreshRssCache(rssUrl, cacheKey).catch((error) => {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Background RSS refresh failed: ${error}`)
      })
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
app.get('/api/rssfeed/image', async (req, res) => {
  const imageUrl = req.query.url
  if (typeof imageUrl !== 'string') {
    res.status(400).send('Given url is not a string.')
    return
  }

  let localFile: string
  let extension: string
  try {
    const key = rssCacheKeyFor(imageUrl)
    extension = path.extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg'
    localFile = path.join(rssCoverDir, `${key}${extension}`)
  } catch {
    res.status(400).send('Invalid image url.')
    return
  }

  const contentType = imageContentTypes[extension.toLowerCase()] ?? 'image/jpeg'

  if (fs.existsSync(localFile)) {
    try {
      const buffer = await readFile(localFile)
      res.set('Cache-Control', 'public, max-age=604800').type(contentType).send(buffer)
      return
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to read cached RSS image ${localFile}: ${error}`)
      // Fall through and try fetching it fresh below.
    }
  }

  try {
    const buffer = Buffer.from(await ky.get(imageUrl, { timeout: 8000 }).arrayBuffer())
    await mkdir(rssCoverDir, { recursive: true })
    await writeFile(localFile, buffer)
    res.set('Cache-Control', 'public, max-age=604800').type(contentType).send(buffer)
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to proxy/cache RSS episode image ${imageUrl}: ${error}`)
    res.status(502).send('Failed to fetch image.')
  }
})

app.get('/api/data', (_req, res) => {
  if (fs.existsSync(activedataFile)) {
    jsonfile.readFile(activedataFile, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/data read active_data.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/resume', (_req, res) => {
  if (fs.existsSync(resumeFile)) {
    tryReadFile(resumeFile)
      .then((data) => {
        res.json(data)
      })
      .catch((error) => {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/resume read resume.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.status(500).send('Internal Server Error')
      })
  } else {
    res.status(404).send(`File Not Found: ${resumeFile}`)
  }
})

app.get('/api/mupihat', (_req, res) => {
  if (fs.existsSync(mupihat)) {
    jsonfile.readFile(mupihat, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/mupihat read mupihat.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/activeresume', (_req, res) => {
  if (fs.existsSync(activeresumeFile)) {
    jsonfile.readFile(activeresumeFile, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/activeresume read active_resume.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
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
  const ip = req.socket.remoteAddress
  const host = req.hostname
  const isLocalhost =
    ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === '::1' || host.indexOf('localhost') !== -1

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
  if (fs.existsSync(wlanFile)) {
    jsonfile.readFile(wlanFile, (error, data) => {
      if (error) {
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/wlan read wlan.json`)
        console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.post('/api/addwlan', (req, res) => {
  jsonfile.readFile(wlanFile, (error, data) => {
    let out = data

    if (error) out = []
    out.push(req.body)

    jsonfile.writeFile(wlanFile, out, { spaces: 4 }, (error) => {
      if (error) throw error
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

app.get('/api/wifi/configured', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'list_networks'])
    res.json(parseWpaCliNetworks(stdout))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error listing wifi networks: ${error}`)
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
    const previous = networks.get(ssid)
    if (!previous || signalDbm > previous.signalDbm) {
      networks.set(ssid, { signalDbm, secured: /WPA|WEP|RSN/.test(parts[3]) })
    }
  }
  return networks
}

// Rough dBm -> percent (-100 dBm = 0 %, -50 dBm and better = 100 %).
function wifiSignalPercent(signalDbm: number): number {
  return Math.min(100, Math.max(0, 2 * (signalDbm + 100)))
}

interface WifiNetworkInfo {
  ssid: string
  id?: number
  current: boolean
  available: boolean
  signalDbm?: number
  signal?: number
  secured?: boolean
}

// Networks in range (strongest first) merged with the saved ones; saved networks
// that are not in range are listed last and marked as not available.
app.get('/api/wifi/networks', async (req, res) => {
  try {
    if (req.query.refresh !== '0') {
      try {
        await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'scan'])
        await new Promise((resolve) => setTimeout(resolve, 3500))
      } catch {
        // A scan may already be running or the adapter busy - the last results are still usable.
      }
    }

    const { stdout: configuredOutput } = await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'list_networks'])
    let scanned = new Map<string, WifiScanEntry>()
    try {
      const { stdout: scanOutput } = await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'scan_results'])
      scanned = parseWpaCliScanResults(scanOutput)
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading wifi scan results: ${error}`)
    }

    const networks: WifiNetworkInfo[] = []
    for (const configured of parseWpaCliNetworks(configuredOutput)) {
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
    await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'remove_network', String(id)])
    await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'save_config'])
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Removed wifi network ${id}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error removing wifi network ${id}: ${error}`)
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
    await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'set_network', String(id), 'psk', `"${password}"`])
    await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'enable_network', String(id)])
    await execFileAsync('sudo', ['wpa_cli', '-i', 'wlan0', 'save_config'])
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Updated password for wifi network ${id}`)
    res.status(200).send('ok')
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error updating wifi network ${id}: ${error}`)
    res.status(500).send('error')
  }
})

app.post('/api/add', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/add data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/add read data.json`)
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.push(req.body)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/add - data.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/addresume', (req, res) => {
  try {
    if (fs.existsSync(resumeLock)) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume resume.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(resumeLock, 'w')
      jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/add read resume.json`)
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          // Index des vorhandenen Eintrags mit derselben "id" finden
          const index = data.findIndex((item: { id: any }) => item.id === req.body.id)

          if (index !== -1) {
            // Wenn der Eintrag vorhanden ist, ersetze ihn
            data[index] = req.body
            console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Entry with id ${req.body.id} replaced.`)
          } else {
            // Wenn der Eintrag nicht vorhanden ist, füge ihn hinzu
            data.push(req.body)
            console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] New entry with id ${req.body.id} added.`)
          }

          jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(resumeLock, (err) => {
        if (err) throw err
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume - resume.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/delete', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/delete read data.json`)
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.splice(req.body.index, 1)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete - data.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/edit', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/edit read data.json`)
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.splice(req.body.index, 1, req.body.data)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit - data.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/editresume', (req, res) => {
  try {
    if (fs.existsSync(resumeLock)) {
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/editresume resume.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(resumeLock, 'w')
      jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Error /api/editresume read resume.json`)
          console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          // Prüfe, ob die ID bereits im Array existiert
          const existingIndex = data.findIndex((item: { id: any }) => item.id === req.body.data.id)

          if (existingIndex !== -1) {
            // Ersetze den vorhandenen Eintrag mit derselben ID
            data[existingIndex] = req.body.data
            console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Entry with id ${req.body.data.id} replaced.`)
          } else {
            // Bestimme den zu verwendenden Index basierend auf der Array-Länge
            const indexToReplace = Math.min(req.body.index, data.length - 1)

            // Ersetze den Eintrag am berechneten Index oder füge hinzu
            data.splice(indexToReplace, 1, req.body.data)
            console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Entry at index ${indexToReplace} replaced.`)
          }

          // Speichere die geänderten Daten zurück in die Datei
          jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(resumeLock, (err) => {
        if (err) throw err
        console.log(
          `${new Date().toLocaleString()}: [MuPiBox-Server] /api/editresume - resume.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.get('/api/spotify/config', (_req, res) => {
  if (config?.spotify === undefined) {
    res.status(500).send('Could load spotify config.')
    return
  }
  res.status(200).send({
    ...config.spotify,
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

app.get('/api/config', (_req, res) => {
  fs.readFile(mupiboxConfigPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Error reading mupibox config: ${err.message}`)
      res.status(500).send('Error reading mupibox configuration')
      return
    }

    try {
      const mupiboxConfig = JSON.parse(data)
      res.json(mupiboxConfig)
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
// Synology NAS integration
// --------------------------------------------
// Browses and streams media from a Synology NAS live over its File Station Web
// API (the same API the official "DS file" app uses) - no SMB/CIFS mount, no
// data.json caching. Every read hits the NAS directly, so changes made on the
// NAS show up the next time a category/page is opened, with no manual "update
// media" step required.

interface SynologySession {
  sid: string
  base: string
}

let synologySessionCache: SynologySession | undefined

class SynologySessionExpiredError extends Error {}

// The NAS answered, but with an API-level error (e.g. folder no longer exists) -
// unlike a network failure this does not mean the NAS is offline.
class SynologyApiError extends Error {}

// Local copies of NAS folders ("Download local") live here, mirroring the NAS
// path (e.g. /music/Artist/Album -> <root>/music/Artist/Album), so they stay
// playable when the NAS or the network is not available.
const nasLocalRoot = '/home/dietpi/MuPiBox/media/NAS'
const nasDownloadMarker = '.mupibox-nas-download'

const synologySessionErrorCodes = new Set([105, 106, 107, 119])

const synologyAudioExtensions = ['.mp3', '.flac', '.wav', '.wma', '.ogg', '.m4a']

// Synology's documented SYNO.API.Auth login error codes.
const synologyAuthErrorMessages: Record<number, string> = {
  400: 'Wrong account name or password.',
  401: 'This account is disabled.',
  402: 'Permission denied.',
  403: 'Two-factor authentication is required and not supported here.',
  404: 'Two-factor authentication code required and not supported here.',
  406: 'Two-factor authentication enforced and not supported here.',
  407: 'Too many failed login attempts - please try again later.',
  408: 'Password expired - please change it in DSM first.',
  409: 'Password must be changed - please change it in DSM first.',
  410: 'Account not activated yet.',
}

// Resolves the "Address or QuickConnect ID" field into a base URL. MuPiBox and
// the NAS normally live on the same home LAN, so a direct host/IP is the
// well-supported path; an input with no dot or colon is assumed to be a
// QuickConnect ID and gets a best-effort https://<id>.quickconnect.to URL
// (Synology's actual QuickConnect relay handshake is not implemented).
function synologyResolveBase(address: string, useHttps: boolean): string {
  const looksLikeHostOrIp = /[.:]/.test(address)
  if (!looksLikeHostOrIp) {
    return `https://${address}.quickconnect.to`
  }
  const [host, port] = address.split(':')
  const resolvedPort = port ?? (useHttps ? '5001' : '5000')
  return `${useHttps ? 'https' : 'http'}://${host}:${resolvedPort}`
}

async function synologyLogin(
  base: string,
  account: string,
  password: string,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const url =
      `${base}/webapi/entry.cgi?api=SYNO.API.Auth&version=6&method=login&session=FileStation&format=sid` +
      `&account=${encodeURIComponent(account)}&passwd=${encodeURIComponent(password)}`
    // Synology intentionally delays the response by several seconds on wrong
    // credentials (anti-bruteforce throttling) - the timeout must be generous
    // or a wrong password looks like a network failure instead of a clear error.
    const data = await ky
      .get(url, { timeout: 25000 })
      .json<{ success: boolean; data?: { sid: string }; error?: { code: number } }>()
    if (data.success && data.data?.sid) {
      return { success: true, sid: data.data.sid }
    }
    const code = data.error?.code
    return { success: false, error: (code && synologyAuthErrorMessages[code]) || `Login failed (error ${code ?? 'unknown'}).` }
  } catch (error) {
    if (error instanceof Error && /certificate|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(error.message)) {
      return { success: false, error: 'Certificate not trusted - use HTTP, or install a valid certificate on the NAS.' }
    }
    return { success: false, error: 'Could not reach the NAS. Check the address and network connection.' }
  }
}

let synologySessionPromise: Promise<SynologySession | undefined> | undefined
let synologyOfflineUntil = 0

// After a network failure, skip the NAS for a short while so the kids' UI can fall
// back to the local downloads immediately instead of waiting on timeouts every time.
function synologyMarkOffline(): void {
  synologyOfflineUntil = Date.now() + 30000
  synologySessionCache = undefined
}

async function synologyLoginWithRememberedCredentials(): Promise<SynologySession | undefined> {
  const config = await getMupiboxConfig()
  const syn = config?.synology
  if (!syn?.rememberMe || !syn.address || !syn.account || !syn.password) {
    return undefined
  }
  const base = synologyResolveBase(syn.address, Boolean(syn.https))
  try {
    await ky.get(`${base}/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth`, { timeout: 3000 })
  } catch {
    synologyMarkOffline()
    return undefined
  }
  const result = await synologyLogin(base, syn.account, syn.password)
  if (!result.success || !result.sid) {
    return undefined
  }
  synologySessionCache = { sid: result.sid, base }
  return synologySessionCache
}

// Returns a cached session, or transparently logs back in using the
// remembered credentials (if any) - existing installs won't have a
// "synology" config section at all, so every field is read defensively.
async function getActiveSynologySession(): Promise<SynologySession | undefined> {
  if (synologySessionCache) {
    return synologySessionCache
  }
  if (Date.now() < synologyOfflineUntil) {
    return undefined
  }
  // Several requests often arrive at once (e.g. one per artist): share one login.
  if (!synologySessionPromise) {
    synologySessionPromise = synologyLoginWithRememberedCredentials().finally(() => {
      synologySessionPromise = undefined
    })
  }
  return await synologySessionPromise
}

// Runs `fn` with an active session, retrying exactly once (with a fresh
// login) if the session turned out to be expired.
async function withSynologySession<T>(fn: (session: SynologySession) => Promise<T>): Promise<T | undefined> {
  let session = await getActiveSynologySession()
  if (!session) {
    return undefined
  }
  try {
    return await fn(session)
  } catch (error) {
    if (error instanceof SynologySessionExpiredError) {
      synologySessionCache = undefined
      session = await getActiveSynologySession()
      if (!session) {
        return undefined
      }
      return await fn(session)
    }
    throw error
  }
}

interface SynologyFileEntry {
  name: string
  path: string
  isdir: boolean
  additional?: { size?: number }
}

async function synologyApiGet<T>(
  session: SynologySession,
  api: string,
  version: number,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const query = new URLSearchParams({ api, version: String(version), method, _sid: session.sid, ...params })
  const url = `${session.base}/webapi/entry.cgi?${query.toString()}`
  const data = await ky.get(url, { timeout: 6000 }).json<{ success: boolean; data?: T; error?: { code: number } }>()
  if (data.success) {
    return data.data as T
  }
  if (data.error?.code && synologySessionErrorCodes.has(data.error.code)) {
    throw new SynologySessionExpiredError()
  }
  throw new SynologyApiError(`Synology API error ${data.error?.code}`)
}

async function synologyListFiles(
  session: SynologySession,
  folderPath: string,
  withSize = false,
): Promise<SynologyFileEntry[]> {
  const params: Record<string, string> = { folder_path: folderPath }
  if (withSize) {
    params.additional = '["size"]'
  }
  const data = await synologyApiGet<{ files?: SynologyFileEntry[] }>(session, 'SYNO.FileStation.List', 2, 'list', params)
  return data?.files ?? []
}

// --- Local copies ("Download local") --------------------------------------

function nasPathParts(nasPath: string): string[] | undefined {
  const parts = nasPath.split('/').filter(Boolean)
  return parts.some((part) => part === '..' || part === '.') ? undefined : parts
}

function normalizeNasPath(nasPath: string): string {
  return `/${(nasPathParts(nasPath) ?? []).join('/')}`
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

async function nasLocalListFiles(nasPath: string): Promise<SynologyFileEntry[] | undefined> {
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

// Lists a NAS folder: from the local copy if it was downloaded, otherwise live
// from the NAS, and from whatever is stored locally if the NAS is unreachable.
async function nasListFiles(folderPath: string): Promise<SynologyFileEntry[]> {
  if (nasIsDownloaded(folderPath)) {
    const local = await nasLocalListFiles(folderPath)
    if (local) {
      return local
    }
  }
  try {
    const live = await withSynologySession((session) => synologyListFiles(session, folderPath))
    if (live !== undefined) {
      return live
    }
  } catch (error) {
    if (!(error instanceof SynologyApiError || error instanceof SynologySessionExpiredError)) {
      synologyMarkOffline()
    }
  }
  const local = await nasLocalListFiles(folderPath)
  if (local) {
    return local
  }
  throw new Error(`NAS folder not available: ${folderPath}`)
}

function synologyFindCoverImage(files: SynologyFileEntry[]): string | undefined {
  const image = files.find((f) => !f.isdir && /\.(jpe?g|png)$/i.test(f.name))
  return image?.path
}

function synologyStreamUrl(filePath: string): string {
  return `/api/synology/stream?path=${encodeURIComponent(filePath)}`
}

// A folder that holds no audio files but only subfolders is a "container": the
// kids' UI drills into it like an artist level instead of trying to play it.
// This allows any number of nesting levels.
function synologyIsContainer(files: SynologyFileEntry[]): boolean {
  const hasAudio = files.some((f) => !f.isdir && synologyAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
  const hasSubfolders = files.some((f) => f.isdir)
  return !hasAudio && hasSubfolders
}

// Builds the ready-to-use Media entry for one NAS folder (live listing).
async function synologyBuildMediaEntry(
  folderPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
): Promise<Record<string, unknown>> {
  const files = await nasListFiles(folderPath)
  const ownCoverPath = synologyFindCoverImage(files)
  const coverPath = ownCoverPath ?? fallbackCoverPath
  return {
    type: 'nas',
    category: 'nas',
    artist: artistName,
    title,
    nasPath: folderPath,
    nasIsContainer: synologyIsContainer(files),
    cover: coverPath ? synologyStreamUrl(coverPath) : undefined,
    artistcover: coverPath ? synologyStreamUrl(coverPath) : undefined,
  }
}

async function updateSynologyConfig(partial: Record<string, unknown>): Promise<void> {
  const current = await getMupiboxConfig()
  if (!current) {
    throw new Error('Cannot update config: current mupibox config could not be read.')
  }
  const updated = { ...current, synology: { ...(current.synology ?? {}), ...partial } }
  const tmpPath = '/tmp/.mupiboxconfig-synology.json'
  await writeFile(tmpPath, JSON.stringify(updated))
  await execFileAsync('sudo', ['mv', tmpPath, mupiboxConfigPath])
  mupiboxConfigCache = updated as MupiboxConfig
}

app.post('/api/synology/login', async (req, res) => {
  const { address, https: useHttps, account, password, rememberMe } = req.body ?? {}
  if (typeof address !== 'string' || !address || typeof account !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'address, account and password are required.' })
    return
  }

  const base = synologyResolveBase(address, Boolean(useHttps))
  const result = await synologyLogin(base, account, password)
  if (!result.success || !result.sid) {
    res.json({ success: false, error: result.error })
    return
  }

  synologySessionCache = { sid: result.sid, base }
  synologyOfflineUntil = 0

  if (rememberMe === true) {
    try {
      await updateSynologyConfig({ address, https: Boolean(useHttps), account, password, rememberMe: true })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save Synology login: ${error}`)
    }
  }

  res.json({ success: true })
})

app.get('/api/synology/browse', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''

  try {
    const result = await withSynologySession(async (session) => {
      const config = await getMupiboxConfig()
      const markedFolders = new Set(config?.synology?.artistFolders ?? [])
      const downloadFolders = new Set(config?.synology?.downloadFolders ?? [])

      let entries: { name: string; path: string; isDirectory: boolean }[]
      if (!folderPath) {
        const data = await synologyApiGet<{ shares?: SynologyFileEntry[] }>(
          session,
          'SYNO.FileStation.List',
          2,
          'list_share',
          {},
        )
        entries = (data?.shares ?? []).map((s) => ({ name: s.name, path: s.path, isDirectory: true }))
      } else {
        const files = await synologyListFiles(session, folderPath)
        entries = files.filter((f) => f.isdir).map((f) => ({ name: f.name, path: f.path, isDirectory: true }))
      }

      return entries.map((e) => ({
        ...e,
        isMarked: markedFolders.has(e.path),
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
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to browse Synology path ${folderPath}: ${error}`)
    res.status(502).json({ success: false, error: 'nas_unreachable' })
  }
})

// `list` selects which selection is changed: "artist" (Show in MuPiBox, default)
// or "download" (Download local).
app.post('/api/synology/mark', async (req, res) => {
  const { path: folderPath, marked, list } = req.body ?? {}
  if (typeof folderPath !== 'string' || typeof marked !== 'boolean') {
    res.status(400).json({ success: false, error: 'path and marked are required.' })
    return
  }
  const key = list === 'download' ? 'downloadFolders' : 'artistFolders'

  try {
    const config = await getMupiboxConfig()
    const existing = (config?.synology?.[key] as string[] | undefined) ?? []
    const next = marked ? Array.from(new Set([...existing, folderPath])) : existing.filter((p) => p !== folderPath)
    await updateSynologyConfig({ [key]: next })
    res.json({ success: true, [key]: next })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save Synology selection: ${error}`)
    res.status(500).json({ success: false })
  }
})

app.get('/api/synology/artists', async (_req, res) => {
  try {
    const config = await getMupiboxConfig()
    const artistFolders = config?.synology?.artistFolders ?? []

    // One entry per marked folder. Deeper levels are loaded on demand via
    // /api/synology/children as the user navigates, so this stays cheap.
    const entries = await Promise.all(
      artistFolders.map(async (artistPath) => {
        try {
          const artistName = artistPath.split('/').filter(Boolean).pop() ?? artistPath
          return await synologyBuildMediaEntry(artistPath, artistName, artistName)
        } catch (error) {
          // Skip just this one folder (deleted on the NAS since it was marked, or
          // NAS offline and never downloaded) instead of failing the whole category.
          console.error(
            `${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unavailable NAS folder ${artistPath}: ${error}`,
          )
          return undefined
        }
      }),
    )
    res.json(entries.filter((entry) => entry !== undefined))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS artists: ${error}`)
    res.json([])
  }
})

// Lists the subfolders of one NAS folder as ready-to-use Media entries (one
// level deeper). Live from the NAS, or from the local copy when downloaded /
// when the NAS is not reachable. Used by the kids' UI to drill down.
app.get('/api/synology/children', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json([])
    return
  }

  try {
    const files = await nasListFiles(folderPath)
    const parentName = folderPath.split('/').filter(Boolean).pop() ?? folderPath
    const parentCoverPath = synologyFindCoverImage(files)

    const entries = await Promise.all(
      files
        .filter((f) => f.isdir)
        .map(async (sub) => {
          try {
            return await synologyBuildMediaEntry(sub.path, parentName, sub.name, parentCoverPath)
          } catch (error) {
            console.error(
              `${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable NAS folder ${sub.path}: ${error}`,
            )
            return undefined
          }
        }),
    )
    res.json(entries.filter((entry) => entry !== undefined))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS children of ${folderPath}: ${error}`)
    res.json([])
  }
})

app.get('/api/synology/tracklist', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json({ error: 'path is required' })
    return
  }

  try {
    const files = await nasListFiles(folderPath)
    const tracks = files
      .filter((f) => !f.isdir && synologyAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f, index) => ({ position: index + 1, name: f.name, path: f.path }))
    res.json(tracks)
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
  '.png': 'image/png',
}

// Serves a downloaded file from disk, including HTTP Range support (seeking).
function nasServeLocalFile(req: express.Request, res: express.Response, file: string, size: number): void {
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
      return
    }
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  }

  res.setHeader('Content-Length', String(end - start + 1))
  fs.createReadStream(file, { start, end }).pipe(res)
}

app.get('/api/synology/stream', async (req, res) => {
  const filePath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!filePath) {
    res.status(400).send('path is required')
    return
  }

  // A downloaded copy always wins: no network needed, and it works offline.
  const localFile = nasLocalPath(filePath)
  if (localFile) {
    try {
      const info = await stat(localFile)
      if (info.isFile()) {
        nasServeLocalFile(req, res, localFile, info.size)
        return
      }
    } catch {
      // Not downloaded - fall through to the NAS.
    }
  }

  const session = await getActiveSynologySession()
  if (!session) {
    res.status(401).send('Not logged in to Synology, or the NAS is not reachable.')
    return
  }

  try {
    const query = new URLSearchParams({
      api: 'SYNO.FileStation.Download',
      version: '2',
      method: 'download',
      mode: 'download',
      path: filePath,
      _sid: session.sid,
    })
    const url = `${session.base}/webapi/entry.cgi?${query.toString()}`
    const headers: Record<string, string> = {}
    if (req.headers.range) {
      headers.Range = req.headers.range as string
    }

    const upstream = await ky.get(url, { headers, timeout: 15000, throwHttpErrors: false })
    const contentType = upstream.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      // Synology returned an error object (e.g. expired session) instead of file bytes.
      res.status(502).send('Failed to fetch file from NAS.')
      return
    }

    res.status(upstream.status)
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header)
      if (value) {
        res.setHeader(header, value)
      }
    }

    if (upstream.body) {
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res)
    } else {
      res.end()
    }
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to stream NAS file ${filePath}: ${error}`)
    res.status(502).send('Failed to fetch file from NAS.')
  }
})

// --- Download local ("Download selected") ---------------------------------

const nasDownloadExtensions = [...synologyAudioExtensions, '.jpg', '.jpeg', '.png']

interface NasDownloadStatus {
  running: boolean
  message: string
  filesDone: number
  filesTotal: number
  error?: string
}

const nasDownloadStatus: NasDownloadStatus = { running: false, message: 'Idle', filesDone: 0, filesTotal: 0 }

interface NasFileToDownload {
  nasPath: string
  size: number
}

async function nasCollectFiles(session: SynologySession, folderPath: string, out: NasFileToDownload[]): Promise<void> {
  const files = await synologyListFiles(session, folderPath, true)
  for (const file of files) {
    if (file.isdir) {
      await nasCollectFiles(session, file.path, out)
    } else if (nasDownloadExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      out.push({ nasPath: file.path, size: file.additional?.size ?? -1 })
    }
  }
}

async function nasDownloadFile(nasPath: string, size: number): Promise<void> {
  const target = nasLocalPath(nasPath)
  if (!target) {
    return
  }
  try {
    const existing = await stat(target)
    if (size < 0 || existing.size === size) {
      return
    }
  } catch {
    // Not downloaded yet.
  }
  await mkdir(path.dirname(target), { recursive: true })

  const done = await withSynologySession(async (session) => {
    const query = new URLSearchParams({
      api: 'SYNO.FileStation.Download',
      version: '2',
      method: 'download',
      mode: 'download',
      path: nasPath,
      _sid: session.sid,
    })
    const response = await ky.get(`${session.base}/webapi/entry.cgi?${query.toString()}`, { timeout: false })
    if ((response.headers.get('content-type') ?? '').includes('application/json') || !response.body) {
      throw new SynologySessionExpiredError()
    }
    // Write to a temp name first so a half-finished file is never mistaken for a
    // complete one (and never gets played).
    const partFile = `${target}.part`
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), fs.createWriteStream(partFile))
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
    if (!entry.isDirectory() && /\.(jpe?g|png)$/i.test(entry.name)) {
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
    return entries.some((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name))
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
    const files = await withSynologySession((session) => synologyListFiles(session, ancestor, true))
    const cover = files?.find((file) => !file.isdir && /\.(jpe?g|png)$/i.test(file.name))
    if (cover) {
      await nasDownloadFile(cover.path, cover.additional?.size ?? -1)
    }
  }
}

async function runNasSync(): Promise<void> {
  const status = nasDownloadStatus
  Object.assign(status, { running: true, message: 'Checking selection...', filesDone: 0, filesTotal: 0, error: undefined })

  try {
    const config = await getMupiboxConfig()
    if (!config) {
      // Without the selection we cannot tell what to keep - never delete blindly.
      throw new Error('Could not read the MuPiBox configuration.')
    }
    const desired = Array.from(new Set((config.synology?.downloadFolders ?? []).map(normalizeNasPath))).filter(
      (folder) => folder !== '/',
    )
    await mkdir(nasLocalRoot, { recursive: true })

    status.message = 'Removing local copies that are no longer selected...'
    await nasPruneExcept('/', desired)

    if (desired.length > 0 && (await getActiveSynologySession())) {
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

    const pending = desired.filter((folder) => !nasIsDownloaded(folder))
    if (pending.length === 0) {
      status.message = 'Everything selected is already downloaded.'
      return
    }

    if (!(await getActiveSynologySession())) {
      throw new Error('The NAS is not reachable - nothing was downloaded.')
    }

    status.message = 'Reading folders on the NAS...'
    const plan: { folder: string; files: NasFileToDownload[] }[] = []
    for (const folder of pending) {
      const files: NasFileToDownload[] = []
      await withSynologySession(async (session) => {
        files.length = 0
        await nasCollectFiles(session, folder, files)
      })
      plan.push({ folder, files })
      status.filesTotal += files.length
    }

    let failed = 0
    for (const { folder, files } of plan) {
      let folderFailed = 0
      for (const file of files) {
        status.message = `Downloading ${file.nasPath}`
        try {
          await nasDownloadFile(file.nasPath, file.size)
        } catch (error) {
          folderFailed++
          failed++
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS download failed for ${file.nasPath}: ${error}`)
        }
        status.filesDone++
      }

      // The marker is only written once the whole folder is complete, which is
      // how later runs know to skip it.
      const localDir = nasLocalPath(folder)
      if (folderFailed === 0 && localDir) {
        await mkdir(localDir, { recursive: true })
        await writeFile(
          path.join(localDir, nasDownloadMarker),
          JSON.stringify({ nasPath: folder, completedAt: new Date().toISOString() }),
        )
      }
    }

    status.message =
      failed === 0
        ? `Done - ${status.filesDone} files downloaded.`
        : `Finished with ${failed} failed files - run "Download selected" again to retry.`
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error)
    status.message = `Failed: ${status.error}`
  } finally {
    status.running = false
  }
}

app.post('/api/synology/download/sync', (_req, res) => {
  if (nasDownloadStatus.running) {
    res.status(409).json({ success: false, error: 'A download is already running.' })
    return
  }
  runNasSync().catch((error) => {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS sync crashed: ${error}`)
  })
  res.json({ success: true })
})

app.get('/api/synology/download/status', (_req, res) => {
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

async function libraryListFiles(relPath: string): Promise<SynologyFileEntry[]> {
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

// Prefers a file called "cover.*", otherwise the first image in the folder.
function libraryFindCover(files: SynologyFileEntry[]): string | undefined {
  const images = files.filter((f) => !f.isdir && /\.(jpe?g|png)$/i.test(f.name))
  return (images.find((f) => /^cover\./i.test(f.name)) ?? images[0])?.path
}

// An artist folder without a picture of its own gets the cover of the first album
// below it (as the old media database did) - looked up a couple of levels deep.
async function libraryFindCoverBelow(files: SynologyFileEntry[], depth: number): Promise<string | undefined> {
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

function libraryFileUrl(relPath: string): string {
  return `/api/library/file?path=${encodeURIComponent(relPath)}`
}

async function libraryBuildEntry(
  relPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
): Promise<Record<string, unknown>> {
  const files = await libraryListFiles(relPath)
  const isContainer = synologyIsContainer(files)
  const coverPath =
    libraryFindCover(files) ?? (isContainer ? await libraryFindCoverBelow(files, 2) : undefined) ?? fallbackCoverPath
  return {
    type: 'library',
    category: relPath.split('/')[0],
    artist: artistName,
    title,
    libraryPath: relPath,
    // A folder with only subfolders (no audio files) opens the next level instead of playing.
    libraryIsContainer: isContainer,
    cover: coverPath ? libraryFileUrl(coverPath) : undefined,
    artistcover: coverPath ? libraryFileUrl(coverPath) : undefined,
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
            return await libraryBuildEntry(sub.path, parentName, sub.name, parentCoverPath)
          } catch (error) {
            console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable folder ${sub.path}: ${error}`)
            return undefined
          }
        }),
    )
    res.json(entries.filter((entry) => entry !== undefined))
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

      const message = req.body?.message || ''
      const args = message
        ? message
            .split('\n')
            .map((line: string) => `"${line.replace(/"/g, '\\"')}"`)
            .join(' ')
        : ''

      exec(`/usr/bin/python3 /usr/local/bin/mupibox/telegram_notify_screen.py ${args}`, (error, _stdout, stderr) => {
        if (error) {
          console.error(
            `${new Date().toLocaleString()}: [MuPiBox-Server] Error sending telegram notification: ${error.message}`,
          )
          res.status(500).send('error')
          return
        }
        if (stderr) {
          console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Stderr telegram notification: ${stderr}`)
          res.status(500).send('error')
          return
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

// Catch-all handler: send back Angular's index.html file for any non-API routes
// This must be placed after all API routes but before starting the server
if (productionServe) {
  app.get(/.*/, (_req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, 'www') })
  })
}

if (!testServe) {
  app.listen(8200)
  console.log(`${new Date().toLocaleString()}: [mupibox-backend-api] Server started at http://localhost:8200`)
}
