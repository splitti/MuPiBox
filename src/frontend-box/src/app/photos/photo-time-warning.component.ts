import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { DisplayTextsService } from '../display-texts.service'
import { PhotoTimeService } from './photo-time.service'

/**
 * "Noch 5 Minuten Bilder" (handoff §8, 06_noch-5-minuten.png): top middle, over the album and the slideshow (it goes on),
 * gone by itself after 7 s.
 */
@Component({
  selector: 'mupi-photo-time-warning',
  template: `
    @if (time.warning(); as m) {
      <div class="ptw" [class.ptw-low]="low()" role="status">
        <span class="ptw-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></svg></span>
        <span>{{ text() }}</span>
      </div>
    }
  `,
  styles: `
    .ptw {
      position: fixed;
      top: 18px;
      left: 50%;
      z-index: 9100;
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
      white-space: nowrap;
      box-shadow: 0 4px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
      pointer-events: none;
      transform: translateX(-50%);
      animation: ptw-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    /* (the album's header, or the full view's buttons: below them - top only over a slideshow without buttons) */
    .ptw.ptw-low {
      top: 84px;
    }
    .ptw-ic {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--km-apricot, #f7b267);
    }
    .ptw-ic svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    @keyframes ptw-in {
      from {
        opacity: 0;
        transform: translate(-50%, -24px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoTimeWarningComponent {
  protected readonly time = inject(PhotoTimeService)
  private readonly texts = inject(DisplayTextsService)
  protected readonly low = computed(() => {
    const v = this.time.viewer()
    return v === null || v.controls
  })
  protected readonly text = computed(() => {
    const m = this.time.warning() ?? 0
    return m === 1 ? this.texts.text('photosWarnOne') : this.texts.text('photosWarn', { n: m })
  })
}
