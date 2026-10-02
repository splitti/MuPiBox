// Phase 14b — REST routes.
// Express router for /api/spotify-sync/*. Mounted from server.ts. Kept
// thin: each handler validates input, calls into the scheduler or
// state-file modules, and translates outcomes to HTTP responses. No
// business logic lives here.
//
// Full OAuth init/callback endpoints come in Phase 14c with the
// Eltern-WebApp setup-wizard — for now we only need status + trigger
// + config to verify the sync loop works end-to-end.

import * as fs from 'node:fs'
import { backupBeforeWrite } from '../file-backup'
import { localOrElternSession } from '../request-guard'
import { promises as fsPromises } from 'node:fs'
import { Router } from 'express'
import { loadSpotifySyncConfig, loadSpotifyTokenStore } from './config-loader'
import { getValidAccessToken, requiresReAuth, tokenStillValid } from './auth'
import { fetchArtistAlbums } from './playlists'
import { spotifyBlock } from '../spotify-block'
import { readStateFile } from './state-file'
import { triggerManualSync } from './scheduler'
import type { RunSyncDeps } from './state-machine'
import {
  POLLING_INTERVAL_SECONDS_MAX,
  POLLING_INTERVAL_SECONDS_MIN,
  type BoxLibraryEntry,
  type SpotifySyncConfig,
} from './types'

export function createSpotifySyncRouter(deps: RunSyncDeps): Router {
  const router = Router()

  /** GET /api/spotify-sync/status
   *  Returns the current sync state, last run info, and auth status. */
  router.get('/status', (_req, res) => {
    const state = readStateFile(deps.stateFilePath)
    const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
    const tokenStore = loadSpotifyTokenStore(deps.getMupiboxConfig())
    res.json({
      enabled: config.enabled,
      polling_interval_seconds: config.polling_interval_seconds,
      playlist_prefix: config.playlist_prefix,
      token: {
        configured: !!tokenStore,
        valid: tokenStore ? tokenStillValid(tokenStore) : false,
        scopes_ok: tokenStore ? !requiresReAuth(tokenStore) : false,
        expires_at: tokenStore?.tokenExpiresAt,
      },
      state,
      // Spotify blocking this box's requests (429) - told to the sync or the display's lists, see spotify-block.ts:
      // the app shows until when
      spotify_block: (() => {
        const block = spotifyBlock()
        return block ? { until: new Date(block.until).toISOString(), source: block.source, reason: block.reason } : null
      })(),
    })
  })

  /** POST /api/spotify-sync/trigger
   *  Manual sync trigger. Source query param `?source=webapp|telegram`. */
  router.post('/trigger', localOrElternSession, async (req, res) => {
    const sourceRaw = typeof req.query.source === 'string' ? req.query.source : 'webapp'
    const source: 'webapp' | 'telegram' = sourceRaw === 'telegram' ? 'telegram' : 'webapp'
    const result = await triggerManualSync(source, deps)
    if (!result.ok) {
      const code = result.status === 'running' ? 409 : 400
      res.status(code).json(result)
      return
    }
    // ok: 'queued' (running now) or 'scheduled' (trailing-edge after cooldown).
    res.status(202).json(result)
  })

  /** GET /api/spotify-sync/config
   *  Returns the merged effective config (defaults + user overrides). */
  router.get('/config', (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const config = loadSpotifySyncConfig(cfg)
    // (whether a prefix was ever chosen: the defaults fill in "MuPiBox", the app suggests the box's name instead)
    const raw = (cfg as unknown as { spotify_sync?: { playlist_prefix?: unknown } } | undefined)?.spotify_sync
    res.json({ ...config, prefix_set: typeof raw?.playlist_prefix === 'string' && raw.playlist_prefix !== '' })
  })

  /**
   * POST /api/spotify-sync/conflicts/promote
   * Flip a manual library entry to `source='spotify-sync'` so the next
   * sync run treats it as managed (and starts updating cover/title/etc.
   * from the Spotify side). This is the conflict-resolution action
   * "Vom Sync verwalten lassen" from architecture §7.2.
   *
   * Body: { identifierField: 'id'|'artistid'|'showid'|'audiobookid'|'playlistid', identifierValue: string }
   *
   * Caller takes the data lock — same pattern as /api/edit. Atomic
   * write via tmp+rename.
   */
  router.post('/conflicts/promote', localOrElternSession, async (req, res) => {
    const body = (req.body ?? {}) as { identifierField?: unknown; identifierValue?: unknown }
    const allowedFields = ['id', 'artistid', 'showid', 'audiobookid', 'playlistid'] as const
    const field = typeof body.identifierField === 'string' ? body.identifierField : ''
    const value = typeof body.identifierValue === 'string' ? body.identifierValue : ''
    if (!(allowedFields as readonly string[]).includes(field) || !value) {
      res.status(400).json({ error: 'identifierField + identifierValue required' })
      return
    }
    const lockResult = deps.acquireDataLock()
    if (lockResult === 'locked') {
      res.status(409).json({ error: 'data.json is locked' })
      return
    }
    if (lockResult === 'error') {
      res.status(500).json({ error: 'data.json lock acquisition failed' })
      return
    }
    try {
      const raw = await fsPromises.readFile(deps.dataFile, 'utf8')
      const library = JSON.parse(raw) as BoxLibraryEntry[]
      if (!Array.isArray(library)) {
        res.status(500).json({ error: 'data.json root is not an array' })
        return
      }
      const target = library.find((entry) => entry[field as keyof BoxLibraryEntry] === value)
      if (!target) {
        res.status(404).json({ error: 'no library entry matches the identifier' })
        return
      }
      // Promote to sync-managed. Sync state fields get filled on the next
      // sync run (added/last_seen timestamps via the apply step) — we
      // just set source here. Empty playlists set so the orphan-removal
      // doesn't immediately drop it on a sync that runs before discovery.
      target.source = 'spotify-sync'
      if (!target.spotify_sync_playlists) target.spotify_sync_playlists = []
      backupBeforeWrite(deps.dataFile)
      const tmp = `${deps.dataFile}.tmp.${process.pid}`
      await fsPromises.writeFile(tmp, `${JSON.stringify(library, null, 2)}\n`, 'utf8')
      fs.renameSync(tmp, deps.dataFile)
      res.json({ ok: true, promoted: { field, value } })
    } catch (err) {
      res.status(500).json({ error: `failed: ${(err as Error).message}` })
    } finally {
      deps.releaseDataLock()
    }
  })

  /** POST /api/spotify-sync/config
   *  Update mutable fields. Body: { enabled?, playlist_prefix?,
   *  polling_interval_seconds?, playlist_explicit_ids?, notify_on_*? }.
   *  Unknown fields are ignored. */
  router.post('/config', localOrElternSession, async (req, res) => {
    const body = req.body as Partial<SpotifySyncConfig>
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'body must be a JSON object' })
      return
    }
    // Validate fields we actually accept from the user. Anything else
    // gets dropped silently (defence-in-depth — Admin-UI / WebApp can't
    // sneak unknown keys in).
    const mutations: Record<string, unknown> = {}
    if (typeof body.enabled === 'boolean') mutations.enabled = body.enabled
    if (typeof body.playlist_prefix === 'string' && body.playlist_prefix.trim().length >= 2) {
      mutations.playlist_prefix = body.playlist_prefix.trim()
    }
    if (typeof body.polling_interval_seconds === 'number') {
      const clamped = Math.max(
        POLLING_INTERVAL_SECONDS_MIN,
        Math.min(POLLING_INTERVAL_SECONDS_MAX, Math.floor(body.polling_interval_seconds)),
      )
      mutations.polling_interval_seconds = clamped
    }
    if (Array.isArray(body.playlist_explicit_ids)) {
      mutations.playlist_explicit_ids = body.playlist_explicit_ids.filter((id): id is string => typeof id === 'string')
    }
    if (typeof body.notify_on_sync === 'boolean') mutations.notify_on_sync = body.notify_on_sync
    if (typeof body.notify_on_conflict === 'boolean') mutations.notify_on_conflict = body.notify_on_conflict
    if (typeof body.notify_on_failure_after_attempts === 'number') {
      mutations.notify_on_failure_after_attempts = Math.max(1, Math.floor(body.notify_on_failure_after_attempts))
    }
    if (Object.keys(mutations).length === 0) {
      res.status(400).json({ error: 'no recognised fields in body' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const existing = ((cfg.spotify_sync as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
      Object.assign(existing, mutations)
      cfg.spotify_sync = existing
    })
    const merged = loadSpotifySyncConfig(deps.getMupiboxConfig())
    res.json({ ok: true, applied: mutations, current: merged })
  })

  /**
   * GET /api/spotify-sync/artist-albums?artistId=<id>  (Phase 17e)
   * Lists an artist's albums in the exact order the sync uses (release_date
   * asc), each tagged with its 1-indexed position, whether it falls inside
   * the subscription's [range_from..range_to] window, and whether it's
   * currently on the per-artist exclude list. Powers the album-level
   * include/exclude UI in the Eltern-WebApp Library section. Read-only.
   */
  router.get('/artist-albums', async (req, res) => {
    const artistId = String(req.query.artistId ?? '').trim()
    if (!/^[A-Za-z0-9]{22}$/.test(artistId)) {
      res.status(400).json({ error: 'invalid artistId (expected 22-char Spotify id)' })
      return
    }
    const tokenStore = loadSpotifyTokenStore(deps.getMupiboxConfig())
    if (!tokenStore) {
      res.status(409).json({ error: 'spotify not configured' })
      return
    }
    const tok = await getValidAccessToken(tokenStore, deps.updateMupiboxConfig)
    if (!tok.ok) {
      res.status(502).json({ error: 'token unavailable', detail: tok.failure.reason })
      return
    }
    const config = loadSpotifySyncConfig(deps.getMupiboxConfig())
    const sub = (config.artists ?? []).find((a) => a.id === artistId)
    let albums
    try {
      albums = await fetchArtistAlbums(artistId, tok.token, sub?.album_types ?? 'album')
    } catch (err) {
      res.status(502).json({ error: `artist albums fetch failed: ${(err as Error).message}` })
      return
    }
    albums.sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    const from = Math.max(1, sub?.range_from ?? 1)
    const to = sub?.range_to && sub.range_to > 0 ? sub.range_to : albums.length
    const excluded = new Set(sub?.exclude_album_ids ?? [])
    res.json({
      artistId,
      subscribed: !!sub,
      range_from: sub?.range_from,
      range_to: sub?.range_to,
      albums: albums.map((al, i) => {
        const position = i + 1
        return {
          id: al.id,
          name: al.name,
          release_date: al.release_date,
          cover: al.images?.[0]?.url,
          position,
          inRange: position >= from && position <= to,
          excluded: !!al.id && excluded.has(al.id),
        }
      }),
    })
  })

  return router
}
