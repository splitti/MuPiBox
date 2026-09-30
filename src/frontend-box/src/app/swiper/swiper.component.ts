import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  output,
  Signal,
  signal,
  untracked,
  viewChild,
  WritableSignal,
} from '@angular/core'
import { IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { checkmark, folder, link, play } from 'ionicons/icons'
import { Observable } from 'rxjs'
import Swiper from 'swiper'
import { environment } from '../../environments/environment'
import type { MupiboxConfig } from '../mupibox-config.model'
import { CoverFlipService } from '../cover-flip.service'
import { DisplayTextsService } from '../display-texts.service'
import { PlayerService } from '../player.service'
import { KmThemeService } from '../theme/km-theme.service'

export interface SwiperData<T> {
  name: string
  imgSrc: Observable<string>
  data: T
  // Phase 14e: optional small overlay badge for the card — used by the
  // medialist to mark `source='spotify-sync'` items so parents/kids can
  // tell at a glance which entries are auto-synced from a MuPiBox
  // playlist. Renders as a tiny emoji/glyph in the top-right corner of
  // the card; absent badges add no DOM.
  badge?: string
  // km themes: what a tap on the cover does (artist level, folder with more albums, album, the folder's own titles
  // as the first entry) - shown as card stack / badge - and whether it is synced from Spotify.
  kind?: 'artist' | 'folder' | 'album' | 'own'
  synced?: boolean
  // A podcast (episode) with something new: a dot; an episode's progress (percent) and heard to its end: a bar / a tick
  isNew?: boolean
  progress?: number
  done?: boolean
}

@Component({
  selector: 'mupi-swiper',
  templateUrl: './swiper.component.html',
  styleUrls: ['./swiper.component.scss'],
  imports: [AsyncPipe, IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwiperComponent<T> {
  public data = input.required<SwiperData<T>[]>()
  // Identifies the list (e.g. category + artist). A page can be rebuilt when the player opens (the album
  // list is), which lost the remembered position with the component; kept per key it survives that.
  public positionKey = input<string | undefined>(undefined)
  private static readonly positions = new Map<string, number>()
  public roundImages = input<boolean>(false)
  public elementClicked = output<SwiperData<T>>()

  // Track URLs we've already triggered a preload-fetch for, so we don't
  // re-create Image() objects for the same cover on every slide change.
  // The set lives for the lifetime of the component instance — that matches
  // the underlying cover-cache lifetime well enough. See preloadCoversNear().
  private readonly preloadedSrcs = new Set<string>()
  private static readonly PRELOAD_LOOKAHEAD = 12
  private static readonly PRELOAD_LOOKBEHIND = 4

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
  // Slides kept rendered ahead of the current position (10 screens of three). The list grows only
  // when the user gets that close to the end of what is rendered: building 30 slides every 80 ms in
  // the background made the first pages stutter while the user was already swiping through them.
  private static readonly RENDER_AHEAD = 30
  private renderTimer: number | undefined

  // This is a hacky workaround for the problem that the swiper doesn't allow to scroll
  // after an ionic navigation event if the data is not updated. Thus, we copy the given
  // data here internally to fake updated data.
  // This might be removed when we have a generic API cache so we can just get new results
  // on every ionic navigation.
  protected shownData: Signal<SwiperData<T>[]>

  // km themes (see theme/km-theme.service.ts): extra markup only while one of them is active
  private readonly kmTheme = inject(KmThemeService)
  protected readonly km = this.kmTheme.isKm
  // a cover that is missing (or does not load): the theme's placeholder picture
  protected readonly kmCoverPlaceholder = this.kmTheme.coverPlaceholder
  protected readonly displayTexts = inject(DisplayTextsService)
  protected readonly speakingName = signal<string | undefined>(undefined)
  private speakingTimer: ReturnType<typeof setTimeout> | undefined
  private readonly missingCovers = signal(new Set<string>())

  // km "Bühne" (stage, MuPi-Conf > "Cover-Flow-Ansicht"): the covers around the one in the middle, drawn by hand
  // (not by swiper) - only these few are in the DOM, so a list of 200 albums moves as easily as one of 5.
  protected readonly kmStage = computed(() => !this.coverflow() && this.kmTheme.stage())
  protected readonly stageIndex = signal(0)
  private readonly stageDragDx = signal(0)
  protected readonly stageDragging = computed(() => this.stageDragDx() !== 0)
  private stagePointerX: number | undefined
  private stageDragged = false
  // centre distance, size and opacity of the covers 0, 1, 2 and 3 places away from the middle (3: fading in / out)
  private static readonly STAGE_OFFSET = [0, 250, 420, 560]
  private static readonly STAGE_SCALE = [1, 0.65, 0.45, 0.35]
  private static readonly STAGE_OPACITY = [1, 0.6, 0.3, 0]
  private static readonly STAGE_PIXELS_PER_COVER = 180
  protected readonly stageItems = computed(() => {
    const data = this.shownData()
    // while dragging the position lies between two covers: every cover is where it would be at that position
    // (a cover coming to the middle grows on the way), so the stage follows the finger
    const last = data.length - 1
    const position = Math.max(-0.4, Math.min(this.stageClamp(this.stageIndex(), data.length) - this.stageDragDx() / SwiperComponent.STAGE_PIXELS_PER_COVER, last + 0.4))
    const at = (table: number[], a: number): number => {
      const i = Math.min(Math.floor(a), 2)
      return table[i] + (table[i + 1] - table[i]) * Math.min(a - i, 1)
    }
    const items: { index: number; data: SwiperData<T>; transform: string; opacity: number; z: number }[] = []
    for (let i = Math.max(0, Math.floor(position) - 3); i <= Math.min(last, Math.ceil(position) + 3); i++) {
      const off = i - position
      const a = Math.min(Math.abs(off), 3)
      items.push({
        index: i,
        data: data[i],
        transform: `translateX(${Math.sign(off) * at(SwiperComponent.STAGE_OFFSET, a)}px) scale(${at(SwiperComponent.STAGE_SCALE, a)})`,
        opacity: at(SwiperComponent.STAGE_OPACITY, a),
        z: 10 - Math.round(a * 2),
      })
    }
    return items
  })
  protected readonly stageCurrent = computed(() => {
    const data = this.shownData()
    return data.length > 0 ? data[this.stageClamp(this.stageIndex(), data.length)] : undefined
  })
  // position of the scrollbar's thumb (track 200 px): the whole list, not only what is rendered yet
  protected readonly stageBar = computed(() => {
    const total = this.data()?.length ?? 0
    if (total < 2 || this.shownData().length === 0) return undefined
    const width = Math.max(24, 200 / total)
    const c = this.stageClamp(this.stageIndex(), total)
    return { width, x: (c / (total - 1)) * (200 - width) }
  })

  // Since we reset the swiper container when the page is entered / left, we need to
  // manually cache / restore the swiper position.
  private cachedSwiperPosition = 0
  // Set when the page is shown again with a remembered position; cleared once the swiper went there.
  private pendingRestore = false
  // positionKey of the list currently shown (to notice a folder level change within the page)
  private shownKey: string | undefined

  // Lists with fewer covers than this are spread over the whole screen instead of scrolled.
  private static readonly FEW_COVERS = 10
  private selectedIndex = 0
  private snapUntil = 0
  private introDone = false

  // The Cover Flow look belongs to the "coverflow" theme (Mupi-conf > MuPiBox settings > Theme);
  // with any other theme the lists look like they always did. The scrollbar can be hidden
  // for every theme. Both come from the MuPiBox config, which is loaded once.
  protected configLoaded: WritableSignal<boolean> = signal(false)
  protected coverflow: WritableSignal<boolean> = signal(false)
  /** Width of one cover in the Cover Flow, measured on first use (0 = not yet). */
  private coverflowCoverWidth = 0
  protected hideScrollbar: WritableSignal<boolean> = signal(false)
  // Coverflow theme only: shows currentData.name (album name, falling back to the folder name -
  // the same value the non-Coverflow list already shows under each cover) below the cover.
  protected coverflowShowNames: WritableSignal<boolean> = signal(false)

  public constructor(
    private playerService: PlayerService,
    private coverFlip: CoverFlipService,
    http: HttpClient,
  ) {
    addIcons({ checkmark, folder, link, play })
    http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        this.coverflow.set(config?.mupibox?.theme === 'coverflow')
        this.hideScrollbar.set(config?.mupibox?.hideScrollbar === true)
        this.coverflowShowNames.set(config?.mupibox?.coverflowShowNames === true)
        this.configLoaded.set(true)
      },
      error: () => this.configLoaded.set(true),
    })

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
      const src = this.data() ?? [] // the list can still be undefined while a tab (e.g. NAS) is loading
      const limit = Math.min(this.renderableLimit(), src.length)
      const cloned = src
        .slice(0, limit)
        .map((d) => ({ name: d.name, imgSrc: d.imgSrc, data: structuredClone(d.data), kind: d.kind, synced: d.synced }))
      return cloned
    })

    // Restore cached scroll position when page becomes visible. Tracks
    // pageIsShown only — must not track shownData (would re-fire on every
    // render-chunk and snap to the cached index mid-swipe).
    effect(() => {
      if (!this.pageIsShown()) return
      this.selectedIndex = this.cachedSwiperPosition
      this.stageIndex.set(this.cachedSwiperPosition)
      this.pendingRestore = this.cachedSwiperPosition > 0
    })

    // The restore itself waits until the slides of this visit are really in the DOM: right after
    // the page is shown the list is still empty (it is only rendered while the page is visible),
    // so an immediate slideTo went nowhere and the list opened at the start.
    effect(() => {
      const count = this.shownData().length
      if (!this.pendingRestore || count === 0) return
      setTimeout(() => {
        const sw = this.swiper()
        const len = (sw as unknown as { slides?: HTMLElement[] } | undefined)?.slides?.length ?? 0
        if (!this.pendingRestore || !sw || len === 0) return
        if (len > this.cachedSwiperPosition || len >= this.data().length) {
          ;(sw as unknown as { update?: () => void }).update?.()
          sw.slideTo(Math.min(this.cachedSwiperPosition, len - 1), 0)
          this.pendingRestore = false
        }
      }, 0)
    })

    // A folder level opened inside the album list (NAS / local subfolder, or back up a level) is the same page with
    // new data: the list kept the scroll position of the level before - TKKG, far down the alphabet in
    // "Hörspiele", opened at its own end. On a level change the old level's position is remembered and the new
    // one starts where it was left (a new level: at the start).
    effect(() => {
      const key = this.positionKey()
      if (!untracked(() => this.pageIsShown())) {
        this.shownKey = key
        return
      }
      if (key === this.shownKey) return
      untracked(() => {
        if (this.shownKey) {
          SwiperComponent.positions.set(this.shownKey, this.currentPosition())
        }
        this.shownKey = key
        const target = (key ? SwiperComponent.positions.get(key) : undefined) ?? 0
        this.cachedSwiperPosition = target
        this.selectedIndex = target
        this.stageIndex.set(target)
        this.renderableLimit.set(Math.max(SwiperComponent.RENDER_INITIAL, target + 12))
        this.swiper()?.slideTo(0, 0)
        this.pendingRestore = target > 0
      })
    })

    // New slides need their tilt as soon as they are rendered.
    effect(() => {
      this.shownData()
      // New slides (or slides that were reused for other content) take their place at once;
      // gliding there from whatever layout they had before looked like shaking while a page
      // change was animating.
      this.snapUntil = Date.now() + 900
      this.introDone = false
      setTimeout(() => this.applyCoverflow(), 0)
      // The swiper's scrollbar only exists a moment later.
      setTimeout(() => this.applyCoverflow(), 400)
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
        this.maybeGrow()
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
    this.maybeGrow()
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
    const key = this.positionKey()
    if (key && this.cachedSwiperPosition === 0) {
      this.cachedSwiperPosition = SwiperComponent.positions.get(key) ?? 0
    }
    this.pageIsShown.set(true)
    // Render at least up to the remembered position (plus a few slides around it), so coming
    // back from an album list lands on the artist you left instead of the end of the first chunk.
    this.renderableLimit.set(Math.max(SwiperComponent.RENDER_INITIAL, this.cachedSwiperPosition + 12))
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
      this.maybeGrow()
    }, SwiperComponent.RENDER_CHUNK_DELAY_MS) as unknown as number
  }

  // Starts the next chunk if the list is not complete yet and the user is within RENDER_AHEAD
  // slides of its rendered end. Cover Flow keeps growing eagerly (it positions all slides itself).
  private maybeGrow(): void {
    if (!this.pageIsShown() || this.renderTimer !== undefined) return
    const cur = this.renderableLimit()
    if (cur >= (this.data()?.length ?? 0)) return
    if (this.coverflow() || this.cachedSwiperPosition + SwiperComponent.RENDER_AHEAD >= cur) {
      this.scheduleNextChunk()
    }
  }

  public ionViewWillLeave(): void {
    this.cachedSwiperPosition = this.currentPosition()
    const key = this.positionKey()
    if (key) {
      SwiperComponent.positions.set(key, this.cachedSwiperPosition)
    }
    this.pageIsShown.set(false)
    if (this.renderTimer !== undefined) {
      clearTimeout(this.renderTimer)
      this.renderTimer = undefined
    }
  }

  public resetSwiperPosition(): void {
    this.swiper()?.slideTo(0, 0)
    this.cachedSwiperPosition = 0
    this.pendingRestore = false
    const key = this.positionKey()
    if (key) {
      SwiperComponent.positions.delete(key)
    }
    this.selectedIndex = 0
    this.stageIndex.set(0)
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
    this.watchCoverSources(this.swiperContainer()?.nativeElement as HTMLElement)
    this.loadNearCovers(swiper, this.isFlatRow() || this.isFewCovers() ? undefined : 9)
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
    // Three covers on each side of the centered one. The space between the edge of the centered cover and the
    // edge of the screen is divided into three equal steps (each side cover shows a strip of one step), and
    // all side covers have the same tilt.
    const visibleSides = 3
    const maxAngle = 65
    const depth = 100
    const perspective = 1000
    const slides = Array.from(swiper.slides) as (HTMLElement & { progress: number })[]
    const first = slides[0]
    if (!first) {
      return
    }
    // Measured once: this runs twice per frame while dragging, and reading offsetWidth between the transform
    // writes forced a style recalculation every time. The cover size is fixed by the stylesheet.
    if (!this.coverflowCoverWidth) this.coverflowCoverWidth = first.offsetWidth
    const coverWidth = this.coverflowCoverWidth || 300
    const unit = coverWidth + (Number(swiper.params.spaceBetween) || 0) // distance of two neighbouring covers in the row
    const screenHalf = swiper.width / 2
    const step = (screenHalf - coverWidth / 2) / visibleSides
    for (const slide of slides) {
      const progress = slide.progress ?? 0
      const t = Math.abs(progress)
      // Covers beyond the third one are out of sight anyway. Long lists (a podcast can have
      // hundreds of episodes) would otherwise be restyled completely on every frame of a drag.
      if (t > visibleSides + 1) {
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
      // progress > 0: the cover is on the left of the centered one (as before), progress < 0: on the right.
      const side = -Math.sign(progress) // -1 left, +1 right on the screen
      const angle = maxAngle * Math.min(t, 1) // all side covers are tilted by the same angle (the first one turns in while it moves away from the center)
      const radians = (angle * Math.PI) / 180
      const z = -depth * Math.min(t, 1)
      // The outer edge of the cover is turned towards the viewer: it is nearer, so it appears larger.
      const outerZ = z + (coverWidth / 2) * Math.sin(radians)
      const scale = perspective / (perspective - outerZ)
      // Move the outer edge of the cover to its place: one step further out for every cover.
      const shift = side * (((coverWidth / 2) + t * (step - unit)) / scale - (coverWidth / 2) * Math.cos(radians))
      slide.style.transform = `perspective(${perspective}px) translateX(${shift}px) translateZ(${z}px) rotateY(${-side * angle}deg)`
      // Covers nearer to the center are drawn on top of the further ones.
      slide.style.zIndex = String(1000 - Math.round(t * 10))
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

  // The pictures are only fetched for covers that are (nearly) in view. A podcast has hundreds
  // of episodes, and requesting all of their pictures at once would take minutes.
  private coverObserver: MutationObserver | undefined
  private observedContainer: HTMLElement | undefined

  private watchCoverSources(container: HTMLElement | undefined): void {
    if (!container || this.observedContainer === container) {
      return
    }
    this.coverObserver?.disconnect()
    this.observedContainer = container
    // The picture addresses arrive a moment after the slides exist.
    this.coverObserver = new MutationObserver(() => this.applyCoverflow())
    this.coverObserver.observe(container, { subtree: true, attributes: true, attributeFilter: ['data-src'] })
  }

  private loadNearCovers(swiper: Swiper, radius: number | undefined): void {
    const slides = Array.from(swiper.slides) as (HTMLElement & { progress: number })[]
    const measured = slides.filter((slide) => typeof slide.progress === 'number')
    const wanted = radius === undefined ? slides : measured.filter((slide) => Math.abs(slide.progress) <= radius)
    // The cover in the middle first, then outwards - that is the order the browser asks for them.
    if (radius !== undefined) {
      wanted.sort((a, b) => Math.abs(a.progress) - Math.abs(b.progress))
    }
    for (const slide of wanted) {
      const img = slide.querySelector('img')
      const source = img?.dataset['src']
      if (img && source && !img.getAttribute('src')) {
        img.setAttribute('src', source)
      }
    }
    if (radius !== undefined) {
      // Pictures the user has scrolled far away from and that are still loading are not needed
      // any more: giving up on them frees the connection (and the server) for the new position.
      for (const slide of measured) {
        if (Math.abs(slide.progress) > radius + 4) {
          const img = slide.querySelector('img')
          if (img?.getAttribute('src') && !img.complete) {
            img.removeAttribute('src')
          }
        }
      }
    }
  }

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
      swiper.scrollbar.el.style.display = ''
      swiper.scrollbar.el.style.pointerEvents = 'none' // only shows where the selection is
    }
    const key = `${slides.length}:${swiper.width}`
    if (!this.fewLayouts || this.fewLayoutKey !== key) {
      this.measureFewLayouts(swiper, slides)
      this.fewLayoutKey = key
    }
    if (!this.dragging) {
      this.selectedIndex = Math.min(this.selectedIndex, slides.length - 1)
      if (Date.now() <= this.snapUntil) {
        // Fresh slides: they fade in at their final place, starting from a clean
        // state. Later calls in this window must not disturb that.
        if (!this.introDone && this.fewLayouts) {
          this.introDone = true
          this.playFewCoversIntro(swiper, slides)
        }
        return
      }
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
    this.showFewCoversScrollbar(swiper, position, slides.length, animate)
  }

  // The swiper does not scroll in this mode, so its scrollbar is driven by hand: the thumb
  // moves along the track with the (fractional) selection.
  private showFewCoversScrollbar(swiper: Swiper, position: number, count: number, animate: boolean): void {
    const track = swiper.scrollbar?.el as HTMLElement | undefined
    const thumb = swiper.scrollbar?.dragEl as HTMLElement | undefined
    if (!track || !thumb || count < 2) {
      return
    }
    const trackWidth = track.clientWidth
    const thumbWidth = Math.max(trackWidth / count, 40)
    thumb.style.transition = animate ? 'transform 0.4s ease' : 'none'
    thumb.style.width = `${thumbWidth}px`
    thumb.style.transform = `translate3d(${(position / (count - 1)) * (trackWidth - thumbWidth)}px, 0, 0)`
  }

  private playFewCoversIntro(swiper: Swiper, slides: HTMLElement[]): void {
    // Start state: final layout, invisible, without any transition.
    this.renderFewCovers(swiper, this.selectedIndex, false)
    slides.forEach((slide) => (slide.style.opacity = '0'))
    // Two frames later the start state has been painted; now everything glides to its place.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.renderFewCovers(swiper, this.selectedIndex, true)
        slides.forEach((slide) => {
          slide.style.transition = 'transform 0.45s ease-out, opacity 0.45s ease-out'
          slide.style.opacity = '1'
        })
      }),
    )
  }

  // Back to the scrolling Cover Flow (e.g. when the list grows past the threshold).
  private resetFewCoversMode(swiper: Swiper): void {
    swiper.allowTouchMove = true
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.display = ''
    }
    if (swiper.scrollbar?.el) {
      swiper.scrollbar.el.style.pointerEvents = ''
    }
    for (const slide of Array.from(swiper.slides) as HTMLElement[]) {
      slide.style.transition = ''
    }
  }

  // Index of the entry the list stands on (remembered when the page is left or the folder level changes).
  private currentPosition(): number {
    if (this.kmStage()) return this.stageIndex()
    return this.isFewCovers() ? this.selectedIndex : (this.swiper()?.activeIndex ?? 0)
  }

  // --- km "Bühne" ---------------------------------------------------------------------------------------------
  private stageClamp(index: number, count: number): number {
    return Math.max(0, Math.min(index, count - 1))
  }

  // Brings entry i to the middle (reads its name aloud if that is switched on) and renders further ahead if needed.
  private stageGo(index: number): void {
    const data = this.shownData()
    if (data.length === 0) return
    const before = this.stageClamp(this.stageIndex(), data.length)
    const c = this.stageClamp(index, data.length)
    this.stageIndex.set(c)
    this.cachedSwiperPosition = c
    this.preloadCoversNear(c)
    this.maybeGrow()
    if (c !== before && this.kmTheme.stageAutoRead()) {
      this.readText(data[c].name)
    }
  }

  // Dragging: the whole stage follows the finger; on release it moves by one cover per 180 px.
  protected stageDown(event: PointerEvent): void {
    this.stagePointerX = event.clientX
    this.stageDragged = false
  }

  protected stageMove(event: PointerEvent): void {
    if (this.stagePointerX === undefined) return
    const dx = event.clientX - this.stagePointerX
    if (Math.abs(dx) > 8) this.stageDragged = true
    if (this.stageDragged) this.stageDragDx.set(dx)
  }

  protected stageUp(): void {
    if (this.stagePointerX === undefined) return
    this.stagePointerX = undefined
    const dx = this.stageDragDx()
    this.stageDragDx.set(0)
    if (this.stageDragged) {
      this.stageGo(this.stageIndex() - Math.round(dx / SwiperComponent.STAGE_PIXELS_PER_COVER))
      // the click that follows the release is not a tap
      setTimeout(() => (this.stageDragged = false), 0)
    }
  }

  // The cover in the middle opens, a side cover comes to the middle.
  protected kmStageTap(index: number, item: SwiperData<T>): void {
    if (this.stageDragged) return
    if (index === this.stageClamp(this.stageIndex(), this.shownData().length)) {
      this.elementClicked.emit(item)
    } else {
      this.stageGo(index)
    }
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
    // km themes: the name bar lights up while it is read (the box gives no end signal: about as long as a name takes)
    this.speakingName.set(text)
    clearTimeout(this.speakingTimer)
    this.speakingTimer = setTimeout(() => this.speakingName.set(undefined), 1800)
  }

  // km themes: a cover that does not load shows the theme's mascot instead
  protected onCoverError(name: string): void {
    if (!this.km()) return
    this.missingCovers.update((set) => new Set(set).add(name))
  }

  protected coverMissing(name: string, src: string | null | undefined): boolean {
    return !src || src.includes('nocover') || this.missingCovers().has(name)
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
        this.coverFlip.capture(slides[index])
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
        this.coverFlip.capture(slide)
        this.elementClicked.emit(item)
      }
      return
    }
  }
}
