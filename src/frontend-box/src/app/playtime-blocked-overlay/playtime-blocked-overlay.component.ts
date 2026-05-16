import { ChangeDetectionStrategy, Component } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { moonOutline, musicalNotesOutline } from 'ionicons/icons'

@Component({
  selector: 'mupi-playtime-blocked',
  templateUrl: './playtime-blocked-overlay.component.html',
  styleUrls: ['./playtime-blocked-overlay.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaytimeBlockedOverlayComponent {
  constructor() {
    addIcons({ moonOutline, musicalNotesOutline })
  }
}
