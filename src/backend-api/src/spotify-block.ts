// Spotify blocking this box's Spotify app ("too many requests", 429 with a Retry-After of up to many hours): one
// block for everything that asks Spotify's Web API - the display's lists (services/spotify-api.service.ts) and the
// Smart-Sync (spotify-sync/state-machine.ts) use the same Spotify app, and each request during a block only keeps it
// going. Kept in /tmp (RAM): it outlasts a restart of the server, not one of the box.

import * as fs from 'node:fs'

const BLOCK_FILE = '/tmp/.spotify_block.json'

export interface SpotifyBlock {
  /** until when (ms since 1970) */
  until: number
  /** who was told: 'display' (the lists of the box) or 'sync' */
  source: string
  /** Spotify's answer, e.g. "429 from /artists/…/albums (Spotify: wait 55076 s)" */
  reason: string
  /** when Spotify said so (ms) */
  since: number
}

let current: SpotifyBlock | null = null
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const kept = JSON.parse(fs.readFileSync(BLOCK_FILE, 'utf8')) as SpotifyBlock
    if (kept && typeof kept.until === 'number' && kept.until > Date.now()) current = kept
  } catch {
    // none
  }
}

/** Spotify blocks until `until` (ms): kept unless a block that lasts longer is known already. */
export function noteSpotifyBlock(until: number, source: string, reason: string): void {
  load()
  if (!(until > Date.now())) return
  if (current && current.until >= until) return
  current = { until, source, reason, since: Date.now() }
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify(current))
  } catch {
    // only for this run of the server then
  }
}

/** The block in force, or null. */
export function spotifyBlock(): SpotifyBlock | null {
  load()
  if (current && current.until <= Date.now()) {
    current = null
    try {
      fs.rmSync(BLOCK_FILE, { force: true })
    } catch {
      // gone already
    }
  }
  return current
}
