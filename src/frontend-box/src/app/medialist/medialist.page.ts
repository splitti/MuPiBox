import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
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
    private mediaService: MediaService,
    private artworkService: ArtworkService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    // MED-21: router.currentNavigation() is null when this page is reached
    // by anything OTHER than a fresh router.navigate() — e.g. browser
    // refresh (F5), Chromium restart-kiosk preserving the URL, or
    // Capacitor app-resume. The previous code then `set(undefined)`d
    // both signals; the template's {{artist().name}} threw an NPE and
    // the page crashed white-screen.
    //
    // Browsers persist navigation state in `history.state` across reloads,
    // so fall back to that. If neither source has the data, redirect to
    // home rather than render in a broken state.
    const navState = this.router.currentNavigation()?.extras.state ?? (history.state as any) ?? {}
    if (!navState.artist) {
      // No artist anywhere — typical on F5 with stale URL. Bounce home.
      void this.router.navigateByUrl('/')
      return
    }
    this.artist.set(navState.artist)
    this.category.set(navState.category ?? 'audiobook')

    this.media = toSignal(
      combineLatest([toObservable(this.category), toObservable(this.artist)]).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap(([category, artist]) => {
          if (artist === undefined) {
            return of([])
          }

          // MED-18: previously the sort-then-slice ordering produced wrong
          // ranges for shows/RSS. aPartOfAllMin/Max are user-input 1-indexed
          // ranges (Eltern enter "episodes 5-10"). For audiobooks (alphabetical
          // sort) this happened to work because filesystem readdir order
          // matches alphabetical, so slicing post-sort with `offsetByOne=true`
          // produced the right items. But for shows/RSS the array was sorted
          // ReleaseDateDescending FIRST, then sliced with `offsetByOne=false` —
          // so picking "5-10" gave you items at indices 5-10 of the descending
          // array, i.e. the 6th-through-11th-newest episodes, not Episodes 5-10.
          // Slice on the API's native order (chronological for RSS/shows, alpha
          // for filesystem audiobooks), THEN sort the slice for display. Same
          // semantics for both categories, no offsetByOne flag needed.
          const slicePart = (media: Media[]): Media[] => {
            if (!artist.coverMedia?.aPartOfAll) return media
            const min = Math.max(0, (artist.coverMedia?.aPartOfAllMin ?? 1) - 1) // 1-indexed → 0-indexed
            const max = artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount, 10) // 1-indexed inclusive → exclusive end for slice
            return media.slice(min, max)
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
              return this.sortMedia(
                artist.coverMedia,
                slicePart(media),
                isShow ? MediaSorting.ReleaseDateDescending : MediaSorting.AlphabeticalAscending,
              )
            }),
          )
        }),
        tap(() => this.isLoading.set(false)),
      ),
    )
  }

  protected coverClicked(clickedMedia: Media): void {
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
