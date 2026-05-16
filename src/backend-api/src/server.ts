import { exec } from 'node:child_process'
import dns from 'node:dns'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import jsonfile from 'jsonfile'
import ky from 'ky'
import xmlparser from 'xml-js'
import { LogRequest, LogResponse } from './models/log.model'
import type { MupiboxConfig } from './models/mupibox-config.model'
import type { PlaytimeStatus } from './models/playtime.model'
import { ServerConfig } from './models/server.model'
import type { SpotifyValidationRequest, SpotifyValidationResponse } from './models/spotify-api.model'
import { SpotifyApiService } from './services/spotify-api.service'
import { SpotifyMediaInfo } from './services/spotify-media-info.service'

// Force IPv4 for DNS lookups to avoid EAI_AGAIN errors on Raspberry Pi
// This fixes issues where IPv6 is misconfigured or not supported
dns.setDefaultResultOrder('ipv4first')

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
const playtimeFile = '/tmp/playtime.json'
const dataLock = '/tmp/.data.lock'
const resumeLock = '/tmp/.resume.lock'

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
  /^fe80:/i, // IPv6 link-local
  /^fc00:/i, // IPv6 unique local
  /^fd00:/i,
]
const isPrivateHost = (host: string): boolean => {
  // Strip brackets from IPv6 literals
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h === '::') return true
  return PRIVATE_IP_REGEXES.some((r) => r.test(h))
}

// Routes
app.get('/api/rssfeed', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl !== 'string') {
    res.status(500).send('Given url is not a string.')
    return
  }
  let parsed: URL
  try {
    parsed = new URL(rssUrl)
  } catch {
    res.status(400).send('Invalid URL')
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).send('Only http(s) URLs are allowed')
    return
  }
  if (isPrivateHost(parsed.hostname)) {
    res.status(403).send('Private / loopback hosts are not allowed')
    return
  }
  // Defence-in-depth: probe with HEAD before the full GET.
  // Without this, calling /api/rssfeed with a non-RSS URL (e.g. a multi-MB
  // MP3 episode link as the frontend's RSS-resume code briefly did) streamed
  // the entire binary body into memory before the 5MB body-cap aborted with
  // 413 — ~4s wasted per request. HEAD lets us reject by content-type or
  // advertised content-length in <500ms.
  // Native fetch (not ky) — ky was silently failing on the 301-redirect
  // chain in this codepath. HEAD is best-effort: some origin servers
  // reject HEAD with 405/501. On non-2xx or network error during HEAD we
  // fall through to the existing GET path; the 10s timeout + 5MB body
  // cap still bound the worst case.
  try {
    const head = await fetch(rssUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    })
    const ct = head.headers.get('content-type') || ''
    if (ct && !/xml|rss/i.test(ct)) {
      res.status(415).send(`Unsupported content-type: ${ct}`)
      return
    }
    const cl = Number.parseInt(head.headers.get('content-length') || '0', 10)
    if (cl > 5_000_000) {
      res.status(413).send('Response too large (per content-length)')
      return
    }
  } catch {
    // HEAD failed — fall through to GET.
  }
  ky.get(rssUrl, { timeout: 10000 })
    .text()
    .then((response) => {
      // Bound the parsed payload size — RSS feeds shouldn't be megabytes.
      if (response.length > 5_000_000) {
        res.status(413).send('Response too large')
        return
      }
      res.send(xmlparser.xml2json(response, { compact: true, nativeType: true }))
    })
    .catch(() => {
      res.status(500).send('External url responded with error code.')
    })
})

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
      res.json(data)
    }
  })
})

// Playback time tracking written by backend-player to /tmp/playtime.json (tmpfs).
// Missing/unreadable file means the player hasn't ticked yet or the feature is off —
// either way, surfaces as "disabled" so the frontend can hide the UI safely.
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
      res.json(data)
    }
  })
})

// Atomically apply a mutation to /etc/mupibox/mupiboxconfig.json.
// Used by the parent-control endpoints below (extend / release / quietnow).
// The player picks up the change ~50 ms later via fs.watch (see spotify-control.js).
async function updateMupiboxConfig(mutate: (cfg: Record<string, unknown>) => void): Promise<void> {
  const current = (await readJsonFile(mupiboxConfigPath)) as Record<string, unknown>
  mutate(current)
  const tmpPath = '/tmp/.mupiboxconfig.update.json'
  await new Promise<void>((resolve, reject) => {
    jsonfile.writeFile(tmpPath, current, { spaces: 2 }, (err) => (err ? reject(err) : resolve()))
  })
  await new Promise<void>((resolve, reject) => {
    // sudo cp is allowed for the dietpi user on the box (same pattern as
    // /api/shutdown / /api/reboot below). Atomic: write to a tmp on the same
    // filesystem region, then cp into place; player's fs.watch fires once.
    exec(`sudo cp ${tmpPath} ${mupiboxConfigPath} && sudo rm -f ${tmpPath}`, (err) => (err ? reject(err) : resolve()))
  })
  // Local cache invalidation (server's own mupiboxConfigCache) — fs.watch on the
  // dir already does this, but be explicit so /api/config returns the new value
  // immediately on the next call.
  mupiboxConfigCache = undefined
}

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
app.post('/api/playtime/extend', async (req, res) => {
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
app.post('/api/playtime/release', async (req, res) => {
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
app.post('/api/playtime/limit', async (req, res) => {
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
app.post('/api/quiethours/now', async (req, res) => {
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
      res.json(data)
    }
  })
})

app.post('/api/addwlan', (req, res) => {
  jsonfile.readFile(wlanFile, (error, data) => {
    let out = data

    if (error) out = []
    out.push(req.body)

    jsonfile.writeFile(wlanFile, out, { spaces: 4 }, (writeError) => {
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

app.post('/api/add', (req, res) => {
  if (fs.existsSync(dataLock)) {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/add data.json is locked`)
    res.status(200).send('locked')
    return
  }
  try {
    fs.openSync(dataLock, 'w')
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/add failed to acquire lock:`, err)
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
    data.push(req.body)
    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (writeError) => {
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

// Lock cleanup — used by every read-modify-write endpoint (data.json + resume.json)
// to ensure the lock is always removed once the read+write cycle has finished
// (success OR error). The historical pattern called fs.unlink outside the async
// readFile callback, so the lock was gone before the write started — two
// concurrent calls could clobber each other.
const releaseLock = (lockPath: string, context: string) => {
  fs.unlink(lockPath, (err) => {
    if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ${context} - failed to unlink lock:`, err)
    }
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
  if (fs.existsSync(resumeLock)) {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume resume.json is locked`)
    res.status(200).send('locked')
    return
  }
  try {
    fs.openSync(resumeLock, 'w')
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/addresume failed to acquire lock:`, err)
    res.status(200).send('error')
    return
  }
  readResumeOrRecover('/api/addresume', (data) => {
    const now = Date.now()
    const incomingKey = resumeKeyOf(req.body)
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
    jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (writeError) => {
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
  if (fs.existsSync(resumeLock)) {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume resume.json is locked`)
    res.status(200).send('locked')
    return
  }
  try {
    fs.openSync(resumeLock, 'w')
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume failed to acquire lock:`, err)
    res.status(200).send('error')
    return
  }
  readResumeOrRecover('/api/deleteresume', (data) => {
    const targetKey = resumeKeyOf(req.body)
    const remaining = data.filter((item: any) => resumeKeyOf(item) !== targetKey)
    if (remaining.length === data.length) {
      releaseLock(resumeLock, '/api/deleteresume')
      console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/deleteresume no entry matched (key=${targetKey}).`)
      res.status(200).send('ok')
      return
    }
    jsonfile.writeFile(resumeFile, remaining, { spaces: 4 }, (writeError) => {
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

app.post('/api/delete', (req, res) => {
  if (fs.existsSync(dataLock)) {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete data.json is locked`)
    res.status(200).send('locked')
    return
  }
  try {
    fs.openSync(dataLock, 'w')
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/delete failed to acquire lock:`, err)
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
    data.splice(req.body.index, 1)
    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (writeError) => {
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
  if (fs.existsSync(dataLock)) {
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit data.json is locked`)
    res.status(200).send('locked')
    return
  }
  try {
    fs.openSync(dataLock, 'w')
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] /api/edit failed to acquire lock:`, err)
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
    data.splice(req.body.index, 1, req.body.data)
    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (writeError) => {
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
