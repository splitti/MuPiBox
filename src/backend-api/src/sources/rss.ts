import { Data, RssData } from 'src/models/data.model'
import { RssFeed, RssTextOrCdata } from 'src/models/rss.model'

import { RssMedia } from 'src/models/media.model'
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
const fillRssDataEntry = async (data: RssData): Promise<void> => {
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

/**
 * Adds cover image information to all rss data entries in {@link data}.
 *
 * @param data - The data entries which will be extended with cover image information.
 */
export const addRssImageInformation = async (data: Data[]): Promise<void> => {
  await Promise.allSettled(
    data.filter<RssData>((entry): entry is RssData => entry.type === 'rss').map((entry) => fillRssDataEntry(entry)),
  )
}

export const getRssMedia = async (data: RssData): Promise<RssMedia[] | undefined> => {
  const feed = await getRssFeed(data.id)
  return feed?.rss?.channel?.item?.map((item) => {
    // We replace https with https for now since mplayer is way slower
    // with https streams. We should fix this in the future.
    const rssUrl = (item.enclosure?._attributes?.url ?? '').replace('https://', 'http://')
    return {
      type: 'rss',
      name: handleCData(item?.title) ?? 'No title',
      img: item['itunes:image']?._attributes?.href ?? '',
      url: rssUrl,
      releaseDate: handleCData(item?.pubDate) ?? '',
      // We discard the channel title: handleCData(feed?.rss?.channel?.title) ?? ''
      // We do this since this folderName is shown on top on the player page and
      // we want to show the user-defined folder name there.
      folderName: data.artist,
      category: data.category,
      allowShuffle: false,
      shuffle: false,
    }
  })
}
