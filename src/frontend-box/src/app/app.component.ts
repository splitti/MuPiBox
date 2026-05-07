import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { distinctUntilChanged, interval, map, Observable, switchMap } from 'rxjs'
import { environment } from 'src/environments/environment'
import { CurrentMediaService } from './current-media.service'
import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
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

  // Latest state snapshots — kept fresh by ngOnInit subscriptions on
  // mediaService.current$/local$ so the resume-on-cap effect can read them
  // synchronously when a transition fires.
  private latestSpotify: CurrentSpotify | null = null
  private latestLocal: CurrentMPlayer | null = null
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
      interval(1500).pipe(
        switchMap((): Observable<Monitor> => this.http.get<Monitor>(`${environment.backend.apiUrl}/monitor`)),
        map((monitor) => monitor.monitor !== 'On'),
        distinctUntilChanged(),
      ),
      { initialValue: false },
    )
    this.playtimeBlocked = computed(() => {
      const s = playtimeService.status()
      return s.enabled === true && s.state === 'blocked'
    })

    // Keep player-state snapshots fresh. AppComponent is the root component
    // and lives for the kiosk's lifetime, so these subscriptions never need
    // teardown; they also cause MediaService to keep its shared polling alive.
    this.mediaService.current$.subscribe((s) => {
      this.latestSpotify = s
    })
    this.mediaService.local$.subscribe((l) => {
      this.latestLocal = l
    })

    // Global resume-on-cap: when playtime/quiet hours transitions
    // normal -> grace or normal -> blocked, persist a resume entry for the
    // currently-playing Media. This is what makes "weiterhören wo aufgehört"
    // work even if the user listens from the home page (player page unmounted,
    // its in-page saver inert). Backend's composite-key dedup means the entry
    // overwrites any existing resume for the same item.
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

      const source = this.currentMediaService.get()
      if (!source) return
      const resumeMedia = buildResumeMedia(source, this.latestSpotify, this.latestLocal)
      this.mediaService.addRawResume(resumeMedia)
    })
  }
}
