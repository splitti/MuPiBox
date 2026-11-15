// NFC-Reader: what the settings mean, and what the reader's reports (pn5180.py) turn into for the status block of the app.
// Without hardware and without a process: plain functions, tested on their own.
'use strict'

const TECH_NAMES = { ISO14443A: 'ISO 14443 A', ISO15693: 'ISO 15693', HID: 'USB-Leser' }
const TECHS = ['both', 'a', 'v']
const SPI_DEVICES = ['0.0', '0.1']
const READERS = ['pn5180', 'rc522', 'pn532', 'hid']
// the driver program of each reader (Python: Node has no way to speak SPI or I2C)
const SCRIPTS = { pn5180: 'pn5180.py', rc522: 'rc522.py', pn532: 'pn532.py', hid: 'usbreader.py' }
const LINKS = ['i2c', 'spi', 'uart']
const UART_DEVICES = ['/dev/serial0', '/dev/ttyAMA0', '/dev/ttyS0', '/dev/ttyUSB0']
// what the chip of a reader is called in the status
const CHIPS = { pn5180: 'PN5180', rc522: 'MFRC522', pn532: 'PN532' }

/**
 * The settings of the extension as what the driver needs. `problem` is set when it cannot start yet: 'pins' (a PN5180 is chosen but
 * BUSY and RST are not, or are the same pin). The RC522 and the PN532 look for ISO 14443 A only, a USB reader has no kind of tag to
 * choose: for them `tech` is always 'a'.
 */
function readConfig(settings) {
  const s = settings ?? {}
  const pin = (value) => (Number.isInteger(value) && value >= 2 && value <= 27 ? value : 0)
  const reader = READERS.includes(s.reader) ? s.reader : 'none'
  const config = {
    reader,
    busy: pin(s.busyPin),
    reset: pin(s.resetPin),
    spi: SPI_DEVICES.includes(s.spiDevice) ? s.spiDevice : '0.0',
    tech: reader === 'pn5180' ? (TECHS.includes(s.tech) ? s.tech : 'both') : 'a',
    link: LINKS.includes(s.pn532Link) ? s.pn532Link : 'i2c',
    uart: UART_DEVICES.includes(s.uartDevice) ? s.uartDevice : '/dev/serial0',
    // (a part of the name of the USB reader, or the path of its device; empty: the box finds it)
    device: typeof s.hidDevice === 'string' && /^[A-Za-z0-9 _.\/:+-]{1,60}$/.test(s.hidDevice.trim()) ? s.hidDevice.trim() : '',
    problem: null,
  }
  if (reader === 'pn5180' && (!config.busy || !config.reset || config.busy === config.reset)) config.problem = 'pins'
  return config
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
      return ['--device', config.device]
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
  return config?.reader === 'hid' ? String(uid ?? '') : uidText(uid)
}

/** What a report of the driver (one line of its output, already parsed) tells; anything that is not one of its reports is null. */
function readEvent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.event !== 'string') return null
  const text = (v, max = 200) => String(v ?? '').slice(0, max)
  switch (raw.event) {
    case 'starting':
      return { event: 'starting' }
    case 'ready':
      return { event: 'ready', firmware: text(raw.firmware, 20), product: text(raw.product, 20) }
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
  no_spi: 'SPI ist aus: dtparam=spi=on in der config.txt, dann neu starten',
  spi_access: 'Kein Zugriff auf den SPI-Bus',
  no_python: 'Die Pakete python3-spidev und python3-lgpio fehlen',
  gpio: 'Die Pins BUSY und RST lassen sich nicht belegen',
  busy_timeout: 'BUSY reagiert nicht: BUSY, RST und die Stromversorgung prüfen',
  no_chip: 'Der Leser antwortet nicht: MISO, MOSI, SCK, NSS und die Stromversorgung prüfen',
  no_i2c: 'I2C ist aus: dtparam=i2c_arm=on in der config.txt und das Modul i2c-dev, dann neu starten',
  i2c_access: 'Kein Zugriff auf den I2C-Bus',
  no_serial: 'Die serielle Schnittstelle fehlt: enable_uart=1 in der config.txt, die Konsole darauf abschalten, dann neu starten',
  serial_access: 'Kein Zugriff auf die serielle Schnittstelle',
  no_device: 'Kein USB-Leser gefunden: einstecken oder seinen Namen in den Einstellungen eintragen',
  several_devices: 'Mehrere USB-Tastaturen gefunden: den Namen des Lesers in den Einstellungen eintragen',
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
  if (config.reader === 'hid') {
    // (a USB reader types a number when a card comes near and says nothing when it goes: there is no tag in the field to tell of)
    rows.push({ label: 'Gerät', value: view.product || 'USB-Leser', tone: 'ok' })
  } else {
    rows.push({ label: config.reader === 'rc522' ? 'Chip' : 'Firmware', value: `${CHIPS[config.reader]} ${view.firmware}`, tone: 'ok' })
    rows.push({ label: 'Tag im Feld', value: view.inField ? 'Ja' : 'Nein' })
  }
  rows.push({ label: 'Letzter Tag', value: view.last ? `${tagNumberText(config, view.last.uid)} · ${TECH_NAMES[view.last.tech]}` : 'Noch keiner gelesen' })
  return rows
}

module.exports = { TECH_NAMES, READERS, readConfig, driverScript, driverArgs, uidText, tagNumberText, readEvent, problemText, statusRows, PROBLEMS }
