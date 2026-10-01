import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { type Observable, of } from 'rxjs'
import { catchError, map, mergeAll, toArray } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { newestFirst, pickEpisodes } from './episode-pick'
import type { CategoryType, Media } from './media'
import type { RssFeed } from './rssfeed'
import { ExtraDataMedia, Utils } from './utils'

@Injectable({
  providedIn: 'root',
})
export class RssFeedService {
  jsonRSS: RssFeed
  url: string

  constructor(private http: HttpClient) {}

  getRssFeed(id: string, category: CategoryType, index: number, extraDataSource: ExtraDataMedia): Observable<Media[]> {
    // (encoded: a feed address with its own query - "?api_key=…&podcast_id=5" - lost everything from the "&" on)
    this.url = `${environment.backend.apiUrl}/rssfeed/cached?url=${encodeURIComponent(id)}`
    return this.http.get(this.url).pipe(
      map((response: RssFeed) => {
        return response.rss.channel.item.map((item) => {
          // LOW-7: removed `console.log(item)` — fired once per feed item
          // on every load, polluting chrome_debug.log (which we already
          // ship via debug.php for support tickets) with hundreds of lines
          // of raw RSS data per feed. Useful for one-off debugging, not
          // for production.
          const media: Media = {
            id: item.enclosure?._attributes?.url,
            artist: this.handleCData(response.rss?.channel?.title),
            title: this.handleCData(item?.title),
            cover: this.proxyCoverUrl(item['itunes:image']?._attributes?.href),
            artistcover: this.proxyCoverUrl(this.handleCData(response.rss?.channel?.image?.url)),
            release_date: this.handleCData(item?.pubDate),
            duration: this.handleCData(item?.['itunes:duration']),
            type: 'rss',
            category,
            index,
            episodeNew: item._new === true,
            episodeProgress: typeof item._pct === 'number' ? item._pct : undefined,
            episodeDone: item._done === true,
            ...(response.rss?._offline === true ? { offlineView: true } : {}),
          }
          Utils.copyExtraMediaData(extraDataSource, media)
          return media
        })
      }),
      mergeAll(),
      toArray(),
      // (with a choice of episodes only a chosen one is "new" - the tile's dot is not for one the box does not show)
      map((episodes) => {
        if (!extraDataSource?.episodePick || episodes.some((e) => e.offlineView)) return episodes
        const chosen = new Set(pickEpisodes(newestFirst(episodes), extraDataSource.episodePick))
        for (const e of episodes) if (!chosen.has(e)) e.episodeNew = false
        return episodes
      }),
      // LOW-7: previously a feed-fetch error rejected the observable, so
      // upstream callers got an error and the medialist crashed. Return
      // an empty array on error so the page just shows "no episodes" and
      // the user can navigate away cleanly.
      catchError(() => of([] as Media[])),
    )
  }

  /**
   * Routes a remote cover image URL through the backend's on-demand cache/proxy so
   * it's only ever downloaded once (per-episode covers can number in the hundreds
   * for long-running podcasts). Leaves already-local paths (rewritten server-side
   * for the channel cover) untouched.
   */
  private proxyCoverUrl(url?: string): string | undefined {
    if (!url || url === 'No title') {
      return undefined
    }
    // Covers are asked for as small thumbnails (episode pictures are often 2 MB).
    if (url.startsWith('/rss-covers/')) {
      return `${environment.backend.apiUrl}/rssfeed/image?local=${encodeURIComponent(url.slice('/rss-covers/'.length))}&w=400`
    }
    return `${environment.backend.apiUrl}/rssfeed/image?url=${encodeURIComponent(url)}&w=400`
  }

  private handleCData(text?: { _text: string } | { _cdata: string }): string {
    if (text === undefined) {
      return 'No title'
    }
    if (typeof text === 'string') {
      return text
    }
    // If it is normal text stuff, the element has a _text property.
    if (typeof text === 'object' && '_text' in text) {
      return text._text
    }
    // It might be a cdata-type stuff. In that case,
    // xml-js returns an object with a cdata tag, see
    // https://www.npmjs.com/package/xml-js#sample-conversions
    if (typeof text === 'object' && '_cdata' in text) {
      return text._cdata
    }
    return 'No title'
  }
}
