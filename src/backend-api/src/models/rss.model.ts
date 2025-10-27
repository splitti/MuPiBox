export type RssTextOrCdata = { _text: string } | { _cdata: string }

export interface RssFeed {
  rss?: {
    channel?: {
      title?: RssTextOrCdata
      image?: {
        url?: RssTextOrCdata
      }
      item?: Item[]
    }
  }
}

export interface Item {
  title?: RssTextOrCdata
  link?: RssTextOrCdata
  pubDate?: RssTextOrCdata
  enclosure?: {
    _attributes?: {
      url?: string
      length?: number
    }
  }
  'itunes:duration'?: {
    _text: string
  }
  'itunes:image'?: {
    _attributes?: {
      href?: string
    }
  }
}
