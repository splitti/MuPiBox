import type {
  Album,
  Artist,
  Audiobook,
  Episode,
  Page,
  SearchResults,
  Show,
  SimplifiedAlbum,
  SimplifiedEpisode,
} from '@spotify/web-api-ts-sdk'
import type { CategoryType, Media } from './media'
import { EMPTY, Observable, catchError, defer, firstValueFrom, of, range, throwError } from 'rxjs'
import { ExtraDataMedia, Utils } from './utils'
import { SpotifyAlbumsResponseItem, SpotifyConfig } from './spotify'
import { delay, map, mergeAll, mergeMap, retryWhen, take, tap, toArray } from 'rxjs/operators'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import { environment } from 'src/environments/environment'

declare const require: any

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  userSpotifyApi: any
  spotifyApi: SpotifyApi | undefined = undefined
  refreshingToken = false

  constructor(private http: HttpClient) {
    const SpotifyWebApi = require('../../src/app/spotify-web-api.js')
    this.userSpotifyApi = new SpotifyWebApi()
    this.refreshToken()
    this.initializeSpotifyApi()
  }

  getMediaByQuery(
    query: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.search(query, ['album'], 'DE', 1, 0)).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: SearchResults<['album']>) => response.albums.total),
      mergeMap((count) => range(0, Math.ceil(count / 50))),
      mergeMap((multiplier) =>
        defer(() => this.spotifyApi.search(query, ['album'], 'DE', 50, 50 * multiplier)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          map((response: SearchResults<['album']>) => {
            return response.albums.items.map((item) => {
              const media: Media = {
                id: item.id,
                artist: item.artists[0].name,
                title: item.name,
                cover: item.images[0].url,
                release_date: item.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )

    return albums
  }

  getMediaByArtistID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.artists.albums(id, 'album,single,compilation', 'DE', 1, 0)).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: Page<SimplifiedAlbum>) => ({ counter: response.total })),
      mergeMap((count) =>
        range(0, Math.ceil(count.counter / 50)).pipe(
          map((index) => ({
            range: index,
            ...count,
          })),
        ),
      ),
      mergeMap((counter) =>
        defer(() => this.spotifyApi.artists.get(id)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          map((response: Artist) => ({
            range: counter.range,
            artistcover: response.images[0].url,
          })),
        ),
      ),
      mergeMap((multiplier) =>
        defer(() =>
          this.spotifyApi.artists.albums(id, 'album,single,compilation', 'DE', 50, 50 * multiplier.range),
        ).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          map((response: Page<SimplifiedAlbum>) => {
            return response.items.map((item) => {
              const media: Media = {
                id: item.id,
                artist: item.artists[0].name,
                title: item.name,
                cover: item.images[0].url,
                artistcover: multiplier.artistcover,
                release_date: item.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )

    return albums
  }

  getMediaByShowID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.shows.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: Show) => ({
        count: response.episodes.total,
        name: response.name,
        showcover: response.images[0].url,
      })),
      mergeMap((obj) =>
        range(0, Math.ceil(obj.count / 50)).pipe(
          map((index) => ({
            range: index,
            ...obj,
          })),
        ),
      ),
      mergeMap((multiplier) =>
        defer(() => this.spotifyApi.shows.episodes(id, 'DE', 50, 50 * multiplier.range)).pipe(
          retryWhen((errors) => {
            return this.errorHandler(errors)
          }),
          map((response: Page<SimplifiedEpisode>) => {
            return response.items
              .filter((el) => el != null)
              .map((item) => {
                const media: Media = {
                  showid: item.id,
                  artist: multiplier.name,
                  title: item.name,
                  cover: item.images[0].url,
                  artistcover: multiplier.showcover,
                  type: 'spotify',
                  category,
                  release_date: item.release_date,
                  index,
                }
                Utils.copyExtraMediaData(extraDataSource, media)
                return media
              })
          }),
        ),
      ),
      mergeAll(),
      toArray(),
    )
    return albums
  }

  getMediaByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const album = defer(() => this.spotifyApi.albums.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: Album) => {
        const media: Media = {
          id: response.id,
          artist: response.artists?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          release_date: response.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
    return album
  }

  getAudiobookByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const audiobook = defer(() => this.spotifyApi.audiobooks.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: Audiobook) => {
        const media: Media = {
          audiobookid: response.id,
          artist: response.authors?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
    return audiobook
  }

  getMediaByEpisode(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const album = defer(() => this.spotifyApi.episodes.get(id, 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: Episode) => {
        const media: Media = {
          showid: response.id,
          artist: response.show?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          release_date: response.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
    return album
  }

  getMediaByPlaylistID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const album = defer(() => this.userSpotifyApi.getPlaylist(id, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      catchError((err) => {
        console.log('Caught error for Spotify playlist %s, continuing...', id)
        return EMPTY
      }),
      map((response: SpotifyAlbumsResponseItem) => {
        const media: Media = {
          playlistid: response.id,
          artist: response.artists?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          release_date: response.release_date,
          type: 'spotify',
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
    return album
  }

  // Only used for single "artist + title" entries with "type: spotify" in the database.
  // Artwork for spotify search queries are already fetched together with the initial searchAlbums request
  getAlbumArtwork(artist: string, title: string): Observable<string> {
    const artwork = defer(() => this.spotifyApi.search(`album:${title} artist:${artist}`, ['album'], 'DE')).pipe(
      retryWhen((errors) => {
        return this.errorHandler(errors)
      }),
      map((response: SearchResults<['album']>) => {
        return response?.albums?.items?.[0]?.images?.[0]?.url || ''
      }),
    )

    return artwork
  }

  async validateSpotify(spotifyId: string, spotifyCategory: string): Promise<boolean> {
    let validateState = false

    try {
      if (spotifyCategory === 'album') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.albums.get(spotifyId, 'DE')).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'show') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.shows.get(spotifyId, 'DE')).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'audiobook') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.audiobooks.get(spotifyId)).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'artist') {
        const data: any = await firstValueFrom(
          defer(() => this.spotifyApi.artists.get(spotifyId)).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      } else if (spotifyCategory === 'playlist') {
        const data: any = await firstValueFrom(
          defer(() => this.userSpotifyApi.getPlaylist(spotifyId)).pipe(
            retryWhen((errors) => {
              return this.errorHandler(errors)
            }),
          ),
        )
        if (data.id !== undefined) {
          validateState = true
        }
      }
    } catch (err) {
      console.log(err)
      validateState = false
    }

    return validateState
  }

  refreshToken() {
    if (this.refreshingToken) {
      return
    }
    this.refreshingToken = true
    const tokenUrl = `${environment.backend.playerUrl}/spotify/token`
    this.http.get(tokenUrl, { responseType: 'text' }).subscribe({
      next: (token) => {
        this.userSpotifyApi.setAccessToken(token)
        this.refreshingToken = false
      },
      error: () => {
        this.refreshingToken = false
      },
    })
  }

  initializeSpotifyApi(): void {
    const spotifyConfigUrl = `${environment.backend.apiUrl}/spotify/config`
    this.http
      .get<SpotifyConfig>(spotifyConfigUrl)
      .pipe(take(1))
      .subscribe({
        next: (spotifyConfig: SpotifyConfig) => {
          this.spotifyApi = SpotifyApi.withClientCredentials(spotifyConfig.clientId, spotifyConfig.clientSecret)
        },
      })
  }

  errorHandler(errors: Observable<any>) {
    return errors.pipe(
      mergeMap((error) => (error.status !== 401 && error.status !== 429 ? throwError(error) : of(error))),
      tap((_) => {
        this.refreshToken()
      }),
      delay(500),
      take(10),
    )
  }
}
