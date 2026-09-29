// Phase 14b — config loader.
// Reads the `spotify_sync` section from mupiboxconfig.json, merges over
// DEFAULT_SPOTIFY_SYNC_CONFIG, and clamps polling_interval_seconds to its
// valid range. Returns the canonical config used by the rest of the
// sync code.
//
// Defensive against missing fields, missing whole section, and out-of-range
// polling values — all of those silently fall back to the defaults so a
// fresh-install box can start before mupiboxconfig.json has the section.

import type { MupiboxConfig } from '../models/mupibox-config.model'
import {
  DEFAULT_SPOTIFY_SYNC_CONFIG,
  POLLING_INTERVAL_SECONDS_MAX,
  POLLING_INTERVAL_SECONDS_MIN,
  type SpotifySyncConfig,
  type SpotifyTokenStore,
} from './types'

/** Pull spotify_sync section, fill missing fields from defaults, clamp ranges. */
export function loadSpotifySyncConfig(mupibox: MupiboxConfig | undefined): SpotifySyncConfig {
  const raw = (mupibox as unknown as { spotify_sync?: Partial<SpotifySyncConfig> })?.spotify_sync ?? {}
  const merged: SpotifySyncConfig = {
    ...DEFAULT_SPOTIFY_SYNC_CONFIG,
    ...raw,
    // Object-valued field: shallow-merge so user-added keys win but
    // default keys still cover the standard cases.
    category_mapping: {
      ...DEFAULT_SPOTIFY_SYNC_CONFIG.category_mapping,
      ...(raw.category_mapping ?? {}),
    },
  }
  // Q6=B: clamp polling interval to the allowed range. Don't silently
  // accept zero or absurd values — log so misconfiguration is visible.
  if (
    merged.polling_interval_seconds < POLLING_INTERVAL_SECONDS_MIN ||
    merged.polling_interval_seconds > POLLING_INTERVAL_SECONDS_MAX
  ) {
    console.warn(
      `${new Date().toLocaleString()}: [spotify-sync] polling_interval_seconds=${merged.polling_interval_seconds} out of [${POLLING_INTERVAL_SECONDS_MIN},${POLLING_INTERVAL_SECONDS_MAX}], clamping`,
    )
    merged.polling_interval_seconds = Math.max(
      POLLING_INTERVAL_SECONDS_MIN,
      Math.min(POLLING_INTERVAL_SECONDS_MAX, merged.polling_interval_seconds),
    )
  }
  return merged
}

/** Pull spotify-token section, return undefined if unconfigured. */
export function loadSpotifyTokenStore(mupibox: MupiboxConfig | undefined): SpotifyTokenStore | undefined {
  const raw = mupibox?.spotify
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const clientId = typeof r.clientId === 'string' ? r.clientId : ''
  const accessToken = typeof r.accessToken === 'string' ? r.accessToken : ''
  const refreshToken = typeof r.refreshToken === 'string' ? r.refreshToken : ''
  if (!clientId || !refreshToken) return undefined
  const out: SpotifyTokenStore = {
    clientId,
    accessToken,
    refreshToken,
  }
  if (typeof r.clientSecret === 'string' && r.clientSecret) out.clientSecret = r.clientSecret
  if (Array.isArray(r.tokenScopes)) out.tokenScopes = r.tokenScopes.filter((s): s is string => typeof s === 'string')
  if (typeof r.tokenExpiresAt === 'string') out.tokenExpiresAt = r.tokenExpiresAt
  if (typeof r.tokenUpdatedAt === 'string') out.tokenUpdatedAt = r.tokenUpdatedAt
  return out
}

/** Are the granted scopes sufficient for Smart-Sync? */
export function hasRequiredSyncScopes(store: SpotifyTokenStore | undefined): boolean {
  if (!store?.tokenScopes) return false
  return (
    store.tokenScopes.includes('playlist-read-private') ||
    store.tokenScopes.includes('playlist-read-collaborative')
  )
}
