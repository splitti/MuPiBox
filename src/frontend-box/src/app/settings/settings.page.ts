import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone'
import { SwiperComponent, SwiperData } from '../swiper/swiper.component'

import { AlertController } from '@ionic/angular/standalone'
import { HttpClient } from '@angular/common/http'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import QRCode from 'qrcode'
import { Router } from '@angular/router'
import { SwiperIonicEventsHelper } from '../swiper/swiper-ionic-events-helper'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { toSignal } from '@angular/core/rxjs-interop'

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
  protected network = toSignal(this.mediaService.network$)

  protected swiperData = computed(() => {
    return [
      {
        name: 'Add media & more',
        imgSrc: this.qrCodeSrc(),
        data: 'add-media',
      },
      {
        name: 'WiFi settings',
        imgSrc: '../../assets/wifi-settings.svg',
        data: 'wifi',
      },
      {
        name: 'Reboot / Shutdown',
        imgSrc: '../../assets/power.svg',
        data: 'shutdown',
      },
    ]
  })

  private qrCodeSrc = signal<string>('')

  private router = inject(Router)
  private alertController = inject(AlertController)
  private http = inject(HttpClient)

  public constructor() {
    super()
    addIcons({ arrowBackOutline })

    effect(
      () => {
        const ip = this.network()?.ip
        if (ip !== undefined) {
          QRCode.toDataURL(`http://${ip}`, { color: { light: '#00000000' } }).then((url) => {
            this.qrCodeSrc.set(url)
          })
        } else {
          this.qrCodeSrc.set('')
        }
      },
      { allowSignalWrites: true },
    )
  }

  protected entryClicked(entryData: SwiperData<string>): void {
    if (entryData.data === 'wifi') {
      this.router.navigate(['/wifi'])
    } else if (entryData.data === 'shutdown') {
      this.shutdownMessage()
    }
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
