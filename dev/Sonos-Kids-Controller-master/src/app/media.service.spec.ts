import { TestBed } from '@angular/core/testing'

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { MediaService } from './media.service'

describe('MediaService', () => {
  let service: MediaService
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    })
    service = TestBed.inject(MediaService)
    httpClient = TestBed.inject(HttpTestingController)
  })

  it('should be created', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(service).toBeTruthy()
  })
})
