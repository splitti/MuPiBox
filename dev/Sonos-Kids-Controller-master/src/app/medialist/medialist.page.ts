import { ActivatedRoute, NavigationExtras, Router } from '@angular/router'
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit } from '@angular/core'
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
import { Media, MediaSorting } from '../media'

import { ActivityIndicatorService } from '../activity-indicator.service'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { AsyncPipe } from '@angular/common'
import { MediaService } from '../media.service'
import type { Monitor } from '../monitor'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'
import type { Subscription } from 'rxjs'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  imports: [
    AsyncPipe,
    MupiHatIconComponent,
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
export class MedialistPage implements OnInit {
  artist: Artist
  media: Media[] = []
  covers = {}
  monitor: Monitor
  activityIndicatorVisible = false
  private getMediaFromArtistSubscription?: Subscription

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private activityIndicatorService: ActivityIndicatorService,
  ) {
    this.route.queryParams.subscribe((_params) => {
      if (this.router.getCurrentNavigation()?.extras.state?.artist) {
        this.artist = this.router.getCurrentNavigation().extras.state.artist
      }
    })

    addIcons({ arrowBackOutline })
  }

  ngOnInit() {
    this.fetchMedia()

    // Retreive data through subscription above
    this.mediaService.publishArtistMedia()

    this.mediaService.monitor$.subscribe((monitor) => {
      this.monitor = monitor
    })
  }

  ngOnDestroy() {
    this.getMediaFromArtistSubscription?.unsubscribe()
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  coverClicked(clickedMedia: Media) {
    if (this.monitor?.monitor === 'On') {
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
  }

  mediaNameClicked(clickedMedia: Media) {
    if (this.monitor?.monitor === 'On') {
      this.playerService.sayText(clickedMedia.title)
    }
  }

  private fetchMedia(): void {
    // Method to fetch artwork for given media.
    const fetchArtwork = (media: Media[]): void => {
      for (const currentMedia of media) {
        this.artworkService.getArtwork(currentMedia).subscribe((url) => {
          this.covers[currentMedia.title] = url
        })
      }
    }

    const sortMedia = (coverMedia: Media, media: Media[], defaultSorting: MediaSorting): Media[] => {
      const sorting = coverMedia.sorting ?? defaultSorting
      switch (sorting) {
        case MediaSorting.AlphabeticalDescending:
          return media.sort((a, b) =>
            b.title.localeCompare(a.title, undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
          )
        case MediaSorting.ReleaseDateAscending:
          return media.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
        case MediaSorting.ReleaseDateDescending:
          return media.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
        default: // MediaList.Alphabetical.Ascending
          return media.sort((a, b) =>
            a.title.localeCompare(b.title, undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
          )
      }
    }

    const sliceMedia = (media: Media[], offsetByOne = false): Media[] => {
      if (this.artist.coverMedia?.aPartOfAll) {
        const min = Math.max(0, (this.artist.coverMedia?.aPartOfAllMin ?? 0) - (offsetByOne ? 1 : 0))
        const max =
          (this.artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(this.artist.albumCount)) - (offsetByOne ? 1 : 0)
        return media.slice(min, max + 1)
      }
      return media
    }

    const isShow =
      (this.artist.coverMedia.showid && this.artist.coverMedia.showid.length > 0) ||
      (this.artist.coverMedia.type === 'rss' && this.artist.coverMedia.id.length > 0)

    this.getMediaFromArtistSubscription = this.mediaService.getMediaFromArtist(this.artist).subscribe((media) => {
      // We need to sort first and then slice since this is the intuitive behavior.
      this.media = sliceMedia(
        sortMedia(
          this.artist.coverMedia,
          media,
          isShow ? MediaSorting.ReleaseDateDescending : MediaSorting.AlphabeticalAscending,
        ),
        !isShow,
      )
      fetchArtwork(this.media)
    })
  }
}
