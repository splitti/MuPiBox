// The media control: a round multimedia knob that takes the place of the normal buttons on the player page while this extension is on
// (hostApi 18, `api.player.controls`). The player page hands over what is playing and what the buttons may do (see `PlayerControlsHandle`
// in the core); this file draws the knob and turns touches into those calls. The sizes and numbers are in control-logic.js (tested).
//
// A silver frame, a ring in it that lights up blue clockwise as the track plays, a black pad with the four wedges and play / pause.
// A track button pulled to its own side winds (2×, then 4×) and springs back when let go; a tap steps to the track before / after.
// The volume buttons repeat while held. A tap or a pull on the ring chooses a place. Play / pause held shows a second set: shuffle,
// repeat (all, one, none), eject the CD and "back".
import {
  ALT_IDLE_MS,
  HOLD_MS,
  MAX_PULL,
  REPEAT_MS,
  SCRUB_TICK_MS,
  TAP_MOVE,
  TAP_MS,
  WIND_BEAT_MS,
  designOf,
  holdMs,
  latched,
  onRing,
  percentAt,
  ringColor,
  scrubSeconds,
  sectorPath,
  stageFor,
  windMode,
} from './control-logic.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** An element (SVG when `svg`) with attributes and children. */
function node(svg, tag, attrs = {}, ...kids) {
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  for (const kid of kids) el.append(kid)
  return el
}
const s = (tag, attrs, ...kids) => node(true, tag, attrs, ...kids)
const text = (attrs, content) => {
  const el = s('text', attrs)
  el.textContent = content
  return el
}

/** The knob in `host`; `api` is the extension's API, `ctl` what the page lets the buttons do. Returns what takes it away. */
function build(api, host, ctl) {
  let st = ctl.state()
  let alt = false
  let pressed = null // 'up' | 'down' | 'prev' | 'next' | 'play'
  let pulled = null // { side, units, stage }
  let chosen = null
  let holding = false
  let canEject = false
  let locked = null // a winding held at its speed: { side, dir, stage }
  let gone = false
  const settings = api.settings?.()
  const longMs = holdMs(settings)

  // ---------- the picture ----------
  const paths = { up: sectorPath(0), right: sectorPath(90), down: sectorPath(180), left: sectorPath(270) }
  const seg = (label, d, ...kids) => s('g', { class: 'mc-seg', role: 'button', 'aria-label': label }, s('path', { d }), ...kids)

  const upSeg = seg('Volume up', paths.up, text({ x: 50, y: 20.5 }, 'VOL+'))
  const downSeg = seg('Volume down', paths.down, text({ x: 50, y: 87.5 }, 'VOL−'))
  const speedPrev = text({ class: 'mc-speed', x: 16.5, y: 59 }, '')
  const speedNext = text({ class: 'mc-speed', x: 83.5, y: 59 }, '')
  const iconPrev = s('g', { class: 'mc-icon' }, s('rect', { x: 10.75, y: 44, width: 1.8, height: 12, rx: 0.6 }), s('path', { d: 'M22.25 44v12L13.25 50z' }))
  const iconNext = s('g', { class: 'mc-icon' }, s('rect', { x: 87.45, y: 44, width: 1.8, height: 12, rx: 0.6 }), s('path', { d: 'M77.75 44v12L86.75 50z' }))
  // (a padlock above the arrows while the winding is held)
  const padlock = (cx) =>
    s('g', { class: 'mc-lock', hidden: '' }, s('rect', { x: cx - 3, y: 33.2, width: 6, height: 4.8, rx: 0.9 }), s('path', { d: `M${cx - 1.8} 33.2v-1.7a1.8 1.8 0 0 1 3.6 0v1.7` }))
  const lockPrev = padlock(16.5)
  const lockNext = padlock(83.5)
  const windPrev = s('g', { hidden: '' }, s('path', { class: 'mc-icon', d: 'M22.5 41v9l-6-4.5zM16.5 41v9l-6-4.5z' }), speedPrev, lockPrev)
  const windNext = s('g', { hidden: '' }, s('path', { class: 'mc-icon', d: 'M77.5 41v9l6-4.5zM83.5 41v9l6-4.5z' }), speedNext, lockNext)
  const prevSeg = seg('Previous', paths.left, iconPrev, windPrev)
  const nextSeg = seg('Next', paths.right, iconNext, windNext)
  prevSeg.classList.add('mc-track')
  nextSeg.classList.add('mc-track')
  // (the place of each wedge, for the colours of the designs: the same in both sets)
  upSeg.classList.add('mc-w-up')
  downSeg.classList.add('mc-w-down')
  prevSeg.classList.add('mc-w-left')
  nextSeg.classList.add('mc-w-right')
  const set1 = s('g', { class: 'mc-set' }, upSeg, downSeg, prevSeg, nextSeg)

  // the second set: back, eject, shuffle, repeat
  const backSeg = seg(
    'Back',
    paths.up,
    s('g', { class: 'mc-line', transform: 'translate(2.15 -1)' }, s('path', { d: 'M44.2 11.2l-4.2 4.2 4.2 4.2M40.4 15.4h11.1a4.2 4.2 0 0 1 0 8.4h-3.6' })),
  )
  const ejectSeg = seg('Eject CD', paths.down, s('path', { class: 'mc-icon', transform: 'translate(-5 -4.28) scale(1.1)', d: 'M50 74.2l-5 7.4h10zM45 83.6h10v1.8H45z' }))
  const shuffleState = text({ class: 'mc-state', x: 16.5, y: 59 }, 'OFF')
  const shuffleSeg = seg(
    'Shuffle',
    paths.left,
    s('g', { class: 'mc-line', style: 'stroke-width: 3.2px', transform: 'translate(10.25 40.5) scale(0.5)' }, s('path', { d: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5' })),
    shuffleState,
  )
  const repeatOne = text({ class: 'mc-one', x: 83.5, y: 48.5 }, '1')
  const repeatState = text({ class: 'mc-state', x: 83.5, y: 59 }, 'OFF')
  const repeatSeg = seg(
    'Repeat',
    paths.right,
    s('g', { class: 'mc-line', style: 'stroke-width: 3.2px', transform: 'translate(77.5 40.5) scale(0.5)' }, s('path', { d: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3' })),
    repeatOne,
    repeatState,
  )
  backSeg.classList.add('mc-w-up')
  ejectSeg.classList.add('mc-w-down')
  shuffleSeg.classList.add('mc-w-left')
  repeatSeg.classList.add('mc-w-right')
  const set2 = s('g', { class: 'mc-set', hidden: '' }, backSeg, ejectSeg, shuffleSeg, repeatSeg)

  const playIcon = s('path', { class: 'mc-icon', d: 'M43.5 41.5v17l14.5-8.5z' })
  const pauseIcon = s('g', { class: 'mc-icon', hidden: '' }, s('rect', { x: 42.8, y: 42, width: 4.6, height: 16, rx: 1.2 }), s('rect', { x: 52.6, y: 42, width: 4.6, height: 16, rx: 1.2 }))
  const hub = s('g', { class: 'mc-hub', role: 'button', 'aria-label': 'Play / pause' }, s('circle', { cx: 50, cy: 50, r: 19.5 }), playIcon, pauseIcon)

  const stop = (offset, color) => s('stop', { offset, 'stop-color': color })
  const pad = s(
    'svg',
    { class: 'mc-pad', viewBox: '0 0 100 100' },
    s(
      'defs',
      {},
      s('linearGradient', { id: 'mc-seg', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#303236'), stop(1, '#141517')),
      s('radialGradient', { id: 'mc-hub', cx: 0.5, cy: 0.35, r: 0.8 }, stop(0, '#383a3f'), stop(1, '#111214')),
    ),
    s('circle', { class: 'mc-dome', cx: 50, cy: 50, r: 50 }),
    set1,
    set2,
    hub,
  )
  const lit = node(false, 'div', { class: 'mc-lit' })
  const root = node(
    false,
    'div',
    { class: 'mc' },
    node(false, 'div', { class: 'mc-bezel' }),
    node(false, 'div', { class: 'mc-ring' }, node(false, 'div', { class: 'mc-glow' }, lit)),
    pad,
  )
  const positionLabel = node(false, 'span')
  const durationLabel = node(false, 'span')
  const times = node(false, 'div', { class: 'mc-times' }, positionLabel, durationLabel)
  const wrap = node(false, 'div', { class: 'mc-wrap' }, root, times)
  const colour = ringColor(settings)
  root.classList.add(`mc-design-${designOf(settings)}`)
  if (colour === null) root.classList.add('mc-auto')
  else root.style.setProperty('--mc-a', colour)
  root.style.setProperty('--mc-hold', `${Math.max(0.5, longMs / 1000 - 0.1)}s`)
  host.replaceChildren(wrap)

  // ---------- state -> picture ----------
  const flag = (el, name, on) => el.classList.toggle(name, !!on)
  const render = () => {
    const live = st.live
    const value = chosen ?? st.progress
    const percent = live ? 0 : Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
    root.style.setProperty('--p', String(percent))
    flag(root, 'mc-live', live)
    flag(root, 'mc-seekable', st.canSeek && !live)
    set1.toggleAttribute('hidden', alt)
    set2.toggleAttribute('hidden', !alt)

    flag(upSeg, 'mc-down', pressed === 'up')
    flag(downSeg, 'mc-down', pressed === 'down')
    flag(backSeg, 'mc-down', pressed === 'up')
    flag(ejectSeg, 'mc-down', pressed === 'down')
    flag(shuffleSeg, 'mc-down', pressed === 'prev')
    flag(repeatSeg, 'mc-down', pressed === 'next')
    flag(hub, 'mc-down', pressed === 'play')
    flag(hub, 'mc-holding', holding)

    for (const [side, el, icon, wind, label, lock] of [
      ['prev', prevSeg, iconPrev, windPrev, speedPrev, lockPrev],
      ['next', nextSeg, iconNext, windNext, speedNext, lockNext],
    ]) {
      const mine = pulled && pulled.side === side
      flag(el, 'mc-locked', locked && locked.side === side)
      lock.toggleAttribute('hidden', !(locked && locked.side === side))
      flag(el, 'mc-down', pressed === side)
      flag(el, 'mc-off', !st.canSkip || live)
      flag(el, 'mc-pulled', mine)
      el.style.transform = mine ? `translate(${pulled.units}px, 0)` : 'translate(0, 0)'
      const fast = mine && pulled.stage > 0
      icon.toggleAttribute('hidden', fast)
      if (fast) wind.setAttribute('transform', locked && locked.side === side ? 'translate(0 5.65)' : 'translate(0 0)')
      wind.toggleAttribute('hidden', !fast)
      if (fast) label.textContent = `${pulled.stage === 1 ? 2 : 4}×`
    }

    flag(ejectSeg, 'mc-off', !canEject)
    flag(shuffleSeg, 'mc-off', !st.canShuffle)
    flag(shuffleSeg, 'mc-on', st.shuffle)
    shuffleState.textContent = st.shuffle ? 'ON' : 'OFF'
    flag(repeatSeg, 'mc-off', !st.canRepeat)
    flag(repeatSeg, 'mc-on', st.repeat !== 'off')
    repeatOne.toggleAttribute('hidden', st.repeat !== 'one')
    repeatState.textContent = st.repeat === 'all' ? 'ALL' : st.repeat === 'one' ? 'ONE' : 'OFF'

    playIcon.toggleAttribute('hidden', st.playing)
    pauseIcon.toggleAttribute('hidden', !st.playing)
    positionLabel.textContent = st.position || ''
    durationLabel.textContent = st.duration || ''
    times.hidden = !(st.position || st.duration)
  }
  const unsubscribe = ctl.onState((next) => {
    st = next
    // a held winding ends by itself when there is nothing left to wind (a stream, the start or the end of the track)
    if (locked && (!st.canSkip || st.live || (locked.dir === -1 && st.progress <= 0.3) || (locked.dir === 1 && st.progress >= 99.7))) unlock()
    else render()
  })

  // ---------- the volume buttons: they go on while held, the way a button on a car's steering wheel does ----------
  let repeatTimer
  let repeatTicker
  const stopRepeat = () => {
    clearTimeout(repeatTimer)
    clearInterval(repeatTicker)
    repeatTimer = undefined
    repeatTicker = undefined
  }
  const volPress = (event, side) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pressed = side
    render()
    const fire = () => (side === 'up' ? ctl.volUp() : ctl.volDown())
    fire()
    stopRepeat()
    repeatTimer = setTimeout(() => {
      repeatTicker = setInterval(fire, REPEAT_MS)
    }, HOLD_MS)
  }
  const volRelease = () => {
    stopRepeat()
    pressed = null
    render()
  }
  for (const [el, side] of [
    [upSeg, 'up'],
    [downSeg, 'down'],
  ]) {
    el.addEventListener('pointerdown', (e) => volPress(e, side))
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(name, volRelease)
  }

  // ---------- play / pause; held: the second set ----------
  let longTimer
  let altTimer
  let longDone = false
  const setAlt = (on) => {
    clearTimeout(altTimer)
    alt = on
    pressed = null
    if (on) {
      // (is there a CD drive? the cd extension answers; without it nothing does and eject stays dimmed)
      Promise.resolve(api.fetch('/ext/cd/state'))
        .then((answer) => {
          canEject = !!answer?.drive
          if (!gone) render()
        })
        .catch(() => undefined)
      altTimer = setTimeout(() => {
        alt = false
        render()
      }, ALT_IDLE_MS)
    }
    render()
  }
  /** A press of the second set: the idle time starts anew. */
  const altBusy = () => {
    clearTimeout(altTimer)
    altTimer = setTimeout(() => {
      alt = false
      render()
    }, ALT_IDLE_MS)
  }
  hub.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    if (locked) unlock()
    pressed = 'play'
    holding = true
    longDone = false
    clearTimeout(longTimer)
    longTimer = setTimeout(() => {
      longDone = true
      holding = false
      setAlt(!alt)
    }, longMs)
    render()
  })
  hub.addEventListener('pointerup', (event) => {
    event.stopPropagation()
    clearTimeout(longTimer)
    holding = false
    // (a hold that turned the set over is not a tap: play / pause stays as it is)
    if (pressed === 'play' && !longDone) ctl.playPause()
    longDone = false
    pressed = null
    render()
  })
  const centreCancel = () => {
    clearTimeout(longTimer)
    holding = false
    pressed = null
    render()
  }
  hub.addEventListener('pointercancel', centreCancel)
  hub.addEventListener('pointerleave', centreCancel)

  // ---------- the second set ----------
  const altKey = { back: 'up', eject: 'down', shuffle: 'prev', repeat: 'next' }
  const altRelease = () => {
    pressed = null
    render()
  }
  for (const [el, which] of [
    [backSeg, 'back'],
    [ejectSeg, 'eject'],
    [shuffleSeg, 'shuffle'],
    [repeatSeg, 'repeat'],
  ]) {
    el.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      pressed = altKey[which]
      altBusy()
      render()
    })
    el.addEventListener('pointerup', (event) => {
      event.stopPropagation()
      const wasPressed = pressed !== null
      pressed = null
      if (!wasPressed) return render()
      if (which === 'back') setAlt(false)
      else {
        if (which === 'shuffle' && st.canShuffle) ctl.toggleShuffle()
        else if (which === 'repeat' && st.canRepeat) ctl.cycleRepeat()
        else if (which === 'eject' && canEject) void api.fetch('/ext/cd/eject')
        render()
      }
    })
    el.addEventListener('pointercancel', altRelease)
    el.addEventListener('pointerleave', altRelease)
  }

  // ---------- the track buttons: tap = the track before / after, pulled to their own side = winding at 2× and 4× ----------
  let origin = { x: 0, y: 0, t: 0, moved: false }
  let tapToRelease = false
  let scrubTicker
  let winding = false
  const stopScrub = () => {
    clearInterval(scrubTicker)
    scrubTicker = undefined
    if (winding) {
      winding = false
      ctl.wind('0')
    }
  }
  const startScrub = (dir, stage) => {
    stopScrub()
    if (stage === 0) return
    if (st.smooth) {
      const mode = windMode(dir, stage)
      winding = true
      ctl.wind(mode)
      scrubTicker = setInterval(() => ctl.wind(mode), WIND_BEAT_MS)
      return
    }
    scrubTicker = setInterval(() => ctl.scrub(scrubSeconds(dir, stage, SCRUB_TICK_MS)), SCRUB_TICK_MS)
  }
  /** Lets a held winding go: it stops and the button springs back. */
  const unlock = () => {
    locked = null
    tapToRelease = false
    stopScrub()
    pulled = null
    pressed = null
    render()
  }
  for (const [el, side] of [
    [prevSeg, 'prev'],
    [nextSeg, 'next'],
  ]) {
    el.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      if (!st.canSkip || st.live) return
      el.setPointerCapture?.(event.pointerId)
      origin = { x: event.clientX, y: event.clientY, t: Date.now(), moved: false }
      // a press on the button that holds the winding: a short tap lets it go (see `up`)
      if (locked && locked.side === side) {
        tapToRelease = true
        pressed = side
        render()
        return
      }
      // (the other button: the held winding ends, this one starts as usual)
      if (locked) unlock()
      pressed = side
      pulled = { side, units: 0, stage: 0 }
      render()
    })
    el.addEventListener('pointermove', (event) => {
      if (tapToRelease || !pulled || pulled.side !== side || locked) {
        if (tapToRelease && Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) > (pad.getBoundingClientRect().width || 240) * TAP_MOVE) origin.moved = true
        return
      }
      const width = pad.getBoundingClientRect().width || 240
      const control = width / 0.74
      const dx = (event.clientX - origin.x) * (side === 'next' ? 1 : -1)
      if (Math.abs(event.clientX - origin.x) > control * TAP_MOVE) origin.moved = true
      // the button follows its own side only; the other way it stays (a little give, so it does not feel stuck)
      const units = Math.max(-2, Math.min(MAX_PULL, (dx / (width / 100)) * 0.9)) * (side === 'next' ? 1 : -1)
      const stage = st.canSeek ? stageFor(dx, control) : 0
      const changed = stage !== pulled.stage
      pulled = { side, units, stage }
      if (changed) startScrub(side === 'next' ? 1 : -1, stage)
      // pulled on and then swiped down: the winding is held at this speed until the button is tapped
      if (stage > 0 && latched(event.clientY - origin.y, control)) locked = { side, dir: side === 'next' ? 1 : -1, stage }
      render()
    })
    const up = (event) => {
      event.stopPropagation()
      if (tapToRelease) {
        tapToRelease = false
        const tap = !origin.moved && Date.now() - origin.t < TAP_MS && event.type !== 'pointercancel'
        if (tap) unlock()
        else {
          pressed = null
          render()
        }
        return
      }
      if (!pulled || pulled.side !== side) return
      // (let go of while held: the winding goes on and the button stays out)
      if (locked && locked.side === side) {
        pressed = null
        render()
        return
      }
      const wasTap = pulled.stage === 0 && !origin.moved && Date.now() - origin.t < TAP_MS && event.type !== 'pointercancel'
      stopScrub()
      // (released: the button springs back - the style goes, the transition of the CSS does the rest)
      pulled = null
      pressed = null
      render()
      if (wasTap) (side === 'next' ? ctl.next : ctl.prev)()
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // ---------- the ring: choose a place ----------
  const placeAt = (event) => {
    const box = root.getBoundingClientRect()
    return { dx: event.clientX - (box.left + box.width / 2), dy: event.clientY - (box.top + box.height / 2), width: box.width }
  }
  root.addEventListener('pointerdown', (event) => {
    if (!st.canSeek || st.live) return
    const { dx, dy, width } = placeAt(event)
    if (!onRing(Math.hypot(dx, dy) / width)) return
    root.setPointerCapture?.(event.pointerId)
    chosen = percentAt(dx, dy)
    render()
  })
  root.addEventListener('pointermove', (event) => {
    if (chosen === null) return
    const { dx, dy } = placeAt(event)
    chosen = percentAt(dx, dy)
    render()
  })
  const ringUp = (event) => {
    if (chosen === null) return
    const value = chosen
    chosen = null
    render()
    if (event.type !== 'pointercancel') ctl.seekTo(Math.min(value, 99.5))
  }
  root.addEventListener('pointerup', ringUp)
  root.addEventListener('pointercancel', ringUp)

  render()
  return () => {
    gone = true
    stopRepeat()
    locked = null
    stopScrub()
    clearTimeout(longTimer)
    clearTimeout(altTimer)
    unsubscribe()
    host.replaceChildren()
  }
}

/** Called by the display of the box when the extension is on. */
export function activate(api) {
  // the stylesheet of the knob (once)
  if (!document.getElementById('mc-style')) {
    const link = document.createElement('link')
    link.id = 'mc-style'
    link.rel = 'stylesheet'
    link.href = api.url('control.css')
    document.head.append(link)
  }
  api.player.controls({ mount: (host, ctl) => build(api, host, ctl) })
}
