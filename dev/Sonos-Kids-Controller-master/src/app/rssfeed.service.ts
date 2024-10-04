import type { Observable } from 'rxjs'
import { map, mergeAll, toArray } from 'rxjs/operators'
import { type ExtraDataMedia, Utils } from './utils'

import type { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import type { Media } from './media'
//import { xml2json } from 'xml-js';
import type { RssFeed } from './rssfeed'

declare const require: any
const xml2js = require('xml2js')

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
    category: string,
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
