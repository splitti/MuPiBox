import { ChangeDetectionStrategy, Component } from '@angular/core'

import { DataService } from 'mupibox-frontend-lib'

@Component({
  selector: 'mupiapp-data-list',
  templateUrl: 'data-list.component.html',
  styleUrls: ['data-list.component.scss'],
  imports: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataListComponent {
  public constructor(private dataService: DataService) {
    dataService.print()
  }
}
