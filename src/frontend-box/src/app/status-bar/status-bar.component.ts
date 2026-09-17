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

/**
 * Floating status pill in the top right corner (online state + MuPiHAT battery).
 * A long press opens the settings, the duration comes from the box config.
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

  protected pointerDown(): void {
    window.clearTimeout(this.settingsPressTimer)
    this.settingsPressTimer = window.setTimeout(() => {
      this.router.navigate(['/settings'])
    }, this.settingsAccessTimerMs)
  }

  protected pointerUp(): void {
    window.clearTimeout(this.settingsPressTimer)
  }
}
