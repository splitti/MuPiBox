import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { HomePage } from './home.page'
import { RouterTestingModule } from '@angular/router/testing'

describe('HomePage', () => {
  let component: HomePage
  let fixture: ComponentFixture<HomePage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(HomePage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
