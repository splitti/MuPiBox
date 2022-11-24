import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Media } from './media';
import { SpotifyService } from './spotify.service';

@Injectable({
  providedIn: 'root'
})
export class ArtworkService {

  constructor(
      private spotifyService: SpotifyService
  ) { }

  getArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>;

    if (media.type === 'spotify' && !media.cover) {
      console.log("getArtwork: Ich bin Spotify und habe kein cover: " + media);
      artwork = this.spotifyService.getAlbumArtwork(media.artist, media.title);
    } else {
      artwork = new Observable((observer) => {
        observer.next(media.cover);
      });
    }

    return artwork;
  }

  getArtistArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>;

    // if (media.showid !== undefined) {
    //   artwork = this.spotifyService.getShowArtwork(media.showid);
    // } else if (media.artistid !== undefined) {
    //   artwork = this.spotifyService.getArtistArtwork(media.artistid);
    // } else 
    if (media.type === 'spotify' && !media.cover) {
      console.log("getArtistArtwork: Ich bin Spotify und habe kein cover: " + media);
      artwork = this.spotifyService.getAlbumArtwork(media.artist, media.title);
    } else {
      if (media.type === 'library' && media.artistcover) {
        artwork = new Observable((observer) => {
          observer.next(media.artistcover);
        });
      } else {
        artwork = new Observable((observer) => {
          observer.next(media.cover);
        });
      }
    }

    return artwork;
  }
}
