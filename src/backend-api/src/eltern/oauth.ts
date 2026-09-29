// Phase 14c — Spotify OAuth init + callback for the Eltern-WebApp.
//
// Wraps the existing spotify.php authorize-redirect pattern so the
// WebApp doesn't have to bounce through the PHP admin interface.
// Uses the same Authorization Code flow (with optional PKCE when
// clientSecret is missing — same logic as src/spotify-sync/auth.ts).
//
// State-token (CSRF for the OAuth round-trip) is generated here,
// stored in-memory with a 10-min TTL, and validated on callback.
// The token store update goes through the same updateMupiboxConfig
// helper that backend-api uses everywhere else.

import { randomBytes } from 'node:crypto'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { forgetRefusedLogin, markNewLogin } from './spotify-auth-age'

/** Scopes the box needs for everything (existing + new for Smart-Sync). */
export const REQUESTED_SCOPES = [
  'streaming',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
] as const

const STATE_TTL_MS = 10 * 60 * 1000

/** In-memory OAuth-state store; single process per box, no need for tmpfs. */
const oauthStates = new Map<string, { sessionId: string; issued: number; redirectAfter: string; redirectUri: string }>()

function purgeExpiredStates(now = Date.now()): void {
  for (const [state, entry] of oauthStates) {
    if (now - entry.issued > STATE_TTL_MS) oauthStates.delete(state)
  }
}

/**
 * Build the Spotify-authorize URL for the current session. Returns null
 * if the box has no clientId configured — the caller should redirect
 * the user to the setup wizard instead.
 */
export function buildAuthorizeUrl(deps: {
  getMupiboxConfig: () => MupiboxConfig | undefined
  sessionId: string
  host: string
  protocol: string
  /** Where to send the user after callback success (default '/app'). */
  redirectAfter?: string
}): { url: string; state: string; redirectUri: string } | { error: 'no_client_id' } {
  const cfg = deps.getMupiboxConfig()
  const spotify = (cfg?.spotify as Record<string, unknown> | undefined) ?? {}
  const clientId = typeof spotify.clientId === 'string' ? spotify.clientId : ''
  if (!clientId) return { error: 'no_client_id' }

  purgeExpiredStates()
  const state = randomBytes(24).toString('hex')
  // (kept with the state: the code is exchanged with the same address, also when the choice changes in between)
  const redirectUri = buildRedirectUri(deps.protocol, deps.host, redirectModeOf(cfg))
  oauthStates.set(state, {
    sessionId: deps.sessionId,
    issued: Date.now(),
    redirectAfter: deps.redirectAfter ?? '/app',
    redirectUri,
  })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: REQUESTED_SCOPES.join(' '),
    state,
    // Force re-consent so newly-added playlist scopes prompt the user
    // even if they previously authorised an older scope set.
    show_dialog: 'true',
  })
  return {
    url: `https://accounts.spotify.com/authorize?${params.toString()}`,
    state,
    redirectUri,
  }
}

// The Redirect URI - the address the parents entered in their Spotify app. Through the web server on port 443
// (lighttpd with the box's certificate): Spotify refuses http addresses other than 127.0.0.1.
//   app: https://<box>/app/spotify-callback - lighttpd passes /app to the app, server.ts hands it to
//        /api/app/spotify-oauth/callback
//   legacy: https://<box>/spotify.php - the address of the admin interface before; spotify.php passes Spotify's answer
//        on to the one above, so the Spotify apps of boxes set up before need no change after an update
export const SPOTIFY_CALLBACK_PATHS = { app: '/app/spotify-callback', legacy: '/spotify.php' } as const
export type RedirectMode = keyof typeof SPOTIFY_CALLBACK_PATHS

/**
 * Which address the box uses: spotify.redirect when chosen (the app's Zugangsdaten page; set by every login through
 * the app). Not chosen: a box that is signed in, but not by the app (the admin interface of before), keeps
 * /spotify.php - its Spotify app knows that one; a new setup uses the app's.
 */
export function redirectModeOf(cfg: MupiboxConfig | undefined): RedirectMode {
  const sp = (cfg?.spotify as Record<string, unknown> | undefined) ?? {}
  if (sp.redirect === 'app' || sp.redirect === 'legacy') return sp.redirect
  const signedIn = typeof sp.refreshToken === 'string' && sp.refreshToken !== ''
  const byApp = typeof sp.authorizedAt === 'string' && sp.authorizedEstimated !== true
  return signedIn && !byApp ? 'legacy' : 'app'
}

export function buildRedirectUri(protocol: string, host: string, mode: RedirectMode = 'app'): string {
  return `${protocol}://${host}${SPOTIFY_CALLBACK_PATHS[mode]}`
}

/**
 * Consume the state from the callback. Returns the original session
 * + redirectAfter, or null if state is unknown / expired / replayed.
 */
export function consumeOauthState(state: string): { sessionId: string; redirectAfter: string; redirectUri: string } | null {
  purgeExpiredStates()
  const entry = oauthStates.get(state)
  if (!entry) return null
  oauthStates.delete(state)
  return { sessionId: entry.sessionId, redirectAfter: entry.redirectAfter, redirectUri: entry.redirectUri }
}

/**
 * Exchange authorization code for tokens, then persist them into
 * mupiboxconfig.json.spotify via the updateCfg callback (same one the
 * sync module uses for refreshes).
 *
 * Returns the granted scope list on success so the caller can update
 * Smart-Sync's "AUTH_NEEDS_REAUTH" flag.
 */
export async function exchangeCodeForTokens(deps: {
  code: string
  redirectUri: string
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}): Promise<{ ok: true; scopes: string[]; expiresAt: string } | { ok: false; reason: string }> {
  const cfg = deps.getMupiboxConfig()
  const spotify = (cfg?.spotify as Record<string, unknown> | undefined) ?? {}
  const clientId = typeof spotify.clientId === 'string' ? spotify.clientId : ''
  const clientSecret = typeof spotify.clientSecret === 'string' ? spotify.clientSecret : ''
  if (!clientId) return { ok: false, reason: 'clientId missing' }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: deps.code,
    redirect_uri: deps.redirectUri,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (clientSecret) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    headers.Authorization = `Basic ${basic}`
  } else {
    body.append('client_id', clientId)
  }

  let response: Response
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    return { ok: false, reason: `network error: ${(err as Error).message}` }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = (await response.json()) as Record<string, unknown>
  } catch (err) {
    return { ok: false, reason: `response not JSON: ${(err as Error).message}` }
  }

  if (!response.ok) {
    const errorCode = typeof parsed.error === 'string' ? parsed.error : 'unknown_error'
    const desc = typeof parsed.error_description === 'string' ? parsed.error_description : ''
    return { ok: false, reason: `${response.status} ${errorCode}: ${desc}` }
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
  const refreshToken = typeof parsed.refresh_token === 'string' ? parsed.refresh_token : ''
  if (!accessToken || !refreshToken) {
    return { ok: false, reason: 'response missing access_token or refresh_token' }
  }
  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const scopes = typeof parsed.scope === 'string' ? parsed.scope.split(/\s+/).filter(Boolean) : []
  const nowIso = new Date().toISOString()

  await deps.updateMupiboxConfig((cfg) => {
    const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    spotify.accessToken = accessToken
    spotify.refreshToken = refreshToken
    spotify.tokenExpiresAt = expiresAt
    spotify.tokenUpdatedAt = nowIso
    spotify.tokenScopes = scopes
    // (a login holds 6 months from now: see spotify-auth-age.ts)
    markNewLogin(spotify, refreshToken)
    cfg.spotify = spotify
  })
  await forgetRefusedLogin()

  return { ok: true, scopes, expiresAt }
}

/** Clear Spotify tokens (disconnect flow). */
export async function clearSpotifyTokens(
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>,
): Promise<void> {
  await updateMupiboxConfig((cfg) => {
    const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    spotify.accessToken = ''
    spotify.refreshToken = ''
    spotify.tokenScopes = []
    spotify.tokenExpiresAt = undefined
    cfg.spotify = spotify
  })
}
