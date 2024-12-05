import { ChangeDetectionStrategy, Component } from '@angular/core'
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
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { of } from 'rxjs'
import { LoadingComponent } from '../loading/loading.component'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'

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
