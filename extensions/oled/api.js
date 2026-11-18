// OLED display - the API part (runs in the server of the box): starts the driver (oled.py, Python: Node has no way to speak I2C),
// reads what the player plays and tells the driver what to draw, and keeps the start without the DSI display.
//
//   settings (type, size, address ...)  ->  logic.js readConfig
//   the driver program                  ->  driver.js, oled.py, render.py
//   what plays                          ->  GET <player>/local (and /state while Spotify plays), once in 0.5 s
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
  let headlessError = ''
  let busy = false
  let timer = null

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
          push(true)
        } else if (event.event === 'error') phase = { phase: 'error', code: event.code }
      },
      onEnd: (reason, isNew, code) => {
        if (phase.phase !== 'error') phase = { phase: 'error', code: code || 'other' }
        if (isNew) log.warn(`[oled] display program: ${reason}`)
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

  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const now = clock()
      if (now - net.at >= NET_MS) {
        await readNet()
        await readNight()
        syncContrast()
      }
      const local = await getJson(`${host.playerUrl}/local`)
      const spotify = local?.currentPlayer === 'spotify' ? await getJson(`${host.playerUrl}/state`) : null
      const reading = logic.readPlayback(local, spotify)
      // (no answer of the player at all: the picture stays as it was - not a short picture for a volume that "changed" to nothing)
      if (local) {
        const overlay = logic.overlayFor(previous, reading, config.volumeOverlay)
        if (overlay) ui.overlay = { ...overlay, until: now + logic.OVERLAY_MS }
        previous = reading
        play = reading
      }
      const something = play.player !== '' && (play.playing || play.title !== '' || play.artist !== '' || play.album !== '')
      if (something) ui.idleSince = null
      else if (!ui.idleSince) ui.idleSince = now
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
    const text = JSON.stringify(state)
    // (the clock and the progress change by themselves: an unchanged state is not sent again; scrolling is the driver's own)
    if (!force && text === lastSent) return
    if (driver.send({ cmd: 'state', state })) lastSent = text
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
    const n = Number.parseInt(readText(AUTOSTART_INDEX_FILE).trim(), 10)
    return Number.isInteger(n) ? n : null
  }
  const keepFile = () => path.join(dataDir, KEEP_AUTOSTART_FILE)
  const flagNow = () => host.config?.()?.mupibox?.headless === true

  // Switches the box to the start without the kiosk or back; the flag of the configuration is what the scripts read (jq '.mupibox.headless')
  const applyHeadless = async (on) => {
    if (on === flagNow() && (!on || readAutostartIndex() !== KIOSK_AUTOSTART)) {
      headlessError = ''
      return
    }
    try {
      if (on) {
        const index = readAutostartIndex()
        // (what was there before is brought back when the setting goes off: the kiosk, or a choice the user made)
        if (index !== null && index !== NO_KIOSK_AUTOSTART) {
          fs.mkdirSync(dataDir, { recursive: true })
          fs.writeFileSync(keepFile(), JSON.stringify({ index }), { mode: 0o600 })
        }
        const result = await run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(NO_KIOSK_AUTOSTART)])
        if (result.error) throw new Error(`dietpi-autostart: ${result.error.message ?? result.error}`)
      } else {
        let index = KIOSK_AUTOSTART
        try {
          const kept = JSON.parse(fs.readFileSync(keepFile(), 'utf8'))
          if (Number.isInteger(kept?.index) && kept.index > 0 && kept.index < 100) index = kept.index
        } catch {
          /* nothing kept: the kiosk */
        }
        const result = await run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(index)])
        if (result.error) throw new Error(`dietpi-autostart: ${result.error.message ?? result.error}`)
      }
      await host.updateConfig((cfg) => {
        cfg.mupibox = cfg.mupibox && typeof cfg.mupibox === 'object' ? cfg.mupibox : {}
        cfg.mupibox.headless = on
      })
      headlessError = ''
      log.info?.(`[oled] ${on ? 'the box starts without the DSI display from now on' : 'the box starts with the DSI display again'} (after the next restart)`)
    } catch (error) {
      headlessError = on ? 'Das Abschalten des DSI-Displays hat nicht geklappt' : 'Das Einschalten des DSI-Displays hat nicht geklappt'
      log.warn(`[oled] headless ${on}: ${error?.message ?? error}`)
    }
  }

  // ---- the settings ------------------------------------------------------------------------------------------------------------
  let chain = Promise.resolve()
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
        if (typeof host.updateConfig === 'function' && typeof host.config === 'function') await applyHeadless(config.headless)
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
      if (headlessError) rows.push({ label: 'DSI-Display', value: headlessError, tone: 'error' })
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
