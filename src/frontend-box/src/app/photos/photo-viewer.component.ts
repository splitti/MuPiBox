import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
} from '@angular/core'
import { environment } from 'src/environments/environment'
import { isPlaying } from '../background-playback.service'
import { DisplayTextsService } from '../display-texts.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { PhotoTimeService } from './photo-time.service'
import { StatusComponent } from '../status/status.component'
import { type PhotoAsset, PhotosService } from './photos.service'

const SPEEDS = [8, 5, 3] as const
// a clip in the slideshow: up to this long it plays (silent) to its end, a longer one shows its picture
const CLIP_IN_SLIDESHOW = 30
// a picture zoomed in at most so far (its display size has 1280 px on the long side), and by a double tap
const MAX_ZOOM = 4
const DOUBLE_TAP_ZOOM = 2.5
// a picture that did not come: asked again after these pauses, then a button to try again
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000]
type Speed = (typeof SPEEDS)[number]

/**
 * A picture over the whole display, and the slideshow (handoff §6). The background is the same picture in its 32 px
 * size scaled up and darkened - never blurred live on the Pi. Only opacity and transform are animated.
 * Tap: buttons on/off · swipe: next / previous, round and round · double tap: zoom in there ↔ the whole picture again ·
 * two fingers: zoom (up to 4×) · zoomed in: one finger moves the picture (no swipe to the next one). Whole ↔ filling: its
 * button. A clip is not zoomed.
 */
@Component({
  selector: 'mupi-photo-viewer',
  imports: [StatusComponent],
  template: `
    <div class="pv" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="cancel($event)">
      @for (s of slides(); track s.key) {
        <div class="pv-slide" [class.pv-in]="s.fresh" [class.pv-zoom]="playing()" [class.pv-alt]="s.key % 2 === 1" [style.--pv-hold]="speed() + 1.2 + 's'">
          <img class="pv-bg" [src]="photos.fileUrl(albumId(), s.asset.id, 'b')" alt="" draggable="false" />
          @if (s.key === slideKey() && isClip(s.asset)) {
            <!-- a clip: with sound in the full view (silent while something plays), silent in the slideshow, to its end -->
            <video
              class="pv-fg pv-clip"
              [class.pv-fill]="fill()"
              [src]="photos.fileUrl(albumId(), s.asset.id, 'v')"
              [poster]="photos.fileUrl(albumId(), s.asset.id, 'f')"
              [muted]="playing() || audioPlays()"
              playsinline
              (loadeddata)="clipReady($event)"
              (play)="clipPaused.set(false)"
              (pause)="clipPaused.set(true)"
              (ended)="clipEnded()"
              (error)="clipEnded()"
            ></video>
          } @else {
            <img
              class="pv-fg"
              [class.pv-fill]="fill()"
              [class.pv-glide]="s.key === slideKey() && zoomGlide()"
              [style.transform]="s.key === slideKey() ? zoomCss() : null"
              [src]="photos.fileUrl(albumId(), s.asset.id, 'f') + (s.key === slideKey() && attempt() ? '?r=' + attempt() : '')"
              [attr.alt]="pictureLabel(s.index)"
              draggable="false"
              (error)="pictureFailed(s.key)"
              (load)="s.key === slideKey() && gaveUp.set(false)"
            />
          }
        </div>
      }

      @if (gaveUp()) {
        <!-- the picture did not come after its tries (a photo service away, a slow line): a tap tries again -->
        <button class="pv-btn pv-96 pv-retry" type="button" data-ui [attr.aria-label]="pictureLabel(index())" (click)="retryNow()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4.5V9h-4.5" /></svg>
        </button>
      }

      @if (playing()) {
        @for (k of [slideKey()]; track k) {
          <div class="pv-progress" [style.animation-duration.s]="speed()"></div>
        }
      }

      <div class="pv-ui" [class.pv-hidden]="!controls()">
        <div class="pv-shade-top"></div>
        <div class="pv-shade-bottom"></div>
        <div class="pv-top">
          <button class="pv-btn pv-64" type="button" data-ui [attr.aria-label]="texts.text(fromGrid() ? 'photosBackAlbum' : 'photosBackAlbums')" (click)="closed.emit()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div class="pv-count">{{ index() + 1 }} / {{ assets().length }}</div>
          <div class="pv-status" data-ui><mupi-status></mupi-status></div>
        </div>
        @if (clipShown() && !playing()) {
          <button class="pv-btn pv-96 pv-acc pv-clipbtn" type="button" data-ui [attr.aria-label]="texts.text(clipPaused() ? 'photosPlay' : 'photosPause')" (click)="clipToggle()">
            @if (clipPaused()) {
              <svg viewBox="0 0 24 24" aria-hidden="true" class="pv-solid"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" aria-hidden="true" class="pv-solid"><rect x="6.5" y="5" width="4" height="14" rx="1.5" /><rect x="13.5" y="5" width="4" height="14" rx="1.5" /></svg>
            }
          </button>
        }
        @if (assets().length > 1) {
          <button class="pv-btn pv-arrow pv-left" type="button" data-ui [attr.aria-label]="texts.text('photosPrev')" (click)="step(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button class="pv-btn pv-arrow pv-right" type="button" data-ui [attr.aria-label]="texts.text('photosNext')" (click)="step(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        }
        <div class="pv-bottom">
          <button class="pv-btn pv-64" type="button" data-ui [attr.aria-label]="speedLabel()" (click)="nextSpeed()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 17a8 8 0 1 1 16 0" />
              <path [attr.d]="needle()" />
              <circle cx="12" cy="17" r="1.6" class="pv-dot" />
            </svg>
          </button>
          <button class="pv-btn pv-96 pv-acc" type="button" data-ui [attr.aria-label]="texts.text(playing() ? 'photosPause' : 'photosPlay')" (click)="toggle()">
            @if (playing()) {
              <svg viewBox="0 0 24 24" aria-hidden="true" class="pv-solid"><rect x="6.5" y="5" width="4" height="14" rx="1.5" /><rect x="13.5" y="5" width="4" height="14" rx="1.5" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" aria-hidden="true" class="pv-solid"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
            }
          </button>
          <button class="pv-btn pv-64" type="button" data-ui [attr.aria-label]="texts.text(fill() ? 'photosFit' : 'photosFill')" (click)="fill.set(!fill())">
            @if (fill()) {
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            }
          </button>
        </div>
        @if (clipShown() && !playing() && !audioPlays()) {
          <!-- a clip with sound: the box's volume (the same as the player's) -->
          <div class="pv-vol" data-ui>
            <button class="pv-btn pv-64" type="button" data-ui [attr.aria-label]="texts.text('photosVolDown')" (click)="changeVolume(-1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" class="pv-solid" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" /></svg>
            </button>
            @if (volume() !== null) {
              <span class="pv-vol-n">{{ volume() }} %</span>
            }
            <button class="pv-btn pv-64" type="button" data-ui [attr.aria-label]="texts.text('photosVolUp')" (click)="changeVolume(1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5v5h3.5L11 18.5v-13L6.5 9.5H3z" class="pv-solid" /><path d="M14.5 9.5a3.5 3.5 0 0 1 0 5M17 7a7 7 0 0 1 0 10" /></svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: block;
      background: #000;
      /* WiFi and battery in white over the picture */
      --st-on: #fff;
    }
    .pv {
      position: absolute;
      inset: 0;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .pv-slide {
      position: absolute;
      inset: 0;
      will-change: opacity, transform;
    }
    .pv-slide.pv-in {
      animation: pv-fade 700ms ease-out both;
    }
    .pv-slide.pv-zoom {
      animation: pv-fade 700ms ease-out both, pv-zoom var(--pv-hold, 6.2s) linear both;
    }
    .pv-slide.pv-zoom:not(.pv-in) {
      animation: pv-zoom var(--pv-hold, 6.2s) linear both;
    }
    .pv-slide.pv-zoom.pv-alt {
      animation-name: pv-fade, pv-zoom-alt;
    }
    .pv-slide.pv-zoom.pv-alt:not(.pv-in) {
      animation-name: pv-zoom-alt;
    }
    @keyframes pv-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes pv-zoom {
      from {
        transform: scale(1) translate(0, 0);
      }
      to {
        transform: scale(1.08) translate(-1.5%, -1%);
      }
    }
    @keyframes pv-zoom-alt {
      from {
        transform: scale(1) translate(0, 0);
      }
      to {
        transform: scale(1.08) translate(1.5%, 1%);
      }
    }
    .pv-bg {
      position: absolute;
      inset: -4%;
      width: 108%;
      height: 108%;
      /* (Ionic caps every picture at 100 %: this one is larger on purpose, its blurry edge stays outside) */
      max-width: none;
      max-height: none;
      object-fit: cover;
      filter: brightness(0.5);
    }
    .pv-fg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .pv-fg.pv-fill {
      object-fit: cover;
    }
    /* a picture that did not come: in the middle, above the buttons' layer */
    .pv-retry {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 4;
    }
    .pv-retry:active {
      transform: translate(-50%, -50%) scale(0.9);
    }
    /* zoomed in or out by a double tap: it glides there (two fingers: it follows them at once) */
    .pv-fg.pv-glide {
      transition: transform 220ms ease-out;
    }
    .pv-progress {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 5px;
      width: 100%;
      background: var(--km-apricot, #f7b267);
      transform-origin: left center;
      animation: pv-grow linear both;
      z-index: 2;
    }
    @keyframes pv-grow {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }
    .pv-ui {
      position: absolute;
      inset: 0;
      z-index: 3;
      transition: opacity 300ms;
    }
    .pv-ui.pv-hidden {
      opacity: 0;
      pointer-events: none;
    }
    .pv-shade-top,
    .pv-shade-bottom {
      position: absolute;
      left: 0;
      right: 0;
      pointer-events: none;
    }
    .pv-shade-top {
      top: 0;
      height: 130px;
      background: linear-gradient(rgba(0, 0, 0, 0.55), transparent);
    }
    .pv-shade-bottom {
      bottom: 0;
      height: 170px;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
    }
    .pv-top {
      position: absolute;
      left: 14px;
      right: 14px;
      top: 4px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pv-count {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      height: 40px;
      line-height: 40px;
      padding: 0 18px;
      border-radius: 20px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 19px;
      font-weight: 600;
      white-space: nowrap;
    }
    .pv-status {
      margin-left: auto;
      height: 64px;
      display: flex;
      align-items: center;
    }
    .pv-btn {
      border: 0;
      padding: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--km-btn, var(--km-night-3, #3b3456));
      color: var(--km-on-btn, var(--km-cream, #fff6e5));
      box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
      -webkit-tap-highlight-color: transparent;
      transition: transform 150ms var(--km-spring, ease-out);
    }
    .pv-btn:active {
      transform: scale(0.9);
    }
    .pv-btn svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .pv-btn svg.pv-solid {
      fill: currentColor;
      stroke: none;
    }
    .pv-btn .pv-dot {
      fill: currentColor;
      stroke: none;
    }
    .pv-64 {
      flex: 0 0 64px;
      width: 64px;
      height: 64px;
    }
    .pv-64 svg {
      width: 30px;
      height: 30px;
    }
    .pv-96 {
      width: 96px;
      height: 96px;
    }
    .pv-96 svg {
      width: 40px;
      height: 40px;
    }
    .pv-acc {
      background: var(--km-apricot, #f7b267);
      color: var(--km-ink, #2b2240);
    }
    .pv-clipbtn {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
    .pv-clipbtn:active {
      transform: translate(-50%, -50%) scale(0.9);
    }
    .pv-arrow {
      position: absolute;
      top: 202px;
      width: 76px;
      height: 76px;
      box-shadow: 0 5px 0 rgba(0, 0, 0, 0.35);
    }
    .pv-arrow svg {
      width: 34px;
      height: 34px;
    }
    .pv-left {
      left: 14px;
    }
    .pv-right {
      right: 14px;
    }
    .pv-bottom {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 24px;
    }
    /* a clip with sound: the volume, at the bottom right */
    .pv-vol {
      position: absolute;
      right: 14px;
      bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pv-btn svg path.pv-solid {
      fill: currentColor;
      stroke: none;
    }
    .pv-vol-n {
      min-width: 56px;
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoViewerComponent implements OnDestroy {
  protected readonly photos = inject(PhotosService)
  protected readonly texts = inject(DisplayTextsService)
  private readonly time = inject(PhotoTimeService)
  private readonly player = inject(PlayerService)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly albumId = input.required<string>()
  readonly assets = input.required<PhotoAsset[]>()
  readonly start = input(0)
  /** start as a slideshow (the album's button, or the setting "Album startet als Diashow") */
  readonly autoplay = input(false)
  /** opened from the album's grid: back goes there; else back to the albums */
  readonly fromGrid = input(true)
  readonly closed = output<void>()

  protected readonly index = signal(0)
  protected readonly playing = signal(false)
  protected readonly fill = signal(false)
  protected readonly controls = signal(true)
  protected readonly speed = signal<Speed>(this.photos.slideshowSeconds() as Speed)
  // every change of the picture is a new slide (its fade and zoom start again); the one before stays below it for the
  // fade, then goes
  protected readonly slideKey = signal(0)
  private readonly previous = signal<{ key: number; index: number } | null>(null)
  protected readonly slides = computed(() => {
    const list = this.assets()
    if (list.length === 0) return []
    // (the album got fewer pictures while it is shown - deleted in the app: the last one there is)
    const i = Math.min(this.index(), list.length - 1)
    const cur = { key: this.slideKey(), index: i, asset: list[i], fresh: this.slideKey() > 0 }
    const prev = this.previous()
    return prev && list[prev.index]
      ? [{ key: prev.key, index: prev.index, asset: list[prev.index], fresh: false }, cur]
      : [cur]
  })

  // a clip: paused by its button; whether something plays on the box (then the clip is silent - checked every 5 s)
  protected readonly clipPaused = signal(false)
  protected readonly audioPlays = signal(false)
  /** the box's volume in percent (from the player; null: not known yet) - shown beside a clip's volume buttons */
  protected readonly volume = signal<number | null>(null)
  private audioTimer = 0
  private volumeTimer = 0
  // (in the slideshow only a short clip plays, to its end - a long one shows its picture there)
  protected isClip(a: PhotoAsset): boolean {
    return a.kind === 'video' && (!this.playing() || (a.duration ?? 0) <= CLIP_IN_SLIDESHOW)
  }
  protected readonly clipShown = computed(() => {
    const list = this.assets()
    const a = list[Math.min(this.index(), list.length - 1)]
    return !!a && this.isClip(a)
  })
  // a clip held: stopped by the lock or the display going off - it stays stopped until it is tapped on (also when it
  // is made anew meanwhile), no clip starts by itself under the lock
  private clipHold = false
  // a clip on the screen ready to play: it starts - not while the box is locked or the display is off, not when held
  protected clipReady(e: Event): void {
    const v = e.target as HTMLVideoElement
    if (this.time.halted() || this.clipHold) {
      v.pause()
      this.clipPaused.set(true)
      return
    }
    this.startClip(v)
  }
  // starts the clip on the screen; a start that fails goes on in the slideshow - not one broken off (the picture changed,
  // the clip went, it was paused while still loading): that one is no failure of this clip
  private startClip(v: HTMLVideoElement): void {
    const key = this.slideKey()
    void v.play().catch((err: unknown): void => {
      if (!v.isConnected || key !== this.slideKey()) return
      if ((err as DOMException | null)?.name === 'AbortError') {
        this.clipPaused.set(v.paused)
        return
      }
      if (this.playing()) this.clipEnded()
      else this.clipPaused.set(true)
    })
  }
  protected clipToggle(): void {
    const v = this.host.nativeElement.querySelector<HTMLVideoElement>('video.pv-clip')
    if (!v) return
    if (v.paused) {
      this.clipHold = false
      void v.play().catch((): void => undefined)
    } else v.pause()
    this.touched()
  }
  // the slideshow goes on when a clip has come to its end; in the full view it stays on its last picture
  protected clipEnded(): void {
    if (!this.playing()) return
    const n = this.assets().length
    if (n > 1) this.show((this.index() + 1) % n)
  }
  private async checkAudio(): Promise<void> {
    try {
      const r = await fetch(`${environment.backend.playerUrl}/local`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      const local = r.ok ? await r.json() : null
      this.audioPlays.set(!!local && isPlaying(local))
      const v = Number(local?.volume)
      if (Number.isFinite(v)) this.volume.set(Math.round(v))
    } catch {
      this.audioPlays.set(false)
    }
  }
  // louder or quieter by a step, as on the player's page (the box's volume, under its maximum); the new value shortly after
  protected changeVolume(dir: 1 | -1): void {
    this.player.sendCmd(dir > 0 ? PlayerCmds.VOLUMEUP : PlayerCmds.VOLUMEDOWN)
    this.touched()
    window.clearTimeout(this.volumeTimer)
    this.volumeTimer = window.setTimeout((): void => void this.checkAudio(), 400)
  }

  private advanceTimer = 0
  private hideTimer = 0
  private dropTimer = 0
  private tapTimer = 0
  private lastTap = 0
  private started = false

  constructor() {
    // the box locks or the display goes off: the clip and the slideshow stop (tapped on again afterwards)
    effect(() => {
      if (!this.time.halted()) return
      untracked(() => {
        this.clipHold = true
        this.host.nativeElement.querySelector<HTMLVideoElement>('video.pv-clip')?.pause()
        if (this.playing()) this.pause()
      })
    })
    void this.checkAudio()
    this.audioTimer = window.setInterval((): void => void this.checkAudio(), 5000)
    // the photo time: the full view counts also untouched; its chip only with the buttons shown
    effect(() => {
      const controls = this.controls()
      untracked(() => this.time.viewer.set({ controls }))
    })
    effect(() => {
      // (once, when the inputs are there)
      if (this.started) return
      this.started = true
      const n = this.assets().length
      this.index.set(n ? Math.min(Math.max(0, this.start()), n - 1) : 0)
      this.speed.set(this.photos.slideshowSeconds() as Speed)
      if (this.autoplay()) this.play()
      this.preload()
    })
    // a new list of pictures (added or deleted in the app): the place stays within it, the slideshow goes on with it
    effect(() => {
      const n = this.assets().length
      untracked(() => {
        if (this.index() >= n) this.index.set(Math.max(0, n - 1))
        if (this.playing()) this.schedule()
      })
    })
  }

  ngOnDestroy(): void {
    window.clearInterval(this.audioTimer)
    window.clearTimeout(this.volumeTimer)
    this.time.viewer.set(null)
    window.clearTimeout(this.advanceTimer)
    window.clearTimeout(this.hideTimer)
    window.clearTimeout(this.dropTimer)
    window.clearTimeout(this.tapTimer)
    window.clearTimeout(this.retryTimer)
  }

  protected readonly speedLabel = computed(() =>
    this.texts.text('photosSpeed', {
      s: this.texts.text(this.speed() === 8 ? 'photosSlow' : this.speed() === 5 ? 'photosMedium' : 'photosFast'),
    }),
  )
  // the speedometer's needle: left, middle, right = slow, medium, fast
  protected readonly needle = computed(() => {
    const angle = this.speed() === 8 ? -55 : this.speed() === 5 ? 0 : 55
    const rad = ((angle - 90) * Math.PI) / 180
    return `M12 17L${(12 + 6 * Math.cos(rad)).toFixed(2)} ${(17 + 6 * Math.sin(rad)).toFixed(2)}`
  })

  protected pictureLabel(i: number): string {
    return this.texts.text('photosPicture', { n: i + 1 })
  }

  protected step(dir: 1 | -1): void {
    const n = this.assets().length
    if (n < 2) return
    this.show((this.index() + dir + n) % n)
    this.touched()
  }

  protected toggle(): void {
    if (this.playing()) this.pause()
    else this.play()
    this.touched()
  }

  protected nextSpeed(): void {
    const i = SPEEDS.indexOf(this.speed())
    this.speed.set(SPEEDS[(i + 1) % SPEEDS.length])
    if (this.playing()) this.schedule()
    this.touched()
  }

  private play(): void {
    this.clipHold = false
    this.playing.set(true)
    const v = this.host.nativeElement.querySelector<HTMLVideoElement>('video.pv-clip')
    if (v && this.clipShown()) {
      if (v.ended) v.currentTime = 0
      v.muted = true
      if (v.paused) this.startClip(v)
    }
    this.schedule()
    this.touched()
  }

  private pause(): void {
    this.playing.set(false)
    window.clearTimeout(this.advanceTimer)
    window.clearTimeout(this.hideTimer)
    this.controls.set(true)
  }

  private schedule(): void {
    window.clearTimeout(this.advanceTimer)
    if (!this.playing() || this.assets().length < 2) return
    if (this.clipShown()) return
    this.advanceTimer = window.setTimeout(() => {
      const n = this.assets().length
      this.show((this.index() + 1) % n)
      this.schedule()
    }, this.speed() * 1000)
  }

  private show(i: number): void {
    // (another picture: a clip on it starts by itself again - unless the box is locked; it comes whole, not zoomed)
    this.resetZoom()
    this.resetRetry()
    this.clipHold = false
    this.clipPaused.set(false)
    this.previous.set({ key: this.slideKey(), index: this.index() })
    this.slideKey.update((k) => k + 1)
    this.index.set(i)
    // (the one before goes when the new one has faded in)
    window.clearTimeout(this.dropTimer)
    this.dropTimer = window.setTimeout(() => this.previous.set(null), 750)
    if (this.playing()) this.schedule()
    this.preload()
  }

  private preload(): void {
    const n = this.assets().length
    if (n < 2) return
    const next = this.assets()[(this.index() + 1) % n]
    for (const size of ['f', 'b'] as const) new Image().src = this.photos.fileUrl(this.albumId(), next.id, size)
  }

  // the buttons go 4 s after the last touch while the slideshow plays; on pause they stay
  private touched(): void {
    window.clearTimeout(this.hideTimer)
    if (!this.playing()) return
    this.hideTimer = window.setTimeout(() => this.controls.set(false), 4000)
  }

  // ---------- a picture that does not come: tried again ----------
  /** the picture shown asked for anew (its address changes, the browser asks the box again) */
  protected readonly attempt = signal(0)
  /** it did not come after its tries: the button in the middle */
  protected readonly gaveUp = signal(false)
  private tries = 0
  private retryTimer = 0

  // (a photo service away for a moment, a slow line, a picture still being made: again after 1, 2, 4, 8 and 15 s)
  protected pictureFailed(key: number): void {
    if (key !== this.slideKey()) return
    window.clearTimeout(this.retryTimer)
    if (this.tries >= RETRY_DELAYS.length) {
      this.gaveUp.set(true)
      return
    }
    const wait = RETRY_DELAYS[this.tries++]
    this.retryTimer = window.setTimeout(() => {
      if (key === this.slideKey()) this.attempt.update((n) => n + 1)
    }, wait)
  }

  protected retryNow(): void {
    window.clearTimeout(this.retryTimer)
    this.gaveUp.set(false)
    this.tries = RETRY_DELAYS.length - 1
    this.attempt.update((n) => n + 1)
    this.touched()
  }

  private resetRetry(): void {
    window.clearTimeout(this.retryTimer)
    this.tries = 0
    this.attempt.set(0)
    this.gaveUp.set(false)
  }

  // ---------- zoom: two fingers, a double tap; zoomed in, one finger moves the picture ----------
  /** the zoom of the picture shown: its scale and its offset from the middle (px) */
  protected readonly zoom = signal({ z: 1, x: 0, y: 0 })
  /** a double tap: it glides there; two fingers: it follows them at once */
  protected readonly zoomGlide = signal(false)
  protected readonly zoomCss = computed(() => {
    const { z, x, y } = this.zoom()
    return z === 1 ? null : `translate(${x}px, ${y}px) scale(${z})`
  })
  private readonly zoomed = computed(() => this.zoom().z > 1)

  private box(): { cx: number; cy: number; w: number; h: number } {
    const r = this.host.nativeElement.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
  }

  // (the offset at most as far as the zoom adds on each side: no black beyond the picture's frame; zoomed in, the slideshow
  // pauses - it would take the picture away under the fingers)
  private setZoom(z: number, x: number, y: number, glide = false): void {
    const b = this.box()
    const s = Math.min(MAX_ZOOM, Math.max(1, z))
    const mx = ((s - 1) * b.w) / 2
    const my = ((s - 1) * b.h) / 2
    this.zoomGlide.set(glide)
    this.zoom.set(s <= 1.02 ? { z: 1, x: 0, y: 0 } : { z: s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) })
    if (this.zoomed() && this.playing()) this.pause()
  }

  private resetZoom(glide = false): void {
    this.pinch = null
    this.pan = null
    this.zoomGlide.set(glide)
    this.zoom.set({ z: 1, x: 0, y: 0 })
  }

  // ---------- gestures: tap, double tap, swipe, two fingers ----------
  protected tracking = false
  private startX = 0
  private startY = 0
  // the fingers on the screen (pointer → where) - two zoom
  private readonly fingers = new Map<number, { x: number; y: number }>()
  // zoomed or moved since the first finger came: no tap and no swipe when they go
  private gestured = false
  // two fingers: the zoom when they came, their distance and their middle (from the screen's middle)
  private pinch: { z: number; x: number; y: number; d: number; mx: number; my: number } | null = null
  // one finger moving the picture zoomed in: the offset when it began, and where the finger was
  private pan: { x: number; y: number; px: number; py: number } | null = null

  protected down(e: PointerEvent): void {
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.fingers.size === 1) {
      this.tracking = true
      this.gestured = false
      this.startX = e.clientX
      this.startY = e.clientY
      return
    }
    // a second finger on the picture (not on a button, not on a clip): zoom
    if (this.fingers.size === 2 && !this.clipShown() && !(e.target as HTMLElement).closest('[data-ui]')) {
      this.gestured = true
      window.clearTimeout(this.tapTimer)
      this.startPinch()
    }
  }

  private startPinch(): void {
    const [a, b] = [...this.fingers.values()]
    const m = this.box()
    const { z, x, y } = this.zoom()
    this.pan = null
    this.pinch = { z, x, y, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - m.cx, my: (a.y + b.y) / 2 - m.cy }
  }

  protected move(e: PointerEvent): void {
    const f = this.fingers.get(e.pointerId)
    if (!f) return
    f.x = e.clientX
    f.y = e.clientY
    const p = this.pinch
    if (p && this.fingers.size >= 2) {
      // (the point of the picture between the fingers stays between them)
      const [a, b] = [...this.fingers.values()]
      const m = this.box()
      const z = Math.min(MAX_ZOOM, Math.max(1, (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.d))
      const mx = (a.x + b.x) / 2 - m.cx
      const my = (a.y + b.y) / 2 - m.cy
      this.setZoom(z, mx - (z * (p.mx - p.x)) / p.z, my - (z * (p.my - p.y)) / p.z)
      return
    }
    if (this.fingers.size !== 1 || !this.tracking || !this.zoomed()) return
    if (!this.pan) {
      // (a tap's small wobble is no move)
      if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < 12) return
      const { x, y } = this.zoom()
      this.pan = { x, y, px: e.clientX, py: e.clientY }
      this.gestured = true
      window.clearTimeout(this.tapTimer)
    }
    this.setZoom(this.zoom().z, this.pan.x + e.clientX - this.pan.px, this.pan.y + e.clientY - this.pan.py)
  }

  protected cancel(e: PointerEvent): void {
    this.fingers.delete(e.pointerId)
    if (this.fingers.size) return
    this.tracking = false
    this.pinch = null
    this.pan = null
  }

  protected up(e: PointerEvent): void {
    this.fingers.delete(e.pointerId)
    if (this.gestured) {
      // (one of two fingers lifted: the other one moves the picture on; all gone: the zoom stays as it is)
      this.pinch = null
      const [f] = [...this.fingers.values()]
      const { x, y } = this.zoom()
      this.pan = f ? { x, y, px: f.x, py: f.y } : null
      if (!f) {
        this.tracking = false
        this.touched()
      }
      return
    }
    if (!this.tracking || this.fingers.size) return
    this.tracking = false
    // (a button's own tap)
    if ((e.target as HTMLElement).closest('[data-ui]')) {
      this.touched()
      return
    }
    const dx = e.clientX - this.startX
    const dy = e.clientY - this.startY
    // (zoomed in: no swipe - the finger moved the picture)
    if (!this.zoomed() && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      this.step(dx < 0 ? 1 : -1)
      return
    }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return
    const now = Date.now()
    if (now - this.lastTap < 300) {
      // double tap: zoomed in at that point - the tapped spot stays under the finger -, zoomed in already: the whole
      // picture again (the single tap waiting is dropped)
      window.clearTimeout(this.tapTimer)
      this.lastTap = 0
      if (this.zoomed()) this.resetZoom(true)
      else if (!this.clipShown()) {
        const m = this.box()
        const px = e.clientX - m.cx
        const py = e.clientY - m.cy
        this.setZoom(DOUBLE_TAP_ZOOM, px * (1 - DOUBLE_TAP_ZOOM), py * (1 - DOUBLE_TAP_ZOOM), true)
      }
      return
    }
    this.lastTap = now
    window.clearTimeout(this.tapTimer)
    this.tapTimer = window.setTimeout(() => {
      this.controls.set(!this.controls())
      if (this.controls()) this.touched()
    }, 300)
  }
}
