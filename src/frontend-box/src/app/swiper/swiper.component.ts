import { AsyncPipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  ElementRef,
  effect,
  input,
  output,
  Signal,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core'
import { IonCard, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone'
import { cloneDeep } from 'lodash-es'
import { Observable } from 'rxjs'
import Swiper from 'swiper'

export interface SwiperData<T> {
  name: string
  imgSrc: Observable<string>
  data: T
}

@Component({
  selector: 'mupi-swiper',
  templateUrl: './swiper.component.html',
  styleUrls: ['./swiper.component.scss'],
  imports: [AsyncPipe, IonCard, IonCol, IonGrid, IonRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwiperComponent<T> {
  public data = input.required<SwiperData<T>[]>()
  public roundImages = input<boolean>(false)
  public elementClicked = output<SwiperData<T>>()

  protected swiperContainer = viewChild<ElementRef>('swiper')
  protected swiper: Signal<Swiper> = computed(() => this.swiperContainer()?.nativeElement.swiper)
  protected pageIsShown: WritableSignal<boolean> = signal(false)

  // This is a hacky workaround for the problem that the swiper doesn't allow to scroll
  // after an ionic navigation event if the data is not updated. Thus, we copy the given
  // data here internally to fake updated data.
  // This might be removed when we have a generic API cache so we can just get new results
  // on every ionic navigation.
  protected shownData: Signal<SwiperData<T>[]>

  // Since we reset the swiper container when the page is entered / left, we need to
  // manually cache / restore the swiper position.
  private cachedSwiperPosition = 0

  public constructor() {
    this.shownData = computed(() => {
      if (this.pageIsShown()) {
        return cloneDeep(this.data())
      }
      return []
    })

    effect(() => {
      if (this.pageIsShown()) {
        this.swiper()?.slideTo(this.cachedSwiperPosition, 0)
      }
    })

    // New slides need their tilt as soon as they are rendered.
    effect(() => {
      this.shownData()
      setTimeout(() => this.applyCoverflow(), 0)
    })
  }

  public ionViewDidEnter(): void {
    this.pageIsShown.set(true)
  }

  public ionViewWillLeave(): void {
    this.cachedSwiperPosition = this.swiper()?.activeIndex ?? 0
    this.pageIsShown.set(false)
  }

  public resetSwiperPosition(): void {
    this.swiper()?.slideTo(0, 0)
    this.cachedSwiperPosition = 0
  }

  // Cover Flow: the centered cover faces front; every other cover is tilted by the same
  // angle towards the center, packed closely, with a gap around the centered one.
  // (Swiper's built-in coverflow effect rotates further the further away a slide is.)
  public applyCoverflow(): void {
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (!swiper?.slides) {
      return
    }
    const angle = 65
    const centerGap = 193 // extra space between the centered cover and its neighbours (px)
    const depth = 100
    for (const slide of Array.from(swiper.slides) as (HTMLElement & { progress: number })[]) {
      const progress = slide.progress ?? 0
      const side = Math.sign(progress)
      const amount = Math.min(Math.abs(progress), 1)
      const rotate = side * angle * amount
      const shift = -side * centerGap * amount
      const z = -depth * amount
      slide.style.transform = `perspective(1000px) translateX(${shift}px) translateZ(${z}px) rotateY(${rotate}deg)`
      // Covers nearer to the center are drawn on top of the further ones.
      slide.style.zIndex = String(1000 - Math.round(Math.abs(progress) * 10))
    }
  }

  // Tapping a tilted side cover brings it to the center; only the centered one opens.
  // The browser hands taps on the overlapping, strongly tilted covers to the wrong
  // element, so the tapped slide is found by position instead: covers nearer to the
  // center are on top of the further ones, so they are checked first.
  protected slideClicked(event: MouseEvent): void {
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (!swiper) {
      return
    }
    const byDistance = (Array.from(swiper.slides) as HTMLElement[])
      .map((slide, index) => ({ slide, index }))
      .sort((a, b) => Math.abs(a.index - swiper.activeIndex) - Math.abs(b.index - swiper.activeIndex))
    for (const { slide, index } of byDistance) {
      const rect = slide.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        continue
      }
      if (index !== swiper.activeIndex) {
        swiper.slideTo(index, 300)
        return
      }
      const item = this.shownData()[index]
      if (item) {
        this.elementClicked.emit(item)
      }
      return
    }
  }
}
