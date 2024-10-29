import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { MupiHatIconComponent } from './mupihat-icon.component'

describe('MupiHatIconComponent', () => {
  let component: MupiHatIconComponent
  let fixture: ComponentFixture<MupiHatIconComponent>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MupiHatIconComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(MupiHatIconComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})

// TODO.
// TODO: Test that there are no mupihat requests if config is false.

// TODO: Test that there are mupihat requests if config is true.
