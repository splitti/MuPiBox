import { Component, effect, inject, input } from '@angular/core'

import { IonSpinner } from '@ionic/angular/standalone'
import { KmThemeService } from '../theme/km-theme.service'

@Component({
  selector: 'mupi-loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  imports: [IonSpinner],
})
export class LoadingComponent {
  protected readonly loading = input.required<boolean>()
  protected readonly km = inject(KmThemeService).isKm

  // A list that has been loading for a minute is stuck (a request that never got an answer,
  // e.g. while the backend restarted). The kids' display has no way to recover from that, so
  // the page is loaded again - at most once every two minutes, so it can never loop.
  private static readonly GIVE_UP_AFTER_MS = 60 * 1000
  private static readonly MIN_TIME_BETWEEN_RELOADS_MS = 2 * 60 * 1000

  constructor() {
    effect((onCleanup) => {
      if (!this.loading()) {
        return
      }
      const timer = window.setTimeout(() => LoadingComponent.giveUp(), LoadingComponent.GIVE_UP_AFTER_MS)
      onCleanup(() => window.clearTimeout(timer))
    })
  }

  private static giveUp(): void {
    try {
      const last = Number(sessionStorage.getItem('mupiLoadingReload') ?? 0)
      if (Date.now() - last < LoadingComponent.MIN_TIME_BETWEEN_RELOADS_MS) {
        return
      }
      sessionStorage.setItem('mupiLoadingReload', String(Date.now()))
    } catch {
      // No storage: reload anyway.
    }
    window.location.reload()
  }
}
