// NFC-Reader: what the settings mean, and what the reader's reports (pn5180.py) turn into for the status block of the app.
// Without hardware and without a process: plain functions, tested on their own.
'use strict'

const TECH_NAMES = { ISO14443A: 'ISO 14443 A', ISO15693: 'ISO 15693', HID: 'USB-Leser' }
const TECHS = ['both', 'a', 'v']
const SPI_DEVICES = ['0.0', '0.1']
// (hid and hid2: "USB Reader 1" and "USB Reader 2", the first and the second USB device that types, in the order of their ports)
const READERS = ['pn5180', 'rc522', 'pn532', 'hid', 'hid2']
const isUsb = (reader) => reader === 'hid' || reader === 'hid2'
// the driver program of each reader (Python: Node has no way to speak SPI or I2C)
const SCRIPTS = { pn5180: 'pn5180.py', rc522: 'rc522.py', pn532: 'pn532.py', hid: 'usbreader.py', hid2: 'usbreader.py' }
const LINKS = ['i2c', 'spi', 'uart']
const UART_DEVICES = ['/dev/serial0', '/dev/ttyAMA0', '/dev/ttyS0', '/dev/ttyUSB0']
// what the chip of a reader is called in the status
const CHIPS = { pn5180: 'PN5180', rc522: 'MFRC522', pn532: 'PN532' }

// Up to three readers run side by side. The first keeps the plain names of the settings (reader, spiDevice, ...), the others have the
// number behind them (reader2, spiDevice2, ...): a box that had one reader before is the same box now.
const SLOTS = [1, 2, 3]
const keyOf = (name, slot) => (slot === 1 ? name : `${name}${slot}`)

/**
 * The settings of the extension as what the driver needs, for the reader `slot` (1 to 3). `problem` is set when it cannot start yet:
 * 'pins' (a PN5180 is chosen but BUSY and RST are not, or are the same pin). The RC522 and the PN532 look for ISO 14443 A only, a USB
 * reader has no kind of tag to choose: for them `tech` is always 'a'.
 */
function readConfig(settings, slot = 1) {
  const s = settings ?? {}
  const get = (name) => s[keyOf(name, slot)]
  const pin = (value) => (Number.isInteger(value) && value >= 2 && value <= 27 ? value : 0)
  const reader = READERS.includes(get('reader')) ? get('reader') : 'none'
  const config = {
    slot,
    reader,
    busy: pin(get('busyPin')),
    reset: pin(get('resetPin')),
    spi: SPI_DEVICES.includes(get('spiDevice')) ? get('spiDevice') : '0.0',
    tech: reader === 'pn5180' ? (TECHS.includes(get('tech')) ? get('tech') : 'both') : 'a',
    link: LINKS.includes(get('pn532Link')) ? get('pn532Link') : 'i2c',
    uart: UART_DEVICES.includes(get('uartDevice')) ? get('uartDevice') : '/dev/serial0',
    // (a part of the name of the USB reader, or the path of its device; empty: the box finds it)
    device: typeof get('hidDevice') === 'string' && /^[A-Za-z0-9 _.\/:+-]{1,60}$/.test(get('hidDevice').trim()) ? get('hidDevice').trim() : '',
    problem: null,
  }
  if (reader === 'pn5180' && (!config.busy || !config.reset || config.busy === config.reset)) config.problem = 'pins'
  return config
}

/** What a reader holds that no other may hold at the same time: its SPI device, the I2C bus, a serial port, a USB reader. */
function resourceOf(config) {
  switch (config.reader) {
    case 'pn5180':
    case 'rc522':
      return `spi:${config.spi}`
    case 'pn532':
      return config.link === 'i2c' ? 'i2c' : config.link === 'uart' ? `uart:${config.uart}` : `spi:${config.spi}`
    case 'hid':
    case 'hid2':
      // (without a name the reader is the first or the second USB device: different ones, unless a name picks the same device twice)
      return `hid:${config.device || config.reader}`
    default:
      return ''
  }
}

/**
 * The readers that are in use, in the order of their slots: `[config, ...]`. The second and the third are there when the page has them
 * added (the switches `reader2On` and `reader3On` - or one of their pins is chosen, as the page counts it). A reader that wants what an earlier one holds
 * (the same SPI device, the I2C bus, the serial port, the same USB reader) gets the problem 'conflict' and is not started. The first
 * slot is always there, also with no reader: it is the one the status speaks of when nothing is chosen.
 */
function readConfigs(settings) {
  const s = settings ?? {}
  const all = SLOTS.map((slot) => readConfig(s, slot)).filter((c) => c.slot === 1 || s[`reader${c.slot}On`] === true || c.busy !== 0 || c.reset !== 0)
  const held = new Set()
  for (const config of all) {
    if (config.reader === 'none') continue
    const resource = resourceOf(config)
    if (held.has(resource)) config.problem = 'conflict'
    else held.add(resource)
  }
  return all.filter((config) => config.slot === 1 || config.reader !== 'none')
}

/** The file of the driver program for a configuration (null: no reader). */
function driverScript(config) {
  return SCRIPTS[config.reader] ?? null
}

/** The command line of the driver for a configuration (the program itself is added by the caller). */
function driverArgs(config, chip) {
  switch (config.reader) {
    case 'rc522':
      // (RST is optional: without a pin the driver resets the chip by software)
      return [...(config.reset ? ['--reset', String(config.reset)] : []), '--chip', String(chip), '--spi', config.spi]
    case 'pn532':
      return ['--link', config.link, '--spi', config.spi, '--uart', config.uart]
    case 'hid':
      return ['--device', config.device, '--index', '1']
    case 'hid2':
      return ['--device', config.device, '--index', '2']
    default:
      return ['--busy', String(config.busy), '--reset', String(config.reset), '--chip', String(chip), '--spi', config.spi, '--tech', config.tech]
  }
}

/** "E004010012345678" -> "E0:04:01:00:12:34:56:78" */
function uidText(hex) {
  return String(hex ?? '')
    .replace(/[^0-9A-Fa-f]/g, '')
    .toUpperCase()
    .replace(/(..)(?=.)/g, '$1:')
}

/** The number of a USB reader is a number as typed (decimal or hex), not bytes: it is shown as it is. */
function tagNumberText(config, uid) {
  return isUsb(config?.reader) ? String(uid ?? '') : uidText(uid)
}

/** What a report of the driver (one line of its output, already parsed) tells; anything that is not one of its reports is null. */
function readEvent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.event !== 'string') return null
  const text = (v, max = 200) => String(v ?? '').slice(0, max)
  switch (raw.event) {
    case 'starting':
      return { event: 'starting' }
    case 'ready':
      return { event: 'ready', firmware: text(raw.firmware, 20), product: text(raw.product, 60) }
    case 'tag':
      return /^[0-9A-F]{8,20}$/.test(String(raw.uid)) && Object.hasOwn(TECH_NAMES, String(raw.tech)) ? { event: 'tag', tech: String(raw.tech), uid: String(raw.uid) } : null
    case 'gone':
      return { event: 'gone' }
    case 'error':
      return { event: 'error', code: text(raw.code, 30), message: text(raw.message) }
    default:
      return null
  }
}

// What the user reads for a problem (these are the texts the app knows and translates, so they are fixed phrases)
const PROBLEMS = {
  pins: 'Bitte die Pins BUSY und RST wählen',
  conflict: 'Dieser Leser braucht denselben Anschluss wie ein anderer: SPI-Gerät, I2C, serielle Schnittstelle oder USB-Leser nur einmal vergeben',
  no_spi: 'SPI ist aus: in der Karte Anschlüsse einschalten, dann neu starten',
  spi_access: 'Kein Zugriff auf den SPI-Bus',
  no_python: 'Die Pakete python3-spidev und python3-lgpio fehlen',
  gpio: 'Die Pins BUSY und RST lassen sich nicht belegen',
  busy_timeout: 'BUSY reagiert nicht: BUSY, RST und die Stromversorgung prüfen',
  no_chip: 'Der Leser antwortet nicht: MISO, MOSI, SCK, NSS und die Stromversorgung prüfen',
  no_i2c: 'I2C ist aus: in der Karte Anschlüsse einschalten, dann neu starten',
  i2c_access: 'Kein Zugriff auf den I2C-Bus',
  no_serial: 'Die serielle Schnittstelle fehlt: in der Karte Anschlüsse Seriell einschalten, dann neu starten',
  serial_access: 'Kein Zugriff auf die serielle Schnittstelle',
  no_device: 'Kein USB-Leser gefunden: einstecken oder im Menü Typ einen anderen USB Reader wählen',
  several_devices: 'Mehrere USB-Tastaturen gefunden: im Menü Typ „USB Reader 1“ oder „USB Reader 2“ wählen',
  input_access: 'Kein Zugriff auf den USB-Leser: neu einstecken, oder er ist schon belegt',
  other: 'Fehler im Leser, Näheres im Protokoll der Box',
}
const problemText = (code) => PROBLEMS[code] ?? PROBLEMS.other

/**
 * The lines of the status block: { label, value, tone } with tone ok | warn | error. `view` is what the API part knows:
 * { config, phase: 'off' | 'starting' | 'ready' | 'error', firmware, product, errorCode, inField, last: { tech, uid } | null }.
 */
function statusRows(view) {
  const { config } = view
  if (config.reader === 'none') return [{ label: 'Leser', value: 'Aus', tone: 'warn' }]
  if (config.problem) return [{ label: 'Leser', value: 'Nicht bereit', tone: 'warn' }, { label: 'Hinweis', value: problemText(config.problem), tone: 'warn' }]
  if (view.phase === 'error') return [{ label: 'Leser', value: 'Nicht bereit', tone: 'error' }, { label: 'Hinweis', value: problemText(view.errorCode), tone: 'error' }]
  if (view.phase !== 'ready') return [{ label: 'Leser', value: 'Wird gestartet …', tone: 'warn' }]
  const rows = [{ label: 'Leser', value: 'Bereit', tone: 'ok' }]
  if (isUsb(config.reader)) {
    // (a USB reader types a number when a card comes near and says nothing when it goes: there is no tag in the field to tell of)
    rows.push({ label: 'Gerät', value: view.product || 'USB-Leser', tone: 'ok' })
  } else {
    rows.push({ label: config.reader === 'rc522' ? 'Chip' : 'Firmware', value: `${CHIPS[config.reader]} ${view.firmware}`, tone: 'ok' })
    rows.push({ label: 'Tag im Feld', value: view.inField ? 'Ja' : 'Nein' })
  }
  // (the number of a USB reader goes with the name of the device, not with the name of the kind)
  const kind = isUsb(config.reader) && view.product ? view.product : TECH_NAMES[view.last?.tech]
  rows.push({ label: 'Letzter Tag', value: view.last ? `${tagNumberText(config, view.last.uid)} · ${kind}` : 'Noch keiner gelesen' })
  return rows
}

/** What a reader is called in the status; with the number of its slot when another reader of the same kind is switched on too. */
function readerName(config, configs = []) {
  const name = config.reader === 'hid' ? 'USB Reader 1' : config.reader === 'hid2' ? 'USB Reader 2' : CHIPS[config.reader]
  return configs.filter((c) => c.reader === config.reader).length > 1 ? `${name} ${config.slot}` : name
}

/**
 * The lines of the status block for all readers: with one reader the lines of statusRows; with several, each reader has its own lines,
 * the first one named after it ("PN5180", "USB-Leser": the label) and saying how it is ("Bereit"), the others as statusRows has them.
 * `views` are the views of statusRows, in the order of the slots.
 */
function statusRowsAll(views) {
  const configs = views.map((v) => v.config)
  if (views.length === 1) return statusRows(views[0])
  const rows = []
  for (const view of views) {
    const [first, ...rest] = statusRows(view)
    rows.push({ ...first, label: readerName(view.config, configs) }, ...rest)
  }
  return rows
}

// The ports of the box the readers talk through: SPI (PN5180, RC522, PN532), I2C (PN532) and the serial port (PN532). Each is a line of
// the boot configuration, and the device comes (or goes) after a restart only. The card "Anschlüsse" shows each port with its state and
// one button: "ausschalten" while it is on, "einschalten" while it is off.
const ON = '(?:on|true|1|yes)'
const OFF = '(?:off|false|0|no)'
const dtparam = (keys, value) => new RegExp(`^\\s*dtparam=(?:[^#\\r\\n]*,)?(?:${keys})=${value}\\b`, 'im')
const SPI_ON = dtparam('spi', ON)
const SPI_OFF = dtparam('spi', OFF)
const I2C_KEYS = ['i2c_arm', 'i2c1', 'i2c']
const I2C_ON = dtparam(I2C_KEYS.join('|'), ON)
const I2C_OFF = dtparam(I2C_KEYS.join('|'), OFF)
const I2C_MODULE = /^\s*i2c[-_]dev\s*$/m
const UART_ON = /^\s*enable_uart=1\b/m
const UART_OFF = /^\s*enable_uart=0\b/m
const UART_NAME = /^(?:serial|ttyS|ttyAMA)\d+$/

/** The keys of "dtparam=...=on" the boot configuration has for I2C (to be set to off: the bus is on when one of them is). */
function i2cKeysOn(configText) {
  return I2C_KEYS.filter((key) => dtparam(key, ON).test(String(configText ?? '')))
}

/** SPI: on in the boot configuration (dtparam=spi=on), `off` when it says off in so many words; the devices /dev/spidev0.0 ... */
function spiState(configText, names) {
  const devices = (Array.isArray(names) ? names : []).filter((n) => /^spidev\d+\.\d+$/.test(String(n))).map(String).sort()
  const text = String(configText ?? '')
  const configured = SPI_ON.test(text)
  return { configured, off: !configured && SPI_OFF.test(text), devices }
}
/** I2C: on in the boot configuration and the module i2c-dev is loaded (listed in /etc/modules); the device is /dev/i2c-1, the bus of the header. */
function i2cState(configText, modulesText, names, moduleLoaded) {
  const devices = (Array.isArray(names) ? names : []).filter((n) => n === 'i2c-1').map(String)
  const text = String(configText ?? '')
  const lineOn = I2C_ON.test(text)
  const configured = lineOn && (moduleLoaded === true || I2C_MODULE.test(String(modulesText ?? '')))
  return { configured, off: !lineOn && I2C_OFF.test(text), devices }
}

// The serial port (UART) at the header: enable_uart=1 in the boot configuration, the device /dev/serial0, and no console on it (the
// console of the system would read and write the same port: the kernel console in cmdline.txt, or a login on it). `target` is the
// port /dev/serial0 stands for (ttyAMA0, ttyS0), '' while there is none; `gettyActive` says a login runs on it.
/** The serial ports a console is set on in cmdline.txt (console=ttyAMA0,115200) that may be the one of the header. */
function uartConsoles(cmdlineText, target) {
  const wanted = new Set(['serial0', 'ttyS0', 'ttyAMA0', ...(UART_NAME.test(String(target)) ? [String(target)] : [])])
  const found = [...String(cmdlineText ?? '').matchAll(/(?:^|\s)console=([A-Za-z0-9]+)/g)].map((m) => m[1])
  return [...new Set(found.filter((n) => UART_NAME.test(n) && wanted.has(n)))]
}
function uartState(configText, cmdlineText, names, target, gettyActive) {
  const device = (Array.isArray(names) ? names : []).includes('serial0')
  const text = String(configText ?? '')
  const configured = UART_ON.test(text)
  const consoles = uartConsoles(cmdlineText, target)
  return { configured, off: !configured && UART_OFF.test(text), device, console: gettyActive === true || consoles.length > 0, devices: device ? ['serial0'] : [] }
}

/** Is the port on: its line is in the configuration, or the device is there and nothing says it is off (switched on some other way). */
function portIsOn(state) {
  const has = (state.devices ?? []).length > 0 || state.device === true
  return state.configured === true || (has && state.off !== true)
}

const PORTS = {
  spi: {
    name: 'SPI',
    off: 'SPI ausschalten? Die Leser am SPI-Anschluss gehen danach nicht mehr, und die Box muss neu starten.',
  },
  iic: {
    name: 'I2C',
    off: 'I2C ausschalten? Alles, was I2C braucht (ein PN532 an I2C, ein MuPiHAT), geht danach nicht mehr, und die Box muss neu starten.',
  },
  uart: {
    name: 'Seriell',
    off: 'Seriell ausschalten? Ein PN532 an der seriellen Schnittstelle geht danach nicht mehr, und die Box muss neu starten.',
  },
}
const stateText = (state) => {
  const has = (state.devices ?? []).length > 0 || state.device === true
  if (portIsOn(state)) return has ? { value: 'Eingeschaltet', tone: 'ok' } : { value: 'Eingeschaltet, die Box muss neu starten', tone: 'warn' }
  return has ? { value: 'Ausgeschaltet, die Box muss neu starten', tone: 'warn' } : { value: 'Ausgeschaltet', tone: 'warn' }
}
/** The lines of the status block of a port ('spi', 'iic', 'uart'): { label, value, tone, button: { label, post, confirm } }. */
function portRows(port, state) {
  const info = PORTS[port]
  const on = portIsOn(state)
  const devices = state.devices ?? []
  const text = stateText(state)
  const rows = [
    {
      label: 'Zustand',
      ...text,
      button: on
        ? { label: `${info.name} ausschalten`, post: `/api/ext/nfc/${port}off`, confirm: info.off }
        : { label: `${info.name} einschalten`, post: `/api/ext/nfc/${port}on`, confirm: `${info.name} einschalten? Die Box muss danach neu starten.` },
    },
    { label: 'Gerät', value: devices.length > 0 ? devices.map((n) => `/dev/${n}`).join(', ') : 'Nicht vorhanden', ...(devices.length > 0 ? { tone: 'ok' } : on ? { tone: 'warn' } : {}) },
  ]
  if (port === 'uart') {
    rows.push(
      state.console
        ? { label: 'System-Konsole', value: 'An, blockiert den Port für den PN532', tone: 'warn', button: { label: 'Konsole abschalten', post: '/api/ext/nfc/uartconsole', confirm: 'Konsole auf der seriellen Schnittstelle abschalten? Das System benutzt die Schnittstelle sonst selbst (Anmeldung per Kabel), und ein PN532 kann sie nicht nutzen. Die Box muss danach neu starten.' } }
        : { label: 'System-Konsole', value: 'Aus', tone: 'ok' },
    )
  }
  return rows
}
const spiRows = (state) => portRows('spi', state)
const i2cRows = (state) => portRows('iic', state)
const uartRows = (state) => portRows('uart', state)

module.exports = { spiState, spiRows, i2cState, i2cRows, i2cKeysOn, uartState, uartRows, uartConsoles, portIsOn, portRows, TECH_NAMES, READERS, SLOTS, isUsb, readConfig, readConfigs, readerName, statusRowsAll, driverScript, driverArgs, uidText, tagNumberText, readEvent, problemText, statusRows, PROBLEMS }
