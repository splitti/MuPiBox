import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { EMPTY, Observable, timer } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, switchMap } from 'rxjs/operators'
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
      // A failed request (e.g. the state file is being rewritten) must not end the polling for good:
      // the last known state stays and the next poll tries again.
      switchMap((): Observable<Network> => this.http.get<Network>(`${environment.backend.apiUrl}/network`).pipe(catchError(() => EMPTY))),
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
      distinctUntilChanged(),
    )
  }
}
