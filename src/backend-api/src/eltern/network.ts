// Network options of the app (the admin interface's network.php and admin.php): onboard WiFi at boot, USB WiFi
// drivers and their power saving, DHCP timeout, WiFi watchdog, "best connection", restarting WiFi, renewing DHCP,
// control by IP. The LAN itself (on/off, DHCP/static) has its routes in server.ts (/api/network/ethernet*), the
// onboard radio's quick switch too (/api/network/onboard-wifi). The driver scripts are loaded from the official
// repository each time (as the admin interface and the updates do): they fetch the drivers from the internet anyway,
// and stay current without a new version of the box.

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface NetworkDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

function run(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

function detached(script: string): void {
  const child = spawn('sh', ['-c', `setsid sh -c '${script.replace(/'/g, `'\\''`)}' >/dev/null 2>&1 < /dev/null &`], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

const DRIVER_SCRIPTS = 'https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online'
const DRIVERS: Record<string, { label: string; module: string; path: string; script: string }> = {
  RTL88X2BU: { label: 'RTL88X2BU', module: '88x2bu', path: '/home/dietpi/.driver/network/88x2bu-20210702', script: 'rtl88x2bu' },
  RTL8821AU: { label: 'RTL8821AU', module: '8821au', path: '/home/dietpi/.driver/network/8821au-20210708', script: 'rtl8821au' },
}
const driverJobs: Record<string, { running: boolean; ok?: boolean; action?: string; headersMissing?: boolean }> = {}

async function exists(p: string): Promise<boolean> {
  return (await run('sudo', ['test', '-e', p], 5000)).ok
}
const ONBOARD_SCRIPT = '/usr/local/bin/mupibox/mupi_onboard_wifi.sh'
const enabled = async (unit: string) => (await run('systemctl', ['is-enabled', unit], 5000)).stdout.trim() === 'enabled'
const wifiIface = async () => (await run('/usr/local/bin/mupibox/mupi_wifi_iface.sh', [], 5000)).stdout.trim() || 'wlan0'

async function powerLevel(module: string): Promise<string | null> {
  const text = await fsp.readFile(`/etc/modprobe.d/${module}.conf`, 'utf8').catch(() => '')
  return new RegExp(`^options\\s+${module}\\b[^\\n]*\\brtw_power_mgnt=(\\d)`, 'm').exec(text)?.[1] ?? null
}

export function registerNetworkRoutes(router: Router, deps: NetworkDeps): void {
  router.get('/network-options', requireSession, async (_req, res) => {
    const configTxt = await fsp.readFile('/boot/config.txt', 'utf8').catch(() => '')
    const dhclient = await fsp.readFile('/etc/dhcp/dhclient.conf', 'utf8').catch(() => '')
    const radio = (await run(ONBOARD_SCRIPT, ['status'], 5000)).stdout.trim() // on | off | unavailable
    const bootDisabled = /^dtoverlay=disable-wifi\s*$/m.test(configTxt)
    const drivers = await Promise.all(
      Object.entries(DRIVERS).map(async ([id, d]) => ({ id, label: d.label, installed: await exists(d.path), power: await powerLevel(d.module), job: driverJobs[id] ?? { running: false } })),
    )
    res.json({
      // the onboard WiFi: on only when the chip is on at the start and its radio is on
      onboard: !bootDisabled && radio === 'on',
      onboardBootDisabled: bootDisabled,
      onboardRadio: radio,
      onboardIface: (await run('/usr/local/bin/mupibox/mupi_wifi_iface.sh', ['onboard'], 5000)).stdout.trim(),
      usbIface: (await run('/usr/local/bin/mupibox/mupi_wifi_iface.sh', ['usb'], 5000)).stdout.trim(),
      wifiIface: await wifiIface(),
      drivers,
      dhcpTimeout: /^timeout 10;/m.test(dhclient),
      wifiMonitor: await enabled('dietpi-wifi-monitor'),
      bestConnection: await enabled('mupi_autoconnect-wifi'),
      ipControl: ((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.ip_control_backend ?? false) === true,
    })
  })

  /** POST /api/app/network-options {key, value} */
  router.post('/network-options', requireSession, requireCsrf, async (req, res) => {
    const { key, value } = (req.body ?? {}) as { key?: unknown; value?: unknown }
    const on = value === true
    let r: { ok: boolean } = { ok: false }
    let rebootNeeded = false
    switch (key) {
      case 'onboard': {
        // one switch for both ways the box knows: the chip at the start (dtoverlay=disable-wifi, the admin
        // interface's switch) and its radio now (rfkill, the display's switch). Off takes effect at once; on too,
        // unless the chip was switched off at the start - then only after a restart.
        if (!on) await run('sudo', [ONBOARD_SCRIPT, 'off'], 10000)
        r = await run('sudo', ['/usr/local/bin/mupibox/set_onboard_wifi.sh', on ? 'on' : 'off'], 60000)
        if (on) {
          if ((await run(ONBOARD_SCRIPT, ['status'], 5000)).stdout.trim() === 'unavailable') rebootNeeded = true
          else await run('sudo', [ONBOARD_SCRIPT, 'on'], 10000)
        }
        break
      }
      case 'dhcpTimeout':
        r = await run('sudo', ['sed', '-i', on ? 's/#timeout 60;/timeout 10;/g' : 's/timeout 10;/#timeout 60;/g', '/etc/dhcp/dhclient.conf'])
        break
      case 'wifiMonitor':
        r = await run('sudo', ['systemctl', on ? 'enable' : 'disable', '--now', 'dietpi-wifi-monitor'])
        break
      case 'bestConnection':
        r = await run('sudo', ['systemctl', on ? 'enable' : 'disable', '--now', 'mupi_autoconnect-wifi'])
        break
      case 'ipControl':
        // the backend's address for the player: its config.json is written by setting_update.sh and read at the start
        await deps.updateMupiboxConfig((cfg) => {
          cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), ip_control_backend: on }
        })
        detached('sudo /usr/local/bin/mupibox/setting_update.sh; sleep 1; PM2=$(command -v pm2 || echo /usr/local/bin/pm2); "$PM2" restart server')
        r = { ok: true }
        break
      default:
        res.status(400).json({ error: 'unknown option' })
        return
    }
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, rebootNeeded })
  })

  /** POST /api/app/usb-wifi-power {driver, level} - power saving of a USB WiFi driver (0 off, 1 minimal, 2 max). */
  router.post('/usb-wifi-power', requireSession, requireCsrf, async (req, res) => {
    const { driver, level } = (req.body ?? {}) as { driver?: unknown; level?: unknown }
    const d = DRIVERS[String(driver)]
    if (!d || !['0', '1', '2'].includes(String(level))) {
      res.status(400).json({ error: 'invalid driver or level' })
      return
    }
    const conf = `/etc/modprobe.d/${d.module}.conf`
    const text = await fsp.readFile(conf, 'utf8').catch(() => '')
    const lines = text.split('\n').filter((l, i, all) => l !== '' || i < all.length - 1)
    const idx = lines.findIndex((l) => new RegExp(`^options\\s+${d.module}\\b`).test(l))
    if (idx < 0) lines.push(`options ${d.module} rtw_power_mgnt=${level}`)
    else if (/\brtw_power_mgnt=\d+/.test(lines[idx])) lines[idx] = lines[idx].replace(/\brtw_power_mgnt=\d+/, `rtw_power_mgnt=${level}`)
    else lines[idx] = `${lines[idx]} rtw_power_mgnt=${level}`
    const tmp = `/tmp/.mupibox-modprobe-${process.pid}.conf`
    await fsp.writeFile(tmp, `${lines.join('\n')}\n`)
    const r = await run('sudo', ['install', '-m', '644', '-o', 'root', '-g', 'root', tmp, conf])
    await fsp.unlink(tmp).catch(() => undefined)
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, rebootNeeded: true })
  })

  /**
   * POST /api/app/usb-wifi-driver {driver, action: install|remove} - builds or removes the driver (minutes: kernel
   * headers, compiling), in the background; GET /network-options shows the job.
   */
  router.post('/usb-wifi-driver', requireSession, requireCsrf, async (req, res) => {
    const { driver, action } = (req.body ?? {}) as { driver?: unknown; action?: unknown }
    const d = DRIVERS[String(driver)]
    if (!d || (action !== 'install' && action !== 'remove')) {
      res.status(400).json({ error: 'invalid driver or action' })
      return
    }
    if (Object.values(driverJobs).some((j) => j.running)) {
      res.status(409).json({ error: 'a driver job is running' })
      return
    }
    // the script from the official repository, current (a shell script, else it is not run)
    let text = ''
    try {
      const r = await fetch(`${DRIVER_SCRIPTS}/${action}_${d.script}.sh`, { signal: AbortSignal.timeout(20000) })
      if (r.ok) text = await r.text()
    } catch {
      // no internet
    }
    if (!text.startsWith('#!/bin/bash')) {
      res.status(502).json({ error: 'driver script not loaded (no internet?)' })
      return
    }
    const script = path.join(os.tmpdir(), `mupibox-driver-${action}-${d.script}.sh`)
    await fsp.writeFile(script, text.split('\r').join(''), { mode: 0o644 })
    const job: { running: boolean; ok?: boolean; action?: string; headersMissing?: boolean } = { running: true, action: action as string }
    driverJobs[String(driver)] = job
    await run('sudo', ['rm', '-f', '/tmp/driver-install.txt'], 5000)
    // as the admin interface: run by dietpi, from its home
    const child = spawn('sudo', ['su', 'dietpi', '-c', `cd && bash '${script}'`], { stdio: 'ignore' })
    child.on('error', () => Object.assign(job, { running: false, ok: false }))
    child.on('exit', async (code) => {
      // the install script leaves this file when the kernel headers are missing
      const headersMissing = action === 'install' && (await exists('/tmp/driver-install.txt'))
      Object.assign(job, { running: false, ok: code === 0 && !headersMissing, headersMissing })
      // the install script ends the display (chromium) and shows the maintenance screen
      if (action === 'install') detached('sudo -i -u dietpi /usr/local/bin/mupibox/restart_kiosk.sh')
    })
    res.json({ ok: true, started: true })
  })

  /** POST /api/app/wifi/restart and /dhcp/renew - as the admin interface (the WiFi is gone for a moment). */
  router.post('/wifi/restart', requireSession, requireCsrf, async (_req, res) => {
    const iface = await wifiIface()
    detached(`sleep 1; sudo service ifup@${iface} stop; sudo service ifup@${iface} start`)
    res.json({ ok: true })
  })
  router.post('/dhcp/renew', requireSession, requireCsrf, async (_req, res) => {
    const iface = await wifiIface()
    detached(`sleep 1; sudo dhclient -r; sudo service ifup@${iface} stop; sudo service ifup@${iface} start; sudo dhclient`)
    res.json({ ok: true })
  })
}
