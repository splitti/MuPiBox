// Phase 14b — auth.
// Wraps the bestehende OAuth-flow from AdminInterface/www/spotify.php
// instead of building a parallel one (decision Q9=C and Sektion 4 of
// the architecture paper). The PHP page handles the initial code-grant;
// this module only does the refresh half — which the PHP path didn't
// automate. PKCE (clientSecret-less) flow is also supported: when
// clientSecret is empty the refresh request omits the Basic header and
// includes client_id in the body, exactly as the Spotify docs prescribe.
//
// All persistence happens through the existing updateMupiboxConfig
// helper in server.ts to keep the atomic-write semantics consistent
// across the codebase (B8 pattern). The auth module exposes pure
// computations and a single `refreshAccessToken` async; the caller
// arranges persistence via a callback so we don't import server.ts
// internals into this module.

import { hasRequiredSyncScopes } from './config-loader'
import type { SpotifyTokenStore } from './types'

/** Spotify's OAuth token-refresh endpoint. */
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

/** HTTP timeout for OAuth calls — 10s is the Spotify-documented soft limit. */
const TOKEN_REQUEST_TIMEOUT_MS = 10_000

/** Successful refresh response narrowed to the fields we use. */
export interface RefreshResult {
  accessToken: string
  /** Spotify returns a new refresh_token sporadically — when present, persist it. */
  refreshToken?: string
  expiresAt: string // ISO8601
  scopes: string[]
}

/** Failure descriptor returned when refresh fails. */
export interface RefreshFailure {
  kind: 'auth' | 'network' | 'rate-limit' | 'internal'
  reason: string
  retryAfterSeconds?: number
}

/** Tagged-union outcome for a refresh attempt. */
export type RefreshOutcome = { ok: true; result: RefreshResult } | ({ ok: false } & RefreshFailure)

/**
 * POST a refresh-token grant to Spotify and parse the response.
 * Does NOT persist — caller decides via persist callback (see
 * getValidAccessToken below).
 */
export async function refreshAccessToken(store: SpotifyTokenStore): Promise<RefreshOutcome> {
  if (!store.clientId || !store.refreshToken) {
    return { ok: false, kind: 'auth', reason: 'missing clientId or refreshToken in token store' }
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: store.refreshToken,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (store.clientSecret) {
    // Classic confidential-client flow.
    const basic = Buffer.from(`${store.clientId}:${store.clientSecret}`).toString('base64')
    headers.Authorization = `Basic ${basic}`
  } else {
    // PKCE / public-client flow: clientId goes into the body, no Basic header.
    body.append('client_id', store.clientId)
  }

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const e = err as Error
    return { ok: false, kind: 'network', reason: `refresh request failed: ${e?.message ?? String(err)}` }
  }

  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '60', 10)
    return { ok: false, kind: 'rate-limit', reason: 'Spotify rate-limited refresh', retryAfterSeconds: retryAfter }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = (await response.json()) as Record<string, unknown>
  } catch (err) {
    return { ok: false, kind: 'internal', reason: `refresh response not JSON: ${(err as Error).message}` }
  }

  if (!response.ok) {
    // 400/401 -> auth_failed (revoked, expired, scope mismatch). User must
    // re-auth. Spotify-docs guarantee a `error` field on failure.
    const errorCode = typeof parsed.error === 'string' ? parsed.error : 'unknown_error'
    const isAuth = response.status === 400 || response.status === 401
    return {
      ok: false,
      kind: isAuth ? 'auth' : 'internal',
      reason: `${response.status} ${errorCode}: ${typeof parsed.error_description === 'string' ? parsed.error_description : ''}`,
    }
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
  if (!accessToken) {
    return { ok: false, kind: 'internal', reason: 'refresh response missing access_token' }
  }
  const refreshToken = typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined
  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const scopes = typeof parsed.scope === 'string' ? parsed.scope.split(/\s+/).filter(Boolean) : []

  return {
    ok: true,
    result: { accessToken, refreshToken, expiresAt, scopes },
  }
}

/**
 * Persist refresh outcome into mupiboxconfig.json.spotify.
 * Caller passes the updateMupiboxConfig helper from server.ts so this
 * module doesn't import the express layer.
 */
export async function persistRefreshedToken(
  result: RefreshResult,
  store: SpotifyTokenStore,
  updateCfg: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>,
): Promise<SpotifyTokenStore> {
  const newStore: SpotifyTokenStore = {
    ...store,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? store.refreshToken,
    tokenExpiresAt: result.expiresAt,
    tokenUpdatedAt: new Date().toISOString(),
    tokenScopes: result.scopes,
  }
  await updateCfg((cfg) => {
    const spotify = ((cfg.spotify as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    spotify.accessToken = newStore.accessToken
    spotify.refreshToken = newStore.refreshToken ?? ''
    spotify.tokenExpiresAt = newStore.tokenExpiresAt
    spotify.tokenUpdatedAt = newStore.tokenUpdatedAt
    spotify.tokenScopes = newStore.tokenScopes
    cfg.spotify = spotify
  })
  return newStore
}

/** Is the access token still valid for at least `slackSeconds` more? */
export function tokenStillValid(store: SpotifyTokenStore, slackSeconds = 300): boolean {
  if (!store.accessToken || !store.tokenExpiresAt) return false
  const expiresAt = Date.parse(store.tokenExpiresAt)
  if (Number.isNaN(expiresAt)) return false
  return expiresAt - Date.now() > slackSeconds * 1000
}

/**
 * Returns a usable access token, refreshing first when the current one is
 * expired or close to expiry. Wraps refresh + persist. Throws nothing;
 * returns a discriminated result.
 */
export async function getValidAccessToken(
  store: SpotifyTokenStore,
  updateCfg: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>,
): Promise<{ ok: true; token: string; store: SpotifyTokenStore } | { ok: false; failure: RefreshFailure }> {
  if (tokenStillValid(store)) {
    return { ok: true, token: store.accessToken, store }
  }
  const outcome = await refreshAccessToken(store)
  if (!outcome.ok) {
    // outcome is the failure variant here; strip the `ok: false` flag
    // before passing back so the caller doesn't have to re-narrow.
    const { ok: _ok, ...failure } = outcome
    return { ok: false, failure }
  }
  const newStore = await persistRefreshedToken(outcome.result, store, updateCfg)
  return { ok: true, token: newStore.accessToken, store: newStore }
}

/**
 * Quick scope check: does this token store carry the playlist-read scopes
 * that Smart-Sync needs? Used by the state-machine to short-circuit into
 * AUTH_NEEDS_REAUTH without spending an API call.
 */
export function requiresReAuth(store: SpotifyTokenStore | undefined): boolean {
  if (!store) return true
  // No scopes recorded yet — old token from before Phase 14a, unknown but
  // probably missing playlist scopes. Force re-auth to be safe.
  if (!store.tokenScopes || store.tokenScopes.length === 0) return true
  return !hasRequiredSyncScopes(store)
}
