import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import type { Network } from './network'
import { NetworkService } from './network.service'

describe('NetworkService', () => {
  let service: NetworkService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    })
    service = TestBed.inject(NetworkService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  /** Answers the poll that is currently open. */
  const answer = (body: Network | null, status?: number): void => {
    const request = httpMock.expectOne((candidate) => candidate.url.endsWith('/network'))
    if (status) {
      request.flush('nope', { status, statusText: 'Error' })
    } else {
      request.flush(body)
    }
  }

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('keeps polling after a failed request and reports online when the box comes up', fakeAsync(() => {
    const states: boolean[] = []
    const subscription = service.isOnline().subscribe((online) => states.push(online))

    // First poll right after start: /tmp/network.json does not exist yet.
    tick(300)
    answer(null, 404)
    expect(states).toEqual([false])

    // Second poll: the file exists but the box is not online yet.
    tick(5000)
    answer({ onlinestate: 'starting' })
    expect(states).toEqual([false])

    // Third poll: WLAN carries traffic. Without a surviving stream this never arrives.
    tick(5000)
    answer({ ip: '10.0.1.111', onlinestate: 'online' })
    expect(states).toEqual([false, true])

    subscription.unsubscribe()
    httpMock.verify()
  }))

  it('keeps the last known state while a poll fails', fakeAsync(() => {
    const states: boolean[] = []
    const subscription = service.isOnline().subscribe((online) => states.push(online))

    tick(300)
    answer({ ip: '10.0.1.111', onlinestate: 'online' })
    expect(states).toEqual([false, true])

    // A single hiccup of the backend must not look like a lost connection.
    tick(5000)
    answer(null, 500)
    expect(states).toEqual([false, true])

    subscription.unsubscribe()
    httpMock.verify()
  }))

  it('refresh() polls right away instead of waiting for the interval', fakeAsync(() => {
    const seen: Network[] = []
    const subscription = service.network$.subscribe((network) => seen.push(network))

    tick(300)
    answer({ onlinestate: 'offline' })

    // Well before the next five second interval.
    tick(100)
    service.refresh()
    answer({ ip: '10.0.1.111', onlinestate: 'online' })

    expect(seen.map((network) => network.onlinestate)).toEqual(['offline', 'online'])

    subscription.unsubscribe()
    httpMock.verify()
  }))
})
