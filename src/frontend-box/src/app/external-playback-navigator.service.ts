import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { NavController } from '@ionic/angular/standalone'
import { NavigationExtras, Router } from '@angular/router'
import { Subject, catchError, firstValueFrom, interval, merge, of, switchMap, timeout } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import type { CurrentMPlayer } from './current.mplayer'
import type { Media } from './media'
import { SpotifyService } from './spotify.service'
import { KmThemeService } from './theme/km-theme.service'

@Injectable({
  providedIn: 'root',
})
export class ExternalPlaybackNavigatorService {
  private isNavigatingToPlayer = false
  /** Phase 19 Stufe B: höchster triggerAt-Wert, den wir aus /local schon
   *  gesehen haben. Beim Start initialisiert auf aktuellen Wert (kein
   *  Navigieren auf Baseline), danach hochgezählt sobald ein neuer
   *  externer Trigger (src !== 'box') erkannt wird.
   *
   *  `null` heißt "Baseline noch nicht gesetzt" und ist bewusst NICHT 0:
   *  spotify-control.js initialisiert triggerAt selbst mit 0 und setzt es
   *  erst beim ersten Wiedergabebefehl auf Date.now(). Mit 0 als Sentinel
   *  blieb die Baseline nach jedem Player-Neustart auf 0 stehen, und der
   *  erste echte externe Trigger lief in den Baseline-Zweig statt in die
   *  Navigation — das Display folgte erst beim zweiten Tippen. */
  private lastSeenTriggerAt: number | null = null
  /** An external start not followed yet: until when (ms) to wait for it to play, 0 = none. */
  private pendingExternalUntil = 0
  private pendingExternalSource = ''
  /** What the open player page shows (see playingKey), so a pause/resume from the phone doesn't rebuild it. */
  private playerPageKey = ''
  /** True while the player page is being left only to be opened again for a new start from the phone. */
  public replacingPlayerPage = false
  private readonly navController = inject(NavController)
  /** Ask /local right now (outside the timer), e.g. when a Spotify track starts while on the player page. */
  private readonly pollNow$ = new Subject<void>()
  /** Same idea for "show the new theme now" from the parents' web app (see checkThemeReload). */
  private lastSeenThemeReloadAt: number | null = null
  private lastSeenPageReloadAt: number | null = null
  // km themes: their body classes (stage view, day/night ...) follow the new theme too
  private readonly kmTheme = inject(KmThemeService)
  /** Tick-Zähler für die gedrosselte Abfrage auf der Player-Page. */
  private pollTick = 0

  constructor(
    private router: Router,
    private spotifyService: SpotifyService,
    private http: HttpClient,
  ) {
    this.initializeExternalPlaybackDetection()
    this.initializeTriggerSourcePolling()
  }

  private initializeExternalPlaybackDetection(): void {
    // On the player page the /local poll runs only every 10 s. A Spotify track starting in the display's player
    // (e.g. an album from the phone replacing a NAS album) asks at once instead, so the page switches in a moment.
    this.spotifyService.trackChangeDetected$
      .pipe(filter((track) => track !== null && this.isCurrentlyOnPlayerPage()))
      .subscribe(() => this.pollNow$.next())
    // Spotify pausing on the player page: e.g. the player switched to a NAS/local album started from the phone.
    // That album starts a few seconds later, so ask a few times in that span instead of waiting for the 10 s tick.
    let wasPaused = true
    this.spotifyService.playerState$.subscribe((state) => {
      const paused = !state || state.paused
      if (paused && !wasPaused && this.isCurrentlyOnPlayerPage()) {
        for (const delay of [500, 2500, 4500, 7000]) setTimeout(() => this.pollNow$.next(), delay)
      }
      wasPaused = paused
    })

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

  /** Polling-basierter Watcher auf den triggerSource-Flag aus /local.
   *  Greift für ALLE Player-Typen (mplayer/Library/Radio/RSS — der
   *  Spotify-Pfad ist eh schon von trackChangeDetected$ abgedeckt) und
   *  reagiert auf Eltern-WebApp- bzw. Telegram-Bot-Trigger.
   *
   *  Bewusst KEIN Subscribe auf mediaService.local$ — das würde via B11-
   *  Anti-Pattern das Spotify-SDK-Polling 24/7 hot halten und Connect-
   *  Device-Aktivierung stören. Eigener HttpClient.get reicht: /local ist
   *  ein billiger statischer State-Dump im spotify-control.js. */
  private initializeTriggerSourcePolling(): void {
    // 2s ist ein guter Kompromiss: spürbar genug für "ich tipp in WebApp,
    // Display switcht in <3s", ohne unnötiges Load auf den Player.
    merge(
      interval(2000).pipe(
        // Auf der Player-Page nur jeder fünfte Tick (10 s): Das ist genau der
        // Zustand, in dem die Box am längsten steht (Kind hört etwas) und auf
        // Akku läuft: 43.200 Requests/Tag sinken damit auf rund 9.000. Ein
        // Spotify-Titelwechsel fragt dort sofort nach (pollNow$).
        filter(() => !this.isCurrentlyOnPlayerPage() || this.pollTick++ % 5 === 0),
      ),
      this.pollNow$,
    )
      .pipe(
        switchMap(() =>
          this.http
            .get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`)
            .pipe(
              timeout(1500),
              catchError(() => of({} as CurrentMPlayer)),
            ),
        ),
      )
      .subscribe((data) => {
        this.checkThemeReload(data.themeReloadAt)
        this.checkPageReload(data.pageReloadAt)
        // the admin interface's text preview (a frame on another device): no jump to the player page there
        if (window.location.pathname.startsWith('/text-preview')) return
        const at = data.triggerAt ?? 0
        const src = data.triggerSource ?? 'box'
        // Baseline-Tick: erstes Polling-Ergebnis nur lastSeen setzen, nicht
        // auf einen historischen Trigger reagieren.
        if (this.lastSeenTriggerAt === null) {
          this.lastSeenTriggerAt = at
          return
        }
        if (at > this.lastSeenTriggerAt) {
          this.lastSeenTriggerAt = at
          // A start from the parents' web app or Telegram is followed once it really plays. A NAS album (its
          // track list is fetched first) or a stream takes a few seconds: the trigger waits for that instead of
          // being used up by a poll that still saw nothing playing.
          this.pendingExternalUntil = src !== 'box' ? Date.now() + 30_000 : 0
          this.pendingExternalSource = src
        }
        const onPlayerPage = this.isCurrentlyOnPlayerPage()
        if (this.pendingExternalUntil && this.isPlaying(data)) {
          const stillPending = Date.now() < this.pendingExternalUntil
          this.pendingExternalUntil = 0
          const key = this.playingKey(data)
          // On the player page only for something else than it shows: a pause/resume from the phone is no new
          // album, but a NAS album replaced by Spotify (or another album) is.
          const somethingElse = !onPlayerPage || key !== this.playerPageKey
          // Spotify started from the phone while the display's Spotify player is not connected yet (seconds after
          // a restart): it plays on another device, the page would find nothing, go back after a few seconds and
          // send STOP on its way out. So the display stays where it is.
          const displayCanShowIt = data.currentPlayer !== 'spotify' || this.spotifyService.isPlayerReady()
          if (!displayCanShowIt) console.warn('[ExternalPlayback] Spotify started elsewhere, display player not ready')
          if (stillPending && somethingElse && displayCanShowIt && !this.isNavigatingToPlayer) {
            console.log(`🎵 External playback trigger from "${this.pendingExternalSource}" — navigating to /player`)
            this.playerPageKey = key
            void this.navigateToPlayerExternal(data, onPlayerPage)
          }
        } else if (onPlayerPage && !this.pendingExternalUntil) {
          this.playerPageKey = this.playingKey(data) // what the open player page shows
        }
      })
  }

  /** mplayer reports "playing"; for Spotify (in the display's Web Playback SDK) the player keeps "pause". */
  private isPlaying(data: CurrentMPlayer): boolean {
    return data.currentPlayer === 'spotify' ? data.pause === false : data.playing === true
  }

  /** Which media plays, to tell a new album from a pause/resume of the same one. */
  private playingKey(data: CurrentMPlayer): string {
    if (data.currentPlayer === 'spotify') return `spotify|${data.activeSpotifyId ?? ''}`
    if (data.currentPlayer === 'mplayer') return `${data.currentType ?? ''}|${data.path ?? ''}|${data.album ?? ''}`
    return ''
  }

  /** The parents' web app switched the theme and asked for it to show now. Rides on the /local poll
   *  above (no extra requests). The first value only sets the baseline, like triggerAt; a player
   *  restart resets it to 0, which is then just a new baseline. */
  private checkThemeReload(reloadAt: number | undefined): void {
    if (typeof reloadAt !== 'number') return
    if (this.lastSeenThemeReloadAt === null || reloadAt < this.lastSeenThemeReloadAt) {
      this.lastSeenThemeReloadAt = reloadAt
      return
    }
    if (reloadAt === this.lastSeenThemeReloadAt) return
    this.lastSeenThemeReloadAt = reloadAt
    this.reloadThemeStylesheet(reloadAt)
  }

  /** The app changed a setting the display only reads when its page loads (see the player's /display/reload-page):
   *  the page is loaded again, like checkThemeReload with a baseline first. Playback runs on in the player. */
  private checkPageReload(reloadAt: number | undefined): void {
    if (typeof reloadAt !== 'number') return
    if (this.lastSeenPageReloadAt === null || reloadAt < this.lastSeenPageReloadAt) {
      this.lastSeenPageReloadAt = reloadAt
      return
    }
    if (reloadAt === this.lastSeenPageReloadAt) return
    this.lastSeenPageReloadAt = reloadAt
    console.log('🔄 Page reloaded on request from the parents app')
    window.location.reload()
  }

  /** active_theme.css is a symlink to the chosen theme; loading it again under a new query string
   *  picks up the new target. The old stylesheet goes once the new one has loaded, so the display
   *  doesn't flash unstyled. No page reload: playback and the Spotify player keep running. */
  private reloadThemeStylesheet(version: number): void {
    const old = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter((l) =>
      (l.getAttribute('href') ?? '').startsWith('active_theme.css'),
    )
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `active_theme.css?v=${version}`
    link.onload = () => {
      for (const l of old) l.remove()
    }
    if (old.length) old[old.length - 1].after(link)
    else document.head.appendChild(link)
    this.kmTheme.refresh()
    console.log('🎨 Theme reloaded on request from the parents app')
  }

  /** Navigation aus dem Polling-Pfad: baut bei mplayer-Tracks (Library/RSS/
   *  Radio) ein Media-Objekt aus den /local-Daten und gibt es als
   *  navigationExtras.state mit. Player-Page erkennt am `externalPlayback:
   *  true` Flag dass Track schon läuft und ruft NICHT playMedia() doppelt. */
  private async navigateToPlayerExternal(data: CurrentMPlayer, replacePlayerPage = false): Promise<void> {
    const media = this.buildMediaFromLocal(data)
    this.isNavigatingToPlayer = true
    // A NAS or local album: its cover is the one the NAS tab / the library shows, found in the listing of the
    // parent folder. Looked up before the old page is left, so a replaced page is gone only for a moment.
    const folderPath = media?.type === 'nas' ? media.nasPath : media?.type === 'library' ? media.libraryPath : undefined
    if (media && folderPath) {
      const parent = folderPath.split('/').slice(0, -1).join('/')
      const listing = media.type === 'nas' ? 'nas' : 'library'
      const siblings = await firstValueFrom(
        this.http
          .get<Media[]>(`${environment.backend.apiUrl}/${listing}/children?path=${encodeURIComponent(parent)}`)
          .pipe(
            timeout(2000),
            catchError(() => of([] as Media[])),
          ),
      )
      const own = siblings.find((entry) => (media.type === 'nas' ? entry.nasPath : entry.libraryPath) === folderPath)
      if (own?.cover) {
        media.cover = own.cover
        media.artistcover = own.artistcover
      }
    }
    const extras: NavigationExtras = { state: { externalPlayback: true } }
    if (media) (extras.state as Record<string, unknown>).media = media

    let navigation: Promise<boolean>
    if (replacePlayerPage) {
      // The player page shows something else: navigating to /player again would keep the old page, so it is
      // left (not shown, no animation) and opened fresh for what plays now. The old page must not stop the
      // player on its way out (it would stop what just started) nor save its resume position (the progress
      // already belongs to the new media): see PlayerPage.ionViewWillLeave. The flag stays set until shortly
      // after the new page is open, as Ionic may call the leave hook during the page transition.
      this.replacingPlayerPage = true
      await this.navController.navigateBack('/home', { animated: false, skipLocationChange: true }).catch(() => false)
      navigation = this.navController.navigateForward('/player', { ...extras, animated: false })
    } else {
      navigation = this.router.navigate(['/player'], extras)
    }
    navigation
      .then((success) => {
        if (success) {
          console.log('✅ Navigated to /player after external trigger', media ? `(media: ${media.type})` : '(no media)')
        } else {
          console.warn('⚠️ External-trigger navigation to /player returned false')
        }
        setTimeout(() => {
          this.isNavigatingToPlayer = false
          this.replacingPlayerPage = false
        }, 3000)
      })
      .catch((error) => {
        console.error('❌ External-trigger navigation failed:', error)
        this.isNavigatingToPlayer = false
        this.replacingPlayerPage = false
      })
  }

  /** Baut ein Media-Object aus /local-Daten. Spotify-Tracks lassen wir
   *  null und delegieren an handleExternalPlayback (das nutzt schon
   *  spotifyService.currentTrack$ für ein vollständiges Media-Objekt). */
  private buildMediaFromLocal(data: CurrentMPlayer): Media | null {
    if (data.currentPlayer !== 'mplayer') return null
    const path = String((data as { path?: string }).path ?? '')
    // A NAS album (started from the parents' web app): path is the album folder on the NAS. The player page
    // loads its track list by nasPath, and the cover is the folder's picture as the NAS tab shows it.
    if ((data as { currentType?: string }).currentType === 'nas' && path) {
      const folders = path.split('/').filter(Boolean)
      return {
        type: 'nas',
        category: 'nas',
        artist: folders[folders.length - 2] ?? '',
        title: String(data.album ?? folders[folders.length - 1] ?? ''),
        nasPath: path,
      } as Media
    }
    const pathParts = path.split('/').filter(Boolean)
    const category = pathParts[0] || 'music'
    const artist = pathParts[1] || ''
    const title = String(data.album ?? pathParts[2] ?? '')
    // currentType aus /local mappt direkt auf media.type
    const ctype = String((data as { currentType?: string }).currentType ?? 'local')
    const type: Media['type'] =
      ctype === 'rss' ? 'rss' : ctype === 'radio' ? 'radio' : 'library'
    const media = { type, category, artist, title } as Media
    // a radio station or podcast started from the parents' app: the cover it passed on (the player knows no other)
    if ((type === 'rss' || type === 'radio') && data.cover) {
      media.cover = data.cover
      media.artistcover = data.cover
    }
    // A local album: path is its folder in the library (e.g. audiobook/<artist>/<album>), as the box's own
    // library pages know it - the cover is looked up there (see navigateToPlayerExternal).
    if (type === 'library' && pathParts.length >= 2) media.libraryPath = pathParts.join('/')
    return media
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
