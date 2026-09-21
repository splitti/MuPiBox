import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { arrowBackOutline } from 'ionicons/icons'
import { Observable, of } from 'rxjs'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'

export interface SettingsMenuEntry {
  name: string
  imgSrc: Observable<string>
  data: string
}

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    AsyncPipe,
    IonBackButton,
    IonTitle,
    MupiHatIconComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private mediaService = inject(MediaService)
  protected network = toSignal(this.mediaService.network$, { initialValue: null })

  protected menuEntries: Signal<SettingsMenuEntry[]> = computed(() => {
    const out: SettingsMenuEntry[] = [
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
        name: 'Bluetooth settings',
        imgSrc: of('../../assets/bluetooth.svg'),
        data: 'bluetooth',
      },
      {
        name: 'Reboot / Shutdown',
        imgSrc: of('../../assets/power.svg'),
        data: 'shutdown',
      },
    ]
    return out
  })

  private router = inject(Router)
  private alertController = inject(AlertController)
  private http = inject(HttpClient)

  public constructor() {
    addIcons({ arrowBackOutline })
  }

  protected entryClicked(entry: SettingsMenuEntry): void {
    if (entry.data === 'add-media') {
      this.router.navigate(['/edit'])
    } else if (entry.data === 'wifi') {
      this.router.navigate(['/wifi'])
    } else if (entry.data === 'bluetooth') {
      this.router.navigate(['/bluetooth'])
    } else if (entry.data === 'shutdown') {
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
