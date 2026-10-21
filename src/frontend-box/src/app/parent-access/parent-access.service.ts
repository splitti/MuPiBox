import { HttpClient } from '@angular/common/http'
import { computed, Injectable, inject, signal } from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { AlertController } from '@ionic/angular/standalone'
import { filter } from 'rxjs'
import { environment } from '../../environments/environment'
import { ElternMagicLinkService } from '../eltern-magic-link.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { PlaytimeService } from '../playtime.service'

// The parents' way into the settings while playback is locked (quiet time, the day's limit): held on WiFi/battery of
// the lock screen - as on the start page - the lock screen stands back for the settings pages. Nothing plays meanwhile:
// the player keeps the lock (it refuses every start). Back on the start page (or anywhere else) the lock screen is
// there again, and also after 2 minutes without a touch.
@Injectable({ providedIn: 'root' })
export class ParentAccessService {
  private router = inject(Router)
  private http = inject(HttpClient)
  private alerts = inject(AlertController)
  private magicLink = inject(ElternMagicLinkService)
  private playtime = inject(PlaytimeService)

  // the pages it opens (a path and what is below it: /wifi/add)
  private static readonly PAGES = ['/settings', '/wifi', '/bluetooth']
  private static readonly IDLE_MS = 2 * 60 * 1000

  /** the lock screen stands back for the settings */
  public readonly active = signal(false)
  /** how long WiFi/battery is held (ms): the same as on the start page (mupibox.settingsAccessTimer, s) */
  public holdMs = 3000

  private idleTimer: number | undefined

  /**
   * Locked and not (or no longer) in the parent access: what the settings offer must not act now - a restart / shut down
   * question still open after the 2 minutes (Ionic shows it above the lock screen) restarted the box without the parents.
   */
  public readonly lockedOut = computed(() => {
    const s = this.playtime.status()
    return s.enabled === true && s.state === 'blocked' && !this.active()
  })

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

  /**
   * The lock screen again (left the settings, the lock ended, nothing touched for a while). closeDialogs: what the settings
   * opened goes too - the restart / shut down question and the QR code for the app (a login) lay above the lock screen;
   * not when the lock itself ended (the parents may go on).
   */
  public end(closeDialogs = true): void {
    if (!this.active()) return
    window.clearTimeout(this.idleTimer)
    this.active.set(false)
    if (!closeDialogs) return
    this.magicLink.close()
    void (async () => {
      for (let top = await this.alerts.getTop(); top; top = await this.alerts.getTop()) {
        if (!(await top.dismiss())) break
      }
    })()
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
