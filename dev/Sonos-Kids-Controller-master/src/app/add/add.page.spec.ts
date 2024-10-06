import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { AddPage } from './add.page'
import { FormsModule } from '@angular/forms'
import { IonicModule } from '@ionic/angular'
import { RouterTestingModule } from '@angular/router/testing'

describe('AddPage', () => {
  let component: AddPage
  let fixture: ComponentFixture<AddPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [IonicModule.forRoot(), RouterTestingModule, FormsModule, AddPage],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
}).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(AddPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos').flush([])
    expect(component).toBeTruthy()
  })
})
