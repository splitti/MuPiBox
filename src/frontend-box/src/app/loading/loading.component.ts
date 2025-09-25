import { Component, input } from '@angular/core'

import { IonSpinner } from '@ionic/angular/standalone'

@Component({
  selector: 'mupi-loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  imports: [IonSpinner],
})
export class LoadingComponent {
  protected readonly loading = input.required<boolean>()
}
