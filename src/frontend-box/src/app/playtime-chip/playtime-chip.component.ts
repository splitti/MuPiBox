import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { timeOutline } from 'ionicons/icons'
import { of, switchMap } from 'rxjs'
import { ArtworkService } from '../artwork.service'
import { PhotoTimeService } from '../photos/photo-time.service'
import { PlaytimeService } from '../playtime.service'
import { KmThemeService } from '../theme/km-theme.service'
import { TileTimeService } from '../tile-time.service'

type ChipLevel = 'normal' | 'warning' | 'critical'

@Component({
  selector: 'mupi-playtime-chip',
  templateUrl: './playtime-chip.component.html',
  styleUrls: ['./playtime-chip.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaytimeChipComponent {
  private playtimeService = inject(PlaytimeService)
  // (on the photos' screens the photo time's chip stands here instead)
  private photoTime = inject(PhotoTimeService)
  private tileTime = inject(TileTimeService)
  private artwork = inject(ArtworkService)
  // km themes and coverflow: the chip of design round 2
  protected readonly r2 = inject(KmThemeService).roundTwo

  // the listening time's seconds left, while it counts (null: no listening time limit, or it restricts already)
  private readonly playtimeSeconds: Signal<number | null> = computed(() => {
    const s = this.playtimeService.status()
    // Only when playtime is enabled AND nothing is restricting playback (combined state is 'normal'). Quiet-only
    // setups have no countdown to show.
    return s.enabled === true && s.playtime.enabled && s.state === 'normal' ? s.playtime.remainingSeconds : null
  })

  // A day's limit per tile (5.1): the chip shows what ends first - the tile that plays when its minutes end before the
  // listening time (also without a listening time limit), with its round cover in place of the clock; only while that
  // tile is open (its albums, its player), not on the start page
  protected readonly tile = computed(() => {
    const t = this.tileTime.shown()
    if (!t) return null
    const p = this.playtimeSeconds()
    return p === null || t.remainingSeconds < p ? t : null
  })
  protected readonly tileCover = toSignal(
    toObservable(computed(() => this.tile()?.media ?? null)).pipe(
      switchMap((m) => (m ? this.artwork.getArtistArtwork(m) : of(''))),
    ),
    { initialValue: '' },
  )

  // (on the photos' screens - the tab "Fotos", an album, its full view - the listening time is no matter: hidden there,
  // also when the photos have no time of their own. Only when they count on the listening time ("Bildzeit" shared) it
  // is the time they use, and it stays.)
  private readonly photosOwnTime = computed(() => this.photoTime.shown() && this.photoTime.status()?.mode !== 'shared')

  protected readonly visible: Signal<boolean> = computed(
    () => (this.playtimeSeconds() !== null || this.tile() !== null) && !this.photoTime.chipShown() && !this.photosOwnTime(),
  )

  protected readonly remainingMinutes: Signal<number> = computed(() => {
    const seconds = this.tile()?.remainingSeconds ?? this.playtimeSeconds() ?? 0
    return Math.ceil(seconds / 60)
  })

  protected readonly level: Signal<ChipLevel> = computed(() => {
    const m = this.remainingMinutes()
    // km themes: accent from 10 minutes, red below 5 (the design's steps)
    if (this.r2()) return m < 5 ? 'critical' : m <= 10 ? 'warning' : 'normal'
    if (m < 10) return 'critical'
    if (m < 30) return 'warning'
    return 'normal'
  })

  constructor() {
    addIcons({ timeOutline })
  }
}
