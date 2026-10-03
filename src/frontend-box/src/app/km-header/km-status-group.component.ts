import { ChangeDetectionStrategy, Component } from '@angular/core'
import { PlaytimeChipComponent } from '../playtime-chip/playtime-chip.component'
import { StatusComponent } from '../status/status.component'

/**
 * km themes, right end of the header (design round 2, "Vorschlag C"): WiFi and battery in a 24 px row, the listening
 * time below it as a 32 px chip - both together 64 px high, on every page. Without a daily limit the chip is not there
 * and WiFi/battery sit in the middle. The whole group is the target of the long press that opens the settings (the
 * page binds it, see home.page.html); the chip has no tap of its own.
 */
@Component({
  selector: 'mupi-km-status-group',
  template: `
    <div class="km-status-group">
      <mupi-status></mupi-status>
      <mupi-playtime-chip [inline]="true"></mupi-playtime-chip>
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex: 0 0 auto;
    }
    .km-status-group {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 8px;
      height: 64px;
      -webkit-tap-highlight-color: transparent;
    }
  `,
  imports: [StatusComponent, PlaytimeChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmStatusGroupComponent {}
