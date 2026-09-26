import { HttpClient } from '@angular/common/http'
import { computed, effect, Injectable, signal } from '@angular/core'
import { environment } from '../../environments/environment'
import type { MupiboxConfig } from '../mupibox-config.model'
import { PlaytimeService } from '../playtime.service'
import { type KmTheme, kmTheme } from './km-themes'

/**
 * The km themes (see km-themes.ts): which one is active, the "Bühne" (stage) view and Tag & Nacht.
 *
 * The theme's stylesheet itself comes as before (active_theme.css); the parts of the km look that need their own
 * markup are switched on here by classes on <body>: km, km-theme-<id>, km-light (light background), km-stage
 * (stage view switched on in MuPi-Conf) and km-night (Tag & Nacht at night). Any other theme: no km class at all.
 */
@Injectable({ providedIn: 'root' })
export class KmThemeService {
  private readonly themeId = signal<string | undefined>(undefined)
  private readonly stageOn = signal(false)
  private readonly autoReadOn = signal(false)
  private readonly night = signal(false)

  readonly theme = computed<KmTheme | undefined>(() => kmTheme(this.themeId()))
  readonly isKm = computed(() => this.theme() !== undefined)
  /** the stage view (big cover in the middle) of a km theme */
  readonly stage = computed(() => this.isKm() && this.stageOn())
  /** read the name aloud when the stage stops on a cover */
  readonly stageAutoRead = computed(() => this.stage() && this.autoReadOn())

  constructor(
    private http: HttpClient,
    private playtime: PlaytimeService,
  ) {
    this.refresh()
    // Tag & Nacht: night between nightFrom and nightUntil, and during a quiet time
    setInterval(() => this.updateNight(), 60 * 1000)
    effect(() => {
      this.playtime.status()
      this.updateNight()
    })
    effect(() => this.applyBodyClasses())
  }

  /** Reads the theme settings again (at start, and when the parents' app changed the theme). */
  refresh(): void {
    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const m = config?.mupibox as { theme?: string; themeStage?: boolean; themeStageAutoRead?: boolean } | undefined
        this.themeId.set(m?.theme)
        this.stageOn.set(m?.themeStage === true)
        this.autoReadOn.set(m?.themeStageAutoRead === true)
        this.updateNight()
      },
      error: () => undefined,
    })
  }

  /** Picture for a title without a cover (instead of the default bear with headphones); Tag & Nacht: at night its own */
  readonly coverPlaceholder = computed(() => {
    const theme = this.theme()
    if (!theme) return ''
    return this.night() && theme.coverPlaceholderNight ? theme.coverPlaceholderNight : theme.coverPlaceholder
  })

  /** The mascot picture of the active km theme ('sleeping': playtime/quiet overlay, 'awake': not reachable, no cover). */
  kmMascot(state: 'sleeping' | 'awake'): string {
    const theme = this.theme()
    if (!theme) return ''
    const set = this.night() && theme.dayNight ? theme.dayNight.mascotNight : theme.mascot
    return set[state]
  }

  private updateNight(): void {
    const dayNight = this.theme()?.dayNight
    let night = false
    if (dayNight) {
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map((part) => Number.parseInt(part, 10))
        return (h || 0) * 60 + (m || 0)
      }
      const from = toMinutes(dayNight.nightFrom)
      const until = toMinutes(dayNight.nightUntil)
      night = from > until ? minutes >= from || minutes < until : minutes >= from && minutes < until
      if (!night && dayNight.alsoDuringQuietTime) {
        const status = this.playtime.status()
        night = status.enabled === true && status.quiet?.inWindow === true
      }
    }
    if (night === this.night()) return
    if (!document.body.classList.contains('km')) {
      this.night.set(night)
      return
    }
    // switch behind a short fade: 300 ms in, change, 300 ms out
    let fade = document.querySelector<HTMLElement>('.km-daynight-fade')
    if (!fade) {
      fade = document.createElement('div')
      fade.className = 'km-daynight-fade'
      document.body.appendChild(fade)
    }
    const layer = fade
    requestAnimationFrame(() => layer.classList.add('km-on'))
    setTimeout(() => {
      this.night.set(night)
      setTimeout(() => layer.classList.remove('km-on'), 50)
    }, 320)
  }

  private applyBodyClasses(): void {
    const body = document.body
    for (const cls of Array.from(body.classList)) {
      if (cls === 'km' || cls.startsWith('km-')) body.classList.remove(cls)
    }
    const theme = this.theme()
    if (!theme) return
    body.classList.add('km', `km-theme-${theme.id}`)
    const night = this.night()
    if (theme.light && !(night && theme.dayNight && !theme.dayNight.lightAtNight)) body.classList.add('km-light')
    if (this.stage()) body.classList.add('km-stage')
    if (night) body.classList.add('km-night')
  }
}

