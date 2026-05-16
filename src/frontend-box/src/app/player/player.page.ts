import { AsyncPipe } from '@angular/common'
import { Component, DestroyRef, inject, OnInit, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
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
  NavController,
} from '@ionic/angular/standalone'
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
import type { Observable } from 'rxjs'
import type { AlbumStop } from '../albumstop'
import { CurrentMediaService } from '../current-media.service'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { LogService } from '../log.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import { MupiHatIconComponent } from '../mupihat-icon/mupihat-icon.component'
import { PlayerCmds, PlayerService } from '../player.service'
import type { PlaytimePlayState } from '../playtime.model'
import { PlaytimeService } from '../playtime.service'
import { SpotifyService } from '../spotify.service'

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
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
  private isExternalPlayback = false
  currentPlayedSpotify: CurrentSpotify
  currentPlayedLocal: CurrentMPlayer
  showTrackNr = 0
  goBackTimer = 0
  progress = 0
  shufflechanged = 0
  tmpProgressTime = 0
  // Tracks the playtime state across ticks so we can detect transitions
  // (normal -> grace, grace -> blocked, etc.) and persist resume on time.
  private prevPlaytimeState: PlaytimePlayState | 'unknown' = 'unknown'
  private destroyRef = inject(DestroyRef)
  public readonly spotify$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>

  constructor(
    private logService: LogService,
    private mediaService: MediaService,
    _route: ActivatedRoute,
    private router: Router,
    private navController: NavController,
    private playerService: PlayerService,
    private spotifyService: SpotifyService,
    private playtimeService: PlaytimeService,
    private currentMediaService: CurrentMediaService,
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
  }

  ngOnInit() {
    // Handle case where no media object was provided (external playback)
    if (!this.media) {
      this.handleExternalPlayback()
    }

    // Track player state for the lifetime of this component. takeUntilDestroyed
    // ties the subscription to the page; previously updateProgress() and
    // saveResumeFiles() each re-subscribed on every call without ever
    // unsubscribing, so a 60-min listen accrued ~120 lingering subscriptions.
    this.mediaService.current$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
      if (this.media?.type === 'spotify' && spotify?.item?.album?.images?.[0]?.url) {
        this.cover = spotify.item.album.images[0].url
      } else if (this.media?.cover) {
        this.cover = this.media.cover
      } else {
        this.cover = '../assets/images/nocover_mupi.png'
      }
    })
    this.mediaService.local$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((local) => {
      this.currentPlayedLocal = local
    })
    this.mediaService.albumStop$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((albumStop) => {
      this.albumStop = albumStop
    })
  }

  private handleExternalPlayback(): void {
    // Check if there's currently playing Spotify content we can use
    const currentTrack = this.spotifyService.currentTrack$.value
    if (currentTrack) {
      this.logService.log('[PlayerPage] Creating media object for externally started Spotify playback')
      this.media = this.spotifyService.createMediaFromSpotifyTrack(currentTrack)
      this.logService.log('[PlayerPage] External playback media object created:', this.media)
    } else {
      // Fallback: create a minimal media object and wait for track info
      this.logService.log('[PlayerPage] No current track info available, creating fallback media object')
      this.media = {
        type: 'spotify',
        category: 'music',
        title: 'External Playback',
        artist: 'Unknown',
        cover: '../assets/images/nocover_mupi.png',
      }

      // Subscribe to currentTrack$ to update when track info becomes available
      this.spotifyService.currentTrack$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((track) => {
        if (track && this.media.title === 'External Playback') {
          this.logService.log('[PlayerPage] Updating media object with track info:', track.name)
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
    // currentPlayedSpotify / currentPlayedLocal are kept fresh by the
    // takeUntilDestroyed-bound subscriptions in ngOnInit — read them
    // directly here instead of re-subscribing on every tick.
    this.playing = !this.currentPlayedLocal?.pause
    if (this.playing) {
      this.resumeTimer++
      if (this.resumeTimer % 30 === 0) {
        this.saveResumeFiles()
      }
    }
    this.checkPlaytimeForResume()

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
        this.logService.error('[PlayerPage] Failed to start Spotify playback - player health check failed')
        // Mark as not playing and navigate back
        this.playing = false
        this.updateProgression = false
        this.navController.back()
        return
      }
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
  }

  ionViewWillLeave() {
    if (
      (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss') &&
      !this.media.shuffle &&
      this.playing
    ) {
      // saveResumeFiles itself enforces the listening-time threshold via
      // CurrentMediaService.shouldPersistResume(); the local resumeTimer > 30
      // guard that used to live here is gone — it was page-mount-scoped and
      // wall-clock-based, both of which the central service handles better.
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
        this.logService.error('[PlayerPage] Failed to resume Spotify playback - player health check failed')
        // Mark as not playing and navigate back
        this.playing = false
        this.updateProgression = false
        this.navController.back()
        return
      }
    } else if (this.media.type === 'library') {
      this.media.category = this.media.resumelocalalbum
      const success = await this.playerService.playMedia(this.media)
      if (!success) {
        this.logService.error('[PlayerPage] Failed to start local library playback')
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
        this.logService.error('[PlayerPage] Failed to start RSS playback')
        return
      }
      setTimeout(() => {
        this.playerService.seekPosition(this.media.resumerssprogressTime)
      }, 2000)
    }
  }

  // The 30s saveResumeFiles cadence in updateProgress() is fine for normal use, but it
  // can be up to 30 seconds stale when playback is cut off (playtime cap or quiet
  // hours window). Save immediately on the entry transition to grace and to blocked
  // so the resume entry captures (close to) the actual stop position. In the last
  // minute before the playtime limit, also save more frequently so the grace-entry
  // save isn't itself stale.
  private checkPlaytimeForResume() {
    const status = this.playtimeService.status()
    if (!status.enabled) {
      this.prevPlaytimeState = 'unknown'
      return
    }
    const cur = status.state
    if (this.prevPlaytimeState !== 'unknown' && cur !== this.prevPlaytimeState) {
      if (cur === 'grace' || cur === 'blocked') {
        this.saveResumeFiles()
      }
    } else if (
      cur === 'normal' &&
      this.playing &&
      status.playtime.enabled &&
      status.playtime.remainingSeconds <= 60 &&
      this.resumeTimer % 5 === 0
    ) {
      this.saveResumeFiles()
    }
    this.prevPlaytimeState = cur
  }

  saveResumeFiles() {
    // Single gate for "is this listen worth persisting?" — covers the 30s
    // updateProgress cadence, the on-leave save, and the cap-transition save.
    // Resets on every new playMedia/resumeMedia, counts only active playback.
    if (!this.currentMediaService.shouldPersistResume()) return

    this.resumemedia = Object.assign({}, this.media)
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
