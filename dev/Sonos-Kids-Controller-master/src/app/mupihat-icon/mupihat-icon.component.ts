import { AsyncPipe } from '@angular/common'
import { Component, Signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { IonIcon } from '@ionic/angular/standalone'
import { type Observable } from 'rxjs'
import { MediaService } from '../media.service'
import type { Mupihat } from '../mupihat'
import { PlayerService } from '../player.service'
import { SonosApiConfig } from '../sonos-api'

@Component({
  selector: 'mupihat-icon',
  templateUrl: './mupihat-icon.component.html',
  styleUrls: ['./mupihat-icon.component.scss'],
  standalone: true,
  imports: [IonIcon],
})
export class MupiHatIconComponent {
  protected readonly mupihat: Signal<Mupihat>
  protected readonly config: Signal<SonosApiConfig>

  public constructor(
    private playerService: PlayerService,
    private mediaService: MediaService,
  ) {
    this.mupihat = toSignal(this.mediaService.mupihat$)
    this.config = toSignal(this.playerService.getConfig())
  }
}
