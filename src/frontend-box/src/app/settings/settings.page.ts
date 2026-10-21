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
import { DisplayTextsService } from '../display-texts.service'
import { ElternMagicLinkService } from '../eltern-magic-link.service'
import { MediaService } from '../media.service'
import { ParentAccessService } from '../parent-access/parent-access.service'
import { StatusComponent } from '../status/status.component'

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
    StatusComponent,
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
  private elternMagicLink = inject(ElternMagicLinkService)
  // (in the box's display language, as the lock screen and the other overlays)
  protected readonly texts = inject(DisplayTextsService)
  // (locked and the parent access over: nothing acts - see ParentAccessService.lockedOut)
  private parentAccess = inject(ParentAccessService)
  protected network = toSignal(this.mediaService.network$, { initialValue: null })

  protected menuEntries: Signal<SettingsMenuEntry[]> = computed(() => {
    // ("Add media" is gone: the library is kept in the app now - the parents' web app below)
    const out: SettingsMenuEntry[] = [
      {
        name: this.texts.text('settingsNetwork'),
        imgSrc: of('../../assets/wifi.svg'),
        data: 'wifi',
      },
      {
        name: this.texts.text('settingsBluetooth'),
        imgSrc: of('../../assets/bluetooth.svg'),
        data: 'bluetooth',
      },
      {
        name: this.texts.text('settingsPower'),
        imgSrc: of('../../assets/power.svg'),
        data: 'shutdown',
      },
      {
        name: this.texts.text('settingsParentApp'),
        imgSrc: of('../../assets/eltern.svg'),
        data: 'eltern-webapp',
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
    if (entry.data === 'wifi') {
      this.router.navigate(['/wifi'])
    } else if (entry.data === 'bluetooth') {
      this.router.navigate(['/bluetooth'])
    } else if (entry.data === 'shutdown') {
      this.shutdownMessage()
    } else if (entry.data === 'eltern-webapp') {
      if (this.parentAccess.lockedOut()) return
      // Shows the magic-link QR overlay. The box IP comes from the network
      // signal; generateAndShow() handles the undefined case itself by
      // falling back to the hostname.
      void this.elternMagicLink.generateAndShow(this.network()?.ip)
    }
  }

  private async shutdownMessage() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: this.texts.text('settingsPower'),
      message: this.texts.text('powerQuestion'),
      buttons: [
        {
          text: this.texts.text('powerShutdown'),
          handler: () => {
            if (this.parentAccess.lockedOut()) return
            // LOW-6: previously `subscribe()` with no error handler. A
            // failed POST (network blip, backend down) silently disappeared,
            // and the user got an Ionic alert dismiss with no feedback that
            // the shutdown didn't fire. Wire up an error logger so the
            // failure at least lands in chrome_debug.log.
            this.http.post('/api/shutdown', {}).subscribe({
              error: (err) => console.error('[settings] /api/shutdown failed:', err),
            })
          },
        },
        {
          text: this.texts.text('powerReboot'),
          handler: () => {
            if (this.parentAccess.lockedOut()) return
            // LOW-6: same fix.
            this.http.post('/api/reboot', {}).subscribe({
              error: (err) => console.error('[settings] /api/reboot failed:', err),
            })
          },
        },
        {
          text: this.texts.text('powerCancel'),
        },
      ],
    })

    // (the parent access ended while the question was being made: not shown)
    if (this.parentAccess.lockedOut()) return
    await alert.present()
  }
}
