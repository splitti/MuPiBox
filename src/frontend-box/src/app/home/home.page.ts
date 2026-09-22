import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone'
import { catchError, of, switchMap, tap } from 'rxjs'
import { environment } from '../../environments/environment'

import type { Artist } from '../artist'
import { registerLucideIcons } from '../icons/lucide-icons'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
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
  /** Lucide icon shown in the white badge in front of the title. */
  icon: string
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
  /** Categories the admin has hidden (Admin > Control system > Hide display categorys). */
  private hiddenCategories: WritableSignal<string[]> = signal([])
  private allSections: HomeSection[]
  protected sections = computed(() => this.allSections.filter((s) => !this.hiddenCategories().includes(s.category)))

  constructor(
    private mediaService: MediaService,
    private playerService: PlayerService,
    private router: Router,
    private http: HttpClient,
  ) {
    registerLucideIcons()

    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const hidden = config?.mupibox?.hiddenCategories
        if (Array.isArray(hidden)) {
          this.hiddenCategories.set(hidden)
        }
      },
      // Show all sections when the config could not be loaded.
      error: () => {},
    })

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.allSections = [
      this.createSection('audiobook', 'Hörspiele', 'lucide-headphones'),
      this.createSection('music', 'Musik', 'lucide-music'),
      this.createSection('other', 'Podcasts & Radio', 'lucide-podcast'),
    ]
  }

  /**
   * Builds the data pipeline for one category. Artists are (re)loaded whenever the
   * online state changes, the same trigger the previous tab based home page used.
   */
  private createSection(category: CategoryType, label: string, icon: string): HomeSection {
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

    return { category, label, icon, isLoading, tiles }
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }

  protected async artistCoverClicked(artist: Artist, category: CategoryType): Promise<void> {
    // NAS and local folders that hold tracks (not further folders) play right away, as do
    // standalone playlists that carry no artist.
    const isPlayableNasFolder = artist.coverMedia?.type === 'nas' && !artist.coverMedia.nasIsContainer
    const isPlayableLibraryFolder =
      artist.coverMedia?.type === 'library' && !!artist.coverMedia.libraryPath && !artist.coverMedia.libraryIsContainer
    if (
      isPlayableNasFolder ||
      isPlayableLibraryFolder ||
      (artist.coverMedia?.playlistid && !artist.coverMedia?.artist)
    ) {
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
        // NAS / local folder levels are identified by their folder path (see MedialistPage).
        queryParams:
          artist.coverMedia?.type === 'nas'
            ? { nas: artist.coverMedia.nasPath }
            : artist.coverMedia?.libraryPath
              ? { lib: artist.coverMedia.libraryPath }
              : undefined,
      }
      this.router.navigate(['/medialist'], navigationExtras)
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
