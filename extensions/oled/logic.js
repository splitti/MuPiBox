// OLED display: the parts of the extension that need neither the box nor a clock of their own - what the settings mean, what the
// player says, when a short picture is shown, how the I2C bus and the kiosk are told in the status. Tested without hardware.
'use strict'

const CONTROLLERS = ['ssd1306', 'sh1106', 'ssd1309']
const SIZES = ['128x64', '128x32']
const ADDRESSES = ['0x3C', '0x3D']
const MODES = ['full', 'mix', 'lite']
const TIME_MODES = ['up', 'down']
const SCROLL_MODES = ['loop', 'once', 'off']
const SLEEP_MINUTES = [0, 1, 5, 15, 60]
// what the display shows while nothing plays (nfc: the reader that waits for a tag, barcode: the scanner, clock: the time, custom: a picture
// the user chose)
const IDLE_SCREENS = ['nfc', 'barcode', 'clock', 'custom']
// (why a picture of the user is not taken: oled.py --check says it as an "error" event; the words go to the app)
const PICTURE_MESSAGES = {
  bad_size: 'Das Bild muss genau 128 × 64 Punkte groß sein',
  not_1bit: 'Das Bild darf nur Schwarz und Weiß enthalten (1 Bit)',
  bad_picture: 'Das ist kein Bild, das die Box lesen kann',
}
// the pictures: the ones the user may change (boot, idle, update, rest) and the ones that are fixed; `idle` is the user's own picture of
// the idle display. Their names are the file names (images/<id>.png, the user's own in the data folder).
const IMAGE_ROWS = [
  { id: 'boot', title: 'Startbild', text: 'Beim Hochfahren, bis die Box bereit ist', changeable: true },
  { id: 'nfc', title: 'Leerlauf: NFC-Leser', text: 'Zeigt, dass der Leser auf einen Tag wartet', changeable: false },
  { id: 'barcode', title: 'Leerlauf: Barcodescanner', text: 'Zeigt, dass der Scanner auf einen Code wartet', changeable: false },
  { id: 'idle', title: 'Leerlauf: Eigenes Bild', text: 'Für „Anzeige im Leerlauf“ › „Eigenes Bild“', changeable: true },
  { id: 'update', title: 'Update', text: 'Solange ein Update läuft', changeable: true },
  { id: 'rest', title: 'Ruhezeit und Limit', text: 'Wenn eine Ruhezeit läuft oder das Limit erreicht ist', changeable: true },
  { id: 'shutdown', title: 'Herunterfahren', text: 'Sobald die Box herunterfährt', changeable: false },
]
const IMAGE_IDS = IMAGE_ROWS.map((row) => row.id)
const CHANGEABLE_IMAGES = IMAGE_ROWS.filter((row) => row.changeable).map((row) => row.id)
// (the box's scripts say "an update runs" or "the box goes down" in a file, see scripts/mupibox/oled_picture.sh; the update one is refreshed with
// every step, so a stale one - the box was switched off in the middle - ends by itself)
const HOLD_SLOTS = ['update', 'shutdown']
const HOLD_MS = 15 * 60 * 1000
// (the box has not answered for this long: the start picture goes anyway)
const BOOT_MAX_MS = 120000
// (a short picture - play, pause, volume - and the page with the address of the box stay this long)
const OVERLAY_MS = 900
const INFO_MS = 10000
// (a picture of the list on the page, shown for a short time to look at it)
const PREVIEW_MS = 10000

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)
const number = (value, fallback, min, max) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

/** The settings of the extension as the driver and the extension use them (a value that is not one of the choices is the default). */
function readConfig(settings = {}) {
  const size = pick(settings.size, SIZES, '128x64')
  const [width, height] = size.split('x').map(Number)
  return {
    controller: pick(settings.controller, CONTROLLERS, 'ssd1306'),
    width,
    height,
    address: pick(settings.address, ADDRESSES, '0x3C'),
    rotate: settings.rotate === true,
    contrast: Math.round(number(settings.contrast, 127, 0, 255)),
    mode: pick(settings.mode, MODES, 'full'),
    // (the clock as before 0.3.0 - a box that had "Uhrzeit zeigen" off keeps the reader's picture: its old setting stays in
    // the saved settings, the new one comes as the manifest's default "clock" then)
    idleScreen: settings.clock === false && settings.idleScreen === 'clock' ? 'nfc' : pick(settings.idleScreen, IDLE_SCREENS, 'clock'),
    volumeOverlay: settings.volumeOverlay !== false,
    playOverlay: settings.playOverlay !== false,
    nightDim: settings.nightDim === true,
    nightContrast: Math.round(number(settings.nightContrast, 20, 1, 255)),
    timeMode: pick(settings.timeMode, TIME_MODES, 'up'),
    scroll: pick(settings.scroll, SCROLL_MODES, 'loop'),
    sleepAfter: pick(Number(settings.sleepAfter), SLEEP_MINUTES, 5),
  }
}

/** The arguments of oled.py for a configuration (`dirs`: where the pictures are - the extension's own and the ones the user chose). */
function driverArgs(config, dirs = {}) {
  const args = ['--controller', config.controller, '--width', String(config.width), '--height', String(config.height), '--address', config.address, '--contrast', String(config.contrast)]
  if (config.rotate) args.push('--rotate')
  if (dirs.images) args.push('--images', dirs.images)
  if (dirs.custom) args.push('--custom', dirs.custom)
  return args
}

/** Does a change of the settings need the driver to start again (the contrast, the mode and the like go on while it runs)? */
function needsRestart(before, after) {
  return ['controller', 'width', 'height', 'address', 'rotate'].some((key) => before[key] !== after[key])
}

/**
 * The contrast the display has now: the normal one, and in the evening (`share` 0 to 1 from the box: how far into the dimming it is) the
 * one of the evening - never brighter than the normal one.
 */
function eveningContrast(config, share) {
  if (!config.nightDim) return config.contrast
  const level = Math.min(config.contrast, config.nightContrast)
  const s = Math.min(1, Math.max(0, Number(share) || 0))
  return Math.round(config.contrast + (level - config.contrast) * s)
}

/** The next mode of the cycle: full, mix, lite. */
const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length]

/**
 * What plays, from the player's /local (and its /state while Spotify plays - the fields of /local stay empty then).
 * Same reading as the app's "Jetzt läuft" (playback-snapshot.ts), without the pictures.
 */
function readPlayback(local, spotify) {
  const out = { player: '', playing: false, kind: '', title: '', artist: '', album: '', track: 0, tracks: 0, elapsed: null, duration: null, volume: null, stream: false, shuffle: false, repeat: 'off' }
  if (!local || typeof local !== 'object') return out
  out.player = String(local.currentPlayer ?? '')
  out.kind = String(local.currentType ?? '')
  if (typeof local.volume === 'number') out.volume = Math.round(local.volume)
  if (out.player === 'mplayer') {
    out.playing = local.playing === true
    out.title = String(local.currentTrackname ?? '')
    out.album = String(local.album ?? '')
    if (typeof local.positionSeconds === 'number' && Number.isFinite(local.positionSeconds)) out.elapsed = Math.max(0, Math.round(local.positionSeconds))
    if (typeof local.durationSeconds === 'number' && local.durationSeconds > 0) out.duration = Math.round(local.durationSeconds)
    out.track = Number(local.currentTracknr) > 0 ? Number(local.currentTracknr) : 0
    out.tracks = Number(local.totalTracks) > 0 ? Number(local.totalTracks) : 0
    // (an album: its folder above is the artist, as the app shows it; a station and a podcast have a name of their own)
    const parts = String(local.path ?? '').split('/').filter(Boolean)
    if (out.kind === 'local') out.artist = parts.length >= 3 ? parts[parts.length - 2] : ''
    else if (out.kind === 'nas') out.artist = parts[parts.length - 2] ?? ''
    out.stream = out.kind === 'radio'
    out.shuffle = local.shuffle === true
    // (the player says repeatMode: 'all' loops the whole list, 'one' the track; an older player knows only `repeat`, which is "all")
    out.repeat = local.repeatMode === 'one' ? 'track' : local.repeatMode === 'all' ? 'all' : local.repeatMode === 'off' ? 'off' : local.repeat === true ? 'all' : 'off'
    if (out.stream) {
      out.track = 0
      out.tracks = 0
    }
  } else if (out.player === 'spotify') {
    const item = spotify?.item
    out.playing = spotify?.is_playing === true
    if (typeof spotify?.progress_ms === 'number') out.elapsed = Math.round(spotify.progress_ms / 1000)
    if (typeof item?.duration_ms === 'number') out.duration = Math.round(item.duration_ms / 1000)
    if (item?.name) out.title = String(item.name)
    if (item?.album?.name) out.album = String(item.album.name)
    out.shuffle = spotify?.shuffle_state === true
    out.repeat = spotify?.repeat_state === 'track' ? 'track' : spotify?.repeat_state === 'context' ? 'all' : 'off'
    if (item?.show?.name) out.artist = String(item.show.name)
    else if (Array.isArray(item?.artists) && item.artists[0]?.name) out.artist = String(item.artists[0].name)
  }
  return out
}

/**
 * A short picture for what changed between two readings: play and pause when the playing starts or stops, the volume when it moves
 * (the very first reading shows nothing: the extension just started). Returns { kind, volume } or null.
 * With `volumeShown` false a change of the volume shows no picture of its own, with `playShown` false neither does play or pause.
 */
function overlayFor(before, after, volumeShown = true, playShown = true) {
  if (!before || !after) return null
  if (volumeShown && before.volume !== null && after.volume !== null && before.volume !== after.volume) return { kind: after.volume === 0 ? 'mute' : 'volume', volume: after.volume }
  if (playShown && before.playing !== after.playing && (after.player !== '' || before.player !== '')) return { kind: after.playing ? 'play' : 'pause', volume: after.volume }
  return null
}

/** Is the box stopped for the player's rest time or limit? From /tmp/playtime.json (state "blocked": not "grace", where the track plays on). */
function blockedFrom(text) {
  try {
    const status = JSON.parse(String(text ?? ''))
    return status?.enabled === true && status.state === 'blocked'
  } catch {
    return false
  }
}

/**
 * What the box's scripts say with their file ("update 1763500000": a picture they drew on the display themselves, and since when): { slot, at }
 * while it is current, else null. The update refreshes it with every step.
 */
function holdFrom(text, now) {
  const m = /^\s*([a-z]+)\s+(\d{9,11})\s*$/.exec(String(text ?? ''))
  if (!m || !HOLD_SLOTS.includes(m[1])) return null
  const at = Number(m[2]) * 1000
  return now - at < HOLD_MS && at - now < HOLD_MS ? { slot: m[1], at } : null
}

/** The reason oled.py --check gave for a picture it did not take (the last JSON line of its output): a key of PICTURE_MESSAGES. */
function pictureErrorCode(output) {
  const line = String(output ?? '').trim().split('\n').pop()
  try {
    const code = JSON.parse(line)?.code
    return Object.prototype.hasOwnProperty.call(PICTURE_MESSAGES, code) ? code : 'bad_picture'
  } catch {
    return 'bad_picture'
  }
}

/** The rows of the list of pictures of the page: the picture, where it is shown, whether it is the user's own; `own` the ids the user changed. */
function imageRows({ own = [], idleScreen = 'nfc' } = {}) {
  return IMAGE_ROWS.map((row) => {
    const mine = own.includes(row.id)
    const chosen = (row.id === 'nfc' && idleScreen === 'nfc') || (row.id === 'barcode' && idleScreen === 'barcode') || (row.id === 'idle' && idleScreen === 'custom')
    const status = !row.changeable ? 'Fest eingebaut' : mine ? 'Eigenes Bild' : row.id === 'idle' ? 'Noch keins gewählt' : 'Original'
    return { id: row.id, title: row.title, text: [row.text, status, ...(chosen ? ['Gerade gewählt'] : [])], own: mine, changeable: row.changeable }
  })
}

/** The charge of the MuPiHAT's battery from /tmp/mupihat.json (a number 0 to 100), null without a reading. */
function batteryPercent(text) {
  try {
    const j = JSON.parse(String(text ?? ''))
    if (j.Measurement_Valid === false) return null
    const n = Number(j.Bat_Percent)
    if (j.BatteryConnected === 0 || j.BatteryConnected === false) return null
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
  } catch {
    return null
  }
}

/** Where the box plays, from GET /api/audio-output: the speaker, the headphones (a sound card of the 3.5 mm jack, or a Bluetooth device that is a headset) or Bluetooth. */
function outputKind(body) {
  const current = String(body?.current ?? 'box')
  if (current === 'box') return 'speaker'
  if (current.startsWith('card:')) {
    const card = (Array.isArray(body?.cards) ? body.cards : []).find((c) => c?.id === current.slice(5))
    return card?.kind === 'jack' ? 'headphone' : 'speaker'
  }
  const device = (Array.isArray(body?.devices) ? body.devices : []).find((d) => String(d?.mac ?? '').toUpperCase() === current.toUpperCase())
  return device?.kind === 'headphones' ? 'headphone' : 'bluetooth'
}

/** Four bars from the link quality of /proc/net/wireless (0 to 70); -1 when the box has no wireless connection. */
function wifiLevel(text) {
  const lines = String(text ?? '').split('\n').slice(2)
  for (const line of lines) {
    const m = /^\s*([^:\s]+):\s*\S+\s+(-?\d+(?:\.\d*)?)/.exec(line)
    if (!m) continue
    const quality = Number(m[2])
    if (!(quality > 0)) return 0
    return Math.max(1, Math.min(4, Math.ceil((quality / 70) * 4)))
  }
  return -1
}

/** The wired network interface that is up and has an address, if there is one: { name, ip }. `interfaces` is os.networkInterfaces(), `operstate(name)` reads its state. */
function wiredLink(interfaces, operstate) {
  for (const [name, addresses] of Object.entries(interfaces ?? {})) {
    if (!/^(eth|en)/.test(name)) continue
    const ip = (addresses ?? []).find((a) => a.family === 'IPv4' && !a.internal)?.address
    if (ip && String(operstate(name)).trim() === 'up') return { name, ip }
  }
  return null
}

/**
 * The short name of the weekday in the language of the box ("Mo", "mån", "Mon" ...): German as it always was, the others from the
 * system's language data; a language it does not know is German too.
 */
function weekdayName(date, language) {
  const code = String(language ?? 'de').toLowerCase().split(/[-_]/)[0]
  if (code !== 'de' && /^[a-z]{2,3}$/.test(code)) {
    try {
      const name = new Intl.DateTimeFormat(code, { weekday: 'short' }).format(date).replace(/\./g, '').trim()
      if (name) return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 4)
    } catch {
      // (a language the system does not know)
    }
  }
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()]
}

/** "07:45" and "Mo 16.11." for a date (the weekday in the language of the box). */
function timeTexts(date, language = 'de') {
  const two = (n) => String(n).padStart(2, '0')
  return { time: `${two(date.getHours())}:${two(date.getMinutes())}`, date: `${weekdayName(date, language)} ${two(date.getDate())}.${two(date.getMonth() + 1)}.` }
}

/**
 * The state the driver draws. `now` in ms; `ui` is what the extension holds besides the player: { infoUntil, overlay: { kind, volume, until },
 * select: { title, artist, index, count, until }, idleSince, wake, mode, ready (false while the box starts), hold: { slot } (an update runs or the box
 * goes down: the box's scripts drew it, see holdFrom), blocked (a rest time or the limit) } and `net` { ssid, ip, wifi, lan, battery, output }.
 */
/** What the display shows for a picture of the page's list ("show picture"): the view of buildState, or null for an id that is no picture. */
function previewView(id) {
  switch (id) {
    case 'boot':
      return { view: 'boot' }
    case 'nfc':
    case 'barcode':
      return { view: 'idle', idle: id, clock: false }
    case 'idle':
      return { view: 'idle', idle: 'custom', clock: false }
    case 'update':
      return { view: 'update' }
    case 'rest':
      return { view: 'rest' }
    case 'shutdown':
      return { view: 'bye' }
    default:
      return null
  }
}

function buildState({ config, play, ui, net, date, now, version, language }) {
  const { time, date: dateText } = timeTexts(date, language)
  const base = {
    mode: ui.mode ?? config.mode,
    clock: config.idleScreen === 'clock',
    idle: config.idleScreen,
    time,
    date: dateText,
    wifi: net.wifi ?? -1,
    lan: net.lan === true,
    battery: typeof net.battery === 'number' ? net.battery : null,
    output: net.output ?? 'speaker',
    timeMode: config.timeMode,
    scroll: config.scroll,
    shuffle: play.shuffle,
    repeat: play.repeat,
    volume: play.volume,
    playing: play.playing,
    title: play.title,
    artist: play.artist,
    album: play.album,
    track: play.track,
    tracks: play.tracks,
    elapsed: play.elapsed,
    duration: play.duration,
    stream: play.stream,
  }
  // (a picture the user asked to see on the page: for a few seconds, then what was shown before)
  if (ui.preview && now < ui.preview.until) {
    const shown = previewView(ui.preview.id)
    if (shown) return { ...base, ...shown }
  }
  // (the box goes down or an update runs: that picture, whatever else; the start picture until the box is ready to play)
  if (ui.hold?.slot === 'shutdown') return { ...base, view: 'bye' }
  if (ui.hold?.slot === 'update') return { ...base, view: 'update' }
  if (ui.ready === false) return { ...base, view: 'boot' }
  if (ui.infoUntil && now < ui.infoUntil) {
    return { ...base, view: 'info', ssid: net.lan ? '' : (net.ssid ?? ''), ip: net.ip ?? '', version: `OLED ${version}`, infoLeft: Math.max(0, (ui.infoUntil - now) / INFO_MS) }
  }
  // (the rotary knob is choosing an album, a folder or an episode: its name where the information of the medium is, until the choice is made)
  if (ui.select && now < ui.select.until) return { ...base, view: 'select', pick: { title: ui.select.title, artist: ui.select.artist, index: ui.select.index, count: ui.select.count } }
  if (ui.overlay && now < ui.overlay.until) return { ...base, view: 'overlay', overlay: ui.overlay.kind, volume: ui.overlay.volume ?? play.volume }
  if (play.player !== '' && play.playing) return { ...base, view: 'play' }
  // (nothing plays - a paused medium too, its still picture would burn in: after the time the user chose the display goes off, a
  // button, a tag or a tap wakes it)
  if (config.sleepAfter > 0 && ui.idleSince && now - ui.idleSince >= config.sleepAfter * 60000 && !(ui.wake && now < ui.wake)) return { ...base, view: 'off' }
  // (a rest time or the limit has stopped the box: the picture that says so, instead of the one of the idle display)
  if (ui.blocked === true) return { ...base, view: 'rest' }
  const something = play.player !== '' && (play.title !== '' || play.artist !== '' || play.album !== '')
  return { ...base, view: something ? 'play' : 'idle' }
}

/**
 * What another extension says the knob is on ({ title, artist, index, count, seconds } or { clear: true }) as the `ui.select` of buildState;
 * null for no choice (cleared, or nothing that can be shown). The text is cut to a length a line can hold, the time to 5 minutes at most.
 */
function selectionOf(body, now) {
  if (!body || typeof body !== 'object' || body.clear === true) return null
  const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')
  const title = text(body.title, 120)
  const number = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(9999, Math.trunc(Number(value)))) : 0)
  if (title === '') return null
  const seconds = Number(body.seconds) > 0 ? Math.min(300, Number(body.seconds)) : 20
  return { title, artist: text(body.artist, 120), index: number(body.index), count: number(body.count), until: now + seconds * 1000 }
}

/** Does Spotify play, as the player's /local tells it (its own pause flag; `spotifySilent` while the box's Spotify device is quiet)? */
function spotifyMayPlay(local) {
  return local?.currentPlayer === 'spotify' && local.pause !== true && local.spotifySilent !== true
}

// ---- I2C: is the bus on (the lines of the status block) ------------------------------------------------------------------------------
const I2C_KEYS = ['i2c_arm', 'i2c1', 'i2c']
const dtparam = (keys, value) => new RegExp(`^\\s*dtparam=(?:[^,\\n]*,)*(?:${keys})=${value}\\b`, 'm')
const I2C_ON = dtparam(I2C_KEYS.join('|'), 'on')
const I2C_OFF = dtparam(I2C_KEYS.join('|'), 'off')
const I2C_MODULE = /^\s*i2c[-_]dev\s*$/m

/** I2C: on in the boot configuration and the module i2c-dev loaded (or listed); the device is /dev/i2c-1, the bus of the header. */
function i2cState(configText, modulesText, names, moduleLoaded) {
  const devices = (Array.isArray(names) ? names : []).filter((n) => n === 'i2c-1')
  const text = String(configText ?? '')
  const lineOn = I2C_ON.test(text)
  const configured = lineOn && (moduleLoaded === true || I2C_MODULE.test(String(modulesText ?? '')))
  return { configured, off: !lineOn && I2C_OFF.test(text), devices }
}
const i2cIsOn = (state) => state.configured === true || ((state.devices ?? []).length > 0 && state.off !== true)

/** The lines of the status block. `driver`: { phase, code } from the driver; `kiosk`: what headless says (see kioskRow). */
function statusRows({ config, driver, i2c, kiosk }) {
  const rows = []
  const phase = driver.phase
  if (phase === 'ready') rows.push({ label: 'Display', value: 'Bereit', tone: 'ok' })
  else if (phase === 'error') rows.push({ label: 'Display', value: errorText(driver.code), tone: 'error' })
  else rows.push({ label: 'Display', value: 'Startet …' })
  rows.push({ label: 'Typ', value: `${config.controller.toUpperCase()} · ${config.width} × ${config.height} · ${config.address}` })
  const on = i2cIsOn(i2c)
  rows.push({
    label: 'I2C',
    value: on ? (i2c.devices.length > 0 ? 'Eingeschaltet' : 'Eingeschaltet, die Box muss neu starten') : 'Ausgeschaltet',
    tone: on && i2c.devices.length > 0 ? 'ok' : 'warn',
    ...(on ? {} : { button: { label: 'I2C einschalten', post: '/api/ext/oled/iicon', confirm: 'I2C einschalten? Die Box muss danach neu starten.' } }),
  })
  rows.push(kioskRow(kiosk))
  return rows
}

function errorText(code) {
  return (
    {
      no_i2c: 'I2C ist aus: einschalten, dann neu starten',
      i2c_access: 'Kein Zugriff auf den I2C-Bus',
      no_display: 'Antwortet nicht: Anschluss und Adresse prüfen',
      no_pil: 'Es fehlt das Paket python3-pil',
      no_python: 'Python 3 fehlt',
    }[code] ?? 'Fehler'
  )
}

/** The line about the kiosk: what the box does at its next start, and what is running now. */
function kioskRow({ headless, running }) {
  if (headless) return running ? { label: 'DSI-Display', value: 'Wird nach dem Neustart abgeschaltet', tone: 'warn' } : { label: 'DSI-Display', value: 'Aus (ohne DSI-Display)', tone: 'ok' }
  return running ? { label: 'DSI-Display', value: 'An', tone: 'ok' } : { label: 'DSI-Display', value: 'Startet nach dem Neustart wieder', tone: 'warn' }
}

module.exports = {
  CONTROLLERS,
  SIZES,
  ADDRESSES,
  MODES,
  TIME_MODES,
  SCROLL_MODES,
  SLEEP_MINUTES,
  IDLE_SCREENS,
  PICTURE_MESSAGES,
  pictureErrorCode,
  IMAGE_ROWS,
  IMAGE_IDS,
  CHANGEABLE_IMAGES,
  BOOT_MAX_MS,
  blockedFrom,
  holdFrom,
  imageRows,
  OVERLAY_MS,
  INFO_MS,
  PREVIEW_MS,
  previewView,
  readConfig,
  driverArgs,
  needsRestart,
  eveningContrast,
  nextMode,
  readPlayback,
  batteryPercent,
  outputKind,
  overlayFor,
  wifiLevel,
  wiredLink,
  timeTexts,
  buildState,
  selectionOf,
  i2cState,
  i2cIsOn,
  statusRows,
  errorText,
  kioskRow,
  spotifyMayPlay,
  I2C_KEYS,
}
