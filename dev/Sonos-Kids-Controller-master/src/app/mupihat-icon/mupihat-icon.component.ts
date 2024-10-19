import { ActivatedRoute, Router } from '@angular/router'
import { Component, OnInit, ViewChild } from '@angular/core'
import { IonRange, IonicModule, NavController } from '@ionic/angular'
import { PlayerCmds, PlayerService } from '../player.service'

import type { AlbumStop } from '../albumstop'
import { ArtworkService } from '../artwork.service'
import { AsyncPipe } from '@angular/common'
import type { CurrentEpisode } from '../current.episode'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentPlaylist } from '../current.playlist'
import type { CurrentShow } from '../current.show'
import type { CurrentSpotify } from '../current.spotify'
import { FormsModule } from '@angular/forms'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { Monitor } from '../monitor'
import type { Mupihat } from '../mupihat'
import type { Observable } from 'rxjs'
import { SonosApiConfig } from '../sonos-api'

@Component({
  selector: 'mupihat-icon',
  templateUrl: './mupihat-icon.component.html',
  styleUrls: ['./mupihat-icon.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, AsyncPipe],
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
