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

test('Jellyfin and Audible: an album, a playlist, an audiobook, a book - not a whole artist or series', () => {
  const jf = { type: 'jellyfin', jellyfinKind: 'album', id: 'a1b2', artist: 'A', title: 'T', category: 'music', cover: '/api/jellyfin/image/a1b2?w=400' }
  const media = tags.sanitizeMedia(jf)
  assert.strictEqual(media.jellyfinKind, 'album')
  assert.strictEqual(tags.tagImage({ media }), '/api/jellyfin/image/a1b2?w=400')
  for (const kind of ['playlist', 'book']) assert.notStrictEqual(tags.sanitizeMedia({ ...jf, jellyfinKind: kind }), null)
  assert.strictEqual(tags.sanitizeMedia({ ...jf, jellyfinKind: 'artist' }), null)
  assert.strictEqual(tags.sanitizeMedia({ ...jf, jellyfinKind: undefined }), null)
  assert.strictEqual(tags.sanitizeMedia({ ...jf, id: '' }), null)
  const ab = { type: 'audible', audibleKind: 'book', id: 'B0ABCDEFGH', artist: 'A', title: 'T', category: 'audiobook', cover: '/api/audible/image/51abc?w=500' }
  const book2 = tags.sanitizeMedia(ab)
  assert.strictEqual(book2.audibleKind, 'book')
  assert.strictEqual(tags.tagImage({ media: book2 }), '/api/audible/image/51abc?w=500')
  assert.strictEqual(tags.sanitizeMedia({ ...ab, audibleKind: 'series' }), null)
  assert.strictEqual(tags.sanitizeMedia({ ...ab, audibleKind: undefined }), null)
  // (the same id as a book and as something else is not the same medium)
  assert.notStrictEqual(tags.mediumKey(tags.sanitizeMedia({ ...jf, jellyfinKind: 'book' })), tags.mediumKey(media))
})

test('a medium is named as the user reads it', () => {
  assert.strictEqual(tags.mediaLabel(book), 'Pippi Langstrumpf – Astrid Lindgren')
  assert.strictEqual(tags.mediaLabel({ title: 'Same', artist: 'Same' }), 'Same')
})

test('a picture is an address of the box or of the web, nothing else; a tag shows its own, else the cover of its medium', () => {
  assert.strictEqual(tags.sanitizeImage('/api/library/file?path=a%20b'), '/api/library/file?path=a%20b')
  assert.strictEqual(tags.sanitizeImage('https://i.scdn.co/image/abc'), 'https://i.scdn.co/image/abc')
  assert.strictEqual(tags.sanitizeImage('http://mupibox.local/cover/nfc-tag-ab12cd.jpg'), '/cover/nfc-tag-ab12cd.jpg') // kept without the host name of the box
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

test('a known tag gets another medium (the flex mark stays), an unknown one does not', () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, { target: 'flex', media: tags.sanitizeMedia(book), image: 'https://i.scdn.co/own.jpg', until: NOW + 1000 }, { uid: 'FFFFFFFF' }, NOW)
  assert.strictEqual(tags.giveToTag(data, 'FFFFFFFF', tags.sanitizeMedia(radio), NOW + 9, '/cover/x.jpg'), true)
  assert.deepStrictEqual([data.flex, data.tags.FFFFFFFF.title, data.tags.FFFFFFFF.image, data.tags.FFFFFFFF.cover, data.tags.FFFFFFFF.assignedAt], ['FFFFFFFF', 'Kinderradio', '', '/cover/x.jpg', NOW + 9])
  assert.strictEqual(tags.giveToTag(data, 'DEADBEEF', tags.sanitizeMedia(radio), NOW), false)
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
  // (the player's number of the playback: 6 before, the display's start of the tag's medium makes it 7, another start later 8)
  let generation = 6
  let playing = false
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing, generation, triggerAt: Date.now() }) }
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
    generation = 7 // (the display started it)
    assert.strictEqual(command.media.libraryPath, 'audiobook/Astrid Lindgren/Pippi Langstrumpf')
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})
    const done = (await call(routes['get /armstate'], { query: { id: armed.id } })).body
    assert.deepStrictEqual([done.state, done.uid, done.title, done.previous], ['done', '04A1B2C3', 'Pippi Langstrumpf – Astrid Lindgren', ''])
    assert.strictEqual(done.id, '04:A1:B2:C3', 'the number as it is shown in the list, for the sheet')

    // the list: the tag with the picture it was given; the picture can be changed and taken away, the tag removed
    const list = (await call(routes['get /tags'])).body.items
    assert.strictEqual(list.length, 1)
    assert.deepStrictEqual([list[0].id, list[0].title, list[0].image, list[0].text], ['04A1B2C3', 'Pippi Langstrumpf – Astrid Lindgren', 'https://i.scdn.co/own.jpg', ['SD-Karte', '04:A1:B2:C3']])
    assert.deepStrictEqual(list[0].actions.map((a) => a.post ?? 'change'), ['/api/ext/nfc/tagplay', 'change', '/api/ext/nfc/tagremove'], 'the tile: play, change, remove')
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: '04A1B2C3', image: 'javascript:alert(1)' } })).status, 400)
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: '04A1B2C3', image: '' } })).body.ok, true)
    assert.strictEqual((await call(routes['get /tags'])).body.items[0].image, '/api/rssfeed/cover?url=x&w=400', 'the cover the app showed comes back')
    // the tags of one medium
    assert.strictEqual((await call(routes['post /tagsfor'], { body: { media: { ...book, resumelocalprogressTime: 5 } } })).body.items.map((t) => t.id).join(), '04A1B2C3')
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: { media: radio } })).body.items, [])
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: {} })).body.items, [])
    assert.strictEqual((await call(routes['post /tagimage'], { body: { id: 'DEADBEEF', image: '' } })).status, 404)
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: { media: book } })).body.items[0].actions.map((a) => a.post), ['/api/ext/nfc/tagremove'], 'the sheet of a medium has remove only')

    // "Album abspielen": the display is told to start it at once (also right after it started)
    assert.strictEqual((await call(routes['post /tagplay'], { body: { id: '04A1B2C3' } })).body.ok, true)
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Pippi Langstrumpf')
    generation = 8 // (the display started it anew: this start is the tag's now)
    await later(1100)
    assert.strictEqual((await call(routes['post /tagplay'], { body: { id: 'DEADBEEF' } })).status, 404)
    // "Tag ändern": another medium for the tag, its own picture goes and the cover of the new one comes
    assert.strictEqual((await call(routes['post /tagchange'], { body: { id: 'DEADBEEF', media: radio } })).status, 404)
    assert.strictEqual((await call(routes['post /tagchange'], { body: { id: '04A1B2C3', media: { ...book, libraryIsContainer: true } } })).status, 400)
    assert.strictEqual((await call(routes['post /tagchange'], { body: { id: '04A1B2C3', media: radio, cover: '/cover/x.jpg' } })).body.ok, true)
    const changed = (await call(routes['get /tags'])).body.items[0]
    assert.deepStrictEqual([changed.title, changed.image, changed.imageOwn], ['Kinderradio', '/cover/x.jpg', false])
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: { media: book } })).body.items, [])

    // taken off: pause; laid on again at once (it slipped), while it is paused: goes on instead of starting again
    nfc.feed({ event: 'gone' })
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/pause?src=nfc')))
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/play?src=nfc')))
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})

    // another album started on the display meanwhile: taking the tag off leaves it playing
    generation = 9
    player.length = 0
    nfc.feed({ event: 'gone' })
    await later()
    assert.ok(!player.some((u) => u.startsWith('http://player.test/pause')), 'what the display started is not the tag of the reader')
    generation = 8

    // laid on again while it plays (a USB reader: at every hold): it plays on, nothing starts anew
    playing = true
    player.length = 0
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later(2100)
    assert.deepStrictEqual(player, [], 'no play, no new start')
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {})
    playing = false

    // paused by taking it off, then the display stopped it (or started something else): laid on again it starts anew at once
    player.length = 0
    nfc.feed({ event: 'gone' })
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/pause?src=nfc')))
    generation = 10 // (stopped on the display)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.ok(!player.some((u) => u.startsWith('http://player.test/play')), 'what is not the tag’s is not resumed')
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'radio', 'a new start (of the medium the tag was changed to), at the first laying on')

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

test('without the DSI display (mupibox.headless) the server starts the medium itself, as the display would', async () => {
  const realFetch = global.fetch
  const player = []
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false, generation: 1 }) }
    if (u.startsWith('http://player.test/')) player.push(u)
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
    let headless = true
    host.config = () => ({ mupibox: { headless } })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    // a tag of an album of the SD card
    await call(routes['post /arm'], { body: { media: book } })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.ok(player.includes('http://player.test/current/musicsearch/library/album/audiobook:Astrid%20Lindgren:Pippi%20Langstrumpf?src=nfc'), JSON.stringify(player))
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {}, 'nothing is left for a display')
    // a station, with the picture it has
    player.length = 0
    await call(routes['post /tagchange'], { body: { id: '04A1B2C3', media: { ...radio, cover: 'http://box.local/api/radio/cover.png' } } })
    await call(routes['post /tagplay'], { body: { id: '04A1B2C3' } })
    await later()
    assert.deepStrictEqual(player, ['http://player.test/current/radio/https%3A%2F%2Fradio.example%2Fstream/Kinderradio:title:artist:?cover=%2Fapi%2Fradio%2Fcover.png&src=nfc'])
    // with a display the box does as before: the display asks for it, the server starts nothing
    headless = false
    player.length = 0
    await call(routes['post /tagplay'], { body: { id: '04A1B2C3' } })
    await later()
    assert.deepStrictEqual(player, [])
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'radio')
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

test("a podcast tag keeps to the tile: the parents' choice of episodes and the entry's sorting", () => {
  const dated = (n, extra = {}) => episode(n, { pubDate: `Mon, ${String(n).padStart(2, '0')} Jan 2026 10:00:00 GMT`, ...extra })
  // (a feed that lists the oldest first: the dates decide)
  const items = [dated(1), dated(2), dated(3), dated(4)]
  const pick = (entry, list = items, extra) => tags.pickEpisode(feed(list, extra), { ...podcast, ...entry }).id
  assert.strictEqual(pick({}), 'https://cdn.example/4.mp3', 'the newest by date, not the first of the feed')
  assert.strictEqual(pick({ episodePick: 'oldest:2' }), 'https://cdn.example/2.mp3', 'only the two oldest are on the tile')
  assert.strictEqual(pick({ episodePick: 'newest:2' }, [dated(1), dated(2), dated(3, { _pct: 20 }), dated(4)]), 'https://cdn.example/3.mp3')
  assert.strictEqual(pick({ episodePick: 'newest:1' }, [dated(1, { _pct: 20 }), dated(2), dated(3), dated(4)]), 'https://cdn.example/4.mp3', 'one begun outside the choice does not count')
  assert.strictEqual(pick({ sorting: 'ReleaseDateAscending' }, [dated(1, { _done: true }), dated(2), dated(3), dated(4)]), 'https://cdn.example/2.mp3', 'a series from the oldest: the next one not heard')
  // without internet the feed holds only the episodes on the SD card: no choice applied again
  assert.strictEqual(pick({ episodePick: 'newest:1' }, [dated(1), dated(2)], { _offline: true }), 'https://cdn.example/2.mp3')
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

test('the API part: a tag from a USB reader is listed with its number as typed, and keeps its kind after a restart', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const { host, routes, dataDir } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: false })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    const armed = (await call(routes['post /arm'], { body: { media: book } })).body
    assert.strictEqual(armed.state, 'waiting')
    nfc.feed({ event: 'tag', tech: 'HID', uid: '4006381333931' }, 2)
    await later(0)
    const row = (await call(routes['get /tags'])).body.items[0]
    assert.ok(row.text.includes('4006381333931'), 'as typed, not in pairs')
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'tags.json'), 'utf8')).tags['4006381333931'].tech, 'HID')
    // a chip UID is still written in pairs
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    assert.strictEqual(tags.readData(JSON.parse(fs.readFileSync(path.join(dataDir, 'tags.json'), 'utf8'))).tags['4006381333931'].tech, 'HID')
  } finally {
    global.fetch = realFetch
  }
})

test('the API part: a tag laid on only for a moment starts nothing when taking it off pauses; a known tag is not written at every laying on', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const { host, routes, dataDir } = makeHost({ reader: 'none', onRemove: 'pause', playOnTag: true })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    await call(routes['post /arm'], { body: { media: radio } })
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    nfc.feed({ event: 'gone' })
    await later()
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {}, 'taken off before the display took it')
    const file = path.join(dataDir, 'tags.json')
    const written = fs.statSync(file).mtimeMs
    fs.utimesSync(file, new Date(0), new Date(0))
    await later(2100)
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.ok(written > 0)
    assert.strictEqual(fs.statSync(file).mtimeMs, 0, 'laid on again: not written')
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'radio', 'lying on: it starts')
  } finally {
    global.fetch = realFetch
  }
})

test('the API part: taken off after the display took the start but before it played, it is paused once it comes', async () => {
  const realFetch = global.fetch
  const player = []
  let generation = 6
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'spotify', pause: false, generation }) }
    player.push(u)
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'pause', playOnTag: true })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    await call(routes['post /arm'], { body: { media: radio } })
    nfc.feed({ event: 'tag', tech: 'ISO15693', uid: 'E0040350181B0F84' })
    await later()
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'radio')
    nfc.feed({ event: 'gone' })
    await later()
    assert.ok(!player.some((u) => u.startsWith('http://player.test/pause')), 'nothing plays yet')
    generation = 7 // (the slow start comes)
    await later(1500)
    assert.ok(player.some((u) => u.startsWith('http://player.test/pause?src=nfc')), 'paused once it came')
  } finally {
    global.fetch = realFetch
  }
})

test('the API part: an Audible book and a Jellyfin album go to a tag and the display is told to start them; a whole series is refused', async () => {
  const realFetch = global.fetch
  global.fetch = async (url) => {
    if (String(url).startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'audible', playing: true, origin: 3 }) }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    const ab = { type: 'audible', audibleKind: 'book', id: 'B0ABCDEFGH', artist: 'A', title: 'Buch', category: 'audiobook', cover: '/api/audible/image/51abc?w=500' }
    assert.strictEqual((await call(routes['post /arm'], { body: { media: { ...ab, audibleKind: 'series' } } })).status, 400)
    assert.strictEqual((await call(routes['post /arm'], { body: { media: { type: 'jellyfin', jellyfinKind: 'artist', id: 'x1', title: 'K' } } })).status, 400)
    assert.strictEqual((await call(routes['post /arm'], { body: { media: ab } })).body.state, 'waiting')
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04AABBCC' })
    await later()
    const command = (await call(routes['get /pending'])).body
    assert.deepStrictEqual([command.media.type, command.media.audibleKind, command.media.id], ['audible', 'book', 'B0ABCDEFGH'])
    const jf = { type: 'jellyfin', jellyfinKind: 'album', id: 'a1b2', artist: 'A', title: 'Album', category: 'music' }
    assert.strictEqual((await call(routes['post /arm'], { body: { media: jf } })).body.state, 'waiting')
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04DDEEFF' })
    await later()
    assert.strictEqual((await call(routes['get /pending'])).body.media.jellyfinKind, 'album')
    const kinds = Object.fromEntries((await call(routes['get /tags'])).body.items.map((t) => [t.id, t.text[0]]))
    assert.deepStrictEqual(kinds, { '04AABBCC': 'Audible', '04DDEEFF': 'Jellyfin' })
    assert.strictEqual((await call(routes['post /tagsfor'], { body: { media: ab } })).body.items.map((t) => t.id).join(), '04AABBCC')
  } finally {
    global.fetch = realFetch
  }
})

// ---- the list as a file, and the assignments in a file of their own -----------------------------------------------------------

const assigned = () => {
  const data = tags.emptyData()
  tags.tagLaidOn(data, { target: 'any', media: tags.sanitizeMedia(book), until: NOW + 1000, image: '/cover/own.jpg' }, { uid: '04a1b2c3' }, NOW)
  tags.tagLaidOn(data, { target: 'flex', media: tags.sanitizeMedia(radio), until: NOW + 1000 }, { uid: '04D4E5F6', tech: 'ISO15693' }, NOW + 5)
  tags.tagLaidOn(data, null, { uid: '0A0B0C0D' }, NOW + 9) // seen, no medium
  return data
}

test('the export has the tags that have a medium, in a fixed order, and the flex tag', () => {
  const file = tags.exportData(assigned(), NOW)
  assert.strictEqual(file.format, tags.EXPORT_FORMAT)
  assert.deepStrictEqual([file.count, file.tags.map((t) => t.uid), file.flex, file.exportedAt], [2, ['04A1B2C3', '04D4E5F6'], '04D4E5F6', new Date(NOW).toISOString()])
  assert.deepStrictEqual(Object.keys(file.tags[0]).sort(), ['assignedAt', 'cover', 'image', 'media', 'tech', 'title', 'uid'])
  assert.strictEqual(file.tags[0].image, '/cover/own.jpg')
  assert.strictEqual(file.tags[1].tech, 'ISO15693')
})

test('what an export holds comes back the same through the import - into an empty store', () => {
  const data = assigned()
  const parsed = tags.parseImport(JSON.parse(JSON.stringify(tags.exportData(data, NOW))))
  assert.deepStrictEqual([parsed.ok, parsed.skipped, parsed.flex, parsed.tags.length], [true, 0, '04D4E5F6', 2])
  const empty = tags.emptyData()
  assert.deepStrictEqual(tags.applyImport(empty, parsed, NOW), { added: 2, replaced: 0, removed: 0, skipped: 0 })
  assert.strictEqual(tags.assignmentsDigest(empty), tags.assignmentsDigest(data), 'the same assignments have the same digest')
  assert.notStrictEqual(tags.assignmentsDigest(empty), tags.assignmentsDigest(tags.emptyData()))
  assert.strictEqual(empty.flex, '04D4E5F6')
})

test('an import adds tags and gives a known tag the medium of the file - and keeps what was seen of it', () => {
  const data = assigned()
  const known = data.tags['04A1B2C3']
  const seen = [known.firstSeen, known.lastSeen, known.count]
  const parsed = tags.parseImport({ format: tags.EXPORT_FORMAT, tags: [{ uid: '04-a1-b2-c3', media: radio }, { uid: '11223344', media: book, image: 'https://i.scdn.co/x.jpg' }] })
  assert.deepStrictEqual(tags.applyImport(data, parsed, NOW + 100), { added: 1, replaced: 1, removed: 0, skipped: 0 })
  assert.strictEqual(known.title, 'Kinderradio')
  assert.deepStrictEqual([known.firstSeen, known.lastSeen, known.count], seen)
  assert.strictEqual(data.tags['11223344'].image, 'https://i.scdn.co/x.jpg')
  assert.ok(data.tags['04D4E5F6'].media, 'a tag that is not in the file stays')
  assert.strictEqual(data.flex, '04D4E5F6')
})

test('an import with replace puts the assignments back as the file has them: what is not in it loses its medium', () => {
  const data = assigned()
  const parsed = tags.parseImport({ format: tags.EXPORT_FORMAT, tags: [{ uid: '04A1B2C3', media: radio }] })
  assert.deepStrictEqual(tags.applyImport(data, parsed, NOW + 100, { replace: true }), { added: 0, replaced: 1, removed: 1, skipped: 0 })
  assert.strictEqual(data.tags['04D4E5F6'].media, null)
  assert.strictEqual(data.tags['04D4E5F6'].tech, 'ISO15693', 'the tag is still known')
  assert.strictEqual(data.flex, null, 'the flex tag lost its medium and is no flex tag any more')
  assert.strictEqual(tags.countAssigned(data), 1)
})

test('a file is checked entry by entry: no UID, a medium that cannot be started, a picture that is not an address - skipped or cleaned', () => {
  const parsed = tags.parseImport({
    tags: [
      { uid: 'zz', media: book },
      { uid: '04A1B2C3', media: { type: 'radio', title: 'no address' } },
      { uid: '04A1B2C4', media: book, image: 'javascript:alert(1)', cover: '/cover/ok.jpg', assignedAt: 'x' },
      'nonsense',
      null,
    ],
  })
  assert.deepStrictEqual([parsed.ok, parsed.skipped, parsed.tags.length, parsed.tags[0].image, parsed.tags[0].cover, parsed.tags[0].assignedAt], [true, 4, 1, '', '/cover/ok.jpg', 0])
  for (const bad of [null, 'text', [], {}, { tags: 5 }, { format: 'something-else', tags: [] }]) assert.strictEqual(tags.parseImport(bad).ok, false, JSON.stringify(bad))
  assert.strictEqual(tags.parseImport({ tags: [] }).tags.length, 0)
  // (the tags.json of the extension itself has a map)
  const own = JSON.parse(JSON.stringify(assigned()))
  assert.strictEqual(tags.parseImport(own).tags.length, 2)
  // (not more than the store holds)
  const many = { tags: Array.from({ length: tags.MAX_TAGS + 20 }, (_, i) => ({ uid: (0x10000000 + i).toString(16).toUpperCase(), media: radio })) }
  assert.deepStrictEqual([tags.parseImport(many).tags.length, tags.parseImport(many).skipped], [tags.MAX_TAGS, 20])
})

test('tags.json keeps the digest of the assignments, and a wrong one is dropped', () => {
  const sha = 'a'.repeat(64)
  assert.strictEqual(tags.readData({ tags: {}, assignmentsSha: sha }).assignmentsSha, sha)
  assert.strictEqual(tags.readData({ tags: {}, assignmentsSha: 'x' }).assignmentsSha, '')
  assert.strictEqual(tags.readData(null).assignmentsSha, '')
})

const files = (dir) => fs.readdirSync(dir).filter((n) => !n.endsWith('.tmp')).sort()
const assignmentsPath = (dir) => path.join(dir, 'tag-assignments.json')
const withRoutes = (host) => {
  const routes = {}
  return { host: { ...host, route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler) }, routes }
}
const arm = async (routes, media, uid, nfc) => {
  await call(routes['post /arm'], { body: { media } })
  nfc.feed({ event: 'tag', uid, tech: 'ISO14443A' })
  await later(30)
}

test('the assignments are written to a file of their own, with the copy of the version before, and unchanged assignments do not write it again', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const { host, routes, dataDir } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: false })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    assert.strictEqual(fs.existsSync(assignmentsPath(dataDir)), false, 'nothing assigned: nothing to keep')
    await arm(routes, book, '04A1B2C3', nfc)
    const first = JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8'))
    assert.deepStrictEqual([first.format, first.count, first.tags[0].uid, first.tags[0].media.title], [tags.EXPORT_FORMAT, 1, '04A1B2C3', 'Pippi Langstrumpf'])
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'tags.json'), 'utf8')).assignmentsSha.length, 64)
    const stamp = fs.statSync(assignmentsPath(dataDir)).mtimeMs
    await later(20)
    nfc.feed({ event: 'tag', uid: '04A1B2C3', tech: 'ISO14443A' }) // laid on again: nothing of the assignments changes
    await later(20)
    assert.strictEqual(fs.statSync(assignmentsPath(dataDir)).mtimeMs, stamp)
    await arm(routes, radio, '04D4E5F6', nfc)
    assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).count, 2)
    assert.strictEqual(JSON.parse(fs.readFileSync(`${assignmentsPath(dataDir)}.bak`, 'utf8')).count, 1, 'the version before')
    const day = new Date().toISOString().slice(0, 10)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'backup', `tag-assignments-${day}.json`), 'utf8')).count, 1, 'the first of the day')
    await call(routes['post /tagremove'], { body: { id: '04A1B2C3' } })
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).tags.map((t) => t.uid), ['04D4E5F6'])
  } finally {
    global.fetch = realFetch
  }
})

test('the copies of the days are kept for a week', async () => {
  const { host, routes, dataDir } = makeHost({ reader: 'none' })
  fs.mkdirSync(path.join(dataDir, 'backup'))
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(dataDir, 'backup', `tag-assignments-2020-01-0${d}.json`), '{}')
  fs.writeFileSync(path.join(dataDir, 'backup', 'other.json'), '{}')
  fs.writeFileSync(assignmentsPath(dataDir), JSON.stringify(tags.exportData(assigned(), NOW)))
  require('../api.js').activate(host)
  await call(routes['post /tagremove'], { body: { id: '04A1B2C3' } }) // a change: the copies are made
  const left = files(path.join(dataDir, 'backup'))
  assert.ok(left.includes('other.json'), 'a file of another kind is left alone')
  assert.strictEqual(left.filter((n) => n.startsWith('tag-assignments-')).length, 7, 'the last 7 days, the one of today among them')
  assert.ok(!left.includes('tag-assignments-2020-01-01.json') && left.includes('tag-assignments-2020-01-09.json'))
})

test('start: a tags.json that was lost or is damaged gets its assignments back from the file - and from its copy when the file is damaged too', async () => {
  for (const damage of ['missing', 'damaged']) {
    const made = makeHost({ reader: 'none' })
    fs.writeFileSync(assignmentsPath(made.dataDir), JSON.stringify(tags.exportData(assigned(), NOW)))
    if (damage === 'damaged') fs.writeFileSync(path.join(made.dataDir, 'tags.json'), '{"tags": {"04A1')
    require('../api.js').activate(made.host)
    const list = (await call(made.routes['get /tags'])).body.items
    assert.deepStrictEqual(list.map((i) => i.id).sort(), ['04A1B2C3', '04D4E5F6'], damage)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(made.dataDir, 'tags.json'), 'utf8')).flex, '04D4E5F6')
  }
  const made = makeHost({ reader: 'none' })
  fs.writeFileSync(assignmentsPath(made.dataDir), 'this is no JSON')
  fs.writeFileSync(`${assignmentsPath(made.dataDir)}.bak`, JSON.stringify(tags.exportData(assigned(), NOW)))
  require('../api.js').activate(made.host)
  assert.strictEqual((await call(made.routes['get /tags'])).body.items.length, 2, 'from the copy')
  assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(made.dataDir), 'utf8')).count, 2, 'and the file is written new')
})

test('start: a file put there from outside (a restored backup) replaces the assignments, a file tags.json wrote itself changes nothing', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    const { host, routes, dataDir } = makeHost({ reader: 'none', playOnTag: false })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    await arm(routes, book, '04A1B2C3', nfc)
    const backup = fs.readFileSync(assignmentsPath(dataDir), 'utf8') // the box's backup holds this
    await arm(routes, radio, '04D4E5F6', nfc)
    await call(routes['post /tagremove'], { body: { id: '04A1B2C3' } })
    // restart without a change: nothing is taken over
    const same = withRoutes(host)
    require('../api.js').activate(same.host)
    assert.deepStrictEqual((await call(same.routes['get /tags'])).body.items.map((i) => i.id), ['04D4E5F6'])
    // the backup is restored: the file as it was; the next start has the assignments of that time
    fs.writeFileSync(assignmentsPath(dataDir), backup)
    const restored = withRoutes(host)
    require('../api.js').activate(restored.host)
    assert.deepStrictEqual((await call(restored.routes['get /tags'])).body.items.map((i) => i.id), ['04A1B2C3'], 'the tag of the backup is back, the one made after it has no medium')
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).tags.map((t) => t.uid), ['04A1B2C3'])
  } finally {
    global.fetch = realFetch
  }
})

test('the routes: the list as a file, and a file taken in', async () => {
  const { host, routes, dataDir } = makeHost({ reader: 'none' })
  require('../api.js').activate(host)
  const file = (await call(routes['get /tagexport'])).body
  assert.deepStrictEqual([file.format, file.count], [tags.EXPORT_FORMAT, 0])
  assert.strictEqual((await call(routes['post /tagimport'], { body: {} })).status, 400)
  assert.strictEqual((await call(routes['post /tagimport'], { body: { file: { tags: 'x' } } })).status, 400)
  assert.strictEqual((await call(routes['post /tagimport'], { body: { file: { format: tags.EXPORT_FORMAT, tags: [{ uid: 'no', media: book }] } } })).status, 400, 'nothing in it that can be used')
  const made = tags.exportData(assigned(), NOW)
  const done = await call(routes['post /tagimport'], { body: { file: JSON.parse(JSON.stringify(made)) } })
  assert.deepStrictEqual([done.status, done.body.ok, done.body.added, done.body.replaced, done.body.skipped], [200, true, 2, 0, 0])
  assert.strictEqual((await call(routes['get /tags'])).body.items.length, 2)
  assert.deepStrictEqual((await call(routes['get /tagexport'])).body.tags.map((t) => t.uid), ['04A1B2C3', '04D4E5F6'])
  assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).count, 2, 'the file of the assignments follows')
  const again = await call(routes['post /tagimport'], { body: { file: JSON.parse(JSON.stringify(made)) } })
  assert.deepStrictEqual([again.body.added, again.body.replaced], [0, 2])
})

// ---- the list as a table for Excel ---------------------------------------------------------------------------------------------

test('the table has a header and a row for each tag with a medium; Excel opens it: byte order mark, semicolons, CR LF', () => {
  const csv = tags.exportCsv(assigned(), NOW)
  assert.strictEqual(csv.charCodeAt(0), 0xfeff)
  const lines = csv.slice(1).split('\r\n')
  assert.strictEqual(lines.pop(), '', 'a line break at the end')
  assert.strictEqual(lines.length, 3)
  assert.strictEqual(lines[0], 'UID;Titel;Art;Kategorie;Interpret;Adresse;Flex-Tag;Bild;Cover;Medium (technisch)')
  assert.ok(lines[1].startsWith('04:A1:B2:C3;Pippi Langstrumpf;library;audiobook;Astrid Lindgren;audiobook/Astrid Lindgren/Pippi Langstrumpf;;/cover/own.jpg;'))
  assert.ok(lines[2].startsWith('04:D4:E5:F6;Kinderradio;radio;music;;https://radio.example/stream;ja;;'), 'the flex tag says so')
})

test('a table comes back the same through the import: the medium, the pictures and the flex tag', () => {
  const data = assigned()
  const parsed = tags.parseText(tags.exportCsv(data, NOW))
  assert.deepStrictEqual([parsed.ok, parsed.skipped, parsed.tags.length, parsed.flex], [true, 0, 2, '04D4E5F6'])
  const back = tags.emptyData()
  tags.applyImport(back, parsed, NOW)
  // (what a table does not carry: the kind of chip - the tag says it when it is laid on - and when it was assigned)
  const same = (store) => JSON.stringify(tags.exportData(store, 0).tags.map(({ uid, media, image, cover }) => ({ uid, media, image, cover })))
  assert.strictEqual(same(back), same(data))
  assert.strictEqual(back.flex, data.flex)
})

test('semicolons, quotes, line breaks and what Excel would take for a formula survive the table', () => {
  const data = tags.emptyData()
  const odd = { ...radio, title: '=SUM(A1); "quoted"\nsecond line', artist: '-minus; @at' }
  tags.tagLaidOn(data, { target: 'any', media: tags.sanitizeMedia(odd), until: NOW + 1000 }, { uid: '04A1B2C3' }, NOW)
  const csv = tags.exportCsv(data, NOW)
  assert.ok(csv.includes("\"'=SUM(A1); \"\"quoted\"\"\nsecond line\""), 'a leading = is defused, the rest quoted')
  const media = tags.parseText(csv).tags[0].media
  assert.deepStrictEqual([media.title, media.artist], [odd.title, odd.artist])
  // (the columns alone, without the technical one, give back the text as written: the apostrophe is taken off again)
  const plain = 'UID;Titel;Art;Interpret;Adresse\r\n04A1B2C3;"\'=SUM(A1)";radio;"\'-x";https://r.example/s\r\n'
  const from = tags.parseText(plain).tags[0].media
  assert.deepStrictEqual([from.title, from.artist, from.id], ['=SUM(A1)', '-x', 'https://r.example/s'])
})

test('a table made by hand: kinds by name, English or German headers, commas or tabs, an address is enough', () => {
  const hand = 'uid,type,title,address,flex\n11:22:33:44,Radio,Mein Sender,https://x.example/a,\n55667788,Bibliothek,Ein Buch,audiobook/X/Y,ja\n99AABBCC,nonsense,Nichts,x,\nzz,radio,Ohne UID,https://x.example/b,\n'
  const parsed = tags.parseText(hand)
  assert.deepStrictEqual([parsed.ok, parsed.tags.length, parsed.skipped, parsed.flex], [true, 2, 2, '55667788'])
  assert.deepStrictEqual([parsed.tags[0].media.type, parsed.tags[0].media.category, parsed.tags[0].media.id], ['radio', 'music', 'https://x.example/a'])
  assert.deepStrictEqual([parsed.tags[1].media.type, parsed.tags[1].media.libraryPath], ['library', 'audiobook/X/Y'])
  assert.strictEqual(tags.parseText('Uid\tArt\tAdresse\n11223344\tradio\thttps://x.example/t\n').tags.length, 1, 'tabs')
  assert.strictEqual(tags.parseText('﻿UID;Art;Adresse\r\n11223344;radio;https://x.example/t').tags.length, 1, 'with the mark of Excel, no line break at the end')
})

test('a text that is no list of tags is refused; the JSON of the file made before still works', () => {
  for (const bad of ['', '   ', 'just some words', 'Name;Wert\r\na;b\r\n', '{"nope": 1', '{"format": "other", "tags": []}', '[]']) assert.strictEqual(tags.parseText(bad).ok, false, JSON.stringify(bad))
  const json = JSON.stringify(tags.exportData(assigned(), NOW))
  assert.strictEqual(tags.parseText(json).tags.length, 2)
  assert.strictEqual(tags.parseText(`﻿${json}`).tags.length, 2)
})

test('the routes: the table as { text }, a table taken in as { text }', async () => {
  const { host, routes } = makeHost({ reader: 'none' })
  require('../api.js').activate(host)
  const empty = (await call(routes['get /tagexportcsv'])).body
  assert.strictEqual(empty.text, `﻿${'UID;Titel;Art;Kategorie;Interpret;Adresse;Flex-Tag;Bild;Cover;Medium (technisch)'}\r\n`)
  assert.strictEqual((await call(routes['post /tagimport'], { body: { text: empty.text } })).status, 400, 'a table without a tag')
  assert.strictEqual((await call(routes['post /tagimport'], { body: { text: 'no table' } })).status, 400)
  const done = await call(routes['post /tagimport'], { body: { text: 'UID;Art;Titel;Adresse\r\n11:22:33:44;radio;Mein Sender;https://x.example/a\r\n' } })
  assert.deepStrictEqual([done.status, done.body.added], [200, 1])
  const csv = (await call(routes['get /tagexportcsv'])).body.text
  assert.ok(csv.includes('11:22:33:44;Mein Sender;radio;music;;https://x.example/a;;;;'))
  assert.strictEqual((await call(routes['post /tagimport'], { body: { text: csv } })).body.replaced, 1)
})

test('the spoken messages: a tag without a medium, no WLAN before a station, and the switches', async () => {
  const realFetch = global.fetch
  let network = { onlinestate: 'online', wifi: 'Home', ip: '10.0.0.5', wifisignal: '-50 dBm' }
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/network')) return { ok: true, json: async () => network }
    if (u.startsWith('http://api.test/api/mupihat')) return { ok: true, json: async () => ({}) }
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false, generation: 1 }) }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const settings = { reader: 'none', onRemove: 'nothing', playOnTag: true }
    const { host, routes } = makeHost(settings)
    const said = []
    host.say = async (text) => (said.push(text), true)
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    // a tag nobody gave a medium to
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0A0A0A0A' })
    await later()
    assert.deepStrictEqual(said, ['Dieser NFC-Tag wurde noch nicht zugeordnet.'])
    // the same tag again at once: not said again
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0A0A0A0A' })
    await later()
    assert.strictEqual(said.length, 1)
    // a station on a box without WLAN: said, and the start is made anyway
    // (the box is still busy saying the first one: the next waits until it is said)
    await later(3600)
    await call(routes['post /arm'], { body: { media: radio } })
    said.length = 0
    network = { onlinestate: 'offline', wifi: '', ip: '' }
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0B0B0B0B' })
    await later(60)
    assert.deepStrictEqual(said, ['Ich habe keine Verbindung zum WLAN-Router.'])
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'radio', 'the start is tried')
    // an album of the SD card needs no WLAN; with the switch off nothing is said
    settings.sayTagNewOn = false
    said.length = 0
    await later(3600)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0C0C0C0C' })
    await later()
    assert.deepStrictEqual(said, [])
  } finally {
    global.fetch = realFetch
  }
})

// ---- review 0.12.3 -------------------------------------------------------------------------------------------------------------

const importTags = (routes, list) => call(routes['post /tagimport'], { body: { file: { tags: list } } })

test('start: a damaged or missing file of the assignments does not bring back an older copy over an intact tags.json', async () => {
  const { host, routes, dataDir } = makeHost({ reader: 'none' })
  require('../api.js').activate(host)
  await importTags(routes, [{ uid: '04A1B2C3', media: radio }])
  await importTags(routes, [{ uid: '04A1B2C4', media: book }])
  const bak = fs.readFileSync(`${assignmentsPath(dataDir)}.bak`, 'utf8')
  assert.strictEqual(JSON.parse(bak).count, 1)
  for (const damage of ['damaged', 'missing']) {
    if (damage === 'damaged') fs.writeFileSync(assignmentsPath(dataDir), '{"format":"mupibox-nfc-ta')
    else fs.rmSync(assignmentsPath(dataDir))
    const again = withRoutes(host)
    require('../api.js').activate(again.host)
    assert.deepStrictEqual((await call(again.routes['get /tags'])).body.items.map((i) => i.id).sort(), ['04A1B2C3', '04A1B2C4'], damage)
    assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).count, 2, `${damage}: the file is written anew`)
    assert.strictEqual(fs.readFileSync(`${assignmentsPath(dataDir)}.bak`, 'utf8'), bak, `${damage}: the good copy is not replaced by the damaged file`)
  }
})

test('a file of the assignments that cannot be written: tags.json does not claim it, and the next start keeps the newer assignments', async () => {
  const { host, routes, dataDir } = makeHost({ reader: 'none' })
  require('../api.js').activate(host)
  await importTags(routes, [{ uid: '04A1B2C3', media: radio }])
  const realRename = fs.renameSync
  fs.renameSync = (from, to) => {
    if (String(to).endsWith('tag-assignments.json')) throw new Error('no space left on device')
    return realRename(from, to)
  }
  try {
    await importTags(routes, [{ uid: '04A1B2C4', media: book }])
  } finally {
    fs.renameSync = realRename
  }
  assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).count, 1, 'the older file is still there')
  const again = withRoutes(host)
  require('../api.js').activate(again.host)
  assert.deepStrictEqual((await call(again.routes['get /tags'])).body.items.map((i) => i.id).sort(), ['04A1B2C3', '04A1B2C4'])
  assert.strictEqual(JSON.parse(fs.readFileSync(assignmentsPath(dataDir), 'utf8')).count, 2, 'and written now')
})

test('a start that waited (the network said, a feed) is dropped when a newer one came meanwhile; the same report twice starts once', async () => {
  const realFetch = global.fetch
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/network')) return { ok: true, json: async () => ({ onlinestate: 'offline', wifi: '', ip: '' }) }
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false, generation: 1 }) }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const box = async () => {
      const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
      // (the voice says it, and answers when it is said)
      const waiting = []
      host.say = () => new Promise((resolve) => waiting.push(() => resolve(true)))
      const nfc = require('../api.js').activate(host)
      await later(0)
      feedReady(nfc)
      await importTags(routes, [{ uid: '0A0A0A0A', media: radio }, { uid: '0B0B0B0B', media: book }])
      return { nfc, routes, waiting }
    }
    // the station: "no WLAN" is being said - meanwhile the child lays the book on
    const one = await box()
    one.nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0A0A0A0A' })
    await later()
    assert.strictEqual(one.waiting.length, 1)
    one.nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0B0B0B0B' })
    await later()
    one.waiting.shift()()
    await later()
    assert.strictEqual((await call(one.routes['get /pending'])).body.media?.type, 'library', 'the book, laid on last')
    assert.deepStrictEqual((await call(one.routes['get /pending'])).body, {}, 'the station does not replace it afterwards')
    // the same tag reported twice while its message is said: it starts once
    const two = await box()
    two.nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0A0A0A0A' })
    await later()
    two.nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '0A0A0A0A' })
    await later()
    assert.strictEqual(two.waiting.length, 1)
    two.waiting.shift()()
    await later()
    assert.strictEqual((await call(two.routes['get /pending'])).body.media?.type, 'radio')
    assert.deepStrictEqual((await call(two.routes['get /pending'])).body, {})
  } finally {
    global.fetch = realFetch
  }
})

// (a made-up driver program: the readers run, what they report is handed in with feed)
const fakeSpawn = () => {
  const made = []
  const spawnFn = () => {
    const proc = new (require('node:events').EventEmitter)()
    proc.stdout = new (require('node:events').EventEmitter)()
    proc.stderr = new (require('node:events').EventEmitter)()
    proc.kill = () => setImmediate(() => proc.emit('exit', null, 'SIGTERM'))
    made.push(proc)
    return proc
  }
  return { spawnFn, made }
}

test('two readers: a tag taken off one while it lies on the other is not gone; after a restart each tag keeps its own protection', async () => {
  const realFetch = global.fetch
  const player = []
  let generation = 1
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: true, generation }) }
    if (u.startsWith('http://player.test/')) player.push(u)
    return { ok: true, json: async () => ({}) }
  }
  try {
    const settings = { reader: 'rc522', reader2On: true, reader2: 'rc522', spiDevice2: '0.1', onRemove: 'pause', playOnTag: true }
    const { host, routes } = makeHost(settings)
    const { spawnFn, made } = fakeSpawn()
    host.spawnFn = spawnFn
    const nfc = require('../api.js').activate(host)
    for (let i = 0; i < 100 && made.length < 2; i++) await later(20)
    assert.strictEqual(made.length, 2, 'both drivers started')
    nfc.feed({ event: 'ready', firmware: '2.0', product: 'MFRC522' }, 1)
    nfc.feed({ event: 'ready', firmware: '2.0', product: 'MFRC522' }, 2)
    await importTags(routes, [{ uid: '04A1B2C3', media: book }, { uid: '04D4E5F6', media: radio }])
    // the book on reader 1: it starts; then the same tag is laid on reader 2 too, and taken off reader 1
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' }, 1)
    await later()
    assert.strictEqual((await call(routes['get /pending'])).body.media?.type, 'library')
    generation = 2 // (the display started it)
    await later(1100)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' }, 2)
    await later()
    nfc.feed({ event: 'gone' }, 1)
    await later()
    assert.ok(!player.some((u) => u.includes('/pause')), 'it still lies on reader 2: not paused')
    nfc.feed({ event: 'gone' }, 2)
    await later()
    assert.ok(player.some((u) => u.startsWith('http://player.test/pause')), 'taken off the last reader: paused')

    // a tag on each reader, then both drivers fall over and report their tags anew: neither starts again
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' }, 1)
    await later()
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04D4E5F6' }, 2)
    await later()
    await call(routes['get /pending'])
    made[0].emit('exit', 1, null)
    made[1].emit('exit', 1, null)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' }, 1)
    await later()
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04D4E5F6' }, 2)
    await later()
    assert.deepStrictEqual((await call(routes['get /pending'])).body, {}, 'both play already: nothing starts anew')
  } finally {
    global.fetch = realFetch
  }
})

test('without the DSI display a Jellyfin and an Audible tag are started as the display starts them', async () => {
  const realFetch = global.fetch
  const player = []
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false, generation: 1 }) }
    if (u.startsWith('http://player.test/')) player.push(u)
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
    host.config = () => ({ mupibox: { headless: true } })
    require('../api.js').activate(host)
    await later(0)
    await importTags(routes, [
      { uid: '04000001', media: { type: 'jellyfin', jellyfinKind: 'playlist', id: 'p 1', title: 'Liste', cover: 'http://box.local/api/jellyfin/image/p1' } },
      { uid: '04000002', media: { type: 'jellyfin', jellyfinKind: 'album', id: 'a1', title: 'Album' } },
      { uid: '04000003', media: { type: 'audible', audibleKind: 'book', id: 'B0ABCDEFGH', title: 'Buch', cover: '/api/audible/image/51abc?w=500' } },
    ])
    for (const id of ['04000001', '04000002', '04000003']) {
      await call(routes['post /tagplay'], { body: { id } })
      await later()
    }
    assert.deepStrictEqual(player, [
      'http://player.test/current/musicsearch/jellyfin/playlist:p%201?cover=%2Fapi%2Fjellyfin%2Fimage%2Fp1&src=nfc',
      'http://player.test/current/musicsearch/jellyfin/album:a1?src=nfc',
      'http://player.test/current/musicsearch/audible/book:B0ABCDEFGH?cover=%2Fapi%2Faudible%2Fimage%2F51abc%3Fw%3D500&src=nfc',
    ])
  } finally {
    global.fetch = realFetch
  }
})

test('the battery message waits: not with nothing playing, not in a quiet time or the evening - then at the next tag, once', async () => {
  const realFetch = global.fetch
  let playing = false
  let quiet = false
  let evening = false
  global.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/mupihat')) return { ok: true, json: async () => ({ Bat_Percent: 8, Ibat: -300, BatteryConnected: 1, Measurement_Valid: true }) }
    if (u.startsWith('http://api.test/api/playtime')) return { ok: true, json: async () => ({ playtime: { state: 'normal' }, quiet: { inWindow: quiet } }) }
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing, generation: 1 }) }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true })
    const said = []
    host.say = async (text) => (said.push(text), true)
    host.nightDim = async () => ({ share: evening ? 1 : 0, dimmed: evening })
    const nfc = require('../api.js').activate(host)
    await later(0)
    feedReady(nfc)
    await importTags(routes, [{ uid: '04A1B2C3', media: book }])
    await nfc.checkBattery()
    assert.deepStrictEqual(said, [], 'nothing plays: nobody hears it')
    playing = true
    quiet = true
    await nfc.checkBattery()
    assert.deepStrictEqual(said, [], 'a quiet time')
    quiet = false
    evening = true
    await nfc.checkBattery()
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.deepStrictEqual(said, [], 'the evening: also not at a tag')
    evening = false
    playing = false
    await nfc.checkBattery()
    assert.deepStrictEqual(said, [])
    await later(2100)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.deepStrictEqual(said, ['Bitte stecke mich zum Laden an.'], 'at the next tag laid on')
    playing = true
    await nfc.checkBattery()
    await later(2100)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    assert.strictEqual(said.length, 1, 'once')
  } finally {
    global.fetch = realFetch
  }
})

test('I2C is not switched off while the MuPiHAT is on (its battery chip is on the bus)', async () => {
  const { host, routes } = makeHost({ reader: 'none' })
  host.config = () => ({ mupihat: { hat_active: true } })
  require('../api.js').activate(host)
  const answer = await call(routes['post /iicoff'])
  assert.deepStrictEqual([answer.status, answer.body.ok, answer.body.error], [409, false, 'refused'])
  assert.match(answer.body.message, /MuPiHAT/)
})

test('imported tags count as seen now: a full store does not drop them at once', () => {
  const data = tags.emptyData()
  for (let i = 0; i < tags.MAX_TAGS; i++) tags.tagLaidOn(data, { target: 'any', media: tags.sanitizeMedia(radio), until: NOW + 1000 }, { uid: (0x10000000 + i).toString(16) }, NOW)
  const parsed = tags.parseImport({ tags: [{ uid: '04A1B2C3', media: book }] })
  assert.deepStrictEqual(tags.applyImport(data, parsed, NOW + 1000).added, 1)
  assert.ok(data.tags['04A1B2C3']?.media, 'the imported tag is there')
  assert.strictEqual(data.tags['04A1B2C3'].lastSeen, NOW + 1000)
  assert.strictEqual(Object.keys(data.tags).length, tags.MAX_TAGS)
})

test('a table made by hand: Jellyfin with its kind in the address (an id alone is an album), Audible with the ASIN', () => {
  const hand = 'UID;Art;Titel;Adresse\r\n04000001;Jellyfin;Liste;playlist:abc123\r\n04000002;jellyfin;Album;def456\r\n04000003;Jellyfin;Hörbuch;book:ghi789\r\n04000004;Audible;Buch;B0ABCDEFGH\r\n04000005;Jellyfin;Künstler;artist:x\r\n'
  const parsed = tags.parseText(hand)
  assert.deepStrictEqual([parsed.ok, parsed.tags.length, parsed.skipped], [true, 4, 1], 'a whole artist is no medium')
  const kinds = parsed.tags.map((t) => [t.uid, t.media.type, t.media.jellyfinKind ?? t.media.audibleKind, t.media.id])
  assert.deepStrictEqual(kinds, [
    ['04000001', 'jellyfin', 'playlist', 'abc123'],
    ['04000002', 'jellyfin', 'album', 'def456'],
    ['04000003', 'jellyfin', 'book', 'ghi789'],
    ['04000004', 'audible', 'book', 'B0ABCDEFGH'],
  ])
  // (the table the box writes says it the same way, and comes back without its technical column too)
  const data = tags.emptyData()
  tags.applyImport(data, parsed, NOW)
  const csv = tags.exportCsv(data, NOW)
  assert.ok(csv.includes(';jellyfin;audiobook;;playlist:abc123;'), csv)
  assert.ok(csv.includes(';audible;audiobook;;B0ABCDEFGH;'), csv)
  const columns = csv.split('\r\n').map((line) => line.split(';').slice(0, 6).join(';')).join('\r\n')
  assert.deepStrictEqual(tags.parseText(columns).tags.map((t) => [t.media.type, t.media.jellyfinKind ?? t.media.audibleKind, t.media.id]), kinds.map(([, type, kind, id]) => [type, kind, id]))
})
