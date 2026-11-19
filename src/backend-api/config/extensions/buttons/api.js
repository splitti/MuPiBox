// Buttons & GPIO Input - the API part (runs in the server of the box): physical buttons on GPIO pins control the box.
//
//   settings (which pin does what, chosen in the app)  ->  inputs.js
//   the levels of the pins (gpiomon)                   ->  reader.js
//   what a press means (short, long, both buttons)     ->  logic.js
//   what an action does (the player, the output)       ->  actions.js
//
// The pins are the user's choice (settings of the type "gpio": the box offers only pins nothing else holds). When the settings
// are saved, the pins are let go and taken anew.
'use strict'

const { readInputs } = require('./inputs.js')
const { createDebouncer, createButton, createTwin } = require('./logic.js')
const { createReader } = require('./reader.js')
const { createActions } = require('./actions.js')

/**
 * Everything between the pins and the actions for one set of settings. `makeReader` and `actions` are handed in (the tests have
 * their own); feed(pin, pressed) is what the reader calls for every edge.
 */
function createRuntime({ inputs, actions, makeReader, timers, log = console, onEvent = () => undefined }) {
  const debouncers = new Map()
  const machines = []
  const fire = (input, kind, action, step) => {
    onEvent({ at: Date.now(), input, kind, action })
    if (action !== 'none') actions.do(action, step)
  }
  for (const b of inputs.buttons) {
    const machine = createButton({
      holdMs: b.holdMs,
      repeat: b.repeat,
      hasLong: b.long !== 'none',
      timers,
      fire: (kind) => fire(b.name, kind, kind === 'long' ? b.long : b.short, b.steps[kind === 'long' ? 'long' : 'short']),
    })
    machines.push(machine)
    debouncers.set(b.pin, createDebouncer({ timers, onChange: (pressed) => (pressed ? machine.press() : machine.release()) }))
  }
  for (const t of inputs.twins) {
    const machine = createTwin({ holdMs: t.holdMs, repeat: t.repeat, timers, fire: (kind) => fire(t.name, kind, t.actions[kind], t.steps[kind]) })
    machines.push(machine)
    for (const which of ['a', 'b']) {
      debouncers.set(t[which], createDebouncer({ timers, onChange: (pressed) => (pressed ? machine.press(which) : machine.release(which)) }))
    }
  }
  const feed = (pin, pressed) => debouncers.get(pin)?.feed(pressed)
  const reader = makeReader({ pins: [...inputs.pins], onEdge: feed, log })
  return {
    feed,
    start: () => reader.start(),
    async stop() {
      for (const d of debouncers.values()) d.stop()
      for (const m of machines) m.stop()
      await reader.stop()
    },
    kill: () => reader.kill(),
    state: () => reader.state(),
  }
}

exports.activate = (host) => {
  const log = host.log ?? console
  let runtime = null
  let problems = []
  const events = []
  // (one change after the other: the pins of the settings before are free before the new ones are taken)
  let chain = Promise.resolve()
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        if (runtime) await runtime.stop()
        runtime = null
        const inputs = readInputs(settings)
        problems = inputs.problems
        for (const p of problems) log.warn(`[buttons] ${p}`)
        if (inputs.pins.length === 0) return
        runtime = createRuntime({
          inputs,
          actions: createActions({ playerUrl: host.playerUrl, apiUrl: host.apiUrl, log }),
          makeReader: createReader,
          log,
          onEvent: (event) => {
            events.push(event)
            if (events.length > 20) events.shift()
          },
        })
        await runtime.start()
        log.info(`[buttons] watching GPIO ${inputs.pins.join(', ')} (${inputs.buttons.length} button(s), ${inputs.twins.length} twin(s))`)
      })
      .catch((error) => log.warn(`[buttons] not started: ${error?.message ?? error}`))
    return chain
  }
  // (the server ends: gpiomon must not stay behind and hold the pins)
  process.once('exit', () => runtime?.kill())
  if (typeof host.onSettings === 'function') host.onSettings(apply)
  Promise.resolve(host.settings()).then(apply)

  // What it watches and what was pressed last (with the login of the parents): to see whether a button arrives
  host.route(
    'get',
    '/state',
    (_req, res) => {
      res.json({ ...(runtime ? runtime.state() : { running: false, error: null, pins: [] }), problems, events })
    },
    { session: true },
  )
}

exports._test = { createRuntime }
