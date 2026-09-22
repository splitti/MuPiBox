import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import type { MediaLoadResult } from './media.service'
import { MediaService } from './media.service'
import { MediaRefreshReason, MediaRefreshService } from './media-refresh.service'
import { NetworkService } from './network.service'

describe('MediaRefreshService', () => {
  let loadResults: Subject<MediaLoadResult>
  let mediaService: { mediaLoadResult$: Subject<MediaLoadResult>; clearMediaInfoCache: jasmine.Spy }
  let networkService: { isOnline: jasmine.Spy; refresh: jasmine.Spy }

  /**
   * The service starts listening as soon as it exists, so it has to be created
   * inside the fakeAsync zone - otherwise its timers run on the real clock and
   * tick() never reaches them.
   */
  const create = (): MediaRefreshService => TestBed.inject(MediaRefreshService)

  beforeEach(() => {
    loadResults = new Subject<MediaLoadResult>()
    mediaService = {
      mediaLoadResult$: loadResults,
      clearMediaInfoCache: jasmine.createSpy('clearMediaInfoCache'),
    }
    networkService = {
      isOnline: jasmine.createSpy('isOnline').and.returnValue(of(false)),
      refresh: jasmine.createSpy('refresh'),
    }

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: MediaService, useValue: mediaService },
        { provide: NetworkService, useValue: networkService },
      ],
    })
  })

  it('should be created', () => {
    expect(create()).toBeTruthy()
  })

  it('carries the initial load, so a page loads as soon as it subscribes', () => {
    const reasons: MediaRefreshReason[] = []
    const subscription = create().refresh$.subscribe((reason) => reasons.push(reason))

    expect(reasons).toEqual(['network'])
    subscription.unsubscribe()
  })

  it('retries by itself when entries were skipped, and stops once everything loads', fakeAsync(() => {
    const service = create()
    const reasons: MediaRefreshReason[] = []
    const subscription = service.refresh$.subscribe((reason) => reasons.push(reason))
    reasons.length = 0

    // A boot where Spotify was not reachable yet: two of three entries are missing.
    loadResults.next({ requested: 3, skipped: 2 })
    tick(1500) // results window
    expect(reasons).toEqual([])

    tick(5000) // first retry delay
    expect(reasons).toEqual(['retry'])

    // Still incomplete: the box waits longer and asks again.
    loadResults.next({ requested: 3, skipped: 1 })
    tick(1500)
    tick(10000)
    expect(reasons).toEqual(['retry', 'retry'])

    // Complete at last - no further retries.
    loadResults.next({ requested: 3, skipped: 0 })
    tick(1500)
    tick(60000)
    expect(reasons).toEqual(['retry', 'retry'])

    subscription.unsubscribe()
  }))

  it('offers the reload button only after retrying did not help', fakeAsync(() => {
    const service = create()
    const subscription = service.refresh$.subscribe()

    loadResults.next({ requested: 3, skipped: 2 })
    tick(1500)
    expect(service.incomplete()).toBeFalse()

    tick(5000)
    loadResults.next({ requested: 3, skipped: 2 })
    tick(1500)
    expect(service.incomplete()).toBeFalse()

    tick(10000)
    loadResults.next({ requested: 3, skipped: 2 })
    tick(1500)
    expect(service.incomplete()).toBeTrue()

    // A complete load takes the hint away again.
    loadResults.next({ requested: 3, skipped: 0 })
    tick(1500)
    expect(service.incomplete()).toBeFalse()

    tick(60000)
    subscription.unsubscribe()
  }))

  it('slows down to five minute retries after the quick ones, instead of giving up', fakeAsync(() => {
    const service = create()
    const reasons: MediaRefreshReason[] = []
    const subscription = service.refresh$.subscribe((reason) => reasons.push(reason))
    reasons.length = 0

    // Every load keeps failing, e.g. a longer Spotify rate limit penalty.
    for (let attempt = 0; attempt < 10; attempt++) {
      loadResults.next({ requested: 1, skipped: 1 })
      tick(1500)
      tick(60000)
    }
    expect(reasons.length).toBe(10)
    expect(service.incomplete()).toBeTrue()

    // From now on one retry per five minutes, not one per minute.
    loadResults.next({ requested: 1, skipped: 1 })
    tick(1500)
    tick(60000)
    expect(reasons.length).toBe(10)
    tick(4 * 60000)
    expect(reasons.length).toBe(11)

    // Once a load finally succeeds everything settles down.
    loadResults.next({ requested: 1, skipped: 0 })
    tick(1500)
    expect(service.incomplete()).toBeFalse()
    tick(600000)
    expect(reasons.length).toBe(11)

    subscription.unsubscribe()
  }))

  it('reload() asks for a fresh network state and a fresh media load', fakeAsync(() => {
    const service = create()
    const reasons: MediaRefreshReason[] = []
    const subscription = service.refresh$.subscribe((reason) => reasons.push(reason))
    reasons.length = 0

    service.reload()

    expect(reasons).toEqual(['manual'])
    expect(networkService.refresh).toHaveBeenCalled()
    expect(mediaService.clearMediaInfoCache).toHaveBeenCalled()

    subscription.unsubscribe()
  }))
})
