// Spotify blocking this box's Spotify app ("too many requests", 429 with a Retry-After of up to many hours): one
// block for everything that asks Spotify's Web API - the display's lists (services/spotify-api.service.ts) and the
// Smart-Sync (spotify-sync/state-machine.ts) use the same Spotify app, and each request during a block only keeps it
// going. Kept on the SD card (cache/spotify-block.json, written only when Spotify sets a block): it outlasts a restart
// of the box too - kept in RAM before, the box asked Spotify again right after booting and was blocked anew.
// It ends with its time (nothing asks Spotify before - the first answer after it is the sign), or when another
// Spotify app (Client ID) is entered in the app.

import * as fs from 'node:fs'
import * as path from 'node:path'

const BLOCK_FILE = path.join(process.cwd(), 'cache', 'spotify-block.json')
// (where the block was kept before: taken over once)
const OLD_BLOCK_FILE = '/tmp/.spotify_block.json'

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

function readFile(file: string): SpotifyBlock | null {
  try {
    const kept = JSON.parse(fs.readFileSync(file, 'utf8')) as SpotifyBlock
    return kept && typeof kept.until === 'number' && kept.until > Date.now() ? kept : null
  } catch {
    return null
  }
}

function write(): void {
  try {
    if (current) {
      fs.mkdirSync(path.dirname(BLOCK_FILE), { recursive: true })
      const tmp = `${BLOCK_FILE}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(current))
      fs.renameSync(tmp, BLOCK_FILE)
    } else {
      fs.rmSync(BLOCK_FILE, { force: true })
    }
  } catch {
    // only for this run of the server then
  }
}

function load(): void {
  if (loaded) return
  loaded = true
  current = readFile(BLOCK_FILE)
  const old = readFile(OLD_BLOCK_FILE)
  if (old && (!current || old.until > current.until)) current = old
  // (kept here now; a block whose time is over is removed)
  write()
  try {
    fs.rmSync(OLD_BLOCK_FILE, { force: true })
  } catch {
    // gone already
  }
}

/** Spotify blocks until `until` (ms): kept unless a block that lasts longer is known already. */
export function noteSpotifyBlock(until: number, source: string, reason: string): void {
  load()
  if (!(until > Date.now())) return
  if (current && current.until >= until) return
  current = { until, source, reason, since: Date.now() }
  write()
}

/** The block in force, or null (one whose time is over is removed). */
export function spotifyBlock(): SpotifyBlock | null {
  load()
  if (current && current.until <= Date.now()) {
    current = null
    write()
  }
  return current
}

/** The block is over before its time: Spotify answered again, or another Spotify app was entered. */
export function clearSpotifyBlock(why: string): void {
  load()
  if (!current) return
  console.log(`${new Date().toLocaleString()}: [Spotify] block until ${new Date(current.until).toLocaleString()} lifted: ${why}`)
  current = null
  write()
}
