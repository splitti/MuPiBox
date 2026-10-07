/**
 * Where the box plays: its own speaker or a paired Bluetooth device ("Hören mit" on the display's player, the output
 * row of the web app's "Jetzt läuft").
 *
 * With more than one sound card (the 3.5 mm output next to an I2S amplifier, HDMI, a USB DAC) each is an output of its
 * own ("card:<sink>"); with one card it is simply "the box".
 *
 * One output at a time: choosing a Bluetooth device connects it (if it is not yet) and lets the other Bluetooth audio
 * devices go; choosing the box (or one of its cards) lets them all go. PulseAudio keeps a volume per output, so the speaker comes back at
 * its own volume after the headphones - a device connected for the first time is not left louder than the box was.
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
}

export interface OutputDevice {
  mac: string
  name: string
  kind: 'headphones' | 'speaker'
  connected: boolean
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
    })
  }
  return out
}

const sinkMac = (sink: string) => /^bluez_(?:sink|output)\.([0-9A-F_]{17})/i.exec(sink)?.[1]?.replace(/_/g, ':').toUpperCase() ?? null

async function sinks(): Promise<string[]> {
  return (await pactl('list', 'short', 'sinks')).stdout
    .split('\n')
    .map((l) => l.split('\t')[1])
    .filter(Boolean)
}

function cardOf(sink: string, desc: string): CardOutput {
  const n = sink.toLowerCase()
  const kind: CardOutput['kind'] = /hdmi/.test(n)
    ? 'hdmi'
    : /usb/.test(n)
      ? 'usb'
      : /bcm2835[_-]audio|headphones|3\.5mm/.test(n)
        ? 'jack'
        : /soc_sound|i2s|max98357|hifiberry|iqaudio|allo|dac/.test(n)
          ? 'amp'
          : 'card'
  const name = kind === 'hdmi' ? 'HDMI' : kind === 'jack' ? '3.5 mm' : kind === 'amp' ? 'I²S' : kind === 'usb' ? 'USB' : desc || sink
  return { id: sink, name, desc, kind }
}

/** The sound cards of the box (the ALSA sinks of PulseAudio) */
export async function cardOutputs(): Promise<CardOutput[]> {
  const text = (await pactl('list', 'sinks')).stdout
  const out: CardOutput[] = []
  for (const block of text.split(/\n(?=Sink #)/)) {
    const name = /^\s*Name:\s*(\S+)/m.exec(block)?.[1]
    if (!name || !name.startsWith('alsa_output') || !SINK_RE.test(name)) continue
    out.push(cardOf(name, /^\s*Description:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? ''))
  }
  return out
}

/** Where it plays now: 'box' (or, with several cards, 'card:<sink>') or the Bluetooth device's address */
export async function currentOutput(): Promise<string> {
  const def = (await pactl('get-default-sink')).stdout.trim()
  const mac = sinkMac(def)
  if (mac) return mac
  return def.startsWith('alsa_output') && (await sinks()).filter((s) => s.startsWith('alsa_output')).length > 1 ? CARD_PREFIX + def : 'box'
}

const boxSink = async () => (await sinks()).find((s) => s.startsWith('alsa_output')) ?? null

/** The sound card's sink, its driver bound anew when PulseAudio lost it (null when there is no card at all) */
export async function ensureBoxSink(): Promise<string | null> {
  const have = await boxSink()
  if (have) return have
  let device: string
  let driver: string
  try {
    device = path.basename(await fsp.realpath('/sys/class/sound/card0/device'))
    driver = path.basename(await fsp.realpath('/sys/class/sound/card0/device/driver'))
  } catch {
    return null
  }
  if (!/^[\w:.-]+$/.test(device) || !/^[\w:.-]+$/.test(driver)) return null
  console.warn(`${new Date().toLocaleString()}: [audio-output] the sound card's sink is missing - binding ${device} (${driver}) again`)
  const dir = `/sys/bus/platform/drivers/${driver}`
  await run('sudo', ['sh', '-c', `echo '${device}' > ${dir}/unbind`])
  await sleep(1000)
  await run('sudo', ['sh', '-c', `echo '${device}' > ${dir}/bind`])
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    const sink = await boxSink()
    if (sink) return sink
  }
  return null
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

/** Plays on the box: the Bluetooth audio devices let go, the speaker's sink the default */
async function toBox(devices: OutputDevice[]): Promise<boolean> {
  for (const d of devices.filter((x) => x.connected)) await ctl('disconnect', d.mac)
  const sink = await ensureBoxSink()
  if (!sink) return false
  await moveTo(sink)
  return true
}

/** Plays on one of the box's cards: the Bluetooth audio devices let go, that card's sink the default */
async function toCard(sink: string, devices: OutputDevice[]): Promise<boolean> {
  if (!(await sinks()).includes(sink)) return false
  for (const d of devices.filter((x) => x.connected)) await ctl('disconnect', d.mac)
  await moveTo(sink)
  return true
}

/** Plays on a Bluetooth device: connected (up to ~15 s), the others let go, its sink the default */
async function toDevice(mac: string, devices: OutputDevice[]): Promise<'ok' | 'not_found' | 'no_sink'> {
  const before = await boxSink()
  const boxVolume = before ? await volumeOf(before) : Number.NaN
  if (!devices.find((d) => d.mac === mac)?.connected) {
    await ctl('connect', mac)
    if (!/Connected:\s*yes/i.test((await ctl('info', mac)).stdout)) return 'not_found'
  }
  for (const d of devices.filter((x) => x.connected && x.mac !== mac)) await ctl('disconnect', d.mac)
  let sink: string | undefined
  for (let i = 0; i < 16 && !sink; i++) {
    sink = (await sinks()).find((s) => sinkMac(s) === mac)
    if (!sink) await sleep(500)
  }
  if (!sink) return 'no_sink'
  // (not louder than the box was - a device's first time starts wherever PulseAudio puts it)
  const vol = await volumeOf(sink)
  if (Number.isFinite(boxVolume) && Number.isFinite(vol) && vol > boxVolume) await pactl('set-sink-volume', sink, `${boxVolume}%`)
  await moveTo(sink)
  return 'ok'
}

let switching = false

export function registerAudioOutputRoutes(app: Express, deps: AudioOutputDeps): void {
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

/** Every 20 s: no Bluetooth output and no sound card sink - the card's driver bound anew (see ensureBoxSink) */
export function startAudioWatch(): void {
  setInterval(async () => {
    if (switching) return
    // (PulseAudio not there - starting, restarting: no sinks to see, but the card is fine; binding its driver anew
    // every 20 s meanwhile cut the sound for a second each time)
    if (!(await pactl('info')).ok) return
    const list = await sinks()
    if (list.some((s) => s.startsWith('alsa_output') || s.startsWith('bluez_'))) return
    await ensureBoxSink().catch(() => null)
  }, 20000).unref()
}
