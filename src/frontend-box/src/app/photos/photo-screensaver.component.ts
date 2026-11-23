import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core'
import { PhotoScreensaverService } from './photo-screensaver.service'
import { PhotosService } from './photos.service'

/**
 * The screensaver's slideshow (derived from the album's slideshow, handoff §6): picture after picture over the whole
 * display, fading in with a slight zoom, the background the same picture in its 32 px size - no buttons, only the time
 * small in a corner. A tap ends it; that tap reaches nothing below.
 */
@Component({
  selector: 'mupi-photo-screensaver',
  template: `
    <!-- (the tap and the swipe stay here: the document's gestures - back from the bottom edge, the header - do not see
         them; the screensaver's own watch of touches listens before, in the capture phase) -->
    <div
      class="ss"
      (pointerup)="leave()"
      (click)="$event.stopPropagation()"
      (touchstart)="$event.stopPropagation()"
      (touchmove)="$event.stopPropagation()"
      (touchend)="$event.stopPropagation()"
    >
      @for (s of slides(); track s.key) {
        <div class="ss-slide" [class.ss-in]="s.key > 0" [class.ss-alt]="s.key % 2 === 1" [style.--ss-hold]="saver.seconds() + 1.2 + 's'">
          <img class="ss-bg" [src]="photos.fileUrl(s.pic.album, s.pic.id, 'b')" alt="" draggable="false" />
          <img class="ss-fg" [src]="photos.fileUrl(s.pic.album, s.pic.id, 'f')" alt="" draggable="false" />
        </div>
      }
      <div class="ss-clock">{{ clock() }}</div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      /* over the pages and the album's full view, under the lock and the overlays for the parents */
      z-index: 5000;
      display: block;
      background: #000;
    }
    .ss {
      position: absolute;
      inset: 0;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .ss-slide {
      position: absolute;
      inset: 0;
      will-change: opacity, transform;
      animation: ss-zoom var(--ss-hold, 6.2s) linear both;
    }
    .ss-slide.ss-alt {
      animation-name: ss-zoom-alt;
    }
    .ss-slide.ss-in {
      animation: ss-fade 700ms ease-out both, ss-zoom var(--ss-hold, 6.2s) linear both;
    }
    .ss-slide.ss-in.ss-alt {
      animation-name: ss-fade, ss-zoom-alt;
    }
    @keyframes ss-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes ss-zoom {
      from {
        transform: scale(1) translate(0, 0);
      }
      to {
        transform: scale(1.08) translate(-1.5%, -1%);
      }
    }
    @keyframes ss-zoom-alt {
      from {
        transform: scale(1) translate(0, 0);
      }
      to {
        transform: scale(1.08) translate(1.5%, 1%);
      }
    }
    .ss-bg {
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
    .ss-fg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .ss-clock {
      position: absolute;
      right: 18px;
      bottom: 14px;
      z-index: 2;
      padding: 4px 14px;
      border-radius: 18px;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      font-size: 22px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoScreensaverComponent implements OnDestroy {
  protected readonly saver = inject(PhotoScreensaverService)
  protected readonly photos = inject(PhotosService)

  private readonly index = signal(0)
  // every new picture is a new slide (its fade and zoom start again); the one before stays below it for the fade
  private readonly key = signal(0)
  private readonly previous = signal<{ key: number; index: number } | null>(null)
  protected readonly slides = computed(() => {
    const list = this.saver.pictures()
    if (!list.length) return []
    const i = this.index() % list.length
    const cur = { key: this.key(), pic: list[i] }
    const prev = this.previous()
    return prev && list[prev.index] ? [{ key: prev.key, pic: list[prev.index] }, cur] : [cur]
  })
  protected readonly clock = signal(time())

  private advanceTimer = 0
  private dropTimer = 0
  private clockTimer = 0
  private leaving = false

  constructor() {
    this.schedule()
    this.preload()
    this.clockTimer = window.setInterval(() => this.clock.set(time()), 10_000)
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.advanceTimer)
    window.clearTimeout(this.dropTimer)
    window.clearInterval(this.clockTimer)
  }

  // (after this tap's click - it lands here and goes no further)
  protected leave(): void {
    if (this.leaving) return
    this.leaving = true
    window.setTimeout(() => this.saver.end(), 150)
  }

  private schedule(): void {
    window.clearTimeout(this.advanceTimer)
    if (this.saver.pictures().length < 2) return
    this.advanceTimer = window.setTimeout(() => {
      const n = this.saver.pictures().length
      if (n) this.show((this.index() + 1) % n)
      this.schedule()
    }, this.saver.seconds() * 1000)
  }

  private show(i: number): void {
    this.previous.set({ key: this.key(), index: this.index() })
    this.key.update((k) => k + 1)
    this.index.set(i)
    window.clearTimeout(this.dropTimer)
    this.dropTimer = window.setTimeout(() => this.previous.set(null), 750)
    this.preload()
  }

  private preload(): void {
    const list = this.saver.pictures()
    if (list.length < 2) return
    const next = list[(this.index() + 1) % list.length]
    for (const size of ['f', 'b'] as const) new Image().src = this.photos.fileUrl(next.album, next.id, size)
  }
}

const time = (): string => {
  const d = new Date()
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
