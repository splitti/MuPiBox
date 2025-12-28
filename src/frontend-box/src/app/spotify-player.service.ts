import { DOCUMENT } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Inject, Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { debounceTime, filter } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { LogService } from './log.service'
import type { Media } from './media'
import { NetworkService } from './network.service'
import { SpotifyPlayer, SpotifyWebPlaybackState, SpotifyWebPlaybackTrack } from './spotify'

/** SDK loading state */
type SdkState = 'not_loaded' | 'loading' | 'loaded' | 'ready' | 'error'

@Injectable({
  providedIn: 'root',
})
export class SpotifyPlayerService {
  // Device configuration
  private deviceName: string | undefined = undefined

  // SDK state tracking
  private sdkState: SdkState = 'not_loaded'

  // Web Playback SDK properties
  private player: SpotifyPlayer | null = null
  private deviceId: string | null = null

  // Player state observables
  public playerState$ = new BehaviorSubject<SpotifyWebPlaybackState | null>(null)
  public isConnected$ = new BehaviorSubject<boolean>(false)
  public currentTrack$ = new BehaviorSubject<SpotifyWebPlaybackTrack | null>(null)

  // External playback detection
  private previousPlayerState: SpotifyWebPlaybackState | null = null
  public trackChangeDetected$ = new BehaviorSubject<SpotifyWebPlaybackTrack | null>(null)

  // Error state observable for UI feedback
  public sdkLoadError$ = new BehaviorSubject<string | null>(null)

  // Lock to prevent parallel ensurePlayerReady calls
  private ensurePlayerReadyPromise: Promise<boolean> | null = null

  // Timeout tracking to prevent ghost callbacks
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set()

  // Network recovery cooldown
  private lastRecoveryAttempt: number = 0
  private readonly RECOVERY_COOLDOWN_MS = 10000 // 10 seconds
  private readonly NETWORK_DEBOUNCE_MS = 3000 // 3 seconds - wait for network to stabilize

  // Cached online state from NetworkService
  private isOnline = false

  constructor(
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document,
    private logService: LogService,
    private networkService: NetworkService,
  ) {
    // Subscribe to network state to keep cached value up to date
    this.networkService.isOnline().subscribe((online) => {
      this.isOnline = online
    })

    this.setupNetworkMonitoring()
  }

  /**
   * Initialize the player with a device name
   */
  initialize(deviceName: string): void {
    this.deviceName = deviceName
    if (this.shouldUsePlayer()) {
      this.logService.log('[Spotify SDK] Initializing with device name:', deviceName)
      this.ensurePlayerReady().catch((error) => {
        this.logService.error('[Spotify SDK] Error during initialization:', error)
      })
    }
  }

  /**
   * Check if we're running on localhost (where the player should be used)
   */
  isLocalhost(): boolean {
    const hostname = window.location.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '' // file:// protocol
  }

  /**
   * Determine if the Web Playback SDK player should be used
   */
  shouldUsePlayer(): boolean {
    return this.isLocalhost()
  }

  /**
   * Check if the player is ready for playback
   */
  isPlayerReady(): boolean {
    return this.player !== null && this.deviceId !== null && this.isConnected$.value === true
  }

  /**
   * Get the Web Playback SDK device ID for use in play requests
   */
  getDeviceId(): string | null {
    return this.deviceId
  }

  /**
   * Get the current SDK state for debugging
   */
  getSdkState(): SdkState {
    return this.sdkState
  }

  // ============================================================================
  // Player Control Methods
  // ============================================================================

  async play(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for play()')
      return
    }

    try {
      await this.player.resume()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error playing:', error)
    }
  }

  async pause(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for pause()')
      return
    }

    try {
      await this.player.pause()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error pausing:', error)
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for nextTrack()')
      return
    }

    try {
      await this.player.nextTrack()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error skipping to next track:', error)
    }
  }

  async previousTrack(): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for previousTrack()')
      return
    }

    try {
      await this.player.previousTrack()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error skipping to previous track:', error)
    }
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for setVolume()')
      return
    }

    try {
      await this.player.setVolume(volume)
    } catch (error) {
      this.logService.error('[Spotify SDK] Error setting volume:', error)
    }
  }

  async getVolume(): Promise<number> {
    if (!this.isPlayerReady()) {
      this.logService.warn('[Spotify SDK] Player not ready for getVolume()')
      return 0
    }

    try {
      return await this.player.getVolume()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error getting volume:', error)
      return 0
    }
  }

  async getCurrentState(): Promise<SpotifyWebPlaybackState | null> {
    if (!this.isPlayerReady()) {
      return null
    }

    try {
      return await this.player.getCurrentState()
    } catch (error) {
      this.logService.error('[Spotify SDK] Error getting current state:', error)
      return null
    }
  }

  disconnect(): void {
    if (this.player) {
      this.logService.log('[Spotify SDK] Disconnecting player')
      this.player.disconnect()
      this.player = null
      this.deviceId = null
      this.isConnected$.next(false)
      this.playerState$.next(null)
      this.currentTrack$.next(null)
      this.previousPlayerState = null
      this.sdkState = 'loaded' // SDK is still loaded, just disconnected
    }
  }

  private cleanupBrokenPlayer(): void {
    this.logService.warn('[Spotify SDK] Cleaning up player due to token/auth failure')
    if (this.player) {
      this.player.disconnect()
      this.player = null
    }
    this.deviceId = null
    this.sdkState = 'loaded'
    this.isConnected$.next(false)
    this.playerState$.next(null)
    this.currentTrack$.next(null)
    this.previousPlayerState = null
  }

  // ============================================================================
  // SDK Loading and Recovery
  // ============================================================================

  /**
   * Ensure the player is ready before playback.
   * Called by external code before attempting to play.
   * Will attempt to load SDK and connect if needed.
   * Prevents parallel calls and implements timeout protection.
   */
  async ensurePlayerReady(): Promise<boolean> {
    // If player is already ready, return immediately without waiting for any ongoing recovery
    if (this.isPlayerReady()) {
      this.logService.log('[Spotify SDK] Player already ready, returning immediately')
      return true
    }

    // If already in progress, return the existing promise
    if (this.ensurePlayerReadyPromise) {
      this.logService.log('[Spotify SDK] ensurePlayerReady() already in progress, waiting...')
      return this.ensurePlayerReadyPromise
    }

    // Clear any previous timeouts to prevent ghost callbacks
    this.clearAllTimeouts()

    // Create new promise with timeout protection
    this.ensurePlayerReadyPromise = Promise.race([
      this._ensurePlayerReadyInternal(),
      new Promise<boolean>((resolve) => {
        const timeoutId = setTimeout(() => {
          this.logService.error('[Spotify SDK] ensurePlayerReady() timeout after 30s')
          this.activeTimeouts.delete(timeoutId)
          resolve(false)
        }, 30000)
        this.activeTimeouts.add(timeoutId)
      }),
    ]).finally(() => {
      // Clear all timeouts and the lock when done (success, failure, or timeout)
      this.clearAllTimeouts()
      this.ensurePlayerReadyPromise = null
    })

    return this.ensurePlayerReadyPromise
  }

  /**
   * Internal implementation of ensurePlayerReady with error handling
   */
  private async _ensurePlayerReadyInternal(): Promise<boolean> {
    this.logService.log('[Spotify SDK] ensurePlayerReady() called, state:', this.sdkState)

    try {
      // Already ready
      if (this.isPlayerReady()) {
        this.logService.log('[Spotify SDK] Player already ready')
        return true
      }

      // Can't do anything without network
      if (!this.isOnline) {
        this.logService.warn('[Spotify SDK] Cannot ensure player ready - device is offline')
        return false
      }

      // Step 1: Load SDK if needed
      if (this.sdkState === 'not_loaded' || this.sdkState === 'error') {
        await this.tryLoadSDK()
      }

      // Step 2: Create player if SDK loaded but no player
      if (this.sdkState === 'loaded' && !this.player) {
        this.logService.log('[Spotify SDK] Creating player instance')
        this.initializePlayer()
      }

      // Step 3: Connect player if exists but not connected
      if (this.player && !this.isConnected$.value) {
        this.logService.log('[Spotify SDK] Connecting player')
        try {
          await this.player.connect()
          // Wait briefly for ready event
          await this.waitForConnection(5000)
        } catch (error) {
          this.logService.error('[Spotify SDK] Error connecting player:', error)
        }
      }

      const ready = this.isPlayerReady()
      this.logService.log('[Spotify SDK] ensurePlayerReady() result:', ready, 'state:', this.sdkState)
      return ready
    } catch (error) {
      this.logService.error('[Spotify SDK] ensurePlayerReady() exception:', error)
      return false
    }
  }

  /**
   * Clear all active timeout timers to prevent ghost callbacks
   */
  private clearAllTimeouts(): void {
    for (const timeoutId of this.activeTimeouts) {
      clearTimeout(timeoutId)
    }
    this.activeTimeouts.clear()
  }

  /**
   * Try to load the Spotify SDK script (single attempt)
   */
  private async tryLoadSDK(): Promise<void> {
    // Already loaded or currently loading
    if (this.sdkState === 'loaded' || this.sdkState === 'ready') {
      return
    }
    if (this.sdkState === 'loading') {
      this.logService.log('[Spotify SDK] Already loading, skipping')
      return
    }

    // Check if SDK is already available (page refresh case)
    if (window.Spotify?.Player) {
      this.logService.log('[Spotify SDK] SDK already available in window')
      this.sdkState = 'loaded'
      this.sdkLoadError$.next(null)
      return
    }

    this.logService.log('[Spotify SDK] Loading SDK script...')
    this.sdkState = 'loading'
    this.sdkLoadError$.next(null)

    try {
      await this.loadSDKScript()
      this.sdkState = 'loaded'
      this.sdkLoadError$.next(null)
      this.logService.log('[Spotify SDK] SDK loaded successfully')
    } catch (error) {
      this.sdkState = 'error'
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading SDK'
      this.sdkLoadError$.next(errorMsg)
      this.logService.error('[Spotify SDK] Failed to load SDK:', errorMsg)
    }
  }

  /**
   * Load the Spotify SDK script
   */
  private loadSDKScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check network
      if (!this.isOnline) {
        reject(new Error('Device is offline'))
        return
      }

      // Remove any existing scripts
      const existingScripts = this.document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]')
      for (const script of Array.from(existingScripts)) {
        script.remove()
      }

      // Clear any existing global
      if (window.Spotify) {
        window.Spotify = undefined
      }

      // Set up the ready callback
      window.onSpotifyWebPlaybackSDKReady = () => {
        this.logService.log('[Spotify SDK] onSpotifyWebPlaybackSDKReady callback fired')
        if (window.Spotify?.Player) {
          resolve()
        } else {
          reject(new Error('SDK ready callback fired but Spotify.Player not available'))
        }
      }

      // Create and load the script
      const script = this.document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true

      script.onerror = () => {
        reject(new Error('Failed to load spotify-player.js - check internet connection'))
      }

      this.document.head.appendChild(script)

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.sdkState === 'loading') {
          reject(new Error('SDK load timeout after 15 seconds'))
        }
      }, 15000)
    })
  }

  /**
   * Wait for connection with timeout
   */
  private waitForConnection(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isConnected$.value) {
        resolve(true)
        return
      }

      const subscription = this.isConnected$.subscribe((connected) => {
        if (connected) {
          subscription.unsubscribe()
          resolve(true)
        }
      })

      setTimeout(() => {
        subscription.unsubscribe()
        resolve(this.isConnected$.value)
      }, timeoutMs)
    })
  }

  /**
   * Initialize the Spotify Player instance
   */
  private initializePlayer(): void {
    if (!window.Spotify || !window.Spotify.Player) {
      this.logService.error('[Spotify SDK] Cannot initialize player - Spotify.Player not available')
      return
    }

    this.logService.log('[Spotify SDK] Creating new Spotify.Player instance')

    this.player = new (window.Spotify.Player as any)({
      name: this.deviceName || 'MuPiBox Web Player',
      getOAuthToken: (cb: (token: string) => void) => {
        const tokenUrl = `${environment.backend.playerUrl}/spotify/token`
        this.http.get(tokenUrl, { responseType: 'text' }).subscribe({
          next: (token) => {
            if (!token || typeof token !== 'string' || token.trim() === '') {
              this.logService.error('[Spotify SDK] Invalid or empty token received')
              cb('') // Signal error to SDK
              return
            }
            cb(token)
          },
          error: (error) => {
            this.logService.error('[Spotify SDK] Failed to fetch token:', error)
            cb('') // Signal error to SDK -> will trigger authentication_error after retries
          },
        })
      },
      volume: 1,
    })

    // Ready event - player connected successfully
    this.player?.addListener('ready', ({ device_id }) => {
      this.logService.log('[Spotify SDK] Ready with Device ID:', device_id)
      this.deviceId = device_id
      this.sdkState = 'ready'
      this.isConnected$.next(true)
    })

    // Not ready event - device disconnected
    this.player?.addListener('not_ready', ({ device_id }) => {
      this.logService.log('[Spotify SDK] Device not ready:', device_id)
      this.deviceId = null
      this.sdkState = 'loaded'
      this.isConnected$.next(false)
    })

    // Error events
    this.player?.addListener('initialization_error', ({ message }) => {
      this.logService.error('[Spotify SDK] Initialization error:', message)
      this.cleanupBrokenPlayer()
    })

    this.player?.addListener('authentication_error', ({ message }) => {
      this.logService.error('[Spotify SDK] Authentication error:', message)
      this.cleanupBrokenPlayer()
    })

    this.player?.addListener('account_error', ({ message }) => {
      this.logService.error('[Spotify SDK] Account error:', message)
      this.cleanupBrokenPlayer()
    })

    this.player?.addListener('playback_error', ({ message }) => {
      this.logService.error('[Spotify SDK] Playback error:', message)
    })

    // State change event
    this.player?.addListener('player_state_changed', (state: SpotifyWebPlaybackState) => {
      this.playerState$.next(state)
      this.currentTrack$.next(state.track_window.current_track)

      // Detect external track changes
      const currentTrack = state.track_window.current_track
      const previousTrack = this.previousPlayerState?.track_window?.current_track

      if (!state.paused && currentTrack && (!previousTrack || previousTrack.id !== currentTrack.id)) {
        this.logService.log('[Spotify SDK] Track change detected:', currentTrack.name)
        this.trackChangeDetected$.next(currentTrack)
      }

      this.previousPlayerState = state
    })
  }

  // ============================================================================
  // Network Monitoring
  // ============================================================================

  /**
   * Monitor network status and retry SDK load when coming back online
   */
  private setupNetworkMonitoring(): void {
    if (!this.shouldUsePlayer()) {
      return
    }

    this.networkService
      .isOnline()
      .pipe(
        filter((isOnline) => isOnline),
        debounceTime(this.NETWORK_DEBOUNCE_MS), // Wait for network to stabilize
        filter(() => this.sdkState === 'error' || this.sdkState === 'not_loaded'),
      )
      .subscribe(() => {
        // Check cooldown to prevent excessive recovery attempts
        const now = Date.now()
        const timeSinceLastAttempt = now - this.lastRecoveryAttempt

        if (timeSinceLastAttempt < this.RECOVERY_COOLDOWN_MS) {
          const remainingCooldown = Math.ceil((this.RECOVERY_COOLDOWN_MS - timeSinceLastAttempt) / 1000)
          this.logService.log(
            `[Spotify SDK] Network online but in cooldown period (${remainingCooldown}s remaining), skipping recovery`,
          )
          return
        }

        this.logService.log('[Spotify SDK] Network online and stable, attempting full recovery...')
        this.lastRecoveryAttempt = now
        this.ensurePlayerReady().catch((error) => {
          this.logService.error('[Spotify SDK] Error during network recovery:', error)
        })
      })
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

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
}
