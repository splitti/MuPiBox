import { HttpClient } from '@angular/common/http'
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  Signal,
  signal,
  ViewChild,
  WritableSignal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { IonContent, IonIcon, IonRange, IonRouterOutlet, IonSpinner, NavController } from '@ionic/angular/standalone'
import { firstValueFrom } from 'rxjs'
import { environment } from '../../environments/environment'
import type { AlbumStop } from '../albumstop'
import { ArtworkService } from '../artwork.service'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { registerLucideIcons } from '../icons/lucide-icons'
import { LogService } from '../log.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
import { PageDotsComponent } from '../page-dots/page-dots.component'
import { PlayerCmds, PlayerService } from '../player.service'
import { SpotifyService } from '../spotify.service'
import { StatusBarComponent } from '../status-bar/status-bar.component'

export interface TrackListEntry {
  position: number
  id: string
  name: string
  artist?: string
  duration_ms?: number
}

const NO_COVER = '../assets/images/nocover_mupi.png'

/** Six rows fit into the track list panel. */
const TRACKS_PER_PAGE = 6

/**
 * Player page. The live player state (Spotify / local player) and everything the
 * template shows are signals: the app root is OnPush, so plain fields updated
 * from timers or subscriptions would only be rendered after the next touch.
 */
@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  imports: [IonContent, IonIcon, IonRange, IonSpinner, PageDotsComponent, StatusBarComponent],
})
export class PlayerPage implements OnInit {
  @ViewChild('range', { static: false }) range: IonRange
  @ViewChild('trackScroller', { static: false, read: ElementRef }) trackScroller: ElementRef<HTMLElement>

  media: Media
  resumemedia: Media
  albumStop: AlbumStop
  resumePlay = false
  resumeIndex: number
  resumeTimer = 0
  resumeAdded = false
  updateProgression = false
  private isExternalPlayback = false
  goBackTimer = 0
  shufflechanged = 0

  /** Polled player state from the media service. */
  protected readonly spotify: Signal<CurrentSpotify | undefined>
  protected readonly local: Signal<CurrentMPlayer | undefined>

  protected readonly playing: WritableSignal<boolean> = signal(true)
  /** Position within the track in percent (Spotify) or as reported by the local player. */
  protected readonly progress: Signal<number>
  /** Cover of the running album: the live Spotify cover, otherwise the media cover. */
  protected readonly cover: Signal<string>

  protected readonly showTrackList: WritableSignal<boolean> = signal(false)
  protected readonly loadingTrackList: WritableSignal<boolean> = signal(false)
  protected readonly trackPages: WritableSignal<TrackListEntry[][]> = signal([])
  protected readonly activeTrackPage: WritableSignal<number> = signal(0)
  protected readonly pressingCover: WritableSignal<boolean> = signal(false)
  protected readonly listViewTimerMs: WritableSignal<number> = signal(2500)
  trackList: TrackListEntry[] = []
  trackListTitle = ''
  private longPressTimer: ReturnType<typeof setTimeout> | undefined

  /** Outlet that opened this page; tells whether there is a page to go back to. */
  private readonly routerOutlet = inject(IonRouterOutlet, { optional: true })

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
  ) {
    this.spotify = toSignal(this.mediaService.current$)
    this.local = toSignal(this.mediaService.local$)

    this.progress = computed(() => {
      if (this.media?.type === 'spotify') {
        const spotify = this.spotify()
        const duration = spotify?.item?.duration_ms
        return duration ? ((spotify.progress_ms || 0) / duration) * 100 : 0
      }
      if (this.media?.type === 'library' || this.media?.type === 'nas' || this.media?.type === 'rss') {
        return this.local()?.progressTime || 0
      }
      return 0
    })

    this.cover = computed(() => {
      const spotifyCover = this.spotify()?.item?.album?.images?.[0]?.url
      if (this.media?.type === 'spotify' && spotifyCover) {
        return spotifyCover
      }
      // Radio covers are served from the copy cached on the box (see ArtworkService).
      return this.media ? this.artworkService.cachedCoverUrl(this.media, this.media.cover || NO_COVER) : NO_COVER
    })

    if (this.router.currentNavigation()?.extras.state?.media) {
      this.media = this.router.currentNavigation().extras.state.media
      if (this.media.category === 'resume') {
        this.resumePlay = true
      }
      this.isExternalPlayback = false
    } else {
      this.isExternalPlayback = true
    }
    registerLucideIcons()
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
          this.listViewTimerMs.set(configuredSeconds * 1000)
        }
      },
      error: () => {
        // Keep default listViewTimerMs if config could not be loaded.
      },
    })

    this.mediaService.albumStop$.subscribe((albumStop) => {
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
        cover: NO_COVER,
      }

      // Subscribe to currentTrack$ to update when track info becomes available
      this.spotifyService.currentTrack$.subscribe((track) => {
        if (track && this.media.title === 'External Playback') {
          this.logService.log('[PlayerPage] Updating media object with track info:', track.name)
          this.media = this.spotifyService.createMediaFromSpotifyTrack(track)
        }
      })
    }
  }

  // Buffering of a stream before it starts: 0 (nothing yet) to 100 (enough to start).
  get loadProgress(): number {
    return Math.min(100, Math.max(0, this.local()?.loadProgress ?? 0))
  }

  // The ring shrinks from the full circle (r=20) to a small dot (r=3) as the buffer fills.
  get loadRingRadius(): number {
    return 20 - 17 * (this.loadProgress / 100)
  }

  seek() {
    const newValue = +this.range.value
    if (this.media.type === 'spotify') {
      const duration = this.spotify()?.item?.duration_ms
      this.playerService.seekPosition(duration * (newValue / 100))
    } else if (this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') {
      this.playerService.seekPosition(newValue)
    }
  }

  /** One second tick: play state, resume bookkeeping and the automatic return when playback ends. */
  updateProgress() {
    const spotify = this.spotify()
    const local = this.local()

    this.playing.set(!local?.pause)
    if (this.playing()) {
      this.resumeTimer++
      if (this.resumeTimer % 30 === 0) {
        this.saveResumeFiles()
      }
    }

    if (this.media.type === 'spotify') {
      if (this.playing() && !spotify?.is_playing) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.navController.back()
        }
      }
    } else if (this.media.type === 'library' || this.media.type === 'nas' || this.media.type === 'rss') {
      if (
        (this.media.type === 'library' || this.media.type === 'nas') &&
        this.playing() &&
        !local?.playing &&
        local?.currentTracknr === local?.totalTracks
      ) {
        this.goBackTimer++
        if (this.goBackTimer > 10) {
          this.navController.back()
        }
      }
      if (this.media.type === 'rss' && this.playing() && !local?.playing) {
        this.goBackTimer++
        if (this.goBackTimer > 100) {
          this.navController.back()
        }
      }
    }

    setTimeout(() => {
      if (this.updateProgression) {
        this.updateProgress()
      }
    }, 1000)
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
        this.playing.set(false)
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
    clearTimeout(this.longPressTimer)
    this.showTrackList.set(false)
    if (
      (this.media.type === 'spotify' ||
        this.media.type === 'library' ||
        this.media.type === 'nas' ||
        this.media.type === 'rss') &&
      !this.media.shuffle &&
      this.resumeTimer > 30 &&
      this.playing()
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
        this.logService.error('[PlayerPage] Failed to resume Spotify playback - player health check failed')
        // Mark as not playing and navigate back
        this.playing.set(false)
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
    } else if (this.media.type === 'nas') {
      const success = await this.playerService.playMedia(this.media)
      if (!success) {
        this.logService.error('[PlayerPage] Failed to start NAS playback')
        return
      }
      // Jump to the saved track and position once the playlist is loaded.
      const track = this.media.resumelocalcurrentTracknr || 1
      const progress = this.media.resumelocalprogressTime || 0
      setTimeout(() => {
        if (track > 1) {
          this.playerService.playTrackAtPosition(this.media, { position: track })
        }
        setTimeout(() => {
          if (progress > 0) {
            this.playerService.seekPosition(progress)
          }
        }, 2000)
      }, 2500)
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

  saveResumeFiles() {
    this.resumemedia = Object.assign({}, this.media)
    const spotify = this.spotify()
    const local = this.local()
    if (this.resumemedia.type === 'spotify' && this.resumemedia?.showid) {
      this.resumemedia.resumespotifytrack_number = spotify?.item?.track_number || 1
      this.resumemedia.resumespotifyprogress_ms = spotify?.progress_ms || 0
      this.resumemedia.resumespotifyduration_ms = spotify?.item?.duration_ms || 0
    } else if (this.resumemedia.type === 'spotify') {
      this.resumemedia.resumespotifytrack_number = spotify?.item?.track_number || 0
      this.resumemedia.resumespotifyprogress_ms = spotify?.progress_ms || 0
      this.resumemedia.resumespotifyduration_ms = spotify?.item?.duration_ms || 0
    } else if (this.resumemedia.type === 'library') {
      this.resumemedia.resumelocalalbum = this.resumemedia.category
      this.resumemedia.resumelocalcurrentTracknr = local?.currentTracknr || 0
      this.resumemedia.resumelocalprogressTime = local?.progressTime || 0
    } else if (this.resumemedia.type === 'nas') {
      // NAS entries have no id of their own; the path identifies them in resume.json.
      this.resumemedia.id = `nas:${this.resumemedia.nasPath}`
      this.resumemedia.resumelocalcurrentTracknr = this.local()?.currentTracknr || 0
      this.resumemedia.resumelocalprogressTime = this.local()?.progressTime || 0
    } else if (this.resumemedia.type === 'rss') {
      this.resumemedia.resumerssprogressTime = local?.progressTime || 0
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
    this.playing.set(true)
    this.playerService.sendCmd(PlayerCmds.PREVIOUS)
  }

  skipNext() {
    this.playing.set(true)
    this.playerService.sendCmd(PlayerCmds.NEXT)
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
    if (this.playing()) {
      this.playerService.sendCmd(PlayerCmds.PAUSE)
      if (
        this.media.type === 'spotify' ||
        this.media.type === 'library' ||
        this.media.type === 'nas' ||
        this.media.type === 'rss'
      ) {
        this.saveResumeFiles()
      }
    } else {
      this.playerService.sendCmd(PlayerCmds.PLAY)
    }
  }

  // --------------------------------------------
  // Track list overlay (long-press on cover)
  // --------------------------------------------

  coverPointerDown() {
    if (this.media.type !== 'spotify' && this.media.type !== 'library' && this.media.type !== 'nas') {
      return
    }
    clearTimeout(this.longPressTimer)
    this.pressingCover.set(true)
    this.longPressTimer = setTimeout(() => {
      this.pressingCover.set(false)
      this.openTrackList()
    }, this.listViewTimerMs())
  }

  coverPointerUp() {
    clearTimeout(this.longPressTimer)
    this.pressingCover.set(false)
  }

  async openTrackList() {
    this.showTrackList.set(true)
    this.loadingTrackList.set(true)
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
      this.loadingTrackList.set(false)
      this.buildTrackPages()
    }
  }

  closeTrackList() {
    this.showTrackList.set(false)
  }

  /** Starts the chosen track and returns to the player controls. */
  playTrackFromList(entry: TrackListEntry) {
    this.playerService.playTrackAtPosition(this.media, entry)
    this.closeTrackList()
  }

  isCurrentTrack(entry: TrackListEntry): boolean {
    const spotify = this.spotify()
    if (this.media.type === 'library' || this.media.type === 'nas') {
      return this.local()?.currentTracknr === entry.position
    }
    if (this.media.playlistid) {
      return spotify?.playlist?.current_track_position === entry.position
    }
    if (this.media.audiobookid) {
      return spotify?.audiobook?.current_chapter_position === entry.position
    }
    if (this.media.showid) {
      return spotify?.item?.id === entry.id
    }
    return spotify?.item?.track_number === entry.position
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

  // --------------------------------------------
  // Header / info lines (Figma design)
  // --------------------------------------------

  /** Cover corner: closes the track list when it is open, otherwise leads back to the album view. */
  cornerClicked() {
    if (this.showTrackList()) {
      this.closeTrackList()
      return
    }
    this.goBack()
  }

  /** Back to the page that opened the player (album or resume view); home when there is none. */
  private goBack() {
    if (this.routerOutlet?.canGoBack()) {
      this.navController.back()
    } else {
      this.navController.navigateBack('/home')
    }
  }

  /** Artist cover for the header corner, as in the album view. */
  artistCover(): string {
    return this.media?.artistcover || this.media?.cover || NO_COVER
  }

  /** First header line: the artist, falling back to the album / media title. */
  headerLine1(): string {
    return this.media?.artist || this.albumName() || this.media?.title || ''
  }

  /** Second header line: the album (or show / audiobook / episode) title. */
  headerLine2(): string {
    const album = this.albumName()
    return album === this.headerLine1() ? '' : album
  }

  private albumName(): string {
    const spotify = this.spotify()
    if (this.media?.type === 'spotify' && spotify?.currently_playing_type !== 'episode') {
      return spotify?.item?.album?.name || this.media.title || ''
    }
    if (this.media?.showid && spotify?.show_details) {
      return spotify.show_details.name || ''
    }
    if (this.media?.audiobookid && spotify?.audiobook) {
      return spotify.audiobook.name || ''
    }
    if (this.media?.type === 'library') {
      return this.local()?.album || this.media.title || ''
    }
    return this.media?.title || ''
  }

  /** Name of the running track / chapter / episode. */
  trackName(): string {
    if (this.media?.type === 'spotify') {
      return this.spotify()?.item?.name || ''
    }
    if (this.media?.type === 'library') {
      return this.local()?.currentTrackname || ''
    }
    return ''
  }

  /** "Teil 2 von 22" style position within the album, playlist, show or audiobook. */
  positionText(): string {
    const spotify = this.spotify()
    const local = this.local()
    const text = (noun: string, current: number | undefined, total: number | undefined): string =>
      current && total ? `${noun} ${current} von ${total}` : ''

    if (this.media?.type === 'library') {
      return text(this.itemNoun(), local?.currentTracknr, local?.totalTracks)
    }
    if (this.media?.type !== 'spotify') {
      return ''
    }
    if (this.media.playlistid) {
      return text('Titel', spotify?.playlist?.current_track_position, spotify?.playlist?.total_tracks)
    }
    if (this.media.showid) {
      return text('Folge', spotify?.show_details?.current_episode_position, spotify?.show_details?.total_episodes)
    }
    if (this.media.audiobookid) {
      return text('Kapitel', spotify?.audiobook?.current_chapter_position, spotify?.audiobook?.total_chapters)
    }
    if (spotify?.currently_playing_type !== 'episode') {
      return text(this.itemNoun(), spotify?.item?.track_number, spotify?.item?.album?.total_tracks)
    }
    return ''
  }

  /** What one entry of the running album is called, by category. */
  private itemNoun(): string {
    switch (this.media?.category) {
      case 'audiobook':
        return 'Teil'
      case 'other':
        return 'Folge'
      default:
        return 'Titel'
    }
  }

  /** Elapsed time of the running track; Spotify reports milliseconds, the local player seconds. */
  elapsedText(): string {
    if (this.media?.type === 'spotify') {
      return this.spotify()?.item?.duration_ms ? this.formatDuration(this.spotify().progress_ms || 0) || '0:00' : ''
    }
    const local = this.local()
    return local?.length ? this.formatDuration((local.timePos || 0) * 1000) || '0:00' : ''
  }

  /** Total length of the running track. */
  totalText(): string {
    if (this.media?.type === 'spotify') {
      return this.formatDuration(this.spotify()?.item?.duration_ms)
    }
    return this.formatDuration((this.local()?.length || 0) * 1000)
  }

  /** Volume of the box in percent for the volume bar. */
  volumePercent(): number {
    const volume = this.local()?.volume
    return typeof volume === 'number' ? Math.max(0, Math.min(100, volume)) : 0
  }

  // --------------------------------------------
  // Track list paging (six rows per page, dots on the right)
  // --------------------------------------------

  private buildTrackPages() {
    const pages: TrackListEntry[][] = []
    for (let i = 0; i < this.trackList.length; i += TRACKS_PER_PAGE) {
      pages.push(this.trackList.slice(i, i + TRACKS_PER_PAGE))
    }
    this.trackPages.set(pages)
    this.activeTrackPage.set(0)

    const currentIndex = this.trackList.findIndex((entry) => this.isCurrentTrack(entry))
    if (currentIndex > 0) {
      setTimeout(() => this.scrollToTrackPage(Math.floor(currentIndex / TRACKS_PER_PAGE), false))
    }
  }

  onTrackListScroll() {
    const element = this.trackScroller?.nativeElement
    if (!element || element.clientHeight === 0) {
      return
    }
    this.activeTrackPage.set(Math.round(element.scrollTop / element.clientHeight))
  }

  scrollToTrackPage(index: number, smooth = true) {
    const element = this.trackScroller?.nativeElement
    if (!element) {
      return
    }
    element.scrollTo({ top: index * element.clientHeight, behavior: smooth ? 'smooth' : 'auto' })
  }
}
