import { TestBed } from '@angular/core/testing'

import { HttpClientModule } from '@angular/common/http'
import { ArtworkService } from './artwork.service'

describe('ArtworkService', () => {
  let service: ArtworkService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule],
    })
    service = TestBed.inject(ArtworkService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
