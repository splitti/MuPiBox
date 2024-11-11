import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SwiperComponent } from './swiper.component'

describe('SwiperComponent', () => {
  let component: SwiperComponent<void>
  let fixture: ComponentFixture<SwiperComponent<void>>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SwiperComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    fixture = TestBed.createComponent(SwiperComponent<void>)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
