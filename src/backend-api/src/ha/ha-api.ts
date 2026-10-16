/**
 * The Home Assistant API v1 of the box ("Classic"), after splitti's contract
 * (MuPiBox-homeassistant/docs/classic-api-contract.md, 1.0.0): its own HTTPS listener on port 8443 (as the NG), so
 * port 8200 and its guard stay as they are.
 *
 * - TLS: a key of its own that is never replaced (ha_tls.sh) - Home Assistant pins its SPKI SHA-256, which the box's
 *   display shows while pairing is open; a new certificate (new IP, renewal) keeps the pin.
 * - Discovery: _mupibox._tcp over avahi (ha_mdns.sh), only a hint - identity is /info after pairing.
 * - Pairing (contract 1.1.0 §2-3): the app (Einstellungen › Home Assistant, a signed-in parent) shows the key's
 *   fingerprint to copy into Home Assistant and opens the pairing for 60 s; /pair/start then shows a six-digit code and
 *   the requested rights on the display (never in an answer or a log); /pair/confirm with it gives one bearer token per
 *   Home Assistant, kept hashed (ha-store.ts), revocable in the app.
 * - Rights: read and control; notify (a message on the display, an announcement) and power (restart, shutdown) only
 *   when they are allowed on the display while pairing ("Alles erlauben"). admin is not offered.
 * - Every error as {success:false, error, message} with the contract's HTTP status.
 *
 * Switched on and off in the app (mupibox.homeAssistant.enabled); off, nothing listens and nothing is announced.
 */

import { execFile } from 'node:child_process'
import { createHash, createPublicKey, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import os from 'node:os'
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express'
import { headphonesPlaying } from '../audio-output'
import { displayLoginLinkShown } from '../eltern/auth'
import { compareVersions, officialVersions, parseInstalled } from '../eltern/updates'
import { announce, speechOf } from '../speech'
import { isLoopback } from '../request-guard'
import { type PlaybackCovers, playbackSnapshot } from '../playback-snapshot'
import { withVolumeLock } from '../volume-lock'
import { clientByToken, deviceId, type HaClient, HA_DIR, readClients, type Scope, SCOPES, tokenHash, updateClients } from './ha-store'

export const HA_PORT = 8443
const PLAYER = 'http://127.0.0.1:5005'
const SELF = 'http://127.0.0.1:8200'
const TLS_SCRIPT = '/usr/local/bin/mupibox/ha_tls.sh'
const MDNS_SCRIPT = '/usr/local/bin/mupibox/ha_mdns.sh'
const CA_FILE = '/etc/mupibox/tls/ca.crt'
/** granted with the code alone */
const BASIC: Scope[] = ['read', 'control']
/** granted only when allowed on the display as well */
const EXTRA: Scope[] = ['notify', 'power']
const CAPABILITIES = ['play', 'pause', 'stop', 'next', 'previous', 'set_volume', 'mute', 'unmute', 'seek', 'media_metadata', 'outputs', 'screenshot', 'update', 'message', 'speak', 'reboot', 'poweroff']
const SCREENSHOT_FILE = '/tmp/mupibox-ha-screenshot.png'
const PAIRING_WINDOW_S = 60
const PAIRING_TTL_S = 300
const MAX_FAILS = 5
const COOLDOWN_S = 60

export interface HaDeps {
  getMupiboxConfig: () => Record<string, unknown> | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void | false) => Promise<void>
  covers: PlaybackCovers
  /** the resume list the display shows ("Zuletzt gehört": active_resume.json) - what a "play" with nothing loaded goes on with */
  resumeFile?: string
  /** monitor.json: whether the display is on ({"monitor": "On" | "Off"}) - for the operating state in /state */
  monitorFile?: string
}

const log = (msg: string) => console.log(`${new Date().toLocaleString()}: [ha-api] ${msg}`)
const warn = (msg: string) => console.warn(`${new Date().toLocaleString()}: [ha-api] ${msg}`)

function run(cmd: string, args: string[], timeout = 30000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }))
  })
}

const enabledIn = (deps: HaDeps) => ((deps.getMupiboxConfig()?.homeAssistant as { enabled?: unknown } | undefined)?.enabled ?? false) === true

// ---- errors (contract §6) -------------------------------------------------------------------------------------------

function fail(res: Response, status: number, error: string, message: string, headers: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.status(status).json({ success: false, error, message })
}

// ---- TLS identity ---------------------------------------------------------------------------------------------------

let server: HttpsServer | null = null
let fingerprint = ''
let tlsTimer: NodeJS.Timeout | null = null

/** SHA-256 of the leaf key's DER SubjectPublicKeyInfo, lowercase hex (what Home Assistant pins) */
function spkiSha256(certPem: string): string {
  const der = createPublicKey(certPem).export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

async function loadTls(): Promise<{ key: string; cert: string } | null> {
  const made = await run('sudo', [TLS_SCRIPT], 60000)
  if (!made.ok) warn(`ha_tls.sh: ${made.stderr.trim() || 'failed'}`)
  try {
    const [key, cert] = await Promise.all([fsp.readFile(`${HA_DIR}/tls.key`, 'utf8'), fsp.readFile(`${HA_DIR}/tls.crt`, 'utf8')])
    fingerprint = spkiSha256(cert)
    return { key, cert }
  } catch (err) {
    warn(`no TLS identity: ${(err as Error).message}`)
    return null
  }
}

/** The fingerprint grouped for reading on the display: "45c7 a08f d909 ..." */
export const groupedFingerprint = () => fingerprint.replace(/(.{4})(?=.)/g, '$1 ')

// ---- pairing (contract §3) ------------------------------------------------------------------------------------------

interface Pending {
  pairing_id: string
  client_id: string
  client_name: string
  requested: Scope[]
  granted: Scope[]
  /** notify/power asked for: allowed or not on the display before the code is shown */
  extra: Scope[]
  decided: boolean
  code: string
  expiresAt: number
  fails: number
}

let windowUntil = 0
let pending: Pending | null = null
let cooldownUntil = 0
// (rate limits: starts per box, confirm attempts per address and in all)
const hits = new Map<string, number[]>()
function limited(key: string, max: number, perMs: number): number {
  const now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => now - t < perMs)
  if (list.length >= max) {
    hits.set(key, list)
    return Math.ceil((perMs - (now - list[0])) / 1000)
  }
  list.push(now)
  hits.set(key, list)
  return 0
}

function pendingAlive(): Pending | null {
  if (pending && Date.now() > pending.expiresAt) pending = null
  return pending
}

/** What the box's display shows (GET /api/ha-pairing, loopback only) */
/** A message Home Assistant sent for the display (POST /message), while it is to be shown */
export function messageForDisplay(): { title: string; text: string; expires_in: number } | null {
  if (!message || Date.now() > message.until) {
    message = null
    return null
  }
  return { title: message.title, text: message.text, expires_in: Math.ceil((message.until - Date.now()) / 1000) }
}

export function pairingForDisplay(): Record<string, unknown> {
  const p = pendingAlive()
  const now = Date.now()
  if (p && !p.decided) {
    // (first the rights beyond showing and controlling: allowed or not - the code comes after that)
    return {
      active: true,
      stage: 'approve',
      client_name: p.client_name,
      scopes: p.granted,
      extra: p.extra,
      expires_in: Math.max(0, Math.round((p.expiresAt - now) / 1000)),
      fingerprint: groupedFingerprint(),
    }
  }
  if (p) {
    return {
      active: true,
      stage: 'code',
      code: p.code,
      client_name: p.client_name,
      scopes: p.granted,
      expires_in: Math.max(0, Math.round((p.expiresAt - now) / 1000)),
      fingerprint: groupedFingerprint(),
    }
  }
  if (windowUntil > now) return { active: true, stage: 'waiting', expires_in: Math.round((windowUntil - now) / 1000), fingerprint: groupedFingerprint() }
  return { active: false }
}

const UUIDISH = /^[A-Za-z0-9._:-]{8,100}$/

// ---- the API app (port 8443) ----------------------------------------------------------------------------------------

function bearer(req: Request): string {
  const h = String(req.headers.authorization ?? '')
  return /^Bearer [A-Za-z0-9._~+/=-]{20,200}$/.test(h) ? h.slice(7) : ''
}

function requireScope(scope: Scope): RequestHandler {
  return (req, res, next) => {
    clientByToken(bearer(req))
      .then((client) => {
        if (!client) return fail(res, 401, 'unauthorized', 'Missing, invalid or revoked token')
        if (!client.scopes.includes(scope)) return fail(res, 403, 'insufficient_scope', `This needs the right "${scope}"`)
        ;(req as Request & { haClient?: HaClient }).haClient = client
        next()
      })
      .catch(() => fail(res, 500, 'internal_error', 'Token check failed'))
  }
}

async function wifiSignalDbm(): Promise<number | null> {
  // /proc/net/wireless: "wlan0: 0000   58.  -52.  -256 ..." (level in dBm)
  try {
    const text = await fsp.readFile('/proc/net/wireless', 'utf8')
    const m = /^\s*\w+:\s+\S+\s+\S+\s+(-?\d+)\./m.exec(text)
    const v = m ? Number(m[1]) : Number.NaN
    // (the driver now and then reports nonsense such as -246: only what a WiFi signal can be)
    return Number.isFinite(v) && v >= -120 && v < 0 ? v : null
  } catch {
    return null
  }
}

function ipAddress(): string | null {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (!/^(wlan|eth|en|wl)/.test(name)) continue
    const v4 = (list ?? []).find((a) => a.family === 'IPv4' && !a.internal)
    if (v4) return v4.address
  }
  return null
}

// The MuPiHAT's own values for the contract's optional device fields (1.1: integration 0.5.0 shows them): only
// with a MuPiHAT, and only what it measured - absent, never 0
type HatValues = { external_power: boolean; battery_voltage_mv?: number; battery_current_ma?: number; mupihat_temperature_c?: number }

async function battery(deps: HaDeps): Promise<{ percent: number | null; charging: boolean | null; hat: HatValues | null }> {
  const hat = deps.getMupiboxConfig()?.mupihat as { hat_active?: unknown } | undefined
  if (hat?.hat_active !== true) return { percent: null, charging: null, hat: null }
  try {
    const j = JSON.parse(await fsp.readFile('/tmp/mupihat.json', 'utf8')) as {
      Bat_Percent?: unknown
      Charger_Status?: unknown
      Charge_Phase?: unknown
      IBus?: unknown
      Vbus?: unknown
      Vbat?: unknown
      Ibat?: unknown
      Temp?: unknown
      BatteryConnected?: unknown
      Measurement_Valid?: unknown
    }
    // (a charger that was reset and is not set up again: its values are those of before the reset - none sent)
    if (j.Measurement_Valid === false) return { percent: null, charging: null, hat: null }
    const pct = Number(j.Bat_Percent)
    // charging = on the charger, as the display shows it (its bolt: current flows in at the USB input) - the charger's
    // status said "not charging" once the battery was full ("Charge Termination Done") while the box hung on the
    // power supply. Only without the input current reported the status text decides.
    const ibus = Number(j.IBus)
    const status = String(j.Charger_Status ?? '').toLowerCase()
    const charging = Number.isFinite(ibus)
      ? ibus > 0
      : status
        ? /charge|cc|cv|taper|top-off/.test(status) && !/not charging|done|termination/.test(status)
        : null
    // external power: voltage at the USB input (the charger reports some 5 V there while a power supply is in; IBus
    // alone is 0 when the box takes nothing over it). Battery current from the charger: + charging, - discharging.
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    const vbus = num(j.Vbus)
    const values: HatValues = { external_power: vbus !== undefined ? vbus >= 4000 : Number.isFinite(ibus) && ibus > 0 }
    if (Number(j.BatteryConnected) !== 0) {
      const vbat = num(j.Vbat)
      const ibat = num(j.Ibat)
      if (vbat !== undefined && vbat > 0) values.battery_voltage_mv = Math.round(vbat)
      if (ibat !== undefined) values.battery_current_ma = Math.round(ibat)
    }
    const temp = num(j.Temp)
    if (temp !== undefined && temp > -40 && temp < 150) values.mupihat_temperature_c = Math.round(temp * 10) / 10
    return { percent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct) : null, charging, hat: values }
  } catch {
    return { percent: null, charging: null, hat: null }
  }
}

// The operating state (contract 1.1, optional): playing, in_use (something loaded, paused), display_off, idle. The
// Classic has no standby of its own - and nothing is sent when the display's state cannot be read, or the player did
// not answer (snap null: not "nothing loaded" - it may well be playing, with the display off or on)
async function powerState(deps: HaDeps, snap: { player?: unknown; playing?: unknown } | null): Promise<string | undefined> {
  if (!snap) return undefined
  if (snap.playing) return 'playing'
  let monitor = ''
  try {
    if (deps.monitorFile) monitor = String((JSON.parse(await fsp.readFile(deps.monitorFile, 'utf8')) as { monitor?: unknown }).monitor ?? '')
  } catch {
    // unreadable: unknown
  }
  if (monitor.toLowerCase() === 'off') return 'display_off'
  if (snap.player) return 'in_use'
  return monitor.toLowerCase() === 'on' ? 'idle' : undefined
}

// Where the box's app is for the host Home Assistant reached it under ("Visit" on the device page: web_url, 1.1)
function webUrl(req: Request): string | null {
  return /^[A-Za-z0-9.-]+$/.test(req.hostname) ? `https://${req.hostname}/app/` : null
}

async function muted(): Promise<boolean | null> {
  const r = await run('/usr/bin/amixer', ['sget', 'Master'], 3000)
  if (!r.ok) return null
  if (/\[off\]/.test(r.stdout)) return true
  return /\[on\]/.test(r.stdout) ? false : null
}

// System values for Home Assistant's sensors (splitti's integration reads state.metrics: cpu_percent, temperature_c,
// ram_percent, disk_percent). A value that cannot be read is left out - the sensor is "unavailable" then, not 0.
let cpuBefore: { idle: number; total: number } | null = null
async function cpuPercent(): Promise<number | undefined> {
  try {
    const line = (await fsp.readFile('/proc/stat', 'utf8')).split('\n')[0]
    const n = line.trim().split(/\s+/).slice(1).map(Number)
    const idle = (n[3] ?? 0) + (n[4] ?? 0)
    const total = n.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
    const before = cpuBefore
    cpuBefore = { idle, total }
    // (between two polls of Home Assistant; at the first one the load since the start of the box)
    const dTotal = before ? total - before.total : total
    const dIdle = before ? idle - before.idle : idle
    return dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 1000) / 10 : undefined
  } catch {
    return undefined
  }
}

async function metrics(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const cpu = await cpuPercent()
  if (cpu !== undefined) out.cpu_percent = cpu
  try {
    const t = Number((await fsp.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8')).trim()) / 1000
    if (Number.isFinite(t) && t > -40 && t < 150) out.temperature_c = Math.round(t * 10) / 10
  } catch {
    // no sensor
  }
  try {
    const mem = await fsp.readFile('/proc/meminfo', 'utf8')
    const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(mem)?.[1] ?? Number.NaN)
    const total = kb('MemTotal')
    const avail = kb('MemAvailable')
    if (total > 0 && Number.isFinite(avail)) out.ram_percent = Math.round((1 - avail / total) * 1000) / 10
  } catch {
    // none
  }
  try {
    const st = await fsp.statfs('/')
    if (st.blocks > 0) out.disk_percent = Math.round((1 - st.bavail / st.blocks) * 1000) / 10
  } catch {
    // none
  }
  return out
}

/** The box's outputs as Home Assistant's select lists them (backend audio-output.ts, asked on port 8200 from the box) */
interface OutputTarget {
  id: string
  name: string
  subtitle: string
  selectable: boolean
  available: boolean
  active: boolean
}
async function outputTargets(): Promise<OutputTarget[]> {
  const r = await fetch(`${SELF}/api/audio-output`, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`audio-output ${r.status}`)
  const o = (await r.json()) as {
    current?: string
    devices?: Array<{ mac: string; name: string; connected: boolean; battery?: number }>
    cards?: Array<{ id: string; name: string; desc: string; kind: string }>
  }
  const current = String(o.current ?? 'box')
  const targets: OutputTarget[] = []
  const cards = o.cards ?? []
  if (cards.length < 2) targets.push({ id: 'box', name: 'Box', subtitle: 'Speaker', selectable: true, available: true, active: current === 'box' })
  for (const c of cards) {
    targets.push({ id: `card:${c.id}`, name: c.kind === 'amp' ? 'Box' : c.name, subtitle: c.desc || c.kind, selectable: true, available: true, active: current === `card:${c.id}` })
  }
  for (const d of o.devices ?? []) {
    // (a paired device that is off can be chosen: the box connects it, or says it was not found)
    targets.push({ id: d.mac, name: d.name, subtitle: d.connected ? (Number.isInteger(d.battery) ? `Bluetooth · ${d.battery} %` : 'Bluetooth') : 'Bluetooth (off)', selectable: true, available: true, active: current === d.mac })
  }
  return targets
}

function provider(player: string, source: string): string | null {
  if (!player) return null
  if (player === 'spotify') return 'spotify'
  return ({ local: 'library', nas: 'nas', rss: 'podcast', radio: 'radio' } as Record<string, string>)[source] ?? (source || 'library')
}

const volumeCap = async (deps: HaDeps): Promise<number> => {
  const mb = (deps.getMupiboxConfig()?.mupibox ?? {}) as { maxVolume?: unknown; btMaxVolume?: unknown }
  const pct = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.floor(n) : undefined
  }
  const bt = pct(mb.btMaxVolume)
  return bt !== undefined && (await headphonesPlaying().catch(() => false)) ? bt : (pct(mb.maxVolume) ?? 100)
}

async function playerCommand(path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${PLAYER}/${path}${path.includes('?') ? '&' : '?'}src=ha`, { signal: AbortSignal.timeout(8000) })
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: r.ok, status: r.status, body }
}

/**
 * The most recent entry of the resume list ("Zuletzt gehört") as the player's start address at its place - what a
 * "play" from Home Assistant goes on with when nothing is loaded (as the display's resume does it, player.service.ts
 * resumeMedia / resumeLibraryMedia / resumeNasMedia). Only what the player resumes by itself: an album on the box or
 * the NAS, Spotify; null for the rest (radio, podcasts) and for an empty list.
 */
async function lastResumeStart(deps: HaDeps): Promise<{ url: string; type: string } | null> {
  if (!deps.resumeFile) return null
  let list: unknown
  try {
    list = JSON.parse(await fsp.readFile(deps.resumeFile, 'utf8'))
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  const entries = list.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
  if (!entries.length) return null
  const m = entries.reduce((a, b) => (Number(b.lastPlayedAt ?? 0) > Number(a.lastPlayedAt ?? 0) ? b : a))
  const enc = encodeURIComponent
  const int = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d)
  const track = Math.max(1, int(m.resumelocalcurrentTracknr, 1))
  const pct = Math.max(0, Math.min(100, Math.round(Number(m.resumelocalprogressTime) || 0)))
  const type = String(m.type ?? '')
  if (type === 'library') {
    const folder =
      typeof m.libraryPath === 'string' && m.libraryPath
        ? m.libraryPath.split('/').filter(Boolean).map(enc).join(':')
        : `${enc(String(m.category ?? ''))}:${enc(String(m.artist ?? ''))}:${enc(String(m.title ?? ''))}`
    return { url: `musicsearch/library/resume/${folder}:${track}:${pct}`, type }
  }
  if (type === 'nas' && typeof m.nasPath === 'string' && m.nasPath) return { url: `musicsearch/nas/resume/${enc(m.nasPath)}:${track}:${pct}`, type }
  if (type === 'spotify') {
    const ref = m.playlistid ? `playlist:${enc(String(m.playlistid))}` : m.id ? `album:${enc(String(m.id))}` : m.showid ? `episode:${enc(String(m.showid))}` : m.audiobookid ? `show:${enc(String(m.audiobookid))}` : ''
    if (!ref) return null
    return { url: `spotify/now/spotify:${ref}:${Math.max(1, int(m.resumespotifytrack_number, 1))}:${Math.max(0, int(m.resumespotifyprogress_ms, 0))}`, type }
  }
  return null
}

// ---- phase 2: screenshot, message, quiet time, power -----------------------------------------------------------------

let lastShot = 0
let shooting: Promise<boolean> | undefined
/** a message for the display (POST /message), shown until `until` */
let message: { title: string; text: string; until: number } | null = null

function wakeDisplay(): void {
  execFile('xset', ['dpms', 'force', 'on'], { env: { ...process.env, DISPLAY: ':0' }, timeout: 5000 }, () => undefined)
  execFile('xset', ['s', 'reset'], { env: { ...process.env, DISPLAY: ':0' }, timeout: 5000 }, () => undefined)
}

/** quiet hours (or "Ruhe sofort") hold the box now: no message on the display, no announcement */
async function quietNow(): Promise<boolean> {
  try {
    const r = await fetch(`${SELF}/api/playtime`, { signal: AbortSignal.timeout(3000) })
    const st = (await r.json()) as { quiet?: { inWindow?: unknown; state?: unknown }; override?: { forceBlockUntil?: unknown } }
    return st.quiet?.inWindow === true || (typeof st.override?.forceBlockUntil === 'number' && st.override.forceBlockUntil > Date.now())
  } catch {
    return false
  }
}

/** restart or shutdown a moment after the answer (as the app's buttons: restart.sh / shutdown.sh) */
function powerAction(action: 'reboot' | 'poweroff', client?: HaClient): void {
  log(`${action} asked for by "${client?.client_name ?? '?'}"`)
  const script = action === 'reboot' ? '/usr/local/bin/mupibox/restart.sh' : '/usr/local/bin/mupibox/shutdown.sh'
  setTimeout(() => execFile('sudo', ['sh', '-c', `${script} &`], { timeout: 10000 }, () => undefined), 1500)
}

function buildApp(deps: HaDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '16kb', strict: true }))
  // (a body that is no JSON: the contract's error, not Express's HTML page)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err) return fail(res, 400, 'invalid_request', 'The body is not valid JSON')
    next()
  })
  const v1 = express.Router()

  v1.get('/health', (_req, res) => {
    res.json({ ok: true, api_version: 1 })
  })

  // (the box's CA, public: Home Assistant may verify against it after the pinned first contact, as with the NG)
  v1.get('/tls/ca', async (_req, res) => {
    try {
      res.type('application/x-pem-file').send(await fsp.readFile(CA_FILE, 'utf8'))
    } catch {
      fail(res, 404, 'not_found', 'No CA certificate')
    }
  })

  v1.get('/info', requireScope('read'), async (req, res) => {
    const mb = (deps.getMupiboxConfig()?.mupibox ?? {}) as { host?: unknown; version?: unknown; boxName?: unknown }
    const boxName = typeof mb.boxName === 'string' ? mb.boxName.trim().slice(0, 64) : ''
    res.json({
      api_version: 1,
      device_id: await deviceId(),
      // The box's name as the app shows it (its own name, e.g. a child's box); without one the host name, with
      // "MuPiBox" in front only when it is not in it already - a box called MuPiBox was "MuPiBox MuPiBox". The
      // integration (0.5.1) takes it for the device instead of "MuPiBox (<IP>)" - but not a bare "MuPiBox".
      name: boxName || ((h) => (/mupibox/i.test(h) ? h : `MuPiBox ${h}`))(String(mb.host || os.hostname())),
      web_url: webUrl(req),
      product: 'mupibox',
      generation: 'classic',
      software_version: String(mb.version ?? '') || null,
      manufacturer: 'MuPiBox',
      model: 'MuPiBox Classic',
      capabilities: CAPABILITIES,
      // (splitti's integration shows whether announcements can be made)
      tts: { enabled: speechOf(deps.getMupiboxConfig()).engine !== 'off' },
    })
  })

  v1.get('/state', requireScope('read'), async (_req, res) => {
    const [snap, bat, dbm, mute, sys] = await Promise.all([playbackSnapshot(deps.covers).catch(() => null), battery(deps), wifiSignalDbm(), muted(), metrics()])
    // (Spotify's cover as its own address - splitti's integration takes only i.scdn.co/mosaic.scdn.co; the box's own
    // pictures through /media/cover/current)
    const spotifyCover = snap?.coverUrl && /^https:\/\/(i|mosaic)\.scdn\.co\//.test(snap.coverUrl) ? snap.coverUrl : null
    const playback = snap
      ? {
          state: !snap.player ? 'idle' : snap.playing ? 'playing' : 'paused',
          provider: provider(snap.player, snap.source),
          title: snap.title || null,
          artist: snap.artist || null,
          album: snap.album || null,
          media_id: null,
          duration: snap.durationMs != null ? Math.round(snap.durationMs / 1000) : null,
          position: snap.progressMs != null ? Math.round(snap.progressMs / 1000) : null,
          cover_url: spotifyCover ?? (snap.coverUrl ? '/api/ha/v1/media/cover/current' : null),
          volume: snap.volume,
          muted: mute,
        }
      : { state: 'unavailable', provider: null, title: null, artist: null, album: null, media_id: null, duration: null, position: null, cover_url: null, volume: null, muted: mute }
    res.json({
      playback,
      device: {
        battery_percent: bat.percent,
        charging: bat.charging,
        wifi_signal_dbm: dbm,
        ip_address: ipAddress(),
        uptime_seconds: Math.round(os.uptime()),
        ...(bat.hat ?? {}),
        ...((s) => (s ? { power_state: s } : {}))(await powerState(deps, snap)),
      },
      metrics: sys,
    })
  })

  v1.get('/media/cover/current', requireScope('read'), async (_req, res) => {
    const snap = await playbackSnapshot(deps.covers).catch(() => null)
    const url = snap?.coverUrl ?? ''
    // the box's own pictures and Spotify's directly; any other address (a radio station's logo, a podcast's picture)
    // through the box's picture proxy, as the display gets it: it fetches only addresses on the internet - never the
    // box itself or the home network (checkRemoteUrl / openRemote in server.ts) - and keeps a copy
    let target = ''
    if (url.startsWith('/') && !url.startsWith('//')) target = `${SELF}${url}`
    else if (/^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//i.test(url)) target = url
    else if (/^https?:\/\/[^/?#\s]+/i.test(url) && url.length <= 2048) target = `${SELF}/api/rssfeed/image?url=${encodeURIComponent(url)}`
    if (!target) return fail(res, 404, 'not_found', 'No cover for what plays now')
    try {
      const r = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: 'error' })
      const type = r.headers.get('content-type') ?? ''
      if (!r.ok || !/^image\//.test(type)) return fail(res, 404, 'not_found', 'No cover for what plays now')
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length > 8 * 1024 * 1024) return fail(res, 404, 'not_found', 'The cover is too large')
      res.type(type).send(bytes)
    } catch {
      fail(res, 503, 'temporarily_unavailable', 'The cover could not be fetched')
    }
  })

  /** GET /outputs (read) - where the box can play: its speaker (or its sound cards) and the paired Bluetooth devices */
  v1.get('/outputs', requireScope('read'), async (_req, res) => {
    try {
      res.json({ targets: await outputTargets() })
    } catch {
      fail(res, 503, 'temporarily_unavailable', 'The outputs could not be read')
    }
  })

  /** POST /outputs/select {target_id} (control) - play there (a Bluetooth device is connected first, up to ~15 s) */
  v1.post('/outputs/select', requireScope('control'), async (req, res) => {
    const id = (req.body as { target_id?: unknown } | undefined)?.target_id
    if (typeof id !== 'string' || !id) return fail(res, 400, 'invalid_request', 'target_id is missing')
    let known: OutputTarget[]
    try {
      known = await outputTargets()
    } catch {
      return fail(res, 503, 'temporarily_unavailable', 'The outputs could not be read')
    }
    if (!known.some((t) => t.id === id)) return fail(res, 400, 'invalid_value', 'Unknown output')
    try {
      const r = await fetch(`${SELF}/api/audio-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: id }),
        signal: AbortSignal.timeout(45000),
      })
      if (r.ok) return void res.json({ success: true })
      if (r.status === 504) return fail(res, 409, 'provider_unavailable', 'The device was not found - is it switched on?')
      if (r.status === 409) return fail(res, 409, 'provider_unavailable', 'Another switch is running')
      return fail(res, 503, 'temporarily_unavailable', `The switch answered ${r.status}`)
    } catch {
      fail(res, 503, 'temporarily_unavailable', 'The switch did not answer')
    }
  })

  /** GET /screenshot (read) - what the display shows (PNG; one picture at most every 2 s) */
  // Never while a pairing is open: the display shows the code then, and a client with read only would read it here
  // and pair itself with control - the code is meant for whoever stands at the box. Nor while the display may show a
  // parents' login link that still works (its QR code and the address as text): a client with read only would sign
  // in as a parent with it - the app, and the admin interface with it. A picture taken while either began is thrown
  // away, not kept for the next 2 s.
  const displaySecret = () => pairingForDisplay().active === true || displayLoginLinkShown()
  v1.get('/screenshot', requireScope('read'), async (_req, res) => {
    const busy = () => fail(res, 409, 'provider_unavailable', 'The display shows a code or a login link')
    if (displaySecret()) {
      lastShot = 0
      return busy()
    }
    if (Date.now() - lastShot > 2000) {
      shooting ??= run('sh', ['-c', `DISPLAY=:0 XAUTHORITY=/home/dietpi/.Xauthority scrot -o ${SCREENSHOT_FILE}`], 8000).then((r) => {
        shooting = undefined
        lastShot = r.ok && !displaySecret() ? Date.now() : 0
        if (!lastShot) fsp.rm(SCREENSHOT_FILE, { force: true }).catch(() => undefined)
        return r.ok
      })
      await shooting
    }
    if (displaySecret()) {
      lastShot = 0
      fsp.rm(SCREENSHOT_FILE, { force: true }).catch(() => undefined)
      return busy()
    }
    if (!lastShot) return fail(res, 503, 'temporarily_unavailable', 'No picture of the display')
    res.type('image/png').sendFile(SCREENSHOT_FILE, (err) => {
      if (err && !res.headersSent) fail(res, 503, 'temporarily_unavailable', 'No picture of the display')
    })
  })

  /** GET /update (read) - a newer version of the box's channel (stable, beta, dev) */
  v1.get('/update', requireScope('read'), async (_req, res) => {
    const installed = String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.version ?? '')
    const mine = parseInstalled(installed)
    const latest = await officialVersions().catch(() => null)
    if (!latest) return fail(res, 503, 'temporarily_unavailable', 'The versions could not be read (internet?)')
    const newer = latest[mine.channel]
    res.json({
      update_available: !!(newer && mine.number && compareVersions(newer.version, mine.number) > 0),
      channel: mine.channel,
      installed,
      release: newer ? { version: newer.version } : null,
    })
  })

  /** POST /message {message, title?, duration_ms?} (notify) - shown on the box's display (not in quiet hours) */
  v1.post('/message', requireScope('notify'), async (req, res) => {
    const body = (req.body ?? {}) as { message?: unknown; title?: unknown; duration_ms?: unknown }
    const text = typeof body.message === 'string' ? body.message.trim() : ''
    if (!text) return fail(res, 400, 'invalid_request', 'message is missing')
    if (text.length > 300) return fail(res, 400, 'invalid_value', 'message is longer than 300 characters')
    if (await quietNow()) return fail(res, 409, 'provider_unavailable', 'Quiet time on the box - nothing is shown')
    const ms = typeof body.duration_ms === 'number' && Number.isFinite(body.duration_ms) ? body.duration_ms : 8000
    message = { title: typeof body.title === 'string' ? body.title.trim().slice(0, 60) : '', text, until: Date.now() + Math.max(2000, Math.min(60000, ms)) }
    log(`message for the display from "${(req as Request & { haClient?: HaClient }).haClient?.client_name ?? '?'}" (${text.length} characters)`)
    wakeDisplay()
    res.json({ success: true })
  })

  /** POST /speak {text} (notify) - an announcement through the box's speech output (not in quiet hours) */
  v1.post('/speak', requireScope('notify'), async (req, res) => {
    const text = typeof (req.body as { text?: unknown } | undefined)?.text === 'string' ? String((req.body as { text: string }).text).trim() : ''
    if (!text) return fail(res, 400, 'invalid_request', 'text is missing')
    if (text.length > 300) return fail(res, 400, 'invalid_value', 'text is longer than 300 characters')
    if (speechOf(deps.getMupiboxConfig()).engine === 'off') return fail(res, 409, 'provider_unavailable', 'The speech output of the box is switched off')
    if (await quietNow()) return fail(res, 409, 'provider_unavailable', 'Quiet time on the box - nothing is said')
    // (said in the background: the announcement waits for what plays, and takes seconds)
    log(`announcement from "${(req as Request & { haClient?: HaClient }).haClient?.client_name ?? '?'}" (${text.length} characters)`)
    announce(deps.getMupiboxConfig, text).catch(() => false)
    res.status(202).json({ success: true, accepted: true })
  })

  /** POST /power {action: reboot | poweroff} (power) */
  v1.post('/power', requireScope('power'), (req, res) => {
    const action = (req.body as { action?: unknown } | undefined)?.action
    if (action !== 'reboot' && action !== 'poweroff') return fail(res, 400, 'invalid_value', 'action must be reboot or poweroff')
    powerAction(action, (req as Request & { haClient?: HaClient }).haClient)
    res.status(202).json({ success: true, accepted: true })
  })

  v1.post('/control', async (req, res) => {
    const body = (req.body ?? {}) as { command?: unknown; value?: unknown; position?: unknown }
    const command = typeof body.command === 'string' ? body.command : ''
    if (!command) return fail(res, 400, 'invalid_request', 'command is missing')
    const client = await clientByToken(bearer(req)).catch(() => null)
    if (!client) return fail(res, 401, 'unauthorized', 'Missing, invalid or revoked token')
    // (restart and shutdown only through POST /power - contract 1.1.0: never through /control)
    if (command === 'restart' || command === 'shutdown') return fail(res, 422, 'unsupported_command', 'Restart and shutdown go through POST /power')
    if (!client.scopes.includes('control')) return fail(res, 403, 'insufficient_scope', 'This needs the right "control"')
    try {
      if (['play', 'pause', 'stop', 'next', 'previous'].includes(command)) {
        // (nothing loaded: no false success - the player answered "ok" to a play with nothing to play. A "play" goes
        // on with what was listened to last, as the display's "Zuletzt gehört": a morning automation just says play)
        if (command !== 'stop' && !(await playbackSnapshot(deps.covers).catch(() => null))?.player) {
          const last = command === 'play' ? await lastResumeStart(deps) : null
          if (!last) return fail(res, 409, 'provider_unavailable', 'Nothing is loaded to play - start something on the box first')
          const r = await playerCommand(`current/${last.url}`)
          if (r.status === 423) return fail(res, 409, 'provider_unavailable', 'Playing is blocked right now (listening time or quiet hours)')
          if (!r.ok) return fail(res, 503, 'temporarily_unavailable', `The player answered ${r.status}`)
          log(`play from "${client.client_name}": goes on with the last listened (${last.type})`)
          return void res.json({ success: true })
        }
        const r = await playerCommand(command)
        if (r.status === 423) return fail(res, 409, 'provider_unavailable', 'Playing is blocked right now (listening time or quiet hours)')
        if (!r.ok) return fail(res, 503, 'temporarily_unavailable', `The player answered ${r.status}`)
        log(`${command} from "${client.client_name}"`)
        return void res.json({ success: true })
      }
      if (command === 'set_volume') {
        const v = body.value
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) return fail(res, 400, 'invalid_value', 'Volume must be an integer between 0 and 100')
        // (never above the box's maximum - the one for headphones while they play; read in the volume queue, so a
        // hearing protection saved meanwhile is not set over: volume-lock.ts)
        const r = await withVolumeLock(async () => run('/usr/bin/amixer', ['sset', 'Master', `${Math.min(v, await volumeCap(deps))}%`], 3000))
        if (!r.ok) return fail(res, 500, 'internal_error', 'The volume could not be set')
        return void res.json({ success: true })
      }
      if (command === 'mute' || command === 'unmute') {
        const r = await run('/usr/bin/amixer', ['sset', 'Master', command], 3000)
        if (!r.ok) return fail(res, 500, 'internal_error', `${command} failed`)
        return void res.json({ success: true })
      }
      if (command === 'seek') {
        const pos = body.position
        if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return fail(res, 400, 'invalid_value', 'position must be a number of seconds, 0 or more')
        const snap = await playbackSnapshot(deps.covers).catch(() => null)
        if (!snap?.player) return fail(res, 409, 'provider_unavailable', 'Nothing plays')
        let arg: number
        if (snap.player === 'spotify') arg = Math.round(pos * 1000) // (the player seeks Spotify in ms)
        else if (snap.durationMs && snap.durationMs > 0) arg = Math.max(0, Math.min(100, Math.round((pos * 1000 * 100) / snap.durationMs))) // (mplayer: in percent)
        else return fail(res, 409, 'provider_unavailable', 'This cannot be seeked (no length known)')
        const r = await playerCommand(`seekpos:${arg}`)
        if (!r.ok) return fail(res, 503, 'temporarily_unavailable', `The player answered ${r.status}`)
        return void res.json({ success: true })
      }
    } catch {
      return fail(res, 503, 'temporarily_unavailable', 'The player does not answer')
    }
    fail(res, 422, 'unsupported_command', `Unknown command "${command}"`)
  })

  v1.post('/pair/start', (req, res) => {
    const ip = req.socket.remoteAddress ?? ''
    const wait = limited('start', 10, 60000) || limited(`start:${ip}`, 5, 60000)
    if (wait) return fail(res, 429, 'rate_limited', 'Too many pairing attempts', { 'Retry-After': String(wait) })
    if (Date.now() < cooldownUntil) return fail(res, 429, 'rate_limited', 'Too many wrong codes - wait a moment', { 'Retry-After': String(Math.ceil((cooldownUntil - Date.now()) / 1000)) })
    const body = (req.body ?? {}) as { client_name?: unknown; client_id?: unknown; requested_scopes?: unknown }
    const clientId = typeof body.client_id === 'string' ? body.client_id : ''
    const clientName = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 60) : ''
    if (!UUIDISH.test(clientId) || !clientName) return fail(res, 400, 'invalid_request', 'client_id and client_name are needed')
    const requested = Array.isArray(body.requested_scopes) ? body.requested_scopes : ['read', 'control']
    if (!requested.every((s) => typeof s === 'string' && (SCOPES as string[]).includes(s))) return fail(res, 400, 'invalid_value', 'Unknown scope')
    const granted = BASIC.filter((s) => requested.includes(s))
    const extra = EXTRA.filter((s) => requested.includes(s))
    if (!granted.length) return fail(res, 400, 'invalid_value', 'None of the requested scopes can be granted')
    if (pendingAlive()) return fail(res, 409, 'pairing_in_progress', 'Another pairing is waiting for its code')
    if (windowUntil <= Date.now()) return fail(res, 403, 'pairing_not_enabled', 'Open the pairing in the MuPiBox app first (Settings › Home Assistant)')
    windowUntil = 0
    pending = {
      pairing_id: randomUUID(),
      client_id: clientId,
      client_name: clientName,
      requested: requested as Scope[],
      granted,
      extra,
      decided: extra.length === 0,
      code: String(randomInt(0, 1000000)).padStart(6, '0'),
      expiresAt: Date.now() + PAIRING_TTL_S * 1000,
      fails: 0,
    }
    log(`pairing started by "${clientName}" (${granted.join(', ')}${extra.length ? `, asks for ${extra.join(', ')}` : ''}) - the code is on the display`)
    res.json({ pairing_id: pending.pairing_id, expires_in: PAIRING_TTL_S, code_length: 6, confirmation: 'display_code' })
  })

  v1.post('/pair/confirm', async (req, res) => {
    const ip = req.socket.remoteAddress ?? ''
    const wait = limited('confirm', 30, 60000) || limited(`confirm:${ip}`, 10, 60000)
    if (wait) return fail(res, 429, 'rate_limited', 'Too many attempts', { 'Retry-After': String(wait) })
    const body = (req.body ?? {}) as { pairing_id?: unknown; client_id?: unknown; code?: unknown }
    if (typeof body.pairing_id !== 'string' || typeof body.client_id !== 'string' || typeof body.code !== 'string') {
      return fail(res, 400, 'invalid_request', 'pairing_id, client_id and code are needed')
    }
    const p = pendingAlive()
    if (!p || p.pairing_id !== body.pairing_id) return fail(res, 410, 'pairing_expired', 'This pairing has expired or was ended')
    if (p.client_id !== body.client_id) return fail(res, 400, 'invalid_request', 'client_id is not the one of the start')
    if (!p.decided) return fail(res, 403, 'invalid_pairing_code', 'The rights are not decided on the display yet')
    // (only spaces are taken out; compared in constant time)
    const given = Buffer.from(body.code.replace(/\s+/g, ''), 'utf8')
    const want = Buffer.from(p.code, 'utf8')
    const right = given.length === want.length && timingSafeEqual(given, want)
    if (!right) {
      p.fails++
      if (p.fails >= MAX_FAILS) {
        pending = null
        cooldownUntil = Date.now() + COOLDOWN_S * 1000
        warn(`pairing of "${p.client_name}" ended after ${MAX_FAILS} wrong codes`)
        return fail(res, 410, 'pairing_expired', 'Too many wrong codes - start the pairing again')
      }
      return fail(res, 403, 'invalid_pairing_code', 'The code is not right')
    }
    pending = null
    const token = randomBytes(32).toString('base64url')
    try {
      await updateClients((list) => [
        // (pairing again replaces the earlier token of this Home Assistant)
        ...list.filter((c) => c.client_id !== p.client_id),
        { client_id: p.client_id, client_name: p.client_name, token_sha256: tokenHash(token), scopes: p.granted, paired_at: new Date().toISOString() },
      ])
    } catch (err) {
      warn(`the pairing could not be kept: ${(err as Error).message}`)
      return fail(res, 500, 'internal_error', 'The pairing could not be kept')
    }
    log(`"${p.client_name}" paired (${p.granted.join(', ')})`)
    res.json({ success: true, access_token: token, token_type: 'Bearer', scopes: p.granted, device_id: await deviceId() })
  })

  v1.post('/pair/revoke', async (req, res) => {
    const client = await clientByToken(bearer(req)).catch(() => null)
    if (!client) return fail(res, 401, 'unauthorized', 'Missing, invalid or revoked token')
    const body = (req.body ?? {}) as { client_id?: unknown }
    if (body.client_id !== client.client_id) return fail(res, 403, 'insufficient_scope', 'A client may revoke only its own token')
    await updateClients((list) => list.filter((c) => c.client_id !== client.client_id))
    log(`"${client.client_name}" revoked its pairing`)
    res.json({ success: true })
  })

  app.use('/api/ha/v1', v1)
  // The address itself in a browser - Home Assistant's "Visit" link on the device page leads here (the integration
  // takes its API address as the configuration URL): on to the box's app instead of an error
  app.get('/', (req, res, next) => {
    if (!req.accepts('html')) return next()
    const host = /^[A-Za-z0-9.-]+$/.test(req.hostname) ? req.hostname : ''
    if (!host) return next()
    res.redirect(302, `https://${host}/app/`)
  })
  app.use((_req, res) => fail(res, 404, 'not_found', 'Unknown path'))
  // (anything that throws: the contract's error, never a stack trace)
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => fail(res, 500, 'internal_error', 'Unexpected failure'))
  return app
}

// ---- starting and stopping ------------------------------------------------------------------------------------------

async function startNow(deps: HaDeps): Promise<boolean> {
  if (server) return true
  const tls = await loadTls()
  if (!tls) return false
  const id = await deviceId()
  const s = createHttpsServer({ key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2' }, buildApp(deps))
  s.headersTimeout = 20000
  s.requestTimeout = 30000
  await new Promise<void>((resolve) => {
    s.once('error', (err) => {
      warn(`port ${HA_PORT}: ${err.message}`)
      resolve()
    })
    s.listen(HA_PORT, () => resolve())
  })
  if (!s.listening) return false
  server = s
  const mdns = await run('sudo', [MDNS_SCRIPT, 'on', id, String(HA_PORT)], 15000)
  if (!mdns.ok) warn(`not announced in the network: ${mdns.stderr.trim()} - Home Assistant can still take the address by hand`)
  log(`listening on https port ${HA_PORT} (device ${id}, key ${fingerprint.slice(0, 16)}...)`)
  // a new address or the renewal: a new certificate with the same key, taken over without a restart
  tlsTimer = setInterval(
    async () => {
      const r = await run('sudo', [TLS_SCRIPT], 60000)
      if (/changed/.test(r.stdout) && server) {
        try {
          const [key, cert] = await Promise.all([fsp.readFile(`${HA_DIR}/tls.key`, 'utf8'), fsp.readFile(`${HA_DIR}/tls.crt`, 'utf8')])
          server.setSecureContext({ key, cert, minVersion: 'TLSv1.2' })
          fingerprint = spkiSha256(cert)
          log('new certificate (same key) taken over')
        } catch (err) {
          warn(`new certificate not taken over: ${(err as Error).message}`)
        }
      }
    },
    6 * 3600 * 1000,
  )
  tlsTimer.unref()
  return true
}

async function stopNow(): Promise<void> {
  if (tlsTimer) clearInterval(tlsTimer)
  tlsTimer = null
  windowUntil = 0
  pending = null
  await run('sudo', [MDNS_SCRIPT, 'off'], 15000)
  if (server) {
    const s = server
    server = null
    const closed = new Promise<void>((resolve) => s.close(() => resolve()))
    // (at once: an open connection kept close() waiting - and with it the next start, see serial)
    s.closeAllConnections?.()
    await closed
    log('stopped')
  }
}

// Start and stop one after the other: switched off while the start still made its key, stop found no server yet and
// the start went on afterwards - listening on 8443 with the switch off. A start in the queue asks the switch again.
let switching: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = switching.then(fn, fn)
  switching = next.catch(() => undefined)
  return next
}
const start = (deps: HaDeps): Promise<boolean> => serial(() => (enabledIn(deps) ? startNow(deps) : Promise.resolve(false)))
const stop = (): Promise<void> => serial(stopNow)

/** At the server's start: on when the app switched it on */
export function startHaApi(deps: HaDeps): void {
  if (enabledIn(deps)) start(deps).catch((err) => warn(`start: ${(err as Error).message}`))
}

// ---- the app (Einstellungen › Home Assistant) and the display ---------------------------------------------------------

export function registerHaAppRoutes(router: Router, deps: HaDeps, guards: { session: RequestHandler; csrf: RequestHandler }): void {
  /** GET /api/app/ha - switched on, listening, the fingerprint, the paired clients (without their tokens) */
  router.get('/ha', guards.session, async (_req, res) => {
    const clients = await readClients()
    // (the MQTT discovery for Home Assistant on as well: the box would be in Home Assistant twice)
    const mqtt = (deps.getMupiboxConfig()?.mqtt ?? {}) as { active?: unknown; ha_active?: unknown }
    res.json({
      mqtt_discovery: mqtt.active === true && mqtt.ha_active === true,
      enabled: enabledIn(deps),
      listening: !!server,
      port: HA_PORT,
      device_id: server ? await deviceId() : null,
      fingerprint: server ? groupedFingerprint() : null,
      pairing: pairingForDisplay().active === true,
      clients: clients.map((c) => ({ client_id: c.client_id, client_name: c.client_name, scopes: c.scopes, paired_at: c.paired_at })),
    })
  })

  /** POST /api/app/ha/enabled {on} - the API on or off */
  router.post('/ha/enabled', guards.session, guards.csrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') return void res.status(400).json({ error: 'invalid on' })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.homeAssistant = { ...((cfg.homeAssistant as Record<string, unknown>) ?? {}), enabled: on }
    })
    const ok = on ? await start(deps) : (await stop(), true)
    res.status(ok ? 200 : 500).json({ ok, listening: !!server })
  })

  /** POST /api/app/ha/pairing - opens the pairing for 60 s (the display shows the fingerprint, then the code) */
  router.post('/ha/pairing', guards.session, guards.csrf, (_req, res) => {
    if (!server) return void res.status(409).json({ error: 'not_listening' })
    if (pendingAlive()) return void res.status(409).json({ error: 'pairing_in_progress' })
    windowUntil = Date.now() + PAIRING_WINDOW_S * 1000
    log('pairing opened in the app for 60 s')
    // (the display may be off: on, so the fingerprint and then the code can be read)
    execFile('xset', ['dpms', 'force', 'on'], { env: { ...process.env, DISPLAY: ':0' }, timeout: 5000 }, () => undefined)
    execFile('xset', ['s', 'reset'], { env: { ...process.env, DISPLAY: ':0' }, timeout: 5000 }, () => undefined)
    res.json({ ok: true, expires_in: PAIRING_WINDOW_S, fingerprint: groupedFingerprint() })
  })

  /** DELETE /api/app/ha/pairing - ends an open or waiting pairing */
  router.delete('/ha/pairing', guards.session, guards.csrf, (_req, res) => {
    windowUntil = 0
    pending = null
    res.json({ ok: true })
  })

  /** DELETE /api/app/ha/clients/:id - a Home Assistant's pairing revoked (its token stops at once) */
  router.delete('/ha/clients/:id', guards.session, guards.csrf, async (req, res) => {
    const id = String(req.params.id)
    const before = await readClients()
    if (!before.some((c) => c.client_id === id)) return void res.status(404).json({ error: 'unknown client' })
    await updateClients((list) => list.filter((c) => c.client_id !== id))
    log(`a pairing was revoked in the app`)
    res.json({ ok: true })
  })
}

/** The display's view of the pairing (fingerprint, code, rights): the box itself only, never a phone */
export function registerHaDisplayRoute(app: Express): void {
  app.get('/api/ha-pairing', (req, res) => {
    // (isLoopback: on port 8200 from the box itself - not what lighttpd forwards from the network, see request-guard.ts)
    if (!isLoopback(req)) return void res.status(404).end()
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ...pairingForDisplay(), message: messageForDisplay() })
  })
  /** POST /api/ha-pairing/approve {all} - on the display: the extra rights (notify, power) allowed or not; then the code */
  app.post('/api/ha-pairing/approve', (req, res) => {
    if (!isLoopback(req)) return void res.status(404).end()
    const p = pendingAlive()
    if (!p || p.decided) return void res.status(409).json({ error: 'nothing to decide' })
    const all = (req.body as { all?: unknown } | undefined)?.all === true
    if (all) p.granted = [...p.granted, ...p.extra]
    p.decided = true
    log(`rights decided on the display: ${p.granted.join(', ')}`)
    res.json({ ok: true, scopes: p.granted })
  })
  /** POST /api/ha-pairing/message/close - the message closed on the display */
  app.post('/api/ha-pairing/message/close', (req, res) => {
    if (!isLoopback(req)) return void res.status(404).end()
    message = null
    res.json({ ok: true })
  })
  /** POST /api/ha-pairing/open - opens the pairing for 60 s from the box itself (a local action, as the contract allows) */
  app.post('/api/ha-pairing/open', (req, res) => {
    if (!isLoopback(req)) return void res.status(404).end()
    if (!server) return void res.status(409).json({ error: 'not_listening' })
    if (pendingAlive()) return void res.status(409).json({ error: 'pairing_in_progress' })
    windowUntil = Date.now() + PAIRING_WINDOW_S * 1000
    log('pairing opened on the box for 60 s')
    res.json({ ok: true, expires_in: PAIRING_WINDOW_S })
  })
  /** POST /api/ha-pairing/cancel - "Abbrechen" on the display: the open or waiting pairing ends */
  app.post('/api/ha-pairing/cancel', (req, res) => {
    if (!isLoopback(req)) return void res.status(404).end()
    if (windowUntil || pending) log('pairing ended on the display')
    windowUntil = 0
    pending = null
    res.json({ ok: true })
  })
  // (the API is HTTPS only: on the plain port it says so instead of a page)
  app.all(/^\/api\/ha\/v1(\/.*)?$/, (_req, res) => fail(res, 426, 'https_required', `The Home Assistant API is at https://<box>:${HA_PORT}/api/ha/v1`))
}
