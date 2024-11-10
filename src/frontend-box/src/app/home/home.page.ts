import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Signal,
  WritableSignal,
  computed,
  effect,
  signal,
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular/standalone'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'

import { addIcons } from 'ionicons'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
  ],
  standalone: true,
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
        tap(() => this.resetSliderPosition()),
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

    effect(() => {
      this.mediaService.setCategory(this.category())
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
