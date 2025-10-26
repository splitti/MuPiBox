import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { FormsModule } from '@angular/forms'
import { UrlSerializer } from '@angular/router'
import { WifiPage } from './wifi.page'

describe('WifiPage', () => {
  let component: WifiPage
  let fixture: ComponentFixture<WifiPage>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, WifiPage],
      providers: [UrlSerializer, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    fixture = TestBed.createComponent(WifiPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
