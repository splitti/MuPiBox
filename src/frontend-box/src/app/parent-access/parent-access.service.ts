import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { filter } from 'rxjs'
import { environment } from '../../environments/environment'
import { LogService } from '../log.service'
import type { MupiboxConfig } from '../mupibox-config.model'

// The parents' way into the settings while playback is locked (quiet time, the day's limit): held on WiFi/battery of
// the lock screen - as on the start page - the lock screen stands back for the settings pages. Nothing plays meanwhile:
// the player keeps the lock (it refuses every start). Back on the start page (or anywhere else) the lock screen is
// there again, and also after 2 minutes without a touch.
@Injectable({ providedIn: 'root' })
export class ParentAccessService {
  private router = inject(Router)
  private http = inject(HttpClient)
  private log = inject(LogService)

  // the pages it opens (a path and what is below it: /wifi/add)
  private static readonly PAGES = ['/settings', '/wifi', '/bluetooth']
  private static readonly IDLE_MS = 2 * 60 * 1000

  /** the lock screen stands back for the settings */
  public readonly active = signal(false)
  /** how long WiFi/battery is held (ms): the same as on the start page (mupibox.settingsAccessTimer, s) */
  public holdMs = 3000

  private idleTimer: number | undefined

  public constructor() {
    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const seconds = config?.mupibox?.settingsAccessTimer
        if (typeof seconds === 'number' && seconds > 0) this.holdMs = seconds * 1000
      },
      error: () => {},
    })
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      if (this.active() && !ParentAccessService.allowed(e.urlAfterRedirects)) this.end()
    })
    // TEMPORARY (finger hold on the box): what a finger does - target, start, end or cancel, context menu
    const where = (e: Event) => {
      const t = e.target as Element | null
      return `${t?.tagName?.toLowerCase() ?? '?'}.${String(t?.getAttribute?.('class') ?? '').slice(0, 40)}`
    }
    let downAt = 0
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'contextmenu', 'touchstart', 'touchend', 'touchcancel']) {
      document.addEventListener(
        type,
        (e) => {
          const p = e as PointerEvent
          if (type.startsWith('pointer') && p.pointerType !== 'touch') return
          if (type === 'pointerdown' || type === 'touchstart') downAt = Date.now()
          this.log.log(`[touch-debug] ${type} ${where(e)} +${Date.now() - downAt} ms`)
        },
        { capture: true, passive: true },
      )
    }
    // (every touch on these pages starts the 2 minutes again)
    document.addEventListener('pointerdown', () => this.active() && this.restartIdle(), {
      capture: true,
      passive: true,
    })
  }

  private static allowed(url: string): boolean {
    const path = url.split(/[?#]/)[0]
    return ParentAccessService.PAGES.some((p) => path === p || path.startsWith(`${p}/`))
  }

  /** Held on WiFi/battery of the lock screen: the settings. */
  public open(): void {
    this.active.set(true)
    this.restartIdle()
    void this.router.navigate(['/settings'])
  }

  /** The lock screen again (left the settings, the lock ended, nothing touched for a while). */
  public end(): void {
    window.clearTimeout(this.idleTimer)
    this.active.set(false)
  }

  private restartIdle(): void {
    window.clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(() => {
      this.end()
      // (not the settings under the lock screen: once the lock ends, the box shows its start page)
      void this.router.navigate(['/home'])
    }, ParentAccessService.IDLE_MS)
  }
}
