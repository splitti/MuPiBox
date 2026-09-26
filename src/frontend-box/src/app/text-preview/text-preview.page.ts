import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { fromEvent, map } from 'rxjs'
import { DisplayTextsService } from '../display-texts.service'
import { ElternMagicLinkOverlayComponent } from '../eltern-magic-link/eltern-magic-link-overlay.component'
import { PlaytimeBlockedOverlayComponent } from '../playtime-blocked-overlay/playtime-blocked-overlay.component'

// Shows one overlay of the box display (limit reached, quiet time, parents QR code) the way the box shows it, for the
// "Display texts" section of the admin interface: /text-preview?screen=blocked|quiet|parents, loaded in an 800x480
// frame. The admin page sends the texts while they are typed (postMessage), so the preview follows the input before
// anything is saved.
@Component({
  selector: 'mupi-text-preview',
  imports: [PlaytimeBlockedOverlayComponent, ElternMagicLinkOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (screen()) {
      @case ('parents') {
        <mupi-eltern-magic-link-overlay [preview]="true"></mupi-eltern-magic-link-overlay>
      }
      @case ('quiet') {
        <mupi-playtime-blocked preview="quiet"></mupi-playtime-blocked>
      }
      @default {
        <mupi-playtime-blocked preview="blocked"></mupi-playtime-blocked>
      }
    }
  `,
})
export class TextPreviewPage {
  private readonly texts = inject(DisplayTextsService)
  protected readonly screen = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('screen') ?? 'blocked')),
    { initialValue: 'blocked' },
  )

  public constructor() {
    fromEvent<MessageEvent>(window, 'message')
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((event) => {
        // only from the page that shows this preview, and only from the same host (the admin interface, port 80)
        if (event.source !== window.parent || event.source === window) return
        try {
          if (new URL(event.origin).hostname !== location.hostname) return
        } catch {
          return
        }
        const data = event.data as { type?: string; language?: unknown; texts?: Record<string, unknown> } | undefined
        if (data?.type === 'mupibox-display-texts') this.texts.applyPreview(data.language, data.texts)
      })
  }
}
