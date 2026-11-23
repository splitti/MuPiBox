import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { of, switchMap } from 'rxjs'
import { ArtworkService } from './artwork.service'
import { DisplayTextsService } from './display-texts.service'
import { TileTimeService } from './tile-time.service'

/**
 * A day's limit per tile (5.1): the bar at the top middle - "<tile> ist für heute vorbei" (a tap on a used-up tile, a
 * refused start, the end of what played of it) and "Noch 5 Minuten <tile>", with the tile's round cover; gone by itself
 * (see TileTimeService). As the photo time's warning (photo-time-warning.component.ts).
 */
@Component({
  selector: 'mupi-tile-time-notice',
  template: `
    @if (tile.notice(); as n) {
      <div class="ttn" [class.ttn-over]="n.kind === 'over'" role="status">
        <span class="ttn-ic">
          @if (cover()) {
            <img [src]="cover()" alt="" draggable="false" />
          }
          <span class="ttn-badge">
            @if (n.kind === 'over') {
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></svg>
            }
          </span>
        </span>
        <span class="ttn-text">{{ text() }}</span>
      </div>
    }
  `,
  styles: `
    .ttn {
      position: fixed;
      top: 18px;
      left: 50%;
      z-index: 9100;
      max-width: calc(100vw - 32px);
      height: 64px;
      padding: 0 26px 0 9px;
      display: flex;
      align-items: center;
      gap: 14px;
      border-radius: 32px;
      background: var(--km-cream, #fff6e5);
      color: var(--km-ink, #2b2240);
      font-size: 22px;
      font-weight: 600;
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
      pointer-events: none;
      transform: translateX(-50%);
      animation: ttn-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .ttn-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ttn-ic {
      position: relative;
      flex: none;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--km-apricot, #f7b267);
    }
    .ttn-ic img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    /* (the sign: in the circle without a cover, on its edge with one) */
    .ttn-badge {
      position: absolute;
      display: grid;
      place-items: center;
    }
    .ttn-ic img + .ttn-badge {
      right: -6px;
      bottom: -6px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--km-apricot, #f7b267);
      box-shadow: 0 0 0 2px var(--km-cream, #fff6e5);
    }
    .ttn-over .ttn-ic,
    .ttn-over .ttn-ic img + .ttn-badge {
      background: var(--km-rose, #f4a6b8);
    }
    .ttn-badge svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .ttn-ic img + .ttn-badge svg {
      width: 15px;
      height: 15px;
    }
    @keyframes ttn-in {
      from {
        opacity: 0;
        transform: translate(-50%, -24px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileTimeNoticeComponent {
  protected readonly tile = inject(TileTimeService)
  private readonly texts = inject(DisplayTextsService)
  private readonly artwork = inject(ArtworkService)

  private readonly media = computed(() => this.tile.notice()?.media ?? null)
  protected readonly cover = toSignal(
    toObservable(this.media).pipe(switchMap((m) => (m ? this.artwork.getArtistArtwork(m) : of('')))),
    { initialValue: '' },
  )

  protected readonly text = computed(() => {
    const n = this.tile.notice()
    if (!n) return ''
    if (n.kind === 'over') return this.texts.text('tileOver', { name: n.name })
    return n.minutes === 1
      ? this.texts.text('tileWarnOne', { name: n.name })
      : this.texts.text('tileWarn', { n: n.minutes ?? 5, name: n.name })
  })
}
