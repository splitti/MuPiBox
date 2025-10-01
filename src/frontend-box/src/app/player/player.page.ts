import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  ViewChild,
  WritableSignal,
  computed,
  signal,
} from '@angular/core'
import { AsyncPipe } from '@angular/common'
import { Component, OnInit, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
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
  RangeCustomEvent,
  NavController,
} from '@ionic/angular/standalone'
import { PlayerCmds, PlayerService } from '../player.service'
import { addIcons } from 'ionicons'
import {
  arrowBackOutline,
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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'

import type { Observable } from 'rxjs'
import type { AlbumStop } from '../albumstop'
import { AsyncPipe } from '@angular/common'
import { Media as BackendMedia } from '@backend-api/media.model'
import type { CurrentEpisode } from '../current.episode'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { FormsModule } from '@angular/forms'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { NavController } from '@ionic/angular/standalone'
import { Router } from '@angular/router'
import { addIcons } from 'ionicons'
import { interval } from 'rxjs'
import { PlayerCmds, PlayerService } from '../player.service'
import { SpotifyService } from '../spotify.service'

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  imports: [
    FormsModule,
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
  protected media: WritableSignal<BackendMedia | undefined> = signal(undefined)
  protected resuming: WritableSignal<boolean> = signal(false)

  protected img: WritableSignal<string | undefined> = signal(undefined)

  protected pageIsShown: WritableSignal<boolean> = signal(true)
  protected playing: Signal<boolean>

  resumePlay = false
  resumeIndex: number
  resumeAdded = false
  cover = ''
  playing = true
  updateProgression = false
  private isExternalPlayback = false
  currentPlayedSpotify: CurrentSpotify
  currentPlayedLocal: CurrentMPlayer
  showTrackNr = 0
  progress = 0
  shufflechanged = 0
  tmpProgressTime = 0
  public readonly spotify$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>

  constructor(
    private mediaService: MediaService,
    _route: ActivatedRoute,
    private router: Router,
    private navController: NavController,
    private playerService: PlayerService,
    private spotifyService: SpotifyService,
  ) {
    this.spotify$ = this.mediaService.current$
    this.local$ = this.mediaService.local$

    if (this.router.currentNavigation()?.extras.state?.media) {
      this.media = this.router.currentNavigation().extras.state.media
      if (this.media.category === 'resume') {
        this.resumePlay = true
      }
      this.isExternalPlayback = false
    } else {
      this.isExternalPlayback = true
    }
    addIcons({
      arrowBackOutline,
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

    this.media.set(this.router.getCurrentNavigation().extras.state?.media)
    this.resuming.set(this.router.getCurrentNavigation().extras.state?.resuming ?? false)
    this.img.set(this.media().img)

    this.spotify = toSignal(this.mediaService.current$)
    this.local = toSignal(this.mediaService.local$)
    this.playlist = toSignal(this.mediaService.playlist$)
    this.episode = toSignal(this.mediaService.episode$)
    this.show = toSignal(this.mediaService.show$)
    this.albumStop = toSignal(this.mediaService.albumStop$)

    // TODO: Ideally, in the future, we want to immediately update the ui and only revert it
    // if the backend is saying something different.
    this.playing = computed(() => {
      return !(this.local()?.pause ?? false)
    })

    interval(30000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.backendIsPlaying()) {
          this.saveResumeFiles()
        }
      })
  }

  ngOnInit() {
    // Handle case where no media object was provided (external playback)
    if (!this.media) {
      this.handleExternalPlayback()
    }

    this.mediaService.current$.subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
    })
    this.mediaService.local$.subscribe((local) => {
      this.currentPlayedLocal = local
    })
    // Use cover from CurrentSpotify for Spotify content, fallback to media.cover for other types
    this.mediaService.current$.subscribe((spotify) => {
      if (this.media?.type === 'spotify' && spotify?.item?.album?.images?.[0]?.url) {
        this.cover = spotify.item.album.images[0].url
      } else if (this.media?.cover) {
        this.cover = this.media.cover
      } else {
        this.cover = '../assets/images/nocover_mupi.png'
      }
    })
    this.mediaService.albumStop$.subscribe((albumStop) => {
      this.albumStop = albumStop
    })
  }

  private handleExternalPlayback(): void {
    // Check if there's currently playing Spotify content we can use
    const currentTrack = this.spotifyService.currentTrack$.value
    if (currentTrack) {
      console.log('🔄 Creating media object for externally started Spotify playback')
      this.media = this.spotifyService.createMediaFromSpotifyTrack(currentTrack)
      console.log('✅ External playback media object created:', this.media)
    } else {
      // Fallback: create a minimal media object and wait for track info
      console.log('⚠️ No current track info available, creating fallback media object')
      this.media = {
        type: 'spotify',
        category: 'music',
        title: 'External Playback',
        artist: 'Unknown',
        cover: '../assets/images/nocover_mupi.png',
      }

      // Subscribe to currentTrack$ to update when track info becomes available
      this.spotifyService.currentTrack$.subscribe((track) => {
        if (track && this.media.title === 'External Playback') {
          console.log('🔄 Updating media object with track info:', track.name)
          this.media = this.spotifyService.createMediaFromSpotifyTrack(track)
        }
      })
    }
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
    } else if (!this.isExternalPlayback) {
      // Only start playback if this is not external playback (already playing)
      const success = await this.playerService.playMedia(this.media)
      if (!success && this.media.type === 'spotify') {
        console.error('Failed to start Spotify playback - player health check failed')
      }
    } else {
      console.log('🎵 External playback detected - skipping playMedia call (already playing)')
    }

    this.updateProgress()

    if (this.media?.shuffle && !this.isExternalPlayback) {
      setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.SHUFFLEON)
        setTimeout(() => {
          this.skipNext()
        }, 1000)
      }, 5000)
    }
    this.playerService.seekPosition(newValue)
  }

  protected updateProgress(): void {
    // if (this.media.type === 'spotify') {
    //   const seek = this.currentPlayedSpotify?.progress_ms || 0
    //   if (this.media.showid?.length > 0) {
    //     this.progress = (seek / this.currentEpisode?.duration_ms) * 100 || 0
    //   } else {
    //     if (this.currentPlayedSpotify?.item != null) {
    //       this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0
    //     }
    //   }
    //   if (this.media.playlistid) {
    //     this.currentPlaylist?.items.forEach((element, index) => {
    //       if (this.currentPlayedSpotify?.item.id === element.track?.id) {
    //         this.playlistTrackNr = index + 1 // +1 since we want human-readable indexing in the frontend.
    //         this.img.set(element.track.album.images[1].url)
    //       }
    //     })
    //   }
    //   if (this.media.showid) {
    //     this.currentShow?.items.forEach((element, index) => {
    //       if (this.currentPlayedLocal?.activeEpisode === element?.id) {
    //         this.showTrackNr = this.currentEpisode.show.total_episodes - index
    //         this.img.set(element.images[1].url)
    //       }
    //     })
    //   }
    //   if (this.media.audiobookid) {
    //     this.currentShow?.items.forEach((element, index) => {
    //       if (this.currentPlayedSpotify?.item.id === element?.id) {
    //         this.showTrackNr = index + 1
    //         this.cover = element.images[1].url
    //       }
    //     })
    //   }
    // } else if (this.media.type === 'library' || this.media.type === 'rss') {
    //   this.progress = this.local()?.progressTime ?? 0
    // }
    // Periodicially refresh the progress.
    setTimeout(() => {
      if (this.pageIsShown()) {
        this.updateProgress()
      }
    }, 1000)
  }

  ionViewWillLeave() {
    this.pageIsShown.set(false)

    if (this.playing) {
      this.saveResumeFiles()
    }

    // Reset player state.
    this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF)
    this.playerService.sendCmd(PlayerCmds.STOP)

    if (this.albumStop().albumStop === 'On') {
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
    this.playerService.sendCmd(PlayerCmds.PREVIOUS)
  }

  skipNext() {
    this.playerService.sendCmd(PlayerCmds.NEXT)
  }

  toggleshuffle() {
    this.shufflechanged++
    //  TODO: Shuffle? -> we need folder.
    // this.playerService.sendCmd(this.backen.shuffle ? PlayerCmds.SHUFFLEOFF : PlayerCmds.SHUFFLEON)
    // this.media.shuffle = !this.media.shuffle
  }

  protected play(): void {
    this.playerService.sendCmd(PlayerCmds.PLAY)
  }

  protected pause(): void {
    this.playerService.sendCmd(PlayerCmds.PAUSE)
    // TODO
    // if (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss') {
    //   this.saveResumeFiles()
    // }
  }

  seekForward() {
    this.playerService.sendCmd(PlayerCmds.SEEKFORWARD)
  }

  seekBack() {
    this.playerService.sendCmd(PlayerCmds.SEEKBACK)
  }
}
