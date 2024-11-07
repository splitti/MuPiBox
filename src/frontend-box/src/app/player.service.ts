import { publishReplay, refCount } from 'rxjs/operators'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { ServerHttpApiConfig } from '@backend-api/server.model'
import type { Observable } from 'rxjs'
import { environment } from '../environments/environment'
import type { Media } from './media'

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
  CLEARVALIDATE = 'clearval',
  CLEARRESUME = 'clearresume',
  MAXRESUME = 'maxresume',
  ENABLEWIFI = 'enablewifi',
}

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private config: Observable<ServerHttpApiConfig> = null

  constructor(private http: HttpClient) {}

  getConfig() {
    // Observable with caching:
    // publishReplay(1) tells rxjs to cache the last response of the request
    // refCount() keeps the observable alive until all subscribers unsubscribed
    if (!this.config) {
      const url = environment.production ? '../api/sonos' : 'http://localhost:8200/api/sonos'

      this.config = this.http.get<ServerHttpApiConfig>(url).pipe(
        publishReplay(1), // cache result
        refCount(),
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

  seekPosition(pos) {
    const seekpos = `seekpos:${pos}`
    this.sendRequest(seekpos)
  }

  /*  jumpTo(offset){
    let offsetTrackNr = 'jumpto:' + offset;
    this.sendRequest(offsetTrackNr);
  } */

  deleteLocal(media: Media) {
    const url = `deletelocal/${encodeURIComponent(media.category)}:${encodeURIComponent(media.artist)}:${encodeURIComponent(media.title)}`
    this.sendRequest(url)
  }

  playMedia(media: Media) {
    let url: string

    switch (media.type) {
      case 'library': {
        if (!media.id) {
          media.id = media.title
        }
        url = `musicsearch/library/album/${encodeURIComponent(media.category)}:${encodeURIComponent(media.artist)}:${encodeURIComponent(media.title)}`
        break
      }
      case 'spotify': {
        if (media.playlistid) {
          url = `spotify/now/spotify:playlist:${encodeURIComponent(media.playlistid)}:0:0`
        } else if (media.id) {
          url = `spotify/now/spotify:album:${encodeURIComponent(media.id)}:0:0`
        } else if (media.showid) {
          url = `spotify/now/spotify:episode:${encodeURIComponent(media.showid)}:0:0`
        }
        break
      }
      case 'radio': {
        url = `radio/${encodeURIComponent(media.id)}/radio`
        break
      }
      case 'rss': {
        url = `rss/${encodeURIComponent(media.id)}/rss`
        break
      }
    }

    this.sendRequest(url)
  }

  resumeMedia(media: Media) {
    let url: string

    if (media.playlistid) {
      url = `spotify/now/spotify:playlist:${encodeURIComponent(media.playlistid)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    } else if (media.id) {
      url = `spotify/now/spotify:album:${encodeURIComponent(media.id)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    } else if (media.showid) {
      url = `spotify/now/spotify:episode:${encodeURIComponent(media.showid)}:${media.resumespotifytrack_number}:${media.resumespotifyprogress_ms}`
    }

    this.sendRequest(url)
  }

  validateId(id: string, category: string) {
    let url: string

    switch (category) {
      case 'spotify_id': {
        url = `validate/id:${encodeURIComponent(id)}`
        break
      }
      case 'spotify_showid': {
        url = `validate/showid:${encodeURIComponent(id)}`
        break
      }
      case 'spotify_artistid': {
        url = `validate/artistid:${encodeURIComponent(id)}`
        break
      }
      case 'spotify_playlistid': {
        url = `validate/playlistid:${encodeURIComponent(id)}`
        break
      }
    }
    this.sendRequest(url)
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

  private sendRequest(url: string) {
    this.getConfig().subscribe((config) => {
      if (!config.rooms[0]) config.rooms[0] = '0'
      if (config.ip) {
        const baseUrl = `http://${config.ip}:${config.port}/${config.rooms[0]}/`
        this.http.get(baseUrl + url).subscribe()
      } else {
        const baseUrl = `http://${config.server}:${config.port}/${config.rooms[0]}/`
        this.http.get(baseUrl + url).subscribe()
      }
    })
  }
}
