import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'

import { TestBed } from '@angular/core/testing'
import { MediaService } from './media.service'

describe('MediaService', () => {
  let service: MediaService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    })
    service = TestBed.inject(MediaService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
