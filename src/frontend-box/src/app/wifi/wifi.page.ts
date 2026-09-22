import { Component, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { AlertController, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone'
import { registerLucideIcons } from '../icons/lucide-icons'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'
import { WifiService } from '../wifi.service'
import type { WifiConfiguredNetwork } from '../wifi-network'

/** WLAN settings in the settings mockup layout. */
@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
  imports: [IonContent, IonIcon, IonSpinner, SettingsHeaderComponent],
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
    registerLucideIcons()
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
      header: 'Netzwerk löschen',
      message: `Soll das gespeicherte Netzwerk "${network.ssid}" entfernt werden?`,
      buttons: [
        {
          text: 'Löschen',
          handler: () => {
            this.wifiService.removeNetwork(network.id).subscribe(() => {
              this.loadConfiguredNetworks()
            })
          },
        },
        {
          text: 'Abbrechen',
        },
      ],
    })

    await alert.present()
  }

  async wifiRestartButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'WLAN neu starten',
      message: 'Soll das WLAN neu gestartet werden?',
      buttons: [
        {
          text: 'Neu starten',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.NETWORKRESTART)
          },
        },
        {
          text: 'Abbrechen',
        },
      ],
    })

    await alert.present()
  }

  async enableWifiOnButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Onboard-WLAN',
      message: 'Onboard-WLAN des Raspberry Pi aktivieren?',
      buttons: [
        {
          text: 'Aktivieren',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.ENABLEWIFI)
          },
        },
        {
          text: 'Abbrechen',
        },
      ],
    })

    await alert.present()
  }
}
