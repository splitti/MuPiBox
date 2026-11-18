// The rotary knob chooses among the albums of an artist cover: the state machine (rotary.js), and the whole way through the API part -
// assign an artist cover, lay the tag on, turn, press - with a made-up host.  node --test extensions/nfc/test/rotary.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const rotary = require('../rotary.js')
const tags = require('../tags.js')

const album = (title) => ({ type: 'library', category: 'audiobook', artist: 'Astrid Lindgren', title, libraryPath: `audiobook/Astrid Lindgren/${title}`, libraryIsContainer: false, cover: `/api/library/file?path=${title}` })
const children = [album('Ronja'), album('Michel'), album('Pippi'), { type: 'library', category: 'audiobook', artist: 'Astrid Lindgren', title: 'Astrid Lindgren', libraryPath: 'audiobook/Astrid Lindgren', libraryIsContainer: true, ownFiles: true }]
const folder = { browse: 'folder', browseTitle: 'Astrid Lindgren', browsePath: 'audiobook/Astrid Lindgren', browseCover: '/api/library/file?path=a', title: 'Astrid Lindgren', category: 'audiobook' }

// ---- the state machine ------------------------------------------------------------------------------------------------------------
const three = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

test('the knob starts on the album the tag plays and goes round in both directions', () => {
  const start = rotary.begin({ uid: 'AA', albums: three, currentKey: 'b', seconds: 30, now: 0 })
  assert.strictEqual(start.index, 1)
  const forward = rotary.turn(start, 1, 1000)
  assert.deepStrictEqual([forward.shown.index, forward.shown.count, forward.shown.album.key], [2, 3, 'c'])
  assert.strictEqual(rotary.turn(forward.state, 1, 2000).shown.index, 0, 'after the last one comes the first')
  assert.strictEqual(rotary.turn(rotary.turn(start, -1, 1000).state, -1, 2000).shown.index, 2, 'and before the first the last')
})

test('an album that is not in the list: the knob starts at the first', () => {
  assert.strictEqual(rotary.begin({ uid: 'AA', albums: three, currentKey: 'gone', seconds: 5, now: 0 }).index, 0)
})

test('a press chooses only after the knob was turned; then the knob stays on that album and can choose again', () => {
  const start = rotary.begin({ uid: 'AA', albums: three, currentKey: 'a', seconds: 30, now: 0 })
  assert.strictEqual(rotary.press(start, 100), null, 'not turned yet: the press is for what the box does otherwise')
  const turned = rotary.turn(start, 1, 200)
  const pressed = rotary.press(turned.state, 300)
  assert.strictEqual(pressed.album.key, 'b')
  // (the knob is still the knob of the albums of this tag: on the one that plays now, with the time anew, and a press chooses nothing until it is turned)
  assert.strictEqual(rotary.isActive(pressed.state, 301), true)
  assert.strictEqual(rotary.press(pressed.state, 350), null)
  assert.strictEqual(rotary.turn(pressed.state, 1, 400).shown.album.key, 'c')
  assert.strictEqual(rotary.isActive(pressed.state, 300 + 30000), false, 'the time runs from the press')
  assert.strictEqual(rotary.isActive(pressed.state, 300 + 29999), true)
})

test('the time: every turn starts it anew, when it is over the knob is the box again', () => {
  const start = rotary.begin({ uid: 'AA', albums: three, currentKey: 'a', seconds: 10, now: 0 })
  assert.strictEqual(rotary.isActive(start, 9999), true)
  assert.strictEqual(rotary.isActive(start, 10000), false)
  const turned = rotary.turn(start, 1, 9000)
  assert.strictEqual(rotary.isActive(turned.state, 18999), true)
  assert.strictEqual(rotary.turn(turned.state, 1, 19000), null)
  assert.strictEqual(rotary.press(turned.state, 19000), null)
})

test('0 seconds: no time limit - the knob stays the knob of the albums until another tag is laid on', () => {
  const start = rotary.begin({ uid: 'AA', albums: three, currentKey: 'a', seconds: 0, now: 0 })
  const day = 24 * 3600 * 1000
  assert.strictEqual(rotary.isActive(start, day), true)
  const turned = rotary.turn(start, 1, day)
  assert.strictEqual(turned.shown.album.key, 'b')
  assert.strictEqual(rotary.isActive(turned.state, 3 * day), true, 'every turn keeps it without a limit')
  const pressed = rotary.press(turned.state, 3 * day)
  assert.strictEqual(pressed.album.key, 'b')
  assert.strictEqual(rotary.isActive(pressed.state, 3 * day + 1), true, 'a choice does not end it: another tag does')
})

test('one album, or none: there is nothing to choose from', () => {
  assert.strictEqual(rotary.isActive(rotary.begin({ uid: 'AA', albums: [{ key: 'a' }], currentKey: 'a', seconds: 30, now: 0 }), 1), false)
  assert.strictEqual(rotary.isActive(rotary.idle(), 1), false)
})

// ---- the collection in the medium -------------------------------------------------------------------------------------------------
test('a collection travels inside the medium of an album; one that points at nothing is dropped', () => {
  const collection = tags.collectionOf(folder)
  const media = tags.inCollection(album('Pippi'), collection)
  assert.deepStrictEqual([media.browse, media.browsePath, media.browseTitle, media.libraryPath], ['folder', 'audiobook/Astrid Lindgren', 'Astrid Lindgren', 'audiobook/Astrid Lindgren/Pippi'])
  assert.strictEqual(tags.mediaLabel(media), 'Astrid Lindgren', 'the tag is named after the artist cover')
  assert.strictEqual(tags.sanitizeMedia({ ...album('Pippi'), browse: 'folder' }).browse, undefined, 'a folder without a path')
  assert.strictEqual(tags.sanitizeMedia({ ...album('Pippi'), browse: 'entries' }).browse, undefined, 'entries without an artist')
  assert.strictEqual(tags.sanitizeMedia({ ...album('Pippi'), browse: 'sideways', browsePath: 'x' }).browse, undefined)
  assert.strictEqual(tags.sanitizeMedia(folder), null, 'the description alone is no medium that can start')
})

test('the tags of one collection are the same medium, whichever album each plays; the albums are told apart', () => {
  const collection = tags.collectionOf(folder)
  const a = tags.inCollection(album('Pippi'), collection)
  const b = tags.inCollection(album('Ronja'), collection)
  assert.strictEqual(tags.mediumKey(a), tags.mediumKey(b))
  assert.strictEqual(tags.mediumKey(folder), tags.mediumKey(a), 'the description of the app finds them')
  assert.notStrictEqual(tags.albumKey(a), tags.albumKey(b))
  assert.notStrictEqual(tags.mediumKey(a), tags.mediumKey(album('Pippi')), 'not the same as the album alone')
})

test('saving the tags and taking them in again keeps the collection', () => {
  const data = tags.emptyData()
  const media = tags.inCollection(album('Pippi'), tags.collectionOf(folder))
  tags.tagLaidOn(data, { target: 'any', media, until: 1e15 }, { uid: '04A1B2C3' }, 1000)
  const parsed = tags.parseImport(JSON.parse(JSON.stringify(tags.exportData(data))))
  assert.strictEqual(parsed.tags[0].media.browsePath, 'audiobook/Astrid Lindgren')
  const again = tags.parseText(tags.exportCsv(data, 1000)).tags[0].media
  assert.strictEqual(again.browse, 'folder')
})

// ---- the API part ---------------------------------------------------------------------------------------------------------------------
// The pins of the album knob (its own three pins; without them there is no knob)
const KNOB = { knobA: 5, knobB: 6, knobButton: 13 }
function makeHost(settings) {
  const routes = {}
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-rotary-'))
  // (the driver of the knob: a made-up program that says nothing)
  const started = []
  const spawnFn = (command, args) => {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = () => setImmediate(() => proc.emit('exit', null, 'SIGTERM'))
    proc.command = command
    proc.args = args
    started.push(proc)
    return proc
  }
  const host = {
    spawnFn,
    dir: path.join(__dirname, '..'),
    dataDir,
    log: { info() {}, warn() {}, debug() {} },
    apiUrl: 'http://api.test',
    playerUrl: 'http://player.test',
    settings: async () => settings,
    onSettings() {},
    route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler),
  }
  return { host, routes, dataDir, started }
}
const call = async (handler, req = {}) => {
  const out = { status: 200, body: null }
  const res = { status: (code) => ((out.status = code), res), json: (body) => ((out.body = body), res) }
  await handler({ query: {}, body: {}, headers: {}, socket: { remoteAddress: '127.0.0.1' }, ...req }, res)
  return out
}
const later = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

test('an artist cover: assigned, laid on, the knob chooses an album, a press plays it, the OLED shows the name', async () => {
  const realFetch = global.fetch
  const oled = []
  global.fetch = async (url, init) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/library/children')) return { ok: true, json: async () => children }
    if (u.startsWith('http://api.test/api/ext/oled/select')) {
      oled.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ ok: true }) }
    }
    if (u.startsWith('http://player.test/local')) return { ok: true, json: async () => ({ currentPlayer: 'mplayer', currentType: 'local', playing: false, generation: 1 }) }
    return { ok: true, json: async () => ({}) }
  }
  try {
    const { host, routes, dataDir } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true, ...KNOB, rotarySeconds: 20 })
    const nfc = require('../api.js').activate(host)
    await later(0)
    nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })

    // the app sends the artist cover; the albums come from the box in the order of their names, the first plays at first
    const armed = (await call(routes['post /arm'], { body: { media: folder } })).body
    assert.strictEqual(armed.ok, true)
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    const first = (await call(routes['get /pending'])).body
    assert.strictEqual(first.media.libraryPath, 'audiobook/Astrid Lindgren/Michel')

    // the row of the tag has the list of albums with the one it plays; another one can be chosen for the laying on
    const row = (await call(routes['get /tags'])).body.items[0]
    assert.strictEqual(row.title, 'Astrid Lindgren')
    assert.deepStrictEqual(row.select.choices.map((c) => c.label), ['Michel', 'Pippi', 'Ronja'])
    assert.strictEqual(row.select.post, '/api/ext/nfc/tagalbum')
    assert.deepStrictEqual((await call(routes['post /tagsfor'], { body: { media: folder } })).body.items.map((t) => t.id), ['04A1B2C3'], 'the sheet of the artist cover finds it')
    assert.strictEqual((await call(routes['post /tagalbum'], { body: { id: '04A1B2C3', value: 'nope' } })).status, 400)

    // a press before turning chooses nothing
    const shown = oled.length
    await nfc.feedKnob({ event: 'button' })
    assert.strictEqual(oled.length, shown)
    assert.strictEqual((await call(routes['get /pending'])).body.media, undefined)

    // turn: the display shows the name; again; back; a press plays that album and the display goes back to the player
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.deepStrictEqual(oled.at(-1), { title: 'Pippi', artist: 'Astrid Lindgren', index: 2, count: 3, seconds: 10 })
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.strictEqual(oled.at(-1).title, 'Ronja')
    nfc.feedKnob({ event: 'turn', direction: -1 })
    assert.strictEqual(oled.at(-1).title, 'Pippi')
    await nfc.feedKnob({ event: 'button' })
    assert.deepStrictEqual(oled.at(-1), { clear: true })
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Pippi')
    // (the choice is made, the knob goes on: from the album that plays, to the next one)
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.strictEqual(oled.at(-1).title, 'Ronja')
    await nfc.feedKnob({ event: 'button' })
    assert.deepStrictEqual(oled.at(-1), { clear: true })
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Ronja')
    // (there is no route for the knob any more: the core's knobs have nothing to do with the albums)
    assert.strictEqual(routes['post /rotary'], undefined)

    // what the knob chose does not change what the tag plays when it is laid on; the list does
    assert.strictEqual((await call(routes['post /tagalbum'], { body: { id: '04A1B2C3', value: row.select.choices[2].value } })).body.ok, true)
    assert.strictEqual((await call(routes['get /tags'])).body.items[0].select.value, row.select.choices[2].value)
    // (more than the two seconds the same tag counts as one report after the start the knob made)
    await later(2100)
    nfc.feed({ event: 'gone' })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later(50)
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Ronja')
  } finally {
    global.fetch = realFetch
  }
})

test('0 seconds in the settings: the knob stays taken over, the display still goes back after 10 seconds, another tag ends it', async () => {
  const realFetch = global.fetch
  const oled = []
  global.fetch = async (url, init) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/library/children')) return { ok: true, json: async () => children }
    if (u.startsWith('http://api.test/api/ext/oled/select')) {
      oled.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ ok: true }) }
    }
    return { ok: true, json: async () => ({ currentPlayer: '', playing: false }) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true, ...KNOB, rotarySeconds: 0 })
    const nfc = require('../api.js').activate(host)
    await later(0)
    nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })
    await call(routes['post /arm'], { body: { media: folder } })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.deepStrictEqual(oled.at(-1), { title: 'Pippi', artist: 'Astrid Lindgren', index: 2, count: 3, seconds: 10 })
    // (another tag, no collection: the choice is over and the display shows the player)
    nfc.feed({ event: 'gone' })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04FFEEDD' })
    await later(50)
    assert.deepStrictEqual(oled.at(-1), { clear: true })
    const after = oled.length
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.strictEqual(oled.length, after)
  } finally {
    global.fetch = realFetch
  }
})

test('turned but nothing chosen: after 10 seconds the display goes back to the player and a press chooses nothing until the next turn', async () => {
  const realFetch = global.fetch
  const realTimeout = global.setTimeout
  const oled = []
  let browse = null
  // (only the timer of the display is held back: the test fires it itself)
  global.setTimeout = (fn, ms, ...rest) => {
    if (ms === 10000) {
      browse = fn
      return { unref() {} }
    }
    return realTimeout(fn, ms, ...rest)
  }
  global.fetch = async (url, init) => {
    const u = String(url)
    if (u.startsWith('http://api.test/api/library/children')) return { ok: true, json: async () => children }
    if (u.startsWith('http://api.test/api/ext/oled/select')) {
      oled.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ ok: true }) }
    }
    return { ok: true, json: async () => ({ currentPlayer: '', playing: false }) }
  }
  try {
    const { host, routes } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true, ...KNOB, rotarySeconds: 0 })
    const nfc = require('../api.js').activate(host)
    await later(0)
    nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })
    await call(routes['post /arm'], { body: { media: folder } })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.strictEqual(oled.at(-1).seconds, 10)
    assert.ok(browse, 'a timer of 10 seconds runs')
    browse()
    assert.deepStrictEqual(oled.at(-1), { clear: true })
    // (a press now chooses nothing - the display shows the player, not an album)
    const shown = oled.length
    await nfc.feedKnob({ event: 'button' })
    assert.strictEqual(oled.length, shown)
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Michel', 'still the album the tag started')
    // (turning again shows the album next to the one it stood on, and a press chooses it)
    nfc.feedKnob({ event: 'turn', direction: 1 })
    assert.strictEqual(oled.at(-1).title, 'Ronja')
    await nfc.feedKnob({ event: 'button' })
    assert.strictEqual((await call(routes['get /pending'])).body.media.libraryPath, 'audiobook/Astrid Lindgren/Ronja')
  } finally {
    global.fetch = realFetch
    global.setTimeout = realTimeout
  }
})

test('without the three pins of the knob there is no knob: no driver, and a tag of a collection takes nothing over', async () => {
  const realFetch = global.fetch
  global.fetch = async (url) => (String(url).startsWith('http://api.test/api/library/children') ? { ok: true, json: async () => children } : { ok: true, json: async () => ({ currentPlayer: '' }) })
  try {
    for (const pins of [{}, { knobA: 5, knobB: 6 }, { knobA: 5, knobB: 5, knobButton: 13 }, { knobA: 1, knobB: 6, knobButton: 13 }]) {
      const { host, routes, started } = makeHost({ reader: 'none', onRemove: 'nothing', playOnTag: true, ...pins })
      const nfc = require('../api.js').activate(host)
      await later(0)
      nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })
      assert.strictEqual(started.length, 0, JSON.stringify(pins))
      await call(routes['post /arm'], { body: { media: folder } })
      nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
      await later()
      const before = await call(routes['get /pending'])
      assert.ok(before.body.media, 'the tag plays its first album as always')
      // (a detent from nowhere changes nothing)
      nfc.feedKnob({ event: 'turn', direction: 1 })
    }
  } finally {
    global.fetch = realFetch
  }
})

test('a folder the box cannot read is no collection to assign', async () => {
  const realFetch = global.fetch
  global.fetch = async () => ({ ok: false, json: async () => [] })
  try {
    const { host, routes } = makeHost({ reader: 'none' })
    const nfc = require('../api.js').activate(host)
    await later(0)
    nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })
    assert.strictEqual((await call(routes['post /arm'], { body: { media: folder } })).status, 400)
  } finally {
    global.fetch = realFetch
  }
})

test('the entries of an artist cover: the albums of the artist in the category, the names the parents gave count, no radio or resume entry', async () => {
  const realFetch = global.fetch
  const items = [
    { type: 'spotify', category: 'music', artist: 'Die drei ???', title: 'Folge 2', id: 'alb2' },
    { type: 'spotify', category: 'music', artist: 'Die drei ???', title: 'Folge 1', id: 'alb1' },
    { type: 'spotify', category: 'music', artist: 'Die drei Fragezeichen', title: 'Folge 3', artist_override: 'Die drei ???', title_override: 'Folge 3 (neu)', id: 'alb3' },
    { type: 'spotify', category: 'audiobook', artist: 'Die drei ???', title: 'Anderes Fach', id: 'alb9' },
    { type: 'spotify', category: 'music', artist: 'Bibi', title: 'Bibi 1', id: 'alb7' },
    { type: 'spotify', category: 'music', artist: 'Die drei ???', title: 'Weiter', id: 'alb8', isResume: true },
    { type: 'spotify', artistid: 'art1', category: 'music', artist: 'Die drei ???', title: 'Alle' },
  ]
  global.fetch = async (url) => (String(url).startsWith('http://api.test/api/data') ? { ok: true, json: async () => items } : { ok: true, json: async () => ({ currentPlayer: '' }) })
  try {
    const { host, routes } = makeHost({ reader: 'none', playOnTag: true })
    const nfc = require('../api.js').activate(host)
    await later(0)
    nfc.feed({ event: 'ready', firmware: '4.0', product: '4.0' })
    const description = { browse: 'entries', browseTitle: 'Die drei ???', browseArtist: 'Die drei ???', browseCategory: 'music', title: 'Die drei ???' }
    await call(routes['post /arm'], { body: { media: description } })
    nfc.feed({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
    await later()
    const row = (await call(routes['get /tags'])).body.items[0]
    assert.deepStrictEqual(row.select.choices.map((c) => c.label), ['Folge 1', 'Folge 2', 'Folge 3 (neu)'])
    assert.strictEqual((await call(routes['get /pending'])).body.media.id, 'alb1', 'the first album plays at first')
  } finally {
    global.fetch = realFetch
  }
})

test('the album knob: its driver starts with the three pins of the settings and ends when they are taken away', async () => {
  const { host, started } = makeHost({ reader: 'none', ...KNOB })
  const nfc = require('../api.js').activate(host)
  await later(20)
  assert.strictEqual(started.length, 1)
  assert.deepStrictEqual(started[0].args.slice(1), ['--chip', '0', '--a', '5', '--b', '6', '--button', '13'])
  assert.match(started[0].args[0], /knob\.py$/)
  assert.ok(nfc)
})

test('the pins of the album knob are read from the settings', () => {
  const logic = require('../logic.js')
  assert.deepStrictEqual(logic.knobConfig({ knobA: 5, knobB: 6, knobButton: 13 }), { a: 5, b: 6, button: 13 })
  for (const bad of [undefined, {}, { knobA: 5, knobB: 6 }, { knobA: 0, knobB: 6, knobButton: 13 }, { knobA: 5, knobB: 5, knobButton: 13 }, { knobA: 28, knobB: 6, knobButton: 13 }, { knobA: '5', knobB: 6, knobButton: 13 }]) {
    assert.strictEqual(logic.knobConfig(bad), null, JSON.stringify(bad))
  }
  assert.deepStrictEqual(logic.knobArgs({ a: 5, b: 6, button: 13 }, 4), ['--chip', '4', '--a', '5', '--b', '6', '--button', '13'])
})

test('the reports of the knob driver are read; a direction that is not one is not', () => {
  const { readEvent } = require('../logic.js')
  assert.deepStrictEqual(readEvent({ event: 'turn', direction: 1 }), { event: 'turn', direction: 1 })
  assert.deepStrictEqual(readEvent({ event: 'turn', direction: -1 }), { event: 'turn', direction: -1 })
  assert.strictEqual(readEvent({ event: 'turn', direction: 2 }), null)
  assert.strictEqual(readEvent({ event: 'turn' }), null)
  assert.deepStrictEqual(readEvent({ event: 'button' }), { event: 'button' })
})
