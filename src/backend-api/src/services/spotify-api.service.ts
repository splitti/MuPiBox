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
  private cacheExpiry = 30 * 60 * 1000 // 30 minutes in milliseconds

  // Rate limiting
  private lastRequestTime = 0
  private readonly minRequestInterval = 100 // 100ms between requests

  // Queue management for concurrent requests
  private requestQueue: Array<{
    key: string
    operation: () => Promise<any>
    resolve: (data: any) => void
    reject: (error: Error) => void
  }> = []
  private isProcessingQueue = false

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
  private backgroundQueue: Array<{ key: string; operation: () => Promise<any> }> = []
  private isProcessingBackground = false
  private readonly maxConcurrentBackground = 2

  constructor(private config: ServerConfig) {
    this.spotifyApi = SpotifyApi.withClientCredentials(
      this.config.spotify?.clientId || '',
      this.config.spotify?.clientSecret || '',
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

      const cachedData: CachedSpotifyData = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.cacheExpiry,
      }

      fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2))
      console.info(`💾 Cached data for ${cacheKey}`)
    } catch (error) {
      console.error(`Error saving cache for ${cacheKey}:`, error)
    }
  }

  private async rateLimitedRequest<T>(operation: () => Promise<T>): Promise<T> {
    // Implement simple rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest))
    }

    try {
      this.lastRequestTime = Date.now()
      return await operation()
    } catch (error: any) {
      if (error.statusCode === 429) {
        // Rate limited - wait and retry
        const retryAfter = error.headers?.['retry-after']
          ? Number.parseInt(error.headers['retry-after'], 10) * 1000
          : 1000
        console.warn(`Rate limited by Spotify API. Retrying after ${retryAfter}ms`)
        await new Promise((resolve) => setTimeout(resolve, retryAfter))
        return this.rateLimitedRequest(operation)
      }
      // Let the library handle 401 errors and token refresh automatically
      throw error
    }
  }

  private async executeWithCache<T>(cacheKey: string, operation: () => Promise<T>, skipCache = false): Promise<T> {
    // Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cacheResult = await this.getFromCache(cacheKey)

      if (cacheResult.data) {
        // Return cached data immediately, even if stale
        if (cacheResult.isStale) {
          // Trigger background update if cache is stale and not already updating
          this.triggerBackgroundUpdate(cacheKey, operation)
        }
        return cacheResult.data as T
      }
    }

    // No cache exists or cache skipped - queue for synchronous processing
    console.info(`🔍 No cache for ${cacheKey}, executing request...`)
    return this.queueRequest(cacheKey, operation)
  }

  private async queueRequest<T>(key: string, operation: () => Promise<T>): Promise<T> {
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
            const result = await this.rateLimitedRequest(operation)
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

    while (this.requestQueue.length > 0) {
      const queueEntry = this.requestQueue.shift()
      if (!queueEntry) break

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

    this.isProcessingQueue = false
    console.debug('🏁 Finished processing request queue')
  }

  private triggerBackgroundUpdate(cacheKey: string, operation: () => Promise<any>): void {
    if (this.backgroundUpdates.has(cacheKey)) {
      console.debug(`🔄 Background update already in progress for ${cacheKey}`)
      return
    }

    if (this.backgroundQueue.some((item) => item.key === cacheKey)) {
      console.debug(`📋 Background update already queued for ${cacheKey}`)
      return
    }

    this.backgroundQueue.push({ key: cacheKey, operation })
    console.debug(`📋 Queued background update for ${cacheKey}`)

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

        const { key, operation } = queueItem

        if (this.backgroundUpdates.has(key)) {
          console.debug(`⏭️ Skipping ${key} - already in progress`)
          continue
        }

        this.backgroundUpdates.add(key)

        const updatePromise = this.rateLimitedRequest(operation)
          .then(async (result) => {
            await this.saveToCache(key, result)
            console.debug(`✅ [BG] Background update completed for ${key}`)
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
          result.albums.items.map((item) => ({
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
        items: (result.items || []).map((item: any) => ({
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
        items: result.items.map((item) => ({
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

  async getPlaylist(playlistId: string): Promise<SpotifyApiPlaylistDetails> {
    const cacheKey = `playlist_${playlistId}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.playlists.getPlaylist(playlistId, 'DE')
      return {
        id: result.id,
        name: result.name,
        images: result.images,
        tracks: {
          total: result.tracks.total,
          items: result.tracks.items.map((item: any) => ({
            track: {
              id: item.track?.id || '',
              uri: item.track?.uri || '',
              name: item.track?.name || '',
            },
          })),
        },
      }
    })
  }

  async getPlaylistTracks(playlistId: string, limit = 50, offset = 0): Promise<any[]> {
    const cacheKey = `playlist_tracks_${playlistId}_${limit}_${offset}`

    return this.executeWithCache(cacheKey, async () => {
      const result = await this.spotifyApi.playlists.getPlaylistItems(
        playlistId,
        'DE',
        'items(track(id,uri,name))',
        Math.min(limit, 50) as any,
        offset,
      )
      return result.items
    })
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
