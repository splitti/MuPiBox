import { AsyncPipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { AfterViewInit, Component, DestroyRef, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core'
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
  IonItem,
  IonLabel,
  IonList,
  IonRange,
  IonRow,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  arrowBackOutline,
  close,
  headset,
  pause,
  play,
  playBack,
  playForward,
  playSkipBack,
  playSkipForward,
  shuffleOutline,
  volumeHighOutline,
  volumeLowOutline,
  volumeMedium,
} from 'ionicons/icons'
import { firstValueFrom, type Observable } from 'rxjs'
import { environment } from '../../environments/environment'
import type { AlbumStop } from '../albumstop'
import { CurrentMediaService } from '../current-media.service'
import { ExternalPlaybackNavigatorService } from '../external-playback-navigator.service'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { ArtworkService } from '../artwork.service'
import { CoverFlipService } from '../cover-flip.service'
import { DisplayTextsService } from '../display-texts.service'
import { KmThemeService } from '../theme/km-theme.service'
import { LogService } from '../log.service'
import { isResumeEntry, type Media } from '../media'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { StatusComponent } from '../status/status.component'
import { PlayerCmds, PlayerService } from '../player.service'
import type { PlaytimePlayState } from '../playtime.model'
import { PlaytimeService } from '../playtime.service'
import { SpotifyService } from '../spotify.service'

/** Where the box plays (backend-api audio-output.ts): current is 'box' or a device's address */
export interface AudioOutputState {
  current: string
  devices: { mac: string; name: string; kind: 'headphones' | 'speaker'; connected: boolean }[]
  display: boolean
}

export interface TrackListEntry {
  position: number
  id: string
  name: string
  artist?: string
  duration_ms?: number
}

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  imports: [
    FormsModule,
    AsyncPipe,
    StatusComponent,
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
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
  ],
})
export class PlayerPage implements OnInit, AfterViewInit {
  @ViewChild('range', { static: false }) range: IonRange
  @ViewChild('themeFontSource', { static: false, read: ElementRef }) themeFontSource: ElementRef<HTMLElement>

  media: Media
  resumemedia: Media
  albumStop: AlbumStop
  resumePlay = false
  resumeTimer = 0
  resumeAdded = false
  cover = ''
  // km themes (children's themes): their own markup in the template (see theme/km-theme.service.ts)
  private readonly kmTheme = inject(KmThemeService)
  protected readonly km = this.kmTheme.isKm
  protected readonly displayTexts = inject(DisplayTextsService)

  // "Hören mit": the box's speaker or a paired Bluetooth device (backend-api audio-output.ts). A tap on the volume opens
  // the choice - only when a device is paired and the parents did not switch it off (display options, outputPicker).
  protected readonly output = signal<AudioOutputState | null>(null)
  protected readonly outputOpen = signal(false)
  protected readonly outputBusy = signal<string | null>(null)
  protected readonly outputNotFound = signal(false)
  private outputTimer: ReturnType<typeof setInterval> | undefined
  protected outputChoosable(): boolean {
    const o = this.output()
    return !!o?.display && o.devices.length > 0
  }
  protected outputOnBluetooth(): boolean {
    const o = this.output()
    return !!o && o.current !== 'box'
  }
  private loadOutput(): void {
    this.http.get<AudioOutputState>(`${environment.backend.apiUrl}/audio-output`).subscribe({
      next: (o) => this.output.set(o),
      error: () => undefined,
    })
  }
  protected openOutput(): void {
    if (!this.outputChoosable()) return
    this.outputNotFound.set(false)
    this.loadOutput()
    this.outputOpen.set(true)
  }
  protected closeOutput(): void {
    if (!this.outputBusy()) this.outputOpen.set(false)
  }
  protected chooseOutput(target: string): void {
    if (this.outputBusy()) return
    if (target === this.output()?.current) {
      this.outputOpen.set(false)
      return
    }
    this.outputBusy.set(target)
    this.outputNotFound.set(false)
    this.http.post(`${environment.backend.apiUrl}/audio-output`, { target }).subscribe({
      next: () => {
        this.outputBusy.set(null)
        this.outputOpen.set(false)
        this.loadOutput()
      },
      error: (e: { status?: number }) => {
        this.outputBusy.set(null)
        // (the device did not answer - not on, or out of reach: said in the choice, which stays open)
        if (e?.status === 504) {
          this.outputNotFound.set(true)
          setTimeout(() => this.outputNotFound.set(false), 5000)
        }
        this.loadOutput()
      },
    })
  }

  /** The cover as shown: km themes show their placeholder instead of the default bear (and for a cover that does not load) */
  protected shownCover(): string {
    if (this.km() && (!this.cover || this.cover.includes('nocover') || this.failedCovers.has(this.cover))) {
      return this.kmTheme.coverPlaceholder()
    }
    return this.cover
  }

  private readonly failedCovers = new Set<string>()
  protected coverFailed(): void {
    if (this.km() && this.cover) this.failedCovers.add(this.cover)
  }

  /** km themes: position and length under the progress bar (Spotify, and mplayer when it knows the length) */
  protected kmTimes(): { position: string; duration: string } | undefined {
    const format = (ms: number) => {
      const total = Math.max(0, Math.floor(ms / 1000))
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const sec = String(total % 60).padStart(2, '0')
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
    }
    if (this.media?.type === 'spotify') {
      const duration = this.currentPlayedSpotify?.item?.duration_ms
      return duration ? { position: format(this.currentPlayedSpotify?.progress_ms ?? 0), duration: format(duration) } : undefined
    }
    const seconds = this.currentPlayedLocal?.durationSeconds
    if (!seconds) return undefined
    return { position: format((this.currentPlayedLocal?.positionSeconds ?? 0) * 1000), duration: format(seconds * 1000) }
  }

  // The picture embedded in the file that plays (NAS / local), when it has one - shown instead of the album cover,
  // so a folder of different stories shows each one's own cover (as Spotify does for a playlist).
  private trackCover = ''
  private trackCoverFile: string | undefined

  private followTrackCover(trackFile: string | undefined): void {
    if (this.media?.type !== 'nas' && this.media?.type !== 'library') trackFile = undefined
    if (trackFile === this.trackCoverFile) return
    this.trackCoverFile = trackFile
    if (!trackFile) {
      this.useTrackCover('')
      return
    }
    // loaded first, and only shown when there is one: no broken picture, no flicker for files without
    const url = `${environment.backend.apiUrl}/track-cover?file=${encodeURIComponent(trackFile)}`
    const img = new Image()
    img.onload = () => {
      if (this.trackCoverFile === trackFile) this.useTrackCover(url)
    }
    img.onerror = () => {
      if (this.trackCoverFile === trackFile) this.useTrackCover('')
    }
    img.src = url
  }

  /** The entry's cover - or, with only the artist's picture set, that one (as on its tile, see ArtworkService) */
  private get mediaCover(): string | undefined {
    return this.media?.cover || this.media?.artistcover || undefined
  }

  private useTrackCover(url: string): void {
    this.trackCover = url
    if (url) {
      this.cover = url
    } else if (this.mediaCover) {
      this.cover = this.artworkService.cachedCoverUrl(this.media, this.mediaCover)
    }
  }
  playing = true
  updateProgression = false
  private isExternalPlayback = false
  currentPlayedSpotify: CurrentSpotify
  currentPlayedLocal: CurrentMPlayer
  showTrackNr = 0
  goBackTimer = 0
  // Spotify paused in the middle of a track by someone other than the box (see updateProgress)
  private externallyPaused = false
  // The album (or playlist) that was started, seen playing in the SDK's state; and how many ticks in a row something
  // else played instead - Spotify's autoplay went on after the end (see updateProgress)
  // the box's player was seen busy on this page / how many ticks it is empty again / the page is on its way out /
  // it goes because of a stop from outside (no STOP and no resume save on the way out)
  private albumEndTimer: ReturnType<typeof setTimeout> | undefined
  private playerWasBusy = false
  private idleTicks = 0
  private isLeaving = false
  private stoppedFromOutside = false
  private contextSeenFor = ''
  private contextGone = 0
  private albumEnded = false
  progress = 0
  // The place just chosen on the progress bar (percent), until the player reports it: the next reports still had the
  // old place for a moment, and the dot jumped back before it moved to the new one (reported by Andreas)
  private seekHold: { value: number; until: number } | null = null
  shufflechanged = 0
  tmpProgressTime = 0
  // Tracks the playtime state across ticks so we can detect transitions
  // (normal -> grace, grace -> blocked, etc.) and persist resume on time.
  private prevPlaytimeState: PlaytimePlayState | 'unknown' = 'unknown'
  private destroyRef = inject(DestroyRef)
  private externalNavigator = inject(ExternalPlaybackNavigatorService)
  public readonly spotify$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>

  showTrackList = false
  loadingTrackList = false
  trackList: TrackListEntry[] = []
  trackListTitle = ''
  pressingCover = false
  listViewTimerMs = 2500
  listFontFamily = ''
  private longPressTimer: ReturnType<typeof setTimeout> | undefined
  private shuffleTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private logService: LogService,
    private mediaService: MediaService,
    private http: HttpClient,
    _route: ActivatedRoute,
    private router: Router,
    private navController: NavController,
    private playerService: PlayerService,
    private spotifyService: SpotifyService,
    private artworkService: ArtworkService,
    protected coverFlip: CoverFlipService,
    private playtimeService: PlaytimeService,
    private currentMediaService: CurrentMediaService,
  ) {
    this.spotify$ = this.mediaService.current$
    this.local$ = this.mediaService.local$

    // navState is read once into a local because the external-playback flag
    // (Phase 19 Stufe B) is read from the same state object further down.
    const navState = this.router.currentNavigation()?.extras.state ?? {}
    if (navState.media) {
      this.media = navState.media
      // Known right away, so the cover is there when the page opens (see CoverFlipService).
      if (this.mediaCover && this.media.type !== 'spotify') {
        this.cover = this.artworkService.cachedCoverUrl(this.media, this.mediaCover)
      }
      // isResumeEntry() instead of a bare category check: it also recognises
      // legacy entries written before the isResume flag existed.
      if (isResumeEntry(this.media)) {
        this.resumePlay = true
      }
      // Phase 19 Stufe B: extern getriggerter Track (Eltern-WebApp etc.)
      // läuft schon — Player-Page darf NICHT erneut playMedia() rufen,
      // sonst doppelter Start oder Konflikt mit dem Trigger-Pfad.
      this.isExternalPlayback = navState.externalPlayback === true
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
      volumeMedium,
      close,
      headset,
    })
  }

  ngOnInit() {
    // Handle case where no media object was provided (external playback)
    if (!this.media) {
      this.handleExternalPlayback()
    }

    this.http.get<MupiboxConfig>(`${environment.backend.apiUrl}/config`).subscribe({
      next: (config) => {
        const configuredSeconds = config?.mupibox?.listviewTimer
        if (typeof configuredSeconds === 'number' && configuredSeconds > 0) {
          this.listViewTimerMs = configuredSeconds * 1000
        }
      },
      error: () => {
        // Keep default listViewTimerMs if config could not be loaded.
      },
    })

    // Track player state for the lifetime of this component. takeUntilDestroyed
    // ties the subscription to the page; previously updateProgress() and
    // saveResumeFiles() each re-subscribed on every call without ever
    // unsubscribing, so a 60-min listen accrued ~120 lingering subscriptions.
    this.mediaService.current$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((spotify) => {
      this.currentPlayedSpotify = spotify
      if (this.media?.type === 'spotify' && spotify?.item?.album?.images?.[0]?.url) {
        this.cover = spotify.item.album.images[0].url
      } else if (this.trackCover) {
        this.cover = this.trackCover
      } else if (this.mediaCover) {
        this.cover = this.artworkService.cachedCoverUrl(this.media, this.mediaCover)
      } else {
        this.cover = '../assets/images/nocover_mupi.png'
      }
    })
    this.mediaService.local$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((local) => {
      this.currentPlayedLocal = local
      this.followTrackCover(local?.trackFile)
    })
    this.mediaService.albumStop$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((albumStop) => {
      this.albumStop = albumStop
    })
  }

  ngAfterViewInit() {
    // Reading the theme font here can race with the theme stylesheet still loading,
    // so the actual read happens lazily in openTrackList() instead.
  }

  private updateListFontFamily(): void {
    // Read whatever font the active theme applies to the header title, so the track
    // list uses the same theme font instead of a hardcoded one.
    if (this.themeFontSource?.nativeElement) {
      this.listFontFamily = getComputedStyle(this.themeFontSource.nativeElement).fontFamily
    }
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

  // Buffering of a stream before it starts: 0 (nothing yet) to 100 (enough to start).
  get loadProgress(): number {
    return Math.min(100, Math.max(0, this.currentPlayedLocal?.loadProgress ?? 0))
  }

  // The ring shrinks from the full circle (r=20) to a small dot (r=3) as the buffer fills.
  get loadRingRadius(): number {
    return 20 - 17 * (this.loadProgress / 100)
  }

  seek() {
    const newValue = +this.range.value
    this.seekHold = { value: newValue, until: Date.now() + 3000 }
    if (this.media.type === 'spotify') {
      const duration = this.currentPlayedSpotify?.item.duration_ms
      this.playerService.seekPosition(duration * (newValue / 100))
    } else if (this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') {
      this.playerService.seekPosition(newValue)
    }
  }

  // A reported place (percent) - or the one just chosen, while the report has not reached it yet (see seekHold)
  private heldProgress(reported: number): number {
    const hold = this.seekHold
    if (!hold) return reported
    if (Math.abs(reported - hold.value) <= 2 || Date.now() > hold.until) {
      this.seekHold = null
      return reported
    }
    return hold.value
  }

  // Back to the list, with the reason in the box's log (why a player page closed was never to be seen)
  private leavePage(reason: string): void {
    this.logService.log(`[PlayerPage] back to the list: ${reason}`)
    this.navController.back()
  }

  updateProgress() {
    // currentPlayedSpotify / currentPlayedLocal are kept fresh by the
    // takeUntilDestroyed-bound subscriptions in ngOnInit — read them
    // directly here instead of re-subscribing on every tick.
    // Stopped from outside (the parents' app, Telegram, the sleep timer): the box's player is empty again after it
    // was busy. A stop clears the pause flag too, so the page took the stopped player for a playing one - the pause
    // button stayed, the page stayed open (an episode 100 s, an album for ever) and kept saving "Weiterhören" with
    // the empty player's zeros. Two ticks in a row, so a moment between two tracks does not count; the stop is
    // done already, so the page leaves without sending one (see ionViewWillLeave).
    const busy = !!this.currentPlayedLocal?.currentPlayer
    if (busy) {
      this.playerWasBusy = true
      this.idleTicks = 0
    } else if (this.playerWasBusy && !this.isLeaving && ++this.idleTicks >= 2) {
      this.isLeaving = true
      this.stoppedFromOutside = true
      this.leavePage('stopped from outside')
      return
    }
    this.playing = !this.currentPlayedLocal?.pause && !this.externallyPaused && (busy || !this.playerWasBusy)
    // Drive CurrentMediaService's active-listening counter from here —
    // determined per-tick from the actual SDK state for Spotify or mplayer
    // state for local content. The service used to subscribe to current$/
    // local$ itself, but those subscriptions kept the Spotify SDK polling
    // hot from app bootstrap and broke Connect device activation.
    const activelyPlaying =
      this.media?.type === 'spotify'
        ? this.currentPlayedSpotify?.is_playing === true
        : this.currentPlayedLocal?.playing === true
    this.currentMediaService.markPlaying(activelyPlaying)
    if (this.playing) {
      this.resumeTimer++
      // Cadence drives SD-card wear: a full resume.json rewrite per save.
      // 60s gives ±60s position recovery in the worst case (kid pulls power
      // cord with no clean shutdown), which beats abusing the SD card.
      // Cap-transition and on-leave saves cover the "we know about to stop"
      // moments precisely, so the cadence only needs to handle the rare
      // hard-power-loss case.
      if (this.resumeTimer % 60 === 0) {
        this.saveResumeFiles()
      }
    }
    this.checkPlaytimeForResume()

    // Back to the list only after this many seconds in a row without playing: the count went on over the whole
    // listening - a long podcast episode with a few short buffering breaks (WiFi) went back after some minutes
    // although it was still playing.
    if (this.media.type === 'spotify' ? this.currentPlayedSpotify?.is_playing : this.currentPlayedLocal?.playing) {
      this.goBackTimer = 0
    }
    if (this.media.type === 'spotify') {
      const sp = this.currentPlayedSpotify
      const seek = sp?.progress_ms || 0
      if (sp?.item != null) {
        this.progress = this.heldProgress((seek / sp?.item.duration_ms) * 100 || 0)
      }
      if (sp?.is_playing) this.externallyPaused = false
      // The end of an album with Spotify's autoplay on (a setting of the account): the SDK never reports it paused,
      // it goes straight on with tracks of other albums - in the same context, so only the track tells. Once a track
      // of this album was seen playing, three ticks in a row with one that is not in it are its end: back to the
      // list, which stops the playback (ionViewWillLeave). Only for albums and playlists - a podcast or audiobook
      // plays in its show's context, which the entry does not name.
      let expected = this.media.playlistid
        ? `spotify:playlist:${this.media.playlistid}`
        : !this.media.showid && !this.media.audiobookid && this.media.id
          ? `spotify:album:${this.media.id}`
          : ''
      // (started from the parents' app or Telegram: the page knows only title and artist, not the album - the first
      // album or playlist seen playing is the one)
      if (!expected && !this.media.showid && !this.media.audiobookid && /^spotify:(album|playlist):/.test(sp?.context_uri ?? '')) {
        expected = this.contextSeenFor || (sp?.context_uri as string)
      }
      if (expected && sp?.context_uri === expected && sp.in_context !== undefined) {
        if (sp.in_context) {
          this.contextSeenFor = expected
          this.contextGone = 0
        } else if (this.contextSeenFor === expected && !this.isLeaving) {
          // (a track of another album: autoplay went on - at once, a second of it is enough)
          this.contextSeenFor = ''
          this.contextGone = 0
          this.albumEnded = true
          this.isLeaving = true
          this.leavePage('album end (Spotify autoplay went on with another album)')
        }
      }
      // The album's last track coming to its end: the box stops there itself, before Spotify's autoplay (an account
      // setting) goes on - with another album, or once with a track of this one (seen: track 3 after the last). The
      // last track and its length are known, so a timer for its end; not with shuffle (no "last" track then).
      const position = sp?.playlist?.current_track_position ?? sp?.item?.track_number
      const total = sp?.playlist?.total_tracks ?? sp?.item?.album?.total_tracks
      const duration = sp?.item?.duration_ms
      if (
        expected &&
        sp?.is_playing &&
        sp.in_context === true &&
        !this.media.shuffle &&
        this.shufflechanged % 2 === 0 &&
        position &&
        total &&
        position >= total &&
        duration &&
        !this.albumEndTimer &&
        !this.isLeaving
      ) {
        const left = duration - (sp.progress_ms ?? 0)
        if (left < 4000) {
          // (stopped 1.2 s before the end: the SDK's position is up to a second old, and the stop takes its way to
          // Spotify - at 0.4 s autoplay had loaded the next album's track already; the end of a track is mostly silence)
          this.albumEndTimer = setTimeout(() => {
            this.albumEndTimer = undefined
            if (this.isLeaving) return
            this.isLeaving = true
            this.albumEnded = true
            this.leavePage('album end (last track finished)')
          }, Math.max(0, left - 1200))
        }
      }
      if (!this.currentPlayedLocal?.pause && !sp?.is_playing) {
        // Not playing although the box did not pause: at the end of the album (the SDK reports it paused at the
        // start of the last track, or at its end) the way back to the list; but paused in the middle of a track -
        // from another Spotify client, the parents' phone over Connect, or a stall - it stays here as paused, and
        // the play button goes on. Before, that went back to the list after ten seconds, with a STOP.
        const midTrack = seek > 1500 && !!sp?.item?.duration_ms && seek < sp.item.duration_ms - 1500
        if (midTrack) {
          this.externallyPaused = true
          this.goBackTimer = 0
        } else {
          this.goBackTimer++
          if (this.goBackTimer > 10) {
            this.leavePage('Spotify not playing for 10 s')
          }
        }
      }
      setTimeout(() => {
        if (this.updateProgression) {
          this.updateProgress()
        }
      }, 1000)
    } else if (this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') {
      // The player says the album or episode played to its end: back to the list at once (it waited 10 s for the
      // player to stay silent - the page looked stuck meanwhile). No resume save on the way out: the album is done.
      if (this.currentPlayedLocal?.finished && !this.isLeaving) {
        this.isLeaving = true
        this.albumEnded = true
        this.leavePage(this.media.type === 'rss' ? 'episode ended' : 'album ended')
        return
      }
      const seek = this.currentPlayedLocal?.progressTime || 0
      this.progress = this.heldProgress(seek || 0)
      if (
        (this.media.type === 'library' || this.media.type === 'nas') &&
        this.playing &&
        !this.currentPlayedLocal?.playing &&
        this.currentPlayedLocal?.currentTracknr === this.currentPlayedLocal?.totalTracks
      ) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.leavePage('last track of the album ended')
        }
      }
      if (this.media.type === 'rss' && this.playing && !this.currentPlayedLocal?.playing) {
        this.goBackTimer++
        if (this.goBackTimer > 100) {
          this.leavePage('podcast episode ended')
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
    // (the output as it is now - also changed from the web app or by headphones switched off)
    this.loadOutput()
    clearInterval(this.outputTimer)
    this.outputTimer = setInterval(() => this.loadOutput(), 15000)
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
        this.leavePage('Spotify playback could not start')
        return
      }
    } else {
      // Started from the parents' app or Telegram: the box plays already, but the listening counter and the resume
      // saving go by the current media of CurrentMediaService, which only playMedia/resumeMedia set - without this
      // an episode or album started from the app never got a "Weiterhören" entry
      this.currentMediaService.set(this.media)
    }

    this.updateProgress()

    if (this.media?.shuffle && !this.isExternalPlayback) {
      this.shuffleTimer = setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.SHUFFLEON)
        this.shuffleTimer = setTimeout(() => {
          this.skipNext()
        }, 1000)
      }, 5000)
    }
  }

  ionViewWillLeave() {
    // (left within the first seconds: shuffle must not be switched on after the page is gone - the next audiobook
    // played in random order then)
    clearTimeout(this.shuffleTimer)
    clearTimeout(this.albumEndTimer)
    clearTimeout(this.longPressTimer)
    clearInterval(this.outputTimer)
    this.outputOpen.set(false)
    this.showTrackList = false
    // Left only because something else was started from the phone and the page opens again for it: the
    // player already switched, so no STOP (it would stop the new playback) and no resume save (the progress
    // belongs to the new media by now).
    if (this.externalNavigator.replacingPlayerPage || this.stoppedFromOutside) {
      this.updateProgression = false
      this.resumePlay = false
      return
    }
    if (
      (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') &&
      !this.media.shuffle &&
      this.playing &&
      !this.albumEnded // (the SDK's position belongs to what autoplay went on with, not to this album)
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
        this.leavePage('Spotify resume could not start')
        return
      }
    } else if (this.media.type === 'library') {
      // Backend handles the track jump (single atomic pt_step) and the seek
      // internally — see playListAtTrack in spotify-control.js. Replaces the
      // previous N×setTimeout(skipNext) loop, which was audible.
      //
      // Legacy entries (category overwritten with 'resume', original stashed
      // in resumelocalalbum) need their real category restored before the
      // backend can build the playlist path. New entries (isResume=true)
      // already carry the original category — leave it alone.
      if (this.media.category === 'resume' && this.media.resumelocalalbum) {
        this.media.category = this.media.resumelocalalbum
      }
      const success = await this.playerService.resumeLibraryMedia(this.media)
      if (!success) {
        this.logService.error('[PlayerPage] Failed to resume local library playback')
        return
      }
      // No client-side skip/seek here on purpose: resumeLibraryMedia() hands
      // track number and progress to the backend, which does the jump in one
      // atomic pt_step. The N×setTimeout(skipNext) loop that used to live here
      // would run a SECOND time on top of that — landing the listener far past
      // the saved position and playing an audible fragment of every track in
      // between.
    } else if (this.media.type === 'nas') {
      // The player jumps to the saved track and position itself, silent until it is there (as for the SD card's
      // albums): this page used to start the album and jump 2.5 and 4.5 s later - the beginning was heard meanwhile.
      const success = await this.playerService.resumeNasMedia(this.media)
      if (!success) {
        this.logService.error('[PlayerPage] Failed to start NAS playback')
        return
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

  // Save immediately on the entry transition to grace and to blocked so the
  // resume entry captures (close to) the actual stop position. The previous
  // implementation also boosted the cadence to 5s in the last minute before
  // the cap as a safety net, but the transition save is reliable (player.page
  // here AND AppComponent's global effect both fire on the same status edge),
  // and that safety net was costing ~12 extra SD-card rewrites per cap event
  // for a ±5s position improvement that the kid won't notice.
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
    }
    this.prevPlaytimeState = cur
  }

  saveResumeFiles() {
    // Single gate for "is this listen worth persisting?" — covers the 30s
    // updateProgress cadence, the on-leave save, and the cap-transition save.
    // Resets on every new playMedia/resumeMedia, counts only active playback.
    if (!this.currentMediaService.shouldPersistResume()) return
    // Stopped from the app or Telegram before the page is left: the box's player is empty by now (no track, no
    // position) - the entry of the last periodic save stands, it is not overwritten with zeros
    // (and for local media only while mplayer/mpv plays: Spotify started meanwhile wrote this page's NAS entry with
    // the zeros of the empty local player)
    if ((this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') && this.currentPlayedLocal?.currentPlayer !== 'mplayer') return

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
      // resumelocalalbum stays for downgrade-safety: an older client still
      // depends on it to recover the original category from a legacy-style
      // entry. New readers prefer category directly.
      this.resumemedia.resumelocalalbum = this.resumemedia.category
      this.resumemedia.resumelocalcurrentTracknr = this.currentPlayedLocal?.currentTracknr || 0
      this.resumemedia.resumelocalprogressTime = this.currentPlayedLocal?.progressTime || 0
    } else if (this.resumemedia.type === 'nas') {
      // NAS entries have no id of their own; the path identifies them in resume.json.
      this.resumemedia.id = `nas:${this.resumemedia.nasPath}`
      this.resumemedia.resumelocalcurrentTracknr = this.currentPlayedLocal?.currentTracknr || 0
      this.resumemedia.resumelocalprogressTime = this.currentPlayedLocal?.progressTime || 0
    } else if (this.resumemedia.type === 'rss') {
      this.resumemedia.resumerssprogressTime = this.currentPlayedLocal?.progressTime || 0
    }
    // If we inherited a legacy category='resume' marker (in-memory artefact
    // from a clicked-resume-card flow that didn't restore), recover the real
    // category before persisting the new-format entry.
    if (this.resumemedia.category === 'resume' && this.resumemedia.resumelocalalbum) {
      this.resumemedia.category = this.resumemedia.resumelocalalbum
    }
    this.resumemedia.isResume = true
    this.resumemedia.index = undefined
    // /api/addresume is a stable upsert via composite key (type +
    // playlistid|showid|audiobookid|id || artist::title) — no need to
    // remember an array index or distinguish add vs. edit on the client.
    this.mediaService.addRawResume(this.resumemedia)
    if (!this.resumeAdded && !this.resumePlay) {
      // First save of a fresh listening session — trim the resume list to
      // its configured cap. Skip when resumePlay because no append happens.
      this.resumeAdded = true
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
      if (this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') {
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

  // --------------------------------------------
  // Track list overlay (long-press on cover)
  // --------------------------------------------

  coverPointerDown() {
    if (this.media.type !== 'spotify' && this.media.type !== 'library' && this.media.type !== 'nas') {
      return
    }
    clearTimeout(this.longPressTimer)
    this.pressingCover = true
    this.longPressTimer = setTimeout(() => {
      this.pressingCover = false
      this.openTrackList()
    }, this.listViewTimerMs)
  }

  coverPointerUp() {
    clearTimeout(this.longPressTimer)
    this.pressingCover = false
  }

  async openTrackList() {
    this.updateListFontFamily()
    this.showTrackList = true
    this.loadingTrackList = true
    this.trackList = []

    try {
      if (this.media.type === 'library') {
        const tracks = await firstValueFrom(this.playerService.getLocalTracklist(this.media))
        this.trackListTitle = this.media.title
        this.trackList = (tracks ?? []).map((track) => ({
          position: track.position,
          id: `${track.position}`,
          name: track.name,
        }))
      } else if (this.media.type === 'nas') {
        const tracks = await firstValueFrom(this.playerService.getNasTracklist(this.media))
        this.trackListTitle = this.media.title
        this.trackList = (tracks ?? []).map((track) => ({
          position: track.position,
          id: `${track.position}`,
          name: track.name,
        }))
      } else if (this.media.playlistid) {
        const info = await firstValueFrom(this.spotifyService.getPlaylistInfo(this.media.playlistid))
        this.trackListTitle = info.playlist_name
        this.trackList = (info.tracks ?? []).map((track: any, index: number) => ({
          position: index + 1,
          id: track.id ?? track.uri,
          name: track.name,
          artist: track.artist,
          duration_ms: track.duration_ms,
        }))
      } else if (this.media.audiobookid) {
        const info = await firstValueFrom(this.spotifyService.getAudiobookInfo(this.media.audiobookid))
        this.trackListTitle = info.audiobook_name
        this.trackList = (info.chapters ?? []).map((chapter: any, index: number) => ({
          position: index + 1,
          id: chapter.id,
          name: chapter.name,
          duration_ms: chapter.duration_ms,
        }))
      } else if (this.media.showid) {
        const info = await firstValueFrom(this.spotifyService.getShowInfo(this.media.showid))
        this.trackListTitle = info.show_name
        this.trackList = (info.episodes ?? []).map((episode: any, index: number) => ({
          position: index + 1,
          id: episode.id,
          name: episode.name,
          duration_ms: episode.duration_ms,
        }))
      } else if (this.media.id) {
        const info = await firstValueFrom(this.spotifyService.getAlbumInfo(this.media.id))
        this.trackListTitle = info.album_name
        this.trackList = (info.tracks ?? []).map((track: any) => ({
          position: track.track_number,
          id: track.id,
          name: track.name,
          artist: track.artist,
          duration_ms: track.duration_ms,
        }))
      }
    } finally {
      this.loadingTrackList = false
    }
  }

  closeTrackList() {
    this.showTrackList = false
  }

  // Jumping several tracks at once (e.g. from track 1 to track 5) needs a corrective step on the player
  // backend's side: mplayer's own 'metadata' event always bumps currentTracknr by exactly 1 per track change,
  // no matter how many tracks were actually skipped, so the backend pre-sets currentTracknr to (target - 1)
  // right away and lets that one +1 land exactly on the target. Polled here in between, that pre-set value
  // briefly names the track BEFORE the one just tapped as playing. This holds the tapped position instead,
  // until the real state (poll of /local) reaches it - a 6s fallback clears it if that never happens (e.g. the
  // jump failed), so a row can't stay marked forever.
  private pendingTrackPosition: number | undefined
  private pendingTrackTimer: ReturnType<typeof setTimeout> | undefined

  playTrackFromList(entry: TrackListEntry) {
    if (this.media.type === 'library' || this.media.type === 'nas') {
      clearTimeout(this.pendingTrackTimer)
      this.pendingTrackPosition = entry.position
      this.pendingTrackTimer = setTimeout(() => {
        this.pendingTrackPosition = undefined
      }, 6000)
    }
    this.playerService.playTrackAtPosition(this.media, entry)
  }

  isCurrentTrack(entry: TrackListEntry): boolean {
    if (this.media.type === 'library' || this.media.type === 'nas') {
      const actualPosition = this.currentPlayedLocal?.currentTracknr
      if (this.pendingTrackPosition !== undefined) {
        if (actualPosition === this.pendingTrackPosition) {
          // caught up: the real state now agrees, no need for the override any more
          clearTimeout(this.pendingTrackTimer)
          this.pendingTrackPosition = undefined
        } else {
          return entry.position === this.pendingTrackPosition
        }
      }
      return actualPosition === entry.position
    }
    if (this.media.playlistid) {
      return this.currentPlayedSpotify?.playlist?.current_track_position === entry.position
    }
    if (this.media.audiobookid) {
      return this.currentPlayedSpotify?.audiobook?.current_chapter_position === entry.position
    }
    if (this.media.showid) {
      return this.currentPlayedSpotify?.item?.id === entry.id
    }
    return this.currentPlayedSpotify?.item?.track_number === entry.position
  }

  formatDuration(durationMs: number | undefined): string {
    if (!durationMs) {
      return ''
    }
    const totalSeconds = Math.round(durationMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }
}
