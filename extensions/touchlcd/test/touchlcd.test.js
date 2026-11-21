// Tests of the touch display extension without a display: the settings, the library as levels of faces, the status, the program that runs
// the driver, and the API part with a fake box (what a swipe or a tap does).
// node --test extensions/touchlcd/test/touchlcd.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const logic = require('../logic.js')
const { createDriver } = require('../driver.js')
const api = require('../api.js')

// ---- the settings ---------------------------------------------------------------------------------------------------------------
const PINS = { dcPin: 24, rstPin: 22, blPin: 18, tpRstPin: 17 }

test('the settings of the extension become the arguments of the driver', () => {
  const c = logic.readConfig({ ...PINS, spiDevice: '0.1', rotation: 90, brightness: 60, sleepAfter: 15, showTitle: true, touchFlipX: true })
  assert.strictEqual(c.problem, null)
  assert.deepStrictEqual(logic.driverArgs(c, 4), [
    '--spi', '0.1', '--chip', '4', '--dc', '24', '--rst', '22', '--bl', '18', '--tp-rst', '17', '--i2c-bus', '1', '--rotation', '90',
    '--brightness', '60', '--sleep-after', '900', '--show-title', '--touch-flip-x',
  ])
  // (no backlight pin and no touch reset pin: the display lights with 3.3 V)
  const bare = logic.readConfig({ dcPin: 24, rstPin: 22 })
  assert.deepStrictEqual(logic.driverArgs(bare, 0), ['--spi', '0.1', '--chip', '0', '--dc', '24', '--rst', '22', '--i2c-bus', '1', '--rotation', '0', '--brightness', '80', '--sleep-after', '300'])
})

test('a setting that makes no sense falls back to its default', () => {
  const c = logic.readConfig({ ...PINS, spiDevice: '3.3', rotation: 45, brightness: 999, sleepAfter: 7, category: 'x', nightBrightness: 'x' })
  assert.deepStrictEqual([c.spi, c.rotation, c.brightness, c.sleepAfter, c.category, c.nightBrightness], ['0.1', 0, 100, 5, 'all', 20])
  assert.strictEqual(logic.readConfig({ ...PINS, brightness: 0 }).brightness, 5)
})

test('the display needs DC and RST on pins of their own that are not the ones of the SPI and I2C buses', () => {
  assert.strictEqual(logic.readConfig({}).problem, 'pins')
  assert.strictEqual(logic.readConfig({ dcPin: 24 }).problem, 'pins')
  assert.strictEqual(logic.readConfig({ dcPin: 24, rstPin: 24 }).problem, 'pins')
  assert.strictEqual(logic.readConfig({ dcPin: 24, rstPin: 22, blPin: 22 }).problem, 'pins')
  for (const bus of [2, 3, 7, 8, 9, 10, 11]) assert.strictEqual(logic.readConfig({ dcPin: bus, rstPin: 22 }).problem, 'pins', String(bus))
  assert.strictEqual(logic.readConfig({ dcPin: 24, rstPin: 22 }).problem, null)
  assert.strictEqual(logic.readConfig({ dcPin: 99, rstPin: 22 }).problem, 'pins')
})

test('only what the chips need makes the driver start again: the brightness goes on while it runs', () => {
  const a = logic.readConfig(PINS)
  assert.strictEqual(logic.needsRestart(a, logic.readConfig({ ...PINS, brightness: 10, nightDim: true, category: 'music' })), false)
  for (const change of [{ spiDevice: '0.0' }, { dcPin: 23 }, { rstPin: 21 }, { blPin: 0 }, { tpRstPin: 0 }, { rotation: 180 }, { sleepAfter: 0 }, { showTitle: true }, { touchSwap: true }, { touchFlipY: true }]) {
    assert.strictEqual(logic.needsRestart(a, logic.readConfig({ ...PINS, ...change })), true, JSON.stringify(change))
  }
})

test('the evening takes the brightness down, never above the normal one', () => {
  const c = logic.readConfig({ ...PINS, brightness: 80, nightDim: true, nightBrightness: 20 })
  assert.strictEqual(logic.eveningBrightness(c, 0), 80)
  assert.strictEqual(logic.eveningBrightness(c, 0.5), 50)
  assert.strictEqual(logic.eveningBrightness(c, 1), 20)
  assert.strictEqual(logic.eveningBrightness(logic.readConfig({ ...PINS, brightness: 10, nightDim: true, nightBrightness: 50 }), 1), 10)
  assert.strictEqual(logic.eveningBrightness(logic.readConfig({ ...PINS, nightDim: false }), 1), 80)
})

test('the chip of the header pins: the RP1 of a Pi 5, else the SoC', () => {
  assert.strictEqual(logic.headerChipNumber('gpiochip0 [pinctrl-rp1] (54 lines)\ngpiochip10 [gpio-brcmstb@107d508500] (32 lines)\n'), 0)
  assert.strictEqual(logic.headerChipNumber('gpiochip4 [pinctrl-rp1] (54 lines)\ngpiochip0 [gpio-brcmstb] (32 lines)\n'), 4)
  assert.strictEqual(logic.headerChipNumber('gpiochip0 [pinctrl-bcm2711] (58 lines)\n'), 0)
  assert.strictEqual(logic.headerChipNumber(''), 0)
})

test('the reports of the driver are read; anything else is not one', () => {
  assert.deepStrictEqual(logic.readEvent('{"event":"ready","width":240,"height":320}'), { event: 'ready', width: 240, height: 320 })
  assert.deepStrictEqual(logic.readEvent('{"event":"nav","dir":"next"}'), { event: 'nav', dir: 'next' })
  assert.deepStrictEqual(logic.readEvent('{"event":"tap"}'), { event: 'tap' })
  assert.deepStrictEqual(logic.readEvent('{"event":"up"}'), { event: 'up' })
  assert.deepStrictEqual(logic.readEvent(`{"event":"error","code":"no_touch","message":"${'x'.repeat(500)}"}`), { event: 'error', code: 'no_touch', message: 'x'.repeat(300) })
  for (const line of ['', 'hello', '{"event":5}', '{"nope":1}', '[]', 'null', '{"event":"nav","dir":"sideways"}', '{"event":"dance"}']) assert.strictEqual(logic.readEvent(line), null, line)
})

// ---- the library as levels of faces ---------------------------------------------------------------------------------------------
const DATA = [
  { type: 'spotify', category: 'audiobook', artist: 'Lumi', title: 'Sternenlicht', id: 'a2', cover: 'https://i.scdn.co/2.jpg', artistcover: 'https://i.scdn.co/lumi.jpg' },
  { type: 'spotify', category: 'audiobook', artist: 'Lumi', title: 'Die Reise', id: 'a1', cover: 'https://i.scdn.co/1.jpg', artistcover: 'https://i.scdn.co/lumi.jpg' },
  { type: 'spotify', category: 'music', artist: 'Batman', title: 'Joker', id: 'b1', cover: '/api/x/joker.jpg' },
  { type: 'spotify', category: 'music', artist: 'Zebra', artistid: 'artistonly' },
  { type: 'radio', category: 'radio', id: 'https://radio.example/stream', title: 'Kinderradio', cover: 'http://192.168.1.9:8200/api/radio/cover.png' },
  { type: 'library', category: 'music', artist: 'Old', title: 'Entry', libraryPath: 'music/Old/Entry' },
  { type: 'spotify', category: 'audiobook', artist: 'Resume', title: 'R', id: 'r1', isResume: true },
  { type: 'spotify', category: 'audiobook', artist: 'Anders', artist_override: 'Mama', title: 'Lied', title_override: 'Wiegenlied', id: 'm1', cover: '../assets/images/nocover_mupi.png' },
]

test('the rows of data.json become artists with their albums, a row without an artist plays at a tap', () => {
  const nodes = logic.dataNodes(DATA)
  assert.deepStrictEqual(nodes.map((n) => [n.label, n.kind]), [['Batman', 'folder'], ['Kinderradio', 'album'], ['Lumi', 'folder'], ['Mama', 'folder']])
  const lumi = nodes.find((n) => n.label === 'Lumi')
  assert.deepStrictEqual(lumi.children.map((a) => a.label), ['Die Reise', 'Sternenlicht'])
  assert.strictEqual(lumi.cover, 'https://i.scdn.co/lumi.jpg', 'the cover of the artist')
  assert.strictEqual(lumi.children[0].cover, 'https://i.scdn.co/1.jpg')
  assert.strictEqual(nodes.find((n) => n.label === 'Batman').cover, '/api/x/joker.jpg', 'its own cover when there is no artist cover')
  assert.strictEqual(nodes.find((n) => n.label === 'Kinderradio').cover, '/api/radio/cover.png', 'a cover of the box itself loses the address it was saved with')
  // (the names the parents gave win; the placeholder of the app is no cover)
  const mama = nodes.find((n) => n.label === 'Mama')
  assert.deepStrictEqual([mama.children[0].label, mama.cover], ['Wiegenlied', ''])
  // (a Spotify row for a whole artist has nothing to play from here, a resume entry and a folder of the SD card are not rows of this list)
  assert.ok(!nodes.some((n) => ['Zebra', 'Resume', 'Old'].includes(n.label)))
})

test('the category narrows the list', () => {
  assert.deepStrictEqual(logic.dataNodes(DATA, 'music').map((n) => n.label), ['Batman'])
  assert.deepStrictEqual(logic.dataNodes(DATA, 'audiobook').map((n) => n.label), ['Lumi', 'Mama'])
  assert.deepStrictEqual(logic.dataNodes(DATA, 'other').map((n) => n.label), ['Kinderradio'])
  assert.deepStrictEqual(logic.dataNodes(null), [])
})

test('folders of the SD card and the NAS: the top level opens, a folder with songs plays, a folder of folders opens', () => {
  const top = logic.folderNodes(
    [
      { type: 'library', category: 'music', artist: 'Benjamin', title: 'Benjamin', libraryPath: 'music/Benjamin', libraryIsContainer: false, cover: '/api/library/file?path=a.jpg&w=400' },
      { type: 'library', artist: 'no path' },
      { type: 'library', category: 'music', artist: 'Abba', title: 'Abba', libraryPath: 'music/Abba', libraryIsContainer: true },
    ],
    false,
    { top: true },
  )
  assert.deepStrictEqual(top.map((n) => [n.label, n.kind, n.via]), [
    ['Abba', 'folder', { source: 'library', path: 'music/Abba' }],
    ['Benjamin', 'folder', { source: 'library', path: 'music/Benjamin' }],
  ])
  const below = logic.folderNodes(
    [
      { type: 'library', category: 'music', artist: 'Benjamin', title: 'Der Zoo', libraryPath: 'music/Benjamin/Der Zoo', libraryIsContainer: false },
      { type: 'library', category: 'music', artist: 'Benjamin', title: 'Serie', libraryPath: 'music/Benjamin/Serie', libraryIsContainer: true },
    ],
    false,
  )
  assert.deepStrictEqual(below.map((n) => [n.label, n.kind]), [['Der Zoo', 'album'], ['Serie', 'folder']])
  assert.strictEqual(logic.playerPathOf(below[0].media), 'musicsearch/library/album/music:Benjamin:Der%20Zoo')
  const nas = logic.folderNodes([{ type: 'nas', category: 'nas', artist: 'Musik', title: 'Musik', nasPath: '/vol/Musik', nasIsContainer: true }], true, { top: true })
  assert.deepStrictEqual([nas[0].kind, nas[0].via], ['folder', { source: 'nas', path: '/vol/Musik' }])
  assert.deepStrictEqual(logic.folderNodes('x', false), [])
})

test('the player is told the same address the display of the box builds', () => {
  assert.strictEqual(logic.playerPathOf({ type: 'spotify', id: 'abc' }), 'spotify/now/spotify:album:abc:0:0')
  assert.strictEqual(logic.playerPathOf({ type: 'spotify', playlistid: 'p' }), 'spotify/now/spotify:playlist:p:0:0')
  assert.strictEqual(logic.playerPathOf({ type: 'spotify', artistid: 'only' }), null)
  assert.strictEqual(logic.playerPathOf({ type: 'nas', nasPath: '/a b' }), 'musicsearch/nas/%2Fa%20b')
  assert.strictEqual(logic.playerPathOf({ type: 'tidal', id: 't1', cover: 'http://x:8200/api/t.jpg' }), 'musicsearch/tidal/album:t1?cover=%2Fapi%2Ft.jpg')
  assert.strictEqual(logic.playerPathOf({ type: 'radio', id: 'http://r/s', title: 'R', artist: '' }), 'radio/http%3A%2F%2Fr%2Fs/R:title:artist:')
  assert.strictEqual(logic.playerPathOf({ type: 'unknown' }), null)
  // (its tile and what was heard, as the display names them)
  const media = { type: 'library', libraryPath: 'music/A/B', category: 'music', artist: 'A' }
  assert.strictEqual(logic.startQuery('current/x', media), '?tile=lib%3Amusic%2FA%2FB&heard=lib%3Amusic%2FA%2FB')
  assert.strictEqual(logic.startQuery('current/x?cover=1', { type: 'spotify', id: 's', artist: 'Lumi', category: 'audiobook' }), '&tile=artist%3Aaudiobook%3ALumi&heard=spotify%3Aalbum%3As')
})

test('the driver is told three faces: the one in view and its neighbours around the ends of the list', () => {
  const nodes = ['A', 'B', 'C'].map((label) => ({ label, cover: label === 'B' ? '/api/b.jpg' : 'https://x/c.jpg' }))
  assert.deepStrictEqual(logic.facesOf(nodes, 0, 'http://box'), {
    count: 3,
    cur: { label: 'A', cover: 'https://x/c.jpg' },
    prev: { label: 'C', cover: 'https://x/c.jpg' },
    next: { label: 'B', cover: 'http://box/api/b.jpg' },
  })
  assert.strictEqual(logic.facesOf(nodes, 2, 'http://box').next.label, 'A')
  assert.deepStrictEqual(logic.facesOf([nodes[0]], 0, 'http://box'), { count: 1, cur: { label: 'A', cover: 'https://x/c.jpg' }, prev: null, next: null }, 'one face: the cube does not turn')
  assert.strictEqual(logic.facesOf([], 0, 'http://box'), null)
})

test('the status block says what the user has to do', () => {
  const base = { config: logic.readConfig(PINS), phase: 'ready', code: '', spi: 'on', i2c: 'on', level: { depth: 1, count: 12, title: '' } }
  assert.deepStrictEqual(logic.statusRows(base), [
    { label: 'Display', value: 'Bereit', tone: 'ok' },
    { label: 'SPI', value: 'An', tone: 'ok' },
    { label: 'I2C', value: 'An', tone: 'ok' },
    { label: 'Ebene', value: 'Artisten' },
    { label: 'Titel auf der Ebene', value: '12' },
  ])
  assert.deepStrictEqual(logic.statusRows({ ...base, level: { depth: 2, count: 3, title: 'Lumi' } }).slice(3), [
    { label: 'Ebene', value: 'Alben' },
    { label: 'Artist', value: 'Lumi' },
    { label: 'Titel auf der Ebene', value: '3' },
  ])
  assert.strictEqual(logic.statusRows({ ...base, level: null })[3].tone, 'warn')
  // (pins missing: the hint, and the buses are told all the same - "An" when they are found)
  assert.deepStrictEqual(logic.statusRows({ ...base, config: logic.readConfig({}) }).map((r) => [r.label, r.value]).slice(2), [['SPI', 'An'], ['I2C', 'An']])
  assert.deepStrictEqual(logic.statusRows({ ...base, config: logic.readConfig({}) }).map((r) => r.label), ['Display', 'Hinweis', 'SPI', 'I2C'])
  assert.match(logic.statusRows({ ...base, phase: 'error', code: 'no_touch' })[1].value, /Touch-Chip/)
  assert.deepStrictEqual(logic.statusRows({ ...base, phase: 'error', code: 'no_touch' }).map((r) => r.label), ['Display', 'Hinweis', 'SPI', 'I2C'])
  assert.deepStrictEqual(logic.statusRows({ ...base, phase: 'starting' })[0], { label: 'Display', value: 'Wird gestartet …', tone: 'warn' })
  const off = logic.statusRows({ ...base, spi: 'off', i2c: 'restart' })
  assert.ok(off.some((r) => r.label === 'SPI' && r.value === 'Aus'))
  assert.ok(off.some((r) => r.label === 'I2C' && /neu starten/.test(r.value)))
  for (const code of ['pins', 'no_spi', 'spi_access', 'no_i2c', 'i2c_access', 'no_touch', 'touch_lost', 'gpio', 'no_python', 'no_pil', 'other']) assert.ok(logic.PROBLEMS[code], code)
  assert.strictEqual(logic.problemText('something'), logic.PROBLEMS.other)
})

// ---- the program that runs the driver -------------------------------------------------------------------------------------------
function fakeProcess() {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.written = []
  proc.stdin = { writable: true, destroyed: false, write: (text) => proc.written.push(text), end: () => undefined, on: () => undefined }
  proc.killed = []
  proc.kill = (signal) => proc.killed.push(signal)
  return proc
}
const timers = () => {
  const list = []
  return { list, setTimer: (fn, ms) => (list.push({ fn, ms }), { unref: () => undefined }), clearTimer: (t) => list.splice(0, list.length, ...list.filter((x) => x !== t)) }
}
const say = (proc, event) => proc.stdout.emit('data', Buffer.from(`${JSON.stringify(event)}\n`))

test('the driver is started, told what to show, and started again when it ends', () => {
  const procs = []
  const t = timers()
  const events = []
  const ends = []
  const d = createDriver({ command: 'python3', args: ['touchlcd.py'], onEvent: (e) => events.push(e), onEnd: (...a) => ends.push(a), spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  assert.strictEqual(d.send({ cmd: 'x' }), false, 'nothing runs yet')
  d.start()
  assert.strictEqual(procs.length, 1)
  say(procs[0], { event: 'ready', width: 240, height: 320 })
  procs[0].stdout.emit('data', Buffer.from('{"event":"na'))
  procs[0].stdout.emit('data', Buffer.from('v","dir":"prev"}\nnoise\n'))
  assert.deepStrictEqual(events.map((e) => e.event), ['ready', 'nav'])
  assert.strictEqual(d.send({ cmd: 'brightness', value: 30 }), true)
  assert.deepStrictEqual(procs[0].written, ['{"cmd":"brightness","value":30}\n'])
  say(procs[0], { event: 'error', code: 'no_touch', message: 'silent' })
  procs[0].emit('close', 2, null)
  assert.deepStrictEqual(ends[0].slice(0, 3), ['no_touch: silent', true, 'no_touch'])
  assert.deepStrictEqual(t.list.map((x) => x.ms), [3000], 'tried again soon')
  t.list[0].fn()
  assert.strictEqual(procs.length, 2)
})

test('a display that cannot work until the user acts is tried again only now and then', () => {
  const procs = []
  const t = timers()
  const d = createDriver({ command: 'python3', args: [], onEvent: () => undefined, spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  say(procs[0], { event: 'error', code: 'no_spi', message: 'off' })
  procs[0].emit('close', 2, null)
  assert.deepStrictEqual(t.list.map((x) => x.ms), [5 * 60 * 1000])
})

test('stop() says quit (the picture stays), kill() ends it by SIGTERM', async () => {
  const procs = []
  const t = timers()
  const d = createDriver({ command: 'python3', args: [], onEvent: () => undefined, spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  const stopped = d.stop()
  assert.deepStrictEqual(procs[0].written, ['{"cmd":"quit"}\n'])
  procs[0].emit('close', 0, null)
  await stopped
  d.start()
  const off = d.stop(true)
  assert.deepStrictEqual(procs[1].written, ['{"cmd":"quit","off":true}\n'])
  procs[1].emit('close', 0, null)
  await off
  d.start()
  d.kill()
  assert.deepStrictEqual(procs[2].killed, ['SIGTERM'])
})

// ---- the API part with a fake box -----------------------------------------------------------------------------------------------
const LIBRARY = {
  '/api/data': DATA,
  '/api/library/artists?category=music': [{ type: 'library', category: 'music', artist: 'Abba', title: 'Abba', libraryPath: 'music/Abba', libraryIsContainer: false }],
  '/api/library/artists?category=audiobook': [],
  '/api/library/artists?category=other': [],
  '/api/nas/artists?category=music': [],
  '/api/nas/artists?category=audiobook': [],
  '/api/nas/artists?category=other': [],
  '/api/nas/artists?category=nas': [],
  '/api/library/children?path=music%2FAbba': [
    { type: 'library', category: 'music', artist: 'Abba', title: 'Waterloo', libraryPath: 'music/Abba/Waterloo', libraryIsContainer: false, cover: '/api/library/file?path=w.jpg' },
    { type: 'library', category: 'music', artist: 'Abba', title: 'Arrival', libraryPath: 'music/Abba/Arrival', libraryIsContainer: false },
  ],
}

function fakeBox(settings = PINS, over = {}) {
  const routes = {}
  const procs = []
  const calls = []
  const host = {
    log: { warn: () => undefined, info: () => undefined },
    dir: require('node:path').join(__dirname, '..'),
    playerUrl: 'http://player',
    apiUrl: 'http://api',
    settings: async () => settings,
    onSettings: (fn) => (host.changed = fn),
    route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler),
    deps: {
      chip: 0,
      spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)),
      fetch: async (url) => {
        const text = String(url)
        calls.push(text.replace(/^http:\/\/[a-z]+/, ''))
        const route = text.replace('http://api', '')
        if (text.startsWith('http://player')) return { ok: over.playerOk ?? true, json: async () => ({}) }
        const body = over.library && Object.hasOwn(over.library, route) ? over.library[route] : LIBRARY[route]
        return { ok: body !== undefined, json: async () => body }
      },
      execFile: (_command, _args, _options, done) => done(null, ''),
      now: () => 1_000_000,
    },
  }
  return { host, routes, procs, calls }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))
const views = (proc) => proc.written.map((line) => JSON.parse(line)).filter((m) => m.cmd === 'view')
const commands = (proc) => proc.written.map((line) => JSON.parse(line))

async function started(settings, over) {
  const box = fakeBox(settings, over)
  const ext = api.activate(box.host)
  await settle()
  await settle()
  say(box.procs[0], { event: 'ready', width: 240, height: 320 })
  for (let i = 0; i < 8; i++) await settle()
  return { ...box, ext, driver: box.procs[0] }
}

test('after the start the driver shows the first artist, in the order of the names', async () => {
  const { driver, ext } = await started()
  assert.deepStrictEqual(commands(driver)[0], { cmd: 'brightness', value: 80 })
  const first = views(driver)[0]
  assert.deepStrictEqual(first.faces.cur, { label: 'Abba', cover: '' })
  assert.strictEqual(first.transition, 'none')
  assert.deepStrictEqual(first.faces.next.label, 'Batman')
  assert.strictEqual(first.faces.prev.label, 'Mama', 'around the end of the list')
  assert.strictEqual(ext.levelNow().nodes.length, 5)
})

test('a swipe to the left or right moves on and sends the faces around the new one', async () => {
  const { driver, ext } = await started()
  say(driver, { event: 'nav', dir: 'next' })
  say(driver, { event: 'nav', dir: 'next' })
  await settle()
  const last = views(driver).at(-1)
  assert.deepStrictEqual([last.faces.cur.label, last.faces.prev.label, last.faces.next.label], ['Kinderradio', 'Batman', 'Lumi'])
  say(driver, { event: 'nav', dir: 'prev' })
  await settle()
  assert.strictEqual(views(driver).at(-1).faces.cur.label, 'Batman')
  assert.strictEqual(ext.levelNow().index, 1)
})

test('a tap opens an artist (the albums, zoomed in), a swipe up goes back to where it was', async () => {
  const { driver, ext } = await started()
  say(driver, { event: 'nav', dir: 'next' })
  say(driver, { event: 'nav', dir: 'next' })
  say(driver, { event: 'nav', dir: 'next' })
  await settle()
  assert.strictEqual(views(driver).at(-1).faces.cur.label, 'Lumi')
  say(driver, { event: 'tap' })
  for (let i = 0; i < 4; i++) await settle()
  assert.ok(commands(driver).some((m) => m.cmd === 'press'), 'the cover darkens while the albums are asked for')
  const opened = views(driver).at(-1)
  assert.strictEqual(opened.transition, 'zoom-in')
  assert.deepStrictEqual([opened.faces.cur.label, opened.faces.next.label], ['Die Reise', 'Sternenlicht'])
  say(driver, { event: 'nav', dir: 'next' })
  await settle()
  assert.strictEqual(views(driver).at(-1).faces.cur.label, 'Sternenlicht')
  say(driver, { event: 'up' })
  await settle()
  const back = views(driver).at(-1)
  assert.deepStrictEqual([back.transition, back.faces.cur.label], ['zoom-out', 'Lumi'])
  assert.strictEqual(ext.levelNow().nodes.length, 5)
  // (a swipe up on the artists does nothing)
  const before = views(driver).length
  say(driver, { event: 'up' })
  await settle()
  assert.strictEqual(views(driver).length, before)
})

test('a tap on an album plays it, with the play symbol, and the display stays where it is', async () => {
  const { driver, calls } = await started()
  say(driver, { event: 'tap' }) // Abba: a folder of the SD card, its albums are asked for live
  for (let i = 0; i < 4; i++) await settle()
  assert.ok(calls.includes('/api/library/children?path=music%2FAbba'))
  const album = views(driver).at(-1)
  assert.deepStrictEqual([album.faces.cur.label, album.faces.cur.cover], ['Arrival', ''])
  assert.strictEqual(album.faces.next.cover, 'http://api/api/library/file?path=w.jpg', 'a cover of the box is asked for at the box')
  say(driver, { event: 'tap' })
  for (let i = 0; i < 4; i++) await settle()
  assert.ok(commands(driver).some((m) => m.cmd === 'flash'))
  const played = calls.filter((c) => c.startsWith('/current/'))
  assert.deepStrictEqual(played, ['/current/musicsearch/library/album/music:Abba:Arrival?tile=lib%3Amusic%2FAbba%2FArrival&heard=lib%3Amusic%2FAbba%2FArrival&src=touchlcd'])
})

test('an album at the top (a radio station) plays at a tap; a start the player refuses is only logged', async () => {
  const warnings = []
  const { driver, calls, host } = await started(PINS, { playerOk: false })
  host.log.warn = (text) => warnings.push(text)
  say(driver, { event: 'nav', dir: 'prev' })
  say(driver, { event: 'nav', dir: 'prev' })
  say(driver, { event: 'nav', dir: 'prev' })
  await settle()
  assert.strictEqual(views(driver).at(-1).faces.cur.label, 'Kinderradio')
  say(driver, { event: 'tap' })
  for (let i = 0; i < 4; i++) await settle()
  assert.ok(calls.some((c) => c.startsWith('/current/radio/')))
  assert.ok(commands(driver).some((m) => m.cmd === 'flash'))
  assert.ok(warnings.some((w) => /did not take/.test(w)))
})

test('an artist with nothing to open puts the cover back', async () => {
  const { driver } = await started(PINS, { library: { '/api/library/children?path=music%2FAbba': [] } })
  const before = views(driver).length
  say(driver, { event: 'tap' })
  for (let i = 0; i < 4; i++) await settle()
  assert.strictEqual(views(driver).length, before + 1)
  assert.strictEqual(views(driver).at(-1).transition, 'none')
  assert.strictEqual(views(driver).at(-1).faces.cur.label, 'Abba')
})

test('a library that cannot be read shows nothing yet, and the first artist comes when it can', async () => {
  const library = Object.fromEntries(Object.keys(LIBRARY).map((k) => [k, undefined]))
  const { driver, ext } = await started(PINS, { library })
  assert.strictEqual(views(driver).length, 0)
  assert.strictEqual(ext.levelNow(), null)
  // (the box is up now: the data of the library, nothing on the SD card)
  Object.assign(library, { '/api/data': DATA, '/api/library/artists?category=music': [], '/api/library/artists?category=audiobook': [], '/api/library/artists?category=other': [], '/api/nas/artists?category=music': [], '/api/nas/artists?category=audiobook': [], '/api/nas/artists?category=other': [], '/api/nas/artists?category=nas': [] })
  await ext.refreshTop()
  assert.strictEqual(views(driver).length, 1)
  assert.strictEqual(views(driver)[0].faces.cur.label, 'Batman')
})

test('NAS folders are found in the category the parent gave them (audiobook), not only the ones without a category', async () => {
  const nas = [{ type: 'nas', category: 'nas', artist: 'Munken och Kulan', title: 'Munken och Kulan', nasPath: '/music/barn/Ljudböker/Munken och Kulan', nasIsContainer: true, nasCategory: 'audiobook' }]
  const library = { '/api/nas/artists?category=audiobook': nas }
  const all = await started(PINS, { library })
  assert.ok(all.calls.includes('/api/nas/artists?category=audiobook'), 'asked for the audiobook tab of the NAS')
  assert.ok(all.calls.includes('/api/nas/artists?category=nas'), 'and for the folders without a category')
  assert.ok(all.ext.levelNow().nodes.some((n) => n.label === 'Munken och Kulan' && n.via?.source === 'nas'))
  // (a tab of its own asks only for its own folders)
  const books = await started({ ...PINS, category: 'audiobook' }, { library })
  assert.deepStrictEqual(books.calls.filter((c) => c.startsWith('/api/nas/artists')), ['/api/nas/artists?category=audiobook'])
  assert.deepStrictEqual(books.ext.levelNow().nodes.map((n) => n.label), ['Lumi', 'Mama', 'Munken och Kulan'])
  const music = await started({ ...PINS, category: 'music' }, { library })
  assert.ok(!music.ext.levelNow().nodes.some((n) => n.label === 'Munken och Kulan'))
  const only = await started({ ...PINS, category: 'nas' }, { library })
  assert.deepStrictEqual(only.calls.filter((c) => c.startsWith('/api/nas/artists')), ['/api/nas/artists?category=nas'])
})

test('the settings: a new brightness goes on while it runs, other pins start the driver again, no pins stop it', async () => {
  const { driver, ext, host, procs } = await started()
  await host.changed({ ...PINS, brightness: 40 })
  assert.deepStrictEqual(commands(driver).at(-1), { cmd: 'brightness', value: 40 })
  assert.strictEqual(procs.length, 1)
  const restart = host.changed({ ...PINS, dcPin: 23 })
  await settle()
  driver.emit('close', 0, null)
  await restart
  await settle()
  assert.strictEqual(procs.length, 2)
  assert.deepStrictEqual(driver.written.at(-1), '{"cmd":"quit"}\n')
  // (the new driver gets the artists it had kept: no new list needed)
  say(procs[1], { event: 'ready', width: 240, height: 320 })
  await settle()
  assert.strictEqual(views(procs[1]).at(-1).faces.cur.label, 'Abba')
  const none = host.changed({})
  await settle()
  procs[1].emit('close', 0, null)
  await none
  assert.deepStrictEqual(procs[1].written.at(-1), '{"cmd":"quit","off":true}\n')
  assert.strictEqual(ext.driverState(), null)
})

test('the page asks for the state, and switches SPI and I2C on', async () => {
  const { routes } = await started()
  let body
  await routes['get /state']({}, { json: (b) => (body = b) })
  assert.strictEqual(body.rows[0].label, 'Display')
  assert.ok(typeof body.dimmed === 'boolean')
  for (const name of ['post /spion', 'post /iicon']) assert.ok(routes[name], name)
})
