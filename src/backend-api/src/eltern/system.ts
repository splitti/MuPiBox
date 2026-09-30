// System pages of the app: news, support infos, restarting parts of the box, logs, the player's debug log, the
// browser (Chromium) options and the language of the box - what the admin interface's start page, admin.php,
// backend.php and MuPi-Conf did.

import { execFile, spawn } from 'node:child_process'
import { writeFileSync, promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface SystemDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

function run(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

// In the background and out of this process' tree: a restart of this very process (pm2 restart server) must not be
// cut off by it
function detached(script: string): void {
  const child = spawn('sh', ['-c', `setsid sh -c '${script.replace(/'/g, `'\\''`)}' >/dev/null 2>&1 < /dev/null &`], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

const PM2 = 'PM2=$(command -v pm2 || echo /usr/local/bin/pm2); "$PM2"'
const PLAYER_CONFIG = '/home/dietpi/.mupibox/spotifycontroller-main/config/config.json'

// The logs and services the admin interface's log viewer offers (backend.php)
const LOGS: Record<string, string> = {
  'server-error': '/home/dietpi/.pm2/logs/server-error.log',
  'server-out': '/home/dietpi/.pm2/logs/server-out.log',
  'spotify-control-error': '/home/dietpi/.pm2/logs/spotify-control-error.log',
  'spotify-control-out': '/home/dietpi/.pm2/logs/spotify-control-out.log',
  shutdown_control: '/tmp/shutdown_control.log',
  idle_shutdown: '/tmp/idle_shutdown.log',
}
const SERVICES = [
  'mupi_autoconnect_bt',
  'mupi_autoconnect-wifi',
  'mupi_check_internet',
  'mupi_check_monitor',
  'mupi_fan',
  'mupi_hat_control',
  'mupi_hat',
  'mupi_idle_shutdown',
  'mupi_mqtt',
  'mupi_novnc',
  'mupi_rotary',
  'mupi_powerled',
  'mupi_splash',
  'mupi_startstop',
  'mupi_telegram',
  'mupi_vnc',
  'mupi_wifi',
  'pm2-dietpi',
  'wpa_supplicant',
  'proftpd',
  'smbd',
]

// Keys whose values never leave the box (support infos): tokens, passwords, ids of accounts and chats
const SECRET = /pass|token|secret|clientid|deviceid|username|chatid|account|hash|salt|fingerprint/i
function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SECRET.test(k) ? '(entfernt)' : withoutSecrets(v)
    return out
  }
  return value
}

let newsCache: { at: number; text: string } | undefined

// ---------- CPU, RAM and temperature over the last 24 hours (as the admin interface's rrd graphs, which kept 20 min) ----------
// Measured once a minute and kept in memory, and in /tmp (RAM as well, nothing on the SD card) every 5 minutes and
// when the process ends: an update of the backend keeps the history, a restart of the box starts it again.
// cpu: the share of the minute the CPUs were busy (from /proc/stat), ram: used share (MemAvailable), temp: °C.

type SystemSample = [at: number, temp: number | null, cpu: number | null, ram: number | null]
const SAMPLE_MS = 60_000
const KEEP_SAMPLES = 24 * 60
const samples: SystemSample[] = []
let lastCpu: { busy: number; total: number } | undefined
let sampler: ReturnType<typeof setInterval> | undefined
const KEPT_FILE = '/tmp/.mupibox-system-history.json'
const KEEP_EVERY = 5 // (samples: every 5 minutes)
let sinceKept = 0

function keepSamples(): void {
  try {
    writeFileSync(KEPT_FILE, JSON.stringify(samples))
  } catch {
    // no /tmp to write: the history lives on in memory
  }
}

// The history kept before this process started (see keepSamples); only the last 24 hours, only well-formed rows
async function readKeptSamples(): Promise<number> {
  try {
    const kept = JSON.parse(await fsp.readFile(KEPT_FILE, 'utf8'))
    if (!Array.isArray(kept)) return 0
    const from = Date.now() - KEEP_SAMPLES * SAMPLE_MS
    const first = samples[0]?.[0] ?? Number.POSITIVE_INFINITY
    const ok = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))
    const rows = kept.filter(
      (s): s is SystemSample =>
        Array.isArray(s) && s.length === 4 && typeof s[0] === 'number' && s[0] >= from && s[0] < first && ok(s[1]) && ok(s[2]) && ok(s[3]),
    )
    samples.unshift(...rows)
    return rows.length
  } catch {
    // nothing kept (the first start after a restart of the box)
    return 0
  }
}

async function cpuTimes(): Promise<{ busy: number; total: number } | undefined> {
  try {
    const line = (await fsp.readFile('/proc/stat', 'utf8')).split('\n')[0]
    const v = line.trim().split(/\s+/).slice(1).map(Number)
    if (v.length < 4 || v.some((n) => !Number.isFinite(n))) return undefined
    const idle = v[3] + (v[4] ?? 0) // idle + iowait
    const total = v.reduce((a, b) => a + b, 0)
    return { busy: total - idle, total }
  } catch {
    return undefined
  }
}

async function sampleSystem(): Promise<void> {
  let temp: number | null = null
  try {
    const milli = Number.parseInt((await fsp.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8')).trim(), 10)
    if (Number.isFinite(milli)) temp = Math.round(milli / 100) / 10
  } catch {
    // no thermal node
  }
  let ram: number | null = null
  try {
    const info = await fsp.readFile('/proc/meminfo', 'utf8')
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(info)?.[1])
    const total = kb('MemTotal')
    const available = kb('MemAvailable')
    if (total > 0 && Number.isFinite(available)) ram = Math.round(((total - available) / total) * 1000) / 10
  } catch {
    // no /proc (not Linux)
  }
  let cpu: number | null = null
  const now = await cpuTimes()
  if (now && lastCpu && now.total > lastCpu.total) cpu = Math.round(((now.busy - lastCpu.busy) / (now.total - lastCpu.total)) * 1000) / 10
  lastCpu = now
  samples.push([Date.now(), temp, cpu, ram])
  if (samples.length > KEEP_SAMPLES) samples.splice(0, samples.length - KEEP_SAMPLES)
  if (++sinceKept >= KEEP_EVERY) {
    sinceKept = 0
    keepSamples()
  }
}

function startSystemSampler(): void {
  if (sampler) return
  void cpuTimes().then((t) => {
    lastCpu = t
  })
  // (what was kept before; else the last 20 minutes of the box's rrd files)
  void readKeptSamples().then((kept) => (kept ? undefined : seedFromRrd()))
  // (process.exit in server.ts's SIGINT/SIGTERM handler: 'exit' still comes, writing has to be synchronous there)
  process.once('exit', keepSamples)
  // (a first CPU share soon after the start, not only after a minute)
  setTimeout(() => void sampleSystem(), 5000).unref()
  sampler = setInterval(() => void sampleSystem(), SAMPLE_MS)
  sampler.unref()
}

// After a restart of this process (every update of it) the box's own rrd files still hold the last 20 minutes of
// temperature and RAM (save_rrd.sh, cron): taken as the start, a minute apart (the CPU share is not in there)
async function seedFromRrd(): Promise<void> {
  const fetch = async (file: string): Promise<Map<number, number[]>> => {
    const out = new Map<number, number[]>()
    const r = await new Promise<string>((resolve) =>
      execFile('rrdtool', ['fetch', file, 'AVERAGE', '-s', '-20min', '-r', '60'], { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout) =>
        resolve(err ? '' : String(stdout)),
      ),
    )
    for (const line of r.split('\n')) {
      const m = /^(\d+):\s+(.+)$/.exec(line.trim())
      if (!m) continue
      const vals = m[2].split(/\s+/).map(Number)
      if (vals.every((v) => Number.isFinite(v))) out.set(Number(m[1]) * 1000, vals)
    }
    return out
  }
  const [temps, rams] = await Promise.all([fetch('/tmp/.rrd/cputemp.rrd'), fetch('/tmp/.rrd/ram.rrd')])
  const seeded: SystemSample[] = []
  for (const [at, [temp]] of temps) {
    const ram = rams.get(at)?.[0]
    // (one a minute, as the samples of this process)
    if (seeded.length && at - seeded[seeded.length - 1][0] < SAMPLE_MS) continue
    seeded.push([at, Math.round(temp * 10) / 10, null, ram !== undefined ? Math.round(ram * 10) / 10 : null])
  }
  // (only what is older than the first own sample)
  const first = samples[0]?.[0] ?? Number.POSITIVE_INFINITY
  samples.unshift(...seeded.filter((s) => s[0] < first))
}

/** The samples of the last `hours`, at most `points` of them (averages of equal slices when there are more), and
 *  how far apart they are meant to be (the app breaks its line only at a gap bigger than that). */
function systemHistory(hours: number, points = 240): { step: number; samples: SystemSample[] } {
  const from = Date.now() - hours * 3600e3
  const inRange = samples.filter((s) => s[0] >= from)
  if (inRange.length <= points) return { step: SAMPLE_MS, samples: inRange }
  const size = Math.ceil(inRange.length / points)
  const out: SystemSample[] = []
  for (let i = 0; i < inRange.length; i += size) {
    const slice = inRange.slice(i, i + size)
    const avg = (k: 1 | 2 | 3) => {
      const vals = slice.map((s) => s[k]).filter((v): v is number => v !== null)
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
    }
    out.push([slice[slice.length - 1][0], avg(1), avg(2), avg(3)])
  }
  return { step: size * SAMPLE_MS, samples: out }
}

const CACHE_SIZES = ['0', '8', '16', '32', '64', '128', '256', '512']

export function registerSystemRoutes(router: Router, deps: SystemDeps): void {
  startSystemSampler()

  /** GET /api/app/system-history?hours=1|6|24 - [time, temp °C, cpu %, ram %] a minute apart (fewer for 24 h). */
  router.get('/system-history', requireSession, (req, res) => {
    const hours = [1, 6, 24].includes(Number(req.query.hours)) ? Number(req.query.hours) : 1
    res.json({ hours, now: Date.now(), since: samples[0]?.[0] ?? null, ...systemHistory(hours) })
  })

  /** GET /api/app/version - the installed MuPiBox version (mupibox.version). */
  router.get('/version', requireSession, (_req, res) => {
    res.json({ version: String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.version ?? '') })
  })

  /** GET /api/app/news - the MuPiBox news (news.txt on GitHub), as text (the admin interface printed it as HTML). */
  router.get('/news', requireSession, async (_req, res) => {
    if (!newsCache || Date.now() - newsCache.at > 3600_000) {
      try {
        const r = await fetch('https://raw.githubusercontent.com/splitti/MuPiBox/main/news.txt', { signal: AbortSignal.timeout(8000) })
        if (r.ok) newsCache = { at: Date.now(), text: (await r.text()).slice(0, 100000) }
      } catch {
        // no internet: the last text, if any
      }
    }
    res.json({ text: newsCache?.text ?? null })
  })

  /**
   * GET /api/app/support-info - a zip for the support (Discord): the library, the config without secrets, the
   * monitor and network state, versions. As the admin interface's support_data.php, but the secrets are removed by
   * key (its line filter let multi-line values through).
   */
  router.get('/support-info', requireSession, async (_req, res) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mupibox-support-'))
    try {
      const server = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config'
      await fsp.copyFile(`${server}/data.json`, `${dir}/data.json`).catch(() => undefined)
      await fsp.writeFile(`${dir}/mupiboxconfig.json`, JSON.stringify(withoutSecrets(deps.getMupiboxConfig() ?? {}), null, 2))
      for (const f of ['monitor.json', 'network.json']) {
        try {
          const json = JSON.parse(await fsp.readFile(`${server}/${f}`, 'utf8')) as Record<string, unknown>
          delete json.mac
          await fsp.writeFile(`${dir}/${f}`, JSON.stringify(json, null, 2))
        } catch {
          // not there
        }
      }
      const osRelease = (await fsp.readFile('/etc/os-release', 'utf8').catch(() => '')).match(/^PRETTY_NAME=.*$/m)?.[0] ?? ''
      const model = (await fsp.readFile('/sys/firmware/devicetree/base/model', 'utf8').catch(() => '')).replace(/\0/g, '')
      const jq = await run('jq', ['--version'], 5000)
      const version = String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.version ?? '')
      await fsp.writeFile(`${dir}/mupi.info`, [osRelease, model, os.hostname(), os.arch(), `MuPiBox ${version}`, jq.stdout.trim()].join('\n'))
      const zip = `${dir}.zip`
      const z = await run('sh', ['-c', `cd '${dir}' && zip -q -r '${zip}' .`], 30000)
      if (!z.ok) {
        res.status(500).json({ error: 'zip failed' })
        return
      }
      res.download(zip, 'support_data.zip', () => {
        fsp.rm(zip, { force: true }).catch(() => undefined)
      })
    } finally {
      fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  /**
   * POST /api/app/restart {what} - display (Chromium kiosk), player (spotify-control) or services (player and this
   * backend, what the admin interface's "Restart services" should have done - its button called a script name with a
   * typo). Reboot and shutdown stay /api/reboot and /api/shutdown.
   */
  router.post('/restart', requireSession, requireCsrf, (req, res) => {
    const what = String((req.body as { what?: unknown } | undefined)?.what ?? '')
    const scripts: Record<string, string> = {
      display: 'sudo -i -u dietpi /usr/local/bin/mupibox/restart_kiosk.sh',
      player: `${PM2} restart spotify-control`,
      services: `sleep 1; ${PM2} restart spotify-control; ${PM2} restart server`,
    }
    if (!scripts[what]) {
      res.status(400).json({ error: 'what must be display, player or services' })
      return
    }
    detached(scripts[what])
    res.json({ ok: true })
  })

  /**
   * GET /api/app/logs - the logs and services that can be looked at, with the state of each service (states:
   * {name: active | inactive | failed | activating …}, from one systemctl call; missing when it cannot be read)
   */
  router.get('/logs', requireSession, async (_req, res) => {
    const r = await run('systemctl', ['is-active', ...SERVICES.map((s) => `${s}.service`)], 5000)
    const lines = r.stdout.split('\n')
    const states = Object.fromEntries(SERVICES.map((s, i) => [s, (lines[i] ?? '').trim()]).filter(([, st]) => st))
    res.json({ logs: Object.keys(LOGS), services: SERVICES, states })
  })

  /** GET /api/app/logs/view?kind=log|service&key=&grep=&lines= - the end of a log or the state of a service, as text. */
  router.get('/logs/view', requireSession, async (req, res) => {
    const kind = String(req.query.kind ?? 'log')
    const key = String(req.query.key ?? '')
    const grep = String(req.query.grep ?? '').slice(0, 100)
    const lines = Math.max(20, Math.min(2000, Number.parseInt(String(req.query.lines ?? '200'), 10) || 200))
    let text = ''
    if (kind === 'log' && LOGS[key] && grep) {
      // a search goes through the whole log, then its last lines (not only the last lines searched)
      const r = await run('grep', ['-i', '-F', '--', grep, LOGS[key]], 10000)
      const hits = r.stdout.split('\n').filter((l) => l !== '')
      res.type('text/plain; charset=utf-8').send(hits.slice(-lines).join('\n'))
      return
    }
    if (kind === 'log' && LOGS[key]) {
      const r = await run('tail', ['-n', String(lines), LOGS[key]], 10000)
      text = r.stdout
    } else if (kind === 'service' && SERVICES.includes(key)) {
      const r = await run('sudo', ['systemctl', 'status', `${key}.service`, '--no-pager', '-n', '40'], 10000)
      text = r.stdout
    } else {
      res.status(400).json({ error: 'unknown log or service' })
      return
    }
    if (grep) {
      const g = grep.toLowerCase()
      text = text
        .split('\n')
        .filter((l) => l.toLowerCase().includes(g))
        .join('\n')
    }
    res.type('text/plain; charset=utf-8').send(text)
  })

  /** GET/POST /api/app/controller-debug {on} - the player's debug log (its config.json logLevel), player restarts. */
  router.get('/controller-debug', requireSession, async (_req, res) => {
    const text = await fsp.readFile(PLAYER_CONFIG, 'utf8').catch(() => '')
    res.json({ on: /"logLevel"\s*:\s*"debug"/.test(text) })
  })
  router.post('/controller-debug', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') {
      res.status(400).json({ error: 'on must be true or false' })
      return
    }
    const from = on ? 'error' : 'debug'
    const to = on ? 'debug' : 'error'
    await run('sudo', ['sed', '-i', `s/"logLevel": "${from}"/"logLevel": "${to}"/g`, PLAYER_CONFIG])
    detached(`${PM2} restart spotify-control`)
    res.json({ ok: true })
  })

  /** GET/POST /api/app/browser - the kiosk's Chromium options (chromium-autostart.sh reads them at its start). */
  router.get('/browser', requireSession, (_req, res) => {
    const c = ((deps.getMupiboxConfig() as Record<string, unknown> | undefined)?.chromium ?? {}) as Record<string, unknown>
    res.json({ gpu: c.gpu === true, smooth: c.sccrollanimation === true, kiosk: c.kiosk !== false, cachesize: String(c.cachesize ?? '128'), debug: String(c.debug ?? '0') === '1' })
  })
  router.post('/browser', requireSession, requireCsrf, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const values: Record<string, unknown> = {}
    // (chromium-autostart.sh runs the booleans as commands and computes with the cache size: only true/false and
    // a size of the list go in - the admin interface stored the cache size unchecked)
    for (const [key, field] of [
      ['gpu', 'gpu'],
      ['smooth', 'sccrollanimation'],
      ['kiosk', 'kiosk'],
    ] as const) {
      if (b[key] === undefined) continue
      if (typeof b[key] !== 'boolean') return void res.status(400).json({ error: `${key} must be true or false` })
      values[field] = b[key]
    }
    if (b.cachesize !== undefined) {
      if (!CACHE_SIZES.includes(String(b.cachesize))) return void res.status(400).json({ error: 'invalid cachesize' })
      values.cachesize = String(b.cachesize)
    }
    if (b.debug !== undefined) {
      if (typeof b.debug !== 'boolean') return void res.status(400).json({ error: 'debug must be true or false' })
      values.debug = b.debug ? '1' : '0'
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.chromium = { ...((cfg.chromium as Record<string, unknown>) ?? {}), ...values }
    })
    if (b.restart === true) detached('sudo /usr/local/bin/mupibox/setting_update.sh; sudo -i -u dietpi /usr/local/bin/mupibox/restart_kiosk.sh')
    res.json({ ok: true, restarted: b.restart === true })
  })

  /**
   * POST /api/app/box-language {code} - the language of the box: the texts on the display (displayLanguage) and
   * the boot and maintenance pictures (mupibox.bootscreenLanguage) together; the pictures are made again.
   */
  router.post('/box-language', requireSession, requireCsrf, async (req, res) => {
    const code = String((req.body as { code?: unknown } | undefined)?.code ?? '')
    let languages: Record<string, unknown> = {}
    try {
      languages =
        (JSON.parse(await fsp.readFile('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/assets/i18n/display-texts.json', 'utf8')) as { languages?: Record<string, unknown> }).languages ?? {}
    } catch {
      languages = { en: {}, de: {} }
    }
    if (!/^[a-z]{2}(-[a-z]{2})?$/.test(code) || !(code in languages)) {
      res.status(400).json({ error: 'unknown language' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.displayLanguage = code
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), bootscreenLanguage: code }
    })
    const child = spawn('sudo', ['/usr/local/bin/mupibox/bootscreen_update.sh'], { detached: true, stdio: 'ignore' })
    child.on('error', () => undefined)
    child.unref()
    res.json({ ok: true })
  })
}
