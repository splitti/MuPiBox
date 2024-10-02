import { Observable, Subject, from, iif, interval, of } from 'rxjs';
import { map, mergeAll, mergeMap, shareReplay, switchMap, tap, toArray } from 'rxjs/operators';

import { AlbumStop } from './albumstop';
import { Artist } from './artist';
import { CurrentEpisode } from './current.episode';
import { CurrentMPlayer } from './current.mplayer';
import { CurrentPlaylist } from './current.playlist';
import { CurrentShow } from './current.show';
import { CurrentSpotify } from './current.spotify';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Media } from './media';
import { Monitor } from './monitor';
import { Mupihat } from './mupihat';
import { Network } from "./network";
import { PlayerService } from './player.service';
import { RssFeedService } from './rssfeed.service';
import { SonosApiConfig } from './sonos-api';
import { SpotifyService } from './spotify.service';
import { Validate } from './validate';
import { WLAN } from './wlan';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MediaService {

  network: Network;
  ip: string;
  hostname: string;
  response = '';
  private category = 'audiobook';
  public readonly current$: Observable<CurrentSpotify>;
  public readonly local$: Observable<CurrentMPlayer>;
  public readonly network$: Observable<Network>;
  public readonly monitor$: Observable<Monitor>;
  public readonly resume$: Observable<Media[]>;
  public readonly albumStop$: Observable<AlbumStop>;
  public readonly networkLocal$: Observable<Network>;
  public readonly playlist$: Observable<CurrentPlaylist>;
  public readonly episode$: Observable<CurrentEpisode>;
  public readonly show$: Observable<CurrentShow>;
  public readonly validate$: Observable<Validate>;
  public readonly mupihat$: Observable<Mupihat>;
  public readonly config$: Observable<SonosApiConfig>;

  private rawMediaSubject = new Subject<Media[]>();
  private wlanSubject = new Subject<WLAN[]>();
  private networkSubject = new Subject<Network>();
  private resumeSubject = new Subject<Media[]>();

  private artistSubject = new Subject<Media[]>();
  private mediaSubject = new Subject<Media[]>();
  private artistMediaSubject = new Subject<Media[]>();

  constructor(
    private http: HttpClient,
    private spotifyService: SpotifyService,
    private rssFeedService: RssFeedService,
    private playerService: PlayerService,
  ) {
    this.playerService.getConfig().subscribe(config => {
      console.log(config);
      if (config.ip){
        this.ip = config.ip;
      }else {
        this.ip = config.server;
      }
    });
    this.current$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<CurrentSpotify> => this.http.get<CurrentSpotify>('http://' + this.ip + ':5005/state')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.local$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<CurrentMPlayer> => this.http.get<CurrentMPlayer>('http://' + this.ip + ':5005/local')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.playlist$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<CurrentPlaylist> => this.http.get<CurrentPlaylist>('http://' + this.ip + ':5005/playlistTracks')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.episode$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<CurrentEpisode> => this.http.get<CurrentEpisode>('http://' + this.ip + ':5005/episode')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.show$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<CurrentShow> => this.http.get<CurrentShow>('http://' + this.ip + ':5005/show')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.network$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<Network> => this.http.get<Network>('http://' + this.ip + ':8200/api/network')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.monitor$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<Monitor> => this.http.get<Monitor>('http://' + this.ip + ':8200/api/monitor')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.resume$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<Media[]> => this.http.get<Media[]>('http://' + this.ip + ':8200/api/resume')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.albumStop$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<AlbumStop> => this.http.get<AlbumStop>('http://' + this.ip + ':8200/api/albumstop')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.validate$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<Validate> => this.http.get<Validate>('http://' + this.ip + ':5005/validate')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.mupihat$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<Mupihat> => this.http.get<Mupihat>('http://' + this.ip + ':8200/api/mupihat')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.config$ = interval(1000).pipe( // Once a second after subscribe, way too frequent!
      switchMap((): Observable<SonosApiConfig> => this.http.get<SonosApiConfig>('http://' + this.ip + ':8200/api/sonos')),
      // Replay the most recent (bufferSize) emission on each subscription
      // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
   }

  // --------------------------------------------
  // Handling of RAW media entries from data.json
  // --------------------------------------------

  getNetworkObservable = (): Observable<Network> =>  {
      const url = (environment.production) ? '../api/network' : 'http://' + this.ip + ':8200/api/network';
      return this.http.get<Network>(url);
  }

  updateNetwork() {
    const url = (environment.production) ? '../api/network' : 'http://' + this.ip + ':8200/api/network';
    this.http.get<Network>(url).subscribe(network => {
        this.networkSubject.next(network);
    });
  }

  getRawMediaObservable = ():Observable<Record<any, any>[]> => {
      const url = (environment.production) ? '../api/data' : 'http://' + this.ip + ':8200/api/data';
      return this.http.get<Record<any, any>[]>(url);
  }

  updateRawMedia() {
    const url = (environment.production) ? '../api/data' : 'http://' + this.ip + ':8200/api/data';
    this.http.get<Media[]>(url).subscribe(media => {
        this.rawMediaSubject.next(media);
    });
  }

  getRawResumeObservable = ():Observable<Record<any, any>[]> => {
    const url = (environment.production) ? '../api/resume' : 'http://' + this.ip + ':8200/api/resume';
    return this.http.get<Record<any, any>[]>(url);
  }

  updateRawResume() {
    const url = (environment.production) ? '../api/resume' : 'http://' + this.ip + ':8200/api/resume';
    this.http.get<Media[]>(url).subscribe(media => {
        this.resumeSubject.next(media);
    });
  }

  updateWLAN() {
    const url = (environment.production) ? '../api/wlan' : 'http://' + this.ip + ':8200/api/wlan';
    this.http.get<WLAN[]>(url).subscribe(wlan => {
        this.wlanSubject.next(wlan);
    });
  }

  deleteRawMediaAtIndex(index: number) {
    const url = (environment.production) ? '../api/delete' : 'http://' + this.ip + ':8200/api/delete';
    const body = {
      index
    };

    this.http.post(url, body, { responseType: 'text' }).subscribe(response => {
      this.response = response;
      this.updateRawMedia();
    });
  }

  editRawMediaAtIndex(index: number, data: Media) {
    const url = (environment.production) ? '../api/edit' : 'http://' + this.ip + ':8200/api/edit';
    const body = {
      index,
      data
    };
    
    this.http.post(url, body, { responseType: 'text' }).subscribe(response => {
      this.response = response;
      this.updateRawMedia();
    });
  }

  addRawMedia(media: Media) {
    const url = (environment.production) ? '../api/add' : 'http://' + this.ip + ':8200/api/add';

    this.http.post(url, media, { responseType: 'text' }).subscribe(response => {
      this.response = response;
      this.updateRawMedia();
    });
  }

  editRawResumeAtIndex(index: number, data: Media) {
    const url = (environment.production) ? '../api/editresume' : 'http://' + this.ip + ':8200/api/editresume';
    const body = {
      index,
      data
    };

    console.log(body);
    
    this.http.post(url, body, { responseType: 'text' }).subscribe(response => {
      this.response = response;
      this.updateRawResume();
    });
  }

  addRawResume(media: Media) {
    const url = (environment.production) ? '../api/addresume' : 'http://' + this.ip + ':8200/api/addresume';

    this.http.post(url, media, { responseType: 'text' }).subscribe(response => {
      this.response = response;
      this.updateRawResume();
    });
  }

  addWLAN(wlan: WLAN) {
    const url = (environment.production) ? '../api/addwlan' : 'http://' + this.ip + ':8200/api/addwlan';

    this.http.post(url, wlan).subscribe(response => {
      //this.response = response;
      this.updateWLAN();
    });
  }

  // Get the media data for the current category from the server
  private updateMedia(url: string, resume: boolean) {
    // Custom rxjs pipe to override artist.
    const overwriteArtist = (item: Media) => (source$: Observable<Media[]>): Observable<Media[]> => {
      return source$.pipe(
        // If the user entered an user-defined artist name in addition to a query,
        // overwrite orignal artist from spotify.
        map(items => {
          if (item.artist?.length > 0) {
            items.forEach(currentItem => {
              currentItem.artist = item.artist;
            });
          }
          return items;
        })
      )
    }


    return this.http.get<Media[]>(url).pipe(
      // Filter to get only items for the chosen category.
      map(items => {
        if (!resume) {
          items.forEach(item => item.category = (item.category === undefined) ? 'audiobook' : item.category);
          items = items.filter(item => item.category === this.category)
        }
        return items;
      }),
      mergeMap(items => from(items)), // parallel calls for each item
      map((item) => // get media for the current item
        iif(
          () => (item.query && item.query.length > 0) ? true : false, // Get media by query
          this.spotifyService.getMediaByQuery(item.query, item.category, item.index, item).pipe(overwriteArtist(item)),
          iif(
            () => (item.artistid && item.artistid.length > 0) ? true : false, // Get media by artist
            this.spotifyService.getMediaByArtistID(item.artistid, item.category, item.index, item).pipe(overwriteArtist(item)),
            iif(
              () => (item.showid && item.showid.length > 0 && item.category !== "resume") ? true : false, // Get media by show
                this.spotifyService.getMediaByShowID(item.showid, item.category, item.index, item).pipe(
                  overwriteArtist(item)
                ),
                iif(
                  () => (item.showid && item.showid.length > 0 && item.category === "resume") ? true : false, // Get media by show supporting resume
                    this.spotifyService.getMediaByEpisode(item.showid, item.category, item.index, item.shuffle, item.artistcover, item.resumespotifyduration_ms, item.resumespotifyprogress_ms, item.resumespotifytrack_number).pipe(
                      map(currentItem => [currentItem]), // Return single album as list to keep data type.
                      overwriteArtist(item)
                    ),
                    iif(
                      () => (item.type === 'spotify' && item.playlistid && item.playlistid.length > 0) ? true : false, // Get media by playlist
                        this.spotifyService.getMediaByPlaylistID(item.playlistid, item.category, item.index, item.shuffle, item.artistcover, item.resumespotifyduration_ms, item.resumespotifyprogress_ms, item.resumespotifytrack_number).pipe(
                          map(currentItem => [currentItem]), // Return single album as list to keep data type.
                          overwriteArtist(item)
                        ),iif(
                          () => (item.type === 'rss' && item.id.length > 0 && item.category !== "resume") ? true : false, // Get media by rss feed
                            this.rssFeedService.getRssFeed(this.ip, item.id, item.category, item.index, item.shuffle, item.aPartOfAll, item.aPartOfAllMin, item.aPartOfAllMax, item.artistcover).pipe(
                              overwriteArtist(item)
                            ),iif(
                              () => (item.type === 'spotify' && item.id && item.id.length > 0) ? true : false, // Get media by album
                                this.spotifyService.getMediaByID(item.id, item.category, item.index, item.shuffle, item.artistcover, item.resumespotifyduration_ms, item.resumespotifyprogress_ms, item.resumespotifytrack_number).pipe(
                                  map(currentItem => [currentItem]), // Return single album as list to keep data type.
                                  overwriteArtist(item)
                                )
                    )
                  )
                )
              )
            )
          )
        )
      ),
      mergeMap(items => from(items)), // seperate arrays to single observables
      mergeAll(), // merge everything together
      toArray(), // convert to array
      map(media => { // add dummy image for missing covers
        return media.map(currentMedia => {
          if (!currentMedia.cover) {
            currentMedia.cover = '../assets/images/nocover_mupi.png';
          }
          return currentMedia;
        });
      })
    );
  }

  publishArtists() {
    console.log("publishArtists");
    const url = (environment.production) ? '../api/data' : 'http://' + this.ip + ':8200/api/data';
    this.updateMedia(url, false).subscribe(media => {
      this.artistSubject.next(media);
    });
  }

  publishMedia() {
    console.log("publishMedia");
    const url = (environment.production) ? '../api/data' : 'http://' + this.ip + ':8200/api/data';
    this.updateMedia(url, false).subscribe(media => {
      this.mediaSubject.next(media);
    });
  }

  publishArtistMedia() {
    console.log("publishArtistMedia");
    const url = (environment.production) ? '../api/data' : 'http://' + this.ip + ':8200/api/data';
    this.updateMedia(url, false).subscribe(media => {
      this.artistMediaSubject.next(media);
    });
  }

  publishResume() {
    console.log("publishResume");
    const url = (environment.production) ? '../api/activeresume' : 'http://' + this.ip + ':8200/api/activeresume';
    this.updateMedia(url, true).subscribe(media => {
      this.resumeSubject.next(media);
    });
  }

  // Get all artists for the current category
  getArtists(): Observable<Artist[]> {
    return this.artistSubject.pipe(
      map((media: Media[]) => {
        // Create temporary object with artists as keys and albumCounts as values
        const mediaCounts = media.reduce((tempCounts, currentMedia) => {
          tempCounts[currentMedia.artist] = (tempCounts[currentMedia.artist] || 0) + 1;
          return tempCounts;
        }, {});

        // Create temporary object with artists as keys and covers (first media cover) as values
        const covers = media.sort((a, b) => a.title <= b.title ? -1 : 1).reduce((tempCovers, currentMedia) => {
            if (/* currentMedia.type === 'library' &&  */currentMedia.artistcover) {
              if (!tempCovers[currentMedia.artist]) { tempCovers[currentMedia.artist] = currentMedia.artistcover; }
            } else {
              if (!tempCovers[currentMedia.artist]) { tempCovers[currentMedia.artist] = currentMedia.cover; }
            }
            return tempCovers;
        }, {});

        // Create temporary object with artists as keys and first media as values
        const coverMedia = media.sort((a, b) => a.title <= b.title ? -1 : 1).reduce((tempMedia, currentMedia) => {
          if (!tempMedia[currentMedia.artist]) { tempMedia[currentMedia.artist] = currentMedia; }
          return tempMedia;
      }, {});

        // Build Array of Artist objects sorted by Artist name
        const artists: Artist[] = Object.keys(mediaCounts).sort().map(currentName => {
          const artist: Artist = {
            name: currentName,
            albumCount: mediaCounts[currentName],
            cover: covers[currentName],
            coverMedia: coverMedia[currentName]
          };
          return artist;
        });

        return artists;
      })
    );
  }

  // Collect albums from a given artist in the current category
  getMediaFromArtist(artist: Artist): Observable<Media[]> {
    return this.artistMediaSubject.pipe(
      map((media: Media[]) => {
        return media.filter(currentMedia => currentMedia.artist === artist.name)
      })
    );
  }

  // Collect albums from a given artist in the current category
  getMediaFromResume(): Observable<Media[]> {
    return this.resumeSubject.pipe(
      map((media: Media[]) => {
        return media.reverse()
      })
    );
  }

  // Get all media entries for the current category
  getMedia(): Observable<Media[]> {
    return this.mediaSubject.pipe(
      map((media: Media[]) => {
        return media
          .sort((a, b) => a.title.localeCompare(b.title, undefined, {
            numeric: true,
            sensitivity: 'base'
          }));
      })
    );
  }

  // Get all media entries for the current category
  getResponse() {
    let tmpResponse = this.response;
    this.response = ''

    return tmpResponse;
  }

    // Choose which media category should be displayed in the app
  setCategory(category: string) {
    this.category = category;
  }
}
