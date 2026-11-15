// "next" and "previous" at a podcast: the episodes of its tile as the display lists them - the parents' choice, the
// entry's sorting, the SD card without internet - and what happens at the ends.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listOf, locateIn, neighbourOf, tileOrder, type PodcastEntry } from './episode-neighbour'
import { episodeKey } from './podcast-offline'

const episode = (n: number, day: number | null) => ({
  title: { _cdata: `Folge ${n}` },
  ...(day === null ? {} : { pubDate: `Mon, ${String(day).padStart(2, '0')} Jan 2026 10:00:00 GMT` }),
  enclosure: { _attributes: { url: `https://cdn.example/${n}.mp3?x=1` } },
})
const feed = (items: unknown, extra: Record<string, unknown> = {}) => ({ rss: { channel: { title: { _text: 'Bovar och brott' }, image: { url: '/rss-covers/a.jpg' }, item: items, ...extra } } })
const url = (n: number) => `https://cdn.example/${n}.mp3?x=1`
const next = (f: unknown, n: number | string, entry?: PodcastEntry, steps = 1, onCard?: Set<string>) => {
  const found = locateIn(f, typeof n === 'number' ? url(n) : n, entry, onCard)
  return found ? neighbourOf(found, steps) : null
}
const titles = (f: unknown, entry?: PodcastEntry) => tileOrder((f as { rss: { channel: { item: Record<string, unknown>[] } } }).rss.channel.item, entry).map((i) => (i.title as { _cdata: string })._cdata)

describe('the neighbour of a podcast episode', () => {
  // (the feed lists them in a mixed order on purpose: the dates decide)
  const dated = feed([episode(2, 10), episode(3, 20), episode(1, 5)])

  it('without a choice: the newest first - next is the older episode, previous the newer one', () => {
    assert.strictEqual(next(dated, 2, undefined, -1)?.url, url(3))
    assert.strictEqual(next(dated, 2)?.url, url(1))
    const n = next(dated, 2, undefined, -1)
    assert.deepStrictEqual([n?.title, n?.artist, n?.position, n?.count, n?.same], ['Folge 3', 'Bovar och brott', 0, 3, false])
    assert.strictEqual(n?.cover, '/api/rssfeed/image?local=a.jpg&w=400')
  })

  it('at the first, previous is the first again; at the last, next is the last again', () => {
    const first = next(dated, 3, undefined, -1)
    assert.deepStrictEqual([first?.url, first?.same], [url(3), true])
    const last = next(dated, 1)
    assert.deepStrictEqual([last?.url, last?.same], [url(1), true])
    assert.strictEqual(next(dated, 3)?.url, url(2))
  })

  it('several presses at once go as many places, not beyond the end', () => {
    const many = feed([1, 2, 3, 4, 5, 6].map((n) => episode(n, n)))
    assert.strictEqual(next(many, 6, undefined, 3)?.url, url(3))
    assert.strictEqual(next(many, 6, undefined, 50)?.url, url(1))
    assert.strictEqual(next(many, 2, undefined, -3)?.url, url(5))
  })

  it("keeps to the parents' choice: the newest N, the oldest N, episodes A to B", () => {
    const many = feed([1, 2, 3, 4, 5, 6].map((n) => episode(n, n)))
    assert.deepStrictEqual(titles(many, { episodePick: 'newest:2' }), ['Folge 6', 'Folge 5'])
    // the last of the newest two: next stays on it, the older ones are not reached
    assert.deepStrictEqual([next(many, 5, { episodePick: 'newest:2' })?.url, next(many, 5, { episodePick: 'newest:2' })?.same], [url(5), true])
    assert.deepStrictEqual(titles(many, { episodePick: 'oldest:2' }), ['Folge 2', 'Folge 1'])
    assert.deepStrictEqual(titles(many, { episodePick: 'span:1-2' }), ['Folge 5', 'Folge 4'])
    // (the older choice, in the feed's own order)
    assert.deepStrictEqual(titles(many, { aPartOfAll: true, aPartOfAllMin: 2, aPartOfAllMax: 3 }), ['Folge 3', 'Folge 2'])
  })

  it("follows the entry's sorting: the oldest first turns next into the newer episode", () => {
    const asc: PodcastEntry = { sorting: 'ReleaseDateAscending' }
    assert.deepStrictEqual(titles(dated, asc), ['Folge 1', 'Folge 2', 'Folge 3'])
    assert.strictEqual(next(dated, 2, asc)?.url, url(3))
    assert.strictEqual(next(dated, 2, asc, -1)?.url, url(1))
    const named = feed([episode(10, 3), episode(2, 1), episode(1, 2)])
    assert.deepStrictEqual(titles(named, { sorting: 'AlphabeticalAscending' }), ['Folge 1', 'Folge 2', 'Folge 10'])
    assert.deepStrictEqual(titles(named, { sorting: 'AlphabeticalDescending' }), ['Folge 10', 'Folge 2', 'Folge 1'])
  })

  it('without internet: only the episodes on the SD card, the choice not applied again', () => {
    const many = feed([1, 2, 3, 4].map((n) => episode(n, n)))
    const onCard = new Set([episodeKey(url(4)), episodeKey(url(1))])
    const found = locateIn(many, url(4), { episodePick: 'newest:1' }, onCard)
    assert.deepStrictEqual(found?.order.map((i) => (i.title as { _cdata: string })._cdata), ['Folge 4', 'Folge 1'])
    // next from the newest goes to the one on the card, not to the episodes in between
    assert.strictEqual(next(many, 4, { episodePick: 'newest:1' }, 1, onCard)?.url, url(1))
  })

  it('a feed without dates keeps its order, the newest first', () => {
    const plain = feed([episode(3, null), episode(2, null), episode(1, null)])
    assert.strictEqual(next(plain, 2, undefined, -1)?.url, url(3))
    assert.strictEqual(next(plain, 2)?.url, url(1))
  })

  it('finds the episode by what makes the file the same (no query, any scheme); an episode not in the choice goes to the first', () => {
    assert.strictEqual(next(dated, 'http://cdn.example/2.mp3', undefined, -1)?.url, url(3))
    const many = feed([1, 2, 3, 4].map((n) => episode(n, n)))
    assert.deepStrictEqual([next(many, 1, { episodePick: 'newest:2' })?.url, next(many, 1, { episodePick: 'newest:2' })?.position], [url(4), 0])
  })

  it('knows nothing of an episode that the feed does not have, and copes with odd feeds', () => {
    assert.strictEqual(locateIn(dated, 'https://cdn.example/7.mp3'), null)
    for (const odd of [null, {}, { rss: {} }, feed([{ title: 'no file' }])]) assert.strictEqual(locateIn(odd, url(1)), null)
    // (a feed with one episode: the item is no list)
    assert.strictEqual(next(feed(episode(1, 1)), 1, undefined, -1)?.same, true)
  })

  it('lists the episodes as the tile does, with the place of the one that plays and their lengths', () => {
    const list = listOf(locateIn(dated, url(2))!)
    assert.deepStrictEqual(list.episodes.map((e) => e.title), ['Folge 3', 'Folge 2', 'Folge 1'])
    assert.deepStrictEqual([list.artist, list.current, list.count, list.offset], ['Bovar och brott', 1, 3, 0])
    assert.strictEqual(list.episodes[0].url, url(3))
    const timed = feed([{ ...episode(1, 1), 'itunes:duration': '1:02:03' }, { ...episode(2, 2), 'itunes:duration': '45:30' }, { ...episode(3, 3), 'itunes:duration': 'soon' }])
    assert.deepStrictEqual(listOf(locateIn(timed, url(1))!).episodes.map((e) => e.seconds), [0, 2730, 3723])
  })

  it('a long feed: only the rows around the one that plays, the counter of all', () => {
    const long = feed(Array.from({ length: 1000 }, (_, i) => episode(i + 1, null)))
    const list = listOf(locateIn(long, url(500))!, 300)
    assert.deepStrictEqual([list.count, list.current, list.offset, list.episodes.length], [1000, 499, 349, 300])
    assert.strictEqual(list.episodes[list.current - list.offset].url, url(500))
    assert.strictEqual(listOf(locateIn(long, url(1))!, 300).offset, 0)
    assert.strictEqual(listOf(locateIn(long, url(1000))!, 300).offset, 700)
  })
})
