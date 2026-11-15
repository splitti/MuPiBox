// "next" and "previous" at a podcast, and its list of episodes in the player: the episodes of the podcast's tile in the
// order its list on the display has them - the parents' choice (episodePick, the older aPartOfAll), the entry's sorting
// (the newest first unless it says otherwise) and, without internet, only the episodes on the SD card. "next" is the
// one below in that list, "previous" the one above, as at an album. The player does not know the feed of an episode:
// the server finds the library entry whose cached feed has it (server.ts, podcastTileEpisodes).
import { isEpisodePick, pickEpisodes } from './episode-pick'
import { episodeKey } from './podcast-offline'

export interface NeighbourEpisode {
  url: string
  title: string
  artist: string
  /** a picture address of the box's own API ('' when the feed has none) */
  cover: string
  /** 0 = the first of the tile's list */
  position: number
  count: number
  /** at an end of the list: the episode itself again */
  same: boolean
}

/** What a podcast's library entry says about its episodes (data.json) */
export interface PodcastEntry {
  episodePick?: unknown
  sorting?: unknown
  aPartOfAll?: unknown
  aPartOfAllMin?: unknown
  aPartOfAllMax?: unknown
}

type Item = Record<string, unknown>

export interface Located {
  channel: Record<string, unknown> | undefined
  /** the tile's episodes, in the order of its list */
  order: Item[]
  /** the place of the episode in it; -1: not among them (another choice since it started) */
  at: number
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

const enclosure = (item: Item): string => {
  const url = (item.enclosure as { _attributes?: { url?: unknown } } | undefined)?._attributes?.url
  return typeof url === 'string' ? url : ''
}

/** The items of a cached feed (an object with rss.channel), only those with an audio file */
export function feedItems(feed: unknown): { channel: Record<string, unknown> | undefined; items: Item[] } {
  const channel = (feed as { rss?: { channel?: Record<string, unknown> } } | null)?.rss?.channel
  const raw = channel?.item
  return { channel, items: ((Array.isArray(raw) ? raw : raw ? [raw] : []) as Item[]).filter((item) => !!item && enclosure(item) !== '') }
}

/** Whether a feed has the episode (by what makes the file the same: no query, any scheme) */
export function feedHas(feed: unknown, url: string): boolean {
  const wanted = episodeKey(url)
  return feedItems(feed).items.some((item) => episodeKey(enclosure(item)) === wanted)
}

const dateOf = (item: Item): number => Date.parse(text(item.pubDate))

// The newest first by date; one without a date after all dated ones, in the feed's order (as the display's newestFirst)
function newestFirst(items: Item[]): Item[] {
  return items
    .map((item, index) => ({ item, at: Number.isFinite(dateOf(item)) ? dateOf(item) : -index - 1e15 }))
    .sort((a, b) => b.at - a.at)
    .map((entry) => entry.item)
}

// As the display sorts a podcast's list (medialist sortMedia): the entry's sorting, else the newest first
function sortLike(items: Item[], sorting: unknown): Item[] {
  const title = (item: Item) => text(item.title)
  if (sorting === 'AlphabeticalAscending' || sorting === 'AlphabeticalDescending') {
    const sign = sorting === 'AlphabeticalAscending' ? 1 : -1
    return [...items].sort((a, b) => sign * title(a).localeCompare(title(b), undefined, { numeric: true, sensitivity: 'base' }))
  }
  const byDate = newestFirst(items)
  if (sorting !== 'ReleaseDateAscending') return byDate
  // the oldest first; the ones without a date stay at the end
  const dated = byDate.filter((item) => Number.isFinite(dateOf(item)))
  return [...dated.reverse(), ...byDate.filter((item) => !Number.isFinite(dateOf(item)))]
}

/**
 * The episodes of a podcast's tile in the order of its list on the display. onCard: without internet the keys of the
 * episodes on the SD card (the display then lists only those - the chosen ones already, no choice is applied again).
 */
export function tileOrder(items: Item[], entry: PodcastEntry | undefined, onCard?: Set<string>): Item[] {
  let list = onCard ? items.filter((item) => onCard.has(episodeKey(enclosure(item)))) : items
  if (!onCard && isEpisodePick(entry?.episodePick)) {
    list = pickEpisodes(newestFirst(list), entry?.episodePick)
  } else if (entry?.aPartOfAll) {
    // (the older choice "episodes A to B", 1 = the first in the feed's own order, as the display slices it)
    const min = Math.max(0, (Number(entry.aPartOfAllMin) || 1) - 1)
    const max = Number(entry.aPartOfAllMax) || list.length
    list = list.slice(min, max)
  }
  return sortLike(list, entry?.sorting)
}

/** The episode in its feed, with the tile's choice and order (entry undefined: all of the feed, the newest first) */
export function locateIn(feed: unknown, url: string, entry?: PodcastEntry, onCard?: Set<string>): Located | null {
  if (!feedHas(feed, url)) return null
  const { channel, items } = feedItems(feed)
  const order = tileOrder(items, entry, onCard)
  const wanted = episodeKey(url)
  return { channel, order, at: order.findIndex((item) => episodeKey(enclosure(item)) === wanted) }
}

const coverOf = (item: Item, channel: Record<string, unknown> | undefined): string => {
  const picture = (item['itunes:image'] as { _attributes?: { href?: unknown } } | undefined)?._attributes?.href
  return proxied(typeof picture === 'string' && picture ? picture : text((channel?.image as { url?: unknown } | undefined)?.url))
}

/**
 * The episode `steps` places below (above, negative) the one that plays in the tile's list. At an end the last (first)
 * one; one that is not in the list goes to the first. Null when the list is empty.
 */
export function neighbourOf(found: Located, steps: number): NeighbourEpisode | null {
  const { channel, order, at } = found
  if (order.length === 0) return null
  const target = at < 0 ? 0 : Math.min(order.length - 1, Math.max(0, at + steps))
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

/**
 * The tile's episodes for the list in the player: at most `size` of them around the one that plays (a feed of thousands
 * would be thousands of rows on the display). current: the place of the episode in the whole list (-1: not in it),
 * offset: the place of the first row given.
 */
export function listOf(found: Located, size = 300): { artist: string; current: number; count: number; offset: number; episodes: EpisodeRow[] } {
  const { channel, order, at } = found
  const offset = order.length <= size ? 0 : Math.max(0, Math.min(order.length - size, (at < 0 ? 0 : at) - Math.floor(size / 2)))
  return {
    artist: text(channel?.title),
    current: at,
    count: order.length,
    offset,
    episodes: order.slice(offset, offset + size).map((item) => ({ url: enclosure(item), title: text(item.title) || 'Episode', seconds: secondsOf(text(item['itunes:duration'])) })),
  }
}
