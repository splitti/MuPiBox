import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone'
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
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')
  protected artist: WritableSignal<Artist | undefined> = signal(undefined)
  protected media: Signal<Media[]>
  protected swiperData: Signal<SwiperData<Media>[]> = computed(() => {
    return this.media()?.map((media) => {
      return {
        name: media.title,
        imgSrc: this.artworkService.getArtwork(media),
        data: media,
      }
    })
  })

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    this.artist.set(this.router.currentNavigation()?.extras.state?.artist)
    this.category.set(this.router.currentNavigation()?.extras.state?.category ?? 'audiobook')

    // NAS folders can be nested several levels deep. Ionic keeps this same page
    // instance when only the query param changes, so the current NAS level is
    // driven by the `nas` query param (which also makes "back" show the level
    // above again), instead of only by the one-time navigation state above.
    this.route.queryParamMap.subscribe((params) => {
      const libraryPath = params.get('lib')
      if (libraryPath) {
        // Local folder level, e.g. "audiobook/Artist" (see MediaService.fetchMediaFromArtist).
        const parts = libraryPath.split('/').filter(Boolean)
        const name = parts[parts.length - 1] ?? libraryPath
        this.category.set(parts[0] as CategoryType)
        this.artist.set({
          name,
          albumCount: '1',
          cover: '',
          coverMedia: {
            type: 'library',
            category: parts[0] as CategoryType,
            artist: name,
            title: name,
            libraryPath,
            libraryIsContainer: true,
          },
        })
      }

      const nasPath = params.get('nas')
      if (nasPath) {
        const name = nasPath.split('/').filter(Boolean).pop() ?? nasPath
        this.category.set('nas')
        this.artist.set({
          name,
          albumCount: '1',
          cover: '',
          coverMedia: { type: 'nas', category: 'nas', artist: name, title: name, nasPath, nasIsContainer: true },
        })
      }
    })

    this.media = toSignal(
      combineLatest([toObservable(this.category), toObservable(this.artist)]).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap(([category, artist]) => {
          if (artist === undefined) {
            return of([])
          }

          const sliceMedia = (media: Media[], offsetByOne = false): Media[] => {
            if (artist.coverMedia?.aPartOfAll) {
              const min = Math.max(0, (artist.coverMedia?.aPartOfAllMin ?? 0) - (offsetByOne ? 1 : 0))
              const max =
                (artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount, 10)) - (offsetByOne ? 1 : 0)
              return media.slice(min, max + 1)
            }
            return media
          }

          const isShow =
            (artist.coverMedia.showid && artist.coverMedia.showid.length > 0) ||
            (artist.coverMedia.type === 'rss' && artist.coverMedia.id.length > 0)

          return this.mediaService.fetchMediaFromArtist(artist, category).pipe(
            catchError((error) => {
              console.error(error)
              return of([])
            }),
            map((media) => {
              return sliceMedia(
                this.sortMedia(
                  artist.coverMedia,
                  media,
                  isShow ? MediaSorting.ReleaseDateDescending : MediaSorting.AlphabeticalAscending,
                ),
                !isShow,
              )
            }),
          )
        }),
        tap(() => this.isLoading.set(false)),
      ),
    )
  }

  protected coverClicked(clickedMedia: Media): void {
    if (clickedMedia.type === 'library' && clickedMedia.libraryPath && clickedMedia.libraryIsContainer) {
      // A local folder holding only subfolders: show its children as the next level.
      this.router.navigate(['/medialist'], { queryParams: { lib: clickedMedia.libraryPath } })
      return
    }

    if (clickedMedia.type === 'nas' && clickedMedia.nasIsContainer) {
      // A NAS folder holding only subfolders: show its children as the next level.
      // The query param keeps the URL distinct so Angular doesn't ignore the navigation.
      this.router.navigate(['/medialist'], { queryParams: { nas: clickedMedia.nasPath } })
      return
    }

    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    this.router.navigate(['/player'], navigationExtras)
  }

  private sortMedia(coverMedia: Media, media: Media[], defaultSorting: MediaSorting): Media[] {
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
}
