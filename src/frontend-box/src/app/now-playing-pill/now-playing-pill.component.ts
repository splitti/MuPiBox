import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { of, switchMap } from 'rxjs'
import { ArtworkService } from '../artwork.service'
import { BackgroundPlaybackService } from '../background-playback.service'
import { DisplayTextsService } from '../display-texts.service'
import { KmThemeService } from '../theme/km-theme.service'

type PillState = 'playing' | 'paused' | 'loading' | 'radio'

/**
 * "Läuft gerade" (design round 2, §2): the player made small, as a pill in the header next to the categories - while
 * something plays on after the player page was left (settings "Zurück im Player": minimise). A tap opens the player
 * again (it does not start anew), the round button stops. km themes and coverflow; not there while nothing plays.
 */
@Component({
  selector: 'mupi-now-playing-pill',
  templateUrl: './now-playing-pill.component.html',
  styleUrls: ['./now-playing-pill.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NowPlayingPillComponent {
  private readonly background = inject(BackgroundPlaybackService)
  private readonly router = inject(Router)
  private readonly artwork = inject(ArtworkService)
  private readonly r2 = inject(KmThemeService).roundTwo
  protected readonly texts = inject(DisplayTextsService)
  protected readonly stopping = signal(false)

  protected readonly visible = computed(() => this.r2() && this.background.media() !== null)

  protected readonly kind = computed<'cover' | 'radio' | 'podcast'>(() => {
    const media = this.background.media()
    if (media?.type === 'radio') return 'radio'
    if (media?.type === 'rss' || media?.showid) return 'podcast'
    return 'cover'
  })

  protected readonly state = computed<PillState>(() => {
    const now = this.background.now()
    if (now?.loading === true) return 'loading'
    if (this.kind() === 'radio') return 'radio'
    if (now?.pause === true) return 'paused'
    return 'playing'
  })

  /** The track that plays now, else the album or station the page was started with. */
  protected readonly title = computed(() => {
    const now = this.background.now()
    const media = this.background.media()
    return now?.currentTrackname || now?.album || media?.title || media?.artist || ''
  })

  protected readonly cover = toSignal(
    toObservable(this.background.media).pipe(switchMap((media) => (media && media.type !== 'radio' ? this.artwork.getArtwork(media) : of('')))),
    { initialValue: '' },
  )

  /** Back to the player page: it was left running, so it must not start the media again. */
  protected open(): void {
    const media = this.background.media()
    if (!media) return
    void this.router.navigate(['/player'], { state: { media, externalPlayback: true } })
  }

  protected async stop(event: Event): Promise<void> {
    event.stopPropagation()
    if (this.stopping()) return
    this.stopping.set(true)
    try {
      await this.background.stop()
    } finally {
      this.stopping.set(false)
    }
  }
}
