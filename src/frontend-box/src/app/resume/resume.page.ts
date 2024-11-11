import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone'
import { catchError, lastValueFrom, of, switchMap, tap } from 'rxjs'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'

import { HttpClient } from '@angular/common/http'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import { Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'

@Component({
  selector: 'mupi-resume',
  templateUrl: './resume.page.html',
  styleUrls: ['./resume.page.scss'],
  standalone: true,
  imports: [
    MupiHatIconComponent,
    LoadingComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    SwiperComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumePage extends SwiperIonicEventsHelper {
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected media: Signal<Media[]>
  protected swiperData: Signal<SwiperData<Media>[]> = computed(() => {
    return this.media()?.map((media) => {
      return {
        name: media.title,
        imgSrc: this.artworkService.getArtwork(media),
        data: media,
      }
    })
  })

  public constructor(
    private router: Router,
    private http: HttpClient,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.media = toSignal(
      toObservable(this.isOnline).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap((_isOnline) => {
          return this.mediaService.fetchActiveResumeData().pipe(
            catchError((error) => {
              console.error(error)
              return of([])
            }),
          )
        }),
        tap(() => this.isLoading.set(false)),
      ),
    )
  }

  protected coverClicked(clickedMedia: Media): void {
    // We need to set the original index (this comes from the mismatch between us editing the original
    // data in the player page but showing only the "active" data on this page).
    // This will not be needed once we filter "online" unavailable media in the frontend.
    lastValueFrom(this.http.get<Media[]>(`${this.mediaService.getAPIBaseUrl()}/resume`))
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
