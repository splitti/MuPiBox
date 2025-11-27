import { Injectable } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'
import { filter, map } from 'rxjs/operators'
import type { Media } from './media'
import { SpotifyService } from './spotify.service'

@Injectable({
  providedIn: 'root',
})
export class ExternalPlaybackNavigatorService {
  private isNavigatingToPlayer = false

  constructor(
    private router: Router,
    private spotifyService: SpotifyService,
  ) {
    this.initializeExternalPlaybackDetection()
  }

  private initializeExternalPlaybackDetection(): void {
    // Monitor external playback detection
    this.spotifyService.trackChangeDetected$
      .pipe(
        filter((track) => track !== null),
        filter(() => !this.isCurrentlyOnPlayerPage()),
        filter(() => !this.isNavigatingToPlayer),
        map((track) => this.spotifyService.createMediaFromSpotifyTrack(track)),
      )
      .subscribe({
        next: (media: Media) => {
          console.log('🎵 Auto-navigating to player page for external Spotify playback:', media.title)
          this.navigateToPlayerPage(media)
        },
        error: (error) => console.error('Error in external playback detection:', error),
      })
  }

  private isCurrentlyOnPlayerPage(): boolean {
    const isOnPlayerPage = this.router.url === '/player'
    if (isOnPlayerPage) {
      console.log('🏠 Already on player page - skipping auto-navigation')
    }
    return isOnPlayerPage
  }

  private navigateToPlayerPage(media: Media): void {
    // Prevent multiple simultaneous navigations
    this.isNavigatingToPlayer = true

    const navigationExtras: NavigationExtras = {
      state: {
        media: media,
      },
    }

    this.router
      .navigate(['/player'], navigationExtras)
      .then((success) => {
        if (success) {
          console.log('✅ Successfully navigated to player page for external playback')
        } else {
          console.warn('⚠️ Failed to navigate to player page for external playback')
        }

        // Reset navigation flag after a short delay
        setTimeout(() => {
          this.isNavigatingToPlayer = false
        }, 3000)
      })
      .catch((error) => {
        console.error('❌ Error navigating to player page for external playback:', error)
        this.isNavigatingToPlayer = false
      })
  }
}
