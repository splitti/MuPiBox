import { HttpClient } from '@angular/common/http'
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { IonContent, IonIcon, IonRange, IonSpinner, NavController } from '@ionic/angular/standalone'
import { firstValueFrom, type Observable } from 'rxjs'
import { environment } from '../../environments/environment'
import type { AlbumStop } from '../albumstop'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { registerLucideIcons } from '../icons/lucide-icons'
import { LogService } from '../log.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import type { MupiboxConfig } from '../mupibox-config.model'
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

/** Six rows fit into the track list panel. */
const TRACKS_PER_PAGE = 6

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, IonRange, IonSpinner, StatusBarComponent],
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
  public readonly spotify$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>

  showTrackList = false
  loadingTrackList = false
  trackList: TrackListEntry[] = []
  trackListTitle = ''
  trackPages: TrackListEntry[][] = []
  activeTrackPage = 0
  pressingCover = false
  listViewTimerMs = 2500
  private longPressTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private logService: LogService,
    private mediaService: MediaService,
    private http: HttpClient,
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
    registerLucideIcons()
  }

  ngOnInit() {
    // Handle case where no media object was provided (external playback)
    if (!this.media) {
      this.handleExternalPlayback()
    }

    // Show the media cover right away; the subscription below switches to the live Spotify cover.
    this.cover = this.media?.cover || '../assets/images/nocover_mupi.png'

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
      this.spotifyService.currentTrack$.subscribe((track) => {
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
    clearTimeout(this.longPressTimer)
    this.showTrackList = false
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

  // --------------------------------------------
  // Track list overlay (long-press on cover)
  // --------------------------------------------

  coverPointerDown() {
    if (this.media.type !== 'spotify' && this.media.type !== 'library') {
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
      this.buildTrackPages()
    }
  }

  closeTrackList() {
    this.showTrackList = false
  }

  playTrackFromList(entry: TrackListEntry) {
    this.playerService.playTrackAtPosition(this.media, entry)
  }

  isCurrentTrack(entry: TrackListEntry): boolean {
    if (this.media.type === 'library') {
      return this.currentPlayedLocal?.currentTracknr === entry.position
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

  // --------------------------------------------
  // Header / info lines (Figma design)
  // --------------------------------------------

  /** Cover corner: closes the track list when it is open, otherwise leads back. */
  cornerClicked() {
    if (this.showTrackList) {
      this.closeTrackList()
      return
    }
    this.navController.navigateBack(window.history.length > 1 ? undefined : '/home')
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
    const spotify = this.currentPlayedSpotify
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
      return this.currentPlayedLocal?.album || this.media.title || ''
    }
    return this.media?.title || ''
  }

  /** Name of the running track / chapter / episode. */
  trackName(): string {
    const spotify = this.currentPlayedSpotify
    if (this.media?.type === 'spotify') {
      return spotify?.item?.name || ''
    }
    if (this.media?.type === 'library') {
      return this.currentPlayedLocal?.currentTrackname || ''
    }
    return ''
  }

  /** "3/12" style position within the album, playlist, show or audiobook. */
  positionText(): string {
    const spotify = this.currentPlayedSpotify
    const local = this.currentPlayedLocal
    if (this.media?.type === 'library') {
      return local?.currentTracknr && local?.totalTracks ? `${local.currentTracknr}/${local.totalTracks}` : ''
    }
    if (this.media?.type !== 'spotify') {
      return ''
    }
    if (this.media.playlistid && spotify?.playlist?.total_tracks > 0) {
      return `${spotify.playlist.current_track_position}/${spotify.playlist.total_tracks}`
    }
    if (this.media.showid && spotify?.show_details) {
      return `${spotify.show_details.current_episode_position}/${spotify.show_details.total_episodes}`
    }
    if (this.media.audiobookid && spotify?.audiobook) {
      return `${spotify.audiobook.current_chapter_position}/${spotify.audiobook.total_chapters}`
    }
    if (spotify?.currently_playing_type !== 'episode' && spotify?.item?.album?.total_tracks > 0) {
      return `${spotify.item.track_number}/${spotify.item.album.total_tracks}`
    }
    return ''
  }

  /** Elapsed / total time; only Spotify reports absolute times. */
  timeText(): string {
    const spotify = this.currentPlayedSpotify
    if (this.media?.type === 'spotify' && spotify?.item?.duration_ms) {
      return `${this.formatDuration(spotify.progress_ms || 0) || '0:00'} / ${this.formatDuration(spotify.item.duration_ms)}`
    }
    return ''
  }

  volumeText(): string {
    const volume = this.currentPlayedLocal?.volume
    return typeof volume === 'number' ? `${volume} %` : ''
  }

  // --------------------------------------------
  // Track list paging (six rows per page, dots on the right)
  // --------------------------------------------

  private buildTrackPages() {
    const pages: TrackListEntry[][] = []
    for (let i = 0; i < this.trackList.length; i += TRACKS_PER_PAGE) {
      pages.push(this.trackList.slice(i, i + TRACKS_PER_PAGE))
    }
    this.trackPages = pages
    this.activeTrackPage = 0

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
    this.activeTrackPage = Math.round(element.scrollTop / element.clientHeight)
  }

  scrollToTrackPage(index: number, smooth = true) {
    const element = this.trackScroller?.nativeElement
    if (!element) {
      return
    }
    element.scrollTo({ top: index * element.clientHeight, behavior: smooth ? 'smooth' : 'auto' })
  }
}
