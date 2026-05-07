import { Injectable } from '@angular/core'
import { Observable, of } from 'rxjs'
import type { Media } from './media'

@Injectable({
  providedIn: 'root',
})
export class ArtworkService {
  // LOW-5: previous code used `new Observable(observer => observer.next(url))`
  // which never calls observer.complete(), so the observable stays "open"
  // forever. Subscribers leak — every cover lookup adds a non-completing
  // subscription that's only released when the component is destroyed.
  // `of(value)` is the idiomatic single-emit-then-complete observable.
  getArtwork(media: Media): Observable<string> {
    const coverUrl = media.cover || '../assets/images/nocover_mupi.png'
    return of(coverUrl)
  }

  getArtistArtwork(media: Media): Observable<string> {
    const coverUrl = media.artistcover || media.cover || '../assets/images/nocover_mupi.png'
    return of(coverUrl)
  }
}
