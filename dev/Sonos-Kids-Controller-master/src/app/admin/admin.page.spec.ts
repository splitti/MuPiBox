import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { FormsModule } from '@angular/forms'
import { UrlSerializer } from '@angular/router'
import { IonicModule } from '@ionic/angular'
import { AdminPage } from './admin.page'

describe('AdminPage', () => {
  let component: AdminPage
  let fixture: ComponentFixture<AdminPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), FormsModule, AdminPage],
      providers: [UrlSerializer, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(AdminPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos').flush([])
    expect(component).toBeTruthy()
  })
})
