import fs from 'node:fs'
import path from 'node:path'
import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import type { ServerConfig } from '../models/server.model'
import type {
  CachedSpotifyData,
  SpotifyApiAlbumDetails,
  SpotifyApiAlbumSearchResult,
  SpotifyApiArtistAlbumsResult,
  SpotifyApiArtistDetails,
  SpotifyApiAudiobookDetails,
  SpotifyApiEpisodeDetails,
  SpotifyApiPlaylistDetails,
  SpotifyApiShowDetails,
  SpotifyApiShowEpisodesResult,
} from '../models/spotify-api.model'

export class SpotifyApiService {
  private spotifyApi: SpotifyApi
  private cacheDir = path.join(process.cwd(), 'cache', 'spotify-api')
  private cacheExpiry = {
    static: 7 * 24 * 60 * 60 * 1000, // 7 days for Albums, Shows, Artists, etc.
    semiStatic: 24 * 60 * 60 * 1000, // 24 hours for Artist Albums, Show Episodes
    dynamic: 2 * 60 * 60 * 1000, // 2 hours for Playlists
    search: 6 * 60 * 60 * 1000, // 6 hours for Search Results
  }

  // Rate limiting: every request reserves the next free slot before it runs, which
  // keeps the pacing correct even when several queue workers run in parallel. 300ms
  // (~3 requests/s) stays under the rolling 30 second window Spotify grants apps in
  // development mode; with the serial queue the latency paced the requests anyway,
  // with workers the slot has to do it.
  private nextRequestSlot = 0
  private readonly minRequestInterval = 300
  // First pause after a rate limit answer; doubles per attempt (2s, 4s, 8s). More
  // attempts are not worth blocking a queue worker for - a lookup that still fails
  // is retried by the frontend's media refresh a few seconds later anyway.
  private readonly rateLimitBackoffMs = 2000
  private readonly maxRateLimitRetries = 3
  // Once a request has given up on the rate limit, the window is exhausted for
  // everyone: remaining lookups fail fast instead of each burning through the same
  // backoffs, and the frontend asks again after the cool-down.
  private readonly rateLimitCooldownMs = 20000
  private rateLimitUntil = 0

  // Upper bound for one Spotify request (API call or token refresh). Without it a
  // box without internet keeps the sequential request queue hanging on the first
  // request and every other lookup behind it never answers.
  private readonly requestTimeoutMs = 10000
  // A playlist is paged through several requests; each page is still cut off after
  // requestTimeoutMs by the fetch signal.
  private readonly playlistTimeoutMs = 60000
  // After a network failure every uncached request fails immediately for this long,
  // so an offline box answers all lookups at once instead of one timeout at a time.
  private readonly networkFailureBackoffMs = 30000
  private networkFailureUntil = 0

  // Playlists whose track list the API refused (e.g. Spotify-owned playlists for apps
  // in development mode) are not retried on every media list load.
  private readonly playlistApiDeniedMs = 6 * 60 * 60 * 1000
  private playlistApiDeniedUntil = new Map<string, number>()

  // Queue management for concurrent requests
  private requestQueue: Array<{
    key: string
    operation: () => Promise<any>
    resolve: (data: any) => void
    reject: (error: Error) => void
  }> = []
  private isProcessingQueue = false
  // How many uncached lookups run at the same time. The rate limiter keeps the
  // Spotify request spacing, so this mainly overlaps network latency.
  private readonly maxConcurrentRequests = 3

  // Track pending requests to enable de-duplication
  private pendingRequests = new Map<
    string,
    {
      promise: Promise<any>
      subscribers: Array<{
        resolve: (data: any) => void
        reject: (error: Error) => void
      }>
    }
  >()

  // Background cache update tracking
  private backgroundUpdates = new Set<string>()
  private backgroundQueue: Array<{ key: string; operation: () => Promise<any>; timeoutMs: number }> = []
  private isProcessingBackground = false
  private readonly maxConcurrentBackground = 1
  private readonly backgroundUpdateDelay = 10000 // 10 seconds between updates

  constructor(private config: ServerConfig) {
    this.spotifyApi = SpotifyApi.withClientCredentials(
      this.config.spotify?.clientId || '',
      this.config.spotify?.clientSecret || '',
      [],
      {
        // Abort API calls that do not answer instead of holding the socket open.
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(this.requestTimeoutMs) }),
      },
    )
    console.info('Spotify API service initialized - token management handled by library')
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private getCacheFilePath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.json`)
  }

  private getCacheExpiryForKey(cacheKey: string): number {
    if (
      cacheKey.startsWith('album_') ||
      cacheKey.startsWith('show_') ||
      cacheKey.startsWith('audiobook_') ||
      cacheKey.startsWith('artist_') ||
      cacheKey.startsWith('episode_')
    ) {
      return this.cacheExpiry.static
    }
    if (cacheKey.startsWith('artist_albums_') || cacheKey.startsWith('show_episodes_')) {
      return this.cacheExpiry.semiStatic
    }
    if (cacheKey.startsWith('playlist_')) {
      return this.cacheExpiry.dynamic
    }
    if (cacheKey.startsWith('search_')) {
      return this.cacheExpiry.search
    }
    return this.cacheExpiry.dynamic // Fallback
  }

  private async getFromCache(cacheKey: string): Promise<{ data: any | null; isStale: boolean }> {
    try {
      const cacheFile = this.getCacheFilePath(cacheKey)

      if (!fs.existsSync(cacheFile)) {
        return { data: null, isStale: false }
      }

      const _stats = fs.statSync(cacheFile)
      const cachedData: CachedSpotifyData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))

      const isStale = Date.now() > (cachedData.expiresAt || Date.now())

      if (isStale) {
        console.info(`📦 Cache stale for ${cacheKey}, will update in background`)
      } else {
        console.info(`✅ Fresh cache hit for ${cacheKey}`)
      }

      return { data: cachedData.data, isStale }
    } catch (error) {
      console.error(`Error reading cache for ${cacheKey}:`, error)
      return { data: null, isStale: false }
    }
  }

  private async saveToCache(cacheKey: string, data: any): Promise<void> {
    try {
      this.ensureCacheDir()
      const cacheFile = this.getCacheFilePath(cacheKey)

      const expiryTime = this.getCacheExpiryForKey(cacheKey)
      const cachedData: CachedSpotifyData = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + expiryTime,
      }

      fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2))
      console.info(`💾 Cached data for ${cacheKey}`)
    } catch (error) {
      console.error(`Error saving cache for ${cacheKey}:`, error)
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }
    const cause = error.cause instanceof Error ? error.cause.message : ''
    const message = `${error.name}: ${error.message} ${cause}`
    return /TimeoutError|AbortError|timed out|fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH/i.test(
      message,
    )
  }

  /** Runs one operation with the request time limit; the operation itself keeps running. */
  private withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Spotify request timed out after ${timeoutMs}ms`)), timeoutMs)
    })
    return Promise.race([operation(), timeout]).finally(() => clearTimeout(timer))
  }

  /**
   * The Spotify library reports a 429 as a plain Error with this message and no
   * status code or retry-after header, so matching the message is the only way to
   * notice it. Missing it meant every rate limited lookup failed outright - on a
   * cold cache that quietly cost entries on the home screen.
   */
  private isRateLimitError(error: any): boolean {
    return (
      error?.statusCode === 429 ||
      /exceeded its rate limits/i.test(error instanceof Error ? error.message : String(error))
    )
  }

  private async rateLimitedRequest<T>(
    operation: () => Promise<T>,
    timeoutMs = this.requestTimeoutMs,
    rateLimitAttempt = 0,
  ): Promise<T> {
    if (Date.now() < this.networkFailureUntil) {
      throw new Error('Spotify is unreachable (recent network failure), request skipped')
    }
    if (Date.now() < this.rateLimitUntil) {
      throw new Error('Spotify rate limit window is exhausted, request skipped')
    }

    // Reserve the next free time slot synchronously (no await in between), so
    // parallel workers cannot grab the same slot and burst at Spotify together.
    const now = Date.now()
    const slot = Math.max(now, this.nextRequestSlot)
    this.nextRequestSlot = slot + this.minRequestInterval
    if (slot > now) {
      await new Promise((resolve) => setTimeout(resolve, slot - now))
    }

    try {
      return await this.withTimeout(operation, timeoutMs)
    } catch (error: any) {
      if (this.isNetworkError(error)) {
        this.networkFailureUntil = Date.now() + this.networkFailureBackoffMs
        console.warn(
          `Spotify unreachable (${error instanceof Error ? error.message : String(error)}), skipping requests for ${this.networkFailureBackoffMs / 1000}s`,
        )
        throw error
      }
      if (this.isRateLimitError(error)) {
        if (rateLimitAttempt >= this.maxRateLimitRetries) {
          console.warn(
            `Rate limited by Spotify API, giving up after ${rateLimitAttempt} retries and cooling down for ${this.rateLimitCooldownMs / 1000}s`,
          )
          this.rateLimitUntil = Date.now() + this.rateLimitCooldownMs
          throw error
        }
        // Wait and retry, doubling the pause each attempt. The library exposes no
        // retry-after header, so the pause is our own. Pushing nextRequestSlot out
        // holds every worker back - one 429 means the whole window is exhausted.
        const retryAfter = error.headers?.['retry-after']
          ? Number.parseInt(error.headers['retry-after'], 10) * 1000
          : this.rateLimitBackoffMs * 2 ** rateLimitAttempt
        console.warn(`Rate limited by Spotify API. Retrying after ${retryAfter}ms`)
        this.nextRequestSlot = Math.max(this.nextRequestSlot, Date.now() + retryAfter)
        await new Promise((resolve) => setTimeout(resolve, retryAfter))
        return this.rateLimitedRequest(operation, timeoutMs, rateLimitAttempt + 1)
      }
      // Let the library handle 401 errors and token refresh automatically
      throw error
    }
  }

  private async executeWithCache<T>(
    cacheKey: string,
    operation: () => Promise<T>,
    forceBackgroundRefresh = false,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<T> {
    const cacheResult = await this.getFromCache(cacheKey)

    if (cacheResult.data) {
      // Return cached data immediately, even if stale
      if (cacheResult.isStale || forceBackgroundRefresh) {
        // Trigger background update if cache is stale or refresh is forced
        // Prioritize forced refreshes (e.g., when actively playing content)
        this.triggerBackgroundUpdate(cacheKey, operation, forceBackgroundRefresh, timeoutMs)
      }
      return cacheResult.data as T
    }

    // No cache exists - queue for synchronous processing
    console.info(`🔍 No cache for ${cacheKey}, executing request...`)
    return this.queueRequest(cacheKey, operation, timeoutMs)
  }

  private async queueRequest<T>(key: string, operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    // Check if there's already a pending request for this key
    const existingRequest = this.pendingRequests.get(key)
    if (existingRequest) {
      console.debug(`🔗 Joining existing request for ${key}`)

      return new Promise((resolve, reject) => {
        existingRequest.subscribers.push({ resolve, reject })
      })
    }

    // Create new request
    return new Promise((resolve, reject) => {
      const subscribers = [{ resolve, reject }]

      // Create the actual promise that will be executed
      const requestPromise = new Promise<T>((promiseResolve, promiseReject) => {
        this.requestQueue.push({
          key,
          operation: async () => {
            const result = await this.rateLimitedRequest(operation, timeoutMs)
            await this.saveToCache(key, result)
            return result
          },
          resolve: promiseResolve,
          reject: promiseReject,
        })

        // Process queue if not already processing
        if (!this.isProcessingQueue) {
          this.processRequestQueue()
        }
      })

      // Track this request for de-duplication
      this.pendingRequests.set(key, {
        promise: requestPromise,
        subscribers,
      })

      // Handle completion/failure for all subscribers
      requestPromise
        .then((data) => {
          for (const sub of subscribers) {
            sub.resolve(data)
          }
        })
        .catch((error) => {
          for (const sub of subscribers) {
            sub.reject(error)
          }
        })
        .finally(() => {
          this.pendingRequests.delete(key)
        })
    })
  }

  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue) return

    this.isProcessingQueue = true
    console.debug(`🏃 Starting request queue processing (${this.requestQueue.length} requests)`)

    // A few workers drain the queue in parallel. One request at a time made a cold
    // start crawl: a media list asks for dozens of artist/show lookups at once, and
    // everything behind the first handful ran into the frontend's per-entry time
    // limit and was dropped. The rate limiter above still paces the actual Spotify
    // calls, so this only overlaps waiting, it does not hammer the API.
    const worker = async (): Promise<void> => {
      for (;;) {
        const queueEntry = this.requestQueue.shift()
        if (!queueEntry) return

        const { key, operation, resolve, reject } = queueEntry

        try {
          console.debug(`⚡ Processing request for ${key}`)
          const result = await operation()
          resolve(result)
          console.debug(`✅ Completed request for ${key}`)
        } catch (error) {
          console.error(`❌ Failed request for ${key}:`, error instanceof Error ? error.message : String(error))
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    }

    // New entries queued while the workers run are picked up by whichever worker
    // frees up first; only when all workers have exited is the queue idle again.
    while (this.requestQueue.length > 0) {
      const workers = Array.from({ length: Math.min(this.maxConcurrentRequests, this.requestQueue.length) }, () =>
        worker(),
      )
      await Promise.all(workers)
    }

    this.isProcessingQueue = false
    console.debug('🏁 Finished processing request queue')
  }

  private triggerBackgroundUpdate(
    cacheKey: string,
    operation: () => Promise<any>,
    prioritize = false,
    timeoutMs = this.requestTimeoutMs,
  ): void {
    if (this.backgroundUpdates.has(cacheKey)) {
      console.debug(`🔄 Background update already in progress for ${cacheKey}`)
      return
    }

    if (this.backgroundQueue.some((item) => item.key === cacheKey)) {
      console.debug(`📋 Background update already queued for ${cacheKey}`)
      return
    }

    if (prioritize) {
      // Add to front of queue for immediate processing
      this.backgroundQueue.unshift({ key: cacheKey, operation, timeoutMs })
      console.debug(`⚡ Prioritized background update for ${cacheKey} (added to front of queue)`)
    } else {
      // Add to end of queue
      this.backgroundQueue.push({ key: cacheKey, operation, timeoutMs })
      console.debug(`📋 Queued background update for ${cacheKey}`)
    }

    if (!this.isProcessingBackground) {
      this.processBackgroundQueue()
    }
  }

  private async processBackgroundQueue(): Promise<void> {
    if (this.isProcessingBackground) return

    this.isProcessingBackground = true
    console.debug(`🔄 Starting background queue processing (${this.backgroundQueue.length} updates)`)

    const concurrentPromises = new Set<Promise<void>>()

    while (this.backgroundQueue.length > 0 || concurrentPromises.size > 0) {
      while (this.backgroundQueue.length > 0 && concurrentPromises.size < this.maxConcurrentBackground) {
        const queueItem = this.backgroundQueue.shift()
        if (!queueItem) break

        const { key, operation, timeoutMs } = queueItem

        if (this.backgroundUpdates.has(key)) {
          console.debug(`⏭️ Skipping ${key} - already in progress`)
          continue
        }

        this.backgroundUpdates.add(key)

        const updatePromise = this.rateLimitedRequest(operation, timeoutMs)
          .then(async (result) => {
            await this.saveToCache(key, result)
            console.debug(`✅ [BG] Background update completed for ${key}`)
            // Delay to reduce load on Raspberry Pi
            await new Promise((resolve) => setTimeout(resolve, this.backgroundUpdateDelay))
          })
          .catch((error) => {
            console.error(
              `❌ [BG] Background update failed for ${key}:`,
              error instanceof Error ? error.message : String(error),
            )
          })
          .finally(() => {
            this.backgroundUpdates.delete(key)
            concurrentPromises.delete(updatePromise)
          })

        concurrentPromises.add(updatePromise)
      }

      if (concurrentPromises.size > 0) {
        await Promise.race(Array.from(concurrentPromises))
      }
    }

    this.isProcessingBackground = false
    console.debug('🏁 Finished processing background queue')
  }

  // Public API methods that mirror the frontend operations

  async searchAlbums(
    query: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: SpotifyApiAlbumSearchResult[]; total: number; limit: number; offset: number }> {
    const cacheKey = `search_albums_${query}_${limit}_${offset}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.search(query, ['album'], 'DE', Math.min(limit, 50) as any, offset)
      return {
        items:
          result.albums.items
            .filter((item) => item != null)
            .map((item) => ({
              id: item.id,
              name: item.name,
              artists: item.artists,
              images: item.images,
              release_date: item.release_date,
            })) || [],
        total: result.albums.total || 0,
        limit: result.albums.limit || limit,
        offset: result.albums.offset || offset,
      }
    })
  }

  async getArtistAlbums(
    artistId: string,
    albumTypes = 'album,single,compilation',
    limit = 50,
    offset = 0,
  ): Promise<{ items: SpotifyApiArtistAlbumsResult[]; total: number; limit: number; offset: number }> {
    const cacheKey = `artist_albums_${artistId}_${albumTypes}_${limit}_${offset}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.artists.albums(
        artistId,
        'album,single,compilation',
        'DE',
        Math.min(limit, 50) as any,
        offset,
      )
      return {
        items: (result.items || [])
          .filter((item: any) => item != null)
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            artists: item.artists,
            images: item.images,
            release_date: item.release_date,
          })),
        total: result.total || 0,
        limit: result.limit || limit,
        offset: result.offset || offset,
      }
    })
  }

  async getShowEpisodes(
    showId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: SpotifyApiShowEpisodesResult[]; total: number; limit: number; offset: number }> {
    const cacheKey = `show_episodes_${showId}_${limit}_${offset}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.shows.episodes(showId, 'DE', Math.min(limit, 50) as any, offset)
      return {
        // Spotify returns null for episodes that are unavailable in the market;
        // they must not crash the whole page of an otherwise fine show.
        items: result.items
          .filter((item) => item != null)
          .map((item) => ({
            id: item.id,
            name: item.name,
            images: item.images,
            release_date: item.release_date,
          })),
        total: result.total || 0,
        limit: result.limit || limit,
        offset: result.offset || offset,
      }
    })
  }

  async getAlbum(albumId: string): Promise<SpotifyApiAlbumDetails> {
    const cacheKey = `album_${albumId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.albums.get(albumId, 'DE')
      return {
        id: result.id,
        name: result.name,
        artists: result.artists,
        images: result.images,
        release_date: result.release_date,
        tracks: result.tracks,
        total_tracks: result.total_tracks,
      }
    })
  }

  /**
   * Playlist metadata plus the complete track list. The list is paged through the
   * API (the embed scraper only ever sees the first 100 tracks), so the player can
   * tell the position of any track and the real size of the playlist. When the API
   * refuses the tracks (development mode apps and Spotify-owned playlists) the
   * result carries what the API did return and `tracksComplete: false`.
   */
  async getPlaylist(playlistId: string, forceBackgroundRefresh = false): Promise<SpotifyApiPlaylistDetails> {
    const cacheKey = `playlist_v2_${playlistId}`
    if (Date.now() < (this.playlistApiDeniedUntil.get(playlistId) ?? 0)) {
      throw new Error(`Playlist ${playlistId} is not available through the API (cached refusal)`)
    }

    try {
      return await this.executeWithCache(
        cacheKey,
        async () => {
          const trackFields = 'items(track(id,uri,name,duration_ms,artists(name)))'
          const result = await this.spotifyApi.playlists.getPlaylist(
            playlistId,
            'DE',
            `id,name,images,tracks(total,${trackFields})`,
          )
          const total = result.tracks?.total ?? 0
          const items = this.mapPlaylistItems(result.tracks?.items)
          let tracksComplete = true

          // Page through the rest; keep a partial list if a page fails.
          try {
            while (items.length < total) {
              const page = await this.spotifyApi.playlists.getPlaylistItems(
                playlistId,
                'DE',
                trackFields,
                50,
                items.length,
              )
              const pageItems = this.mapPlaylistItems(page.items)
              if (pageItems.length === 0) {
                tracksComplete = false
                break
              }
              items.push(...pageItems)
              await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval))
            }
          } catch (error) {
            console.warn(
              `Playlist ${playlistId}: only ${items.length}/${total} tracks available through the API:`,
              error instanceof Error ? error.message : String(error),
            )
            tracksComplete = false
          }

          return {
            id: result.id,
            name: result.name,
            images: result.images,
            tracks: { total: Math.max(total, items.length), items },
            tracksComplete,
          }
        },
        forceBackgroundRefresh,
        this.playlistTimeoutMs,
      )
    } catch (error) {
      if (this.isApiRefusal(error)) {
        this.playlistApiDeniedUntil.set(playlistId, Date.now() + this.playlistApiDeniedMs)
      }
      throw error
    }
  }

  private mapPlaylistItems(items: Array<{ track?: any }> | undefined): SpotifyApiPlaylistDetails['tracks']['items'] {
    return (items || [])
      .filter((item) => item?.track?.uri)
      .map((item) => ({
        track: {
          id: item.track.id || '',
          uri: item.track.uri,
          name: item.track.name || '',
          duration_ms: item.track.duration_ms || 0,
          artists: (item.track.artists || []).map((artist: any) => ({ name: artist?.name || '' })),
        },
      }))
  }

  /** 403/404 from the API: the resource is out of reach for this app, retrying will not help. */
  private isApiRefusal(error: unknown): boolean {
    const message = error instanceof Error ? error.message : ''
    return /Bad OAuth request|response code: 40[34]/.test(message)
  }

  async getPlaylistTracks(playlistId: string, limit = 50, offset = 0, forceBackgroundRefresh = false): Promise<any[]> {
    const cacheKey = `playlist_tracks_${playlistId}_${limit}_${offset}`

    return this.executeWithCache(
      cacheKey,
      async () => {
        const result = await this.spotifyApi.playlists.getPlaylistItems(
          playlistId,
          'DE',
          'items(track(id,uri,name))',
          Math.min(limit, 50) as any,
          offset,
        )
        return result.items
      },
      forceBackgroundRefresh,
    )
  }

  async getShow(showId: string): Promise<SpotifyApiShowDetails> {
    const cacheKey = `show_${showId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.shows.get(showId, 'DE')
      return {
        id: result.id,
        name: result.name,
        images: result.images,
        episodes: result.episodes,
        total_episodes: result.total_episodes || result.episodes?.total || 0,
      }
    })
  }

  async getAudiobook(audiobookId: string): Promise<SpotifyApiAudiobookDetails> {
    const cacheKey = `audiobook_${audiobookId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.audiobooks.get(audiobookId, 'DE')
      return {
        id: result.id,
        name: result.name,
        images: result.images,
        authors: result.authors,
        chapters: result.chapters,
      }
    })
  }

  async getEpisode(episodeId: string): Promise<SpotifyApiEpisodeDetails> {
    const cacheKey = `episode_${episodeId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.episodes.get(episodeId, 'DE')
      return {
        id: result.id,
        name: result.name,
        show: result.show as any, // Type compatibility
        images: result.images,
        release_date: result.release_date,
      }
    })
  }

  async getArtist(artistId: string): Promise<SpotifyApiArtistDetails> {
    const cacheKey = `artist_${artistId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.artists.get(artistId)
      return {
        id: result.id,
        name: result.name,
        images: result.images,
      }
    })
  }

  // Validation method
  async validateSpotifyResource(
    id: string,
    type: 'album' | 'show' | 'audiobook' | 'artist' | 'playlist',
  ): Promise<boolean> {
    try {
      switch (type) {
        case 'album':
          await this.getAlbum(id)
          return true
        case 'show':
          await this.getShow(id)
          return true
        case 'audiobook':
          await this.getAudiobook(id)
          return true
        case 'artist':
          await this.getArtist(id)
          return true
        case 'playlist':
          await this.getPlaylist(id)
          return true
        default:
          return false
      }
    } catch (error) {
      console.warn(`Validation failed for ${type} ${id}:`, error instanceof Error ? error.message : String(error))
      return false
    }
  }

  public async dispose(): Promise<void> {
    // Clear any ongoing updates
    this.backgroundUpdates.clear()
    this.backgroundQueue.length = 0
    this.isProcessingBackground = false

    // Clear and reject any pending requests
    while (this.requestQueue.length > 0) {
      const queueEntry = this.requestQueue.shift()
      if (queueEntry) {
        queueEntry.reject(new Error('Service is being disposed'))
      }
    }
    this.isProcessingQueue = false

    // Clear and reject all pending request subscribers
    for (const [_key, pendingRequest] of this.pendingRequests) {
      for (const sub of pendingRequest.subscribers) {
        sub.reject(new Error('Service is being disposed'))
      }
    }
    this.pendingRequests.clear()
  }
}
