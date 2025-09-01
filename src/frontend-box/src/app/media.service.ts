import { Observable, Subject, from, iif, interval, of, timer, firstValueFrom } from 'rxjs'
import { distinctUntilChanged, filter, map, mergeAll, mergeMap, shareReplay, switchMap, toArray } from 'rxjs/operators'
import type { CategoryType, Media, MediaInfoCache } from './media'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { environment } from '../environments/environment'
import type { AlbumStop } from './albumstop'
import type { Artist } from './artist'
import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
import { Mupihat } from './mupihat'
import type { Network } from './network'
import { RssFeedService } from './rssfeed.service'
import { SpotifyService } from './spotify.service'
import type { WLAN } from './wlan'

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  response = ''
  public readonly current$: Observable<CurrentSpotify>
  public readonly local$: Observable<CurrentMPlayer>
  public readonly network$: Observable<Network>
  public readonly albumStop$: Observable<AlbumStop>
  public readonly mupihat$: Observable<Mupihat>

  private wlanSubject = new Subject<WLAN[]>()
  
  // Cache for album/playlist/show information (refreshes when switching media)
  private mediaInfoCache: MediaInfoCache = {}

  constructor(
    private http: HttpClient,
    private spotifyService: SpotifyService,
    private rssFeedService: RssFeedService,
  ) {
    // Provide network observable to SpotifyService for retry logic
    this.spotifyService.setNetworkObservable(this.network$)
    // Prepare subscriptions.
    // shareReplay replays the most recent (bufferSize) emission on each subscription
    // Keep the buffered emission(s) (refCount) even after everyone unsubscribes. Can cause memory leaks.
    // Hybrid approach: Poll Web Playback SDK state for localhost, HTTP polling for remote
    this.current$ = this.spotifyService.shouldUsePlayer()
      ? // Local: Poll Web Playback SDK state every second for accurate position
        interval(1000).pipe(
          switchMap(() => {
            if (this.spotifyService.isPlayerReady()) {
              return this.spotifyService.getCurrentState().then(async state => {
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
                    const currentTrackIndex = mediaInfo.tracks.findIndex((track: any) => 
                      track.id === currentTrack.id || track.uri === currentTrack.uri
                    )
                    if (currentTrackIndex !== -1) {
                      trackPosition = currentTrackIndex + 1
                    }
                  } else if (contextUri.includes('spotify:playlist:') && mediaInfo && mediaInfo.tracks) {
                    const currentTrackIndex = mediaInfo.tracks.findIndex((track: any) => 
                      track.id === currentTrack.id || track.uri === currentTrack.uri
                    )
                    if (currentTrackIndex !== -1) {
                      trackPosition = currentTrackIndex + 1
                    }
                  } else if (contextUri.includes('spotify:show:')) {
                    // Both shows and audiobooks use spotify:show: URIs
                    if (mediaInfo && mediaInfo.episodes) {
                      // This is a podcast show
                      const currentEpisodeIndex = mediaInfo.episodes.findIndex((episode: any) => 
                        episode.id === currentTrack.id || episode.uri === currentTrack.uri
                      )
                      if (currentEpisodeIndex !== -1) {
                        trackPosition = currentEpisodeIndex + 1
                      }
                    } else if (mediaInfo && mediaInfo.chapters) {
                      // This is an audiobook (treated as show with chapters)
                      const currentChapterIndex = mediaInfo.chapters.findIndex((chapter: any) => 
                        chapter.id === currentTrack.id || chapter.uri === currentTrack.uri
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
                    track_number: ['album', 'playlist', 'show'].includes(contextType) ? trackPosition : (currentTrack.track_number || 1),
                    album: currentTrack.album,
                    ...(mediaInfo && {
                      album: {
                        ...currentTrack.album,
                        name: this.getMediaName(mediaInfo) || currentTrack.album?.name,
                        total_tracks: mediaInfo.total_tracks
                      },
                      show: {
                        name: mediaInfo.show_name,
                        total_episodes: mediaInfo.total_episodes
                      }
                    })
                  },
                  ...(contextType === 'playlist' && mediaInfo && {
                    playlist: {
                      name: mediaInfo.playlist_name,
                      total_tracks: mediaInfo.total_tracks,
                      current_track_position: trackPosition
                    }
                  }),
                  ...(contextType === 'show' && mediaInfo && mediaInfo.episodes && {
                    show_details: {
                      name: mediaInfo.show_name,
                      total_episodes: mediaInfo.total_episodes,
                      current_episode_position: trackPosition
                    }
                  }),
                  ...(contextType === 'show' && mediaInfo && mediaInfo.chapters && {
                    audiobook: {
                      name: mediaInfo.audiobook_name,
                      total_chapters: mediaInfo.total_chapters,
                      current_chapter_position: trackPosition
                    }
                  })
                } as CurrentSpotify
              }).catch(() => ({} as CurrentSpotify))
            } else {
              return of({} as CurrentSpotify)
            }
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        )
      : // Remote: HTTP polling
        interval(10000).pipe(
          switchMap((): Observable<CurrentSpotify> => this.http.get<CurrentSpotify>(`${this.getPlayerBackendUrl()}/state`)),
          shareReplay({ bufferSize: 1, refCount: false }),
        )
    this.local$ = interval(1000).pipe(
      switchMap((): Observable<CurrentMPlayer> => this.http.get<CurrentMPlayer>(`${this.getPlayerBackendUrl()}/local`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )


    // 5 seconds is enough for wifi update and showing/hiding media.
    // Use timer so the first request is after 300ms.
    this.network$ = timer(300, 5000).pipe(
      switchMap((): Observable<Network> => this.http.get<Network>(`${this.getApiBackendUrl()}/network`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.albumStop$ = interval(1000).pipe(
      switchMap((): Observable<AlbumStop> => this.http.get<AlbumStop>(`${this.getApiBackendUrl()}/albumstop`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    // Every 2 seconds should be enough for timely charging update.
    this.mupihat$ = interval(2000).pipe(
      switchMap((): Observable<Mupihat> => this.http.get<Mupihat>(`${this.getApiBackendUrl()}/mupihat`)),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
  }

  // --------------------------------------------
  // Handling of RAW media entries from data.json
  // --------------------------------------------

  public isOnline(): Observable<boolean> {
    return this.network$.pipe(
      filter((network) => network.ip !== undefined),
      map((network) => network.onlinestate === 'online'),
      distinctUntilChanged(),
    )
  }

  public fetchRawMedia(): Observable<Media[]> {
    return this.http.get<Media[]>(`${this.getApiBackendUrl()}/data`)
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

  editRawResumeAtIndex(index: number, data: Media) {
    const url = `${this.getApiBackendUrl()}/editresume`
    const body = {
      index,
      data,
    }

    this.http.post(url, body, { responseType: 'text' }).subscribe((response) => {
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

    this.http.post(url, wlan, { responseType: 'text' }).subscribe((response) => {
      //this.response = response;
      this.updateWLAN()
    })
  }

  // Collect albums from a given artist in the current category
  public fetchMediaFromArtist(artist: Artist, category: CategoryType): Observable<Media[]> {
    return this.fetchMedia(category).pipe(
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

  public fetchArtistData(category: CategoryType): Observable<Artist[]> {
    return this.fetchMedia(category).pipe(
      map((media: Media[]) => {
        // Create temporary object with artists as keys and albumCounts as values
        const mediaCounts = media.reduce((tempCounts, currentMedia) => {
          tempCounts[currentMedia.artist] = (tempCounts[currentMedia.artist] || 0) + 1
          return tempCounts
        }, {})

        // Create temporary object with artists as keys and covers (first media cover) as values
        const covers = media
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce((tempCovers, currentMedia) => {
            if (/* currentMedia.type === 'library' &&  */ currentMedia.artistcover) {
              if (!tempCovers[currentMedia.artist]) {
                tempCovers[currentMedia.artist] = currentMedia.artistcover
              }
            } else {
              if (!tempCovers[currentMedia.artist]) {
                tempCovers[currentMedia.artist] = currentMedia.cover
              }
            }
            return tempCovers
          }, {})

        // Create temporary object with artists as keys and first media as values
        const coverMedia = media
          .sort((a, b) => (a.title <= b.title ? -1 : 1))
          .reduce((tempMedia, currentMedia) => {
            if (!tempMedia[currentMedia.artist]) {
              tempMedia[currentMedia.artist] = currentMedia
            }
            return tempMedia
          }, {})

        // Build Array of Artist objects sorted by Artist name
        const artists: Artist[] = Object.keys(mediaCounts)
          .sort()
          .map((currentName) => {
            const artist: Artist = {
              name: currentName,
              albumCount: mediaCounts[currentName],
              cover: covers[currentName],
              coverMedia: coverMedia[currentName],
            }
            return artist
          })

        return artists
      }),
    )
  }

  public fetchActiveResumeData(): Observable<Media[]> {
    // Category is irrelevant if 'resume' is set to true.
    return this.updateMedia(`${this.getApiBackendUrl()}/activeresume`, true, 'resume').pipe(
      map((media: Media[]) => {
        return media.reverse()
      }),
    )
  }

  private fetchMedia(category: CategoryType): Observable<Media[]> {
    return this.updateMedia(`${this.getApiBackendUrl()}/data`, false, category)
  }

  // Get the media data for the current category from the server
  private updateMedia(url: string, resume: boolean, category: CategoryType): Observable<Media[]> {
    // Custom rxjs pipe to override artist.
    const overwriteArtist =
      (item: Media) =>
      (source$: Observable<Media[]>): Observable<Media[]> => {
        return source$.pipe(
          // If the user entered an user-defined artist name in addition to a query,
          // overwrite orignal artist from spotify.
          map((items) => {
            if (item.artist?.length > 0) {
              for (const currentItem of items) {
                currentItem.artist = item.artist
              }
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
        }
        return items.filter((item) => item.category === category)
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
                () => !!(item.showid && item.showid.length > 0 && item.category !== 'resume'),
                this.spotifyService
                  .getMediaByShowID(item.showid, item.category, item.index, item)
                  .pipe(overwriteArtist(item)),
                iif(
                  // Get media by show supporting resume
                  () => !!(item.showid && item.showid.length > 0 && item.category === 'resume'),
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
                      // Get media by rss feed
                      () => !!(item.type === 'rss' && item.id.length > 0 && item.category !== 'resume'),
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
      mergeMap((items) => from(items)), // seperate arrays to single observables
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
        mediaInfo = await firstValueFrom(
          this.spotifyService.getAlbumInfo(mediaId)
        )
      } else if (contextUri.includes('spotify:playlist:')) {
        mediaId = contextUri.split('spotify:playlist:')[1]
        mediaInfo = await firstValueFrom(
          this.spotifyService.getPlaylistInfo(mediaId)
        )
      } else if (contextUri.includes('spotify:show:')) {
        mediaId = contextUri.split('spotify:show:')[1]
        // Both shows and audiobooks use spotify:show: URIs
        // Try audiobook endpoint first (more specific, will fail for podcast shows)
        try {
          mediaInfo = await firstValueFrom(
            this.spotifyService.getAudiobookInfo(mediaId)
          )
        } catch {
          // Fallback to show API (more general, works for both shows and audiobooks)
          try {
            mediaInfo = await firstValueFrom(
              this.spotifyService.getShowInfo(mediaId)
            )
          } catch {
            console.warn('Failed to get info for show/audiobook:', mediaId)
          }
        }
      }

      if (mediaInfo && mediaId) {
        // Check if we have cached data for the same media ID
        if (this.mediaInfoCache.currentId === mediaId) {
          return this.mediaInfoCache
        }
        
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
          mediaType
        }
        
        return mediaInfo
      }
    } catch (error) {
      console.warn('Failed to get media info for URI:', contextUri, error)
    }

    return null
  }
}
