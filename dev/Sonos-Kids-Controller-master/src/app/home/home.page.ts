import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'

import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { IonicModule } from '@ionic/angular'
import type { Observable } from 'rxjs'
import { SwiperContainer } from 'swiper/element'
import { ActivityIndicatorService } from '../activity-indicator.service'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { Monitor } from '../monitor'
import type { Mupihat } from '../mupihat'
import type { Network } from '../network'
import { PlayerService } from '../player.service'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [CommonModule, FormsModule, IonicModule],
  standalone: true,
})
export class HomePage implements OnInit {
  category = 'audiobook'

  artists: Artist[] = []
  media: Media[] = []
  network: Network
  mupihat: Mupihat
  monitor: Monitor
  currentNetwork = ''
  updateNetwork = false
  covers = {}
  activityIndicatorVisible = false
  editButtonclickCount = 0
  editClickTimer = 0
  hat_active = false
  public readonly network$: Observable<Network>
  public readonly mupihat$: Observable<Mupihat>

  needsUpdate = false

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private activityIndicatorService: ActivityIndicatorService,
    private router: Router,
  ) {
    this.network$ = this.mediaService.network$
    this.mupihat$ = this.mediaService.mupihat$
    this.playerService.getConfig().subscribe((config) => {
      this.hat_active = config.hat_active
    })
  }

  ngOnInit() {
    this.mediaService.setCategory(this.category)

    this.mediaService.network$.subscribe((network) => {
      this.network = network
    })
    this.mediaService.mupihat$.subscribe((mupihat) => {
      this.mupihat = mupihat
    })
    this.mediaService.monitor$.subscribe((monitor) => {
      this.monitor = monitor
    })

    // Subscribe
    this.mediaService.getMedia().subscribe((media) => {
      this.media = media

      for (const currentMedia of media) {
        this.artworkService.getArtwork(currentMedia).subscribe((url) => {
          this.covers[currentMedia.title] = url
        })
      }
    })

    this.mediaService.getArtists().subscribe((artists) => {
      this.artists = artists
      for (const artist of this.artists) {
        this.artworkService.getArtistArtwork(artist.coverMedia).subscribe((url) => {
          this.covers[artist.name] = url
        })
      }
    })

    this.update()
  }

  ionViewWillEnter() {
    if (this.needsUpdate) {
      this.update()
    }
    this.updateNetwork = true
    this.checkNetwork()

    // This is a fix for the scroll bar not showing the current location when using the back button
    // from the media list or admin page.
    ;(document.querySelector('swiper-container') as SwiperContainer).swiper?.update()
  }

  checkNetwork() {
    if (this.network?.ip !== undefined) {
      if (this.network?.onlinestate !== this.currentNetwork) {
        this.currentNetwork = this.network?.onlinestate
        this.update()
      }
    }

    setTimeout(() => {
      if (this.updateNetwork) {
        this.checkNetwork()
      }
    }, 1000)
  }

  ionViewDidLeave() {
    this.updateNetwork = false
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  categoryChanged(event: any) {
    this.category = event.detail.value
    this.mediaService.setCategory(this.category)
    this.update()
  }

  update() {
    if (this.category === 'audiobook' || this.category === 'music' || this.category === 'other') {
      this.mediaService.publishArtists()
    } else {
      this.mediaService.publishMedia()
    }
    this.needsUpdate = false
  }

  artistCoverClicked(clickedArtist: Artist) {
    if (this.monitor?.monitor === 'On') {
      this.activityIndicatorService.create().then((indicator) => {
        this.activityIndicatorVisible = true
        indicator.present().then(() => {
          const navigationExtras: NavigationExtras = {
            state: {
              artist: clickedArtist,
            },
          }
          this.router.navigate(['/medialist'], navigationExtras)
        })
      })
    }
  }

  artistNameClicked(clickedArtist: Artist) {
    if (this.monitor?.monitor === 'On') {
      this.playerService.getConfig().subscribe((config) => {
        if (config.tts == null || config.tts.enabled === true) {
          this.playerService.say(clickedArtist.name)
        }
      })
    }
  }

  mediaCoverClicked(clickedMedia: Media) {
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
      this.playerService.getConfig().subscribe((config) => {
        if (config.tts == null || config.tts.enabled === true) {
          this.playerService.say(clickedMedia.title)
        }
      })
    }
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
    if (this.monitor?.monitor === 'On') {
      this.mediaService.setCategory('resume')
      this.activityIndicatorService.create().then((indicator) => {
        this.activityIndicatorVisible = true
        indicator.present().then(() => {
          const navigationExtras: NavigationExtras = {
            state: {
              resume: 'resume',
              category: this.category,
            },
          }
          this.router.navigate(['/medialist'], navigationExtras)
        })
      })
    }
  }
}
