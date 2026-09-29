import { Injectable } from '@angular/core'
import { NavigationError, Router } from '@angular/router'
import { filter } from 'rxjs/operators'

// The kiosk keeps one page open for days. When the box gets a new version of the frontend (an update, or files copied
// over), the parts of the app that were not loaded yet (the settings, the player, ...) are gone under their old names:
// the page still on screen then asks for a file that no longer exists, the navigation fails and the tap seems to do
// nothing (e.g. the long press on the status icons no longer opened the settings).
// A failed load of such a part reloads the page once, which brings in the current version. The reload is done at most
// once every 30 seconds, so a box that really can't reach its own server does not reload in a loop.

const RELOAD_KEY = 'mupibox-stale-page-reload'
const MIN_SECONDS_BETWEEN_RELOADS = 30
const LOAD_FAILURE = /dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i

@Injectable({ providedIn: 'root' })
export class StalePageReloadService {
  public constructor(router: Router) {
    router.events.pipe(filter((event): event is NavigationError => event instanceof NavigationError)).subscribe((event) => {
      const message = event.error instanceof Error ? event.error.message : String(event.error ?? '')
      if (!LOAD_FAILURE.test(message)) {
        return
      }
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
        if (Date.now() - last < MIN_SECONDS_BETWEEN_RELOADS * 1000) {
          return
        }
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      } catch {
        // no session storage: reload anyway, this happens rarely
      }
      window.location.reload()
    })
  }
}
