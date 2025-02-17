import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import type { Media } from './media'
import { SpotifyService } from './spotify.service'

@Injectable({
  providedIn: 'root',
})
export class ArtworkService {
  constructor(private spotifyService: SpotifyService) {}

  getArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>

    if (media.type === 'spotify' && !media.cover) {
      artwork = this.spotifyService.getAlbumArtwork(media.artist, media.title)
    } else {
      artwork = new Observable((observer) => {
        observer.next(media.cover)
      })
    }

    return artwork
  }

  getArtistArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>

    if (media.type === 'spotify' && !media.cover) {
      artwork = this.spotifyService.getAlbumArtwork(media.artist, media.title)
    } else {
      if (media.artistcover) {
        artwork = new Observable((observer) => {
          observer.next(media.artistcover)
        })
      } else {
        artwork = new Observable((observer) => {
          observer.next(media.cover)
        })
      }
    }

    return artwork
  }
}
