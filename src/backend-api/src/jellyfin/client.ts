// Jellyfin (5.1, docs/jellyfin-5.1.md): the requests the box makes to a Jellyfin server in the home network - its public
// info, a login (Quick Connect or user name and password), the libraries of the user. Every request carries the
// "MediaBrowser" authorization header with the box as its own device: the parents see it in Jellyfin under Devices and
// can sign it out there. A self-signed certificate is trusted by the fingerprint confirmed in the app (pinned-fetch).

import { CertificateError, serviceFetch } from '../app-api/photos/pinned-fetch'
import { RemoteAway } from '../app-api/photos/remote'

/** The oldest Jellyfin the box works with: Quick Connect as today, /UserViews or /Users/{id}/Views */
export const MIN_VERSION = '10.8.0'
export const CLIENT_NAME = 'MuPiBox'

export interface JellyfinServer {
  /** http(s)://host:port, without a path at the end */
  address: string
  /** the fingerprint of a self-signed certificate the parents confirmed ('' none) */
  fingerprint: string
}

export interface JellyfinDevice {
  /** a fixed id of this box towards Jellyfin */
  deviceId: string
  /** the box's name, shown in Jellyfin's list of devices */
  deviceName: string
  version: string
}

export interface JellyfinSession extends JellyfinServer, JellyfinDevice {
  token: string
  userId: string
}

/** Why a request did not work - the app names it in its own words */
export type JellyfinProblem = 'unreachable' | 'certificate' | 'unauthorized' | 'notJellyfin' | 'version' | 'quickConnectOff' | 'refused'

export class JellyfinError extends Error {
  constructor(
    readonly problem: JellyfinProblem,
    readonly status = 0,
    readonly certificate?: CertificateError['certificate'],
  ) {
    super(`jellyfin: ${problem}${status ? ` (${status})` : ''}`)
  }
}

/**
 * An address as typed in the app: "192.168.1.20", "jellyfin.local:8096", "https://media.example/jellyfin/". Without a
 * scheme http and, without a port, Jellyfin's 8096; a path (a reverse proxy's base URL) is kept, the slash at its end
 * not. Null for what is no address.
 */
export function cleanAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let t = value.trim()
  // (a bare number would be read as an IPv4 address - "42" as 0.0.0.42)
  if (!t || t.length > 300 || /\s/.test(t) || /^\d+$/.test(t)) return null
  // (another scheme - ftp://, smb:// - is no Jellyfin)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null
  // (a scheme typed: its own default port when none is typed - a proxy on 80/443; without one Jellyfin's 8096 - so
  // what this gives back comes out the same when read again)
  const typedScheme = /^https?:\/\//i.test(t)
  if (!typedScheme) t = `http://${t}`
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password || u.search || u.hash) return null
  const typedPort = /^https?:\/\/(\[[^\]]+\]|[^/:]+):\d+/i.test(t)
  if (!typedScheme && !typedPort) u.port = '8096'
  const path = u.pathname.replace(/\/+$/, '')
  // (URL writes scheme and host in lower case; the path keeps its case - a proxy may tell it apart)
  return `${u.protocol}//${u.host}${path}`
}

/** a.b.c compared part by part (10.8.13 < 10.10.0 < 12.4.0) */
export function versionAtLeast(version: string, min: string): boolean {
  const a = String(version).split('.').map((n) => parseInt(n, 10) || 0)
  const b = min.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d > 0
  }
  return true
}

const quote = (v: string) => v.replace(/["\\\r\n]/g, '')

/** The header Jellyfin wants on every request (token only once signed in) */
export function authorization(device: JellyfinDevice, token?: string): string {
  return `MediaBrowser Client="${CLIENT_NAME}", Device="${quote(device.deviceName) || CLIENT_NAME}", DeviceId="${quote(device.deviceId)}", Version="${quote(device.version)}"${token ? `, Token="${quote(token)}"` : ''}`
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** a token for this request (the session's when not given) */
  token?: string
  timeoutMs?: number
  headers?: Record<string, string>
  /** the caller's own abort (passed on as it is) */
  signal?: AbortSignal
}

/**
 * A request to the server: the Response for any answer (the caller reads its status), JellyfinError 'unreachable' or
 * 'certificate' when there was none. Redirects are not followed - the token stays with the address given.
 */
export async function request(server: JellyfinServer, device: JellyfinDevice, path: string, opts: RequestOptions = {}): Promise<Response> {
  const url = new URL(`${server.address}${path}`)
  // (timeoutMs 0: no limit of its own - an audio stream read for minutes; the caller's signal ends it)
  const timeout = opts.timeoutMs === 0 ? undefined : AbortSignal.timeout(opts.timeoutMs ?? 10000)
  const signal = opts.signal && timeout ? AbortSignal.any([opts.signal, timeout]) : (opts.signal ?? timeout ?? new AbortController().signal)
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: authorization(device, opts.token), ...(opts.headers ?? {}) }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  try {
    return await serviceFetch(url, server.fingerprint || undefined, { method: opts.method ?? 'GET', headers, body, signal }, 'jellyfin', opts.signal)
  } catch (err) {
    if (opts.signal?.aborted) throw err
    if (err instanceof CertificateError) throw new JellyfinError('certificate', 0, err.certificate)
    if (err instanceof RemoteAway || (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') throw new JellyfinError('unreachable')
    throw new JellyfinError('unreachable')
  }
}

/** A JSON answer, or JellyfinError for a status that is not 2xx (401/403: 'unauthorized') */
export async function requestJson<T>(server: JellyfinServer, device: JellyfinDevice, path: string, opts: RequestOptions = {}): Promise<T> {
  const r = await request(server, device, path, opts)
  if (r.status === 401 || r.status === 403) {
    await r.body?.cancel().catch(() => undefined)
    throw new JellyfinError('unauthorized', r.status)
  }
  if (!r.ok) {
    await r.body?.cancel().catch(() => undefined)
    throw new JellyfinError(r.status >= 500 || r.status === 429 ? 'unreachable' : 'refused', r.status)
  }
  if (r.status === 204) return undefined as T
  try {
    return (await r.json()) as T
  } catch {
    throw new JellyfinError('notJellyfin', r.status)
  }
}

export interface PublicInfo {
  id: string
  name: string
  version: string
}

/** GET /System/Info/Public - without a login: whether it is a Jellyfin at all, and which */
export async function publicInfo(server: JellyfinServer, device: JellyfinDevice, signal?: AbortSignal): Promise<PublicInfo> {
  let body: Record<string, unknown>
  try {
    body = await requestJson<Record<string, unknown>>(server, device, '/System/Info/Public', { timeoutMs: 8000, signal })
  } catch (err) {
    if (err instanceof JellyfinError && (err.problem === 'refused' || err.problem === 'unauthorized')) throw new JellyfinError('notJellyfin', err.status)
    throw err
  }
  const id = typeof body?.Id === 'string' ? body.Id : ''
  const version = typeof body?.Version === 'string' ? body.Version : ''
  // (Emby answers the same address with ProductName "Emby Server" - only Jellyfin is supported)
  const product = typeof body?.ProductName === 'string' ? body.ProductName : 'Jellyfin Server'
  if (!id || !version || !/jellyfin/i.test(product)) throw new JellyfinError('notJellyfin')
  return { id, name: typeof body.ServerName === 'string' ? body.ServerName : '', version }
}

export interface LoginResult {
  token: string
  userId: string
  userName: string
  serverId: string
}

function loginResult(body: Record<string, unknown> | undefined): LoginResult {
  const user = body?.User as Record<string, unknown> | undefined
  const token = typeof body?.AccessToken === 'string' ? body.AccessToken : ''
  const userId = typeof user?.Id === 'string' ? user.Id : ''
  if (!token || !userId) throw new JellyfinError('notJellyfin')
  return { token, userId, userName: typeof user?.Name === 'string' ? user.Name : '', serverId: typeof body?.ServerId === 'string' ? body.ServerId : '' }
}

/** POST /Users/AuthenticateByName - the password is only used for this request, never kept */
export async function loginWithPassword(server: JellyfinServer, device: JellyfinDevice, user: string, password: string): Promise<LoginResult> {
  return loginResult(await requestJson<Record<string, unknown>>(server, device, '/Users/AuthenticateByName', { method: 'POST', body: { Username: user, Pw: password }, timeoutMs: 15000 }))
}

/** POST /QuickConnect/Initiate - a code to confirm in a Jellyfin app, and the secret to ask with */
export async function quickConnectStart(server: JellyfinServer, device: JellyfinDevice): Promise<{ code: string; secret: string }> {
  let body: Record<string, unknown>
  try {
    body = await requestJson<Record<string, unknown>>(server, device, '/QuickConnect/Initiate', { method: 'POST', timeoutMs: 8000 })
  } catch (err) {
    // (switched off in Jellyfin's settings: 401 or 403 on older servers, 400 on newer ones)
    if (err instanceof JellyfinError && (err.problem === 'unauthorized' || err.problem === 'refused')) throw new JellyfinError('quickConnectOff', err.status)
    throw err
  }
  const code = body?.Code == null ? '' : String(body.Code)
  const secret = typeof body?.Secret === 'string' ? body.Secret : ''
  if (!code || !secret) throw new JellyfinError('notJellyfin')
  return { code, secret }
}

/** GET /QuickConnect/Connect - confirmed yet? (404: the code expired or is unknown) */
export async function quickConnectConfirmed(server: JellyfinServer, device: JellyfinDevice, secret: string): Promise<'waiting' | 'confirmed' | 'expired'> {
  const r = await request(server, device, `/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`, { timeoutMs: 8000 })
  if (r.status === 404 || r.status === 400 || r.status === 401) {
    await r.body?.cancel().catch(() => undefined)
    return 'expired'
  }
  if (!r.ok) {
    await r.body?.cancel().catch(() => undefined)
    throw new JellyfinError('unreachable', r.status)
  }
  const body = (await r.json().catch(() => null)) as { Authenticated?: unknown } | null
  return body?.Authenticated === true ? 'confirmed' : 'waiting'
}

/** POST /Users/AuthenticateWithQuickConnect - the token for a confirmed code */
export async function quickConnectLogin(server: JellyfinServer, device: JellyfinDevice, secret: string): Promise<LoginResult> {
  return loginResult(await requestJson<Record<string, unknown>>(server, device, '/Users/AuthenticateWithQuickConnect', { method: 'POST', body: { Secret: secret }, timeoutMs: 15000 }))
}

export interface Library {
  id: string
  name: string
  /** music, books, playlists, mixed (folders), or another one the box does not play */
  type: string
}

/** The kinds of library the box can play from */
export const AUDIO_LIBRARIES = ['music', 'books', 'playlists', 'mixed']

/** The libraries of the user (GET /UserViews, before 10.9 /Users/{id}/Views) */
export async function libraries(s: JellyfinSession): Promise<Library[]> {
  let body: { Items?: unknown[] }
  try {
    body = await requestJson(s, s, `/UserViews?userId=${encodeURIComponent(s.userId)}`, { token: s.token })
  } catch (err) {
    if (!(err instanceof JellyfinError) || err.problem !== 'refused') throw err
    body = await requestJson(s, s, `/Users/${encodeURIComponent(s.userId)}/Views`, { token: s.token })
  }
  return (Array.isArray(body?.Items) ? body.Items : [])
    .map((i) => i as Record<string, unknown>)
    .filter((i) => typeof i.Id === 'string')
    .map((i) => ({
      id: i.Id as string,
      name: typeof i.Name === 'string' ? i.Name : '',
      // (a library of mixed content has no CollectionType)
      type: typeof i.CollectionType === 'string' ? i.CollectionType.toLowerCase() : 'mixed',
    }))
}

/** POST /Sessions/Logout - the token is ended in Jellyfin (the device leaves its list); failing is fine */
export async function logout(s: JellyfinSession): Promise<void> {
  try {
    const r = await request(s, s, '/Sessions/Logout', { method: 'POST', token: s.token, timeoutMs: 5000 })
    await r.body?.cancel().catch(() => undefined)
  } catch {
    // (the server away: the box forgets the token anyway)
  }
}
