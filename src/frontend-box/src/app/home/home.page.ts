import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, signal } from '@angular/core'
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
import { NavigationExtras, Router } from '@angular/router'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import type { CategoryType } from '../media'
import { LoadingComponent } from '../loading/loading.component'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'

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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage extends SwiperIonicEventsHelper {
  protected settingsButtonClickCount = 0
  protected settingsClickTimer = 0

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

  protected artistCoverClicked(artist: Artist): void {
    const navigationExtras: NavigationExtras = {
      state: {
        artist: artist,
        category: this.category(),
      },
    }
    this.router.navigate(['/medialist'], navigationExtras)
  }

  protected settingsButtonPressed(): void {
    window.clearTimeout(this.settingsClickTimer)

    if (this.settingsButtonClickCount < 9) {
      this.settingsButtonClickCount++

      this.settingsClickTimer = window.setTimeout(() => {
        this.settingsButtonClickCount = 0
      }, 500)
    } else {
      this.settingsButtonClickCount = 0
      this.router.navigate(['/settings'])
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
