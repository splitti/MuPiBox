import { TestBed } from '@angular/core/testing'

import { HttpClientModule } from '@angular/common/http'
import { SpotifyService } from './spotify.service'

describe('SpotifyService', () => {
  let service: SpotifyService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule],
    })
    service = TestBed.inject(SpotifyService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
