import { HttpClient } from '@angular/common/http'
import { Injectable, signal } from '@angular/core'
import {
  combineLatest,
  concat,
  defer,
  EMPTY,
  firstValueFrom,
  forkJoin,
  from,
  iif,
  interval,
  Observable,
  of,
  Subject,
  type Subscription,
  throwError,
  timer,
} from 'rxjs'
import {
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  finalize,
  map,
  mergeAll,
  mergeMap,
  retry,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
  timeout,
  toArray,
} from 'rxjs/operators'
import { environment } from '../environments/environment'
import type { AlbumStop } from './albumstop'
import type { Artist } from './artist'
import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
import { isResumeEntry, type CategoryType, type Media, type MediaInfoCache } from './media'
import { Mupihat } from './mupihat'
import type { Network } from './network'
import { NetworkService } from './network.service'
import { RssFeedService } from './rssfeed.service'
import { SpotifyService } from './spotify.service'
import type { ExtraDataMedia } from './utils'
import type { WLAN } from './wlan'

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  response = ''
  public readonly current$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>
  public readonly albumStop$: Observable<AlbumStop>
  public readonly mupihat$: Observable<Mupihat>

  private wlanSubject = new Subject<WLAN[]>()

  // Cache for album/playlist/show information (refreshes when switching media)
  private mediaInfoCache: MediaInfoCache = {}

  constructor(
    private http: HttpClient,
    private spotifyService: SpotifyService,
    private rssFeedService: RssFeedService,
    private networkService: NetworkService,
  ) {
    // Prepare subscriptions.
    // shareReplay replays the most recent (bufferSize) emission on each subscription
    // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
    // Hybrid approach: Poll Web Playback SDK state for localhost, HTTP polling for remote
    this.current$ = this.spotifyService.shouldUsePlayer()
      ? // Local: Poll Web Playback SDK state every second for accurate position
        interval(1000).pipe(
          switchMap(() => {
            if (this.spotifyService.isPlayerReady()) {
              return this.spotifyService
                .getCurrentState()
                .then(async (state) => {
                  if (!state || !state.track_window?.current_track) {
                    return {} as CurrentSpotify
                  }

                  const currentTrack = state.track_window.current_track
                  const contextUri = state.context?.uri

                  // Get enhanced media information if context is available
                  let mediaInfo = null
                  let trackPosition = 1

                  if (contextUri) {
                    mediaInfo = await this.getMediaInfo(contextUri)

                    // Calculate track/episode/chapter position based on context type
                    if (contextUri.includes('spotify:album:') && mediaInfo && mediaInfo.tracks) {
                      const currentTrackIndex = mediaInfo.tracks.findIndex(
                        (track: any) => track.id === currentTrack.id || track.uri === currentTrack.uri,
                      )
                      if (currentTrackIndex !== -1) {
                        trackPosition = currentTrackIndex + 1
                      }
                    } else if (contextUri.includes('spotify:playlist:') && mediaInfo && mediaInfo.tracks) {
                      const currentTrackIndex = mediaInfo.tracks.findIndex(
                        (track: any) => track.id === currentTrack.id || track.uri === currentTrack.uri,
                      )
                      if (currentTrackIndex !== -1) {
                        trackPosition = currentTrackIndex + 1
                      }
                    } else if (contextUri.includes('spotify:show:')) {
                      // Both shows and audiobooks use spotify:show: URIs
                      if (mediaInfo?.episodes) {
                        // This is a podcast show
                        const currentEpisodeIndex = mediaInfo.episodes.findIndex(
                          (episode: any) => episode.id === currentTrack.id || episode.uri === currentTrack.uri,
                        )
                        if (currentEpisodeIndex !== -1) {
                          trackPosition = currentEpisodeIndex + 1
                        }
                      } else if (mediaInfo?.chapters) {
                        // This is an audiobook (treated as show with chapters)
                        const currentChapterIndex = mediaInfo.chapters.findIndex(
                          (chapter: any) => chapter.id === currentTrack.id || chapter.uri === currentTrack.uri,
                        )
                        if (currentChapterIndex !== -1) {
                          trackPosition = currentChapterIndex + 1
                        }
                      }
                    }
                  }

                  const contextType = contextUri ? contextUri.split(':')[1] : undefined

                  return {
                    progress_ms: state.position,
                    is_playing: !state.paused,
                    item: {
                      id: currentTrack.id,
                      name: currentTrack.name,
                      duration_ms: currentTrack.duration_ms,
                      track_number: ['album', 'playlist', 'show'].includes(contextType)
                        ? trackPosition
                        : currentTrack.track_number || 1,
                      album: currentTrack.album,
                      ...(mediaInfo && {
                        album: {
                          ...currentTrack.album,
                          name: this.getMediaName(mediaInfo) || currentTrack.album?.name,
                          total_tracks: mediaInfo.total_tracks,
                        },
                        show: {
                          name: mediaInfo.show_name,
                          total_episodes: mediaInfo.total_episodes,
                        },
                      }),
                    },
                    ...(contextType === 'playlist' &&
                      mediaInfo && {
                        playlist: {
                          name: mediaInfo.playlist_name,
                          total_tracks: mediaInfo.total_tracks,
                          current_track_position: trackPosition,
                        },
                      }),
                    ...(contextType === 'show' &&
                      mediaInfo &&
                      mediaInfo.episodes && {
                        show_details: {
                          name: mediaInfo.show_name,
                          total_episodes: mediaInfo.total_episodes,
                          current_episode_position: trackPosition,
                        },
                      }),
                    ...(contextType === 'show' &&
                      mediaInfo &&
                      mediaInfo.chapters && {
                        audiobook: {
                          name: mediaInfo.audiobook_name,
                          total_chapters: mediaInfo.total_chapters,
                          current_chapter_position: trackPosition,
                        },
                      }),
                  } as CurrentSpotify
                })
                .catch(() => ({}) as CurrentSpotify)
            }
            return of({} as CurrentSpotify)
          }),
          shareReplay({ bufferSize: 1, refCount: true }),
        )
      : // Remote: HTTP polling.
        // B11: a single HTTP failure (network blip, backend restart)
        // would error the source observable, and shareReplay would
        // forever replay that error to subscribers — UI stops getting
        // state updates until the page is reloaded. Wrap the inner
        // get in catchError(of({})) so transient failures show as
        // "no current state" without tearing down the polling stream.
        interval(10000).pipe(
          switchMap(
            (): Observable<CurrentSpotify> =>
              this.http
                .get<CurrentSpotify>(`${this.getPlayerBackendUrl()}/state`)
                .pipe(catchError(() => of({} as CurrentSpotify))),
          ),
          shareReplay({ bufferSize: 1, refCount: true }),
        )
    // Same B11 pattern for local$ / albumStop$ / mupihat$ — all polling
    // streams that should swallow transient errors instead of becoming
    // permanently broken.
    this.local$ = interval(1000).pipe(
      switchMap(
        (): Observable<CurrentMPlayer> =>
          this.http
            .get<CurrentMPlayer>(`${this.getPlayerBackendUrl()}/local`)
            .pipe(catchError(() => of({} as CurrentMPlayer))),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    )

    this.albumStop$ = interval(1000).pipe(
      switchMap(
        (): Observable<AlbumStop> =>
          this.http
            .get<AlbumStop>(`${this.getApiBackendUrl()}/albumstop`)
            .pipe(catchError(() => of({} as AlbumStop))),
      ),
      // refCount=true like mupihat$ (M2): only the player page listens, and with refCount=false
      // the poll kept hitting /api/albumstop once a second forever after its first visit.
      shareReplay({ bufferSize: 1, refCount: true }),
    )
    // Every 2 seconds should be enough for timely charging update.
    // M2: refCount=true so the polling stops when no UI is subscribed.
    // Previously the stream kept hitting /api/mupihat every 2s for the
    // entire app lifetime even when the mupihat-icon wasn't rendered
    // (~1800 wasted req/h). The only consumer is mupihat-icon.component,
    // which switchMaps in only when hat_active === true — so refCount
    // ensures the upstream interval idles when that icon is unmounted
    // (any page without the toolbar/footer rendering it).
    this.mupihat$ = interval(2000).pipe(
      switchMap(
        (): Observable<Mupihat> =>
          this.http
            .get<Mupihat>(`${this.getApiBackendUrl()}/mupihat`)
            .pipe(catchError(() => of({} as Mupihat))),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    )

    this.initTelegramNotifications()
  }

  // --------------------------------------------
  // Telegram Notifications
  // --------------------------------------------

  private initTelegramNotifications(): void {
    this.spotifyService.trackChangeDetected$.subscribe((track) => {
      if (track) {
        this.sendTelegramNotification()
      }
    })
  }

  private sendTelegramNotification(): void {
    firstValueFrom(this.current$)
      .then((spotify) => {
        const item = spotify?.item
        if (!item?.name) return

        const parts: string[] = []

        if (item.show?.name) {
          parts.push(item.show.name)
          parts.push(item.name)
        } else {
          if (item.album?.name) {
            parts.push(item.album.name)
          }
          parts.push(item.name)
          if (item.track_number && item.album?.total_tracks) {
            parts.push(`Track: ${item.track_number}/${item.album.total_tracks}`)
          }
        }

        const message = parts.join('\n')
        this.http.post(`${this.getApiBackendUrl()}/telegram/screen`, { message }).subscribe({
          error: (err) => console.warn('Failed to send Telegram notification:', err),
        })
      })
      .catch((err) => console.warn('Failed to get current state for Telegram:', err))
  }

  // --------------------------------------------
  // Network state (delegated to NetworkService)
  // --------------------------------------------

  /** Network state observable - delegates to NetworkService */
  public get network$(): Observable<Network> {
    return this.networkService.network$
  }

  public isOnline(): Observable<boolean> {
    return this.networkService.isOnline()
  }

  // --------------------------------------------
  // Handling of RAW media entries from data.json
  // --------------------------------------------

  public fetchRawMedia(): Observable<Media[]> {
    return this.http.get<Media[]>(`${this.getApiBackendUrl()}/data`)
  }

  private libraryVersion$?: Observable<string>
  private dataVersion$?: Observable<string>
  private versions$?: Observable<{ version: string; local: string; nasTab: boolean }>

  /**
   * Phase 17g: cheap library-change signal. Polls /api/data-version (a stat,
   * not the full list) every 20s and emits the change-token, de-duped. The
   * home/medialist pages fold this into their fetch trigger so the display
   * auto-refreshes shortly after a Smart-Sync changes the library — without
   * downloading the whole list on every tick. shareReplay+refCount keeps the
   * poll alive only while a page is subscribed (idle on the player screen).
   */
  // The pages' version also changes when files were uploaded into the local media folders (web app); the kept lists
  // of the home page only depend on data.json (getDataVersion).
  public getLibraryVersion(): Observable<string> {
    if (!this.libraryVersion$) {
      this.libraryVersion$ = this.versions().pipe(
        map((v) => (v.version === '' ? '' : `${v.version}|${v.local}`)),
        distinctUntilChanged(),
      )
    }
    return this.libraryVersion$
  }

  private getDataVersion(): Observable<string> {
    if (!this.dataVersion$) {
      this.dataVersion$ = this.versions().pipe(
        map((v) => v.version),
        distinctUntilChanged(),
      )
    }
    return this.dataVersion$
  }

  /** Whether the NAS tab is wanted: shown NAS folders are left that have no category (older backends: always). */
  public getNasTabWanted(): Observable<boolean> {
    return this.versions().pipe(
      map((v) => v.nasTab),
      distinctUntilChanged(),
    )
  }

  private versions(): Observable<{ version: string; local: string; nasTab: boolean }> {
    if (!this.versions$) {
      this.versions$ = interval(20000).pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<{ version: string; local?: string; nasTab?: boolean }>(`${this.getApiBackendUrl()}/data-version`).pipe(
            map((r) => ({ version: r?.version ?? '', local: r?.local ?? '', nasTab: r?.nasTab !== false })),
            catchError(() => of({ version: '', local: '', nasTab: true })),
          ),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
      )
    }
    return this.versions$
  }

  updateWLAN() {
    const url = `${this.getApiBackendUrl()}/wlan`
    this.http.get<WLAN[]>(url).subscribe((wlan) => {
      this.wlanSubject.next(wlan)
    })
  }

  deleteRawMediaAtIndex(index: number) {
    const url = `${this.getApiBackendUrl()}/delete`
    const body = {
      index,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  editRawMediaAtIndex(index: number, data: Media) {
    const url = `${this.getApiBackendUrl()}/edit`
    const body = {
      index,
      data,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addRawMedia(media: Media) {
    const url = `${this.getApiBackendUrl()}/add`

    this.http.post(url, media, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addRawResume(media: Media) {
    const url = `${this.getApiBackendUrl()}/addresume`

    this.http.post(url, media, { responseType: 'text' }).subscribe((response) => {
      this.response = response
    })
  }

  addWLAN(wlan: WLAN) {
    const url = `${this.getApiBackendUrl()}/addwlan`

    this.http.post(url, wlan, { responseType: 'text' }).subscribe((_response) => {
      //this.response = response;
      this.updateWLAN()
    })
  }

  // Collect albums from a given artist in the current category
  // Album lists of the artists opened last, so going back from the player (which rebuilds the album
  // page) shows the list at once instead of loading it again (2-3 s for a big Spotify artist). Keyed by
  // the library version: any change of data.json (Smart-Sync, add/edit) starts over. Local folders and
  // the NAS are read live on purpose (new files show up at once) and are not kept here.
  private artistMediaCache = new Map<string, { at: number; media: Observable<Media[]> }>()
  private static readonly ARTIST_CACHE_MS = 10 * 60 * 1000
  private static readonly ARTIST_CACHE_MAX = 20

  public fetchMediaFromArtist(artist: Artist, category: CategoryType, libraryVersion?: string): Observable<Media[]> {
    const live = !!artist.coverMedia?.libraryPath || (category === 'nas' && !!artist.coverMedia?.nasPath)
    if (live || libraryVersion === undefined) {
      return this.loadMediaFromArtist(artist, category)
    }
    const key = `${libraryVersion}|${category}|${artist.name}|${artist.coverMedia?.artistid ?? ''}`
    const hit = this.artistMediaCache.get(key)
    // every caller gets its own copy: the player page changes the clicked entry (resume, shuffle)
    const copy = map((list: Media[]) => {
      try {
        return structuredClone(list)
      } catch {
        return list.map((m) => ({ ...m })) // something not cloneable in an entry: at least a new object per entry
      }
    })
    if (hit && Date.now() - hit.at < MediaService.ARTIST_CACHE_MS) {
      return hit.media.pipe(copy)
    }
    // shareReplay: a second caller during the first load waits for it instead of loading twice
    const media = this.loadMediaFromArtist(artist, category).pipe(
      catchError((error) => {
        this.artistMediaCache.delete(key) // don't keep a failed load
        throw error
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    for (const [k, v] of this.artistMediaCache) {
      if (!k.startsWith(`${libraryVersion}|`) || Date.now() - v.at >= MediaService.ARTIST_CACHE_MS) this.artistMediaCache.delete(k)
    }
    if (this.artistMediaCache.size >= MediaService.ARTIST_CACHE_MAX) {
      this.artistMediaCache.delete(this.artistMediaCache.keys().next().value as string)
    }
    this.artistMediaCache.set(key, { at: Date.now(), media })
    return media.pipe(copy)
  }

  private loadMediaFromArtist(artist: Artist, category: CategoryType): Observable<Media[]> {
    if (artist.coverMedia?.libraryPath) {
      // Local folder: list one level live from disk.
      return this.http.get<Media[]>(
        `${this.getApiBackendUrl()}/library/children?path=${encodeURIComponent(artist.coverMedia.libraryPath)}`,
      )
    }
    if (category === 'nas' && artist.coverMedia?.nasPath) {
      // NAS folders can be nested any number of levels deep; every level is
      // listed live from the NAS, one level at a time.
      // 503: the NAS could not be read just now (waking up, WiFi hiccup) - a few more tries before the level
      // shows up empty or with albums missing.
      return this.http
        .get<Media[]>(`${this.getApiBackendUrl()}/nas/children?path=${encodeURIComponent(artist.coverMedia.nasPath)}`)
        .pipe(
          retry({
            count: 3,
            delay: (error: { status?: number }) => (error?.status === 503 ? timer(3000) : throwError(() => error)),
          }),
        )
    }
    // Fast path for Spotify artists: we already know the artistid from the
    // navigation state, so call getMediaByArtistID directly. Previously this
    // ran fetchMedia(category) which loads EVERY item in the category — for
    // a library with 8 spotify-artists + 7 spotify-albums + 143 library
    // entries the page fired ~55 backend calls just to filter Benjamin
    // Blümchen out at the end. Direct call is 6 backend calls (with QW1+QW2
    // pagination) and no other items contend for the event loop.
    const cm = artist.coverMedia
    if (cm.type === 'spotify' && cm.artistid && cm.artistid.length > 0) {
      const extra: ExtraDataMedia = {
        artistcover: cm.artistcover,
        shuffle: cm.shuffle,
        aPartOfAll: cm.aPartOfAll,
        aPartOfAllMin: cm.aPartOfAllMin,
        aPartOfAllMax: cm.aPartOfAllMax,
        sorting: cm.sorting,
        lastPlayedAt: cm.lastPlayedAt,
      }
      return this.spotifyService.getMediaByArtistID(cm.artistid, category, 0, extra)
    }
    // Library/local entries fall back to the original load-then-filter path
    // because multiple data.json rows may share the same artist name (each
    // album its own row), and there's no single API call that retrieves
    // them as a group.
    // onlyArtist: rows that name another artist are skipped before their Spotify/RSS lookup -
    // the result is the same, but an artist of single albums (e.g. 169 rows) no longer waits for
    // the lookups of the whole category (327 rows).
    return this.fetchMedia(category, artist.name).pipe(
      map((media: Media[]) => {
        return media.filter((currentMedia) => currentMedia.artist === artist.name)
      }),
    )
  }

  public fetchMediaData(category: CategoryType): Observable<Media[]> {
    return this.fetchMedia(category).pipe(
      map((media: Media[]) => {
        return media.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        )
      }),
    )
  }

  // The home page: the kept list at once and, when it is out of date, the new one after it (see homeListMedia).
  public fetchArtistData(category: CategoryType): Observable<Artist[]> {
    return this.fetchMedia(category, undefined, true).pipe(
      map((media: Media[]) => {
        // Separate playlists without artists from regular media
        const regularMedia: Media[] = []
        const standalonePlaylistsData: Artist[] = []

        for (const currentMedia of media) {
          // A playlist or a radio station without an artist gets an entry of its own (a tap plays it right away).
          // Without this a station added without a label was not shown at all.
          if ((currentMedia.playlistid || currentMedia.type === 'radio') && !currentMedia.artist) {
            standalonePlaylistsData.push({
              name: currentMedia.title || (currentMedia.type === 'radio' ? 'Radio' : 'Unknown Playlist'),
              albumCount: '1', // Playlists have 1 "album" (themselves)
              cover: currentMedia.cover || '../assets/images/nocover_mupi.png',
              coverMedia: currentMedia,
            })
          } else if (currentMedia.artist) {
            // Regular media with artist - include in normal grouping
            regularMedia.push(currentMedia)
          }
          // Skip other media without artist (they would cause undefined grouping)
        }

        // Process regular media with artist grouping. A folder of the SD card or the NAS is a tile of its own, even
        // with the name of another one (a NAS "Benjamin Blümchen" next to the one of the SD card: merged, one tap
        // opened only one of them).
        const groupOf = (m: Media) => (m.nasPath ? `nas:${m.nasPath}` : m.libraryPath ? `lib:${m.libraryPath}` : `artist:${m.artist}`)
        const names: Record<string, string> = {}
        const mediaCounts = regularMedia.reduce<Record<string, number>>((tempCounts, currentMedia) => {
          const key = groupOf(currentMedia)
          names[key] = currentMedia.artist
          tempCounts[key] = (tempCounts[key] || 0) + 1
          return tempCounts
        }, {})

        const covers = regularMedia
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce<Record<string, string>>((tempCovers, currentMedia) => {
            const key = groupOf(currentMedia)
            if (!tempCovers[key]) {
              tempCovers[key] = currentMedia.artistcover || currentMedia.cover
            }
            return tempCovers
          }, {})

        // (a podcast with a new episode: a dot on its tile)
        const hasNew = new Set(regularMedia.filter((m) => m.episodeNew).map(groupOf))

        const coverMedia = regularMedia
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce<Record<string, Media>>((tempMedia, currentMedia) => {
            const key = groupOf(currentMedia)
            if (!tempMedia[key]) {
              tempMedia[key] = currentMedia
            }
            return tempMedia
          }, {})

        // Build Array of Artist objects sorted by Artist name
        const regularArtists: Artist[] = Object.keys(mediaCounts)
          .sort()
          .map((key) => {
            const artist: Artist = {
              name: names[key],
              albumCount: mediaCounts[key].toString(),
              cover: covers[key],
              coverMedia: coverMedia[key],
              ...(hasNew.has(key) ? { hasNew: true } : {}),
            }
            return artist
          })

        // Combine regular artists with standalone playlists
        const allArtists = [...regularArtists, ...standalonePlaylistsData]

        // Sort the combined array by name
        return allArtists.sort((a, b) => (a.name <= b.name ? -1 : 1))
      }),
    )
  }

  public fetchActiveResumeData(): Observable<Media[]> {
    // Category is irrelevant if 'resume' is set to true.
    // Sort by lastPlayedAt DESC so "most recently played" is at position 1.
    // Previously the page used a blind `.reverse()` of the array, which
    // matches the file insertion order — but addresume updates existing
    // entries in place (preserving their position) so a freshly-played
    // album never moved to the top until it was a *new* entry. Items
    // without a timestamp (legacy entries pre-migration) sort to 0 and
    // land at the bottom; the backend back-fills synthetic stamps
    // preserving original order on the next addresume so this is
    // self-healing.
    return this.updateMedia(`${this.getApiBackendUrl()}/activeresume`, true, 'resume').pipe(
      map((media: Media[]) => {
        return [...media].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
      }),
    )
  }

  // true when the NAS list could not be loaded even after the retries (the home page shows the placeholder)
  public readonly nasUnavailable = signal(false)
  // the NAS folders of each category tab as last loaded (shown at once the next time, see fetchMedia)
  private readonly nasInCategory = new Map<CategoryType, Media[]>()

  // --- Lists of the home page (see /api/home-lists in the backend) ---------------------------------------------
  // The data.json part of a category (Spotify, podcasts, playlists, radio) as resolved Media, per data.json version.
  // Resolving it again on every switch took seconds (e.g. all album pages of every Spotify artist); it is kept here
  // and on the box, shown at once, and made again in the background when data.json changed or it is older than
  // HOME_LIST_MAX_AGE_MS (new albums of an artist on Spotify). Local folders are still read live on every switch
  // (fast, and new files show up at once), the NAS has its own index.
  private static readonly HOME_LIST_MAX_AGE_MS = 6 * 60 * 60 * 1000
  private static readonly HOME_LIST_CATEGORIES: CategoryType[] = ['audiobook', 'music', 'other']
  private homeLists = new Map<CategoryType, { version: string; at: number; media: Media[] }>()
  private homeListsLoaded$?: Observable<void>
  private homeListRuns = new Map<CategoryType, Observable<Media[]>>()
  private homeListsWarming?: Subscription

  // the lists the box kept (once per start of the display)
  private loadHomeLists(): Observable<void> {
    if (!this.homeListsLoaded$) {
      this.homeListsLoaded$ = this.http
        .get<Record<string, { version: string; at: number; media: Media[] }>>(`${this.getApiBackendUrl()}/home-lists`)
        .pipe(
          timeout(5000),
          map((lists) => {
            for (const category of MediaService.HOME_LIST_CATEGORIES) {
              const list = lists?.[category]
              if (list && typeof list.version === 'string' && Array.isArray(list.media) && !this.homeLists.has(category)) {
                this.homeLists.set(category, list)
              }
            }
          }),
          catchError(() => of(undefined)),
          shareReplay({ bufferSize: 1, refCount: false }),
        )
    }
    return this.homeListsLoaded$
  }

  private homeListIsCurrent(category: CategoryType, version: string): boolean {
    const kept = this.homeLists.get(category)
    return !!kept && version !== '' && kept.version === version && Date.now() - kept.at < MediaService.HOME_LIST_MAX_AGE_MS
  }

  // made again from data.json (one run per category at a time), then kept here and on the box
  private remakeHomeList(category: CategoryType, version: string): Observable<Media[]> {
    let run = this.homeListRuns.get(category)
    if (!run) {
      run = this.updateMedia(`${this.getApiBackendUrl()}/data`, false, category).pipe(
        tap((media) => {
          this.homeLists.set(category, { version, at: Date.now(), media })
          if (version !== '') {
            this.http.put(`${this.getApiBackendUrl()}/home-lists/${category}`, { version, media }).subscribe({ error: () => undefined })
          }
        }),
        finalize(() => this.homeListRuns.delete(category)),
        shareReplay({ bufferSize: 1, refCount: false }),
      )
      this.homeListRuns.set(category, run)
    }
    return run
  }

  // The data.json part of a category. showKept (home page): the kept list at once, and the new one after it when
  // the kept one is out of date. Otherwise one answer: the kept list when it belongs to the current data.json,
  // else a new one.
  // onlyArtist (album page of an artist): the kept list when it is current, else only that artist's rows looked up.
  private homeListMedia(category: CategoryType, showKept: boolean, onlyArtist?: string): Observable<Media[]> {
    const copy = (list: Media[]) => {
      try {
        return structuredClone(list) // the pages change entries (resume, shuffle): never the kept ones
      } catch {
        return list.map((m) => ({ ...m }))
      }
    }
    return forkJoin([this.loadHomeLists(), this.getDataVersion().pipe(take(1))]).pipe(
      switchMap(([, version]) => {
        const kept = this.homeLists.get(category)
        if (kept && this.homeListIsCurrent(category, version)) {
          return of(copy(kept.media))
        }
        if (onlyArtist !== undefined) {
          return this.updateMedia(`${this.getApiBackendUrl()}/data`, false, category, onlyArtist)
        }
        if (kept && showKept) {
          // a failed remake keeps what is shown
          return concat(of(copy(kept.media)), this.remakeHomeList(category, version).pipe(map(copy), catchError(() => EMPTY)))
        }
        return this.remakeHomeList(category, version).pipe(map(copy))
      }),
    )
  }

  // Keeps the lists of the given categories up to date in the background, so a switch to another category shows
  // it at once already the first time: shortly after the start, after every change of data.json and when they get
  // old. One category after the other, only the ones out of date.
  public keepHomeListsWarm(categories: () => CategoryType[]): void {
    if (this.homeListsWarming) return
    this.homeListsWarming = combineLatest([this.getDataVersion(), timer(15_000, MediaService.HOME_LIST_MAX_AGE_MS / 4)])
      .pipe(
        debounceTime(5_000),
        exhaustMap(([version]) =>
          this.loadHomeLists().pipe(
            switchMap(() => from(categories().filter((c) => MediaService.HOME_LIST_CATEGORIES.includes(c)))),
            concatMap((category) =>
              this.homeListIsCurrent(category, version) ? EMPTY : this.remakeHomeList(category, version).pipe(catchError(() => EMPTY)),
            ),
          ),
        ),
      )
      .subscribe()
  }

  private fetchMedia(category: CategoryType, onlyArtist?: string, showKept = false): Observable<Media[]> {
    if (category === 'nas') {
      // NAS media is fetched live from the NAS on every call (never cached
      // into data.json), so it bypasses the Spotify-oriented updateMedia pipeline
      // below entirely - the backend already returns ready-to-use Media[].
      // The backend answers 503 while marked folders cannot be read (NAS not reachable yet, e.g. right after
      // boot before the network is up): try again a few times instead of showing an empty tab for good.
      // (About 40 s in all: a list that loads for a minute makes the loading component reload the page.)
      return defer(() => {
        this.nasUnavailable.set(false)
        return this.http.get<Media[]>(`${this.getApiBackendUrl()}/nas/artists?category=nas`)
      }).pipe(
        retry({ count: 8, delay: () => timer(5000) }),
        catchError(() => {
          this.nasUnavailable.set(true)
          return of([] as Media[])
        }),
      )
    }
    const dataMedia = MediaService.HOME_LIST_CATEGORIES.includes(category)
      ? this.homeListMedia(category, showKept, onlyArtist)
      : this.updateMedia(`${this.getApiBackendUrl()}/data`, false, category, onlyArtist)

    if (category === 'audiobook' || category === 'music' || category === 'other') {
      // Local files are read live from the media folders (any folder depth), so
      // changes made in the file explorer show up right away - no "reload media
      // database" needed. Everything that is not a local file (Spotify, podcasts,
      // radio) still comes from data.json, unchanged.
      const localFolders = this.http
        .get<Media[]>(`${this.getApiBackendUrl()}/library/artists?category=${category}`)
        .pipe(catchError(() => of([] as Media[])))
      // NAS folders the parents put into this category (app: NAS › "Anzeigen"). The NAS may answer slowly or not at
      // all: the list shows at once with the NAS folders of last time, the new ones follow.
      const nasFolders = this.http.get<Media[]>(`${this.getApiBackendUrl()}/nas/artists?category=${category}`).pipe(
        timeout(20000),
        retry({ count: 2, delay: () => timer(5000) }),
        tap((list) => this.nasInCategory.set(category, list)),
        catchError(() => of(this.nasInCategory.get(category) ?? [])),
        startWith(this.nasInCategory.get(category) ?? []),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      )
      // combineLatest: the data.json part may come twice (kept list, then the new one), each time with the folders
      return combineLatest([dataMedia, localFolders, nasFolders]).pipe(
        map(([data, local, nas]) => [...data.filter((item) => item.type !== 'library'), ...local, ...nas]),
      )
    }
    return dataMedia
  }

  // Get the media data for the current category from the server
  private updateMedia(url: string, resume: boolean, category: CategoryType, onlyArtist?: string): Observable<Media[]> {
    // Custom rxjs pipe applied to every iif-branch's service-call output.
    // Carries the original item's user-relevant fields onto the Media that
    // the spotify/rss/library service builds out of upstream API data:
    // - artist: optional user-defined override
    // - lastPlayedAt: ResumePage sorts DESC by this; spotify.service's
    //   getMediaByID etc. don't accept it as a param, so without this carry
    //   the field gets dropped on every resume entry that goes through a
    //   service call. fetchActiveResumeData's sort then sees zeros and the
    //   user's most-recently-played item ends up at a random swiper position.
    // - isResume: marks resume entries; same loss-on-service-call risk.
    const overwriteArtist =
      (item: Media) =>
      (source$: Observable<Media[]>): Observable<Media[]> => {
        return source$.pipe(
          map((items) => {
            for (const currentItem of items) {
              if (item.artist?.length > 0) currentItem.artist = item.artist
              if (typeof item.lastPlayedAt === 'number') currentItem.lastPlayedAt = item.lastPlayedAt
              if (item.isResume === true) currentItem.isResume = true
            }
            return items
          }),
        )
      }

    return this.http.get<Media[]>(url).pipe(
      // Filter to get only items for the chosen category.
      map((items) => {
        if (resume) {
          return items
        }
        // Else: !resume.
        for (const item of items) {
          item.category = item.category === undefined ? 'audiobook' : item.category
          // Older entries have the category 'radio', which has no tab of its own: they belong to the radio tab ('other').
          if ((item.category as string) === 'radio') item.category = 'other'
        }
        return items.filter(
          (item) =>
            item.category === category &&
            // A row with its own artist keeps it (overwriteArtist), so it can only match that artist.
            (onlyArtist === undefined || !(item.artist?.length > 0) || item.artist === onlyArtist),
        )
      }),
      mergeMap((items) => from(items)), // parallel calls for each item
      map(
        // get media for the current item
        (item) =>
          iif(
            // Get media by query
            () => !!(item.query && item.query.length > 0),
            this.spotifyService
              .getMediaByQuery(item.query, item.category, item.index, item)
              .pipe(overwriteArtist(item)),
            iif(
              // Get media by artist
              () => !!(item.artistid && item.artistid.length > 0),
              this.spotifyService
                .getMediaByArtistID(item.artistid, item.category, item.index, item)
                .pipe(overwriteArtist(item)),
              iif(
                // Get media by show
                () => !!(item.showid && item.showid.length > 0 && !isResumeEntry(item)),
                this.spotifyService
                  .getMediaByShowID(item.showid, item.category, item.index, item)
                  .pipe(overwriteArtist(item)),
                iif(
                  // Get media by show supporting resume
                  () => !!(item.showid && item.showid.length > 0 && isResumeEntry(item)),
                  this.spotifyService
                    .getMediaByEpisode(
                      item.showid,
                      item.category,
                      item.index,
                      item.shuffle,
                      item.artistcover,
                      item.resumespotifyduration_ms,
                      item.resumespotifyprogress_ms,
                      item.resumespotifytrack_number,
                    )
                    .pipe(
                      map((currentItem) => [currentItem]),
                      overwriteArtist(item),
                    ),
                  iif(
                    // Get media by playlist
                    () => !!(item.type === 'spotify' && item.playlistid && item.playlistid.length > 0),
                    this.spotifyService
                      .getMediaByPlaylistID(
                        item.playlistid,
                        item.category,
                        item.index,
                        item.shuffle,
                        item.artistcover,
                        item.resumespotifyduration_ms,
                        item.resumespotifyprogress_ms,
                        item.resumespotifytrack_number,
                      )
                      .pipe(
                        map((currentItem) => [currentItem]),
                        overwriteArtist(item),
                      ),
                    iif(
                      // Get media by rss feed.
                      // MED-10 attempted to enrich RSS resume entries with
                      // fresh feed data, but the `id` of a RSS resume entry
                      // is the *episode's MP3 URL*, not the channel feed
                      // URL — the enrichment fetch streamed the MP3 audio
                      // (multi-MB) into the rss-parser path before MED-2's
                      // size-cap aborted with 413. Six RSS resume entries
                      // = ~24 s freeze on the resume page. Reinstate the
                      // resume-skip gate: every persisted field needed for
                      // the resume tile (title, cover, artistcover, release
                      // date, duration, progress) is already on disk; no
                      // network round-trip needed for resume rendering.
                      () => !!(item.type === 'rss' && item.id.length > 0 && !isResumeEntry(item)),
                      this.rssFeedService
                        .getRssFeed(item.id, item.category, item.index, item)
                        .pipe(overwriteArtist(item)),
                      iif(
                        // Get media by album (resume).
                        () => !!(item.type === 'spotify' && item.id && item.id.length > 0),
                        this.spotifyService
                          .getMediaByID(
                            item.id,
                            item.category,
                            item.index,
                            item.shuffle,
                            item.artistcover,
                            item.resumespotifyduration_ms,
                            item.resumespotifyprogress_ms,
                            item.resumespotifytrack_number,
                          )
                          .pipe(
                            map((currentItem) => [currentItem]),
                            overwriteArtist(item),
                          ),
                        iif(
                          // Get media by audiobook (resume).
                          () => !!(item.type === 'spotify' && item.audiobookid && item.audiobookid.length > 0),
                          this.spotifyService
                            .getAudiobookByID(
                              item.audiobookid,
                              item.category,
                              item.index,
                              item.shuffle,
                              item.artistcover,
                              item.resumespotifyduration_ms,
                              item.resumespotifyprogress_ms,
                              item.resumespotifytrack_number,
                            )
                            .pipe(
                              map((currentItem) => [currentItem]),
                              overwriteArtist(item),
                            ),
                          of([item]), // Single album. Also return as array, so we always have the same data type
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ),
      // L2: cap concurrent inner subscriptions. Upstream is Observable<Observable<Media[]>>
      // -- one inner Observable per library item, each doing a Spotify/RSS HTTP fetch.
      // Without a cap, 100+ inner Observables subscribe in parallel and the backend
      // sees a thundering herd of HTTP requests + Spotify SDK calls. 5 keeps the
      // Spotify rate-limiter (100 ms minRequestInterval) comfortable -- ~50 req/s
      // peak, well under quota, and the staggering smooths the cache-write storm
      // on SD.
      mergeMap((items) => from(items), 5),
      mergeAll(), // merge everything together
      toArray(), // convert to array
      map((media) => {
        // add dummy image for missing covers
        return media.map((currentMedia) => {
          if (!currentMedia.cover) {
            currentMedia.cover = '../assets/images/nocover_mupi.png'
          }
          return currentMedia
        })
      }),
    )
  }

  // Get all media entries for the current category
  getResponse() {
    const tmpResponse = this.response
    this.response = ''

    return tmpResponse
  }

  private getApiBackendUrl(): string {
    return environment.backend.apiUrl
  }

  private getPlayerBackendUrl(): string {
    return environment.backend.playerUrl
  }

  /**
   * Clear the media info cache (useful for manual cache invalidation)
   */
  public clearMediaInfoCache(): void {
    this.mediaInfoCache = {}
  }

  /**
   * Get the appropriate name based on media type
   */
  private getMediaName(mediaInfo: MediaInfoCache): string | undefined {
    switch (mediaInfo.mediaType) {
      case 'album':
        return mediaInfo.album_name
      case 'playlist':
        return mediaInfo.playlist_name
      case 'show':
        return mediaInfo.show_name
      case 'audiobook':
        return mediaInfo.audiobook_name
      default:
        return mediaInfo.album_name || mediaInfo.playlist_name || mediaInfo.show_name || mediaInfo.audiobook_name
    }
  }

  /**
   * Get enhanced media information (total tracks/episodes/chapters) for all content types
   * Uses caching to avoid repeated API calls for the same media ID
   */
  private async getMediaInfo(contextUri: string): Promise<{
    total_tracks?: number
    total_episodes?: number
    total_chapters?: number
    name?: string
    tracks?: any[]
    episodes?: any[]
    chapters?: any[]
    playlist_name?: string
    show_name?: string
    album_name?: string
    audiobook_name?: string
  } | null> {
    try {
      let mediaInfo: any = null
      let mediaId: string | null = null

      // Parse the URI to determine the type and extract the ID
      if (contextUri.includes('spotify:album:')) {
        mediaId = contextUri.split('spotify:album:')[1]
      } else if (contextUri.includes('spotify:playlist:')) {
        mediaId = contextUri.split('spotify:playlist:')[1]
      } else if (contextUri.includes('spotify:show:')) {
        mediaId = contextUri.split('spotify:show:')[1]
      }

      if (mediaId === null) {
        return null
      }

      if (this.mediaInfoCache.currentId === mediaId) {
        return this.mediaInfoCache
      }

      if (contextUri.includes('spotify:album:')) {
        mediaInfo = await firstValueFrom(this.spotifyService.getAlbumInfo(mediaId))
      } else if (contextUri.includes('spotify:playlist:')) {
        mediaInfo = await firstValueFrom(this.spotifyService.getPlaylistInfo(mediaId))
      } else if (contextUri.includes('spotify:show:')) {
        // Both shows and audiobooks use spotify:show: URIs
        // Try audiobook endpoint first (more specific, will fail for podcast shows)
        try {
          mediaInfo = await firstValueFrom(this.spotifyService.getAudiobookInfo(mediaId))
        } catch {
          // Fallback to show API (more general, works for both shows and audiobooks)
          try {
            mediaInfo = await firstValueFrom(this.spotifyService.getShowInfo(mediaId))
          } catch {
            console.warn('Failed to get info for show/audiobook:', mediaId)
          }
        }
      }

      if (mediaInfo && mediaId) {
        // Determine media type and set appropriate name
        let mediaType: 'album' | 'playlist' | 'show' | 'audiobook' = 'album'
        if (contextUri.includes('spotify:playlist:')) {
          mediaType = 'playlist'
        } else if (contextUri.includes('spotify:show:')) {
          // Both shows and audiobooks use spotify:show: URIs
          // Determine type based on the returned data structure
          if (mediaInfo.chapters && mediaInfo.total_chapters) {
            mediaType = 'audiobook'
          } else {
            mediaType = 'show'
          }
        }

        // Cache the new result (replacing the old one)
        this.mediaInfoCache = {
          ...mediaInfo,
          currentId: mediaId,
          mediaType,
        }

        // MED-7: cache-hit branch (line 645+) returns this.mediaInfoCache
        // which has currentId + mediaType, but the previous miss-branch
        // returned the raw mediaInfo without those fields. Callers that
        // checked `result.mediaType` saw different shapes depending on
        // whether the entry was already cached. Return the cache object
        // we just wrote so the shape is consistent across hits and misses.
        return this.mediaInfoCache
      }
    } catch (error) {
      console.warn('Failed to get media info for URI:', contextUri, error)
    }

    return null
  }
}
