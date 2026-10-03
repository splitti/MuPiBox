import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { timeOutline } from 'ionicons/icons'
import { PlaytimeService } from '../playtime.service'
import { KmThemeService } from '../theme/km-theme.service'

type ChipLevel = 'normal' | 'warning' | 'critical'

@Component({
  selector: 'mupi-playtime-chip',
  templateUrl: './playtime-chip.component.html',
  styleUrls: ['./playtime-chip.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaytimeChipComponent {
  private playtimeService = inject(PlaytimeService)
  private km = inject(KmThemeService).isKm
  /**
   * In the header's status group of a km theme (design round 2) instead of floating below the header: the app's own
   * chip (app.component) is then left out for km themes, the pages show this one.
   */
  readonly inline = input(false)

  protected readonly visible: Signal<boolean> = computed(() => {
    // (one chip at a time: km themes show the one in the header, the others the floating one)
    if (this.km() !== this.inline()) return false
    const s = this.playtimeService.status()
    // Show only when playtime is enabled AND nothing is restricting playback
    // (combined state is 'normal'). Quiet-only setups have no countdown to show.
    return s.enabled === true && s.playtime.enabled && s.state === 'normal'
  })

  protected readonly remainingMinutes: Signal<number> = computed(() => {
    const s = this.playtimeService.status()
    if (s.enabled !== true || !s.playtime.enabled) return 0
    return Math.ceil(s.playtime.remainingSeconds / 60)
  })

  protected readonly level: Signal<ChipLevel> = computed(() => {
    const m = this.remainingMinutes()
    // km themes: accent from 10 minutes, red below 5 (the design's steps)
    if (this.km()) return m < 5 ? 'critical' : m <= 10 ? 'warning' : 'normal'
    if (m < 10) return 'critical'
    if (m < 30) return 'warning'
    return 'normal'
  })

  constructor() {
    addIcons({ timeOutline })
  }
}
