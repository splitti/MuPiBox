import { RssFeed, RssTextOrCdata } from 'src/models/rss.model'

import { RssData } from 'src/models/data.model'
import ky from 'ky'
import xmlparser from 'xml-js'

/**
 * TODO
 * @param text
 * @returns
 */
const handleCData = (text?: RssTextOrCdata): string | undefined => {
  if (text === undefined) {
    return undefined
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
  return undefined
}

/**
 * TODO
 * @param url
 * @returns
 */
const getRssFeed = async (url: string): Promise<RssFeed | undefined> => {
  try {
    const response = await ky.get(url).text()
    return JSON.parse(xmlparser.xml2json(response, { compact: true, nativeType: true })) as RssFeed
  } catch {
    return undefined
  }
}

/**
 * TODO
 * @param data
 * @returns
 */
export const fillRssDataEntry = async (data: RssData): Promise<void> => {
  if (data.artistcover !== undefined) {
    return
  }
  const feed = await getRssFeed(data.id)
  if (feed === undefined) {
    return
  }
  // Else get the first entry with an image and set this as artist image.
  let imageUrl = handleCData(feed.rss?.channel?.image?.url)
  // If there is no artist cover, get the first item cover as artist cover.
  if (imageUrl === undefined) {
    const images = feed.rss?.channel?.item
      ?.map((item) => item['itunes:image']?._attributes?.href)
      .filter((image) => image !== undefined)
    if (images !== undefined && images?.length > 0) {
      imageUrl = images[0]
    }
  }
  data.artistcover = imageUrl
}

// export const getRssFeed = (id: string, category: CategoryType, index: number, extraDataSource: ExtraDataMedia): Observable<Media[]> {
//     this.url = `${environment.backend.apiUrl}/rssfeed?url=${id}`
//     return this.http.get(this.url).pipe(
//       map((response: RssFeed) => {
//         return response.rss.channel.item.map((item) => {
//           console.log(item)
//           const media: Media = {
//             id: item.enclosure?._attributes?.url,
//             artist: this.handleCData(response.rss?.channel?.title),
//             title: this.handleCData(item?.title),
//             cover: item['itunes:image']?._attributes?.href,
//             artistcover: this.handleCData(response.rss?.channel?.image?.url),
//             release_date: this.handleCData(item?.pubDate),
//             duration: this.handleCData(item?.['itunes:duration']),
//             type: 'rss',
//             category,
//             index,
//           }
//           Utils.copyExtraMediaData(extraDataSource, media)
//           return media
//         })
//       }),
//       mergeAll(),
//       toArray(),
//     )
//   }
