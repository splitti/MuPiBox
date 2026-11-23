// OLED display: runs the driver (oled.py) as a child process of the server. The server talks to it by lines of JSON on its stdin
// (what to show) and reads its reports from stdout (ready, error). When it ends by itself - an error, a display that was pulled -
// it is started again later, at first quickly, then more slowly; a stop() ends it with "quit" so the picture stays until the next
// start (a restart of the extension must not blink), kill() with SIGTERM (the server ends: the driver switches the panel off - and
// shows its good-bye picture for a moment first when the box goes down).
'use strict'

const { spawn } = require('node:child_process')

// What a new start does not change by itself (I2C off, the package missing): tried again only now and then
const LASTING = new Set(['no_i2c', 'i2c_access', 'no_pil', 'no_python', 'bad_controller', 'bad_size', 'bad_address'])
const LASTING_RETRY_MS = 5 * 60 * 1000
const RETRY_FIRST_MS = 3000
const RETRY_MAX_MS = 60 * 1000
const STABLE_MS = 60 * 1000

/** The report of the driver as an object, or null if the line is none of its reports. */
function readEvent(line) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    return null
  }
  if (!event || typeof event !== 'object' || typeof event.event !== 'string') return null
  if (event.event === 'ready') return { event: 'ready', controller: String(event.controller ?? ''), address: String(event.address ?? '') }
  if (event.event === 'error') return { event: 'error', code: String(event.code ?? 'other').slice(0, 40), message: String(event.message ?? '').slice(0, 300) }
  return null
}

/**
 * `command` and `args` start the driver. onEvent(event) gets every report, onEnd(reason, isNew) is called each time it ended by itself.
 * `spawnFn`, `setTimer`, `clearTimer` and `now` are for the tests.
 */
function createDriver({ command, args, onEvent, onEnd = () => undefined, log = console, spawnFn = spawn, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  const state = { running: false, starts: 0, lastCode: '' }
  let child = null
  let stopped = false
  let retry = null
  let delay = RETRY_FIRST_MS
  let lastSaid = ''

  const launch = () => {
    retry = null
    if (stopped) return
    state.starts++
    let buffer = ''
    let lastCode = ''
    let lastMessage = ''
    const started = now()
    const proc = spawnFn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    child = proc
    state.running = true
    proc.stdin?.on?.('error', () => undefined) // (it ended: writing to it fails, the 'close' below is what counts)
    proc.stdout.on('data', (data) => {
      buffer += data.toString('utf8')
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        const event = line ? readEvent(line) : null
        if (event) {
          if (event.event === 'error') {
            lastCode = event.code
            lastMessage = event.message
          }
          try {
            onEvent(event)
          } catch (error) {
            log.warn(`[oled] handler failed: ${error}`)
          }
        }
        at = buffer.indexOf('\n')
      }
    })
    proc.stderr?.on?.('data', (data) => {
      lastMessage = String(data).trim().split('\n').pop().slice(0, 300) || lastMessage
    })
    proc.on('error', (error) => {
      // (no python3: spawn fails before there is a process; 'close' may not follow)
      if (child !== proc) return
      child = null
      state.running = false
      lastCode = lastCode || (error?.code === 'ENOENT' ? 'no_python' : 'other')
      lastMessage = lastMessage || String(error?.message ?? error)
      finish(proc, started, lastCode, lastMessage, -1)
    })
    proc.on('close', (code, signal) => {
      if (child !== proc) return
      child = null
      state.running = false
      finish(proc, started, lastCode, lastMessage, code ?? signal)
    })
  }

  const finish = (_proc, started, code, message, exit) => {
    if (stopped) return
    state.lastCode = code
    if (now() - started >= STABLE_MS) delay = RETRY_FIRST_MS
    const reason = code ? `${code}${message ? `: ${message}` : ''}` : `ended (${exit})`
    const isNew = reason !== lastSaid
    lastSaid = reason
    try {
      onEnd(reason, isNew, code)
    } catch (error) {
      log.warn(`[oled] handler failed: ${error}`)
    }
    const wait = LASTING.has(code) ? LASTING_RETRY_MS : delay
    delay = Math.min(delay * 2, RETRY_MAX_MS)
    retry = setTimer(launch, wait)
    retry?.unref?.()
  }

  return {
    start: () => {
      stopped = false
      if (!child && !retry) launch()
    },
    /** One line to the driver; false when it does not run. */
    send: (message) => {
      if (!child || !child.stdin || child.stdin.destroyed || child.stdin.writable === false) return false
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`)
        return true
      } catch {
        return false
      }
    },
    /** The extension ends (settings changed, the server restarts): the driver leaves the picture as it is - with `off` it switches
     * the panel off (another display follows, which may not answer). */
    stop: (off = false) => {
      stopped = true
      if (retry) {
        clearTimer(retry)
        retry = null
      }
      const proc = child
      child = null
      state.running = false
      if (!proc) return Promise.resolve()
      return new Promise((resolve) => {
        const done = () => resolve()
        proc.once?.('close', done)
        try {
          proc.stdin?.write?.(`${JSON.stringify(off ? { cmd: 'quit', off: true } : { cmd: 'quit' })}\n`)
          proc.stdin?.end?.()
        } catch {
          /* it ended already */
        }
        const killer = setTimer(() => {
          try {
            proc.kill('SIGTERM')
          } catch {
            /* gone */
          }
          done()
        }, 1500)
        killer?.unref?.()
      })
    },
    /** The server ends: SIGTERM, the driver switches the panel off (with its power-off picture first when the box goes down). */
    kill: () => {
      stopped = true
      if (retry) clearTimer(retry)
      try {
        child?.kill('SIGTERM')
      } catch {
        /* gone */
      }
    },
    state: () => ({ ...state }),
  }
}

module.exports = { createDriver, readEvent, LASTING }
