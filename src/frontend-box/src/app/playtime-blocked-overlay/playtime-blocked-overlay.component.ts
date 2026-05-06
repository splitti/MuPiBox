import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { hourglassOutline, moonOutline, musicalNotesOutline } from 'ionicons/icons'
import type { PlaybackBlockSource } from '../playtime.model'
import { PlaytimeService } from '../playtime.service'

interface OverlayContent {
  iconName: string
  heading: string
  subheading: string
}

@Component({
  selector: 'mupi-playtime-blocked',
  templateUrl: './playtime-blocked-overlay.component.html',
  styleUrls: ['./playtime-blocked-overlay.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaytimeBlockedOverlayComponent {
  private playtimeService = inject(PlaytimeService)

  protected readonly content: Signal<OverlayContent> = computed(() => {
    const s = this.playtimeService.status()
    if (s.enabled !== true) return DEFAULT_PLAYTIME_CONTENT
    return contentForBlock(s.blockSource, s.quiet.label)
  })

  constructor() {
    addIcons({ moonOutline, musicalNotesOutline, hourglassOutline })
  }
}

const DEFAULT_PLAYTIME_CONTENT: OverlayContent = {
  iconName: 'moon-outline',
  heading: 'Heute war genug Musik',
  subheading: "Morgen geht's weiter",
}

function contentForBlock(source: PlaybackBlockSource | null, quietLabel: string | undefined): OverlayContent {
  if (source === 'quiet') {
    if (quietLabel?.trim()) {
      return {
        iconName: 'hourglass-outline',
        heading: quietLabel,
        subheading: 'Bald gibt es wieder Musik',
      }
    }
    return {
      iconName: 'moon-outline',
      heading: 'Ruhezeit',
      subheading: 'Bald gibt es wieder Musik',
    }
  }
  return DEFAULT_PLAYTIME_CONTENT
}
