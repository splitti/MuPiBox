import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { catchError, firstValueFrom, interval, type Observable, of, Subscription, timeout } from 'rxjs'
import { take } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import type { CurrentMPlayer } from './current.mplayer'
import { CurrentMediaService } from './current-media.service'
import type { Media } from './media'
import { MediaService } from './media.service'
import { PlayerCmds, PlayerService } from './player.service'
import { buildResumeMedia } from './resume-builder'

/** Whatever the player reports as playing: mplayer says "playing", Spotify (the display's Web Playback SDK) "pause". */
function isPlaying(data: CurrentMPlayer): boolean {
  if (data.loading === true) return true // (a stream that is still buffering)
  return data.currentPlayer === 'spotify' ? data.pause === false : data.playing === true
}

// How often the player is asked while something runs in the background, and how many answers in a row that say
// "not playing" end it (a pause between two tracks must not)
const POLL_MS = 3000
const MISSES_TO_END = 3
// (what plays on in the background is noted here, so a reload of the page finds it again)
const SAVED_KEY = 'mupibox.backgroundPlayback'

/**
 * Playback that goes on after the player page was left (settings: "Weiterspielen beim Verlassen des Players"). The
 * page hands over what it was playing; the "Läuft gerade" bar on the start page shows it and stops it. Without the
 * setting nothing here is used: leaving the page stops the playback, as before.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundPlaybackService {
  private readonly http = inject(HttpClient)
  private readonly mediaService = inject(MediaService)
  private readonly currentMediaService = inject(CurrentMediaService)
  private readonly playerService = inject(PlayerService)

  /** What keeps playing (null: nothing) - the bar is shown while this is set. */
  readonly media = signal<Media | null>(null)
  /** What the player says it plays right now (the track's name for the bar). */
  readonly now = signal<CurrentMPlayer | null>(null)

  private shuffled = false
  private albumStop = false
  private playing = true
  private misses = 0
  private subscriptions: Subscription[] = []

  constructor() {
    void this.restore()
  }

  /** The player page was left while playing: it goes on, and the page did not stop it. */
  begin(media: Media, options: { shuffled: boolean; albumStop: boolean }): void {
    this.start(media, options, null)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ media, ...options }))
    } catch {
      // no storage: after a reload of the page the bar is gone, the music goes on
    }
  }

  private start(media: Media, options: { shuffled: boolean; albumStop: boolean }, now: CurrentMPlayer | null): void {
    // (only the timers of what ran before - not the saved note: restore() starts from it, and a second reload of the
    // page needs it again; clear() removed it, so the pill was gone after the second reload)
    for (const s of this.subscriptions) s.unsubscribe()
    this.subscriptions = []
    this.shuffled = options.shuffled
    this.albumStop = options.albumStop
    this.playing = true
    this.misses = 0
    this.now.set(now)
    this.media.set(media)
    this.subscriptions = [
      interval(POLL_MS).subscribe(() => void this.poll()),
      // (the time listened keeps counting, so the place is kept for "continue listening" when it is stopped later)
      interval(1000).subscribe(() => this.currentMediaService.markPlaying(this.playing)),
    ]
  }

  /**
   * The page was loaded again (the display reloads now and then) while the music went on in the background: the bar
   * comes back, but only if the player still plays - an old note must not show a bar for nothing.
   */
  private async restore(): Promise<void> {
    let saved: { media?: Media; shuffled?: boolean; albumStop?: boolean } | null = null
    try {
      saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null')
    } catch {
      // no storage, or not readable
    }
    if (!saved?.media) return
    const data = await firstValueFrom(
      this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(
        timeout(1500),
        catchError(() => of(null)),
      ),
    )
    if (!data || !isPlaying(data)) return this.forgetSaved()
    // (the player page was opened meanwhile, or something started: nothing to restore then)
    if (this.media()) return
    this.start(saved.media, { shuffled: saved.shuffled === true, albumStop: saved.albumStop === true }, data)
  }

  private forgetSaved(): void {
    try {
      localStorage.removeItem(SAVED_KEY)
    } catch {
      // no storage
    }
  }

  /** Nothing in the background any more: it ended, the player page took it over again, or something new started. */
  clear(): void {
    for (const s of this.subscriptions) s.unsubscribe()
    this.subscriptions = []
    this.media.set(null)
    this.now.set(null)
    this.forgetSaved()
  }

  /** The bar's stop button: keeps the place for "continue listening" and stops, as leaving the page does without the setting. */
  async stop(): Promise<void> {
    const source = this.currentMediaService.get()
    const resumable = source && ['spotify', 'library', 'nas', 'rss'].includes(source.type) && !this.shuffled
    if (source && resumable && this.currentMediaService.shouldPersistResume()) {
      // The place where it is now, read before the stop (afterwards it is gone). Each look has a time limit: the
      // stop must not wait for a player that does not answer, and without a position nothing is saved.
      const look = <T>(source$: Observable<T>) =>
        firstValueFrom(source$.pipe(take(1), timeout(1500))).catch((): null => null)
      const spotify = source.type === 'spotify' ? await look(this.mediaService.current$) : null
      const local = await look(this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`))
      if (source.type === 'spotify' ? spotify : local)
        this.mediaService.addRawResume(buildResumeMedia(source, spotify, local))
    }
    if (this.shuffled) this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF)
    this.playerService.sendCmd(PlayerCmds.STOP)
    if (this.albumStop) this.playerService.sendCmd(PlayerCmds.ALBUMSTOP)
    this.clear()
  }

  private async poll(): Promise<void> {
    const data = await firstValueFrom(
      this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(
        timeout(1500),
        catchError(() => of(null)),
      ),
    )
    // (cleared while the answer was on its way)
    if (!this.media()) return
    // no answer: the player is busy or restarting - not a reason to end
    if (!data) return
    this.now.set(data)
    this.playing = isPlaying(data)
    this.misses = this.playing ? 0 : this.misses + 1
    if (this.misses >= MISSES_TO_END) this.clear()
  }
}
