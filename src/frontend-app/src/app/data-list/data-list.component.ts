import { ChangeDetectionStrategy, Component, Signal, output } from '@angular/core'
import { IonItem, IonList } from '@ionic/angular/standalone'

import { Data } from '@backend-api/data.model'
import { DataService } from '../services/data.service'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  selector: 'mupiapp-data-list',
  templateUrl: 'data-list.component.html',
  styleUrls: ['data-list.component.scss'],
  imports: [IonList, IonItem],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataListComponent {
  public entryClicked = output<Data>()
  protected data: Signal<Data[]>

  public constructor(private dataService: DataService) {
    this.data = toSignal(this.dataService.getData())
  }
}
