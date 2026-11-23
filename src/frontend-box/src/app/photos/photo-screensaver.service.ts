import { HttpClient } from '@angular/common/http'
import { computed, inject, Injectable, signal } from '@angular/core'
import { catchError, firstValueFrom, of, timeout } from 'rxjs'
import { environment } from 'src/environments/environment'
import { isPlaying } from '../background-playback.service'
import type { CurrentMPlayer } from '../current.mplayer'
import { ParentAccessService } from '../parent-access/parent-access.service'
import { PlaytimeService } from '../playtime.service'

export interface SaverPicture {
  album: string
  id: string
}

interface SaverAnswer {
  enabled: boolean
  afterMinutes?: number
  duringPlayback?: boolean
  slideshowSeconds?: number
  pictures?: SaverPicture[]
}

// how often the box is asked for the settings and the pictures, and how often it is looked whether it is time
const ASK_MS = 60_000
const TICK_MS = 5_000

/**
 * The photo display's screensaver (5.1, Einstellungen › Fotoanzeige › Bildschirmschoner): a slideshow of the albums
 * shown on the display, when nobody has touched the box for the minutes set - only in silence, unless "Auch während
 * der Wiedergabe" is on. Not in a quiet time, not while the playtime lock shows, not over the photo albums, not while
 * the display is off. A touch ends it (that tap does nothing else). It brings no input of its own: the display goes
 * off as it always does, and with it the screensaver.
 */
@Injectable({ providedIn: 'root' })
export class PhotoScreensaverService {
  private readonly http = inject(HttpClient)
  private readonly playtime = inject(PlaytimeService)
  private readonly parentAccess = inject(ParentAccessService)

  private readonly answer = signal<SaverAnswer>({ enabled: false })
  readonly active = signal(false)
  /** the pictures of this run (taken when it starts: a list asked later does not jump in the middle) */
  readonly pictures = signal<SaverPicture[]>([])
  readonly seconds = computed(() => {
    const s = this.answer().slideshowSeconds
    return s === 8 || s === 5 || s === 3 ? s : 5
  })

  /** the display is off (app.component's poll of the box): no screensaver, a running one ends */
  readonly monitorOff = signal(false)

  private lastTouch = Date.now()
  private checking = false

  constructor() {
    // (the admin interface's preview of the display texts runs the same page in a frame: no screensaver there)
    if (window.location.pathname.startsWith('/text-preview')) return
    for (const name of ['pointerdown', 'touchstart', 'mousedown', 'mousemove', 'keydown', 'wheel']) {
      document.addEventListener(name, () => (this.lastTouch = Date.now()), { capture: true, passive: true })
    }
    this.ask()
    window.setInterval(() => this.ask(), ASK_MS)
    window.setInterval((): void => void this.tick(), TICK_MS)
  }

  /** A touch on the screensaver: it goes, the time without a touch starts again */
  end(): void {
    this.lastTouch = Date.now()
    this.active.set(false)
    this.pictures.set([])
  }

  private ask(): void {
    this.http
      .get<SaverAnswer>(`${environment.backend.apiUrl}/photos/screensaver`)
      .pipe(catchError(() => of(null)))
      .subscribe((a) => {
        // (no answer - the server restarts: what was there stays)
        if (!a) return
        this.answer.set(a)
        if (!this.active()) return
        if (!a.enabled) this.end()
        else this.follow()
      })
  }

  // a running screensaver asks after its own pictures (the list it got at its start is only a part of them when there
  // are many): hidden or deleted in the app meanwhile - they leave its list; none left, or switched off: it ends
  private follow(): void {
    const list = this.pictures()
    this.http
      .post<SaverAnswer>(`${environment.backend.apiUrl}/photos/screensaver/check`, { pictures: list })
      .pipe(catchError(() => of(null)))
      .subscribe((a) => {
        // (no answer: it goes on as it is; ended or started anew meanwhile: this answer is for no one)
        if (!a || !this.active() || this.pictures() !== list) return
        const kept = a.enabled ? (a.pictures ?? []) : []
        if (!kept.length) return this.end()
        if (kept.length !== list.length) this.pictures.set(kept)
      })
  }

  private async tick(): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      if (this.active()) {
        if (!(await this.allowed())) this.end()
        return
      }
      const a = this.answer()
      const minutes = a.afterMinutes ?? 5
      if (!a.enabled || Date.now() - this.lastTouch < minutes * 60_000) return
      if (!(await this.allowed())) return
      // the pictures as they are now (one deleted in the app since the last question would be a gap)
      const fresh = await firstValueFrom(
        this.http.get<SaverAnswer>(`${environment.backend.apiUrl}/photos/screensaver?list=1`).pipe(
          timeout(5000),
          catchError(() => of(null)),
        ),
      )
      if (fresh) this.answer.set({ ...fresh, pictures: undefined })
      const list = fresh?.enabled ? (fresh.pictures ?? []) : []
      // (touched meanwhile, or the display went off: not now)
      if (!list.length || Date.now() - this.lastTouch < minutes * 60_000 || !(await this.allowed())) return
      this.pictures.set(list)
      this.active.set(true)
    } finally {
      this.checking = false
    }
  }

  /** Whether the screensaver may show now (to start, and to go on) */
  private async allowed(): Promise<boolean> {
    const a = this.answer()
    if (!a.enabled || this.monitorOff() || this.parentAccess.active()) return false
    // (the page without a screen that keeps Spotify on a box without the DSI display - spotify_browser.sh: nobody looks at it)
    if (navigator.userAgent.includes('HeadlessChrome')) return false
    // the photo albums are open: they are what is looked at (and later counted) - no screensaver over them
    if (window.location.pathname.startsWith('/photos')) return false
    const p = this.playtime.status()
    if (p.enabled && (p.state === 'blocked' || (p.quiet?.enabled && p.quiet.inWindow))) return false
    // the picture time is used up: the photos pause - also here
    if (p.photos?.state === 'blocked') return false
    if (a.duringPlayback) return true
    return !(await this.playing())
  }

  // what the player says (Spotify through the display's own SDK included); no answer: as if something played - the
  // screensaver does not cover a player it cannot see
  private async playing(): Promise<boolean> {
    const now = await firstValueFrom(
      this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(
        timeout(3000),
        catchError(() => of(null)),
      ),
    )
    return now === null || isPlaying(now)
  }
}
