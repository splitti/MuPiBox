import { map, mergeAll, toArray } from 'rxjs/operators'
import type { CategoryType, Media } from './media'
import { ExtraDataMedia, Utils } from './utils'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { Observable } from 'rxjs'
import { environment } from 'src/environments/environment'
import type { RssFeed } from './rssfeed'

@Injectable({
  providedIn: 'root',
})
export class RssFeedService {
  jsonRSS: RssFeed
  url: string

  constructor(private http: HttpClient) {}

  getRssFeed(id: string, category: CategoryType, index: number, extraDataSource: ExtraDataMedia): Observable<Media[]> {
    this.url = `${environment.backend.apiUrl}/rssfeed?url=${id}`
    return this.http.get(this.url /*, { responseType: 'text' }*/).pipe(
      map((response: RssFeed) => {
        return response.rss.channel.item.map((item) => {
          const media: Media = {
            id: item.enclosure?._attributes?.url,
            artist: response.rss?.channel?.title._text,
            title: this.extractTitle(item?.title._text), // Verwende extractTitle auf dem Titel
            cover: item['itunes:image']?._attributes?.href,
            artistcover: response.rss?.channel?.image?.url._text,
            release_date: item?.pubDate._text,
            duration: item?.['itunes:duration']._text,
            type: 'rss',
            category,
            index,
          }
          Utils.copyExtraMediaData(extraDataSource, media)
          return media
        })
      }),
      mergeAll(),
      toArray(),
    )
  }

  extractTitle(text: string): string {
    const cdataMatch = text.match(/<!\[CDATA\[(.*?)\]\]>/)
    return cdataMatch ? cdataMatch[1] : text // CDATA-Inhalt oder unveränderten Text zurückgeben
  }
}
