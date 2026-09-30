import { DOCUMENT } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Inject, Injectable } from '@angular/core'
import { BehaviorSubject, Subject, timer } from 'rxjs'
import { debounce, filter } from 'rxjs/operators'
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
  // LOW-4 / A24: this used to be a BehaviorSubject, which replays the last
  // emitted value to every new subscriber. external-playback-navigator's
  // subscribe-on-init then re-fired auto-navigate-to-/player on HMR /
  // component re-mount with whatever track was last detected — even though
  // the user had since navigated elsewhere. Subject (without replay) only
  // emits to listeners attached at the moment of .next(), which is the
  // intended "track-just-changed" fire-and-forget shape for this signal.
  // Verified all consumers: only .next() and .subscribe() — no .value reads
  // anywhere, so the swap is safe.
  public trackChangeDetected$ = new Subject<SpotifyWebPlaybackTrack | null>()

  // Error state observable for UI feedback
  public sdkLoadError$ = new BehaviorSubject<string | null>(null)

  // Lock to prevent parallel ensurePlayerReady calls
  private ensurePlayerReadyPromise: Promise<boolean> | null = null

  // Single-flight guard for loadSDKScript (LOW-4): if two callers race to
  // initialise the SDK, both should resolve off the same in-flight load
  // instead of each registering their own onSpotifyWebPlaybackSDKReady
  // and risking the first one being dropped.
  private sdkLoadInflight: Promise<void> | null = null

  // Timeout tracking to prevent ghost callbacks
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set()

  // Network recovery cooldown
  private lastRecoveryAttempt: number = 0
  private readonly RECOVERY_COOLDOWN_MS = 10000 // 10 seconds
  private readonly NETWORK_DEBOUNCE_MS = 3000 // 3 seconds - wait for network to stabilize
  private networkSeenOnline = false // the first 'online' after the start needs no waiting

  // Cached online state from NetworkService
  private isOnline = false

  // When Spotify last listed this player among the account's devices (see deviceKnownToSpotify)
  private deviceCheckedAt = 0
  private readonly DEVICE_CHECK_FRESH_MS = 60000 // a start within a minute of a check needs no second one
  private readonly DEVICE_CHECK_EVERY_MS = 180000 // also every 3 minutes: starts from the web app or Telegram find it connected

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
    this.setupDeviceCheck()
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
    // If player is already ready, return immediately without waiting for any ongoing recovery (when Spotify was
    // seen to know the device a moment ago - else it is checked first, see _ensurePlayerReadyInternal)
    if (this.isPlayerReady() && Date.now() - this.deviceCheckedAt < this.DEVICE_CHECK_FRESH_MS) {
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
      // Already ready - as far as the player knows: it can lose its connection to Spotify without saying so (no
      // not_ready; Spotify's list of devices was empty and every start went nowhere). Spotify is asked first.
      if (this.isPlayerReady()) {
        if ((await this.deviceKnownToSpotify()) !== false) {
          this.logService.log('[Spotify SDK] Player already ready')
          return true
        }
        await this.reconnectPlayer()
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
      // Setting up the player (and its DRM module) blanked the screen for a moment: the boot screen of index.html
      // stays until it is done
      window.setTimeout(() => (window as unknown as { mupiBootDone?: (what: string) => void }).mupiBootDone?.('sdk'), 300)
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
    // the boot screen of index.html waits for the set-up only once it has begun
    ;(window as unknown as { mupiBootDone?: (what: string) => void }).mupiBootDone?.('sdkStart')
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
   * Load the Spotify SDK script.
   *
   * MED-12 / LOW-4: previously this could leak both a never-cleared 15s
   * timeout and a hanging onSpotifyWebPlaybackSDKReady callback if the
   * caller's promise was already resolved or rejected. Concurrent calls
   * would also each register their own ready-callback, so a fast second
   * invocation could `resolve()` the wrong promise. Single-flight the
   * load via `sdkLoadInflight`, capture the timeout handle so we can
   * clear it on either resolve or reject, and wrap resolve/reject so
   * cleanup runs exactly once.
   */
  private loadSDKScript(): Promise<void> {
    if (this.sdkLoadInflight) return this.sdkLoadInflight

    this.sdkLoadInflight = new Promise<void>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      let settled = false
      const settle = (cb: () => void) => {
        if (settled) return
        settled = true
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }
        cb()
      }
      const ok = () => settle(resolve)
      const fail = (err: Error) => settle(() => reject(err))

      if (!this.isOnline) {
        fail(new Error('Device is offline'))
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

      window.onSpotifyWebPlaybackSDKReady = () => {
        this.logService.log('[Spotify SDK] onSpotifyWebPlaybackSDKReady callback fired')
        if (window.Spotify?.Player) {
          ok()
        } else {
          fail(new Error('SDK ready callback fired but Spotify.Player not available'))
        }
      }

      const script = this.document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      script.onerror = () => {
        fail(new Error('Failed to load spotify-player.js - check internet connection'))
      }
      this.document.head.appendChild(script)

      timeoutHandle = setTimeout(() => {
        if (this.sdkState === 'loading') {
          fail(new Error('SDK load timeout after 15 seconds'))
        }
      }, 15000)
    }).finally(() => {
      this.sdkLoadInflight = null
    })

    return this.sdkLoadInflight
  }

  /**
   * Wait for connection with timeout.
   *
   * LOW-4 / MED-12: previously the setTimeout handle was discarded so a
   * fast resolve (connection arrived) still left the timer running until
   * timeoutMs. With many calls in quick succession, timers piled up and
   * each held the closure (and the subscription's last reference)
   * alive. Capture the handle and clear it on the success path; resolve
   * only once via a `settled` flag so a connection arriving 1ms before
   * the timeout doesn't double-call resolve.
   */
  private waitForConnection(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isConnected$.value) {
        resolve(true)
        return
      }

      let settled = false
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      const finish = (val: boolean) => {
        if (settled) return
        settled = true
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }
        subscription.unsubscribe()
        resolve(val)
      }

      const subscription = this.isConnected$.subscribe((connected) => {
        if (connected) finish(true)
      })

      timeoutHandle = setTimeout(() => {
        finish(this.isConnected$.value)
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
      // Tell the player which Spotify device the display is: a start that does not come from the display (the
      // parents' web app, Telegram) plays here too, instead of on "the active device" - there is none after a
      // restart or while the NAS/local media played, and then nothing played at all.
      this.http
        .get(`${environment.backend.playerUrl}/display/spotify-device/${encodeURIComponent(device_id)}`)
        .subscribe({ error: () => {} })
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
        // Wait for the network to stabilize - but not at the start of the display: the box is online already, and the
        // player was set up 3 s later than needed (its set-up holds the boot screen, see index.html)
        debounce(() => timer(this.networkSeenOnline ? this.NETWORK_DEBOUNCE_MS : 0)),
        filter(() => this.sdkState === 'error' || this.sdkState === 'not_loaded'),
      )
      .subscribe(() => {
        this.networkSeenOnline = true
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

  /**
   * Whether Spotify lists this player among the account's devices: true or false, null when that could not be
   * asked (offline, token, timeout) - then nothing is changed on a guess.
   */
  private async deviceKnownToSpotify(): Promise<boolean | null> {
    const id = this.deviceId
    if (!id || !this.isOnline) return null
    try {
      const tokenRes = await fetch(`${environment.backend.playerUrl}/spotify/token`, { signal: AbortSignal.timeout(4000) })
      const token = (await tokenRes.text()).trim()
      if (!tokenRes.ok || !token) return null
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) return null
      const body = (await res.json()) as { devices?: { id?: string }[] }
      const known = (body.devices ?? []).some((d) => d.id === id)
      if (known) {
        this.deviceCheckedAt = Date.now()
        // (the box's player forgets the display's device when it restarts: told again)
        this.http.get(`${environment.backend.playerUrl}/display/spotify-device/${encodeURIComponent(id)}`).subscribe({ error: () => {} })
      } else this.logService.warn('[Spotify SDK] Spotify does not list this player any more:', id)
      return known
    } catch {
      return null
    }
  }

  /**
   * The player's connection to Spotify is gone although it did not say so: it disconnects, and ensurePlayerReady
   * connects it again (a new "ready" reports the device to the box's player).
   */
  private async reconnectPlayer(): Promise<void> {
    this.logService.warn('[Spotify SDK] Reconnecting the player')
    try {
      this.player?.disconnect()
    } catch {
      // gone anyway
    }
    this.deviceId = null
    this.deviceCheckedAt = 0
    this.sdkState = 'loaded'
    this.isConnected$.next(false)
  }

  /**
   * Every few minutes: is the player still known to Spotify? Else it connects again - before a start from the web
   * app or Telegram, which does not come through ensurePlayerReady here, goes nowhere.
   */
  private setupDeviceCheck(): void {
    if (!this.shouldUsePlayer()) return
    setInterval(() => {
      if (!this.isPlayerReady() || this.ensurePlayerReadyPromise) return
      if (Date.now() - this.deviceCheckedAt < this.DEVICE_CHECK_FRESH_MS) return
      this.deviceKnownToSpotify().then((known) => {
        if (known !== false || this.ensurePlayerReadyPromise) return
        this.reconnectPlayer().then(() => this.ensurePlayerReady())
      })
    }, this.DEVICE_CHECK_EVERY_MS)
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
