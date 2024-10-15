import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit } from '@angular/core'
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router'
import type { Observable, Subscription } from 'rxjs'
import { Media, MediaSorting } from '../media'

import { AsyncPipe } from '@angular/common'
import { IonicModule } from '@ionic/angular'
import { ActivityIndicatorService } from '../activity-indicator.service'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { MediaService } from '../media.service'
import type { Monitor } from '../monitor'
import type { Mupihat } from '../mupihat'
import { PlayerService } from '../player.service'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  imports: [IonicModule, AsyncPipe],
})
export class MedialistPage implements OnInit {
  artist: Artist
  media: Media[] = []
  resumemedia: Media[] = []
  fromcategory = ''
  resume = false
  covers = {}
  monitor: Monitor
  mupihat: Mupihat
  activityIndicatorVisible = false
  aPartOfAllMedia: Media[] = []
  hat_active = false
  private getMediaFromResumeSubscription: Subscription
  private getMediaFromArtistSubscription?: Subscription
  public readonly mupihat$: Observable<Mupihat>

  slideOptions = {
    initialSlide: 0,
    slidesPerView: 3,
    autoplay: false,
    loop: false,
    freeMode: true,
    freeModeSticky: true,
    freeModeMomentumBounce: false,
    freeModeMomentumRatio: 1.0,
    freeModeMomentumVelocityRatio: 1.0,
  }

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
        if (this.router.getCurrentNavigation().extras.state?.resume === 'resume') {
          this.resume = true
        }
        if (this.router.getCurrentNavigation().extras.state?.category) {
          this.fromcategory = this.router.getCurrentNavigation().extras.state.category
        }
      }
    })
    this.mupihat$ = this.mediaService.mupihat$
  }

  ngOnInit() {
    this.playerService.getConfig().subscribe((config) => {
      this.hat_active = config.hat_active
    })

    this.fetchMedia()

    // Retreive data through subscription above
    this.mediaService.publishArtistMedia()
    this.mediaService.publishResume()
    //this.mediaService.updateRawResume();

    this.mediaService.monitor$.subscribe((monitor) => {
      this.monitor = monitor
    })
    this.mediaService.resume$.subscribe((resume) => {
      this.resumemedia = resume
    })
    this.mediaService.mupihat$.subscribe((mupihat) => {
      this.mupihat = mupihat
    })
  }

  ngOnDestroy() {
    if (this.getMediaFromResumeSubscription) {
      this.getMediaFromResumeSubscription.unsubscribe()
    }
    this.getMediaFromArtistSubscription?.unsubscribe()
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
    this.aPartOfAllMedia = []
  }

  coverClicked(clickedMedia: Media) {
    if (this.monitor?.monitor === 'On') {
      this.activityIndicatorService.create().then((indicator) => {
        this.activityIndicatorVisible = true
        clickedMedia.index = -1
        for (let i = 0; i < this.resumemedia.length; i++) {
          if (
            (this.resumemedia[i].id && this.resumemedia[i].id === clickedMedia.id) ||
            (this.resumemedia[i].playlistid && this.resumemedia[i].playlistid === clickedMedia.id)
          ) {
            clickedMedia.index = i
            break
          }
          if (
            this.resumemedia[i].artist === clickedMedia.artist &&
            this.resumemedia[i].id === clickedMedia.id &&
            clickedMedia.type === 'library'
          ) {
            clickedMedia.index = i
            break
          }
        }
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
      this.playerService.getConfig().subscribe((config) => {
        if (config.tts == null || config.tts.enabled === true) {
          this.playerService.say(clickedMedia.title)
        }
      })
    }
  }

  backButtonPressed() {
    if (this.resume) {
      this.mediaService.setCategory(this.fromcategory)
      this.resume = false
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

    if (this.resume) {
      this.getMediaFromResumeSubscription = this.mediaService.getMediaFromResume().subscribe((media) => {
        this.media = media
        fetchArtwork(this.media)
      })
    } else {
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
}
