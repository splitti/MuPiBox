import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { merge, Observable, of, Subject, timer } from 'rxjs'
import { catchError, distinctUntilChanged, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'
import { environment } from '../environments/environment'
import type { Network } from './network'

/** How often the box is asked for its network state. */
const POLL_INTERVAL_MS = 5000
/** First request delay, so the app has a moment to start up. */
const FIRST_POLL_DELAY_MS = 300

@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  /**
   * Network state observable that polls every 5 seconds.
   * First request is after 300ms to allow app initialization.
   *
   * The stream never fails: `/api/network` reads /tmp/network.json, which is written
   * by background scripts and is missing (404) or half written (500) for the first
   * seconds after a boot. An error reaching this pipe would end the stream for good -
   * the box would then keep showing "no connection" and would never reload its media
   * until the kiosk browser is restarted.
   */
  public readonly network$: Observable<Network>

  /** Last state the box actually answered; kept across failed polls. */
  private lastKnown: Network | undefined

  /** Fires an extra poll outside the 5 second rhythm (manual refresh). */
  private readonly refreshSubject = new Subject<void>()

  constructor(private http: HttpClient) {
    this.network$ = merge(timer(FIRST_POLL_DELAY_MS, POLL_INTERVAL_MS), this.refreshSubject).pipe(
      switchMap(
        (): Observable<Network> =>
          this.http.get<Network>(`${environment.backend.apiUrl}/network`).pipe(
            catchError((error) => {
              console.warn('Network state could not be read, keeping the last known one:', error?.message ?? error)
              // Before the very first answer there is nothing to keep: treat the box as
              // offline, the next poll corrects it.
              return of(this.lastKnown ?? { onlinestate: 'offline' })
            }),
          ),
      ),
      // Remember the last answer for the next failed poll.
      tap((network) => {
        this.lastKnown = network
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
  }

  /** Polls the network state right away instead of waiting for the next interval. */
  public refresh(): void {
    this.refreshSubject.next()
  }

  /**
   * Observable that emits true when online, false when offline.
   * Starts with false and only emits on state changes (distinctUntilChanged), so
   * consumers can reload as soon as the box reports a working internet connection.
   */
  public isOnline(): Observable<boolean> {
    return this.network$.pipe(
      map((network) => network.onlinestate === 'online'),
      startWith(false),
      distinctUntilChanged(),
    )
  }
}
