import { CUSTOM_ELEMENTS_SCHEMA, Component, Signal, WritableSignal, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
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
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { CategoryType, Media, MediaSorting } from '../media'

import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { IonicSliderWorkaround } from '../ionic-slider-workaround'
import { LoadingComponent } from '../loading/loading.component'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  imports: [
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
    LoadingComponent,
  ],
})
export class MedialistPage extends IonicSliderWorkaround {
  protected covers = {}

  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')
  protected artist: WritableSignal<Artist | undefined> = signal(undefined)
  protected media: Signal<Media[]>

  constructor(
    private router: Router,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    this.artist.set(this.router.getCurrentNavigation()?.extras.state?.artist)
    this.category.set(this.router.getCurrentNavigation()?.extras.state?.category ?? 'audiobook')

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
                (artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount)) - (offsetByOne ? 1 : 0)
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
        map((media) => {
          for (const currentMedia of media) {
            this.artworkService.getArtwork(currentMedia).subscribe((url) => {
              this.covers[currentMedia.title] = url
            })
          }
          return media
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

  protected mediaNameClicked(clickedMedia: Media): void {
    this.playerService.sayText(clickedMedia.title)
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
