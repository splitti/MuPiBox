import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit } from '@angular/core'
import { CategoryType, Media, MediaSorting } from '../media'
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
import { NavigationExtras, Router } from '@angular/router'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { AsyncPipe } from '@angular/common'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { lastValueFrom } from 'rxjs'

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
  protected artist?: Artist
  protected category: CategoryType = 'audiobook'
  protected media: Media[] = []
  protected covers = {}
  protected activityIndicatorVisible = false

  constructor(
    private router: Router,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
  ) {
    this.artist = this.router.getCurrentNavigation()?.extras.state?.artist
    this.category = this.router.getCurrentNavigation()?.extras.state?.category ?? 'audiobook'

    addIcons({ arrowBackOutline })
  }

  ngOnInit() {
    this.fetchMedia()
  }

  coverClicked(clickedMedia: Media) {
    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    this.router.navigate(['/player'], navigationExtras)
  }

  mediaNameClicked(clickedMedia: Media) {
    this.playerService.sayText(clickedMedia.title)
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

    lastValueFrom(this.mediaService.fetchMediaFromArtist(this.artist, this.category))
      .then((media) => {
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
      .catch((error) => console.error(error))
  }
}
