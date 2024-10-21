import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Component } from '@angular/core'
import { IonIcon } from '@ionic/angular/standalone'
import { type Observable, interval, switchMap } from 'rxjs'
import type { Mupihat } from '../mupihat'
import { PlayerService } from '../player.service'
import { SonosApiConfig } from '../sonos-api'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { MediaService } from '../media.service'

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
    private playerService: PlayerService,
    private mediaService: MediaService,
  ) {
    this.mupihat$ = this.mediaService.mupihat$.pipe(takeUntilDestroyed())
    this.config$ = this.playerService.getConfig()
  }
}
