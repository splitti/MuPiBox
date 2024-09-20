import { TestBed } from '@angular/core/testing';

import { SpotifyService } from './spotify.service';
import { HttpClientModule } from '@angular/common/http';

describe('SpotifyService', () => {
  let service: SpotifyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule]
    });
    service = TestBed.inject(SpotifyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
