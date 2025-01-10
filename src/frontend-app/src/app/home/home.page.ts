import { ChangeDetectionStrategy, Component } from '@angular/core'
import { ClickedDataEntry, DataListComponent } from '../data-list/data-list.component'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { Router } from '@angular/router'
import { add } from 'ionicons/icons'
import { addIcons } from 'ionicons'

@Component({
  selector: 'mupiapp-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonTitle,
    IonBackButton,
    IonButtons,
    IonToolbar,
    IonHeader,
    DataListComponent,
    IonContent,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  public constructor(private router: Router) {
    addIcons({ add })
  }

  protected entryClicked(clickedData: ClickedDataEntry): void {
    this.router.navigate(['edit', clickedData.index])
  }
}
