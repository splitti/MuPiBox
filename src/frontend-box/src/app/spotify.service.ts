import { EMPTY, Observable, catchError, defer, firstValueFrom, of, range, throwError, BehaviorSubject } from 'rxjs'
import { delay, map, mergeAll, mergeMap, retryWhen, take, tap, toArray } from 'rxjs/operators'
import type { CategoryType, Media } from './media'
import { SpotifyConfig, SpotifyPlayer, SpotifyPlayerConfig, SpotifyWebPlaybackState, SpotifyWebPlaybackTrack } from './spotify'
import { ExtraDataMedia, Utils } from './utils'

import { HttpClient } from '@angular/common/http'
import { Injectable, Inject } from '@angular/core'
import { DOCUMENT } from '@angular/common'
import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import type {
    Album,
    Artist,
    Audiobook,
    Episode,
    Page, Playlist,
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
  public isActive$ = new BehaviorSubject<boolean>(false)
  public currentTrack$ = new BehaviorSubject<SpotifyWebPlaybackTrack | null>(null)

  // SDK loading state
  private sdkLoadingPromise: Promise<void> | null = null

  constructor(private http: HttpClient, @Inject(DOCUMENT) private document: Document) {
    this.initializeSpotify()
  }

  private isLocalhost(): boolean {
    const hostname = window.location.hostname
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '::1' ||
           hostname === ''  // file:// protocol
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
      map((response: SearchResults<['album']>) => response.albums.total),
      mergeMap((count) => range(0, Math.ceil(count / 50))),
      mergeMap((multiplier) =>
        defer(() => this.spotifyApi.search(query, ['album'], 'DE', 50, 50 * multiplier)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
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
          map((response: Artist) => ({
            range: counter.range,
            artistcover: response.images[0].url,
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
        console.log('Caught error for Spotify playlist %s, continuing...', id)
        return EMPTY
      }),
      map((response: Playlist) => {
        const media: Media = {
          playlistid: response.id,
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
    return album
  }

  // Only used for single "artist + title" entries with "type: spotify" in the database.
  // Artwork for spotify search queries are already fetched together with the initial searchAlbums request
  getAlbumArtwork(artist: string, title: string): Observable<string> {
    const artwork = defer(() => this.spotifyApi.search(`album:${title} artist:${artist}`, ['album'], 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: SearchResults<['album']>) => {
        return response?.albums?.items?.[0]?.images?.[0]?.url || ''
      }),
    )

    return artwork
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
          if (this.isLocalhost()) {
            this.initializeWebPlaybackSDK()
          }
        },
      })
  }

  private loadSpotifySDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if SDK is already loaded
      if (window.Spotify && window.Spotify.Player) {
        resolve()
        return
      }

      // Remove any existing scripts
      const existingScripts = this.document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]')
      existingScripts.forEach(script => script.remove())

      // Set up the callback
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (window.Spotify && window.Spotify.Player) {
          resolve()
        } else {
          reject(new Error('SDK ready callback fired but Spotify object not available'))
        }
      }

      // Create and load the script
      const script = this.document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      
      script.onload = () => {
        setTimeout(() => {
          if (window.Spotify && window.Spotify.Player) {
            resolve()
          }
        }, 500)
      }
      
      script.onerror = () => {
        reject(new Error('Failed to load Spotify Web Playback SDK script'))
      }
      
      this.document.head.appendChild(script)

      // Timeout fallback
      setTimeout(() => {
        if (window.Spotify && window.Spotify.Player) {
          resolve()
        } else {
          reject(new Error('Spotify SDK load timeout'))
        }
      }, 10000)
    })
  }

  initializeWebPlaybackSDK(): void {
    if (!this.sdkLoadingPromise) {
      this.sdkLoadingPromise = this.loadSpotifySDK()
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
      volume: 1
    })



    this.player!.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id)
      this.deviceId = device_id
      this.isConnected$.next(true)
    })

    this.player!.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID gone', device_id)
      this.deviceId = null
      this.isConnected$.next(false)
    })

    this.player!.addListener('initialization_error', ({ message }) => {
      console.error('Initialization Error', message)
      this.isConnected$.next(false)
    })

    this.player!.addListener('authentication_error', ({ message }) => {
      console.error('Authentication Error', message)
      this.isConnected$.next(false)
    })

    this.player!.addListener('account_error', ({ message }) => {
      console.error('Account Error', message)
      this.isConnected$.next(false)
    })

    this.player!.addListener('playback_error', ({ message }) => {
      console.error('Playback Error', message)
      this.isConnected$.next(false)
    })

    this.player!.addListener('player_state_changed', (state: SpotifyWebPlaybackState) => {
      this.playerState$.next(state)
      this.currentTrack$.next(state.track_window.current_track)
      this.isActive$.next(state.is_active)
      console.debug('Player State Changed', state)
    })

    this.player!.connect()
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
          
          const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 1
          const delayMs = delaySeconds * 1000
          
          console.warn(`Rate limited by Spotify API. Retrying after ${delaySeconds} seconds`)
          
          return of(error).pipe(delay(delayMs))
        } else {
          // For other errors, don't retry
          return throwError(() => error)
        }
      }),
      take(2),
    )
  }

  // Player control methods
  async play(): Promise<void> {
    if (!this.player || !this.deviceId) {
      console.warn('Player not ready')
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
    if (!this.player) {
      console.warn('Player not ready')
      return
    }

    try {
      await this.player.pause()
    } catch (error) {
      console.error('Error pausing:', error)
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.player) {
      console.warn('Player not ready')
      return
    }

    try {
      await this.player.nextTrack()
    } catch (error) {
      console.error('Error skipping to next track:', error)
    }
  }

  async previousTrack(): Promise<void> {
    if (!this.player) {
      console.warn('Player not ready')
      return
    }

    try {
      await this.player.previousTrack()
    } catch (error) {
      console.error('Error skipping to previous track:', error)
    }
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.player) {
      console.warn('Player not ready')
      return
    }

    try {
      await this.player.setVolume(volume)
    } catch (error) {
      console.error('Error setting volume:', error)
    }
  }

  async getVolume(): Promise<number> {
    if (!this.player) {
      console.warn('Player not ready')
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
    if (!this.player) {
      console.warn('Player not ready')
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
      this.isActive$.next(false)
      this.playerState$.next(null)
      this.currentTrack$.next(null)
    }
  }

  isPlayerReady(): boolean {
    return this.player !== null && this.deviceId !== null
  }

  shouldUsePlayer(): boolean {
    return this.isLocalhost()
  }

  /**
   * Get the Web Playback SDK device ID for use in play requests
   */
  getDeviceId(): string | null {
    return this.deviceId
  }
}
