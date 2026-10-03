import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, Signal, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { catchError, distinctUntilChanged, firstValueFrom, interval, map, Observable, of, switchMap, timeout } from 'rxjs'
import { take } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { CurrentMediaService } from './current-media.service'
import { DisplayManagerService } from './display-manager.service'
import { HeaderVisibilityService } from './header-visibility.service'
import { ExternalPlaybackNavigatorService } from './external-playback-navigator.service'
import { MediaService } from './media.service'
import { Monitor } from './monitor'
import type { PlaytimePlayState } from './playtime.model'
import { PlaytimeService } from './playtime.service'
import { ElternMagicLinkOverlayComponent } from './eltern-magic-link/eltern-magic-link-overlay.component'
import { PlaytimeBlockedOverlayComponent } from './playtime-blocked-overlay/playtime-blocked-overlay.component'
import { PlaytimeChipComponent } from './playtime-chip/playtime-chip.component'
import { buildResumeMedia } from './resume-builder'
import { StalePageReloadService } from './stale-page-reload.service'
import { KmThemeService } from './theme/km-theme.service'

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonRouterOutlet, PlaytimeBlockedOverlayComponent, PlaytimeChipComponent, ElternMagicLinkOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected monitorOff: Signal<boolean>
  // what the box reports (polled), and whether the tap that woke the display has been swallowed already
  private monitorReportedOff: Signal<boolean>
  private readonly wakeReleased = signal(false)
  // The admin interface shows /text-preview in a frame (Display texts): only the previewed screen there - not the
  // box's own state (display off, a real playtime lock, the playtime chip).
  protected readonly textPreview = window.location.pathname.startsWith('/text-preview')
  protected playtimeBlocked: Signal<boolean>

  // Track previous playtime state to detect normal -> grace/blocked transitions.
  // 'unknown' on first tick avoids spurious save before we know the baseline.
  private prevPlaytimeState: PlaytimePlayState | 'unknown' = 'unknown'

  public constructor(
    private http: HttpClient,
    _externalPlaybackNavigator: ExternalPlaybackNavigatorService,
    _displayManager: DisplayManagerService,
    _stalePageReload: StalePageReloadService,
    _kmTheme: KmThemeService,
    _headerVisibility: HeaderVisibilityService,
    playtimeService: PlaytimeService,
    private mediaService: MediaService,
    private currentMediaService: CurrentMediaService,
  ) {
    this.monitorReportedOff = toSignal(
      // 1.5s should be enough to be somewhat "recent".
      // M1: per-tick timeout + catchError so a single 5xx or stalled response
      // doesn't kill the toSignal observable forever. B11-pattern shared with
      // media.service's polling streams. Empty Monitor on failure means
      // monitorOff stays at its last good distinctUntilChanged value (or the
      // initial false), no spurious overlay.
      interval(1500).pipe(
        switchMap((): Observable<Monitor> =>
          this.http.get<Monitor>(`${environment.backend.apiUrl}/monitor`).pipe(
            timeout(1000),
            catchError(() => of({} as Monitor)),
          ),
        ),
        map((monitor) => monitor.monitor !== undefined && monitor.monitor !== 'On'),
        distinctUntilChanged(),
      ),
      { initialValue: false },
    )
    this.monitorOff = computed(() => this.monitorReportedOff() && !this.wakeReleased())
    // the display reports "on" again: the next time it goes off the wake tap is swallowed again
    effect(() => {
      if (!this.monitorReportedOff()) this.wakeReleased.set(false)
    })
    this.watchWakeTaps()
    this.playtimeBlocked = computed(() => {
      const s = playtimeService.status()
      return s.enabled === true && s.state === 'blocked'
    })

    // Global resume-on-cap: when playtime/quiet hours transitions
    // normal -> grace or normal -> blocked, persist a resume entry for the
    // currently-playing Media. This is what makes "weiterhören wo aufgehört"
    // work even if the user listens from the home page (player page unmounted,
    // its in-page saver inert). Backend's composite-key dedup means the entry
    // overwrites any existing resume for the same item.
    //
    // Player-state snapshots (current$/local$) are read on-demand via
    // firstValueFrom — eagerly subscribing here previously kept the shared
    // mediaService observables (and the Spotify SDK's getCurrentState
    // polling) hot from app bootstrap, which interfered with Spotify Connect
    // device activation. Now the upstream is only subscribed during the
    // brief moment of saving on cap.
    //
    // Gated on shouldPersistResume() so a wrong-cover-touch right before a
    // cap doesn't leave a stale entry in the resume swiper.
    effect(() => {
      const status = playtimeService.status()
      if (!status.enabled) {
        this.prevPlaytimeState = 'unknown'
        return
      }
      const cur = status.state
      const prev = this.prevPlaytimeState
      this.prevPlaytimeState = cur
      if (prev === 'unknown' || prev === cur) return
      if (cur !== 'grace' && cur !== 'blocked') return
      if (!this.currentMediaService.shouldPersistResume()) return
      void this.persistResumeOnCap()
    })
  }

  // Waking the display by a tap: the panel showed only what was drawn anew after it came on - black, apart from
  // the playtime chip that changes every second - until the blocker went away (the display's state is only
  // polled: up to about 6 s) and the whole page was drawn again. Now a tap after a quiet spell draws the whole page
  // at once (and twice more while the panel settles), and the blocker, once it has swallowed the waking tap, lets
  // go right away instead of waiting for the poll.
  private watchWakeTaps(): void {
    let lastTap = Date.now()
    document.addEventListener(
      'pointerdown',
      () => {
        const quiet = Date.now() - lastTap
        lastTap = Date.now()
        if (this.monitorReportedOff() || quiet > 30_000) {
          for (const delay of [0, 250, 700]) window.setTimeout(() => this.repaintWholePage(), delay)
        }
      },
      { capture: true, passive: true },
    )
    document.addEventListener(
      'pointerup',
      () => {
        // after the click of this tap (which the blocker swallows)
        if (this.monitorReportedOff() && !this.wakeReleased()) window.setTimeout(() => this.wakeReleased.set(true), 150)
      },
      { capture: true, passive: true },
    )
  }

  // A change of the page's opacity makes Chromium draw and hand over the whole page, not only what changed.
  private repaintWholePage(): void {
    const body = document.body
    body.style.opacity = '0.999'
    requestAnimationFrame(() => requestAnimationFrame(() => body.style.removeProperty('opacity')))
  }

  private async persistResumeOnCap(): Promise<void> {
    const source = this.currentMediaService.get()
    if (!source) return
    // One-shot reads: subscribe long enough to grab the latest cached
    // emission (or the next one if the upstream isn't running) and
    // unsubscribe. Player.page keeps the upstream hot while it's mounted,
    // so when the user is in the player view this resolves immediately
    // from the shareReplay buffer; from the home page it spins the
    // upstream up briefly (one tick of interval(1000)) and tears it down.
    const [spotify, local] = await Promise.all([
      firstValueFrom(this.mediaService.current$.pipe(take(1))).catch((): null => null),
      firstValueFrom(this.mediaService.local$.pipe(take(1))).catch((): null => null),
    ])
    const resumeMedia = buildResumeMedia(source, spotify, local)
    this.mediaService.addRawResume(resumeMedia)
  }
}
