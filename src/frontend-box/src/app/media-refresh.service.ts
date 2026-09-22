import { computed, Injectable, OnDestroy, signal } from '@angular/core'
import { merge, Observable, Subject, Subscription } from 'rxjs'
import { bufferTime, filter, map } from 'rxjs/operators'
import { MediaService } from './media.service'
import { NetworkService } from './network.service'

/** Why a media list is (re)loaded. */
export type MediaRefreshReason =
  /** Online state changed (also the very first load right after start). */
  | 'network'
  /** The box retried on its own because the last load was incomplete. */
  | 'retry'
  /** Someone asked for it (reload button). */
  | 'manual'

/**
 * Waiting times between automatic retries. The box is usually usable after the
 * first or second one; the last value repeats until MAX_RETRIES is reached, so a
 * box that comes online a few minutes late still fills its home page by itself.
 */
const RETRY_DELAYS_MS = [5000, 10000, 20000, 40000, 60000]

/**
 * After this many quick retries the box switches to the slow pace below. A
 * permanently broken entry (e.g. an album removed from Spotify) must not reload
 * the lists every minute - but a longer outage, like a Spotify rate limit
 * penalty, must still resolve itself without a grown-up having to do anything.
 */
const MAX_FAST_RETRIES = 10

/** Pace after the quick retries: keep trying, but only every five minutes. */
const SLOW_RETRY_MS = 5 * 60 * 1000

/** Parallel category loads are collected for this long before they are judged together. */
const RESULT_WINDOW_MS = 1500

/**
 * Keeps the media lists complete while the box is starting.
 *
 * The kiosk browser is up long before the WLAN carries traffic. Every Spotify and
 * RSS entry whose lookup fails in that window is silently left out of the list, which
 * is why a freshly booted box can end up showing a single entry. Nothing used to ask
 * again - the home page only reloaded when the online state changed, and it had
 * usually already changed by then.
 *
 * This service watches how complete each load was and retries with growing delays
 * until everything resolves. {@link incomplete} drives the reload button that lets
 * a grown-up force the same thing by hand.
 */
@Injectable({
  providedIn: 'root',
})
export class MediaRefreshService implements OnDestroy {
  /** Pages subscribe here and reload their lists on every emission. */
  public readonly refresh$: Observable<MediaRefreshReason>

  private readonly triggerSubject = new Subject<MediaRefreshReason>()
  private readonly subscriptions = new Subscription()

  private readonly retryCount = signal(0)
  private readonly missing = signal(false)
  private retryTimer = 0

  /**
   * True once a load stayed incomplete and at least one retry did not help, so the
   * button does not flash by during the normal start-up rush.
   */
  public readonly incomplete = computed(() => this.missing() && this.retryCount() > 1)

  constructor(
    private mediaService: MediaService,
    private networkService: NetworkService,
  ) {
    this.refresh$ = merge(
      // Emits false right away and true as soon as the box reports a working
      // connection, so this also carries the initial load.
      this.networkService
        .isOnline()
        .pipe(map((): MediaRefreshReason => 'network')),
      this.triggerSubject,
    )

    this.subscriptions.add(
      this.mediaService.mediaLoadResult$
        .pipe(
          bufferTime(RESULT_WINDOW_MS),
          filter((results) => results.length > 0),
        )
        .subscribe((results) => {
          const skipped = results.reduce((sum, result) => sum + result.skipped, 0)
          if (skipped > 0) {
            console.warn(`${skipped} media entries could not be loaded, retrying`)
            this.missing.set(true)
            this.scheduleRetry()
          } else {
            this.missing.set(false)
            this.retryCount.set(0)
            this.cancelRetry()
          }
        }),
    )

    // A connection change is a fresh start for the retry sequence: the next load
    // happens under new conditions and deserves the short delays again.
    this.subscriptions.add(
      this.networkService.isOnline().subscribe(() => {
        this.retryCount.set(0)
        this.cancelRetry()
      }),
    )
  }

  /** Reloads every media list now, e.g. from the reload button. */
  public reload(): void {
    this.cancelRetry()
    this.retryCount.set(0)
    this.mediaService.clearMediaInfoCache()
    this.networkService.refresh()
    this.triggerSubject.next('manual')
  }

  public ngOnDestroy(): void {
    this.cancelRetry()
    this.subscriptions.unsubscribe()
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      return
    }
    const attempt = this.retryCount()
    const delay =
      attempt >= MAX_FAST_RETRIES ? SLOW_RETRY_MS : RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0
      this.retryCount.set(attempt + 1)
      this.triggerSubject.next('retry')
    }, delay)
  }

  private cancelRetry(): void {
    window.clearTimeout(this.retryTimer)
    this.retryTimer = 0
  }
}
