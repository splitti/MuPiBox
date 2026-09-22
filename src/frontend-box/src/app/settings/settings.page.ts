import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, inject, Signal, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { AlertController, IonContent, IonIcon } from '@ionic/angular/standalone'
import { map, of, switchMap } from 'rxjs'
import type { BluetoothStatus } from '../bluetooth'
import { BluetoothService } from '../bluetooth.service'
import { registerLucideIcons } from '../icons/lucide-icons'
import { MediaService } from '../media.service'
import type { Mupihat } from '../mupihat'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerService } from '../player.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'

/** "Secret menu": one card with the settings entries, laid out as in the settings mockup. */
@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [IonContent, IonIcon, MupiHatIconComponent, SettingsHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly mediaService = inject(MediaService)
  private readonly playerService = inject(PlayerService)
  private readonly bluetoothService = inject(BluetoothService)
  private readonly router = inject(Router)
  private readonly alertController = inject(AlertController)
  private readonly http = inject(HttpClient)

  protected readonly network = toSignal(this.mediaService.network$, { initialValue: null })
  protected readonly bluetooth = signal<BluetoothStatus | undefined>(undefined)

  private readonly hatActive = toSignal(this.playerService.getConfig().pipe(map((config) => config.hat_active)))
  private readonly mupihat: Signal<Mupihat | undefined> = toSignal(
    toObservable(this.hatActive).pipe(switchMap((active) => (active ? this.mediaService.mupihat$ : of(undefined)))),
  )

  /** "62 % · wird geladen" when a MuPiHAT with battery is present. */
  protected readonly batteryText = computed(() => {
    const hat = this.mupihat()
    if (!hat || hat.BatteryConnected !== 1) {
      return ''
    }
    const level = hat.Bat_SOC ? hat.Bat_SOC.replace('%', ' %') : ''
    return hat.IBus > 0 ? `${level} · wird geladen` : level
  })

  /** Connected device, otherwise whether Bluetooth is on. */
  protected readonly bluetoothText = computed(() => {
    const status = this.bluetooth()
    if (!status) {
      return ''
    }
    if (!status.powered) {
      return 'Aus'
    }
    return status.paired.find((device) => device.connected)?.name ?? 'Ein'
  })

  public constructor() {
    registerLucideIcons()
  }

  ionViewWillEnter() {
    this.bluetoothService.getStatus().subscribe({
      next: (status) => this.bluetooth.set(status),
      error: () => this.bluetooth.set(undefined),
    })
  }

  protected openWifi(): void {
    this.router.navigate(['/wifi'])
  }

  protected openBluetooth(): void {
    this.router.navigate(['/bluetooth'])
  }

  protected openMedia(): void {
    this.router.navigate(['/edit'])
  }

  protected async shutdownMessage() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Neustart / Ausschalten',
      message: 'Soll die MuPiBox neu gestartet oder ausgeschaltet werden?',
      buttons: [
        {
          text: 'Ausschalten',
          handler: () => {
            this.http.post('/api/shutdown', {}).subscribe()
          },
        },
        {
          text: 'Neustart',
          handler: () => {
            this.http.post('/api/reboot', {}).subscribe()
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
