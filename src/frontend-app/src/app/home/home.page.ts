import { ChangeDetectionStrategy, Component } from '@angular/core'
import { IonContent, IonFab, IonFabButton, IonIcon } from '@ionic/angular/standalone'

import { Data } from '@backend-api/data.model'
import { DataListComponent } from '../data-list/data-list.component'
import { Router } from '@angular/router'
import { add } from 'ionicons/icons'
import { addIcons } from 'ionicons'

@Component({
  selector: 'mupiapp-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [DataListComponent, IonContent, IonFab, IonFabButton, IonIcon],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  public constructor(private router: Router) {
    addIcons({ add })
  }

  protected entryClicked(data: Data): void {
    console.log(data)
    this.router.navigate(['edit', data.index])
  }
}
