import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { createArtist, createMedia } from 'src/app/fixtures'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { MediaSorting } from '../media'
import { ResumePage } from './resume.page'
import { RouterTestingModule } from '@angular/router/testing'
import { of } from 'rxjs'

describe('ResumePage', () => {
  let component: ResumePage
  let fixture: ComponentFixture<ResumePage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ResumePage],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(ResumePage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
