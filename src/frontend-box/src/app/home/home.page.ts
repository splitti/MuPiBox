import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Signal,
  WritableSignal,
  effect,
  signal,
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationExtras, Router } from '@angular/router'
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular/standalone'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { addIcons } from 'ionicons'
import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { IonicSliderWorkaround } from '../ionic-slider-workaround'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    MupiHatIconComponent,
    LoadingComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
})
export class HomePage extends IonicSliderWorkaround {
  protected covers = {}
  protected editButtonclickCount = 0
  protected editClickTimer = 0

  protected artists: Signal<Artist[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')

  constructor(
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private router: Router,
  ) {
    super()
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, cloudOutline, cloudOfflineOutline })

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
        map((artists) => {
          for (const artist of artists) {
            this.artworkService.getArtistArtwork(artist.coverMedia).subscribe((url) => {
              this.covers[artist.name] = url
            })
          }
          return artists
        }),
        // This is a fix for the swiper staying at a scrolled position
        // when switching categories.
        tap(() => this.swiper().slideTo(0, 0)),
        tap(() => this.isLoading.set(false)),
      ),
    )

    effect(() => {
      this.mediaService.setCategory(this.category())
    })
  }

  public categoryChanged(event: any): void {
    this.category.set(event.detail.value)
  }

  artistCoverClicked(clickedArtist: Artist) {
    const navigationExtras: NavigationExtras = {
      state: {
        artist: clickedArtist,
        category: this.category(),
      },
    }
    this.router.navigate(['/medialist'], navigationExtras)
  }

  editButtonPressed() {
    window.clearTimeout(this.editClickTimer)

    if (this.editButtonclickCount < 9) {
      this.editButtonclickCount++

      this.editClickTimer = window.setTimeout(() => {
        this.editButtonclickCount = 0
      }, 500)
    } else {
      this.editButtonclickCount = 0
      this.router.navigate(['/edit'])
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }
}
