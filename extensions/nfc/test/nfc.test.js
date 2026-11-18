// Tests of the NFC-Reader extension without a reader: the settings, the reports of the driver, the program that runs it, the status.
// node --test extensions/nfc/test/nfc.test.js
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { spiState, spiRows, i2cState, i2cRows, i2cKeysOn, uartState, uartRows, uartConsoles, readConfig, readConfigs, readerName, isUsb, statusRowsAll, driverScript, driverArgs, uidText, readEvent, statusRows, problemText, PROBLEMS } = require('../logic.js')
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
  assert.match(failed[1].value, /Anschlüsse einschalten/)
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
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid' }), 0), ['--device', '', '--index', '1'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: ' IC Reader ' }), 0), ['--device', 'IC Reader', '--index', '1'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: '/dev/input/event3' }), 0), ['--device', '/dev/input/event3', '--index', '1'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid', hidDevice: 'a; rm -rf /*' }), 0), ['--device', '', '--index', '1'])
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
  assert.match(JSON.stringify(usb), /0004567890 · HXGCoLtd Keyboard/) // (as typed, not in pairs; with the name of the device, not the name of the kind)
  // (a device that is not told yet: the kind)
  assert.match(JSON.stringify(statusRows(view('hid', { firmware: '', product: '', last: { tech: 'HID', uid: '0004567890' } }))), /0004567890 · USB-Leser/)
  assert.strictEqual(readEvent({ event: 'ready', firmware: '', product: 'Tera 5100 dongle (Racal Data Group)' }).product, 'Tera 5100 dongle (Racal Data Group)')
})

test('the new problems have a text', () => {
  for (const code of ['no_i2c', 'i2c_access', 'no_serial', 'serial_access', 'no_device', 'several_devices', 'input_access']) assert.notStrictEqual(problemText(code), PROBLEMS.other, code)
})

// -- several readers at once -------------------------------------------------------------------------------------------------------------
test('the second and third reader have their own settings, the first one keeps the old names', () => {
  const settings = { reader: 'pn5180', busyPin: 25, resetPin: 23, reader2On: true, reader2: 'rc522', spiDevice2: '0.1', resetPin2: 24, reader3On: true, reader3: 'hid', hidDevice3: 'Tera' }
  const [one, two, three] = readConfigs(settings)
  assert.deepStrictEqual([one.slot, one.reader, one.spi, one.busy, one.reset], [1, 'pn5180', '0.0', 25, 23])
  assert.deepStrictEqual([two.slot, two.reader, two.spi, two.reset, two.problem], [2, 'rc522', '0.1', 24, null])
  assert.deepStrictEqual([three.slot, three.reader, three.device, three.problem], [3, 'hid', 'Tera', null])
  assert.deepStrictEqual(driverArgs(two, 0), ['--reset', '24', '--chip', '0', '--spi', '0.1'])
  // (a reader that is not added on the page is not there, whatever its settings say; one with a pin chosen is, as the page shows it)
  assert.deepStrictEqual(readConfigs({ reader: 'hid', reader2: 'rc522' }).map((c) => c.slot), [1])
  assert.deepStrictEqual(readConfigs({ reader: 'hid', reader2: 'rc522', resetPin2: 24 }).map((c) => c.slot), [1, 2])
  assert.deepStrictEqual(readConfigs({ reader: 'hid', reader2: 'rc522', reader2On: false }).map((c) => c.slot), [1])
  // (only the first reader is there when no other is chosen - also with no reader at all)
  assert.deepStrictEqual(readConfigs({ reader: 'hid' }).map((c) => c.slot), [1])
  assert.deepStrictEqual(readConfigs({}).map((c) => [c.slot, c.reader]), [[1, 'none']])
  // (a box from before: the plain names are the first reader, nothing else changes)
  assert.strictEqual(readConfig({ reader: 'hid', hidDevice: 'IC Reader' }).device, 'IC Reader')
  assert.strictEqual(readConfig({ reader: 'hid', hidDevice: 'IC Reader' }, 2).reader, 'none')
})

test('two readers must not want the same connection', () => {
  const problems = (settings) => readConfigs(settings).map((c) => c.problem)
  // the same SPI device twice; another one is fine
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'rc522', reader2: 'rc522' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'rc522', reader2: 'rc522', spiDevice2: '0.1' }), [null, null])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'pn5180', busyPin: 25, resetPin: 23, reader2: 'rc522' }), [null, 'conflict'])
  // the PN532 on I2C does not hold an SPI device, on SPI it does; the serial port and the I2C bus once each
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'rc522', reader2: 'pn532', pn532Link2: 'i2c' }), [null, null])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'rc522', reader2: 'pn532', pn532Link2: 'spi' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'pn532', reader2: 'pn532' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'pn532', pn532Link: 'uart', reader2: 'pn532', pn532Link2: 'uart', uartDevice2: '/dev/ttyAMA0' }), [null, null])
  // a USB reader: two with the box finding them is one device twice; with their names they are two
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'hid', reader2: 'hid' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'hid', hidDevice: 'Tera', reader2: 'hid', hidDevice2: 'IC Reader' }), [null, null])
  assert.deepStrictEqual(problems({ reader2On: true, reader3On: true, reader: 'hid', reader2: 'pn5180', busyPin2: 25, resetPin2: 23 }), [null, null])
  assert.notStrictEqual(problemText('conflict'), PROBLEMS.other)
})

test('the status speaks of every reader, with its own lines', () => {
  const view = (config, extra = {}) => ({ config, phase: 'ready', firmware: 'v2.0', product: 'Tera', errorCode: null, inField: false, last: null, ...extra })
  const [a, b] = readConfigs({ reader2On: true, reader: 'rc522', reader2: 'hid' })
  const rows = statusRowsAll([view(a), view(b, { last: { tech: 'HID', uid: '4006381333931' } })])
  assert.deepStrictEqual(rows.map((r) => r.label), ['MFRC522', 'Chip', 'Tag im Feld', 'Letzter Tag', 'USB Reader 1', 'Gerät', 'Letzter Tag'])
  assert.strictEqual(rows[4].value, 'Bereit')
  assert.match(rows[6].value, /4006381333931/)
  // one reader: the lines as before
  assert.deepStrictEqual(statusRowsAll([view(a)]), statusRows(view(a)))
  // a reader that is not ready says so under its own name
  const [x, y] = readConfigs({ reader2On: true, reader: 'hid', reader2: 'hid2' })
  assert.deepStrictEqual(statusRowsAll([view(x), view(y, { phase: 'error', errorCode: 'no_device' })]).map((r) => [r.label, r.tone]).filter((r) => r[0].startsWith('USB Reader')), [['USB Reader 1', 'ok'], ['USB Reader 2', 'error']])
  assert.strictEqual(readerName(x, [x, y]), 'USB Reader 1')
  assert.strictEqual(readerName(a, [a, b]), 'MFRC522')
})

test('each reader has its own status route: the first one always, the others while they are in use', async () => {
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
  for (const name of ['stateone', 'statetwo', 'statethree']) {
    const route = routes[`get /${name}`]
    assert.ok(route.options.session, name)
    let body
    route.handler({}, { json: (b) => (body = b) })
    assert.deepStrictEqual(body.rows, [{ label: 'Leser', value: 'Aus', tone: 'warn' }], name)
  }
})

// -- "USB Reader 1" and "USB Reader 2" ------------------------------------------------------------------------------------------------------
test('USB Reader 1 and 2 are the first and the second USB device, found by the driver in the order of their ports', () => {
  assert.strictEqual(driverScript(readConfig({ reader: 'hid2' })), 'usbreader.py')
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid2' }), 0), ['--device', '', '--index', '2'])
  assert.deepStrictEqual(driverArgs(readConfig({ reader: 'hid2', hidDevice: 'Tera' }), 0), ['--device', 'Tera', '--index', '2'])
  assert.strictEqual(readConfig({ reader: 'hid2' }).tech, 'a')
  assert.strictEqual(isUsb('hid') && isUsb('hid2'), true)
  assert.strictEqual(isUsb('rc522') || isUsb('none'), false)
  // (both at once is fine - two different devices; the same one twice is the conflict)
  const problems = (settings) => readConfigs({ reader2On: true, reader3On: true, ...settings }).map((c) => c.problem)
  assert.deepStrictEqual(problems({ reader: 'hid', reader2: 'hid2' }), [null, null])
  assert.deepStrictEqual(problems({ reader: 'hid', reader2: 'hid' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader: 'hid2', reader2: 'hid2' }), [null, 'conflict'])
  assert.deepStrictEqual(problems({ reader: 'hid', hidDevice: 'Tera', reader2: 'hid2', hidDevice2: 'Tera' }), [null, 'conflict'], 'one name twice')
  // (a tag of the second one: number as typed, with the name of the device)
  const [, two] = readConfigs({ reader2On: true, reader: 'hid', reader2: 'hid2' })
  const rows = statusRows({ config: two, phase: 'ready', firmware: '', product: 'RFID Reader', errorCode: null, inField: false, last: { tech: 'HID', uid: '0012345678' } })
  assert.match(JSON.stringify(rows), /0012345678 · RFID Reader/)
  assert.strictEqual(readerName(two, [readConfig({ reader: 'hid' }), two]), 'USB Reader 2')
})

test('the choice of the reader type follows the USB devices that are plugged in (route usbstate)', async () => {
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
  const route = routes['get /usbstate']
  assert.ok(route.options.session)
  let body
  await route.handler({}, { json: (b) => (body = b) })
  // (no python3 with devices here: nothing plugged in - the second one is greyed out, the first one is still there to choose)
  assert.strictEqual(body.options.hid.label, 'USB Reader 1')
  assert.notStrictEqual(body.options.hid.disabled, true)
  assert.strictEqual(body.options.hid2.label, 'USB Reader 2')
  assert.strictEqual(body.options.hid2.disabled, true)
})

const lines = (rows) => rows.map((r) => [r.label, r.value, r.tone, r.button?.label])

test('SPI: on in the boot configuration, and a device after the restart; the button follows the state', () => {
  const on = spiState('dtparam=audio=on\ndtparam=spi=on\n', ['spidev0.0', 'spidev0.1', 'tty0'])
  assert.deepStrictEqual(on, { configured: true, off: false, devices: ['spidev0.0', 'spidev0.1'] })
  assert.deepStrictEqual(lines(spiRows(on)), [['Zustand', 'Eingeschaltet', 'ok', 'SPI ausschalten'], ['Gerät', '/dev/spidev0.0, /dev/spidev0.1', 'ok', undefined]])
  assert.strictEqual(spiRows(on)[0].button.post, '/api/ext/nfc/spioff')
  // (switched on in config.txt, but the box has not restarted: no device yet; it can be switched off again)
  const waiting = spiState('dtparam=spi=on\r\n', [])
  assert.match(spiRows(waiting)[0].value, /neu starten/)
  assert.strictEqual(spiRows(waiting)[0].button.label, 'SPI ausschalten')
  assert.strictEqual(spiRows(waiting)[1].value, 'Nicht vorhanden')
  // (off: no line, a comment, or "off")
  for (const text of ['', '#dtparam=spi=on\n', 'dtparam=spi=off\n', 'dtoverlay=spi1-1cs\n']) assert.strictEqual(spiState(text, []).configured, false, text)
  const off = spiRows(spiState('', []))
  assert.deepStrictEqual([off[0].value, off[0].button.label, off[0].button.post], ['Ausgeschaltet', 'SPI einschalten', '/api/ext/nfc/spion'])
  assert.match(off[0].button.confirm, /neu starten/)
  // (switched off in config.txt, the device is there until the restart)
  const leaving = spiState('dtparam=spi=off\n', ['spidev0.0'])
  assert.deepStrictEqual([spiRows(leaving)[0].value, spiRows(leaving)[0].button.label], ['Ausgeschaltet, die Box muss neu starten', 'SPI einschalten'])
  // (spi in a list of parameters)
  assert.strictEqual(spiState('dtparam=audio=on,spi=on\n', []).configured, true)
  // (a device without a line in the boot configuration: switched on some other way - on, and it can be switched off)
  const other = spiRows(spiState('', ['spidev0.0']))
  assert.deepStrictEqual([other[0].value, other[0].button.label], ['Eingeschaltet', 'SPI ausschalten'])
})

test('I2C: switched on with the module, the bus of the header after the restart; on and off', () => {
  const on = i2cState('dtparam=i2c_arm=on\n', 'i2c-dev\n', ['i2c-1', 'i2c-11', 'tty0'])
  assert.deepStrictEqual(on, { configured: true, off: false, devices: ['i2c-1'] })
  assert.deepStrictEqual(lines(i2cRows(on)), [['Zustand', 'Eingeschaltet', 'ok', 'I2C ausschalten'], ['Gerät', '/dev/i2c-1', 'ok', undefined]])
  assert.strictEqual(i2cRows(on)[0].button.post, '/api/ext/nfc/iicoff')
  // (the line is there, the module is not listed: the device does not come)
  assert.strictEqual(i2cState('dtparam=i2c_arm=on\n', '', []).configured, false)
  // (the module is loaded already)
  assert.strictEqual(i2cState('dtparam=i2c_arm=on\n', '', [], true).configured, true)
  const waiting = i2cState('dtparam=i2c1=on\r\n', 'i2c-dev\r\n', [])
  assert.match(i2cRows(waiting)[0].value, /neu starten/)
  for (const text of ['', '#dtparam=i2c_arm=on\n', 'dtparam=i2c_arm=off\n']) assert.strictEqual(i2cState(text, 'i2c-dev', []).configured, false, text)
  const off = i2cRows(i2cState('', '', []))
  assert.deepStrictEqual([off[0].value, off[0].button.label, off[0].button.post], ['Ausgeschaltet', 'I2C einschalten', '/api/ext/nfc/iicon'])
  assert.match(i2cRows(i2cState('dtparam=i2c_arm=off\n', '', ['i2c-1']))[0].value, /Ausgeschaltet, die Box muss neu starten/)
  // (the lines that have the bus on: all are set to off)
  assert.deepStrictEqual(i2cKeysOn('dtparam=i2c_arm=on\ndtparam=i2c1=on\ndtparam=i2c_arm_baudrate=50000\n#dtparam=i2c=on\n'), ['i2c_arm', 'i2c1'])
})

test('UART: the port is on, the device is there, and no console on it; the buttons', () => {
  const cmd = 'root=x rootwait console=ttyAMA0,115200 console=tty3'
  const busy = uartState('enable_uart=1\n', cmd, ['serial0', 'ttyAMA0'], 'ttyAMA0', false)
  assert.deepStrictEqual(busy, { configured: true, off: false, device: true, console: true, devices: ['serial0'] })
  assert.deepStrictEqual(lines(uartRows(busy)), [['Zustand', 'Eingeschaltet', 'ok', 'Seriell ausschalten'], ['Gerät', '/dev/serial0', 'ok', undefined], ['System-Konsole', 'An, blockiert den Port für den PN532', 'warn', 'Konsole abschalten']])
  assert.strictEqual(uartRows(busy)[2].button.post, '/api/ext/nfc/uartconsole')
  // (a login on the port counts as well, the kernel console of another port does not)
  assert.strictEqual(uartState('enable_uart=1', 'console=tty3', ['serial0'], 'ttyAMA0', true).console, true)
  assert.strictEqual(uartState('enable_uart=1', 'console=ttyAMA10,115200 console=tty3', ['serial0'], 'ttyAMA0', false).console, false)
  const free = uartState('enable_uart=1', 'console=tty3', ['serial0'], 'ttyAMA0', false)
  assert.deepStrictEqual(uartRows(free).map((r) => r.value), ['Eingeschaltet', '/dev/serial0', 'Aus'])
  assert.strictEqual(uartRows(free)[2].button, undefined, 'no console: no button')
  assert.match(uartRows(uartState('enable_uart=1', '', [], '', false))[0].value, /neu starten/)
  const off = uartRows(uartState('enable_uart=0', '', [], '', false))
  assert.deepStrictEqual([off[0].value, off[0].button.label, off[0].button.post], ['Ausgeschaltet', 'Seriell einschalten', '/api/ext/nfc/uarton'])
  // (which consoles the action switches off: only ports that may be the one of the header, only plain names)
  assert.deepStrictEqual(uartConsoles('console=ttyAMA0,115200 console=serial0 console=tty1 console=ttyS0', 'ttyAMA0').sort(), ['serial0', 'ttyAMA0', 'ttyS0'])
  assert.deepStrictEqual(uartConsoles('console=ttyAMA10,115200 console=ttyUSB0', 'ttyAMA0'), [])
})
