import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { MediaService } from '../media.service';
import { Media } from '../media';
import { Network } from "../network";
import { Observable } from "rxjs";

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
})
export class EditPage implements OnInit {

  media: Observable<Record<any, any>[]>;
  network: Observable<Network>;

  constructor(
    private mediaService: MediaService,
    public alertController: AlertController,
    private router: Router
  ) {

  }

  ngOnInit() {
    // Subscribe
    this.network = this.mediaService.getNetworkObservable();
    this.media = this.mediaService.getRawMediaObservable();

    // Retreive data through subscription above
    this.mediaService.updateNetwork();
    this.mediaService.updateRawMedia();

    window.setTimeout(() => {
    }, 1000);
  }

  async deleteButtonPressed(index: number) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Warning',
      message: 'Do you want to delete the selected item from your library?',
      buttons: [
        {
          text: 'Ok',
          handler: () => {
            this.mediaService.deleteRawMediaAtIndex(index);
          }
        },
        {
          text: 'Cancel'
        }
      ]
    });

    this.mediaService.updateNetwork();
    this.mediaService.updateRawMedia();
    await alert.present();
  }

  ionViewWillEnter() {
    this.mediaService.updateNetwork();
    this.mediaService.updateRawMedia();
  }

  addButtonPressed() {
    this.router.navigate(['/add']);
  }

  adminButtonPressed() {
    this.router.navigate(['/admin']);
  }
}