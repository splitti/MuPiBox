import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  selector: 'mupiapp-data-list',
  templateUrl: 'data-list.component.html',
  styleUrls: ['data-list.component.scss'],
  imports: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataListComponent {}
