import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { DisplayTextsService } from '../display-texts.service'
import { PhotoTimeService } from './photo-time.service'

/**
 * The photo time's chip (handoff §7): on the photos' screens in place of the listening time's chip - a picture and
 * "20 min". Paused (the choice of albums, the grid untouched): the bar's colour and a pause mark; counting: the
 * buttons' colour and a pulsing dot; at the warning or 0: the accent.
 */
@Component({
  selector: 'mupi-photo-time-chip',
  template: `
    @if (time.chipShown()) {
      <div class="ptc" [attr.data-state]="state()" role="status" [attr.aria-label]="label()">
        @if (state() === 'running') {
          <i class="ptc-dot"></i>
        }
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17" /></svg>
        <span>{{ time.remainingMinutes() }} min</span>
        @if (state() === 'paused') {
          <svg class="ptc-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.5" /><rect x="13.5" y="5" width="4" height="14" rx="1.5" /></svg>
        }
      </div>
    }
  `,
  styles: `
    .ptc {
      position: fixed;
      /* where the listening time's chip stands (design round 2, "Vorschlag D") */
      top: 74px;
      right: 14px;
      z-index: 9000;
      height: 30px;
      padding: 0 11px 0 9px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 15px;
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      user-select: none;
      pointer-events: none;
      background: var(--km-night-2, rgba(0, 0, 0, 0.55));
      color: var(--km-on-bg, #fff);
      box-shadow: 0 3px 0 var(--km-shadow, rgba(0, 0, 0, 0.25));
    }
    .ptc[data-state='running'] {
      background: var(--km-btn, var(--km-night-3, #3b3456));
      color: var(--km-on-btn, var(--km-cream, #fff6e5));
    }
    .ptc[data-state='warn'] {
      background: var(--km-apricot, #f7b267);
      color: var(--km-ink, #2b2240);
    }
    .ptc svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .ptc svg circle {
      fill: currentColor;
      stroke: none;
    }
    .ptc .ptc-pause {
      width: 14px;
      height: 14px;
      opacity: 0.75;
      fill: currentColor;
      stroke: none;
    }
    .ptc-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--km-apricot, #f7b267);
      animation: ptc-pulse 1.6s ease-in-out infinite;
    }
    @keyframes ptc-pulse {
      50% {
        opacity: 0.35;
        transform: scale(0.8);
      }
    }
    /* (hidden while the player's "Hören mit" window is open, as the listening time's chip) */
    :host-context(body.kp-out-open) .ptc {
      visibility: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoTimeChipComponent {
  protected readonly time = inject(PhotoTimeService)
  private readonly texts = inject(DisplayTextsService)

  protected readonly state = computed(() => (this.time.warnLevel() ? 'warn' : this.time.counting() ? 'running' : 'paused'))
  protected readonly label = computed(() =>
    this.texts.text(this.time.counting() ? 'photosTimeRunning' : 'photosTimePaused', { n: this.time.remainingMinutes() ?? 0 }),
  )
}
