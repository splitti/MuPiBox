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
    return this.http.get(this.url).pipe(
      map((response: RssFeed) => {
        return response.rss.channel.item.map((item) => {
          console.log(item)
          const media: Media = {
            id: item.enclosure?._attributes?.url,
            artist: this.handleCData(response.rss?.channel?.title),
            title: this.handleCData(item?.title),
            cover: item['itunes:image']?._attributes?.href,
            artistcover: this.handleCData(response.rss?.channel?.image?.url),
            release_date: this.handleCData(item?.pubDate),
            duration: this.handleCData(item?.['itunes:duration']),
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
