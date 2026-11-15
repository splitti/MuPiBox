// Tests of the tags of the NFC extension: which tag gets which medium (the idea of TeddyCloud), their pictures and the
// API part with a made-up host (no reader, no box).  node --test extensions/nfc/test/tags.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const tags = require('../tags.js')

const book = { type: 'library', category: 'audiobook', artist: 'Astrid Lindgren', title: 'Pippi Langstrumpf', libraryPath: 'audiobook/Astrid Lindgren/Pippi Langstrumpf', cover: '/api/library/file?path=x', resumelocalprogressTime: 40, index: 3 }
const radio = { type: 'radio', category: 'music', artist: '', title: 'Kinderradio', id: 'https://radio.example/stream' }
const NOW = 1_700_000_000_000

test('a medium is kept for what it takes to start it, not for where it was left', () => {
  const media = tags.sanitizeMedia(book)
  assert.strictEqual(media.libraryPath, 'audiobook/Astrid Lindgren/Pippi Langstrumpf')
  assert.strictEqual(media.resumelocalprogressTime, undefined)
  assert.strictEqual(media.index, undefined)
})

test('what cannot be started is no medium: a folder of folders, an artist, something without an address', () => {
  assert.strictEqual(tags.sanitizeMedia({ ...book, libraryIsContainer: true }), null)
  assert.strictEqual(tags.sanitizeMedia({ type: 'nas', artist: 'x', title: 'y', nasPath: '/a', nasIsContainer: true }), null)
  assert.strictEqual(tags.sanitizeMedia({ type: 'spotify', artistid: 'abc', artist: 'X' }), null)
  assert.notStrictEqual(tags.sanitizeMedia({ type: 'spotify', id: 'alb1', title: 'T' }), null)
  assert.strictEqual(tags.sanitizeMedia({ type: 'radio', title: 'no address' }), null)
  assert.strictEqual(tags.sanitizeMedia({ type: 'tidal', id: '1', tidalKind: 'artist' }), null)
  assert.strictEqual(tags.sanitizeMedia(null), null)
  assert.strictEqual(tags.sanitizeMedia({ type: 'bogus', id: '1' }), null)
})

test('a medium is named as the user reads it', () => {
  assert.strictEqual(tags.mediaLabel(book), 'Pippi Langstrumpf – Astrid Lindgren')
  assert.strictEqual(tags.mediaLabel({ title: 'Same', artist: 'Same' }), 'Same')
})

test('a picture is an address of the box or of the web, nothing else; a tag shows its own, else the cover of its medium', () => {
  assert.strictEqual(tags.sanitizeImage('/api/library/file?path=a%20b'), '/api/library/file?path=a%20b')
  assert.strictEqual(tags.sanitizeImage('https://i.scdn.co/image/abc'), 'https://i.scdn.co/image/abc')
  assert.strictEqual(tags.sanitizeImage('http://mupibox.local/cover/nfc-tag-ab12cd.jpg'), 'http://mupibox.local/cover/nfc-tag-ab12cd.jpg')
  assert.strictEqual(tags.sanitizeImage('/cover/nfc-tag-ab12cd.jpg'), '/cover/nfc-tag-ab12cd.jpg')
  assert.strictEqual(tags.sanitizeImage("/api/library/file?path=a%2Fb%20(2)!"), "/api/library/file?path=a%2Fb%20(2)!")
  for (const bad of ['javascript:alert(1)', '/cover/../etc', "/api/x'y", 'http://evil.example/x.jpg', 'data:image/png;base64,AAAA', '//evil.example/x', '/etc/passwd', '/api/x"onerror="y', 7, null, '']) assert.strictEqual(tags.sanitizeImage(bad), '')
  assert.strictEqual(tags.sanitizeImage(`/api/${'a'.repeat(600)}`), '')
  const media = tags.sanitizeMedia(book)
  assert.strictEqual(tags.tagImage({ media }), '/api/library/file?path=x')
  assert.strictEqual(tags.tagImage({ media, image: 'https://i.scdn.co/own.jpg' }), 'https://i.scdn.co/own.jpg')
  assert.strictEqual(tags.tagImage({ media: tags.sanitizeMedia(radio) }), '')
  // (a podcast has no cover in its data - the app asks the service and hands the address over when the tag is assigned)
  assert.strictEqual(tags.tagImage({ media: tags.sanitizeMedia(radio), cover: '/api/rssfeed/cover?url=https%3A%2F%2Ffeed.example%2Frss&w=400' }), '/api/rssfeed/cover?url=https%3A%2F%2Ffeed.example%2Frss&w=400')
  // (no cover handed over: the box asks the service as the tiles do)
  assert.strictEqual(tags.tagImage({ media: tags.sanitizeMedia({ type: 'rss', id: 'https://feed.example/rss', title: 'P' }) }), '/api/rssfeed/cover?url=https%3A%2F%2Ffeed.example%2Frss&w=400')
  assert.strictEqual(tags.tagImage({ media: tags.sanitizeMedia({ type: 'spotify', id: 'alb1', title: 'T' }) }), '/api/spotify/cover-for/album/alb1')
  assert.strictEqual(tags.tagImage({ media, cover: '/api/x', image: 'https://i.scdn.co/own.jpg' }), 'https://i.scdn.co/own.jpg')
})

test('the same medium is the same, wherever it was left; entries without a path are told apart by name', () => {
  const key = (m) => tags.mediumKey(tags.sanitizeMedia(m))
  assert.strictEqual(key(book), key({ ...book, resumelocalprogressTime: 99, cover: 'x', title: 'Pippi Langstrumpf' }))
  assert.notStrictEqual(key(book), key({ ...book, libraryPath: 'audiobook/Astrid Lindgren/Michel' }))
  assert.notStrictEqual(key(radio), key({ ...radio, id: 'https://radio.example/other' }))
  assert.notStrictEqual(key(radio), key(book))
  const a = { type: 'library', artist: 'A', title: 'One' }
  assert.notStrictEqual(key(a), key({ ...a, title: 'Two' }))
  assert.strictEqual(tags.mediumKey(null), '')
})

test('a UID is taken in any writing', () => {
  assert.strictEqual(tags.normalizeUid('04:a1-b2 c3'), '04A1B2C3')
  assert.strictEqual(tags.normalizeUid('xyz'), null)
  assert.strictEqual(tags.normalizeUid('0102'), null)
})

test('a tag the box does not know is noted, and plays nothing', () => {
  const data = tags.emptyData()
  const r = tags.tagLaidOn(data, null, { uid: '04A1B2C3', tech: 'ISO14443A' }, NOW)
  assert.strictEqual(r.kind, 'unknown')
  assert.strictEqual(data.tags['04A1B2C3'].count, 1)
  assert.strictEqual(tags.tagLaidOn(data, null, { uid: '04A1B2C3', tech: 'ISO14443A' }, NOW + 5).tag.count, 2)
})

test('"next new tag": the first tag without a medium gets it, the one that has one plays its own and the waiting goes on', () => {
  const data = tags.emptyData()
  const mine = tags.sanitizeMedia(book)
  const other = tags.sanitizeMedia(radio)
  tags.tagLaidOn(data, null, { uid: 'AAAAAAAA', tech: 'ISO14443A' }, NOW)
  data.tags.AAAAAAAA.media = other
  data.tags.AAAAAAAA.title = 'Kinderradio'
  const armed = { target: 'new', media: mine, until: NOW + 60000 }
  const first = tags.tagLaidOn(data, armed, { uid: 'AAAAAAAA', tech: 'ISO14443A' }, NOW + 1)
  assert.deepStrictEqual([first.kind, first.disarm, first.tag.media.type], ['kept', false, 'radio'])
  const second = tags.tagLaidOn(data, armed, { uid: 'BBBBBBBB', tech: 'ISO15693' }, NOW + 2)
  assert.deepStrictEqual([second.kind, second.disarm, second.tag.media.title], ['assigned', true, 'Pippi Langstrumpf'])
  assert.strictEqual(second.tag.tech, 'ISO15693')
  assert.strictEqual(tags.countAssigned(data), 2)
})

test('"next tag" replaces the medium of a tag that has one', () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, null, { uid: 'AAAAAAAA' }, NOW)
  data.tags.AAAAAAAA.media = tags.sanitizeMedia(radio)
  const r = tags.tagLaidOn(data, { target: 'any', media: tags.sanitizeMedia(book), until: NOW + 1000 }, { uid: 'AAAAAAAA' }, NOW + 1)
  assert.deepStrictEqual([r.kind, r.disarm, r.tag.media.type], ['assigned', true, 'library'])
})

test('an assignment says which one it was, what the tag had before, and gives the tag its picture', () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, null, { uid: 'AAAAAAAA' }, NOW)
  data.tags.AAAAAAAA.media = tags.sanitizeMedia(radio)
  data.tags.AAAAAAAA.title = 'Kinderradio'
  const r = tags.tagLaidOn(data, { id: 7, target: 'any', media: tags.sanitizeMedia(book), image: 'https://i.scdn.co/own.jpg', until: NOW + 1000 }, { uid: 'AAAAAAAA' }, NOW + 1)
  assert.deepStrictEqual([r.armedId, r.previous, r.tag.image], [7, 'Kinderradio', 'https://i.scdn.co/own.jpg'])
  const fresh = tags.tagLaidOn(data, { id: 8, target: 'any', media: tags.sanitizeMedia(radio), until: NOW + 1000 }, { uid: 'BBBBBBBB' }, NOW + 2)
  assert.deepStrictEqual([fresh.armedId, fresh.previous, fresh.tag.image], [8, '', ''])
})

test('an assignment that waited too long is gone', () => {
  const data = tags.emptyData()
  const r = tags.tagLaidOn(data, { target: 'new', media: tags.sanitizeMedia(book), until: NOW }, { uid: 'CCCCCCCC' }, NOW + 1)
  assert.strictEqual(r.kind, 'unknown')
  assert.strictEqual(data.tags.CCCCCCCC.media, null)
})

test('the flex tag: the next tag becomes it, and a new medium goes to it without a tag being laid on', () => {
  const data = tags.emptyData()
  assert.strictEqual(tags.giveToFlex(data, tags.sanitizeMedia(book), NOW), false)
  const r = tags.tagLaidOn(data, { target: 'flex', media: tags.sanitizeMedia(book), until: NOW + 1000 }, { uid: 'FFFFFFFF' }, NOW)
  assert.deepStrictEqual([r.kind, data.flex], ['flex', 'FFFFFFFF'])
  assert.strictEqual(tags.giveToFlex(data, tags.sanitizeMedia(radio), NOW + 5), true)
  assert.strictEqual(data.tags.FFFFFFFF.title, 'Kinderradio')
})

test('a tag that is forgotten is new again, a flex tag is none any more', () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, { target: 'flex', media: tags.sanitizeMedia(book), until: NOW + 1000 }, { uid: 'FFFFFFFF' }, NOW)
  assert.strictEqual(tags.forgetTag(data, 'FFFFFFFF'), true)
  assert.deepStrictEqual([data.flex, Object.keys(data.tags).length], [null, 0])
  assert.strictEqual(tags.forgetTag(data, 'FFFFFFFF'), false)
})

test('a damaged file gives an empty store, a good one comes back as it was saved', () => {
  assert.deepStrictEqual(tags.readData('nonsense'), tags.emptyData())
  assert.deepStrictEqual(tags.readData({ tags: [] }).tags, {})
  const data = tags.emptyData()
  tags.tagLaidOn(data, { target: 'flex', media: tags.sanitizeMedia(book), until: NOW + 1000 }, { uid: '04A1B2C3', tech: 'ISO15693' }, NOW)
  const back = tags.readData(JSON.parse(JSON.stringify(data)))
  assert.deepStrictEqual(back, data)
  const withBad = tags.readData({ flex: 'ZZ', tags: { '04A1B2C3': { media: { type: 'bogus' } }, nope: {} } })
  assert.deepStrictEqual([withBad.flex, withBad.tags['04A1B2C3'].media, Object.keys(withBad.tags)], [null, null, ['04A1B2C3']])
})

test('the store keeps its size: tags without a medium go first', () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, { target: 'any', media: tags.sanitizeMedia(book), until: NOW + 1e9 }, { uid: 'AAAAAAAA' }, NOW)
  for (let i = 0; i < tags.MAX_TAGS + 20; i++) tags.tagLaidOn(data, null, { uid: (0x10000000 + i).toString(16).toUpperCase() }, NOW + 1 + i)
  assert.strictEqual(Object.keys(data.tags).length, tags.MAX_TAGS)
  assert.ok(data.tags.AAAAAAAA.media)
})

// ---- the API part with a made-up host ------------------------------------------------------------------------------------------

function makeHost(settings) {
  const routes = {}
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-test-'))
  const host = {
    dir: path.join(__dirname, '..'),
    dataDir,
    log: { info() {}, warn() {}, debug() {} },
    apiUrl: 'http://api.test',
    playerUrl: 'http://player.test',
    settings: async () => settings,
    onSettings() {},
    route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler),
  }
  return { host, routes, dataDir }
}
const call = async (handler, req = {}) => {
  const out = { status: 200, body: null }
  const res = { status: (code) => ((out.status = code), res), json: (body) => ((out.body = body), res) }
  await handler({ query: {}, body: {}, ...req }, res)
  return out
}
const later = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

const feedReady = (nfc) => nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })

test('the API part: arm with a medium, lay a new tag on, the display is told to start it, taking it off pauses', async () => {
  const realFetch = global.fetch
  const player = []
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false }) }
    player.push(u)
    return { ok: true, json: async () => ({}) }
  }
  try {
    const settings = { reader: 'none', onRemove: 'pause', playOnTag: true }
    const { host, routes } = makeHost(settings)
    const nfc = require('../api.js').activate(host)
    await later(0)

    // no reader that works: arming says so; a thing that cannot be played is refused
    assert.strictEqual((await call(routes['post /arm'], { body: { media: book } })).status, 409)
    feedReady(nfc)
    assert.strictEqual((await call(routes['post /arm'], { body: { media: { ...book, libraryIsContainer: true } } })).status, 400)
    assert.strictEqual((await call(routes['post /arm'], { body: {} })).status, 400)

    const armed = (await call(routes['post /arm'], { body: { media: book, image: 'https://i.scdn.co/own.jpg', cover: '/api/rssfeed/cover?url=x&w=400' } })).body
    assert.deepStrictEqual([armed.ok, armed.state, typeof armed.id], [true, 'waiting', 'number'])
    const waiting = (await call(routes['get /armstate'], { query: { id: armed.id } })).body
    assert.deepStrictEqual([waiting.state, waiting.title], ['waiting', 'Pippi Langstrumpf – Astrid Lindgren'])

    // a new tag is laid on: it gets the book and the display is to start it (once)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    const command = (await call(routes['get /pending'])).body
    assert.strictEqual(command.media.libraryPath, 'audiobook/Astrid Lindgren/Pippi Langstrumpf')
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})
    const done = (await call(routes['get /armstate'], { query: { id: armed.id } })).body
    assert.deepStrictEqual([done.state, done.uid, done.title, done.previous], ['done', '04A1B2C3', 'Pippi Langstrumpf – Astrid Lindgren', ''])

    // the list: the tag with the picture it was given; the picture can be changed and taken away, the tag removed
    const list = (await call(routes['get /tags'])).body.items
    assert.strictEqual(list.length, 1)
    assert.deepStrictEqual([list[0].id, list[0].title, list[0].image, list[0].text], ['04A1B2C3', 'Pippi Langstrumpf – Astrid Lindgren', 'https://i.scdn.co/own.jpg', ['SD-Karte', '04:A1:B2:C3']])
    assert.deepStrictEqual(list[0].actions.map((a) => a.post), ['/api/ext/nfc/tagremove'])
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: '04A1B2C3', image: 'javascript:alert(1)' } })).status, 400)
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: '04A1B2C3', image: '' } })).body.ok, true)
    assert.strictEqual((await call(routes['get /tags'])).body.items[0].image, '/api/rssfeed/cover?url=x&w=400', 'the cover the app showed comes back')
    // the tags of one medium
    assert.strictEqual((await call(routes['post /tagsfor'], { body: { media: { ...book, resumelocalprogressTime: 5 } } })).body.items.map((t) => t.id).join(), '04A1B2C3')
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: { media: radio } })).body.items, [])
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: {} })).body.items, [])
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: 'DEADBEEF', image: '' } })).status, 404)

    // taken off: pause; laid on again soon, while it is paused: goes on instead of starting again
    nfc.feed({ event: 'gone' })
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/pause?src=nfc')))
    await later(2100)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/play?src=nfc')))
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})

    // removed, it is new again and plays nothing
    assert.strictEqual((await call(routes['post /tagremove'], { body: { id: '04A1B2C3' } })).body.ok, true)
    assert.strictEqual((await call(routes['post /tagremove'], { body: { id: '04A1B2C3' } })).status, 404)
    assert.deepStrictEqual((await call(routes['get /tags'])).body.items, [])
    nfc.feed({ event: 'gone' })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})
  } finally {
    global.fetch = realFetch
  }
})

test('the API part: a second medium replaces the first on a tag, a cancelled or replaced assignment is gone', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing' })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    const first = (await call(routes['post /arm'], { body: { media: radio } })).body
    const second = (await call(routes['post /arm'], { body: { media: book } })).body
    assert.strictEqual((await call(routes['get /armstate'], { query: { id: first.id } })).body.state, 'gone', 'the second arming replaced the first')
    await call(routes['post /cancel'], { body: { id: second.id } })
    assert.strictEqual((await call(routes['get /armstate'], { query: { id: second.id } })).body.state, 'gone')

    // a tag without a medium is noted but not listed; then it gets one, and a second one replaces it (the answer names the old)
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.strictEqual((await call(routes['get /tags'])).body.items.length, 0)
    const a = (await call(routes['post /arm'], { body: { media: radio } })).body
    nfc.feed({ event: 'gone' })
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.strictEqual((await call(routes['get /armstate'], { query: { id: a.id } })).body.state, 'done')
    const b = (await call(routes['post /arm'], { body: { media: book } })).body
    nfc.feed({ event: 'gone' })
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.strictEqual((await call(routes['get /armstate'], { query: { id: b.id } })).body.previous, 'Kinderradio')
  } finally {
    global.fetch = realFetch
  }
})

test('the API part: the tags are still there after a restart, and the flex tag follows the medium that is armed', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const settings = { reader: 'none', onRemove: 'nothing' }
    const { host, routes, dataDir } = makeHost(settings)
    let nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    // (no flex tag yet: the assignment waits for a tag, which becomes the flex tag)
    assert.strictEqual((await call(routes['post /arm'], { body: { media: radio, flex: true } })).body.state, 'waiting')
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.strictEqual((await call(routes['get /pending'])).body.media.type, 'radio')
    assert.strictEqual((await call(routes['get /tags'])).body.items[0].text.includes('Flex-Tag'), true)

    // a second start of the box: the same file
    const second = makeHost(settings)
    fs.copyFileSync(path.join(dataDir, 'tags.json'), path.join(second.dataDir, 'tags.json'))
    nfc = require('../api.js').activate(second.host)
    await later(0)
    feedReady(nfc)
    assert.strictEqual((await call(second.routes['get /tags'])).body.items.length, 1)

    // another medium for the flex tag: it has it at once, nothing waits
    const flex = (await call(second.routes['post /arm'], { body: { media: book, flex: true } })).body
    assert.deepStrictEqual([flex.state, flex.message], ['done', 'Der Flex-Tag hat das Medium'])
    assert.strictEqual((await call(second.routes['get /armstate'], { query: { id: flex.id } })).body.state, 'done')
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later(2100)
    assert.strictEqual((await call(second.routes['get /pending'])).body.media.title, 'Pippi Langstrumpf')
  } finally {
    global.fetch = realFetch
  }
})

const episode = (n, extra = {}) => ({ title: { _cdata: `Folge ${n}` }, pubDate: 'Mon, 01 Jan 2026 10:00:00 GMT', 'itunes:duration': '600', enclosure: { _attributes: { url: `https://cdn.example/${n}.mp3` } }, ...extra })
const feed = (items, extra = {}) => ({ rss: { channel: { title: { _text: 'Bovar och brott' }, image: { url: '/rss-covers/abc.jpg' }, item: items }, ...extra } })
const podcast = { type: 'rss', id: 'https://feed.example/rss', category: 'audiobook', artist: 'Bovar och brott i Barnradion', artistcover: 'https://x.example/a.jpg', shuffle: true }

test('a podcast tag starts an episode: the one begun, else the newest not heard, else the newest', () => {
  const pick = (items, extra) => tags.pickEpisode(feed(items, extra), podcast)
  assert.strictEqual(pick([episode(3), episode(2), episode(1)]).id, 'https://cdn.example/3.mp3')
  assert.strictEqual(pick([episode(3, { _done: true }), episode(2), episode(1)]).id, 'https://cdn.example/2.mp3')
  assert.strictEqual(pick([episode(3), episode(2, { _pct: 40 }), episode(1)]).id, 'https://cdn.example/2.mp3', 'one that is half heard goes on')
  assert.strictEqual(pick([episode(3, { _done: true }), episode(2, { _pct: 100, _done: true })]).id, 'https://cdn.example/3.mp3', 'all heard: the newest again')
  const media = pick([episode(1)])
  assert.deepStrictEqual([media.type, media.title, media.artist, media.category, media.shuffle, media.artistcover], ['rss', 'Folge 1', 'Bovar och brott', 'audiobook', true, 'https://x.example/a.jpg'])
  assert.strictEqual(media.release_date, 'Mon, 01 Jan 2026 10:00:00 GMT')
  assert.strictEqual(tags.pickEpisode(feed([]), podcast), null)
  assert.strictEqual(tags.pickEpisode(feed([{ title: 'no file' }]), podcast), null)
  assert.strictEqual(tags.pickEpisode(feed([episode(1)]), { ...podcast, artistcover: undefined }).artistcover, '/api/rssfeed/image?local=abc.jpg&w=400')
  assert.strictEqual(tags.pickEpisode(null, podcast), null)
})

test('the API part: the display is told to play an episode of the podcast, not its feed', async () => {
  const realFetch = global.fetch
  let broken = false
  global.fetch = async (url) => {
    if (String(url).startsWith('http://api.test/api/rssfeed/cached?url=')) {
      assert.ok(String(url).endsWith(encodeURIComponent(podcast.id)))
      return broken ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => feed([episode(2), episode(1)]) }
    }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    await call(routes['post /arm'], { body: { media: podcast } })
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later(50)
    const command = (await call(routes['get /pending'])).body
    assert.deepStrictEqual([command.media.type, command.media.id, command.media.title], ['rss', 'https://cdn.example/2.mp3', 'Folge 2'])
    // (the feed cannot be read: nothing is started, no error)
    broken = true
    nfc.feed({ event: 'gone' })
    await later(2100)
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later(50)
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})
  } finally {
    global.fetch = realFetch
  }
})
