import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { SpotifyService } from './spotify.service'

describe('SpotifyService', () => {
  let service: SpotifyService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [provideHttpClient(withInterceptorsFromDi())],
    })
    service = TestBed.inject(SpotifyService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
