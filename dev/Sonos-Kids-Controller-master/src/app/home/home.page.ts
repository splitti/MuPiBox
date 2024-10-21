import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'

import { CommonModule } from '@angular/common'
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
import { SonosApiConfig } from '../sonos-api'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    MupiHatIconComponent,
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
  artists: Artist[] = []
  media: Media[] = []
  covers = {}
  activityIndicatorVisible = false
  editButtonclickCount = 0
  editClickTimer = 0

  protected category: CategoryType = 'audiobook'

  protected readonly network$: Observable<Network>
  protected readonly config$: Observable<SonosApiConfig>

  needsUpdate = false

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private activityIndicatorService: ActivityIndicatorService,
    private router: Router,
  ) {
    this.network$ = this.mediaService.network$
    this.config$ = this.playerService.getConfig()

    // If the network changes, we want to update our list.
    this.network$
      .pipe(
        filter((network) => network.ip !== undefined),
        map((network) => network.onlinestate),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((_) => {
        this.update()
      })
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

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  public categoryChanged(event: any): void {
    this.category = event.detail.value
    this.mediaService.setCategory(this.category)
    this.update()
  }

  private update(): void {
    if (this.category === 'audiobook' || this.category === 'music' || this.category === 'other') {
      lastValueFrom(this.mediaService.fetchArtistData(this.category))
        .then((artists) => {
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
    this.activityIndicatorService.create().then((indicator) => {
      this.activityIndicatorVisible = true
      indicator.present().then(() => {
        const navigationExtras: NavigationExtras = {
          state: {
            artist: clickedArtist,
            category: this.category,
          },
        }
        this.router.navigate(['/medialist'], navigationExtras)
      })
    })
  }

  mediaCoverClicked(clickedMedia: Media) {
    this.activityIndicatorService.create().then((indicator) => {
      this.activityIndicatorVisible = true
      indicator.present().then(() => {
        const navigationExtras: NavigationExtras = {
          state: {
            media: clickedMedia,
          },
        }
        this.router.navigate(['/player'], navigationExtras)
      })
    })
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

      this.activityIndicatorService.create().then((indicator) => {
        this.activityIndicatorVisible = true
        indicator.present().then(() => {
          this.router.navigate(['/edit'])
        })
      })
    }
  }

  resume() {
    this.router.navigate(['/resume'])
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }
}
