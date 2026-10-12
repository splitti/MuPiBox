// Phase 14c — Eltern-WebApp auth.
// Magic-Link + Session-Cookie model. Two backing files in tmpfs so
// they don't survive reboots (deliberate — sessions die with the box):
//   /tmp/.eltern_magic_links.json  — pending single-use tokens, 15-min TTL
//   /tmp/.eltern_sessions.json     — active session cookies, 24-h TTL
// "Angemeldet bleiben" (the app on a phone's home screen): such a session is kept on the SD card instead
// (PERSISTENT_SESSIONS_PATH) and lasts PERSISTENT_TTL_MS after its last use - written when one is issued or ends,
// and at most once a day per session for its last use.
// Every session carries a stamp of the password it was issued under: a new password (in the app or the admin
// interface) ends the others.
//
// Tokens and session IDs are 32-byte cryptographically random hex
// strings. Single-use enforcement on magic links blocks replay attacks;
// session lifetime is enforced on every check via timestamp comparison.

import bcrypt from 'bcryptjs'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import * as fs from 'node:fs'
import { promisify } from 'node:util'

const scryptAsync = promisify(scryptCb)

const MAGIC_LINKS_PATH = '/tmp/.eltern_magic_links.json'
const SESSIONS_PATH = '/tmp/.eltern_sessions.json'

const PERSISTENT_SESSIONS_PATH = '/home/dietpi/.mupibox/.app_sessions.json'

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
export const PERSISTENT_TTL_MS = 90 * DAY_MS
// (the devices kept signed in: the ones used last)
const MAX_PERSISTENT_SESSIONS = 20
const TOKEN_BYTES = 32 // 64 hex chars

interface MagicLink {
  /** ISO timestamp of issuance. */
  issued: string
  /** Whether the token has already been redeemed. */
  used: boolean
  /** Optional label for audit logging (e.g. 'telegram', 'cloud-batterie-tap'). */
  source: string
}

interface Session {
  /** ISO timestamp of cookie issuance. */
  issued: string
  /** ISO timestamp of last seen — used to auto-extend on every request. */
  lastSeen: string
  /** Remote IP at issuance (audit). */
  ip: string
  /** CSRF token paired to this session (double-submit pattern). */
  csrf: string
  /** "Angemeldet bleiben": kept on the SD card, valid PERSISTENT_TTL_MS after the last use. */
  persistent?: boolean
  /** Stamp of the password at issuance (passwordStamp); missing on sessions from before. */
  pw?: string
  /** Given without a password while "Anmeldung verlangen" was off: ends once it is switched on. */
  anon?: boolean
  /** The device as its browser names itself ("iPhone · Safari"), for the list of signed-in devices. */
  device?: string
  /** How it began when not with the password: the magic link's source ('telegram', 'settings-qr'). */
  via?: string
}

type MagicLinkMap = Record<string, MagicLink>
type SessionMap = Record<string, Session>

// In-memory copy so we don't hit tmpfs on every middleware call. Loaded
// lazily on first access; the file is the source of truth on cold start.
let magicLinksCache: MagicLinkMap | null = null
let sessionsCache: SessionMap | null = null

function readMap<T>(path: string): T {
  try {
    if (!fs.existsSync(path)) return {} as T
    const raw = fs.readFileSync(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}

function writeMap<T>(path: string, map: T): void {
  const tmp = `${path}.tmp.${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(map), 'utf8')
  fs.renameSync(tmp, path)
}

function loadMagicLinks(): MagicLinkMap {
  if (magicLinksCache === null) magicLinksCache = readMap<MagicLinkMap>(MAGIC_LINKS_PATH)
  return magicLinksCache
}

function loadSessions(): SessionMap {
  if (sessionsCache === null) {
    const kept = readMap<SessionMap>(PERSISTENT_SESSIONS_PATH)
    for (const entry of Object.values(kept)) if (entry && typeof entry === 'object') entry.persistent = true
    persistentJson = persistentPart(kept)
    sessionsCache = { ...readMap<SessionMap>(SESSIONS_PATH), ...kept }
  }
  return sessionsCache
}

function saveMagicLinks(): void {
  if (magicLinksCache) writeMap(MAGIC_LINKS_PATH, magicLinksCache)
}

// What the file of the kept sessions holds: their last use by the day only, so a request changes it once a day at most
let persistentJson = ''
function persistentPart(sessions: SessionMap): string {
  const kept: SessionMap = {}
  for (const [id, entry] of Object.entries(sessions)) {
    if (entry.persistent) kept[id] = { ...entry, lastSeen: entry.lastSeen.slice(0, 10) }
  }
  return JSON.stringify(kept)
}

function saveSessions(): void {
  if (!sessionsCache) return
  const temporary: SessionMap = {}
  for (const [id, entry] of Object.entries(sessionsCache)) if (!entry.persistent) temporary[id] = entry
  writeMap(SESSIONS_PATH, temporary)
  const kept = persistentPart(sessionsCache)
  if (kept === persistentJson) return
  try {
    const tmp = `${PERSISTENT_SESSIONS_PATH}.tmp.${process.pid}`
    fs.writeFileSync(tmp, kept, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, PERSISTENT_SESSIONS_PATH)
    persistentJson = kept
  } catch (err) {
    // (no SD card place: the session still works until the box restarts)
    console.warn(`[eltern-auth] could not keep the sessions: ${(err as Error).message}`)
  }
}

// The password a session was issued under (a short hash of its hash; '' without a password), and the sign-out
// generation (interfacelogin.epoch: changed by "sign out other devices" and a new password, here or in the admin
// interface, which checks it for its own sessions). Set up by the router, which reads the config.
// Fail-closed: a config that cannot be read for a moment (written half by another program, a broken file) counts as
// the last one that could - and with none at all the login is required. It opened the box to everyone in the network
// and threw away every session (no password stamp to compare).
let passwordStamp: () => string | null = () => ''
let loginRequired: () => boolean = () => true
let lastGoodConfig: unknown
export function usePasswordStamp(readConfig: () => unknown): void {
  const current = () => {
    const cfg = readConfig()
    if (cfg !== undefined) lastGoodConfig = cfg
    return cfg ?? lastGoodConfig
  }
  passwordStamp = () => {
    const cfg = current()
    // (not known: no session is ended for it)
    if (cfg === undefined) return null
    const admin = adminHash(cfg) ?? ''
    const parents = readPasswordEntry(cfg)?.hash ?? ''
    const epoch = (cfg as { interfacelogin?: { epoch?: unknown } } | undefined)?.interfacelogin?.epoch
    const gen = typeof epoch === 'string' ? epoch : ''
    return admin || parents || gen ? createHash('sha256').update(`${admin}|${parents}${gen ? `|${gen}` : ''}`).digest('hex').slice(0, 16) : ''
  }
  loginRequired = () => {
    const cfg = current()
    return cfg === undefined || (cfg as { interfacelogin?: { state?: unknown } }).interfacelogin?.state === true
  }
}

/** The login switch as the gate of the server sees it (fail-closed, see usePasswordStamp) */
export function isLoginRequired(): boolean {
  return loginRequired()
}

/** A new sign-out generation: every session but the ones restamped afterwards ends, in the admin interface too. */
export function newSignOutEpoch(): string {
  return randomBytes(8).toString('hex')
}

/**
 * Looks up a magic-link token or session id. The maps are plain objects, and `map[key]` also
 * finds inherited properties: a token or cookie "constructor" returned Object's constructor
 * function, which passed as a valid, unused link or session - anyone in the LAN got a parents'
 * session. Only own entries with the exact shape of an issued id (hex, TOKEN_BYTES long) count.
 */
function ownEntry<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  if (typeof key !== 'string' || key.length !== TOKEN_BYTES * 2 || !/^[0-9a-f]+$/.test(key)) return undefined
  if (!Object.hasOwn(map, key)) return undefined
  const entry = map[key]
  return entry !== null && typeof entry === 'object' ? entry : undefined
}

/** Strip entries past their TTL. Idempotent, called from generate + validate. */
function purgeExpiredMagicLinks(now: number = Date.now()): void {
  const links = loadMagicLinks()
  let touched = false
  for (const [token, entry] of Object.entries(links)) {
    if (now - Date.parse(entry.issued) > MAGIC_LINK_TTL_MS) {
      delete links[token]
      touched = true
    }
  }
  if (touched) saveMagicLinks()
}

function sessionExpired(entry: Session, now: number): boolean {
  if (entry.persistent) return !(now - Date.parse(entry.lastSeen) <= PERSISTENT_TTL_MS)
  return !(now - Date.parse(entry.issued) <= SESSION_TTL_MS)
}

function purgeExpiredSessions(now: number = Date.now()): void {
  const sessions = loadSessions()
  let touched = false
  for (const [id, entry] of Object.entries(sessions)) {
    if (sessionExpired(entry, now)) {
      delete sessions[id]
      touched = true
    }
  }
  // (the kept ones: the devices used last)
  const kept = Object.entries(sessions)
    .filter(([, e]) => e.persistent)
    .sort(([, a], [, b]) => b.lastSeen.localeCompare(a.lastSeen))
  for (const [id] of kept.slice(MAX_PERSISTENT_SESSIONS)) {
    delete sessions[id]
    touched = true
  }
  if (touched) saveSessions()
}

/**
 * Issue a new magic link. Caller persists/communicates the token
 * (telegram bot sends URL, box-frontend shows QR + code, etc.).
 * Returns the raw token; the app consumes it via GET /app?token=... (/parents and /eltern lead there)
 */
export function generateMagicLink(source: string): { token: string; expiresIn: number } {
  purgeExpiredMagicLinks()
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const links = loadMagicLinks()
  links[token] = {
    issued: new Date().toISOString(),
    used: false,
    source,
  }
  magicLinksCache = links
  saveMagicLinks()
  return { token, expiresIn: Math.floor(MAGIC_LINK_TTL_MS / 1000) }
}

// The display shows its login link (QR code and plain text, frontend-box eltern-magic-link.service.ts) for 60 s at most:
// with some time to spare, a link made for it is taken as on the screen that long - unless it was used already.
const DISPLAY_LINK_SOURCES = new Set(['settings-qr'])
const DISPLAY_LINK_SHOWN_MS = 90_000

/**
 * May the display show a login link that still works now? Whoever sees the screen then (a picture of it for Home
 * Assistant, ha/ha-api.ts) could sign in as a parent with it.
 */
export function displayLoginLinkShown(now: number = Date.now()): boolean {
  return Object.values(loadMagicLinks()).some(
    (entry) => entry && !entry.used && DISPLAY_LINK_SOURCES.has(entry.source) && now - Date.parse(entry.issued) < DISPLAY_LINK_SHOWN_MS,
  )
}

/**
 * Issue a fresh session + csrf token. Used by every authentication path
 * (magic-link, password login, …) — keeps session creation in one place.
 */
export function issueSession(ip: string, persistent = false, anon = false, extra: { device?: string; via?: string } = {}): { sessionId: string; csrf: string } {
  const sessions = loadSessions()
  const sessionId = randomBytes(TOKEN_BYTES).toString('hex')
  const csrf = randomBytes(TOKEN_BYTES).toString('hex')
  const nowIso = new Date().toISOString()
  sessions[sessionId] = {
    issued: nowIso,
    lastSeen: nowIso,
    ip,
    csrf,
    pw: passwordStamp() ?? '',
    ...(persistent ? { persistent: true } : {}),
    ...(anon ? { anon: true } : {}),
    ...(extra.device ? { device: extra.device } : {}),
    ...(extra.via ? { via: extra.via } : {}),
  }
  sessionsCache = sessions
  if (persistent) purgeExpiredSessions() // (the oldest kept one goes when there are too many)
  saveSessions()
  return { sessionId, csrf }
}

/** After the password was changed by this session: it stays valid (the others end, see validateSession). */
export function restampSession(sessionId: string | undefined): void {
  const entry = ownEntry(loadSessions(), sessionId)
  if (!entry) return
  entry.pw = passwordStamp() ?? ''
  saveSessions()
}

/**
 * Redeem a magic-link token. On success: marks it as used (single-use),
 * issues a session, returns the session id + csrf token. On failure:
 * returns null. Defensive against missing entries, expired entries,
 * and already-used entries.
 */
export function redeemMagicLink(token: string, ip: string, device?: string): { sessionId: string; csrf: string } | null {
  purgeExpiredMagicLinks()
  const links = loadMagicLinks()
  const entry = ownEntry(links, token)
  if (!entry || entry.used) return null
  entry.used = true
  saveMagicLinks()
  return issueSession(ip, false, false, { device, via: entry.source })
}

/** Validate a session cookie, touch lastSeen. Returns the session or null. */
export function validateSession(sessionId: string | undefined): Session | null {
  if (!sessionId) return null
  purgeExpiredSessions()
  const sessions = loadSessions()
  const entry = ownEntry(sessions, sessionId)
  if (!entry) return null
  // issued under another password (changed since, here or in the admin interface) or before "sign out other
  // devices"; or given without a password while the login was off - and it is on now: over
  const stamp = passwordStamp()
  if ((entry.pw !== undefined && stamp !== null && entry.pw !== stamp) || (entry.anon && loginRequired())) {
    delete sessions[sessionId as string]
    saveSessions()
    return null
  }
  // Touch lastSeen to extend the active window (within absolute TTL).
  const day = entry.lastSeen.slice(0, 10)
  entry.lastSeen = new Date().toISOString()
  sessionsCache = sessions
  // Don't write on every request — it would bottleneck tmpfs. Background
  // saves would be ideal; for now we rely on the next state-changing
  // request to flush. Read-only lastSeen drift is acceptable.
  // A kept session: its day of last use on the SD card (once a day), so 90 days count from the last use
  if (entry.persistent && entry.lastSeen.slice(0, 10) !== day) saveSessions()
  return entry
}

/** Every session but this one ends (the devices kept signed in too); answers how many ended. */
export function destroyOtherSessions(sessionId: string | undefined): number {
  const sessions = loadSessions()
  let n = 0
  for (const id of Object.keys(sessions)) {
    if (id === sessionId) continue
    delete sessions[id]
    n++
  }
  if (n > 0) saveSessions()
  return n
}

/** How many devices are kept signed in ("Angemeldet bleiben"). */
export function keptSessionCount(): number {
  purgeExpiredSessions()
  return Object.values(loadSessions()).filter((s) => s.persistent).length
}

/** The device of a browser, short: "iPhone · Safari", "Windows · Chrome" ('' when it says nothing usable). */
export function describeDevice(ua: unknown): string {
  if (typeof ua !== 'string' || !ua) return ''
  const os = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : ''
  return [os, browser].filter(Boolean).join(' · ')
}

// A session's name in the list of devices: not its id (that is the cookie itself)
const sessionRef = (id: string): string => createHash('sha256').update(id).digest('hex').slice(0, 16)

/** The signed-in devices, the one asking marked; the last used first. */
export function listSessions(sessionId: string | undefined): { id: string; device: string; lastSeen: string; kept: boolean; current: boolean }[] {
  purgeExpiredSessions()
  return Object.entries(loadSessions())
    .map(([id, e]) => ({ id: sessionRef(id), device: e.device ?? '', lastSeen: e.lastSeen, kept: e.persistent === true, current: id === sessionId }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeen.localeCompare(a.lastSeen))
}

/** Signs one other device out (by its name in the list); false when there is none such, or it is the one asking. */
export function destroySessionByRef(ref: string, sessionId: string | undefined): boolean {
  const sessions = loadSessions()
  const id = Object.keys(sessions).find((k) => sessionRef(k) === ref)
  if (!id || id === sessionId) return false
  delete sessions[id]
  saveSessions()
  return true
}

// Signed in with the QR code of the display or the Telegram bot's link: that proves being at the box or in an
// allowed chat - for a while a new password may be set without the old one ("Passwort vergessen?")
const RESET_SOURCES = new Set(['telegram', 'settings-qr'])
export const PASSWORD_RESET_MS = 10 * 60 * 1000
export function mayResetPassword(sessionId: string | undefined): boolean {
  const entry = ownEntry(loadSessions(), sessionId)
  return !!entry && RESET_SOURCES.has(entry.via ?? '') && Date.now() - Date.parse(entry.issued) < PASSWORD_RESET_MS
}

/** Drop a session — for explicit logout. */
export function destroySession(sessionId: string | undefined): void {
  if (!sessionId) return
  const sessions = loadSessions()
  if (ownEntry(sessions, sessionId)) {
    delete sessions[sessionId]
    sessionsCache = sessions
    saveSessions()
  }
}

/** Constant for the cookie name; centralised so middleware + router agree. */
export const SESSION_COOKIE = 'mupibox_eltern_session'
export const CSRF_HEADER = 'x-mupibox-csrf'

/** Constant for the magic-link URL path; centralised for the bot/frontend
 *  callers that need to construct the link. */
export const MAGIC_LINK_PATH = '/app'

// --- Phase 17h — optional parent password ----------------------------------
// Stored at mupiboxconfig.json:eltern.password = {salt, hash} (hex-encoded
// scrypt). The magic-link flow stays the passwordless path; this just lets
// parents log back in after a session timeout without re-issuing a token.

const SCRYPT_KEY_LEN = 32
const SCRYPT_SALT_BYTES = 16
const MIN_PASSWORD_LENGTH = 4

interface ElternPasswordEntry {
  salt: string
  hash: string
}

function readPasswordEntry(mupibox: unknown): ElternPasswordEntry | undefined {
  const e = (mupibox as { eltern?: { password?: unknown } } | undefined)?.eltern?.password as
    | Partial<ElternPasswordEntry>
    | undefined
  if (!e || typeof e.salt !== 'string' || typeof e.hash !== 'string' || !e.salt || !e.hash) return undefined
  return { salt: e.salt, hash: e.hash }
}

/** Is a parent password currently configured? */
export function hasElternPassword(mupibox: unknown): boolean {
  return readPasswordEntry(mupibox) !== undefined
}

/** Constant-time password check. False if no password is set. */
export async function verifyElternPassword(plain: string, mupibox: unknown): Promise<boolean> {
  const entry = readPasswordEntry(mupibox)
  if (!entry) return false
  try {
    const salt = Buffer.from(entry.salt, 'hex')
    const expected = Buffer.from(entry.hash, 'hex')
    if (expected.length === 0 || salt.length === 0) return false
    const candidate = (await scryptAsync(plain, salt, expected.length)) as Buffer
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/** Set or clear the parent password. Empty/whitespace `plain` clears it.
 *  Caller must already have validated the minimum length where relevant. */
export async function setElternPassword(
  plain: string,
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>,
): Promise<void> {
  const trimmed = plain.trim()
  if (!trimmed) {
    await updateMupiboxConfig((cfg) => {
      const e = ((cfg.eltern as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      delete e.password
      cfg.eltern = e
    })
    return
  }
  const salt = randomBytes(SCRYPT_SALT_BYTES)
  const hash = (await scryptAsync(trimmed, salt, SCRYPT_KEY_LEN)) as Buffer
  const entry: ElternPasswordEntry = { salt: salt.toString('hex'), hash: hash.toString('hex') }
  await updateMupiboxConfig((cfg) => {
    const e = ((cfg.eltern as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    e.password = entry
    cfg.eltern = e
  })
}

export const ELTERN_PASSWORD_MIN_LENGTH = MIN_PASSWORD_LENGTH

// --- One password for the whole app (decision of 28.09.2026) -----------------------------------------------------
// The admin interface's password (interfacelogin.password, bcrypt from PHP's password_hash) is valid in the app too;
// a parents' password (eltern.password, scrypt) set in the parents' web app stays valid as well. A new password is
// written as bcrypt into interfacelogin.password (with PHP's "$2y$" prefix, so the admin interface keeps working
// with it) and replaces the parents' password. "Anmeldung verlangen" is interfacelogin.state, as in the admin
// interface: when it is off, the app asks for no login on the home network.

export const APP_PASSWORD_MIN_LENGTH = 6

function adminHash(cfg: unknown): string | undefined {
  const h = (cfg as { interfacelogin?: { password?: unknown } } | undefined)?.interfacelogin?.password
  return typeof h === 'string' && /^\$2[abxy]\$\d\d\$.{53}$/.test(h) ? h : undefined
}

/** Is any password set (the admin interface's or the parents')? */
export function hasAppPassword(cfg: unknown): boolean {
  return adminHash(cfg) !== undefined || hasElternPassword(cfg)
}

/** Does the app ask for a login? (interfacelogin.state; without any password there is nothing to ask for) */
export function appLoginRequired(cfg: unknown): boolean {
  // (a config not readable for a moment: the last readable one; none at all: required - fail-closed)
  if (cfg === undefined) cfg = lastGoodConfig
  if (cfg === undefined) return true
  return (cfg as { interfacelogin?: { state?: unknown } } | undefined)?.interfacelogin?.state === true && hasAppPassword(cfg)
}

/** Checks a password against the admin interface's and the parents' password. */
export async function verifyAppPassword(plain: string, cfg: unknown): Promise<boolean> {
  if (!plain) return false
  if (await verifyElternPassword(plain, cfg)) return true
  const h = adminHash(cfg)
  if (!h) return false
  try {
    return await bcrypt.compare(plain, h)
  } catch {
    return false
  }
}

// The admin interface's password every box comes with (config/templates/mupiboxconfig.json) - written in its
// instructions, so known to everyone. It stays a password (the login can be on with it), the app only says so.
const DEFAULT_PASSWORD = 'MuP1B0x'
let defaultCheck: { key: string; result: boolean } | undefined

/** Is the password still the well-known default one? (bcrypt takes a moment on the Pi: checked once per password) */
export async function usesDefaultPassword(cfg: unknown): Promise<boolean> {
  if (!hasAppPassword(cfg)) return false
  const e = (cfg as { eltern?: { password?: unknown } } | undefined)?.eltern?.password
  const key = `${adminHash(cfg) ?? ''}|${typeof e === 'string' ? e : JSON.stringify(e ?? null)}`
  if (defaultCheck?.key !== key) defaultCheck = { key, result: await verifyAppPassword(DEFAULT_PASSWORD, cfg) }
  return defaultCheck.result
}

/** Sets the one password (bcrypt, readable by the admin interface too); the old parents' password goes. */
export async function setAppPassword(
  plain: string,
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>,
): Promise<void> {
  const hash = `$2y${(await bcrypt.hash(plain, 10)).slice(3)}`
  await updateMupiboxConfig((cfg) => {
    const login = ((cfg.interfacelogin as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    login.password = hash
    cfg.interfacelogin = login
    const e = ((cfg.eltern as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    delete e.password
    cfg.eltern = e
  })
}
