import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
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
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    MupiHatIconComponent,
    LoadingComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    SwiperComponent,
    IonContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage extends SwiperIonicEventsHelper {
  protected editButtonclickCount = 0
  protected editClickTimer = 0

  protected artists: Signal<Artist[]>
  protected swiperData: Signal<SwiperData<Artist>[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private router: Router,
  ) {
    super()
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, cloudOutline, cloudOfflineOutline })

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.artists = toSignal(
      combineLatest([toObservable(this.category), toObservable(this.isOnline)]).pipe(
        map(([category, _isOnline]) => category),
        tap(() => this.isLoading.set(true)),
        switchMap((category) => {
          return this.mediaService.fetchArtistData(category).pipe(
            catchError((error) => {
              console.error(error)
              return of([])
            }),
          )
        }),
        tap(() => this.resetSwiperPosition()),
        tap(() => this.isLoading.set(false)),
      ),
    )

    this.swiperData = computed(() => {
      return this.artists()?.map((artist) => {
        return {
          name: artist.name,
          imgSrc: this.artworkService.getArtistArtwork(artist.coverMedia),
          data: artist,
        }
      })
    })
  }

  protected categoryChanged(event: any): void {
    this.category.set(event.detail.value)
  }

  protected async artistCoverClicked(artist: Artist): Promise<void> {
    // Check if this is a standalone playlist (playlist without artist)
    if (artist.coverMedia?.playlistid && !artist.coverMedia?.artist) {
      // This is a standalone playlist - start playback directly
      const navigationExtras: NavigationExtras = {
        state: {
          media: artist.coverMedia,
        },
      }
      this.router.navigate(['/player'], navigationExtras)
    } else {
      // This is a regular artist - navigate to medialist
      const navigationExtras: NavigationExtras = {
        state: {
          artist: artist,
          category: this.category(),
        },
      }
      this.router.navigate(['/medialist'], navigationExtras)
    }
  }

  protected editButtonPressed(): void {
    window.clearTimeout(this.editClickTimer)

    if (this.editButtonclickCount < 9) {
      this.editButtonclickCount++

      this.editClickTimer = window.setTimeout(() => {
        this.editButtonclickCount = 0
      }, 500)
    } else {
      this.editButtonclickCount = 0
      this.router.navigate(['/edit'])
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
