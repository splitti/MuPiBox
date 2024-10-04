import { type ComponentFixture, TestBed, async } from '@angular/core/testing'
import { IonicModule } from '@ionic/angular'

import { HttpClientModule } from '@angular/common/http'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { FormsModule } from '@angular/forms'
import { UrlSerializer } from '@angular/router'
import { AdminPage } from './admin.page'

describe('AdminPage', () => {
  let component: AdminPage
  let fixture: ComponentFixture<AdminPage>
  let httpClient: HttpTestingController

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [AdminPage],
      imports: [IonicModule.forRoot(), HttpClientModule, FormsModule, HttpClientTestingModule],
      providers: [UrlSerializer],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(AdminPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  }))

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
