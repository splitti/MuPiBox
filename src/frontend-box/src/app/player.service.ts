import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { ServerHttpApiConfig } from '@backend-api/server.model'
import type { Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'
import { environment } from '../environments/environment'
import { CurrentMediaService } from './current-media.service'
import { LogService } from './log.service'
import type { Media } from './media'
import { SpotifyService } from './spotify.service'

export enum PlayerCmds {
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
  PLAYPAUSE = 'playpause',
  PREVIOUS = 'previous',
  NEXT = 'next',
  VOLUMEUP = 'volume/+5',
  VOLUMEDOWN = 'volume/-5',
  CLEARQUEUE = 'clearqueue',
  SEEKFORWARD = 'seek+30',
  SEEKBACK = 'seek-30',
  SHUFFLEON = 'shuffleon',
  SHUFFLEOFF = 'shuffleoff',
  SHUTOFF = 'shutoff',
  ALBUMSTOP = 'albumstop',
  REBOOT = 'reboot',
  INDEX = 'index',
  NETWORKRESTART = 'networkrestart',
  CLEARRESUME = 'clearresume',
  MAXRESUME = 'maxresume',
  ENABLEWIFI = 'enablewifi',
}

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private config: Observable<ServerHttpApiConfig> = null

  constructor(
    private http: HttpClient,
    private logService: LogService,
    private spotifyService: SpotifyService,
    private currentMediaService: CurrentMediaService,
  ) {}

  getConfig() {
    // MED-20: previously used `publishReplay(1) + refCount()` which keeps
    // the observable alive only while at least one subscriber is connected.
    // mupihat-icon components mount-then-unmount-then-mount as the user
    // navigates between tabs in the admin UI — each remount unsubscribed
    // and resubscribed, which dropped to zero subscribers in between and
    // re-fired the underlying http.get. With three mupihat-icons across
    // the toolbar/footer/medialist views, that's three /api/sonos hits per
    // navigation. Switch to `shareReplay({ bufferSize: 1, refCount: false })`
    // so the cached config survives the zero-subscriber window. The config
    // only changes via setting_update.sh (which restarts pm2 anyway), so
    // the lifetime cache is fine.
    if (!this.config) {
      this.config = this.http.get<ServerHttpApiConfig>(`${environment.backend.apiUrl}/sonos`).pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
      )
    }

    return this.config
  }

  /**
   * Says the given {@link text} with TTS if TTS is enabled.
   * @param text - The text that should be spoken with TTS.
   */
  public sayText(text: string): void {
    this.getConfig().subscribe((config) => {
      if (config.tts == null || config.tts.enabled === true) {
        this.say(text)
      }
    })
  }

  sendCmd(cmd: PlayerCmds) {
    this.sendRequest(cmd)
  }

  seekPosition(pos: number) {
    const seekpos = `seekpos:${pos}`
    this.sendRequest(seekpos)
  }

  deleteLocal(media: Media) {
    const url = `deletelocal/${encodeURIComponent(media.category)}:${encodeURIComponent(media.artist)}:${encodeURIComponent(media.title)}`
    this.sendRequest(url)
  }

  async playMedia(media: Media): Promise<boolean> {
    let url: string

    switch (media.type) {
      case 'library': {
        if (!media.id) {
          media.id = media.title
        }
        url = `musicsearch/library/album/${this.libraryFolderParam(media)}`
        break
      }
      case 'nas': {
        url = `musicsearch/nas/${encodeURIComponent(media.nasPath)}`
        break
      }
      case 'spotify': {
        const isHealthy = await this.spotifyService.ensurePlayerReady()

        if (!isHealthy) {
          this.logService.error('Spotify player health check failed - cannot start playback')
          return false
        }

        if (media.playlistid) {
          url = `spotify/now/spotify:playlist:${encodeURIComponent(media.playlistid)}:0:0`
        } else if (media.id) {
          url = `spotify/now/spotify:album:${encodeURIComponent(media.id)}:0:0`
        } else if (media.showid) {
          url = `spotify/now/spotify:episode:${encodeURIComponent(media.showid)}:0:0`
        } else if (media.audiobookid) {
          url = `spotify/now/spotify:show:${encodeURIComponent(media.audiobookid)}:0:0`
        }
        break
      }
      case 'radio': {
        url = `radio/${encodeURIComponent(media.id)}/${encodeURIComponent(media.title)}:title:artist:${encodeURIComponent(media.artist)}${this.coverQuery(media)}`
        break
      }
      case 'rss': {
        url = `rss/${encodeURIComponent(media.id)}/${encodeURIComponent(media.title)}:title:artist:${encodeURIComponent(media.artist)}${this.coverQuery(media)}`
        break
      }
    }

    // Snapshot the Media so the global resume-on-cap effect (AppComponent)
    // knows what was playing if playtime/quiet stops it while the user is
    // off the player page.
    this.currentMediaService.set(media)
    this.sendRequest(url)
    return true
  }

  async resumeMedia(media: Media): Promise<boolean> {
    let url: string

    const isHealthy = await this.spotifyService.ensurePlayerReady()

    if (!isHealthy) {
      this.logService.error('Spotify player health check failed - cannot resume playback')
      return false
    }

    if (media.playlistid) {
      url = `spotify/now/spotify:playlist:${encodeURIComponent(media.playlistid)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    } else if (media.id) {
      url = `spotify/now/spotify:album:${encodeURIComponent(media.id)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    } else if (media.showid) {
      url = `spotify/now/spotify:episode:${encodeURIComponent(media.showid)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    } else if (media.audiobookid) {
      url = `spotify/now/spotify:show:${encodeURIComponent(media.audiobookid)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    }

    this.currentMediaService.set(media)
    this.sendRequest(url)
    return true
  }

  // Library resume: hand the target track + position to the backend in one
  // request so mplayer can do a single atomic pt_step instead of the page
  // playing audible fragments of every intermediate track during an N-skip
  // sequence. Position is a percentage (0–100), rounded — sub-percent
  // precision is irrelevant for a resume hint.
  async resumeLibraryMedia(media: Media): Promise<boolean> {
    const trackNr = media.resumelocalcurrentTracknr || 1
    const progressPct = Math.round(media.resumelocalprogressTime || 0)
    // the same folder as playMedia() uses: live library entries carry their real path, and
    // category:artist:title pointed at a folder that does not exist for them
    const url = `musicsearch/library/resume/${this.libraryFolderParam(media)}:${trackNr}:${progressPct}`
    this.currentMediaService.set(media)
    this.sendRequest(url)
    return true
  }

  // A NAS album where it was left: the player jumps to the track and the position itself, silent until it is there
  // (the display used to start the album and jump 2.5 and 4.5 s later - the beginning was heard meanwhile)
  async resumeNasMedia(media: Media): Promise<boolean> {
    const trackNr = media.resumelocalcurrentTracknr || 1
    const progressPct = Math.round(media.resumelocalprogressTime || 0)
    this.currentMediaService.set(media)
    this.sendRequest(`musicsearch/nas/resume/${encodeURIComponent(media.nasPath)}:${trackNr}:${progressPct}`)
    return true
  }

  /**
   * Jump playback to a specific track/episode/chapter within the currently playing
   * Spotify album, playlist, show or audiobook.
   * @param media - The media object describing the currently playing context.
   * @param entry - The track list entry to jump to. `position` is the 1-based
   *   position within an album/playlist/audiobook; `id` is the Spotify id, used
   *   for podcast episodes which are addressed directly rather than by position.
   */
  playTrackAtPosition(media: Media, entry: { position: number; id?: string }): void {
    let url: string

    if (media.type === 'library') {
      url = `localtrack:${entry.position}`
    } else if (media.type === 'nas') {
      url = `nastrack:${entry.position}`
    } else if (media.playlistid) {
      url = `spotify/now/spotify:playlist:${encodeURIComponent(media.playlistid)}:${entry.position}:0`
    } else if (media.audiobookid) {
      url = `spotify/now/spotify:show:${encodeURIComponent(media.audiobookid)}:${entry.position}:0`
    } else if (media.showid && entry.id) {
      // Podcast episodes are played directly by id rather than by position within the show.
      url = `spotify/now/spotify:episode:${encodeURIComponent(entry.id)}:1:0`
    } else if (media.id) {
      url = `spotify/now/spotify:album:${encodeURIComponent(media.id)}:${entry.position}:0`
    } else {
      return
    }

    this.sendRequest(url)
  }

  /**
   * Get the ordered list of track file names for a local library album,
   * read from its playlist.m3u by the player backend.
   */
  getLocalTracklist(media: Media): Observable<{ position: number; name: string }[]> {
    return this.http.get<{ position: number; name: string }[]>(
      `${environment.backend.playerUrl}/local/tracklist/${this.libraryFolderParam(media)}`,
    )
  }

  // Folder of a local album as the player backend expects it: the path segments
  // below ~/MuPiBox/media, each URL-encoded and joined by ":". Live entries carry
  // their full folder path (any depth); old data.json entries are category/artist/title.
  private libraryFolderParam(media: Media): string {
    if (media.libraryPath) {
      return media.libraryPath.split('/').filter(Boolean).map(encodeURIComponent).join(':')
    }
    return `${encodeURIComponent(media.category)}:${encodeURIComponent(media.artist)}:${encodeURIComponent(media.title)}`
  }

  /**
   * Get the ordered list of track file names for a NAS album, listed live from
   * the NAS by the player backend (never cached).
   */
  getNasTracklist(media: Media): Observable<{ position: number; name: string }[]> {
    return this.http.get<{ position: number; name: string }[]>(
      `${environment.backend.playerUrl}/nas/tracklist/${encodeURIComponent(media.nasPath)}`,
    )
  }

  private say(text: string) {
    this.getConfig().subscribe((config) => {
      let url = `say/${encodeURIComponent(text)}`

      if (config.tts?.volume?.length > 0) {
        url += `/${config.tts.volume}`
      }

      this.sendRequest(url)
    })
  }

  // The picture of a radio station / podcast episode for the player's status (spotify-control.js ?cover=): the parents'
  // app shows it at "Läuft gerade". The box's own API as a path (the box's address here is localhost, not the phone's).
  private coverQuery(media: Media): string {
    const cover = (media.cover ?? '').replace(/^https?:\/\/[^/]+(?=\/api\/)/, '')
    return cover ? `?cover=${encodeURIComponent(cover)}` : ''
  }

  private sendRequest(url: string) {
    const room = this.spotifyService.isPlayerReady() ? this.spotifyService.getDeviceId() : 'current'
    const baseUrl = `${environment.backend.playerUrl}/${room}/`
    this.http.get(baseUrl + url).subscribe()
  }
}
