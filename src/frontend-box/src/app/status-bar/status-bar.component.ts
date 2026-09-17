import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { IonIcon } from '@ionic/angular/standalone'
import { environment } from 'src/environments/environment'

import { registerLucideIcons } from '../icons/lucide-icons'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'

/** Number of quick taps on the status pill that open the settings ("secret menu"). */
const SETTINGS_TAP_COUNT = 10
/** Maximum pause between two taps for them to count as one sequence. */
const SETTINGS_TAP_GAP_MS = 500

/**
 * Floating status pill in the top right corner (online state + MuPiHAT battery).
 * The settings ("secret menu") open either by tapping the pill 10 times in quick
 * succession (the original MuPiBox gesture) or by a long press whose duration
 * comes from the box config (settingsAccessTimer).
 */
@Component({
  selector: 'mupi-status-bar',
  templateUrl: './status-bar.component.html',
  styleUrls: ['./status-bar.component.scss'],
  imports: [IonIcon, MupiHatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBarComponent {
  private settingsAccessTimerMs = 3000
  private settingsPressTimer = 0
  private settingsTapCount = 0
  private settingsTapTimer = 0

  protected isOnline: Signal<boolean>

  constructor(
    private mediaService: MediaService,
    private router: Router,
    private http: HttpClient,
  ) {
    registerLucideIcons()

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const configuredSeconds = config?.mupibox?.settingsAccessTimer
        if (typeof configuredSeconds === 'number' && configuredSeconds > 0) {
          this.settingsAccessTimerMs = configuredSeconds * 1000
        }
      },
      error: () => {
        // Keep default settingsAccessTimerMs if config could not be loaded.
      },
    })
  }

  /** Counts quick taps; the 10th tap within the gap opens the settings. */
  protected tapped(): void {
    window.clearTimeout(this.settingsTapTimer)
    this.settingsTapCount++

    if (this.settingsTapCount >= SETTINGS_TAP_COUNT) {
      this.settingsTapCount = 0
      this.openSettings()
      return
    }

    this.settingsTapTimer = window.setTimeout(() => {
      this.settingsTapCount = 0
    }, SETTINGS_TAP_GAP_MS)
  }

  protected pointerDown(): void {
    window.clearTimeout(this.settingsPressTimer)
    this.settingsPressTimer = window.setTimeout(() => {
      this.openSettings()
    }, this.settingsAccessTimerMs)
  }

  protected pointerUp(): void {
    window.clearTimeout(this.settingsPressTimer)
  }

  private openSettings(): void {
    window.clearTimeout(this.settingsPressTimer)
    window.clearTimeout(this.settingsTapTimer)
    this.settingsTapCount = 0
    this.router.navigate(['/settings'])
  }
}
