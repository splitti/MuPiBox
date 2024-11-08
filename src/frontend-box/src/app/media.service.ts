import { Observable, Subject, from, iif, interval, of, timer } from 'rxjs'
import { distinctUntilChanged, filter, map, mergeAll, mergeMap, shareReplay, switchMap, toArray } from 'rxjs/operators'
import type { CategoryType, Media } from './media'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { environment } from '../environments/environment'
import type { AlbumStop } from './albumstop'
import type { Artist } from './artist'
import type { CurrentEpisode } from './current.episode'
import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentPlaylist } from './current.playlist'
import type { CurrentShow } from './current.show'
import type { CurrentSpotify } from './current.spotify'
import { Mupihat } from './mupihat'
import type { Network } from './network'
import { PlayerService } from './player.service'
import { RssFeedService } from './rssfeed.service'
import { SpotifyService } from './spotify.service'
import type { Validate } from './validate'
import type { WLAN } from './wlan'

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  ip: string
  response = ''
  private category: CategoryType = 'audiobook'
  public readonly current$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>
  public readonly network$: Observable<Network>
  public readonly albumStop$: Observable<AlbumStop>
  public readonly playlist$: Observable<CurrentPlaylist>
  public readonly episode$: Observable<CurrentEpisode>
  public readonly show$: Observable<CurrentShow>
  public readonly validate$: Observable<Validate>
  public readonly mupihat$: Observable<Mupihat>

  private wlanSubject = new Subject<WLAN[]>()

  constructor(
    private http: HttpClient,
    private spotifyService: SpotifyService,
    private rssFeedService: RssFeedService,
    private playerService: PlayerService,
  ) {
    this.playerService.getConfig().subscribe((config) => {
      if (config.ip) {
        this.ip = config.ip
      } else {
        this.ip = config.server
      }
    })

    // Prepare subscriptions.
    // shareReplay replays the most recent (bufferSize) emission on each subscription
    // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
    this.current$ = interval(1000).pipe(
      switchMap((): Observable<CurrentSpotify> => this.http.get<CurrentSpotify>(`http://${this.ip}:5005/state`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.local$ = interval(1000).pipe(
      switchMap((): Observable<CurrentMPlayer> => this.http.get<CurrentMPlayer>(`http://${this.ip}:5005/local`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.playlist$ = interval(1000).pipe(
      switchMap(
        (): Observable<CurrentPlaylist> => this.http.get<CurrentPlaylist>(`http://${this.ip}:5005/playlistTracks`),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.episode$ = interval(1000).pipe(
      switchMap((): Observable<CurrentEpisode> => this.http.get<CurrentEpisode>(`http://${this.ip}:5005/episode`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.show$ = interval(1000).pipe(
      switchMap((): Observable<CurrentShow> => this.http.get<CurrentShow>(`http://${this.ip}:5005/show`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    // 5 seconds is enough for wifi update and showing/hiding media.
    // Use timer so the first request is after 300ms.
    this.network$ = timer(300, 5000).pipe(
      switchMap((): Observable<Network> => this.http.get<Network>(`http://${this.ip}:8200/api/network`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.albumStop$ = interval(1000).pipe(
      switchMap((): Observable<AlbumStop> => this.http.get<AlbumStop>(`http://${this.ip}:8200/api/albumstop`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.validate$ = interval(1000).pipe(
      switchMap((): Observable<Validate> => this.http.get<Validate>(`http://${this.ip}:5005/validate`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    // Every 2 seconds should be enough for timely charging update.
    this.mupihat$ = interval(2000).pipe(
      switchMap((): Observable<Mupihat> => this.http.get<Mupihat>(`http://${this.ip}:8200/api/mupihat`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
  }

  // --------------------------------------------
  // Handling of RAW media entries from data.json
  // --------------------------------------------

  public isOnline(): Observable<boolean> {
    return this.network$.pipe(
      filter((network) => network.ip !== undefined),
      map((network) => network.onlinestate === 'online'),
      distinctUntilChanged(),
    )
  }

  public fetchRawMedia(): Observable<Media[]> {
    return this.http.get<Media[]>(`${this.getAPIBaseUrl()}/data`)
  }

  updateWLAN() {
    const url = `${this.getAPIBaseUrl()}/wlan`
    this.http.get<WLAN[]>(url).subscribe((wlan) => {
      this.wlanSubject.next(wlan)
    })
  }

  deleteRawMediaAtIndex(index: number) {
    const url = `${this.getAPIBaseUrl()}/delete`
    const body = {
      index,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  editRawMediaAtIndex(index: number, data: Media) {
    const url = `${this.getAPIBaseUrl()}/edit`
    const body = {
      index,
      data,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addRawMedia(media: Media) {
    const url = `${this.getAPIBaseUrl()}/add`

    this.http.post(url, media, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  editRawResumeAtIndex(index: number, data: Media) {
    const url = `${this.getAPIBaseUrl()}/editresume`
    const body = {
      index,
      data,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addRawResume(media: Media) {
    const url = `${this.getAPIBaseUrl()}/addresume`

    this.http.post(url, media, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addWLAN(wlan: WLAN) {
    const url = `${this.getAPIBaseUrl()}/addwlan`

    this.http.post(url, wlan).subscribe((response) => {
      //this.response = response;
      this.updateWLAN()
    })
  }

  // Collect albums from a given artist in the current category
  public fetchMediaFromArtist(artist: Artist, category: CategoryType): Observable<Media[]> {
    return this.fetchMedia(category).pipe(
      map((media: Media[]) => {
        return media.filter((currentMedia) => currentMedia.artist === artist.name)
      }),
    )
  }

  public fetchMediaData(category: CategoryType): Observable<Media[]> {
    return this.fetchMedia(category).pipe(
      map((media: Media[]) => {
        return media.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        )
      }),
    )
  }

  public fetchArtistData(category: CategoryType): Observable<Artist[]> {
    return this.fetchMedia(category).pipe(
      map((media: Media[]) => {
        // Create temporary object with artists as keys and albumCounts as values
        const mediaCounts = media.reduce((tempCounts, currentMedia) => {
          tempCounts[currentMedia.artist] = (tempCounts[currentMedia.artist] || 0) + 1
          return tempCounts
        }, {})

        // Create temporary object with artists as keys and covers (first media cover) as values
        const covers = media
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce((tempCovers, currentMedia) => {
            if (/* currentMedia.type === 'library' &&  */ currentMedia.artistcover) {
              if (!tempCovers[currentMedia.artist]) {
                tempCovers[currentMedia.artist] = currentMedia.artistcover
              }
            } else {
              if (!tempCovers[currentMedia.artist]) {
                tempCovers[currentMedia.artist] = currentMedia.cover
              }
            }
            return tempCovers
          }, {})

        // Create temporary object with artists as keys and first media as values
        const coverMedia = media
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce((tempMedia, currentMedia) => {
            if (!tempMedia[currentMedia.artist]) {
              tempMedia[currentMedia.artist] = currentMedia
            }
            return tempMedia
          }, {})

        // Build Array of Artist objects sorted by Artist name
        const artists: Artist[] = Object.keys(mediaCounts)
          .sort()
          .map((currentName) => {
            const artist: Artist = {
              name: currentName,
              albumCount: mediaCounts[currentName],
              cover: covers[currentName],
              coverMedia: coverMedia[currentName],
            }
            return artist
          })

        return artists
      }),
    )
  }

  public fetchActiveResumeData(): Observable<Media[]> {
    // Category is irrelevant if 'resume' is set to true.
    return this.updateMedia(`${this.getAPIBaseUrl()}/activeresume`, true, 'resume').pipe(
      map((media: Media[]) => {
        return media.reverse()
      }),
    )
  }

  private fetchMedia(category: CategoryType): Observable<Media[]> {
    return this.updateMedia(`${this.getAPIBaseUrl()}/data`, false, category)
  }

  // Get the media data for the current category from the server
  private updateMedia(url: string, resume: boolean, category: CategoryType): Observable<Media[]> {
    // Custom rxjs pipe to override artist.
    const overwriteArtist =
      (item: Media) =>
      (source$: Observable<Media[]>): Observable<Media[]> => {
        return source$.pipe(
          // If the user entered an user-defined artist name in addition to a query,
          // overwrite orignal artist from spotify.
          map((items) => {
            if (item.artist?.length > 0) {
              for (const currentItem of items) {
                currentItem.artist = item.artist
              }
            }
            return items
          }),
        )
      }

    return this.http.get<Media[]>(url).pipe(
      // Filter to get only items for the chosen category.
      map((items) => {
        if (resume) {
          return items
        }
        // Else: !resume.
        for (const item of items) {
          item.category = item.category === undefined ? 'audiobook' : item.category
        }
        return items.filter((item) => item.category === category)
      }),
      mergeMap((items) => from(items)), // parallel calls for each item
      map(
        // get media for the current item
        (item) =>
          iif(
            // Get media by query
            () => !!(item.query && item.query.length > 0),
            this.spotifyService
              .getMediaByQuery(item.query, item.category, item.index, item)
              .pipe(overwriteArtist(item)),
            iif(
              // Get media by artist
              () => !!(item.artistid && item.artistid.length > 0),
              this.spotifyService
                .getMediaByArtistID(item.artistid, item.category, item.index, item)
                .pipe(overwriteArtist(item)),
              iif(
                // Get media by show
                () => !!(item.showid && item.showid.length > 0 && item.category !== 'resume'),
                this.spotifyService
                  .getMediaByShowID(item.showid, item.category, item.index, item)
                  .pipe(overwriteArtist(item)),
                iif(
                  // Get media by show supporting resume
                  () => !!(item.showid && item.showid.length > 0 && item.category === 'resume'),
                  this.spotifyService
                    .getMediaByEpisode(
                      item.showid,
                      item.category,
                      item.index,
                      item.shuffle,
                      item.artistcover,
                      item.resumespotifyduration_ms,
                      item.resumespotifyprogress_ms,
                      item.resumespotifytrack_number,
                    )
                    .pipe(
                      map((currentItem) => [currentItem]),
                      overwriteArtist(item),
                    ),
                  iif(
                    // Get media by playlist
                    () => !!(item.type === 'spotify' && item.playlistid && item.playlistid.length > 0),
                    this.spotifyService
                      .getMediaByPlaylistID(
                        item.playlistid,
                        item.category,
                        item.index,
                        item.shuffle,
                        item.artistcover,
                        item.resumespotifyduration_ms,
                        item.resumespotifyprogress_ms,
                        item.resumespotifytrack_number,
                      )
                      .pipe(
                        map((currentItem) => [currentItem]),
                        overwriteArtist(item),
                      ),
                    iif(
                      // Get media by rss feed
                      () => !!(item.type === 'rss' && item.id.length > 0 && item.category !== 'resume'),
                      this.rssFeedService
                        .getRssFeed(this.ip, item.id, item.category, item.index, item)
                        .pipe(overwriteArtist(item)),
                      iif(
                        // Get media by album (resume).
                        () => !!(item.type === 'spotify' && item.id && item.id.length > 0),
                        this.spotifyService
                          .getMediaByID(
                            item.id,
                            item.category,
                            item.index,
                            item.shuffle,
                            item.artistcover,
                            item.resumespotifyduration_ms,
                            item.resumespotifyprogress_ms,
                            item.resumespotifytrack_number,
                          )
                          .pipe(
                            map((currentItem) => [currentItem]),
                            overwriteArtist(item),
                          ),
                        of([item]), // Single album. Also return as array, so we always have the same data type
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ),
      mergeMap((items) => from(items)), // seperate arrays to single observables
      mergeAll(), // merge everything together
      toArray(), // convert to array
      map((media) => {
        // add dummy image for missing covers
        return media.map((currentMedia) => {
          if (!currentMedia.cover) {
            currentMedia.cover = '../assets/images/nocover_mupi.png'
          }
          return currentMedia
        })
      }),
    )
  }

  // Get all media entries for the current category
  getResponse() {
    const tmpResponse = this.response
    this.response = ''

    return tmpResponse
  }

  // Choose which media category should be displayed in the app
  setCategory(category: CategoryType) {
    this.category = category
  }

  public getAPIBaseUrl(): string {
    return environment.backend.apiUrl
  }
}
