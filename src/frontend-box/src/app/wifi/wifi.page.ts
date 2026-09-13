import { Component, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { addOutline, arrowBackOutline, refresh, wifiOutline } from 'ionicons/icons'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { WifiService } from '../wifi.service'
import type { WifiConfiguredNetwork } from '../wifi-network'

@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
  imports: [
    IonTitle,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
  ],
})
export class WifiPage {
  protected network = toSignal(this.mediaService.network$, { initialValue: null })
  protected configuredNetworks = signal<WifiConfiguredNetwork[]>([])
  protected loading = signal(true)

  constructor(
    private mediaService: MediaService,
    private wifiService: WifiService,
    public alertController: AlertController,
    private playerService: PlayerService,
    private router: Router,
  ) {
    addIcons({ refresh, wifiOutline, addOutline, arrowBackOutline })
  }

  ionViewWillEnter() {
    this.loadConfiguredNetworks()
  }

  private loadConfiguredNetworks() {
    this.loading.set(true)
    this.wifiService.getConfiguredNetworks().subscribe({
      next: (networks) => {
        this.configuredNetworks.set(networks)
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
      },
    })
  }

  addNetworkButtonPressed() {
    this.router.navigate(['/wifi/add'])
  }

  changeNetworkButtonPressed(network: WifiConfiguredNetwork) {
    this.router.navigate(['/wifi/add'], { state: { editNetwork: { id: network.id, ssid: network.ssid } } })
  }

  async deleteNetworkButtonPressed(network: WifiConfiguredNetwork) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Delete network',
      message: `Do you want to remove the saved network "${network.ssid}"?`,
      buttons: [
        {
          text: 'Delete',
          handler: () => {
            this.wifiService.removeNetwork(network.id).subscribe(() => {
              this.loadConfiguredNetworks()
            })
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  async wifiRestartButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Restart Wifi',
      message: 'Do you want to restart the wifi network?',
      buttons: [
        {
          text: 'Restart',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.NETWORKRESTART)
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  async enableWifiOnButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'OnBoard-Wifi',
      message: 'Enable OnBoard-Wifi.',
      buttons: [
        {
          text: 'Enable',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.ENABLEWIFI)
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
