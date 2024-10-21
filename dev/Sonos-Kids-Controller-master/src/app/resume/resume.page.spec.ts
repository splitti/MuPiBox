import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { MedialistPage, ResumePage } from './resume.page'
import { createArtist, createMedia } from 'src/app/fixtures'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { MediaSorting } from '../media'
import { RouterTestingModule } from '@angular/router/testing'
import { of } from 'rxjs'

describe('ResumePage', () => {
  let component: ResumePage
  let fixture: ComponentFixture<ResumePage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), RouterTestingModule, ResumePage],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(MedialistPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
