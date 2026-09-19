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

  // Lists with fewer covers than this are spread over the whole screen instead of scrolled.
  private static readonly FEW_COVERS = 10
  private selectedIndex = 0

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
        this.selectedIndex = this.cachedSwiperPosition
      }
    })

    // New slides need their tilt as soon as they are rendered.
    effect(() => {
      this.shownData()
      setTimeout(() => this.applyCoverflow(), 0)
      // The swiper's scrollbar only exists a moment later.
      setTimeout(() => this.applyCoverflow(), 400)
    })
  }

  public ionViewDidEnter(): void {
    this.pageIsShown.set(true)
  }

  public ionViewWillLeave(): void {
    this.cachedSwiperPosition = this.isFewCovers() ? this.selectedIndex : (this.swiper()?.activeIndex ?? 0)
    this.pageIsShown.set(false)
  }

  public resetSwiperPosition(): void {
    this.swiper()?.slideTo(0, 0)
    this.cachedSwiperPosition = 0
    this.selectedIndex = 0
    this.applyCoverflow()
  }

  // Cover Flow: the centered cover faces front; every other cover is tilted by the same
  // angle towards the center, packed closely, with a gap around the centered one.
  // (Swiper's built-in coverflow effect rotates further the further away a slide is.)
  public applyCoverflow(): void {
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (!swiper?.slides) {
      return
    }
    if (this.isFewCovers()) {
      this.applyFewCoversLayout(swiper)
      return
    }
    this.resetFewCoversMode(swiper)
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

  // Short lists are not scrolled by swiper: a horizontal drag selects the previous / next cover.
  private dragStartX: number | undefined
  private suppressClick = false

  protected fewPointerDown(event: PointerEvent): void {
    this.dragStartX = this.isFewCovers() ? event.clientX : undefined
    this.suppressClick = false
  }

  protected fewPointerUp(event: PointerEvent): void {
    if (this.dragStartX === undefined) {
      return
    }
    const distance = event.clientX - this.dragStartX
    this.dragStartX = undefined
    if (Math.abs(distance) < 40) {
      return
    }
    this.suppressClick = true // the click that follows a drag is not a tap
    const count = (this.shownData() ?? []).length
    const next = this.selectedIndex + (distance < 0 ? 1 : -1)
    this.selectedIndex = Math.min(Math.max(next, 0), count - 1)
    this.applyCoverflow()
  }

  private isFewCovers(): boolean {
    const count = (this.shownData() ?? []).length
    return count > 0 && count < SwiperComponent.FEW_COVERS
  }

  // A short list is not scrolled: the covers are spread over the whole width, the first
  // one at the left edge and the last at the right edge of the screen.
  // The selected cover faces front, all others are tilted towards it; tapping another
  // cover selects it. How wide a tilted cover looks depends on perspective and position,
  // so the layout is measured and corrected a few times instead of calculated once.
  private applyFewCoversLayout(swiper: Swiper): void {
    const slides = Array.from(swiper.slides) as HTMLElement[]
    const count = slides.length
    if (count === 0) {
      return
    }
    swiper.allowTouchMove = false
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.display = 'none'
    }

    const margin = 0
    const flatWidth = 300
    const angle = 65
    const depth = 100
    const perspective = 1000
    const scale = perspective / (perspective + depth) // tilted covers are further away
    const width = swiper.width
    const selected = Math.min(this.selectedIndex, count - 1)

    const previous = slides.map((slide) => ({ transform: slide.style.transform, zIndex: slide.style.zIndex }))
    const naturalCenters = slides.map((slide) => {
      slide.style.transition = 'none'
      slide.style.transform = 'none'
      const rect = slide.getBoundingClientRect()
      return rect.left + rect.width / 2
    })
    const shifts = new Array<number>(count).fill(0)
    const apply = (): void => {
      slides.forEach((slide, index) => {
        const tilted = index !== selected
        const rotate = index < selected ? angle : index > selected ? -angle : 0
        slide.style.transform = `perspective(${perspective}px) translateX(${shifts[index]}px) translateZ(${tilted ? -depth : 0}px) rotateY(${rotate}deg)`
        slide.style.zIndex = String(1000 - Math.abs(index - selected))
      })
    }
    const cardRects = (): DOMRect[] =>
      slides.map((slide) => (slide.querySelector('ion-card') ?? slide).getBoundingClientRect())

    // Wanted position of every cover: the left edge (flat cover and left group) or the
    // right edge (right group), given the current widths of the tilted covers.
    const targets = (tiltedWidths: number[]): { edge: 'left' | 'right'; pos: number }[] => {
      const left = selected
      const right = count - 1 - selected
      const leftWidth = left > 0 ? tiltedWidths[left - 1] : 0
      const rightWidth = right > 0 ? tiltedWidths[selected + 1] : 0
      const gaps = (left > 0 ? 1 : 0) + (right > 0 ? 1 : 0)
      const steps = Math.max(left - 1, 0) + Math.max(right - 1, 0)
      const space = width - 2 * margin - flatWidth - leftWidth - rightWidth
      const wantedGap = 14
      const pitch = steps > 0 ? Math.min(Math.max((space - gaps * wantedGap) / steps, 12), 170) : 0
      const gap = gaps > 0 ? Math.max((space - steps * pitch) / gaps, 8) : 0
      let flatLeft = margin + (left > 0 ? (left - 1) * pitch + leftWidth + gap : 0)
      if (count === 1) {
        flatLeft = (width - flatWidth) / 2
      }
      return slides.map((_, index) => {
        if (index < selected) {
          return { edge: 'left', pos: margin + index * pitch }
        }
        if (index > selected) {
          return { edge: 'right', pos: width - margin - (count - 1 - index) * pitch }
        }
        return { edge: 'left', pos: flatLeft }
      })
    }

    // First guess from the natural positions, then measure and correct.
    let widths = slides.map(() => 115)
    let wanted = targets(widths)
    slides.forEach((_, index) => {
      const tilted = index !== selected
      let center = wanted[index].pos + flatWidth / 2
      if (tilted) {
        center = wanted[index].edge === 'left' ? wanted[index].pos + widths[index] / 2 : wanted[index].pos - widths[index] / 2
      }
      shifts[index] = (center - naturalCenters[index]) / (tilted ? scale : 1)
    })
    apply()
    for (let round = 0; round < 3; round++) {
      const rects = cardRects()
      widths = rects.map((rect) => rect.width)
      wanted = targets(widths)
      slides.forEach((_, index) => {
        const measured = wanted[index].edge === 'left' ? rects[index].left : rects[index].right
        shifts[index] += (wanted[index].pos - measured) / (index === selected ? 1 : scale)
      })
      apply()
    }

    // Measuring needed the final positions; now let the covers glide there from where they were.
    const final = slides.map((slide) => ({ transform: slide.style.transform, zIndex: slide.style.zIndex }))
    slides.forEach((slide, index) => {
      slide.style.transform = previous[index].transform || final[index].transform
    })
    void swiper.el.offsetWidth // commit the start position before animating
    slides.forEach((slide, index) => {
      slide.style.transition = 'transform 0.4s ease'
      slide.style.transform = final[index].transform
      slide.style.zIndex = final[index].zIndex
    })
  }

  // Back to the scrolling Cover Flow (e.g. when the list grows past the threshold).
  private resetFewCoversMode(swiper: Swiper): void {
    swiper.allowTouchMove = true
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.display = ''
    }
    for (const slide of Array.from(swiper.slides) as HTMLElement[]) {
      slide.style.transition = ''
    }
  }

  // Tapping a tilted side cover brings it to the center; only the centered one opens.
  // The browser hands taps on the overlapping, strongly tilted covers to the wrong
  // element, so the tapped slide is found by position instead: covers nearer to the
  // center are on top of the further ones, so they are checked first.
  protected slideClicked(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false
      return
    }
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (!swiper) {
      return
    }
    const few = this.isFewCovers()
    const current = few ? this.selectedIndex : swiper.activeIndex
    const byDistance = (Array.from(swiper.slides) as HTMLElement[])
      .map((slide, index) => ({ slide, index }))
      .sort((a, b) => Math.abs(a.index - current) - Math.abs(b.index - current))
    for (const { slide, index } of byDistance) {
      const rect = slide.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        continue
      }
      if (index !== current) {
        if (few) {
          this.selectedIndex = index
          this.applyCoverflow()
        } else {
          swiper.slideTo(index, 300)
        }
        return
      }
      const item = (this.shownData() ?? [])[index]
      if (item) {
        this.elementClicked.emit(item)
      }
      return
    }
  }
}
