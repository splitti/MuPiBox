import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Media } from './media';
import { SonosApiConfig } from './sonos-api';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';
import { publishReplay, refCount } from 'rxjs/operators';

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
  INDEX = 'index'
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  private config: Observable<SonosApiConfig> = null;

  constructor(private http: HttpClient) {}

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

  getState() {
    this.sendRequest('state');
  }

  sendCmd(cmd: PlayerCmds) {
    this.sendRequest(cmd);
  }

  seekPosition(pos){
    let seekpos = 'seekpos:' + pos;
    this.sendRequest(seekpos);
  }

  playMedia(media: Media) {
    let url: string;

    switch (media.type) {
      case 'library': {
        if (!media.id) {
          media.id = media.title;
        }
        if (media.category === 'playlist') {
          url = 'playlist/' + encodeURIComponent(media.id);
        } else {
          url = 'musicsearch/library/album/' + encodeURIComponent(media.category) + ':' + encodeURIComponent(media.artist) + ':' + encodeURIComponent(media.title);
        }
        break;
      }
      case 'spotify': {
        if (media.category === 'playlist') {
          url = 'spotify/now/spotify:playlist:' + encodeURIComponent(media.id);
        } else {
          if (media.id) {
            url = 'spotify/now/spotify:album:' + encodeURIComponent(media.id);
          } else if (media.showid) {
            url = 'spotify/now/spotify:episode:' + encodeURIComponent(media.showid);
          } else {
            url = 'musicsearch/spotify/album/artist:"' + encodeURIComponent(media.artist) + '" album:"' + encodeURIComponent(media.title) + '"';
          }
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
      const baseUrl = 'http://' + config.server + ':' + config.port + '/' + config.rooms[0] + '/';
      this.http.get(baseUrl + url).subscribe();
    });
  }
}
