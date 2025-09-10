import { Component, OnInit } from '@angular/core'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { NavigationExtras, Router } from '@angular/router'
import { PlayerCmds, PlayerService } from '../player.service'
import {
  addOutline,
  arrowBackOutline,
  brushOutline,
  close,
  powerOutline,
  trashOutline,
  wifiOutline,
} from 'ionicons/icons'

import { ActivityIndicatorService } from '../activity-indicator.service'
import { AlertController } from '@ionic/angular/standalone'
import { AsyncPipe } from '@angular/common'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { Network } from '../network'
import type { Observable } from 'rxjs'
import { addIcons } from 'ionicons'

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonGrid,
    IonRow,
    IonCol,
    IonLabel,
  ],
})
export class EditPage implements OnInit {
  media: Observable<Media[]>
  activityIndicatorVisible = false

  protected network$: Observable<Network>

  constructor(
    private mediaService: MediaService,
    public alertController: AlertController,
    private playerService: PlayerService,
    private router: Router,
    private activityIndicatorService: ActivityIndicatorService,
  ) {
    addIcons({ addOutline, arrowBackOutline, wifiOutline, trashOutline, powerOutline, brushOutline, close })
    this.network$ = this.mediaService.network$
  }

  ngOnInit() {
    this.media = this.mediaService.fetchRawMedia()
  }

  async deleteButtonPressed(item: Media) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Warning',
      message: 'Do you want to delete the selected item from your library and local storage?',
      buttons: [
        {
          text: 'Ok',
          handler: () => {
            this.activityIndicatorService.create().then((indicator) => {
              this.activityIndicatorVisible = true
              indicator.present().then(() => {
                this.mediaService.deleteRawMediaAtIndex(item.index)
                setTimeout(async () => {
                  const check = this.mediaService.getResponse()
                  console.log(`write check: ${check}`)
                  if (check === 'error' || check === 'locked') {
                    this.activityIndicatorService.dismiss()
                    this.activityIndicatorVisible = false
                    if (check === 'error') {
                      const alert = await this.alertController.create({
                        cssClass: 'alert',
                        header: 'Warning',
                        message: 'Error to delet the entry.',
                        buttons: [
                          {
                            text: 'Okay',
                          },
                        ],
                      })
                      await alert.present()
                    } else if (check === 'locked') {
                      const alert = await this.alertController.create({
                        cssClass: 'alert',
                        header: 'Warning',
                        message: 'File locked, please try in a moment again.',
                        buttons: [
                          {
                            text: 'Okay',
                          },
                        ],
                      })
                      await alert.present()
                    }
                  } else {
                    console.log(`Index: ${item.index}`)
                    if (item.type === 'library') {
                      this.playerService.deleteLocal(item)
                    }
                    this.playerService.sendCmd(PlayerCmds.INDEX)
                    setTimeout(() => {
                      this.media = this.mediaService.fetchRawMedia()
                      this.activityIndicatorService.dismiss()
                      this.activityIndicatorVisible = false
                    }, 2000)
                  }
                }, 2000)
              })
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

  editButtonPreddes(item: Media) {
    this.activityIndicatorService.create().then((indicator) => {
      this.activityIndicatorVisible = true
      indicator.present().then(() => {
        const navigationExtras: NavigationExtras = {
          state: {
            media: item,
          },
        }
        this.router.navigate(['/add'], navigationExtras)
      })
    })
  }

  ionViewWillEnter() {
    this.media = this.mediaService.fetchRawMedia()
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  addButtonPressed() {
    this.router.navigate(['/add'])
  }

  adminButtonPressed() {
    this.router.navigate(['/wifi'])
  }

  async clearResumePressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Resume',
      message: 'Do you want to clear all resume media?',
      buttons: [
        {
          text: 'Clear',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.CLEARRESUME)
            setTimeout(() => {
              this.media = this.mediaService.fetchRawMedia()
            }, 2000)
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  async shutdownMessage() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Powermanagement',
      message: 'Do you want to shutdown the MuPiBox?',
      buttons: [
        {
          text: 'Shutdown',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.SHUTOFF)
          },
        },
        {
          text: 'Reboot',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.REBOOT)
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
