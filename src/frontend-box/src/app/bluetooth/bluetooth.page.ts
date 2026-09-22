import { Component, signal } from '@angular/core'
import { AlertController, IonContent, IonIcon, IonSpinner, IonToggle } from '@ionic/angular/standalone'
import type { BluetoothDevice, BluetoothStatus } from '../bluetooth'
import { BluetoothService } from '../bluetooth.service'
import { registerLucideIcons } from '../icons/lucide-icons'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'

@Component({
  selector: 'app-bluetooth',
  templateUrl: './bluetooth.page.html',
  styleUrls: ['./bluetooth.page.scss'],
  imports: [IonContent, IonIcon, IonSpinner, IonToggle, SettingsHeaderComponent],
})
export class BluetoothPage {
  protected status = signal<BluetoothStatus>({ powered: false, paired: [] })
  protected statusLoading = signal(true)
  protected scanning = signal(false)
  protected foundDevices = signal<BluetoothDevice[]>([])
  protected pairingMac = signal<string | null>(null)

  constructor(
    private bluetoothService: BluetoothService,
    private alertController: AlertController,
  ) {
    registerLucideIcons()
  }

  ionViewWillEnter() {
    this.loadStatus()
  }

  private loadStatus() {
    this.statusLoading.set(true)
    this.bluetoothService.getStatus().subscribe({
      next: (status) => {
        this.status.set(status)
        this.statusLoading.set(false)
      },
      error: () => {
        this.statusLoading.set(false)
      },
    })
  }

  togglePower(event: CustomEvent) {
    const on = (event.detail as { checked: boolean }).checked
    // Update immediately for instant feedback; bluetoothd needs a brief moment
    // after start_bt.sh/stop_bt.sh before `bluetoothctl show` reflects the new state.
    this.status.update((status) => ({ ...status, powered: on }))
    this.foundDevices.set([])
    this.bluetoothService.setPower(on).subscribe(() => {
      setTimeout(() => this.loadStatus(), 800)
    })
  }

  scanForDevices() {
    this.scanning.set(true)
    this.bluetoothService.scan().subscribe({
      next: (devices) => {
        const pairedMacs = new Set(this.status().paired.map((device) => device.mac))
        this.foundDevices.set(devices.filter((device) => !pairedMacs.has(device.mac)))
        this.scanning.set(false)
      },
      error: () => {
        this.scanning.set(false)
      },
    })
  }

  async pairDeviceButtonPressed(device: BluetoothDevice) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Gerät koppeln',
      message: `Mit "${device.name}" koppeln?`,
      buttons: [
        {
          text: 'Koppeln',
          handler: () => {
            this.pairingMac.set(device.mac)
            this.bluetoothService.pair(device.mac).subscribe({
              next: () => {
                this.pairingMac.set(null)
                this.foundDevices.update((devices) => devices.filter((d) => d.mac !== device.mac))
                this.loadStatus()
              },
              error: () => {
                this.pairingMac.set(null)
              },
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

  async removeDeviceButtonPressed(device: BluetoothDevice) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Gerät entfernen',
      message: `Soll "${device.name}" entfernt werden?`,
      buttons: [
        {
          text: 'Entfernen',
          handler: () => {
            this.bluetoothService.remove(device.mac).subscribe(() => {
              this.loadStatus()
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
}
