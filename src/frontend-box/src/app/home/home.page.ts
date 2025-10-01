import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, signal } from '@angular/core'
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
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { addIcons } from 'ionicons'
import {
  bookOutline,
  cloudOfflineOutline,
  cloudOutline,
  musicalNotesOutline,
  radioOutline,
  timerOutline,
} from 'ionicons/icons'
import { catchError, of, switchMap, tap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import { LoadingComponent } from '../loading/loading.component'
import type { CategoryType } from '../media'
import { Folder } from '@backend-api/folder.model'
import { FolderService } from '../folder.service'
import { LoadingComponent } from '../loading/loading.component'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { Router } from '@angular/router'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'

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
  protected settingsButtonClickCount = 0
  protected settingsClickTimer = 0

  protected folders: Signal<Folder[]>
  protected swiperData: Signal<SwiperData<Folder>[]>
  protected isOnline: Signal<boolean>
  protected isLoading: WritableSignal<boolean> = signal(false)
  protected category: WritableSignal<CategoryType> = signal('audiobook')

  // TODO: Fix broken images or folders with no image (also on media page and player page and resume page.) use assets/images/nocover_mupi.png
  constructor(
    private mediaService: MediaService,
    private router: Router,
    private folderService: FolderService,
  ) {
    super()
    addIcons({ timerOutline, bookOutline, musicalNotesOutline, radioOutline, cloudOutline, cloudOfflineOutline })

    this.isOnline = toSignal(this.mediaService.isOnline())

    this.folders = toSignal(
      toObservable(this.isOnline).pipe(
        tap(() => this.isLoading.set(true)),
        switchMap((_isOnline) => {
          return this.folderService.getFolder().pipe(
            catchError((error) => {
              console.error(error)
              return of([])
            }),
          )
        }),
        tap(() => this.isLoading.set(false)),
      ),
    )

    this.swiperData = computed(() => {
      this.resetSwiperPosition()
      return this.folders()
        ?.filter((folder) => folder.category === this.category())
        .map((folder) => {
          return {
            name: folder.name,
            imgSrc: folder.img,
            data: folder,
          }
        })
    })
  }

  protected categoryChanged(event: any): void {
    this.category.set(event.detail.value)
  }

  /**
   * TODO
   * @param folder
   */
  protected folderClicked(folder: Folder): void {
    // // Check if this is a standalone playlist (playlist without artist)
    // if (artist.coverMedia?.playlistid && !artist.coverMedia?.artist) {
    //   // This is a standalone playlist - start playback directly
    //   const navigationExtras: NavigationExtras = {
    //     state: {
    //       media: artist.coverMedia,
    //     },
    //   }
    //   this.router.navigate(['/player'], navigationExtras)
    // } else {
    //   // This is a regular artist - navigate to medialist
    //   const navigationExtras: NavigationExtras = {
    //     state: {
    //       artist: artist,
    //       category: this.category(),
    //     },
    //   }
    //   this.router.navigate(['/medialist'], navigationExtras)
    // }

    this.router.navigate(['/media', folder.category, folder.name])
  }

  protected settingsButtonPressed(): void {
    window.clearTimeout(this.settingsClickTimer)

    if (this.settingsButtonClickCount < 9) {
      this.settingsButtonClickCount++

      this.settingsClickTimer = window.setTimeout(() => {
        this.settingsButtonClickCount = 0
      }, 500)
    } else {
      this.settingsButtonClickCount = 0
      this.router.navigate(['/settings'])
    }
  }

  protected resume(): void {
    this.router.navigate(['/resume'])
  }
}
