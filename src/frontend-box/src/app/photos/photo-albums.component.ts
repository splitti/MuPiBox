import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, computed, DestroyRef, effect, inject, output, signal, untracked, viewChild } from '@angular/core'
import { of } from 'rxjs'
import { environment } from 'src/environments/environment'
import { type DisplayTextKey, DisplayTextsService } from '../display-texts.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { PlayerService } from '../player.service'
import { SwiperComponent, type SwiperData } from '../swiper/swiper.component'
import { albumsPerView } from '../per-view'
import { KmThemeService } from '../theme/km-theme.service'
import { PhotoTimeService } from './photo-time.service'
import { type PhotoAlbumSummary, PhotosService } from './photos.service'

// (the number of stacks a row shows: per-view.ts - the same as the lists of the other tabs)
export { albumsPerView }

/**
 * The tab "Fotos" on the start page (handoff §4): the albums as stacks of pictures, three a screen (more on a wider display
 * than the 5" one, the same distance), swiped sideways
 * as the albums of the other tabs (a Swiper row with their scrollbar); a tap on a stack opens the album. Colours only
 * from the theme (--km-*), with plain ones for the old themes.
 */
@Component({
  selector: 'mupi-photo-albums',
  imports: [SwiperComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (time.blocked()) {
      <!-- the photo time is used up (handoff §8, 07_bildzeit-vorbei_eigenes-limit.png): the photos pause -->
      <div class="pp">
        <svg class="pp-fig" viewBox="0 0 220 220" aria-hidden="true">
          <g transform="rotate(-9 110 120)"><rect x="40" y="52" width="140" height="120" rx="18" class="pp-back" /></g>
          <g transform="rotate(4 110 120)">
            <rect x="34" y="62" width="152" height="124" rx="18" class="pp-front" />
            <path d="M74 120q12 10 24 0M122 120q12 10 24 0" class="pp-eye" />
            <path d="M98 146q12 7 24 0" class="pp-eye" />
          </g>
          <text x="168" y="44" class="pp-z">z</text>
          <text x="186" y="26" class="pp-z pp-z2">z</text>
          <text x="200" y="12" class="pp-z pp-z3">z</text>
        </svg>
        <div class="pp-text">
          <h2>{{ texts.text('photosPauseTitle') }}</h2>
          <p>{{ texts.text('photosPauseText') }}</p>
          <div class="pp-btns">
            <button type="button" class="pp-go" (click)="toListening.emit()">{{ texts.text('photosToListening') }}</button>
            <button type="button" class="pp-parents" (click)="parents()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              <span>{{ texts.text('photosParents') }}</span>
            </button>
          </div>
        </div>
      </div>
    } @else if (photos.allAway()) {
      <!-- no album there (handoff 10_nichts-erreichbar.png): all live from an Immich that is away -->
      <div class="pp">
        <svg class="pp-fig" viewBox="0 0 220 220" aria-hidden="true">
          <path d="M62 150h96a34 34 0 0 0 0-68 50 50 0 0 0-96 10 29 29 0 0 0 0 58z" class="pp-cloud" />
          <path d="M60 60l100 100" class="pp-cross" />
        </svg>
        <div class="pp-text">
          <h2>{{ texts.text('photosAllAwayTitle') }}</h2>
          <p>{{ texts.text('photosAllAwayText') }}</p>
          <div class="pp-btns">
            <button type="button" class="pp-go" (click)="retry()">{{ texts.text('photosRetry') }}</button>
          </div>
        </div>
      </div>
    } @else {
    @if (stage()) {
      <!-- the stage switched on (MuPi-Conf): the albums on it as the other tabs' covers - one big stack in the middle,
           the name below it (read out when tapped); a tap on the stack in the middle opens the album -->
      <div class="pa-stage">
        <mupi-swiper [data]="stageData()" positionKey="photos" (elementClicked)="open($event.data)"></mupi-swiper>
      </div>
    } @else {
    <!-- the row as in the other tabs (swiper.component.html): three a screen, swiped freely, with the same scrollbar
         (Einstellungen › Aussehen: hidden or "Durchgehend") -->
    <swiper-container class="pa" [attr.slides-per-view]="perView()" [class.sb-full]="fullScrollbar()" [class.pa-few]="albums().length < perView()" [attr.scrollbar]="!hideScrollbar()" scrollbar-hide="false" scrollbar-draggable="true" scrollbar-drag-size="auto" scrollbar-snap-on-release="true" free-mode="false" css-mode="true"
      speed="900" touch-ratio="0.5" slides-per-group="1" resistance="true" resistance-ratio="0.85">
        @for (a of albums(); track a.id) {
          <!-- the stack opens the album, the name under it is read out (as the names in the other tabs) -->
          <swiper-slide>
          <div class="pa-tile" [class.pa-away]="a.away">
            <button class="pa-stack" type="button" [attr.aria-label]="openLabel(a)" (click)="open(a)">
              <span class="pa-back"></span>
              @if (a.pictures[1]) {
                <img class="pa-mid" [src]="photos.fileUrl(a.id, a.pictures[1], 's')" alt="" draggable="false" />
              } @else {
                <span class="pa-mid pa-empty"></span>
              }
              @if (facesOf(a); as n) {
                <!-- an album of people (Immich): their faces in front - one fills it, two or three side by side -->
                <span class="pa-front pa-faces" [attr.data-n]="n">
                  @for (i of faceSlots(n); track i) {
                    <img class="pa-face" [src]="photos.faceUrl(a.id, i)" alt="" draggable="false" />
                  }
                </span>
              } @else {
                <img class="pa-front" [src]="photos.fileUrl(a.id, a.pictures[0], 's')" alt="" draggable="false" />
              }
              <span class="pa-badge">{{ a.count }}</span>
              @if (a.away) {
                <span class="pa-away-pill">{{ texts.text('photosAway') }}</span>
              }
            </button>
            <button class="pa-name" type="button" [class.pa-speaking]="speaking() === a.id" (click)="read(a)">{{ a.title }}</button>
          </div>
          </swiper-slide>
        }
    </swiper-container>
    }
    }
    @if (hint(); as h) {
      <div class="pp-hint" role="status">
        <span class="pp-hint-ic">i</span>
        <span>{{ texts.text(h) }}</span>
      </div>
    }
  `,
  styles: `
    .pp {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 52px;
      padding: 0 30px 20px;
    }
    .pp-fig {
      flex: 0 0 220px;
      width: 220px;
      height: 220px;
      overflow: visible;
    }
    /* (an album not there: grey, with its note) */
    .pa-away .pa-back,
    .pa-away .pa-mid,
    .pa-away .pa-front {
      filter: grayscale(1);
      opacity: 0.55;
    }
    .pa-away-pill {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      padding: 8px 16px;
      border-radius: 20px;
      background: var(--km-cream, #fff6e5);
      color: var(--km-ink, #2b2240);
      font-size: 17px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 3px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .pp-cloud {
      fill: var(--km-night-3, #3b3456);
      stroke: var(--km-ring, var(--km-cream, #fff6e5));
      stroke-width: 6;
    }
    .pp-cross {
      stroke: var(--km-apricot, #f7b267);
      stroke-width: 10;
      stroke-linecap: round;
    }
    .pp-back {
      fill: var(--km-cream, #fff6e5);
    }
    .pp-front {
      fill: var(--km-night-3, #3b3456);
      stroke: var(--km-ring, var(--km-cream, #fff6e5));
      stroke-width: 6;
    }
    .pp-eye {
      fill: none;
      stroke: var(--km-cream, #fff6e5);
      stroke-width: 5;
      stroke-linecap: round;
    }
    .pp-z {
      fill: var(--km-apricot, #f7b267);
      font-size: 26px;
      font-weight: 700;
    }
    .pp-z2 {
      font-size: 21px;
    }
    .pp-z3 {
      font-size: 16px;
    }
    .pp-text {
      max-width: 420px;
    }
    .pp-text h2 {
      margin: 0 0 10px;
      font-size: 34px;
      font-weight: 600;
      color: var(--km-on-bg, #fff);
    }
    .pp-text p {
      margin: 0 0 22px;
      font-size: 19px;
      line-height: 1.35;
      color: var(--km-lavender, rgba(255, 255, 255, 0.75));
    }
    .pp-btns {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .pp-go,
    .pp-parents {
      border: 0;
      font: inherit;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
      -webkit-tap-highlight-color: transparent;
      transition: transform 150ms var(--km-spring, ease-out);
    }
    .pp-go:active,
    .pp-parents:active {
      transform: scale(0.95);
    }
    .pp-go {
      height: 64px;
      padding: 0 28px;
      border-radius: 32px;
      font-size: 21px;
      background: var(--km-apricot, #f7b267);
      color: var(--km-ink, #2b2240);
    }
    .pp-parents {
      height: 48px;
      padding: 0 20px 0 16px;
      border-radius: 24px;
      font-size: 17px;
      background: var(--km-night-2, rgba(0, 0, 0, 0.4));
      color: var(--km-on-bg, #fff);
    }
    .pp-parents svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
    }
    .pp-hint {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      max-width: calc(100% - 60px);
      min-height: 56px;
      padding: 8px 24px 8px 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-radius: 28px;
      background: var(--km-cream, #fff6e5);
      color: var(--km-ink, #2b2240);
      font-size: 19px;
      font-weight: 600;
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .pp-hint-ic {
      flex: 0 0 40px;
      height: 40px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--km-apricot, #f7b267);
      font-weight: 700;
    }
    :host {
      display: block;
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    /* the stage: the whole page, as the other tabs' stage */
    .pa-stage {
      position: absolute;
      inset: 0;
    }
    /* the row: the whole page, its scrollbar as in the other tabs (swiper.component.scss) */
    .pa {
      position: absolute;
      inset: 0;
      user-select: none;
      -webkit-user-select: none;
      --swiper-scrollbar-bg-color: rgba(255, 255, 255, 0.2);
      --swiper-scrollbar-drag-bg-color: rgba(255, 255, 255, 0.8);
      --swiper-scrollbar-size: 8px;
      --swiper-scrollbar-bottom: 8px;
    }
    .pa swiper-slide {
      height: 100%;
    }
    /* fewer than three: in the middle (as the other tabs in the children's themes) */
    .pa.pa-few::part(wrapper) {
      justify-content: center;
    }
    /* "Durchgehend": across the width less 24 px on each side, 14 px thick, with room above and below for a finger */
    .pa.sb-full {
      --swiper-scrollbar-size: 14px;
    }
    .pa.sb-full::part(scrollbar) {
      left: 24px;
      width: calc(100% - 48px);
      bottom: 4px;
      box-sizing: content-box;
      border-top: 12px solid transparent;
      border-bottom: 6px solid transparent;
      background-clip: padding-box;
      border-radius: 13px;
    }
    /* the children's themes: 200 × 8 in the middle, 22 px above the bottom, in the theme's colours */
    :host-context(body.km) .pa {
      --swiper-scrollbar-size: 8px;
      --swiper-scrollbar-bottom: 22px;
      --swiper-scrollbar-bg-color: var(--km-night-3);
      --swiper-scrollbar-drag-bg-color: var(--km-lavender);
      --swiper-scrollbar-border-radius: 4px;
    }
    :host-context(body.km) .pa::part(scrollbar) {
      width: 200px;
      left: calc(50% - 100px);
    }
    :host-context(body.km) .pa.sb-full {
      --swiper-scrollbar-size: 14px;
    }
    :host-context(body.km) .pa.sb-full::part(scrollbar) {
      left: 24px;
      width: calc(100% - 48px);
      bottom: 16px;
    }
    .pa-tile {
      /* (the covers' top: y 106 on the screen, the page starts below the 72 px header) */
      margin: 34px auto 0;
      width: 236px;
    }
    .pa-stack {
      position: relative;
      display: block;
      width: 236px;
      height: 236px;
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      -webkit-tap-highlight-color: transparent;
      transition: transform 150ms var(--km-spring, ease-out);
    }
    .pa-stack:active {
      transform: scale(0.96);
    }
    .pa-back,
    .pa-mid,
    .pa-front {
      position: absolute;
      inset: 0;
      width: 236px;
      height: 236px;
      box-sizing: border-box;
      border-radius: 32px;
    }
    .pa-back {
      background: var(--km-cream, #fff6e5);
      transform: rotate(-6deg);
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .pa-mid,
    .pa-front {
      object-fit: cover;
      border: 6px solid var(--km-ring, var(--km-cream, #fff6e5));
      background: var(--km-night-3, #4a4560);
    }
    .pa-mid {
      transform: rotate(4deg);
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .pa-front {
      box-shadow: 0 6px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    /* the faces of an album of people: one fills the front, two or three as round faces on the theme's colour */
    .pa-faces {
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      align-items: center;
      justify-content: center;
      gap: 6px;
      overflow: hidden;
      background: var(--km-night-3, #4a4560);
    }
    .pa-face {
      display: block;
      object-fit: cover;
      border-radius: 50%;
      box-sizing: border-box;
      border: 4px solid var(--km-ring, var(--km-cream, #fff6e5));
    }
    .pa-faces[data-n='1'] .pa-face {
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 0;
    }
    .pa-faces[data-n='2'] .pa-face {
      width: 108px;
      height: 108px;
    }
    .pa-faces[data-n='3'] .pa-face {
      width: 98px;
      height: 98px;
    }
    .pa-badge {
      position: absolute;
      right: -6px;
      bottom: -6px;
      min-width: 46px;
      height: 46px;
      padding: 0 10px;
      box-sizing: border-box;
      border-radius: 23px;
      background: var(--km-apricot, #f7b267);
      color: var(--km-ink, #2b2240);
      font-size: 19px;
      font-weight: 700;
      display: grid;
      place-items: center;
      box-shadow: 0 3px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .pa-name {
      display: block;
      border: 0;
      font: inherit;
      -webkit-tap-highlight-color: transparent;
      transition:
        transform 150ms var(--km-spring, ease-out),
        background 150ms;
      margin: 14px 2px 0;
      width: 232px;
      height: 44px;
      line-height: 44px;
      padding: 0 16px;
      box-sizing: border-box;
      border-radius: 30px;
      background: var(--km-cream, #fff6e5);
      color: var(--km-ink, #2b2240);
      font-size: 20px;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* (while it is read out: lit as the name bars of the other tabs) */
    .pa-name.pa-speaking {
      background: var(--km-moon, var(--km-apricot, #f7b267));
      transform: scale(1.05);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoAlbumsComponent {
  protected readonly photos = inject(PhotosService)
  protected readonly texts = inject(DisplayTextsService)
  protected readonly time = inject(PhotoTimeService)
  private readonly player = inject(PlayerService)

  readonly opened = output<PhotoAlbumSummary>()
  /** the photos pause: "Zu den Hörspielen" */
  readonly toListening = output<void>()

  // a note at the bottom for a few seconds: "Eltern" on the pause page (more photo time comes from the parents' app -
  // nothing to unlock here), an album that is not there
  protected readonly hint = signal<DisplayTextKey | null>(null)
  private hintTimer = 0
  private showHint(key: DisplayTextKey): void {
    this.hint.set(key)
    window.clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => this.hint.set(null), 5000)
  }
  protected parents(): void {
    this.showHint('photosParentsHint')
  }
  // "Nochmal": the box is asked again at once
  protected retry(): void {
    this.photos.refresh(true)
  }

  protected readonly albums = this.photos.albums

  // the faces of the albums of people: tried first - one the box has not (yet) kept, and the album shows its picture
  // (tried again with the next list, every two minutes: the sync may have fetched it meanwhile)
  private readonly faceless = signal<ReadonlySet<string>>(new Set())
  private readonly tried = new Set<string>()
  private readonly tryFaces = effect(() => {
    for (const a of this.albums()) {
      for (let i = 0; i < Math.min(a.faces ?? 0, 3); i++) {
        const url = this.photos.faceUrl(a.id, i)
        if (this.tried.has(url)) continue
        this.tried.add(url)
        const img = new Image()
        img.onload = () => {
          if (untracked(() => this.faceless().has(a.id)))
            this.faceless.update((s) => {
              const next = new Set(s)
              next.delete(a.id)
              return next
            })
        }
        img.onerror = () => {
          this.tried.delete(url)
          this.faceless.update((s) => new Set(s).add(a.id))
        }
        img.src = url
      }
    }
  })
  /** how many faces the album's stack shows (0: its picture) */
  protected facesOf(a: PhotoAlbumSummary): number {
    return a.faces && !this.faceless().has(a.id) ? Math.min(a.faces, 3) : 0
  }
  protected faceSlots(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i)
  }

  // the stage (MuPi-Conf, the children's themes): the albums on it as picture stacks (swiper.component: SwiperData.stack)
  protected readonly stage = inject(KmThemeService).stage
  protected readonly stageData = computed<SwiperData<PhotoAlbumSummary>[]>(() =>
    this.albums().map((a) => ({
      name: a.title,
      // (an album of people: the first face in front)
      imgSrc: of(this.facesOf(a) ? this.photos.faceUrl(a.id, 0) : this.photos.fileUrl(a.id, a.pictures[0], 's')),
      data: a,
      stack: {
        mid: a.pictures[1] ? this.photos.fileUrl(a.id, a.pictures[1], 's') : undefined,
        count: a.count,
        away: a.away === true,
        awayLabel: this.texts.text('photosAway'),
      },
    })),
  )
  // (the stage's swiper is made with the tab, after the start page's "it comes": it gets it here - else it stays empty)
  private readonly stageSwiper = viewChild(SwiperComponent)
  private readonly stageShown = effect(() => {
    const swiper = this.stageSwiper()
    if (swiper) untracked(() => swiper.ionViewWillEnter())
  })

  // the scrollbar as in the other tabs (Einstellungen › Aussehen › Ansicht): hidden, or across the width
  protected readonly hideScrollbar = signal(false)
  protected readonly fullScrollbar = signal(false)

  // how many stacks a screen shows (more on a wide display, the same distance as on the 5" one)
  protected readonly perView = signal(albumsPerView(window.innerWidth))

  constructor() {
    // (the tab left within the seconds of a note or a name read out: its timers go with it)
    inject(DestroyRef).onDestroy(() => {
      window.clearTimeout(this.hintTimer)
      window.clearTimeout(this.speakingTimer)
    })
    const onResize = () => this.perView.set(albumsPerView(window.innerWidth))
    window.addEventListener('resize', onResize)
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize))
    inject(HttpClient)
      .get<MupiboxConfig>(`${environment.backend.apiUrl}/config`)
      .subscribe({
        next: (config) => {
          this.hideScrollbar.set(config?.mupibox?.hideScrollbar === true)
          this.fullScrollbar.set(config?.mupibox?.scrollbarStyle === 'full')
        },
        error: () => undefined,
      })
  }

  protected open(a: PhotoAlbumSummary): void {
    if (a.away) return this.showHint('photosAwayHint')
    this.opened.emit(a)
  }

  // the album's name read out (Einstellungen › Audio › Sprachausgabe, as the names in the other tabs) - not the tap
  // that ended a swipe
  protected readonly speaking = signal<string | null>(null)
  private speakingTimer = 0
  protected read(a: PhotoAlbumSummary): void {
    this.player.sayText(a.title)
    this.speaking.set(a.id)
    window.clearTimeout(this.speakingTimer)
    this.speakingTimer = window.setTimeout(() => this.speaking.set(null), 1800)
  }

  protected openLabel(a: PhotoAlbumSummary): string {
    return this.texts.text('photosOpen', { a: a.title, n: a.count })
  }
}
