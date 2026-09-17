import { exec, execFile } from 'node:child_process'
import crypto from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
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
// In development the box config lives next to the other config files so the
// backend can run on a normal dev machine without /etc/mupibox.
const mupiboxConfigPath = productionServe ? '/etc/mupibox/mupiboxconfig.json' : `${configBasePath}/mupiboxconfig.json`
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
// The production bundle is CommonJS (__dirname available), the dev server runs as an
// ES module via tsx where __dirname does not exist. In dev the package dir is the cwd.
const serverDir = productionServe ? __dirname : process.cwd()
const rssCoverDir = path.join(serverDir, 'www', 'rss-covers')
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
  app.use(express.static(path.join(serverDir, 'www')))
} else {
  // Only the cached podcast covers are served by the backend in development.
  app.use(rssCoverPublicBase, express.static(rssCoverDir))
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
    res.sendFile('index.html', { root: path.join(serverDir, 'www') })
  })
}

if (!testServe) {
  app.listen(8200)
  console.log(`${new Date().toLocaleString()}: [mupibox-backend-api] Server started at http://localhost:8200`)
}
