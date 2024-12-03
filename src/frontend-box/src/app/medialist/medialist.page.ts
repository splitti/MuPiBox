import { CategoryType, Media, MediaSorting } from '../media'
import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, input, signal } from '@angular/core'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone'
import { NavigationExtras, Router } from '@angular/router'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { Media as BackendMedia } from '@backend-api/media.model'
import { LoadingComponent } from '../loading/loading.component'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  standalone: true,
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
  readonly category = input<string>()
  readonly folder = input<string>()

  protected isLoading: WritableSignal<boolean> = signal(false)
  protected artist: WritableSignal<Artist | undefined> = signal(undefined)
  protected media: Signal<BackendMedia[]>
  protected swiperData: Signal<SwiperData<BackendMedia>[]> = computed(() => {
    return this.media()?.map((media) => {
      return {
        name: media.name,
        imgSrc: of(media.img),
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

    // this.media = toSignal(
    //   combineLatest([toObservable(this.category), toObservable(this.artist)]).pipe(
    //     tap(() => this.isLoading.set(true)),
    //     switchMap(([category, artist]) => {
    //       if (artist === undefined) {
    //         return of([])
    //       }

    //       const sliceMedia = (media: Media[], offsetByOne = false): Media[] => {
    //         if (artist.coverMedia?.aPartOfAll) {
    //           const min = Math.max(0, (artist.coverMedia?.aPartOfAllMin ?? 0) - (offsetByOne ? 1 : 0))
    //           const max =
    //             (artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount)) - (offsetByOne ? 1 : 0)
    //           return media.slice(min, max + 1)
    //         }
    //         return media
    //       }

    //       const isShow =
    //         (artist.coverMedia.showid && artist.coverMedia.showid.length > 0) ||
    //         (artist.coverMedia.type === 'rss' && artist.coverMedia.id.length > 0)

    //       return this.mediaService.fetchMediaFromArtist(artist, category).pipe(
    //         catchError((error) => {
    //           console.error(error)
    //           return of([])
    //         }),
    //         map((media) => {
    //           return sliceMedia(
    //             this.sortMedia(
    //               artist.coverMedia,
    //               media,
    //               isShow ? MediaSorting.ReleaseDateDescending : MediaSorting.AlphabeticalAscending,
    //             ),
    //             !isShow,
    //           )
    //         }),
    //       )
    //     }),
    //     tap(() => this.isLoading.set(false)),
    //   ),
    // )
  }

  protected coverClicked(clickedMedia: BackendMedia): void {
    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    this.router.navigate(['/player'], navigationExtras)
  }

  // private sortMedia(coverMedia: Media, media: Media[], defaultSorting: MediaSorting): Media[] {
  //   const sorting = coverMedia.sorting ?? defaultSorting
  //   switch (sorting) {
  //     case MediaSorting.AlphabeticalDescending:
  //       return media.sort((a, b) =>
  //         b.title.localeCompare(a.title, undefined, {
  //           numeric: true,
  //           sensitivity: 'base',
  //         }),
  //       )
  //     case MediaSorting.ReleaseDateAscending:
  //       return media.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
  //     case MediaSorting.ReleaseDateDescending:
  //       return media.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
  //     default: // MediaList.Alphabetical.Ascending
  //       return media.sort((a, b) =>
  //         a.title.localeCompare(b.title, undefined, {
  //           numeric: true,
  //           sensitivity: 'base',
  //         }),
  //       )
  //   }
  // }
}
