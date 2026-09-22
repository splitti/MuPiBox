import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonContent, IonIcon } from '@ionic/angular/standalone'
import { catchError, lastValueFrom, map, of, scan, switchMap, tap } from 'rxjs'
import { environment } from 'src/environments/environment'

import { registerLucideIcons } from '../icons/lucide-icons'
import { LoadingComponent } from '../loading/loading.component'
import { Media } from '../media'
import { MediaService } from '../media.service'
import { MediaRefreshReason, MediaRefreshService } from '../media-refresh.service'
import { PlayerService } from '../player.service'
import { StatusBarComponent } from '../status-bar/status-bar.component'
import { TilePageItem, TilePagesComponent } from '../tile-pages/tile-pages.component'

const NO_COVER = '../assets/images/nocover_mupi.png'

/** "Weiterhören": the started media as a paged tile grid, laid out like the album view. */
@Component({
  selector: 'mupi-resume',
  templateUrl: './resume.page.html',
  styleUrls: ['./resume.page.scss'],
  imports: [IonContent, IonIcon, LoadingComponent, StatusBarComponent, TilePagesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumePage {
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected media: Signal<Media[]>
  protected items: Signal<TilePageItem<Media>[]>

  public constructor(
    private router: Router,
    private http: HttpClient,
    private mediaService: MediaService,
    private mediaRefresh: MediaRefreshService,
    private playerService: PlayerService,
  ) {
    registerLucideIcons()

    this.media = toSignal(
      this.mediaRefresh.refresh$.pipe(
        tap(() => this.isLoading.set(true)),
        switchMap((reason) => {
          return this.mediaService.fetchActiveResumeData().pipe(
            catchError((error) => {
              console.error(error)
              return of([] as Media[])
            }),
            map((loaded) => ({ reason, loaded })),
          )
        }),
        tap(() => this.isLoading.set(false)),
        // Keep what is on screen when an automatic retry comes back empty.
        scan((previous: Media[], { reason, loaded }: { reason: MediaRefreshReason; loaded: Media[] }) => {
          if (reason === 'retry' && loaded.length === 0 && previous.length > 0) {
            return previous
          }
          return loaded
        }, [] as Media[]),
      ),
      { initialValue: [] as Media[] },
    )

    this.items = computed(() =>
      this.media().map((media) => ({
        imgSrc: media.cover || NO_COVER,
        title: media.title,
        data: media,
      })),
    )
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }

  protected goBack(): void {
    this.router.navigate(['/home'])
  }

  protected coverClicked(clickedMedia: Media): void {
    // We need to set the original index (this comes from the mismatch between us editing the original
    // data in the player page but showing only the "active" data on this page).
    // This will not be needed once we filter "online" unavailable media in the frontend.
    lastValueFrom(this.http.get<Media[]>(`${environment.backend.apiUrl}/resume`))
      .then((resumemedia) => {
        clickedMedia.index = -1
        for (let i = 0; i < resumemedia.length; i++) {
          if (
            (resumemedia[i].id && resumemedia[i].id === clickedMedia.id) ||
            (resumemedia[i].playlistid && resumemedia[i].playlistid === clickedMedia.id)
          ) {
            clickedMedia.index = i
            break
          }
          if (
            resumemedia[i].artist === clickedMedia.artist &&
            resumemedia[i].id === clickedMedia.id &&
            clickedMedia.type === 'library'
          ) {
            clickedMedia.index = i
            break
          }
        }
        clickedMedia.category = 'resume'
        const navigationExtras: NavigationExtras = {
          state: {
            media: clickedMedia,
          },
        }
        this.router.navigate(['/player'], navigationExtras)
      })
      .catch((error) => console.error(error))
  }
}
