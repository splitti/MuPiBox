// node --test extensions/buttons/test/buttons.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { EventEmitter } = require('node:events')
const { createDebouncer, createButton, createTwin, REPEAT_MS, DEBOUNCE_MS } = require('../logic.js')
const { readInputs, ACTIONS, BUTTONS, TWINS } = require('../inputs.js')
const { gpiodMajor, headerChip, gpiomonArgs, parseEdge, createReader } = require('../reader.js')
const { outputTargets, nextOutput, isPlaying, createActions } = require('../actions.js')
const { _test } = require('../api.js')
const source = require('./manifest-source.js')

/** A clock that only moves when the test says so: set / clear as the logic wants them, advance(ms) runs what is due, in order. */
function clock() {
  let now = 0
  let ids = 0
  const waiting = new Map()
  return {
    set(fn, ms) {
      const id = ++ids
      waiting.set(id, { at: now + ms, fn })
      return id
    },
    clear(id) {
      waiting.delete(id)
    },
    advance(ms) {
      const end = now + ms
      for (;;) {
        const due = [...waiting.entries()].filter(([, w]) => w.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (!due) break
        waiting.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = end
    },
    pending: () => waiting.size,
  }
}

// ---------- the levels of a pin ----------

test('a level counts once it stayed: the bounce of the contacts is no press', () => {
  const timers = clock()
  const seen = []
  const d = createDebouncer({ timers, onChange: (p) => seen.push(p) })
  // down, up, down within a few milliseconds, then it stays down
  d.feed(true)
  timers.advance(3)
  d.feed(false)
  timers.advance(3)
  d.feed(true)
  timers.advance(DEBOUNCE_MS - 1)
  assert.deepEqual(seen, [])
  timers.advance(1)
  assert.deepEqual(seen, [true])
  // a spike while it is held changes nothing
  d.feed(false)
  timers.advance(5)
  d.feed(true)
  timers.advance(100)
  assert.deepEqual(seen, [true])
  d.feed(false)
  timers.advance(DEBOUNCE_MS)
  assert.deepEqual(seen, [true, false])
  d.stop()
  assert.equal(timers.pending(), 0)
})

// ---------- one button: short and long ----------

const button = (options) => {
  const timers = clock()
  const fired = []
  const b = createButton({ holdMs: 1000, timers, fire: (kind) => fired.push(kind), ...options })
  return { timers, fired, b }
}

test('dual action: the short press fires when the button is let go, the long one as soon as the hold time is reached', () => {
  const { timers, fired, b } = button({ hasLong: true })
  b.press()
  timers.advance(400)
  assert.deepEqual(fired, [], 'nothing while it is held: it may become a long press')
  b.release()
  assert.deepEqual(fired, ['short'])
  b.press()
  timers.advance(999)
  assert.deepEqual(fired, ['short'])
  timers.advance(1)
  assert.deepEqual(fired, ['short', 'long'], 'the long press does not wait for the release')
  timers.advance(5000)
  b.release()
  assert.deepEqual(fired, ['short', 'long'], 'no short press after a long one, and no repeat without hold_repeat')
  assert.equal(timers.pending(), 0)
})

test('dual action with repeat: the long action again and again while the button stays down', () => {
  const { timers, fired, b } = button({ hasLong: true, repeat: true })
  b.press()
  timers.advance(1000 + 3 * REPEAT_MS)
  assert.deepEqual(fired, ['long', 'long', 'long', 'long'])
  b.release()
  timers.advance(5000)
  assert.equal(fired.length, 4, 'let go: it stops')
})

test('a button without a long action fires at once - and repeats after the hold time when it is held', () => {
  const plain = button({ hasLong: false })
  plain.b.press()
  assert.deepEqual(plain.fired, ['short'], 'nothing to wait for')
  plain.timers.advance(5000)
  plain.b.release()
  assert.deepEqual(plain.fired, ['short'])

  const louder = button({ hasLong: false, repeat: true })
  louder.b.press()
  louder.timers.advance(999)
  assert.equal(louder.fired.length, 1)
  louder.timers.advance(1 + 2 * REPEAT_MS)
  assert.deepEqual(louder.fired, ['short', 'short', 'short', 'short'])
  louder.b.release()
  louder.timers.advance(5000)
  assert.equal(louder.fired.length, 4)
})

test('a press that is reported twice, or a release without a press, changes nothing', () => {
  const { timers, fired, b } = button({ hasLong: true })
  b.release()
  b.press()
  b.press()
  timers.advance(100)
  b.release()
  b.release()
  assert.deepEqual(fired, ['short'])
  // (stop: nothing fires afterwards)
  b.press()
  b.stop()
  timers.advance(5000)
  assert.deepEqual(fired, ['short'])
})

// ---------- two buttons, six actions ----------

const twin = (options) => {
  const timers = clock()
  const fired = []
  const t = createTwin({ holdMs: 1000, timers, fire: (kind) => fired.push(kind), ...options })
  return { timers, fired, t }
}

test('twin: each button alone, short and long', () => {
  const { timers, fired, t } = twin()
  t.press('a')
  timers.advance(200)
  t.release('a')
  t.press('b')
  timers.advance(200)
  t.release('b')
  assert.deepEqual(fired, ['short_a', 'short_b'])
  t.press('a')
  timers.advance(1000)
  assert.deepEqual(fired, ['short_a', 'short_b', 'long_a'])
  timers.advance(3000)
  t.release('a')
  assert.deepEqual(fired, ['short_a', 'short_b', 'long_a'], 'no repeat without hold_repeat, no short press after the long one')
  t.press('b')
  timers.advance(1000)
  t.release('b')
  assert.equal(fired.at(-1), 'long_b')
})

test('twin: both together, short and long - the second one may come a moment later', () => {
  const { timers, fired, t } = twin()
  t.press('a')
  timers.advance(60)
  t.press('b')
  timers.advance(200)
  t.release('a')
  assert.deepEqual(fired, [], 'one is still down')
  timers.advance(50)
  t.release('b')
  assert.deepEqual(fired, ['short_ab'])
  // long: the hold time counts from the moment both are down
  t.press('b')
  timers.advance(700)
  t.press('a')
  timers.advance(999)
  assert.deepEqual(fired, ['short_ab'])
  timers.advance(1)
  assert.deepEqual(fired, ['short_ab', 'long_ab'])
  t.release('a')
  t.release('b')
  assert.deepEqual(fired, ['short_ab', 'long_ab'])
})

test('twin with repeat: only a single button repeats, never both together', () => {
  const { timers, fired, t } = twin({ repeat: true })
  t.press('b')
  timers.advance(1000 + 2 * REPEAT_MS)
  assert.deepEqual(fired, ['long_b', 'long_b', 'long_b'])
  // (the other button pressed while this one repeats: it is not part of this press)
  t.press('a')
  timers.advance(REPEAT_MS)
  assert.equal(fired.length, 4)
  t.release('b')
  timers.advance(5000)
  assert.equal(fired.length, 4, 'its own button is up: the repeat ends, although the other is still down')
  t.release('a')
  assert.equal(fired.length, 4, 'and no short press of the other one')

  fired.length = 0
  t.press('a')
  t.press('b')
  timers.advance(1000 + 5 * REPEAT_MS)
  assert.deepEqual(fired, ['long_ab'])
  t.release('a')
  t.release('b')
  assert.equal(timers.pending(), 0)
})

test('twin: one of both let go early - no long press of both, the short one when the other is up too', () => {
  const { timers, fired, t } = twin()
  t.press('a')
  t.press('b')
  timers.advance(300)
  t.release('a')
  timers.advance(3000)
  assert.deepEqual(fired, [])
  t.release('b')
  assert.deepEqual(fired, ['short_ab'])
  // pressed again while the other is still down: the hold time of both starts anew
  t.press('a')
  t.press('b')
  timers.advance(500)
  t.release('b')
  timers.advance(200)
  t.press('b')
  timers.advance(999)
  assert.deepEqual(fired, ['short_ab'])
  timers.advance(1)
  assert.deepEqual(fired, ['short_ab', 'long_ab'])
})

// ---------- the settings as inputs ----------

test('the settings give the inputs: only buttons with a pin and something to do', () => {
  const inputs = readInputs({ b1Pin: 17, b1Short: 'volUp', b1ShortStep: 3, b1Long: 'none', b1Hold: 1, b1Repeat: false, b2Pin: 0, b2Short: 'next', b3Pin: 22, b3Short: 'none', b3Long: 'none', b4Pin: 23, b4Short: 'prev', b4Long: 'volDown', b4LongStep: 10, b4Hold: 1.5, b4Repeat: true })
  // (every action has its own volume step: 5 percent until one is chosen)
  assert.deepEqual(inputs.buttons, [
    { name: 'button 1', pin: 17, short: 'volUp', long: 'none', steps: { short: 3, long: 5 }, holdMs: 1000, repeat: false },
    { name: 'button 4', pin: 23, short: 'prev', long: 'volDown', steps: { short: 5, long: 10 }, holdMs: 1500, repeat: true },
  ])
  const twin = readInputs({ t1PinA: 5, t1PinB: 6, t1LongA: 'volDown', t1LongAStep: 2, t1LongB: 'volUp', t1LongBStep: 99 }).twins[0]
  assert.deepEqual(twin.steps, { short_a: 5, short_b: 5, short_ab: 5, long_a: 2, long_b: 5, long_ab: 5 })
  assert.deepEqual(inputs.pins, [17, 23], 'a button that does nothing holds no pin')
  assert.deepEqual(inputs.problems, [])
})

test('settings that make no sense are left out and named: a pin twice, half a twin, a twin on one pin', () => {
  const inputs = readInputs({
    b1Pin: 17,
    b1Short: 'toggle',
    b2Pin: 17,
    b2Short: 'next',
    t1PinA: 5,
    t1PinB: 0,
    t1ShortA: 'prev',
    t2PinA: 6,
    t2PinB: 6,
    t2ShortA: 'prev',
  })
  assert.deepEqual(inputs.pins, [17])
  assert.equal(inputs.buttons.length, 1)
  assert.equal(inputs.twins.length, 0)
  assert.equal(inputs.problems.length, 3)
  // a twin on a pin a button has
  const clash = readInputs({ b1Pin: 17, b1Short: 'toggle', t1PinA: 17, t1PinB: 27, t1ShortA: 'prev' })
  assert.deepEqual(clash.pins, [17])
  assert.match(clash.problems[0], /GPIO 17 is used twice/)
})

test('what is not a pin, an action or a time does no harm', () => {
  for (const bad of [null, undefined, 'x', 42, []]) assert.deepEqual(readInputs(bad).pins, [])
  const inputs = readInputs({ b6ShortStep: 99, b1Pin: '17', b2Pin: 1, b3Pin: 28, b4Pin: 17.5, b5Pin: 4, b5Short: 'rm -rf', b5Long: '__proto__', b6Pin: 5, b6Short: 'next', b6Hold: 'long', t1PinA: 6, t1PinB: 7, t1ShortAB: 'toggle', t1Hold: 99 })
  assert.deepEqual(inputs.buttons.map((b) => [b.pin, b.short, b.long, b.holdMs, b.steps.short]), [[5, 'next', 'none', 1000, 5]])
  assert.deepEqual(inputs.twins.map((t) => [t.a, t.b, t.actions.short_ab, t.actions.long_a, t.holdMs]), [[6, 7, 'toggle', 'none', 5000]])
})

// ---------- gpiomon ----------

test('gpiomon of libgpiod 1 (Debian 12) and 2 (Debian 13): the version, the arguments, a line', () => {
  assert.equal(gpiodMajor('gpiomon (libgpiod) v1.6.3\nCopyright (C) 2017-2018 Bartosz Golaszewski'), 1)
  assert.equal(gpiodMajor('gpiomon (libgpiod) v2.2.1'), 2)
  for (const none of ['', undefined, null, 'command not found', 'gpiomon']) assert.equal(gpiodMajor(none), 0)

  assert.deepEqual(gpiomonArgs(1, 'gpiochip0', [17, 27]), ['--bias=pull-up', '--line-buffered', '--format=%o %e', 'gpiochip0', '17', '27'])
  assert.deepEqual(gpiomonArgs(2, 'gpiochip4', [17, 27]), ['--chip', 'gpiochip4', '--bias', 'pull-up', '--edges', 'both', '--format', '%o %E', '17', '27'])

  // a falling edge is a press: the button pulls the pin to GND
  assert.deepEqual(parseEdge(1, '17 0'), { pin: 17, pressed: true })
  assert.deepEqual(parseEdge(1, '17 1'), { pin: 17, pressed: false })
  assert.deepEqual(parseEdge(2, '27 falling'), { pin: 27, pressed: true })
  assert.deepEqual(parseEdge(2, ' 27 rising \r'), { pin: 27, pressed: false })
  for (const junk of ['', 'event: FALLING EDGE offset: 17', '17', '17 2', 'x 0', '170 0 1', null]) assert.equal(parseEdge(1, junk), null, String(junk))
  for (const junk of ['27 1', '27 2', '27 both', 'gpiomon: cannot find line 99']) assert.equal(parseEdge(2, junk), null, junk)
})

test('the chip of the header pins: the RP1 of a Pi 5, the SoC of the others', () => {
  const pi5 = 'gpiochip0 [pinctrl-rp1] (54 lines)\ngpiochip10 [gpio-brcmstb@107d508500] (32 lines)\ngpiochip14 [touchscreen-panel-r] (16 lines)'
  assert.equal(headerChip(pi5), 'gpiochip0')
  // (a Pi 5 with a kernel before the chips were renumbered)
  assert.equal(headerChip('gpiochip0 [gpio-brcmstb@107d508500] (32 lines)\ngpiochip4 [pinctrl-rp1] (54 lines)'), 'gpiochip4')
  assert.equal(headerChip('gpiochip0 [pinctrl-bcm2711] (58 lines)\ngpiochip1 [raspberrypi-exp-gpio] (8 lines)'), 'gpiochip0')
  assert.equal(headerChip('gpiochip1 [raspberrypi-exp-gpio] (8 lines)\ngpiochip0 [pinctrl-bcm2835] (54 lines)'), 'gpiochip0')
  assert.equal(headerChip(''), 'gpiochip0')
  assert.equal(headerChip(undefined), 'gpiochip0')
})

/** A gpiomon that is not one: what it was started with, and stdout / stderr / exit to play it. */
function fakeGpiomon() {
  const started = []
  const spawnFn = (cmd, args) => {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.killed = []
    proc.kill = (signal) => {
      proc.killed.push(signal)
      setImmediate(() => proc.emit('exit', null, signal))
    }
    started.push({ cmd, args, proc })
    return proc
  }
  return { started, spawnFn }
}
const quiet = { info: () => undefined, warn: () => undefined }

test('the reader starts gpiomon for the installed libgpiod and hands on its edges - whole lines only, asked pins only', async () => {
  const { started, spawnFn } = fakeGpiomon()
  const edges = []
  const runFn = async (cmd) => ({ ok: true, out: cmd === 'gpiomon' ? 'gpiomon (libgpiod) v2.2.1' : 'gpiochip0 [pinctrl-rp1] (54 lines)' })
  const reader = createReader({ pins: [17, 27], onEdge: (pin, pressed) => edges.push([pin, pressed]), log: quiet, spawnFn, runFn })
  await reader.start()
  assert.equal(started.length, 1)
  assert.equal(started[0].cmd, 'gpiomon')
  assert.deepEqual(started[0].args, gpiomonArgs(2, 'gpiochip0', [17, 27]))
  const out = started[0].proc.stdout
  out.emit('data', Buffer.from('17 fal'))
  assert.deepEqual(edges, [])
  out.emit('data', Buffer.from('ling\n17 rising\n5 falling\nnonsense\n27 falling\n'))
  assert.deepEqual(edges, [
    [17, true],
    [17, false],
    [27, true],
  ])
  assert.deepEqual({ ...reader.state(), starts: undefined }, { running: true, error: null, chip: 'gpiochip0', version: 2, starts: undefined, pins: [17, 27] })
  await reader.stop()
  assert.deepEqual(started[0].proc.killed, ['SIGTERM'])
  assert.equal(reader.state().running, false)
})

test('the reader says why nothing is read: no gpiomon, or a gpiomon that ends with an error', async () => {
  const none = createReader({ pins: [17], onEdge: () => undefined, log: quiet, spawnFn: () => assert.fail('must not start'), runFn: async () => ({ ok: false, out: '' }) })
  await none.start()
  assert.match(none.state().error, /gpiomon is not installed/)
  await none.stop()

  const { started, spawnFn } = fakeGpiomon()
  const reader = createReader({ pins: [17], onEdge: () => undefined, log: quiet, spawnFn, runFn: async (cmd) => ({ ok: true, out: cmd === 'gpiomon' ? 'gpiomon (libgpiod) v1.6.3' : '' }) })
  await reader.start()
  assert.deepEqual(started[0].args, gpiomonArgs(1, 'gpiochip0', [17]))
  started[0].proc.stderr.emit('data', Buffer.from('gpiomon: error waiting for events: Device or resource busy\n'))
  started[0].proc.emit('exit', 1, null)
  assert.equal(reader.state().running, false)
  assert.match(reader.state().error, /Device or resource busy/)
  // (stopped while it waits for the next try: no second start)
  await reader.stop()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(started.length, 1)

  // without pins nothing is started at all
  const empty = createReader({ pins: [], onEdge: () => undefined, log: quiet, spawnFn: () => assert.fail('must not start'), runFn: () => assert.fail('must not ask') })
  await empty.start()
  await empty.stop()
})

// ---------- the actions ----------

test('the outputs a press goes through: the sound cards (or the one speaker), then the Bluetooth devices', () => {
  assert.deepEqual(outputTargets({ current: 'box', devices: [], cards: [] }), ['box'])
  assert.equal(nextOutput({ current: 'box', devices: [], cards: [] }), null, 'only one: nothing to switch')
  const two = { current: 'box', devices: [{ mac: 'AA:BB:CC:DD:EE:FF', name: 'Kopfhörer' }], cards: [] }
  assert.equal(nextOutput(two), 'AA:BB:CC:DD:EE:FF')
  assert.equal(nextOutput({ ...two, current: 'AA:BB:CC:DD:EE:FF' }), 'box')
  const cards = { current: 'card:hdmi', devices: [{ mac: 'AA:BB:CC:DD:EE:FF' }], cards: [{ id: 'amp' }, { id: 'hdmi' }] }
  assert.deepEqual(outputTargets(cards), ['card:amp', 'card:hdmi', 'AA:BB:CC:DD:EE:FF'])
  assert.equal(nextOutput(cards), 'AA:BB:CC:DD:EE:FF')
  // (an output the list does not know: the first one)
  assert.equal(nextOutput({ ...cards, current: 'gone' }), 'card:amp')
  assert.deepEqual(outputTargets(null), ['box'])
  assert.deepEqual(outputTargets({ cards: 'x', devices: [{}, { mac: 7 }] }), ['box'])
})

test('playing is what the player itself calls playing', () => {
  assert.equal(isPlaying({ currentPlayer: 'spotify', pause: false }), true)
  assert.equal(isPlaying({ currentPlayer: 'spotify', pause: true }), false)
  assert.equal(isPlaying({ currentPlayer: 'mplayer', playing: true }), true)
  assert.equal(isPlaying({ currentPlayer: 'mplayer', playing: false, pause: false }), false)
  assert.equal(isPlaying({}), false)
  assert.equal(isPlaying(null), false)
})

/** The player and the server as lists of what was asked of them. */
function fakeBox({ meta = {}, outputs = { current: 'box', devices: [], cards: [] }, slow = 0 } = {}) {
  const calls = []
  const fetchFn = async (url, options = {}) => {
    calls.push(`${options.method ?? 'GET'} ${url}${options.body ? ` ${options.body}` : ''}`)
    if (slow) await new Promise((resolve) => setTimeout(resolve, slow))
    const body = url.endsWith('/local') ? meta : url.endsWith('/api/audio-output') ? outputs : { status: 'ok' }
    return { ok: true, status: 200, json: async () => body }
  }
  return { calls, fetchFn }
}
const P = 'http://127.0.0.1:5005'
const A = 'http://127.0.0.1:8200'

test('every action asks the player what the display would ask it', async () => {
  const { calls, fetchFn } = fakeBox({ meta: { currentPlayer: 'mplayer', playing: true, shuffle: false } })
  const actions = createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn })
  for (const name of ['next', 'prev', 'replay', 'ffwd', 'rewind', 'stop', 'shutdown']) await actions.do(name)
  assert.deepEqual(calls, ['next', 'previous', 'replay', 'seek+30', 'seek-30', 'stop', 'shutoff'].map((c) => `GET ${P}/${c}?src=buttons`))
  // louder and quieter by the step that comes with the action: 1 to 10 percent, 5 without one
  calls.length = 0
  await actions.do('volUp', 3)
  await actions.do('volDown', 10)
  await actions.do('volUp')
  await actions.do('volDown', 500)
  await actions.do('volUp', 'x')
  assert.deepEqual(calls, ['+3', '-10', '+5', '-10', '+5'].map((c) => `GET ${P}/${c}?src=buttons`))
  calls.length = 0
  await actions.do('toggle')
  await actions.do('shuffle')
  assert.deepEqual(calls, [`GET ${P}/local`, `GET ${P}/pause?src=buttons`, `GET ${P}/local`, `GET ${P}/shuffleon?src=buttons`])
  // every action of the settings is one the extension can do
  const known = createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn })
  for (const name of ACTIONS) if (name !== 'none') assert.equal(await known.do(name), true, name)
})

test('play/pause and shuffle go by what the player says; nothing playing means play', async () => {
  const paused = fakeBox({ meta: { currentPlayer: 'spotify', pause: true, shuffle: true } })
  const actions = createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn: paused.fetchFn })
  await actions.do('toggle')
  await actions.do('shuffle')
  assert.deepEqual(paused.calls.filter((c) => !c.endsWith('/local')), [`GET ${P}/play?src=buttons`, `GET ${P}/shuffleoff?src=buttons`])
})

test('repeat goes all -> one -> off -> all by what the player says; an older player knows only on and off', async () => {
  const modes = []
  for (const meta of [{ repeatMode: 'off' }, { repeatMode: 'all' }, { repeatMode: 'one' }, { repeat: true }, { repeat: false }, null]) {
    const box = fakeBox({ meta })
    await createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn: box.fetchFn }).do('repeat')
    modes.push(box.calls.filter((c) => !c.endsWith('/local')).map((c) => c.replace(`GET ${P}/`, '').replace('?src=buttons', ''))[0])
  }
  assert.deepEqual(modes, ['repeatall', 'repeatone', 'repeatoff', 'repeatone', 'repeatall', 'repeatall'])
})

test('the output goes to the next one - and stays when there is only one', async () => {
  const one = fakeBox()
  await createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn: one.fetchFn }).do('output')
  assert.deepEqual(one.calls, [`GET ${A}/api/audio-output`])
  const two = fakeBox({ outputs: { current: 'box', devices: [{ mac: 'AA:BB:CC:DD:EE:FF' }], cards: [] } })
  await createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn: two.fetchFn }).do('output')
  assert.deepEqual(two.calls, [`GET ${A}/api/audio-output`, `POST ${A}/api/audio-output {"target":"AA:BB:CC:DD:EE:FF"}`])
})

test('an unknown action does nothing, a failing one does not stop the next, and a held button builds no queue', async () => {
  const { calls, fetchFn } = fakeBox({ slow: 15 })
  const actions = createActions({ playerUrl: P, apiUrl: A, log: quiet, fetchFn })
  for (const name of ['none', 'nope', '__proto__', 'constructor', 'toString']) assert.equal(await actions.do(name), false, name)
  assert.deepEqual(calls, [])
  // ten presses at once while the box is slow: the first few wait in line, the others are dropped
  const results = await Promise.all(Array.from({ length: 10 }, () => actions.do('volUp')))
  assert.equal(results.filter(Boolean).length, 3)
  assert.equal(calls.length, 3)
  const failing = createActions({
    playerUrl: P,
    apiUrl: A,
    log: quiet,
    fetchFn: async (url) => {
      if (url.includes('/next')) throw new Error('connection refused')
      calls.push(url)
      return { ok: true, json: async () => ({}) }
    },
  })
  calls.length = 0
  assert.equal(await failing.do('next'), true)
  assert.equal(await failing.do('prev'), true)
  assert.deepEqual(calls, [`${P}/previous?src=buttons`])
})

// ---------- from the pin to the action ----------

test('from an edge of a pin to the action: a button, a dual action button and a twin', async () => {
  const timers = clock()
  const done = []
  const events = []
  let fed = null
  const inputs = readInputs({ b1Pin: 17, b1Short: 'toggle', b3Pin: 22, b3Short: 'prev', b3Long: 'replay', b3Hold: 1, t1PinA: 5, t1PinB: 6, t1ShortA: 'prev', t1ShortB: 'next', t1ShortAB: 'toggle', t1LongA: 'volDown', t1LongB: 'volUp', t1LongBStep: 3, t1LongAB: 'output', t1Hold: 1, t1Repeat: true })
  const runtime = _test.createRuntime({
    inputs,
    timers,
    log: quiet,
    actions: { do: (name, step) => done.push(name.startsWith('vol') ? `${name} ${step}` : name) },
    onEvent: (e) => events.push(`${e.input} ${e.kind} ${e.action}`),
    makeReader: ({ pins, onEdge }) => {
      fed = { pins, onEdge }
      return { start: async () => undefined, stop: async () => undefined, kill: () => undefined, state: () => ({ running: true, pins }) }
    },
  })
  await runtime.start()
  assert.deepEqual(fed.pins, [17, 22, 5, 6])
  const press = (pin, ms) => {
    fed.onEdge(pin, true)
    timers.advance(ms)
    fed.onEdge(pin, false)
    timers.advance(DEBOUNCE_MS)
  }
  press(17, 100)
  assert.deepEqual(done, ['toggle'])
  press(22, 300)
  assert.deepEqual(done, ['toggle', 'prev'])
  press(22, 1500)
  assert.deepEqual(done, ['toggle', 'prev', 'replay'])
  // the twin: B held is louder, again and again; both short is play/pause
  done.length = 0
  press(6, DEBOUNCE_MS + 1000 + 2 * REPEAT_MS)
  assert.deepEqual(done, ['volUp 3', 'volUp 3', 'volUp 3'], 'with the step of this action')
  fed.onEdge(5, true)
  fed.onEdge(6, true)
  timers.advance(200)
  fed.onEdge(5, false)
  fed.onEdge(6, false)
  timers.advance(DEBOUNCE_MS)
  assert.equal(done.at(-1), 'toggle')
  assert.equal(events.at(-1), 'twin 1 short_ab toggle')
  // a pin that is not watched, and a bounce shorter than the debounce time: nothing
  done.length = 0
  fed.onEdge(13, true)
  fed.onEdge(17, true)
  timers.advance(5)
  fed.onEdge(17, false)
  timers.advance(1000)
  assert.deepEqual(done, [])
  await runtime.stop()
  assert.equal(timers.pending(), 0, 'stopped: no timer left')
})

// ---------- the manifest ----------

test('manifest.json is what test/manifest-source.js writes, and every action has a name in the app', () => {
  assert.equal(fs.readFileSync(source.file, 'utf8').replace(/\r\n/g, '\n'), source.text(), 'run: node extensions/buttons/test/manifest-source.js --write')
  const manifest = source.build()
  assert.deepEqual(Object.keys(source.ACTION_LABELS), ACTIONS)
  const pins = Object.entries(manifest.settings).filter(([, s]) => s.type === 'gpio')
  assert.equal(pins.length, BUTTONS + 2 * TWINS)
  for (const [, spec] of pins) assert.equal(spec.default, 0, 'no pin until the user chooses one')
  // every setting the code reads is one the manifest has, with a field in the app
  // (a name and "it was added" belong to the heading of a button, not to a field of their own)
  for (const key of Object.keys(manifest.settings)) assert.ok(manifest.ui.items.some((i) => i.key === key || i.rename === key || i.optional === key || i.extra?.key === key), key)
  // every action has its volume step beside it, shown for "louder" and "quieter" only
  for (const item of manifest.ui.items.filter((i) => i.choices?.some((c) => c.value === 'volUp'))) {
    assert.deepEqual(item.extra.when, ['volUp', 'volDown'], item.key)
    assert.equal(manifest.settings[item.extra.key].default, 5, item.extra.key)
  }
  assert.equal(manifest.settings.volumeStep, undefined, 'no step for all of them any more')
  // every button and twin can be named; only button 1 is there from the start, the others are added
  const headings = manifest.ui.items.filter((i) => i.type === 'heading')
  assert.equal(headings.length, BUTTONS + TWINS)
  for (const h of headings) assert.equal(manifest.settings[h.rename].default, '', h.rename)
  assert.deepEqual(headings.filter((h) => h.optional === undefined).map((h) => h.rename), ['b1Name'])
  for (const h of headings.filter((x) => x.optional)) assert.equal(manifest.settings[h.optional].default, false, h.optional)
  // the defaults are a set of inputs that works once the pins are chosen
  const defaults = Object.fromEntries(Object.entries(manifest.settings).map(([k, s]) => [k, s.default]))
  let pin = 2
  for (const [key] of pins) defaults[key] = pin++
  const inputs = readInputs(defaults)
  assert.equal(inputs.buttons.length, BUTTONS)
  assert.equal(inputs.twins.length, TWINS)
  assert.deepEqual(inputs.problems, [])
})
