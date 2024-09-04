import { TestBed } from '@angular/core/testing';

import { ArtworkService } from './artwork.service';
import { HttpClientModule } from '@angular/common/http';

describe('ArtworkService', () => {
  let service: ArtworkService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientModule]
    });
    service = TestBed.inject(ArtworkService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
