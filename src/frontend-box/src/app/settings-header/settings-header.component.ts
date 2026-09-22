import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { IonIcon, IonRouterOutlet, NavController } from '@ionic/angular/standalone'

import { registerLucideIcons } from '../icons/lucide-icons'

/**
 * Header of the settings pages: round back button, page title and a slot on
 * the right for meta text or an action (content projection).
 */
@Component({
  selector: 'mupi-settings-header',
  templateUrl: './settings-header.component.html',
  styleUrls: ['./settings-header.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsHeaderComponent {
  public title = input.required<string>()
  /** Where to go when there is no page to pop back to. */
  public backHref = input('/settings')

  private readonly navController = inject(NavController)
  private readonly routerOutlet = inject(IonRouterOutlet, { optional: true })

  public constructor() {
    registerLucideIcons()
  }

  protected back(): void {
    if (this.routerOutlet?.canGoBack()) {
      this.navController.back()
    } else {
      this.navController.navigateBack(this.backHref())
    }
  }
}
