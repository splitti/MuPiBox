// The admin interface's system settings in the app: system options (/boot/config.txt, DietPi, fstab), hostname,
// the JSON editor, resetting, backup and restore, "apply settings". Whoever is signed in may do all of it (no second
// password, decided on 29.09.2026). The commands are the admin interface's; what it fetched live from the upstream
// repository (the templates for resetting) comes from the installed version now (templates/ next to server.js).

import { execFile, spawn } from 'node:child_process'
import { createWriteStream, promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { withLock } from '../file-lock'
import { requireCsrf, requireSession } from './middleware'

export interface AdminDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** The folder of server.js (templates/ lies next to it). */
  serverDir: string
}

function run(cmd: string, args: string[], timeoutMs = 60000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout ?? '', stderr: stderr ?? '' }))
  })
}

// out of this process' tree (restarts of this very process, the reboot)
function detached(script: string): void {
  const child = spawn('sh', ['-c', `setsid sh -c '${script.replace(/'/g, `'\\''`)}' >/dev/null 2>&1 < /dev/null &`], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

const rebootSoon = () => detached('( flock -n 9 || exit 0; sleep 5; sudo /usr/local/bin/mupibox/restart.sh ) 9>/tmp/.mupibox.reboot.lock')
const dietpiInject = (key: string, line: string, file: string) =>
  run('sudo', ['su', '-', 'dietpi', '-c', `. /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT '${key}' '${line}' ${file}`], 60000)

const SERVER_CONFIG = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config'
const JSON_FILES: Record<string, string> = {
  mupiboxconfig: '/etc/mupibox/mupiboxconfig.json',
  data: `${SERVER_CONFIG}/data.json`,
  config: `${SERVER_CONFIG}/config.json`,
  resume: `${SERVER_CONFIG}/resume.json`,
  monitor: `${SERVER_CONFIG}/monitor.json`,
  offline_resume: `${SERVER_CONFIG}/offline_resume.json`,
  offline_monitor: `${SERVER_CONFIG}/offline_monitor.json`,
}

// What a backup holds (the admin interface's backup.php / fullbackup.php) and what a restore may write
const BACKUP_FILES = ['/etc/mupibox/mupiboxconfig.json', `${SERVER_CONFIG}/data.json`]
// Kept free on the SD card by a restore (the box itself needs room to run)
const RESERVE_BYTES = 512 * 1024 * 1024
const freeBytes = async (dir: string) => {
  const st = await fsp.statfs(dir).catch(() => null)
  return st ? Math.max(0, st.bavail * st.bsize - RESERVE_BYTES) : 0
}

const RESTORE_FILES = ['etc/mupibox/mupiboxconfig.json', 'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json']
const RESTORE_DIRS = [
  'etc/',
  'etc/mupibox/',
  'home/',
  'home/dietpi/',
  'home/dietpi/MuPiBox/',
  'home/dietpi/.mupibox/',
  'home/dietpi/.mupibox/Sonos-Kids-Controller-master/',
  'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/',
  'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/',
]
// file types the web server runs or a browser runs as a page: never restored below media/ (see admin.php)
const FORBIDDEN_MEDIA = /(\.(php\d?|phtml|phar|pht|pl|py|cgi|fcgi|sh|shtml|s?html?|xhtml|xht|svgz?|js|mjs|xml|xsl)|\/\.htaccess|\/\.user\.ini)$/i

const HOSTNAME = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

async function readText(file: string): Promise<string> {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch {
    const r = await run('sudo', ['cat', file], 10000)
    return r.ok ? r.stdout : ''
  }
}

// Writes a file as root, keeping its owner and mode (as the admin interface's JSON editor). Put next to the target
// and renamed over it: install replaced the file in place, a reader could see it half written.
async function installAs(target: string, content: string): Promise<boolean> {
  const st = await run('sudo', ['stat', '-c', '%a %U %G', target], 10000)
  const [mode, owner, group] = st.ok ? st.stdout.trim().split(' ') : ['644', 'dietpi', 'dietpi']
  const tmp = `/tmp/.mupibox-app-${process.pid}-${Date.now()}.json`
  const next = `${target}.app-${process.pid}.tmp`
  await fsp.writeFile(tmp, content)
  const r = await run('sudo', ['install', '-m', mode, '-o', owner, '-g', group, tmp, next], 20000)
  await fsp.unlink(tmp).catch(() => undefined)
  const moved = r.ok && (await run('sudo', ['mv', '-f', next, target], 20000)).ok
  if (!moved) await run('sudo', ['rm', '-f', next])
  return moved
}

// The library's lock, the one the backend and the scripts take (file-lock.ts): the JSON editor, the library reset and
// "Update settings" wrote data.json while the Smart-Sync or the media scan did, and one of the two changes was lost.
const DATA_LOCK = '/tmp/.data.lock'
const withDataLock = <T>(work: () => Promise<T>) => withLock(DATA_LOCK, 'app admin', work)

let restoreRunning = false

// Secrets of the box config in the JSON editor: the value stands there as HIDDEN (only strings; not the dates and lists
// that share the name, e.g. tokenUpdatedAt, tokenScopes)
const HIDDEN = '(verborgen)'
const SECRET_KEY = /pass|token|secret|hash|salt/i
const NOT_SECRET = /(At|Scopes|Configured)$/

function hideSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideSecrets)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === 'string' && v !== '' && SECRET_KEY.test(k) && !NOT_SECRET.test(k) ? HIDDEN : hideSecrets(v)
    }
    return out
  }
  return value
}

function putSecretsBack(edited: unknown, stored: unknown): unknown {
  if (Array.isArray(edited)) return edited.map((v, i) => putSecretsBack(v, Array.isArray(stored) ? stored[i] : undefined))
  if (edited && typeof edited === 'object') {
    const from = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(edited)) out[k] = v === HIDDEN && k in from ? from[k] : putSecretsBack(v, from[k])
    return out
  }
  return edited
}

export function registerAdminRoutes(router: Router, deps: AdminDeps): void {
  /* ---- system options ---- */

  router.get('/system-options', requireSession, async (_req, res) => {
    const configTxt = await readText('/boot/config.txt')
    const dietpiTxt = await readText('/boot/dietpi.txt')
    const governors = (await readText('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors')).trim().split(/\s+/).filter(Boolean)
    const waitNet = (await run('sudo', ['test', '-f', '/etc/systemd/system/dietpi-postboot.service.d/dietpi.conf'], 5000)).ok
    const pm2 = ((deps.getMupiboxConfig() as Record<string, unknown> | undefined)?.pm2 ?? {}) as Record<string, unknown>
    res.json({
      ocSd: /^dtoverlay=sdtweak,overclock_50=100$/m.test(configTxt),
      pm2Ram: Number(pm2.ramlog) === 1,
      waitNet,
      turbo: Number(/^initial_turbo=(\d+)/m.exec(configTxt)?.[1] ?? 0) > 0,
      noWarn: /^avoid_warnings=1$/m.test(configTxt),
      swap: Number(/^AUTO_SETUP_SWAPFILE_SIZE=(-?\d+)/m.exec(dietpiTxt)?.[1] ?? 0) !== 0,
      governor: /^CONFIG_CPU_GOVERNOR=(\S+)/m.exec(dietpiTxt)?.[1] ?? '',
      governors,
    })
  })

  /** POST /api/app/system-options {key, value} - one option; most need a restart of the box to take effect. */
  router.post('/system-options', requireSession, requireCsrf, async (req, res) => {
    const { key, value } = (req.body ?? {}) as { key?: unknown; value?: unknown }
    const on = value === true
    let r: { ok: boolean } = { ok: false }
    switch (key) {
      case 'ocSd':
        r = on
          ? await run('sudo', ['sh', '-c', "grep -qx 'dtoverlay=sdtweak,overclock_50=100' /boot/config.txt || echo 'dtoverlay=sdtweak,overclock_50=100' >> /boot/config.txt"])
          : await run('sudo', ['sed', '-i', '/^dtoverlay=sdtweak,overclock_50=100$/d', '/boot/config.txt'])
        break
      case 'noWarn':
        r = on
          ? await run('sudo', ['sh', '-c', "grep -qx 'avoid_warnings=1' /boot/config.txt || echo 'avoid_warnings=1' >> /boot/config.txt"])
          : await run('sudo', ['sed', '-i', '/^avoid_warnings=1$/d', '/boot/config.txt'])
        break
      case 'turbo':
        r = await dietpiInject('initial_turbo', `initial_turbo=${on ? 30 : 0}`, '/boot/config.txt')
        break
      case 'waitNet':
        r = await run('sudo', ['/boot/dietpi/func/dietpi-set_software', 'boot_wait_for_network', on ? '1' : '0'], 60000)
        break
      case 'swap':
        r = await run('sudo', ['/boot/dietpi/func/dietpi-set_swapfile', on ? '1' : '0'], 300000)
        break
      case 'pm2Ram': {
        // the pm2 logs in RAM (tmpfs in /etc/fstab, as the admin interface writes it); the line is only added once
        const fstab = await readText('/etc/fstab')
        const has = /\/home\/dietpi\/\.pm2\/logs/.test(fstab)
        if (on && !has) {
          r = await run('sudo', ['sh', '-c', "sed '/^tmpfs \\/var\\/log.*/a tmpfs /home/dietpi/.pm2/logs tmpfs size=50M,noatime,lazytime,nodev,nosuid,mode=1777' /etc/fstab > /tmp/.fstab && grep -q '^tmpfs /home/dietpi/.pm2/logs ' /tmp/.fstab && mv /tmp/.fstab /etc/fstab"])
        } else if (!on && has) {
          r = await run('sudo', ['sh', '-c', "sed '/\\/home\\/dietpi\\/.pm2\\/logs/d' /etc/fstab > /tmp/.fstab && [ -s /tmp/.fstab ] && mv /tmp/.fstab /etc/fstab"])
        } else r = { ok: true }
        if (r.ok) {
          await deps.updateMupiboxConfig((cfg) => {
            cfg.pm2 = { ...((cfg.pm2 as Record<string, unknown>) ?? {}), ramlog: on ? 1 : 0 }
          })
        }
        break
      }
      case 'governor': {
        const available = (await readText('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors')).trim().split(/\s+/)
        if (typeof value !== 'string' || !available.includes(value)) {
          res.status(400).json({ error: 'unknown governor' })
          return
        }
        r = await dietpiInject('CONFIG_CPU_GOVERNOR=', `CONFIG_CPU_GOVERNOR=${value}`, '/boot/dietpi.txt')
        if (r.ok) r = await run('sudo', ['/boot/dietpi/func/dietpi-set_cpu'], 60000)
        // (a failure is an error the app shows, not "saved")
        res.status(r.ok ? 200 : 500).json({ ok: r.ok, rebootNeeded: false })
        return
      }
      default:
        res.status(400).json({ error: 'unknown option' })
        return
    }
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, rebootNeeded: true })
  })

  /* ---- experts ---- */

  /** POST /api/app/hostname {host} - the box's name in the network (DietPi's change_hostname); restart needed. */
  router.post('/hostname', requireSession, requireCsrf, async (req, res) => {
    const host = String((req.body as { host?: unknown } | undefined)?.host ?? '')
    if (!HOSTNAME.test(host)) {
      res.status(400).json({ error: 'invalid hostname' })
      return
    }
    const r = await run('sudo', ['/boot/dietpi/func/change_hostname', host], 60000)
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), host }
    })
    detached('sudo /usr/local/bin/mupibox/setting_update.sh; sudo su dietpi -c /usr/local/bin/mupibox/set_hostname.sh')
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, rebootNeeded: true })
  })

  /** GET /api/app/json-file?key= - one of the files of the admin interface's JSON editor, as text. */
  router.get('/json-file', requireSession, async (req, res) => {
    const key = String(req.query.key ?? '')
    const file = JSON_FILES[key]
    if (!file) {
      res.status(400).json({ error: 'unknown file' })
      return
    }
    let text = await readText(file)
    // The box config's secrets (tokens, passwords, the password's hash) do not go to the browser - the app hides them
    // everywhere else as well. They show as HIDDEN and are put back on saving when they come back unchanged.
    if (key === 'mupiboxconfig') {
      try {
        text = `${JSON.stringify(hideSecrets(JSON.parse(text)), null, 2)}\n`
      } catch {
        // not readable as JSON: shown as it is, the editor says so
      }
    }
    res.json({ keys: Object.keys(JSON_FILES), text })
  })

  /**
   * POST /api/app/json-file {key, text} - saves it when it is valid JSON. The box config goes through the config's
   * lock (the admin interface's editor wrote past it); its login (interfacelogin) is kept from the disk, as there.
   */
  router.post('/json-file', requireSession, requireCsrf, async (req, res) => {
    const { key, text } = (req.body ?? {}) as { key?: unknown; text?: unknown }
    const file = JSON_FILES[String(key ?? '')]
    if (!file || typeof text !== 'string') {
      res.status(400).json({ error: 'unknown file' })
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      res.status(400).json({ error: `invalid JSON: ${(err as Error).message}` })
      return
    }
    if (key === 'mupiboxconfig') {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        res.status(400).json({ error: 'the config must be an object' })
        return
      }
      await deps.updateMupiboxConfig((cfg) => {
        const login = cfg.interfacelogin
        // (the hidden secrets back from the config as it is)
        const merged = putSecretsBack(parsed, structuredClone(cfg)) as Record<string, unknown>
        for (const k of Object.keys(cfg)) delete cfg[k]
        Object.assign(cfg, merged)
        if (login !== undefined) cfg.interfacelogin = login
      })
      res.json({ ok: true })
      return
    }
    const write = () => installAs(file, `${JSON.stringify(parsed, null, 2)}\n`)
    const done = file === JSON_FILES.data ? await withDataLock(write) : await write()
    if (done === 'locked') {
      res.status(409).json({ error: 'busy' })
      return
    }
    res.status(done ? 200 : 500).json({ ok: done })
  })

  /**
   * POST /api/app/reset {what} - config (the box config from the installed template: the login stays), library
   * (data.json empty, the daily backups stay), server (the backend's config.json from the template).
   */
  router.post('/reset', requireSession, requireCsrf, async (req, res) => {
    const what = String((req.body as { what?: unknown } | undefined)?.what ?? '')
    const templates = path.join(deps.serverDir, 'templates')
    if (what === 'config') {
      let template: Record<string, unknown>
      try {
        template = JSON.parse(await fsp.readFile(path.join(templates, 'mupiboxconfig.json'), 'utf8')) as Record<string, unknown>
      } catch {
        res.status(500).json({ error: 'template missing' })
        return
      }
      await deps.updateMupiboxConfig((cfg) => {
        const login = cfg.interfacelogin
        // (what the template cannot know stays: the installed version - else no update is found and "Über" shows
        // none - and the box's name in the network, which the system keeps anyway)
        const mb = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
        const keep = { version: mb.version, host: mb.host }
        for (const k of Object.keys(cfg)) delete cfg[k]
        Object.assign(cfg, template)
        if (login !== undefined) cfg.interfacelogin = login
        const fresh = (cfg.mupibox as Record<string, unknown> | undefined) ?? {}
        for (const [k, v] of Object.entries(keep)) if (typeof v === 'string' && v) fresh[k] = v
        cfg.mupibox = fresh
      })
      detached('sudo /usr/local/bin/mupibox/setting_update.sh')
      res.json({ ok: true, rebootNeeded: true })
      return
    }
    if (what === 'library') {
      const done = await withDataLock(async () => {
        await run('sudo', ['rm', '-f', `${SERVER_CONFIG}/offline_data.json`])
        return installAs(`${SERVER_CONFIG}/data.json`, '[]\n')
      })
      if (done === 'locked') {
        res.status(409).json({ error: 'busy' })
        return
      }
      res.status(done ? 200 : 500).json({ ok: done })
      return
    }
    if (what === 'server') {
      let text: string
      try {
        text = await fsp.readFile(path.join(templates, 'www.json'), 'utf8')
        JSON.parse(text)
      } catch {
        res.status(500).json({ error: 'template missing' })
        return
      }
      const ok = await installAs(`${SERVER_CONFIG}/config.json`, text)
      // the host name into it, and the backend reads it at its start
      detached('sudo su dietpi -c /usr/local/bin/mupibox/set_hostname.sh; PM2=$(command -v pm2 || echo /usr/local/bin/pm2); "$PM2" restart server')
      res.status(ok ? 200 : 500).json({ ok })
      return
    }
    res.status(400).json({ error: 'what must be config, library or server' })
  })

  /** POST /api/app/apply-settings - the admin interface's "Update settings": old playlist entries, setting_update.sh. */
  router.post('/apply-settings', requireSession, requireCsrf, async (_req, res) => {
    try {
      await withDataLock(async () => {
        const data = JSON.parse(await readText(`${SERVER_CONFIG}/data.json`)) as unknown
        if (!Array.isArray(data)) return
        let changed = false
        for (const item of data as Record<string, unknown>[]) {
          if (item && item.category === 'playlist') {
            item.category = 'music'
            item.playlistid = item.id ?? ''
            delete item.id
            changed = true
          }
        }
        if (changed) await installAs(`${SERVER_CONFIG}/data.json`, JSON.stringify(data, null, 4))
      })
    } catch {
      // an unreadable data.json stays as it is
    }
    detached('sudo /usr/local/bin/mupibox/setting_update.sh; sudo -i -u dietpi /usr/local/bin/mupibox/restart_kiosk.sh')
    res.json({ ok: true })
  })

  /* ---- backup ---- */

  /** GET /api/app/backup?kind=config|full - a zip of the config, the library and the covers (full: all media). */
  router.get('/backup', requireSession, async (req, res) => {
    const full = req.query.kind === 'full'
    const zip = `/var/tmp/mupibox-backup-${process.pid}-${Date.now()}.zip`
    const sources = full ? ['/home/dietpi/MuPiBox/media', ...BACKUP_FILES] : ['/home/dietpi/MuPiBox/media/cover', ...BACKUP_FILES]
    const r = await run('sudo', ['sh', '-c', `zip -q -r '${zip}' ${sources.map((s) => `'${s}'`).join(' ')}; chmod 644 '${zip}'`], full ? 3600000 : 120000)
    const exists = await fsp.stat(zip).then(() => true, () => false)
    if (!exists) {
      res.status(500).json({ error: `zip failed ${r.stderr.slice(0, 200)}` })
      return
    }
    const date = new Date().toISOString().slice(0, 10)
    res.download(zip, `mupibox_${full ? 'full' : 'config'}_backup_${date}.zip`, () => {
      run('sudo', ['rm', '-f', zip]).catch(() => undefined)
    })
  })

  /**
   * PUT /api/app/backup/restore - body: a backup zip. Every entry is checked against what a backup holds (the
   * admin interface's whitelist: the two files, and below media/ folders and no file types a server or browser runs,
   * no symbolic links, no ".."); then it is unpacked as root, the config brought up to date, and the box restarts.
   */
  router.put('/backup/restore', requireSession, requireCsrf, async (req, res) => {
    const file = `/var/tmp/mupibox-restore-${process.pid}-${Date.now()}.zip`
    // the upload may not fill the SD card: at most what is free there, less a reserve for the box itself
    const room = await freeBytes('/var/tmp')
    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        done(received > room ? new Error('too_large') : null, chunk)
      },
    })
    try {
      await pipeline(req, limit, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
    } catch (err) {
      await fsp.unlink(file).catch(() => undefined)
      if ((err as Error).message === 'too_large') res.status(413).json({ error: 'not_enough_space' })
      else res.status(400).json({ error: 'upload failed' })
      return
    }
    const cleanup = () => fsp.unlink(file).catch(() => undefined)
    // (sent as a form, the body is gone: nothing to check)
    if (((await fsp.stat(file).catch(() => null))?.size ?? 0) === 0) {
      await cleanup()
      res.status(400).json({ error: 'empty upload (Content-Type application/zip)' })
      return
    }
    const list = await run('zipinfo', [file], 60000)
    if (!list.ok) {
      await cleanup()
      res.status(400).json({ error: 'not a zip file' })
      return
    }
    // Every entry has to be understood, else nothing is unpacked: a line that did not match used to be skipped - and
    // unzip then put it wherever it named, as root (e.g. an entry of a Windows zip, a link or a device).
    //   header: "Zip file size: 700 bytes, number of entries: 6"
    //   entries: "-rw-r--r--  3.0 unx  13218 tx defN 26-Sep-28 22:17 path" (Unix: files and folders only)
    //            "-rw-a--     2.0 fat     18 b- stor 25-Sep-01 00:00 path" (Windows/DOS: no links there)
    //   end: "6 files, 22 bytes uncompressed, 22 bytes compressed:  0.0%"
    const lines = list.stdout.split('\n').filter((l) => l.trim() !== '')
    const entries = Number(/number of entries: (\d+)/.exec(lines[1] ?? '')?.[1] ?? NaN)
    const unpacked = Number(/^\d+ files?, (\d+) bytes uncompressed/.exec(lines[lines.length - 1] ?? '')?.[1] ?? NaN)
    let bad = ''
    let count = 0
    const files: { name: string; size: number }[] = []
    for (const line of lines.slice(2, -1)) {
      const m =
        /^([-d])[rwxsStT-]{9}\s+\S+\s+unx\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s(.+)$/.exec(line) ??
        /^([-d])[rwxahs-]{6}\s+\S+\s+(?:fat|ntf|hpf)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s(.+)$/.exec(line)
      if (!m) {
        bad = line.slice(0, 120)
        break
      }
      count++
      const type = m[1]
      const name = m[3].replace(/^\/+/, '')
      const isDir = type === 'd' || name.endsWith('/')
      const inMedia = name.startsWith('home/dietpi/MuPiBox/media/')
      const allowed =
        !name.includes('..') &&
        !name.includes('\\') &&
        (RESTORE_FILES.includes(name) || (isDir && (RESTORE_DIRS.includes(name) || inMedia)) || (!isDir && inMedia && !FORBIDDEN_MEDIA.test(name)))
      if (!allowed) {
        bad = name
        break
      }
      if (!isDir) files.push({ name, size: Number(m[2]) })
    }
    if (bad || count === 0 || count !== entries) {
      await cleanup()
      res.status(400).json({ error: 'entry_not_allowed', entry: bad || (count === 0 ? '(leer)' : '(unbekannte Einträge)') })
      return
    }
    // Unpacked it has to fit on the card as well. unzip goes entry by entry: a file it replaces frees its room only
    // when its own entry comes, so each entry counts with what it adds (the room of all replaced files counted up
    // front let a big new file come first and fill the card). One restore at a time, else both count the same room.
    if (restoreRunning) {
      await cleanup()
      res.status(409).json({ error: 'restore_running' })
      return
    }
    restoreRunning = true
    let need = 0
    const seen = new Set<string>()
    for (const { name, size } of files) {
      const st = seen.has(name) ? null : await fsp.lstat(`/${name}`).catch(() => null)
      seen.add(name)
      need += Math.max(0, size - (st?.isFile() ? st.size : 0))
    }
    if (!Number.isFinite(unpacked) || need > (await freeBytes('/'))) {
      restoreRunning = false
      await cleanup()
      res.status(413).json({ error: 'not_enough_space' })
      return
    }
    const version = String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.version ?? '')
    const unzip = await run('sudo', ['unzip', '-o', file, '-d', '/'], 3600000).finally(() => {
      restoreRunning = false
    })
    await cleanup()
    if (!unzip.ok) {
      res.status(500).json({ error: 'unzip failed' })
      return
    }
    // the restored config brought up to the installed version (as the admin interface), its version kept
    await run('sudo', ['/usr/local/bin/mupibox/conf_update.sh'], 300000)
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), version }
    })
    const host = String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.host ?? '')
    if (HOSTNAME.test(host)) await run('sudo', ['/boot/dietpi/func/change_hostname', host], 60000)
    await run('sudo', ['su', 'dietpi', '-c', '/usr/local/bin/mupibox/set_hostname.sh'], 30000)
    rebootSoon()
    res.json({ ok: true, reboot: true })
  })
}
