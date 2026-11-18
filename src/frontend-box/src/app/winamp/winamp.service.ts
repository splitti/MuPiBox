import { HttpClient } from '@angular/common/http'
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { NavController } from '@ionic/angular/standalone'
import { catchError, filter, firstValueFrom, interval, of, switchMap, timeout } from 'rxjs'
import { environment } from '../../environments/environment'
import { BackgroundPlaybackService } from '../background-playback.service'
import type { CurrentMPlayer } from '../current.mplayer'
import type { CurrentSpotify } from '../current.spotify'
import { CurrentMediaService } from '../current-media.service'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import { ExtensionHostService } from '../extension-host.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { SpotifyService } from '../spotify.service'
import { KmThemeService } from '../theme/km-theme.service'
import { EQ_FLAT, type EqPresetHost, type EqState, type EqValues } from './winamp-eq-view'
import type { MainState, PlayState } from './winamp-main-view'
import type { PlaylistEntry, QueueApi, SortMode } from './winamp-playlist-view'
import { type SkinMeta, Skin } from './winamp-skin'

/** what is shown: the library (the app's pages), the playlist, the equaliser - and, only in the compact layout, the player */
export type WinampRight = 'lib' | 'pl' | 'eq' | 'player'

const SKIN_BASE = '/theme-data/winamp/skin'

/** Whatever the player reports as playing: mplayer says "playing", Spotify (the display's Web Playback SDK) "pause". */
function isPlaying(data: CurrentMPlayer): boolean {
  if (data.loading === true) return true
  return data.currentPlayer === 'spotify' ? data.pause === false && data.spotifySilent !== true : data.playing === true
}

/**
 * The Winamp theme, on a 1920 x 480 display: the main window of a Winamp skin always on the left half, the right half
 * holds the equaliser, the playlist or - with both closed - the library (the app's normal pages). This service knows
 * what the windows show (from the player's /local report) and does what their buttons say; the windows themselves are
 * plain DOM built from the skin (winamp-*-view.ts), mounted by WinampShellComponent.
 */
@Injectable({ providedIn: 'root' })
export class WinampService {
  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)
  private readonly nav = inject(NavController)
  private readonly kmTheme = inject(KmThemeService)
  private readonly mediaService = inject(MediaService)
  private readonly player = inject(PlayerService)
  private readonly extensions = inject(ExtensionHostService)
  private readonly spotifyService = inject(SpotifyService)
  private readonly background = inject(BackgroundPlaybackService)
  private readonly currentMedia = inject(CurrentMediaService)

  /**
   * 'wide': the 1920 x 480 display - the player on the left half, the equaliser / the playlist / the library on the right.
   * 'compact': a display like 800 x 480 (also the 1280 x 720 and 1920 x 1080 ones, which the app draws at that size) -
   * one window at a time, with a bar below to change between player, equaliser, playlist and library.
   * null: another shape (a portrait display): the plain dark look.
   */
  readonly layout: 'wide' | 'compact' | null =
    window.innerWidth >= 1800 && window.innerHeight <= 600
      ? 'wide'
      : window.innerWidth >= 600 && window.innerWidth < 1800 && window.innerHeight >= 360 && window.innerHeight <= 720
        ? 'compact'
        : null
  /** the theme is chosen and the display has a shape the layouts are made for */
  readonly active = computed(() => this.kmTheme.isWinamp() && this.layout !== null)

  /** what is shown: wide - what the right half shows (the player is always on the left); compact - the one window */
  readonly right = signal<WinampRight>(this.layout === 'compact' ? 'player' : 'lib')
  /** the skin; null while it loads or when none is installed */
  readonly skin = signal<Skin | null>(null)
  readonly skinLoaded = signal(false)

  // ---- what the player says ----
  private readonly report = signal<{ data: CurrentMPlayer; at: number } | null>(null)
  private readonly spotifyReport = signal<{ data: CurrentSpotify; at: number } | null>(null)
  private readonly clock = signal(Date.now())
  private readonly media$ = toSignal(this.currentMedia.currentMedia$, { initialValue: null })
  readonly media = computed<Media | null>(() => this.media$() ?? this.background.media())

  // ---- sound: equaliser, balance, repeat ----
  readonly eq = signal<EqState>({ ...EQ_FLAT, bands: [...EQ_FLAT.bands] })
  readonly balance = signal(0)
  /** false when the player is mplayer (it has no equaliser) */
  readonly soundSupported = signal(true)
  readonly repeat = signal(false)
  private readonly shuffleOn = signal(false)
  // shuffle that this window switched on (and for which media): it is switched off again with the playback
  private shuffledHere = false
  private shuffledFor: Media | null = null

  // ---- the equaliser's presets (kept by the player, one set for the whole box) ----
  private readonly store = signal<{ presets: Record<string, EqValues>; auto: Record<string, EqValues>; default: EqValues | null }>({ presets: {}, auto: {}, default: null })
  /** the album that plays - what AUTO looks its preset up by ('' = nothing, or Spotify: the equaliser does not reach it) */
  readonly album = computed(() => {
    const data = this.report()?.data
    if (!data?.currentPlayer || data.currentPlayer === 'spotify') return ''
    return data.album || this.media()?.title || ''
  })
  /** why the equaliser would do nothing for what plays, '' when it works */
  readonly eqStatus = computed(() => {
    if (!this.soundSupported()) return 'NEEDS THE MPV PLAYER'
    return this.report()?.data.currentPlayer === 'spotify' ? 'NO EQ FOR SPOTIFY' : ''
  })
  private readonly autoOn = computed(() => this.eq().auto)
  readonly presetHost: EqPresetHost = {
    user: () => Object.keys(this.store().presets).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    values: (kind, name) => (kind === 'default' ? (this.store().default ?? undefined) : name ? this.store().presets[name] : undefined),
    hasDefault: () => this.store().default !== null,
    album: () => this.album(),
    hasAuto: () => this.album() in this.store().auto,
    save: (kind, now) => {
      const copy: EqValues = { preamp: now.preamp, bands: [...now.bands] }
      const s = this.store()
      let name = ''
      if (kind === 'default') {
        name = 'default'
        this.store.set({ ...s, default: copy })
      } else if (kind === 'auto') {
        name = this.album()
        if (name) this.store.set({ ...s, auto: { ...s.auto, [name]: copy } })
      } else {
        let n = 1
        while (`My preset ${n}` in s.presets) n++
        name = `My preset ${n}`
        this.store.set({ ...s, presets: { ...s.presets, [name]: copy } })
      }
      this.savePresets()
      return name
    },
    remove: (kind, name) => {
      const s = this.store()
      if (kind === 'default') this.store.set({ ...s, default: null })
      else if (kind === 'auto') {
        const { [this.album()]: _gone, ...rest } = s.auto
        this.store.set({ ...s, auto: rest })
      } else if (name) {
        const { [name]: _gone, ...rest } = s.presets
        this.store.set({ ...s, presets: rest })
      }
      this.savePresets()
    },
  }

  // ---- the playlist window ----
  readonly entries = signal<PlaylistEntry[]>([])
  private loadedFor = ''
  /** the list is the queue of the box's own files (a local album): the playlist's menus can edit it */
  readonly queueEditable = signal(false)
  /** counts up after an edit of the queue: the playlist is read again */
  private readonly queueTick = signal(0)

  readonly main = computed<MainState>(() => {
    const l = this.report()
    const data = l?.data
    const busy = !!data?.currentPlayer
    const spotify = data?.currentPlayer === 'spotify'
    const sp = this.spotifyReport()?.data
    const playing = !!data && busy && isPlaying(data)
    const playState: PlayState = !busy ? 'stop' : playing ? 'play' : 'pause'
    let duration = 0
    let position = 0
    let title = ''
    if (spotify) {
      duration = (sp?.item?.duration_ms ?? 0) / 1000
      position = (sp?.progress_ms ?? 0) / 1000
      const nr = sp?.item?.track_number
      title = [nr ? `${nr}.` : '', sp?.item?.name || data?.currentTrackname || ''].filter(Boolean).join(' ')
    } else if (busy) {
      duration = data?.durationSeconds ?? 0
      position = data?.positionSeconds ?? 0
      const nr = data?.currentTracknr
      title = [nr ? `${nr}.` : '', data?.currentTrackname || data?.album || ''].filter(Boolean).join(' ')
    }
    if (!title && busy) title = this.media()?.title ?? ''
    if (title && duration > 0) title += ` (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})`
    // the report is up to a second old: the clock runs on between two of them
    if (playing && data?.loading !== true && duration > 0) {
      const at = spotify ? (this.spotifyReport()?.at ?? 0) : (l?.at ?? 0)
      position = Math.min(duration, position + Math.max(0, this.clock() - at) / 1000)
    }
    const media = this.media()
    // a local or NAS album: the player shuffles it itself (the track numbers stay, only the next track is chosen by chance)
    // (as the player says it: after a reload of the page the display does not know what it started)
    const localAlbum = busy && !spotify && (data?.currentType === 'local' || data?.currentType === 'nas')
    return {
      title,
      playState,
      positionSeconds: busy ? position : 0,
      durationSeconds: busy ? duration : 0,
      volume: data?.volume ?? 0,
      balance: this.balance(),
      shuffle: localAlbum ? data?.shuffle === true : this.shuffleOn(),
      shuffleAvailable: (spotify && media?.type === 'spotify' && (media.category === 'music' || media.category === 'other')) || (localAlbum && data?.shuffleSupported === true),
      // (as the player says it: a new playback starts without repeat, a button of the box changes it)
      repeat: busy ? data?.repeat === true : this.repeat(),
      eqOpen: this.right() === 'eq',
      playlistOpen: this.right() === 'pl',
      bitrate: data?.bitrate ?? 0,
      khz: data?.khz ?? 0,
      channels: data?.channels ?? 0,
    }
  })

  /** the number of the track that plays, for the playlist's highlight (0: none known) */
  readonly currentPosition = computed(() => {
    const data = this.report()?.data
    const media = this.media()
    if (!data?.currentPlayer || !media) return 0
    if (media.type === 'library' || media.type === 'nas') return data.currentTracknr ?? 0
    const sp = this.spotifyReport()?.data
    if (media.playlistid) return sp?.playlist?.current_track_position ?? 0
    if (media.audiobookid) return sp?.audiobook?.current_chapter_position ?? 0
    if (media.showid) return this.entries().find((e) => (e as PlaylistEntry & { id?: string }).id === sp?.item?.id)?.position ?? 0
    return sp?.item?.track_number ?? 0
  })

  constructor() {
    // what the player says, once a second while the theme is on (the player's /local is a cheap dump)
    toObservable(this.active)
      .pipe(
        switchMap((on) =>
          on
            ? interval(1000).pipe(
                switchMap(() => this.http.get<CurrentMPlayer>(`${environment.backend.playerUrl}/local`).pipe(timeout(1500), catchError(() => of(null)))),
              )
            : of(null),
        ),
      )
      .subscribe((data) => {
        if (data) this.report.set({ data, at: Date.now() })
      })
    // Spotify's own state (the SDK's) only while Spotify plays: asking for it keeps the SDK polling
    toObservable(computed(() => this.active() && this.report()?.data.currentPlayer === 'spotify'))
      .pipe(switchMap((on) => (on ? this.mediaService.current$ : of(null))))
      .subscribe((data) => this.spotifyReport.set(data ? { data, at: Date.now() } : null))
    // a clock for the position between two reports
    effect((onCleanup) => {
      if (!this.active()) return
      const timer = setInterval(() => this.clock.set(Date.now()), 250)
      onCleanup(() => clearInterval(timer))
    })
    // the theme comes on (when the display starts, or chosen in the app while a page of the library shows): the windows
    // go by the page - the player's page shows the player (wide: the playlist beside it), any other page stays in sight
    // (the player covered a folder the child was looking at until a tab was pressed)
    let wasActive = false
    effect(() => {
      const on = this.active()
      untracked(() => {
        if (on && !wasActive) {
          const onPlayer = this.router.url.startsWith('/player')
          this.right.set(onPlayer ? (this.layout === 'compact' ? 'player' : 'pl') : 'lib')
        }
        wasActive = on
      })
    })
    effect(() => {
      const on = this.active()
      document.body.classList.toggle('wa-on', on && this.layout === 'wide')
      document.body.classList.toggle('wa-compact', on && this.layout === 'compact')
    })
    // the skin: when the theme comes on and whenever the app says the theme changed (a new upload)
    effect(() => {
      if (!this.active()) return
      this.kmTheme.refreshes()
      void this.loadSkin()
    })
    effect(() => {
      if (!this.active()) return
      void this.loadSound()
      void this.loadPresets()
    })
    // AUTO: the preset of the album that starts (else the default, else flat) - as Winamp loads a preset by the file
    effect(() => {
      const album = this.album()
      if (!this.active() || !this.autoOn() || !album) return
      untracked(() => {
        const s = this.store()
        const found = s.auto[album] ?? s.default
        const values = found ?? { preamp: 0, bands: new Array<number>(10).fill(0) }
        const e = this.eq()
        if (e.preamp === values.preamp && e.bands.every((b, i) => b === values.bands[i])) return
        this.setEq({ ...e, preamp: values.preamp, bands: [...values.bands], on: e.on || !!found })
      })
    })
    // a playback that starts (here or from the parents' app) opens the playlist; one that ends on its own goes back to the library
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      if (!this.active()) return
      const first = !this.navigated
      this.navigated = true
      if (e.urlAfterRedirects.startsWith('/player')) {
        // (wide: the playlist beside the player; compact: the player itself)
        if (this.right() === 'lib') this.right.set(this.layout === 'compact' ? 'player' : 'pl')
      } else if (this.layout === 'wide' && this.right() !== 'lib') {
        this.right.set('lib')
      } else if (this.layout === 'compact' && !first && this.right() !== 'lib') {
        // (a page of the app opens - the resume list, a folder: the windows would cover it)
        this.right.set('lib')
      }
    })
    // the playlist of what plays: read when its window is open (a Spotify list is a request to Spotify)
    effect(() => {
      const media = this.media()
      if (!this.active() || this.right() !== 'pl' || !media) return
      const key = `${media.type}|${media.id ?? ''}|${media.playlistid ?? ''}|${media.libraryPath ?? ''}|${media.nasPath ?? ''}|${media.title ?? ''}|${this.queueTick()}`
      if (key === this.loadedFor) return
      this.loadedFor = key
      void this.loadEntries(media)
    })
    effect(() => {
      const m = this.media()
      this.shuffleOn.set(m?.shuffle === true)
    })
    // Spotify keeps its shuffle for the next album: what this window switched on goes off with the playback (as the player
    // page does when it is left); a local album's shuffle the player switches off itself
    effect(() => {
      const stopped = this.main().playState === 'stop'
      const media = this.media()
      untracked(() => {
        if (!this.shuffledHere || (!stopped && media === this.shuffledFor)) return
        this.shuffledHere = false
        this.shuffleOn.set(false)
        this.player.sendCmd(PlayerCmds.SHUFFLEOFF)
      })
    })
  }

  // ---------- the windows ----------

  /** The EQ and PL buttons (and the X of the windows): the window opens; the same again closes it - back to the library. */
  setRight(view: WinampRight): void {
    // (wide: the library is what is under the windows; compact: the player is)
    const next = view === this.right() ? (this.layout === 'compact' ? 'player' : 'lib') : view
    this.show(next)
  }

  private navigated = false

  /** Only what is shown changes (no page is left): when a button of the app's top bar is pressed, whose page the windows cover. */
  showView(view: WinampRight): void {
    this.right.set(view)
  }

  /** The window named, whatever is shown (the bar of the compact layout). Leaving the player's page for the library lets the music go on. */
  show(view: WinampRight): void {
    this.right.set(view)
    if (view === 'lib' && this.router.url.startsWith('/player')) this.nav.back()
  }

  /**
   * The eject button: an extension may take it over (the CD drive opens its tray, and closes it again, as on a real player);
   * otherwise it opens the library, to start something else. (The library is one tap on the EQ / PL button away too.)
   */
  ejectOrLibrary(): void {
    if (!this.extensions.eject()) this.showLibrary()
  }

  showLibrary(): void {
    this.show('lib')
    if (!this.router.url.startsWith('/home') && !this.router.url.startsWith('/player')) void this.router.navigate(['/home'])
  }

  // ---------- the player ----------

  prev(): void {
    this.player.sendCmd(PlayerCmds.PREVIOUS)
  }
  next(): void {
    this.player.sendCmd(PlayerCmds.NEXT)
  }

  play(): void {
    const s = this.main().playState
    if (s === 'pause') this.player.sendCmd(PlayerCmds.PLAY)
    else if (s === 'stop') {
      const media = this.media()
      if (media) {
        // started again from the beginning; the page of the player opens for it as for any start
        void this.router.navigate(['/player'], { state: { media } })
      }
    } else this.player.seekPosition(0)
  }

  pause(): void {
    const s = this.main().playState
    if (s === 'play') this.player.sendCmd(PlayerCmds.PAUSE)
    else if (s === 'pause') this.player.sendCmd(PlayerCmds.PLAY)
  }

  stop(): void {
    if (this.main().playState === 'stop') return
    // (a playback that went on in the background is stopped with its resume saving; a stop of the player makes the open page leave by itself)
    if (this.background.media()) void this.background.stop()
    else this.player.sendCmd(PlayerCmds.STOP)
  }

  seek(fraction: number): void {
    const data = this.report()?.data
    if (!data?.currentPlayer) return
    if (data.currentPlayer === 'spotify') {
      const duration = this.spotifyReport()?.data.item?.duration_ms
      if (duration) this.player.seekPosition(duration * fraction)
    } else {
      this.player.seekPosition(Math.round(fraction * 100))
    }
  }

  setVolume(percent: number): void {
    this.player.setVolume(percent)
  }

  toggleShuffle(): void {
    const on = !this.main().shuffle
    this.shuffleOn.set(on)
    const m = this.media()
    this.shuffledHere = on && m?.type === 'spotify'
    this.shuffledFor = m
    this.player.sendCmd(on ? PlayerCmds.SHUFFLEON : PlayerCmds.SHUFFLEOFF)
  }

  toggleRepeat(): void {
    // (from what the button shows - the player's state while something plays)
    const on = !this.main().repeat
    this.repeat.set(on)
    this.player.setRepeat(on)
  }

  playEntry(entry: PlaylistEntry): void {
    const media = this.media()
    if (media) this.player.playTrackAtPosition(media, { position: entry.position, id: (entry as PlaylistEntry & { id?: string }).id })
  }

  // ---------- sound ----------

  private soundTimer: ReturnType<typeof setTimeout> | undefined

  setEq(state: EqState): void {
    this.eq.set(state)
    this.saveSoundSoon()
  }

  setBalance(balance: number): void {
    this.balance.set(balance)
    this.saveSoundSoon()
  }

  private async loadPresets(): Promise<void> {
    try {
      const s = await firstValueFrom(this.http.get<{ presets?: Record<string, EqValues>; auto?: Record<string, EqValues>; default?: EqValues | null }>(`${environment.backend.playerUrl}/winamp/presets`).pipe(timeout(3000)))
      this.store.set({ presets: s.presets ?? {}, auto: s.auto ?? {}, default: s.default ?? null })
    } catch {
      // an older player: the presets of this session only
    }
  }

  private savePresets(): void {
    this.http
      .post(`${environment.backend.playerUrl}/winamp/presets`, this.store())
      .pipe(catchError(() => of(null)))
      .subscribe()
  }

  private saveSoundSoon(): void {
    clearTimeout(this.soundTimer)
    // (a slider is dragged through many values: the player gets the one it rests on)
    this.soundTimer = setTimeout(() => {
      const e = this.eq()
      this.http
        .post(`${environment.backend.playerUrl}/winamp/sound`, { on: e.on, auto: e.auto, preamp: e.preamp, bands: e.bands, balance: this.balance() })
        .pipe(catchError(() => of(null)))
        .subscribe()
    }, 250)
  }

  private async loadSound(): Promise<void> {
    try {
      const s = await firstValueFrom(
        this.http.get<{ supported?: boolean; on?: boolean; auto?: boolean; preamp?: number; bands?: number[]; balance?: number }>(`${environment.backend.playerUrl}/winamp/sound`).pipe(timeout(3000)),
      )
      this.soundSupported.set(s.supported !== false)
      this.eq.set({
        on: s.on === true,
        auto: s.auto === true,
        preamp: typeof s.preamp === 'number' ? s.preamp : 0,
        bands: Array.isArray(s.bands) && s.bands.length === 10 ? s.bands : new Array<number>(10).fill(0),
      })
      this.balance.set(typeof s.balance === 'number' ? s.balance : 0)
    } catch {
      // an older player without the route: the equaliser is shown, it changes nothing
      this.soundSupported.set(false)
    }
  }

  // ---------- skin ----------

  private async loadSkin(): Promise<void> {
    try {
      const meta = await firstValueFrom(this.http.get<SkinMeta>(`${SKIN_BASE}/skin.json?t=${Date.now()}`).pipe(timeout(5000)))
      if (this.skin()?.meta.version !== meta.version) this.skin.set(new Skin(meta, SKIN_BASE))
    } catch {
      this.skin.set(null)
    }
    this.skinLoaded.set(true)
  }

  // ---------- playlist ----------

  /** What the menus of the playlist's buttons do to the queue (the player's /queue routes); the list is read again after each. */
  readonly queue: QueueApi = {
    editable: () => this.queueEditable(),
    remove: (positions) => this.queueDo(`remove?pos=${positions.join(',')}`),
    crop: (positions) => this.queueDo(`crop?pos=${positions.join(',')}`),
    newList: () => this.queueDo('new'),
    sort: (mode: SortMode) => this.queueDo(`sort/${mode}`),
    dirs: (path) => this.queueGet<{ path: string; audio: number; canAdd?: boolean; folders: { name: string; path: string; audio: number }[] }>(`dirs?path=${encodeURIComponent(path)}`),
    addDir: (path) => this.queueDo(`add?path=${encodeURIComponent(path)}`),
    info: (position) => this.queueGet(`info?pos=${position}`),
    lists: async () => (await this.queueGet<{ lists: { name: string; count: number }[] }>('lists'))?.lists ?? [],
    save: async () => (await this.queueGet<{ name?: string }>('save'))?.name ?? null,
    load: (name) => this.queueDo(`load?name=${encodeURIComponent(name)}`),
    deleteList: async (name) => void (await this.queueGet(`deletelist?name=${encodeURIComponent(name)}`)),
  }

  private async queueGet<T>(path: string): Promise<T | null> {
    try {
      return (await firstValueFrom(this.http.get<T>(`${environment.backend.playerUrl}/queue/${path}`))) ?? null
    } catch {
      return null
    }
  }

  private async queueDo(path: string): Promise<boolean> {
    const answer = await this.queueGet<{ ok?: boolean }>(path)
    // (an edited queue is no longer the album: its place is not kept for "Fortsetzen")
    this.currentMedia.markQueueEdited()
    this.queueTick.update((n) => n + 1)
    return answer?.ok === true
  }

  private async loadEntries(media: Media): Promise<void> {
    type Row = PlaylistEntry & { id?: string }
    const spotify = this.spotifyService
    let rows: Row[] = []
    try {
      // (a local album is the queue the player has: that list, which the menus edit; else the album's folder)
      const queue: { editable: boolean; entries: { position: number; name: string }[] } | null =
        media.type === 'library' || media.type === 'nas'
          ? await firstValueFrom(this.http.get<{ editable: boolean; entries: { position: number; name: string }[] }>(`${environment.backend.playerUrl}/queue`)).catch((): null => null)
          : null
      this.queueEditable.set(queue?.editable === true)
      if (queue?.editable) {
        rows = queue.entries.map((t) => ({ position: t.position, id: `${t.position}`, name: t.name }))
      } else if (media.type === 'library' || media.type === 'nas') {
        const tracks = await firstValueFrom(media.type === 'library' ? this.player.getLocalTracklist(media) : this.player.getNasTracklist(media))
        rows = (tracks ?? []).map((t) => ({ position: t.position, id: `${t.position}`, name: t.name }))
      } else if (media.playlistid) {
        const info = await firstValueFrom(spotify.getPlaylistInfo(media.playlistid))
        rows = (info.tracks ?? []).map((t: any, i: number) => ({ position: i + 1, id: t.id ?? t.uri, name: t.name, artist: t.artist, duration: (t.duration_ms ?? 0) / 1000 }))
      } else if (media.audiobookid) {
        const info = await firstValueFrom(spotify.getAudiobookInfo(media.audiobookid))
        rows = (info.chapters ?? []).map((c: any, i: number) => ({ position: i + 1, id: c.id, name: c.name, duration: (c.duration_ms ?? 0) / 1000 }))
      } else if (media.showid) {
        const info = await firstValueFrom(spotify.getShowInfo(media.showid))
        rows = (info.episodes ?? []).map((c: any, i: number) => ({ position: i + 1, id: c.id, name: c.name, duration: (c.duration_ms ?? 0) / 1000 }))
      } else if (media.id && media.type === 'spotify') {
        const info = await firstValueFrom(spotify.getAlbumInfo(media.id))
        rows = (info.tracks ?? []).map((t: any, i: number) => ({ position: i + 1, id: t.id, name: t.name, artist: t.artist, duration: (t.duration_ms ?? 0) / 1000 }))
      }
    } catch {
      rows = []
    }
    this.entries.set(rows)
  }
}
