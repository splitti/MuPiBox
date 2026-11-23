import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, Signal, signal, untracked, WritableSignal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
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
  NavController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  bookOutline,
  discOutline,
  musicalNotesOutline,
  radioOutline,
  serverOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, distinctUntilChanged, EMPTY, filter, map, type Observable, of, switchMap, tap } from 'rxjs'
import { environment } from 'src/environments/environment'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { CoverFlipService } from '../cover-flip.service'
import { HeaderVisibilityService } from '../header-visibility.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { ExtensionHostService } from '../extension-host.service'
import { isStandaloneMedia, MediaService } from '../media.service'
import { MediaUnavailableComponent } from '../media-unavailable/media-unavailable.component'
import type { MupiboxConfig } from '../mupibox-config.model'
import { StatusComponent } from '../status/status.component'
import { BackgroundPlaybackService } from '../background-playback.service'
import { KmStatusGroupComponent } from '../km-header/km-status-group.component'
import { NowPlayingPillComponent } from '../now-playing-pill/now-playing-pill.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { KmThemeService } from '../theme/km-theme.service'
import { TileTimeService } from '../tile-time.service'
import { PhotoAlbumsComponent } from '../photos/photo-albums.component'
import { PhotoTimeService } from '../photos/photo-time.service'
import { type PhotoAlbumSummary, PhotosService } from '../photos/photos.service'

/** a tab of the start page: a list of the library, or the photo display's albums */
type HomeTab = CategoryType | 'photos'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    StatusComponent,
    KmStatusGroupComponent,
    NowPlayingPillComponent,
    LoadingComponent,
    MediaUnavailableComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    SwiperComponent,
    PhotoAlbumsComponent,
    IonContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage extends SwiperIonicEventsHelper {
  private settingsAccessTimerMs = 3000
  private settingsPressTimer = 0
  // WiFi/battery held (for the settings): a light surface shows it is being held
  protected readonly settingsHolding = signal(false)
  // km themes: the resume button has the design's clock-with-arrow symbol
  protected readonly km = inject(KmThemeService).isKm
  /** the round-2 header (categories, "Läuft gerade", WiFi/battery): km themes and coverflow */
  protected readonly r2 = inject(KmThemeService).roundTwo
  // "Läuft gerade" in the header (design round 2): the categories take 80 instead of 96 px each while it is there
  private readonly background = inject(BackgroundPlaybackService)
  protected readonly pillShown = computed(() => this.r2() && this.background.media() !== null)

  // The top bar is folded away by a two-finger swipe (HeaderVisibilityService): the covers are then drawn larger
  protected readonly headerHidden = inject(HeaderVisibilityService).hidden
  // two fingers in from the edge: the next / the previous category, round and round (the tabs are folded away)
  private readonly categorySwipes = inject(HeaderVisibilityService)
    .categorySwipe.pipe(takeUntilDestroyed())
    .subscribe((step) => this.switchCategory(step))

  // Category tabs at the top, in display order; some can be hidden in the admin.
  protected readonly categories: { key: CategoryType; icon: string }[] = [
    { key: 'audiobook', icon: 'book-outline' },
    { key: 'music', icon: 'musical-notes-outline' },
    { key: 'nas', icon: 'server-outline' },
    { key: 'other', icon: 'radio-outline' },
  ]
  protected hiddenCategories: WritableSignal<string[]> = signal([])
  protected configLoaded: WritableSignal<boolean> = signal(false)
  // (the NAS tab also goes when all shown NAS folders are in a category of their own: nothing is left for it)
  protected nasTabWanted: WritableSignal<boolean> = signal(true)
  protected visibleCategories = computed(() =>
    this.categories.filter((c) => !this.hiddenCategories().includes(c.key) && (c.key !== 'nas' || this.nasTabWanted())),
  )
  // Tabs of extensions (the audio CD in the drive, for one) after the others, so none of them moves; they are no list - a tap runs
  // what the extension does
  private readonly extensions = inject(ExtensionHostService)
  // the photo display (5.1): its tab right of radio, while it is switched on and at least one album is shown here
  protected readonly photos = inject(PhotosService)
  private readonly photoTime = inject(PhotoTimeService)
  // a day's limit per tile (5.1): the used-up ones carry a lock
  private readonly tileTime = inject(TileTimeService)
  protected readonly headerCategories = computed<{ key: string; icon?: string; src?: string }[]>(() => [
    ...this.visibleCategories(),
    ...(this.photos.available() ? [{ key: 'photos', src: 'assets/photos.svg' }] : []),
    ...this.extensions
      .tabs()
      .filter((t) => t.visible)
      .map((t) => ({ key: t.id, src: t.src })),
  ])

  protected artists: Signal<Artist[]>
  // Category of the list currently shown; a reload of the same category keeps the scroll position.
  private lastShownCategory: string | undefined
  // the list on the screen as JSON: a reload in the background that brings the same list changes nothing
  private shownListJson = ''
  protected swiperData: Signal<SwiperData<Artist>[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<HomeTab> = signal('audiobook')
  // a tab chosen on the display (tap or swipe): the start tab of the settings, read a moment later, does not replace it
  private categoryChosen = false
  // The picture that stands for a whole list that could not be loaded (once, not per station / podcast):
  // the NAS tab when the NAS did not answer, radio stations and podcasts when the box is offline.
  protected unavailable: Signal<boolean>
  // Counts up to load the list again while the NAS is not reachable
  private reloadTick: WritableSignal<number> = signal(0)

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private router: Router,
    private http: HttpClient,
    private navController: NavController,
    private coverFlip: CoverFlipService,
  ) {
    super()
    addIcons({ timerOutline, bookOutline, discOutline, musicalNotesOutline, radioOutline, serverOutline })

    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const configuredSeconds = config?.mupibox?.settingsAccessTimer
        if (typeof configuredSeconds === 'number' && configuredSeconds > 0) {
          this.settingsAccessTimerMs = configuredSeconds * 1000
        }

        const hidden = config?.mupibox?.hiddenCategories
        if (Array.isArray(hidden)) {
          this.hiddenCategories.set(hidden)
        }
        // The tab the parents chose to start with (app › Bedienung) - unless a tab was chosen here already
        const start = this.categories.find((c) => c.key === config?.mupibox?.startCategory)
        if (start && !this.categoryChosen) {
          this.category.set(start.key)
        }
        // Do not start on a category that is hidden.
        // (the photos' tab is not one of these: it goes by itself, see below)
        const visible = this.visibleCategories()
        if (visible.length > 0 && this.category() !== 'photos' && !visible.some((c) => c.key === this.category())) {
          this.category.set(visible[0].key)
        }
        this.configLoaded.set(true)
      },
      error: () => {
        // Keep default settingsAccessTimerMs / show all categories if config could not be loaded.
        this.configLoaded.set(true)
      },
    })

    // the NAS tab comes and goes with the parents' choice (app › NAS); shown on it when it goes: the first tab
    this.mediaService.getNasTabWanted().pipe(takeUntilDestroyed()).subscribe((wanted) => {
      this.nasTabWanted.set(wanted)
      const visible = this.visibleCategories()
      if (visible.length > 0 && this.category() !== 'photos' && !visible.some((c) => c.key === this.category())) {
        this.category.set(visible[0].key)
      }
    })

    // back from a photo album: the tab "Fotos" again (also when this page is made afresh); and when the photo display
    // goes (switched off, no album shown any more) while its tab is on the screen: the first tab
    if (this.photos.backToTab()) {
      this.photos.backToTab.set(false)
      this.categoryChosen = true
      this.category.set('photos')
    }
    effect(() => {
      if (this.category() !== 'photos' || this.photos.available() || !this.photos.loaded()) return
      const visible = this.visibleCategories()
      if (visible.length > 0) this.category.set(visible[0].key)
    })

    this.isOnline = toSignal(this.mediaService.isOnline())
    // the other categories are made ready in the background, so switching shows them at once
    this.mediaService.keepHomeListsWarm(() => this.visibleCategories().map((c) => c.key))

    this.artists = toSignal(
      combineLatest([
        toObservable(this.category),
        toObservable(this.isOnline),
        this.mediaService.getLibraryVersion(),
        toObservable(this.reloadTick),
      ]).pipe(
        map(([category, _isOnline, version, tick]) => ({ category, version, tick })),
        // MED-13: combineLatest re-emits whenever ANY input changes, so a
        // Wi-Fi blip (online → offline → online …) used to trigger a fetch on
        // every transition — a "re-fetch storm" that flooded /api/data and
        // made the swiper jitter. distinctUntilChanged on (category, version)
        // collapses identical emissions: we fetch when the user switches tabs
        // OR when the library actually changed (Phase 17g — so a Smart-Sync
        // add/remove shows up without a manual reload), but never on bare
        // online/offline flips.
        distinctUntilChanged((a, b) => a.category === b.category && a.version === b.version && a.tick === b.tick),
        // The list of this tab is on the screen already and the library changed (Smart-Sync, NAS, upload): it is
        // loaded again quietly - no loading dots, only the finished list, nothing at all when the start page looks
        // the same as before, and on an error the list stays. Each step used to rebuild the covers and made them jump.
        map((request) => ({ ...request, background: request.category === this.lastShownCategory })),
        tap(({ background }) => {
          if (!background) this.isLoading.set(true)
        }),
        switchMap(({ category, background }) => {
          // (the photos' tab has its albums, no list of artists)
          if (category === 'photos') return of({ category, artists: [] as Artist[], json: '[]' })
          return this.mediaService.fetchArtistData(category, background).pipe(
            catchError((error): Observable<Artist[]> => {
              console.error(error)
              return background ? EMPTY : of([])
            }),
            map((artists) => ({ category, artists, json: JSON.stringify(artists) })),
            filter(({ json }) => !background || json !== this.shownListJson),
          )
        }),
        // Back to the first artist only when the tab changed. A reload because the library changed
        // (Smart-Sync) keeps the position - it used to throw the child back to the start.
        tap(({ category, json }) => {
          this.shownListJson = json
          if (category !== this.lastShownCategory) {
            this.lastShownCategory = category
            this.resetSwiperPosition()
          }
        }),
        map(({ artists }) => artists),
        tap(() => {
          this.isLoading.set(false)
          // the first list is there: the boot screen of index.html may give way to the page (a moment later, when the
          // first covers are drawn - else the page showed empty for an instant)
          window.setTimeout(() => (window as unknown as { mupiBootDone?: (what: string) => void }).mupiBootDone?.('list'), 250)
        }),
      ),
    )

    this.unavailable = computed(() => {
      if (this.isLoading()) return false
      if (this.category() === 'nas') return this.mediaService.nasUnavailable()
      const artists = this.artists()
      if (this.isOnline() !== false || !artists || artists.length === 0) return false
      return artists.every((a) => a.coverMedia?.type === 'rss' || a.coverMedia?.type === 'radio')
    })
    // While the NAS is not reachable the list is asked for again every 30 s.
    effect((onCleanup) => {
      if (!(this.category() === 'nas' && this.unavailable())) return
      const timer = window.setInterval(() => this.reloadTick.update((n) => n + 1), 30_000)
      onCleanup(() => window.clearInterval(timer))
    })

    const tiles = computed(() => {
      return this.artists()?.map((artist) => {
        return {
          name: artist.name,
          imgSrc: this.artworkService.getArtistArtwork(artist.coverMedia),
          data: artist,
          kind: 'artist' as const,
          isNew: artist.hasNew === true,
        }
      })
    })
    // (the tiles' pictures for the chip and the bars of a day's limit, whatever started them)
    effect(() => {
      const list = this.artists()
      if (list?.length) untracked(() => this.tileTime.noteStartPage(list.map((a) => a.coverMedia)))
    })
    // a tile whose day's limit is used up (5.1): with its lock - the same cover (imgSrc) as before, it is not loaded anew
    this.swiperData = computed(() => {
      const locks = this.tileTime.locks()
      return tiles()?.map((t) => (this.tileTime.isLocked(t.data.coverMedia, locks) ? { ...t, locked: true } : t))
    })
  }

  private switchCategory(step: 1 | -1): void {
    const visible: HomeTab[] = [...this.visibleCategories().map((c) => c.key), ...(this.photos.available() ? (['photos'] as const) : [])]
    if (visible.length < 2) return
    const index = Math.max(0, visible.indexOf(this.category()))
    this.categoryChosen = true
    this.category.set(visible[(index + step + visible.length) % visible.length])
  }

  // the start page shows again (back from an album, a list or the player): the photo albums are asked for again
  override ionViewWillEnter(): void {
    this.pageVisible = true
    this.pageShown.set(true)
    super.ionViewWillEnter()
    this.photos.refresh()
  }

  override ionViewWillLeave(): void {
    this.pageVisible = false
    this.pageShown.set(false)
    super.ionViewWillLeave()
  }

  // the list's swiper is made afresh when the tab "Fotos" gives way to a list: it has not had the page's "it comes"
  // (Ionic sends it once per visit) and would stay empty - it gets it here
  private pageVisible = false
  // (the same as a signal: the photo time's chip shows on the tab "Fotos" while this page is on the screen)
  private readonly pageShown = signal(false)
  private readonly photoTabShown = effect(() => {
    const on = this.pageShown() && this.category() === 'photos'
    untracked(() => this.photoTime.shown.set(on))
  })

  // the photos pause (the photo time is used up): "Zu den Hörspielen" - that tab, or the first one there is
  protected photosToListening(): void {
    const visible = this.visibleCategories()
    const tab = visible.find((c) => c.key === 'audiobook') ?? visible[0]
    if (tab) this.category.set(tab.key)
  }
  private readonly swiperAfterPhotos = effect(() => {
    const swiper = this.swiperComponent()
    if (swiper && untracked(() => this.pageVisible)) untracked(() => swiper.ionViewWillEnter())
  })

  protected photoAlbumOpened(album: PhotoAlbumSummary): void {
    void this.navController.navigateForward(['/photos'], {
      queryParams: { album: album.id, ...(this.photos.startAsSlideshow() ? { show: '1' } : {}) },
    })
  }

  protected categoryChanged(event: any): void {
    if (this.extensions.tabs().some((t) => t.id === event.detail.value)) {
      // (the tab is a button, not a list: the segment goes back to the list that is shown)
      if (event.target) event.target.value = this.category()
      this.extensions.select(event.detail.value)
      return
    }
    this.categoryChosen = true
    this.category.set(event.detail.value)
  }

  protected categoryClicked(key: string): void {
    if (this.extensions.tabs().some((t) => t.id === key)) return this.extensions.select(key)
    this.categoryChosen = true
    this.category.set(key as HomeTab)
  }

  protected async artistCoverClicked(artist: Artist): Promise<void> {
    // its day's limit is used up (5.1): it opens nothing, the bar says so
    if (this.tileTime.isLocked(artist.coverMedia, this.tileTime.locks())) {
      this.tileTime.showOver(artist.coverMedia)
      return
    }
    // Check if this is a standalone playlist (playlist without artist)
    const isPlayableNasFolder = artist.coverMedia?.type === 'nas' && !artist.coverMedia.nasIsContainer
    const isPlayableLibraryFolder =
      artist.coverMedia?.type === 'library' && !!artist.coverMedia.libraryPath && !artist.coverMedia.libraryIsContainer
    const isStandalone = isStandaloneMedia(artist.coverMedia)
    if (isPlayableNasFolder || isPlayableLibraryFolder || isStandalone) {
      // This is a standalone playlist or radio station - start playback directly
      const navigationExtras: NavigationExtras = {
        state: {
          media: artist.coverMedia,
        },
      }
      void this.navController.navigateForward(['/player'], { ...navigationExtras, animation: this.coverFlip.animation })
    } else {
      // This is a regular artist - navigate to medialist
      const navigationExtras: NavigationExtras = {
        state: {
          artist: artist,
          category: this.category(),
        },
        // NAS / local folder levels are identified by their folder path (see MedialistPage).
        queryParams:
          artist.coverMedia?.type === 'nas'
            ? { nas: artist.coverMedia.nasPath }
            : artist.coverMedia?.libraryPath
              ? { lib: artist.coverMedia.libraryPath }
              : undefined,
      }
      this.router.navigate(['/medialist'], navigationExtras)
    }
  }

  protected settingsButtonPointerDown(): void {
    window.clearTimeout(this.settingsPressTimer)
    this.settingsHolding.set(true)
    this.settingsPressTimer = window.setTimeout(() => {
      this.settingsHolding.set(false)
      this.router.navigate(['/settings'])
    }, this.settingsAccessTimerMs)
  }

  protected settingsButtonPointerUp(): void {
    window.clearTimeout(this.settingsPressTimer)
    this.settingsHolding.set(false)
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
