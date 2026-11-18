// Tests of the OLED extension without a display: the settings, what the player says, the short pictures, the status, the program that
// runs the driver, and the API part with a fake box.
// node --test extensions/oled/test/oled.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const logic = require('../logic.js')
const { createDriver, readEvent } = require('../driver.js')
const api = require('../api.js')

// ---- the settings ---------------------------------------------------------------------------------------------------------------
test('the settings of the extension become the arguments of the driver', () => {
  const c = logic.readConfig({ controller: 'sh1106', size: '128x32', address: '0x3D', rotate: true, contrast: 200 })
  assert.deepStrictEqual(logic.driverArgs(c), ['--controller', 'sh1106', '--width', '128', '--height', '32', '--address', '0x3D', '--contrast', '200', '--rotate'])
})

test('a setting that makes no sense falls back to its default', () => {
  const c = logic.readConfig({ controller: 'ssd9999', size: '64x48', address: '0x10', contrast: 999, mode: 'x', sleepAfter: 7, clock: 'no' })
  assert.deepStrictEqual([c.controller, c.width, c.height, c.address, c.contrast, c.mode, c.sleepAfter, c.clock, c.rotate, c.headless], ['ssd1306', 128, 64, '0x3C', 255, 'full', 5, true, false, false])
  assert.strictEqual(logic.readConfig({ contrast: 'x' }).contrast, 127)
})

test('the volume animation is on and long lines loop unless the settings say otherwise', () => {
  const c = logic.readConfig({})
  assert.deepStrictEqual([c.volumeOverlay, c.scroll], [true, 'loop'])
  const off = logic.readConfig({ volumeOverlay: false, scroll: 'once' })
  assert.deepStrictEqual([off.volumeOverlay, off.scroll], [false, 'once'])
  assert.strictEqual(logic.readConfig({ scroll: 'sideways' }).scroll, 'loop')
  assert.strictEqual(logic.needsRestart(c, off), false, 'both apply while the driver runs')
  assert.strictEqual(state({ config: { scroll: 'off' } }).scroll, 'off')
})

test('only what the chip needs makes the driver start again: the contrast and the mode go on while it runs', () => {
  const a = logic.readConfig({})
  assert.strictEqual(logic.needsRestart(a, logic.readConfig({ contrast: 10, mode: 'lite', clock: false, sleepAfter: 0 })), false)
  for (const change of [{ controller: 'sh1106' }, { size: '128x32' }, { address: '0x3D' }, { rotate: true }]) assert.strictEqual(logic.needsRestart(a, logic.readConfig(change)), true, JSON.stringify(change))
})

test('the modes go round: full, mix, lite', () => {
  assert.deepStrictEqual(['full', 'mix', 'lite', 'full'].map(logic.nextMode), ['mix', 'lite', 'full', 'mix'])
})

// ---- the player ----------------------------------------------------------------------------------------------------------------
test('what plays: an album of the SD card has its folder above as the artist', () => {
  const p = logic.readPlayback({ currentPlayer: 'mplayer', currentType: 'local', playing: true, currentTrackname: 'Kapitel 3', album: 'Der Rabe Socke', path: 'audiobook/Nele Moost/Der Rabe Socke', positionSeconds: 61.4, durationSeconds: 300, currentTracknr: 3, totalTracks: 12, volume: 55 }, null)
  assert.deepStrictEqual(
    [p.playing, p.title, p.artist, p.album, p.elapsed, p.duration, p.track, p.tracks, p.volume, p.stream],
    [true, 'Kapitel 3', 'Nele Moost', 'Der Rabe Socke', 61, 300, 3, 12, 55, false],
  )
})

test('a radio station is a stream: no track numbers, no end', () => {
  const p = logic.readPlayback({ currentPlayer: 'mplayer', currentType: 'radio', playing: true, currentTrackname: 'Kiraka', currentTracknr: 1, totalTracks: 1 }, null)
  assert.deepStrictEqual([p.stream, p.track, p.tracks, p.duration], [true, 0, 0, null])
})

test('Spotify says what plays in /state, not in /local', () => {
  const p = logic.readPlayback({ currentPlayer: 'spotify', volume: 30 }, { is_playing: true, progress_ms: 90500, item: { name: 'Lied', duration_ms: 200000, artists: [{ name: 'Band' }], album: { name: 'Platte' } } })
  assert.deepStrictEqual([p.playing, p.title, p.artist, p.album, p.elapsed, p.duration, p.volume], [true, 'Lied', 'Band', 'Platte', 91, 200, 30])
  const episode = logic.readPlayback({ currentPlayer: 'spotify' }, { is_playing: false, item: { name: 'Folge 1', show: { name: 'Die Sendung' } } })
  assert.deepStrictEqual([episode.playing, episode.artist], [false, 'Die Sendung'])
})

test('shuffle and repeat: the player loops the whole list; Spotify can repeat one track', () => {
  const local = { currentPlayer: 'mplayer', currentType: 'local', playing: true, shuffle: true, repeat: true }
  assert.deepStrictEqual([logic.readPlayback(local, null).shuffle, logic.readPlayback(local, null).repeat], [true, 'all'])
  assert.strictEqual(logic.readPlayback({ ...local, shuffle: false, repeat: false }, null).repeat, 'off')
  const spotify = (repeat_state, shuffle_state) => logic.readPlayback({ currentPlayer: 'spotify' }, { is_playing: true, repeat_state, shuffle_state, item: { name: 'x' } })
  assert.deepStrictEqual([spotify('track', true).repeat, spotify('context', false).repeat, spotify('off', false).repeat, spotify('off', true).shuffle], ['track', 'all', 'off', true])
})

test('the battery comes from the MuPiHAT, the output from the audio routes of the box', () => {
  assert.strictEqual(logic.batteryPercent('{"Bat_Percent": 87.6, "Measurement_Valid": true}'), 88)
  assert.strictEqual(logic.batteryPercent('{"Bat_Percent": 50, "Measurement_Valid": false}'), null)
  assert.strictEqual(logic.batteryPercent('{"Bat_Percent": 0, "BatteryConnected": 0}'), null, 'no battery at all')
  assert.strictEqual(logic.batteryPercent('{"Bat_Percent": 250}'), 100)
  assert.strictEqual(logic.batteryPercent('nonsense'), null)
  assert.strictEqual(logic.batteryPercent(''), null)
  assert.strictEqual(logic.outputKind({ current: 'box' }), 'speaker')
  assert.strictEqual(logic.outputKind(null), 'speaker')
  const body = { cards: [{ id: 'alsa_output.jack', kind: 'jack' }, { id: 'alsa_output.amp', kind: 'amp' }], devices: [{ mac: 'AA:BB:CC:DD:EE:FF', kind: 'headphones' }, { mac: '11:22:33:44:55:66', kind: 'speaker' }] }
  assert.strictEqual(logic.outputKind({ ...body, current: 'card:alsa_output.jack' }), 'headphone')
  assert.strictEqual(logic.outputKind({ ...body, current: 'card:alsa_output.amp' }), 'speaker')
  assert.strictEqual(logic.outputKind({ ...body, current: 'aa:bb:cc:dd:ee:ff' }), 'headphone')
  assert.strictEqual(logic.outputKind({ ...body, current: '11:22:33:44:55:66' }), 'bluetooth')
})

test('the state for the driver carries what the status bar shows', () => {
  const s = logic.buildState({ config: logic.readConfig({ timeMode: 'down' }), play: { ...logic.readPlayback({ currentPlayer: 'mplayer', currentType: 'local', playing: true, currentTrackname: 't', shuffle: true, repeat: true, volume: 20 }, null) }, ui: { infoUntil: 0, overlay: null, idleSince: null, wake: 0, mode: null }, net: { ssid: '', ip: '', wifi: 2, battery: 61, output: 'bluetooth' }, date: new Date(2026, 10, 16, 7, 5), now: 1, version: '1' })
  assert.deepStrictEqual([s.shuffle, s.repeat, s.battery, s.output, s.timeMode, s.wifi], [true, 'all', 61, 'bluetooth', 'down', 2])
  assert.strictEqual(logic.readConfig({ timeMode: 'sideways' }).timeMode, 'up')
})

test('no answer of the player reads as nothing playing', () => {
  const p = logic.readPlayback(null, null)
  assert.deepStrictEqual([p.player, p.playing, p.volume], ['', false, null])
})

test('a short picture for the volume and for play and pause - not for the first reading, not for a track change', () => {
  const was = { player: 'mplayer', playing: true, volume: 50, title: 'a' }
  assert.strictEqual(logic.overlayFor(null, was), null)
  assert.deepStrictEqual(logic.overlayFor(was, { ...was, volume: 60 }), { kind: 'volume', volume: 60 })
  assert.deepStrictEqual(logic.overlayFor(was, { ...was, volume: 0 }), { kind: 'mute', volume: 0 })
  assert.deepStrictEqual(logic.overlayFor(was, { ...was, playing: false }), { kind: 'pause', volume: 50 })
  assert.deepStrictEqual(logic.overlayFor({ ...was, playing: false }, was), { kind: 'play', volume: 50 })
  assert.strictEqual(logic.overlayFor(was, { ...was, title: 'b' }), null)
  // (with the animation of the volume off, a change of the volume shows nothing - play and pause still do)
  assert.strictEqual(logic.overlayFor(was, { ...was, volume: 60 }, false), null)
  assert.strictEqual(logic.overlayFor(was, { ...was, volume: 0 }, false), null)
  assert.deepStrictEqual(logic.overlayFor(was, { ...was, volume: 60, playing: false }, false), { kind: 'pause', volume: 60 })
  assert.strictEqual(logic.overlayFor({ player: '', playing: false, volume: null }, { player: '', playing: false, volume: null }), null)
})

// ---- what the display shows ----------------------------------------------------------------------------------------------------
const state = (over = {}) => {
  const config = logic.readConfig(over.config ?? {})
  const play = { ...logic.readPlayback(null, null), ...(over.play ?? {}) }
  return logic.buildState({ config, play, ui: { infoUntil: 0, overlay: null, idleSince: null, wake: 0, mode: null, ...(over.ui ?? {}) }, net: { ssid: 'Zuhause', ip: '192.168.1.5', wifi: 3, ...(over.net ?? {}) }, date: new Date(2026, 10, 16, 7, 5), now: over.now ?? 1000, version: '0.1.0' })
}

test('the weekday follows the language of the box; without one, or with one that is not known, it is German', () => {
  const monday = new Date(2026, 10, 16, 7, 5)
  assert.strictEqual(logic.timeTexts(monday, 'sv').date, 'Mån 16.11.')
  assert.strictEqual(logic.timeTexts(monday, 'en').date, 'Mon 16.11.')
  assert.strictEqual(logic.timeTexts(monday, 'nb-NO').date.endsWith(' 16.11.'), true)
  assert.strictEqual(logic.timeTexts(monday, 'de').date, 'Mo 16.11.')
  assert.strictEqual(logic.timeTexts(monday).date, 'Mo 16.11.')
  assert.strictEqual(logic.timeTexts(monday, 'x').date, 'Mo 16.11.')
  assert.strictEqual(logic.timeTexts(monday, null).date, 'Mo 16.11.')
  assert.strictEqual(logic.timeTexts(monday, 'sv').time, '07:05')
})

test('the clock and the date are German and short', () => {
  assert.deepStrictEqual(logic.timeTexts(new Date(2026, 10, 16, 7, 5)), { time: '07:05', date: 'Mo 16.11.' })
})

test('a track that plays is shown; without anything playing the display idles and goes off after the chosen time', () => {
  assert.strictEqual(state({ play: { player: 'mplayer', playing: true, title: 'x' } }).view, 'play')
  assert.strictEqual(state({}).view, 'idle')
  assert.strictEqual(state({ ui: { idleSince: 1 }, now: 4 * 60000 }).view, 'idle', 'not yet: five minutes is the default')
  assert.strictEqual(state({ ui: { idleSince: 1 }, now: 5 * 60000 + 1 }).view, 'off')
  assert.strictEqual(state({ config: { sleepAfter: 0 }, ui: { idleSince: 1 }, now: 99 * 60000 }).view, 'idle', 'never')
  assert.strictEqual(state({ ui: { idleSince: 1, wake: 6 * 60000 }, now: 5 * 60000 + 1 }).view, 'idle', 'woken')
})

test('a paused album shows its title for a while, then the display goes off like with nothing playing (no picture burns in)', () => {
  const paused = { player: 'mplayer', playing: false, title: 'Kapitel 1' }
  assert.strictEqual(state({ play: paused, ui: { idleSince: 1 }, now: 4 * 60000 }).view, 'play')
  assert.strictEqual(state({ play: paused, ui: { idleSince: 1 }, now: 99 * 60000 }).view, 'off')
  assert.strictEqual(state({ play: paused, config: { sleepAfter: 0 }, ui: { idleSince: 1 }, now: 99 * 60000 }).view, 'play', 'never')
  assert.strictEqual(state({ play: paused, ui: { idleSince: 1, wake: 100 * 60000 }, now: 99 * 60000 }).view, 'play', 'woken')
  assert.strictEqual(state({ play: { ...paused, playing: true }, ui: { idleSince: 1 }, now: 99 * 60000 }).view, 'play', 'what plays never goes off')
})

test('Spotify plays as /local says it: its own pause flag, and not while its device is quiet', () => {
  assert.strictEqual(logic.spotifyMayPlay({ currentPlayer: 'spotify', pause: false }), true)
  assert.strictEqual(logic.spotifyMayPlay({ currentPlayer: 'spotify', pause: true }), false)
  assert.strictEqual(logic.spotifyMayPlay({ currentPlayer: 'spotify', pause: false, spotifySilent: true }), false)
  assert.strictEqual(logic.spotifyMayPlay({ currentPlayer: 'mplayer', pause: false }), false)
  assert.strictEqual(logic.spotifyMayPlay(null), false)
})

test('a DSI display is plugged in when one of the DSI connectors says connected - "disconnected" is not', () => {
  assert.strictEqual(logic.dsiConnected([{ name: 'card1-HDMI-A-1', status: 'connected\n' }, { name: 'card1-DSI-1', status: 'connected\n' }]), true)
  assert.strictEqual(logic.dsiConnected([{ name: 'card1-DSI-1', status: 'disconnected\n' }]), false)
  assert.strictEqual(logic.dsiConnected([{ name: 'card1-HDMI-A-1', status: 'connected' }]), false)
  assert.strictEqual(logic.dsiConnected([{ name: 'card1-DSI-1', status: '' }]), false)
  assert.strictEqual(logic.dsiConnected(null), false)
})

test('the page with the address comes before the short pictures, which come before the rest', () => {
  const playing = { player: 'mplayer', playing: true, title: 'x', volume: 40 }
  const s = state({ play: playing, ui: { infoUntil: 5000, overlay: { kind: 'volume', volume: 70, until: 3000 } }, now: 1000 })
  assert.deepStrictEqual([s.view, s.ssid, s.ip, s.version], ['info', 'Zuhause', '192.168.1.5', 'OLED 0.1.0'])
  const o = state({ play: playing, ui: { overlay: { kind: 'volume', volume: 70, until: 3000 } }, now: 1000 })
  assert.deepStrictEqual([o.view, o.overlay, o.volume], ['overlay', 'volume', 70])
  assert.strictEqual(state({ play: playing, ui: { overlay: { kind: 'volume', volume: 70, until: 900 } }, now: 1000 }).view, 'play')
})

test('a short picture wakes a display that is off', () => {
  const s = state({ ui: { idleSince: 1, overlay: { kind: 'play', volume: 10, until: 10 * 60000 } }, now: 6 * 60000 })
  assert.strictEqual(s.view, 'overlay')
})

test('the mode of the buttons wins over the one of the settings', () => {
  assert.strictEqual(state({ play: { player: 'mplayer', playing: true, title: 'x' }, ui: { mode: 'lite' } }).mode, 'lite')
  assert.strictEqual(state({ config: { mode: 'mix' }, play: { player: 'mplayer', playing: true, title: 'x' } }).mode, 'mix')
})

test('the WLAN bars come from the link quality of /proc/net/wireless', () => {
  const file = (q) => `Inter-| sta-|   Quality        |   Discarded packets\n face | tus | link level noise |  nwid\n wlan0: 0000   ${q}.  -50.  -256        0\n`
  assert.strictEqual(logic.wifiLevel(file(70)), 4)
  assert.strictEqual(logic.wifiLevel(file(35)), 2)
  assert.strictEqual(logic.wifiLevel(file(5)), 1)
  assert.strictEqual(logic.wifiLevel(file(0)), 0)
  assert.strictEqual(logic.wifiLevel('Inter-|\n face |\n'), -1, 'no wireless')
  assert.strictEqual(logic.wifiLevel(''), -1)
})

test('the wired network is found by an interface that is up and has an address', () => {
  const ifaces = (extra = {}) => ({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], wlan0: [{ family: 'IPv4', internal: false, address: '192.168.1.7' }], ...extra })
  const eth = [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.1.9' }]
  assert.deepStrictEqual(logic.wiredLink(ifaces({ eth0: eth }), () => 'up\n'), { name: 'eth0', ip: '192.168.1.9' })
  assert.strictEqual(logic.wiredLink(ifaces({ eth0: eth }), () => 'down'), null, 'cable out')
  assert.strictEqual(logic.wiredLink(ifaces(), () => 'up'), null, 'only wireless')
  assert.strictEqual(logic.wiredLink(ifaces({ eth0: [] }), () => 'up'), null, 'no address yet')
  assert.strictEqual(logic.wiredLink(null, () => 'up'), null)
})

test('on the wired network the state says so and the network page has no WLAN name', () => {
  const config = logic.readConfig({})
  const lan = state({ ui: { infoUntil: 5000 }, net: { ssid: 'Zuhause', ip: '192.168.1.9', wifi: 3, lan: true } })
  assert.strictEqual(lan.lan, true)
  assert.deepStrictEqual([lan.view, lan.ssid, lan.ip], ['info', '', '192.168.1.9'])
  assert.strictEqual(state({}).lan, false)
  assert.ok(config)
})

// ---- I2C and the kiosk in the status -------------------------------------------------------------------------------------------
test('I2C: on in the boot configuration with the module and the device', () => {
  const on = logic.i2cState('dtparam=audio=on\ndtparam=i2c_arm=on\n', 'i2c-dev\n', ['i2c-1'], false)
  assert.deepStrictEqual([on.configured, on.devices, logic.i2cIsOn(on)], [true, ['i2c-1'], true])
  assert.strictEqual(logic.i2cIsOn(logic.i2cState('dtparam=i2c_arm=off\n', '', [], false)), false)
  assert.strictEqual(logic.i2cIsOn(logic.i2cState('', '', ['i2c-1'], true)), true, 'switched on some other way')
  assert.strictEqual(logic.i2cState('dtparam=i2c_arm=on\n', '', [], false).configured, false, 'the module is missing')
})

test('the status says what is wrong and offers the button only while I2C is off', () => {
  const config = logic.readConfig({})
  const off = logic.statusRows({ config, driver: { phase: 'error', code: 'no_i2c' }, i2c: logic.i2cState('', '', [], false), kiosk: { headless: false, running: true } })
  assert.strictEqual(off[0].tone, 'error')
  assert.match(off[0].value, /I2C/)
  assert.strictEqual(off.find((r) => r.label === 'I2C').button.post, '/api/ext/oled/iicon')
  const ok = logic.statusRows({ config, driver: { phase: 'ready' }, i2c: logic.i2cState('dtparam=i2c_arm=on\n', 'i2c-dev', ['i2c-1'], true), kiosk: { headless: false, running: true } })
  assert.deepStrictEqual([ok[0].value, ok[0].tone, ok.find((r) => r.label === 'I2C').button], ['Bereit', 'ok', undefined])
  assert.ok(ok.length <= 12)
  for (const code of ['no_i2c', 'i2c_access', 'no_display', 'no_pil', 'no_python']) assert.notStrictEqual(logic.errorText(code), 'Fehler', code)
  assert.strictEqual(logic.errorText('x'), 'Fehler')
})

test('the DSI display line: what the box does at its next start, and what runs now', () => {
  assert.strictEqual(logic.kioskRow({ headless: true, running: true }).tone, 'warn')
  assert.strictEqual(logic.kioskRow({ headless: true, running: false }).value, 'Aus (ohne DSI-Display)')
  assert.strictEqual(logic.kioskRow({ headless: false, running: true }).value, 'An')
  assert.strictEqual(logic.kioskRow({ headless: false, running: false }).tone, 'warn')
})

// ---- the program that runs the driver ------------------------------------------------------------------------------------------
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

test('the reports of the driver are read; anything else is not one', () => {
  assert.deepStrictEqual(readEvent('{"event":"ready","controller":"ssd1306","address":"0x3C"}'), { event: 'ready', controller: 'ssd1306', address: '0x3C' })
  assert.deepStrictEqual(readEvent('{"event":"error","code":"no_i2c","message":"x"}'), { event: 'error', code: 'no_i2c', message: 'x' })
  for (const line of ['', 'hello', '{"event":5}', '{"nope":1}', '[]', 'null']) assert.strictEqual(readEvent(line), null, line)
})

test('the driver is started, told what to show, and started again when it ends', () => {
  const procs = []
  const t = timers()
  const events = []
  const ends = []
  const d = createDriver({ command: 'python3', args: ['oled.py'], onEvent: (e) => events.push(e), onEnd: (...a) => ends.push(a), spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  assert.strictEqual(procs.length, 1)
  procs[0].stdout.emit('data', Buffer.from('{"event":"rea'))
  procs[0].stdout.emit('data', Buffer.from('dy","controller":"ssd1306","address":"0x3C"}\n'))
  assert.deepStrictEqual(events, [{ event: 'ready', controller: 'ssd1306', address: '0x3C' }])
  assert.strictEqual(d.send({ cmd: 'state', state: { view: 'idle' } }), true)
  assert.strictEqual(procs[0].written[0], '{"cmd":"state","state":{"view":"idle"}}\n')
  procs[0].emit('close', 1)
  assert.strictEqual(ends.length, 1)
  assert.strictEqual(d.send({ cmd: 'state' }), false, 'nothing to send to')
  assert.strictEqual(t.list.length, 1)
  assert.strictEqual(t.list[0].ms, 3000, 'a fast second try at first')
  t.list[0].fn()
  assert.strictEqual(procs.length, 2)
})

test('a lasting error is tried again only now and then, and said once', () => {
  const procs = []
  const t = timers()
  const ends = []
  const d = createDriver({ command: 'python3', args: [], onEvent: () => undefined, onEnd: (reason, isNew, code) => ends.push({ reason, isNew, code }), spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  procs[0].stdout.emit('data', Buffer.from('{"event":"error","code":"no_i2c","message":"I2C is off"}\n'))
  procs[0].emit('close', 2)
  assert.strictEqual(t.list[0].ms, 5 * 60 * 1000)
  t.list[0].fn()
  procs[1].stdout.emit('data', Buffer.from('{"event":"error","code":"no_i2c","message":"I2C is off"}\n'))
  procs[1].emit('close', 2)
  assert.deepStrictEqual(ends.map((e) => [e.code, e.isNew]), [['no_i2c', true], ['no_i2c', false]])
})

test('no python3 is an error of its own', () => {
  const procs = []
  const t = timers()
  const ends = []
  const d = createDriver({ command: 'python3', args: [], onEvent: () => undefined, onEnd: (reason, isNew, code) => ends.push(code), spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  procs[0].emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }))
  assert.deepStrictEqual(ends, ['no_python'])
})

test('stop() says quit, so the picture stays; no new start follows', async () => {
  const procs = []
  const t = timers()
  const d = createDriver({ command: 'python3', args: [], onEvent: () => undefined, spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)), setTimer: t.setTimer, clearTimer: t.clearTimer })
  d.start()
  const stopped = d.stop()
  assert.strictEqual(procs[0].written.at(-1), '{"cmd":"quit"}\n')
  procs[0].emit('close', 0)
  await stopped
  assert.deepStrictEqual(t.list.filter((x) => x.ms !== 1500), [])
  assert.strictEqual(procs.length, 1)
})

// ---- the API part with a fake box ---------------------------------------------------------------------------------------------
function fakeHost(settings, over = {}) {
  const routes = {}
  const procs = []
  const config = { mupibox: { headless: false, ...(over.mupibox ?? {}) } }
  const execs = []
  const fetched = []
  const host = {
    log: { warn: () => undefined, info: () => undefined },
    dir: require('node:path').join(__dirname, '..'),
    dataDir: over.dataDir ?? require('node:os').tmpdir(),
    playerUrl: 'http://player',
    apiUrl: 'http://api',
    settings: async () => settings,
    config: () => config,
    updateConfig: over.updateConfig ?? (async (mutate) => mutate(config)),
    onSettings: (fn) => (host.changed = fn),
    route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler),
    deps: {
      spawnFn: () => (procs.push(fakeProcess()), procs.at(-1)),
      fetch: async (url) => {
        fetched.push(String(url).replace(/^http:\/\/[a-z]+/, ''))
        const player = typeof over.player === 'function' ? over.player() : over.player
        const body = player ?? { currentPlayer: 'mplayer', currentType: 'local', playing: true, currentTrackname: 'Kapitel 1', path: 'a/b/c', volume: 40 }
        const state = typeof over.state === 'function' ? over.state() : (over.state ?? {})
        return { ok: true, json: async () => (String(url).endsWith('/local') ? body : String(url).endsWith('/state') ? state : {}) }
      },
      execFile: (command, args, options, done) => (execs.push([command, ...args]), done(over.execError ?? null, '')),
      now: over.now ?? (() => 1_000_000),
      ...(over.deps ?? {}),
    },
  }
  return { host, routes, procs, config, execs, fetched }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))
// (the driver says it found its display)
const ready = (box, at = 0) => box.procs[at].stdout.emit('data', Buffer.from('{"event":"ready","controller":"ssd1306","address":"0x3C"}\n'))
const started = async (box) => {
  await settle()
  await settle()
  ready(box)
}
const sentStates = (proc) => proc.written.map((l) => JSON.parse(l)).filter((m) => m.cmd === 'state').map((m) => m.state)

test('the extension starts the driver with the settings and tells it what plays', async () => {
  const box = fakeHost({ controller: 'sh1106', address: '0x3D' })
  const ext = api.activate(box.host)
  await settle()
  await settle()
  assert.strictEqual(box.procs.length, 1)
  ready(box)
  await ext.tick()
  const sent = box.procs[0].written.map((l) => JSON.parse(l)).filter((m) => m.cmd === 'state')
  assert.ok(sent.length >= 1)
  assert.deepStrictEqual([sent.at(-1).state.view, sent.at(-1).state.title, sent.at(-1).state.artist], ['play', 'Kapitel 1', 'b'])
})

test('a change of the chip starts the driver anew, a change of the brightness only tells it', async () => {
  const box = fakeHost({})
  const ext = api.activate(box.host)
  await settle()
  await settle()
  assert.strictEqual(box.procs.length, 1)
  await ext.apply({ contrast: 30 })
  assert.strictEqual(box.procs.length, 1)
  assert.ok(box.procs[0].written.some((l) => l.includes('"cmd":"contrast"') && l.includes('30')))
  const first = box.procs[0]
  const applied = ext.apply({ controller: 'ssd1309' })
  await settle()
  first.emit('close', 0)
  await applied
  assert.strictEqual(box.procs.length, 2)
  assert.ok(first.written.some((l) => l.includes('"cmd":"quit"')))
})

test('the evening contrast: the normal one outside, the one of the evening inside, in between while it dims, never brighter than normal', () => {
  const on = logic.readConfig({ contrast: 200, nightDim: true, nightContrast: 20 })
  assert.deepStrictEqual([on.nightDim, on.nightContrast], [true, 20])
  assert.strictEqual(logic.eveningContrast(on, 0), 200)
  assert.strictEqual(logic.eveningContrast(on, 1), 20)
  assert.strictEqual(logic.eveningContrast(on, 0.5), 110)
  assert.strictEqual(logic.eveningContrast(on, 7), 20, 'a share beyond 1 is 1')
  assert.strictEqual(logic.eveningContrast(on, 'x'), 200)
  assert.strictEqual(logic.eveningContrast(logic.readConfig({ contrast: 10, nightDim: true, nightContrast: 200 }), 1), 10, 'not brighter than normal')
  assert.strictEqual(logic.eveningContrast(logic.readConfig({ contrast: 200, nightContrast: 20 }), 1), 200, 'switched off')
  assert.deepStrictEqual([logic.readConfig({ nightContrast: 0 }).nightContrast, logic.readConfig({ nightContrast: 999 }).nightContrast, logic.readConfig({}).nightContrast, logic.readConfig({}).nightDim], [1, 255, 20, false])
})

test('in the evening the extension tells the driver the darker contrast - and the normal one again in the morning', async () => {
  let share = 0
  const box = fakeHost({ contrast: 200, nightDim: true, nightContrast: 20 })
  box.host.nightDim = async () => ({ share, dimmed: share > 0 })
  let now = 1_000_000
  box.host.deps.now = () => now
  const ext = api.activate(box.host)
  await started(box)
  const contrasts = () => box.procs[0].written.map((l) => JSON.parse(l)).filter((m) => m.cmd === 'contrast').map((m) => m.value)
  await ext.tick()
  assert.deepStrictEqual(contrasts(), [], 'daytime: nothing to tell')
  share = 1
  now += 20_000
  await ext.tick()
  assert.deepStrictEqual(contrasts(), [20])
  now += 20_000
  await ext.tick()
  assert.deepStrictEqual(contrasts(), [20], 'unchanged: not told again')
  share = 0
  now += 20_000
  await ext.tick()
  assert.deepStrictEqual(contrasts(), [20, 200])
  // (the switch off in the settings brings the normal one back at once)
  share = 1
  now += 20_000
  await ext.tick()
  await ext.apply({ contrast: 200, nightDim: false })
  assert.strictEqual(contrasts().at(-1), 200)
})

test('the info page and the next mode are routes of the page', async () => {
  const box = fakeHost({})
  const ext = api.activate(box.host)
  await settle()
  await settle()
  const answer = async (key) => {
    let body
    await box.routes[key]({ body: {} }, { json: (b) => (body = b), status: () => ({ json: (b) => (body = b) }) })
    return body
  }
  assert.strictEqual((await answer('post /info')).ok, true)
  assert.strictEqual(ext.stateNow().view, 'info')
  assert.strictEqual((await answer('post /mode')).mode, 'mix')
  assert.strictEqual((await answer('post /mode')).mode, 'lite')
  assert.strictEqual((await answer('post /mode')).mode, 'full')
})

test('without the DSI display: the flag of the box and DietPi\'s autostart are set, and brought back when the setting goes', async () => {
  const box = fakeHost({ headless: true })
  const ext = api.activate(box.host)
  await started(box)
  await ext.apply({ headless: true })
  assert.strictEqual(box.config.mupibox.headless, true)
  assert.ok(box.execs.some((e) => e.join(' ') === 'sudo -n /boot/dietpi/dietpi-autostart 0'), JSON.stringify(box.execs))
  await box.host.changed({ headless: false })
  assert.strictEqual(box.config.mupibox.headless, false)
  assert.ok(box.execs.some((e) => e.join(' ') === 'sudo -n /boot/dietpi/dietpi-autostart 11'), JSON.stringify(box.execs))
})

test('when DietPi refuses the change the flag goes back off and the page says so', async () => {
  const box = fakeHost({ headless: true }, { execError: new Error('sudo: a password is required') })
  const ext = api.activate(box.host)
  await started(box)
  await ext.apply({ headless: true })
  assert.strictEqual(box.config.mupibox.headless, false)
  let body
  await box.routes['get /state']({}, { json: (b) => (body = b) })
  assert.ok(body.rows.some((r) => r.tone === 'error' && /DSI/.test(r.label)), JSON.stringify(body.rows))
})

test('when the flag cannot be written DietPi\'s autostart is not touched', async () => {
  const box = fakeHost({ headless: true }, { updateConfig: async () => Promise.reject(new Error('locked')) })
  const ext = api.activate(box.host)
  await started(box)
  await ext.apply({ headless: true })
  assert.ok(!box.execs.some((e) => e.join(' ').includes('dietpi-autostart')), JSON.stringify(box.execs))
})

test('without a display that answers the box keeps its DSI display, and the page says why', async () => {
  const box = fakeHost({ headless: true })
  const ext = api.activate(box.host)
  await settle()
  await settle()
  box.procs[0].stdout.emit('data', Buffer.from('{"event":"error","code":"no_display","message":"x"}\n'))
  await ext.apply({ headless: true })
  assert.strictEqual(box.config.mupibox.headless, false)
  assert.ok(!box.execs.some((e) => e.join(' ').includes('dietpi-autostart')), JSON.stringify(box.execs))
  let body
  await box.routes['get /state']({}, { json: (b) => (body = b) })
  assert.ok(body.rows.some((r) => r.value === logic.HEADLESS_NO_OLED && r.tone === 'warn'), JSON.stringify(body.rows))
  // (the display answers later: the setting takes effect then)
  box.procs[0].stdout.emit('data', Buffer.from('{"event":"ready"}\n'))
  await settle()
  assert.strictEqual(box.config.mupibox.headless, true)
})

test('with a DSI display plugged in the box keeps it, and the page says why', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const drm = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'oled-drm-'))
  fs.mkdirSync(path.join(drm, 'card1-DSI-1'))
  fs.writeFileSync(path.join(drm, 'card1-DSI-1', 'status'), 'connected\n')
  const box = fakeHost({ headless: true }, { deps: { drmDir: drm } })
  const ext = api.activate(box.host)
  await started(box)
  await ext.apply({ headless: true })
  assert.strictEqual(box.config.mupibox.headless, false)
  assert.ok(!box.execs.some((e) => e.join(' ').includes('dietpi-autostart')), JSON.stringify(box.execs))
  let body
  await box.routes['get /state']({}, { json: (b) => (body = b) })
  assert.ok(body.rows.some((r) => r.value === logic.HEADLESS_DSI), JSON.stringify(body.rows))
  fs.rmSync(drm, { recursive: true, force: true })
})

test('a switch-on that stopped half-way (autostart 0, no flag) is undone when the setting is off', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const data = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'oled-data-'))
  const index = path.join(data, 'autostart_index')
  fs.writeFileSync(index, '0\n')
  fs.writeFileSync(path.join(data, 'autostart.json'), JSON.stringify({ index: 7 }))
  const box = fakeHost({ headless: false }, { dataDir: data, deps: { autostartIndexFile: index } })
  const ext = api.activate(box.host)
  await started(box)
  await ext.apply({ headless: false })
  assert.ok(box.execs.some((e) => e.join(' ') === 'sudo -n /boot/dietpi/dietpi-autostart 7'), JSON.stringify(box.execs))
  assert.strictEqual(fs.existsSync(path.join(data, 'autostart.json')), false, 'nothing kept any more')
  // (an autostart 0 the user chose, without anything the extension kept, is left alone)
  const own = fakeHost({ headless: false }, { dataDir: data, deps: { autostartIndexFile: index } })
  const ext2 = api.activate(own.host)
  await started(own)
  await ext2.apply({ headless: false })
  assert.ok(!own.execs.some((e) => e.join(' ').includes('dietpi-autostart')), JSON.stringify(own.execs))
  // (DietPi's "dietpi-autostart 0" deletes the index file instead of writing 0 - seen on the box: that is no kiosk too)
  fs.rmSync(index)
  fs.writeFileSync(path.join(data, 'autostart.json'), JSON.stringify({ index: 11 }))
  const gone = fakeHost({ headless: false }, { dataDir: data, deps: { autostartIndexFile: index } })
  const ext3 = api.activate(gone.host)
  await started(gone)
  await ext3.apply({ headless: false })
  assert.ok(gone.execs.some((e) => e.join(' ') === 'sudo -n /boot/dietpi/dietpi-autostart 11'), JSON.stringify(gone.execs))
  fs.rmSync(data, { recursive: true, force: true })
})

// ---- what the extension asks the player ------------------------------------------------------------------------------------------
test('nothing is asked while the display program is not ready', async () => {
  const box = fakeHost({})
  const ext = api.activate(box.host)
  await settle()
  await settle()
  await ext.tick()
  assert.deepStrictEqual(box.fetched, [])
})

test('a paused medium lets the display go off; then only /local is asked now and then, and a start wakes it', async () => {
  let now = 1_000_000
  let playing = false
  const box = fakeHost({ sleepAfter: 1 }, { now: () => now, player: () => ({ currentPlayer: 'mplayer', currentType: 'local', playing, currentTrackname: 'Kapitel 1', path: 'a/b/c', volume: 40 }) })
  const ext = api.activate(box.host)
  await started(box)
  await ext.tick()
  assert.strictEqual(sentStates(box.procs[0]).at(-1).view, 'play', 'paused: its title for a while')
  now += 61_000
  await ext.tick()
  assert.strictEqual(sentStates(box.procs[0]).at(-1).view, 'off')
  const asked = box.fetched.length
  now += 500
  await ext.tick()
  now += 500
  await ext.tick()
  assert.strictEqual(box.fetched.length, asked, 'off: not every half second')
  now += 600
  await ext.tick()
  assert.deepStrictEqual(box.fetched.slice(asked), ['/local'], 'only /local - no network, no audio routes')
  const sent = sentStates(box.procs[0]).length
  now += 60_000
  await ext.tick()
  assert.strictEqual(sentStates(box.procs[0]).length, sent, 'the clock is not sent to a dark display')
  playing = true
  now += 1600
  await ext.tick()
  assert.strictEqual(sentStates(box.procs[0]).at(-1).view, 'overlay', 'the start wakes it')
})

test('Spotify\'s /state is asked while it plays, once in a while, and not while it is paused', async () => {
  let now = 1_000_000
  let pause = false
  const box = fakeHost({}, { now: () => now, player: () => ({ currentPlayer: 'spotify', pause, generation: 3, volume: 30 }), state: () => ({ is_playing: !pause, progress_ms: 10_000, item: { name: 'Lied', duration_ms: 200_000, artists: [{ name: 'Band' }] } }) })
  const ext = api.activate(box.host)
  await started(box)
  const states = () => box.fetched.filter((u) => u === '/state').length
  await ext.tick()
  assert.strictEqual(states(), 1)
  for (let i = 0; i < 20; i++) {
    now += 500
    await ext.tick()
  }
  assert.strictEqual(states(), 1, 'not every tick')
  assert.strictEqual(sentStates(box.procs[0]).at(-1).elapsed, 20, 'the progress counts on in between')
  now += 10_500
  await ext.tick()
  assert.strictEqual(states(), 2, 'after a while again')
  pause = true
  now += 500
  await ext.tick()
  assert.strictEqual(states(), 3, 'the pause is read at once')
  for (let i = 0; i < 200; i++) {
    now += 500
    await ext.tick()
  }
  assert.strictEqual(states(), 3, 'paused: never again')
  pause = false
  now += 500
  await ext.tick()
  assert.strictEqual(states(), 4, 'it plays again: at once')
})

// ---- review 0.1.5 -------------------------------------------------------------------------------------------------------------
test('Spotify: the next or the previous track is read at once, and a start that is not playing yet is asked again soon', async () => {
  let now = 1_000_000
  let triggerAt = 1
  let playing = false
  const box = fakeHost({}, { now: () => now, player: () => ({ currentPlayer: 'spotify', pause: false, generation: 3, triggerAt, volume: 30 }), state: () => ({ is_playing: playing, progress_ms: 0, item: { name: 'Lied', duration_ms: 200_000, artists: [{ name: 'Band' }] } }) })
  const ext = api.activate(box.host)
  await started(box)
  const states = () => box.fetched.filter((u) => u === '/state').length
  await ext.tick()
  assert.strictEqual(states(), 1)
  now += 500
  await ext.tick()
  assert.strictEqual(states(), 1, 'not before the short gap')
  now += 3000
  await ext.tick()
  assert.strictEqual(states(), 2, 'not playing yet: asked again after the short gap')
  playing = true
  now += 3000
  await ext.tick()
  assert.strictEqual(states(), 3)
  now += 3000
  await ext.tick()
  assert.strictEqual(states(), 3, 'it plays: once in a while again')
  triggerAt = 2
  now += 500
  await ext.tick()
  assert.strictEqual(states(), 4, 'the next track: at once')
  // (Spotify that says "not playing" for good, while /local says it may: asked again soon only for a while)
  playing = false
  triggerAt = 3
  for (let i = 0; i < 120; i++) {
    now += 500
    await ext.tick()
  }
  // (at once, then every 3 s for 20 s - 6 times -, then once in 20 s: twice in the 40 s left)
  assert.strictEqual(states(), 4 + 1 + 6 + 2)
})

test('another address or controller: the old driver switches its panel off; another size leaves the picture', async () => {
  const box = fakeHost({})
  const ext = api.activate(box.host)
  await settle()
  await settle()
  const quitOf = (proc) => proc.written.map((l) => JSON.parse(l)).find((m) => m.cmd === 'quit')
  let applied = ext.apply({ address: '0x3D' })
  await settle()
  box.procs[0].emit('close', 0)
  await applied
  assert.deepStrictEqual(quitOf(box.procs[0]), { cmd: 'quit', off: true })
  applied = ext.apply({ address: '0x3D', size: '128x32' })
  await settle()
  box.procs[1].emit('close', 0)
  await applied
  assert.deepStrictEqual(quitOf(box.procs[1]), { cmd: 'quit' })
  applied = ext.apply({ address: '0x3D', size: '128x32', controller: 'sh1106' })
  await settle()
  box.procs[2].emit('close', 0)
  await applied
  assert.deepStrictEqual(quitOf(box.procs[2]), { cmd: 'quit', off: true })
})

test('a switch-on that stopped half-way (autostart 0, no flag) and no OLED that answers: the kiosk comes back', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  for (const left of ['0', 'missing']) {
    const data = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'oled-data-'))
    const index = path.join(data, 'autostart_index')
    if (left === '0') fs.writeFileSync(index, '0\n')
    fs.writeFileSync(path.join(data, 'autostart.json'), JSON.stringify({ index: 11 }))
    const box = fakeHost({ headless: true }, { dataDir: data, deps: { autostartIndexFile: index } })
    const warned = []
    box.host.log = { warn: (text) => warned.push(text), info: () => undefined }
    const ext = api.activate(box.host)
    await settle()
    await settle()
    box.procs[0].stdout.emit('data', Buffer.from('{"event":"error","code":"no_display","message":"x"}\n'))
    await ext.apply({ headless: true })
    assert.strictEqual(box.config.mupibox.headless, false, left)
    assert.ok(box.execs.some((e) => e.join(' ') === 'sudo -n /boot/dietpi/dietpi-autostart 11'), `${left}: ${JSON.stringify(box.execs)}`)
    assert.strictEqual(fs.existsSync(path.join(data, 'autostart.json')), false, `${left}: nothing kept any more`)
    assert.ok(warned.some((w) => w.includes('no display answers')), JSON.stringify(warned))
    fs.rmSync(data, { recursive: true, force: true })
  }
})

test('a DSI display plugged in is the reason the log gives, also while the driver still starts', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const drm = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'oled-drm-'))
  fs.mkdirSync(path.join(drm, 'card1-DSI-1'))
  fs.writeFileSync(path.join(drm, 'card1-DSI-1', 'status'), 'connected\n')
  const box = fakeHost({ headless: true }, { deps: { drmDir: drm } })
  const warned = []
  box.host.log = { warn: (text) => warned.push(text), info: () => undefined }
  const ext = api.activate(box.host)
  await ext.apply({ headless: true })
  assert.ok(warned.some((w) => w.includes('a DSI display is connected')), JSON.stringify(warned))
  fs.rmSync(drm, { recursive: true, force: true })
})
