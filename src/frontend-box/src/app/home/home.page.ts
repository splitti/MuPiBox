import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone'
import { catchError, map, of, scan, switchMap, tap } from 'rxjs'
import { environment } from '../../environments/environment'

import type { Artist } from '../artist'
import { registerLucideIcons } from '../icons/lucide-icons'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { MediaRefreshReason, MediaRefreshService } from '../media-refresh.service'
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
  /** Shown when entries are still missing after the box retried on its own. */
  protected readonly mediaIncomplete: Signal<boolean>
  /** Categories the admin has hidden (Admin > Control system > Hide display categorys). */
  private hiddenCategories: WritableSignal<string[]> = signal([])
  private allSections: HomeSection[]
  protected sections = computed(() => this.allSections.filter((s) => !this.hiddenCategories().includes(s.category)))

  constructor(
    private mediaService: MediaService,
    private mediaRefresh: MediaRefreshService,
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

    this.mediaIncomplete = this.mediaRefresh.incomplete

    this.allSections = [
      this.createSection('audiobook', 'Hörspiele', 'lucide-headphones'),
      this.createSection('music', 'Musik', 'lucide-music'),
      this.createSection('other', 'Podcasts & Radio', 'lucide-podcast'),
    ]
  }

  /**
   * Builds the data pipeline for one category. Artists are (re)loaded on every
   * refresh: when the online state changes, when the box retries an incomplete load
   * and when someone presses the reload button.
   */
  private createSection(category: CategoryType, label: string, icon: string): HomeSection {
    const isLoading = signal(true)

    const artists = toSignal(
      this.mediaRefresh.refresh$.pipe(
        tap(() => isLoading.set(true)),
        switchMap((reason) =>
          this.mediaService.fetchArtistData(category).pipe(
            catchError((error) => {
              console.error(error)
              return of([] as Artist[])
            }),
            map((loaded) => ({ reason, loaded })),
          ),
        ),
        tap(() => isLoading.set(false)),
        // An automatic retry runs while a child may be looking at the page. If it
        // comes back empty (Spotify still unreachable) the tiles that are already
        // there stay - only a deliberate reload may empty a filled row.
        scan((previous: Artist[], { reason, loaded }: { reason: MediaRefreshReason; loaded: Artist[] }) => {
          if (reason === 'retry' && loaded.length === 0 && previous.length > 0) {
            return previous
          }
          return loaded
        }, [] as Artist[]),
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

  /** Reload button in the hint banner: fetch everything again right now. */
  protected reloadMedia(): void {
    this.mediaRefresh.reload()
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
