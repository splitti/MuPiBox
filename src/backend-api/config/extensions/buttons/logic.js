// Buttons & GPIO Input: what a press means. No GPIO and no player in here - levels come in, the names of what happened go out
// ("short", "long_ab" ...), and the clock is handed in (timers.set / timers.clear), so all of it runs in a test without a box.
'use strict'

// how often a held button repeats its action (hold_repeat)
const REPEAT_MS = 250
// a level counts once it stayed for this long: the contacts of a button bounce for a few milliseconds
const DEBOUNCE_MS = 25

const realTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }

/** The level of one pin without the bounce: `feed(pressed)` with every edge, `onChange(pressed)` once the level held for `ms`. */
function createDebouncer({ ms = DEBOUNCE_MS, onChange, timers = realTimers }) {
  let stable = false
  let wanted = false
  let pending = null
  return {
    feed(pressed) {
      wanted = pressed === true
      if (pending !== null) timers.clear(pending)
      pending = null
      if (wanted === stable) return
      pending = timers.set(() => {
        pending = null
        if (wanted === stable) return
        stable = wanted
        onChange(stable)
      }, ms)
    },
    stop() {
      if (pending !== null) timers.clear(pending)
      pending = null
    },
  }
}

/**
 * One button with a short and a long press ("dual action").
 *
 * With a long action: the short one fires when the button is let go before the hold time - nobody knows before how much
 * longer it will be held - and the long one as soon as the hold time is reached; with `repeat` the long one fires again and
 * again while the button stays down.
 * Without a long action there is nothing to wait for: the short one fires at once when the button goes down, and with `repeat`
 * again and again once it was held for the hold time (louder ... louder ... louder).
 *
 * fire(kind): 'short' | 'long'
 */
function createButton({ holdMs, repeat = false, repeatMs = REPEAT_MS, hasLong = true, fire, timers = realTimers }) {
  let down = false
  let longFired = false
  let timer = null
  const clear = () => {
    if (timer !== null) timers.clear(timer)
    timer = null
  }
  const again = (kind) => {
    timer = timers.set(() => {
      fire(kind)
      again(kind)
    }, repeatMs)
  }
  return {
    press() {
      if (down) return
      down = true
      longFired = false
      clear()
      if (!hasLong) {
        fire('short')
        if (repeat) {
          timer = timers.set(() => {
            fire('short')
            again('short')
          }, holdMs)
        }
        return
      }
      timer = timers.set(() => {
        timer = null
        longFired = true
        fire('long')
        if (repeat) again('long')
      }, holdMs)
    },
    release() {
      if (!down) return
      down = false
      clear()
      if (hasLong && !longFired) fire('short')
    },
    stop: clear,
  }
}

/**
 * Two buttons, six actions ("twin button"): each one alone, short or long, and both together, short or long.
 *
 * A short press fires when the buttons are let go (the second one may still come), a long one when the hold time is reached.
 * Both count as pressed together when the second goes down while the first is still held and nothing has fired yet; the hold
 * time starts anew then. `repeat` repeats the long action of a single button while it stays down - never the one of both.
 * After a long action nothing more happens until both buttons are up again.
 *
 * fire(kind): 'short_a' | 'short_b' | 'short_ab' | 'long_a' | 'long_b' | 'long_ab'
 */
function createTwin({ holdMs, repeat = false, repeatMs = REPEAT_MS, fire, timers = realTimers }) {
  const down = { a: false, b: false }
  // which press this is ('a', 'b', 'ab'; null: no button down) and whether its long action has fired
  let mode = null
  let done = false
  let timer = null
  const clear = () => {
    if (timer !== null) timers.clear(timer)
    timer = null
  }
  const again = (kind) => {
    timer = timers.set(() => {
      fire(kind)
      again(kind)
    }, repeatMs)
  }
  const arm = () => {
    clear()
    const armed = mode
    timer = timers.set(() => {
      timer = null
      done = true
      fire(`long_${armed}`)
      if (repeat && armed !== 'ab') again(`long_${armed}`)
    }, holdMs)
  }
  const changed = () => {
    if (!down.a && !down.b) {
      clear()
      const was = mode
      const fired = done
      mode = null
      done = false
      if (was && !fired) fire(`short_${was}`)
      return
    }
    if (done) {
      // (a long action that repeats goes on only while its own button is down)
      if (mode !== 'ab' && !down[mode]) clear()
      return
    }
    if (down.a && down.b) {
      // (also when one was let go and pressed again: the hold time of both starts anew)
      if (mode !== 'ab' || timer === null) {
        mode = 'ab'
        arm()
      }
      return
    }
    if (mode === 'ab') {
      // (one of the two was let go: no long press of both any more - the short one fires when the other is up too)
      clear()
      return
    }
    if (mode === null) {
      mode = down.a ? 'a' : 'b'
      arm()
    }
  }
  const set = (which, value) => {
    if ((which !== 'a' && which !== 'b') || down[which] === value) return
    down[which] = value
    changed()
  }
  return { press: (which) => set(which, true), release: (which) => set(which, false), stop: clear }
}

module.exports = { REPEAT_MS, DEBOUNCE_MS, createDebouncer, createButton, createTwin }
