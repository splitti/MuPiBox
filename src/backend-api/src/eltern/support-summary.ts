// The box's profile for a report in the Discord (app: Einstellungen › System › Über die Box › Für Discord kopieren):
// a short block, the same for every box - the version and where the updates came from, the Pi, the display, the HAT,
// the sound, which services are on, the network and how the box is. Nothing that names the box, the home or a person:
// no address, no WiFi name, no box name, no accounts and nothing of the library - it is meant to be posted openly.
// Always German (the helpers in the Discord read it, and it looks the same on every box); also in the support zip.

import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { bootConfigPath } from './boot-paths'
import { bootDrive } from './boot-drive'
import { detectDisplayProfile, DISPLAY_OVERLAYS } from './display-profile'
import { parseInstalled } from './updates'

function run(cmd: string, args: string[], timeoutMs = 5000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 256 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }))
  })
}

const section = (cfg: MupiboxConfig | undefined, name: string) => ((cfg as Record<string, unknown> | undefined)?.[name] ?? {}) as Record<string, unknown>
const de = (n: number, digits = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const gb = (bytes: number) => `${de(bytes / 1024 ** 3, 1)} GB`
const day = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.` : iso
}

/** "2 Tagen", "5 Stunden", "12 Minuten" (after "läuft seit") */
function since(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  if (d >= 1) return d === 1 ? '1 Tag' : `${d} Tagen`
  const h = Math.floor(seconds / 3600)
  if (h >= 1) return h === 1 ? '1 Stunde' : `${h} Stunden`
  const m = Math.max(1, Math.floor(seconds / 60))
  return m === 1 ? '1 Minute' : `${m} Minuten`
}

/** the box's local date of a time as "YYYY-MM-DD" (as in the names of the logs) */
const localDate = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`

/**
 * The last updates, from the logs in /boot: <date>_update_<version>.log once an update finished (one from a branch
 * leaves <date>_update_.log, without a version); mupibox_update.log written later than those while one runs or after
 * one that did not finish. (The finished log is moved there, so its time is when that update ended.)
 */
async function updates(): Promise<string> {
  const names = await fsp.readdir('/boot').catch(() => [] as string[])
  const found = names.map((n) => ({ name: n, m: /^(\d{4}-\d{2}-\d{2})_update_(.*)\.log$/.exec(n) }))
  const done = (
    await Promise.all(
      found
        .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
        .map(async ({ name, m }) => ({
          date: m[1],
          version: m[2] || 'Branch-Update',
          mtime: (await fsp.stat(`/boot/${name}`).catch(() => null))?.mtimeMs ?? 0,
        })),
    )
  ).sort((a, b) => a.date.localeCompare(b.date) || a.mtime - b.mtime)
  const steps = done.slice(-3).map((u) => `${u.version} (${day(u.date)})`)
  let open = ''
  try {
    const st = await fsp.stat('/boot/mupibox_update.log')
    if (st.mtimeMs > Math.max(0, ...done.map((u) => u.mtime))) open = `letztes Update nicht fertig (${day(localDate(st.mtime))}, /boot/mupibox_update.log)`
  } catch {
    // none: the last one finished
  }
  if (!steps.length) return open || 'keine (seit der Installation)'
  return `${steps.join(' → ')}${open ? ` · ${open}` : ', fertig'}`
}

async function display(cfg: MupiboxConfig | undefined): Promise<string> {
  const mb = section(cfg, 'mupibox')
  const configTxt = await fsp.readFile(await bootConfigPath(), 'utf8').catch(() => '')
  const id = detectDisplayProfile(configTxt, mb.displayProfile)
  const name =
    id === 'official7' ? 'Offizielles 7″ (1. Gen.) oder HDMI' : id === 'custom' ? 'eigene Einstellung in config.txt' : `${id} (${DISPLAY_OVERLAYS[id]})`
  const rotation = Number(mb.displayRotation)
  const turned = [90, 180, 270].includes(rotation) ? ` · gedreht ${rotation}°` : ''
  const mirrored = mb.displayMirror === 'x' ? ' · gespiegelt links-rechts' : mb.displayMirror === 'y' ? ' · gespiegelt oben-unten' : ''
  return `${name}${turned}${mirrored}`
}

/** the battery profiles the box comes with (config/templates/mupiboxconfig.json; its selected_battery is "USB-C mode") */
const KNOWN_BATTERIES = ['Ansmann 2S1P', 'ENERpower 2S2P 10.000mAh', 'ENERpower 2S3P 15.000mAh', 'USB-C mode (no battery)', 'USB-C mode', 'Custom']

async function hat(cfg: MupiboxConfig | undefined): Promise<string> {
  const h = section(cfg, 'mupihat')
  if (h.hat_active !== true) return 'keiner'
  // (an own profile only as such - its name may say whose box it is)
  const chosen = typeof h.selected_battery === 'string' ? h.selected_battery : ''
  const battery = !chosen ? '' : KNOWN_BATTERIES.includes(chosen) ? ` · ${chosen}` : ' · eigenes Akkuprofil'
  try {
    const j = JSON.parse(await fsp.readFile('/tmp/mupihat.json', 'utf8')) as {
      Bat_Percent?: unknown
      Bat_PercentSource?: unknown
      BatteryConnected?: unknown
      IBus?: unknown
      Measurement_Valid?: unknown
    }
    const pct = Number(j.Bat_Percent)
    if (j.Measurement_Valid === false || !Number.isFinite(pct)) return `MuPiHAT${battery} · keine Messwerte`
    // No battery, no empty one: the driver says so with the source "none"; an older one gave 0 % from the voltage - then
    // only the profile without a battery together with the charger seeing none counts (a battery on that profile keeps
    // its percent)
    const usbProfile = chosen === 'USB-C mode (no battery)' || chosen === 'USB-C mode'
    const noneSeen = j.BatteryConnected === 0 || j.BatteryConnected === false
    if (j.Bat_PercentSource === 'none' || (usbProfile && noneSeen)) return `MuPiHAT${battery} · ohne Akku${Number(j.IBus) > 0 ? ', am Netzteil' : ''}`
    return `MuPiHAT${battery} · Akku ${Math.round(pct)} %${Number(j.IBus) > 0 ? ', am Netzteil' : ''}`
  } catch {
    return `MuPiHAT${battery} · keine Messwerte (Dienst läuft nicht?)`
  }
}

async function audio(cfg: MupiboxConfig | undefined): Promise<string> {
  const mb = section(cfg, 'mupibox')
  const card = typeof mb.physicalDevice === 'string' && mb.physicalDevice ? mb.physicalDevice : 'nicht gewählt'
  const extra = [mb.onboardAudio === true ? 'Klinke' : '', mb.hdmiAudio === true ? 'HDMI' : ''].filter(Boolean)
  const player = (await run('sh', ['-c', 'command -v mpv'])).ok ? 'mpv' : (await run('sh', ['-c', 'command -v mplayer'])).ok ? 'mplayer' : 'kein mpv/mplayer'
  return `${card}${extra.length ? ` (+ ${extra.join(', ')})` : ''} · Player ${player}`
}

async function services(cfg: MupiboxConfig | undefined): Promise<string> {
  const spotify = section(cfg, 'spotify')
  const tidal = (await run('systemctl', ['is-active', 'mupi_tidal'])).stdout.trim() === 'active'
  const onOff = (name: string, on: boolean) => `${name} ${on ? 'an' : 'aus'}`
  return [
    onOff('Spotify', typeof spotify.refreshToken === 'string' && spotify.refreshToken !== ''),
    onOff('TIDAL', tidal),
    onOff('NAS', typeof section(cfg, 'nas').address === 'string' && section(cfg, 'nas').address !== ''),
    onOff('Home Assistant', section(cfg, 'homeAssistant').enabled === true),
    onOff('MQTT', section(cfg, 'mqtt').active === true),
    onOff('Telegram', section(cfg, 'telegram').active === true),
  ].join(' · ')
}

/** WLAN with its band and signal, or the cable (no name, no address) */
async function network(): Promise<string> {
  // the first interface of a kind with an address (the WiFi: the one that is connected - wlan1 for a USB stick, with
  // the built-in one switched off)
  const up = (prefix: RegExp) =>
    Object.entries(os.networkInterfaces()).find(([name, list]) => prefix.test(name) && (list ?? []).some((a) => a.family === 'IPv4' && !a.internal))?.[0]
  const parts: string[] = []
  if (up(/^(eth|en)/)) parts.push('Kabel')
  const wlan = up(/^(wlan|wl)/)
  if (wlan) {
    let wifi = 'WLAN'
    // (by its path: the server's PATH has no /usr/sbin)
    const link = await run('/usr/sbin/iw', ['dev', wlan, 'link'])
    const freq = Number(/freq:\s*(\d+)/.exec(link.stdout)?.[1])
    if (freq) wifi += freq >= 5900 ? ' 6 GHz' : freq >= 4900 ? ' 5 GHz' : ' 2,4 GHz'
    try {
      // /proc/net/wireless: "wlan0: 0000   58.  -52.  -256 ..." (level in dBm) - the line of that interface
      const line = (await fsp.readFile('/proc/net/wireless', 'utf8')).split('\n').find((l) => l.trim().startsWith(`${wlan}:`)) ?? ''
      const dbm = Number(/^\s*[\w.-]+:\s+\S+\s+\S+\s+(-?\d+)\./.exec(line)?.[1])
      if (Number.isFinite(dbm) && dbm >= -120 && dbm < 0) wifi += ` · Signal ${Math.max(0, Math.min(100, 2 * (dbm + 100)))} % (${dbm} dBm)`
    } catch {
      // no wireless statistics
    }
    parts.push(wifi)
  }
  return parts.join(' + ') || 'keine Verbindung'
}

/** systemd-analyze: "Startup finished in 1.333s (kernel) + 27.029s (userspace) = 28.363s" ("1min 4.2s" on a slow one) */
async function bootSeconds(): Promise<number | null> {
  const total = /= (?:(\d+)min )?([\d.]+)s/.exec((await run('systemd-analyze', ['time'])).stdout)
  return total ? Math.round(Number(total[1] ?? 0) * 60 + Number(total[2])) : null
}

/**
 * The installed version without a version number: a branch ("DEV <branch> <date>", or a label of its own). Not its
 * name - a branch can be named after the child or the room - only that it is one, and its date.
 */
function branchState(installed: string): string {
  if (!installed) return 'unbekannt'
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(installed)?.[1]
  return `Branch-Stand${date ? ` vom ${day(date)}` : ''}`
}

export async function supportSummary(cfg: MupiboxConfig | undefined): Promise<string> {
  const installed = String(section(cfg, 'mupibox').version ?? '')
  const { channel } = parseInstalled(installed)
  // (a release only as the update writes it - "5.0.13 stable", "DEV 5.0.13 <date>": a dotted number elsewhere is a
  // branch's name, e.g. an address in it)
  const number = /^(?:(?:DEV|BETA)\s+)?(\d+\.\d+(?:\.\d+)?)(?=\s|$)/i.exec(installed.trim())?.[1] ?? null
  const model = (await fsp.readFile('/sys/firmware/devicetree/base/model', 'utf8').catch(() => '')).replace(/\0/g, '').trim()
  const osName = /^PRETTY_NAME="?([^"\n]*)"?$/m.exec(await fsp.readFile('/etc/os-release', 'utf8').catch(() => ''))?.[1] ?? ''
  const dietpi = await fsp.readFile('/boot/dietpi/.version', 'utf8').catch(() => '')
  const dv = ['G_DIETPI_VERSION_CORE', 'G_DIETPI_VERSION_SUB', 'G_DIETPI_VERSION_RC'].map((k) => new RegExp(`^${k}=(\\d+)`, 'm').exec(dietpi)?.[1])
  const drive = bootDrive()
  const driveName = { sd: 'SD-Karte', usb: 'USB-Laufwerk', nvme: 'SSD', other: 'Systemlaufwerk' }[drive?.kind ?? 'sd']
  const usb = drive?.usbSpeed ? (drive.usbSpeed >= 5000 ? ' (USB 3)' : ' (USB 2)') : ''
  let disk = ''
  try {
    const st = await fsp.statfs('/')
    disk = ` · ${gb(st.bavail * st.bsize)} von ${gb(st.blocks * st.bsize)} frei`
  } catch {
    // statfs unavailable
  }
  let temp = ''
  try {
    const milli = Number.parseInt(await fsp.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8'), 10)
    if (Number.isFinite(milli)) temp = `${Math.round(milli / 1000)} °C · `
  } catch {
    // no thermal node
  }
  const boot = await bootSeconds()
  const mem = os.totalmem() / 1024 ** 3
  const memText = mem < 0.75 ? `${Math.round((mem * 1024) / 64) * 64} MB` : `${de(Math.round(mem))} GB`
  const lines = [
    `MuPiBox ${number ?? branchState(installed)} · ${{ stable: 'Stable', beta: 'Beta', dev: 'Dev' }[channel]}`,
    `Updates: ${await updates()}`,
    `Gerät: ${model || 'unbekannt'} · ${memText}`,
    `System: ${dv[0] && dv[1] ? `DietPi ${dv[0]}.${dv[1]}${dv[2] && dv[2] !== '0' ? `.${dv[2]}` : ''} · ` : ''}${osName || os.release()} (${os.machine()})`,
    `Laufwerk: ${driveName}${usb}${disk}`,
    `Display: ${await display(cfg)}`,
    `HAT: ${await hat(cfg)}`,
    `Audio: ${await audio(cfg)}`,
    `Dienste: ${await services(cfg)}`,
    `Netz: ${await network()}`,
    `Zustand: ${temp}läuft seit ${since(os.uptime())}${boot ? ` · Start ${boot} s` : ''}`,
  ]
  return lines.join('\n')
}
