import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { distinctUntilChanged, interval, map, Observable, switchMap } from 'rxjs'
import { environment } from 'src/environments/environment'
import { DisplayManagerService } from './display-manager.service'
import { ExternalPlaybackNavigatorService } from './external-playback-navigator.service'
import { Monitor } from './monitor'
import { PlaytimeService } from './playtime.service'
import { PlaytimeBlockedOverlayComponent } from './playtime-blocked-overlay/playtime-blocked-overlay.component'
import { PlaytimeChipComponent } from './playtime-chip/playtime-chip.component'

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

  public constructor(
    private http: HttpClient,
    _externalPlaybackNavigator: ExternalPlaybackNavigatorService,
    _displayManager: DisplayManagerService,
    playtimeService: PlaytimeService,
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
  }
}
