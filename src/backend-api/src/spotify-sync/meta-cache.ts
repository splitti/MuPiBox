// What the Smart-Sync asks Spotify for that hardly ever changes - an artist's picture, a pinned album's name and cover -
// kept on the SD card (cache/sync-meta.json). Every run (every 15 minutes) asked for all of them again: for Spotify apps
// under its 2026 rules (no more several artists in one request) 40 artist subscriptions were 40 requests in a row every
// 15 minutes, and Spotify answers such runs with a block of hours (seen with a big library, Maik).
// Kept for about 30 days - a new picture of an artist comes within a month - each entry with a day of its own, so they
// are not all asked again in the same run. Written only when something new came.

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface CachedAlbum {
  id?: string
  name?: string
  album_type?: string
  artists?: Array<{ id?: string; name?: string }>
  images?: Array<{ url?: string }>
  release_date?: string
}

interface MetaFile {
  /** artist id → its picture (null: Spotify has none) and until when it counts (ms) */
  artists: Record<string, { url: string | null; until: number }>
  albums: Record<string, { album: CachedAlbum; until: number }>
}

const FILE = path.join(process.cwd(), 'cache', 'sync-meta.json')
const KEEP_MS = 30 * 24 * 60 * 60 * 1000

let meta: MetaFile | undefined
let dirty = false

function load(): MetaFile {
  if (meta) return meta
  try {
    const kept = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<MetaFile>
    meta = { artists: kept.artists ?? {}, albums: kept.albums ?? {} }
  } catch {
    meta = { artists: {}, albums: {} }
  }
  return meta
}

// 24 to 36 days: not all of one run's entries run out together
const until = () => Date.now() + KEEP_MS * (0.8 + Math.random() * 0.4)

/** The kept picture of an artist: a URL, null (Spotify has none), or undefined (not kept / too old). */
export function keptArtistCover(id: string): string | null | undefined {
  const e = load().artists[id]
  return e && e.until > Date.now() ? e.url : undefined
}

export function keepArtistCover(id: string, url: string | undefined): void {
  load().artists[id] = { url: url ?? null, until: until() }
  dirty = true
}

export function keptAlbum(id: string): CachedAlbum | undefined {
  const e = load().albums[id]
  return e && e.until > Date.now() ? e.album : undefined
}

export function keepAlbum(album: CachedAlbum): void {
  if (!album?.id) return
  const slim: CachedAlbum = {
    id: album.id,
    name: album.name,
    album_type: album.album_type,
    artists: album.artists?.map((a) => ({ id: a?.id, name: a?.name })),
    images: album.images?.map((i) => ({ url: i?.url })),
    release_date: album.release_date,
  }
  load().albums[album.id] = { album: slim, until: until() }
  dirty = true
}

/** Written when something new came (once per run). Entries run out long ago are dropped then. */
export function saveMetaCache(): void {
  if (!dirty || !meta) return
  dirty = false
  const old = Date.now() - KEEP_MS
  for (const [id, e] of Object.entries(meta.artists)) if (e.until < old) delete meta.artists[id]
  for (const [id, e] of Object.entries(meta.albums)) if (e.until < old) delete meta.albums[id]
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    const tmp = `${FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(meta))
    fs.renameSync(tmp, FILE)
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [spotify-sync] meta cache not written: ${(err as Error).message}`)
  }
}
