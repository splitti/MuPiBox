// Settings of the box display that only the admin interface could change (MuPi-Conf, admin.php): the view of the
// cover flow, the categories and hold times on the display, resolution, brightness, rotation, the reading-aloud
// language, the custom theme's background picture, and a look at the display (screenshot, VNC).
//
// The display reads most of these only when a page is loaded: the admin interface restarted the whole kiosk for every
// save (several seconds black). Here the display page is reloaded instead (player /display/reload-page, picked up
// by the display within a few seconds), which keeps playback running.

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { imageSize } from './covers'
import { requireCsrf, requireSession } from './middleware'
import { episodeStateSettings } from '../episode-state'
import { applyNightDim, nightDimmed, nightDimOf, parseNightDim } from './night-dim'

export interface DisplayDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const CATEGORIES = ['audiobook', 'music', 'nas', 'other']
const ROTATIONS: Record<string, string[]> = {
  display_hdmi_rotate: ['0', '1', '2', '3', '0x10000', '0x20000'],
  lcd_rotate: ['0', '2'],
  display_lcd_rotate: ['0', '2'],
}
const BACKGROUND = '/home/dietpi/MuPiBox/themes/custom-bg.jpg'
const SCREENSHOT = '/tmp/mupibox-app-screenshot.png'

function run(cmd: string, args: string[], timeoutMs = 15000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

// In the background: what takes a while or restarts something must not hold the answer
function detached(script: string): void {
  const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

/** Asks the display to load its page again (it then reads the changed settings); false when the player did not answer. */
export async function reloadDisplayPage(): Promise<boolean> {
  try {
    const r = await fetch('http://127.0.0.1:5005/display/reload-page', { method: 'POST', signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

async function readBrightness(): Promise<number | null> {
  try {
    const dir = (await fsp.readdir('/sys/class/backlight'))[0]
    if (!dir) return null
    const [now, max] = await Promise.all(['brightness', 'max_brightness'].map((f) => fsp.readFile(`/sys/class/backlight/${dir}/${f}`, 'utf8')))
    const m = Number.parseInt(max, 10)
    return m > 0 ? Math.round((Number.parseInt(now, 10) / m) * 100) : null
  } catch {
    return null
  }
}

async function readRotations(): Promise<Record<string, string>> {
  let text = ''
  try {
    text = await fsp.readFile('/boot/config.txt', 'utf8')
  } catch {
    // not a Raspberry Pi (development)
  }
  const out: Record<string, string> = {}
  for (const key of Object.keys(ROTATIONS)) out[key] = new RegExp(`^[ \\t]*${key}=(\\S+)`, 'm').exec(text)?.[1] ?? '0'
  return out
}

const mupibox = (deps: DisplayDeps) => (deps.getMupiboxConfig()?.mupibox ?? {}) as Record<string, unknown>

const num = (v: unknown, min: number, max: number, step = 1): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return Math.round(n / step) * step
}

export function registerDisplayRoutes(router: Router, deps: DisplayDeps): void {
  /** GET /api/app/display-options - everything the pages Ansicht, Vorlesen, Display and Bedienung show. */
  router.get('/display-options', requireSession, async (_req, res) => {
    const cfg = deps.getMupiboxConfig() as Record<string, Record<string, unknown> | undefined> | undefined
    const mb = cfg?.mupibox ?? {}
    const chromium = cfg?.chromium ?? {}
    const langs = Array.isArray(mb.googlettslanguages) ? (mb.googlettslanguages as Record<string, unknown>[]) : []
    res.json({
      coverflowShowNames: mb.coverflowShowNames === true,
      hideScrollbar: mb.hideScrollbar === true,
      hiddenCategories: Array.isArray(mb.hiddenCategories) ? (mb.hiddenCategories as unknown[]).filter((c) => CATEGORIES.includes(String(c))) : [],
      resume: num(mb.resume, 1, 99) ?? 9,
      listviewTimer: num(mb.listviewTimer, 0.5, 5, 0.5) ?? 2.5,
      settingsAccessTimer: num(mb.settingsAccessTimer, 1, 10, 0.5) ?? 3,
      // podcast episodes go on where they were left (the player, spotify-control.js), remembered for so many days
      // (0: without end)
      episodeResume: mb.episodeResume !== false,
      episodeResumeDays: num(mb.episodeResumeDays, 0, 3650) ?? 180,
      // new episodes marked (for so many days) and how far an episode was heard shown on the display (episode-state.ts)
      ...episodeStateSettings(mb),
      resX: num(chromium.resX, 200, 7680) ?? 800,
      resY: num(chromium.resY, 200, 4320) ?? 480,
      // (the normal brightness, not the one of the evening: that is lower while "Abends dunkler" dims)
      brightness: await readBrightness().then((now) => (now === null ? null : typeof mb.displayBrightness === 'number' ? mb.displayBrightness : now)),
      nightDim: { ...nightDimOf(cfg), dimmed: nightDimmed() },
      rotation: await readRotations(),
      ttsLanguage: typeof mb.ttsLanguage === 'string' ? mb.ttsLanguage : 'en',
      ttsLanguages: langs.map((l) => ({ code: String(l['iso639-1'] ?? ''), name: String(l.Language ?? '') })).filter((l) => l.code),
    })
  })

  /**
   * POST /api/app/display-options  (any part of what GET shows)
   * Answer: what happened on top of saving - reloaded (the display page), restartKiosk (resolution), reboot (rotation),
   * restartPlayer (reading-aloud language).
   */
  router.post('/display-options', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const mb: Record<string, unknown> = {}
    const chromium: Record<string, unknown> = {}
    const bad = (what: string) => res.status(400).json({ error: `invalid ${what}` })
    for (const key of ['coverflowShowNames', 'hideScrollbar', 'episodeResume', 'newEpisodes', 'episodeProgress']) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'boolean') return bad(key)
      mb[key] = body[key]
    }
    if (body.hiddenCategories !== undefined) {
      const list = body.hiddenCategories
      if (!Array.isArray(list) || !list.every((c) => CATEGORIES.includes(String(c)))) return bad('hiddenCategories')
      const unique = [...new Set(list.map(String))]
      // at least one tab stays on the display
      if (unique.length >= CATEGORIES.length) return res.status(400).json({ error: 'at least one category must stay visible' })
      mb.hiddenCategories = unique
    }
    const numbers: [string, number, number, number, Record<string, unknown>][] = [
      ['resume', 1, 99, 1, mb],
      ['listviewTimer', 0.5, 5, 0.5, mb],
      ['settingsAccessTimer', 1, 10, 0.5, mb],
      ['episodeResumeDays', 0, 3650, 1, mb],
      ['newEpisodeDays', 3, 14, 1, mb],
      ['resX', 200, 7680, 1, chromium],
      ['resY', 200, 4320, 1, chromium],
    ]
    for (const [key, min, max, step, target] of numbers) {
      if (body[key] === undefined) continue
      const v = num(body[key], min, max, step)
      if (v === undefined) return bad(key)
      // (the resolution stays text in the config, as the admin interface stores it and chromium-autostart.sh reads it)
      target[key] = target === chromium ? String(v) : v
    }
    let brightness: number | undefined
    if (body.brightness !== undefined) {
      brightness = num(body.brightness, 5, 100)
      if (brightness === undefined) return bad('brightness')
      mb.displayBrightness = brightness
    }
    // "Abends dunkler" (night-dim.ts)
    if (body.nightDim !== undefined) {
      const nd = parseNightDim(body.nightDim)
      if (!nd) return bad('nightDim')
      mb.nightDim = nd
    }
    let tts: string | undefined
    if (body.ttsLanguage !== undefined) {
      const list = mupibox(deps).googlettslanguages
      const langs = Array.isArray(list) ? (list as Record<string, unknown>[]).map((l) => String(l['iso639-1'])) : []
      if (typeof body.ttsLanguage !== 'string' || !langs.includes(body.ttsLanguage)) return bad('ttsLanguage')
      tts = body.ttsLanguage
      mb.ttsLanguage = tts
    }
    const rotation: Record<string, string> = {}
    if (body.rotation !== undefined) {
      const r = body.rotation as Record<string, unknown>
      if (!r || typeof r !== 'object') return bad('rotation')
      for (const [key, allowed] of Object.entries(ROTATIONS)) {
        if (r[key] === undefined) continue
        if (!allowed.includes(String(r[key]))) return bad(key)
        rotation[key] = String(r[key])
      }
    }

    if (Object.keys(mb).length || Object.keys(chromium).length) {
      await deps.updateMupiboxConfig((cfg) => {
        cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), ...mb }
        if (Object.keys(chromium).length) cfg.chromium = { ...((cfg.chromium as Record<string, unknown>) ?? {}), ...chromium }
      })
    }
    const result: Record<string, unknown> = { ok: true }
    // brightness: right away (it is set again at the next start from mupibox.displayBrightness, see mupi_startup.sh)
    if (brightness !== undefined) {
      const dirs = await fsp.readdir('/sys/class/backlight').catch(() => [] as string[])
      for (const dir of dirs) {
        const max = Number.parseInt(await fsp.readFile(`/sys/class/backlight/${dir}/max_brightness`, 'utf8').catch(() => '255'), 10) || 255
        const value = String(Math.round((brightness / 100) * max))
        await run('sudo', ['sh', '-c', `echo ${value} > /sys/class/backlight/${dir}/brightness`])
      }
    }
    // the evening's dimming at once (also over a new normal brightness, which was just written as it is)
    if (brightness !== undefined || body.nightDim !== undefined) {
      await applyNightDim(deps.getMupiboxConfig(), true)
      result.dimmed = nightDimmed()
    }
    // rotation: into /boot/config.txt as the admin interface does (DietPi's G_CONFIG_INJECT); needs a restart
    for (const [key, value] of Object.entries(rotation)) {
      await run('sudo', ['su', '-', 'dietpi', '-c', `. /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT '${key}=' '${key}=${value}' /boot/config.txt`], 30000)
      result.reboot = true
    }
    if (tts !== undefined) {
      // the player reads the language from its own config at its start: spoken names of the old language go
      detached('sudo rm -f /home/dietpi/MuPiBox/tts_files/*.mp3; sudo /usr/local/bin/mupibox/setting_update.sh >/dev/null 2>&1; PM2=$(command -v pm2 || echo /usr/local/bin/pm2); "$PM2" restart spotify-control >/dev/null 2>&1')
      result.restartPlayer = true
    }
    if (chromium.resX !== undefined || chromium.resY !== undefined) {
      // the window size of the kiosk is set when chromium starts
      // (as the admin interface: with dietpi's login environment, so chromium finds its display)
      detached('sudo /usr/local/bin/mupibox/setting_update.sh >/dev/null 2>&1; sudo -i -u dietpi bash -c "setsid nohup /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 < /dev/null &"')
      result.restartKiosk = true
    } else if (['coverflowShowNames', 'hideScrollbar', 'hiddenCategories', 'listviewTimer', 'settingsAccessTimer'].some((k) => k in mb)) {
      result.reloaded = await reloadDisplayPage()
    }
    res.json(result)
  })

  /** POST /api/app/display/reload-page - the display loads its page again (e.g. after "Display off after"). */
  router.post('/display/reload-page', requireSession, requireCsrf, async (_req, res) => {
    res.json({ ok: await reloadDisplayPage() })
  })

  /**
   * PUT /api/app/display/background  body: a JPEG
   * The background picture of the theme "custom". The admin interface scaled smaller pictures up to 800 x 480 with
   * PHP's GD; the theme shows it with background-size: cover, so any JPEG of at least 400 x 240 is taken as it is.
   */
  router.put('/display/background', requireSession, requireCsrf, async (req, res) => {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > 15 * 1024 * 1024) {
        res.status(413).json({ error: 'too_large' })
        req.destroy()
        return
      }
      chunks.push(chunk as Buffer)
    }
    const bytes = Buffer.concat(chunks)
    const info = imageSize(bytes)
    if (info?.type !== 'jpeg') {
      res.status(415).json({ error: 'not_jpeg' })
      return
    }
    if (info.width < 400 || info.height < 240) {
      res.status(422).json({ error: 'too_small', width: info.width, height: info.height })
      return
    }
    const tmp = `/tmp/mupibox-custom-bg-${process.pid}.jpg`
    await fsp.writeFile(tmp, bytes)
    // the file belongs to www-data (written by the admin interface so far)
    const moved = await run('sudo', ['install', '-m', '644', '-o', 'www-data', '-g', 'www-data', tmp, BACKGROUND])
    await fsp.unlink(tmp).catch(() => undefined)
    if (!moved.ok) {
      res.status(500).json({ error: 'write_failed' })
      return
    }
    const theme = String(mupibox(deps).theme ?? '')
    res.json({ ok: true, width: info.width, height: info.height, active: theme === 'custom', reloaded: theme === 'custom' ? await reloadDisplayPage() : false })
  })

  /** GET /api/app/display/background - the current background picture (for the preview). */
  router.get('/display/background', requireSession, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(BACKGROUND, (err) => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })

  /**
   * GET /api/app/display/screenshot - what the display shows right now (PNG, scrot on the kiosk's X display).
   * One picture at most every 2 seconds; a request in between gets the last one.
   */
  let lastShot = 0
  let shooting: Promise<boolean> | undefined
  router.get('/display/screenshot', requireSession, async (_req, res) => {
    if (Date.now() - lastShot > 2000) {
      shooting ??= run('sh', ['-c', `DISPLAY=:0 XAUTHORITY=/home/dietpi/.Xauthority scrot -o ${SCREENSHOT}`], 8000).then((r) => {
        shooting = undefined
        if (r.ok) lastShot = Date.now()
        return r.ok
      })
      await shooting
    }
    res.setHeader('Cache-Control', 'no-store')
    // (when the last shot failed the one before comes: its time goes along, the app shows it instead of "now")
    if (lastShot > 0) res.setHeader('X-Shot-At', String(lastShot))
    res.sendFile(SCREENSHOT, (err) => {
      if (err && !res.headersSent) res.status(503).json({ error: 'no_screenshot' })
    })
  })

  /** GET /api/app/display/vnc - whether the remote control runs; it opens under /app/vnc/ (server.ts proxyVncUpgrade:
   *  only with the app's login, x11vnc and websockify listen on the box itself only). */
  router.get('/display/vnc', requireSession, async (_req, res) => {
    const r = await run('systemctl', ['is-active', 'mupi_novnc'], 5000)
    // (on the app's own port 8200: the websocket through the web server of port 80/443 stalled; the login cookie is the
    // box's, whatever the port)
    res.json({ active: r.stdout.trim() === 'active', port: 8200, path: '/app/vnc/vnc.html?path=websockify&autoconnect=1&resize=scale&reconnect=1' })
  })
}
