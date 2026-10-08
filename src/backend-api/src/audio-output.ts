/**
 * Where the box plays: its own speaker or a paired Bluetooth device ("Hören mit" on the display's player, the output
 * row of the web app's "Jetzt läuft").
 *
 * With more than one sound card (the 3.5 mm output next to an I2S amplifier, HDMI, a USB DAC) each is an output of its
 * own ("card:<sink>"); with one card it is simply "the box". "The box" is always the card chosen under Audio > Soundkarte
 * (not the first one PulseAudio lists), a card chosen on the display or in the app is kept for the next start, and the
 * board's own outputs are switched on next to the box's card with setOnboardAudio (Audio > Soundkarte, needs a restart).
 *
 * One output at a time: choosing a Bluetooth device connects it (if it is not yet) and lets the other Bluetooth audio
 * devices go; choosing the box (or one of its cards) lets them all go. PulseAudio keeps a volume per output, so the
 * speaker comes back at its own volume after the headphones - an output used for the first time is not left louder than
 * the box was.
 *
 * The box's sound card can drop out of PulseAudio (seen after headphones were let go: only the null sink was left and
 * even ALSA refused to open the card until its driver was bound again). ensureBoxSink() binds the driver anew when the
 * card's sink is missing; startAudioWatch() looks every 20 s whether that is needed while nothing else plays.
 */

import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { Express, RequestHandler } from 'express'

export interface AudioOutputDeps {
  /** the display (loopback) or the web app with its session */
  guard: RequestHandler
  getMupiboxConfig: () => unknown
  /** to keep the chosen output for the next start and the switch of the 3.5 mm output (under the config lock) */
  updateMupiboxConfig?: (mutate: (cfg: Record<string, unknown>) => void | false) => Promise<void>
}

export interface OutputDevice {
  mac: string
  name: string
  kind: 'headphones' | 'speaker'
  connected: boolean
  /** the battery in percent, when the device reports it (see btBattery) */
  battery?: number
}

/** A sound card of the box: PulseAudio's ALSA sink, named for what it is (language-neutral: 3.5 mm, HDMI, I2S, USB) */
export interface CardOutput {
  /** the PulseAudio sink's name (alsa_output....) */
  id: string
  name: string
  /** what PulseAudio calls it (a hint under the name) */
  desc: string
  kind: 'jack' | 'hdmi' | 'amp' | 'usb' | 'card'
}

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i
const CARD_PREFIX = 'card:'
const SINK_RE = /^alsa_output\.[\w.:+-]+$/
// (a device that takes audio: "Audio Sink" in its UUIDs)
const AUDIO_SINK_UUID = /0000110b-0000-1000-8000-00805f9b34fb/i

function run(cmd: string, args: string[], timeout = 10000, env?: NodeJS.ProcessEnv): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024, env }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }))
  })
}
const ctl = (...args: string[]) => run('bluetoothctl', args, 20000)
// (PulseAudio's tools speak the system language - "Senke #", "Beschreibung:" - and the lists are read by their words)
const pactl = (...args: string[]) => run('pactl', args, 10000, { ...process.env, LC_ALL: 'C' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The paired Bluetooth devices that take audio */
export async function outputDevices(): Promise<OutputDevice[]> {
  const list = await ctl('devices')
  const out: OutputDevice[] = []
  for (const line of list.stdout.split('\n')) {
    const m = /^Device\s+([0-9A-Fa-f:]{17})\s*(.*)$/.exec(line.trim())
    if (!m || !MAC_RE.test(m[1])) continue
    const info = (await ctl('info', m[1])).stdout
    if (!/Paired:\s*yes/i.test(info) || !AUDIO_SINK_UUID.test(info)) continue
    const icon = /Icon:\s*(\S+)/.exec(info)?.[1] ?? ''
    out.push({
      mac: m[1].toUpperCase(),
      name: /Alias:\s*(.+)/.exec(info)?.[1]?.trim() || m[2].trim() || m[1],
      kind: /headphone|headset/.test(icon) ? 'headphones' : /audio-card|speaker/.test(icon) ? 'speaker' : 'headphones',
      connected: /Connected:\s*yes/i.test(info),
      battery: /Connected:\s*yes/i.test(info) ? btBattery(info) : undefined,
    })
  }
  return out
}

/**
 * The battery of a connected Bluetooth device from `bluetoothctl info` ("Battery Percentage: 0x50 (80)"): headsets send
 * it over their hands-free link (PulseAudio passes it on to BlueZ, which needs Experimental = true in main.conf - set
 * by the update), BLE devices over GATT. Many report it in steps of 10, some (AirPods on this stack) not at all.
 */
export function btBattery(info: string): number | undefined {
  const m = /Battery Percentage:\s*0x[0-9a-f]+\s*\((\d+)\)/i.exec(info)
  const v = m ? Number(m[1]) : Number.NaN
  return Number.isInteger(v) && v >= 0 && v <= 100 ? v : undefined
}

const sinkMac =(sink: string) => /^bluez_(?:sink|output)\.([0-9A-F_]{17})/i.exec(sink)?.[1]?.replace(/_/g, ':').toUpperCase() ?? null

async function sinks(): Promise<string[]> {
  return (await pactl('list', 'short', 'sinks')).stdout
    .split('\n')
    .map((l) => l.split('\t')[1])
    .filter(Boolean)
}

// What a sink is, read from its name and what PulseAudio says of its card (alsa.card_name, alsa.id): the amplifier
// first - the MAX98357A's id is "bcm2835-i2s-HiFi HiFi-0", the board's own cards are "bcm2835 Headphones" and "bcm2835
// HDMI 1" (the same platform device, so the sink's name alone does not tell them apart)
function cardOf(sink: string, desc: string, hints = ''): CardOutput {
  const n = `${sink} ${hints}`.toLowerCase()
  const kind: CardOutput['kind'] = /hdmi/.test(n)
    ? 'hdmi'
    : /usb/.test(n)
      ? 'usb'
      : /soc_sound|i2s|max98357|hifiberry|iqaudio|allo|dac|simple-card/.test(n)
        ? 'amp'
        : /bcm2835|headphones|3\.5mm/.test(n)
          ? 'jack'
          : 'card'
  // ('Speaker' is the fallback: the display and the web app say it in their language for an amplifier card)
  const name = kind === 'hdmi' ? 'HDMI' : kind === 'jack' ? '3.5 mm' : kind === 'amp' ? 'Speaker' : kind === 'usb' ? 'USB' : desc || sink
  return { id: sink, name, desc, kind }
}

/** The sound cards of the box (the ALSA sinks of PulseAudio) */
export async function cardOutputs(): Promise<CardOutput[]> {
  const text = (await pactl('list', 'sinks')).stdout
  const out: CardOutput[] = []
  for (const block of text.split(/\n(?=Sink #)/)) {
    const name = /^\s*Name:\s*(\S+)/m.exec(block)?.[1]
    if (!name || !name.startsWith('alsa_output') || !SINK_RE.test(name)) continue
    const prop = (key: string) => new RegExp(`^\\s*${key.replace(/\./g, '\\.')} = "([^"]*)"`, 'm').exec(block)?.[1] ?? ''
    out.push(cardOf(name, /^\s*Description:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? '', `${prop('alsa.card_name')} ${prop('alsa.id')}`))
  }
  return out
}

// --- the box's own card: the one chosen under Audio > Soundkarte (mupibox.physicalDevice) -----------------------------

let config: () => unknown = () => undefined
let saveConfig: ((mutate: (cfg: Record<string, unknown>) => void | false) => Promise<void>) | undefined
const mupibox = () => ((config() as { mupibox?: Record<string, unknown> } | undefined)?.mupibox ?? {}) as Record<string, unknown>

/** what kind of card the box's own one is: the onboard outputs and a USB DAC by name, every other one is an I2S card */
function boxKind(): CardOutput['kind'] | 'i2s' {
  const device = String(mupibox().physicalDevice ?? '')
  return device === 'rpi-bcm2835-3.5mm' ? 'jack' : device === 'rpi-bcm2835-hdmi' ? 'hdmi' : device === 'usb-dac' ? 'usb' : 'i2s'
}

/**
 * The box's own card among the cards PulseAudio has (null when it is not there): with one card that one; else the one
 * of the chosen kind - with the board's 3.5 mm output switched on next to an amplifier, the amplifier (whatever the order
 * of the cards: "the first card" was the 3.5 mm one when it came first)
 */
function boxCardOf(cards: CardOutput[]): CardOutput | null {
  if (cards.length <= 1) return cards[0] ?? null
  const want = boxKind()
  // (an amplifier first, then a card of no known kind - never a USB device plugged in next to it: listed before the
  // amplifier, it was taken for the box's card)
  if (want === 'i2s') return cards.find((c) => c.kind === 'amp') ?? cards.find((c) => c.kind === 'card') ?? null
  return cards.find((c) => c.kind === want || (want === 'usb' && c.kind === 'card')) ?? null
}

/** The box's own sink, or - when it is missing - any of its cards (null without any) */
const boxSink = async () => {
  const cards = await cardOutputs()
  return (boxCardOf(cards) ?? cards[0])?.id ?? null
}
const boxSinkStrict = async () => boxCardOf(await cardOutputs())?.id ?? null

/**
 * Headphones play: a Bluetooth device, or the board's 3.5 mm output (its card is "bcm2835 Headphones") - the own limit
 * for headphones (mupibox.btMaxVolume) counts then, not only the box's maximum (the player does the same).
 */
export async function headphonesPlaying(): Promise<boolean> {
  const def = (await pactl('get-default-sink')).stdout.trim()
  if (def.startsWith('bluez_')) return true
  if (!def.startsWith('alsa_output.') || !def.includes('bcm2835')) return false
  return (await cardOutputs()).find((c) => c.id === def)?.kind === 'jack'
}

/** Where it plays now: 'box' (or, with several cards, 'card:<sink>') or the Bluetooth device's address */
export async function currentOutput(): Promise<string> {
  const def = (await pactl('get-default-sink')).stdout.trim()
  const mac = sinkMac(def)
  if (mac) return mac
  return def.startsWith('alsa_output') && (await sinks()).filter((s) => s.startsWith('alsa_output')).length > 1 ? CARD_PREFIX + def : 'box'
}

// the ALSA ids of the board's own cards (the legacy driver: Headphones, b1, b2; with KMS: vc4hdmi0, vc4hdmi1)
const ONBOARD_ID = /^(Headphones|b\d+|vc4hdmi\d*|HDMI\d*|bcm2835.*)$/i

/** The box's own card in /sys/class/sound (to bind its driver anew), null when it is not in the system */
async function boxCardDir(): Promise<string | null> {
  const cards = (await fsp.readdir('/sys/class/sound').catch(() => [] as string[]))
    .filter((n) => /^card\d+$/.test(n))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
  // (the onboard outputs or a USB DAC as the box's card: card 0 as before)
  if (boxKind() !== 'i2s') return cards.includes('card0') ? '/sys/class/sound/card0' : null
  for (const c of cards) {
    const id = (await fsp.readFile(`/sys/class/sound/${c}/id`, 'utf8').catch(() => '')).trim()
    if (id && !ONBOARD_ID.test(id)) return `/sys/class/sound/${c}`
  }
  return null
}

/** The sound card's sink, its driver bound anew when PulseAudio lost it (null when there is no card at all) */
export async function ensureBoxSink(): Promise<string | null> {
  const have = await boxSinkStrict()
  if (have) return have
  const dir = await boxCardDir()
  if (!dir) return await boxSink()
  let device: string
  let driver: string
  try {
    device = path.basename(await fsp.realpath(`${dir}/device`))
    driver = path.basename(await fsp.realpath(`${dir}/device/driver`))
  } catch {
    return await boxSink()
  }
  if (!/^[\w:.-]+$/.test(device) || !/^[\w:.-]+$/.test(driver)) return await boxSink()
  console.warn(`${new Date().toLocaleString()}: [audio-output] the sound card's sink is missing - binding ${device} (${driver}) again`)
  const drivers = `/sys/bus/platform/drivers/${driver}`
  await run('sudo', ['sh', '-c', `echo '${device}' > ${drivers}/unbind`])
  await sleep(1000)
  await run('sudo', ['sh', '-c', `echo '${device}' > ${drivers}/bind`])
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    const sink = await boxSinkStrict()
    if (sink) return sink
  }
  return await boxSink()
}

async function moveTo(sink: string) {
  await pactl('set-default-sink', sink)
  const inputs = (await pactl('list', 'short', 'sink-inputs')).stdout
  for (const line of inputs.split('\n')) {
    const id = line.split('\t')[0]
    if (/^\d+$/.test(id)) await pactl('move-sink-input', id, sink)
  }
}

const volumeOf = async (sink: string) => Number(/(\d+)%/.exec((await pactl('get-sink-volume', sink)).stdout)?.[1] ?? Number.NaN)

/** not louder than the box was: an output used for the first time (headphones!) starts wherever PulseAudio puts it */
async function notLouderThan(sink: string, boxVolume: number) {
  const vol = await volumeOf(sink)
  if (Number.isFinite(boxVolume) && Number.isFinite(vol) && vol > boxVolume) await pactl('set-sink-volume', sink, `${boxVolume}%`)
}

/** The output chosen on the display or in the app is kept for the next start: one of the box's other cards, else none */
async function remember(sink: string | null) {
  if (!saveConfig) return
  const want = sink ?? undefined
  await saveConfig((cfg) => {
    const mb = (cfg.mupibox ?? {}) as Record<string, unknown>
    if (mb.audioOutput === want) return false
    if (want) mb.audioOutput = want
    else delete mb.audioOutput
    cfg.mupibox = mb
  }).catch((e: unknown) => console.warn(`${new Date().toLocaleString()}: [audio-output] output not kept: ${e instanceof Error ? e.message : e}`))
}

/** Plays on the box: the Bluetooth audio devices let go, the speaker's sink the default */
async function toBox(devices: OutputDevice[]): Promise<boolean> {
  for (const d of devices.filter((x) => x.connected)) await ctl('disconnect', d.mac)
  const sink = await ensureBoxSink()
  if (!sink) return false
  await moveTo(sink)
  await remember(null)
  return true
}

/** Plays on one of the box's cards: the Bluetooth audio devices let go, that card's sink the default */
async function toCard(sink: string, devices: OutputDevice[]): Promise<boolean> {
  if (!(await sinks()).includes(sink)) return false
  const box = await boxSinkStrict()
  const before = (await pactl('get-default-sink')).stdout.trim()
  const beforeVolume = before ? await volumeOf(before) : Number.NaN
  for (const d of devices.filter((x) => x.connected)) await ctl('disconnect', d.mac)
  if (sink !== box) await notLouderThan(sink, beforeVolume)
  await moveTo(sink)
  await remember(sink === box ? null : sink)
  return true
}

/** Plays on a Bluetooth device: connected (up to ~15 s), the others let go, its sink the default */
async function toDevice(mac: string, devices: OutputDevice[]): Promise<'ok' | 'not_found' | 'no_sink'> {
  const before = await boxSink()
  const boxVolume = before ? await volumeOf(before) : Number.NaN
  if (!devices.find((d) => d.mac === mac)?.connected) {
    await ctl('connect', mac)
    // (headphones often report "connected" a second or two after the command returns: the display said "not found"
    // and then showed them connected - asked again for up to 8 s before giving up)
    let connected = false
    for (let i = 0; i < 9 && !connected; i++) {
      if (i) await sleep(1000)
      connected = /Connected:\s*yes/i.test((await ctl('info', mac)).stdout)
    }
    if (!connected) return 'not_found'
  }
  for (const d of devices.filter((x) => x.connected && x.mac !== mac)) await ctl('disconnect', d.mac)
  let sink: string | undefined
  for (let i = 0; i < 16 && !sink; i++) {
    sink = (await sinks()).find((s) => sinkMac(s) === mac)
    if (!sink) await sleep(500)
  }
  if (!sink) return 'no_sink'
  await notLouderThan(sink, boxVolume)
  await moveTo(sink)
  return 'ok'
}

// --- the board's 3.5 mm output next to the box's card (Audio > Soundkarte; scripts/mupibox/onboard_audio.sh) ---------

const ONBOARD_SCRIPT = '/usr/local/bin/mupibox/onboard_audio.sh'

/**
 * The board's own outputs on or off (DietPi's block, dtparam=audio, the order of the cards - see the script). Returns
 * whether something was written: it applies after a restart of the box.
 */
export async function setOnboardAudio(on: boolean): Promise<{ ok: boolean; changed: boolean }> {
  if (saveConfig) {
    await saveConfig((cfg) => {
      const mb = (cfg.mupibox ?? {}) as Record<string, unknown>
      mb.onboardAudio = on
      // (an output of the board kept for the start: gone with it)
      if (!on && typeof mb.audioOutput === 'string' && /bcm2835/.test(mb.audioOutput)) delete mb.audioOutput
      cfg.mupibox = mb
    })
  }
  const r = await run('sudo', [ONBOARD_SCRIPT, on ? 'on' : 'off'], 20000)
  return { ok: r.ok, changed: /changed/.test(r.stdout) }
}

/** After DietPi switched the sound card (it writes its block anew): the board's outputs on again when they were */
export async function reapplyOnboardAudio(): Promise<boolean> {
  const r = await run('sudo', [ONBOARD_SCRIPT, 'reapply'], 20000)
  return /changed/.test(r.stdout)
}

/** What is written for the board's outputs ('on' / 'off'; '' when the script is not there) */
export async function onboardAudioWritten(): Promise<string> {
  return (await run('sudo', [ONBOARD_SCRIPT, 'status'], 10000)).stdout.trim()
}

let switching = false

export function registerAudioOutputRoutes(app: Express, deps: AudioOutputDeps): void {
  config = deps.getMupiboxConfig
  saveConfig = deps.updateMupiboxConfig
  /**
   * GET /api/audio-output - {current: 'box'|'card:<sink>'|mac, devices: the paired Bluetooth devices, cards: the box's
   * sound cards when there is more than one (else []), display: the choice on the display allowed}
   */
  app.get('/api/audio-output', deps.guard, async (_req, res) => {
    const mb = (deps.getMupiboxConfig() as { mupibox?: { outputPicker?: unknown } } | undefined)?.mupibox
    const cards = await cardOutputs()
    res.json({ current: await currentOutput(), devices: await outputDevices(), cards: cards.length > 1 ? cards : [], display: mb?.outputPicker !== false })
  })

  /** POST /api/audio-output {target: 'box'|'card:<sink>'|mac} - play there (409 while another switch runs) */
  app.post('/api/audio-output', deps.guard, async (req, res) => {
    const target = String((req.body as { target?: unknown } | undefined)?.target ?? '')
    const isCard = target.startsWith(CARD_PREFIX) && SINK_RE.test(target.slice(CARD_PREFIX.length))
    if (target !== 'box' && !isCard && !MAC_RE.test(target)) {
      res.status(400).json({ error: 'invalid_target' })
      return
    }
    if (switching) {
      res.status(409).json({ error: 'busy' })
      return
    }
    switching = true
    try {
      const devices = await outputDevices()
      if (isCard) {
        const ok = await toCard(target.slice(CARD_PREFIX.length), devices)
        res.status(ok ? 200 : 404).json({ ok, error: ok ? undefined : 'unknown_card', current: await currentOutput() })
        return
      }
      if (target !== 'box' && !devices.some((d) => d.mac === target.toUpperCase())) {
        res.status(404).json({ error: 'not_paired' })
        return
      }
      const result = target === 'box' ? ((await toBox(devices)) ? 'ok' : 'no_sink') : await toDevice(target.toUpperCase(), devices)
      res.status(result === 'ok' ? 200 : result === 'not_found' ? 504 : 500).json({ ok: result === 'ok', error: result === 'ok' ? undefined : result, current: await currentOutput() })
    } finally {
      switching = false
    }
  })
}

/**
 * After the start: the output kept (one of the box's other cards) or else the box's own card is the default - PulseAudio
 * takes the card it likes best, and with the 3.5 mm output switched on that was the jack, the speaker stayed silent.
 * Not while a Bluetooth device plays. Tried until PulseAudio has the cards (true: done).
 */
async function startOutput(): Promise<boolean> {
  const def = (await pactl('get-default-sink')).stdout.trim()
  if (def.startsWith('bluez_')) return true
  const cards = await cardOutputs()
  if (!cards.length) return false
  if (cards.length === 1) return true
  const kept = String(mupibox().audioOutput ?? '')
  const target = cards.find((c) => c.id === kept)?.id ?? boxCardOf(cards)?.id
  if (!target) return false
  if (target !== def) {
    console.log(`${new Date().toLocaleString()}: [audio-output] at the start: plays on ${target} (was ${def || 'none'})`)
    await moveTo(target)
  }
  return true
}

/** Every 20 s: no Bluetooth output and the box's card without its sink - the card's driver bound anew (see ensureBoxSink) */
export function startAudioWatch(): void {
  let started = false
  let tries = 0
  let missing = 0
  // the board's outputs switched on but blocked again (the sound card switched with the admin interface, a DietPi
  // update): written anew, they apply after the next restart
  setTimeout(() => {
    reapplyOnboardAudio()
      .then((changed) => changed && console.warn(`${new Date().toLocaleString()}: [audio-output] the board's 3.5 mm output was blocked again - switched on anew, applies after a restart`))
      .catch(() => undefined)
  }, 30000).unref()
  setInterval(async () => {
    if (switching) return
    // (PulseAudio not there - starting, restarting: no sinks to see, but the card is fine; binding its driver anew
    // every 20 s meanwhile cut the sound for a second each time)
    if (!(await pactl('info')).ok) return
    if (!started && tries++ < 9) started = await startOutput().catch(() => false)
    const list = await sinks()
    if (list.some((s) => s.startsWith('bluez_')) || (list.some((s) => s.startsWith('alsa_output')) && (await boxSinkStrict()))) {
      missing = 0
      return
    }
    // (only when it stays missing for a minute: right after a restart of PulseAudio it has no sinks for a moment and
    // still holds the card - unbinding it then hung in the kernel, the card was gone until the box was restarted)
    if (++missing < 3) return
    missing = 0
    await ensureBoxSink().catch(() => null)
  }, 20000).unref()
}
