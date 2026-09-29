import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, Signal, signal, WritableSignal } from '@angular/core'
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
  musicalNotesOutline,
  radioOutline,
  serverOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs'
import { environment } from 'src/environments/environment'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { CoverFlipService } from '../cover-flip.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { MediaUnavailableComponent } from '../media-unavailable/media-unavailable.component'
import type { MupiboxConfig } from '../mupibox-config.model'
import { StatusComponent } from '../status/status.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { KmThemeService } from '../theme/km-theme.service'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    StatusComponent,
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
    IonContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage extends SwiperIonicEventsHelper {
  private settingsAccessTimerMs = 3000
  private settingsPressTimer = 0
  // km themes: the resume button has the design's clock-with-arrow symbol
  protected readonly km = inject(KmThemeService).isKm

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

  protected artists: Signal<Artist[]>
  // Category of the list currently shown; a reload of the same category keeps the scroll position.
  private lastShownCategory: string | undefined
  protected swiperData: Signal<SwiperData<Artist>[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')
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
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, serverOutline })

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
        // Do not start on a category that is hidden.
        const visible = this.visibleCategories()
        if (visible.length > 0 && !visible.some((c) => c.key === this.category())) {
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
      if (visible.length > 0 && !visible.some((c) => c.key === this.category())) {
        this.category.set(visible[0].key)
      }
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
        tap(() => this.isLoading.set(true)),
        switchMap(({ category }) => {
          return this.mediaService.fetchArtistData(category).pipe(
            catchError((error) => {
              console.error(error)
              return of([])
            }),
            map((artists) => ({ category, artists })),
          )
        }),
        // Back to the first artist only when the tab changed. A reload because the library changed
        // (Smart-Sync) keeps the position - it used to throw the child back to the start.
        tap(({ category }) => {
          if (category !== this.lastShownCategory) {
            this.lastShownCategory = category
            this.resetSwiperPosition()
          }
        }),
        map(({ artists }) => artists),
        tap(() => this.isLoading.set(false)),
        // the first list is there: the boot screen of index.html may give way to the page (a moment later, when the
        // first covers are drawn - else the page showed empty for an instant)
        tap(() => window.setTimeout(() => (window as unknown as { mupiBootDone?: (what: string) => void }).mupiBootDone?.('list'), 250)),
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

    this.swiperData = computed(() => {
      return this.artists()?.map((artist) => {
        return {
          name: artist.name,
          imgSrc: this.artworkService.getArtistArtwork(artist.coverMedia),
          data: artist,
          kind: 'artist' as const,
        }
      })
    })
  }

  protected categoryChanged(event: any): void {
    this.category.set(event.detail.value)
  }

  protected async artistCoverClicked(artist: Artist): Promise<void> {
    // Check if this is a standalone playlist (playlist without artist)
    const isPlayableNasFolder = artist.coverMedia?.type === 'nas' && !artist.coverMedia.nasIsContainer
    const isPlayableLibraryFolder =
      artist.coverMedia?.type === 'library' && !!artist.coverMedia.libraryPath && !artist.coverMedia.libraryIsContainer
    const isStandalone = (!!artist.coverMedia?.playlistid || artist.coverMedia?.type === 'radio') && !artist.coverMedia?.artist
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
    this.settingsPressTimer = window.setTimeout(() => {
      this.router.navigate(['/settings'])
    }, this.settingsAccessTimerMs)
  }

  protected settingsButtonPointerUp(): void {
    window.clearTimeout(this.settingsPressTimer)
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
