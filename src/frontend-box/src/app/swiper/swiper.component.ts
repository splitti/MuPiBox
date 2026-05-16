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
  untracked,
  viewChild,
  WritableSignal,
} from '@angular/core'
import { IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone'
import { Observable } from 'rxjs'
import Swiper from 'swiper'
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
  // Progressive-render cap. Starts small (~viewport + swipe-buffer) and
  // grows in deterministic timeout-driven chunks until the full list is
  // in the DOM. Used to use requestIdleCallback for the late chunks but
  // it didn't fire reliably on the Pi kiosk (the browser's Spotify-SDK
  // polling kept the main thread non-idle), so very large lists never
  // grew past stage 2 — Benjamin Blümchen rendered only 60 of 276 albums.
  private renderableLimit: WritableSignal<number> = signal(15)
  private static readonly RENDER_INITIAL = 15
  private static readonly RENDER_CHUNK_SIZE = 30
  private static readonly RENDER_CHUNK_DELAY_MS = 80
  private renderTimer: number | undefined

  // This is a hacky workaround for the problem that the swiper doesn't allow to scroll
  // after an ionic navigation event if the data is not updated. Thus, we copy the given
  // data here internally to fake updated data.
  // This might be removed when we have a generic API cache so we can just get new results
  // on every ionic navigation.
  protected shownData: Signal<SwiperData<T>[]>

  // Since we reset the swiper container when the page is entered / left, we need to
  // manually cache / restore the swiper position.
  private cachedSwiperPosition = 0

  // Track URLs we've already triggered a preload-fetch for, so we don't
  // re-create Image() objects for the same cover on every slide change.
  // Set lives for the lifetime of the component instance — that matches
  // the underlying Spotify-CDN cache lifetime well enough.
  private readonly preloadedSrcs = new Set<string>()
  private static readonly PRELOAD_LOOKAHEAD = 12
  private static readonly PRELOAD_LOOKBEHIND = 4

  public constructor(private playerService: PlayerService) {
    this.shownData = computed(() => {
      if (!this.pageIsShown()) return []
      // Progressive render for very long lists (276 albums for a prolific
      // artist like Benjamin Blümchen). Rendering all slides at once meant
      // ~1400 DOM nodes (276 × ion-card/grid/row/col/img) plus 276
      // simultaneous Spotify-CDN image fetches — Chromium needed several
      // seconds before the first paint. Cap the initial render at a
      // viewport-sized slice; the effect below incrementally grows it
      // until the full list is in the DOM. structuredClone is 5-10×
      // faster than lodash.cloneDeep on plain-object arrays; Observables
      // on SwiperData.imgSrc aren't cloneable so keep them by reference.
      const src = this.data()
      const limit = Math.min(this.renderableLimit(), src.length)
      const cloned = src
        .slice(0, limit)
        .map((d) => ({ name: d.name, imgSrc: d.imgSrc, data: structuredClone(d.data) }))
      return cloned
    })

    // Restore cached scroll position when page becomes visible. Tracks
    // pageIsShown only — must not track shownData (would re-fire on every
    // render-chunk and snap to the cached index mid-swipe).
    effect(() => {
      if (!this.pageIsShown()) return
      Promise.resolve().then(() => {
        const sw = this.swiper()
        if (!sw) return
        const slidesEl = (sw as unknown as { slides?: HTMLElement[] }).slides
        const len = slidesEl?.length ?? 0
        if (len > 0) {
          sw.slideTo(Math.min(this.cachedSwiperPosition, len - 1), 0)
        }
      })
    })

    // Drive progressive expansion. Tracks pageIsShown + data().length.
    // When the input data grows (typical: empty array → full array once
    // the parent's HTTP fetch resolves), kick off the chunked render
    // loop. Without this, the first ionViewDidEnter saw data().length=0,
    // bailed immediately, and never restarted when the real data arrived
    // — user saw only the initial 15 slides for the rest of the visit.
    effect(() => {
      if (!this.pageIsShown()) {
        if (this.renderTimer !== undefined) {
          clearTimeout(this.renderTimer)
          this.renderTimer = undefined
        }
        return
      }
      const target = this.data()?.length ?? 0
      const cur = untracked(() => this.renderableLimit())
      if (target > cur && this.renderTimer === undefined) {
        this.scheduleNextChunk()
      }
    })
  }

  /**
   * Tracks the user's current scroll position so progressive-render
   * expansions don't lose it. Wired up via the (slidechange) event in
   * the template. Without this, the cachedSwiperPosition stays at 0
   * for the entire page visit and any unintended slideTo would jump
   * back to the start.
   *
   * Also pre-fetches the next few cover URLs into the browser's image
   * cache, so by the time the user actually swipes there the <img>
   * tag finds the response already buffered instead of waiting for a
   * Spotify-CDN round-trip. The lazy-loading attribute on <img> means
   * the browser otherwise wouldn't kick off those requests until the
   * slide enters the viewport.
   */
  protected onSlideChange(event: Event): void {
    const swiper = (event.target as unknown as { swiper?: Swiper })?.swiper
    if (!swiper || typeof swiper.activeIndex !== 'number') return
    this.cachedSwiperPosition = swiper.activeIndex
    this.preloadCoversNear(swiper.activeIndex)
  }

  private preloadCoversNear(activeIndex: number): void {
    const data = this.shownData()
    if (!data || data.length === 0) return
    // Window covers a few back-slides too: a fast leftward swipe past
    // the start triggers no slidechange-event for individual back-
    // slides, so the user sees blank tiles when bouncing back. The
    // forward window is wider because forward-swiping is the dominant
    // motion in the kid UI.
    const start = Math.max(0, activeIndex - SwiperComponent.PRELOAD_LOOKBEHIND)
    const end = Math.min(activeIndex + 3 + SwiperComponent.PRELOAD_LOOKAHEAD, data.length)
    for (let i = start; i < end; i++) {
      const item = data[i]
      if (!item?.imgSrc) continue
      // imgSrc is `of(url)` — a single-emit completing observable, so
      // the subscription self-cleans. No takeUntilDestroyed needed.
      item.imgSrc.subscribe((url) => {
        if (!url || this.preloadedSrcs.has(url)) return
        this.preloadedSrcs.add(url)
        const img = new Image()
        img.src = url
      })
    }
  }

  public ionViewDidEnter(): void {
    this.pageIsShown.set(true)
    this.renderableLimit.set(SwiperComponent.RENDER_INITIAL)
    // Don't kick the render timer here — the effect tracking pageIsShown +
    // data().length will start it as soon as data has arrived.
    // Eager preload of the initial window so the first few swipes
    // don't catch the user with blank tiles. preloadCoversNear is
    // safe with empty data (early-returns).
    Promise.resolve().then(() => this.preloadCoversNear(0))
  }

  private scheduleNextChunk(): void {
    // Single in-flight timer guard. The effect calls this whenever
    // data grows; we only want one chunked loop running at a time.
    if (this.renderTimer !== undefined) return
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined
      if (!this.pageIsShown()) return
      const cur = this.renderableLimit()
      const target = this.data()?.length ?? 0
      if (cur >= target) return
      this.renderableLimit.set(Math.min(cur + SwiperComponent.RENDER_CHUNK_SIZE, target))
      // Tell the swiper element about its new slides — without an
      // explicit update() call the element's internal Swiper instance
      // can keep counting only the slides it saw at first init, which
      // means navigating past the original visible range silently
      // refuses to advance. Defer one tick so Angular has actually
      // committed the @for changes to the DOM.
      Promise.resolve().then(() => {
        const swiper = this.swiper()
        if (swiper && typeof (swiper as unknown as { update?: () => void }).update === 'function') {
          ;(swiper as unknown as { update: () => void }).update()
        }
      })
      this.scheduleNextChunk()
    }, SwiperComponent.RENDER_CHUNK_DELAY_MS) as unknown as number
  }

  public ionViewWillLeave(): void {
    this.cachedSwiperPosition = this.swiper()?.activeIndex ?? 0
    this.pageIsShown.set(false)
    if (this.renderTimer !== undefined) {
      clearTimeout(this.renderTimer)
      this.renderTimer = undefined
    }
  }

  public resetSwiperPosition(): void {
    this.swiper()?.slideTo(0, 0)
    this.cachedSwiperPosition = 0
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }
}
