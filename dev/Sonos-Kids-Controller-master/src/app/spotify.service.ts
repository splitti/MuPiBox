import { Injectable } from '@angular/core';
import { Observable, defer, throwError, of, range } from 'rxjs';
import { retryWhen, tap, delay, take, map, mergeMap, mergeAll, toArray } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { SpotifyAlbumsResponseItem } from './spotify';
import { Media } from './media';
import { default as SpotifyWebApi } from "spotify-web-api-js";
import SpotifyWebApiJs = SpotifyWebApi.SpotifyWebApiJs;
import AlbumSearchResponse = SpotifyApi.AlbumSearchResponse;
import ArtistsAlbumsResponse = SpotifyApi.ArtistsAlbumsResponse;
import AlbumObjectSimplified = SpotifyApi.AlbumObjectSimplified;
import PagingObject = SpotifyApi.PagingObject;
import SingleShowResponse = SpotifyApi.SingleShowResponse;
import ShowEpisodesResponse = SpotifyApi.ShowEpisodesResponse;
import EpisodeObjectSimplified = SpotifyApi.EpisodeObjectSimplified;

@Injectable({
  providedIn: 'root'
})
export class SpotifyService {

  refreshingToken = false;
  private spotifyApi: SpotifyWebApiJs;
  constructor(private http: HttpClient) {
    this.spotifyApi = new SpotifyWebApi()
  }

  getMediaByQuery(query: string, category: string, index: number, shuffle: boolean): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.searchAlbums(query, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: AlbumSearchResponse) => response.albums.total),
      mergeMap(count => range(0, Math.ceil(count / 50))),
      mergeMap(multiplier => defer(() => this.spotifyApi.searchAlbums(query, { limit: 50, offset: 50 * multiplier, market: 'DE' })).pipe(
        retryWhen(errors => {
          return this.errorHandler(errors);
        }),
        map((response: AlbumSearchResponse) => {
          return response.albums.items.map(item => {
            const media: Media = {
              id: item.id,
              artist: item.artists[0].name, // TS2339: Property 'artists' does not exist on type 'AlbumObjectSimplified'.
              title: item.name,
              cover: item.images[0].url,
              type: 'spotify',
              category,
              index,
              shuffle
            };
            return media;
          });
        })
      )),
      mergeAll(),
      toArray()
    );

    return albums;
  }

  getMediaByArtistID(id: string, category: string, index: number, shuffle: boolean): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.getArtistAlbums(id, { include_groups: 'album', limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: ArtistsAlbumsResponse) => response.total),
      mergeMap(count => range(0, Math.ceil(count / 50))),
      mergeMap(multiplier => defer(() => this.spotifyApi.getArtistAlbums(id, { include_groups: 'album', limit: 50, offset: 50 * multiplier, market: 'DE' })).pipe(
        retryWhen(errors => {
          return this.errorHandler(errors);
        }),
        map((response: PagingObject<AlbumObjectSimplified>) => {
          return response.items.map(item => {
            const media: Media = {
              id: item.id,
              artist: item.artists[0].name, // TS2339: Property 'artists' does not exist on type 'AlbumObjectSimplified'.
              title: item.name,
              cover: item.images[0].url,
              type: 'spotify',
              category,
              index,
              shuffle
            };
            return media;
          });
        })
      )),
      mergeAll(),
      toArray()
    );

    return albums;
  }

  getMediaByShowID(id: string, category: string, index: number, shuffle: boolean): Observable<Media[]> {
    const showname = defer(() => this.spotifyApi.getShow(id, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: SingleShowResponse) => {return response.name}),
      toArray()
    );
    const albums = defer(() => this.spotifyApi.getShow(id, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: SpotifyApi.SingleShowResponse) => response.episodes.total),
      mergeMap(count => range(0, Math.ceil(count / 50))),
      mergeMap(multiplier => defer(() => this.spotifyApi.getShowEpisodes(id, { limit: 50, offset: 50 * multiplier, market: 'DE' })).pipe(
        retryWhen(errors => {
          return this.errorHandler(errors);
        }),
        map((response: SpotifyApi.ShowEpisodesResponse) => {
          return response.items.map(item => {
            const media: Media = {
              showid: item.id,
              artist: showname.subscribe.name, //Showname noch definieren
              title: item.name,
              cover: item.images[0].url,
              type: 'spotify',
              category,
              release_date: item.release_date,
              index,
              shuffle
            };
            return media;
          });
        })
      )),
      mergeAll(),
      toArray()
    );

    return albums;
  }

  getMediaByEpisodeID(id: string, category: string, index: number, shuffle: boolean): Observable<Media[]> {
    const albums = defer(() => this.spotifyApi.getShowEpisodes(id, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: ShowEpisodesResponse) => response.total),
      mergeMap(count => range(0, Math.ceil(count / 50))),
      mergeMap(multiplier => defer(() => this.spotifyApi.getShowEpisodes(id, { limit: 50, offset: 50 * multiplier, market: 'DE' })).pipe(
        retryWhen(errors => {
          return this.errorHandler(errors);
        }),
        map((response: PagingObject<EpisodeObjectSimplified>) => {
          return response.items.map(item => {
            const media: Media = {
              showid: item.id,
              //artist: item.show.name,
              title: item.name,
              cover: item.images[0].url,
              type: 'spotify',
              category,
              release_date: item.release_date,
              index,
              shuffle
            };
            return media;
          });
        })
      )),
      mergeAll(),
      toArray()
    );

    return albums;
  }

  getMediaByID(id: string, category: string, index: number, shuffle: boolean): Observable<Media> {
    let fetch: any;

    switch (category) {
      case 'playlist':
        fetch = this.spotifyApi.getPlaylist;
        break;
      default:
        fetch = this.spotifyApi.getAlbum;
    }

    const album = defer(() => fetch(id, { limit: 1, offset: 0, market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: SpotifyAlbumsResponseItem) => {
        const media: Media = {
          id: response.id,
          artist: response.artists?.[0]?.name,
          title: response.name,
          cover: response?.images[0]?.url,
          type: 'spotify',
          category,
          index,
          shuffle
        };
        return media;
      })
    );

    return album;
  }

  // Only used for single "artist + title" entries with "type: spotify" in the database.
  // Artwork for spotify search queries are already fetched together with the initial searchAlbums request
  getAlbumArtwork(artist: string, title: string): Observable<string> {
    const artwork = defer(() => this.spotifyApi.searchAlbums('album:' + title + ' artist:' + artist, { market: 'DE' })).pipe(
      retryWhen(errors => {
        return this.errorHandler(errors);
      }),
      map((response: AlbumSearchResponse) => {
        return response?.albums?.items?.[0]?.images?.[0]?.url || '';
      })
    );

    return artwork;
  }

  refreshToken() {
    const tokenUrl = (environment.production) ? '../api/token' : 'http://localhost:8200/api/token';

    this.http.get(tokenUrl, {responseType: 'text'}).subscribe(token => {
      this.spotifyApi.setAccessToken(token);
      this.refreshingToken = false;
    });
  }

  errorHandler(errors: Observable<any>) {
    return errors.pipe(
      mergeMap((error) => (error.status !== 401 && error.status !== 429) ? throwError(error) : of(error)),
      tap(_ => {
        if (!this.refreshingToken) {
          this.refreshToken();
          this.refreshingToken = true;
        }
      }),
      delay(500),
      take(10)
    );
  }
}
