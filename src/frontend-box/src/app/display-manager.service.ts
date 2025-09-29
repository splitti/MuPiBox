import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Subject, Subscription, interval } from 'rxjs'
import { environment } from 'src/environments/environment'
import { MupiboxConfig } from './mupibox-config.model'
import { SpotifyService } from './spotify.service'

@Injectable({
  providedIn: 'root',
})
export class DisplayManagerService {
  private idleTimeoutMinutes = 1
  private lastActivityTimestamp: number = Date.now()
  private idleCheckInterval: Subscription | undefined
  private activityDebouncer = new Subject<void>()
  private activitySubscription: Subscription | undefined

  constructor(
    private http: HttpClient,
    private spotifyService: SpotifyService,
  ) {
    console.log('[DisplayManager] Service initialized')
    this.loadIdleTimeout()
  }

  private loadIdleTimeout(): void {
    console.log('[DisplayManager] Loading idle timeout from config...')
    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const timeout = Number.parseInt(config?.timeout?.idleDisplayOff || '1', 10)
        this.idleTimeoutMinutes = timeout > 0 ? timeout : 1
        console.log(`[DisplayManager] Idle timeout set to ${this.idleTimeoutMinutes} minute(s)`)
        this.initialize()
      },
      error: (err) => {
        console.warn('[DisplayManager] Could not load config, using default timeout of 1 minute.', err)
        this.initialize()
      },
    })
  }

  private initialize(): void {
    console.log('[DisplayManager] Initializing activity tracking and idle monitoring...')
    this.setupActivityTracking()
    this.startIdleMonitoring()
  }

  private setupActivityTracking(): void {
    // Listen for user activity events on the document
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    for (const eventName of activityEvents) {
      document.addEventListener(eventName, () => this.activityDebouncer.next(), { passive: true })
    }

    // Debounce activity events to avoid spamming resets
    this.activitySubscription = this.activityDebouncer.subscribe(() => {
      this.resetIdleTimer()
    })
  }

  private resetIdleTimer(): void {
    this.lastActivityTimestamp = Date.now()
  }

  private startIdleMonitoring(): void {
    if (this.idleCheckInterval) {
      this.idleCheckInterval.unsubscribe()
    }
    // Check for idleness every 5 seconds
    this.idleCheckInterval = interval(5000).subscribe(() => {
      this.checkIdleState()
    })
  }

  private checkIdleState(): void {
    const isPlaying = this.spotifyService.playerState$.value?.paused === false
    const idleTimeSeconds = (Date.now() - this.lastActivityTimestamp) / 1000
    const timeoutSeconds = this.idleTimeoutMinutes * 60

    console.log(
      `[DisplayManager] Check: Playing=${isPlaying}, Idle=${idleTimeSeconds.toFixed(1)}s, Timeout=${timeoutSeconds}s`,
    )

    if (!isPlaying) {
      // If not playing, we don't need to force the screen off. The system's default BlankTime should work.
      return
    }

    if (idleTimeSeconds >= timeoutSeconds) {
      console.log(`[DisplayManager] User idle for ${idleTimeSeconds}s while playing. Forcing screen off.`)
      this.forceScreenOff()
      // Reset timer after forcing off to prevent repeated calls
      this.resetIdleTimer()
    }
  }

  private forceScreenOff(): void {
    this.http.post(`${environment.backend.apiUrl}/screen/off`, {}).subscribe({
      next: () => console.log('[DisplayManager] Screen off command sent successfully.'),
      error: (err) => console.error('[DisplayManager] Failed to send screen off command.', err),
    })
  }

  ngOnDestroy(): void {
    this.idleCheckInterval?.unsubscribe()
    this.activitySubscription?.unsubscribe()
  }
}
