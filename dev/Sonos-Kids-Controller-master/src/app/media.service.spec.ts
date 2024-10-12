import { TestBed } from '@angular/core/testing'

import { HttpClientModule } from '@angular/common/http'
import { MediaService } from './media.service'

describe('MediaService', () => {
  let service: MediaService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule],
    })
    service = TestBed.inject(MediaService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
