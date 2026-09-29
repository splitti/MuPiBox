import { existsSync, mkdirSync } from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * SD-backed LRU cache for Spotify cover images.
 *
 * Phase-7.6 took the artist-click latency from 8-10 s down to ~3 s.
 * The remaining ~3 s comes from Spotify-CDN image round-trips: Chromium
 * limits parallel connections to i.scdn.co to ~6 (HTTP/1.1), and the
 * Pi sees 50-150 ms per cover. With 276 albums for Benjamin Blümchen,
 * the cover load is the dominant cost after the API responses are
 * cached.
 *
 * This service serves /api/spotify/cover/:imageId from the box's own
 * SD + RAM, with these properties:
 *   - First request fetches from i.scdn.co/image/<id>, persists to
 *     <cacheDir>/<imageId>.jpg, returns the bytes.
 *   - Subsequent requests on the same imageId serve from RAM (hot) or
 *     SD (warm) -- no CDN round-trip, no Chromium parallelism cap.
 *   - LRU eviction: at MAX_FILES (2000, ~100-150 MB) prune the oldest
 *     PRUNE_BATCH (400) by mtime. mem-LRU caps at MEM_CACHE_MAX_BYTES
 *     (auto-sized to 5% of os.freemem(), max 10 MB).
 *   - Concurrent same-key fetches de-duplicate via pendingFetches:
 *     when 200 covers are requested at once, each unique imageId
 *     still hits i.scdn.co only once.
 *   - HTTP 404 from i.scdn.co is short-circuited via negativeCache so
 *     a non-existent image doesn't get re-fetched 6× per page.
 *
 * SD-Wear: writes happen only on first-miss per imageId. After the
 * cache is warm, hits do reads + occasional mtime touches for LRU.
 * Reads are free for SD lifetime; writes are the cost. With 2000
 * covers × ~50 KB = ~100 MB ever-written, sub-trivial.
 */
export class CoverCacheService {
  private cacheDir: string
  private static readonly MAX_FILES = 2000
  private static readonly PRUNE_BATCH = 400
  private static readonly UPSTREAM_TIMEOUT_MS = 5000
  private static readonly NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000

  private memCache = new Map<string, Buffer>()
  private memCacheBytes = 0
  private memCacheMaxBytes: number

  // De-dup map: when N requests for the same imageId arrive while a
  // fetch is in flight, the second through Nth await the same Promise
  // rather than firing N concurrent fetches.
  private pendingFetches = new Map<string, Promise<Buffer | null>>()

  // Track recent 404s so we don't re-hammer i.scdn.co for known-missing
  // images. Key -> expiry-epoch.
  private negativeCache = new Map<string, number>()

  // Observability (no UI yet).
  public stats = { memHits: 0, sdHits: 0, cdnHits: 0, negativeHits: 0, fetchErrors: 0 }

  constructor(baseDir: string) {
    this.cacheDir = path.join(baseDir, 'covers')
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
    this.memCacheMaxBytes = Math.max(
      512 * 1024, // 512 KB floor — at least handful of covers on a Pi 3
      Math.min(
        10 * 1024 * 1024, // 10 MB ceiling — even big covers fit comfortably on Pi 4
        Math.floor(os.freemem() * 0.05),
      ),
    )
  }

  /**
   * Validate that the requested ID is a Spotify image identifier.
   * Spotify CDN paths after /image/ are alphanumeric; observed lengths
   * are 40-60 chars. Reject anything else to prevent path traversal /
   * SSRF via crafted URLs.
   */
  private static isValidImageId(id: string): boolean {
    return /^[A-Za-z0-9]{32,80}$/.test(id)
  }

  async get(imageId: string): Promise<Buffer | null> {
    if (!CoverCacheService.isValidImageId(imageId)) return null

    // RAM
    const mem = this.memCache.get(imageId)
    if (mem !== undefined) {
      // Touch LRU position
      this.memCache.delete(imageId)
      this.memCache.set(imageId, mem)
      this.stats.memHits++
      return mem
    }

    // Negative cache short-circuit
    const negExp = this.negativeCache.get(imageId)
    if (negExp !== undefined) {
      if (Date.now() < negExp) {
        this.stats.negativeHits++
        return null
      }
      this.negativeCache.delete(imageId)
    }

    // SD
    const filePath = path.join(this.cacheDir, `${imageId}.jpg`)
    try {
      const buf = await fsPromises.readFile(filePath)
      // Touch mtime asynchronously for LRU-by-mtime ordering, don't wait
      const now = new Date()
      fsPromises.utimes(filePath, now, now).catch(() => {})
      this.memCachePut(imageId, buf)
      this.stats.sdHits++
      return buf
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`cover-cache SD read error for ${imageId}:`, err)
      }
    }

    // Miss — fetch from i.scdn.co. Dedup concurrent requests.
    const inflight = this.pendingFetches.get(imageId)
    if (inflight) return inflight

    const fetchPromise = this.fetchFromCdn(imageId, filePath).finally(() => {
      this.pendingFetches.delete(imageId)
    })
    this.pendingFetches.set(imageId, fetchPromise)
    return fetchPromise
  }

  private async fetchFromCdn(imageId: string, filePath: string): Promise<Buffer | null> {
    const url = `https://i.scdn.co/image/${imageId}`
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(CoverCacheService.UPSTREAM_TIMEOUT_MS),
      })
      if (response.status === 404) {
        this.negativeCache.set(imageId, Date.now() + CoverCacheService.NEGATIVE_CACHE_TTL_MS)
        return null
      }
      if (!response.ok) {
        console.warn(`cover-cache upstream non-OK for ${imageId}: HTTP ${response.status}`)
        this.stats.fetchErrors++
        return null
      }
      const arrayBuf = await response.arrayBuffer()
      const buf = Buffer.from(arrayBuf)

      // Persist to SD (fire-and-forget — the response can already start
      // serving from RAM while the write completes).
      fsPromises.writeFile(filePath, buf).catch((err) => {
        console.error(`cover-cache SD write error for ${imageId}:`, err)
      })
      this.memCachePut(imageId, buf)
      this.stats.cdnHits++
      // Prune in background -- no need to block the response.
      this.pruneIfNeeded().catch(() => {})
      return buf
    } catch (err) {
      console.error(`cover-cache fetch failed for ${imageId}:`, err)
      this.stats.fetchErrors++
      return null
    }
  }

  private memCachePut(key: string, buf: Buffer): void {
    if (this.memCache.has(key)) {
      const old = this.memCache.get(key) as Buffer
      this.memCacheBytes -= old.length
      this.memCache.delete(key)
    }
    this.memCache.set(key, buf)
    this.memCacheBytes += buf.length

    while (this.memCacheBytes > this.memCacheMaxBytes) {
      const oldest = this.memCache.keys().next().value
      if (oldest === undefined) break
      const oldBuf = this.memCache.get(oldest) as Buffer
      this.memCacheBytes -= oldBuf.length
      this.memCache.delete(oldest)
    }
  }

  private async pruneIfNeeded(): Promise<void> {
    try {
      const files = await fsPromises.readdir(this.cacheDir)
      if (files.length <= CoverCacheService.MAX_FILES) return

      const stats = await Promise.all(
        files.map(async (name) => {
          try {
            const s = await fsPromises.stat(path.join(this.cacheDir, name))
            return { name, mtime: s.mtimeMs }
          } catch {
            return null
          }
        }),
      )
      const valid = stats.filter((s): s is { name: string; mtime: number } => s !== null)
      valid.sort((a, b) => a.mtime - b.mtime)
      const victims = valid.slice(0, CoverCacheService.PRUNE_BATCH)

      for (const v of victims) {
        try {
          await fsPromises.unlink(path.join(this.cacheDir, v.name))
        } catch {
          // ignore — file may have been pruned in parallel
        }
      }
      console.info(`🗑️  Cover-cache pruned: removed ${victims.length} of ${files.length}`)
    } catch (err) {
      console.error('cover-cache prune error:', err)
    }
  }
}
