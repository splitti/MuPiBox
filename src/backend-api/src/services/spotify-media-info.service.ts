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
  private bearerToken: string | null = null
  private clientToken: string | null = null
  private playlistHash: string = ''
  private metadataHash: string = ''
  private lastTokenUpdate = 0
  private tokenRefreshInProgress: Promise<void> | null = null
  private cacheDir = path.join(process.cwd(), 'cache', 'spotify')
  private cacheExpiry = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

  // Track ongoing background updates to prevent duplicate requests
  private backgroundUpdates = new Set<string>()

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

    return await puppeteer.launch(launchOptions)
  }

  private async ensureAuthenticated(playlistId: string): Promise<void> {
    // If token is less than 50 minutes old, assume it's still valid
    const tokenAge = Date.now() - this.lastTokenUpdate
    if (this.bearerToken && tokenAge < 50 * 60 * 1000) {
      return
    }

    if (this.tokenRefreshInProgress) {
      return this.tokenRefreshInProgress
    }

    this.tokenRefreshInProgress = (async () => {
      console.info(`🔄 Updating Spotify authentication token using playlist: ${playlistId}`)
      let browser: Browser | null = null
      let page: Page | null = null

      try {
        browser = await this.getBrowser()
        page = await browser.newPage()

        let capturedBearer: string | null = null
        let capturedClient: string | null = null

        page.on('request', (request) => {
          const url = request.url()
          const method = request.method()
          // console.debug(`Request: ${method} ${url}`)

          // Capture the sha256Hash for fetchPlaylistContents or fetchPlaylistMetadata from the request body
          try {
            if (url.includes('api-partner.spotify.com/pathfinder/v2/query') && method === 'POST') {
              const postDataStr = request.postData()
              if (postDataStr) {
                const postData = JSON.parse(postDataStr)
                const operationName = postData.operationName
                const hash = postData.extensions?.persistedQuery?.sha256Hash

                if (hash && typeof hash === 'string') {
                  if (operationName === 'fetchPlaylistContents') {
                    this.playlistHash = hash
                    console.debug(`Captured Spotify playlist sha256Hash (contents): ${hash}`)
                  } else if (
                    operationName === 'fetchPlaylistMetadata' ||
                    operationName === 'fetchPlaylistMetadataV2' ||
                    operationName === 'fetchPlaylist'
                  ) {
                    this.metadataHash = hash
                    console.debug(`Captured Spotify playlist sha256Hash (metadata): ${hash}`)
                  } else {
                    console.debug(`Captured other operation: ${operationName} with hash: ${hash}`)
                  }
                }
              }
            }
          } catch (_e) {
            // Ignore parsing errors
          }

          const headers = request.headers()
          const auth = headers.authorization
          if (auth?.startsWith('Bearer ')) {
            capturedBearer = auth
          }
          const client = headers['client-token']
          if (client) {
            capturedClient = client
          }
        })

        // Use the requested playlist to trigger authentication and get the token
        // This avoids issues with PersistedQueryNotFound when fetching data directly later
        // console.log(`Navigating to: https://open.spotify.com/playlist/${playlistId}`)
        await page.goto(`https://open.spotify.com/playlist/${playlistId}`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        })

        if (capturedBearer && this.metadataHash) {
          this.bearerToken = capturedBearer
          this.clientToken = capturedClient
          this.lastTokenUpdate = Date.now()
          console.info('✅ Successfully captured new Spotify authentication tokens and hashes')
        } else {
          const missing = []
          if (!capturedBearer) missing.push('bearer token')
          if (!this.metadataHash) missing.push('metadata hash')
          throw new Error(`Failed to capture essential Spotify data: ${missing.join(', ')}`)
        }
      } catch (error) {
        console.error('❌ Error updating Spotify token:', error)
        throw error
      } finally {
        if (page) await page.close().catch(() => {})
        if (browser) await browser.close().catch(() => {})
        this.tokenRefreshInProgress = null
      }
    })()

    return this.tokenRefreshInProgress
  }

  /**
   * Fetch only metadata for a playlist
   */
  private async fetchPlaylistMetadata(playlistId: string, headers: Record<string, string>): Promise<any> {
    const variables = {
      uri: `spotify:playlist:${playlistId}`,
      offset: 0,
      limit: 100,
      enableWatchFeedEntrypoint: true,
    }

    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: this.metadataHash,
      },
    }

    if (!extensions.persistedQuery.sha256Hash) {
      throw new Error('No Spotify metadata hash available. Authentication may have failed.')
    }

    const url = 'https://api-partner.spotify.com/pathfinder/v2/query'
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variables,
        operationName: 'fetchPlaylistMetadata',
        extensions,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        this.bearerToken = null
        this.lastTokenUpdate = 0
      }
      throw new Error(`Spotify Metadata API error: ${response.status}`)
    }

    return await response.json()
  }

  /**
   * Fetch contents (tracks) for a playlist with pagination
   */
  private async fetchPlaylistContents(
    playlistId: string,
    headers: Record<string, string>,
    offset = 0,
    limit = 100,
  ): Promise<PathfinderResponse> {
    const variables = {
      uri: `spotify:playlist:${playlistId}`,
      offset,
      limit,
    }

    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: this.playlistHash || this.metadataHash,
      },
    }

    if (!extensions.persistedQuery.sha256Hash) {
      throw new Error('No Spotify playlist hash available. Authentication may have failed.')
    }

    const url = 'https://api-partner.spotify.com/pathfinder/v2/query'
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variables,
        operationName: 'fetchPlaylistContents',
        extensions,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        this.bearerToken = null
        this.lastTokenUpdate = 0
      }
      throw new Error(`Spotify Contents API error: ${response.status}`)
    }

    return (await response.json()) as PathfinderResponse
  }

  /**
   * Synchronous fetch that actually hits Spotify (used for both blocking and background updates)
   */
  private async fetchPlaylistDataSync(playlistId: string, isBackground = false): Promise<SpotifyPlaylistData> {
    const logPrefix = isBackground ? '[BG]' : '[FG]'

    try {
      console.debug(`${logPrefix} Fetching playlist data from Spotify: ${playlistId}`)

      await this.ensureAuthenticated(playlistId)

      if (!this.bearerToken) {
        throw new Error('No bearer token available')
      }

      const headers: Record<string, string> = {
        accept: 'application/json',
        'accept-language': 'de',
        'app-platform': 'WebPlayer',
        authorization: this.bearerToken,
        'content-type': 'application/json;charset=UTF-8',
        origin: 'https://open.spotify.com',
        referer: 'https://open.spotify.com/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      }

      if (this.clientToken) {
        headers['client-token'] = this.clientToken
      }

      // 1. Fetch Metadata
      const metadataData = await this.fetchPlaylistMetadata(playlistId, headers)

      // 2. Fetch Contents (Tracks) - Fetch first 100 tracks
      const contentsData = await this.fetchPlaylistContents(playlistId, headers, 0, 100)

      const totalTracks = contentsData.data?.playlistV2?.content?.totalCount || 0
      let fetchedTracksCount = contentsData.data?.playlistV2?.content?.items?.length || 0

      // Fetch more tracks if needed (Spotify typically allows up to 100 per request)
      while (fetchedTracksCount < totalTracks) {
        console.debug(`${logPrefix} Fetching more tracks for ${playlistId} (${fetchedTracksCount}/${totalTracks})`)
        const nextBatch = await this.fetchPlaylistContents(playlistId, headers, fetchedTracksCount, 100)
        const nextItems = nextBatch.data?.playlistV2?.content?.items || []

        if (nextItems.length === 0) break // Should not happen if totalCount is correct

        contentsData.data.playlistV2.content.items.push(...nextItems)
        fetchedTracksCount += nextItems.length
      }

      // Merge data: Use metadata for playlist info, and contents for tracks
      const mergedData: PathfinderResponse = {
        data: {
          playlistV2: {
            ...metadataData.data?.playlistV2,
            content: contentsData.data?.playlistV2?.content || metadataData.data?.playlistV2?.content,
          },
        },
      }

      if (!mergedData.data?.playlistV2) {
        throw new Error('Invalid response data structure from Spotify API')
      }

      const playlistData = this.transformPathfinderData(mergedData)
      await this.saveToCache(playlistId, playlistData)
      return playlistData
    } catch (error) {
      console.error(`${logPrefix} Error fetching playlist data:`, error)
      throw error
    }
  }

  private async closeBrowser(): Promise<void> {
    // Browser is now closed immediately after use in ensureAuthenticated
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
          ? playlistData.images.items[0].sources.map((source: any) => ({
              url: source.url,
              width: source.width,
              height: source.height,
            }))
          : [],
      owner: {
        display_name: playlistData.ownerV2?.data?.name || playlistData.owner?.data?.name || 'Unknown',
        uri: playlistData.ownerV2?.data?.uri || playlistData.owner?.data?.uri || '',
        external_urls: {
          spotify: `https://open.spotify.com/user/${this.extractIdFromUri(playlistData.ownerV2?.data?.uri || playlistData.owner?.data?.uri)}`,
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
    if (!uri) {
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
