// Network shares (Samba, FTP, VNC), MQTT / Home Assistant, WLED and finding the Telegram chat id - what only the
// admin interface (network.php, service.php, smart.php) could do.
//
// Shares: switching off stops and disables the service (the admin interface also removed the packages, and switching
// on installed them again - minutes of apt for a toggle); switching on installs only what is missing. The work runs in
// the background, the page asks for its state.

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface ServicesDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

function run(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

const section = (deps: ServicesDeps, key: string) => ((deps.getMupiboxConfig() as Record<string, unknown> | undefined)?.[key] ?? {}) as Record<string, unknown>

async function merge(deps: ServicesDeps, key: string, values: Record<string, unknown>): Promise<void> {
  await deps.updateMupiboxConfig((cfg) => {
    cfg[key] = { ...((cfg[key] as Record<string, unknown>) ?? {}), ...values }
  })
}

async function isActive(unit: string): Promise<boolean> {
  return (await run('systemctl', ['is-active', unit], 5000)).stdout.trim() === 'active'
}

/* shares */

const APT = 'flock -w 120 /tmp/.mupibox.apt.lock'
const TEMPLATES = 'https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates'
const SHARES: Record<string, { unit: string; on: string; off: string }> = {
  samba: {
    unit: 'smbd',
    // (the admin interface's setup: its smb.conf and the user dietpi with the password "mupibox")
    on: `if ! command -v smbd >/dev/null; then ${APT} apt-get install samba wsdd -y && wget -q ${TEMPLATES}/smb.conf -O /etc/samba/smb.conf && (echo mupibox; echo mupibox) | smbpasswd -s -a dietpi; fi && systemctl enable smbd && systemctl start smbd`,
    off: 'systemctl stop smbd; systemctl disable smbd',
  },
  ftp: {
    unit: 'proftpd',
    on: `if ! command -v proftpd >/dev/null; then ${APT} apt-get install proftpd -y && wget -q ${TEMPLATES}/proftpd.conf -O /etc/proftpd/proftpd.conf; fi && systemctl enable proftpd && systemctl restart proftpd`,
    off: 'systemctl stop proftpd; systemctl disable proftpd',
  },
  vnc: {
    unit: 'mupi_novnc',
    on: `if ! command -v x11vnc >/dev/null || ! command -v websockify >/dev/null; then ${APT} apt-get install x11vnc websockify -y; fi && if [ ! -d /usr/share/novnc ]; then git clone https://github.com/novnc/noVNC.git /usr/share/novnc && chown -R dietpi:dietpi /usr/share/novnc; fi && systemctl enable mupi_vnc mupi_novnc && systemctl start mupi_vnc mupi_novnc`,
    off: 'systemctl stop mupi_vnc mupi_novnc; systemctl disable mupi_vnc mupi_novnc',
  },
}
const shareJobs: Record<string, { running: boolean; ok?: boolean; at?: number }> = {}

/* Telegram: the chat ids that wrote to the bot */

let detecting = false

export function registerServicesRoutes(router: Router, deps: ServicesDeps): void {
  /** GET /api/app/shares - Samba, FTP, VNC: running or not, and a switch still at work. */
  router.get('/shares', requireSession, async (_req, res) => {
    const out: Record<string, unknown> = {}
    for (const [name, s] of Object.entries(SHARES)) out[name] = { active: await isActive(s.unit), job: shareJobs[name] ?? { running: false } }
    res.json(out)
  })

  /** POST /api/app/shares {name, on} - switches a share in the background (installs it first when missing). */
  router.post('/shares', requireSession, requireCsrf, async (req, res) => {
    const { name, on } = (req.body ?? {}) as { name?: unknown; on?: unknown }
    const share = typeof name === 'string' ? SHARES[name] : undefined
    if (!share || typeof on !== 'boolean') {
      res.status(400).json({ error: 'name must be samba, ftp or vnc; on true or false' })
      return
    }
    if (shareJobs[name as string]?.running) {
      res.status(409).json({ error: 'already switching' })
      return
    }
    if (name === 'vnc') await merge(deps, 'tweaks', { vnc: on ? '1' : '0' })
    const job = { running: true, at: Date.now() } as { running: boolean; ok?: boolean; at?: number }
    shareJobs[name as string] = job
    const child = spawn('sudo', ['sh', '-c', on ? share.on : share.off], { stdio: 'ignore' })
    child.on('error', () => Object.assign(job, { running: false, ok: false }))
    child.on('exit', (code) => Object.assign(job, { running: false, ok: code === 0 }))
    res.json({ ok: true, started: true })
  })

  /**
   * POST /api/app/telegram/detect-chats
   * The chats that write to the bot now: the bot is stopped (it would take the messages itself), the Telegram API is
   * asked for new messages for up to 40 seconds, and the bot is started again. The admin interface's button asked
   * while the bot was running and found nothing.
   */
  router.post('/telegram/detect-chats', requireSession, requireCsrf, async (_req, res) => {
    const token = String(section(deps, 'telegram').token ?? '')
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(token)) {
      res.status(400).json({ error: 'no bot token' })
      return
    }
    if (detecting) {
      res.status(409).json({ error: 'already looking' })
      return
    }
    detecting = true
    const wasActive = await isActive('mupi_telegram')
    if (wasActive) await run('sudo', ['systemctl', 'stop', 'mupi_telegram'])
    const chats = new Map<string, string>()
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=40&allowed_updates=${encodeURIComponent('["message"]')}`, {
        signal: AbortSignal.timeout(50000),
      })
      const body = (await r.json().catch(() => ({}))) as { result?: { message?: { chat?: { id?: number; first_name?: string; last_name?: string; title?: string; username?: string } } }[] }
      for (const u of body.result ?? []) {
        const c = u.message?.chat
        if (c?.id === undefined) continue
        const label = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || ''
        chats.set(String(c.id), label.slice(0, 60))
      }
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [telegram] detecting chats: ${(err as Error).message}`)
    } finally {
      if (wasActive) await run('sudo', ['systemctl', 'start', 'mupi_telegram'])
      detecting = false
    }
    res.json({ chats: [...chats].map(([id, label]) => ({ id, label })) })
  })

  /** POST /api/app/telegram/test - a test message to the allowed chats, with the saved settings (the bot active,
   *  a token, a chat - else nothing is sent, see telegram_send_message.py). */
  router.post('/telegram/test', requireSession, requireCsrf, async (_req, res) => {
    const tg = section(deps, 'telegram')
    const chats = Array.isArray(tg.chatId) ? tg.chatId : []
    if (tg.active !== true || !tg.token || !chats.length) {
      res.status(409).json({ error: 'not_ready' })
      return
    }
    const r = await run('/usr/bin/python3', ['/usr/local/bin/mupibox/telegram_send_message.py', '--key', 'n_test'], 30000)
    res.json({ ok: r.ok })
  })

  /** GET /api/app/mqtt - the MQTT settings, the password only as "set". */
  router.get('/mqtt', requireSession, async (_req, res) => {
    const m = section(deps, 'mqtt')
    const str = (k: string, d = '') => (m[k] === undefined || m[k] === null ? d : String(m[k]))
    res.json({
      active: m.active === true,
      running: await isActive('mupi_mqtt'),
      name: str('name', 'MuPiBox'),
      broker: str('broker'),
      port: str('port', '1883'),
      topic: str('topic', 'mupibox'),
      clientId: str('clientId'),
      username: str('username'),
      hasPassword: str('password') !== '',
      refresh: Number(m.refresh ?? 10),
      refreshIdle: Number(m.refreshIdle ?? 60),
      timeout: Number(m.timeout ?? 60),
      haActive: m.ha_active === true,
      haTopic: str('ha_topic', 'homeassistant'),
    })
  })

  /** POST /api/app/mqtt - all fields; password only when not empty. mupi_mqtt reads them when it starts: restarted. */
  router.post('/mqtt', requireSession, requireCsrf, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const text = (k: string, max = 100, required = false): string | undefined => {
      const v = typeof b[k] === 'string' ? (b[k] as string).trim() : ''
      if (/[\p{Cc}]/u.test(v) || v.length > max || (required && !v)) return undefined
      return v
    }
    const num = (k: string, min: number, max: number) => {
      const n = Number(b[k])
      return Number.isInteger(n) && n >= min && n <= max ? n : undefined
    }
    const values = {
      active: b.active === true,
      name: text('name', 60, true),
      broker: text('broker', 253, b.active === true),
      port: num('port', 1, 65535),
      topic: text('topic', 100, true),
      clientId: text('clientId', 100, true),
      username: text('username'),
      refresh: num('refresh', 1, 90),
      refreshIdle: num('refreshIdle', 1, 90),
      timeout: num('timeout', 10, 180),
      ha_active: b.haActive === true,
      ha_topic: text('haTopic', 100, true),
    }
    const bad = Object.entries(values).find(([, v]) => v === undefined)
    if (bad) {
      res.status(400).json({ error: `invalid ${bad[0]}` })
      return
    }
    const password = typeof b.password === 'string' && b.password !== '' ? b.password : undefined
    if (password !== undefined && (password.length > 200 || /[\p{Cc}]/u.test(password))) {
      res.status(400).json({ error: 'invalid password' })
      return
    }
    // (numbers as text, as the admin interface stores them and mqtt.py reads them)
    await merge(deps, 'mqtt', {
      ...values,
      port: String(values.port),
      refresh: String(values.refresh),
      refreshIdle: String(values.refreshIdle),
      timeout: String(values.timeout),
      ...(password !== undefined ? { password } : {}),
    })
    if (values.active) {
      await run('sudo', ['systemctl', 'enable', 'mupi_mqtt'])
      await run('sudo', ['systemctl', 'restart', 'mupi_mqtt'])
    } else {
      await run('sudo', ['systemctl', 'stop', 'mupi_mqtt'])
      await run('sudo', ['systemctl', 'disable', 'mupi_mqtt'])
    }
    res.json({ ok: true, running: await isActive('mupi_mqtt') })
  })

  /** GET /api/app/wled - the settings, and the device with its presets when one answers on the serial port. */
  router.get('/wled', requireSession, async (_req, res) => {
    const w = section(deps, 'wled')
    const port = String(w.com_port ?? '')
    const baud = Number.parseInt(String(w.baud_rate ?? ''), 10)
    let device: Record<string, unknown> | null = null
    let presets: { id: string; name: string }[] = []
    if (/^\/dev\/tty[A-Za-z0-9]+$/.test(port) && baud > 0) {
      await run('sudo', ['python3', '/usr/local/bin/mupibox/wled_get_data.py', '-s', port, '-b', String(baud), '-j', '{"v":true}'], 15000)
      try {
        const info = JSON.parse(await fsp.readFile('/tmp/.wled.info.json', 'utf8')) as { info?: Record<string, unknown> }
        if (info.info?.ver) device = { name: info.info.name, ip: info.info.ip, version: info.info.ver }
        const p = JSON.parse(await fsp.readFile('/tmp/.wled.presets.json', 'utf8')) as Record<string, { n?: string }>
        presets = Object.entries(p)
          .filter(([id, v]) => id !== '0' && v && typeof v === 'object')
          .map(([id, v]) => ({ id, name: String(v.n ?? `Preset ${id}`) }))
      } catch {
        // no device answered
      }
    }
    res.json({
      active: w.active === true,
      port,
      baud: String(w.baud_rate ?? '115200'),
      mainId: String(w.main_id ?? ''),
      bootActive: w.boot_active === true,
      bootId: String(w.startup_id ?? ''),
      shutdownActive: w.shutdown_active === true,
      shutdownId: String(w.shutdown_id ?? ''),
      brightness: Number(w.brightness_default ?? 200),
      dimmed: Number(w.brightness_dimmed ?? 60),
      device,
      presets,
    })
  })

  /**
   * POST /api/app/wled - the settings. The start preset is stored in the device itself (its "LED settings", as
   * the admin interface does), when the device answered with its address.
   */
  router.post('/wled', requireSession, requireCsrf, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const BAUD = ['300', '1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']
    const id = (k: string) => (b[k] === '' || b[k] === undefined ? '' : /^\d{1,3}$/.test(String(b[k])) ? String(b[k]) : undefined)
    const bright = (k: string) => (Number.isInteger(Number(b[k])) && Number(b[k]) >= 0 && Number(b[k]) <= 255 ? String(Number(b[k])) : undefined)
    const values = {
      active: b.active === true,
      com_port: typeof b.port === 'string' && /^\/dev\/tty[A-Za-z0-9]+$/.test(b.port) ? b.port : undefined,
      baud_rate: BAUD.includes(String(b.baud)) ? String(b.baud) : undefined,
      main_id: id('mainId'),
      boot_active: b.bootActive === true,
      startup_id: id('bootId'),
      shutdown_active: b.shutdownActive === true,
      shutdown_id: id('shutdownId'),
      brightness_default: bright('brightness'),
      brightness_dimmed: bright('dimmed'),
    }
    const bad = Object.entries(values).find(([, v]) => v === undefined)
    if (bad) {
      res.status(400).json({ error: `invalid ${bad[0]}` })
      return
    }
    await merge(deps, 'wled', values)
    let device = false
    try {
      const info = JSON.parse(await fsp.readFile('/tmp/.wled.info.json', 'utf8')) as { info?: { ip?: string } }
      const ip = String(info.info?.ip ?? '')
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        const form = `BP=${values.startup_id}&CA=${values.brightness_default}${values.boot_active ? '&BO=on' : ''}`
        const r = await fetch(`http://${ip}/settings/leds`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(5000) })
        device = r.ok
      }
    } catch {
      // no device: the settings of the box are saved anyway
    }
    res.json({ ok: true, device })
  })
}
