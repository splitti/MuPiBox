import { ChangeDetectionStrategy, Component } from '@angular/core'
import { IonGrid, IonRow, IonSelect } from '@ionic/angular/standalone'

import { DataListComponent } from '../data-list/data-list.component'

@Component({
  selector: 'mupiapp-add-edit',
  templateUrl: 'add-edit.page.html',
  styleUrls: ['add-edit.page.scss'],
  imports: [IonRow, IonGrid, IonSelect],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEditPage {}
