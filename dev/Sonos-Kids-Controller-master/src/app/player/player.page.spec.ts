import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'

import { HttpClientModule } from '@angular/common/http'
import { IonicModule } from '@ionic/angular'
import { PlayerPage } from './player.page'
import { RouterTestingModule } from '@angular/router/testing'

describe('PlayerPage', () => {
  let component: PlayerPage
  let fixture: ComponentFixture<PlayerPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PlayerPage],
      imports: [IonicModule.forRoot(), HttpClientModule, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(PlayerPage)
    component = fixture.componentInstance
    component.media = {
      type: '',
      category: '',
    }
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos').flush([])
    expect(component).toBeTruthy()
  })
})
