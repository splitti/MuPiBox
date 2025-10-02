import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing'

import { createConfig } from '../fixtures'
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

  it('should not fire mupihat requests if config says mupihat is not active', fakeAsync(() => {
    httpClient.expectOne('http://localhost:8200/api/sonos').flush(createConfig({ hat_active: false }))
    fixture.detectChanges()
    expect((component as any).hat_active()).toBeFalse()
    tick(10000)
    httpClient.expectNone('http://localhost:8200/api/mupihat')
  }))

  it('should fire mupihat requests if config says mupihat is active', fakeAsync(() => {
    httpClient.expectOne('http://localhost:8200/api/sonos').flush(createConfig({ hat_active: true }))
    fixture.detectChanges()
    expect((component as any).hat_active()).toBeTrue()
    tick(2000)
    httpClient.expectOne('http://localhost:8200/api/mupihat')
    tick(2000)
    httpClient.expectOne('http://localhost:8200/api/mupihat')
    discardPeriodicTasks()
  }))
})
