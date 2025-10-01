import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import type { Media } from './media'

@Injectable({
  providedIn: 'root',
})
export class ArtworkService {
  getArtwork(media: Media): Observable<string> {
    const coverUrl = media.cover || '../assets/images/nocover_mupi.png'

    return new Observable((observer) => {
      observer.next(coverUrl)
    })
  }

  getArtistArtwork(media: Media): Observable<string> {
    const coverUrl = media.artistcover || media.cover || '../assets/images/nocover_mupi.png'

    return new Observable((observer) => {
      observer.next(coverUrl)
    })
  }
}
