import { ChangeDetectionStrategy, Component, Signal, effect } from '@angular/core'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'
import { Observable, distinctUntilChanged, interval, map, switchMap } from 'rxjs'

import { HttpClient } from '@angular/common/http'
import { Monitor } from './monitor'
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
      interval(1000).pipe(
        switchMap((): Observable<Monitor> => this.http.get<Monitor>('http://localhost:8200/api/monitor')),
        map((monitor) => monitor.monitor !== 'On'),
        distinctUntilChanged(),
      ),
      { initialValue: false },
    )
  }
}
