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
    return s.enabled === true && !s.blocked
  })

  protected readonly remainingMinutes: Signal<number> = computed(() => {
    const s = this.playtimeService.status()
    if (s.enabled !== true) return 0
    return Math.ceil(s.remainingSeconds / 60)
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
