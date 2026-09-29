import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { cloudOfflineOutline } from 'ionicons/icons'
import { DisplayTextsService } from '../display-texts.service'
import { KmThemeService } from '../theme/km-theme.service'

// One picture for a whole list whose content could not be loaded (NAS not reachable, radio stations and
// podcasts without a connection) - instead of a broken tile per station or podcast. It covers the list.
// km themes: the theme's mascot (awake) with a cloud badge and a short text on the theme's background.
@Component({
  selector: 'mupi-media-unavailable',
  template: `
    @if (km()) {
      <div class="km-unavail">
        <div class="km-mascot-small"><img [src]="mascot()" alt="" /><ion-icon name="cloud-offline-outline"></ion-icon></div>
        <div class="km-unavail-text">{{ displayTexts.text(nas() ? 'nasUnavailable' : 'offlineLabel') }}</div>
      </div>
    } @else {
      <img src="assets/images/media-unavailable.webp" alt="The media could not be loaded" />
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 40; /* below the loading spinner (50) */
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #0d0d0d;
      }
      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      :host-context(body.km) {
        background: transparent;
      }
      /* 62 px round: ion-icon keeps box-sizing content-box (!important), so 32 + 2 × 11 padding + 2 × 4 border */
      :host-context(body.km) .km-mascot-small ion-icon {
        width: 32px;
        height: 32px;
        padding: 11px;
        border-radius: 50%;
      }
    `,
  ],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaUnavailableComponent {
  /** a NAS list (else: radio / podcasts without a connection) - only the km themes say which */
  public readonly nas = input(false)
  private readonly kmTheme = inject(KmThemeService)
  protected readonly km = this.kmTheme.isKm
  protected readonly mascot = computed(() => this.kmTheme.kmMascot('awake'))
  protected readonly displayTexts = inject(DisplayTextsService)

  constructor() {
    addIcons({ cloudOfflineOutline })
  }
}
