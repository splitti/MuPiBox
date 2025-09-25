import { ChangeDetectionStrategy, Component, Signal } from '@angular/core'
import { map, of, switchMap } from 'rxjs'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import { IonIcon } from '@ionic/angular/standalone'
import { MediaService } from '../media.service'
import type { Mupihat } from '../mupihat'
import { PlayerService } from '../player.service'

@Component({
  selector: 'mupihat-icon',
  templateUrl: './mupihat-icon.component.html',
  styleUrls: ['./mupihat-icon.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MupiHatIconComponent {
  protected readonly mupihat: Signal<Mupihat | undefined>
  protected readonly hat_active: Signal<boolean>

  public constructor(
    private playerService: PlayerService,
    private mediaService: MediaService,
  ) {
    this.hat_active = toSignal(this.playerService.getConfig().pipe(map((config) => config.hat_active)))
    this.mupihat = toSignal(
      toObservable(this.hat_active).pipe(
        switchMap((hat_active) => (hat_active ? this.mediaService.mupihat$ : of(undefined))),
      ),
    )
  }
}
