import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
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
import { IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone'
import { cloneDeep } from 'lodash-es'
import { Observable } from 'rxjs'
import Swiper from 'swiper'
import { environment } from '../../environments/environment'
import type { MupiboxConfig } from '../mupibox-config.model'
import { PlayerService } from '../player.service'

export interface SwiperData<T> {
  name: string
  imgSrc: Observable<string>
  data: T
}

@Component({
  selector: 'mupi-swiper',
  templateUrl: './swiper.component.html',
  styleUrls: ['./swiper.component.scss'],
  imports: [AsyncPipe, IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow],
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

  // The Cover Flow look belongs to the "coverflow" theme (Mupi-conf > MuPiBox settings > Theme);
  // with any other theme the lists look like they always did. The scrollbar can be hidden
  // for every theme. Both come from the MuPiBox config, which is loaded once.
  protected configLoaded: WritableSignal<boolean> = signal(false)
  protected coverflow: WritableSignal<boolean> = signal(false)
  protected hideScrollbar: WritableSignal<boolean> = signal(false)

  public constructor(
    private playerService: PlayerService,
    http: HttpClient,
  ) {
    http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        this.coverflow.set(config?.mupibox?.theme === 'coverflow')
        this.hideScrollbar.set(config?.mupibox?.hideScrollbar === true)
        this.configLoaded.set(true)
      },
      error: () => this.configLoaded.set(true),
    })

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
    if (!this.coverflow()) {
      return
    }
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (!swiper?.slides) {
      return
    }
    if (this.isFlatRow()) {
      this.applyFlatRowLayout(swiper)
      return
    }
    for (const slide of Array.from(swiper.slides) as HTMLElement[]) {
      slide.style.transformOrigin = ''
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
      // Covers far away from the center are out of sight anyway. Long lists (a podcast can have
      // hundreds of episodes) would otherwise be restyled completely on every frame of a drag.
      if (Math.abs(progress) > 7) {
        if (slide.dataset['far'] !== '1') {
          slide.dataset['far'] = '1'
          slide.style.visibility = 'hidden'
          slide.style.transform = 'none'
        }
        continue
      }
      if (slide.dataset['far'] === '1') {
        slide.dataset['far'] = ''
        slide.style.visibility = ''
      }
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

  // --- Short lists (fewer than FEW_COVERS covers) -------------------------------------
  // They are not scrolled by swiper: the covers are spread over the whole width, the
  // first at the left edge and the last at the right edge. The selected cover faces
  // front, all others are tilted towards it. Dragging moves the selection continuously
  // (the covers follow the finger, then glide into place); tapping a cover selects it.
  private static readonly DRAG_PIXELS_PER_COVER = 130

  private fewLayouts: { shift: number; rotate: number; z: number }[][] | undefined
  private fewLayoutKey = ''
  private fewTranslate = 0 // the swiper's own scroll position while the layouts were measured
  private dragging = false
  private dragStartX = 0
  private dragStartPosition = 0
  private dragPosition = 0
  private suppressClick = false

  protected fewPointerDown(event: PointerEvent): void {
    if (!this.isFewCovers()) {
      return
    }
    this.dragging = true
    this.dragStartX = event.clientX
    this.dragStartPosition = this.selectedIndex
    this.dragPosition = this.selectedIndex
    this.suppressClick = false
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  protected fewPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return
    }
    const distance = event.clientX - this.dragStartX
    if (Math.abs(distance) > 8) {
      this.suppressClick = true // what follows is a drag, not a tap
    }
    const last = (this.shownData() ?? []).length - 1
    this.dragPosition = Math.min(Math.max(this.dragStartPosition - distance / SwiperComponent.DRAG_PIXELS_PER_COVER, 0), last)
    const swiper = this.swiperContainer()?.nativeElement?.swiper as Swiper | undefined
    if (swiper) {
      this.renderFewCovers(swiper, this.dragPosition, false)
    }
  }

  protected fewPointerUp(event: PointerEvent): void {
    if (!this.dragging) {
      return
    }
    this.dragging = false
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    if (this.suppressClick) {
      this.selectedIndex = Math.round(this.dragPosition)
      this.applyCoverflow() // glides to the selected cover
    }
  }

  // Up to this many covers are simply shown in a row: same size, all facing front,
  // no tilt, no animation and nothing to scroll.
  private static readonly FLAT_ROW_COVERS = 3

  private isFlatRow(): boolean {
    const count = (this.shownData() ?? []).length
    return count > 0 && count <= SwiperComponent.FLAT_ROW_COVERS
  }

  private isFewCovers(): boolean {
    const count = (this.shownData() ?? []).length
    return count > SwiperComponent.FLAT_ROW_COVERS && count < SwiperComponent.FEW_COVERS
  }

  private applyFlatRowLayout(swiper: Swiper): void {
    const slides = Array.from(swiper.slides) as HTMLElement[]
    const count = slides.length
    if (count === 0) {
      return
    }
    swiper.allowTouchMove = false
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.display = 'none'
    }
    // As large as possible (up to 300px) with the same gap between and around the covers.
    const minGap = 20
    const coverSize = Math.min(300, (swiper.width - (count + 1) * minGap) / count)
    const gap = (swiper.width - count * coverSize) / (count + 1)
    slides.forEach((slide) => {
      slide.style.transition = 'none'
      slide.style.transform = 'none'
    })
    const naturalCenters = slides.map((slide) => {
      const rect = slide.getBoundingClientRect()
      return rect.left + rect.width / 2
    })
    slides.forEach((slide, index) => {
      const center = gap * (index + 1) + coverSize * index + coverSize / 2
      // A smaller cover shrinks around the middle of its top edge (20px into the slide), so that
      // edge stays 20px below the menu bar.
      slide.style.transformOrigin = 'center 20px'
      slide.style.transform = `translateX(${center - naturalCenters[index]}px) scale(${coverSize / 300})`
      slide.style.zIndex = '1'
    })
  }

  private applyFewCoversLayout(swiper: Swiper): void {
    const slides = Array.from(swiper.slides) as HTMLElement[]
    if (slides.length === 0) {
      return
    }
    swiper.allowTouchMove = false
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.display = 'none'
    }
    const key = `${slides.length}:${swiper.width}`
    if (!this.fewLayouts || this.fewLayoutKey !== key) {
      this.measureFewLayouts(swiper, slides)
      this.fewLayoutKey = key
    }
    if (!this.dragging) {
      this.selectedIndex = Math.min(this.selectedIndex, slides.length - 1)
      this.renderFewCovers(swiper, this.selectedIndex, slides[0].style.transform !== '')
    }
  }

  // The layout for every possible selection is measured once. How wide a tilted cover
  // looks depends on perspective and position, so it is measured and corrected a few
  // times instead of calculated.
  private measureFewLayouts(swiper: Swiper, slides: HTMLElement[]): void {
    const count = slides.length
    const margin = 0
    const flatWidth = 300
    const angle = 65
    const depth = 100
    const perspective = 1000
    const scale = perspective / (perspective + depth) // tilted covers are further away
    const width = swiper.width

    this.fewTranslate = swiper.translate
    slides.forEach((slide) => {
      slide.style.transition = 'none'
      slide.style.transform = 'none'
    })
    const naturalCenters = slides.map((slide) => {
      const rect = slide.getBoundingClientRect()
      return rect.left + rect.width / 2
    })
    const cardRects = (): DOMRect[] =>
      slides.map((slide) => (slide.querySelector('ion-card') ?? slide).getBoundingClientRect())

    const layouts: { shift: number; rotate: number; z: number }[][] = []
    for (let selected = 0; selected < count; selected++) {
      const shifts = new Array<number>(count).fill(0)
      const apply = (): void => {
        slides.forEach((slide, index) => {
          const tilted = index !== selected
          const rotate = index < selected ? angle : index > selected ? -angle : 0
          slide.style.transform = `perspective(${perspective}px) translateX(${shifts[index]}px) translateZ(${tilted ? -depth : 0}px) rotateY(${rotate}deg)`
        })
      }

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
      layouts.push(
        slides.map((_, index) => ({
          shift: shifts[index],
          rotate: index < selected ? angle : index > selected ? -angle : 0,
          z: index === selected ? 0 : -depth,
        })),
      )
    }
    this.fewLayouts = layouts
    slides.forEach((slide) => {
      slide.style.transform = ''
    })
  }

  // Shows the layout for a (fractional) selection: between two selections every cover
  // is halfway between its two positions - that is what makes dragging follow the finger.
  private renderFewCovers(swiper: Swiper, position: number, animate: boolean): void {
    const layouts = this.fewLayouts
    if (!layouts) {
      return
    }
    const slides = Array.from(swiper.slides) as HTMLElement[]
    const from = Math.min(Math.floor(position), slides.length - 1)
    const to = Math.min(from + 1, slides.length - 1)
    const fraction = position - from
    const mix = (a: number, b: number): number => a + (b - a) * fraction
    // The swiper moves its slides on its own (e.g. when it centers the first slide after
    // it has been set up). The layouts were measured at another scroll position, so the
    // difference has to be taken out again (outside the perspective, so tilted covers keep
    // their measured shape) or every cover would sit off to one side.
    const moved = swiper.translate - this.fewTranslate
    slides.forEach((slide, index) => {
      const a = layouts[from][index]
      const b = layouts[to][index]
      const z = mix(a.z, b.z)
      const shift = mix(a.shift, b.shift)
      slide.style.transition = animate ? 'transform 0.4s ease' : 'none'
      // The outer translation moves the finished picture, so the cover keeps its shape.
      slide.style.transform = `translateX(${-moved}px) perspective(1000px) translateX(${shift}px) translateZ(${z}px) rotateY(${mix(a.rotate, b.rotate)}deg)`
      slide.style.zIndex = String(1000 - Math.round(Math.abs(index - position) * 10))
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

  protected readText(text: string): void {
    this.playerService.sayText(text)
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
    if (this.isFlatRow()) {
      // Every cover faces front: a tap opens it directly.
      const slides = Array.from(swiper.slides) as HTMLElement[]
      const index = slides.findIndex((slide) => {
        const rect = slide.getBoundingClientRect()
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      })
      const item = (this.shownData() ?? [])[index]
      if (item) {
        this.elementClicked.emit(item)
      }
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
