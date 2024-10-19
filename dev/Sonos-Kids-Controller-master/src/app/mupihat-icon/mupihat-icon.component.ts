import { AsyncPipe } from '@angular/common'
import { Component } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { MediaService } from '../media.service'
import type { Mupihat } from '../mupihat'
import type { Observable } from 'rxjs'
import { PlayerService } from '../player.service'
import { SonosApiConfig } from '../sonos-api'

@Component({
  selector: 'mupihat-icon',
  templateUrl: './mupihat-icon.component.html',
  styleUrls: ['./mupihat-icon.component.scss'],
  standalone: true,
  imports: [AsyncPipe, IonIcon],
})
export class MupiHatIconComponent {
  protected hat_active = false
  protected readonly mupihat$: Observable<Mupihat>
  protected readonly config$: Observable<SonosApiConfig>

  public constructor(
    private mediaService: MediaService,
    private playerService: PlayerService,
  ) {
    this.mupihat$ = this.mediaService.mupihat$
    this.config$ = this.playerService.getConfig()
  }
}
