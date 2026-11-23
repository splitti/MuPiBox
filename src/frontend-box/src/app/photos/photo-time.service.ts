import { HttpClient } from '@angular/common/http'
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core'
import { catchError, of } from 'rxjs'
import { environment } from 'src/environments/environment'
import { PlaytimeService } from '../playtime.service'
import { PhotoScreensaverService } from './photo-screensaver.service'

// how often the display tells the player that the photo time counts (the player stops counting 12 s after the last)
const BEAT_MS = 5_000
// photos looked at keep the box on up to so long after the last touch
const AWAKE_AFTER_TOUCH_MS = 5 * 60_000

/**
 * The photo time ("Bildzeit", 5.1, handoff §7/§8) on the display: it counts while an album is open - its grid, a
 * picture, the slideshow -, not in the choice of albums, not with the display off, not under the lock, not in the grid
 * untouched for the idle time set (the full view and the slideshow go on counting). The player counts (one account
 * with the listening time, and "shared" there); this says when, and shows what the player reports: the chip, the
 * warning, and whether the photos pause.
 */
@Injectable({ providedIn: 'root' })
export class PhotoTimeService {
  private readonly http = inject(HttpClient)
  private readonly playtime = inject(PlaytimeService)
  private readonly saver = inject(PhotoScreensaverService)

  /** an album is on the screen (the album page, shown) */
  readonly albumOpen = signal(false)
  /** the photos are on the screen: the tab "Fotos" or an album - the chip there is the photo time's */
  readonly shown = signal(false)
  /** the full view over the album (null: the grid) - and whether its buttons show */
  readonly viewer = signal<{ controls: boolean } | null>(null)

  readonly status = computed(() => this.playtime.status().photos ?? null)
  /** the own account is used up: the photos pause (the listening time's lock covers "shared") */
  readonly blocked = computed(() => this.status()?.state === 'blocked')
  /** the box locks (listening time used up, a quiet time, "Ruhe jetzt") or the display is off: a clip and a slideshow stop */
  readonly halted = computed(() => this.lockShown() || this.saver.monitorOff())
  private readonly lockShown = computed(() => {
    const p = this.playtime.status()
    return p.enabled === true && p.state === 'blocked'
  })

  // the grid open and untouched for the idle time set: the time stops until the next touch
  private lastTouch = Date.now()
  private readonly idle = signal(false)

  readonly counting = computed(
    () =>
      this.status() !== null &&
      this.albumOpen() &&
      !this.blocked() &&
      !this.lockShown() &&
      !this.saver.monitorOff() &&
      !(this.viewer() === null && this.idle()),
  )

  /** minutes left of the own account (null: no limit to show - none set, free today, or counted on the listening time) */
  readonly remainingMinutes = computed(() => {
    const s = this.status()
    if (!s || !s.limited || s.remainingSeconds === null) return null
    return Math.ceil(s.remainingSeconds / 60)
  })
  /** the chip of the photo time: on the photos' screens, not over a slideshow without buttons */
  readonly chipShown = computed(() => {
    const v = this.viewer()
    return this.shown() && this.remainingMinutes() !== null && !this.blocked() && (v === null || v.controls)
  })
  readonly warnLevel = computed(() => {
    const s = this.status()
    const m = this.remainingMinutes()
    return m !== null && (m <= 0 || (!!s && s.warnMinutes > 0 && m <= s.warnMinutes))
  })

  /** "Noch 5 Minuten Bilder": shown for 7 s once when the time left comes to the warning (minutes), else null */
  readonly warning = signal<number | null>(null)
  private warned = false
  private warnTimer = 0
  private beatTimer = 0

  constructor() {
    if (window.location.pathname.startsWith('/text-preview')) return
    for (const name of ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'wheel']) {
      document.addEventListener(
        name,
        () => {
          this.lastTouch = Date.now()
          if (this.idle()) this.idle.set(false)
        },
        { capture: true, passive: true },
      )
    }
    window.setInterval(() => {
      const pause = this.status()?.idlePauseSeconds ?? 0
      this.idle.set(pause > 0 && Date.now() - this.lastTouch >= pause * 1000)
    }, 1000)
    // the box stays on while photos are looked at (the switching off when idle counts only what plays): every minute,
    // while the photos are on the screen and touched within the last five minutes - a child that went away, a
    // slideshow left running, and the box switches off as before
    window.setInterval(() => {
      if (!this.shown() || this.saver.monitorOff() || Date.now() - this.lastTouch > AWAKE_AFTER_TOUCH_MS) return
      this.http
        .post(`${environment.backend.apiUrl}/photos/awake`, {})
        .pipe(catchError(() => of(null)))
        .subscribe()
    }, 60_000)
    // counting: the player is told at once and then every few seconds; when it stops (the album left, the display
    // off, the grid idle) at once too - its own 12 s after the last word are only for a display that went silent
    let was = false
    effect(() => {
      const on = this.counting()
      untracked(() => {
        window.clearInterval(this.beatTimer)
        if (!on) {
          if (was) this.beat(false)
          was = false
          return
        }
        was = true
        this.beat(true)
        this.beatTimer = window.setInterval(() => this.beat(true), BEAT_MS)
      })
    })
    // the warning: once when the time left comes to it while it counts; again after more time was given
    effect(() => {
      const s = this.status()
      const m = this.remainingMinutes()
      const on = this.counting()
      untracked(() => {
        if (!s || m === null || s.warnMinutes <= 0 || m > s.warnMinutes) {
          this.warned = false
          return
        }
        if (this.warned || !on || m <= 0) return
        this.warned = true
        this.warning.set(m)
        window.clearTimeout(this.warnTimer)
        this.warnTimer = window.setTimeout(() => this.warning.set(null), 7000)
      })
    })
    // (the photos pause, or the album was left: the warning goes)
    effect(() => {
      if (this.blocked() || !this.albumOpen()) untracked(() => this.warning.set(null))
    })
  }

  private beat(active: boolean): void {
    this.http
      .post(`${environment.backend.playerUrl}/photos/active`, { active })
      .pipe(catchError(() => of(null)))
      .subscribe()
  }
}
