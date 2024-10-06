import { TestBed } from '@angular/core/testing'

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { MediaService } from './media.service'

describe('MediaService', () => {
  let service: MediaService

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi())]
})
    service = TestBed.inject(MediaService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
