// Phase 14c — Eltern-WebApp REST routes.
//
// Mounted at /api/app/* and /eltern (Magic-Link landing + WebApp
// static assets) by server.ts. Three logical groups:
//   - auth (magic-link redeem, session info, logout)
//   - oauth (Spotify connect/callback/disconnect)
//   - generation helpers (magic-link issuance for Telegram/Box-Tap)
//
// All handlers below the localNetworkOnly + requireSession layer can
// trust the session; the magic-link endpoints are exposed without
// session (that's how you get one in the first place) but rate-limited
// per-IP.

import { execFile, execFileSync, spawn } from 'node:child_process'
import { promises as fsp, readdirSync, readFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { type Request, Router } from 'express'
import QRCode from 'qrcode'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  destroySession,
  generateMagicLink,
  issueSession,
  redeemMagicLink,
  validateSession,
  verifyElternPassword,
  APP_PASSWORD_MIN_LENGTH,
  appLoginRequired,
  hasAppPassword,
  setAppPassword,
  verifyAppPassword,
  PERSISTENT_TTL_MS,
  destroyOtherSessions,
  keptSessionCount,
  restampSession,
  usePasswordStamp,
  newSignOutEpoch,
  describeDevice,
  listSessions,
  destroySessionByRef,
  mayResetPassword,
} from './auth'
import { ipRateLimit, localNetworkOnly, parseCookie, requireCsrf, requireSession } from './middleware'
import { registerCustomCoverRoutes } from './covers'
import { registerDisplayRoutes } from './display'
import { registerHardwareRoutes } from './hardware'
import { registerServicesRoutes } from './services'
import { registerSystemRoutes } from './system'
import { registerAdminRoutes } from './admin'
import { registerNetworkRoutes } from './network'
import { registerUpdateRoutes } from './updates'
import { registerTlsRoutes, tlsOf } from './tls'
import { type LocalLibraryDeps, registerLocalUploadRoutes } from './upload'
import { registerPodcastRoutes } from './podcasts'
import { registerHealthRoutes } from './health'
import { playlogSummary } from './playlog'
import { weeklySummaryOn } from './weekly-summary'
import { isArdFeed } from '../ard-sounds'
import { episodeKey, mayKeep, type PodcastOffline } from '../podcast-offline'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { localOnly } from '../request-guard'
import { spotifyLoginAge } from './spotify-auth-age'
import {
  REQUESTED_SCOPES,
  buildAuthorizeUrl,
  buildRedirectUri,
  redirectModeOf,
  SPOTIFY_CALLBACK_PATHS,
  clearSpotifyTokens,
  consumeOauthState,
  exchangeCodeForTokens,
} from './oauth'

export interface ElternRouterDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  activeDataPath: string
  /** Start (ms) of the track the play-log poller is timing right now, null when nothing plays. */
  currentPlayLogStart?: () => number | null
  /** True when a NAS path lies in the folders the admin selected ("Show" / "Download") and is not hidden. */
  nasPathSelected?: (path: string) => Promise<boolean>
  /** Cover URL of the NAS ('nas') or local ('local') album folder mplayer plays, null if there is none. */
  playingAlbumCover?: (type: string, folder: string) => Promise<string | null>
  // The picture embedded in the file that plays (nas:<path> / local:<path>), if it has one
  playingTrackCover?: (file: string) => Promise<string | null>
  /** The local media folders, for the upload of tracks and folders (see upload.ts). */
  localLibrary?: LocalLibraryDeps
  /** Writes a chosen cover into a selected NAS folder (server.ts writeNasCover). */
  nasCover?: (folder: string, bytes: Buffer, ext: '.jpg' | '.png') => Promise<'ok' | 'not_selected' | 'offline' | 'denied' | 'failed'>
  /** Whether a NAS folder is one the parents selected (server.ts nasPathSelected). */
  nasSelected?: (folder: string) => Promise<boolean>
  /** The podcast episodes kept on the SD card (see ../podcast-offline.ts). */
  podcastOffline?: PodcastOffline
}

/** Build a Set-Cookie header value. HttpOnly + SameSite=Strict; no Secure
 *  flag because the box serves over plain HTTP on LAN. */
// Keys of the texts shown on the box display (see /display-texts and the box frontend's display-texts.service).
const DISPLAY_TEXT_KEYS = [
  'blockedHeading',
  'blockedSubheading',
  'quietHeading',
  'quietSubheading',
  'parentsTitle',
  'parentsHint',
  'parentsCountdown',
  'parentsClose',
] as const

function buildSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`
}
// (a session kept with "Angemeldet bleiben": its cookie as long as the session, renewed when the app is opened)
const PERSISTENT_COOKIE_SECONDS = Math.floor(PERSISTENT_TTL_MS / 1000)

/** Clear-cookie helper for logout. */
function buildClearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
}

/** Canonical BT MAC (AA:BB:CC:DD:EE:FF). */
const BT_MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

// Boot and maintenance screens (see media/bootscreens and MuPi-Conf): the installed scenes and their settings file.
const BOOTSCREENS_DIR = '/home/dietpi/MuPiBox/sysmedia/bootscreens'
type BootscreensFile = { bootscreens: Record<string, unknown>[]; defaultBootscreen?: string; nameMaxLength?: number }

function readBootscreens(): BootscreensFile | undefined {
  try {
    const json = JSON.parse(readFileSync(`${BOOTSCREENS_DIR}/bootscreens.json`, 'utf8')) as BootscreensFile
    return Array.isArray(json.bootscreens) ? json : undefined
  } catch {
    return undefined
  }
}

function bootscreenIds(screens: BootscreensFile): string[] {
  return screens.bootscreens.map((b) => b.id).filter((id): id is string => typeof id === 'string')
}

// The languages of the display texts ({code: {name, ...}}), the same list MuPi-Conf offers for the boot screens.
function readDisplayLanguages(): Record<string, { name?: string }> {
  try {
    const json = JSON.parse(readFileSync('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/assets/i18n/display-texts.json', 'utf8')) as {
      languages?: Record<string, { name?: string }>
    }
    const languages: Record<string, { name?: string }> = {}
    for (const [code, language] of Object.entries(json.languages ?? {})) languages[code] = { name: language?.name ?? code }
    return languages
  } catch {
    return { en: { name: 'English' } }
  }
}

/**
 * A volume in percent from the config, whether stored as a number (web app) or as text (MuPi-Conf saves "75"):
 * only the number was taken, so after a save in MuPi-Conf the hearing protection (maxVolume) was ignored here.
 * undefined when missing or not 0..100.
 */
function volumePercent(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.floor(n) : undefined
}

/** Run a command (no shell — execFile is injection-safe) and capture stdout.
 *  Never rejects: failures resolve with ok:false so handlers stay simple. */
/** The system has a Bluetooth controller now (no: the chip is switched off, or there is none) */
function btControllerPresent(): boolean {
  try {
    return readdirSync('/sys/class/bluetooth').some((n) => n.startsWith('hci'))
  } catch {
    return false
  }
}

function execCapture(cmd: string, args: string[], timeoutMs = 8000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, stdout: stdout ?? '' })
    })
  })
}

// An address of the app with one more query part (it may carry one already: /app?from=wizard)
const withQuery = (url: string, part: string): string => `${url}${url.includes('?') ? '&' : '?'}${part}`

// setting_update.sh in the background: it carries the config into the files of the system and the player
function runSettingUpdate(restartPlayer = false): void {
  const restart = restartPlayer ? '; PM2=$(command -v pm2 || echo /usr/local/bin/pm2); "$PM2" restart spotify-control >/dev/null 2>&1' : ''
  const child = spawn('sh', ['-c', `sudo /usr/local/bin/mupibox/setting_update.sh >/dev/null 2>&1${restart}`], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

// The player reads its Spotify access from its own config (spotifycontroller-main/config/config.json), which
// setting_update.sh writes from mupiboxconfig.json. After a login or a reset the player is restarted too, as the admin
// interface's Spotify page does - but not this process (spotify_restart.sh restarts both): it reads the config live.
function applySpotifyAccessToPlayer(restartPlayer: boolean): void {
  runSettingUpdate(restartPlayer)
}

// The backend's Spotify caches (see /spotify-access/clear-cache); true when all of them are gone
async function clearSpotifyCache(): Promise<boolean> {
  const dir = `${process.cwd()}/cache`
  let ok = true
  for (const name of ['spotify', 'spotify-api', 'covers', 'home-lists.json']) {
    const target = `${dir}/${name}`
    try {
      await fsp.rm(target, { recursive: true, force: true })
    } catch {
      // written by another user once: as the admin interface, with sudo
      if (!(await execCapture('sudo', ['rm', '-rf', target], 20000)).ok) ok = false
    }
  }
  return ok
}

// The WiFi adapter in use (a USB adapter if there is one, else the onboard one - see
// mupi_wifi_iface.sh). These routes had wlan0 hard-coded: with a USB adapter the scan, the list
// of saved networks and "remove" looked at the wrong adapter. Asked at most every 3 s.
let wifiIfaceCache: { name: string; at: number } | undefined
function wifiIface(): string {
  if (wifiIfaceCache && Date.now() - wifiIfaceCache.at < 3000) {
    return wifiIfaceCache.name
  }
  let name = 'wlan0'
  try {
    const out = execFileSync('/usr/local/bin/mupibox/mupi_wifi_iface.sh', [], { timeout: 3000 }).toString().trim()
    if (/^wl[\w.-]+$/.test(out)) {
      name = out
    }
  } catch {
    // without the script: the onboard adapter, as before
  }
  wifiIfaceCache = { name, at: Date.now() }
  return name
}

/**
 * Creates the API router for /api/app/*. The /eltern landing page
 * (magic-link redemption) is a separate route in server.ts because it
 * needs to redirect to the WebApp, not return JSON.
 */
// How playback may go on when a limit is reached: 'stop' (at once), 'track' (let the song finish) or 'album'.
// Older configs only have maxOverrunMinutes: 0 meant stop at once, anything else let the song finish.
type GraceMode = 'stop' | 'track' | 'album'
function isGraceMode(value: unknown): value is GraceMode {
  return value === 'stop' || value === 'track' || value === 'album'
}
// How long it may play on after a limit at most (the player's graceMaxMinutes: 1-180, default 15)
const GRACE_MAX_DEFAULT = 15
const graceMaxOf = (block: Record<string, unknown>): number => {
  const m = Number(block.graceMaxMinutes)
  return Number.isInteger(m) && m >= 1 && m <= 180 ? m : GRACE_MAX_DEFAULT
}
const validGraceMax = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 180

function graceModeOf(block: Record<string, unknown>): GraceMode {
  if (isGraceMode(block.graceMode)) return block.graceMode
  return block.maxOverrunMinutes === 0 ? 'stop' : 'track'
}

// one-time tickets for the admin interface (POST /admin-ticket): ticket -> valid until
const adminTickets = new Map<string, number>()

// The box's address for Spotify: the one of port 8200, registered in the Spotify app - also when the app is used
// through port 80 (the web server passes it on, see PROXY_PORT)
// The box's name as the browser uses it, without a port: Spotify's redirect address is https://<box>/…, through the
// web server on port 443 (as the admin interface's https://<box>/spotify.php) - Spotify takes no http addresses any
// more except 127.0.0.1, so http://<box>:8200 was refused after the login
type RssEpisode = { url: string; title: string; date: string | null; duration: string; cover: string; show: string; isNew: boolean; saveable: boolean }

// The episodes of a podcast feed, newest first (by date; without dates in the feed's order), from the feed as the
// display reads it (xml-js: a text is {_text} or {_cdata}, one item comes as an object instead of a list), or null.
// cover: the episode's picture, else the show's, through the box's picture proxy (a local copy is /rss-covers/…).
async function rssEpisodes(feed: string): Promise<RssEpisode[] | null> {
  const text = (v: unknown): string => {
    if (typeof v === 'string') return v
    const o = v as { _text?: unknown; _cdata?: unknown } | undefined
    return typeof o?._cdata === 'string' ? o._cdata : typeof o?._text === 'string' ? o._text : ''
  }
  const proxied = (picture: string) =>
    !picture
      ? ''
      : picture.startsWith('/rss-covers/')
        ? `/api/rssfeed/image?local=${encodeURIComponent(picture.slice('/rss-covers/'.length))}&w=400`
        : `/api/rssfeed/image?url=${encodeURIComponent(picture)}&w=400`
  try {
    const r = await fetch(`http://127.0.0.1:8200/api/rssfeed/cached?url=${encodeURIComponent(feed)}`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const channel = ((await r.json()) as { rss?: { channel?: Record<string, unknown> } }).rss?.channel
    const raw = channel?.item
    const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[]
    const show = text(channel?.title)
    const showPicture = text((channel?.image as { url?: unknown } | undefined)?.url)
    const list: (RssEpisode & { at: number })[] = []
    for (const [i, it] of items.entries()) {
      const url = (it.enclosure as { _attributes?: { url?: unknown } } | undefined)?._attributes?.url
      if (typeof url !== 'string' || !url) continue
      const when = Date.parse(text(it.pubDate))
      const image = (it['itunes:image'] as { _attributes?: { href?: unknown } } | undefined)?._attributes?.href
      list.push({
        url,
        title: text(it.title) || 'Episode',
        date: Number.isFinite(when) ? new Date(when).toISOString() : null,
        duration: text(it['itunes:duration']),
        cover: proxied(typeof image === 'string' && image ? image : showPicture),
        show,
        // (new: see episode-state.ts, set by /api/rssfeed/cached)
        isNew: it._new === true,
        // (may be kept on the SD card: a podcast feed's episode always, an ARD episode only with the ARD's download
        // release and before the end of its time online - see podcast-offline.ts mayKeep)
        saveable: mayKeep({
          url,
          title: '',
          ...(isArdFeed(feed) ? { download: typeof it._download === 'string' ? it._download : null } : {}),
          until: typeof it._until === 'string' ? Date.parse(it._until) || null : null,
        }),
        // (no date: the order of the feed, the first one being the newest as usual)
        at: Number.isFinite(when) ? when : -i,
      })
    }
    return list.sort((x, y) => y.at - x.at).map(({ at: _at, ...e }) => e)
  } catch {
    return null
  }
}

function spotifyHost(req: Request): string | undefined {
  const host = req.headers.host
  if (typeof host !== 'string') return undefined
  return host.replace(/:\d+$/, '')
}

export function createElternApiRouter(deps: ElternRouterDeps): Router {
  const router = Router()
  // (a new password ends the sessions issued under the old one)
  usePasswordStamp(deps.getMupiboxConfig)
  const newEpoch = () =>
    deps.updateMupiboxConfig((c) => {
      c.interfacelogin = { ...((c.interfacelogin as Record<string, unknown> | undefined) ?? {}), epoch: newSignOutEpoch() }
    })

  // Every API route requires LAN + session; magic-link generation
  // (the bootstrap path) requires LAN + rate-limit but no session.
  router.use(localNetworkOnly)

  if (deps.localLibrary) registerLocalUploadRoutes(router, deps.localLibrary)
  registerDisplayRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  registerHardwareRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  registerServicesRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  registerSystemRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  // (pm2 runs server.js from its folder: templates/ lies next to it)
  registerAdminRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig, serverDir: process.cwd() })
  registerNetworkRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  registerUpdateRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig })
  registerTlsRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig, updateMupiboxConfig: deps.updateMupiboxConfig })
  registerHealthRoutes(router, { getMupiboxConfig: deps.getMupiboxConfig })
  registerPodcastRoutes(router, {
    activeDataPath: deps.activeDataPath,
    podcastOffline: deps.podcastOffline,
    getMupiboxConfig: deps.getMupiboxConfig,
    updateMupiboxConfig: deps.updateMupiboxConfig,
  })
  registerCustomCoverRoutes(router, {
    dir: '/home/dietpi/MuPiBox/media/cover',
    host: () => String((deps.getMupiboxConfig()?.mupibox as { host?: string } | undefined)?.host || os.hostname()),
    // (a cover chosen for a folder of the SD card or the NAS, see cover-apply)
    local: deps.localLibrary,
    nas: deps.nasCover,
    nasSelected: deps.nasSelected,
  })

  /**
   * GET/POST /api/app/online-covers-settings  {onlineCovers?, onlineCoversSave?}
   * The two switches of the online covers (mupibox.onlineCovers / onlineCoversSave), which only the admin interface's
   * cover page could set. The backend reads them live; the app starts the scan or the storing itself after switching
   * on (POST /api/online-covers/scan, /save-all), as that page did.
   */
  router.get('/online-covers-settings', requireSession, (_req, res) => {
    const mb = (deps.getMupiboxConfig()?.mupibox ?? {}) as Record<string, unknown>
    res.json({ onlineCovers: mb.onlineCovers === true, onlineCoversSave: mb.onlineCoversSave === true })
  })
  router.post('/online-covers-settings', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { onlineCovers?: unknown; onlineCoversSave?: unknown }
    const set: Record<string, boolean> = {}
    for (const key of ['onlineCovers', 'onlineCoversSave'] as const) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'boolean') {
        res.status(400).json({ error: `${key} must be true or false` })
        return
      }
      set[key] = body[key] as boolean
    }
    await deps.updateMupiboxConfig((cfg) => {
      const mb = ((cfg.mupibox as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      Object.assign(mb, set)
      cfg.mupibox = mb
    })
    res.json({ ok: true })
  })

  /**
   * POST /api/app/magic-link/generate
   * Issues a single-use magic-link token. Caller is expected to be the
   * Telegram bot OR the Cloud+Batterie-Tap handler — both intermediate
   * a physical access proof (chatId-whitelist or device-touch sequence).
   * This endpoint itself is just rate-limited; the caller is the
   * security boundary.
   *
   * Body: { source?: 'telegram' | 'cloud-batterie-tap' | 'admin' }.
   */
  // Only on the box itself: its callers are the Telegram bot (localhost:8200) and the kiosk's
  // settings page. Reachable from the LAN it handed any device a full parents' session and
  // made the parents' password pointless.
  router.post('/magic-link/generate', localOnly, ipRateLimit(10), (req, res) => {
    const body = (req.body ?? {}) as { source?: unknown }
    const source = typeof body.source === 'string' ? body.source : 'unknown'
    const link = generateMagicLink(source)
    // (the address the phone opens it at: https when "Nur sichere Verbindung" is on, the name the parents set for
    // links - e.g. the one of an own certificate - else the box's IP, which the caller knows)
    const tls = tlsOf(deps.getMupiboxConfig())
    res.status(201).json({
      token: link.token,
      expires_in: link.expiresIn,
      url_path: `/app?token=${encodeURIComponent(link.token)}`,
      scheme: tls.httpsOnly === true ? 'https' : 'http',
      link_host: typeof tls.linkHost === 'string' && tls.linkHost ? tls.linkHost : null,
    })
  })

  /**
   * POST /api/app/admin-ticket - a one-time ticket that signs the app's user in to the admin interface (the app's
   * "Erweiterte Einstellungen"), without the password: the admin interface (header.php) redeems it through the box
   * itself, POST /admin-ticket/redeem {ticket}. 60 seconds, single use.
   */
  router.post('/admin-ticket', requireSession, requireCsrf, (_req, res) => {
    const now = Date.now()
    for (const [t, until] of adminTickets) if (until < now) adminTickets.delete(t)
    const ticket = randomBytes(32).toString('hex')
    adminTickets.set(ticket, now + 60_000)
    res.json({ ticket })
  })
  router.post('/admin-ticket/redeem', localOnly, (req, res) => {
    const ticket = String((req.body as { ticket?: unknown } | undefined)?.ticket ?? '')
    const until = adminTickets.get(ticket)
    adminTickets.delete(ticket)
    res.json({ ok: until !== undefined && until >= Date.now() })
  })

  /**
   * GET /api/app/magic-link/qr?token=<token>
   * Renders a QR-Code SVG for the magic-link URL. Used by the Box-Frontend
   * Cloud+Batterie-Tap overlay (Phase 15b): box-frontend POSTs to
   * /magic-link/generate, receives the token, then loads this endpoint
   * as <img> to display the QR. No auth — the QR carries the single-use
   * token in its URL; rendering it on a public endpoint is no risk
   * (the token is already client-visible via the POST response).
   */
  router.get('/magic-link/qr', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (!token || !/^[a-f0-9]{32,128}$/i.test(token)) {
      res.status(400).send('invalid token')
      return
    }
    const host = req.headers.host
    if (typeof host !== 'string') {
      res.status(400).send('no host header')
      return
    }
    const url = `http://${host}/app?token=${encodeURIComponent(token)}`
    try {
      // SVG output — scales without pixel-blur on the box's 7" display.
      // errorCorrectionLevel=M is the sweet spot for 64-128-char URLs.
      const svg = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        color: { dark: '#1a1c20', light: '#ffffff' },
      })
      res.setHeader('Content-Type', 'image/svg+xml')
      res.setHeader('Cache-Control', 'no-store')
      res.send(svg)
    } catch (err) {
      res.status(500).send(`QR-Code generation failed: ${(err as Error).message}`)
    }
  })

  /** GET /api/app/session  — does the current request carry a valid
   *  session? Used by the WebApp on load to decide login vs. dashboard.
   *  Also tells the System screen whether a parent password is configured. */
  router.get('/session', (req, res, next) => {
    // "Anmeldung verlangen" off (as the admin interface's switch): no login on the home network (localNetworkOnly
    // above), the app gets its session and CSRF token right away
    if (appLoginRequired(deps.getMupiboxConfig()) || validateSession(parseCookie(req, SESSION_COOKIE))) return next()
    const session = issueSession(req.ip ?? req.socket.remoteAddress ?? '', false, true, { device: describeDevice(req.headers['user-agent']) })
    res.setHeader('Set-Cookie', buildSessionCookie(session.sessionId, 24 * 60 * 60))
    res.json({ authenticated: true, open: true, csrf_header: CSRF_HEADER, csrf_token: session.csrf, passwordConfigured: hasAppPassword(deps.getMupiboxConfig()) })
  }, requireSession, (req, res) => {
    // kept signed in: another 90 days from now on (the cookie too)
    if (validateSession(req.elternSessionId)?.persistent) {
      res.setHeader('Set-Cookie', buildSessionCookie(req.elternSessionId as string, PERSISTENT_COOKIE_SECONDS))
    }
    res.json({
      authenticated: true,
      csrf_header: CSRF_HEADER,
      csrf_token: req.elternSessionCsrf,
      passwordConfigured: hasAppPassword(deps.getMupiboxConfig()),
    })
  })

  /** GET /api/app/auth-info  — unauthenticated probe so the no-session
   *  screen can decide whether to offer a password-login form. Returns only
   *  a boolean; never the hash. */
  router.get('/auth-info', (_req, res) => {
    res.json({ passwordConfigured: hasAppPassword(deps.getMupiboxConfig()), loginRequired: appLoginRequired(deps.getMupiboxConfig()) })
  })

  /** POST /api/app/login  {password}  (Phase 17h)
   *  Alternative to magic-link redemption: when the parent has set a password,
   *  they can log back in after a session timeout without re-issuing a token.
   *  Rate-limited; the magic-link flow remains the passwordless entry path. */
  router.post('/login', ipRateLimit(5), async (req, res) => {
    const body = (req.body as { password?: unknown; remember?: unknown } | undefined) ?? {}
    const pw = typeof body.password === 'string' ? body.password : ''
    const mupibox = deps.getMupiboxConfig()
    if (!hasAppPassword(mupibox)) {
      res.status(401).json({ error: 'password login not enabled' })
      return
    }
    const ok = await verifyAppPassword(pw, mupibox)
    if (!ok) {
      res.status(401).json({ error: 'invalid password' })
      return
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? ''
    // "Angemeldet bleiben": the session survives the box's restarts (see auth.ts)
    const remember = body.remember === true
    const session = issueSession(ip, remember, false, { device: describeDevice(req.headers['user-agent']) })
    res.setHeader('Set-Cookie', buildSessionCookie(session.sessionId, remember ? PERSISTENT_COOKIE_SECONDS : 24 * 60 * 60))
    res.json({ ok: true, csrf_header: CSRF_HEADER, csrf_token: session.csrf })
  })

  // (POST /password, the parents' password of before, is gone: it set a second password without asking for the
  // current one - /auth/password below is the one way)

  /** GET /api/app/auth-state - the Sicherheit page: is a password set, is the login required, is it still the
   *  admin interface's well-known default password. */
  router.get('/auth-state', requireSession, async (req, res) => {
    const cfg = deps.getMupiboxConfig()
    res.json({
      // (signed in with the display's QR code or the Telegram link a moment ago: a new password without the old)
      resetOpen: hasAppPassword(cfg) && mayResetPassword(req.elternSessionId),
      passwordSet: hasAppPassword(cfg),
      loginRequired: appLoginRequired(cfg),
      loginSwitch: (cfg as { interfacelogin?: { state?: unknown } } | undefined)?.interfacelogin?.state === true,
      defaultPassword: await verifyAppPassword('MuP1B0x', cfg),
      keptDevices: keptSessionCount(),
    })
  })

  /** GET /api/app/auth/sessions - the devices signed in (browser and system as they name themselves, last use). */
  router.get('/auth/sessions', requireSession, (req, res) => {
    res.json({ sessions: listSessions(req.elternSessionId) })
  })

  /** POST /api/app/auth/sign-out {id} - one other device signed out (id: its name in the list, not its session). */
  router.post('/auth/sign-out', requireSession, requireCsrf, (req, res) => {
    const id = (req.body as { id?: unknown } | undefined)?.id
    if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }
    res.json({ ok: destroySessionByRef(id, req.elternSessionId) })
  })

  /** POST /api/app/auth/sign-out-others - every other device is signed out (also those kept signed in); this stays. */
  router.post('/auth/sign-out-others', requireSession, requireCsrf, async (req, res) => {
    const ended = destroyOtherSessions(req.elternSessionId)
    // (the admin interface's sessions as well: they check the sign-out generation)
    await newEpoch()
    restampSession(req.elternSessionId)
    res.json({ ok: true, ended })
  })

  /** POST /api/app/auth/password {current, password} - the one password; the current one is needed when one is set. */
  router.post('/auth/password', requireSession, requireCsrf, ipRateLimit(5), async (req, res) => {
    const body = (req.body ?? {}) as { current?: unknown; password?: unknown }
    const current = typeof body.current === 'string' ? body.current : ''
    const next = typeof body.password === 'string' ? body.password : ''
    const cfg = deps.getMupiboxConfig()
    if (hasAppPassword(cfg) && !mayResetPassword(req.elternSessionId) && !(await verifyAppPassword(current, cfg))) {
      res.status(403).json({ error: 'wrong_password' })
      return
    }
    if (next.length < APP_PASSWORD_MIN_LENGTH || next.length > 200) {
      res.status(400).json({ error: 'too_short', min: APP_PASSWORD_MIN_LENGTH })
      return
    }
    await setAppPassword(next, deps.updateMupiboxConfig)
    await newEpoch()
    // (this device stays signed in, the others sign in with the new password - in the admin interface too)
    restampSession(req.elternSessionId)
    res.json({ ok: true })
  })

  /** POST /api/app/auth/login-required {required} - "Anmeldung verlangen" (interfacelogin.state). Whoever is signed
   *  in may switch it (no second password, decided on 29.09.2026); switching on needs a password to ask for. */
  router.post('/auth/login-required', requireSession, requireCsrf, ipRateLimit(5), async (req, res) => {
    const body = (req.body ?? {}) as { required?: unknown; current?: unknown }
    if (typeof body.required !== 'boolean') {
      res.status(400).json({ error: 'required must be true or false' })
      return
    }
    const cfg = deps.getMupiboxConfig()
    if (!hasAppPassword(cfg)) {
      res.status(409).json({ error: 'no_password' })
      return
    }
    const wasOn = (cfg as { interfacelogin?: { state?: unknown } } | undefined)?.interfacelogin?.state === true
    const callerAnon = validateSession(req.elternSessionId)?.anon === true
    await deps.updateMupiboxConfig((c) => {
      const login = ((c.interfacelogin as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      login.state = body.required
      // switched on: every other device signs in now (the admin interface too) - also those that came in while it
      // was open; this one stays when it signed in with the password
      if (body.required && !wasOn) login.epoch = newSignOutEpoch()
      c.interfacelogin = login
    })
    if (body.required && !wasOn && !callerAnon) restampSession(req.elternSessionId)
    res.json({ ok: true })
  })

  /** POST /api/app/logout  — destroys the session, clears the cookie. */
  router.post('/logout', requireSession, requireCsrf, (req, res) => {
    destroySession(req.elternSessionId)
    res.setHeader('Set-Cookie', buildClearCookie())
    res.json({ ok: true })
  })

  /**
   * GET /api/app/spotify-oauth/init
   * Starts the Authorize-flow. Returns the Spotify URL the WebApp should
   * window.location.href to. Caller's redirect-target after callback is
   * optionally provided as ?return=/app (the default; the query ?spotify_connected=1 is appended to it).
   */
  router.get('/spotify-oauth/init', requireSession, (req, res) => {
    const host = spotifyHost(req)
    if (typeof host !== 'string') {
      res.status(400).json({ error: 'no host header' })
      return
    }
    // Only a page of the app: the value ends up in res.redirect() after the login, and
    // "https://elsewhere" or "//elsewhere" made that an open redirect.
    // (or the admin interface's Spotify page, which starts the same login)
    const ret = typeof req.query.return === 'string' && /^\/(?:app(?:[/?#]|$)|spotify\.php$)/.test(req.query.return) ? req.query.return : '/app'
    const result = buildAuthorizeUrl({
      getMupiboxConfig: deps.getMupiboxConfig,
      sessionId: req.elternSessionId ?? '',
      host,
      protocol: 'https',
      redirectAfter: ret,
    })
    if ('error' in result) {
      res.status(400).json({ error: 'no_client_id', redirect_to: '/app#/spotify-setup' })
      return
    }
    res.json({
      authorize_url: result.url,
      redirect_uri: result.redirectUri,
      scopes: REQUESTED_SCOPES,
    })
  })

  /**
   * GET /api/app/spotify-oauth/callback
   * Spotify redirects here after the user authorises. We swap code for
   * tokens, persist them, then redirect back to the WebApp. Uses the
   * exchange result to reset the box's tokenScopes so Smart-Sync picks
   * up the new permissions immediately.
   *
   * NOTE: This route accepts a session cookie (the user is bouncing back
   * from Spotify within the same browser session); a hostile bouncer
   * without the session cookie can't poison state because we additionally
   * gate on the OAuth state token issued in /init.
   */
  // No requireSession here: the session cookie is SameSite=Strict, and the browser does not send it
  // on Spotify's redirect back to the box (a navigation started on another site) - the callback
  // always failed with 401. The state proves the origin instead: 48 random hex characters, single
  // use, bound to the parents' session when the login was started; that session must still be valid.
  router.get('/spotify-oauth/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const error = typeof req.query.error === 'string' ? req.query.error : ''
    if (error) {
      // (back to the page that started the login, when the state is still known)
      const started = state ? consumeOauthState(state) : undefined
      res.redirect(withQuery(started?.redirectAfter ?? '/app', `spotify_error=${encodeURIComponent(error)}`))
      return
    }
    if (!state || !code) {
      res.status(400).send('missing code or state')
      return
    }
    const original = consumeOauthState(state)
    if (!original || !validateSession(original.sessionId)) {
      res.status(403).send('invalid or replayed state')
      return
    }
    const host = spotifyHost(req)
    if (typeof host !== 'string') {
      res.status(400).send('no host header')
      return
    }
    // (the address the login started with - Spotify checks that both are the same)
    const redirectUri = original.redirectUri || buildRedirectUri('https', host, redirectModeOf(deps.getMupiboxConfig()))
    const exchange = await exchangeCodeForTokens({
      code,
      redirectUri,
      getMupiboxConfig: deps.getMupiboxConfig,
      updateMupiboxConfig: deps.updateMupiboxConfig,
    })
    if (!exchange.ok) {
      res.redirect(withQuery(original.redirectAfter, `spotify_error=${encodeURIComponent(exchange.reason)}`))
      return
    }
    // As the admin interface's Spotify page: logging in means Spotify is wanted, and the player gets the new access
    await deps.updateMupiboxConfig((cfg) => {
      const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      spotify.active = true
      // (the address that worked is the one of this box from now on)
      spotify.redirect = redirectUri.endsWith(SPOTIFY_CALLBACK_PATHS.legacy) ? 'legacy' : 'app'
      cfg.spotify = spotify
    })
    applySpotifyAccessToPlayer(true)
    res.redirect(withQuery(original.redirectAfter, 'spotify_connected=1'))
  })

  /** POST /api/app/spotify-oauth/disconnect  — clears stored tokens. */
  router.post('/spotify-oauth/disconnect', requireSession, requireCsrf, async (_req, res) => {
    await clearSpotifyTokens(deps.updateMupiboxConfig)
    res.json({ ok: true })
  })

  /**
   * GET/POST /api/app/display-texts
   * Texts of the box display's overlays (limit reached, quiet time, parents' QR code), stored in
   * mupiboxconfig.json under displayTexts (+ displayLanguage). A missing or empty key means the text of the chosen language -
   * so parents can write them in their own language, or something personal ("Good night, Emma").
   */
  router.get('/display-texts', requireSession, (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const stored = (cfg?.displayTexts as Record<string, unknown> | undefined) ?? {}
    const texts: Record<string, string> = {}
    for (const key of DISPLAY_TEXT_KEYS) {
      if (typeof stored[key] === 'string') texts[key] = stored[key] as string
    }
    res.json({ texts, language: typeof cfg?.displayLanguage === 'string' ? cfg.displayLanguage : 'en' })
  })

  router.post('/display-texts', requireSession, requireCsrf, async (req, res) => {
    const incoming = (req.body?.texts ?? {}) as Record<string, unknown>
    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
      res.status(400).json({ error: 'texts must be an object' })
      return
    }
    // language code of assets/i18n/display-texts.json (e.g. 'de', 'nb'); unknown codes fall back to English on the box
    const language = req.body?.language
    if (language !== undefined && (typeof language !== 'string' || !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(language))) {
      res.status(400).json({ error: 'invalid language' })
      return
    }
    const texts: Record<string, string> = {}
    for (const key of DISPLAY_TEXT_KEYS) {
      const value = incoming[key]
      if (value === undefined || value === null) continue
      if (typeof value !== 'string') {
        res.status(400).json({ error: `${key} must be a string` })
        return
      }
      // one line of plain text: control characters out, at most 120 characters
      const clean = Array.from(value, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').trim().slice(0, 120)
      if (clean) texts[key] = clean
    }
    await deps.updateMupiboxConfig((cfg) => {
      if (Object.keys(texts).length > 0) cfg.displayTexts = texts
      else delete cfg.displayTexts
      if (typeof language === 'string') cfg.displayLanguage = language
    })
    res.json({ ok: true, texts, language })
  })

  /**
   * GET /api/app/caps-config
   * Returns playtimeLimit + quietHours configuration (per-weekday limits
   * and schedules) so the WebApp can render the editor. Live status
   * (today's used/remaining minutes) comes from the existing
   * /api/playtime endpoint — this one is just the static configuration
   * side. Phase 15h.
   */
  router.get('/caps-config', requireSession, (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const playtime = (cfg?.playtimeLimit as Record<string, unknown> | undefined) ?? {}
    const quiet = (cfg?.quietHours as Record<string, unknown> | undefined) ?? {}
    res.json({
      playtimeLimit: {
        enabled: playtime.enabled ?? false,
        graceMode: graceModeOf(playtime),
        graceMaxMinutes: graceMaxOf(playtime),
        resetHour: playtime.resetHour ?? 0,
        limitsMinutes: playtime.limitsMinutes ?? {
          mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60,
        },
      },
      quietHours: {
        enabled: quiet.enabled ?? false,
        graceMode: graceModeOf(quiet),
        graceMaxMinutes: graceMaxOf(quiet),
        schedule: quiet.schedule ?? { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      },
    })
  })

  /**
   * POST /api/app/caps-config
   * Update the playtimeLimit and quietHours config blocks. Validates the
   * shape (numeric day-limits 0-1440, schedule windows as {start, end}
   * HH:MM-strings). Existing /api/playtime/limit endpoint sets one day
   * at a time; this one is bulk-write for the WebApp's day-grid editor.
   * Phase 15h.
   */
  router.post('/caps-config', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as {
      playtimeLimit?: {
        enabled?: unknown
        limitsMinutes?: Record<string, unknown>
        graceMode?: unknown
        graceMaxMinutes?: unknown
        resetHour?: unknown
      }
      quietHours?: {
        enabled?: unknown
        schedule?: Record<string, unknown>
        graceMode?: unknown
        graceMaxMinutes?: unknown
      }
    }
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    // Validate playtimeLimit.limitsMinutes if provided.
    const validatedLimits: Record<string, number> = {}
    if (body.playtimeLimit?.limitsMinutes) {
      for (const day of days) {
        const v = body.playtimeLimit.limitsMinutes[day]
        if (v === undefined) continue
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1440) {
          res.status(400).json({ error: `invalid limitsMinutes.${day}` })
          return
        }
        validatedLimits[day] = Math.floor(v)
      }
    }
    // Validate quietHours.schedule if provided. Shape is {from,to,label?} —
    // matching the player (spotify-control.js) and the AdminInterface PHP
    // (mupi.php writes from/to/label too). A WebApp save in the old {start,end}
    // shape would have silently corrupted the config: the player would no
    // longer find any windows. Fixed in 17j.
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
    type QuietWindow = { from: string; to: string; label?: string }
    const validatedSchedule: Record<string, QuietWindow[]> = {}
    if (body.quietHours?.schedule) {
      for (const day of days) {
        const windows = body.quietHours.schedule[day]
        if (windows === undefined) continue
        if (!Array.isArray(windows)) {
          res.status(400).json({ error: `schedule.${day} must be an array` })
          return
        }
        const accepted: QuietWindow[] = []
        for (const w of windows) {
          if (!w || typeof w !== 'object') {
            res.status(400).json({ error: `schedule.${day} entry must be {from,to,label?}` })
            return
          }
          const rec = w as Record<string, unknown>
          const from = rec.from
          const to = rec.to
          if (typeof from !== 'string' || typeof to !== 'string' || !HHMM.test(from) || !HHMM.test(to)) {
            res.status(400).json({ error: `schedule.${day} times must be HH:MM strings (fields: from, to)` })
            return
          }
          // (from == to is no window: the player ignored it silently; the admin interface refused it too)
          if (from === to) {
            res.status(400).json({ error: `schedule.${day}: from and to must differ` })
            return
          }
          const entry: QuietWindow = { from, to }
          if (typeof rec.label === 'string' && rec.label.trim()) entry.label = rec.label.trim().slice(0, 80)
          accepted.push(entry)
        }
        validatedSchedule[day] = accepted
      }
    }
    // The hour at which a new playtime day starts (0-23); the GET above returned it, the save ignored it
    let resetHour: number | undefined
    if (body.playtimeLimit?.resetHour !== undefined) {
      const h = Number(body.playtimeLimit.resetHour)
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        res.status(400).json({ error: 'resetHour must be a whole hour 0-23' })
        return
      }
      resetHour = h
    }
    await deps.updateMupiboxConfig((cfg) => {
      if (body.playtimeLimit) {
        const block = ((cfg.playtimeLimit as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
        if (typeof body.playtimeLimit.enabled === 'boolean') block.enabled = body.playtimeLimit.enabled
        if (resetHour !== undefined) block.resetHour = resetHour
        if (isGraceMode(body.playtimeLimit.graceMode)) {
          block.graceMode = body.playtimeLimit.graceMode
          delete block.maxOverrunMinutes
        }
        if (validGraceMax(body.playtimeLimit.graceMaxMinutes)) block.graceMaxMinutes = body.playtimeLimit.graceMaxMinutes
        if (Object.keys(validatedLimits).length > 0) {
          const lm = ((block.limitsMinutes as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
          Object.assign(lm, validatedLimits)
          block.limitsMinutes = lm
        }
        cfg.playtimeLimit = block
      }
      if (body.quietHours) {
        const block = ((cfg.quietHours as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
        if (typeof body.quietHours.enabled === 'boolean') block.enabled = body.quietHours.enabled
        if (isGraceMode(body.quietHours.graceMode)) {
          block.graceMode = body.quietHours.graceMode
          delete block.maxOverrunMinutes
        }
        if (validGraceMax(body.quietHours.graceMaxMinutes)) block.graceMaxMinutes = body.quietHours.graceMaxMinutes
        if (Object.keys(validatedSchedule).length > 0) {
          const sched = ((block.schedule as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
          Object.assign(sched, validatedSchedule)
          block.schedule = sched
        }
        cfg.quietHours = block
      }
    })
    res.json({ ok: true })
  })

  /**
   * GET /api/app/power-config
   * Returns idle-shutdown + display-timeout fields from mupiboxconfig.timeout.
   * Plus the active battery profile name so the WebApp can display it
   * alongside live mupihat readings. Phase 15i.
   */
  router.get('/power-config', requireSession, (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const timeout = (cfg?.timeout as Record<string, unknown> | undefined) ?? {}
    const mupihat = (cfg?.mupihat as Record<string, unknown> | undefined) ?? {}
    const selectedBattery = typeof mupihat.selected_battery === 'string' ? mupihat.selected_battery : ''
    // Find the active profile's config for the read-only display side
    const types = Array.isArray(mupihat.battery_types) ? (mupihat.battery_types as Array<Record<string, unknown>>) : []
    const profile = types.find((p) => p?.name === selectedBattery)
    res.json({
      timeout: {
        // Existing fields are numbers-stored-as-strings in the JSON;
        // normalise to numbers for the UI side, fall back to defaults
        // from config/templates/mupiboxconfig.json.
        idlePiShutdown: Number(timeout.idlePiShutdown ?? 0),
        idleDisplayOff: Number(timeout.idleDisplayOff ?? 10),
        pressDelay: Number(timeout.pressDelay ?? 2),
      },
      battery: {
        selected: selectedBattery,
        profile: (profile?.config as Record<string, unknown> | undefined) ?? null,
      },
    })
  })

  /**
   * POST /api/app/power-config
   * Updates idlePiShutdown / idleDisplayOff. Values arrive as numbers,
   * persisted as strings (matches the existing JSON convention from
   * Phase 1's config). Phase 15i.
   */
  router.post('/power-config', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as {
      idlePiShutdown?: unknown
      idleDisplayOff?: unknown
      batteryProfile?: Record<string, unknown>
    }
    const timeoutMutations: Record<string, string> = {}
    if (typeof body.idlePiShutdown === 'number' && Number.isFinite(body.idlePiShutdown)) {
      const v = Math.max(0, Math.min(1440, Math.floor(body.idlePiShutdown)))
      timeoutMutations.idlePiShutdown = String(v)
    }
    if (typeof body.idleDisplayOff === 'number' && Number.isFinite(body.idleDisplayOff)) {
      const v = Math.max(0, Math.min(1440, Math.floor(body.idleDisplayOff)))
      timeoutMutations.idleDisplayOff = String(v)
    }

    // Phase 18 Item 7: edit the ACTIVE battery profile (selected_battery).
    // VREG-in-mV especially safety-critical — too high cooks the cells.
    // Validation pro-Feld + Cross-Field (th_shutdown < th_warning).
    let profileMutations: Record<string, string> | null = null
    let removeVreg = false
    if (body.batteryProfile && typeof body.batteryProfile === 'object') {
      const ranges: Record<string, [number, number]> = {
        v_100: [5000, 9000],
        v_75: [5000, 9000],
        v_50: [5000, 9000],
        v_25: [5000, 9000],
        v_0: [5000, 9000],
        th_warning: [5500, 8000],
        th_shutdown: [5000, 7500],
        vreg: [6000, 8500],
      }
      const candidates: Record<string, string> = {}
      for (const [field, [lo, hi]] of Object.entries(ranges)) {
        const raw = body.batteryProfile[field]
        // vreg null: the charger chip's own value again (the key goes, as the admin interface's empty field did)
        if (field === 'vreg' && raw === null) {
          removeVreg = true
          continue
        }
        if (raw === undefined || raw === null || raw === '') continue
        const n = Math.floor(Number(raw))
        if (!Number.isFinite(n) || n < lo || n > hi) {
          res.status(400).json({ error: `${field} must be ${lo}-${hi} mV` })
          return
        }
        candidates[field] = String(n)
      }
      // Sanity: th_shutdown should be strictly below th_warning. Read existing
      // profile values for fields the caller didn't update so the cross-check
      // covers partial updates too.
      const cfgRead = deps.getMupiboxConfig()
      const mupihatRead = (cfgRead?.mupihat as Record<string, unknown> | undefined) ?? {}
      const selectedRead = String(mupihatRead.selected_battery ?? '')
      const typesRead = Array.isArray(mupihatRead.battery_types)
        ? (mupihatRead.battery_types as Array<Record<string, unknown>>)
        : []
      const profileRead = typesRead.find((p) => p?.name === selectedRead)
      const profConfigRead = (profileRead?.config as Record<string, unknown> | undefined) ?? {}
      const finalShutdown = Number(candidates.th_shutdown ?? profConfigRead.th_shutdown ?? 0)
      const finalWarning = Number(candidates.th_warning ?? profConfigRead.th_warning ?? 0)
      if (finalShutdown && finalWarning && finalShutdown >= finalWarning) {
        res.status(400).json({ error: `th_shutdown (${finalShutdown}) must be < th_warning (${finalWarning})` })
        return
      }
      if (Object.keys(candidates).length > 0 || removeVreg) profileMutations = candidates
    }

    if (Object.keys(timeoutMutations).length === 0 && !profileMutations) {
      res.status(400).json({ error: 'no recognised fields in body' })
      return
    }

    await deps.updateMupiboxConfig((cfg) => {
      if (Object.keys(timeoutMutations).length > 0) {
        const timeout = ((cfg.timeout as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
        Object.assign(timeout, timeoutMutations)
        cfg.timeout = timeout
      }
      if (profileMutations) {
        const mupihat = ((cfg.mupihat as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
        const selected = String(mupihat.selected_battery ?? '')
        const types = Array.isArray(mupihat.battery_types)
          ? (mupihat.battery_types as Array<Record<string, unknown>>)
          : []
        const profile = types.find((p) => p?.name === selected)
        if (profile) {
          const pConfig = ((profile.config as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
          Object.assign(pConfig, profileMutations)
          if (removeVreg) delete pConfig.vreg
          profile.config = pConfig
          mupihat.battery_types = types
          cfg.mupihat = mupihat
        }
      }
    })
    // "Display aus nach" while nothing plays is the X server's blanking (BlankTime, written by setting_update.sh, read
    // at the start): set live now as well, 0 = never; setting_update.sh keeps it for the next start
    if (timeoutMutations.idleDisplayOff !== undefined) {
      const min = Number(timeoutMutations.idleDisplayOff)
      const xset = min > 0 ? ['s', String(min * 60), String(min * 60)] : ['s', 'off']
      execFile('xset', xset, { env: { ...process.env, DISPLAY: ':0' }, timeout: 5000 }, (err) => {
        if (err) console.warn(`${new Date().toLocaleString()}: [eltern] xset ${xset.join(' ')}: ${err.message}`)
      })
      runSettingUpdate()
    }
    res.json({ ok: true, applied: { timeout: timeoutMutations, batteryProfile: profileMutations } })
  })

  /**
   * GET /api/app/sleeptimer  (Phase 17i)
   * Read the runtime state of the poweroff-countdown timer. The countdown
   * itself is the existing `sleep_timer.sh` background process (started by
   * AdminInterface/mupi.php today) which writes the remaining seconds to
   * `/tmp/.time2sleep` once per second and runs `poweroff` when it hits zero.
   * The file only exists while a timer is active.
   */
  router.get('/sleeptimer', requireSession, (_req, res) => {
    try {
      const raw = readFileSync('/tmp/.time2sleep', 'utf8').trim()
      const remaining = Number.parseInt(raw, 10)
      if (Number.isFinite(remaining) && remaining > 0) {
        const until = new Date(Date.now() + remaining * 1000)
        res.json({ active: true, remaining_seconds: remaining, until_iso: until.toISOString() })
        return
      }
    } catch {
      // file missing — no timer running, fall through
    }
    res.json({ active: false })
  })

  /**
   * POST /api/app/sleeptimer/start  {minutes}  (Phase 17i)
   * Mirrors the mupi.php behaviour: spawn `sleep_timer.sh <seconds>` detached
   * via sudo. Accepts 1..1440 minutes (same cap the admin UI uses). The shell
   * script writes the remaining time to /tmp/.time2sleep and runs `poweroff`
   * when it hits zero; everything else is just observation.
   */
  router.post('/sleeptimer/start', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { minutes?: unknown } | undefined) ?? {}
    const minutes = Math.floor(Number(body.minutes))
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      res.status(400).json({ error: 'minutes must be an integer between 1 and 1440' })
      return
    }
    const seconds = minutes * 60
    try {
      // A timer that is already running is replaced, not joined by a second one: correcting
      // 30 to 90 minutes used to leave the 30-minute timer running, and it shut the box down.
      await new Promise<void>((resolve) => {
        execFile('sudo', ['pkill', '-f', 'sleep_timer.sh'], { timeout: 5000 }, () => resolve())
      })
      const child = spawn('sudo', ['/usr/local/bin/mupibox/sleep_timer.sh', String(seconds)], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
    } catch (err) {
      res.status(500).json({ error: `spawn failed: ${(err as Error).message}` })
      return
    }
    res.json({ ok: true, minutes, seconds })
  })

  /**
   * POST /api/app/sleeptimer/stop  (Phase 17i)
   * Mirrors mupi.php's "Stop running timer" button: `pkill -f sleep_timer.sh`
   * then remove `/tmp/.time2sleep`. Both are idempotent — calling stop when
   * no timer runs returns ok without erroring.
   */
  router.post('/sleeptimer/stop', requireSession, requireCsrf, (_req, res) => {
    execFile('sudo', ['pkill', '-f', 'sleep_timer.sh'], { timeout: 5000 }, () => {
      execFile('sudo', ['rm', '-f', '/tmp/.time2sleep'], { timeout: 5000 }, () => {
        res.json({ ok: true })
      })
    })
  })

  /**
   * GET /api/app/audio  (Phase 18 Item 1)
   * Returns the live ALSA Master volume, the configured hearing-protection
   * cap (`mupibox.maxVolume`), and the optional startup default
   * (`mupibox.startupVolume`, null if disabled). Live value comes from amixer
   * and may be off by a tick when the kid spins the touchscreen dial.
   */
  router.get('/audio', requireSession, (_req, res) => {
    // Defensive: getMupiboxConfig() can briefly return undefined right after
    // pm2 restart or while updateMupiboxConfig is mid-cp (cache cleared, file
    // potentially partially written so the readFileSync fallback also fails).
    // Returning fallback values from here would lie about the cap — the cap
    // check below would think the limit is 100 % and let any volume through.
    // 503 so the caller retries instead.
    const cfg = deps.getMupiboxConfig()
    if (!cfg) {
      res.status(503).json({ error: 'config not yet loaded, please retry' })
      return
    }
    execFile('/usr/bin/amixer', ['sget', 'Master'], { timeout: 3000 }, (err, stdout) => {
      let current: number | null = null
      if (!err && stdout) {
        // Output varies by sound card: `Right:`, `Front Right:`, or `Mono:`.
        // Match the bracketed percent anywhere in the output instead.
        const m = stdout.match(/\[(\d+)%\]/)
        if (m) current = Number.parseInt(m[1], 10)
      }
      const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
      const maxVolume = volumePercent(mb.maxVolume) ?? 100
      // (the admin interface only writes startVolume)
      const startupVolume = volumePercent(mb.startupVolume) ?? volumePercent(mb.startVolume) ?? null
      res.json({ current, maxVolume, startupVolume })
    })
  })

  /**
   * POST /api/app/audio/volume  {volume}  (Phase 18 Item 1)
   * Live volume control. Server-side clamps to the configured maxVolume cap
   * so a parent in the WebApp can't go above the hearing-protection limit
   * (matches the player's own cap enforcement for touchscreen volume-up).
   */
  router.post('/audio/volume', requireSession, requireCsrf, (req, res) => {
    const body = (req.body as { volume?: unknown } | undefined) ?? {}
    const raw = Number(body.volume)
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      res.status(400).json({ error: 'volume must be a number between 0 and 100' })
      return
    }
    const cfg = deps.getMupiboxConfig()
    if (!cfg) {
      // Same defence as GET /audio: without a loaded config we don't know the
      // cap, so refuse rather than silently let any volume through.
      res.status(503).json({ error: 'config not yet loaded, please retry' })
      return
    }
    const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
    const cap = volumePercent(mb.maxVolume) ?? 100
    const requested = Math.floor(raw)
    const applied = Math.min(requested, cap)
    execFile('/usr/bin/amixer', ['sset', 'Master', `${applied}%`], { timeout: 3000 }, (err) => {
      if (err) {
        res.status(500).json({ error: `amixer failed: ${err.message}` })
        return
      }
      res.json({ ok: true, applied, capped: applied < requested })
    })
  })

  /**
   * POST /api/app/audio/config  {maxVolume?, startupVolume?}  (Phase 18 Item 1)
   * Persist the hearing-protection cap and/or the startup-default volume.
   * `startupVolume: null` removes the startup default (so the box keeps
   * wherever the last session left off). Cap is min 10 % to avoid an
   * accidentally-muted box that looks broken.
   */
  router.post('/audio/config', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { maxVolume?: unknown; startupVolume?: unknown } | undefined) ?? {}
    const mutations: { maxVolume?: number; startupVolume?: number | null } = {}
    if (body.maxVolume !== undefined) {
      const v = Number(body.maxVolume)
      if (!Number.isFinite(v) || v < 10 || v > 100) {
        res.status(400).json({ error: 'maxVolume must be a number between 10 and 100' })
        return
      }
      mutations.maxVolume = Math.floor(v)
    }
    if (body.startupVolume !== undefined) {
      if (body.startupVolume === null) {
        mutations.startupVolume = null
      } else {
        const v = Number(body.startupVolume)
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          res.status(400).json({ error: 'startupVolume must be a number between 0 and 100, or null' })
          return
        }
        mutations.startupVolume = Math.floor(v)
      }
    }
    if (Object.keys(mutations).length === 0) {
      res.status(400).json({ error: 'no recognised fields in body' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const mb = ((cfg.mupibox as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      if (mutations.maxVolume !== undefined) mb.maxVolume = mutations.maxVolume
      // The scripts that set the volume at start and shutdown (chromium-autostart.sh, mupi_shutdown.sh,
      // off_trigger.sh, shutdown_sound.sh) and the admin interface read startVolume: this app's startupVolume alone
      // had no effect. Both are written; without a fixed value both go, and the scripts leave the volume as it was.
      if (mutations.startupVolume !== undefined) {
        if (mutations.startupVolume === null) {
          delete mb.startupVolume
          delete mb.startVolume
        } else {
          mb.startupVolume = mutations.startupVolume
          mb.startVolume = mutations.startupVolume
        }
      }
      // Hearing protection also at the start: the scripts set startVolume as it is (pactl), without the maximum - a
      // start value above it (set before, or the maximum lowered later) made the box start louder than allowed
      const max = Number(mb.maxVolume)
      if (Number.isFinite(max) && max > 0) {
        for (const key of ['startupVolume', 'startVolume']) {
          const v = Number(mb[key])
          if (mb[key] !== undefined && mb[key] !== null && Number.isFinite(v) && v > max) mb[key] = max
        }
      }
      cfg.mupibox = mb
    })
    res.json({ ok: true, applied: mutations })
  })

  // iwlist refuses a second scan while one is running ("Device or resource busy", exit 255) - two
  // requests close together, or wpa_supplicant's own background scan. That came back as a 500 in the
  // web app. Requests arriving meanwhile share the running scan, and a busy one is tried again shortly.
  let wlanScanInFlight: Promise<string> | null = null
  const iwlistScan = (): Promise<string> => {
    if (wlanScanInFlight) return wlanScanInFlight
    const attempt = (retriesLeft: number): Promise<string> =>
      new Promise((resolve, reject) => {
        execFile(
          'sudo',
          ['/usr/sbin/iwlist', wifiIface(), 'scanning'],
          { timeout: 12000, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (!err) {
              resolve(stdout)
              return
            }
            if (retriesLeft > 0 && /busy/i.test(`${stderr} ${err.message}`)) {
              setTimeout(() => attempt(retriesLeft - 1).then(resolve, reject), 1500)
              return
            }
            reject(err)
          },
        )
      })
    wlanScanInFlight = attempt(4).finally(() => {
      wlanScanInFlight = null
    })
    return wlanScanInFlight
  }

  /**
   * GET /api/app/wifi/scan  (Phase 18 Item 2)
   * Returns visible Wi-Fi networks, parsed from `iwlist wlan0 scanning`. We
   * dedup by SSID (keep the strongest signal) and drop hidden networks
   * (empty SSID). Slow — iwlist takes ~3-5 s.
   */
  router.get(['/wifi/scan', '/wlan/scan'], requireSession, (_req, res) => {
    iwlistScan().then((stdout) => {
      const blocks = stdout.split(/Cell \d+ -/)
      const byBest = new Map<string, { ssid: string; signal_dbm: number; encrypted: boolean }>()
      for (const blk of blocks) {
        const ssidMatch = blk.match(/ESSID:"([^"]*)"/)
        if (!ssidMatch) continue
        const ssid = ssidMatch[1]
        if (!ssid) continue // hidden network
        const sigMatch = blk.match(/Signal level=(-?\d+)\s*dBm/)
        const signal_dbm = sigMatch ? Number.parseInt(sigMatch[1], 10) : -100
        const encrypted = /Encryption key:on/.test(blk)
        const prev = byBest.get(ssid)
        if (!prev || signal_dbm > prev.signal_dbm) {
          byBest.set(ssid, { ssid, signal_dbm, encrypted })
        }
      }
      const networks = [...byBest.values()].sort((a, b) => b.signal_dbm - a.signal_dbm)
      res.json({ networks })
    }, (err: Error) => {
      res.status(500).json({ error: `iwlist failed: ${err.message}` })
    })
  })

  /**
   * GET /api/app/wifi/saved  (Phase 18 Item 2)
   * Lists wpa_supplicant's saved networks via `wpa_cli list_networks`. The
   * `[CURRENT]` flag marks which one is connected — the WebApp disables
   * "remove" on that row so the box can't be locked out via this UI.
   */
  router.get(['/wifi/saved', '/wlan/saved'], requireSession, (_req, res) => {
    execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifiIface(), 'list_networks'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        res.status(500).json({ error: `wpa_cli failed: ${err.message}` })
        return
      }
      const lines = stdout.split('\n')
      const networks: Array<{ id: number; ssid: string; active: boolean }> = []
      for (const ln of lines) {
        // Header line: "network id / ssid / bssid / flags" — skip
        if (!ln || ln.startsWith('network id')) continue
        const parts = ln.split('\t')
        if (parts.length < 2) continue
        const id = Number.parseInt(parts[0], 10)
        if (!Number.isFinite(id)) continue
        const ssid = parts[1] ?? ''
        const flags = parts[3] ?? ''
        networks.push({ id, ssid, active: flags.includes('[CURRENT]') })
      }
      res.json({ networks })
    })
  })

  /**
   * POST /api/app/wifi/add  {ssid, password?}  (Phase 18 Item 2)
   * Queues a new Wi-Fi entry by writing to wlan.json — same mechanism that
   * AdminInterface/network.php has used for ages. The add_wifi.sh daemon
   * polls the file every 2 s, runs `wpa_passphrase` (or appends an open
   * network if password is empty) and `wpa_cli reconfigure`. The current
   * connection is NOT touched: wpa_supplicant only switches if the new SSID
   * is reachable.
   */
  router.post(['/wifi/add', '/wlan/add'], requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { ssid?: unknown; password?: unknown } | undefined) ?? {}
    const ssid = typeof body.ssid === 'string' ? body.ssid : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!ssid || ssid.length > 32 || /[\r\n\0]/.test(ssid)) {
      res.status(400).json({ error: 'ssid must be 1-32 chars, no line breaks or NUL' })
      return
    }
    // WPA/WPA2-PSK: 8-63 chars. Empty = treat as open network.
    if (password && (password.length < 8 || password.length > 63)) {
      res.status(400).json({ error: 'password must be empty (open network) or 8-63 chars' })
      return
    }
    const WLAN_FILE = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json'
    let existing: unknown
    try {
      const raw = await fsp.readFile(WLAN_FILE, 'utf8')
      existing = JSON.parse(raw)
    } catch {
      existing = []
    }
    const queue = Array.isArray(existing) ? existing : []
    queue.push({ ssid, pw: password })
    try {
      await fsp.writeFile(WLAN_FILE, JSON.stringify(queue, null, 4), 'utf8')
    } catch (writeErr) {
      res.status(500).json({ error: `failed to queue wlan: ${(writeErr as Error).message}` })
      return
    }
    res.json({ ok: true, queued_position: queue.length })
  })

  /**
   * POST /api/app/wifi/password {ssid, password} - a new password for a saved network that is not the one connected
   * now (the router got a new one). Set as the network's key (WPA-PSK, worked out here as wpa_passphrase does: no
   * character of the password can break the configuration), then saved.
   */
  router.post('/wifi/password', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { ssid?: unknown; password?: unknown } | undefined) ?? {}
    const ssid = typeof body.ssid === 'string' ? body.ssid : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!ssid || password.length < 8 || password.length > 63) {
      res.status(400).json({ error: 'password must be 8-63 chars' })
      return
    }
    const cli = (args: string[]) =>
      new Promise<string>((resolve) => execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifiIface(), ...args], { timeout: 5000 }, (err, out) => resolve(err ? '' : out)))
    let id: string | null = null
    let active = false
    for (const ln of (await cli(['list_networks'])).split('\n')) {
      const parts = ln.split('\t')
      if (ln.startsWith('network id') || parts[1] !== ssid) continue
      id = parts[0]
      active = (parts[3] ?? '').includes('[CURRENT]')
      break
    }
    if (id === null || !/^\d+$/.test(id)) {
      res.status(404).json({ error: 'ssid not in saved networks' })
      return
    }
    if (active) {
      res.status(409).json({ error: 'connected_network' })
      return
    }
    const psk = pbkdf2Sync(password, ssid, 4096, 32, 'sha1').toString('hex')
    if (!/OK/.test(await cli(['set_network', id, 'psk', psk])) || !/OK/.test(await cli(['save_config']))) {
      res.status(500).json({ error: 'not_set' })
      return
    }
    res.json({ ok: true })
  })

  /**
   * POST /api/app/wifi/remove  {ssid}  (Phase 18 Item 2)
   * Removes a saved Wi-Fi network via wpa_cli, then persists the config. The
   * currently-connected network is refused (409) — the no-lockout safeguard
   * that the user explicitly asked for over a more elaborate test-connect
   * mechanism (which can't work when the WebApp lives on a separate device).
   */
  router.post(['/wifi/remove', '/wlan/remove'], requireSession, requireCsrf, (req, res) => {
    const body = (req.body as { ssid?: unknown } | undefined) ?? {}
    const ssid = typeof body.ssid === 'string' ? body.ssid : ''
    if (!ssid) {
      res.status(400).json({ error: 'ssid required' })
      return
    }
    execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifiIface(), 'list_networks'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        res.status(500).json({ error: `wpa_cli failed: ${err.message}` })
        return
      }
      let targetId: number | null = null
      let targetActive = false
      for (const ln of stdout.split('\n')) {
        if (!ln || ln.startsWith('network id')) continue
        const parts = ln.split('\t')
        if (parts.length < 2) continue
        if (parts[1] !== ssid) continue
        targetId = Number.parseInt(parts[0], 10)
        targetActive = (parts[3] ?? '').includes('[CURRENT]')
        break
      }
      if (targetId === null) {
        res.status(404).json({ error: 'ssid not in saved networks' })
        return
      }
      if (targetActive) {
        res.status(409).json({ error: 'refusing to remove the currently-connected network — would lock the box out' })
        return
      }
      execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifiIface(), 'remove_network', String(targetId)], { timeout: 5000 }, (rmErr, rmOut) => {
        if (rmErr || !/OK/.test(rmOut)) {
          res.status(500).json({ error: `remove_network failed: ${rmErr?.message ?? rmOut.trim()}` })
          return
        }
        execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifiIface(), 'save_config'], { timeout: 5000 }, (saveErr, saveOut) => {
          if (saveErr || !/OK/.test(saveOut)) {
            res.status(500).json({ error: `save_config failed: ${saveErr?.message ?? saveOut.trim()}` })
            return
          }
          res.json({ ok: true })
        })
      })
    })
  })

  /**
   * GET /api/app/battery-history?hours=24  (Phase 18 Item 6)
   * Reads /home/dietpi/.mupibox/battery_log.jsonl that the server.ts poller
   * writes once a minute. Filtered to the last `hours` (default 24, max
   * 168 = 7 days). Sampled down to ~120 points so the SVG chart in the
   * WebApp stays smooth even after a few days of history.
   */
  router.get('/battery-history', requireSession, (req, res) => {
    const hours = Math.max(1, Math.min(168, Math.floor(Number(req.query.hours) || 24)))
    let raw = ''
    try {
      raw = readFileSync('/home/dietpi/.mupibox/battery_log.jsonl', 'utf8')
    } catch {
      res.json({ hours, samples: [] })
      return
    }
    const cutoffMs = Date.now() - hours * 3600 * 1000
    type Sample = { ts: string; vbat: number | null; percent: number | null; vbus: number | null; ibat: number | null }
    const all: Sample[] = []
    for (const ln of raw.split('\n')) {
      if (!ln) continue
      try {
        const e = JSON.parse(ln) as Sample
        if (e.ts && Date.parse(e.ts) >= cutoffMs) all.push(e)
      } catch {
        /* skip malformed */
      }
    }
    // Downsample to roughly 120 points so the chart stays light.
    const TARGET = 120
    const samples = all.length <= TARGET ? all : all.filter((_, i) => i % Math.ceil(all.length / TARGET) === 0)
    // Always end on the newest reading: the web app shows it as "last ... at ...", and the thinning
    // above usually dropped it.
    const newest = all[all.length - 1]
    if (newest && samples[samples.length - 1] !== newest) samples.push(newest)
    res.json({ hours, samples })
  })

  /**
   * GET /api/app/playback  (Phase 18 Item 5)
   * Snapshot of what's playing on the box (current track + paused/playing
   * state). Just proxies the player's own /local — same data the box's
   * frontend already gets from it.
   */
  router.get('/playback', requireSession, async (_req, res) => {
    try {
      const localRes = await fetch('http://127.0.0.1:5005/local', { signal: AbortSignal.timeout(3000) })
      if (!localRes.ok) {
        res.status(502).json({ error: 'player unreachable' })
        return
      }
      const local = (await localRes.json()) as Record<string, unknown>
      const player = String(local.currentPlayer ?? '')

      // The /local fields (playing, currentTrackname, album) are mplayer-side
      // and stay empty during Spotify playback. For Spotify the canonical
      // truth is /state.is_playing + /state.item.* — that's the
      // getMyCurrentPlaybackState response from the Spotify API.
      let playing = false
      let title = ''
      let artist = ''
      let album = ''
      let coverUrl: string | null = null
      let progressMs: number | null = null
      let durationMs: number | null = null
      if (player === 'mplayer') {
        playing = local.playing === true
        title = String(local.currentTrackname ?? '')
        album = String(local.album ?? '')
        // A NAS or local album: path is its folder (NAS path, or <category>/<artist>/<album> in the library);
        // the artist is the folder above, the cover the one the box shows for it.
        const source = String(local.currentType ?? '')
        const folder = String(local.path ?? '')
        // a radio station or podcast: the picture it was started with (the app passes it on, spotify-control.js ?cover=)
        if ((source === 'rss' || source === 'radio') && typeof local.cover === 'string' && local.cover) coverUrl = local.cover
        if ((source === 'nas' || source === 'local') && folder) {
          const parts = folder.split('/').filter(Boolean)
          artist = parts[parts.length - 2] ?? ''
          // the track's own picture (a playlist of different stories) before the album's
          const trackFile = typeof local.trackFile === 'string' ? local.trackFile : ''
          coverUrl =
            (trackFile ? await deps.playingTrackCover?.(trackFile) : null) ??
            (await deps.playingAlbumCover?.(source, folder)) ??
            null
        }
      } else if (player === 'spotify') {
        try {
          const stateRes = await fetch('http://127.0.0.1:5005/state', { signal: AbortSignal.timeout(3000) })
          if (stateRes.ok) {
            const state = (await stateRes.json()) as {
              is_playing?: boolean
              progress_ms?: number
              item?: {
                name?: string
                duration_ms?: number
                artists?: Array<{ name?: string }>
                album?: { name?: string; images?: Array<{ url?: string }> }
                show?: { name?: string; publisher?: string; images?: Array<{ url?: string }> }
                images?: Array<{ url?: string }>
              }
            }
            playing = state.is_playing === true
            if (typeof state.progress_ms === 'number') progressMs = state.progress_ms
            if (typeof state.item?.duration_ms === 'number') durationMs = state.item.duration_ms
            if (state.item?.name) title = String(state.item.name)
            if (state.item?.album?.name) album = String(state.item.album.name)
            if (state.item?.show?.name) {
              artist = String(state.item.show.name)
              if (!album && state.item.show.publisher) album = String(state.item.show.publisher)
            } else if (Array.isArray(state.item?.artists) && state.item.artists[0]?.name) {
              artist = String(state.item.artists[0].name)
            }
            // Cover art priority: episode-own > show > album. Spotify orders
            // images largest-first, so [0] is the highest-res available.
            const candidates = [
              state.item?.images?.[0]?.url,
              state.item?.show?.images?.[0]?.url,
              state.item?.album?.images?.[0]?.url,
            ].filter((u): u is string => typeof u === 'string' && u.length > 0)
            if (candidates.length > 0) coverUrl = candidates[0]
          }
        } catch {
          /* state fetch failed → stays not-playing */
        }
      }
      res.json({
        playing,
        player,
        source: String(local.currentType ?? ''),
        title,
        artist,
        album,
        coverUrl,
        progressMs,
        durationMs,
        volume: typeof local.volume === 'number' ? local.volume : null,
      })
    } catch (err) {
      res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
    }
  })

  /** POST /api/app/playback/pause|play|stop  (Phase 18 Item 5)
   *  Quick-Pause / Quick-Play / Quick-Stop. Just forwards to the player's
   *  HTTP API on localhost:5005, where the corresponding command handler
   *  already exists (used by the box display + Telegram bot). No state
   *  duplicated on the backend-api side. */
  for (const action of ['pause', 'play', 'stop', 'next', 'previous'] as const) {
    router.post(`/playback/${action}`, requireSession, requireCsrf, async (_req, res) => {
      try {
        const r = await fetch(`http://127.0.0.1:5005/${action}?src=eltern`, { signal: AbortSignal.timeout(3000) })
        if (!r.ok) {
          // Player liefert bei Cap/Quiet einen 423 mit {error:'playtime_limit_reached'} etc.
          // Reichen wir 1:1 durch, damit die friendly-error-Mapping im Frontend greift.
          const body = await r.json().catch(() => ({ error: `player rejected ${action} (HTTP ${r.status})` }))
          res.status(r.status).json(body)
          return
        }
        res.json({ ok: true, action })
      } catch (err) {
        res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
      }
    })
  }

  /**
   * POST /api/app/library/play  { index }
   * Startet ein Library-Item auf der Box. Liest active_data.json, mapped den
   * Type auf den passenden Player-Command-Pfad (mirror PlayerService.playMedia
   * aus frontend-box) und proxied an localhost:5005. Nutzt /current/ als
   * Device-Prefix — Player setzt damit activeDevice=null und Spotify nimmt
   * das zuletzt aktive Connect-Device (typisch die Box).
   */
  /**
   * GET /api/app/library/episodes?index=N - the episodes of the podcast at this place of the library, newest first
   * (to choose one in the app, as on the box's episode list; played with POST /library/play {index, episode})
   */
  router.get('/library/episodes', requireSession, async (req, res) => {
    const idx = Number(req.query.index)
    let library: unknown
    try {
      library = JSON.parse(await fsp.readFile(deps.activeDataPath, 'utf8'))
    } catch {
      res.status(500).json({ error: 'library_unavailable' })
      return
    }
    const item = Array.isArray(library) && Number.isInteger(idx) && idx >= 0 ? (library[idx] as Record<string, unknown> | undefined) : undefined
    if (!item || item.type !== 'rss' || typeof item.id !== 'string') {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    const episodes = await rssEpisodes(item.id)
    if (!episodes) {
      res.status(502).json({ error: 'feed_unavailable' })
      return
    }
    // (saved: on the SD card - it plays without internet too; pos/len/done: where it was left, from the player's
    // episode-positions.json next to the library)
    const saved = deps.podcastOffline ? await deps.podcastOffline.list(item.id) : {}
    let positions: Record<string, { pos?: number; len?: number; done?: boolean }> = {}
    try {
      positions = JSON.parse(await fsp.readFile(path.join(path.dirname(deps.activeDataPath), 'episode-positions.json'), 'utf8'))
    } catch {
      positions = {}
    }
    res.json({
      episodes: episodes.map((e) => {
        // (by the episode's key, see episodeKey; positions written before the keys by the address)
        const key = episodeKey(e.url)
        const p = positions[key] ?? positions[e.url]
        return { ...e, saved: !!saved[key], ...(p ? { pos: p.pos ?? 0, len: p.len ?? 0, done: !!p.done } : {}) }
      }),
    })
  })

  router.post('/library/play', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { index?: unknown; albumId?: unknown; expect?: unknown; episode?: unknown } | undefined) ?? {}
    const idx = Number(body.index)
    if (!Number.isInteger(idx) || idx < 0) {
      res.status(400).json({ error: 'invalid_index' })
      return
    }
    let library: unknown
    try {
      library = JSON.parse(await fsp.readFile(deps.activeDataPath, 'utf8'))
    } catch {
      res.status(500).json({ error: 'library_unavailable' })
      return
    }
    if (!Array.isArray(library)) {
      res.status(500).json({ error: 'library_malformed' })
      return
    }
    const item = library[idx] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object') {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    if (item.isResume === true || item.category === 'resume') {
      res.status(400).json({ error: 'resume_entry_not_playable' })
      return
    }
    // The app's list may be older than the library (a sync, a delete, the offline list switched in): what stands at
    // this place now must be the entry that was tapped, else something else would play
    if (body.expect && typeof body.expect === 'object') {
      const expect = body.expect as Record<string, unknown>
      if (Object.keys(expect).some((k) => (item[k] ?? null) !== (expect[k] ?? null))) {
        res.status(409).json({ error: 'library_changed' })
        return
      }
    }
    const enc = encodeURIComponent
    const type = String(item.type ?? '')
    let url = ''
    // (a radio station's or podcast's picture for the display, which opens the player for it: it knows none itself)
    let cover = ''
    const ownCover = (v: unknown) => (typeof v === 'string' && /^(\/|https?:\/\/)/.test(v) ? v : '')
    // One album of an entry that subscribes a whole Spotify artist (only artistid): the app lists the artist's albums
    // and plays the one tapped - only for an artist that is in the library.
    const albumId = body.albumId
    if (albumId !== undefined) {
      if (typeof albumId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(albumId) || type !== 'spotify' || !item.artistid) {
        res.status(400).json({ error: 'invalid_album' })
        return
      }
      url = `spotify/now/spotify:album:${enc(albumId)}:0:0`
    } else switch (type) {
      case 'library': {
        const cat = String(item.category ?? '')
        const artist = String(item.artist ?? '')
        const title = String(item.title ?? item.id ?? '')
        url = `musicsearch/library/album/${enc(cat)}:${enc(artist)}:${enc(title)}`
        break
      }
      case 'spotify': {
        if (item.playlistid) url = `spotify/now/spotify:playlist:${enc(String(item.playlistid))}:0:0`
        else if (item.id) url = `spotify/now/spotify:album:${enc(String(item.id))}:0:0`
        else if (item.showid) url = `spotify/now/spotify:episode:${enc(String(item.showid))}:0:0`
        else if (item.audiobookid) url = `spotify/now/spotify:show:${enc(String(item.audiobookid))}:0:0`
        else {
          res.status(400).json({ error: 'spotify_id_missing' })
          return
        }
        break
      }
      case 'radio': {
        const id = String(item.id ?? '')
        const title = String(item.title ?? 'Radio')
        const artist = String(item.artist ?? '')
        url = `radio/${enc(id)}/${enc(title)}:title:artist:${enc(artist)}`
        cover = ownCover(item.cover_override) || ownCover(item.cover)
        break
      }
      case 'rss': {
        // A podcast's entry holds its feed, not an episode: the player got the feed's address and played nothing.
        // As a tap on the box's episode list: the newest episode (by its date) - read from the feed as the display
        // reads it (/api/rssfeed/cached, the box's own address).
        const feed = String(item.id ?? '')
        const episodes = await rssEpisodes(feed)
        // (a chosen one only when it is one of this feed's episodes)
        const episode = typeof body.episode === 'string' && body.episode ? episodes?.find((e) => e.url === body.episode) : episodes?.[0]
        if (!episode) {
          res.status(502).json({ error: 'no_episode' })
          return
        }
        const artist = episode.show || String(item.artist ?? '')
        url = `rss/${enc(episode.url)}/${enc(episode.title)}:title:artist:${enc(artist)}`
        cover = ownCover(item.cover_override) || episode.cover
        break
      }
      default:
        res.status(400).json({ error: `unsupported_type: ${type}` })
        return
    }
    try {
      const r = await fetch(`http://127.0.0.1:5005/current/${url}?src=eltern${cover ? `&cover=${encodeURIComponent(cover)}` : ''}`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({ error: `player rejected play (HTTP ${r.status})` }))
        res.status(r.status).json(errBody)
        return
      }
      res.json({
        ok: true,
        item: {
          type,
          artist: typeof item.artist === 'string' ? item.artist : null,
          title: typeof item.title === 'string' ? item.title : null,
        },
      })
    } catch (err) {
      res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
    }
  })

  /**
   * POST /api/app/library/play-nas  { path }
   * Plays a NAS album (a folder with audio files) on the box, as a tap in the box's NAS tab does. Only
   * folders the admin selected ("Show in MuPiBox" / "Download local") and did not hide can be played,
   * like everything else the box offers from the NAS.
   */
  /**
   * POST /api/app/library/play-local  {path}  – plays a folder of the SD card's media library
   * (<category>/<artist>/<album…>, as /api/library/artists|children list it) on the box, like the display does
   * (player: musicsearch/library/album/<segments joined by ":">).
   */
  router.post('/library/play-local', requireSession, requireCsrf, async (req, res) => {
    const raw = typeof (req.body as { path?: unknown } | undefined)?.path === 'string' ? (req.body as { path: string }).path : ''
    const parts = raw.split('/').filter(Boolean)
    const lib = deps.localLibrary
    if (!lib || parts.length < 2 || !lib.categories.includes(parts[0]) || parts.some((p) => p === '.' || p === '..' || p.includes('\\'))) {
      res.status(400).json({ error: 'invalid_path' })
      return
    }
    try {
      const st = await fsp.stat(`${lib.root}/${parts.join('/')}`)
      if (!st.isDirectory()) throw new Error('not a folder')
    } catch {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    try {
      const param = parts.map(encodeURIComponent).join(':')
      const r = await fetch(`http://127.0.0.1:5005/current/musicsearch/library/album/${param}?src=eltern`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({ error: `player rejected play (HTTP ${r.status})` }))
        res.status(r.status).json(errBody)
        return
      }
      res.json({ ok: true, item: { type: 'library', artist: parts.at(-2) ?? null, title: parts.at(-1) ?? null } })
    } catch (err) {
      res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
    }
  })

  router.post('/library/play-nas', requireSession, requireCsrf, async (req, res) => {
    const nasPath = typeof (req.body as { path?: unknown } | undefined)?.path === 'string' ? (req.body as { path: string }).path : ''
    if (!nasPath || !deps.nasPathSelected || !(await deps.nasPathSelected(nasPath))) {
      res.status(403).json({ error: 'nas_path_not_selected' })
      return
    }
    try {
      const r = await fetch(`http://127.0.0.1:5005/current/musicsearch/nas/${encodeURIComponent(nasPath)}?src=eltern`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({ error: `player rejected play (HTTP ${r.status})` }))
        res.status(r.status).json(errBody)
        return
      }
      const parts = nasPath.split('/').filter(Boolean)
      res.json({ ok: true, item: { type: 'nas', artist: parts.at(-2) ?? null, title: parts.at(-1) ?? null } })
    } catch (err) {
      res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
    }
  })

  /**
   * GET /api/app/playlog?range=today|week  (Phase 18 Item 4)
   * Reads the play_log.jsonl that the backend-api's own poller writes and
   * aggregates by track / artist / day. No DB — just walking the file once
   * per request, which is fine until the daughter listens to a few thousand
   * tracks (~MB-range jsonl). Pairs start/stop entries; an unpaired tail
   * "start" is the currently-playing track (we extrapolate its duration to
   * "now" so the Heute-Karte shows recent minutes immediately).
   */
  router.get('/playlog', requireSession, async (req, res) => {
    const range = String(req.query.range ?? 'today')
    if (range !== 'today' && range !== 'week') {
      res.status(400).json({ error: 'range must be today or week' })
      return
    }
    res.json(await playlogSummary(range, deps.currentPlayLogStart))
  })

  /**
   * GET /api/app/theme  (Phase 18 Item 3)
   * Returns the current theme + the whitelist of installed themes from
   * mupibox.installedThemes (35+ themes registered by conf_update.sh on box
   * provisioning). The installed-themes list IS the security boundary —
   * only those names are accepted by POST and by the preview endpoint.
   */
  router.get('/theme', requireSession, (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    if (!cfg) {
      res.status(503).json({ error: 'config not yet loaded, please retry' })
      return
    }
    const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
    const current = typeof mb.theme === 'string' ? mb.theme : ''
    const available = Array.isArray(mb.installedThemes)
      ? (mb.installedThemes as unknown[]).filter((x): x is string => typeof x === 'string').sort()
      : []
    // the children's themes (km) have names in their registry: English ("Day & Night" for tagundnacht) and German
    // ("Tag & Nacht") - the web app shows the ones of its own language
    const labels: Record<string, string> = {}
    const labelsDe: Record<string, string> = {}
    try {
      const km = JSON.parse(readFileSync('/home/dietpi/MuPiBox/themes/km-themes.json', 'utf8')) as {
        themes?: { id?: unknown; label?: unknown; labelEn?: unknown }[]
      }
      for (const theme of km.themes ?? []) {
        if (typeof theme.id !== 'string') continue
        if (typeof theme.label === 'string') labelsDe[theme.id] = theme.label
        const en = theme.labelEn ?? theme.label
        if (typeof en === 'string') labels[theme.id] = en
      }
    } catch {
      // no registry (older installation): the names as they are
    }
    res.json({
      current,
      available,
      labels,
      labelsDe,
      stage: mb.themeStage === true,
      stageAutoRead: mb.themeStageAutoRead === true,
    })
  })

  /**
   * POST /api/app/theme  {theme}  (Phase 18 Item 3)
   * Updates mupibox.theme AND swaps the active_theme.css symlink so the
   * change is visible after the next display reload — without running the
   * full setting_update.sh (which on shutdown also rewrites Spotify, Sonos,
   * spotifyd, display, NTP configs and would be far too broad a side-effect
   * for a colour change). Theme name is validated against installedThemes
   * to prevent symlink-target injection.
   */
  router.post('/theme', requireSession, requireCsrf, async (req, res) => {
    const cfg = deps.getMupiboxConfig()
    if (!cfg) {
      res.status(503).json({ error: 'config not yet loaded, please retry' })
      return
    }
    const body = (req.body as { theme?: unknown } | undefined) ?? {}
    const theme = typeof body.theme === 'string' ? body.theme.trim() : ''
    const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
    const installed = Array.isArray(mb.installedThemes)
      ? (mb.installedThemes as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    if (!theme || !installed.includes(theme)) {
      res.status(400).json({ error: 'theme not in installed-themes whitelist' })
      return
    }
    await deps.updateMupiboxConfig((c) => {
      const m = ((c.mupibox as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      m.theme = theme
      c.mupibox = m
    })
    const symlinkPath = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css'
    const target = `/home/dietpi/MuPiBox/themes/${theme}.css`
    try {
      await fsp.rm(symlinkPath, { force: true })
      await fsp.symlink(target, symlinkPath)
    } catch (err) {
      res.status(500).json({ error: `symlink update failed: ${(err as Error).message}` })
      return
    }
    res.json({ ok: true, theme })
  })

  /**
   * POST /api/app/theme-stage  {stage?, autoRead?}
   * The children's themes' Cover Flow view (mupibox.themeStage) and reading the name aloud when it stops
   * (mupibox.themeStageAutoRead). The display takes them over right away (same signal as after a theme change).
   */
  router.post('/theme-stage', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { stage?: unknown; autoRead?: unknown } | undefined) ?? {}
    if ((body.stage !== undefined && typeof body.stage !== 'boolean') || (body.autoRead !== undefined && typeof body.autoRead !== 'boolean')) {
      res.status(400).json({ error: 'stage and autoRead must be true or false' })
      return
    }
    let stage = false
    let autoRead = false
    await deps.updateMupiboxConfig((c) => {
      const m = ((c.mupibox as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      if (typeof body.stage === 'boolean') m.themeStage = body.stage
      if (typeof body.autoRead === 'boolean') m.themeStageAutoRead = body.autoRead
      stage = m.themeStage === true
      autoRead = m.themeStageAutoRead === true
      c.mupibox = m
    })
    let displayUpdated = false
    try {
      const r = await fetch('http://127.0.0.1:5005/display/reload-theme', { method: 'POST', signal: AbortSignal.timeout(3000) })
      displayUpdated = r.ok
    } catch {
      // the display takes it over on its next start
    }
    res.json({ ok: true, stage, autoRead, displayUpdated })
  })

  /**
   * POST /api/app/display/reload-theme
   * After a theme change, when the parents want to see it right away: the display swaps its
   * stylesheet on its next /local poll (2 s, 10 s on the player page). No page reload, so playback
   * and the Spotify player in the display keep running.
   */
  router.post('/display/reload-theme', requireSession, requireCsrf, async (_req, res) => {
    try {
      const r = await fetch('http://127.0.0.1:5005/display/reload-theme', {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      })
      if (!r.ok) {
        res.status(502).json({ error: `player answered ${r.status}` })
        return
      }
      res.json({ ok: true })
    } catch (err) {
      res.status(502).json({ error: `player unreachable: ${(err as Error).message}` })
    }
  })

  /**
   * GET /api/app/theme-preview/:name  (Phase 18 Item 3)
   * Serves the theme preview PNG that AdminInterface ships under
   * /var/www/images/<name>.png. Name MUST be in the installed-themes
   * whitelist — without that check this would be a /var/www/images path
   * traversal sink. Cache-friendly so the WebApp grid doesn't refetch on
   * every render.
   */
  router.get('/theme-preview/:name', requireSession, (req, res) => {
    const cfg = deps.getMupiboxConfig()
    if (!cfg) {
      res.status(503).end()
      return
    }
    const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
    const installed = Array.isArray(mb.installedThemes)
      ? (mb.installedThemes as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const name = String(req.params.name ?? '').replace(/\.png$/, '')
    if (!installed.includes(name)) {
      res.status(404).end()
      return
    }
    // cached only when there is a picture: a cached "not found" kept a theme without preview for an hour
    const cached = { headers: { 'Cache-Control': 'public, max-age=3600' } }
    res.sendFile(`/var/www/images/${name}.png`, cached, (err) => {
      if (!err || res.headersSent) return
      // the children's themes (km) have an SVG picture of their background instead
      res.sendFile(`/var/www/images/km/${name}.svg`, cached, (err2) => {
        if (err2 && !res.headersSent) res.status(404).setHeader('Cache-Control', 'no-store').end()
      })
    })
  })

  /**
   * GET /api/app/bootscreen
   * Boot and maintenance screens (as in MuPi-Conf): the installed scenes with their text places and texts
   * (bootscreens.json), the settings (empty bootscreen = the default scene) and the languages of the display texts.
   */
  router.get('/bootscreen', requireSession, (_req, res) => {
    const screens = readBootscreens()
    if (!screens) {
      res.status(404).json({ error: 'boot screens are not installed' })
      return
    }
    const mb = (deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined) ?? {}
    const ids = bootscreenIds(screens)
    const boot = typeof mb.bootscreen === 'string' && (mb.bootscreen === 'random' || ids.includes(mb.bootscreen)) ? mb.bootscreen : ''
    const maint = typeof mb.maintenanceScreen === 'string' && ids.includes(mb.maintenanceScreen) ? mb.maintenanceScreen : 'same'
    const languages = readDisplayLanguages()
    const lang = typeof mb.bootscreenLanguage === 'string' && languages[mb.bootscreenLanguage] ? mb.bootscreenLanguage : 'en'
    res.json({
      screens,
      languages,
      current: { bootscreen: boot, maintenanceScreen: maint, boxName: typeof mb.boxName === 'string' ? mb.boxName : '', bootscreenLanguage: lang },
    })
  })

  /**
   * POST /api/app/bootscreen  {bootscreen?, maintenanceScreen?, boxName?, bootscreenLanguage?}
   * Checked as in MuPi-Conf (the default scene is stored empty, so a later change of the default reaches the box);
   * the box then puts the pictures together in the background (bootscreen_update.sh). Only the fields sent change:
   * a body without boxName used to empty the name, one without the language set it to English.
   */
  router.post('/bootscreen', requireSession, requireCsrf, async (req, res) => {
    const screens = readBootscreens()
    if (!screens) {
      res.status(404).json({ error: 'boot screens are not installed' })
      return
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const ids = bootscreenIds(screens)
    let boot = typeof body.bootscreen === 'string' ? body.bootscreen : ''
    if (boot !== 'random' && !ids.includes(boot)) boot = ''
    if (boot === screens.defaultBootscreen) boot = ''
    let maint = typeof body.maintenanceScreen === 'string' ? body.maintenanceScreen : 'same'
    if (maint !== 'same' && !ids.includes(maint)) maint = 'same'
    const maxLength = typeof screens.nameMaxLength === 'number' ? screens.nameMaxLength : 14
    // the name: no control characters, spaces at the ends removed, at most maxLength characters
    const name = Array.from(String(typeof body.boxName === 'string' ? body.boxName : '').replace(/\p{Cc}/gu, '').trim())
      .slice(0, maxLength)
      .join('')
      .trim()
    let lang = typeof body.bootscreenLanguage === 'string' ? body.bootscreenLanguage : 'en'
    if (!readDisplayLanguages()[lang]) lang = 'en'
    const has = (key: string) => body[key] !== undefined
    await deps.updateMupiboxConfig((c) => {
      const m = ((c.mupibox as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      if (has('bootscreen')) m.bootscreen = boot
      if (has('maintenanceScreen')) m.maintenanceScreen = maint
      if (has('boxName')) m.boxName = name
      if (has('bootscreenLanguage')) m.bootscreenLanguage = lang
      c.mupibox = m
    })
    const saved = (deps.getMupiboxConfig()?.mupibox ?? {}) as Record<string, unknown>
    const str = (key: string, fallback: string) => (typeof saved[key] === 'string' ? (saved[key] as string) : fallback)
    // putting the pictures together takes a few seconds (all scenes for "random"): in the background
    const child = spawn('sudo', ['/usr/local/bin/mupibox/bootscreen_update.sh'], { detached: true, stdio: 'ignore' })
    child.on('error', () => undefined)
    child.unref()
    res.json({
      ok: true,
      current: {
        bootscreen: has('bootscreen') ? boot : str('bootscreen', ''),
        maintenanceScreen: has('maintenanceScreen') ? maint : str('maintenanceScreen', 'same'),
        boxName: has('boxName') ? name : str('boxName', ''),
        bootscreenLanguage: has('bootscreenLanguage') ? lang : str('bootscreenLanguage', 'en'),
      },
    })
  })

  /**
   * GET /api/app/bootscreen-scene/:id/:kind
   * A scene picture for the preview (kind: scene | maintenance | goodbye | battery), only of an installed scene.
   */
  router.get('/bootscreen-scene/:id/:kind', requireSession, (req, res) => {
    const screens = readBootscreens()
    const kind = String(req.params.kind ?? '')
    const entry = screens?.bootscreens.find((b) => b.id === req.params.id)
    const file = entry && ['scene', 'maintenance', 'goodbye', 'battery'].includes(kind) ? entry[kind] : undefined
    if (typeof file !== 'string' || !/^screens\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/.test(file)) {
      res.status(404).end()
      return
    }
    res.sendFile(`${BOOTSCREENS_DIR}/${file}`, { headers: { 'Cache-Control': 'public, max-age=3600' } }, (err) => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })

  /**
   * POST /api/app/spotify-credentials
   * Persists the user-provided clientId (and optional clientSecret) into
   * mupiboxconfig.json.spotify. This is the wizard-step-3 endpoint that
   * was deferred in Phase 14c.
   *
   * Validation: clientId must be base64url-style alphanumeric (Spotify's
   * format), at least 16 characters. clientSecret optional — when blank
   * the box flips to PKCE-style refresh in src/spotify-sync/auth.ts.
   */
  router.post('/spotify-credentials', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { clientId?: unknown; clientSecret?: unknown }
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
    // (no clientSecret in the body: the stored one stays - the new app sends it only when one was typed)
    const keepSecret = body.clientSecret === undefined
    if (clientId.length < 16 || clientId.length > 64 || !/^[A-Za-z0-9]+$/.test(clientId)) {
      res.status(400).json({ error: 'clientId must be 16-64 alphanumeric characters' })
      return
    }
    if (clientSecret && (clientSecret.length < 16 || clientSecret.length > 64 || !/^[A-Za-z0-9]+$/.test(clientSecret))) {
      res.status(400).json({ error: 'clientSecret must be 16-64 alphanumeric characters when provided' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      spotify.clientId = clientId
      // Empty secret deliberately persisted as '' so the PKCE branch in
      // src/spotify-sync/auth.ts picks it up; don't write `undefined`,
      // because jsonfile collapses that into a missing key and existing
      // code reads via typeof === 'string'.
      if (!keepSecret) spotify.clientSecret = clientSecret
      cfg.spotify = spotify
    })
    applySpotifyAccessToPlayer(false)
    const secret = keepSecret ? deps.getMupiboxConfig()?.spotify?.clientSecret : clientSecret
    res.json({ ok: true, mode: secret ? 'classic' : 'pkce' })
  })

  /**
   * GET /api/app/spotify-access
   * What the player's Spotify access looks like, without the secrets themselves (the admin interface showed them in
   * plain text): the client id, whether a secret and tokens are stored, and "process playlists".
   */
  router.get('/spotify-access', requireSession, async (req, res) => {
    const cfg = deps.getMupiboxConfig()
    const sp = (cfg?.spotify ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const mode = redirectModeOf(cfg)
    res.json({
      // the Redirect URI of this box (the one its Spotify app has to name) and both to choose from
      redirectMode: mode,
      redirectUris: Object.fromEntries(
        (Object.keys(SPOTIFY_CALLBACK_PATHS) as (keyof typeof SPOTIFY_CALLBACK_PATHS)[]).map((m) => [m, buildRedirectUri('https', spotifyHost(req) ?? 'mupibox', m)]),
      ),
      clientId: str(sp.clientId),
      hasSecret: str(sp.clientSecret) !== '',
      connected: str(sp.accessToken) !== '' && str(sp.refreshToken) !== '',
      tokenUpdatedAt: str(sp.tokenUpdatedAt) || null,
      scopes: Array.isArray(sp.tokenScopes) ? sp.tokenScopes : [],
      processPlaylists: sp.disableScraperForPlaylists !== true,
      // since when the login holds and until when (6 months), or that Spotify refused it (see spotify-auth-age.ts)
      login: await spotifyLoginAge(cfg),
    })
  })

  /** GET /api/app/spotify-access/account - the Spotify account signed in (Premium: the display's player needs it) and
   *  whether Spotify lists the display as a device now. Asked with the player's token; {} when that is not possible. */
  router.get('/spotify-access/account', requireSession, async (_req, res) => {
    const json = (r: Response) => (r.ok ? r.json() : null)
    try {
      const token = (await (await fetch('http://127.0.0.1:5005/spotify/token', { signal: AbortSignal.timeout(3000) })).text()).trim()
      if (!token || token.startsWith('{')) {
        res.json({})
        return
      }
      const get = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }).then(json).catch(() => null)
      const [me, devices, display] = await Promise.all([
        get('https://api.spotify.com/v1/me') as Promise<{ display_name?: string; id?: string; product?: string } | null>,
        get('https://api.spotify.com/v1/me/player/devices') as Promise<{ devices?: { id?: string; name?: string }[] } | null>,
        fetch('http://127.0.0.1:5005/display/spotify-device', { signal: AbortSignal.timeout(3000) })
          .then(json)
          .catch(() => null) as Promise<{ id?: string | null } | null>,
      ])
      const mine = display?.id ? devices?.devices?.find((d) => d.id === display.id) : undefined
      res.json({
        name: me?.display_name || me?.id || '',
        premium: me?.product ? me.product === 'premium' : null,
        deviceVisible: devices ? !!mine : null,
        deviceName: mine?.name ?? '',
      })
    } catch {
      res.json({})
    }
  })

  /** POST /api/app/spotify-access/redirect {mode: app|legacy} - which Redirect URI the next login uses (the one the
   *  parents' Spotify app names). */
  router.post('/spotify-access/redirect', requireSession, requireCsrf, async (req, res) => {
    const mode = (req.body as { mode?: unknown } | undefined)?.mode
    if (mode !== 'app' && mode !== 'legacy') {
      res.status(400).json({ error: 'mode must be app or legacy' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.spotify = { ...((cfg.spotify as Record<string, unknown> | undefined) ?? {}), redirect: mode }
    })
    res.json({ ok: true })
  })

  /** POST /api/app/spotify-access/playlists {enabled} - "process playlists" (read live by the backend, no restart). */
  router.post('/spotify-access/playlists', requireSession, requireCsrf, async (req, res) => {
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be true or false' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      spotify.disableScraperForPlaylists = !enabled
      cfg.spotify = spotify
    })
    res.json({ ok: true })
  })

  /**
   * POST /api/app/spotify-access/clear-cache
   * Empties the backend's Spotify caches (album and artist data, Spotify covers, the kept home lists). Unlike the
   * admin interface (rm -r cache/*) the online covers, the NAS folder lists and the cover shapes stay: they have
   * nothing to do with Spotify, and the online covers' found and discarded lists would be lost.
   */
  router.post('/spotify-access/clear-cache', requireSession, requireCsrf, async (_req, res) => {
    res.json({ ok: await clearSpotifyCache() })
  })

  /**
   * POST /api/app/spotify-access/reset
   * As the admin interface's "Reset data": deletes the player's Spotify access (ids, tokens, device, the librespot
   * login in spotify.cachepath) and the Spotify caches; the player is restarted with the empty access.
   */
  router.post('/spotify-access/reset', requireSession, requireCsrf, async (_req, res) => {
    const cachePath = String(deps.getMupiboxConfig()?.spotify?.cachepath ?? '')
    await clearSpotifyCache()
    // (only below /home/dietpi, as the admin interface's remove_config_cache_dir)
    const real = cachePath ? await fsp.realpath(cachePath).catch(() => '') : ''
    if (real.startsWith('/home/dietpi/') && real.split('/').length >= 4) {
      await execCapture('sudo', ['find', real, '-mindepth', '1', '-delete'], 20000)
    }
    await deps.updateMupiboxConfig((cfg) => {
      const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      for (const key of ['username', 'password', 'deviceId', 'accessToken', 'refreshToken', 'clientId', 'clientSecret']) spotify[key] = ''
      spotify.tokenScopes = []
      cfg.spotify = spotify
    })
    applySpotifyAccessToPlayer(true)
    res.json({ ok: true })
  })

  /**
   * GET /api/app/bluetooth  (Phase 15d)
   * Power state + paired devices (with connected flag) + autoconnect-service
   * state. Mirrors the admin bluetooth.php read path; runs as dietpi via sudo
   * like the PHP does. Empty/off → just {powered:false}.
   */
  router.get('/bluetooth', requireSession, async (_req, res) => {
    // The chip (the Pi's Bluetooth hardware, hciuart.service: masked = switched off at the start) and the controller
    // the system has now. They differ until the restart after switching the chip.
    const chipOn = (await execCapture('systemctl', ['is-enabled', 'hciuart.service'], 5000)).stdout.trim() !== 'masked'
    const present = btControllerPresent()
    const chip = { on: chipOn, present, rebootNeeded: chipOn !== present }
    if (!present) {
      // (without a controller bluetoothctl waits for one until its time is up)
      res.json({ powered: false, devices: [], autoconnect: false, chip, controller: null })
      return
    }
    const list = await execCapture('sudo', ['-u', 'dietpi', 'bluetoothctl', 'list'], 5000)
    const ctl = /Controller\s+([0-9A-Fa-f:]{17})\s+(.*?)(\s+\[default\])?\s*$/m.exec(list.stdout)
    const controller = ctl ? { mac: ctl[1], name: ctl[2].trim() } : null
    const show = await execCapture('sudo', ['-u', 'dietpi', 'bluetoothctl', 'show'])
    const powered = /Powered:\s*yes/i.test(show.stdout)
    const devices: Array<{ mac: string; name: string; connected: boolean }> = []
    if (powered) {
      const dev = await execCapture('sudo', ['-u', 'dietpi', 'bluetoothctl', 'devices'])
      const parsed: Array<{ mac: string; name: string }> = []
      for (const line of dev.stdout.split('\n')) {
        const m = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/)
        if (m && BT_MAC_RE.test(m[1])) parsed.push({ mac: m[1], name: m[2].trim() || m[1] })
      }
      for (const d of parsed) {
        const info = await execCapture('sudo', ['-u', 'dietpi', 'bluetoothctl', 'info', d.mac])
        devices.push({ ...d, connected: /Connected:\s*yes/i.test(info.stdout) })
      }
    }
    const ac = await execCapture('systemctl', ['is-active', 'mupi_autoconnect_bt'])
    res.json({ powered, devices, autoconnect: ac.stdout.trim() === 'active', chip, controller })
  })

  /**
   * POST /api/app/bluetooth/chip  {on:boolean} - the Pi's Bluetooth hardware on or off (set_bluetooth_chip.sh,
   * as the admin interface): for a steadier onboard WiFi (it shares its radio with Bluetooth), a little less power, or
   * the serial port the chip holds. Takes effect after a restart. The radio (/bluetooth/power) is the switch for every
   * day.
   */
  router.post('/bluetooth/chip', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on === true
    const r = await execCapture('sudo', ['/usr/local/bin/mupibox/set_bluetooth_chip.sh', on ? 'on' : 'off'], 30000)
    res.json({ ok: r.ok, rebootNeeded: on !== btControllerPresent() })
  })

  // (no Bluetooth controller: bluetoothctl and the scripts built on it would wait for one until their time is up)
  const noController: import('express').RequestHandler = (_req, res, next) => {
    if (btControllerPresent()) return next()
    res.status(409).json({ error: 'no bluetooth controller' })
  }

  /** POST /api/app/bluetooth/power  — {on:boolean} → start_bt.sh|stop_bt.sh. */
  router.post('/bluetooth/power', requireSession, requireCsrf, noController, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on === true
    const script = on ? 'start_bt.sh' : 'stop_bt.sh'
    const r = await execCapture('sudo', ['-u', 'dietpi', `/usr/local/bin/mupibox/${script}`], 15000)
    res.json({ ok: r.ok })
  })

  /** POST /api/app/bluetooth/scan  — runs scan_bt.sh, returns discovered
   *  devices parsed from /tmp/bt_scan (tab-sep; col[1]=MAC, col[2]=name). */
  router.post('/bluetooth/scan', requireSession, requireCsrf, noController, async (_req, res) => {
    await execCapture('sudo', ['-u', 'dietpi', '/usr/local/bin/mupibox/scan_bt.sh'], 30000)
    const found: Array<{ mac: string; name: string }> = []
    try {
      const raw = readFileSync('/tmp/bt_scan', 'utf8')
      for (const line of raw.split('\n')) {
        const cols = line.split('\t')
        const mac = (cols[1] ?? '').trim()
        if (BT_MAC_RE.test(mac)) found.push({ mac, name: (cols[2] ?? '').trim() || mac })
      }
    } catch {
      /* no scan file — return empty */
    }
    res.json({ ok: true, found })
  })

  /** POST /api/app/bluetooth/pair  — {mac} → pair_bt.sh. */
  router.post('/bluetooth/pair', requireSession, requireCsrf, noController, async (req, res) => {
    const mac = String((req.body as { mac?: unknown } | undefined)?.mac ?? '').trim()
    if (!BT_MAC_RE.test(mac)) {
      res.status(400).json({ error: 'invalid MAC' })
      return
    }
    const r = await execCapture('sudo', ['-u', 'dietpi', '/usr/local/bin/mupibox/pair_bt.sh', mac], 30000)
    res.json({ ok: r.ok })
  })

  /** POST /api/app/bluetooth/connect|disconnect  — {mac}: a paired device connected or let go (bluetoothctl, as the
   *  admin interface's buttons). ok: bluetoothctl said so ("Connection successful", "Successful disconnected"). */
  for (const [path, cmd, done] of [
    ['connect', 'connect', /Connection successful/i],
    ['disconnect', 'disconnect', /Successful disconnected/i],
  ] as const) {
    router.post(`/bluetooth/${path}`, requireSession, requireCsrf, noController, async (req, res) => {
      const mac = String((req.body as { mac?: unknown } | undefined)?.mac ?? '').trim()
      if (!BT_MAC_RE.test(mac)) {
        res.status(400).json({ error: 'invalid MAC' })
        return
      }
      const r = await execCapture('sudo', ['-u', 'dietpi', 'bluetoothctl', cmd, mac], 20000)
      res.json({ ok: done.test(r.stdout) })
    })
  }

  /** POST /api/app/bluetooth/remove  — {mac} → remove_bt.sh + bt restart. */
  router.post('/bluetooth/remove', requireSession, requireCsrf, noController, async (req, res) => {
    const mac = String((req.body as { mac?: unknown } | undefined)?.mac ?? '').trim()
    if (!BT_MAC_RE.test(mac)) {
      res.status(400).json({ error: 'invalid MAC' })
      return
    }
    const r = await execCapture('sudo', ['-u', 'dietpi', '/usr/local/bin/mupibox/remove_bt.sh', mac], 15000)
    await execCapture('sudo', ['-u', 'dietpi', '/usr/local/bin/mupibox/stop_bt.sh'], 15000)
    await execCapture('sudo', ['-u', 'dietpi', '/usr/local/bin/mupibox/start_bt.sh'], 15000)
    // (a device the controller did not let go is an error the app shows, not "removed")
    res.status(r.ok ? 200 : 500).json({ ok: r.ok })
  })

  /** POST /api/app/bluetooth/autoconnect  — {enable:boolean}. */
  router.post('/bluetooth/autoconnect', requireSession, requireCsrf, async (req, res) => {
    const enable = (req.body as { enable?: unknown } | undefined)?.enable === true
    if (enable) {
      await execCapture('sudo', ['systemctl', 'enable', 'mupi_autoconnect_bt'])
      await execCapture('sudo', ['systemctl', 'start', 'mupi_autoconnect_bt'])
    } else {
      await execCapture('sudo', ['systemctl', 'stop', 'mupi_autoconnect_bt'])
      await execCapture('sudo', ['systemctl', 'disable', 'mupi_autoconnect_bt'])
    }
    res.json({ ok: true })
  })

  /**
   * GET /api/app/telegram-config  (Phase 15f)
   * Returns the Telegram bot config for editing — but NOT the raw token
   * (write-only secret); only whether one is configured. chatId list is
   * normalised to {id,label} objects.
   */
  router.get('/telegram-config', requireSession, (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const tg = (cfg?.telegram as Record<string, unknown> | undefined) ?? {}
    const rawChats = Array.isArray(tg.chatId) ? (tg.chatId as unknown[]) : []
    const chatIds = rawChats
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({ id: String(c.id ?? ''), label: String(c.label ?? '') }))
      .filter((c) => c.id)
    res.json({
      active: tg.active === true,
      notifyPlayback: tg.notifyPlayback === true,
      weeklySummary: weeklySummaryOn(cfg),
      token_configured: typeof tg.token === 'string' && tg.token.length > 0,
      chatIds,
    })
  })

  /**
   * POST /api/app/telegram-config  (Phase 15f)
   * Update active flag, chatId whitelist, and optionally the bot token
   * (only when a non-empty value is sent — blank keeps the existing one).
   * telegram_receiver.py reads the config only at startup, so the service
   * is restarted afterwards to apply changes immediately.
   */
  router.post('/telegram-config', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { active?: unknown; notifyPlayback?: unknown; weeklySummary?: unknown; token?: unknown; chatIds?: unknown }
    let validatedChats: Array<{ id: string; label: string }> | undefined
    if (body.chatIds !== undefined) {
      if (!Array.isArray(body.chatIds)) {
        res.status(400).json({ error: 'chatIds must be an array' })
        return
      }
      validatedChats = []
      for (const c of body.chatIds) {
        if (!c || typeof c !== 'object') {
          res.status(400).json({ error: 'each chatId must be an object {id,label}' })
          return
        }
        const id = String((c as Record<string, unknown>).id ?? '').trim()
        const label = String((c as Record<string, unknown>).label ?? '').trim()
        // Telegram chat IDs are integers; groups/channels are negative (-100…).
        if (!/^-?\d{1,20}$/.test(id)) {
          res.status(400).json({ error: 'invalid_chat_id', id })
          return
        }
        validatedChats.push({ id, label: label.slice(0, 60) })
      }
    }
    let newToken: string | undefined
    if (typeof body.token === 'string' && body.token.trim().length > 0) {
      const t = body.token.trim()
      if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(t)) {
        res.status(400).json({ error: 'invalid_token' })
        return
      }
      newToken = t
    }
    // Switched on without a token or anyone allowed, the bot cannot run: systemd would start it again and again (as
    // smart.php refused it). What the config will hold after this request counts.
    const stored = (deps.getMupiboxConfig()?.telegram as Record<string, unknown> | undefined) ?? {}
    const willBeActive = typeof body.active === 'boolean' ? body.active : stored.active === true
    if (willBeActive) {
      const token = newToken ?? (typeof stored.token === 'string' ? stored.token.trim() : '')
      const chats = validatedChats ?? (Array.isArray(stored.chatId) ? stored.chatId : typeof stored.chatId === 'string' && stored.chatId.trim() ? [stored.chatId] : [])
      if (!token) {
        res.status(400).json({ error: 'token_missing' })
        return
      }
      if (chats.length === 0) {
        res.status(400).json({ error: 'chat_missing' })
        return
      }
    }
    await deps.updateMupiboxConfig((cfg) => {
      const tg = ((cfg.telegram as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      if (typeof body.active === 'boolean') tg.active = body.active
      // playback messages (every start, track, pause, stop): off unless the parents turn them on
      if (typeof body.notifyPlayback === 'boolean') tg.notifyPlayback = body.notifyPlayback
      // the week in a message on Sunday evening (weekly-summary.ts): on unless switched off
      if (typeof body.weeklySummary === 'boolean') tg.weeklySummary = body.weeklySummary
      if (validatedChats !== undefined) tg.chatId = validatedChats
      if (newToken !== undefined) tg.token = newToken
      cfg.telegram = tg
    })
    // Apply immediately — fire-and-forget; the HTTP response shouldn't block
    // on systemd. NOPASSWD sudo is configured for the box user.
    // Switching on / off also enables / disables the service, as the admin interface does: with only a restart, a bot
    // the admin interface had disabled ran now, but no longer after the next start of the box.
    const tgActive = (deps.getMupiboxConfig()?.telegram as Record<string, unknown> | undefined)?.active === true
    const tgScript = tgActive ? 'systemctl enable mupi_telegram && systemctl restart mupi_telegram' : 'systemctl stop mupi_telegram; systemctl disable mupi_telegram'
    execFile('sudo', ['sh', '-c', tgScript], { timeout: 20000 }, (err) => {
      if (err) console.warn(`${new Date().toLocaleString()}: [eltern] mupi_telegram ${tgActive ? 'start' : 'stop'} failed: ${err.message}`)
    })
    res.json({ ok: true })
  })

  /**
   * GET /api/app/system
   * Read-only box system overview (Phase 15g): hostname, uptime, CPU load +
   * count + temperature, RAM, root-disk usage. Uses Node built-ins only
   * (os + fs.statfs + the thermal sysfs node) — no shell-out. Reboot/Shutdown
   * actions reuse the existing /api/reboot|/api/shutdown endpoints.
   */
  router.get('/system', requireSession, async (_req, res) => {
    let cpuTempC: number | null = null
    try {
      const milli = Number.parseInt(readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim(), 10)
      if (Number.isFinite(milli)) cpuTempC = Math.round(milli / 100) / 10
    } catch {
      /* no thermal node — leave null */
    }
    let disk: { total: number; free: number } | null = null
    try {
      const st = await fsp.statfs('/')
      disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }
    } catch {
      /* statfs unavailable — leave null */
    }
    res.json({
      hostname: os.hostname(),
      uptime_seconds: Math.floor(os.uptime()),
      load_1: Math.round(os.loadavg()[0] * 100) / 100,
      cpu_count: os.cpus().length,
      mem_total: os.totalmem(),
      mem_free: os.freemem(),
      cpu_temp_c: cpuTempC,
      disk,
    })
  })

  /**
   * POST /api/app/library/add-album  (Phase 17b)
   * Pin a single Spotify album (from the WebApp search) into the Smart-Sync
   * config (spotify_sync.explicit_albums). The next sync resolves it into the
   * library as source='spotify-sync'. Idempotent — re-adding the same id is a
   * no-op. The WebApp triggers a sync afterwards so it lands promptly.
   */
  router.post('/library/add-album', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { albumId?: unknown; category?: unknown; name?: unknown } | undefined) ?? {}
    const albumId = String(body.albumId ?? '').trim()
    if (!/^[A-Za-z0-9]{22}$/.test(albumId)) {
      res.status(400).json({ error: 'invalid albumId (expected 22-char Spotify id)' })
      return
    }
    const allowed = ['audiobook', 'music', 'other']
    const catRaw = String(body.category ?? '').trim()
    const category = allowed.includes(catRaw) ? catRaw : undefined
    const name = String(body.name ?? '').trim().slice(0, 120)
    await deps.updateMupiboxConfig((cfg) => {
      const ss = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      const list = Array.isArray(ss.explicit_albums) ? (ss.explicit_albums as Array<Record<string, unknown>>) : []
      if (!list.some((a) => a?.id === albumId)) {
        const entry: Record<string, unknown> = { id: albumId }
        if (name) entry.name = name
        if (category) entry.category = category
        list.push(entry)
      }
      ss.explicit_albums = list
      cfg.spotify_sync = ss
    })
    res.json({ ok: true })
  })

  /**
   * POST /api/app/library/subscribe-artist  (Phase 17c/17d)
   * Upsert a whole-artist subscription: all of the artist's albums get synced,
   * optionally narrowed to [range_from..range_to] (1-indexed by release date).
   * Re-subscribing the same id replaces the prior settings (so clearing the
   * range = re-subscribe without it).
   */
  router.post('/library/subscribe-artist', requireSession, requireCsrf, async (req, res) => {
    const body =
      (req.body as
        | { artistId?: unknown; name?: unknown; category?: unknown; range_from?: unknown; range_to?: unknown }
        | undefined) ?? {}
    const artistId = String(body.artistId ?? '').trim()
    if (!/^[A-Za-z0-9]{22}$/.test(artistId)) {
      res.status(400).json({ error: 'invalid artistId (expected 22-char Spotify id)' })
      return
    }
    const name = String(body.name ?? '').trim().slice(0, 80)
    const allowed = ['audiobook', 'music', 'other']
    const catRaw = String(body.category ?? '').trim()
    const category = allowed.includes(catRaw) ? catRaw : undefined
    const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined)
    const rangeFrom = toNum(body.range_from)
    const rangeTo = toNum(body.range_to)
    await deps.updateMupiboxConfig((cfg) => {
      const ss = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      const list = Array.isArray(ss.artists) ? (ss.artists as Array<Record<string, unknown>>) : []
      const existing = list.find((a) => a?.id === artistId)
      // A range edit must not wipe per-album exclusions (Phase 17e).
      const preservedExclude = Array.isArray(existing?.exclude_album_ids)
        ? (existing!.exclude_album_ids as unknown[]).filter((x): x is string => typeof x === 'string')
        : []
      const entry: Record<string, unknown> = { id: artistId }
      if (name) entry.name = name
      if (category) entry.category = category
      if (rangeFrom !== undefined) entry.range_from = rangeFrom
      if (rangeTo !== undefined) entry.range_to = rangeTo
      if (preservedExclude.length) entry.exclude_album_ids = preservedExclude
      if (existing) {
        for (const k of Object.keys(existing)) if (k !== 'id') delete existing[k]
        Object.assign(existing, entry)
      } else {
        list.push(entry)
      }
      ss.artists = list
      cfg.spotify_sync = ss
    })
    res.json({ ok: true })
  })

  /** GET /api/app/library/subscriptions  (Phase 17d) — current artist subs
   *  + explicit albums, for the management list. */
  router.get('/library/subscriptions', requireSession, (_req, res) => {
    const ss = (deps.getMupiboxConfig()?.spotify_sync as Record<string, unknown> | undefined) ?? {}
    res.json({
      artists: Array.isArray(ss.artists) ? ss.artists : [],
      explicit_albums: Array.isArray(ss.explicit_albums) ? ss.explicit_albums : [],
    })
  })

  /** POST /api/app/library/unsubscribe-artist  {artistId}  (Phase 17d).
   *  The artist's albums become orphans and the next sync removes them. */
  router.post('/library/unsubscribe-artist', requireSession, requireCsrf, async (req, res) => {
    const artistId = String((req.body as { artistId?: unknown } | undefined)?.artistId ?? '').trim()
    if (!artistId) {
      res.status(400).json({ error: 'artistId required' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const ss = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      ss.artists = (Array.isArray(ss.artists) ? (ss.artists as Array<Record<string, unknown>>) : []).filter(
        (a) => a?.id !== artistId,
      )
      cfg.spotify_sync = ss
    })
    res.json({ ok: true })
  })

  /** POST /api/app/library/remove-album  {albumId}  (Phase 17d). */
  router.post('/library/remove-album', requireSession, requireCsrf, async (req, res) => {
    const albumId = String((req.body as { albumId?: unknown } | undefined)?.albumId ?? '').trim()
    if (!albumId) {
      res.status(400).json({ error: 'albumId required' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const ss = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      ss.explicit_albums = (
        Array.isArray(ss.explicit_albums) ? (ss.explicit_albums as Array<Record<string, unknown>>) : []
      ).filter((a) => a?.id !== albumId)
      cfg.spotify_sync = ss
    })
    res.json({ ok: true })
  })

  /**
   * POST /api/app/library/artist-exclude  {artistId, albumId, excluded}
   * (Phase 17e) Toggle a single album of a subscribed artist on/off the
   * subscription's exclude list. Excluded albums are skipped on the next sync
   * (and removed as orphans). Re-including (excluded:false) drops it from the
   * list so the sync re-adds it. No-op if the artist isn't subscribed.
   */
  router.post('/library/artist-exclude', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { artistId?: unknown; albumId?: unknown; excluded?: unknown } | undefined) ?? {}
    const artistId = String(body.artistId ?? '').trim()
    const albumId = String(body.albumId ?? '').trim()
    if (!/^[A-Za-z0-9]{22}$/.test(artistId) || !/^[A-Za-z0-9]{22}$/.test(albumId)) {
      res.status(400).json({ error: 'invalid artistId/albumId (expected 22-char Spotify ids)' })
      return
    }
    const excluded = body.excluded === true || body.excluded === 'true'
    const cur = (deps.getMupiboxConfig()?.spotify_sync as Record<string, unknown> | undefined) ?? {}
    const curArtists = Array.isArray(cur.artists) ? (cur.artists as Array<Record<string, unknown>>) : []
    if (!curArtists.some((a) => a?.id === artistId)) {
      res.status(404).json({ error: 'artist not subscribed' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const ss = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      const list = Array.isArray(ss.artists) ? (ss.artists as Array<Record<string, unknown>>) : []
      const sub = list.find((a) => a?.id === artistId)
      if (!sub) return
      const ex = new Set(
        Array.isArray(sub.exclude_album_ids)
          ? (sub.exclude_album_ids as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
      )
      if (excluded) ex.add(albumId)
      else ex.delete(albumId)
      if (ex.size) sub.exclude_album_ids = [...ex]
      else delete sub.exclude_album_ids
      ss.artists = list
      cfg.spotify_sync = ss
    })
    res.json({ ok: true })
  })

  return router
}

/**
 * Creates the /app landing-page route — separate from the API router
 * because it handles the magic-link query param and either issues a
 * session cookie + redirect or serves the app.
 *
 * Returns a one-off RequestHandler intended for server.ts to register.
 */
export function buildElternLandingHandler(): import('express').RequestHandler {
  return (req, res, next) => {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (!token) {
      // No token — let the static-file handler serve index.html for the
      // WebApp shell. Browser-side code does its own session check via
      // GET /api/app/session.
      next()
      return
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? ''
    const session = redeemMagicLink(token, ip, describeDevice(req.headers['user-agent']))
    if (!session) {
      res.status(401).send('Magic link invalid or expired / Magic-Link ungültig oder abgelaufen')
      return
    }
    // Set cookie, strip the token from URL by redirecting to the app
    res.setHeader('Set-Cookie', buildSessionCookie(session.sessionId, 24 * 60 * 60))
    res.redirect('/app')
  }
}
