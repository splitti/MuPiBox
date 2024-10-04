import { type ComponentFixture, TestBed, async } from '@angular/core/testing'
import { IonicModule } from '@ionic/angular'

import { HttpClientModule } from '@angular/common/http'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { RouterTestingModule } from '@angular/router/testing'
import { EditPage } from './edit.page'

describe('EditPage', () => {
  let component: EditPage
  let fixture: ComponentFixture<EditPage>
  let httpClient: HttpTestingController

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [EditPage],
      imports: [IonicModule.forRoot(), HttpClientModule, RouterTestingModule, HttpClientTestingModule],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(EditPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  }))

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
