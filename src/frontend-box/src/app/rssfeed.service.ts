import { map, mergeAll, toArray } from 'rxjs/operators'
import type { CategoryType, Media } from './media'
import { ExtraDataMedia, Utils } from './utils'

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { Observable } from 'rxjs'
import type { RssFeed } from './rssfeed'

@Injectable({
  providedIn: 'root',
})
export class RssFeedService {
  jsonRSS: RssFeed
  url: string

  constructor(private http: HttpClient) {}

  getRssFeed(
    ip: string,
    id: string,
    category: CategoryType,
    index: number,
    extraDataSource: ExtraDataMedia,
  ): Observable<Media[]> {
    this.url = `http://${ip}:8200/api/rssfeed?url=${id}`
    return this.http.get(this.url /*, { responseType: 'text' }*/).pipe(
      //switchMap(async (xml) => await this.parseXmlToJsonRss(xml)),
      map((response: RssFeed) => {
        return response.rss.channel.item.map((item) => {
          const media: Media = {
            id: item.enclosure?._attributes?.url,
            artist: response.rss?.channel?.title._text,
            title: item?.title._text,
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
}
