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

describe('SwiperComponent.coverflowFewStep', () => {
  // (a cover as the component draws it: tilted by 65 degrees, 100 px back, in perspective of 1000 about the middle of the screen)
  const inner = (cover: number, strip: number) => {
    const lift = (cover / 2) * Math.sin((65 * Math.PI) / 180)
    const reach = (cover / 2) * Math.cos((65 * Math.PI) / 180)
    const outer = (cover / 2 + strip) // the outer edge stands here
    const centre = outer / (1000 / (1000 + 100 - lift)) - reach
    return ((centre - reach) * 1000) / (1000 + 100 + lift)
  }

  it('shows a single cover on a side whole, 50 px from the cover in the middle', () => {
    expect(inner(300, SwiperComponent.coverflowFewStep(810, 1, 9, 300))).toBeCloseTo(150 + 50, 6)
  })

  it('moves the covers closer together with every further cover, until a full side shows the strips of a full list', () => {
    let before = Infinity
    for (let n = 1; n <= 9; n++) {
      const step = SwiperComponent.coverflowFewStep(810, n, 9, 300)
      expect(step).toBeLessThan(before)
      before = step
    }
    expect(SwiperComponent.coverflowFewStep(810, 9, 9, 300)).toBeCloseTo(810 / 9, 6)
    // (and with a part of a cover in between, while the list moves)
    const half = SwiperComponent.coverflowFewStep(810, 1.5, 9, 300)
    expect(half).toBeLessThan(SwiperComponent.coverflowFewStep(810, 1, 9, 300))
    expect(half).toBeGreaterThan(SwiperComponent.coverflowFewStep(810, 2, 9, 300))
  })

  it('never puts the covers further out than the edge of the screen', () => {
    for (const room of [60, 90, 250, 810]) for (let n = 1; n <= 6; n++) expect(SwiperComponent.coverflowFewStep(room, n, 6, 300) * n).toBeLessThanOrEqual(room + 1e-9)
  })
})
