// NFC-Reader: runs the driver (pn5180.py) as a child process of the server and hands over what it reports. The driver says one JSON
// object per line; when it ends (an error, a reader that was pulled, a restart of the server) it is started again, a few seconds later,
// then more slowly. The pins and the SPI device are free again when stop() returns.
'use strict'

const { spawn, execFile } = require('node:child_process')
const { readEvent } = require('./logic.js')

/** The number of the gpiochip with the header pins, from `gpiodetect` ("gpiochip0 [pinctrl-rp1] (54 lines)"); 0 when it cannot be told. */
function headerChipNumber(gpiodetectOutput) {
  const chips = []
  for (const line of String(gpiodetectOutput ?? '').split('\n')) {
    const m = /^gpiochip(\d+)\s+\[([^\]]*)\]/.exec(line.trim())
    if (m) chips.push({ number: Number(m[1]), label: m[2] })
  }
  for (const label of [/^pinctrl-rp1$/, /^pinctrl-bcm2711$/, /^pinctrl-bcm2835$/, /^pinctrl-bcm/]) {
    const hit = chips.find((c) => label.test(c.label))
    if (hit) return hit.number
  }
  return 0
}

const detect = () =>
  new Promise((resolve) => {
    execFile('gpiodetect', [], { timeout: 5000 }, (error, stdout) => resolve(error ? '' : String(stdout)))
  })

/**
 * `command` and `args` start the driver; onEvent(event) gets every report; onEnd(reason) is called each time it has ended by itself
 * (before the new start is scheduled). `spawnFn` is for the tests.
 */
function createRunner({ command, args, onEvent, onEnd = () => undefined, log = console, spawnFn = spawn, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  const state = { running: false, starts: 0, lastExit: null }
  let child = null
  let stopped = false
  let retry = null
  let delay = 3000

  const launch = () => {
    if (stopped) return
    state.starts++
    let buffer = ''
    let lastError = ''
    const started = now()
    const proc = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    child = proc
    state.running = true
    proc.stdout.on('data', (data) => {
      buffer += data.toString('utf8')
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        if (line) {
          let event = null
          try {
            event = readEvent(JSON.parse(line))
          } catch {
            /* not one of its reports */
          }
          if (event) {
            try {
              onEvent(event)
            } catch (error) {
              log.warn(`[nfc] handler failed: ${error}`)
            }
          }
        }
        at = buffer.indexOf('\n')
      }
      if (buffer.length > 4000) buffer = ''
    })
    proc.stderr.on('data', (data) => {
      lastError = data.toString('utf8').trim().split('\n').pop().slice(0, 200)
    })
    const ended = (why) => {
      if (child !== proc) return
      child = null
      state.running = false
      if (stopped) return
      state.lastExit = lastError || why
      log.warn(`[nfc] the reader program ended (${state.lastExit}) - starting it again in ${Math.round(delay / 1000)} s`)
      try {
        onEnd(state.lastExit)
      } catch (error) {
        log.warn(`[nfc] handler failed: ${error}`)
      }
      // (it ran for a while: the next start is soon again; it ends at once every time: more and more slowly, up to a minute)
      if (now() - started > 30000) delay = 3000
      retry = setTimer(launch, delay)
      delay = Math.min(60000, delay * 2)
    }
    proc.on('error', (error) => ended(error.code === 'ENOENT' ? 'python3 is not installed' : String(error.message ?? error)))
    proc.on('exit', (code, signal) => ended(`exit ${code ?? signal}`))
  }

  return {
    state: () => ({ ...state }),
    start() {
      launch()
    },
    /** Ends the driver at once without waiting (the server itself ends). */
    kill() {
      stopped = true
      if (retry) clearTimer(retry)
      try {
        child?.kill('SIGTERM')
      } catch {
        /* gone meanwhile */
      }
    },
    stop() {
      stopped = true
      if (retry) clearTimer(retry)
      retry = null
      const proc = child
      child = null
      state.running = false
      if (!proc) return Promise.resolve()
      return new Promise((resolve) => {
        const force = setTimer(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* gone meanwhile */
          }
          resolve()
        }, 3000)
        proc.once('exit', () => {
          clearTimer(force)
          resolve()
        })
        try {
          proc.kill('SIGTERM')
        } catch {
          clearTimer(force)
          resolve()
        }
      })
    },
  }
}

module.exports = { createRunner, headerChipNumber, detect }
