import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { catchError, distinctUntilChanged, firstValueFrom, interval, map, Observable, of, switchMap, timeout } from 'rxjs'
import { take } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { CurrentMediaService } from './current-media.service'
import { DisplayManagerService } from './display-manager.service'
import { ExternalPlaybackNavigatorService } from './external-playback-navigator.service'
import { MediaService } from './media.service'
import { Monitor } from './monitor'
import type { PlaytimePlayState } from './playtime.model'
import { PlaytimeService } from './playtime.service'
import { PlaytimeBlockedOverlayComponent } from './playtime-blocked-overlay/playtime-blocked-overlay.component'
import { PlaytimeChipComponent } from './playtime-chip/playtime-chip.component'
import { buildResumeMedia } from './resume-builder'

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonRouterOutlet, PlaytimeBlockedOverlayComponent, PlaytimeChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected monitorOff: Signal<boolean>
  protected playtimeBlocked: Signal<boolean>

  // Track previous playtime state to detect normal -> grace/blocked transitions.
  // 'unknown' on first tick avoids spurious save before we know the baseline.
  private prevPlaytimeState: PlaytimePlayState | 'unknown' = 'unknown'

  public constructor(
    private http: HttpClient,
    _externalPlaybackNavigator: ExternalPlaybackNavigatorService,
    _displayManager: DisplayManagerService,
    playtimeService: PlaytimeService,
    private mediaService: MediaService,
    private currentMediaService: CurrentMediaService,
  ) {
    this.monitorOff = toSignal(
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
