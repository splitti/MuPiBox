// Buttons & GPIO Input: what an action does. The player is asked as the display and the rotary encoder ask it (its commands on
// localhost), the output through the server's own route. One action after the other; a held button does not pile them up.
'use strict'

// (so many may wait: a button that repeats faster than the box answers must not build a queue that plays on after it is let go)
const MAX_WAITING = 3

/** Where the box can play, in the order a press goes through them: its sound cards (or its one speaker), then the Bluetooth devices. */
function outputTargets(data) {
  const cards = Array.isArray(data?.cards) ? data.cards.filter((c) => typeof c?.id === 'string' && c.id) : []
  const devices = Array.isArray(data?.devices) ? data.devices.filter((d) => typeof d?.mac === 'string' && d.mac) : []
  return [...(cards.length > 1 ? cards.map((c) => `card:${c.id}`) : ['box']), ...devices.map((d) => d.mac)]
}

/** The output after the current one (null: there is only one). */
function nextOutput(data) {
  const targets = outputTargets(data)
  if (targets.length < 2) return null
  const at = targets.indexOf(String(data?.current ?? ''))
  return targets[(at + 1) % targets.length]
}

/** The repeat mode a press leads to: all -> one -> off -> all. `meta.repeatMode` is what the player says ('off', 'all', 'one'); a
 *  player of an older version knows only `repeat` (on = all). Returns the name of the player's command without "repeat". */
function nextRepeat(meta) {
  // (an older player has no repeatMode and knows only repeaton / repeatoff: on and off then; "on" is "all" for the new one too)
  if (typeof meta?.repeatMode !== 'string') return meta?.repeat === true ? 'off' : 'on'
  const mode = meta.repeatMode
  return mode === 'off' ? 'on' : mode === 'all' ? 'one' : 'off'
}

/** Is something playing? The same test as the player's own: Spotify says "pause", the local player "playing". */
function isPlaying(meta) {
  if (meta?.currentPlayer === 'spotify') return meta.pause === false
  if (meta?.currentPlayer === 'mplayer') return meta.playing === true
  return false
}

function createActions({ playerUrl, apiUrl, log = console, fetchFn = fetch }) {
  // (the step of "louder" and "quieter" comes with the action: 1 to 10 percent, 5 when nothing sensible is said)
  const percent = (step) => Math.min(10, Math.max(1, Math.round(Number(step) || 5)))
  const player = async (command) => {
    const response = await fetchFn(`${playerUrl}/${command}?src=buttons`, { signal: AbortSignal.timeout(4000) })
    return response.ok
  }
  const meta = async () => {
    const response = await fetchFn(`${playerUrl}/local`, { signal: AbortSignal.timeout(4000) })
    return response.ok ? await response.json() : null
  }
  const run = {
    none: async () => undefined,
    toggle: async () => player(isPlaying(await meta()) ? 'pause' : 'play'),
    next: () => player('next'),
    prev: () => player('previous'),
    replay: () => player('replay'),
    volUp: (step) => player(`+${percent(step)}`),
    volDown: (step) => player(`-${percent(step)}`),
    ffwd: () => player('seek+30'),
    rewind: () => player('seek-30'),
    shuffle: async () => player((await meta())?.shuffle === true ? 'shuffleoff' : 'shuffleon'),
    repeat: async () => player(`repeat${nextRepeat(await meta())}`),
    stop: () => player('stop'),
    shutdown: () => player('shutoff'),
    output: async () => {
      const response = await fetchFn(`${apiUrl}/api/audio-output`, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return
      const target = nextOutput(await response.json())
      if (!target) return
      // (a Bluetooth device is connected first: that takes up to a quarter of a minute)
      const done = await fetchFn(`${apiUrl}/api/audio-output`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }), signal: AbortSignal.timeout(45000) })
      if (!done.ok) log.warn(`[buttons] output ${target} not switched: HTTP ${done.status}`)
    },
  }
  let waiting = 0
  let chain = Promise.resolve()
  return {
    /** Does the action (a name of ACTIONS; `step`: the percent of a volume action); resolves when it is done, never rejects. */
    do(name, step) {
      if (!Object.hasOwn(run, name) || name === 'none') return Promise.resolve(false)
      if (waiting >= MAX_WAITING) return Promise.resolve(false)
      waiting++
      chain = chain
        .then(() => run[name](step))
        .catch((error) => log.warn(`[buttons] ${name} failed: ${error?.message ?? error}`))
        .then(() => {
          waiting--
        })
      return chain.then(() => true)
    },
  }
}

module.exports = { outputTargets, nextOutput, nextRepeat, isPlaying, createActions }
