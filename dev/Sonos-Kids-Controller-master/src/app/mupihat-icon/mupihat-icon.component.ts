import { AsyncPipe } from '@angular/common'
import { Component, computed, Signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { IonIcon } from '@ionic/angular/standalone'
import { map, of, switchMap, type Observable } from 'rxjs'
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
