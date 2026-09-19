import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, Signal, signal, WritableSignal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
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
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  serverOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { environment } from 'src/environments/environment'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
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
    IonContent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage extends SwiperIonicEventsHelper {
  private settingsAccessTimerMs = 3000
  private settingsPressTimer = 0

  // Category tabs at the top, in display order; some can be hidden in the admin.
  protected readonly categories: { key: CategoryType; icon: string }[] = [
    { key: 'audiobook', icon: 'book-outline' },
    { key: 'music', icon: 'musical-notes-outline' },
    { key: 'nas', icon: 'server-outline' },
    { key: 'other', icon: 'radio-outline' },
  ]
  protected hiddenCategories: WritableSignal<string[]> = signal([])
  protected configLoaded: WritableSignal<boolean> = signal(false)
  protected visibleCategories = computed(() => this.categories.filter((c) => !this.hiddenCategories().includes(c.key)))

  protected artists: Signal<Artist[]>
  protected swiperData: Signal<SwiperData<Artist>[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private router: Router,
    private http: HttpClient,
  ) {
    super()
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, serverOutline, cloudOutline, cloudOfflineOutline })

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
        tap(() => this.resetSwiperPosition()),
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
  }

  protected categoryChanged(event: any): void {
    this.category.set(event.detail.value)
  }

  protected async artistCoverClicked(artist: Artist): Promise<void> {
    // Check if this is a standalone playlist (playlist without artist)
    const isPlayableNasFolder = artist.coverMedia?.type === 'nas' && !artist.coverMedia.nasIsContainer
    const isPlayableLibraryFolder =
      artist.coverMedia?.type === 'library' && !!artist.coverMedia.libraryPath && !artist.coverMedia.libraryIsContainer
    if (isPlayableNasFolder || isPlayableLibraryFolder || (artist.coverMedia?.playlistid && !artist.coverMedia?.artist)) {
      // This is a standalone playlist - start playback directly
      const navigationExtras: NavigationExtras = {
        state: {
          media: artist.coverMedia,
        },
      }
      this.router.navigate(['/player'], navigationExtras)
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
