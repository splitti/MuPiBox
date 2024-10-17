import { Component, OnInit } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'
import { AlertController, IonicModule } from '@ionic/angular'
import { PlayerCmds, PlayerService } from '../player.service'

import { AsyncPipe } from '@angular/common'
import type { Observable } from 'rxjs'
import { ActivityIndicatorService } from '../activity-indicator.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { Network } from '../network'

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
  standalone: true,
  imports: [IonicModule, AsyncPipe],
})
export class EditPage implements OnInit {
  media: Observable<Media[]>
  network: Observable<Network>
  networkparameter: Network
  activityIndicatorVisible = false

  constructor(
    private mediaService: MediaService,
    public alertController: AlertController,
    private playerService: PlayerService,
    private router: Router,
    private activityIndicatorService: ActivityIndicatorService,
  ) {}

  ngOnInit() {
    // Subscribe
    this.network = this.mediaService.getNetworkObservable()
    this.media = this.mediaService.getRawMediaObservable()

    // Retreive data through subscription above
    this.mediaService.updateNetwork()
    this.mediaService.updateRawMedia()

    window.setTimeout(() => {}, 1000)
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
                      this.network = this.mediaService.getNetworkObservable()
                      this.media = this.mediaService.getRawMediaObservable()
                      this.mediaService.updateRawMedia()
                      this.mediaService.updateNetwork()
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
    this.network = this.mediaService.getNetworkObservable()
    this.media = this.mediaService.getRawMediaObservable()

    this.mediaService.updateNetwork()
    this.mediaService.updateRawMedia()
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
    this.router.navigate(['/admin'])
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
              this.media = this.mediaService.getRawMediaObservable()
              this.mediaService.updateRawMedia()
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
