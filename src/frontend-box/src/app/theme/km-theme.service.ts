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
 * (stage view switched on in MuPi-Conf) and km-night (Tag & Nacht at night). coverflow: only cf (the round-2 parts in
 * its colours). Any other theme: no km class at all.
 */
@Injectable({ providedIn: 'root' })
export class KmThemeService {
  private readonly themeId = signal<string | undefined>(undefined)
  private readonly stageOn = signal(false)
  private readonly autoReadOn = signal(false)
  // the old plain themes: band behind the header / panel behind the player's controls (app › Appearance, on by default)
  private readonly headerBand = signal(true)
  private readonly playerPanel = signal(true)
  // Cover Flow: the top bar may be folded away by a two-finger swipe (app › Appearance, on by default)
  private readonly fullscreenGesturesOn = signal(true)
  private readonly night = signal(false)
  // theme "custom": its own settings (app › Theme › Eigenes) - light writing or dark, and the stylesheet's version
  private readonly custom = signal<{ light: boolean; v: number }>({ light: false, v: 0 })

  readonly theme = computed<KmTheme | undefined>(() => kmTheme(this.themeId()))
  readonly isKm = computed(() => this.theme() !== undefined)
  /** Andreas' "coverflow": its own look and cover band, no km theme - but the header, "Läuft gerade", the player,
   *  "Hören mit" and the track list of design round 2 in its colours (body.cf) */
  readonly isCoverflow = computed(() => this.themeId() === 'coverflow')
  /** the round-2 layout of header, player and track list: every km theme and coverflow */
  readonly roundTwo = computed(() => this.isKm() || this.isCoverflow())
  /** the full screen gestures of HeaderVisibilityService: only the Cover Flow theme, and only while switched on */
  readonly fullscreenGestures = computed(() => this.isCoverflow() && this.fullscreenGesturesOn())
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
    effect(() => this.applyCustomStylesheet())
  }

  /** Reads the theme settings again (at start, and when the parents' app changed the theme). */
  refresh(): void {
    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const m = config?.mupibox as
          | { theme?: string; themeStage?: boolean; themeStageAutoRead?: boolean; headerBand?: boolean; playerPanel?: boolean; fullscreenGestures?: boolean }
          | undefined
        this.themeId.set(m?.theme)
        const own = config?.mupibox?.customTheme
        this.custom.set({ light: own?.resolved === 'light', v: typeof own?.v === 'number' ? own.v : 0 })
        // (on unless switched off: the default since 5.0.8)
        this.stageOn.set(m?.themeStage !== false)
        this.autoReadOn.set(m?.themeStageAutoRead === true)
        this.headerBand.set(m?.headerBand !== false)
        this.playerPanel.set(m?.playerPanel !== false)
        this.fullscreenGesturesOn.set(m?.fullscreenGestures !== false)
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

  /** The own theme's settings (written by the backend next to the picture): only while "custom" is the theme. */
  private applyCustomStylesheet(): void {
    const id = 'km-custom-settings'
    const old = document.getElementById(id)
    if (this.themeId() !== 'custom') {
      old?.remove()
      return
    }
    const href = `/theme-data/custom/custom-settings.css?v=${this.custom().v}`
    if (old?.getAttribute('href') === href) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = href
    // after the theme's own stylesheet (it wins on equal weight); the old one goes once the new one is there
    link.onload = () => old?.remove()
    if (old) old.removeAttribute('id')
    document.head.appendChild(link)
  }

  private applyBodyClasses(): void {
    const body = document.body
    for (const cls of Array.from(body.classList)) {
      if (cls === 'km' || cls === 'cf' || cls.startsWith('km-')) body.classList.remove(cls)
    }
    if (this.isCoverflow()) body.classList.add('cf')
    const theme = this.theme()
    if (!theme) return
    body.classList.add('km', `km-theme-${theme.id}`)
    // an old theme of the box in the km layout: header band and player panel (design round 2, §7)
    if (theme.legacy) body.classList.add('km-legacy')
    // (switched off in the app - only where the theme allows it: its background stays calm behind the words)
    if (theme.legacy && theme.headerBandOptional && !this.headerBand()) body.classList.add('km-noband')
    if (theme.legacy && theme.playerPanelOptional && !this.playerPanel()) body.classList.add('km-nopanel')
    const night = this.night()
    if (theme.light && !(night && theme.dayNight && !theme.dayNight.lightAtNight)) body.classList.add('km-light')
    if (theme.id === 'custom' && this.custom().light) body.classList.add('km-light')
    if (this.stage()) body.classList.add('km-stage')
    if (night) body.classList.add('km-night')
  }
}

