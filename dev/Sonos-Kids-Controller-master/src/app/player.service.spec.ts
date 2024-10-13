import { TestBed } from '@angular/core/testing'

import { HttpClientModule } from '@angular/common/http'
import { PlayerService } from './player.service'

describe('PlayerService', () => {
  let service: PlayerService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule],
    })
    service = TestBed.inject(PlayerService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
