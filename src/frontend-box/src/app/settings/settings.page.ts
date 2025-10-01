import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { ChangeDetectionStrategy, Component, Signal, computed, inject } from '@angular/core'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'
import { from, of, switchMap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import { HttpClient } from '@angular/common/http'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import QRCode from 'qrcode'
import { Router } from '@angular/router'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonBackButton,
    IonTitle,
    MupiHatIconComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    SwiperComponent,
    IonContent,
    MupiHatIconComponent,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage extends SwiperIonicEventsHelper {
  private mediaService = inject(MediaService)
  protected network = toSignal(this.mediaService.network$, { initialValue: null })

  protected swiperData = computed(() => {
    const out = [
      {
        name: 'Add media',
        imgSrc: of('../../assets/plus-box-outline.svg'),
        data: 'add-media',
      },
      {
        name: 'WiFi settings',
        imgSrc: of('../../assets/wifi.svg'),
        data: 'wifi',
      },
      {
        name: 'Reboot / Shutdown',
        imgSrc: of('../../assets/power.svg'),
        data: 'shutdown',
      },
    ]
    if (this.qrCodeSrc() !== null) {
      out.push({
        name: 'More settings',
        imgSrc: of(this.qrCodeSrc()),
        data: 'more-settings',
      })
    }
    return out
  })

  protected qrCodeSrc: Signal<string>

  private router = inject(Router)
  private alertController = inject(AlertController)
  private http = inject(HttpClient)

  public constructor() {
    super()
    addIcons({ arrowBackOutline })

    this.qrCodeSrc = toSignal(
      toObservable(this.network).pipe(
        switchMap((network) => {
          if (network?.ip !== undefined) {
            return from(QRCode.toDataURL(`http://${network.ip}`, { color: { light: '#00000000' } }))
          }
          return of(null)
        }),
      ),
      { initialValue: null },
    )
  }

  protected entryClicked(entryData: SwiperData<string>): void {
    if (entryData.data === 'add-media') {
      this.router.navigate(['/edit'])
    } else if (entryData.data === 'wifi') {
      this.router.navigate(['/wifi'])
    } else if (entryData.data === 'shutdown') {
      this.shutdownMessage()
    } else if (entryData.data === 'more-settings') {
      this.moreSettingsMessage()
    }
  }

  private async moreSettingsMessage() {
    const msg = await this.alertController.create({
      cssClass: 'alert',
      header: 'More settings',
      message: `For more settings, open 'http://${this.network()?.ip}' on your mobile device or PC. You can also scan the QR-code to open it.`,
      buttons: ['OK'],
    })
    await msg.present()
  }

  private async shutdownMessage() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Reboot / Shutdown',
      message: 'Do you want to reboot or shutdown the MuPiBox?',
      buttons: [
        {
          text: 'Shutdown',
          handler: () => {
            this.http.post('/api/shutdown', {}).subscribe()
          },
        },
        {
          text: 'Reboot',
          handler: () => {
            this.http.post('/api/reboot', {}).subscribe()
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }
}
