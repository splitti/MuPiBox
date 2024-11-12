import { ChangeDetectionStrategy, Component } from '@angular/core'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
