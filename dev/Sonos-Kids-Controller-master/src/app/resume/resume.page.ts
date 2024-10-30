import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, WritableSignal, signal } from '@angular/core'
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

import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { lastValueFrom } from 'rxjs'
import { ArtworkService } from '../artwork.service'
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
    AsyncPipe,
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
export class ResumePage implements OnInit {
  protected media: Media[] = []
  protected covers = {}
  protected isLoading: WritableSignal<boolean> = signal(false)

  public constructor(
    private router: Router,
    private http: HttpClient,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
  ) {
    addIcons({ arrowBackOutline })
  }

  public ngOnInit(): void {
    this.fetchResumeMedia()
  }

  protected coverClicked(clickedMedia: Media): void {
    // We need to set the original index (this comes from the mismatch between us editing the original
    // data in the player page but showing only the "active" data on this page).
    // This will not be needed once we filter "online" unavailable media in the frontend.
    lastValueFrom(this.http.get<Media[]>('http://localhost:8200/api/resume'))
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

  private fetchResumeMedia(): void {
    this.isLoading.set(true)
    lastValueFrom(this.mediaService.fetchActiveResumeData())
      .then((media) => {
        this.isLoading.set(false)
        this.media = media
        for (const currentMedia of this.media) {
          this.artworkService.getArtwork(currentMedia).subscribe((url) => {
            this.covers[currentMedia.title] = url
          })
        }
      })
      .catch((error) => console.error(error))
  }
}
