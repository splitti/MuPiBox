// "next" and "previous" at a podcast, and its list of episodes in the player: as with an album the list runs from the first to the last,
// and a podcast's list has the newest episode first - "next" goes on to an older episode, "previous" back to a newer one. The player does
// not know the feed of an episode, so the feeds the box has cached are searched for it (as /api/rssfeed/episode-duration does for a length).
import { episodeKey } from './podcast-offline'

export interface NeighbourEpisode {
  url: string
  title: string
  artist: string
  /** a picture address of the box's own API ('' when the feed has none) */
  cover: string
  /** 0 = the newest of the feed */
  position: number
  count: number
  /** at the end of the feed (the newest for "newer", the oldest for "older"): the episode itself again */
  same: boolean
}

const text = (value: unknown): string => {
  if (typeof value === 'string') return value
  const node = value as { _text?: unknown; _cdata?: unknown } | undefined
  return typeof node?._cdata === 'string' ? node._cdata : typeof node?._text === 'string' ? node._text : ''
}

const proxied = (picture: string): string =>
  !picture
    ? ''
    : picture.startsWith('/rss-covers/')
      ? `/api/rssfeed/image?local=${encodeURIComponent(picture.slice('/rss-covers/'.length))}&w=400`
      : `/api/rssfeed/image?url=${encodeURIComponent(picture)}&w=400`

type Item = Record<string, unknown>

const enclosure = (item: Item): string => {
  const url = (item.enclosure as { _attributes?: { url?: unknown } } | undefined)?._attributes?.url
  return typeof url === 'string' ? url : ''
}

interface Located {
  channel: Record<string, unknown> | undefined
  /** newest first */
  order: Item[]
  at: number
}

// The feed that has the episode: its episodes ordered newest first by their date (a feed without dates: its own order, which has the
// newest first, as the app lists them) and the place of the episode in them.
function locate(feeds: Iterable<unknown>, url: string): Located | null {
  const wanted = episodeKey(url)
  for (const feed of feeds) {
    const channel = (feed as { rss?: { channel?: Record<string, unknown> } } | null)?.rss?.channel
    const raw = channel?.item
    const items = ((Array.isArray(raw) ? raw : raw ? [raw] : []) as Item[]).filter((item) => enclosure(item) !== '')
    const order = items
      .map((item, index) => {
        const when = Date.parse(text(item.pubDate))
        return { item, at: Number.isFinite(when) ? when : -index }
      })
      .sort((a, b) => b.at - a.at)
      .map((entry) => entry.item)
    const at = order.findIndex((item) => episodeKey(enclosure(item)) === wanted)
    if (at >= 0) return { channel, order, at }
  }
  return null
}

const coverOf = (item: Item, channel: Record<string, unknown> | undefined): string => {
  const picture = (item['itunes:image'] as { _attributes?: { href?: unknown } } | undefined)?._attributes?.href
  return proxied(typeof picture === 'string' && picture ? picture : text((channel?.image as { url?: unknown } | undefined)?.url))
}

/**
 * The episode next to the one `url` names: `newer` or `older`. `feeds`: bodies of /api/rssfeed/cached (or the files behind it). Null when
 * no feed has the episode.
 */
export function neighbourEpisode(feeds: Iterable<unknown>, url: string, direction: 'newer' | 'older'): NeighbourEpisode | null {
  const found = locate(feeds, url)
  if (!found) return null
  const { channel, order, at } = found
  const target = Math.min(order.length - 1, Math.max(0, direction === 'newer' ? at - 1 : at + 1))
  const item = order[target]
  return { url: enclosure(item), title: text(item.title) || 'Episode', artist: text(channel?.title), cover: coverOf(item, channel), position: target, count: order.length, same: target === at }
}

export interface EpisodeRow {
  url: string
  title: string
  /** length in seconds, 0 when the feed says none */
  seconds: number
}

const secondsOf = (value: string): number => {
  const parts = value.trim().split(':').map(Number)
  return parts.length > 0 && parts.length <= 3 && parts.every((n) => Number.isFinite(n) && n >= 0) ? parts.reduce((sum, n) => sum * 60 + n, 0) : 0
}

/** The episodes of the feed that has the episode `url`, newest first, for the list in the player; `current` is the place of `url`. */
export function episodeList(feeds: Iterable<unknown>, url: string): { artist: string; current: number; episodes: EpisodeRow[] } | null {
  const found = locate(feeds, url)
  if (!found) return null
  return {
    artist: text(found.channel?.title),
    current: found.at,
    episodes: found.order.map((item) => ({ url: enclosure(item), title: text(item.title) || 'Episode', seconds: secondsOf(text(item['itunes:duration'])) })),
  }
}
