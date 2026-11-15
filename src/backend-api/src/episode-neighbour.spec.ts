// "next" and "previous" at a podcast: newer and older episode, and what happens at the ends.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { episodeList, neighbourEpisode } from './episode-neighbour'

const episode = (n: number, day: number | null) => ({
  title: { _cdata: `Folge ${n}` },
  ...(day === null ? {} : { pubDate: `Mon, ${String(day).padStart(2, '0')} Jan 2026 10:00:00 GMT` }),
  enclosure: { _attributes: { url: `https://cdn.example/${n}.mp3?x=1` } },
})
const feed = (items: unknown[], extra: Record<string, unknown> = {}) => ({ rss: { channel: { title: { _text: 'Bovar och brott' }, image: { url: '/rss-covers/a.jpg' }, item: items, ...extra } } })
const url = (n: number) => `https://cdn.example/${n}.mp3?x=1`

describe('the neighbour of a podcast episode', () => {
  // (the feed lists them in a mixed order on purpose: the dates decide)
  const dated = feed([episode(2, 10), episode(3, 20), episode(1, 5)])

  it('newer is the episode that came out after, older the one before', () => {
    assert.strictEqual(neighbourEpisode([dated], url(2), 'newer')?.url, url(3))
    assert.strictEqual(neighbourEpisode([dated], url(2), 'older')?.url, url(1))
    const n = neighbourEpisode([dated], url(2), 'newer')
    assert.deepStrictEqual([n?.title, n?.artist, n?.position, n?.count, n?.same], ['Folge 3', 'Bovar och brott', 0, 3, false])
    assert.strictEqual(n?.cover, '/api/rssfeed/image?local=a.jpg&w=400')
  })

  it('at the newest, newer is the newest again; at the oldest, older is the oldest again', () => {
    const newest = neighbourEpisode([dated], url(3), 'newer')
    assert.deepStrictEqual([newest?.url, newest?.same], [url(3), true])
    const oldest = neighbourEpisode([dated], url(1), 'older')
    assert.deepStrictEqual([oldest?.url, oldest?.same], [url(1), true])
    assert.strictEqual(neighbourEpisode([dated], url(3), 'older')?.url, url(2))
  })

  it('a feed without dates keeps its order, the newest first', () => {
    const plain = feed([episode(3, null), episode(2, null), episode(1, null)])
    assert.strictEqual(neighbourEpisode([plain], url(2), 'newer')?.url, url(3))
    assert.strictEqual(neighbourEpisode([plain], url(2), 'older')?.url, url(1))
  })

  it('finds the episode in the right one of several feeds, by what makes the file the same (no query, any scheme)', () => {
    const other = feed([episode(9, 1)], { title: { _text: 'Other' } })
    assert.strictEqual(neighbourEpisode([other, dated], 'http://cdn.example/2.mp3', 'newer')?.url, url(3))
    assert.strictEqual(neighbourEpisode([other, dated], url(9), 'newer')?.artist, 'Other')
  })

  it('knows nothing of an episode that no feed has, and copes with odd feeds', () => {
    assert.strictEqual(neighbourEpisode([dated], 'https://cdn.example/7.mp3', 'newer'), null)
    assert.strictEqual(neighbourEpisode([], url(1), 'newer'), null)
    assert.strictEqual(neighbourEpisode([null, {}, { rss: {} }, feed([{ title: 'no file' }])], url(1), 'older'), null)
    // (a feed with one episode: the item is no list)
    assert.strictEqual(neighbourEpisode([feed(episode(1, 1) as unknown as unknown[])], url(1), 'newer')?.same, true)
  })

  it('lists the episodes of the feed newest first, with the place of the one that plays and their lengths', () => {
    const list = episodeList([dated], url(2))
    assert.deepStrictEqual(list?.episodes.map((e) => e.title), ['Folge 3', 'Folge 2', 'Folge 1'])
    assert.deepStrictEqual([list?.artist, list?.current], ['Bovar och brott', 1])
    assert.strictEqual(list?.episodes[0].url, url(3))
    const timed = feed([{ ...episode(1, 1), 'itunes:duration': '1:02:03' }, { ...episode(2, 2), 'itunes:duration': '45:30' }, { ...episode(3, 3), 'itunes:duration': 'soon' }])
    assert.deepStrictEqual(episodeList([timed], url(1))?.episodes.map((e) => e.seconds), [0, 2730, 3723])
    assert.strictEqual(episodeList([dated], 'https://cdn.example/7.mp3'), null)
  })
})
