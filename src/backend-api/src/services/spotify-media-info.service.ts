import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { Browser, Page } from 'puppeteer'
import type {
  PathfinderResponse,
  SpotifyPlaylistData,
  SpotifyPlaylistMetadata,
} from '../models/spotify-media-info.model'
import type { SpotifyAlbum, SpotifyArtist, SpotifyTrack } from '../models/spotify-shared.model'

export class SpotifyMediaInfo {
  private browser: Browser | null = null
  private page: Page | null = null // Main page for synchronous requests
  private cacheDir = path.join(process.cwd(), 'cache', 'spotify')
  private cacheExpiry = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

  // Track ongoing background updates to prevent duplicate requests
  private backgroundUpdates = new Set<string>()
  // Track background pages to clean them up properly
  private backgroundPages = new Set<Page>()

  // Queue for background updates to prevent resource exhaustion
  private backgroundQueue: Array<{ id: string; type: 'playlist' }> = []
  private isProcessingBackground = false
  private readonly maxConcurrentBackground = 3 // Limit concurrent background updates

  // Queue for foreground requests to prevent concurrent access to main page
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

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      // In production (DietPi), use system Chromium instead of bundled version
      const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor',
          '--disable-images',
          '--disable-javascript-harmony-shipping',
          '--disable-extensions-http-throttling',
        ],
      }

      // Use system Chromium in production environment
      if (isProduction) {
        // Try common Chromium paths on DietPi/Debian systems
        const chromiumPaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
        ]

        const fs = await import('node:fs')
        for (const path of chromiumPaths) {
          if (fs.existsSync(path)) {
            launchOptions.executablePath = path
            console.info(`Using system Chromium at: ${path}`)
            break
          }
        }

        if (!launchOptions.executablePath) {
          console.warn('No system Chromium found, falling back to bundled version')
        }
      }

      this.browser = await puppeteer.launch(launchOptions)
    }
    return this.browser
  }

  private async getPage(isBackground = false): Promise<Page> {
    if (isBackground) {
      // Create a separate page instance for background updates to avoid conflicts
      const browser = await this.getBrowser()
      const backgroundPage = await browser.newPage()

      // Set user agent and viewport
      await backgroundPage.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      )
      await backgroundPage.setViewport({ width: 1366, height: 768 })

      // Track background page for cleanup
      this.backgroundPages.add(backgroundPage)

      console.debug('🔧 Created dedicated background page for update')
      return backgroundPage
    }

    // Main page for synchronous requests
    if (!this.page) {
      const browser = await this.getBrowser()
      this.page = await browser.newPage()

      // Set user agent and viewport once
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      )
      await this.page.setViewport({ width: 1366, height: 768 })
    }
    return this.page
  }

  private async closeBrowser(): Promise<void> {
    // Close all background pages first
    for (const backgroundPage of this.backgroundPages) {
      try {
        await backgroundPage.close()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn('Error closing background page:', errorMessage)
      }
    }
    this.backgroundPages.clear()

    // Close main page
    if (this.page) {
      await this.page.close()
      this.page = null
    }

    // Close browser
    if (this.browser) {
      await this.browser.close()
      this.browser = null
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

  /**
   * Synchronous fetch that actually hits Spotify (used for both blocking and background updates)
   */
  private async fetchPlaylistDataSync(playlistId: string, isBackground = false): Promise<SpotifyPlaylistData> {
    const page = await this.getPage(isBackground)
    const logPrefix = isBackground ? '[BG]' : '[FG]'

    try {
      // Clear any existing listeners and state
      page.removeAllListeners('response')

      // Set up response interception for pathfinder API
      let pathfinderData: PathfinderResponse | null = null

      // Track all Spotify API calls for debugging
      page.on('response', async (response) => {
        const url = response.url()

        // Log all Spotify API calls
        if (
          url.includes('open.spotify.com') ||
          url.includes('spotify.com/api') ||
          url.includes('api-partner.spotify.com')
        ) {
          console.debug(`Spotify API call: ${url}`)
        }

        if (url.includes('api-partner.spotify.com/pathfinder') && url.includes('query')) {
          try {
            console.debug(`🎯 Found pathfinder response: ${url}`)
            const responseData = await response.json()
            console.debug('Response data keys:', Object.keys(responseData))

            if (responseData.data?.playlistV2) {
              // Only capture if we don't already have data, or if this data has more content
              const hasContent = responseData.data.playlistV2.name && responseData.data.playlistV2.name !== 'undefined'
              if (!pathfinderData || hasContent) {
                pathfinderData = responseData as PathfinderResponse
                console.debug(
                  '✅ Successfully captured pathfinder data for playlist:',
                  responseData.data.playlistV2.name,
                )

                // If we have a named playlist, we can stop looking
                if (hasContent) {
                  console.debug('🎯 Found complete playlist data, using this response')
                  // We can break early since we have the data we need
                }
              }
            } else if (responseData.data) {
              console.debug('📊 Response data structure:', Object.keys(responseData.data))
              // Only log a sample if it's not color data
              if (!responseData.data.extractedColors) {
                console.debug('Sample response:', JSON.stringify(responseData, null, 2).substring(0, 1000))
              }
            } else {
              console.debug('❌ No data property in response')
            }
          } catch (error) {
            console.error('Error parsing pathfinder response:', error)
          }
        }
      })

      // Navigate to the Spotify playlist URL
      const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`
      console.debug(`${logPrefix} Navigating to: ${spotifyUrl}`)

      await page.goto(spotifyUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })

      // Wait for the playlist to load and pathfinder data to be captured
      console.debug(`${logPrefix} Waiting for playlist page to load...`)

      try {
        await page.waitForSelector('[data-testid="playlist-page"]', { timeout: 10000 })
        console.debug(`${logPrefix} Playlist page loaded`)
      } catch (_error) {
        console.debug(`${logPrefix} Playlist page selector not found, trying alternative approach`)
        // Wait for title instead
        await page.waitForSelector('title', { timeout: 5000 })
      }

      console.debug(`${logPrefix} Waiting for network requests to complete...`)
      // Wait for pathfinder data with shorter timeout
      await new Promise((resolve) => setTimeout(resolve, 3000))
      console.debug(`${logPrefix} Network wait completed`)

      if (!pathfinderData) {
        throw new Error('Could not capture pathfinder data from Spotify')
      }

      // Transform the pathfinder response to our format
      const playlistData = this.transformPathfinderData(pathfinderData)

      // Save to cache for next time
      await this.saveToCache(playlistId, playlistData)

      return playlistData
    } catch (error) {
      console.error(`${logPrefix} Error fetching playlist data:`, error)
      throw error
    } finally {
      // Clean up listeners
      page.removeAllListeners('response')

      // Close background pages after use to free resources
      if (isBackground && this.backgroundPages.has(page)) {
        console.debug('🔧 Closing background page after update')
        await page.close()
        this.backgroundPages.delete(page)
      }
      // Keep main page open for reuse
    }
  }

  private transformPathfinderData(pathfinderData: PathfinderResponse): SpotifyPlaylistData {
    const playlistData = pathfinderData.data.playlistV2

    // Transform playlist metadata
    const playlist: SpotifyPlaylistMetadata = {
      name: playlistData.name || 'Unknown Playlist',
      description: playlistData.description || '',
      uri: playlistData.uri || '',
      external_urls: {
        spotify: `https://open.spotify.com/playlist/${this.extractIdFromUri(playlistData.uri)}`,
      },
      images:
        playlistData.images?.items?.length > 0
          ? playlistData.images.items[0].sources.map((source) => ({
              url: source.url,
              width: source.width,
              height: source.height,
            }))
          : [],
      owner: {
        display_name: playlistData.owner?.data?.name || 'Unknown',
        uri: playlistData.owner?.data?.uri || '',
        external_urls: {
          spotify: `https://open.spotify.com/user/${this.extractIdFromUri(playlistData.owner?.data?.uri)}`,
        },
      },
      public: true,
      tracks: {
        total: playlistData.content?.totalCount || 0,
      },
    }

    // Transform tracks
    const tracks: SpotifyTrack[] = (playlistData.content?.items || [])
      .map((item) => {
        const trackData = item?.itemV2?.data

        if (!trackData) {
          console.warn('Invalid track data:', item)
          return null
        }

        const artists: SpotifyArtist[] = (trackData.artists?.items || []).map((artistItem) => ({
          name: artistItem?.profile?.name || 'Unknown Artist',
          uri: artistItem?.uri || '',
          external_urls: {
            spotify: `https://open.spotify.com/artist/${this.extractIdFromUri(artistItem?.uri)}`,
          },
        }))

        const album: SpotifyAlbum = {
          name: trackData.albumOfTrack?.name || 'Unknown Album',
          uri: trackData.albumOfTrack?.uri || '',
          external_urls: {
            spotify: `https://open.spotify.com/album/${this.extractIdFromUri(trackData.albumOfTrack?.uri)}`,
          },
          images: (trackData.albumOfTrack?.coverArt?.sources || []).map((source) => ({
            url: source.url,
            width: source.width,
            height: source.height,
          })),
        }

        return {
          name: trackData.name || 'Unknown Track',
          uri: trackData.uri || '',
          duration_ms: trackData.duration?.totalMilliseconds || 0,
          artists,
          album,
          external_urls: {
            spotify: `https://open.spotify.com/track/${this.extractIdFromUri(trackData.uri)}`,
          },
        }
      })
      .filter((track) => track !== null) as SpotifyTrack[]

    return {
      playlist,
      tracks,
    }
  }

  private extractIdFromUri(uri: string | undefined): string {
    if (!uri || typeof uri !== 'string') {
      console.warn('Invalid URI provided to extractIdFromUri:', uri)
      return ''
    }
    return uri.split(':').pop() || ''
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

    // Close browser and all pages
    await this.closeBrowser()
  }
}
