import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SwiperComponent, SwiperData } from './swiper.component'

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

  it('should fill shownData when "ionViewDidEnter" is called', () => {
    const swiperData: SwiperData<number>[] = [{ name: 'test', imgSrc: 'bla', data: 0 }]
    fixture.componentRef.setInput('data', swiperData)
    expect((component as any).pageIsShown()).toBeFalse()
    expect((component as any).shownData()).toEqual([])
    component.ionViewDidEnter()
    TestBed.flushEffects()
    expect((component as any).pageIsShown()).toBeTrue()
    expect((component as any).shownData()).toEqual(swiperData)
  })

  it('should clear shownData when "ionViewWillLeave" is called', () => {
    const swiperData: SwiperData<number>[] = [{ name: 'test', imgSrc: 'bla', data: 0 }]
    fixture.componentRef.setInput('data', swiperData)
    ;(component as any).pageIsShown.set(true)
    TestBed.flushEffects()
    expect((component as any).shownData()).toEqual(swiperData)
    expect((component as any).pageIsShown()).toBeTrue()

    component.ionViewWillLeave()
    TestBed.flushEffects()
    expect((component as any).pageIsShown()).toBeFalse()
    expect((component as any).shownData()).toEqual([])
  })
})
