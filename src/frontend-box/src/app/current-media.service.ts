import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import type { Media } from './media'

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
//
// The active-seconds counter is driven externally via markPlaying(playing)
// rather than by subscribing to mediaService.current$/local$ here. Eager
// subscriptions in this service were activating the shared mediaService
// observables (and via them the Spotify SDK's getCurrentState polling) from
// app bootstrap, which appears to interfere with Spotify Connect's device
// activation. By being external-driven, this service no longer keeps
// mediaService observables hot during background playback — that costs us
// the ability to advance worthResume while the player page is unmounted, but
// avoids the regression.
@Injectable({ providedIn: 'root' })
export class CurrentMediaService {
  // Active-listening seconds required before a resume entry is worth keeping.
  // 30s is the historical value from the player.page's onLeave guard.
  private static readonly RESUME_THRESHOLD_S = 30

  readonly currentMedia$ = new BehaviorSubject<Media | null>(null)

  private activeSeconds = 0
  private worthResume = false

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

  // Called by the player page once per second from updateProgress() with the
  // actual playing flag. While playing, the active-seconds counter advances
  // toward the threshold; while paused, it doesn't.
  markPlaying(playing: boolean): void {
    if (this.worthResume) return
    if (!this.currentMedia$.value) return
    if (!playing) return
    this.activeSeconds++
    if (this.activeSeconds >= CurrentMediaService.RESUME_THRESHOLD_S) {
      this.worthResume = true
    }
  }

  // Single source of truth for "has this kid been listening long enough that
  // we should persist a resume entry?" Used by every save path (player.page
  // saveResumeFiles, AppComponent global cap saver) so the gating is
  // consistent and based on actual listening, not wall-clock time.
  shouldPersistResume(): boolean {
    return this.worthResume
  }
}
