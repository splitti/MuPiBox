// OLED display - the API part (runs in the server of the box): starts the driver (oled.py, Python: Node has no way to speak I2C),
// reads what the player plays and tells the driver what to draw. (The start without the DSI display is a switch of the core since
// MuPiBox 5.1 - Einstellungen > Display; the status block still says what the box does.)
//
//   settings (type, size, address ...)  ->  logic.js readConfig
//   the driver program                  ->  driver.js, oled.py, render.py
//   what plays                          ->  GET <player>/local once in 0.5 s (once in 1.5 s while the display is off), and /state
//                                           while Spotify plays, once in 20 s
//   the status block of the page        ->  GET /state (the lines), POST /iicon (switch I2C on)
//   the display itself                  ->  POST /info (the QR code with the address of the box), POST /address and POST /mode (the same and the
//                                           next mode, for a button of the box: only from the box itself), POST /wake
//   the pictures                        ->  GET /images (the list on the page), POST /imageset (a picture the user chose), POST /imagereset;
//                                           an update or the shutdown says itself in a file (scripts/mupibox/oled_picture.sh)
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
// what the box's scripts say: an update runs or the box goes down (scripts/mupibox/oled_picture.sh), and the player's state of the rest times
const HOLD_FILE = '/run/mupibox-oled-picture'
const PLAYTIME_FILE = '/tmp/playtime.json'
// a picture the user chose comes as a PNG the app made (a few hundred kB at most)
const MAX_PICTURE_BYTES = 900000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const DATA_URL_PNG = 'data:image/png;base64,'
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
  // (ready: the box can play - the start picture stays until the player answers, but not longer than BOOT_MAX_MS)
  const ui = { infoUntil: 0, overlay: null, select: null, idleSince: clock(), wake: 0, mode: null, ready: false, hold: null, blocked: false, preview: null }
  const bootDeadline = clock() + logic.BOOT_MAX_MS
  const imagesDir = path.join(dir, 'images')
  const customDir = path.join(dataDir, 'images')
  const holdFile = () => deps.holdFile ?? HOLD_FILE
  const playtimeFile = () => deps.playtimeFile ?? PLAYTIME_FILE
  let net = { ssid: '', ip: '', wifi: -1, lan: false, at: 0 }
  let busy = false
  let timer = null
  let shownView = '' // the view the driver was told last
  let localAt = 0 // when /local was read last
  let spotifyKept = null // { state, at, key, since }: the last /state while Spotify is the player (since: when its key began)

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
  // (the picture of an update that stood when the server started: that update has ended, or the box was switched off in it. The file is the
  // box's - written empty, not removed: the server may not remove a file of root's in /run)
  try {
    if (logic.holdFrom(readText(holdFile()), clock())?.slot === 'update') fs.writeFileSync(holdFile(), '')
  } catch {
    /* nothing to clear */
  }
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
    const args = [path.join(dir, 'oled.py'), ...logic.driverArgs({ ...config, contrast: appliedContrast }, { images: imagesDir, custom: customDir })]
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
  // (off: the panel is switched off - another address or controller: should the new driver not find its display, the old picture
  // stayed on the old one for good)
  const stopDriver = async (off = false) => {
    const old = driver
    driver = null
    started = null
    if (old) await old.stop(off)
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
    // (a command - next, previous - sets triggerAt; the track number where the player has one)
    const key = `${playing}|${local.generation ?? ''}|${local.triggerAt ?? ''}|${local.currentTracknr ?? ''}`
    const kept = spotifyKept
    const moving = (s) => s?.is_playing === true && typeof s.progress_ms === 'number'
    const progress = kept && moving(kept.state) ? kept.state.progress_ms + (now - kept.at) : kept?.state?.progress_ms
    const over = Boolean(kept) && moving(kept.state) && progress >= (kept.state.item?.duration_ms ?? Number.POSITIVE_INFINITY)
    // (right after a start /state often says not playing yet: asked again after the short gap, for the time of one long one)
    const late = Boolean(kept) && playing && kept.state?.is_playing !== true && now - kept.since < SPOTIFY_STATE_MS
    // (a second look once after a change - next, previous, a start: asked at once, Spotify often still told the track before)
    const again = Boolean(kept?.again) && playing
    const ask = !kept || kept.key !== key || (playing && (now - kept.at >= SPOTIFY_STATE_MS || over || late || again) && now - kept.at >= SPOTIFY_GAP_MS)
    if (ask) {
      const state = await getJson(`${host.playerUrl}/state`)
      const at = clock()
      const changed = !kept || kept.key !== key
      spotifyKept = { state, at, key, since: changed ? at : kept.since, again: changed }
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
        const overlay = logic.overlayFor(previous, reading, config.volumeOverlay, config.playOverlay)
        if (overlay) ui.overlay = { ...overlay, until: now + logic.OVERLAY_MS }
        previous = reading
        play = reading
      }
      // (the start picture goes when the player answers - or when it did not for BOOT_MAX_MS - and a rest time or an update shows its own)
      if (local || now >= bootDeadline) ui.ready = true
      ui.hold = logic.holdFrom(readText(holdFile()), now)
      ui.blocked = logic.blockedFrom(readText(playtimeFile()))
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

  // ---- what the status block says of the start without the DSI display (the switch of the core) -------------------------------
  // (the kiosk is its X server: without it a Chromium is the page without a screen that keeps Spotify there - 5.1)
  const kioskRunning = async () => {
    const { error } = await run('pidof', ['Xorg'], 3000)
    return !error
  }
  // (the switch of the core - mupibox.headless, what the status block says)
  const flagNow = () => host.config?.()?.mupibox?.headless === true

  // ---- the settings ------------------------------------------------------------------------------------------------------------
  let chain = Promise.resolve()
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        const before = config
        config = logic.readConfig(settings ?? {})
        await readNight()
        if (!driver || logic.needsRestart(started ?? before, config)) {
          const was = started ?? before
          await stopDriver(was.address !== config.address || was.controller !== config.controller)
          startDriver()
        } else {
          syncContrast()
        }
        ui.mode = null
        push(true)
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
      // (dimmed: the display is darker now because of the evening - the page says so in the card of the evening)
      res.json({ rows, mode: ui.mode ?? config.mode, dimmed: config.nightDim && night.share > 0 })
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

  // The QR code with the address of the box for ten seconds (nothing else on the display)
  const showAddress = () => {
    ui.infoUntil = clock() + logic.INFO_MS
    ui.wake = ui.infoUntil
    push(true)
  }
  host.route(
    'post',
    '/info',
    (_req, res) => {
      showAddress()
      res.json({ ok: true, message: 'Der QR-Code mit der Adresse der Box steht auf dem Display' })
    },
    { session: true },
  )
  // The same for a button of the box (the buttons extension, a knob's button): not behind the login, but only from the box itself
  const fromTheBox = (req) => {
    const from = String(req.socket?.remoteAddress ?? '')
    // (the box's web server proxies to 8201: never from there, whatever header it sets)
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from) && !req.headers['x-forwarded-for'] && req.socket?.localPort !== 8201
  }
  host.route('post', '/address', (req, res) => {
    if (!fromTheBox(req)) return res.status(403).json({ ok: false })
    showAddress()
    res.json({ ok: true })
  })

  // The next mode (full, mix, lite) until the settings are saved again - for a button of the box (there is no button for it on the page)
  host.route('post', '/mode', (req, res) => {
    if (!fromTheBox(req)) return res.status(403).json({ ok: false })
    ui.mode = logic.nextMode(ui.mode ?? config.mode)
    push(true)
    res.json({ ok: true, mode: ui.mode })
  })

  // ---- the pictures ------------------------------------------------------------------------------------------------------------
  const ownPictures = () => logic.CHANGEABLE_IMAGES.filter((id) => fs.existsSync(path.join(customDir, `${id}.png`)))
  // (the picture as it is shown: the user's own, else the one of the extension)
  const pictureFile = (id) => {
    const own = path.join(customDir, `${id}.png`)
    if (logic.CHANGEABLE_IMAGES.includes(id) && fs.existsSync(own)) return own
    const built = path.join(imagesDir, `${id}.png`)
    return fs.existsSync(built) ? built : ''
  }
  const dataUrl = (file) => {
    try {
      return file ? `${DATA_URL_PNG}${fs.readFileSync(file).toString('base64')}` : ''
    } catch {
      return ''
    }
  }

  // The list of the pictures on the page (rows with the picture, where it is shown and the buttons to change it and to take the original back)
  host.route(
    'get',
    '/images',
    (_req, res) => {
      const own = ownPictures()
      const items = logic.imageRows({ own, idleScreen: config.idleScreen }).map((row) => ({
        id: row.id,
        title: row.title,
        translate: true,
        text: row.text,
        image: dataUrl(pictureFile(row.id)),
        wide: true,
        actions: [
          { label: 'Zeige Bild', post: '/api/ext/oled/imageshow', safe: true },
          ...(row.changeable
            ? [
                { label: 'Bild ändern', post: '/api/ext/oled/imageset', upload: true, exact: [128, 64], safe: true },
                ...(row.own ? [{ label: 'Zurücksetzen', post: '/api/ext/oled/imagereset', confirm: 'Das Original wieder zeigen?', safe: true }] : []),
              ]
            : []),
        ],
      }))
      res.json({ items })
    },
    { session: true },
  )

  // A picture of the list on the display for 10 seconds ({ id }), then what it showed before (the state decides again by itself)
  host.route(
    'post',
    '/imageshow',
    (req, res) => {
      const id = String(req.body?.id ?? '')
      if (!logic.previewView(id)) return res.status(400).json({ ok: false, error: 'bad_id', message: 'Dieses Bild gibt es nicht' })
      ui.preview = { id, until: clock() + logic.PREVIEW_MS }
      push(true)
      res.json({ ok: true, message: 'Das Bild steht zehn Sekunden auf dem Display' })
    },
    { session: true },
  )

  // A picture the user chose ({ id, image: "data:image/png;base64,..." } - the app checked it and made a PNG of it): taken only if it is a 1-bit
  // picture of exactly 128 x 64 (oled.py --check says so again, the browser is not to be trusted) and kept in the data folder, where the driver finds it
  host.route(
    'post',
    '/imageset',
    async (req, res) => {
      const id = String(req.body?.id ?? '')
      if (!logic.CHANGEABLE_IMAGES.includes(id)) return res.status(400).json({ ok: false, error: 'bad_id', message: 'Dieses Bild lässt sich nicht ändern' })
      const text = String(req.body?.image ?? '')
      const bytes = text.startsWith(DATA_URL_PNG) && text.length <= MAX_PICTURE_BYTES * 1.4 ? Buffer.from(text.slice(DATA_URL_PNG.length), 'base64') : null
      if (!bytes || bytes.length === 0 || bytes.length > MAX_PICTURE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return res.status(400).json({ ok: false, error: 'not_a_picture', message: 'Das ist kein Bild, das die Box lesen kann' })
      }
      const upload = path.join(customDir, `.${id}.upload`)
      const made = path.join(customDir, `.${id}.png.tmp`)
      try {
        fs.mkdirSync(customDir, { recursive: true })
        fs.writeFileSync(upload, bytes)
        const result = await run('python3', [path.join(dir, 'oled.py'), '--check', upload, made], 30000)
        if (result.error || !fs.existsSync(made)) {
          const code = logic.pictureErrorCode(result.stdout)
          return res.status(400).json({ ok: false, error: code, message: logic.PICTURE_MESSAGES[code] })
        }
        fs.renameSync(made, path.join(customDir, `${id}.png`))
      } catch (error) {
        log.warn(`[oled] picture ${id}: ${error?.message ?? error}`)
        return res.status(500).json({ ok: false, error: 'failed', message: 'Das Bild ließ sich nicht speichern' })
      } finally {
        fs.rmSync(upload, { force: true })
        fs.rmSync(made, { force: true })
      }
      push(true)
      res.json({ ok: true, message: 'Bild gespeichert' })
    },
    { session: true },
  )

  // The original again ({ id }): the picture the user chose is removed
  host.route(
    'post',
    '/imagereset',
    (req, res) => {
      const id = String(req.body?.id ?? '')
      if (!logic.CHANGEABLE_IMAGES.includes(id)) return res.status(400).json({ ok: false, error: 'bad_id', message: 'Dieses Bild lässt sich nicht ändern' })
      fs.rmSync(path.join(customDir, `${id}.png`), { force: true })
      push(true)
      res.json({ ok: true, message: 'Das Original ist wieder da' })
    },
    { session: true },
  )

  // What the rotary knob is on while it chooses an album, a folder or an episode (the NFC extension sends it): { title, artist, index, count,
  // seconds } shows it where the information of the medium is, { clear: true } brings the picture of the player back. Not behind the login,
  // but only from the box itself.
  host.route('post', '/select', (req, res) => {
    const from = String(req.socket?.remoteAddress ?? '')
    // (the box's web server proxies to 8201: never from there, whatever header it sets)
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from) || req.headers['x-forwarded-for'] || req.socket?.localPort === 8201) return res.status(403).json({ ok: false })
    ui.select = logic.selectionOf(req.body, clock())
    if (ui.select) {
      // (a display that went off wakes for it)
      ui.wake = ui.select.until
      ui.idleSince = clock()
    }
    push(true)
    res.json({ ok: true })
  })

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
