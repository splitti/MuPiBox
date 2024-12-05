import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SettingsPage } from './settings.page'

describe('SettingsPage', () => {
  let component: SettingsPage
  let fixture: ComponentFixture<SettingsPage>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    fixture = TestBed.createComponent(SettingsPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
