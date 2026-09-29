import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core'
import QRCode from 'qrcode'
import { DisplayTextsService } from '../display-texts.service'
import { ElternMagicLinkService } from '../eltern-magic-link.service'

// Full-screen overlay shown when a parent opens the Eltern-WebApp entry in
// the Settings page. Renders the magic-link QR (client-generated data URL)
// plus the URL as a text fallback. Auto-closes after 60s.
@Component({
  selector: 'mupi-eltern-magic-link-overlay',
  templateUrl: './eltern-magic-link-overlay.component.html',
  styleUrls: ['./eltern-magic-link-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
})
export class ElternMagicLinkOverlayComponent {
  protected readonly svc = inject(ElternMagicLinkService)
  protected readonly texts = inject(DisplayTextsService)
  // Preview of the admin interface (text-preview page): the overlay is shown with a sample QR code.
  public readonly preview = input(false)
  protected readonly previewUrl = `http://${location.hostname}/app`
  protected readonly previewQr = signal<string | null>(null)

  constructor() {
    effect(() => {
      if (this.preview()) void QRCode.toDataURL(this.previewUrl, { margin: 2, width: 320 }).then((url) => this.previewQr.set(url))
    })
    // pick up texts changed in the parents' web app since the box started
    effect(() => {
      if (this.svc.visible()) this.texts.refresh()
    })
  }
}
