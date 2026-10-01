import { ChangeDetectionStrategy, Component, computed, inject, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { CoverFlipService } from '../cover-flip.service'
import { newestFirst, pickEpisodes } from '../episode-pick'
import { LoadingComponent } from '../loading/loading.component'
import { CategoryType, isSyncManaged, Media, MediaSorting } from '../media'
import { MediaService } from '../media.service'
import { MediaUnavailableComponent } from '../media-unavailable/media-unavailable.component'
import { StatusComponent } from '../status/status.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
  imports: [
    StatusComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    SwiperComponent,
    LoadingComponent,
    MediaUnavailableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedialistPage extends SwiperIonicEventsHelper {
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')
  protected artist: WritableSignal<Artist | undefined> = signal(undefined)

  // Folder levels: Ionic keeps this one page instance while the query param changes, so its
  // own "back" would jump over all levels to the page before. The levels above the current
  // one are remembered here and the back button steps up one level at a time.
  private rootArtist: Artist | undefined
  private rootCategory: CategoryType = 'audiobook'
  private levelsAbove: Record<string, string>[] = []
  private currentLevel: Record<string, string> = {}
  protected media: Signal<Media[]>
  // A podcast or NAS folder that came back with nothing: the load failed (a real one always has entries)
  protected unavailable: Signal<boolean> = computed(() => {
    const type = this.artist()?.coverMedia?.type
    return !this.isLoading() && this.media()?.length === 0 && (type === 'rss' || type === 'nas')
  })
  protected swiperData: Signal<SwiperData<Media>[]> = computed(() => {
    return this.media()?.map((media) => {
      return {
        // Phase 14e: display title falls back to title_override when the
        // parent has customised it via the Eltern-WebApp; keeps the
        // box-frontend consistent with what the override pattern promises.
        name: media.title_override ?? media.title,
        imgSrc: this.artworkService.getArtwork(media),
        data: media,
        // Phase 14e: lock-icon badge on items the Spotify Smart-Sync
        // manages. Helps parents/kids identify auto-synced entries at a
        // glance. Manual entries (the default) carry no badge.
        badge: isSyncManaged(media) ? '🔗' : undefined,
        // km themes: card stack for a folder (opens the next level), 'own' = the folder's own titles (first entry)
        kind: media.ownFiles
          ? ('own' as const)
          : media.nasIsContainer || media.libraryIsContainer
            ? ('folder' as const)
            : ('album' as const),
        synced: isSyncManaged(media),
        isNew: media.episodeNew === true,
        progress: media.episodeProgress,
        done: media.episodeDone === true,
      }
    })
  })

  // (whether there is a page to go back to: none after the page was loaded afresh here)
  private readonly outlet = inject(IonRouterOutlet, { optional: true })

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private navController: NavController,
    private coverFlip: CoverFlipService,
  ) {
    super()
    addIcons({ arrowBackOutline })

    this.artist.set(this.router.currentNavigation()?.extras.state?.artist)
    this.category.set(this.router.currentNavigation()?.extras.state?.category ?? 'audiobook')
    this.rootArtist = this.artist()
    this.rootCategory = this.category()

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
      if (!libraryPath && !nasPath && this.rootArtist) {
        // Back at the first level (the one that was opened from the start page).
        this.category.set(this.rootCategory)
        this.artist.set(this.rootArtist)
      }
      this.currentLevel = libraryPath ? { lib: libraryPath } : nasPath ? { nas: nasPath } : {}
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
      combineLatest([
        toObservable(this.category),
        toObservable(this.artist),
        // Phase 17g: re-fetch when the library changes (e.g. a Smart-Sync
        // excluded an album of this very artist) so the kid's album list
        // updates without leaving and re-entering the artist.
        this.mediaService.getLibraryVersion(),
      ]).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap(([category, artist, version]) => {
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
            // a podcast's choice of episodes (web app: the newest / oldest N, episodes A to B - counted by date)
            // (offline the box gives only the episodes on the SD card: the chosen ones already)
            if (artist.coverMedia?.type === 'rss' && artist.coverMedia.episodePick && !media.some((m) => m.offlineView)) {
              return pickEpisodes(newestFirst(media), artist.coverMedia.episodePick)
            }
            if (!artist.coverMedia?.aPartOfAll) return media
            const min = Math.max(0, (artist.coverMedia?.aPartOfAllMin ?? 1) - 1) // 1-indexed → 0-indexed
            const max = artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount, 10) // 1-indexed inclusive → exclusive end for slice
            return media.slice(min, max)
          }

          const isShow =
            (artist.coverMedia.showid && artist.coverMedia.showid.length > 0) ||
            (artist.coverMedia.type === 'rss' && artist.coverMedia.id.length > 0)

          return this.mediaService.fetchMediaFromArtist(artist, category, version).pipe(
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

  // One folder level up; from the first level back to where the list was opened.
  protected goBack(): void {
    const above = this.levelsAbove.pop()
    if (above !== undefined) {
      this.router.navigate(['/medialist'], { queryParams: above, replaceUrl: true })
    } else if (this.outlet?.canGoBack()) {
      this.navController.pop()
    } else {
      // The page was loaded afresh on this list (the parents saved a display setting in the app, which reloads the
      // display where it is): no page before it - pop() did nothing and the child was stuck. Back to the start page.
      this.navController.navigateRoot('/home', { animationDirection: 'back' })
    }
  }

  protected coverClicked(clickedMedia: Media): void {
    if (clickedMedia.type === 'library' && clickedMedia.libraryPath && clickedMedia.libraryIsContainer) {
      // A local folder with subfolders: show its children as the next level (its own audio files, if any, are an entry there).
      this.levelsAbove.push(this.currentLevel)
      this.router.navigate(['/medialist'], { queryParams: { lib: clickedMedia.libraryPath }, replaceUrl: true })
      return
    }

    if (clickedMedia.type === 'nas' && clickedMedia.nasIsContainer) {
      // A NAS folder with subfolders: show its children as the next level (its own audio files, if any, are an entry there).
      // The query param keeps the URL distinct so Angular doesn't ignore the navigation.
      this.levelsAbove.push(this.currentLevel)
      this.router.navigate(['/medialist'], { queryParams: { nas: clickedMedia.nasPath }, replaceUrl: true })
      return
    }

    const navigationExtras: NavigationExtras = {
      state: {
        media: clickedMedia,
      },
    }
    void this.navController.navigateForward(['/player'], { ...navigationExtras, animation: this.coverFlip.animation })
  }

  private sortMedia(coverMedia: Media, media: Media[], defaultSorting: MediaSorting): Media[] {
    // The folder's own audio files (next to its subfolders) stay in front, whatever the order of the rest.
    const own = media.filter((m) => m.ownFiles)
    if (own.length > 0) {
      return [...own, ...this.sortMedia(coverMedia, media.filter((m) => !m.ownFiles), defaultSorting)]
    }
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
