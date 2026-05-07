import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import type { Media } from './media'

// Tracks the Media that the player most recently started playing. Set by
// PlayerService.playMedia / resumeMedia. Read by the global resume-on-cap
// effect in AppComponent so we can write a resume entry when playtime / quiet
// hours stops playback while the user is on the home screen (and the player
// page — which historically owned saveResumeFiles — is unmounted).
@Injectable({ providedIn: 'root' })
export class CurrentMediaService {
  readonly currentMedia$ = new BehaviorSubject<Media | null>(null)

  set(media: Media | null): void {
    this.currentMedia$.next(media ? { ...media } : null)
  }

  get(): Media | null {
    return this.currentMedia$.value
  }

  clear(): void {
    this.currentMedia$.next(null)
  }
}
