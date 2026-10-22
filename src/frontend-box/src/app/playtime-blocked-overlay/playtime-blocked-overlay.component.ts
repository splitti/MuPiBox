import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, Signal, signal } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { hourglass, hourglassOutline, moonOutline, musicalNotesOutline } from 'ionicons/icons'
import { DisplayTextsService } from '../display-texts.service'
import { ParentAccessService } from '../parent-access/parent-access.service'
import { PlaytimeService } from '../playtime.service'
import { StatusComponent } from '../status/status.component'
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
  imports: [IonIcon, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaytimeBlockedOverlayComponent {
  private playtimeService = inject(PlaytimeService)
  private texts = inject(DisplayTextsService)
  private kmTheme = inject(KmThemeService)
  private parentAccess = inject(ParentAccessService)
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
    // A quiet window with a name ("Bedtime", "Homework") shows that name as the heading - the heading of the quiet
    // time is that name (Spielzeit › Ruhezeiten); without one, and for a parent's pause, the language's text.
    const label = s.blockSource === 'quiet' ? s.quiet.label?.trim() : undefined
    return {
      iconName: label ? 'hourglass-outline' : 'moon-outline',
      heading: label || this.texts.text('quietHeading'),
      subheading: this.texts.text('quietSubheading'),
    }
  })

  // the time top left (hours:minutes, checked every few seconds)
  private readonly now = signal(new Date())
  protected readonly time = computed(() => {
    const d = this.now()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  // the box has not had the time from the network since it was switched on: the lock may come from the time it was
  // switched off (not in the preview of the admin interface)
  protected readonly clockNotSynced = computed(() => {
    if (this.preview()) return false
    const s = this.playtimeService.status()
    return s.enabled === true && s.clockSynced === false
  })
  protected readonly clockHint = computed(() => this.texts.text('clockNotSynced'))

  // held on WiFi/battery: the settings for the parents, after the time set for the start page. With a finger the
  // hold ended at once on the box (with the mouse it worked): the pointer is kept on the area now (a finger that rolls
  // a little left it), a long press opens no context menu, and only a real move (> 24 px) or lifting it ends the hold.
  private holdTimer: number | undefined
  private holdFrom: { x: number; y: number } | null = null
  // held: a light surface shows it
  protected readonly holding = signal(false)
  protected holdStart(e: PointerEvent): void {
    if (this.preview()) return
    try {
      ;(e.currentTarget as Element | null)?.setPointerCapture(e.pointerId)
    } catch {
      // (no capture: the hold still works while the finger stays on the area)
    }
    this.holdFrom = { x: e.clientX, y: e.clientY }
    this.holding.set(true)
    window.clearTimeout(this.holdTimer)
    this.holdTimer = window.setTimeout(() => {
      this.holdFrom = null
      this.holding.set(false)
      this.parentAccess.open()
    }, this.parentAccess.holdMs)
  }
  protected holdMove(e: PointerEvent): void {
    if (this.holdFrom && Math.hypot(e.clientX - this.holdFrom.x, e.clientY - this.holdFrom.y) > 24) this.holdEnd('moved')
  }
  protected holdEnd(_why: string): void {
    this.holdFrom = null
    this.holding.set(false)
    window.clearTimeout(this.holdTimer)
  }

  constructor() {
    addIcons({ moonOutline, musicalNotesOutline, hourglassOutline, hourglass })
    const tick = setInterval(() => this.now.set(new Date()), 5000)
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick)
      window.clearTimeout(this.holdTimer)
    })
    // created each time playback gets blocked: pick up texts changed in the meantime - and again while it is shown
    // (a quiet time lasts the night: a text changed in the app showed only at the next one, or after a restart)
    this.texts.refresh()
    const again = setInterval(() => this.texts.refresh(), 30000)
    inject(DestroyRef).onDestroy(() => clearInterval(again))
  }
}
