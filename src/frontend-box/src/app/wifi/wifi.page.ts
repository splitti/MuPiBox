import { Component, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { AlertController, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone'
import { registerLucideIcons } from '../icons/lucide-icons'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'
import { WifiService } from '../wifi.service'
import type { WifiNetwork } from '../wifi-network'

/** WLAN settings in the settings mockup layout. */
@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
  imports: [IonContent, IonIcon, IonSpinner, SettingsHeaderComponent],
})
export class WifiPage {
  protected network = toSignal(this.mediaService.network$, { initialValue: null })
  protected networks = signal<WifiNetwork[]>([])
  protected loading = signal(true)
  protected readonly signalBars = [1, 2, 3, 4]

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
    this.loadNetworks()
  }

  // Scans for networks in range (takes a few seconds) and merges them with the saved ones.
  protected loadNetworks() {
    this.loading.set(true)
    this.wifiService.getNetworks().subscribe({
      next: (networks) => {
        this.networks.set(networks)
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
      },
    })
  }

  // 0-4 lit bars for the signal strength in percent.
  protected signalLevel(network: WifiNetwork): number {
    const signal = network.signal ?? 0
    if (!network.available || signal <= 0) {
      return 0
    }
    return signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1
  }

  // "2.4 GHz", "5 GHz" or "2.4 + 5 GHz" (both). For the connected network the band in use is added
  // when the network is available on more than one.
  protected bandText(network: WifiNetwork): string {
    const bands = [...(network.bands ?? [])].sort((x, y) => Number(x) - Number(y))
    if (bands.length === 0) {
      return ''
    }
    const text = `${bands.join(' + ')} GHz`
    return network.current && network.connectedBand && bands.length > 1
      ? `${text} (connected on ${network.connectedBand} GHz)`
      : text
  }

  addNetworkButtonPressed() {
    this.router.navigate(['/wifi/add'])
  }

  // A network in range that is not saved yet: add it with the name already filled in.
  connectNetworkButtonPressed(network: WifiNetwork) {
    this.router.navigate(['/wifi/add'], { state: { newNetworkSsid: network.ssid } })
  }

  changeNetworkButtonPressed(network: WifiNetwork) {
    this.router.navigate(['/wifi/add'], { state: { editNetwork: { id: network.id, ssid: network.ssid } } })
  }

  async deleteNetworkButtonPressed(network: WifiNetwork) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Netzwerk löschen',
      message: `Soll das gespeicherte Netzwerk "${network.ssid}" entfernt werden?`,
      buttons: [
        {
          text: 'Löschen',
          handler: () => {
            this.wifiService.removeNetwork(network.id).subscribe(() => {
              this.loadNetworks()
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
