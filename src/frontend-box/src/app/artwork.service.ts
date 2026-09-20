import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { environment } from '../environments/environment'
import type { Media } from './media'

@Injectable({
  providedIn: 'root',
})
export class ArtworkService {
  // Pictures of radio streams are kept on the box: the backend fetches a picture once and
  // serves the saved copy from then on. The copy is stored under the picture's address, so a
  // changed address is downloaded again.
  cachedCoverUrl(media: Media, url: string): string {
    if (media.type === 'radio' && /^https?:\/\//i.test(url)) {
      return `${environment.backend.apiUrl}/rssfeed/image?url=${encodeURIComponent(url)}&w=400`
    }
    return url
  }

  getArtwork(media: Media): Observable<string> {
    const coverUrl = this.cachedCoverUrl(media, media.cover || '../assets/images/nocover_mupi.png')

    return new Observable((observer) => {
      observer.next(coverUrl)
    })
  }

  getArtistArtwork(media: Media): Observable<string> {
    const coverUrl = this.cachedCoverUrl(media, media.artistcover || media.cover || '../assets/images/nocover_mupi.png')

    return new Observable((observer) => {
      observer.next(coverUrl)
    })
  }
}
