import { Component, signal } from '@angular/core'
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { arrowBackOutline, bluetoothOutline, searchOutline, trashOutline } from 'ionicons/icons'
import type { BluetoothDevice, BluetoothStatus } from '../bluetooth'
import { BluetoothService } from '../bluetooth.service'

@Component({
  selector: 'app-bluetooth',
  templateUrl: './bluetooth.page.html',
  styleUrls: ['./bluetooth.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonToggle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
  ],
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
    addIcons({ arrowBackOutline, bluetoothOutline, searchOutline, trashOutline })
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
      header: 'Pair device',
      message: `Do you want to pair with "${device.name}"?`,
      buttons: [
        {
          text: 'Pair',
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
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  async removeDeviceButtonPressed(device: BluetoothDevice) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Remove device',
      message: `Do you want to remove "${device.name}"?`,
      buttons: [
        {
          text: 'Remove',
          handler: () => {
            this.bluetoothService.remove(device.mac).subscribe(() => {
              this.loadStatus()
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
}
