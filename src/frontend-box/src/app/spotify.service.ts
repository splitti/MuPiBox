import {
  BehaviorSubject,
  EMPTY,
  Observable,
  catchError,
  defer,
  firstValueFrom,
  from,
  interval,
  of,
  range,
  throwError,
} from 'rxjs'
import {
  delay,
  distinctUntilChanged,
  filter,
  map,
  mergeAll,
  mergeMap,
  retryWhen,
  switchMap,
  take,
  timeout,
  toArray,
} from 'rxjs/operators'
import type { CategoryType, Media } from './media'
import { SpotifyConfig, SpotifyPlayer, SpotifyWebPlaybackState, SpotifyWebPlaybackTrack } from './spotify'
import { ExtraDataMedia, Utils } from './utils'

import { DOCUMENT } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Inject, Injectable } from '@angular/core'
import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import type {
  Album,
  Artist,
  Audiobook,
  Episode,
  Page,
  Playlist,
  SearchResults,
  Show,
  SimplifiedAlbum,
  SimplifiedEpisode,
} from '@spotify/web-api-ts-sdk/src/types'
import { environment } from 'src/environments/environment'

declare const require: any

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  spotifyApi: SpotifyApi | undefined = undefined
  refreshingToken = false
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
  ) {
    this.initializeSpotify()
  }

  private isLocalhost(): boolean {
    const hostname = window.location.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '' // file:// protocol
  }

  getMediaByQuery(
    query: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.search(query, ['album'], 'DE', 1, 0)).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Search query failed for "${query}" due to rate limiting or API error, returning empty results:`,
          err?.message || err,
        )
        return of({ albums: { total: 0 } })
      }),
      map((response: SearchResults<['album']>) => response.albums.total),
      mergeMap((count) => range(0, Math.ceil(count / 50))),
      mergeMap((multiplier) =>
        defer(() => this.spotifyApi.search(query, ['album'], 'DE', 50, 50 * multiplier)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          catchError((err) => {
            console.warn(
              `Search query page ${multiplier} failed for "${query}" due to rate limiting or API error, returning empty results:`,
              err?.message || err,
            )
            return of({ albums: { items: [] } })
          }),
          map((response: SearchResults<['album']>) => {
            return response.albums.items.map((item) => {
              const media: Media = {
                id: item.id,
                artist: item.artists[0].name,
                title: item.name,
                cover: item.images[0].url,
                release_date: item.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )

    return albums
  }

  getMediaByArtistID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.artists.albums(id, 'album,single,compilation', 'DE', 1, 0)).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Artist albums query failed for artist ${id} due to rate limiting or API error, returning empty results:`,
          err?.message || err,
        )
        return of({ total: 0 })
      }),
      map((response: Page<SimplifiedAlbum>) => ({ counter: response.total })),
      mergeMap((count) =>
        range(0, Math.ceil(count.counter / 50)).pipe(
          map((index) => ({
            range: index,
            ...count,
          })),
        ),
      ),
      mergeMap((counter) =>
        defer(() => this.spotifyApi.artists.get(id)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          catchError((err) => {
            console.warn(
              `Artist info query failed for artist ${id} due to rate limiting or API error:`,
              err?.message || err,
            )
            return of({ images: [{ url: '../assets/images/nocover_mupi.png' }] })
          }),
          map((response: Artist) => ({
            range: counter.range,
            artistcover: response.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          })),
        ),
      ),
      mergeMap((multiplier) =>
        defer(() =>
          this.spotifyApi.artists.albums(id, 'album,single,compilation', 'DE', 50, 50 * multiplier.range),
        ).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          catchError((err) => {
            console.warn(
              `Artist albums page ${multiplier.range} failed for artist ${id} due to rate limiting or API error, returning empty results:`,
              err?.message || err,
            )
            return of({ items: [] })
          }),
          map((response: Page<SimplifiedAlbum>) => {
            return response.items.map((item) => {
              const media: Media = {
                id: item.id,
                artist: item.artists[0].name,
                title: item.name,
                cover: item.images[0].url,
                artistcover: multiplier.artistcover,
                release_date: item.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )

    return albums
  }

  getMediaByShowID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.shows.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Show info query failed for show ${id} due to rate limiting or API error, returning empty results:`,
          err?.message || err,
        )
        return of({
          episodes: { total: 0 },
          name: '',
          images: [{ url: '../assets/images/nocover_mupi.png' }],
        })
      }),
      map((response: Show) => ({
        count: response.episodes.total,
        name: response.name,
        showcover: response.images[0].url,
      })),
      mergeMap((obj) =>
        range(0, Math.ceil(obj.count / 50)).pipe(
          map((index) => ({
            range: index,
            ...obj,
          })),
        ),
      ),
      mergeMap((multiplier) =>
        defer(() => this.spotifyApi.shows.episodes(id, 'DE', 50, 50 * multiplier.range)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          catchError((err) => {
            console.warn(
              `Show episodes page ${multiplier.range} failed for show ${id} due to rate limiting or API error, returning empty results:`,
              err?.message || err,
            )
            return of({ items: [] })
          }),
          map((response: Page<SimplifiedEpisode>) => {
            return response.items
              .filter((el) => el != null)
              .map((item) => {
                const media: Media = {
                  showid: item.id,
                  artist: multiplier.name,
                  title: item.name,
                  cover: item.images[0].url,
                  artistcover: multiplier.showcover,
                  type: 'spotify',
                  category,
                  release_date: item.release_date,
                  index,
                }
                Utils.copyExtraMediaData(extraDataSource, media)
                return media
              })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )
    return albums
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
    const album = defer(() => this.spotifyApi.albums.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Album info query failed for album ${id} due to rate limiting or API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
      map((response: Album) => {
        const media: Media = {
          id: response.id,
          artist: response.artists?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          release_date: response.release_date,
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
    return album
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
    const audiobook = defer(() => this.spotifyApi.audiobooks.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Audiobook info query failed for audiobook ${id} due to rate limiting or API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
      map((response: Audiobook) => {
        const media: Media = {
          audiobookid: response.id,
          artist: response.authors?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
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
    return audiobook
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
    const album = defer(() => this.spotifyApi.episodes.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.warn(
          `Episode info query failed for episode ${id} due to rate limiting or API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
      map((response: Episode) => {
        const media: Media = {
          showid: response.id,
          artist: response.show?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          release_date: response.release_date,
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
    return album
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
    const album = defer(() => this.spotifyApi.playlists.getPlaylist(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.log('Spotify API failed for playlist %s, trying backend media info service...', id)

        return this.http.get<any>(`/api/spotify/playlist/${id}`).pipe(
          timeout(30000),
          catchError((backendErr) => {
            console.error(`Backend failed for playlist ${id}:`, backendErr?.message || backendErr)
            return EMPTY
          }),
        )
      }),
      map((response: Playlist | any) => {
        // Check if response is from backend scraper (has different structure)
        const isFromBackend = response.playlist && response.tracks

        const media: Media = {
          playlistid: isFromBackend ? id : response.id,
          title: isFromBackend ? response.playlist.name : response.name,
          cover: isFromBackend ? response.playlist.images?.[0]?.url : response?.images[0]?.url,
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
    return album
  }

  async validateSpotify(spotifyId: string, spotifyCategory: string): Promise<boolean> {
    let validateState = false

    try {
      if (spotifyCategory === 'album') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.albums.get(spotifyId, 'DE')).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'show') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.shows.get(spotifyId, 'DE')).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'audiobook') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.audiobooks.get(spotifyId)).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'artist') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.artists.get(spotifyId)).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'playlist') {
        try {
          const data: any = await firstValueFrom(
            defer(() => this.spotifyApi.playlists.getPlaylist(spotifyId)).pipe(
              retryWhen((errors) => {
                return this.errorHandler(errors)
              }),
            ),
          )
          if (data.id !== undefined) {
            validateState = true
          }
        } catch (playlistErr) {
          console.log('Spotify API validation failed for playlist %s, trying backend media info...', spotifyId)

          try {
            const backendData: any = await firstValueFrom(
              this.http.get<any>(`/api/spotify/playlist/${spotifyId}`).pipe(timeout(30000)),
            )
            if (backendData.playlist?.name) {
              validateState = true
            }
          } catch (backendErr) {
            console.log('Backend validation also failed for playlist %s', spotifyId)
            validateState = false
          }
        }
      }
    } catch (err) {
      console.log(err)
      validateState = false
    }

    return validateState
  }

  initializeSpotify(): void {
    const spotifyConfigUrl = `${environment.backend.apiUrl}/spotify/config`
    this.http
      .get<SpotifyConfig>(spotifyConfigUrl)
      .pipe(take(1))
      .subscribe({
        next: (spotifyConfig: SpotifyConfig) => {
          this.spotifyApi = SpotifyApi.withClientCredentials(spotifyConfig.clientId, spotifyConfig.clientSecret)
          this.deviceName = spotifyConfig.deviceName
          if (this.shouldUsePlayer()) {
            this.initializeWebPlaybackSDK()
          }
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
            console.log('Network is online and web player should be available - checking SDK status')
            return from(this.performHealthCheckAndRecovery(false))
          }
          return of(null)
        }),
      )
      .subscribe({
        next: () => {
          /* handled in performHealthCheckAndRecovery */
        },
        error: (error) => console.warn('SDK monitoring error:', error),
      })

    // Also periodically check if we should have a working player but don't
    interval(30000)
      .pipe(
        filter(() => this.shouldUsePlayer() && !this.isPlayerReady()),
        switchMap(() => {
          if (navigator.onLine) {
            console.log("Periodic check: Should have web player but don't - attempting SDK retry")
            return from(this.performHealthCheckAndRecovery(false))
          }
          return of(null)
        }),
      )
      .subscribe({
        next: () => {
          /* handled in performHealthCheckAndRecovery */
        },
        error: (error) => console.warn('Periodic SDK check error:', error),
      })
  }

  /**
   * Core health check logic shared between monitoring and on-demand checks
   */
  private async performHealthCheckAndRecovery(comprehensive = true): Promise<boolean> {
    const startTime = Date.now()
    console.debug(`🔍 Starting Spotify player health check (${comprehensive ? 'comprehensive' : 'basic'})...`)

    // If we're not supposed to use the player, return success
    if (!this.shouldUsePlayer()) {
      console.debug('✅ Player not needed on this environment')
      return true
    }

    // Basic connectivity check
    if (!navigator.onLine) {
      console.debug('❌ Device is offline - cannot ensure player health')
      this.logHealthCheckResult(false, 'Device offline', Date.now() - startTime)
      return false
    }

    try {
      // Check if we have a basic player instance
      if (!this.isPlayerReady()) {
        console.log('⚠️  Player not ready - attempting recovery...')
        const recovered = await this.performCompleteRecovery()
        if (!recovered) {
          this.logHealthCheckResult(false, 'Recovery failed', Date.now() - startTime)
          return false
        }
      }

      // For comprehensive checks, also test functionality
      if (comprehensive) {
        console.log('🔬 Testing player functionality...')
        const isHealthy = await this.testPlayerFunctionality()

        if (!isHealthy) {
          console.log('⚠️  Player functional test failed - attempting recovery...')
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

      console.debug(`✅ Player health check passed (${comprehensive ? 'comprehensive' : 'basic'})`)
      this.logHealthCheckResult(
        true,
        comprehensive ? 'Healthy - comprehensive' : 'Healthy - basic',
        Date.now() - startTime,
      )
      return true
    } catch (error) {
      console.error('❌ Health check failed with error:', error)
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
          console.error('Failed to initialize Spotify Web Playback SDK:', error)
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
        console.warn(`SDK load attempt ${attempt} failed:`, error)

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
              console.error('Invalid or empty Spotify token received')
              return
            }
            // Token is passed directly to callback
            cb(token)
          },
          error: (error) => {
            console.error('Failed to fetch Spotify token for player:', error)
            this.isConnected$.next(false)
          },
        })
      },
      volume: 1,
    })

    this.player?.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id)
      this.deviceId = device_id
      this.isConnected$.next(true)
    })

    this.player?.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID gone', device_id)
      this.deviceId = null
      this.isConnected$.next(false)
    })

    this.player?.addListener('initialization_error', ({ message }) => {
      console.error('Initialization Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('authentication_error', ({ message }) => {
      console.error('Authentication Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('account_error', ({ message }) => {
      console.error('Account Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('playback_error', ({ message }) => {
      console.error('Playback Error', message)
      this.isConnected$.next(false)
    })

    this.player?.addListener('player_state_changed', (state: SpotifyWebPlaybackState) => {
      this.playerState$.next(state)
      this.currentTrack$.next(state.track_window.current_track)

      // Only detect external playback on actual track changes, not every state change
      const currentTrack = state.track_window.current_track
      const previousTrack = this.previousPlayerState?.track_window?.current_track

      if (!state.paused && currentTrack && (!previousTrack || previousTrack.id !== currentTrack.id)) {
        console.log('🔍 Spotify track change detected:', currentTrack.name)
        this.externalPlaybackDetected$.next(currentTrack)
      }

      // Store current state for comparison
      this.previousPlayerState = state
      console.debug('Player State Changed', state)
    })

    this.player?.connect()
  }

  errorHandler(errors: Observable<any>) {
    return errors.pipe(
      mergeMap((error) => {
        if (error.status === 429) {
          // Handle rate limiting - extract retry delay from headers
          let retryAfter: string | null = null

          // Try different ways to access the Retry-After header
          if (error.headers?.get) {
            retryAfter = error.headers.get('Retry-After') || error.headers.get('retry-after')
          } else if (error.headers) {
            retryAfter = error.headers['Retry-After'] || error.headers['retry-after']
          }

          const delaySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : 1
          const delayMs = delaySeconds * 1000

          console.warn(`Rate limited by Spotify API. Retrying after ${delaySeconds} seconds`)

          return of(error).pipe(delay(delayMs))
        }
        // For other errors, don't retry
        return throwError(() => error)
      }),
      take(2),
    )
  }

  // Player control methods
  async play(): Promise<void> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return
    }

    try {
      // Resume playback
      await this.player.resume()
    } catch (error) {
      console.error('Error playing:', error)
    }
  }

  async pause(): Promise<void> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.pause()
    } catch (error) {
      console.error('Error pausing:', error)
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.nextTrack()
    } catch (error) {
      console.error('Error skipping to next track:', error)
    }
  }

  async previousTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.previousTrack()
    } catch (error) {
      console.error('Error skipping to previous track:', error)
    }
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return
    }

    try {
      await this.player.setVolume(volume)
    } catch (error) {
      console.error('Error setting volume:', error)
    }
  }

  async getVolume(): Promise<number> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return 0
    }

    try {
      return await this.player.getVolume()
    } catch (error) {
      console.error('Error getting volume:', error)
      return 0
    }
  }

  async getCurrentState(): Promise<any> {
    if (!this.isPlayerReady()) {
      console.warn('Player not ready or not connected')
      return null
    }

    try {
      return await this.player.getCurrentState()
    } catch (error) {
      console.error('Error getting current state:', error)
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

      console.log('🔧 Player responded to getCurrentState()')
      return true
    } catch (error) {
      console.log('❌ Player functional test failed:', error.message)
      return false
    }
  }

  private async performCompleteRecovery(): Promise<boolean> {
    console.log('🔄 Starting complete Spotify SDK recovery...')
    const recoveryStartTime = Date.now()

    try {
      // Step 1: Complete teardown
      await this.completeSDKTeardown()

      // Step 2: Clear any cached state
      this.sdkLoadingPromise = null
      this.sdkLoadError$.next(null)

      // Step 3: Rebuild from scratch
      console.log('🏗️  Rebuilding SDK from scratch...')
      await this.initializeWebPlaybackSDKSync()

      // Step 4: Wait for ready state with timeout
      const isReady = await this.waitForPlayerReady(10000)

      if (isReady) {
        console.log(`✅ Complete recovery successful in ${Date.now() - recoveryStartTime}ms`)
        return true
      }
      console.log(`❌ Recovery failed - player not ready after ${Date.now() - recoveryStartTime}ms`)
      return false
    } catch (error) {
      console.error(`❌ Recovery failed after ${Date.now() - recoveryStartTime}ms:`, error)
      return false
    }
  }

  private async completeSDKTeardown(): Promise<void> {
    console.log('🧹 Performing complete SDK teardown...')

    // Disconnect and clear player
    if (this.player) {
      try {
        await this.player.disconnect()
      } catch (error) {
        console.log('Warning: Error during player disconnect:', error)
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

    console.log('🧹 SDK teardown complete')
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

    console.debug(logMessage)

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

    console.debug(`SPOTIFY_SDK_STATE: ${JSON.stringify(state)} | ${timestamp}`)
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
    if (!this.spotifyApi) {
      return of({ total_tracks: 0, album_name: '', tracks: [] })
    }

    return defer(() => this.spotifyApi.albums.get(albumId, 'DE')).pipe(
      map((album) => ({
        total_tracks: album.total_tracks,
        album_name: album.name,
        tracks: album.tracks.items.map((track) => ({
          id: track.id,
          uri: track.uri,
          name: track.name,
          track_number: track.track_number,
        })),
      })),
      catchError((error) => {
        console.error('Error getting album info:', error)
        return of({ total_tracks: 0, album_name: '', tracks: [] })
      }),
    )
  }

  /**
   * Get playlist information including total tracks and track data
   */
  getPlaylistInfo(playlistId: string): Observable<{ total_tracks: number; playlist_name: string; tracks?: any[] }> {
    if (!this.spotifyApi) {
      return of({ total_tracks: 0, playlist_name: '', tracks: [] })
    }

    return defer(() => this.spotifyApi.playlists.getPlaylist(playlistId, 'DE')).pipe(
      switchMap((playlist) => {
        // Get all tracks for position calculation
        return defer(() => this.spotifyApi.playlists.getPlaylistItems(playlistId, 'DE')).pipe(
          map((tracksData) => ({
            total_tracks: playlist.tracks.total,
            playlist_name: playlist.name,
            tracks: tracksData.items.map((item) => ({
              id: item.track.id,
              uri: item.track.uri,
              name: item.track.name,
            })),
          })),
        )
      }),
      catchError((error) => {
        console.log('Spotify API failed for playlist info %s, trying backend media info...', playlistId)

        // Fallback to backend scraper endpoint
        return this.http.get<any>(`/api/spotify/playlist/${playlistId}`).pipe(
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
            console.error('Backend also failed for playlist info:', backendError)
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
    if (!this.spotifyApi) {
      return of({ total_episodes: 0, show_name: '', episodes: [] })
    }

    return defer(() => this.spotifyApi.shows.get(showId, 'DE')).pipe(
      switchMap((show) => {
        // Get all episodes for position calculation
        return defer(() => this.spotifyApi.shows.episodes(showId, 'DE')).pipe(
          map((episodesData) => ({
            total_episodes: show.total_episodes,
            show_name: show.name,
            episodes: episodesData.items.map((episode) => ({
              id: episode.id,
              uri: episode.uri,
              name: episode.name,
            })),
          })),
        )
      }),
      catchError((error) => {
        console.error('Error getting show info:', error)
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
    if (!this.spotifyApi) {
      return of({ total_chapters: 0, audiobook_name: '', chapters: [] })
    }

    return defer(() => this.spotifyApi.audiobooks.get(audiobookId, 'DE')).pipe(
      map((audiobook) => ({
        total_chapters: audiobook.chapters?.total || 0,
        audiobook_name: audiobook.name,
        chapters:
          audiobook.chapters?.items?.map((chapter) => ({
            id: chapter.id,
            uri: chapter.uri,
            name: chapter.name,
          })) || [],
      })),
      catchError((error) => {
        console.error('Error getting audiobook info:', error)
        return of({ total_chapters: 0, audiobook_name: '', chapters: [] })
      }),
    )
  }
}
