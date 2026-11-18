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
// (a short picture - play, pause, volume - and the page with the address of the box stay this long)
const OVERLAY_MS = 900
const INFO_MS = 10000

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
    clock: settings.clock !== false,
    volumeOverlay: settings.volumeOverlay !== false,
    nightDim: settings.nightDim === true,
    nightContrast: Math.round(number(settings.nightContrast, 20, 1, 255)),
    timeMode: pick(settings.timeMode, TIME_MODES, 'up'),
    scroll: pick(settings.scroll, SCROLL_MODES, 'loop'),
    sleepAfter: pick(Number(settings.sleepAfter), SLEEP_MINUTES, 5),
    headless: settings.headless === true,
  }
}

/** The arguments of oled.py for a configuration. */
function driverArgs(config) {
  const args = ['--controller', config.controller, '--width', String(config.width), '--height', String(config.height), '--address', config.address, '--contrast', String(config.contrast)]
  if (config.rotate) args.push('--rotate')
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
    // (the player loops the whole list - there is no repeat of one track)
    out.repeat = local.repeat === true ? 'all' : 'off'
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
 * With `volumeShown` false a change of the volume shows no picture of its own.
 */
function overlayFor(before, after, volumeShown = true) {
  if (!before || !after) return null
  if (volumeShown && before.volume !== null && after.volume !== null && before.volume !== after.volume) return { kind: after.volume === 0 ? 'mute' : 'volume', volume: after.volume }
  if (before.playing !== after.playing && (after.player !== '' || before.player !== '')) return { kind: after.playing ? 'play' : 'pause', volume: after.volume }
  return null
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
 * idleSince, wake, mode } and `net` { ssid, ip, wifi, lan, battery, output }.
 */
function buildState({ config, play, ui, net, date, now, version, language }) {
  const { time, date: dateText } = timeTexts(date, language)
  const base = {
    mode: ui.mode ?? config.mode,
    clock: config.clock,
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
  if (ui.infoUntil && now < ui.infoUntil) {
    return { ...base, view: 'info', ssid: net.lan ? '' : (net.ssid ?? ''), ip: net.ip ?? '', version: `OLED ${version}`, infoLeft: Math.max(0, (ui.infoUntil - now) / INFO_MS) }
  }
  if (ui.overlay && now < ui.overlay.until) return { ...base, view: 'overlay', overlay: ui.overlay.kind, volume: ui.overlay.volume ?? play.volume }
  const something = play.player !== '' && (play.playing || play.title !== '' || play.artist !== '' || play.album !== '')
  if (something) return { ...base, view: 'play' }
  // (nothing plays: after the time the user chose the display goes off, a button, a tag or a tap wakes it)
  if (config.sleepAfter > 0 && ui.idleSince && now - ui.idleSince >= config.sleepAfter * 60000 && !(ui.wake && now < ui.wake)) return { ...base, view: 'off' }
  return { ...base, view: 'idle' }
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

/**
 * The commands that switch the box to a start without the DSI display (the kiosk is the autologin of DietPi: its autostart 0 is
 * "manual login", 11 the Chromium kiosk the box was set up with) and back. They run as root through sudo.
 */
function headlessCommands(on) {
  return [['sudo', ['-n', '/boot/dietpi/dietpi-autostart', on ? '0' : '11']]]
}

module.exports = {
  CONTROLLERS,
  SIZES,
  ADDRESSES,
  MODES,
  TIME_MODES,
  SCROLL_MODES,
  SLEEP_MINUTES,
  OVERLAY_MS,
  INFO_MS,
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
  i2cState,
  i2cIsOn,
  statusRows,
  errorText,
  kioskRow,
  headlessCommands,
  I2C_KEYS,
}
