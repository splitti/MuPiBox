import { ChangeDetectionStrategy, Component } from '@angular/core'

import { DataListComponent } from '../data-list/data-list.component'
import { IonContent } from '@ionic/angular/standalone'

@Component({
  selector: 'mupiapp-add-edit',
  templateUrl: 'add-edit.page.html',
  styleUrls: ['add-edit.page.scss'],
  imports: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEditPage {}
