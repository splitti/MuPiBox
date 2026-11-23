// Buttons & GPIO Input: the settings of the extension as a list of inputs. The settings are flat (b1Pin, b1Short ... t1PinA ...),
// as the app stores them; what comes out is what the rest works with - and only what makes sense: a pin once, a twin with both
// of its pins, actions that exist.
'use strict'

// how many single buttons and twin buttons the settings have room for (the manifest has the same numbers, see test/manifest-source.js)
const BUTTONS = 6
const TWINS = 2
const TWIN_KINDS = ['short_a', 'short_b', 'short_ab', 'long_a', 'long_b', 'long_ab']

// what a press can do (the names the settings store)
const ACTIONS = ['none', 'toggle', 'next', 'prev', 'replay', 'volUp', 'volDown', 'ffwd', 'rewind', 'shuffle', 'repeat', 'output', 'address', 'screen', 'stop', 'shutdown']

const isPin = (v) => Number.isInteger(v) && v >= 2 && v <= 27
const action = (v) => (ACTIONS.includes(v) ? v : 'none')
// (how much "louder" and "quieter" change the volume, in percent: every action has its own step)
const step = (v) => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : 5)
// (the hold time in seconds: half a second to five)
const holdMs = (v) => Math.round(Math.min(5, Math.max(0.3, Number.isFinite(v) ? v : 1)) * 1000)

/**
 * settings -> { buttons: [{ name, pin, short, long, steps: { short, long }, holdMs, repeat }],
 *               twins: [{ name, a, b, actions: { short_a ... }, steps: { short_a ... }, holdMs, repeat }],
 *               pins: [every pin once], problems: [what was left out and why] }
 */
function readInputs(settings) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const out = { buttons: [], twins: [], pins: [], problems: [] }
  const take = (pin, name) => {
    if (out.pins.includes(pin)) {
      out.problems.push(`${name}: GPIO ${pin} is used twice`)
      return false
    }
    out.pins.push(pin)
    return true
  }
  for (let n = 1; n <= BUTTONS; n++) {
    const pin = s[`b${n}Pin`]
    if (!isPin(pin)) continue
    const name = `button ${n}`
    const short = action(s[`b${n}Short`])
    const long = action(s[`b${n}Long`])
    // (a button that does nothing holds no pin)
    if (short === 'none' && long === 'none') continue
    if (!take(pin, name)) continue
    out.buttons.push({ name, pin, short, long, steps: { short: step(s[`b${n}ShortStep`]), long: step(s[`b${n}LongStep`]) }, holdMs: holdMs(s[`b${n}Hold`]), repeat: s[`b${n}Repeat`] === true })
  }
  for (let n = 1; n <= TWINS; n++) {
    const a = s[`t${n}PinA`]
    const b = s[`t${n}PinB`]
    const name = `twin ${n}`
    if (!isPin(a) && !isPin(b)) continue
    if (!isPin(a) || !isPin(b)) {
      out.problems.push(`${name}: needs both of its pins`)
      continue
    }
    if (a === b) {
      out.problems.push(`${name}: its two buttons are on the same pin`)
      continue
    }
    const actions = {
      short_a: action(s[`t${n}ShortA`]),
      short_b: action(s[`t${n}ShortB`]),
      short_ab: action(s[`t${n}ShortAB`]),
      long_a: action(s[`t${n}LongA`]),
      long_b: action(s[`t${n}LongB`]),
      long_ab: action(s[`t${n}LongAB`]),
    }
    if (TWIN_KINDS.every((k) => actions[k] === 'none')) continue
    if (out.pins.includes(a) || out.pins.includes(b)) {
      out.problems.push(`${name}: GPIO ${out.pins.includes(a) ? a : b} is used twice`)
      continue
    }
    out.pins.push(a, b)
    const steps = {
      short_a: step(s[`t${n}ShortAStep`]),
      short_b: step(s[`t${n}ShortBStep`]),
      short_ab: step(s[`t${n}ShortABStep`]),
      long_a: step(s[`t${n}LongAStep`]),
      long_b: step(s[`t${n}LongBStep`]),
      long_ab: step(s[`t${n}LongABStep`]),
    }
    out.twins.push({ name, a, b, actions, steps, holdMs: holdMs(s[`t${n}Hold`]), repeat: s[`t${n}Repeat`] === true })
  }
  return out
}

module.exports = { BUTTONS, TWINS, TWIN_KINDS, ACTIONS, readInputs }
