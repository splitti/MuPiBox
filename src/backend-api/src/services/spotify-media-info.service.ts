import fs from 'node:fs'
import path from 'node:path'
import type { SpotifyPlaylistData, SpotifyPlaylistMetadata } from '../models/spotify-media-info.model'
import type { SpotifyTrack } from '../models/spotify-shared.model'

export class SpotifyMediaInfo {
  private cacheDir = path.join(process.cwd(), 'cache', 'spotify')
  private cacheExpiry = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

  // Track ongoing background updates to prevent duplicate requests
  private backgroundUpdates = new Set<string>()

  // Queue for background updates to prevent resource exhaustion
  private backgroundQueue: Array<{ id: string; type: 'playlist' }> = []
  private isProcessingBackground = false
  private readonly maxConcurrentBackground = 3 // Limit concurrent background updates

  // Queue for foreground requests
  private foregroundQueue: Array<{
    id: string
    type: 'playlist'
    resolve: (data: SpotifyPlaylistData) => void
    reject: (error: Error) => void
  }> = []
  private isProcessingForeground = false

  // Track pending foreground requests to enable de-duplication
  private pendingForegroundRequests = new Map<
    string,
    {
      promise: Promise<SpotifyPlaylistData>
      subscribers: Array<{
        resolve: (data: SpotifyPlaylistData) => void
        reject: (error: Error) => void
      }>
    }
  >()

  /**
   * Synchronous fetch using Spotify Embed URL (used for both blocking and background updates)
   */
  private async fetchPlaylistDataSync(playlistId: string, isBackground = false): Promise<SpotifyPlaylistData> {
    const logPrefix = isBackground ? '[BG]' : '[FG]'

    try {
      console.debug(`${logPrefix} Fetching playlist data from Spotify Embed: ${playlistId}`)

      const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`
      const response = await fetch(embedUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        },
      })

      if (!response.ok) {
        throw new Error(`Spotify Embed API error: ${response.status}`)
      }

      const html = await response.text()
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)

      if (!match) {
        throw new Error('Could not find __NEXT_DATA__ script tag in Spotify Embed HTML')
      }

      const nextData = JSON.parse(match[1])
      const playlistData = this.transformEmbedData(nextData)

      await this.saveToCache(playlistId, playlistData)
      return playlistData
    } catch (error) {
      console.error(`${logPrefix} Error fetching playlist data:`, error)
      throw error
    }
  }

  private transformEmbedData(nextData: any): SpotifyPlaylistData {
    const entity = nextData.props?.pageProps?.state?.data?.entity
    if (!entity) {
      throw new Error('Invalid data structure: missing entity in NEXT_DATA')
    }

    // Transform playlist metadata
    const playlist: SpotifyPlaylistMetadata = {
      name: entity.name || entity.title || 'Unknown Playlist',
      images:
        entity.coverArt?.sources?.length > 0
          ? entity.coverArt.sources.map((source: any) => ({
              url: source.url,
              width: source.width || 0,
              height: source.height || 0,
            }))
          : [],
      tracks: {
        total: entity.trackList?.length || 0,
      },
    }

    // Transform tracks
    const tracks: SpotifyTrack[] = (entity.trackList || []).map((item: any) => {
      // Extract artist from subtitle if available
      const artists = item.subtitle
        ? item.subtitle.split(/[,;]\s*|\s*,\s*| /).map((name: string) => ({
            name: name.trim(),
            uri: '', // URI not available in embed data for individual artists
          }))
        : []

      return {
        name: item.title || 'Unknown Track',
        uri: item.uri || '',
        duration_ms: item.duration || 0,
        artists: artists,
        album: {
          name: '',
          uri: '',
          images: [],
        },
      }
    })

    return {
      playlist,
      tracks,
    }
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private getCacheFilePath(id: string, type: 'playlist'): string {
    return path.join(this.cacheDir, `${type}_${id}.json`)
  }

  private async getFromCache(
    id: string,
    type: 'playlist',
  ): Promise<{ data: SpotifyPlaylistData | null; isStale: boolean }> {
    try {
      const cacheFile = this.getCacheFilePath(id, type)

      if (!fs.existsSync(cacheFile)) {
        return { data: null, isStale: false }
      }

      const stats = fs.statSync(cacheFile)
      const isStale = Date.now() - stats.mtime.getTime() > this.cacheExpiry

      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))

      if (isStale) {
        console.info(`📦 Cache stale for ${type} ${id}, will update in background`)
      } else {
        console.info(`✅ Fresh cache hit for ${type} ${id}`)
      }

      return { data: cachedData, isStale }
    } catch (error) {
      console.error(`Error reading cache for ${type} ${id}:`, error)
      return { data: null, isStale: false }
    }
  }

  private async saveToCache(id: string, data: SpotifyPlaylistData): Promise<void> {
    try {
      this.ensureCacheDir()

      const type = 'playlist'
      const cacheFile = this.getCacheFilePath(id, type)

      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2))
      console.info(`💾 Cached ${type} data for ${id}`)
    } catch (error) {
      console.error(`Error saving cache for ${id}:`, error)
    }
  }

  /**
   * Get cached playlist data without triggering any fetching.
   * Returns null if no cache exists.
   */
  public async getCachedPlaylistData(playlistId: string): Promise<SpotifyPlaylistData | null> {
    const cacheResult = await this.getFromCache(playlistId, 'playlist')
    return cacheResult.data
  }

  public async fetchPlaylistData(playlistId: string): Promise<SpotifyPlaylistData> {
    // Check cache first (stale-while-revalidate pattern)
    const cacheResult = await this.getFromCache(playlistId, 'playlist')

    if (cacheResult.data) {
      // Return cached data immediately, even if stale
      if (cacheResult.isStale) {
        // Trigger background update if cache is stale and not already updating
        this.triggerBackgroundUpdate(playlistId, 'playlist')
      }
      return cacheResult.data as SpotifyPlaylistData
    }

    // No cache exists - queue for synchronous processing
    console.info(`🔍 No cache for playlist ${playlistId}, adding to foreground queue...`)
    return this.queueForegroundRequest(playlistId, 'playlist') as Promise<SpotifyPlaylistData>
  }

  /**
   * Queue foreground request with de-duplication support
   */
  private async queueForegroundRequest(id: string, type: 'playlist'): Promise<SpotifyPlaylistData> {
    // Check if there's already a pending request for this item
    const existingRequest = this.pendingForegroundRequests.get(id)
    if (existingRequest) {
      console.debug(
        `🔗 Joining existing foreground request for ${type} ${id} (${existingRequest.subscribers.length + 1} total subscribers)`,
      )

      // Subscribe to existing request
      return new Promise((resolve, reject) => {
        existingRequest.subscribers.push({ resolve, reject })
      })
    }

    // No existing request - create new one
    return new Promise((resolve, reject) => {
      const subscribers = [{ resolve, reject }]

      // Create the actual promise that will be executed
      const requestPromise = new Promise<SpotifyPlaylistData>((promiseResolve, promiseReject) => {
        const queueEntry = {
          id,
          type,
          resolve: promiseResolve,
          reject: promiseReject,
        }

        this.foregroundQueue.push(queueEntry)
        console.debug(`📋 Queued new foreground request for ${type} ${id} (position ${this.foregroundQueue.length})`)

        // Process queue if not already processing
        if (!this.isProcessingForeground) {
          this.processForegroundQueue()
        }
      })

      // Track this request for de-duplication
      this.pendingForegroundRequests.set(id, {
        promise: requestPromise,
        subscribers,
      })

      // Handle completion/failure for all subscribers
      requestPromise
        .then((data) => {
          console.debug(`✅ Resolving ${subscribers.length} subscribers for ${type} ${id}`)
          for (const sub of subscribers) {
            sub.resolve(data)
          }
        })
        .catch((error) => {
          console.error(
            `❌ Rejecting ${subscribers.length} subscribers for ${type} ${id}:`,
            error instanceof Error ? error.message : String(error),
          )
          for (const sub of subscribers) {
            sub.reject(error)
          }
        })
        .finally(() => {
          // Clean up tracking
          this.pendingForegroundRequests.delete(id)
        })
    })
  }

  /**
   * Process foreground queue sequentially
   */
  private async processForegroundQueue(): Promise<void> {
    if (this.isProcessingForeground) {
      return // Already processing
    }

    this.isProcessingForeground = true
    console.debug(`🏃 Starting foreground queue processing (${this.foregroundQueue.length} requests)`)

    while (this.foregroundQueue.length > 0) {
      const queueEntry = this.foregroundQueue.shift()
      if (!queueEntry) break
      const { id, type, resolve, reject } = queueEntry

      try {
        console.debug(`⚡ Processing foreground request for ${type} ${id} (${this.foregroundQueue.length} remaining)`)

        const data: SpotifyPlaylistData = await this.fetchPlaylistDataSync(id, false) // false = foreground

        resolve(data)
        console.debug(`✅ Completed foreground request for ${type} ${id}`)
      } catch (error) {
        console.error(
          `❌ Failed foreground request for ${type} ${id}:`,
          error instanceof Error ? error.message : String(error),
        )
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    this.isProcessingForeground = false
    console.debug('🏁 Finished processing foreground queue')
  }

  /**
   * Trigger background cache update if not already in progress
   */
  private triggerBackgroundUpdate(id: string, type: 'playlist'): void {
    if (this.backgroundUpdates.has(id)) {
      console.debug(`🔄 Background update already in progress for ${type} ${id}`)
      return
    }

    if (this.backgroundQueue.some((item) => item.id === id && item.type === type)) {
      console.debug(`📋 Background update already queued for ${type} ${id}`)
      return
    }

    // Add to background queue instead of running immediately
    this.backgroundQueue.push({ id, type })
    console.debug(`📋 Queued background update for ${type} ${id} (position ${this.backgroundQueue.length})`)

    // Start processing queue if not already running
    if (!this.isProcessingBackground) {
      this.processBackgroundQueue()
    }
  }

  /**
   * Process background queue with controlled concurrency
   */
  private async processBackgroundQueue(): Promise<void> {
    if (this.isProcessingBackground) {
      return
    }

    this.isProcessingBackground = true
    console.debug(`🔄 Starting background queue processing (${this.backgroundQueue.length} updates pending)`)

    // Process queue with limited concurrency
    const concurrentPromises = new Set<Promise<void>>()

    while (this.backgroundQueue.length > 0 || concurrentPromises.size > 0) {
      // Start new background updates up to the concurrency limit
      while (this.backgroundQueue.length > 0 && concurrentPromises.size < this.maxConcurrentBackground) {
        const queueItem = this.backgroundQueue.shift()
        if (!queueItem) break

        const { id, type } = queueItem

        if (this.backgroundUpdates.has(id)) {
          console.debug(`⏭️ Skipping ${type} ${id} - already in progress`)
          continue
        }

        console.debug(
          `🚀 Starting background update for ${type} ${id} (${concurrentPromises.size + 1}/${this.maxConcurrentBackground} slots)`,
        )
        this.backgroundUpdates.add(id)

        const updatePromise = this.fetchPlaylistDataSync(id, true)
          .then(() => {
            console.debug(`✅ [BG] Background update completed for ${type} ${id}`)
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error(`❌ [BG] Background update failed for ${type} ${id}:`, errorMessage)
          })
          .finally(() => {
            this.backgroundUpdates.delete(id)
            concurrentPromises.delete(updatePromise)
          })

        concurrentPromises.add(updatePromise)
      }

      // Wait for at least one update to complete before checking the queue again
      if (concurrentPromises.size > 0) {
        await Promise.race(Array.from(concurrentPromises))
      }
    }

    this.isProcessingBackground = false
    console.debug('🏁 Finished processing background queue')
  }

  public async dispose(): Promise<void> {
    // Clear any ongoing background updates
    this.backgroundUpdates.clear()
    this.backgroundQueue.length = 0 // Clear background queue
    this.isProcessingBackground = false

    // Clear and reject any pending foreground requests
    while (this.foregroundQueue.length > 0) {
      const queueEntry = this.foregroundQueue.shift()
      if (queueEntry) {
        queueEntry.reject(new Error('Service is being disposed'))
      }
    }
    this.isProcessingForeground = false

    // Clear and reject all pending foreground request subscribers
    for (const [playlistId, pendingRequest] of this.pendingForegroundRequests) {
      console.debug(`🧹 Cleaning up ${pendingRequest.subscribers.length} subscribers for playlist ${playlistId}`)
      for (const sub of pendingRequest.subscribers) {
        sub.reject(new Error('Service is being disposed'))
      }
    }
    this.pendingForegroundRequests.clear()
  }
}
