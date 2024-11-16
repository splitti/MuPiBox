import { ChangeDetectionStrategy, Component } from '@angular/core'
@Component({
  selector: 'mupiapp-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
