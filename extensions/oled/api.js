// OLED display - the API part (runs in the server of the box): starts the driver (oled.py, Python: Node has no way to speak I2C),
// reads what the player plays and tells the driver what to draw, and keeps the start without the DSI display.
//
//   settings (type, size, address ...)  ->  logic.js readConfig
//   the driver program                  ->  driver.js, oled.py, render.py
//   what plays                          ->  GET <player>/local once in 0.5 s (once in 1.5 s while the display is off), and /state
//                                           while Spotify plays, once in 20 s
//   the status block of the page        ->  GET /state (the lines), POST /iicon (switch I2C on)
//   the display itself                  ->  POST /info (the page with the address of the box), POST /mode (the next mode), POST /wake
//   without the DSI display             ->  the setting "headless": the flag mupibox.headless in the configuration of the box and the
//                                           autostart of DietPi (the kiosk is its autologin) - effective after the next start
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const logic = require('./logic.js')
const { createDriver } = require('./driver.js')

const TICK_MS = 500
const NET_MS = 15000
// (the display is off: only /local, to notice a start)
const ASLEEP_POLL_MS = 1500
// (Spotify's /state asks the Web API: while it plays once in a while, the progress in between is counted on; at the end of a song
// or when /local says it started or stopped it is asked at once, but never more than once in SPOTIFY_GAP_MS)
const SPOTIFY_STATE_MS = 20000
const SPOTIFY_GAP_MS = 3000
// (switching "headless" on waits this long for the driver to say whether an OLED is there)
const READY_WAIT_MS = 8000
const DRM_DIR = '/sys/class/drm'
const AUTOSTART_INDEX_FILE = '/boot/dietpi/.dietpi-autostart_index'
// (the autostart the kiosk uses: DietPi's index 11 is the Chromium kiosk the box was set up with; 0 is the manual login)
const KIOSK_AUTOSTART = 11
const NO_KIOSK_AUTOSTART = 0
// the user may have chosen something else than the kiosk (a console login, 7): then the extension leaves it alone and "off" brings
// back what was there before
const KEEP_AUTOSTART_FILE = 'autostart.json'

exports.activate = (host) => {
  const log = host.log ?? console
  const deps = host.deps ?? {}
  const dir = host.dir ?? __dirname
  const dataDir = host.dataDir ?? dir
  const exec = deps.execFile ?? execFile
  const request = deps.fetch ?? fetch
  const clock = deps.now ?? Date.now

  let config = logic.readConfig({})
  let driver = null
  let phase = { phase: 'starting', code: '' }
  let play = logic.readPlayback(null, null)
  let previous = null // the reading before this one, for the short pictures
  const ui = { infoUntil: 0, overlay: null, idleSince: clock(), wake: 0, mode: null }
  let net = { ssid: '', ip: '', wifi: -1, lan: false, at: 0 }
  let headlessNote = null // { value, tone }: why "headless" did not take effect, for the status block
  let busy = false
  let timer = null
  let shownView = '' // the view the driver was told last
  let localAt = 0 // when /local was read last
  let spotifyKept = null // { state, at, key }: the last /state while Spotify is the player

  // ---- the box: files and commands --------------------------------------------------------------------------------------------
  const readText = (file) => {
    try {
      return file ? fs.readFileSync(file, 'utf8') : ''
    } catch {
      return '' // nothing to read
    }
  }
  const version = (() => {
    try {
      return String(JSON.parse(readText(path.join(dir, 'manifest.json'))).version ?? '')
    } catch {
      return ''
    }
  })()
  const bootConfigFile = () => ['/boot/firmware/config.txt', '/boot/config.txt'].find((file) => fs.existsSync(file))
  const deviceNames = () => {
    try {
      return fs.readdirSync('/dev')
    } catch {
      return []
    }
  }
  const i2cNow = () => logic.i2cState(readText(bootConfigFile()), readText('/etc/modules'), deviceNames(), fs.existsSync('/sys/module/i2c_dev'))
  const run = (command, args, timeout = 60000) =>
    new Promise((resolve) => {
      exec(command, args, { timeout }, (error, stdout) => resolve({ error, stdout: String(stdout ?? '') }))
    })
  // One command as the user dietpi (G_SUDO inside: the way the core and the NFC extension do it)
  const asDietpi = (commands) => run('sudo', ['-n', 'su', '-', 'dietpi', '-c', `. /boot/dietpi/func/dietpi-globals && ${commands.join(' && ')}`])
  const inject = (key, line, file) => `G_SUDO G_CONFIG_INJECT '${key}' '${line}' ${file}`

  // ---- the driver ---------------------------------------------------------------------------------------------------------------
  let started = null // the configuration the running driver was started with
  let night = { share: 0 } // how far into the evening dimming the box is (host.nightDim), 0 to 1
  let appliedContrast = null // the contrast the running driver has
  let settledWaiters = [] // who waits for the driver to be ready or to fail (switching "headless" on)
  const settled = () => {
    const waiters = settledWaiters
    settledWaiters = []
    for (const done of waiters) done()
  }
  const driverSettled = (ms) =>
    phase.phase !== 'starting'
      ? Promise.resolve()
      : new Promise((resolve) => {
          const timeout = setTimeout(resolve, ms)
          timeout.unref?.()
          settledWaiters.push(() => {
            clearTimeout(timeout)
            resolve()
          })
        })
  const startDriver = () => {
    appliedContrast = logic.eveningContrast(config, night.share)
    const args = [path.join(dir, 'oled.py'), ...logic.driverArgs({ ...config, contrast: appliedContrast })]
    started = config
    phase = { phase: 'starting', code: '' }
    driver = createDriver({
      command: 'python3',
      args,
      onEvent: (event) => {
        if (event.event === 'ready') {
          phase = { phase: 'ready', code: '' }
          // (a display that starts (again) shows the box for the time of sleepAfter before it goes off)
          if (ui.idleSince) ui.idleSince = clock()
          localAt = 0
          push(true)
          // ("headless" was refused while no display answered: now there is one)
          if (config.headless && !flagNow() && headlessNote) queueHeadless()
        } else if (event.event === 'error') phase = { phase: 'error', code: event.code }
        settled()
      },
      onEnd: (reason, isNew, code) => {
        if (phase.phase !== 'error') phase = { phase: 'error', code: code || 'other' }
        if (isNew) log.warn(`[oled] display program: ${reason}`)
        settled()
      },
      log,
      ...(deps.spawnFn ? { spawnFn: deps.spawnFn } : {}),
      ...(deps.setTimer ? { setTimer: deps.setTimer, clearTimer: deps.clearTimer } : {}),
    })
    driver.start()
    log.info?.(`[oled] display ${config.controller} ${config.width}x${config.height} at ${config.address} started`)
  }
  const stopDriver = async () => {
    const old = driver
    driver = null
    started = null
    if (old) await old.stop()
  }

  // ---- the player and the network ----------------------------------------------------------------------------------------------
  const getJson = async (url) => {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(2500) })
      return response.ok ? await response.json() : null
    } catch {
      return null
    }
  }
  // (the evening, as the box works it out for "Abends dunkler": its window, the gradual dimming and the quiet hours)
  const readNight = async () => {
    night = { share: 0 }
    if (!config.nightDim || typeof host.nightDim !== 'function') return
    try {
      const answer = await host.nightDim()
      if (typeof answer?.share === 'number') night = { share: answer.share }
    } catch (error) {
      log.warn?.(`[oled] evening: ${error?.message ?? error}`)
    }
  }
  const syncContrast = () => {
    const wanted = logic.eveningContrast(config, night.share)
    if (driver && wanted !== appliedContrast && driver.send({ cmd: 'contrast', value: wanted })) appliedContrast = wanted
  }
  const readNet = async () => {
    const wireless = readText('/proc/net/wireless')
    const level = logic.wifiLevel(wireless)
    let ip = ''
    const interfaces = os.networkInterfaces()
    const pick = (name) => (interfaces[name] ?? []).find((a) => a.family === 'IPv4' && !a.internal)?.address ?? ''
    ip = pick('wlan0') || pick('eth0') || Object.keys(interfaces).map(pick).find(Boolean) || ''
    // (on the wired network the plug is shown in place of the wireless bars, and the address is the wired one)
    const wired = logic.wiredLink(interfaces, (name) => readText(`/sys/class/net/${name}/operstate`))
    if (wired) ip = wired.ip
    let ssid = ''
    if (!wired && level >= 0) ssid = (await run('iwgetid', ['-r'], 3000)).stdout.trim().slice(0, 40)
    // (the charge of a MuPiHAT's battery, if the box has one; where the sound goes: the speaker, headphones or Bluetooth)
    let battery = null
    if (host.config?.()?.mupihat?.hat_active === true) battery = logic.batteryPercent(readText('/tmp/mupihat.json'))
    const output = logic.outputKind(await getJson(`${host.apiUrl}/api/audio-output`))
    net = { ssid, ip, wifi: level, lan: Boolean(wired), battery, output, at: clock() }
  }

  // Spotify's /state while Spotify is the player: asked when /local says it plays (once in SPOTIFY_STATE_MS, and at once when it
  // started, stopped or a new start came), counted on in between; while it is paused the last answer stays (no Web API for hours)
  const spotifyState = async (local, now) => {
    const playing = logic.spotifyMayPlay(local)
    const key = `${playing}|${local.generation ?? ''}`
    const kept = spotifyKept
    const moving = (s) => s?.is_playing === true && typeof s.progress_ms === 'number'
    const progress = kept && moving(kept.state) ? kept.state.progress_ms + (now - kept.at) : kept?.state?.progress_ms
    const over = Boolean(kept) && moving(kept.state) && progress >= (kept.state.item?.duration_ms ?? Number.POSITIVE_INFINITY)
    const ask = !kept || kept.key !== key || (playing && (now - kept.at >= SPOTIFY_STATE_MS || over) && now - kept.at >= SPOTIFY_GAP_MS)
    if (ask) {
      const state = await getJson(`${host.playerUrl}/state`)
      spotifyKept = { state, at: clock(), key }
      return state
    }
    if (!kept.state) return null
    return moving(kept.state) ? { ...kept.state, progress_ms: Math.min(progress, kept.state.item?.duration_ms ?? progress) } : kept.state
  }

  const tick = async () => {
    // (no display to draw on - it starts, or it failed: nothing to do)
    if (busy || !driver || phase.phase !== 'ready') return
    const now = clock()
    // (the display is off: /local now and then, only to notice a start; the network, the evening and Spotify wait)
    if (shownView === 'off' && now - localAt < ASLEEP_POLL_MS) return
    busy = true
    try {
      localAt = now
      const local = await getJson(`${host.playerUrl}/local`)
      let spotify = null
      if (local?.currentPlayer === 'spotify') spotify = await spotifyState(local, now)
      else spotifyKept = null
      const reading = logic.readPlayback(local, spotify)
      // (no answer of the player at all: the picture stays as it was - not a short picture for a volume that "changed" to nothing)
      if (local) {
        const overlay = logic.overlayFor(previous, reading, config.volumeOverlay)
        if (overlay) ui.overlay = { ...overlay, until: now + logic.OVERLAY_MS }
        previous = reading
        play = reading
      }
      // (only what plays keeps the display on: a paused medium counts as idle and lets it go off after sleepAfter)
      if (play.player !== '' && play.playing) ui.idleSince = null
      else if (!ui.idleSince) ui.idleSince = now
      if (stateNow().view !== 'off' && now - net.at >= NET_MS) {
        await readNet()
        await readNight()
        syncContrast()
      }
      push(false)
    } finally {
      busy = false
    }
  }

  const stateNow = () => logic.buildState({ config, play, ui, net, date: new Date(clock()), now: clock(), version, language: host.config?.()?.mupibox?.displayLanguage })
  let lastSent = ''
  const push = (force) => {
    if (!driver) return
    const state = stateNow()
    // (off stays off: the clock that goes on is not sent to a dark display)
    if (!force && state.view === 'off' && shownView === 'off') return
    const text = JSON.stringify(state)
    // (the clock and the progress change by themselves: an unchanged state is not sent again; scrolling is the driver's own)
    if (!force && text === lastSent) return
    if (driver.send({ cmd: 'state', state })) {
      lastSent = text
      shownView = state.view
    }
  }

  // ---- the start without the DSI display ---------------------------------------------------------------------------------------
  const kioskRunning = async () => {
    for (const name of ['chromium', 'chromium-browser']) {
      const { error } = await run('pidof', [name], 3000)
      if (!error) return true
    }
    return false
  }
  const readAutostartIndex = () => {
    const n = Number.parseInt(readText(deps.autostartIndexFile ?? AUTOSTART_INDEX_FILE).trim(), 10)
    return Number.isInteger(n) ? n : null
  }
  const keepFile = () => path.join(dataDir, KEEP_AUTOSTART_FILE)
  const flagNow = () => host.config?.()?.mupibox?.headless === true

  const removeKeep = () => {
    try {
      fs.rmSync(keepFile(), { force: true })
    } catch {
      /* nothing to remove */
    }
  }
  const setFlag = (on) =>
    host.updateConfig((cfg) => {
      cfg.mupibox = cfg.mupibox && typeof cfg.mupibox === 'object' ? cfg.mupibox : {}
      cfg.mupibox.headless = on
    })
  const setAutostart = async (index) => {
    const result = await run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(index)])
    if (result.error) throw new Error(`dietpi-autostart: ${result.error.message ?? result.error}`)
  }
  // (the connectors of the graphics: a DSI one that says "connected" is a DSI display that is plugged in)
  const drmConnectors = () => {
    const drm = deps.drmDir ?? DRM_DIR
    try {
      return fs.readdirSync(drm).map((name) => ({ name, status: readText(path.join(drm, name, 'status')) }))
    } catch {
      return []
    }
  }
  // Why the box must not start without the DSI display now ('' when it may): a box without any picture could not be set up again
  const headlessRefusal = async () => {
    if (logic.dsiConnected(drmConnectors())) return logic.HEADLESS_DSI
    await driverSettled(READY_WAIT_MS)
    return phase.phase === 'ready' ? '' : logic.HEADLESS_NO_OLED
  }

  // Switches the box to the start without the kiosk or back; the flag of the configuration is what the scripts read (jq '.mupibox.headless')
  const applyHeadless = async (on) => {
    const flag = flagNow()
    const index = readAutostartIndex()
    // (a switch-on that stopped half-way - autostart 0 written, the flag not: "off" brings the kiosk back all the same)
    const leftOver = !on && !flag && index === NO_KIOSK_AUTOSTART && fs.existsSync(keepFile())
    if (on === flag && (on ? index !== KIOSK_AUTOSTART : !leftOver)) {
      headlessNote = null
      return
    }
    if (on) {
      const refused = await headlessRefusal()
      if (refused) {
        if (headlessNote?.value !== refused) log.warn(`[oled] headless not switched on: ${phase.phase !== 'ready' ? 'no display answers' : 'a DSI display is connected'}`)
        headlessNote = { value: refused, tone: 'warn' }
        // (the flag without autostart 0 - left by a switch-on that stopped half-way: the kiosk starts, so the flag goes too)
        if (flag) await setFlag(false).catch((error) => log.warn(`[oled] headless flag not taken back: ${error?.message ?? error}`))
        return
      }
    }
    try {
      if (on) {
        // (what was there before is brought back when the setting goes off: the kiosk, or a choice the user made)
        if (index !== null && index !== NO_KIOSK_AUTOSTART) {
          fs.mkdirSync(dataDir, { recursive: true })
          fs.writeFileSync(keepFile(), JSON.stringify({ index }), { mode: 0o600 })
        }
        // (the flag first: should the autostart fail, the flag goes back; should the server end in between, the flag is on and
        // "off" repairs it)
        await setFlag(true)
        try {
          await setAutostart(NO_KIOSK_AUTOSTART)
        } catch (error) {
          await setFlag(false).catch((back) => log.warn(`[oled] headless flag not taken back: ${back?.message ?? back}`))
          if (readAutostartIndex() !== NO_KIOSK_AUTOSTART) removeKeep()
          throw error
        }
      } else {
        let back = KIOSK_AUTOSTART
        try {
          const kept = JSON.parse(fs.readFileSync(keepFile(), 'utf8'))
          if (Number.isInteger(kept?.index) && kept.index > 0 && kept.index < 100) back = kept.index
        } catch {
          /* nothing kept: the kiosk */
        }
        await setAutostart(back)
        await setFlag(false)
        removeKeep()
      }
      headlessNote = null
      log.info?.(`[oled] ${on ? 'the box starts without the DSI display from now on' : 'the box starts with the DSI display again'} (after the next restart)`)
    } catch (error) {
      headlessNote = { value: on ? 'Das Abschalten des DSI-Displays hat nicht geklappt' : 'Das Einschalten des DSI-Displays hat nicht geklappt', tone: 'error' }
      log.warn(`[oled] headless ${on}: ${error?.message ?? error}`)
    }
  }

  // ---- the settings ------------------------------------------------------------------------------------------------------------
  let chain = Promise.resolve()
  const canHeadless = () => typeof host.updateConfig === 'function' && typeof host.config === 'function'
  const queueHeadless = () => {
    if (!canHeadless()) return
    chain = chain.then(() => applyHeadless(config.headless)).catch((error) => log.warn(`[oled] headless: ${error?.message ?? error}`))
  }
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        const before = config
        config = logic.readConfig(settings ?? {})
        await readNight()
        if (!driver || logic.needsRestart(started ?? before, config)) {
          await stopDriver()
          startDriver()
        } else {
          syncContrast()
        }
        ui.mode = null
        push(true)
        if (canHeadless()) await applyHeadless(config.headless)
      })
      .catch((error) => log.warn(`[oled] not started: ${error?.message ?? error}`))
    return chain
  }
  process.once('exit', () => driver?.kill())
  if (typeof host.onSettings === 'function') host.onSettings(apply)
  Promise.resolve(host.settings()).then(apply)
  timer = setInterval(() => void tick(), TICK_MS)
  timer.unref?.()

  // ---- what the page of the extension shows and asks ----------------------------------------------------------------------------
  host.route(
    'get',
    '/state',
    async (_req, res) => {
      const rows = logic.statusRows({ config, driver: phase, i2c: i2cNow(), kiosk: { headless: flagNow(), running: await kioskRunning() } })
      if (headlessNote) rows.push({ label: 'DSI-Display', value: headlessNote.value, tone: headlessNote.tone })
      res.json({ rows, mode: ui.mode ?? config.mode })
    },
    { session: true },
  )

  // I2C on: the line of the boot configuration and the module (DietPi's G_CONFIG_INJECT); the bus is there after the next restart
  host.route(
    'post',
    '/iicon',
    async (_req, res) => {
      if (logic.i2cIsOn(i2cNow()) && i2cNow().devices.length > 0) return res.json({ ok: true, message: 'I2C ist schon eingeschaltet.' })
      const file = bootConfigFile()
      if (!file) return res.status(500).json({ ok: false, error: 'no_config', message: 'I2C ließ sich nicht einschalten.' })
      const { error } = await asDietpi([inject('dtparam=i2c_arm=', 'dtparam=i2c_arm=on', file), inject('i2c-dev', 'i2c-dev', '/etc/modules')])
      if (error || !i2cNow().configured) {
        log.warn(`[oled] I2C did not switch on: ${error?.message ?? 'the result is not in the configuration'}`)
        return res.status(500).json({ ok: false, error: 'failed', message: 'I2C ließ sich nicht einschalten.' })
      }
      log.info?.('[oled] I2C switched on in the boot configuration (the box has to restart)')
      res.json({ ok: true, message: 'I2C ist eingeschaltet. Die Box muss neu starten.' })
    },
    { session: true },
  )

  // The page with the address of the box for ten seconds
  host.route(
    'post',
    '/info',
    (_req, res) => {
      ui.infoUntil = clock() + logic.INFO_MS
      ui.wake = ui.infoUntil
      push(true)
      res.json({ ok: true, message: 'Die Adresse der Box steht auf dem Display' })
    },
    { session: true },
  )

  // The next mode (full, mix, lite) until the settings are saved again
  host.route(
    'post',
    '/mode',
    (_req, res) => {
      ui.mode = logic.nextMode(ui.mode ?? config.mode)
      push(true)
      res.json({ ok: true, mode: ui.mode, message: 'Anzeige wechselt' })
    },
    { session: true },
  )

  // Wakes a display that went off for a while (nothing plays)
  host.route(
    'post',
    '/wake',
    (_req, res) => {
      ui.wake = clock() + 30000
      ui.idleSince = clock()
      push(true)
      res.json({ ok: true })
    },
    { session: true },
  )

  // (for the tests: one pass of the loop, and what the driver is told)
  return { tick, stateNow, apply, driverState: () => driver?.state() ?? null }
}
