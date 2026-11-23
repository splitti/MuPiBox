import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { of } from 'rxjs'
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
    const swiperData: SwiperData<number>[] = [{ name: 'test', imgSrc: of('bla'), data: 0 }]
    fixture.componentRef.setInput('data', swiperData)
    expect((component as any).pageIsShown()).toBeFalse()
    expect((component as any).shownData()).toEqual([])
    component.ionViewDidEnter()
    TestBed.flushEffects()
    expect((component as any).pageIsShown()).toBeTrue()
    expect((component as any).shownData()).toEqual(swiperData)
  })

  it('should clear shownData when "ionViewWillLeave" is called', () => {
    const swiperData: SwiperData<number>[] = [{ name: 'test', imgSrc: of('bla'), data: 0 }]
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

describe('SwiperComponent.stageSides', () => {
  it('shows two covers on each side on the 5" display (800 px) and on anything narrower, as before', () => {
    for (const width of [0, 320, 480, 800, 1024]) expect(SwiperComponent.stageSides(width)).toBe(2)
    expect(SwiperComponent.stageSides(Number.NaN)).toBe(2)
  })

  it('shows more on a wider display, the covers keeping their size and distance', () => {
    expect(SwiperComponent.stageSides(1280)).toBe(3)
    expect(SwiperComponent.stageSides(1600)).toBe(4)
    expect(SwiperComponent.stageSides(1920)).toBe(5)
    expect(SwiperComponent.stageSides(2560)).toBe(7)
  })

  it('never shows fewer covers on a wider display', () => {
    let before = 0
    for (let width = 600; width <= 3840; width += 20) {
      const sides = SwiperComponent.stageSides(width)
      expect(sides).toBeGreaterThanOrEqual(before)
      before = sides
    }
  })
})
