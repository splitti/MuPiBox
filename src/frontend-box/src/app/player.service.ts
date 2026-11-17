import { HttpClient, type HttpErrorResponse } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { ServerHttpApiConfig } from '@backend-api/server.model'
import { firstValueFrom, type Observable, timeout } from 'rxjs'
import { shareReplay } from 'rxjs/operators'
import { environment } from '../environments/environment'
import { CurrentMediaService } from './current-media.service'
import { LogService } from './log.service'
import type { Media } from './media'
import { SpotifyService } from './spotify.service'
import { heardQuery } from './heard-key'
import { tileQuery } from './tile-key'
import { TileTimeService } from './tile-time.service'

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
    private tileTime: TileTimeService,
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
      this.config = this.http
        .get<ServerHttpApiConfig>(`${environment.backend.apiUrl}/sonos`)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }))
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

  /**
   * A command only for the playback the player named with this generation (/local): the player refuses it when another
   * one plays by now. 'done', 'overtaken' (refused: another playback) or 'failed' (no answer - it may not have arrived).
   */
  async sendCmdFor(cmd: PlayerCmds, generation: number): Promise<'done' | 'overtaken' | 'failed'> {
    const room = this.spotifyService.isPlayerReady() ? this.spotifyService.getDeviceId() : 'current'
    try {
      await firstValueFrom(
        this.http.get(`${environment.backend.playerUrl}/${room}/${cmd}?gen=${generation}`).pipe(timeout(3000)),
      )
      return 'done'
    } catch (err) {
      return (err as { status?: number })?.status === 409 ? 'overtaken' : 'failed'
    }
  }

  /** The volume of the box as a percentage (the Winamp theme's slider); the player keeps it under its maximum. */
  setVolume(percent: number) {
    this.sendRequest(`volume/=${Math.max(0, Math.min(100, Math.round(percent)))}`)
  }

  /** Repeat of the local playlist (the Winamp theme's REP button); Spotify has its own. */
  setRepeat(on: boolean) {
    this.sendRequest(on ? 'repeaton' : 'repeatoff')
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
      case 'tidal': {
        url = `musicsearch/tidal/${tidalRef(media)}${this.coverQuery(media)}`
        break
      }
      case 'jellyfin': {
        url = `musicsearch/jellyfin/${jellyfinRef(media)}${this.coverQuery(media)}`
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
    this.sendRequest(url, media)
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
    this.sendRequest(url, media)
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
    this.sendRequest(url, media)
    return true
  }

  // A NAS album where it was left: the player jumps to the track and the position itself, silent until it is there
  // (the display used to start the album and jump 2.5 and 4.5 s later - the beginning was heard meanwhile)
  async resumeNasMedia(media: Media): Promise<boolean> {
    const trackNr = media.resumelocalcurrentTracknr || 1
    const progressPct = Math.round(media.resumelocalprogressTime || 0)
    this.currentMediaService.set(media)
    this.sendRequest(`musicsearch/nas/resume/${encodeURIComponent(media.nasPath)}:${trackNr}:${progressPct}`, media)
    return true
  }

  // A TIDAL album or playlist where it was left (the player starts it at the track and the part of it)
  async resumeTidalMedia(media: Media): Promise<boolean> {
    const trackNr = media.resumelocalcurrentTracknr || 1
    const progressPct = Math.round(media.resumelocalprogressTime || 0)
    this.currentMediaService.set(media)
    this.sendRequest(`musicsearch/tidal/resume/${tidalRef(media)}:${trackNr}:${progressPct}${this.coverQuery(media)}`, media)
    return true
  }

  // A Jellyfin album, playlist or audiobook where it was left (as TIDAL)
  async resumeJellyfinMedia(media: Media): Promise<boolean> {
    const trackNr = media.resumelocalcurrentTracknr || 1
    const progressPct = Math.round(media.resumelocalprogressTime || 0)
    this.currentMediaService.set(media)
    this.sendRequest(`musicsearch/jellyfin/resume/${jellyfinRef(media)}:${trackNr}:${progressPct}${this.coverQuery(media)}`, media)
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
    } else if (media.type === 'tidal') {
      url = `tidaltrack:${entry.position}`
    } else if (media.type === 'jellyfin') {
      url = `jellyfintrack:${entry.position}`
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

    // (a Spotify jump is a start of its own for the player: it goes on with the tile of what plays)
    this.sendRequest(url, media)
  }

  /**
   * The episodes of the podcast tile an episode belongs to, as its list shows them (the parents' choice, the entry's
   * sorting) - found by the box from the episode and the tile (no feed address here). At most 300 around the one that
   * plays: offset is the place of the first, count the number of all.
   */
  getRssEpisodes(media: Media): Observable<RssEpisodeList> {
    return this.http.get<RssEpisodeList>(`${environment.backend.apiUrl}/rssfeed/episodes?url=${encodeURIComponent(media.id)}${tileQuery('?', media)}`)
  }

  /**
   * Another episode of the podcast, chosen in the list of the player. Started like "next" at an episode: with the source "skip" the display's
   * player page follows to it (ExternalPlaybackNavigatorService) and shows its title. The picture of the episode before does not go along.
   */
  playRssEpisode(media: Media, episode: { id: string; name: string }): void {
    const started: Media = { ...media, id: episode.id, title: episode.name }
    this.sendRequest(`rss/${encodeURIComponent(episode.id)}/${encodeURIComponent(episode.name)}:title:artist:${encodeURIComponent(media.artist)}?src=skip`, started)
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

  /** The tracks of a TIDAL album or playlist, from the box's TIDAL service through the player. */
  getTidalTracklist(media: Media): Observable<{ position: number; name: string }[]> {
    return this.http.get<{ position: number; name: string }[]>(`${environment.backend.playerUrl}/tidal/tracklist/${tidalRef(media)}`)
  }

  /** The tracks of a Jellyfin album, playlist or audiobook, through the player (the one that plays as mpv has it). */
  getJellyfinTracklist(media: Media): Observable<{ position: number; name: string }[]> {
    return this.http.get<{ position: number; name: string }[]>(`${environment.backend.playerUrl}/jellyfin/tracklist/${jellyfinRef(media)}`)
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
    const cover = (media.cover || media.artistcover || '').replace(/^https?:\/\/[^/]+(?=\/api\/)/, '')
    return cover ? `?cover=${encodeURIComponent(cover)}` : ''
  }

  // media: what starts - the tile of the start page it belongs to goes with it (?tile=, see tile-key.ts)
  private sendRequest(url: string, media?: Media) {
    const room = this.spotifyService.isPlayerReady() ? this.spotifyService.getDeviceId() : 'current'
    const baseUrl = `${environment.backend.playerUrl}/${room}/`
    if (media) this.tileTime.noteStart(media)
    // (and what of the library it is, for the ticks of what was heard - heard-key.ts)
    const tile = media ? tileQuery(url, media) : ''
    const heard = media ? heardQuery(url + tile, media) : ''
    this.http.get(baseUrl + url + tile + heard).subscribe({
      // (its tile's day's limit is used up: the player refused it - the bar says so, the player page goes back)
      error: (e: HttpErrorResponse) => {
        const body = e.error as { error?: unknown; tile?: unknown } | null
        // (only a start: a play, next or seek refused while the tile's last track finishes - its grace - changes nothing,
        // as for the listening time; taken for a refused start, the page left and stopped that track)
        if (media && e.status === 423 && body?.error === 'tile_limit_reached') {
          this.logService.log(`[PlayerService] start refused, the tile is used up for today: ${String(body.tile ?? '')}`)
          this.tileTime.refused(typeof body.tile === 'string' ? body.tile : null, media ?? null)
        }
      },
    })
  }
}

export interface RssEpisodeList {
  found: boolean
  artist?: string
  current?: number
  count?: number
  offset?: number
  episodes?: { url: string; title: string; seconds: number }[]
}

// A Jellyfin entry for the player: <album|playlist|book>:<id>
function jellyfinRef(media: Media): string {
  const kind = media.jellyfinKind === 'playlist' || media.jellyfinKind === 'book' ? media.jellyfinKind : 'album'
  return `${kind}:${encodeURIComponent(media.id)}`
}

// A TIDAL entry for the player: <album|playlist>:<id>
function tidalRef(media: Media): string {
  return `${media.tidalKind === 'playlist' ? 'playlist' : 'album'}:${encodeURIComponent(media.id)}`
}
