import { BehaviorSubject, EMPTY, Observable, catchError, firstValueFrom, from, interval, of } from 'rxjs'
import { distinctUntilChanged, filter, map, scan, switchMap, take, takeLast, timeout } from 'rxjs/operators'
import type { CategoryType, Media } from './media'
import { SpotifyConfig, SpotifyPlayer, SpotifyWebPlaybackState, SpotifyWebPlaybackTrack } from './spotify'
import { ExtraDataMedia, Utils } from './utils'

import { DOCUMENT } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Inject, Injectable } from '@angular/core'
import { environment } from 'src/environments/environment'
import { LogService } from './log.service'

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  deviceName: string | undefined = undefined

  // Web Playback SDK properties
  private player: SpotifyPlayer | null = null
  private deviceId: string | null = null

  // Player state observables
  public playerState$ = new BehaviorSubject<SpotifyWebPlaybackState | null>(null)
  public isConnected$ = new BehaviorSubject<boolean>(false)
  public currentTrack$ = new BehaviorSubject<SpotifyWebPlaybackTrack | null>(null)

  // External playback detection
  private previousPlayerState: SpotifyWebPlaybackState | null = null
  public externalPlaybackDetected$ = new BehaviorSubject<SpotifyWebPlaybackTrack | null>(null)

  // SDK loading state
  private sdkLoadingPromise: Promise<void> | null = null
  public sdkLoadError$ = new BehaviorSubject<string | null>(null)
  private network$: Observable<any> | null = null

  constructor(
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document,
    private logService: LogService,
  ) {
    this.initializeSpotifyConfig()
  }

  private isLocalhost(): boolean {
    const hostname = window.location.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '' // file:// protocol
  }

  /**
   * Helper method to fetch all paginated results from the backend API using total count
   */
  private fetchAllPaginatedResults<T>(url: string, baseParams: any, pageSize = 50): Observable<T[]> {
    const fetchPage = (offset: number): Observable<{ items: T[]; total: number; limit: number; offset: number }> => {
      const params = { ...baseParams, limit: pageSize.toString(), offset: offset.toString() }
      return this.http.get<{ items: T[]; total: number; limit: number; offset: number }>(url, { params })
    }

    // First, get the total count and then fetch all pages
    return fetchPage(0).pipe(
      switchMap((firstPageResponse) => {
        const { items: firstPageItems, total } = firstPageResponse

        // If we have all results in the first page, return them
        if (firstPageItems.length >= total) {
          return of(firstPageItems)
        }

        // Calculate how many more pages we need
        const remainingItems = total - firstPageItems.length
        const additionalPagesNeeded = Math.ceil(remainingItems / pageSize)

        if (additionalPagesNeeded <= 0) {
          return of(firstPageItems)
        }

        // Create observables for additional pages
        const additionalPageObservables: Observable<T[]>[] = []
        for (let page = 1; page <= additionalPagesNeeded; page++) {
          const offset = page * pageSize
          additionalPageObservables.push(
            fetchPage(offset).pipe(
              map((response) => response.items),
              catchError((error) => {
                this.logService.warn(`Failed to fetch page at offset ${offset}:`, error?.message || error)
                return of([] as T[])
              }),
            ),
          )
        }

        // Combine first page with all additional pages
        return from(additionalPageObservables).pipe(
          switchMap((obs) => obs),
          scan((acc: T[], pageItems: T[]) => [...acc, ...pageItems], firstPageItems),
          takeLast(1),
        )
      }),
      catchError((error) => {
        this.logService.warn('Pagination fetch failed:', error?.message || error)
        return of([])
      }),
    )
  }

  getMediaByQuery(
    query: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const searchUrl = `${environment.backend.apiUrl}/spotify/search/albums`

    return this.fetchAllPaginatedResults<any>(searchUrl, { query }).pipe(
      map((albums: any[]) => {
        return albums.map((album) => {
          const media: Media = {
            id: album.id,
            artist: album.artists?.[0]?.name || 'Unknown Artist',
            title: album.name,
            cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
            release_date: album.release_date,
            type: 'spotify',
            category,
            index,
          }
          Utils.copyExtraMediaData(extraDataSource, media)
          return media
        })
      }),
      catchError((err) => {
        this.logService.warn(
          `Search query failed for "${query}" due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByArtistID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const artistAlbumsUrl = `${environment.backend.apiUrl}/spotify/artist/${id}/albums`
    const artistUrl = `${environment.backend.apiUrl}/spotify/artist/${id}`

    return this.http.get<any>(artistUrl).pipe(
      switchMap((artist) => {
        const artistcover = artist.images?.[0]?.url || '../assets/images/nocover_mupi.png'

        return this.fetchAllPaginatedResults<any>(artistAlbumsUrl, {}).pipe(
          map((albums) => {
            return albums.map((album) => {
              const media: Media = {
                id: album.id,
                artist: album.artists?.[0]?.name || 'Unknown Artist',
                title: album.name,
                cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
                artistcover: artistcover,
                release_date: album.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        )
      }),
      catchError((err) => {
        this.logService.warn(
          `Artist albums query failed for artist ${id} due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByShowID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const showUrl = `${environment.backend.apiUrl}/spotify/show/${id}`
    const showEpisodesUrl = `${environment.backend.apiUrl}/spotify/show/${id}/episodes`

    return this.http.get<any>(showUrl).pipe(
      switchMap((show) => {
        const showName = show.name || 'Unknown Show'
        const showcover = show.images?.[0]?.url || '../assets/images/nocover_mupi.png'

        return this.fetchAllPaginatedResults<any>(showEpisodesUrl, {}).pipe(
          map((episodes) => {
            return episodes
              .filter((episode) => episode != null)
              .map((episode) => {
                const media: Media = {
                  showid: episode.id,
                  artist: showName,
                  title: episode.name,
                  cover: episode.images?.[0]?.url || showcover,
                  artistcover: showcover,
                  type: 'spotify',
                  category,
                  release_date: episode.release_date,
                  index,
                }
                Utils.copyExtraMediaData(extraDataSource, media)
                return media
              })
          }),
        )
      }),
      catchError((err) => {
        this.logService.warn(
          `Show episodes query failed for show ${id} due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const albumUrl = `${environment.backend.apiUrl}/spotify/album/${id}`

    return this.http.get<any>(albumUrl).pipe(
      map((album) => {
        const media: Media = {
          id: album.id,
          artist: album.artists?.[0]?.name || 'Unknown Artist',
          title: album.name,
          cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          release_date: album.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Album info query failed for album ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getAudiobookByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const audiobookUrl = `${environment.backend.apiUrl}/spotify/audiobook/${id}`

    return this.http.get<any>(audiobookUrl).pipe(
      map((audiobook) => {
        const media: Media = {
          audiobookid: audiobook.id,
          artist: audiobook.authors?.[0]?.name || 'Unknown Author',
          title: audiobook.name,
          cover: audiobook.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Audiobook info query failed for audiobook ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getMediaByEpisode(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const episodeUrl = `${environment.backend.apiUrl}/spotify/episode/${id}`

    return this.http.get<any>(episodeUrl).pipe(
      map((episode) => {
        const media: Media = {
          showid: episode.id,
          artist: episode.show?.[0]?.name || 'Unknown Show',
          title: episode.name,
          cover: episode.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          release_date: episode.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Episode info query failed for episode ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getMediaByPlaylistID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    // Try API first, then fallback to scraper
    const playlistApiUrl = `${environment.backend.apiUrl}/spotify/playlist-api/${id}`

    return this.http.get<any>(playlistApiUrl).pipe(
      catchError((err) => {
        this.logService.log('Spotify API failed for playlist %s, trying backend media info service...', id)

        return this.http.get<any>(`${environment.backend.apiUrl}/spotify/playlist/${id}`).pipe(
          timeout(30000),
          catchError((backendErr) => {
            this.logService.error(`Backend failed for playlist ${id}:`, backendErr?.message || backendErr)
            return EMPTY
          }),
        )
      }),
      map((response: any) => {
        // Check if response is from backend scraper (has different structure)
        const isFromBackend = response.playlist && response.tracks

        const media: Media = {
          playlistid: isFromBackend ? id : response.id,
          title: isFromBackend ? response.playlist.name : response.name,
          cover: isFromBackend ? response.playlist.images?.[0]?.url : response?.images?.[0]?.url,
          type: 'spotify',
          category,
          index,
        }

        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
  }

  async validateSpotify(spotifyId: string, spotifyCategory: string): Promise<boolean> {
    try {
      const validationUrl = `${environment.backend.apiUrl}/spotify/validate`
      const data = await firstValueFrom(
        this.http
          .post<any>(validationUrl, {
            id: spotifyId,
            type: spotifyCategory,
          })
          .pipe(timeout(30000)),
      )

      return data.valid || false
    } catch (err) {
      this.logService.warn(`Validation failed for ${spotifyCategory} ${spotifyId}:`, err)
      return false
    }
  }

  private initializeSpotifyConfig(): void {
    const spotifyConfigUrl = `${environment.backend.apiUrl}/spotify/config`
    this.http
      .get<SpotifyConfig>(spotifyConfigUrl)
      .pipe(take(1))
      .subscribe({
        next: (spotifyConfig: SpotifyConfig) => {
          this.deviceName = spotifyConfig.deviceName
          if (this.shouldUsePlayer()) {
            this.initializeWebPlaybackSDK()
          }
        },
        error: (error) => {
          this.logService.error('Failed to get Spotify config:', error)
        },
      })
  }

  /**
   * Inject MediaService network observable for retry logic
   * Called by MediaService after initialization
   */
  setNetworkObservable(network$: Observable<any>): void {
    this.network$ = network$
    this.setupProactiveSDKMonitoring()
  }

  /**
   * Set up background monitoring that proactively tries to load SDK when conditions are right
   */
  private setupProactiveSDKMonitoring(): void {
    if (!this.network$ || !this.shouldUsePlayer()) {
      return
    }

    // Monitor network status changes and connection state
    this.network$
      .pipe(
        filter((network) => network.ip !== undefined),
        map((network) => network.onlinestate === 'online'),
        distinctUntilChanged(),
        switchMap((isOnline) => {
          if (isOnline && !this.isPlayerReady()) {
            this.logService.log('Network is online and web player should be available - checking SDK status')
            return from(this.performHealthCheckAndRecovery(false))
          }
          return of(null)
        }),
      )
      .subscribe({
        next: () => {
          /* handled in performHealthCheckAndRecovery */
        },
        error: (error) => this.logService.warn('SDK monitoring error:', error),
      })

    // Also periodically check if we should have a working player but don't
    interval(30000)
      .pipe(
        filter(() => this.shouldUsePlayer() && !this.isPlayerReady()),
        switchMap(() => {
          if (navigator.onLine) {
            this.logService.log("Periodic check: Should have web player but don't - attempting SDK retry")
            return from(this.performHealthCheckAndRecovery(false))
          }
          return of(null)
        }),
      )
      .subscribe({
        next: () => {
          /* handled in performHealthCheckAndRecovery */
        },
        error: (error) => this.logService.warn('Periodic SDK check error:', error),
      })
  }

  /**
   * Core health check logic shared between monitoring and on-demand checks
   */
  private async performHealthCheckAndRecovery(comprehensive = true): Promise<boolean> {
    const startTime = Date.now()
    this.logService.debug(`🔍 Starting Spotify player health check (${comprehensive ? 'comprehensive' : 'basic'})...`)

    // If we're not supposed to use the player, return success
    if (!this.shouldUsePlayer()) {
      this.logService.debug('✅ Player not needed on this environment')
      return true
    }

    // Basic connectivity check
    if (!navigator.onLine) {
      this.logService.debug('❌ Device is offline - cannot ensure player health')
      this.logHealthCheckResult(false, 'Device offline', Date.now() - startTime)
      return false
    }

    try {
      // Check if we have a basic player instance
      if (!this.isPlayerReady()) {
        this.logService.log('⚠️  Player not ready - attempting recovery...')
        const recovered = await this.performCompleteRecovery()
        if (!recovered) {
          this.logHealthCheckResult(false, 'Recovery failed', Date.now() - startTime)
          return false
        }
      }

      // For comprehensive checks, also test functionality
      if (comprehensive) {
        this.logService.log('🔬 Testing player functionality...')
        const isHealthy = await this.testPlayerFunctionality()

        if (!isHealthy) {
          this.logService.log('⚠️  Player functional test failed - attempting recovery...')
          const recovered = await this.performCompleteRecovery()
          if (!recovered) {
            this.logHealthCheckResult(false, 'Recovery after functional test failed', Date.now() - startTime)
            return false
          }

          // Re-test after recovery
          const isHealthyAfterRecovery = await this.testPlayerFunctionality()
          if (!isHealthyAfterRecovery) {
            this.logHealthCheckResult(false, 'Still unhealthy after recovery', Date.now() - startTime)
            return false
          }
        }
      }

      this.logService.debug(`✅ Player health check passed (${comprehensive ? 'comprehensive' : 'basic'})`)
      this.logHealthCheckResult(
        true,
        comprehensive ? 'Healthy - comprehensive' : 'Healthy - basic',
        Date.now() - startTime,
      )
      return true
    } catch (error) {
      this.logService.error('❌ Health check failed with error:', error)
      this.logHealthCheckResult(false, `Error: ${error.message}`, Date.now() - startTime)
      return false
    }
  }

  private loadSpotifySDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if SDK is already loaded
      if (window.Spotify?.Player) {
        this.sdkLoadError$.next(null)
        resolve()
        return
      }

      // Check network connectivity if available
      if (!navigator.onLine) {
        const errorMsg = 'Cannot load Spotify player - device is offline'
        this.sdkLoadError$.next(errorMsg)
        reject(new Error(errorMsg))
        return
      }

      // Remove any existing scripts
      const existingScripts = this.document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]')
      for (const script of Array.from(existingScripts)) {
        script.remove()
      }

      // Set up the callback
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (window.Spotify?.Player) {
          this.sdkLoadError$.next(null)
          resolve()
        } else {
          const errorMsg = 'SDK ready callback fired but Spotify object not available'
          this.sdkLoadError$.next(errorMsg)
          reject(new Error(errorMsg))
        }
      }

      // Create and load the script
      const script = this.document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true

      script.onload = () => {
        setTimeout(() => {
          if (window.Spotify?.Player) {
            this.sdkLoadError$.next(null)
            resolve()
          }
        }, 500)
      }

      script.onerror = () => {
        const errorMsg = 'Cannot load Spotify player - check internet connection'
        this.sdkLoadError$.next(errorMsg)
        reject(new Error('Failed to load Spotify Web Playback SDK script'))
      }

      this.document.head.appendChild(script)

      // Timeout fallback
      setTimeout(() => {
        if (window.Spotify?.Player) {
          this.sdkLoadError$.next(null)
          resolve()
        } else {
          const errorMsg = 'Spotify player load timeout - check connection'
          this.sdkLoadError$.next(errorMsg)
          reject(new Error('Spotify SDK load timeout'))
        }
      }, 10000)
    })
  }

  initializeWebPlaybackSDK(): void {
    if (!this.sdkLoadingPromise) {
      this.sdkLoadingPromise = this.loadSpotifySDKWithRetry()
        .then(() => {
          if (typeof window.Spotify === 'undefined' || !window.Spotify.Player) {
            throw new Error('Spotify Web Playback SDK not properly loaded')
          }
          this.initializePlayer()
        })
        .catch((error) => {
          this.logService.error('Failed to initialize Spotify Web Playback SDK:', error)
          this.isConnected$.next(false)
        })
    }
  }

  private async loadSpotifySDKWithRetry(maxRetries = 3): Promise<void> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.loadSpotifySDK()
        return
      } catch (error) {
        lastError = error as Error
        this.logService.warn(`SDK load attempt ${attempt} failed:`, error)

        if (attempt < maxRetries) {
          // Wait before retry, with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        }
      }
    }

    throw lastError || new Error('Failed to get token after all retry attempts')
  }

  private initializePlayer(): void {
    if (!window.Spotify || !window.Spotify.Player) {
      throw new Error('Spotify Player class not available')
    }

    this.player = new (window.Spotify.Player as any)({
      name: this.deviceName || 'MuPiBox Web Player',
      getOAuthToken: (cb: (token: string) => void) => {
        const tokenUrl = `${environment.backend.playerUrl}/spotify/token`
        this.http.get(tokenUrl, { responseType: 'text' }).subscribe({
          next: (token) => {
            if (!token || typeof token !== 'string' || token.trim() === '') {
              this.logService.error('Invalid or empty Spotify token received')
              return
            }
            // Token is passed directly to callback
            cb(token)
          },
          error: (error) => {
            this.logService.error('Failed to fetch Spotify token for player:', error)
            this.isConnected$.next(false)
          },
        })
      },
      volume: 1,
    })

    this.player?.addListener('ready', ({ device_id }) => {
      this.logService.log('Ready with Device ID', device_id)
      this.deviceId = device_id
      this.isConnected$.next(true)
    })

    this.player?.addListener('not_ready', ({ device_id }) => {
      this.logService.log('Device ID gone', device_id)
      this.deviceId = null
      this.isConnected$.next(false)
    })

    this.player?.addListener('initialization_error', ({ message }) => {
      this.logService.error('Initialization Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('authentication_error', ({ message }) => {
      this.logService.error('Authentication Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('account_error', ({ message }) => {
      this.logService.error('Account Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('playback_error', ({ message }) => {
      this.logService.error('Playback Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('player_state_changed', (state: SpotifyWebPlaybackState) => {
      this.playerState$.next(state)
      this.currentTrack$.next(state.track_window.current_track)

      // Only detect external playback on actual track changes, not every state change
      const currentTrack = state.track_window.current_track
      const previousTrack = this.previousPlayerState?.track_window?.current_track

      if (!state.paused && currentTrack && (!previousTrack || previousTrack.id !== currentTrack.id)) {
        this.logService.log('🔍 Spotify track change detected:', currentTrack.name)
        this.externalPlaybackDetected$.next(currentTrack)
      }

      // Store current state for comparison
      this.previousPlayerState = state
      this.logService.debug('Player State Changed', state)
    })

    this.player?.connect()
  }

  // Player control methods
  async play(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return
    }

    try {
      // Resume playback
      await this.player.resume()
    } catch (error) {
      this.logService.error('Error playing:', error)
    }
  }

  async pause(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.pause()
    } catch (error) {
      this.logService.error('Error pausing:', error)
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.nextTrack()
    } catch (error) {
      this.logService.error('Error skipping to next track:', error)
    }
  }

  async previousTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.previousTrack()
    } catch (error) {
      this.logService.error('Error skipping to previous track:', error)
    }
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.setVolume(volume)
    } catch (error) {
      this.logService.error('Error setting volume:', error)
    }
  }

  async getVolume(): Promise<number> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return 0
    }

    try {
      return await this.player.getVolume()
    } catch (error) {
      this.logService.error('Error getting volume:', error)
      return 0
    }
  }

  async getCurrentState(): Promise<any> {
    if (!this.isPlayerReady()) {
      this.logService.warn('Player not ready or not connected')
      return null
    }

    try {
      return await this.player.getCurrentState()
    } catch (error) {
      this.logService.error('Error getting current state:', error)
      return null
    }
  }

  disconnect(): void {
    if (this.player) {
      this.player.disconnect()
      this.player = null
      this.deviceId = null
      this.isConnected$.next(false)
      this.playerState$.next(null)
      this.currentTrack$.next(null)
    }
  }

  isPlayerReady(): boolean {
    return this.player !== null && this.deviceId !== null && this.isConnected$.value === true
  }

  async ensurePlayerHealthy(): Promise<boolean> {
    return this.performHealthCheckAndRecovery(true)
  }

  private async testPlayerFunctionality(): Promise<boolean> {
    if (!this.isPlayerReady()) {
      return false
    }

    try {
      const state = await Promise.race([
        this.player.getCurrentState(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
      ])

      this.logService.log('🔧 Player responded to getCurrentState()')
      return true
    } catch (error) {
      this.logService.log('❌ Player functional test failed:', error.message)
      return false
    }
  }

  private async performCompleteRecovery(): Promise<boolean> {
    this.logService.log('🔄 Starting complete Spotify SDK recovery...')
    const recoveryStartTime = Date.now()

    try {
      // Step 1: Complete teardown
      await this.completeSDKTeardown()

      // Step 2: Clear any cached state
      this.sdkLoadingPromise = null
      this.sdkLoadError$.next(null)

      // Step 3: Rebuild from scratch
      this.logService.log('🏗️  Rebuilding SDK from scratch...')
      await this.initializeWebPlaybackSDKSync()

      // Step 4: Wait for ready state with timeout
      const isReady = await this.waitForPlayerReady(10000)

      if (isReady) {
        this.logService.log(`✅ Complete recovery successful in ${Date.now() - recoveryStartTime}ms`)
        return true
      }
      this.logService.log(`❌ Recovery failed - player not ready after ${Date.now() - recoveryStartTime}ms`)
      return false
    } catch (error) {
      this.logService.error(`❌ Recovery failed after ${Date.now() - recoveryStartTime}ms:`, error)
      return false
    }
  }

  private async completeSDKTeardown(): Promise<void> {
    this.logService.log('🧹 Performing complete SDK teardown...')

    // Disconnect and clear player
    if (this.player) {
      try {
        await this.player.disconnect()
      } catch (error) {
        this.logService.warn('Warning: Error during player disconnect:', error)
      }
      this.player = null
    }

    // Clear device ID and state
    this.deviceId = null
    this.isConnected$.next(false)
    this.playerState$.next(null)
    this.currentTrack$.next(null)

    // Remove SDK script from DOM
    const existingScripts = this.document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]')
    for (const script of Array.from(existingScripts)) {
      script.remove()
    }

    // Clear global Spotify object
    if (window.Spotify) {
      window.Spotify = undefined
    }
    if (window.onSpotifyWebPlaybackSDKReady) {
      window.onSpotifyWebPlaybackSDKReady = undefined
    }

    this.logService.log('🧹 SDK teardown complete')
  }

  private async initializeWebPlaybackSDKSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up success/failure callbacks
      const originalLoadingPromise = this.sdkLoadingPromise

      this.initializeWebPlaybackSDK()

      // Wait for the loading promise to resolve or reject
      if (this.sdkLoadingPromise) {
        this.sdkLoadingPromise.then(() => resolve()).catch((error) => reject(error))
      } else {
        reject(new Error('Failed to start SDK loading'))
      }
    })
  }

  private async waitForPlayerReady(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now()

    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.isPlayerReady()) {
          resolve(true)
          return
        }

        if (Date.now() - startTime > timeoutMs) {
          resolve(false)
          return
        }

        setTimeout(checkReady, 100)
      }

      checkReady()
    })
  }

  private logHealthCheckResult(success: boolean, details: string, durationMs: number): void {
    const timestamp = new Date().toISOString()
    const result = success ? '✅ SUCCESS' : '❌ FAILED'
    const logMessage = `[${timestamp}] Spotify Health Check ${result}: ${details} (${durationMs}ms)`

    this.logService.debug(logMessage)

    this.logCurrentSDKState()
  }

  private logCurrentSDKState(): void {
    const timestamp = new Date().toISOString()
    const state = {
      hasPlayer: !!this.player,
      hasDeviceId: !!this.deviceId,
      deviceId: this.deviceId,
      isConnected: this.isConnected$.value,
      sdkLoadError: this.sdkLoadError$.value,
      hasSpotifyGlobal: typeof window.Spotify !== 'undefined',
      hasPlayerClass: typeof window.Spotify?.Player !== 'undefined',
      navigatorOnline: navigator.onLine,
      shouldUsePlayer: this.shouldUsePlayer(),
      isLocalhost: this.isLocalhost(),
    }

    this.logService.debug(`SPOTIFY_SDK_STATE: ${JSON.stringify(state)} | ${timestamp}`)
  }

  shouldUsePlayer(): boolean {
    return this.isLocalhost()
  }

  /**
   * Create a Media object from Spotify Web Playback SDK track information
   */
  createMediaFromSpotifyTrack(track: SpotifyWebPlaybackTrack): Media {
    return {
      type: 'spotify',
      category: 'other',
      title: track.name,
      artist: track.artists?.[0]?.name || 'Unknown Artist',
      cover: track.album?.images?.[0]?.url || '../assets/images/nocover_mupi.png',
    }
  }

  /**
   * Get the Web Playback SDK device ID for use in play requests
   */
  getDeviceId(): string | null {
    return this.deviceId
  }

  /**
   * Get album information including total tracks and track data
   */
  getAlbumInfo(albumId: string): Observable<{ total_tracks: number; album_name: string; tracks?: any[] }> {
    const albumUrl = `${environment.backend.apiUrl}/spotify/album/${albumId}`

    return this.http.get<any>(albumUrl).pipe(
      map((album) => ({
        total_tracks: album.total_tracks,
        album_name: album.name,
        tracks: album.tracks.items.map((track: any) => ({
          id: track.id,
          uri: track.uri,
          name: track.name,
          track_number: track.track_number,
        })),
      })),
      catchError((error) => {
        this.logService.error('Error getting album info:', error)
        return of({ total_tracks: 0, album_name: '', tracks: [] })
      }),
    )
  }

  /**
   * Get playlist information including total tracks and track data
   */
  getPlaylistInfo(playlistId: string): Observable<{ total_tracks: number; playlist_name: string; tracks?: any[] }> {
    const playlistApiUrl = `${environment.backend.apiUrl}/spotify/playlist-api/${playlistId}`
    const playlistTracksUrl = `${environment.backend.apiUrl}/spotify/playlist/${playlistId}/tracks`

    return this.http.get<any>(playlistApiUrl).pipe(
      switchMap((playlist) => {
        // Get all tracks for position calculation
        return this.http.get<any[]>(playlistTracksUrl).pipe(
          map((tracksData) => ({
            total_tracks: playlist.tracks.total,
            playlist_name: playlist.name,
            tracks: tracksData.map((item: any) => ({
              id: item.track.id,
              uri: item.track.uri,
              name: item.track.name,
            })),
          })),
        )
      }),
      catchError((error) => {
        this.logService.log('Spotify API failed for playlist info %s, trying backend media info...', playlistId)

        // Fallback to backend scraper endpoint
        return this.http.get<any>(`${environment.backend.apiUrl}/spotify/playlist/${playlistId}`).pipe(
          // Increase timeout for playlist info - backend needs time for Puppeteer + API calls
          timeout(60000), // 60 seconds
          map((backendData: any) => ({
            total_tracks: backendData.tracks?.length || 0,
            playlist_name: backendData.playlist?.name || '',
            tracks:
              backendData.tracks?.map((track: any) => ({
                id: track.id,
                uri: track.uri,
                name: track.name,
              })) || [],
          })),
          catchError((backendError) => {
            this.logService.error('Backend also failed for playlist info:', backendError)
            return of({ total_tracks: 0, playlist_name: '', tracks: [] })
          }),
        )
      }),
    )
  }

  /**
   * Get show information including total episodes and episode data
   */
  getShowInfo(showId: string): Observable<{ total_episodes: number; show_name: string; episodes?: any[] }> {
    const showUrl = `${environment.backend.apiUrl}/spotify/show/${showId}`
    const showEpisodesUrl = `${environment.backend.apiUrl}/spotify/show/${showId}/episodes`

    return this.http.get<any>(showUrl).pipe(
      switchMap((show) => {
        // Get all episodes for position calculation
        return this.http.get<any[]>(showEpisodesUrl).pipe(
          map((episodesData) => ({
            total_episodes: show.total_episodes,
            show_name: show.name,
            episodes: episodesData.map((episode: any) => ({
              id: episode.id,
              uri: episode.uri || `spotify:episode:${episode.id}`,
              name: episode.name,
            })),
          })),
        )
      }),
      catchError((error) => {
        this.logService.error('Error getting show info:', error)
        return of({ total_episodes: 0, show_name: '', episodes: [] })
      }),
    )
  }

  /**
   * Get audiobook information including total chapters and chapter data
   */
  getAudiobookInfo(
    audiobookId: string,
  ): Observable<{ total_chapters: number; audiobook_name: string; chapters?: any[] }> {
    const audiobookUrl = `${environment.backend.apiUrl}/spotify/audiobook/${audiobookId}`

    return this.http.get<any>(audiobookUrl).pipe(
      map((audiobook) => ({
        total_chapters: audiobook.chapters?.total || 0,
        audiobook_name: audiobook.name,
        chapters:
          audiobook.chapters?.items?.map((chapter: any) => ({
            id: chapter.id,
            uri: chapter.uri,
            name: chapter.name,
          })) || [],
      })),
      catchError((error) => {
        this.logService.error('Error getting audiobook info:', error)
        return of({ total_chapters: 0, audiobook_name: '', chapters: [] })
      }),
    )
  }
}
