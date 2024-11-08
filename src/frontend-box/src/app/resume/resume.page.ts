import { CUSTOM_ELEMENTS_SCHEMA, Component, Signal, WritableSignal, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { catchError, lastValueFrom, map, of, switchMap, tap } from 'rxjs'

import { HttpClient } from '@angular/common/http'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { ArtworkService } from '../artwork.service'
import { IonicSliderWorkaround } from '../ionic-slider-workaround'
import { LoadingComponent } from '../loading/loading.component'
import { Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'

@Component({
  selector: 'mupi-resume',
  templateUrl: './resume.page.html',
  styleUrls: ['./resume.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
  ],
})
export class ResumePage extends IonicSliderWorkaround {
  protected covers = {}
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected media: Signal<Media[]>

  public constructor(
    private router: Router,
    private http: HttpClient,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
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
        map((media) => {
          for (const currentMedia of media) {
            this.artworkService.getArtwork(currentMedia).subscribe((url) => {
              this.covers[currentMedia.title] = url
            })
          }
          return media
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

  protected mediaNameClicked(clickedMedia: Media): void {
    this.playerService.sayText(clickedMedia.title)
  }
}
