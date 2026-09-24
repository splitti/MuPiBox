import { exec, execFile } from 'node:child_process'
import crypto from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import cors from 'cors'
import express from 'express'
import jsonfile from 'jsonfile'
import ky from 'ky'
import xmlparser from 'xml-js'
import { LogRequest, LogResponse } from './models/log.model'
import type { MupiboxConfig, NasConfig, NasProfile } from './models/mupibox-config.model'
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

  const xml = await ky.get(rssUrl, { timeout: rssFetchTimeoutMs }).text()
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
setTimeout(() => void warmConfiguredPodcasts(), 60 * 1000)

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
    const extension = path.extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg'
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
          const buffer = Buffer.from(await ky.get(imageUrl, { timeout: rssImageTimeoutMs }).arrayBuffer())
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

app.get('/api/wifi/configured', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'list_networks'])
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
        bands: found?.bands,
        connectedBand: configured.current ? connectedBand : undefined,
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
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'remove_network', String(id)])
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'save_config'])
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
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'set_network', String(id), 'psk', `"${password}"`])
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'enable_network', String(id)])
    await execFileAsync('sudo', ['wpa_cli', '-i', await wifiInterface(), 'save_config'])
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
): Promise<{ success: boolean; session?: NasSession; error?: string }> {
  const session: NasSession = { base, auth: nasBasicAuth(account, password) }
  try {
    const response = await fetch(nasUrl(session, '/'), {
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
    const cause = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : ''
    if (/certificate|SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/i.test(cause)) {
      return { success: false, error: 'Certificate not trusted - use HTTP, or install a valid certificate on the NAS.' }
    }
    return { success: false, error: 'Could not reach the NAS. Check the address (with WebDAV port) and network connection.' }
  }
}

let nasSessionPromise: Promise<NasSession | undefined> | undefined
let nasOfflineUntil = 0

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
  // Short timeout: an unreachable NAS must not hold up the kids' UI.
  const result = await nasLogin(base, syn.account, password, 4000)
  if (!result.success || !result.session) {
    if (/reach/i.test(result.error ?? '')) {
      nasMarkOffline()
    }
    return undefined
  }
  nasSessionCache = result.session
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
    const isdir = /<(?:\w+:)?collection\s*\/?>/i.test(block)
    const sizeMatch = block.match(/<(?:\w+:)?getcontentlength[^>]*>(\d+)</i)
    entries.push({
      name: hrefPath.split('/').pop() ?? hrefPath,
      path: hrefPath,
      isdir,
      additional: sizeMatch ? { size: Number(sizeMatch[1]) } : undefined,
    })
  }
  return entries
}

async function nasListFilesLive(session: NasSession, folderPath: string, _withSize = false): Promise<NasFileEntry[]> {
  const response = await fetch(`${nasUrl(session, folderPath)}/`, {
    method: 'PROPFIND',
    headers: { Authorization: session.auth, Depth: '1', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/></prop></propfind>',
    signal: AbortSignal.timeout(8000),
  })
  const text = await response.text()
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

// Lists a NAS folder: from the local copy if it was downloaded, otherwise live
// from the NAS, and from whatever is stored locally if the NAS is unreachable.
async function nasListFiles(folderPath: string): Promise<NasFileEntry[]> {
  if (nasIsDownloaded(folderPath)) {
    const local = await nasLocalListFiles(folderPath)
    if (local) {
      return local
    }
  }
  try {
    const live = await withNasSession((session) => nasListFilesLive(session, folderPath))
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

function nasFindCoverImage(files: NasFileEntry[]): string | undefined {
  const image = files.find((f) => !f.isdir && /\.(jpe?g|png)$/i.test(f.name))
  return image?.path
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

// Only used for covers, which are asked for as small thumbnails.
function nasStreamUrl(filePath: string): string {
  return `/api/nas/stream?path=${encodeURIComponent(filePath)}&w=400`
}

// A folder that holds no audio files but only subfolders is a "container": the
// kids' UI drills into it like an artist level instead of trying to play it.
// This allows any number of nesting levels.
function nasIsContainer(files: NasFileEntry[]): boolean {
  const hasAudio = files.some((f) => !f.isdir && nasAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
  const hasSubfolders = files.some((f) => f.isdir)
  return !hasAudio && hasSubfolders
}

// Builds the ready-to-use Media entry for one NAS folder (live listing).
async function nasBuildMediaEntry(
  folderPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
): Promise<Record<string, unknown>> {
  const files = await nasListFiles(folderPath)
  const ownCoverPath = nasFindCoverImage(files) ?? (await nasFindCoverBelow(files))
  const coverPath = ownCoverPath ?? fallbackCoverPath
  return {
    type: 'nas',
    category: 'nas',
    artist: artistName,
    title,
    nasPath: folderPath,
    nasIsContainer: nasIsContainer(files),
    cover: coverPath ? nasStreamUrl(coverPath) : undefined,
    artistcover: coverPath ? nasStreamUrl(coverPath) : undefined,
  }
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

let nasConfigWriteChain: Promise<void> = Promise.resolve()

// Changes are applied one after another: several requests at once (e.g. one per folder when "Save
// selection" is pressed) must not overwrite each other's read-modify-write. `change` is either the
// values to set or a function that computes them from the current settings (returning undefined = no write).
function updateNasConfig(
  change: Record<string, unknown> | ((settings: NasConfig | undefined) => Record<string, unknown> | undefined),
): Promise<void> {
  const run = nasConfigWriteChain.then(async () => {
    const current = await getMupiboxConfig()
    if (!current) {
      throw new Error('Cannot update config: current mupibox config could not be read.')
    }
    const partial = typeof change === 'function' ? change(nasSettings(current)) : change
    if (!partial) {
      return
    }
    // Old config files call this section "synology": carry its values over to "nas" and drop the old key.
    const { synology: _oldSection, ...rest } = current
    const updated = { ...rest, nas: { ...(nasSettings(current) ?? {}), ...partial } }
    const tmpPath = '/tmp/.mupiboxconfig-nas.json'
    await writeFile(tmpPath, JSON.stringify(updated))
    await execFileAsync('sudo', ['mv', tmpPath, mupiboxConfigPath])
    mupiboxConfigCache = updated as MupiboxConfig
  })
  nasConfigWriteChain = run.catch(() => undefined)
  return run
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
      },
    },
    activeProfile: active,
  }
}

async function nasFolderExists(session: NasSession, folderPath: string): Promise<boolean> {
  const response = await fetch(`${nasUrl(session, folderPath)}/`, {
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

app.get('/api/nas/profiles', async (_req, res) => {
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
app.post('/api/nas/profiles/create', async (req, res) => {
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
app.post('/api/nas/profiles/load', async (req, res) => {
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
        profiles: { ...profiles, [name]: bound },
        activeProfile: name,
      }
    })
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
app.post('/api/nas/profiles/remove-missing', async (req, res) => {
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
          },
        },
      }
      if (name === active) {
        change.artistFolders = strip(settings?.artistFolders)
        change.hiddenFolders = strip(settings?.hiddenFolders)
        change.downloadFolders = strip(settings?.downloadFolders)
      }
      return change
    })
    res.json({ success: found })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to clean NAS profile: ${error}`)
    res.status(500).json({ success: false })
  }
})

app.post('/api/nas/profiles/delete', async (req, res) => {
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

app.post('/api/nas/login', async (req, res) => {
  const { address, https: useHttps, account, password, rememberMe } = req.body ?? {}
  if (typeof address !== 'string' || !address || typeof account !== 'string' || !account || typeof password !== 'string' || !password) {
    res.status(400).json({ success: false, error: 'address, account and password are required.' })
    return
  }

  const base = nasResolveBase(address, Boolean(useHttps))
  // A wrong password may be answered slowly by some NAS models: be generous here.
  const result = await nasLogin(base, account, password, 25000)
  if (!result.success || !result.session) {
    res.json({ success: false, error: result.error })
    return
  }

  nasSessionCache = result.session
  nasOfflineUntil = 0

  if (rememberMe === true) {
    try {
      await updateNasConfig({ address, https: Boolean(useHttps), account, password: nasEncrypt(password), rememberMe: true })
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

app.get('/api/nas/index/status', async (_req, res) => {
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

app.post('/api/nas/index/refresh', async (_req, res) => {
  if (!(await getActiveNasSession())) {
    res.status(401).json({ success: false, error: 'not_logged_in' })
    return
  }
  void buildNasIndex()
  res.json({ success: true, running: true })
})

// Folders whose own name contains q (case-insensitive), as full paths.
app.get('/api/nas/index/search', async (req, res) => {
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

app.get('/api/nas/browse', async (req, res) => {
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
app.post('/api/nas/mark', async (req, res) => {
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
      return { ...update, ...nasTrackActiveProfile(settings, update) }
    })
    res.json({ success: true, [key]: next })
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to save NAS selection: ${error}`)
    res.status(500).json({ success: false })
  }
})

app.get('/api/nas/artists', async (_req, res) => {
  try {
    const config = await getMupiboxConfig()
    const hiddenFolders = nasSettings(config)?.hiddenFolders ?? []
    const artistFolders = (nasSettings(config)?.artistFolders ?? []).filter((p) => !nasIsHidden(p, hiddenFolders))

    // One entry per marked folder. Deeper levels are loaded on demand via
    // /api/nas/children as the user navigates, so this stays cheap.
    const entries = await mapWithConcurrency(artistFolders, 4, async (artistPath) => {
      try {
        const artistName = artistPath.split('/').filter(Boolean).pop() ?? artistPath
        return await nasBuildMediaEntry(artistPath, artistName, artistName)
      } catch (error) {
        // Skip just this one folder (deleted on the NAS since it was marked, or
        // NAS offline and never downloaded) instead of failing the whole category.
        console.error(
          `${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unavailable NAS folder ${artistPath}: ${error}`,
        )
        return undefined
      }
    })
    res.json(entries.filter((entry) => entry !== undefined))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS artists: ${error}`)
    res.json([])
  }
})

// Lists the subfolders of one NAS folder as ready-to-use Media entries (one
// level deeper). Live from the NAS, or from the local copy when downloaded /
// when the NAS is not reachable. Used by the kids' UI to drill down.
app.get('/api/nas/children', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json([])
    return
  }

  try {
    const files = await nasListFiles(folderPath)
    const hiddenFolders = nasSettings(await getMupiboxConfig())?.hiddenFolders ?? []
    const parentName = folderPath.split('/').filter(Boolean).pop() ?? folderPath
    const parentCoverPath = nasFindCoverImage(files)

    const entries = await mapWithConcurrency(
      files.filter((f) => f.isdir && !nasIsHidden(f.path, hiddenFolders)),
      4,
      async (sub) => {
        try {
          return await nasBuildMediaEntry(sub.path, parentName, sub.name, parentCoverPath)
        } catch (error) {
          console.error(
            `${new Date().toLocaleString()}: [MuPiBox-Server] Skipping unreadable NAS folder ${sub.path}: ${error}`,
          )
          return undefined
        }
      },
    )
    res.json(entries.filter((entry) => entry !== undefined))
  } catch (error) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] Failed to list NAS children of ${folderPath}: ${error}`)
    res.json([])
  }
})

app.get('/api/nas/tracklist', async (req, res) => {
  const folderPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!folderPath) {
    res.status(400).json({ error: 'path is required' })
    return
  }

  try {
    const files = await nasListFiles(folderPath)
    const tracks = files
      .filter((f) => !f.isdir && nasAudioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
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

app.get('/api/nas/stream', async (req, res) => {
  const filePath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!filePath) {
    res.status(400).send('path is required')
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

  const session = await getActiveNasSession()
  if (!session) {
    res.status(401).send('Not logged in to the NAS, or the NAS is not reachable.')
    return
  }

  try {
    const headers: Record<string, string> = { Authorization: session.auth }
    if (req.headers.range) {
      headers.Range = req.headers.range as string
    }

    if (thumbSize && isThumbnailable(filePath) && !req.headers.range) {
      const day = Math.floor(Date.now() / 86400000)
      const thumb = await getThumbnail(`nas:${filePath}`, thumbSize, `nas|${filePath}|${day}`, async () => {
        const full = await fetch(nasUrl(session, filePath), { headers, signal: AbortSignal.timeout(20000) })
        if (!full.ok) {
          return undefined
        }
        const tmp = path.join('/tmp', `.nasthumb-${crypto.randomBytes(6).toString('hex')}${path.extname(filePath)}`)
        await writeFile(tmp, Buffer.from(await full.arrayBuffer()))
        return tmp
      })
      if (thumb) {
        await sendThumbnail(res, thumb)
        return
      }
    }

    const upstream = await fetch(nasUrl(session, filePath), { headers, signal: AbortSignal.timeout(15000) })
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

const nasDownloadExtensions = [...nasAudioExtensions, '.jpg', '.jpeg', '.png']

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

async function nasCollectFiles(session: NasSession, folderPath: string, out: NasFileToDownload[]): Promise<void> {
  const files = await nasListFilesLive(session, folderPath, true)
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

  const done = await withNasSession(async (session) => {
    const response = await fetch(nasUrl(session, nasPath), { headers: { Authorization: session.auth }, signal: nasDownloadAbort?.signal })
    if (!response.ok || !response.body) {
      throw new NasApiError(`WebDAV download error ${response.status}`)
    }
    // Write to a temp name first so a half-finished file is never mistaken for a
    // complete one (and never gets played).
    const partFile = `${target}.part`
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        nasDownloadStatus.bytesDone += chunk.length
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
    const files = await withNasSession((session) => nasListFilesLive(session, ancestor, true))
    const cover = files?.find((file) => !file.isdir && /\.(jpe?g|png)$/i.test(file.name))
    if (cover) {
      await nasDownloadFile(cover.path, cover.additional?.size ?? -1)
    }
  }
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

    const pending = desired.filter((folder) => !nasIsDownloaded(folder))
    if (pending.length === 0) {
      await downloadParentCovers()
      status.message = 'Everything selected is already downloaded.'
      return
    }

    if (!(await getActiveNasSession())) {
      throw new Error('The NAS is not reachable - nothing was downloaded.')
    }

    status.message = 'Reading folders on the NAS...'
    const plan: { folder: string; files: NasFileToDownload[] }[] = []
    for (const folder of pending) {
      if (status.cancelRequested) {
        break
      }
      const files: NasFileToDownload[] = []
      await withNasSession(async (session) => {
        files.length = 0
        await nasCollectFiles(session, folder, files)
      })
      plan.push({ folder, files })
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

    let failed = 0
    for (const { folder, files } of plan) {
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

    if (status.cancelRequested) {
      status.cancelled = true
      status.message = `Cancelled - ${status.filesDone} of ${status.filesTotal} files were downloaded (${nasFormatBytes(status.bytesDone)}). Run "Download selected" again to continue.`
      return
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
    nasDownloadAbort = undefined
  }
}

app.post('/api/nas/download/cancel', (_req, res) => {
  if (!nasDownloadStatus.running) {
    res.json({ success: false, error: 'No download is running.' })
    return
  }
  nasDownloadStatus.cancelRequested = true
  nasDownloadStatus.message = 'Cancelling...'
  nasDownloadAbort?.abort()
  res.json({ success: true })
})

app.post('/api/nas/download/sync', (_req, res) => {
  if (nasDownloadStatus.running) {
    res.status(409).json({ success: false, error: 'A download is already running.' })
    return
  }
  runNasSync().catch((error) => {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS sync crashed: ${error}`)
  })
  res.json({ success: true })
})

app.get('/api/nas/download/status', (_req, res) => {
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

// Prefers a file called "cover.*", otherwise the first image in the folder.
function libraryFindCover(files: NasFileEntry[]): string | undefined {
  const images = files.filter((f) => !f.isdir && /\.(jpe?g|png)$/i.test(f.name))
  return (images.find((f) => /^cover\./i.test(f.name)) ?? images[0])?.path
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
    if (fs.existsSync(target)) {
      return target
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

// Thumbnails of covers that were changed or removed stay in the cache folder; drop old ones.
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
setTimeout(() => void warmLibraryThumbnails(libraryRoot, 0), 90 * 1000)

function parseThumbSize(value: unknown): number | undefined {
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? Math.min(Math.max(Math.round(size), 64), 800) : undefined
}

function isThumbnailable(file: string): boolean {
  return /\.(jpe?g|png)$/i.test(file)
}

function sendThumbnail(res: express.Response, thumb: string): Promise<void> {
  return stat(thumb).then((info) => {
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Content-Length', String(info.size))
    res.setHeader('Cache-Control', 'public, max-age=86400')
    fs.createReadStream(thumb).pipe(res)
  })
}

// Covers are asked for as small thumbnails (see above).
function libraryFileUrl(relPath: string): string {
  return `/api/library/file?path=${encodeURIComponent(relPath)}&w=400`
}

async function libraryBuildEntry(
  relPath: string,
  artistName: string,
  title: string,
  fallbackCoverPath?: string,
): Promise<Record<string, unknown>> {
  const files = await libraryListFiles(relPath)
  const isContainer = nasIsContainer(files)
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
