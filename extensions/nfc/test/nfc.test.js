// Tests of the NFC-Reader extension without a reader: the settings, the reports of the driver, the program that runs it, the status.
// node --test extensions/nfc/test/nfc.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { readConfig, driverScript, driverArgs, uidText, readEvent, statusRows, problemText, PROBLEMS } = require('../logic.js')
const { createRunner, headerChipNumber } = require('../runner.js')

test('a reader is only started with two different pins for BUSY and RST', () => {
  assert.strictEqual(readConfig({}).reader, 'none')
  assert.strictEqual(readConfig({ reader: 'pn5180' }).problem, 'pins')
  assert.strictEqual(readConfig({ reader: 'pn5180', busyPin: 25 }).problem, 'pins')
  assert.strictEqual(readConfig({ reader: 'pn5180', busyPin: 25, resetPin: 25 }).problem, 'pins')
  assert.strictEqual(readConfig({ reader: 'pn5180', busyPin: 25, resetPin: 23 }).problem, null)
})

test('settings that make no sense fall back to the defaults', () => {
  const c = readConfig({ reader: 'pn5180', busyPin: 99, resetPin: 'x', spiDevice: '3.7', tech: 'z' })
  assert.deepStrictEqual([c.busy, c.reset, c.spi, c.tech], [0, 0, '0.0', 'both'])
})

test('the driver gets the pins, the chip of the header, the SPI device and the kinds of tags', () => {
  const c = readConfig({ reader: 'pn5180', busyPin: 25, resetPin: 23, spiDevice: '0.1', tech: 'v' })
  assert.deepStrictEqual(driverArgs(c, 4), ['--busy', '25', '--reset', '23', '--chip', '4', '--spi', '0.1', '--tech', 'v'])
})

test('the chip of the header pins: the RP1 of a Pi 5, else the SoC', () => {
  assert.strictEqual(headerChipNumber('gpiochip0 [pinctrl-rp1] (54 lines)\ngpiochip10 [gpio-brcmstb@107d508500] (32 lines)\n'), 0)
  assert.strictEqual(headerChipNumber('gpiochip4 [pinctrl-rp1] (54 lines)\ngpiochip0 [gpio-brcmstb] (32 lines)\n'), 4)
  assert.strictEqual(headerChipNumber('gpiochip0 [pinctrl-bcm2711] (58 lines)\n'), 0)
  assert.strictEqual(headerChipNumber(''), 0)
})

test('a UID is written in pairs of digits', () => {
  assert.strictEqual(uidText('E004010012345678'), 'E0:04:01:00:12:34:56:78')
  assert.strictEqual(uidText('04a1b2c3'), '04:A1:B2:C3')
})

test('only the reports of the driver are taken, and only in the shape it says them', () => {
  assert.deepStrictEqual(readEvent({ event: 'ready', firmware: '4.0', product: '3.5' }), { event: 'ready', firmware: '4.0', product: '3.5' })
  assert.deepStrictEqual(readEvent({ event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' }), { event: 'tag', tech: 'ISO14443A', uid: '04A1B2C3' })
  assert.strictEqual(readEvent({ event: 'tag', tech: 'ISO14443A', uid: 'not a uid' }), null)
  assert.strictEqual(readEvent({ event: 'tag', tech: 'other', uid: '04A1B2C3' }), null)
  assert.strictEqual(readEvent({ event: 'format-the-disk' }), null)
  assert.strictEqual(readEvent('ready'), null)
  assert.strictEqual(readEvent(null), null)
  assert.strictEqual(readEvent({ event: 'error', code: 'no_chip', message: 'x'.repeat(500) }).message.length, 200)
})

test('every problem the driver names has a text for the app', () => {
  for (const code of ['no_spi', 'spi_access', 'no_python', 'gpio', 'busy_timeout', 'no_chip', 'other', 'pins']) assert.ok(PROBLEMS[code], code)
  assert.strictEqual(problemText('something new'), PROBLEMS.other)
})

test('the status says what the user has to do, step by step', () => {
  const view = (over = {}) => ({ config: readConfig({ reader: 'pn5180', busyPin: 25, resetPin: 23 }), phase: 'starting', firmware: null, product: null, errorCode: null, inField: false, last: null, ...over })
  assert.deepStrictEqual(statusRows(view({ config: readConfig({}) })), [{ label: 'Leser', value: 'Aus', tone: 'warn' }])
  assert.match(JSON.stringify(statusRows(view({ config: readConfig({ reader: 'pn5180' }) }))), /BUSY und RST/)
  assert.match(JSON.stringify(statusRows(view())), /Wird gestartet/)
  const failed = statusRows(view({ phase: 'error', errorCode: 'no_spi' }))
  assert.deepStrictEqual(failed.map((r) => r.tone), ['error', 'error'])
  assert.match(failed[1].value, /dtparam=spi=on/)
  const ready = statusRows(view({ phase: 'ready', firmware: '4.0' }))
  assert.deepStrictEqual(ready.map((r) => r.value), ['Bereit', 'PN5180 4.0', 'Nein', 'Noch keiner gelesen'])
  const seen = statusRows(view({ phase: 'ready', firmware: '4.0', inField: true, last: { tech: 'ISO15693', uid: 'E004010012345678' } }))
  assert.deepStrictEqual(seen.slice(2).map((r) => r.value), ['Ja', 'E0:04:01:00:12:34:56:78 · ISO 15693'])
})

// -- the program that runs the driver ----------------------------------------------------------------------------------------------
function fakeSpawn() {
  const made = []
  const spawnFn = (command, args) => {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.killed = []
    proc.kill = (signal) => {
      proc.killed.push(signal)
      setImmediate(() => proc.emit('exit', null, signal))
    }
    proc.command = command
    proc.args = args
    made.push(proc)
    return proc
  }
  return { spawnFn, made }
}
const quiet = { warn() {}, info() {}, debug() {} }

test('the reports of the driver come one per line, also when they arrive in pieces', () => {
  const { spawnFn, made } = fakeSpawn()
  const events = []
  createRunner({ command: 'python3', args: ['x.py'], onEvent: (e) => events.push(e), log: quiet, spawnFn }).start()
  made[0].stdout.emit('data', Buffer.from('{"event":"starting"}\n{"event":"rea'))
  made[0].stdout.emit('data', Buffer.from('dy","firmware":"4.0","product":"3.5"}\nnot json\n{"event":"gone"}\n'))
  assert.deepStrictEqual(events.map((e) => e.event), ['starting', 'ready', 'gone'])
})

test('a driver that ends is started again later, and more slowly each time it ends at once', () => {
  const { spawnFn, made } = fakeSpawn()
  const timers = []
  let time = 0
  const ended = []
  const runner = createRunner({
    command: 'python3',
    args: [],
    onEvent() {},
    onEnd: (why) => ended.push(why),
    log: quiet,
    spawnFn,
    setTimer: (fn, ms) => timers.push({ fn, ms }) && timers[timers.length - 1],
    clearTimer() {},
    now: () => time,
  })
  runner.start()
  made[0].stderr.emit('data', Buffer.from('Traceback ...\nImportError: no spidev\n'))
  made[0].emit('exit', 2, null)
  assert.deepStrictEqual(ended, ['ImportError: no spidev'])
  assert.strictEqual(timers[0].ms, 3000)
  timers[0].fn()
  assert.strictEqual(made.length, 2)
  made[1].emit('exit', 2, null)
  assert.strictEqual(timers[1].ms, 6000)
  timers[1].fn()
  made[2].emit('exit', 2, null)
  assert.strictEqual(timers[2].ms, 12000)
  // (one that ran for a while starts soon again)
  timers[2].fn()
  time = 60000
  made[3].emit('exit', 0, null)
  assert.strictEqual(timers[3].ms, 3000)
})

test('python3 that is not there is a reason, not a crash', () => {
  const { spawnFn, made } = fakeSpawn()
  const ended = []
  createRunner({ command: 'python3', args: [], onEvent() {}, onEnd: (why) => ended.push(why), log: quiet, spawnFn, setTimer: () => 0, clearTimer() {} }).start()
  made[0].emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }))
  assert.deepStrictEqual(ended, ['python3 is not installed'])
})

test('stop ends the driver and starts nothing again', async () => {
  const { spawnFn, made } = fakeSpawn()
  const runner = createRunner({ command: 'python3', args: [], onEvent() {}, log: quiet, spawnFn })
  runner.start()
  await runner.stop()
  assert.deepStrictEqual(made[0].killed, ['SIGTERM'])
  assert.strictEqual(runner.state().running, false)
  assert.strictEqual(made.length, 1)
})

// -- the API part --------------------------------------------------------------------------------------------------------------------
test('the status route answers with the lines for the app, also while no reader is chosen', async () => {
  const { activate } = require('../api.js')
  const routes = {}
  const host = {
    dir: __dirname,
    log: quiet,
    settings: async () => ({ reader: 'none' }),
    onSettings: () => undefined,
    route: (method, sub, handler, options) => (routes[`${method} ${sub}`] = { handler, options }),
  }
  activate(host)
  await new Promise((resolve) => setImmediate(resolve))
  const route = routes['get /state']
  assert.ok(route.options.session, 'only for the parents')
  let body
  route.handler({}, { json: (b) => (body = b) })
  assert.deepStrictEqual(body.rows, [{ label: 'Leser', value: 'Aus', tone: 'warn' }])
  assert.deepStrictEqual(body.history, [])
})

// -- the other readers ---------------------------------------------------------------------------------------------------------------------
test('each reader has its own driver program', () => {
  assert.strictEqual(driverScript(readConfig({ reader: 'pn5180' })), 'pn5180.py')
  assert.strictEqual(driverScript(readConfig({ reader: 'rc522' })), 'rc522.py')
  assert.strictEqual(driverScript(readConfig({ reader: 'pn532' })), 'pn532.py')
  assert.strictEqual(driverScript(readConfig({ reader: 'hid' })), 'usbreader.py')
  assert.strictEqual(driverScript(readConfig({})), null)
  assert.strictEqual(readConfig({ reader: 'nonsense' }).reader, 'none')
})

test('the RC522 needs no pin; with RST the driver gets it, without it does not', () => {
  assert.strictEqual(readConfig({ reader: 'rc522' }).problem, null)
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'rc522', spiDevice: '0.1' }), 0), ['--chip', '0', '--spi', '0.1'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'rc522', resetPin: 25 }), 4), ['--reset', '25', '--chip', '4', '--spi', '0.0'])
})

test('the PN532 gets its interface, the SPI device and the serial port', () => {
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'pn532' }), 0), ['--link', 'i2c', '--spi', '0.0', '--uart', '/dev/serial0'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'pn532', pn532Link: 'uart', uartDevice: '/dev/ttyAMA0' }), 0), ['--link', 'uart', '--spi', '0.0', '--uart', '/dev/ttyAMA0'])
  // (what is no known interface or serial port falls back: nothing else reaches the command line)
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'pn532', pn532Link: 'usb', uartDevice: '/etc/passwd' }), 0), ['--link', 'i2c', '--spi', '0.0', '--uart', '/dev/serial0'])
})

test('the USB reader gets the name that was typed, only if it is a plain name', () => {
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid' }), 0), ['--device', ''])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: ' IC Reader ' }), 0), ['--device', 'IC Reader'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: '/dev/input/event3' }), 0), ['--device', '/dev/input/event3'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: 'a; rm -rf /*' }), 0), ['--device', ''])
})

test('only the PN5180 chooses the kind of tag; the others look for ISO 14443 A', () => {
  assert.strictEqual(readConfig({ reader: 'pn5180', tech: 'v' }).tech, 'v')
  for (const reader of ['rc522', 'pn532', 'hid']) assert.strictEqual(readConfig({ reader, tech: 'v' }).tech, 'a')
})

test('the report of a USB reader is a tag of the kind HID', () => {
  assert.deepStrictEqual(readEvent({ event: 'tag', tech: 'HID', uid: '0004567890' }), { event: 'tag', tech: 'HID', uid: '0004567890' })
  assert.strictEqual(readEvent({ event: 'tag', tech: 'HID', uid: '12' }), null)
})

test('the status names the chip of the reader; a USB reader has no tag in the field', () => {
  const view = (reader, extra = {}) => ({ config: readConfig({ reader }), phase: 'ready', firmware: 'v2.0', product: 'MFRC522', inField: false, last: null, ...extra })
  assert.deepStrictEqual(statusRows(view('rc522')).slice(0, 2), [{ label: 'Leser', value: 'Bereit', tone: 'ok' }, { label: 'Chip', value: 'MFRC522 v2.0', tone: 'ok' }])
  assert.strictEqual(statusRows(view('pn532', { firmware: '1.6' }))[1].value, 'PN532 1.6')
  const usb = statusRows(view('hid', { firmware: '', product: 'HXGCoLtd Keyboard', last: { tech: 'HID', uid: '0004567890' } }))
  assert.deepStrictEqual(usb[1], { label: 'Gerät', value: 'HXGCoLtd Keyboard', tone: 'ok' })
  assert.ok(!usb.some((row) => row.label === 'Tag im Feld'))
  assert.match(JSON.stringify(usb), /USB-Leser/)
  assert.match(JSON.stringify(usb), /0004567890 · USB-Leser/) // (as typed, not in pairs)
})

test('the new problems have a text', () => {
  for (const code of ['no_i2c', 'i2c_access', 'no_serial', 'serial_access', 'no_device', 'several_devices', 'input_access']) assert.notStrictEqual(problemText(code), PROBLEMS.other, code)
})
