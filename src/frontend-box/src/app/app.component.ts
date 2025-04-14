import { ChangeDetectionStrategy, Component, Signal } from '@angular/core'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { Observable, distinctUntilChanged, interval, map, of, switchMap } from 'rxjs'

import { HttpClient } from '@angular/common/http'
import { Monitor } from './monitor'
import { environment } from 'src/environments/environment'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected monitorOff: Signal<boolean>

  public constructor(private http: HttpClient) {
    this.monitorOff = toSignal(
      // 1.5s should be enough to be somewhat "recent".
      interval(1500).pipe(
        switchMap(
          (): Observable<Monitor> =>
            // Only if we run on the box do we want to disable input if the monitor is off.
            environment.runsOnBox
              ? this.http.get<Monitor>(`${environment.backend.apiUrl}/monitor`)
              : of({ monitor: 'On' }),
        ),
        map((monitor) => monitor.monitor !== 'On'),
        distinctUntilChanged(),
      ),
      { initialValue: false },
    )
  }
}
