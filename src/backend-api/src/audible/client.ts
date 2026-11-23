// Audible (5.1, docs/audible-5.1.md): the box as an Audible device of the parents' account. Amazon's sign-in happens in
// the parents' own browser (password and code stay there); the address Amazon lands on carries a one-time code, with which
// the box registers a device of its own. It keeps that device's key and tokens (encrypted, see settings.ts) and signs each
// request to Audible with the key. Unofficial: Audible has no public interface, this is the one its own apps use.
// Nothing is ever decrypted: the box plays the streams Audible hands out for streaming (A0: plain AAC).

import { createHash, randomBytes, randomUUID, sign } from 'node:crypto'

/** The Audible stores the box offers: the domain of Amazon/Audible there and Amazon's marketplace id */
export const MARKETS = {
  de: { domain: 'de', marketplace: 'AN7V1F1VY261K' },
  uk: { domain: 'co.uk', marketplace: 'A2I9A3Q2GNFNGQ' },
  us: { domain: 'com', marketplace: 'AF2M0KC94RCEA' },
  fr: { domain: 'fr', marketplace: 'A2728XDNODOQ8T' },
  it: { domain: 'it', marketplace: 'A2N7FU2W2BU2ZC' },
  es: { domain: 'es', marketplace: 'ALMIKO4SZCSAR' },
  ca: { domain: 'ca', marketplace: 'A2CQZ5RBY40XE' },
  au: { domain: 'com.au', marketplace: 'AN7EY7DTAW63G' },
  in: { domain: 'in', marketplace: 'AJO3FBRUE6J4S' },
  jp: { domain: 'co.jp', marketplace: 'A1QAP3MOU4173J' },
} as const
export type AudibleCountry = keyof typeof MARKETS
export const isCountry = (c: unknown): c is AudibleCountry => typeof c === 'string' && Object.hasOwn(MARKETS, c)

/** Where the requests go (the tests point them at a server of their own) */
export const hosts = {
  signin: (domain: string) => `https://www.amazon.${domain}`,
  amazon: (domain: string) => `https://api.amazon.${domain}`,
  audible: (domain: string) => `https://api.audible.${domain}`,
}

// Audible's app the device registers as (the sign-in page and Amazon's list of devices show it so)
const DEVICE_TYPE = 'A2CZJZGLK2JJVM'
const APP_VERSION = '3.56.2'
const SOFTWARE_VERSION = '35602678'
const TIMEOUT_MS = 20_000
// (signing out asks twice - token, then removal - and the app waits 30 s for the answer)
const SIGN_OUT_MS = 8_000

export type AudibleProblem = 'unreachable' | 'unauthorized' | 'refused' | 'rateLimited' | 'notFound' | 'badCode' | 'expired'

export class AudibleError extends Error {
  constructor(
    readonly problem: AudibleProblem,
    readonly status = 0,
    /** seconds Audible asks to wait (429) */
    readonly retryAfter?: number,
  ) {
    super(`audible: ${problem}${status ? ` (${status})` : ''}`)
  }
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const clientId = (serial: string) => Buffer.from(`${serial}#${DEVICE_TYPE}`).toString('hex')

/** A sign-in begun: the page for the parents and what the box needs to finish it (never shown to anyone) */
export interface LoginStart {
  country: AudibleCountry
  url: string
  verifier: string
  serial: string
}

/** Amazon's sign-in page for a new device of this box (PKCE: the code is worth nothing without the verifier kept here) */
export function loginStart(country: AudibleCountry): LoginStart {
  const m = MARKETS[country]
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const serial = randomUUID().replace(/-/g, '').toUpperCase()
  const q = new URLSearchParams([
    ['openid.oa2.response_type', 'code'],
    ['openid.oa2.code_challenge_method', 'S256'],
    ['openid.oa2.code_challenge', challenge],
    ['openid.return_to', `${hosts.signin(m.domain)}/ap/maplanding`],
    ['openid.assoc_handle', `amzn_audible_ios_${country}`],
    ['openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select'],
    ['pageId', 'amzn_audible_ios'],
    ['accountStatusPolicy', 'P1'],
    ['openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select'],
    ['openid.mode', 'checkid_setup'],
    ['openid.ns.oa2', 'http://www.amazon.com/ap/ext/oauth/2'],
    ['openid.oa2.client_id', `device:${clientId(serial)}`],
    ['openid.ns.pape', 'http://specs.openid.net/extensions/pape/1.0'],
    ['marketPlaceId', m.marketplace],
    ['openid.oa2.scope', 'device_auth_access'],
    ['forceMobileLayout', 'true'],
    ['openid.ns', 'http://specs.openid.net/auth/2.0'],
    ['openid.pape.max_auth_age', '0'],
  ])
  return { country, url: `${hosts.signin(m.domain)}/ap/signin?${q}`, verifier, serial }
}

const CODE = /^[A-Za-z0-9_-]{10,200}$/

/**
 * The one-time code in what the parents pasted: the address Amazon landed on (…/ap/maplanding?…). Amazon may put a page
 * in between (an offer to set up a passkey) - the landing address then sits in its "openid.return_to". The code alone
 * works too. Null: none in there.
 */
export function codeOf(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const t = text.trim()
  if (t.length > 8000) return null
  const find = (s: string, depth: number): string | null => {
    let q: URLSearchParams
    try {
      q = new URL(s).searchParams
    } catch {
      return null
    }
    const code = q.get('openid.oa2.authorization_code') || q.get('authorization_code')
    if (code) return CODE.test(code) ? code : null
    const inner = q.get('openid.return_to')
    return inner && depth < 3 ? find(inner, depth + 1) : null
  }
  if (CODE.test(t)) return t
  // (a phone's "share" or "copy" may put the page's title before the address: each address in the text)
  for (const s of [t, ...(t.match(/https?:\/\/\S+/g) ?? [])]) {
    const code = find(s, 0)
    if (code) return code
  }
  return null
}

/** What the box keeps of its device (encrypted): enough to sign requests and to sign out again */
export interface AudibleCredentials {
  adpToken: string
  privateKey: string
  refreshToken: string
}

export interface Registration extends AudibleCredentials {
  /** how Amazon lists the device ("…'s Audible for iPhone") */
  deviceName: string
  /** the account holder's first name, as Amazon gives it ('' none) */
  customerName: string
}

async function send(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS) })
  } catch {
    throw new AudibleError('unreachable')
  }
}

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Registers the device with the code from the sign-in; the code works once and only for a few minutes */
export async function register(start: LoginStart, code: string): Promise<Registration> {
  const m = MARKETS[start.country]
  const body = {
    requested_token_type: ['bearer', 'mac_dms', 'website_cookies', 'store_authentication_cookie'],
    cookies: { website_cookies: [], domain: `.amazon.${m.domain}` },
    registration_data: {
      domain: 'Device',
      app_version: APP_VERSION,
      device_serial: start.serial,
      device_type: DEVICE_TYPE,
      device_name: '%FIRST_NAME%%FIRST_NAME_POSSESSIVE_STRING%%DUPE_STRATEGY_1ST%Audible for iPhone',
      os_version: '15.0.0',
      software_version: SOFTWARE_VERSION,
      device_model: 'iPhone',
      app_name: 'Audible',
    },
    auth_data: {
      client_id: clientId(start.serial),
      authorization_code: code,
      code_verifier: start.verifier,
      code_algorithm: 'SHA-256',
      client_domain: 'DeviceLegacy',
    },
    requested_extensions: ['device_info', 'customer_info'],
  }
  const r = await send(`${hosts.amazon(m.domain)}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await r.json().catch(() => null)) as { response?: { success?: Record<string, any> } } | null
  const ok = j?.response?.success
  if (r.status === 429) throw new AudibleError('rateLimited', 429)
  // (a code used or too old, or one of another sign-in: Amazon refuses it - the parents sign in once more)
  if (!r.ok || !ok) throw new AudibleError(r.status >= 500 ? 'unreachable' : 'refused', r.status)
  const t = ok.tokens ?? {}
  // (whole or not at all - a value cut short would only fail later as "device removed")
  const whole = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '')
  const adpToken = whole(t.mac_dms?.adp_token, 8000)
  const privateKey = whole(t.mac_dms?.device_private_key, 8000)
  const refreshToken = whole(t.bearer?.refresh_token, 4000)
  if (!adpToken || !privateKey.includes('PRIVATE KEY') || !refreshToken) {
    // (registered, but not usable: the device is removed again, none left behind in the account)
    if (refreshToken) await deregister({ country: start.country, credentials: { adpToken, privateKey, refreshToken } })
    throw new AudibleError('refused', r.status)
  }
  return {
    adpToken,
    privateKey,
    refreshToken,
    deviceName: text(ok.extensions?.device_info?.device_name),
    customerName: text(ok.extensions?.customer_info?.given_name) || text(ok.extensions?.customer_info?.name),
  }
}

/** The box's device towards Audible: the store and its key */
export interface AudibleSession {
  country: AudibleCountry
  credentials: AudibleCredentials
}

/** Audible's signature of a request (the device key over method, path, time, body and token) */
export function signed(c: AudibleCredentials, method: string, pathAndQuery: string, body: string): Record<string, string> {
  const date = new Date().toISOString()
  const data = `${method}\n${pathAndQuery}\n${date}\n${body}\n${c.adpToken}`
  const signature = sign('sha256', Buffer.from(data), c.privateKey).toString('base64')
  return { 'x-adp-token': c.adpToken, 'x-adp-alg': 'SHA256withRSA:1.0', 'x-adp-signature': `${signature}:${date}` }
}

export interface ApiOptions {
  query?: Record<string, string | number>
  json?: unknown
  timeoutMs?: number
}

/** A request to Audible's API (/1.0/…), signed with the device key; the answer as JSON (null for none) */
export async function apiJson<T = any>(session: AudibleSession, method: 'GET' | 'POST' | 'PUT', path: string, options: ApiOptions = {}): Promise<T> {
  const m = MARKETS[session.country]
  const u = new URL(`${hosts.audible(m.domain)}/1.0/${path.replace(/^\/+/, '')}`)
  for (const [k, v] of Object.entries(options.query ?? {})) u.searchParams.set(k, String(v))
  const body = options.json === undefined ? '' : JSON.stringify(options.json)
  let headers: Record<string, string>
  try {
    headers = { Accept: 'application/json', ...signed(session.credentials, method, u.pathname + u.search, body) }
  } catch {
    // (a key that does not load: a broken or foreign config - as if Audible refused it)
    throw new AudibleError('unauthorized')
  }
  if (body) headers['Content-Type'] = 'application/json'
  const r = await send(u.toString(), { method, headers, body: body || undefined, timeoutMs: options.timeoutMs })
  if (r.status === 401 || r.status === 403) throw new AudibleError('unauthorized', r.status)
  if (r.status === 404) throw new AudibleError('notFound', 404)
  if (r.status === 429) {
    const after = Number(r.headers.get('retry-after'))
    throw new AudibleError('rateLimited', 429, Number.isFinite(after) && after > 0 ? Math.min(after, 3600) : 60)
  }
  if (!r.ok) throw new AudibleError(r.status >= 500 ? 'unreachable' : 'refused', r.status)
  const raw = await r.text().catch(() => '')
  if (!raw) return null as T
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new AudibleError('unreachable', r.status)
  }
}

/** Works the box's device right now? A small request (one entry of the library) - Audible's answer or the reason */
export async function check(session: AudibleSession, timeoutMs = 4000): Promise<void> {
  await apiJson(session, 'GET', 'library', { query: { num_results: 1, response_groups: 'product_desc' }, timeoutMs })
}

/** A short-lived access token from the refresh token (only signing out needs one) */
async function accessToken(country: AudibleCountry, refreshToken: string): Promise<string> {
  const m = MARKETS[country]
  const r = await send(`${hosts.amazon(m.domain)}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      app_name: 'Audible',
      app_version: APP_VERSION,
      source_token: refreshToken,
      requested_token_type: 'access_token',
      source_token_type: 'refresh_token',
    }).toString(),
    timeoutMs: SIGN_OUT_MS,
  })
  const j = (await r.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null
  if (r.ok && typeof j?.access_token === 'string') return j.access_token
  // (only Amazon's word that the token is no longer valid counts as "device gone" - any other refusal (a changed request,
  // a hiccup) is not, else the box would report a device as removed that is still in the account)
  const gone = (r.status === 400 || r.status === 401) && /invalid_grant|invalid_token|InvalidToken|Unauthorized/i.test(String(j?.error ?? ''))
  throw new AudibleError(gone ? 'unauthorized' : r.status >= 500 || r.status === 0 ? 'unreachable' : 'refused', r.status)
}

/**
 * Removes the box's device from the account (Amazon's list of devices). Only this one device: never the other devices of
 * the account. True when Amazon confirmed it or the device was gone already.
 */
export async function deregister(session: AudibleSession): Promise<boolean> {
  try {
    const token = await accessToken(session.country, session.credentials.refreshToken)
    const r = await send(`${hosts.amazon(MARKETS[session.country].domain)}/auth/deregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deregister_all_existing_accounts: false }),
      timeoutMs: SIGN_OUT_MS,
    })
    await r.body?.cancel().catch(() => undefined)
    return r.ok
  } catch (err) {
    // (the refresh token refused: the device was removed in Amazon already)
    return err instanceof AudibleError && err.problem === 'unauthorized'
  }
}
