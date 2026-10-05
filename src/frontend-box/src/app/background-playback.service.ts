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
import type { SpotifyWebPlaybackState } from './spotify'
import { SpotifyService } from './spotify.service'

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
  private readonly spotifyService = inject(SpotifyService)

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
    this.startedAs = now?.activeSpotifyId ?? ''
    this.now.set(now)
    this.media.set(media)
    this.subscriptions = [
      interval(POLL_MS).subscribe(() => void this.poll()),
      // (the time listened keeps counting, so the place is kept for "continue listening" when it is stopped later)
      interval(1000).subscribe(() => this.currentMediaService.markPlaying(this.playing)),
    ]
    // The end of Spotify playback that goes on in the background - the player page watched for it and stopped there;
    // minimised, nothing did and other music played on, or the box counted the time of a silent one. Told by the
    // display's own player (its state changes, no request to Spotify):
    //  - an album: a track of another album plays (Spotify's autoplay), or after its last track an earlier one of it
    //    (not with shuffle: there any order is the album's)
    //  - a playlist: it plays in another context than the playlist (autoplay goes on outside it)
    //  - both: the player stands at a track's start or end (the album or playlist is over, autoplay off) - a pause in
    //    the middle of a track (from a phone) stays a pause
    // Looked at again a moment later and against the start the player was given: a new start (also of the same album
    // from the app) is no end of it.
    if (media.type === 'spotify') {
      const album = media.id && !media.playlistid && !media.showid && !media.audiobookid ? `spotify:album:${media.id}` : ''
      const playlist = media.playlistid ? `spotify:playlist:${media.playlistid}` : ''
      let tracks: string[] = []
      let lastIndex = -1
      if (album) {
        // (the album's tracks in their order: one lookup, from the server's cache)
        firstValueFrom(this.spotifyService.getAlbumInfo(media.id as string))
          .then((info) => {
            tracks = (info.tracks ?? []).map((t: { id?: string }) => t.id ?? '')
          })
          .catch((): void => undefined)
      }
      type State = SpotifyWebPlaybackState | null
      const ended = (state: State): string => {
        if (!state) return ''
        const track = state.track_window?.current_track
        if (state.paused) {
          const position = state.position ?? 0
          const duration = track?.duration_ms ?? 0
          return position > 1500 && duration > 0 && position < duration - 1500 ? '' : 'it stands at the start or end of a track'
        }
        if (album && track?.album?.uri && track.album.uri !== album) return 'another album plays (autoplay)'
        if (playlist && state.context?.uri && state.context.uri !== playlist) return 'it plays outside the playlist (autoplay)'
        return ''
      }
      this.subscriptions.push(
        this.spotifyService.playerState$.subscribe((state) => {
          const track = state?.track_window?.current_track
          const index = album && track?.id && tracks.length ? tracks.indexOf(track.id) : -1
          const jumpedBack =
            !!state && !state.paused && !this.shuffled && !state.shuffle && index >= 0 && lastIndex === tracks.length - 1 && index < lastIndex
          if (index >= 0 && !state?.paused) lastIndex = index
          const why = jumpedBack ? 'after the last track an earlier one plays (autoplay)' : ended(state)
          if (!why || this.endCheck) return
          this.endCheck = setTimeout(
            async () => {
              this.endCheck = undefined
              if (this.media() !== media) return
              if (!jumpedBack && !ended(this.spotifyService.playerState$.value)) return
              const now = await firstValueFrom(
                this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(timeout(1500), catchError(() => of(null))),
              )
              if (this.media() !== media || !now) return
              // (something else was started meanwhile - from the app or Telegram: not this one's end)
              if (now.currentPlayer !== 'spotify' || (this.startedAs && now.activeSpotifyId !== this.startedAs)) return this.clear()
              // (paused by the box - the app's pause: a pause, no end)
              if (now.pause === true) return
              console.log(`[BackgroundPlayback] end: ${why} - stopped`)
              this.finish()
            },
            jumpedBack || !this.spotifyService.playerState$.value?.paused ? 1500 : 3000,
          )
        }),
      )
    }
  }

  private endCheck: ReturnType<typeof setTimeout> | undefined

  /** Whether the player still plays what this note is about (the answer of /local), as far as it tells. */
  private stillThis(media: Media | null, local: CurrentMPlayer | null): boolean {
    if (!media || !local) return true
    if (media.type === 'spotify') return local.currentPlayer !== 'mplayer' && (!this.startedAs || !local.activeSpotifyId || local.activeSpotifyId === this.startedAs)
    return local.currentPlayer !== 'spotify'
  }
  // what the player was told to play when this went into the background (its activeSpotifyId)
  private startedAs = ''

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
    // (the current media again - after the reload it was empty: the stop kept no place, the time listened did not count)
    if (!this.currentMediaService.get()) this.currentMediaService.set(saved.media)
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
    clearTimeout(this.endCheck)
    this.endCheck = undefined
    for (const s of this.subscriptions) s.unsubscribe()
    this.subscriptions = []
    this.media.set(null)
    this.now.set(null)
    this.forgetSaved()
  }

  /** The bar's stop button: keeps the place for "continue listening" and stops, as leaving the page does without the setting. */
  async stop(): Promise<void> {
    const stopping = this.media()
    const source = this.currentMediaService.get()
    const resumable = source && ['spotify', 'library', 'nas', 'rss'].includes(source.type) && !this.shuffled
    if (source && resumable && this.currentMediaService.shouldPersistResume()) {
      // The place where it is now, read before the stop (afterwards it is gone). Each look has a time limit: the
      // stop must not wait for a player that does not answer, and without a position nothing is saved.
      const look = <T>(source$: Observable<T>) =>
        firstValueFrom(source$.pipe(take(1), timeout(1500))).catch((): null => null)
      const spotify = source.type === 'spotify' ? await look(this.mediaService.current$) : null
      const local = await look(this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`))
      // (something else started while the place was read - up to 3 s: it is neither saved as this one nor stopped;
      // also when the player names another start already and the display has not yet taken it over)
      if (this.media() !== stopping || !this.stillThis(source, local)) return
      if (source.type === 'spotify' ? spotify : local)
        this.mediaService.addRawResume(buildResumeMedia(source, spotify, local))
    }
    if (this.media() !== stopping) return
    if (!(source && resumable && this.currentMediaService.shouldPersistResume())) {
      // (not read above: asked now whether the player still plays this one)
      const local = await firstValueFrom(
        this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(timeout(1500), catchError(() => of(null))),
      )
      if (this.media() !== stopping || !this.stillThis(stopping, local)) return
    }
    if (this.shuffled) this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF)
    this.playerService.sendCmd(PlayerCmds.STOP)
    if (this.albumStop) this.playerService.sendCmd(PlayerCmds.ALBUMSTOP)
    this.clear()
  }

  /** The end of what played in the background: stopped - no place kept (the player's state is already the next
   * music's: its track and position were saved under this album), the last saved place stays. */
  private finish(): void {
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
    if (!this.startedAs && data.activeSpotifyId) this.startedAs = data.activeSpotifyId
    this.playing = isPlaying(data)
    this.misses = this.playing ? 0 : this.misses + 1
    if (this.misses >= MISSES_TO_END) this.clear()
  }
}
