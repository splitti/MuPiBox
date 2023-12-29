import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Media } from './media';
import { SonosApiConfig } from './sonos-api';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';
import { publishReplay, refCount } from 'rxjs/operators';

import { Resume } from './resume';

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
  CLEARVALIDATE = 'clearval'
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  private config: Observable<SonosApiConfig> = null;

  constructor(
    private http: HttpClient
    ) {
    }

  getConfig() {
    // Observable with caching:
    // publishReplay(1) tells rxjs to cache the last response of the request
    // refCount() keeps the observable alive until all subscribers unsubscribed
    if (!this.config) {
      const url = (environment.production) ? '../api/sonos' : 'http://localhost:8200/api/sonos';

      this.config = this.http.get<SonosApiConfig>(url).pipe(
        publishReplay(1), // cache result
        refCount()
      );
    }

    return this.config;
  }

  sendCmd(cmd: PlayerCmds) {
    this.sendRequest(cmd);
  }

  seekPosition(pos){
    let seekpos = 'seekpos:' + pos;
    this.sendRequest(seekpos);
  }

 /*  jumpTo(offset){
    let offsetTrackNr = 'jumpto:' + offset;
    this.sendRequest(offsetTrackNr);
  } */

  deleteLocal(media: Media) {
    let url: string;
    url = 'deletelocal/' + encodeURIComponent(media.category) + ':' + encodeURIComponent(media.artist) + ':' + encodeURIComponent(media.title);
    this.sendRequest(url);
  }

  playMedia(media: Media) {
    let url: string;
    console.log(media);

    switch (media.type) {
      case 'library': {
        if (!media.id) {
          media.id = media.title;
        }
        url = 'musicsearch/library/album/' + encodeURIComponent(media.category) + ':' + encodeURIComponent(media.artist) + ':' + encodeURIComponent(media.title);
        break;
      }
      case 'spotify': {
        if (media.playlistid) {
          url = 'spotify/now/spotify:playlist:' + encodeURIComponent(media.playlistid) + ':0:0';
        } else if (media.id) {
          url = 'spotify/now/spotify:album:' + encodeURIComponent(media.id) + ':0:0';
        } else if (media.showid) {
          url = 'spotify/now/spotify:episode:' + encodeURIComponent(media.showid) + ':0:0';
        }
        break;
      }
      case 'radio': {
        url = 'radio/' + encodeURIComponent(media.id) + '/radio';
        break;
      }
    }

    this.sendRequest(url);
  }

  resumeMedia(media: Media, resume: Resume) {
    let url: string;
    console.log(media);
    console.log(resume);

    if (media.playlistid) {
      url = 'spotify/now/spotify:playlist:' + encodeURIComponent(media.playlistid) + ':' + resume.spotify.track_number + ':' + resume.spotify.progress_ms;
    } else if (media.id) {
      url = 'spotify/now/spotify:album:' + encodeURIComponent(media.id) + ':' + resume.spotify.track_number + ':' + resume.spotify.progress_ms;
    } else if (media.showid) {
      url = 'spotify/now/spotify:episode:' + encodeURIComponent(media.showid) + ':' + resume.spotify.track_number + ':' + resume.spotify.progress_ms;
    }

    this.sendRequest(url);
  }

  validateId(id: string, category: string) {
    let url: string;

    switch (category) {
      case 'spotify_id': {
        url = 'validate/id:' + encodeURIComponent(id);
        break;
      }
      case 'spotify_showid': {
        url = 'validate/showid:' + encodeURIComponent(id);
        break;
      }
      case 'spotify_artistid': {
        url = 'validate/artistid:' + encodeURIComponent(id);
        break;
      }
      case 'spotify_playlistid': {
        url = 'validate/playlistid:' + encodeURIComponent(id);
        break;
      }
    }
    this.sendRequest(url);
  }

  say(text: string) {
    this.getConfig().subscribe(config => {
      let url = 'say/' + encodeURIComponent(text);

      if (config.tts?.volume?.length > 0) {
        url += '/' + config.tts.volume;
      }

      this.sendRequest(url);
    });
  }

  private sendRequest(url: string) {
    this.getConfig().subscribe(config => {
      if (!config.rooms[0]) config.rooms[0]='0';
      const baseUrl = 'http://' + config.ip + ':' + config.port + '/' + config.rooms[0] + '/';
      console.log(baseUrl + url);
      this.http.get(baseUrl + url).subscribe();
    });
  }
}
