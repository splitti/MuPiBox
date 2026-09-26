import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { hourglass, hourglassOutline, moonOutline, musicalNotesOutline } from 'ionicons/icons'
import { DisplayTextsService } from '../display-texts.service'
import { PlaytimeService } from '../playtime.service'
import { KmThemeService } from '../theme/km-theme.service'

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
  private texts = inject(DisplayTextsService)
  private kmTheme = inject(KmThemeService)
  // Preview of the admin interface (text-preview page): shows this screen whatever the real state is.
  public readonly preview = input<'blocked' | 'quiet' | undefined>(undefined)
  protected readonly km = this.kmTheme.isKm
  protected readonly kmMascot = computed(() => this.kmTheme.kmMascot('sleeping'))
  // km themes: a quiet time or a parent's pause ("Zzz" badge) rather than the day's limit (hourglass)
  protected readonly kmQuiet = computed(() => {
    if (this.preview()) return this.preview() === 'quiet'
    const s = this.playtimeService.status()
    return s.enabled === true && (s.blockSource === 'quiet' || s.blockSource === 'override')
  })

  protected readonly content: Signal<OverlayContent> = computed(() => {
    const previewed = this.preview()
    if (previewed === 'blocked') {
      return {
        iconName: 'moon-outline',
        heading: this.texts.text('blockedHeading'),
        subheading: this.texts.text('blockedSubheading'),
      }
    }
    if (previewed === 'quiet') {
      return {
        iconName: 'moon-outline',
        heading: this.texts.text('quietHeading'),
        subheading: this.texts.text('quietSubheading'),
      }
    }
    const s = this.playtimeService.status()
    // 'override' is a pause set by a parent ("quiet now" in the web app / Telegram, for N minutes): it ends
    // soon, so it shows the quiet-time texts, not "that's enough for today".
    if (s.enabled !== true || (s.blockSource !== 'quiet' && s.blockSource !== 'override')) {
      return {
        iconName: 'moon-outline',
        heading: this.texts.text('blockedHeading'),
        subheading: this.texts.text('blockedSubheading'),
      }
    }
    // A quiet window with a label ("Bedtime", "Homework") shows that label as the heading.
    const label = s.blockSource === 'quiet' ? s.quiet.label?.trim() : undefined
    return {
      iconName: label ? 'hourglass-outline' : 'moon-outline',
      heading: label || this.texts.text('quietHeading'),
      subheading: this.texts.text('quietSubheading'),
    }
  })

  constructor() {
    addIcons({ moonOutline, musicalNotesOutline, hourglassOutline, hourglass })
    // created each time playback gets blocked: pick up texts changed in the meantime
    this.texts.refresh()
  }
}
