import { ChangeDetectionStrategy, Component, OnInit, Signal, ViewChild, WritableSignal, signal } from '@angular/core'
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
  RangeCustomEvent,
} from '@ionic/angular/standalone'
import { PlayerCmds, PlayerService } from '../player.service'
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

import type { AlbumStop } from '../albumstop'
import { ArtworkService } from '../artwork.service'
import { AsyncPipe } from '@angular/common'
import { Media as BackendMedia } from '@backend-api/media.model'
import type { CurrentEpisode } from '../current.episode'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentPlaylist } from '../current.playlist'
import type { CurrentShow } from '../current.show'
import type { CurrentSpotify } from '../current.spotify'
import { FormsModule } from '@angular/forms'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { NavController } from '@ionic/angular/standalone'
import type { Observable } from 'rxjs'
import { Router } from '@angular/router'
import { addIcons } from 'ionicons'
import { toSignal } from '@angular/core/rxjs-interop'

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerPage {
  protected backendMedia: WritableSignal<BackendMedia | undefined> = signal(undefined)
  protected resuming: WritableSignal<boolean> = signal(false)

  protected img: WritableSignal<string | undefined> = signal(undefined)

  media: Media
  resumemedia: Media
  resumePlay = false
  resumeIndex: number
  resumeTimer = 0
  resumeAdded = false
  playing = true
  updateProgression = false
  playlistTrackNr = 0
  showTrackNr = 0
  goBackTimer = 0
  progress = 0
  shufflechanged = 0

  protected readonly spotify: Signal<CurrentSpotify>
  protected readonly local: Signal<CurrentMPlayer>
  protected readonly playlist: Signal<CurrentPlaylist>
  protected readonly episode: Signal<CurrentEpisode>
  protected readonly show: Signal<CurrentShow>
  protected readonly albumStop: Signal<AlbumStop>

  constructor(
    private mediaService: MediaService,
    private router: Router,
    private navController: NavController,
    private playerService: PlayerService,
  ) {
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

    this.backendMedia.set(this.router.getCurrentNavigation().extras.state?.media)
    this.resuming.set(this.router.getCurrentNavigation().extras.state?.resuming ?? false)
    this.img.set(this.backendMedia().img)

    this.spotify = toSignal(this.mediaService.current$)
    this.local = toSignal(this.mediaService.local$)
    this.playlist = toSignal(this.mediaService.playlist$)
    this.episode = toSignal(this.mediaService.episode$)
    this.show = toSignal(this.mediaService.show$)
    this.albumStop = toSignal(this.mediaService.albumStop$)
  }

  protected seek(event: Event): void {
    let newValue = (event as RangeCustomEvent).detail.value as number

    if (this.backendMedia().type === 'spotifyEpisode') {
      newValue = (this.episode()?.duration_ms ?? 0.0) * (newValue / 100)
    } else if (this.backendMedia().type === 'spotifyPlaylist') {
      newValue = (this.spotify()?.item.duration_ms ?? 0.0) * (newValue / 100)
    }
    this.playerService.seekPosition(newValue)
  }

  updateProgress() {
    this.playing = !this.currentPlayedLocal?.pause

    // Periodically update the resume list.
    if (this.playing) {
      this.resumeTimer++
      if (this.resumeTimer % 30 === 0) {
        this.saveResumeFiles()
      }
    }

    if (this.media.type === 'spotify') {
      const seek = this.currentPlayedSpotify?.progress_ms || 0
      if (this.media.showid?.length > 0) {
        this.progress = (seek / this.currentEpisode?.duration_ms) * 100 || 0
      } else {
        if (this.currentPlayedSpotify?.item != null) {
          this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0
        }
      }
      if (this.media.playlistid) {
        this.currentPlaylist?.items.forEach((element, index) => {
          if (this.currentPlayedSpotify?.item.id === element.track?.id) {
            this.playlistTrackNr = index + 1 // +1 since we want human-readable indexing in the frontend.
            this.img.set(element.track.album.images[1].url)
          }
        })
      }
      if (this.media.showid) {
        this.currentShow?.items.forEach((element, index) => {
          if (this.currentPlayedLocal?.activeEpisode === element?.id) {
            this.showTrackNr = this.currentEpisode.show.total_episodes - index
            this.img.set(element.images[1].url)
          }
        })
      }
      if (this.playing && !this.currentPlayedSpotify?.is_playing) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.navController.back()
        }
      }
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
    }
    // Periodicially refresh the progress.
    setTimeout(() => {
      if (this.updateProgression) {
        this.updateProgress()
      }
    }, 1000)
  }

  ionViewWillEnter() {
    this.updateProgression = true
    if (this.resumePlay) {
      this.resumePlayback()
    } else {
      this.playerService.playMedia(this.media)
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
    if (this.albumStop().albumStop === 'On') {
      this.playerService.sendCmd(PlayerCmds.ALBUMSTOP)
    }
  }

  resumePlayback() {
    if (this.media.type === 'spotify' && !this.media.shuffle) {
      this.playerService.resumeMedia(this.media)
    } else if (this.media.type === 'library') {
      this.media.category = this.media.resumelocalalbum
      this.playerService.playMedia(this.media)
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
      this.playerService.playMedia(this.media)
      setTimeout(() => {
        this.playerService.seekPosition(this.media.resumerssprogressTime)
      }, 2000)
    }
  }

  saveResumeFiles() {
    if (!this.resumePlay) {
      this.resumemedia = Object.assign({}, this.media)
    } else {
      this.resumemedia = this.media
    }
    if (this.resumemedia.type === 'spotify' && this.resumemedia?.showid) {
      this.resumemedia.resumespotifytrack_number = 1
      this.resumemedia.resumespotifyprogress_ms = this.currentPlayedSpotify?.progress_ms || 0
      this.resumemedia.resumespotifyduration_ms = this.currentEpisode?.duration_ms || 0
    } else if (this.resumemedia.type === 'spotify') {
      if (this.resumemedia.playlistid) {
        this.resumemedia.resumespotifytrack_number = this.playlistTrackNr || 0
      } else {
        this.resumemedia.resumespotifytrack_number = this.currentPlayedSpotify?.item.track_number || 0
      }
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
    this.playing = true
    this.playerService.sendCmd(PlayerCmds.PREVIOUS)
  }

  skipNext() {
    this.playing = true
    this.playerService.sendCmd(PlayerCmds.NEXT)
  }

  toggleshuffle() {
    this.shufflechanged++
    this.playerService.sendCmd(this.media.shuffle ? PlayerCmds.SHUFFLEOFF : PlayerCmds.SHUFFLEON)
    this.media.shuffle = !this.media.shuffle
  }

  playPause() {
    if (this.playing) {
      this.playerService.sendCmd(PlayerCmds.PAUSE)
      if (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss') {
        this.saveResumeFiles()
      }
    } else {
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
