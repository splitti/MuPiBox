// The box's state at a glance (app: Einstellungen › System › Zustand der Box): each check as ok / warn / error / info
// with its value and, when something is off, what to do. Read when the page asks - nothing runs in the background.

import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireSession } from './middleware'
import { spotifyLoginAge } from './spotify-auth-age'
import { certInfo } from './tls'

export type HealthStatus = 'ok' | 'warn' | 'error' | 'info'
export interface HealthCheck {
  id: string
  status: HealthStatus
  /** the measured value, as shown (numbers and units only; the app words the rest) */
  value: string
  /** what it means when not ok (a key the app words) */
  hint?: string
}

interface HealthDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
}

function run(cmd: string, args: string[], timeoutMs = 8000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve({ ok: !err, stdout: String(stdout ?? '') }),
    )
  })
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`

async function storage(): Promise<HealthCheck> {
  const st = await fsp.statfs('/').catch(() => null)
  if (!st) return { id: 'storage', status: 'info', value: '–' }
  const free = Number(st.bavail) * Number(st.bsize)
  const total = Number(st.blocks) * Number(st.bsize)
  const pct = total ? Math.round((free / total) * 100) : 0
  const status: HealthStatus = free < 512 * 1024 ** 2 ? 'error' : pct < 10 ? 'warn' : 'ok'
  return { id: 'storage', status, value: `${gb(free)} (${pct} %)`, ...(status !== 'ok' ? { hint: 'storage_low' } : {}) }
}

async function temperature(): Promise<HealthCheck> {
  const raw = await fsp.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8').catch(() => '')
  const c = Number.parseInt(raw, 10) / 1000
  if (!Number.isFinite(c)) return { id: 'temperature', status: 'info', value: '–' }
  const status: HealthStatus = c >= 80 ? 'error' : c >= 70 ? 'warn' : 'ok'
  return { id: 'temperature', status, value: `${c.toFixed(1)} °C`, ...(status !== 'ok' ? { hint: 'too_hot' } : {}) }
}

// The Pi's own report of its power supply: under-voltage or throttling now (bits 0-3) or since the start (16-19)
async function power(): Promise<HealthCheck> {
  let r = await run('vcgencmd', ['get_throttled'])
  if (!r.ok) r = await run('sudo', ['-n', 'vcgencmd', 'get_throttled'])
  const m = /throttled=(0x[0-9a-f]+)/i.exec(r.stdout)
  if (!m) return { id: 'power', status: 'info', value: '–' }
  const v = Number.parseInt(m[1], 16)
  if (v & 0x1) return { id: 'power', status: 'error', value: m[1], hint: 'undervoltage_now' }
  if (v & 0xe) return { id: 'power', status: 'warn', value: m[1], hint: 'throttled_now' }
  if (v & 0x10000) return { id: 'power', status: 'warn', value: m[1], hint: 'undervoltage_since_boot' }
  return { id: 'power', status: 'ok', value: m[1] }
}

// Errors of the SD card since the start (the kernel's messages) and whether the system still writes to it
async function sdCard(): Promise<HealthCheck> {
  const mounts = await fsp.readFile('/proc/mounts', 'utf8').catch(() => '')
  const root = mounts.split('\n').find((l) => l.split(' ')[1] === '/')
  if (root && / ro[, ]/.test(` ${root.split(' ')[3]} `))
    return { id: 'sdcard', status: 'error', value: 'read-only', hint: 'sd_readonly' }
  const r = await run('sudo', ['-n', 'dmesg'])
  if (!r.ok) return { id: 'sdcard', status: 'info', value: '–' }
  const errors = r.stdout.split('\n').filter((l) => /mmc\d.*(error|timeout)|I\/O error|EXT4-fs error/i.test(l)).length
  return errors
    ? { id: 'sdcard', status: 'warn', value: String(errors), hint: 'sd_errors' }
    : { id: 'sdcard', status: 'ok', value: '0' }
}

async function memory(): Promise<HealthCheck> {
  const info = await fsp.readFile('/proc/meminfo', 'utf8').catch(() => '')
  const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(info)?.[1] ?? Number.NaN)
  const avail = kb('MemAvailable') * 1024
  const total = kb('MemTotal') * 1024 || os.totalmem()
  if (!Number.isFinite(avail)) return { id: 'memory', status: 'info', value: '–' }
  const pct = Math.round((avail / total) * 100)
  const status: HealthStatus = pct < 5 ? 'error' : pct < 10 ? 'warn' : 'ok'
  return {
    id: 'memory',
    status,
    value: `${Math.round(avail / 1024 ** 2)} MB (${pct} %)`,
    ...(status !== 'ok' ? { hint: 'memory_low' } : {}),
  }
}

// The box's own programs (pm2: backend, player) and services that stopped with an error
async function services(): Promise<HealthCheck> {
  const pm2 = await run('pm2', ['jlist'], 10000)
  let down: string[] = []
  try {
    const list = JSON.parse(pm2.stdout) as { name?: string; pm2_env?: { status?: string } }[]
    down = ['server', 'spotify-control'].filter((n) => list.find((p) => p.name === n)?.pm2_env?.status !== 'online')
  } catch {
    // pm2 not readable: only the systemd part
  }
  const failed = await run('systemctl', ['list-units', '--state=failed', '--no-legend', '--plain'])
  const units = failed.stdout
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((u) => u && /^(mupi|lighttpd)/.test(u))
  const all = [...down, ...units]
  return all.length
    ? { id: 'services', status: 'error', value: all.join(', '), hint: 'services_down' }
    : { id: 'services', status: 'ok', value: '' }
}

async function internet(): Promise<HealthCheck> {
  const state = await fsp
    .readFile('/tmp/network.json', 'utf8')
    .then((t) => (JSON.parse(t) as { onlinestate?: string }).onlinestate)
    .catch(() => undefined)
  if (state === 'online') return { id: 'internet', status: 'ok', value: '' }
  if (state === 'offline') return { id: 'internet', status: 'warn', value: '', hint: 'offline' }
  return { id: 'internet', status: 'info', value: '–' }
}

// The NAS: set up at all, and its address answering (a connection to its port, nothing more)
async function nas(cfg: MupiboxConfig | undefined): Promise<HealthCheck | null> {
  const address = String((cfg as { nas?: { address?: string } } | undefined)?.nas?.address ?? '').trim()
  if (!address) return null
  let host = ''
  let port = 0
  try {
    const u = new URL(/^https?:\/\//.test(address) ? address : `http://${address}`)
    host = u.hostname
    port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80)
  } catch {
    return { id: 'nas', status: 'warn', value: address, hint: 'nas_address' }
  }
  const reachable = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
  return reachable
    ? { id: 'nas', status: 'ok', value: `${host}:${port}` }
    : { id: 'nas', status: 'warn', value: `${host}:${port}`, hint: 'nas_unreachable' }
}

async function spotifyLogin(cfg: MupiboxConfig | undefined): Promise<HealthCheck | null> {
  const sp = (cfg?.spotify ?? {}) as Record<string, unknown>
  if (!sp.refreshToken) return null
  const age = await spotifyLoginAge(cfg).catch(() => null)
  if (!age) return { id: 'spotify', status: 'info', value: '–' }
  if (age.invalid) return { id: 'spotify', status: 'error', value: '', hint: 'spotify_refused' }
  if (age.daysLeft === null || age.estimated)
    return { id: 'spotify', status: 'info', value: '', hint: 'spotify_unknown' }
  const status: HealthStatus = age.daysLeft <= 3 ? 'error' : age.daysLeft <= 14 ? 'warn' : 'ok'
  return { id: 'spotify', status, value: String(age.daysLeft), ...(status !== 'ok' ? { hint: 'spotify_soon' } : {}) }
}

async function certificate(): Promise<HealthCheck> {
  const c = await certInfo().catch(() => null)
  if (!c) return { id: 'certificate', status: 'info', value: '–' }
  const days = Math.floor((Date.parse(c.validTo) - Date.now()) / 86400e3)
  const status: HealthStatus = days < 0 ? 'error' : days <= 30 ? 'warn' : 'ok'
  return { id: 'certificate', status, value: String(days), ...(status !== 'ok' ? { hint: 'certificate_soon' } : {}) }
}

// The podcast episodes kept on the SD card (podcast-offline.ts)
async function podcasts(): Promise<HealthCheck> {
  try {
    const index = JSON.parse(await fsp.readFile('/home/dietpi/MuPiBox/podcasts/index.json', 'utf8')) as {
      files?: Record<string, { bytes?: number }>
    }
    const files = Object.values(index.files ?? {})
    const bytes = files.reduce((n, f) => n + (f.bytes ?? 0), 0)
    return { id: 'podcasts', status: 'info', value: `${files.length} · ${gb(bytes)}` }
  } catch {
    return { id: 'podcasts', status: 'info', value: '0' }
  }
}

export function registerHealthRoutes(router: Router, deps: HealthDeps): void {
  /** GET /api/app/health - {checks: [{id, status, value, hint}], uptime (s), version} */
  router.get('/health', requireSession, async (_req, res) => {
    const cfg = deps.getMupiboxConfig()
    const checks = (
      await Promise.all([
        storage(),
        temperature(),
        power(),
        sdCard(),
        memory(),
        services(),
        internet(),
        nas(cfg),
        spotifyLogin(cfg),
        certificate(),
        podcasts(),
      ])
    ).filter((c): c is HealthCheck => c !== null)
    res.json({
      checks,
      uptime: Math.round(os.uptime()),
      version: String((cfg?.mupibox as Record<string, unknown> | undefined)?.version ?? ''),
    })
  })
}
