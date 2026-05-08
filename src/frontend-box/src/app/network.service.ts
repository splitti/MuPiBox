import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable, timer } from 'rxjs'
import { distinctUntilChanged, filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators'
import { environment } from '../environments/environment'
import type { Network } from './network'

@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  /**
   * Network state observable that polls every 5 seconds.
   * First request is after 300ms to allow app initialization.
   */
  public readonly network$: Observable<Network>

  constructor(private http: HttpClient) {
    this.network$ = timer(300, 5000).pipe(
      switchMap((): Observable<Network> => this.http.get<Network>(`${environment.backend.apiUrl}/network`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
  }

  /**
   * Observable that emits true when online, false when offline.
   * Only emits on state changes (distinctUntilChanged).
   */
  public isOnline(): Observable<boolean> {
    return this.network$.pipe(
      filter((network) => network.ip !== undefined),
      map((network) => network.onlinestate === 'online'),
      // B15: until the first /api/network response arrives the filter()
      // above produces no emissions, and any consumer using `toSignal(…)`
      // hangs at its initialValue forever (default null). Seed with
      // false so callers see "offline" until the real value arrives —
      // a 300ms-to-5s window on cold boot. Treats unknown as offline,
      // which matches the conservative interpretation for the kid-
      // facing UI ("don't try to use Spotify until I know we're online").
      startWith(false),
      distinctUntilChanged(),
    )
  }
}
