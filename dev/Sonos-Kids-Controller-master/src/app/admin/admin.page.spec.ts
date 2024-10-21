import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { AdminPage } from './admin.page'
import { FormsModule } from '@angular/forms'
import { UrlSerializer } from '@angular/router'

describe('AdminPage', () => {
  let component: AdminPage
  let fixture: ComponentFixture<AdminPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, AdminPage],
      providers: [UrlSerializer, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(AdminPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
