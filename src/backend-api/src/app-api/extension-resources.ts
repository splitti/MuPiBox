// What an extension needs from the box, and the test before it is installed: does it collide with something that is already there?
//
// An extension says in its manifest (`resources`, required - an empty object when it needs nothing) which
//   - ports it listens on (TCP/UDP, one port each, 1024 and above: it runs as the user dietpi),
//   - GPIO pins it uses (BCM numbers 2-27),
//   - systemd services it brings along or relies on (e.g. through an apt package or a service of its own)
// The box compares that with what is taken: the core's own use (its configuration), the boot configuration (dtoverlay
// lines), the other extensions, and - as far as it can look - what runs right now (listening ports, claimed GPIO lines,
// systemd units). A collision is an error and stops the install; something that is only unclear is a warning.
//
// The declaration is checked against the box, it is not enforced: an extension is a program of the user dietpi.

import { promises as fsp } from 'node:fs'

export interface PortUse {
  port: number
  proto?: 'tcp' | 'udp'
  purpose?: string
}
export interface GpioUse {
  pin: number
  purpose?: string
}
export interface ServiceUse {
  name: string
  /** true: the extension brings this unit (it must not exist yet); false (default): it relies on it (it should exist) */
  provides?: boolean
  purpose?: string
}
export interface Resources {
  ports?: PortUse[]
  gpio?: GpioUse[]
  services?: ServiceUse[]
}

export type ConflictKind = 'port' | 'gpio' | 'service'
export interface Conflict {
  kind: ConflictKind
  severity: 'error' | 'warn'
  /** what is wanted, e.g. "port 9000/tcp", "GPIO 17", "service foo.service" */
  what: string
  /** who has it, e.g. "MuPiBox (the player)", "extension clock", "lighttpd (running)" */
  by: string
  /** the same as a list of who holds it ("MuPiBox (power button, shim)", "extension clock", "lighttpd (running)" ...) */
  holders?: string[]
  /** what could not be looked at (only for the warning "the test is less sure"): "the boot configuration", "the open ports" ... */
  blind?: string[]
  /** in English, for the log: the app writes the sentence itself, in the language of the user, from the fields above */
  message: string
}

const MAX_ENTRIES = 12
const SERVICE_NAME = /^[A-Za-z0-9@_.:-]{1,60}\.(service|socket|timer)$/
const PURPOSE_MAX = 100

/** What is wrong with the `resources` of a manifest (null: nothing). The field is required: `{}` says "nothing". */
export function checkResources(value: unknown): string | null {
  if (value === undefined) return 'resources is missing (use {} when the extension needs no port, GPIO pin or service)'
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'resources must be an object'
  const r = value as Record<string, unknown>
  for (const key of Object.keys(r)) if (!['ports', 'gpio', 'services'].includes(key)) return `resources: unknown part: ${key}`
  const list = (name: string): unknown[] | string => {
    const v = r[name]
    if (v === undefined) return []
    if (!Array.isArray(v) || v.length > MAX_ENTRIES) return `resources.${name}: a list of at most ${MAX_ENTRIES}`
    return v
  }
  const purposeOk = (p: unknown) => p === undefined || (typeof p === 'string' && p.length <= PURPOSE_MAX)
  const ports = list('ports')
  if (typeof ports === 'string') return ports
  const seenPorts = new Set<string>()
  for (const p of ports as PortUse[]) {
    if (!p || typeof p !== 'object' || !Number.isInteger(p.port) || p.port < 1024 || p.port > 65535) return 'resources.ports: a port from 1024 to 65535'
    if (p.proto !== undefined && p.proto !== 'tcp' && p.proto !== 'udp') return 'resources.ports: proto is tcp or udp'
    if (!purposeOk(p.purpose)) return 'resources.ports: purpose too long'
    const key = `${p.proto ?? 'tcp'}:${p.port}`
    if (seenPorts.has(key)) return `resources.ports: ${p.port} twice`
    seenPorts.add(key)
  }
  const gpio = list('gpio')
  if (typeof gpio === 'string') return gpio
  const seenPins = new Set<number>()
  for (const g of gpio as GpioUse[]) {
    if (!g || typeof g !== 'object' || !Number.isInteger(g.pin) || g.pin < 2 || g.pin > 27) return 'resources.gpio: a BCM pin number from 2 to 27'
    if (!purposeOk(g.purpose)) return 'resources.gpio: purpose too long'
    if (seenPins.has(g.pin)) return `resources.gpio: pin ${g.pin} twice`
    seenPins.add(g.pin)
  }
  const services = list('services')
  if (typeof services === 'string') return services
  const seenUnits = new Set<string>()
  for (const s of services as ServiceUse[]) {
    if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !SERVICE_NAME.test(s.name)) return 'resources.services: a unit name like foo.service'
    if (s.provides !== undefined && typeof s.provides !== 'boolean') return 'resources.services: provides is true or false'
    if (!purposeOk(s.purpose)) return 'resources.services: purpose too long'
    if (seenUnits.has(s.name)) return `resources.services: ${s.name} twice`
    seenUnits.add(s.name)
  }
  return null
}

/** The declaration in one fixed shape (defaults filled in, sorted), so two of them can be compared. */
export interface NormalizedResources {
  ports: { port: number; proto: 'tcp' | 'udp'; purpose: string }[]
  gpio: { pin: number; purpose: string }[]
  services: { name: string; provides: boolean; purpose: string }[]
}
export function normalizeResources(r: Resources | undefined): NormalizedResources {
  return {
    ports: [...(r?.ports ?? [])].map((p) => ({ port: p.port, proto: p.proto ?? 'tcp', purpose: p.purpose ?? '' })).sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto)),
    gpio: [...(r?.gpio ?? [])].map((g) => ({ pin: g.pin, purpose: g.purpose ?? '' })).sort((a, b) => a.pin - b.pin),
    services: [...(r?.services ?? [])].map((s) => ({ name: s.name, provides: s.provides === true, purpose: s.purpose ?? '' })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export const sameResources = (a: Resources | undefined, b: Resources | undefined): boolean => JSON.stringify(normalizeResources(a)) === JSON.stringify(normalizeResources(b))

/** What is taken: the key (`tcp:8200`, `17`, `foo.service`) and who has it. */
export interface Taken {
  ports: Map<string, string[]>
  gpio: Map<number, string[]>
  /** units that exist on the box (value: who brought them, when known) */
  units: Map<string, string[]>
  /** what could not be looked at (shown as a warning: the test is then less sure) */
  blind: string[]
}

export const emptyTaken = (): Taken => ({ ports: new Map(), gpio: new Map(), units: new Map(), blind: [] })

function add<K>(map: Map<K, string[]>, key: K, by: string): void {
  const have = map.get(key) ?? []
  if (!have.includes(by)) have.push(by)
  map.set(key, have)
}
export const addPort = (t: Taken, proto: string, port: number, by: string) => add(t.ports, `${proto}:${port}`, by)
export const addGpio = (t: Taken, pin: number, by: string) => add(t.gpio, pin, by)
export const addUnit = (t: Taken, name: string, by: string) => add(t.units, name, by)

/** The test: what the extension wants, compared with what is taken. `taken` holds only what belongs to others (not the extension itself). */
export function findConflicts(wanted: Resources | undefined, taken: Taken): Conflict[] {
  const out: Conflict[] = []
  const w = normalizeResources(wanted)
  for (const p of w.ports) {
    const by = taken.ports.get(`${p.proto}:${p.port}`)
    if (by?.length) out.push({ kind: 'port', severity: 'error', what: `port ${p.port}/${p.proto}`, by: by.join(', '), holders: by, message: `Port ${p.port}/${p.proto} is already used by ${by.join(', ')}.` })
  }
  for (const g of w.gpio) {
    const by = taken.gpio.get(g.pin)
    if (by?.length) out.push({ kind: 'gpio', severity: 'error', what: `GPIO ${g.pin}`, by: by.join(', '), holders: by, message: `GPIO ${g.pin} is already used by ${by.join(', ')}.` })
  }
  for (const s of w.services) {
    const by = taken.units.get(s.name)
    if (s.provides && by?.length) out.push({ kind: 'service', severity: 'error', what: `service ${s.name}`, by: by.join(', '), holders: by, message: `The service ${s.name} exists already (${by.join(', ')}).` })
    // (a service it relies on, that is not there: the extension may install it itself with a package - so only a warning)
    if (!s.provides && !by?.length) out.push({ kind: 'service', severity: 'warn', what: `service ${s.name}`, by: '-', message: `The service ${s.name} is not on the box (yet).` })
  }
  if (out.length === 0 && taken.blind.length > 0) {
    out.push({ kind: 'port', severity: 'warn', what: 'the check', by: '-', blind: [...taken.blind], message: `Could not look at: ${taken.blind.join(', ')}. The test is less sure.` })
  }
  return out
}

// ---------- reading what is taken (pure parsers first, then the part that looks at the box) ----------

/** `ss -H -ltnu` (or with -p) lines: the local port of each listening socket, tcp or udp, and the process when shown. */
export function parseListening(text: string): { proto: 'tcp' | 'udp'; port: number; process: string }[] {
  const out: { proto: 'tcp' | 'udp'; port: number; process: string }[] = []
  for (const line of text.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 5) continue
    const proto = cols[0].startsWith('udp') ? 'udp' : cols[0].startsWith('tcp') ? 'tcp' : null
    if (!proto) continue
    const port = /:(\d+)$/.exec(cols[4])?.[1]
    if (!port) continue
    const process = /users:\(\("([^"]+)"/.exec(line)?.[1] ?? 'a running program'
    out.push({ proto, port: Number(port), process })
  }
  return out
}

/** The GPIO pins that lines of the boot configuration (dtoverlay, dtparam) take. */
export function parseBootGpio(text: string): { pin: number; by: string }[] {
  const out: { pin: number; by: string }[] = []
  const mark = (pin: number, by: string) => {
    if (Number.isInteger(pin) && pin >= 2 && pin <= 27) out.push({ pin, by })
  }
  // overlays that take pins without naming them (their defaults); the 1-wire overlay and the shutdown button name theirs when they differ
  const fixed: Record<string, number[]> = {
    'w1-gpio': [4],
    'gpio-shutdown': [3],
    'gpio-poweroff': [26],
    'i2c-rtc': [2, 3],
    'i2c-gpio': [23, 24],
    'spi1-1cs': [16, 17, 18, 19, 20, 21],
    'spi1-2cs': [16, 17, 18, 19, 20, 21],
    'spi1-3cs': [16, 17, 18, 19, 20, 21],
    i2s: [18, 19, 20, 21],
    'i2s-gpio28-31': [],
    // (the 3.5 mm sound over PWM on the pins: audio remapped, the PWM overlays)
    audremap: [12, 13],
    pwm: [18],
    'pwm-2chan': [18, 19],
  }
  // (max98357a: the amplifier of the MuPiHAT and the box's own I2S amplifier - its pins were offered for buttons, and a
  // button there made the speaker silent until the next restart)
  const i2sCards = /^(hifiberry-|iqaudio-|justboom-|allo-|audioinjector|rpi-cirrus|pcm5102|googlevoicehat|adau7002|applepi-dac|dionaudio-|fe-pi-audio|i-sabre-q2m|rpi-dac|rpi-proto|sc16is|merus-amp|max98357a|i2s-dac)/
  // (the cards whose overlay switches the I2C bus on by itself, for the codec's controls - no dtparam=i2c_arm: SDA and SCL
  // were offered, and a button there took the volume control of the card away at every start)
  const i2cCards = /^(hifiberry-(dacplus|amp|digi|dacplushd|dacplusadc|dacplusdsp|adc)|iqaudio-(dacplus|digiampplus|codec|dac|digi)|allo-(boss|piano|katana|digione)|justboom-(dac|both|digi)|audioinjector-(?!bare)|rpi-cirrus|i-sabre-q2m|merus-amp|applepi-dac|dionaudio-loco-v2|fe-pi-audio|wm8960|seeed-.*voicecard)/
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('#') || !line) continue
    const dtparam = /^dtparam=(.+)$/.exec(line)
    if (dtparam) {
      for (const part of dtparam[1].split(',')) {
        const [k, v] = part.split('=')
        const on = v === undefined || v === 'on' || v === 'true' || v === '1'
        if (on && (k === 'i2c_arm' || k === 'i2c' || k === 'i2c1')) for (const p of [2, 3]) mark(p, `the boot configuration (${k}: I2C bus)`)
        if (on && k === 'spi') for (const p of [7, 8, 9, 10, 11]) mark(p, 'the boot configuration (spi: SPI bus)')
      }
      continue
    }
    if (/^enable_uart=1$/.test(line)) {
      for (const p of [14, 15]) mark(p, 'the boot configuration (enable_uart: serial port)')
      continue
    }
    const overlay = /^dtoverlay=(.+)$/.exec(line)
    if (!overlay) continue
    const [name, ...params] = overlay[1].split(',')
    const by = `the boot configuration (dtoverlay ${name})`
    let named = false
    for (const param of params) {
      const [k, v] = param.split('=')
      // (a parameter that names a pin: gpiopin, gpio_pin, pin, pin_a, gpio, sda, scl ...)
      if (v !== undefined && /^\d+$/.test(v) && /(^|[-_])(gpio|pin|sda|scl|sck|mosi|miso|clk|data|dat|key|ce)/i.test(k)) {
        mark(Number(v), by)
        named = true
      }
    }
    if (!named && fixed[name]) for (const p of fixed[name]) mark(p, by)
    if (i2sCards.test(name)) for (const p of [18, 19, 20, 21]) mark(p, by)
    if (i2cCards.test(name)) for (const p of [2, 3]) mark(p, by)
  }
  return out
}

/**
 * `gpioinfo` (libgpiod): the header pins that a program or the kernel holds right now. libgpiod 2 (Debian 13) writes
 * `"GPIO17" input consumer="gpiomon"`, libgpiod 1 (Debian 12) `"GPIO17" "gpiomon" input active-high [used]` - a free line has
 * the word unused there, without quotes.
 */
export function parseGpioInfo(text: string): { pin: number; consumer: string }[] {
  const out: { pin: number; consumer: string }[] = []
  for (const line of text.split('\n')) {
    const m = /"GPIO(\d+)"[^\n]*?consumer="([^"]+)"/.exec(line) ?? /"GPIO(\d+)"\s+"([^"]+)"\s+(?:input|output)\b/.exec(line)
    if (!m) continue
    out.push({ pin: Number(m[1]), consumer: m[2] })
  }
  return out
}

/** `systemctl list-unit-files --no-legend`: the names of the units. */
export function parseUnitFiles(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((n) => SERVICE_NAME.test(n))
}

/** What the core of the box holds, from its configuration (the same file the scripts read). */
// The rotary encoder: the two pins of the knob and the one of its button (rotary.pinA, pinB, pinButton in the configuration;
// the pins the box shipped with while nothing is chosen)
export const ROTARY_DEFAULT_PINS = { a: 26, b: 24, button: 10 }
export interface RotaryPins {
  a: number
  b: number
  button: number
}
/**
 * The pins of the rotary encoder in a configuration: each one a pin of 2-27 or 0 (none: a knob without a pin A or B does not turn, one
 * without a button pin has no button); a pin that is not set is the one the box shipped with; two pins that are the same: the shipped ones.
 */
export function rotaryPins(config: Record<string, unknown> | undefined): RotaryPins {
  const rotary = config?.rotary && typeof config.rotary === 'object' ? (config.rotary as Record<string, unknown>) : {}
  const pin = (v: unknown, fallback: number) => {
    if (v === undefined || v === null || v === '') return fallback
    const n = /^\d+$/.test(String(v)) ? Number(v) : NaN
    return n === 0 || (Number.isInteger(n) && n >= 2 && n <= 27) ? n : NaN
  }
  const chosen = { a: pin(rotary.pinA, ROTARY_DEFAULT_PINS.a), b: pin(rotary.pinB, ROTARY_DEFAULT_PINS.b), button: pin(rotary.pinButton, ROTARY_DEFAULT_PINS.button) }
  const set = Object.values(chosen).filter((n) => n !== 0)
  // (a pin that is not set is the shipped one; a wrong one or the same pin twice: all three are the shipped ones, never a half choice)
  return !Object.values(chosen).some(Number.isNaN) && new Set(set).size === set.length ? chosen : { ...ROTARY_DEFAULT_PINS }
}
/** The name of an encoder as the configuration has it: a short text, may be empty. */
export const rotaryName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 30) : '')
const rotaryPinList = (config: Record<string, unknown> | undefined): number[] => Object.values(rotaryPins(config)).filter((n) => n !== 0)
// What a turn of a knob does: nothing, the volume up or down by its step, the next or the previous track
export const ROTARY_DIRECTIONS = ['off', 'up', 'down', 'next', 'previous'] as const
export type RotaryDirection = (typeof ROTARY_DIRECTIONS)[number]
/** What the first knob does turned to the right and to the left (the volume up and down while nothing else is set). */
export function rotaryDirections(config: Record<string, unknown> | undefined): { right: RotaryDirection; left: RotaryDirection } {
  const rotary = config?.rotary && typeof config.rotary === 'object' ? (config.rotary as Record<string, unknown>) : {}
  const pick = (v: unknown, fallback: RotaryDirection) => ROTARY_DIRECTIONS.find((d) => d === v) ?? fallback
  return { right: pick(rotary.right, 'up'), left: pick(rotary.left, 'down') }
}
function rotaryOn(config: Record<string, unknown> | undefined): boolean {
  const rotary = config?.rotary && typeof config.rotary === 'object' ? (config.rotary as Record<string, unknown>) : {}
  return rotary.active === true || rotary.active === 'true' || rotary.rotary_active === true
}
/** Whether the push button of the rotary encoder does something: rotary_control.py takes its pin only then. */
export function rotaryButtonOn(config: Record<string, unknown> | undefined): boolean {
  const rotary = config?.rotary && typeof config.rotary === 'object' ? (config.rotary as Record<string, unknown>) : {}
  return typeof rotary.button === 'string' && rotary.button !== '' && rotary.button !== 'off'
}
// More rotary encoders (rotary.extra in the configuration, at most ROTARY_EXTRA_MAX): each one has its own three pins and does something
// for each way it is turned (right, left). They exist as long as they are in the list - there is no switch for them.
export const ROTARY_EXTRA_MAX = 4
export interface RotaryExtra {
  id: string
  /** the name the user gave it (empty: the page calls it "Drehregler 2" ...) */
  name: string
  /** what a turn to the right and to the left does */
  right: RotaryDirection
  left: RotaryDirection
  a: number
  b: number
  button: number
  /** what the push button does: off, playpause, next (a track forward) or ffwd */
  buttonFn: string
  /** percent per detent of a volume knob */
  step: number
}
export const ROTARY_EXTRA_BUTTONS = ['off', 'playpause', 'next', 'ffwd', 'address']
/** The additional rotary encoders of a configuration: the ones whose pins are 0 (none) or different pins of 2-27 (others are left out). */
export function rotaryExtras(config: Record<string, unknown> | undefined): RotaryExtra[] {
  const rotary = config?.rotary && typeof config.rotary === 'object' ? (config.rotary as Record<string, unknown>) : {}
  const list = Array.isArray(rotary.extra) ? rotary.extra : []
  const pin = (v: unknown) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : NaN)
  const direction = (v: unknown) => ROTARY_DIRECTIONS.find((d) => d === v)
  const out: RotaryExtra[] = []
  for (const entry of list.slice(0, ROTARY_EXTRA_MAX)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const pins = [pin(e.pinA), pin(e.pinB), pin(e.pinButton)]
    if (!/^[a-z0-9]{1,12}$/.test(String(e.id ?? '')) || out.some((o) => o.id === e.id)) continue
    const set = pins.filter((n) => n !== 0)
    if (!pins.every((n) => n === 0 || (Number.isInteger(n) && n >= 2 && n <= 27)) || new Set(set).size !== set.length) continue
    const step = Number(e.step)
    // (an entry of the first version had a function: the volume, or the tracks)
    const legacy = e.function === 'tracks' ? { right: 'next', left: 'previous' } : { right: 'up', left: 'down' }
    out.push({
      id: String(e.id),
      name: rotaryName(e.name),
      right: direction(e.right) ?? (legacy.right as RotaryDirection),
      left: direction(e.left) ?? (legacy.left as RotaryDirection),
      a: pins[0],
      b: pins[1],
      button: pins[2],
      buttonFn: ROTARY_EXTRA_BUTTONS.includes(String(e.button)) ? String(e.button) : 'off',
      step: Number.isInteger(step) && step >= 1 && step <= 10 ? step : 5,
    })
  }
  return out
}
/** The pins the additional encoders hold: the knob's two, the button's only while the button does something (a pin that is none holds nothing). */
export function rotaryExtraHeldPins(config: Record<string, unknown> | undefined): number[] {
  return rotaryExtras(config)
    .flatMap((k) => (k.buttonFn !== 'off' ? [k.a, k.b, k.button] : [k.a, k.b]))
    .filter((pin) => pin !== 0)
}
/** The pins the rotary encoders hold while they are on: the knob's two, the button's only while the button does something. */
export function rotaryHeldPins(config: Record<string, unknown> | undefined): number[] {
  const extra = rotaryExtraHeldPins(config)
  if (!rotaryOn(config)) return extra
  const pins = rotaryPins(config)
  return [...(rotaryButtonOn(config) ? [pins.a, pins.b, pins.button] : [pins.a, pins.b]).filter((pin) => pin !== 0), ...extra]
}

/** Pins a part of the core would use once it is switched on: free now, but worth a word to whoever chooses a pin. */
export function idleCoreGpio(config: Record<string, unknown> | undefined): { pin: number; by: string }[] {
  if (!rotaryOn(config)) return rotaryPinList(config).map((pin) => ({ pin, by: 'MuPiBox (rotary encoder, switched off)' }))
  const button = rotaryPins(config).button
  return rotaryButtonOn(config) || button === 0 ? [] : [{ pin: button, by: 'MuPiBox (rotary encoder button, switched off)' }]
}

export function coreResources(config: Record<string, unknown> | undefined): { ports: { proto: 'tcp' | 'udp'; port: number; by: string }[]; gpio: { pin: number; by: string }[] } {
  const ports: { proto: 'tcp' | 'udp'; port: number; by: string }[] = [
    { proto: 'tcp', port: 80, by: 'MuPiBox (web server)' },
    { proto: 'tcp', port: 443, by: 'MuPiBox (web server)' },
    { proto: 'tcp', port: 22, by: 'MuPiBox (SSH)' },
    { proto: 'tcp', port: 8200, by: 'MuPiBox (server and display)' },
    { proto: 'tcp', port: 8201, by: 'MuPiBox (server behind the web server)' },
    { proto: 'tcp', port: 5005, by: 'MuPiBox (player)' },
    { proto: 'tcp', port: 5900, by: 'MuPiBox (remote display, VNC)' },
    { proto: 'tcp', port: 6080, by: 'MuPiBox (remote display, noVNC)' },
    { proto: 'tcp', port: 5252, by: 'MuPiBox (DietPi dashboard)' },
  ]
  const gpio: { pin: number; by: string }[] = []
  const section = (name: string) => (config?.[name] && typeof config[name] === 'object' ? (config[name] as Record<string, unknown>) : {})
  const pin = (v: unknown) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : NaN)
  const take = (v: unknown, by: string) => {
    const n = pin(v)
    if (n >= 2 && n <= 27) gpio.push({ pin: n, by })
  }
  const shim = section('shim')
  take(shim.poweroffPin, 'MuPiBox (power button, shim)')
  take(shim.triggerPin, 'MuPiBox (power button, shim)')
  take(shim.cutPin, 'MuPiBox (power button, shim)')
  take(shim.ledPin, 'MuPiBox (power LED)')
  const fan = section('fan')
  if (fan.fan_active === true || fan.fan_active === 'true') take(fan.fan_gpio, 'MuPiBox (fan)')
  for (const p of rotaryHeldPins(config)) take(p, 'MuPiBox (rotary encoder)')
  const hat = section('mupihat')
  if (hat.hat_active === true || hat.hat_active === 'true') {
    for (const p of [2, 3]) take(p, 'MuPiBox (MuPiHAT, I2C)')
    // (its amplifier on I2S and the amplifier's on/off line SDMODE on 16 - also before its overlay is written to the boot
    // configuration; a button on 16 switched the speaker off. KILL, INT and the LED are the shim's pins above)
    for (const p of [16, 18, 19, 21]) take(p, 'MuPiBox (MuPiHAT, sound)')
  }
  return { ports, gpio }
}

export interface Probe {
  /** runs a command and gives its output ('' when it failed) */
  run: (cmd: string, args: string[]) => Promise<{ ok: boolean; out: string }>
  readFile: (file: string) => Promise<string>
}

export const realProbe = (run: Probe['run']): Probe => ({ run, readFile: (f) => fsp.readFile(f, 'utf8') })

/**
 * Everything that is taken on the box, except by the extension `self` (its own earlier version: an update must not collide with
 * itself). `others`: the manifests of the other extensions that are on (their declared resources count, whether they run or not).
 */
export async function gatherTaken(options: {
  self?: string
  config: Record<string, unknown> | undefined
  others: { id: string; resources?: Resources }[]
  probe: Probe
  /** what the installed version of `self` declared: what listens or is claimed for that is its own and no collision */
  selfDeclared?: Resources
}): Promise<Taken> {
  const t = emptyTaken()
  const core = coreResources(options.config)
  for (const p of core.ports) addPort(t, p.proto, p.port, p.by)
  for (const g of core.gpio) addGpio(t, g.pin, g.by)

  for (const other of options.others) {
    if (other.id === options.self) continue
    const r = normalizeResources(other.resources)
    for (const p of r.ports) addPort(t, p.proto, p.port, `extension ${other.id}`)
    for (const g of r.gpio) addGpio(t, g.pin, `extension ${other.id}`)
    for (const s of r.services) if (s.provides) addUnit(t, s.name, `extension ${other.id}`)
  }

  const own = normalizeResources(options.selfDeclared)
  const ownPorts = new Set(own.ports.map((p) => `${p.proto}:${p.port}`))
  const ownPins = new Set(own.gpio.map((g) => g.pin))
  const ownUnits = new Set(own.services.filter((s) => s.provides).map((s) => s.name))

  // the boot configuration: pins that overlays take
  let boot = ''
  for (const file of ['/boot/firmware/config.txt', '/boot/config.txt']) {
    try {
      boot = await options.probe.readFile(file)
      break
    } catch {
      /* (the other place) */
    }
  }
  if (boot) for (const b of parseBootGpio(boot)) addGpio(t, b.pin, b.by)
  else t.blind.push('the boot configuration')

  // what listens right now
  const ss = await options.probe.run('sudo', ['-n', 'ss', '-H', '-ltnup'])
  if (ss.ok && ss.out) {
    for (const l of parseListening(ss.out)) if (!ownPorts.has(`${l.proto}:${l.port}`)) addPort(t, l.proto, l.port, `${l.process} (running)`)
  } else t.blind.push('the open ports')

  // the GPIO lines that are held right now
  const info = await options.probe.run('sudo', ['-n', 'gpioinfo'])
  if (info.ok && info.out) {
    for (const g of parseGpioInfo(info.out)) if (!ownPins.has(g.pin)) addGpio(t, g.pin, `${g.consumer} (in use)`)
  } else t.blind.push('the GPIO lines')

  // the units
  const units = await options.probe.run('systemctl', ['list-unit-files', '--no-legend', '--no-pager'])
  if (units.ok && units.out) {
    for (const u of parseUnitFiles(units.out)) if (!ownUnits.has(u)) addUnit(t, u, 'installed on the box')
  } else t.blind.push('the services')
  return t
}

/** What an extension needs, for the app (which writes the words itself, in the language of the user): the normalized declaration. */
export function describeResources(r: Resources | undefined): NormalizedResources {
  return normalizeResources(r)
}
