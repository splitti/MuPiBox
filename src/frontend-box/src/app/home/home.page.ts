import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone'
import { catchError, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { registerLucideIcons } from '../icons/lucide-icons'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { PlayerService } from '../player.service'
import { StatusBarComponent } from '../status-bar/status-bar.component'
import { TileComponent } from '../tile/tile.component'

const NO_COVER = '../assets/images/nocover_mupi.png'

interface ArtistTile {
  artist: Artist
  imgSrc: string
}

/** One horizontally scrollable category block on the home page. */
interface HomeSection {
  category: CategoryType
  label: string
  isLoading: WritableSignal<boolean>
  tiles: Signal<ArtistTile[]>
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonIcon, IonSpinner, StatusBarComponent, TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected isOnline: Signal<boolean>
  protected sections: HomeSection[]

  constructor(
    private mediaService: MediaService,
    private playerService: PlayerService,
    private router: Router,
  ) {
    registerLucideIcons()

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.sections = [
      this.createSection('audiobook', 'Hörspiele'),
      this.createSection('music', 'Musik'),
      this.createSection('other', 'Podcasts & Radio'),
    ]
  }

  /**
   * Builds the data pipeline for one category. Artists are (re)loaded whenever the
   * online state changes, the same trigger the previous tab based home page used.
   */
  private createSection(category: CategoryType, label: string): HomeSection {
    const isLoading = signal(true)

    const artists = toSignal(
      toObservable(this.isOnline).pipe(
        tap(() => isLoading.set(true)),
        switchMap(() =>
          this.mediaService.fetchArtistData(category).pipe(
            catchError((error) => {
              console.error(error)
              return of([] as Artist[])
            }),
          ),
        ),
        tap(() => isLoading.set(false)),
      ),
      { initialValue: [] as Artist[] },
    )

    const tiles = computed(() =>
      artists().map((artist) => ({
        artist,
        imgSrc: artist.coverMedia?.artistcover || artist.coverMedia?.cover || artist.cover || NO_COVER,
      })),
    )

    return { category, label, isLoading, tiles }
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }

  protected async artistCoverClicked(artist: Artist, category: CategoryType): Promise<void> {
    // Check if this is a standalone playlist (playlist without artist)
    if (artist.coverMedia?.playlistid && !artist.coverMedia?.artist) {
      // This is a standalone playlist - start playback directly
      const navigationExtras: NavigationExtras = {
        state: {
          media: artist.coverMedia,
        },
      }
      this.router.navigate(['/player'], navigationExtras)
    } else {
      // This is a regular artist - navigate to medialist
      const navigationExtras: NavigationExtras = {
        state: {
          artist: artist,
          category: category,
        },
      }
      this.router.navigate(['/medialist'], navigationExtras)
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
