import { Injectable } from '@angular/core'
import { BehaviorSubject, interval } from 'rxjs'
import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
import type { Media } from './media'
import { MediaService } from './media.service'

// Tracks the Media that the player most recently started playing. Set by
// PlayerService.playMedia / resumeMedia. Read by the global resume-on-cap
// effect in AppComponent so we can write a resume entry when playtime / quiet
// hours stops playback while the user is on the home screen (and the player
// page — which historically owned saveResumeFiles — is unmounted).
//
// Also gates whether a resume entry should be persisted at all: a kid touching
// the wrong cover for a few seconds shouldn't pollute the resume swiper.
// shouldPersistResume() returns true once the kid has actively listened to
// the current Media for RESUME_THRESHOLD_S seconds — wall-clock pauses don't
// count, and the counter resets on every new playMedia/resumeMedia.
@Injectable({ providedIn: 'root' })
export class CurrentMediaService {
  // Active-listening seconds required before a resume entry is worth keeping.
  // 30s is the historical value from the player.page's onLeave guard; lifting
  // it into one service so the same intent applies to the Cap-time saver in
  // AppComponent and to any future save path.
  private static readonly RESUME_THRESHOLD_S = 30

  readonly currentMedia$ = new BehaviorSubject<Media | null>(null)

  private activeSeconds = 0
  private worthResume = false
  private latestSpotify: CurrentSpotify | null = null
  private latestLocal: CurrentMPlayer | null = null

  constructor(mediaService: MediaService) {
    // current$ / local$ are shareReplay'd inside MediaService — keeping a
    // forever-subscription here is cheap and runs alongside the existing
    // pollers (1s for mplayer, 1s/10s for Spotify depending on SDK use).
    mediaService.current$.subscribe((s) => {
      this.latestSpotify = s
    })
    mediaService.local$.subscribe((l) => {
      this.latestLocal = l
    })
    interval(1000).subscribe(() => this.tick())
  }

  set(media: Media | null): void {
    this.activeSeconds = 0
    this.worthResume = false
    this.currentMedia$.next(media ? { ...media } : null)
  }

  get(): Media | null {
    return this.currentMedia$.value
  }

  clear(): void {
    this.set(null)
  }

  // Single source of truth for "has this kid been listening long enough that
  // we should persist a resume entry?" Used by every save path (player.page
  // saveResumeFiles, AppComponent global cap saver) so the gating is
  // consistent and based on actual listening, not wall-clock time.
  shouldPersistResume(): boolean {
    return this.worthResume
  }

  private tick(): void {
    if (this.worthResume) return
    if (!this.currentMedia$.value) return
    if (!this.isActuallyPlaying()) return
    this.activeSeconds++
    if (this.activeSeconds >= CurrentMediaService.RESUME_THRESHOLD_S) {
      this.worthResume = true
    }
  }

  private isActuallyPlaying(): boolean {
    if (this.latestLocal?.playing === true) return true
    if (this.latestSpotify?.is_playing === true) return true
    return false
  }
}
