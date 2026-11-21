// Touch display (Waveshare 2.8 inch Capacitive Touch LCD) - the API part (runs in the server of the box): starts the driver (touchlcd.py,
// Python: Node has no way to speak SPI or I2C), reads the library the way the box's own display does and tells the driver which cover to
// show. The levels: the artists, then the albums of an artist (a series of albums is one more level); a tap on an album plays it, a swipe
// up with two fingers goes one level up, a swipe to the left or right turns the cube to the next or previous face, a swipe to the left or
// right with two fingers goes on to the next or previous category (all, music, audiobooks, other, NAS).
//
//   settings (pins, turn, brightness ...)  ->  logic.js readConfig
//   the driver program                     ->  driver.js, touchlcd.py, lcd.py, cube.py, gesture.py
//   the library                            ->  GET /api/data (Spotify, podcasts, radio, TIDAL ...), /api/library/artists and /children (SD card),
//                                              /api/nas/artists and /children (NAS)
//   what is played                         ->  GET <player>/current/<path>?src=touchlcd (the path as the box's display builds it)
//   the status block of the page           ->  GET /state, POST /spion and POST /iicon (switch SPI / I2C on)
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const logic = require('./logic.js')
const { createDriver } = require('./driver.js')

const TOP_RETRY_MS = 15000
const TOP_REFRESH_MS = 60000
const CHILDREN_KEEP_MS = 120000
const NIGHT_MS = 30000
const NAS_TIMEOUT_MS = 20000
const BOARD_CATEGORIES = ['music', 'audiobook', 'other']

exports.activate = (host) => {
  const log = host.log ?? console
  const deps = host.deps ?? {}
  const dir = host.dir ?? __dirname
  const exec = deps.execFile ?? execFile
  const request = deps.fetch ?? fetch
  const clock = deps.now ?? Date.now

  let config = logic.readConfig({})
  let shown = 'all' // the category on the display: the one of the settings, or the one a two-finger swipe chose (kept in the data folder)
  let settingsApplied = false
  let driver = null
  let started = null // the configuration the running driver was started with
  let phase = { phase: 'starting', code: '' }
  let night = { share: 0 }
  let appliedBrightness = null
  // the levels: [{ nodes, index, title }], the artists first
  let stack = []
  let topAt = 0
  let dataVersion = ''
  let busy = false // a tap is being answered
  const childrenKept = new Map() // node id -> { at, nodes }

  // ---- the box: files and commands --------------------------------------------------------------------------------------------
  const readText = (file) => {
    try {
      return file ? fs.readFileSync(file, 'utf8') : ''
    } catch {
      return '' // nothing to read
    }
  }
  const run = (command, args, timeout = 60000) =>
    new Promise((resolve) => {
      exec(command, args, { timeout }, (error, stdout) => resolve({ error, stdout: String(stdout ?? '') }))
    })
  // One command as the user dietpi (G_SUDO inside: the way the core and the other extensions do it)
  const asDietpi = (commands) => run('sudo', ['-n', 'su', '-', 'dietpi', '-c', `. /boot/dietpi/func/dietpi-globals && ${commands.join(' && ')}`])
  const inject = (key, line, file) => `G_SUDO G_CONFIG_INJECT '${key}' '${line}' ${file}`
  const bootConfigFile = () => ['/boot/firmware/config.txt', '/boot/config.txt'].find((file) => fs.existsSync(file))
  // (a bus is on when its device is there; "restart" when the boot configuration has it on and the device is not there yet)
  const busState = (device, line) => {
    if (fs.existsSync(device)) return 'on'
    return new RegExp(`^\\s*${line}`, 'm').test(readText(bootConfigFile())) ? 'restart' : 'off'
  }
  const spiState = () => busState(`/dev/spidev${config.spi}`, 'dtparam=spi=on')
  const i2cState = () => busState(`/dev/i2c-${config.i2cBus}`, 'dtparam=i2c_arm=on')

  // ---- the library ------------------------------------------------------------------------------------------------------------
  const getJson = async (route, timeout = 8000) => {
    try {
      const response = await request(`${host.apiUrl}${route}`, { signal: AbortSignal.timeout(timeout) })
      return response.ok ? await response.json() : null
    } catch {
      return null
    }
  }

  const loadTop = async (category = shown) => {
    const wantLibrary = category === 'all' ? BOARD_CATEGORIES : BOARD_CATEGORIES.filter((c) => c === category)
    // (NAS folders sit in the category the parent gave them - "nas" is only the ones without one: each tab is asked on its own)
    const wantNas = category === 'all' ? [...BOARD_CATEGORIES, 'nas'] : BOARD_CATEGORIES.includes(category) || category === 'nas' ? [category] : []
    const [data, ...lists] = await Promise.all([
      category === 'nas' ? Promise.resolve([]) : getJson('/api/data'),
      ...wantLibrary.map((c) => getJson(`/api/library/artists?category=${c}`)),
      ...wantNas.map((c) => getJson(`/api/nas/artists?category=${c}`, NAS_TIMEOUT_MS)),
    ])
    const nasLists = lists.splice(wantLibrary.length)
    const nodes = logic.mergeNodes([
      logic.dataNodes(data, category === 'nas' ? 'all' : category),
      ...lists.map((entries) => logic.folderNodes(entries, false, { top: true })),
      ...nasLists.map((entries) => logic.folderNodes(entries, true, { top: true })),
    ])
    // (a library that cannot be read answers nothing: what is shown stays)
    if (nodes.length === 0 && (data === null || !Array.isArray(data)) && lists.every((l) => l === null) && nasLists.every((l) => l === null)) return null
    return nodes
  }

  const childrenOf = async (node) => {
    if (Array.isArray(node.children)) return node.children
    if (!node.via) return []
    const kept = childrenKept.get(node.id)
    if (kept && clock() - kept.at < CHILDREN_KEEP_MS) return kept.nodes
    const nas = node.via.source === 'nas'
    const entries = await getJson(`${nas ? '/api/nas/children' : '/api/library/children'}?path=${encodeURIComponent(node.via.path)}`, nas ? NAS_TIMEOUT_MS : 8000)
    if (!Array.isArray(entries)) return null
    const nodes = logic.folderNodes(entries, nas).slice(0, logic.ALBUMS_MAX)
    childrenKept.set(node.id, { at: clock(), nodes })
    for (const old of [...childrenKept.keys()].slice(0, Math.max(0, childrenKept.size - 30))) childrenKept.delete(old)
    return nodes
  }

  const levelNow = () => stack[stack.length - 1] ?? null
  const show = (transition = 'none') => {
    const level = levelNow()
    if (!driver || !level) return false
    return driver.send({ cmd: 'view', faces: logic.facesOf(level.nodes, level.index, host.apiUrl), transition })
  }

  // The artists (again): kept where the finger was - on the same artist if it is still there, and on its level
  const refreshTop = async () => {
    topAt = clock()
    const nodes = await loadTop()
    if (!nodes || (nodes.length === 0 && stack.length === 0)) return false
    if (stack.length === 0) {
      stack = [{ nodes, index: 0, title: '' }]
    } else {
      const was = stack[0].nodes[stack[0].index]?.id
      const at = nodes.findIndex((node) => node.id === was)
      stack[0] = { nodes, index: at >= 0 ? at : Math.min(stack[0].index, Math.max(0, nodes.length - 1)), title: '' }
      // (the library changed under a deeper level: its faces are the old ones until the finger goes up; the cover may be gone)
    }
    childrenKept.clear()
    if (stack.length === 1) show('none')
    return true
  }

  // ---- what the finger did -------------------------------------------------------------------------------------------------------
  const player = async (command) => {
    try {
      const response = await request(`${host.playerUrl}/${command}${command.includes('?') ? '&' : '?'}src=touchlcd`, { signal: AbortSignal.timeout(5000) })
      return response.ok
    } catch {
      return false
    }
  }

  const turn = (dir) => {
    const level = levelNow()
    if (!level || level.nodes.length < 2) return
    level.index = (level.index + (dir === 'next' ? 1 : -1) + level.nodes.length) % level.nodes.length
    show('none')
  }

  const open = async () => {
    const level = levelNow()
    const node = level?.nodes[level.index]
    if (!node || busy) return
    busy = true
    try {
      if (node.kind === 'album') {
        const target = logic.playerPathOf(node.media)
        if (!target) return void driver?.send({ cmd: 'flash' })
        driver?.send({ cmd: 'flash' })
        const ok = await player(`current/${target}${logic.startQuery(target, node.media)}`)
        if (!ok) log.warn?.(`[touchlcd] the player did not take the start of ${node.label}`)
        return
      }
      driver?.send({ cmd: 'press' })
      const nodes = await childrenOf(node)
      if (!nodes || nodes.length === 0) return void show('none') // (nothing to open: the cover is back)
      stack.push({ nodes, index: 0, title: node.label })
      show('zoom-in')
    } finally {
      busy = false
    }
  }

  // ---- the category the display shows -------------------------------------------------------------------------------------------
  const savedFile = () => (host.dataDir ? path.join(host.dataDir, 'category.json') : '')
  const savedCategory = () => {
    try {
      const saved = JSON.parse(readText(savedFile()))
      return saved?.base === config.category && logic.CATEGORIES.includes(saved.current) ? saved.current : null
    } catch {
      return null // nothing saved
    }
  }
  const saveCategory = () => {
    const file = savedFile()
    if (!file) return
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify({ base: config.category, current: shown }))
    } catch (error) {
      log.warn?.(`[touchlcd] the chosen category could not be kept: ${error?.message ?? error}`)
    }
  }
  // two fingers to the side: on to the next category that has something in it (the names of the box tabs); the cover of its first artist
  const switchCategory = async (dir) => {
    if (busy || !driver) return
    busy = true
    try {
      for (const candidate of logic.categoriesAfter(shown, dir)) {
        const nodes = await loadTop(candidate)
        if (!nodes || nodes.length === 0) continue
        shown = candidate
        stack = [{ nodes, index: 0, title: '' }]
        childrenKept.clear()
        topAt = clock()
        saveCategory()
        show('none')
        driver?.send({ cmd: 'banner', text: logic.CATEGORY_LABELS[candidate] })
        return
      }
      driver?.send({ cmd: 'banner', text: logic.CATEGORY_LABELS[shown] }) // (nothing else has anything in it: it stays, and says so)
    } finally {
      busy = false
    }
  }

  const up = () => {
    if (stack.length < 2) return
    stack.pop()
    show('zoom-out')
  }

  const onEvent = (event) => {
    switch (event.event) {
      case 'ready':
        phase = { phase: 'ready', code: '' }
        appliedBrightness = null
        syncBrightness()
        if (stack.length === 0) void refreshTop()
        else show('none')
        break
      case 'error':
        phase = { phase: 'error', code: event.code }
        break
      case 'nav':
        turn(event.dir)
        break
      case 'tap':
        void open()
        break
      case 'up':
        up()
        break
      case 'category':
        void switchCategory(event.dir)
        break
      default:
    }
  }

  // ---- the driver -----------------------------------------------------------------------------------------------------------------
  const detectChip = async () => logic.headerChipNumber((await run('gpiodetect', [], 5000)).stdout)
  const startDriver = async () => {
    const chip = deps.chip ?? (await detectChip())
    appliedBrightness = logic.eveningBrightness(config, night.share)
    started = config
    phase = { phase: 'starting', code: '' }
    driver = createDriver({
      command: 'python3',
      args: [path.join(dir, 'touchlcd.py'), ...logic.driverArgs(config, chip, appliedBrightness)],
      onEvent,
      onEnd: (reason, isNew, code) => {
        if (phase.phase !== 'error') phase = { phase: 'error', code: code || 'other' }
        if (isNew) log.warn(`[touchlcd] display program: ${reason}`)
      },
      log,
      ...(deps.spawnFn ? { spawnFn: deps.spawnFn } : {}),
      ...(deps.setTimer ? { setTimer: deps.setTimer, clearTimer: deps.clearTimer } : {}),
    })
    driver.start()
    log.info?.(`[touchlcd] display started (SPI ${config.spi}, DC ${config.dc}, RST ${config.rst})`)
  }
  const stopDriver = async (off = false) => {
    const old = driver
    driver = null
    started = null
    if (old) await old.stop(off)
  }

  const readNight = async () => {
    night = { share: 0 }
    if (!config.nightDim || typeof host.nightDim !== 'function') return
    try {
      const answer = await host.nightDim()
      if (typeof answer?.share === 'number') night = { share: answer.share }
    } catch (error) {
      log.warn?.(`[touchlcd] evening: ${error?.message ?? error}`)
    }
  }
  function syncBrightness() {
    const wanted = logic.eveningBrightness(config, night.share)
    if (driver && wanted !== appliedBrightness && driver.send({ cmd: 'brightness', value: wanted })) appliedBrightness = wanted
  }

  // ---- the settings ---------------------------------------------------------------------------------------------------------------
  let chain = Promise.resolve()
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        const before = config
        config = logic.readConfig(settings ?? {})
        // (the settings name a category: that is the one shown - until a swipe chooses another, which is kept for the next start)
        if (!settingsApplied || before.category !== config.category) shown = (!settingsApplied && savedCategory()) || config.category
        settingsApplied = true
        await readNight()
        if (config.problem) {
          await stopDriver(true)
          phase = { phase: 'error', code: config.problem }
          return
        }
        if (before.category !== config.category) {
          stack = []
          childrenKept.clear()
        }
        if (!driver || logic.needsRestart(started ?? before, config)) {
          await stopDriver(false)
          await startDriver()
        } else {
          syncBrightness()
          if (before.category !== config.category) await refreshTop()
        }
      })
      .catch((error) => log.warn(`[touchlcd] not started: ${error?.message ?? error}`))
    return chain
  }
  process.once('exit', () => driver?.kill())
  if (typeof host.onSettings === 'function') host.onSettings(apply)
  Promise.resolve(host.settings()).then(apply)

  // the artists again now and then (an empty library after the start: soon again), the evening, and a changed library
  const timer = setInterval(async () => {
    try {
      if (phase.phase !== 'ready') return
      const empty = stack.length === 0
      if (empty && clock() - topAt >= TOP_RETRY_MS) return void (await refreshTop())
      if (!empty && stack.length === 1 && clock() - topAt >= TOP_REFRESH_MS) {
        const version = JSON.stringify(await getJson('/api/data-version'))
        if (version !== dataVersion) {
          dataVersion = version
          await refreshTop()
        } else topAt = clock()
      }
    } catch (error) {
      log.warn?.(`[touchlcd] library: ${error?.message ?? error}`)
    }
  }, 5000)
  timer.unref?.()
  const nightTimer = setInterval(async () => {
    await readNight()
    syncBrightness()
  }, NIGHT_MS)
  nightTimer.unref?.()

  // ---- what the page of the extension shows and asks -------------------------------------------------------------------------------
  host.route(
    'get',
    '/state',
    (_req, res) => {
      const level = levelNow()
      const rows = logic.statusRows({
        config,
        phase: phase.phase,
        code: phase.code,
        spi: spiState(),
        i2c: i2cState(),
        level: level ? { depth: stack.length, count: level.nodes.length, title: level.title } : null,
      })
      res.json({ rows, dimmed: config.nightDim && night.share > 0 })
    },
    { session: true },
  )

  // SPI on / I2C on: the lines of the boot configuration (DietPi's G_CONFIG_INJECT); the bus is there after the next restart
  const switchOn = (name, injections, isOn) => async (_req, res) => {
    if (isOn() !== 'off') return res.json({ ok: true, message: `${name} ist schon eingeschaltet.` })
    const file = bootConfigFile()
    if (!file) return res.status(500).json({ ok: false, error: 'no_config', message: `${name} ließ sich nicht einschalten.` })
    const { error } = await asDietpi(injections(file))
    if (error || isOn() === 'off') {
      log.warn(`[touchlcd] ${name} did not switch on: ${error?.message ?? 'the result is not in the configuration'}`)
      return res.status(500).json({ ok: false, error: 'failed', message: `${name} ließ sich nicht einschalten.` })
    }
    log.info?.(`[touchlcd] ${name} switched on in the boot configuration (the box has to restart)`)
    res.json({ ok: true, message: `${name} ist eingeschaltet. Die Box muss neu starten.` })
  }
  host.route('post', '/spion', switchOn('SPI', (file) => [inject('dtparam=spi=', 'dtparam=spi=on', file)], spiState), { session: true })
  host.route(
    'post',
    '/iicon',
    switchOn('I2C', (file) => [inject('dtparam=i2c_arm=', 'dtparam=i2c_arm=on', file), inject('i2c-dev', 'i2c-dev', '/etc/modules')], i2cState),
    { session: true },
  )

  // (for the tests)
  return { apply, onEvent, refreshTop, levelNow: () => levelNow(), driverState: () => driver?.state() ?? null }
}
