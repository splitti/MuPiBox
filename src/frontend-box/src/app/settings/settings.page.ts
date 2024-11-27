import { ChangeDetectionStrategy, Component, Signal, WritableSignal, computed, signal } from '@angular/core'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { NavigationExtras, Router } from '@angular/router'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import {
  addOutline,
  arrowBackOutline,
  brushOutline,
  close,
  powerOutline,
  trashOutline,
  wifiOutline,
} from 'ionicons/icons'
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import type { Artist } from '../artist'
import { ArtworkService } from '../artwork.service'
import type { CategoryType } from '../media'
import { LoadingComponent } from '../loading/loading.component'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonBackButton,
    IonTitle,
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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage extends SwiperIonicEventsHelper {
  public constructor() {
    super()
    addIcons({ arrowBackOutline })
  }

  protected swiperData: SwiperData<string>[] = [
    {
      name: 'WiFi settings',
      imgSrc: of('../../assets/wifi-settings.svg'),
      data: 'admin',
    },
    {
      name: 'More settings',
      imgSrc: of('../../assets/qr.svg'),
      data: 'bla',
    },
    {
      name: 'Reboot / Shutdown',
      imgSrc: of('../../assets/power.svg'),
      data: 'bla',
    },
  ]
}
