import { TestBed } from '@angular/core/testing';

import { PlayerService } from './player.service';
import { HttpClientModule } from '@angular/common/http';

describe('PlayerService', () => {
  let service: PlayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule]
    });
    service = TestBed.inject(PlayerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
