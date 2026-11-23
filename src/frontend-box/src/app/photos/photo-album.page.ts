import { ChangeDetectionStrategy, Component, computed, effect, inject, type OnDestroy, signal, untracked } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { arrowBackOutline, playOutline } from 'ionicons/icons'
import { catchError, of, type Subscription } from 'rxjs'
import { DisplayTextsService } from '../display-texts.service'
import { KmStatusGroupComponent } from '../km-header/km-status-group.component'
import { StatusComponent } from '../status/status.component'
import { KmThemeService } from '../theme/km-theme.service'
import { PhotoViewerComponent } from './photo-viewer.component'
import { PhotoTimeService } from './photo-time.service'
import { clipLength, type PhotoAlbumDetail, PhotosService } from './photos.service'

/**
 * An album of the photo display (handoff §5): its pictures in a grid of four columns, scrolled up and down; a tap opens
 * the picture over the whole display, "Diashow" starts the slideshow at the first one. With the setting "Album startet
 * als Diashow" there is no grid: the slideshow comes at once, and back goes to the albums.
 */
@Component({
  selector: 'app-photo-album',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    KmStatusGroupComponent,
    StatusComponent,
    PhotoViewerComponent,
  ],
  template: `
    <!-- (the classes of the album list: every theme colours this page as that one - its background, its header) -->
    <ion-header class="medialist-header photo-album-header" [class.km-r2]="r2()">
      @if (r2()) {
        <div class="km-bar">
          <button class="km-hbtn" type="button" data-mupi-back [attr.aria-label]="texts.text('photosBackAlbums')" (click)="back()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div class="km-htitle">
            <span class="pa-t1">{{ album()?.title }}</span>
            <span class="pa-t2">{{ countText() }}</span>
          </div>
          @if (album()?.assets?.length) {
            <button class="pa-show" type="button" (click)="slideshow()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
              <span>{{ texts.text('photosSlideshow') }}</span>
            </button>
          }
          <mupi-km-status-group></mupi-km-status-group>
        </div>
      } @else {
        <ion-toolbar color="light">
          <ion-buttons slot="start">
            <ion-button (click)="back()"><ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon></ion-button>
          </ion-buttons>
          <ion-title>{{ album()?.title }}</ion-title>
          <ion-buttons slot="end">
            @if (album()?.assets?.length) {
              <ion-button (click)="slideshow()"><ion-icon slot="start" name="play-outline"></ion-icon>{{ texts.text('photosSlideshow') }}</ion-button>
            }
            <span class="mupihat-icon-container"><mupi-status></mupi-status></span>
          </ion-buttons>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content class="medialist-content photo-album-content" [class.pa-going]="fading()" [scrollY]="false">
      <div class="pa-grid-scroll">
        <div class="pa-grid">
          @for (a of album()?.assets ?? []; track a.id; let i = $index) {
            <button class="pa-cell" type="button" [attr.aria-label]="texts.text('photosPicture', { n: i + 1 })" (click)="openAt(i)">
              <img [src]="photos.fileUrl(album()!.id, a.id, 's')" alt="" loading="lazy" draggable="false" />
              @if (a.kind === 'video') {
                <span class="pa-clip">▶ {{ clipLength(a.duration) }}</span>
              }
            </button>
          }
        </div>
      </div>
    </ion-content>

    @if (viewer(); as v) {
      <mupi-photo-viewer [class.pa-going]="fading()" [albumId]="album()!.id" [assets]="album()!.assets" [start]="v.start" [autoplay]="v.play" [fromGrid]="!direct()" (closed)="viewerClosed()"></mupi-photo-viewer>
    }
  `,
  styles: `
    .km-htitle {
      .pa-t1 {
        font-size: 22px;
        font-weight: 600;
        color: var(--km-on-band, var(--km-on-bg));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pa-t2 {
        font-size: 15px;
        font-weight: 600;
        color: var(--km-on-band-2, var(--km-lavender));
        white-space: nowrap;
      }
    }
    .pa-show {
      flex: 0 0 auto;
      height: 64px;
      padding: 0 26px 0 18px;
      border: 0;
      border-radius: 32px;
      background: var(--km-apricot, #f7b267);
      color: var(--km-ink, #2b2240);
      display: flex;
      align-items: center;
      gap: 10px;
      font: inherit;
      font-size: 21px;
      font-weight: 700;
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
      -webkit-tap-highlight-color: transparent;
      transition: transform 150ms var(--km-spring, ease-out);
    }
    .pa-show:active {
      transform: scale(0.94);
    }
    .pa-show svg {
      width: 26px;
      height: 26px;
      fill: currentColor;
    }
    .pa-grid-scroll {
      position: absolute;
      inset: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
    }
    .pa-grid-scroll::-webkit-scrollbar {
      display: none;
    }
    .pa-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      padding: 8px 14px 22px;
    }
    .pa-cell {
      padding: 0;
      border: 0;
      aspect-ratio: 4 / 3;
      border-radius: 20px;
      overflow: hidden;
      background: var(--km-night-3, #3b3456);
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
      -webkit-tap-highlight-color: transparent;
      transition: transform 150ms var(--km-spring, ease-out);
    }
    .pa-cell:active {
      transform: scale(0.95);
    }
    /* (the photo time is up: the album fades, then the pause page - handoff §8) */
    .pa-going {
      opacity: 0;
      transition: opacity 400ms ease-out;
    }
    .pa-cell {
      position: relative;
    }
    .pa-clip {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 3px 10px;
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.62);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
    }
    .pa-cell img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoAlbumPage implements OnDestroy {
  protected readonly photos = inject(PhotosService)
  protected readonly texts = inject(DisplayTextsService)
  protected readonly clipLength = clipLength
  protected readonly r2 = inject(KmThemeService).roundTwo
  private readonly nav = inject(NavController)
  private readonly outlet = inject(IonRouterOutlet, { optional: true })
  private readonly time = inject(PhotoTimeService)
  protected readonly fading = signal(false)
  private fadeTimer = 0

  protected readonly album = signal<PhotoAlbumDetail | null>(null)
  /** "Album startet als Diashow": no grid, the slideshow at once - back from it goes to the albums */
  protected readonly direct = signal(false)
  protected readonly viewer = signal<{ start: number; play: boolean } | null>(null)
  protected readonly countText = computed(() => {
    const n = this.album()?.assets.length ?? 0
    return n === 1 ? this.texts.text('photosCountOne') : this.texts.text('photosCount', { n })
  })

  private albumId = ''
  // the page is on the screen (Ionic keeps it when the player comes over it - started from the app, for one); every
  // visit has its number: an answer that comes after the page was left belongs to no visit and is dropped
  private visible = false
  private visit = 0
  private leaving = false
  private checkTimer = 0
  private asking: Subscription | null = null
  /** "Album startet als Diashow": the slideshow of this visit is still to start (when the album has come) */
  private showPending = false

  constructor() {
    addIcons({ arrowBackOutline, playOutline })
    // the photo time is used up while the album shows: it fades out, back to the albums - the pause page there
    effect(() => {
      if (!this.time.blocked()) return
      untracked(() => {
        if (!this.visible || this.leaving || this.fading()) return
        this.fading.set(true)
        this.fadeTimer = window.setTimeout(() => this.back(), 400)
      })
    })
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.albumId = params.get('album') ?? ''
        this.direct.set(params.get('show') === '1')
        // (the first time the page's coming in asks - see ionViewWillEnter)
        if (this.visible) this.load(true)
      })
  }

  /**
   * The album from the box: when the page comes, and every 30 s while it shows - hidden in the app, deleted, the photo
   * display switched off: back to the albums; pictures added or deleted: the grid and the slideshow take the new list.
   */
  private load(first: boolean): void {
    const id = this.albumId
    const visit = this.visit
    this.asking?.unsubscribe()
    this.asking = this.photos
      .album(id)
      .pipe(catchError((err: { status?: number }) => of(err?.status === 404 ? null : undefined)))
      .subscribe((a) => {
        if (id !== this.albumId || visit !== this.visit || !this.visible || this.leaving) return
        // (no answer at all - the server restarts: it stays as it is, asked again in 30 s)
        if (a === undefined) return first && !this.album() ? this.back() : undefined
        if (!a || a.assets.length === 0) return this.back()
        const before = this.album()
        // (the same pictures - in the order "Zufällig" they come in another order each time: the grid stays as it is)
        const same = before?.id === a.id && before.title === a.title && sameIds(before.assets, a.assets)
        if (!same) this.album.set(a)
        // (the slideshow that starts at once: with the first answer of this visit that came - also when the one right
        // at the start failed and a later one came, the server restarting)
        if (this.showPending && !this.viewer()) this.viewer.set({ start: 0, play: true })
        this.showPending = false
      })
  }

  ionViewWillEnter(): void {
    this.visible = true
    this.leaving = false
    this.fading.set(false)
    this.time.albumOpen.set(true)
    this.time.shown.set(true)
    // (opened while the photos pause - an old page, a link: straight back to the albums)
    if (this.time.blocked()) {
      window.setTimeout(() => this.back())
      return
    }
    this.visit++
    this.showPending = this.direct()
    window.clearInterval(this.checkTimer)
    this.checkTimer = window.setInterval(() => this.load(false), 30_000)
    // asked at once: the first visit (nothing there yet), or back from the player - the album may have changed
    // meanwhile; the slideshow that started at once starts again with the answer
    this.load(true)
  }

  // (another page comes over this one: the full view goes - its slideshow and its timers do not run on below; a
  // question still on its way is dropped)
  ionViewWillLeave(): void {
    this.visible = false
    window.clearTimeout(this.fadeTimer)
    this.time.albumOpen.set(false)
    this.time.shown.set(false)
    this.time.viewer.set(null)
    this.visit++
    this.showPending = false
    window.clearInterval(this.checkTimer)
    this.asking?.unsubscribe()
    this.asking = null
    this.viewer.set(null)
  }

  ngOnDestroy(): void {
    window.clearInterval(this.checkTimer)
    window.clearTimeout(this.fadeTimer)
    if (this.visible) {
      this.time.albumOpen.set(false)
      this.time.viewer.set(null)
    }
    this.asking?.unsubscribe()
  }

  // (opened by hand - a picture, the slideshow: the one waiting to start at once is no longer wanted)
  protected openAt(i: number): void {
    this.showPending = false
    this.viewer.set({ start: i, play: false })
  }

  protected slideshow(): void {
    this.showPending = false
    this.viewer.set({ start: 0, play: true })
  }

  protected viewerClosed(): void {
    this.viewer.set(null)
    if (this.direct()) this.back()
  }

  protected back(): void {
    if (this.leaving) return
    this.leaving = true
    window.clearInterval(this.checkTimer)
    this.viewer.set(null)
    this.photos.backToTab.set(true)
    this.photos.refresh(true)
    if (this.outlet?.canGoBack()) this.nav.pop()
    else this.nav.navigateRoot('/home', { animationDirection: 'back' })
  }
}

const sameIds = (a: { id: string }[], b: { id: string }[]): boolean => {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((x) => x.id))
  return b.every((x) => ids.has(x.id))
}
