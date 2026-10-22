import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core'
import { DisplayTextsService } from '../display-texts.service'

// The bar at the bottom while the lock screen stands back for the parents' settings (see parent-access.service.ts):
// the lock still holds, and when the lock screen comes back. body.mupi-parent-access gives the pages room for it
// (global.scss).
@Component({
  selector: 'mupi-parent-access-bar',
  template: `
    <div class="pa-bar" role="status">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span>{{ texts.text('parentAccessHint') }}</span>
    </div>
  `,
  styles: `
    .pa-bar {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 14px;
      z-index: 9998;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-radius: 16px;
      background: #1d2b36;
      color: #ffffff;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.25;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      pointer-events: none;
    }
    svg {
      flex: 0 0 auto;
      color: #f5b43c;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentAccessBarComponent {
  protected readonly texts = inject(DisplayTextsService)

  public constructor() {
    document.body.classList.add('mupi-parent-access')
    inject(DestroyRef).onDestroy(() => document.body.classList.remove('mupi-parent-access'))
  }
}
