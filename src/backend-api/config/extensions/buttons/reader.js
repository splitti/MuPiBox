// Buttons & GPIO Input: the levels of the pins, read with gpiomon (libgpiod, the package gpiod - on every MuPiBox, and it knows
// every Raspberry Pi, the 5 too). The buttons connect their pin to GND; the pin's own pull-up holds it high while the button is up.
//
// libgpiod changed its tools with version 2 (Debian 13 "Trixie"); Debian 12 "Bookworm" has version 1:
//   v1: gpiomon --bias=pull-up --line-buffered --format="%o %e" <chip> <pin>...     %e: 0 falling, 1 rising
//   v2: gpiomon --chip <chip> --bias pull-up --edges both --format "%o %E" <pin>... %E: falling, rising
// What depends on the version is in small functions of its own (tested without a box); the rest starts gpiomon and keeps it running.
'use strict'

const { spawn, execFile } = require('node:child_process')

/** The major version of the gpiomon that is installed (`gpiomon --version`: "gpiomon (libgpiod) v2.2.1"); 0 when it cannot be read. */
function gpiodMajor(versionOutput) {
  const m = /\bv(\d+)\.\d+/.exec(String(versionOutput ?? ''))
  return m ? Number(m[1]) : 0
}

/**
 * The chip of the header pins from `gpiodetect` ("gpiochip0 [pinctrl-rp1] (54 lines)"): the RP1 of a Pi 5 (gpiochip4 with an older
 * kernel, gpiochip0 now), else the SoC's own of the others. Not found: gpiochip0.
 */
function headerChip(gpiodetectOutput) {
  const chips = []
  for (const line of String(gpiodetectOutput ?? '').split('\n')) {
    const m = /^(gpiochip\d+)\s+\[([^\]]*)\]/.exec(line.trim())
    if (m) chips.push({ name: m[1], label: m[2] })
  }
  for (const label of [/^pinctrl-rp1$/, /^pinctrl-bcm2711$/, /^pinctrl-bcm2835$/, /^pinctrl-bcm/]) {
    const hit = chips.find((c) => label.test(c.label))
    if (hit) return hit.name
  }
  return 'gpiochip0'
}

/** The arguments of gpiomon for these pins: both edges, the pull-up on, one line per edge ("<pin> <edge>"), written at once. */
function gpiomonArgs(major, chip, pins) {
  const lines = pins.map(String)
  if (major >= 2) return ['--chip', chip, '--bias', 'pull-up', '--edges', 'both', '--format', '%o %E', ...lines]
  return ['--bias=pull-up', '--line-buffered', '--format=%o %e', chip, ...lines]
}

/** One line of gpiomon -> { pin, pressed } (a falling edge is a press: the button pulls the pin to GND); null for anything else. */
function parseEdge(major, line) {
  const m = /^\s*(\d{1,2})\s+(\S+)\s*$/.exec(String(line ?? ''))
  if (!m) return null
  const pin = Number(m[1])
  const edge = m[2]
  if (major >= 2) {
    if (edge !== 'falling' && edge !== 'rising') return null
    return { pin, pressed: edge === 'falling' }
  }
  if (edge !== '0' && edge !== '1') return null
  return { pin, pressed: edge === '0' }
}

const run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout ?? ''}${stderr ?? ''}` }))
  })

/**
 * Watches the pins: onEdge(pin, pressed) for every edge. gpiomon is started again when it ends by itself (a few seconds later, then
 * more slowly); what it said last is kept as the error for the state. stop() ends it and waits until the pins are free again.
 */
function createReader({ pins, onEdge, log = console, spawnFn = spawn, runFn = run }) {
  const state = { running: false, error: null, chip: null, version: null, starts: 0 }
  let child = null
  let stopped = false
  let retry = null
  let delay = 2000

  const launch = (major, chip) => {
    if (stopped) return
    state.starts++
    let buffer = ''
    let lastError = ''
    const started = Date.now()
    const proc = spawnFn('gpiomon', gpiomonArgs(major, chip, pins), { stdio: ['ignore', 'pipe', 'pipe'] })
    child = proc
    state.running = true
    proc.stdout.on('data', (data) => {
      buffer += data.toString('utf8')
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const edge = parseEdge(major, buffer.slice(0, at))
        buffer = buffer.slice(at + 1)
        // (a pin that was not asked for cannot come - but nothing of gpiomon is taken on trust)
        if (edge && pins.includes(edge.pin)) {
          state.error = null
          try {
            onEdge(edge.pin, edge.pressed)
          } catch (error) {
            log.warn(`[buttons] edge handler failed: ${error}`)
          }
        }
        at = buffer.indexOf('\n')
      }
      if (buffer.length > 1000) buffer = ''
    })
    proc.stderr.on('data', (data) => {
      lastError = data.toString('utf8').trim().split('\n').pop().slice(0, 200)
    })
    const ended = (why) => {
      if (child !== proc) return
      child = null
      state.running = false
      if (stopped) return
      state.error = lastError || why
      log.warn(`[buttons] gpiomon ended (${state.error}) - starting it again in ${Math.round(delay / 1000)} s`)
      // (it ran for a while: the next start is soon again; it ends at once every time: more and more slowly, up to a minute)
      if (Date.now() - started > 30000) delay = 2000
      retry = setTimeout(() => launch(major, chip), delay)
      delay = Math.min(60000, delay * 2)
    }
    proc.on('error', (error) => ended(error.code === 'ENOENT' ? 'gpiomon is not installed (package gpiod)' : String(error.message ?? error)))
    proc.on('exit', (code, signal) => ended(`exit ${code ?? signal}`))
  }

  return {
    state: () => ({ ...state, pins: [...pins] }),
    async start() {
      if (pins.length === 0) return
      const version = await runFn('gpiomon', ['--version'])
      const major = gpiodMajor(version.out)
      if (!major) {
        state.error = 'gpiomon is not installed (package gpiod)'
        log.warn(`[buttons] ${state.error}`)
        return
      }
      const chip = headerChip((await runFn('gpiodetect', [])).out)
      state.version = major
      state.chip = chip
      launch(major, chip)
    },
    /** Ends gpiomon at once, without waiting (the server itself ends). */
    kill() {
      stopped = true
      if (retry) clearTimeout(retry)
      try {
        child?.kill('SIGTERM')
      } catch {
        /* gone meanwhile */
      }
    },
    stop() {
      stopped = true
      if (retry) clearTimeout(retry)
      retry = null
      const proc = child
      child = null
      state.running = false
      if (!proc) return Promise.resolve()
      return new Promise((resolve) => {
        // (the pins are free once it is gone; a gpiomon that does not go is killed)
        const force = setTimeout(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* gone meanwhile */
          }
          resolve()
        }, 1500)
        proc.once('exit', () => {
          clearTimeout(force)
          resolve()
        })
        try {
          proc.kill('SIGTERM')
        } catch {
          clearTimeout(force)
          resolve()
        }
      })
    },
  }
}

module.exports = { gpiodMajor, headerChip, gpiomonArgs, parseEdge, createReader }
