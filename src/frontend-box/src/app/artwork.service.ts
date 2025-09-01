import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import type { Media } from './media'

@Injectable({
  providedIn: 'root',
})
export class ArtworkService {
  constructor() {}

  getArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>

    const coverUrl = media.cover || '../assets/images/nocover_mupi.png'
    
    artwork = new Observable((observer) => {
      observer.next(coverUrl)
    })

    return artwork
  }

  getArtistArtwork(media: Media): Observable<string> {
    let artwork: Observable<string>

    const coverUrl = media.artistcover || media.cover || '../assets/images/nocover_mupi.png'
    
    artwork = new Observable((observer) => {
      observer.next(coverUrl)
    })

    return artwork
  }
}
