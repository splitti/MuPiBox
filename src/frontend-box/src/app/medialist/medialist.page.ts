import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import { IonContent } from '@ionic/angular/standalone'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { LoadingComponent } from '../loading/loading.component'
import { CategoryType, Media, MediaSorting } from '../media'
import { MediaService } from '../media.service'
import { PlayerService } from '../player.service'
import { StatusBarComponent } from '../status-bar/status-bar.component'
import { TilePageItem, TilePagesComponent } from '../tile-pages/tile-pages.component'

const NO_COVER = '../assets/images/nocover_mupi.png'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  imports: [IonContent, LoadingComponent, StatusBarComponent, TilePagesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedialistPage {
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')
  protected artist: WritableSignal<Artist | undefined> = signal(undefined)
  protected media: Signal<Media[]>
  protected items: Signal<TilePageItem<Media>[]>
  protected artistCover: Signal<string>

  constructor(
    private router: Router,
    private mediaService: MediaService,
    private playerService: PlayerService,
  ) {
    this.artist.set(this.router.currentNavigation()?.extras.state?.artist)
    this.category.set(this.router.currentNavigation()?.extras.state?.category ?? 'audiobook')

    this.artistCover = computed(() => {
      const artist = this.artist()
      return artist?.coverMedia?.artistcover || artist?.coverMedia?.cover || artist?.cover || NO_COVER
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
      { initialValue: [] as Media[] },
    )

    this.items = computed(() =>
      this.media().map((media) => ({
        imgSrc: media.cover || NO_COVER,
        title: media.title,
        data: media,
      })),
    )
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }

  protected goBack(): void {
    this.router.navigate(['/home'])
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
