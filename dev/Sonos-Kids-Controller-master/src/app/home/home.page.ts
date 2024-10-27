import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, Signal, WritableSignal, effect, signal } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'

import { CommonModule } from '@angular/common'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  timerOutline,
} from 'ionicons/icons'
import { type Observable, distinctUntilChanged, filter, lastValueFrom, map } from 'rxjs'
import { SwiperContainer } from 'swiper/element'
import { ActivityIndicatorService } from '../activity-indicator.service'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import type { CategoryType, Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import type { Network } from '../network'
import { PlayerService } from '../player.service'
import { LoadingComponent } from '../loading/loading.component'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    MupiHatIconComponent,
    LoadingComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
  ],
  standalone: true,
})
export class HomePage implements OnInit {
  protected artists: Artist[] = []
  protected media: Media[] = []
  protected covers = {}
  protected editButtonclickCount = 0
  protected editClickTimer = 0

  protected category: CategoryType = 'audiobook'

  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected needsUpdate = false

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private router: Router,
  ) {
    this.isOnline = toSignal(
      this.mediaService.network$.pipe(
        filter((network) => network.ip !== undefined),
        map((network) => network.onlinestate === 'online'),
      ),
    )
    effect(
      () => {
        console.log(`Online state changed to ${this.isOnline()}`)
        this.update()
      },
      { allowSignalWrites: true },
    )
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, cloudOutline, cloudOfflineOutline })
  }

  ngOnInit() {
    this.mediaService.setCategory(this.category)
    this.update()
  }

  ionViewWillEnter() {
    if (this.needsUpdate) {
      this.update()
    }
    // This is a fix for the scroll bar not showing the current location when using the back button
    // from the media list or admin page.
    ;(document.querySelector('swiper-container') as SwiperContainer).swiper?.update()
  }

  public categoryChanged(event: any): void {
    this.category = event.detail.value
    this.mediaService.setCategory(this.category)
    this.update()
  }

  private update(): void {
    this.isLoading.set(true)
    if (this.category === 'audiobook' || this.category === 'music' || this.category === 'other') {
      lastValueFrom(this.mediaService.fetchArtistData(this.category))
        .then((artists) => {
          this.isLoading.set(false)
          this.artists = artists

          for (const artist of this.artists) {
            this.artworkService.getArtistArtwork(artist.coverMedia).subscribe((url) => {
              this.covers[artist.name] = url
            })
          }
        })
        .catch((error) => console.error(error))
    } else {
      lastValueFrom(this.mediaService.fetchMediaData(this.category))
        .then((media) => {
          this.isLoading.set(false)
          this.media = media
          for (const currentMedia of media) {
            this.artworkService.getArtwork(currentMedia).subscribe((url) => {
              this.covers[currentMedia.title] = url
            })
          }
        })
        .catch((error) => console.error(error))
    }
    this.needsUpdate = false
  }

  artistCoverClicked(clickedArtist: Artist) {
    const navigationExtras: NavigationExtras = {
      state: {
        artist: clickedArtist,
        category: this.category,
      },
    }
    this.router.navigate(['/medialist'], navigationExtras)
  }

  mediaCoverClicked(clickedMedia: Media) {
    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    this.router.navigate(['/player'], navigationExtras)
  }

  editButtonPressed() {
    window.clearTimeout(this.editClickTimer)

    if (this.editButtonclickCount < 9) {
      this.editButtonclickCount++

      this.editClickTimer = window.setTimeout(() => {
        this.editButtonclickCount = 0
      }, 500)
    } else {
      this.editButtonclickCount = 0
      this.needsUpdate = true
      this.router.navigate(['/edit'])
    }
  }

  resume() {
    this.router.navigate(['/resume'])
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }
}
