import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { catchError, EMPTY, firstValueFrom, from, Observable, of } from 'rxjs'
import { map, scan, switchMap, take, takeLast, timeout } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { LogService } from './log.service'
import type { CategoryType, Media } from './media'
import { SpotifyConfig } from './spotify'
import { SpotifyPlayerService } from './spotify-player.service'
import { ExtraDataMedia, Utils } from './utils'

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  deviceName: string | undefined = undefined

  constructor(
    private http: HttpClient,
    private logService: LogService,
    private playerService: SpotifyPlayerService,
  ) {
    this.initializeSpotifyConfig()
  }

  // ============================================================================
  // Player Service Delegation (expose player observables and methods)
  // ============================================================================

  /** Player state observable */
  get playerState$() {
    return this.playerService.playerState$
  }

  /** Current track observable */
  get currentTrack$() {
    return this.playerService.currentTrack$
  }

  get trackChangeDetected$() {
    return this.playerService.trackChangeDetected$
  }

  /** Check if player is ready */
  isPlayerReady(): boolean {
    return this.playerService.isPlayerReady()
  }

  /** Check if we should use the web player */
  shouldUsePlayer(): boolean {
    return this.playerService.shouldUsePlayer()
  }

  /** Get the device ID */
  getDeviceId(): string | null {
    return this.playerService.getDeviceId()
  }

  /** Ensure player is ready for playback */
  async ensurePlayerReady(): Promise<boolean> {
    return this.playerService.ensurePlayerReady()
  }

  /** Get current state */
  async getCurrentState(): Promise<any> {
    return this.playerService.getCurrentState()
  }

  /** Create media from Spotify track */
  createMediaFromSpotifyTrack(track: any): Media {
    return this.playerService.createMediaFromSpotifyTrack(track)
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  private initializeSpotifyConfig(): void {
    const spotifyConfigUrl = `${environment.backend.apiUrl}/spotify/config`
    this.http
      .get<SpotifyConfig>(spotifyConfigUrl)
      .pipe(take(1))
      .subscribe({
        next: (spotifyConfig: SpotifyConfig) => {
          this.deviceName = spotifyConfig.deviceName
          this.playerService.initialize(spotifyConfig.deviceName)
        },
        error: (error) => {
          this.logService.error('Failed to get Spotify config:', error)
        },
      })
  }

  // ============================================================================
  // Pagination Helper
  // ============================================================================

  /**
   * Helper method to fetch all paginated results from the backend API using total count
   */
  private fetchAllPaginatedResults<T>(url: string, baseParams: any, pageSize = 5): Observable<T[]> {
    const fetchPage = (offset: number): Observable<{ items: T[]; total: number; limit: number; offset: number }> => {
      const params = { ...baseParams, limit: pageSize.toString(), offset: offset.toString() }
      return this.http.get<{ items: T[]; total: number; limit: number; offset: number }>(url, { params })
    }

    // First, get the total count and then fetch all pages
    return fetchPage(0).pipe(
      switchMap((firstPageResponse) => {
        const { items: firstPageItems, total } = firstPageResponse

        // If we have all results in the first page, return them
        if (firstPageItems.length >= total) {
          return of(firstPageItems)
        }

        // Calculate how many more pages we need
        const remainingItems = total - firstPageItems.length
        const additionalPagesNeeded = Math.ceil(remainingItems / pageSize)

        if (additionalPagesNeeded <= 0) {
          return of(firstPageItems)
        }

        // Create observables for additional pages
        const additionalPageObservables: Observable<T[]>[] = []
        for (let page = 1; page <= additionalPagesNeeded; page++) {
          const offset = page * pageSize
          additionalPageObservables.push(
            fetchPage(offset).pipe(
              map((response) => response.items),
              catchError((error) => {
                this.logService.warn(`Failed to fetch page at offset ${offset}:`, error?.message || error)
                return of([] as T[])
              }),
            ),
          )
        }

        // Combine first page with all additional pages
        return from(additionalPageObservables).pipe(
          switchMap((obs) => obs),
          scan((acc: T[], pageItems: T[]) => [...acc, ...pageItems], firstPageItems),
          takeLast(1),
        )
      }),
      catchError((error) => {
        this.logService.warn('Pagination fetch failed:', error?.message || error)
        return of([])
      }),
    )
  }

  // ============================================================================
  // Media Query Methods
  // ============================================================================

  getMediaByQuery(
    query: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const searchUrl = `${environment.backend.apiUrl}/spotify/search/albums`

    return this.fetchAllPaginatedResults<any>(searchUrl, { query }).pipe(
      map((albums: any[]) => {
        return albums.map((album) => {
          const media: Media = {
            id: album.id,
            artist: album.artists?.[0]?.name || 'Unknown Artist',
            title: album.name,
            cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
            release_date: album.release_date,
            type: 'spotify',
            category,
            index,
          }
          Utils.copyExtraMediaData(extraDataSource, media)
          return media
        })
      }),
      catchError((err) => {
        this.logService.warn(
          `Search query failed for "${query}" due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByArtistID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const artistAlbumsUrl = `${environment.backend.apiUrl}/spotify/artist/${id}/albums`
    const artistUrl = `${environment.backend.apiUrl}/spotify/artist/${id}`

    return this.http.get<any>(artistUrl).pipe(
      switchMap((artist) => {
        const artistcover = artist.images?.[0]?.url || '../assets/images/nocover_mupi.png'

        return this.fetchAllPaginatedResults<any>(artistAlbumsUrl, {}).pipe(
          map((albums) => {
            return albums.map((album) => {
              const media: Media = {
                id: album.id,
                artist: album.artists?.[0]?.name || 'Unknown Artist',
                title: album.name,
                cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
                artistcover: artistcover,
                release_date: album.release_date,
                type: 'spotify',
                category,
                index,
              }
              Utils.copyExtraMediaData(extraDataSource, media)
              return media
            })
          }),
        )
      }),
      catchError((err) => {
        this.logService.warn(
          `Artist albums query failed for artist ${id} due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByShowID(
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    const showUrl = `${environment.backend.apiUrl}/spotify/show/${id}`
    const showEpisodesUrl = `${environment.backend.apiUrl}/spotify/show/${id}/episodes`

    return this.http.get<any>(showUrl).pipe(
      switchMap((show) => {
        const showName = show.name || 'Unknown Show'
        const showcover = show.images?.[0]?.url || '../assets/images/nocover_mupi.png'

        return this.fetchAllPaginatedResults<any>(showEpisodesUrl, {}).pipe(
          map((episodes) => {
            return episodes
              .filter((episode) => episode != null)
              .map((episode) => {
                const media: Media = {
                  showid: episode.id,
                  artist: showName,
                  title: episode.name,
                  cover: episode.images?.[0]?.url || showcover,
                  artistcover: showcover,
                  type: 'spotify',
                  category,
                  release_date: episode.release_date,
                  index,
                }
                Utils.copyExtraMediaData(extraDataSource, media)
                return media
              })
          }),
        )
      }),
      catchError((err) => {
        this.logService.warn(
          `Show episodes query failed for show ${id} due to API error, returning empty results:`,
          err?.message || err,
        )
        return of([])
      }),
    )
  }

  getMediaByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const albumUrl = `${environment.backend.apiUrl}/spotify/album/${id}`

    return this.http.get<any>(albumUrl).pipe(
      map((album) => {
        const media: Media = {
          id: album.id,
          artist: album.artists?.[0]?.name || 'Unknown Artist',
          title: album.name,
          cover: album.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          release_date: album.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Album info query failed for album ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getAudiobookByID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const audiobookUrl = `${environment.backend.apiUrl}/spotify/audiobook/${id}`

    return this.http.get<any>(audiobookUrl).pipe(
      map((audiobook) => {
        const media: Media = {
          audiobookid: audiobook.id,
          artist: audiobook.authors?.[0]?.name || 'Unknown Author',
          title: audiobook.name,
          cover: audiobook.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Audiobook info query failed for audiobook ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getMediaByEpisode(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    const episodeUrl = `${environment.backend.apiUrl}/spotify/episode/${id}`

    return this.http.get<any>(episodeUrl).pipe(
      map((episode) => {
        const media: Media = {
          showid: episode.id,
          artist: episode.show?.[0]?.name || 'Unknown Show',
          title: episode.name,
          cover: episode.images?.[0]?.url || '../assets/images/nocover_mupi.png',
          type: 'spotify',
          release_date: episode.release_date,
          category,
          index,
        }
        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
      catchError((err) => {
        this.logService.warn(
          `Episode info query failed for episode ${id} due to API error, skipping this item:`,
          err?.message || err,
        )
        // Skip failed items entirely
        return EMPTY
      }),
    )
  }

  getMediaByPlaylistID(
    id: string,
    category: CategoryType,
    index: number,
    shuffle: boolean,
    artistcover: string,
    resumespotifyduration_ms: number,
    resumespotifyprogress_ms: number,
    resumespotifytrack_number: number,
  ): Observable<Media> {
    // Unified endpoint handles API + Scraper fallback automatically in backend
    const playlistUrl = `${environment.backend.apiUrl}/spotify/playlist/${id}`

    return this.http.get<any>(playlistUrl).pipe(
      timeout(60000), // 60 seconds (for scraper fallback if needed)
      catchError((err) => {
        this.logService.error(`Failed to fetch playlist ${id}:`, err?.message || err)
        return EMPTY
      }),
      map((response: any) => {
        // Check if response is from backend scraper (has different structure)
        const isFromBackend = response.playlist && response.tracks

        const media: Media = {
          playlistid: isFromBackend ? id : response.id,
          title: isFromBackend ? response.playlist.name : response.name,
          cover: isFromBackend ? response.playlist.images?.[0]?.url : response?.images?.[0]?.url,
          type: 'spotify',
          category,
          index,
        }

        if (resumespotifyduration_ms) {
          media.resumespotifyduration_ms = resumespotifyduration_ms
        }
        if (resumespotifyprogress_ms) {
          media.resumespotifyprogress_ms = resumespotifyprogress_ms
        }
        if (resumespotifytrack_number) {
          media.resumespotifytrack_number = resumespotifytrack_number
        }
        if (artistcover) {
          media.artistcover = artistcover
        }
        if (shuffle) {
          media.shuffle = shuffle
        }
        return media
      }),
    )
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validateSpotify(spotifyId: string, spotifyCategory: string): Promise<boolean> {
    try {
      const validationUrl = `${environment.backend.apiUrl}/spotify/validate`
      const data = await firstValueFrom(
        this.http
          .post<any>(validationUrl, {
            id: spotifyId,
            type: spotifyCategory,
          })
          .pipe(timeout(30000)),
      )

      return data.valid || false
    } catch (err) {
      this.logService.warn(`Validation failed for ${spotifyCategory} ${spotifyId}:`, err)
      return false
    }
  }

  // ============================================================================
  // Media Info Methods
  // ============================================================================

  /**
   * Get album information including total tracks and track data
   */
  getAlbumInfo(albumId: string): Observable<{ total_tracks: number; album_name: string; tracks?: any[] }> {
    const albumUrl = `${environment.backend.apiUrl}/spotify/album/${albumId}`

    return this.http.get<any>(albumUrl).pipe(
      map((album) => ({
        total_tracks: album.total_tracks,
        album_name: album.name,
        tracks: album.tracks.items.map((track: any) => ({
          id: track.id,
          uri: track.uri,
          name: track.name,
          track_number: track.track_number,
        })),
      })),
      catchError((error) => {
        this.logService.error('Error getting album info:', error)
        return of({ total_tracks: 0, album_name: '', tracks: [] })
      }),
    )
  }

  /**
   * Get playlist information including total tracks and track data
   */
  getPlaylistInfo(playlistId: string): Observable<{ total_tracks: number; playlist_name: string; tracks?: any[] }> {
    // Unified endpoint handles API + Scraper fallback automatically in backend
    const playlistUrl = `${environment.backend.apiUrl}/spotify/playlist/${playlistId}?refresh=true`

    return this.http.get<any>(playlistUrl).pipe(
      timeout(60000), // 60 seconds (for scraper fallback if needed)
      switchMap((response) => {
        // Check if response is from backend scraper (has different structure)
        const isFromBackend = response.playlist && response.tracks

        if (isFromBackend) {
          // Scraper format - tracks are directly in array with full data
          return of({
            total_tracks: response.tracks.length,
            playlist_name: response.playlist.name,
            tracks: response.tracks.map((track: any) => ({
              id: track.id,
              uri: track.uri,
              name: track.name,
            })),
          })
        } else {
          return of({
            total_tracks: response.tracks.total,
            playlist_name: response.name,
            tracks: response.tracks.items.map((item: any) => ({
              id: item.track.id,
              uri: item.track.uri,
              name: item.track.name,
            })),
          })
        }
      }),
      catchError((error) => {
        this.logService.error('Failed to fetch playlist info:', error)
        return of({ total_tracks: 0, playlist_name: '', tracks: [] })
      }),
    )
  }

  /**
   * Get show information including total episodes and episode data
   */
  getShowInfo(showId: string): Observable<{ total_episodes: number; show_name: string; episodes?: any[] }> {
    const showUrl = `${environment.backend.apiUrl}/spotify/show/${showId}`
    const showEpisodesUrl = `${environment.backend.apiUrl}/spotify/show/${showId}/episodes`

    return this.http.get<any>(showUrl).pipe(
      switchMap((show) => {
        // Get all episodes for position calculation
        return this.http.get<any[]>(showEpisodesUrl).pipe(
          map((episodesData) => ({
            total_episodes: show.total_episodes,
            show_name: show.name,
            episodes: episodesData.map((episode: any) => ({
              id: episode.id,
              uri: episode.uri || `spotify:episode:${episode.id}`,
              name: episode.name,
            })),
          })),
        )
      }),
      catchError((error) => {
        this.logService.error('Error getting show info:', error)
        return of({ total_episodes: 0, show_name: '', episodes: [] })
      }),
    )
  }

  /**
   * Get audiobook information including total chapters and chapter data
   */
  getAudiobookInfo(
    audiobookId: string,
  ): Observable<{ total_chapters: number; audiobook_name: string; chapters?: any[] }> {
    const audiobookUrl = `${environment.backend.apiUrl}/spotify/audiobook/${audiobookId}`

    return this.http.get<any>(audiobookUrl).pipe(
      map((audiobook) => ({
        total_chapters: audiobook.chapters?.total || 0,
        audiobook_name: audiobook.name,
        chapters:
          audiobook.chapters?.items?.map((chapter: any) => ({
            id: chapter.id,
            uri: chapter.uri,
            name: chapter.name,
          })) || [],
      })),
      catchError((error) => {
        this.logService.error('Error getting audiobook info:', error)
        return of({ total_chapters: 0, audiobook_name: '', chapters: [] })
      }),
    )
  }
}
