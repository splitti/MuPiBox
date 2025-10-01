import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, input, signal } from '@angular/core'
import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone'
import { NavigationExtras, Router } from '@angular/router'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { combineLatest, of, switchMap, tap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import { Media as BackendMedia } from '@backend-api/media.model'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import { CategoryType, Media, MediaSorting } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  imports: [
    MupiHatIconComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    SwiperComponent,
    LoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedialistPage extends SwiperIonicEventsHelper {
  protected readonly category = input<string>()
  protected readonly folder = input<string>()

  protected isLoading: WritableSignal<boolean> = signal(false)
  protected media: Signal<BackendMedia[]>
  protected swiperData: Signal<SwiperData<BackendMedia>[]> = computed(() => {
    return this.media()?.map((media) => {
      return {
        name: media.name,
        imgSrc: media.img,
        data: media,
      }
    })
  })

  constructor(
    private router: Router,
    private mediaService: MediaService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    this.media = toSignal(
      combineLatest([toObservable(this.category), toObservable(this.folder)]).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap(([category, folder]) => {
          if (category === undefined || folder === undefined) {
            return of([])
          }
          return this.mediaService.getMedia(category, folder)
        }),
        tap(() => this.isLoading.set(false)),
      ),
    )
  }

  protected coverClicked(clickedMedia: BackendMedia): void {
    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    this.router.navigate(['/player'], navigationExtras)
  }
}
