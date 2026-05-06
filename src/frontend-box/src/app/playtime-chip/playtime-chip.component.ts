import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { timeOutline } from 'ionicons/icons'
import { PlaytimeService } from '../playtime.service'

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

  protected readonly visible: Signal<boolean> = computed(() => {
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
    if (m < 10) return 'critical'
    if (m < 30) return 'warning'
    return 'normal'
  })

  constructor() {
    addIcons({ timeOutline })
  }
}
