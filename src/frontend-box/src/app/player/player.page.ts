import { Component, OnInit, ViewChild } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRange,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import {
  pause,
  play,
  playBack,
  playForward,
  playSkipBack,
  playSkipForward,
  shuffleOutline,
  volumeHighOutline,
  volumeLowOutline,
} from 'ionicons/icons'
import { PlayerCmds, PlayerService } from '../player.service'

import { AsyncPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NavController } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import type { Observable } from 'rxjs'
import type { AlbumStop } from '../albumstop'

import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    AsyncPipe,
    MupiHatIconComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonRange,
    IonButton,
    IonIcon,
  ],
})
export class PlayerPage implements OnInit {
  @ViewChild('range', { static: false }) range: IonRange

  media: Media
  resumemedia: Media
  albumStop: AlbumStop
  resumePlay = false
  resumeIndex: number
  resumeTimer = 0
  resumeAdded = false
  cover = ''
  playing = true
  updateProgression = false
  currentPlayedSpotify: CurrentSpotify
  currentPlayedLocal: CurrentMPlayer
  showTrackNr = 0
  goBackTimer = 0
  progress = 0
  shufflechanged = 0
  tmpProgressTime = 0
  public readonly spotify$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>

  constructor(
    private mediaService: MediaService,
    private route: ActivatedRoute,
    private router: Router,
    private navController: NavController,
    private playerService: PlayerService,
  ) {
    this.spotify$ = this.mediaService.current$
    this.local$ = this.mediaService.local$

    if (this.router.getCurrentNavigation()?.extras.state?.media) {
      this.media = this.router.getCurrentNavigation().extras.state.media
      if (this.media.category === 'resume') {
        this.resumePlay = true
      }
    }
    addIcons({
      volumeLowOutline,
      pause,
      play,
      volumeHighOutline,
      playSkipBack,
      playSkipForward,
      playBack,
      shuffleOutline,
      playForward,
    })
  }

  ngOnInit() {
    this.mediaService.current$.subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
    })
    this.mediaService.local$.subscribe((local) => {
      this.currentPlayedLocal = local
    })
    // Use cover from CurrentSpotify for Spotify content, fallback to media.cover for other types
    this.mediaService.current$.subscribe((spotify) => {
      if (this.media.type === 'spotify' && spotify?.item?.album?.images?.[0]?.url) {
        this.cover = spotify.item.album.images[0].url
      } else if (this.media.cover) {
        this.cover = this.media.cover
      } else {
        this.cover = '../assets/images/nocover_mupi.png'
      }
    })
    this.mediaService.albumStop$.subscribe((albumStop) => {
      this.albumStop = albumStop
    })
  }

  seek() {
    const newValue = +this.range.value
    if (this.media.type === 'spotify') {
      const duration = this.currentPlayedSpotify?.item.duration_ms
      this.playerService.seekPosition(duration * (newValue / 100))
    } else if (this.media.type === 'library' || this.media.type === 'rss') {
      this.playerService.seekPosition(newValue)
    }
  }

  updateProgress() {
    this.mediaService.current$.subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
    })
    this.mediaService.local$.subscribe((local) => {
      this.currentPlayedLocal = local
    })

    this.playing = !this.currentPlayedLocal?.pause
    if (this.playing) {
      this.resumeTimer++
      if (this.resumeTimer % 30 === 0) {
        this.saveResumeFiles()
      }
    }

    if (this.media.type === 'spotify') {
      const seek = this.currentPlayedSpotify?.progress_ms || 0
      if (this.currentPlayedSpotify?.item != null) {
        this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0
      }
      if (this.playing && !this.currentPlayedSpotify?.is_playing) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.navController.back()
        }
      }
      setTimeout(() => {
        if (this.updateProgression) {
          this.updateProgress()
        }
      }, 1000)
    } else if (this.media.type === 'library' || this.media.type === 'rss') {
      const seek = this.currentPlayedLocal?.progressTime || 0
      this.progress = seek || 0
      if (
        this.media.type === 'library' &&
        this.playing &&
        !this.currentPlayedLocal?.playing &&
        this.currentPlayedLocal?.currentTracknr === this.currentPlayedLocal?.totalTracks
      ) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.navController.back()
        }
      }
      if (this.media.type === 'rss' && this.playing && !this.currentPlayedLocal?.playing) {
        this.goBackTimer++
        if (this.goBackTimer > 100) {
          this.navController.back()
        }
      }
      setTimeout(() => {
        if (this.updateProgression) {
          this.updateProgress()
        }
      }, 1000)
    }
  }

  async ionViewWillEnter() {
    this.updateProgression = true
    if (this.resumePlay) {
      await this.resumePlayback()
    } else {
      const success = await this.playerService.playMedia(this.media)
      if (!success && this.media.type === 'spotify') {
        console.error('Failed to start Spotify playback - player health check failed')
      }
    }
    this.updateProgress()

    if (this.media.shuffle) {
      setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.SHUFFLEON)
        setTimeout(() => {
          this.skipNext()
        }, 1000)
      }, 5000)
    }
  }

  ionViewWillLeave() {
    if (
      (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss') &&
      !this.media.shuffle &&
      this.resumeTimer > 30 &&
      this.playing
    ) {
      this.saveResumeFiles()
    }
    this.updateProgression = false
    if (this.media.shuffle || this.shufflechanged) {
      this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF)
    }
    this.playerService.sendCmd(PlayerCmds.STOP)
    this.resumePlay = false
    if (this.media.type === 'spotify' && (this.media.category === 'music' || this.media.category === 'other')) {
      if (this.shufflechanged % 2 === 1) {
        this.mediaService.editRawMediaAtIndex(this.media.index, this.media)
      }
    }
    if (this.albumStop?.albumStop === 'On') {
      this.playerService.sendCmd(PlayerCmds.ALBUMSTOP)
    }
  }

  async resumePlayback() {
    if (this.media.type === 'spotify' && !this.media.shuffle) {
      const success = await this.playerService.resumeMedia(this.media)
      if (!success) {
        console.error('Failed to resume Spotify playback - player health check failed')
      }
    } else if (this.media.type === 'library') {
      this.media.category = this.media.resumelocalalbum
      const success = await this.playerService.playMedia(this.media)
      if (!success) {
        console.error('Failed to start local library playback')
        return
      }
      let j = 1
      for (let i = 1; i < this.media.resumelocalcurrentTracknr; i++) {
        setTimeout(() => {
          this.skipNext()
          j = i + 1
          if (j === this.media.resumelocalcurrentTracknr) {
            setTimeout(() => {
              this.playerService.seekPosition(this.media.resumelocalprogressTime)
            }, 2000)
          }
        }, 2000)
      }
      if (this.media.resumelocalcurrentTracknr === 1) {
        setTimeout(() => {
          this.playerService.seekPosition(this.media.resumelocalprogressTime)
        }, 2000)
      }
    } else if (this.media.type === 'rss') {
      const success = await this.playerService.playMedia(this.media)
      if (!success) {
        console.error('Failed to start RSS playback')
        return
      }
      setTimeout(() => {
        this.playerService.seekPosition(this.media.resumerssprogressTime)
      }, 2000)
    }
  }

  saveResumeFiles() {
    this.resumemedia = Object.assign({}, this.media)
    this.mediaService.current$.subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
    })
    this.mediaService.local$.subscribe((local) => {
      this.currentPlayedLocal = local
    })
    if (this.resumemedia.type === 'spotify' && this.resumemedia?.showid) {
      this.resumemedia.resumespotifytrack_number = this.currentPlayedSpotify?.item?.track_number || 1
      this.resumemedia.resumespotifyprogress_ms = this.currentPlayedSpotify?.progress_ms || 0
      this.resumemedia.resumespotifyduration_ms = this.currentPlayedSpotify?.item?.duration_ms || 0
    } else if (this.resumemedia.type === 'spotify') {
      this.resumemedia.resumespotifytrack_number = this.currentPlayedSpotify?.item.track_number || 0
      this.resumemedia.resumespotifyprogress_ms = this.currentPlayedSpotify?.progress_ms || 0
      this.resumemedia.resumespotifyduration_ms = this.currentPlayedSpotify?.item.duration_ms || 0
    } else if (this.resumemedia.type === 'library') {
      this.resumemedia.resumelocalalbum = this.resumemedia.category
      this.resumemedia.resumelocalcurrentTracknr = this.currentPlayedLocal?.currentTracknr || 0
      this.resumemedia.resumelocalprogressTime = this.currentPlayedLocal?.progressTime || 0
    } else if (this.resumemedia.type === 'rss') {
      this.resumemedia.resumerssprogressTime = this.currentPlayedLocal?.progressTime || 0
    }
    this.resumemedia.category = 'resume'
    if (this.resumemedia.index !== undefined) {
      this.resumeIndex = this.resumemedia.index
      this.resumemedia.index = undefined
    }
    if (this.resumePlay || this.resumeAdded) {
      this.mediaService.editRawResumeAtIndex(this.resumeIndex, this.resumemedia)
    } else {
      this.mediaService.addRawResume(this.resumemedia)
      this.resumeAdded = true
      this.resumeIndex = 99
      setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.MAXRESUME)
      }, 2000)
    }
  }

  volUp() {
    this.playerService.sendCmd(PlayerCmds.VOLUMEUP)
  }

  volDown() {
    this.playerService.sendCmd(PlayerCmds.VOLUMEDOWN)
  }

  skipPrev() {
    if (this.playing) {
      this.playerService.sendCmd(PlayerCmds.PREVIOUS)
    } else {
      this.playing = true
      this.playerService.sendCmd(PlayerCmds.PREVIOUS)
    }
  }

  skipNext() {
    if (this.playing) {
      this.playerService.sendCmd(PlayerCmds.NEXT)
    } else {
      this.playing = true
      this.playerService.sendCmd(PlayerCmds.NEXT)
    }
  }

  toggleshuffle() {
    if (this.media.shuffle) {
      this.shufflechanged++
      this.media.shuffle = false
      this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF)
    } else {
      this.shufflechanged++
      this.media.shuffle = true
      this.playerService.sendCmd(PlayerCmds.SHUFFLEON)
    }
  }

  playPause() {
    if (this.playing) {
      //this.playing = false;
      this.playerService.sendCmd(PlayerCmds.PAUSE)
      if (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss') {
        this.saveResumeFiles()
      }
    } else {
      //this.playing = true;
      this.playerService.sendCmd(PlayerCmds.PLAY)
    }
  }

  seekForward() {
    this.playerService.sendCmd(PlayerCmds.SEEKFORWARD)
  }

  seekBack() {
    this.playerService.sendCmd(PlayerCmds.SEEKBACK)
  }
}
