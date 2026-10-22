import { ChangeDetectionStrategy, Component } from '@angular/core'
import { StatusComponent } from '../status/status.component'

/**
 * km themes, right end of the header (design round 2, §1): WiFi and battery, without a surface, in the middle of the
 * 64 px line. The listening time is a chip of its own below the header (the app's playtime chip, "Vorschlag D"). On the
 * start page this is the target of the long press that opens the settings (bound by the page, see home.page.html).
 */
@Component({
  selector: 'mupi-km-status-group',
  template: `<div class="km-status-group"><mupi-status></mupi-status></div>`,
  styles: `
    :host {
      display: block;
      flex: 0 0 auto;
    }
    .km-status-group {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      height: 64px;
      -webkit-tap-highlight-color: transparent;
    }
    /* held (for the settings): a light surface around WiFi and battery in their colour */
    .km-status-group::before {
      content: '';
      position: absolute;
      inset: 6px -12px;
      border-radius: 26px;
      background: color-mix(in srgb, var(--st-on, currentColor) 16%, transparent);
      opacity: 0;
      transition: opacity 150ms ease-out;
      pointer-events: none;
    }
    :host(.km-holding) .km-status-group::before {
      opacity: 1;
    }
  `,
  imports: [StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmStatusGroupComponent {}
