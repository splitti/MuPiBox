// The pure parts of the media control (display.js draws and wires it; nothing here touches the page): the sizes of the pulls, the
// seconds of a scrub, the place on the ring, the shape of the four wedges.

// the ticks of a scrub in steps (ms): each tells the page how far the place moved since the last one (a player that cannot wind by itself)
export const SCRUB_TICK_MS = 250
// the box that winds by itself is told the mode this often (it stops by itself when it does not hear it for 1.5 s)
export const WIND_BEAT_MS = 500
// a press that stays under TAP_MS and under TAP_MOVE is a tap; the volume buttons repeat after HOLD_MS
export const TAP_MS = 500
export const TAP_MOVE = 0.025
export const HOLD_MS = 450
export const REPEAT_MS = 200
// the centre key held this long (default) switches the outer buttons to the second set; it goes back after IDLE_MS without a press
export const LONG_PRESS_MS = 2000
export const ALT_IDLE_MS = 12000
// how far the button follows the finger (in units of the 100 wide pad) and how far it has to be pulled for the two steps (shares of the width)
export const MAX_PULL = 13
// the button follows the finger at 0.9 of its way, the pad is 0.75 of the control: the full stretch is reached at this share of the
// control's width - 4x starts there, 2x early, at 30 % of it (a tap stays below: TAP_MOVE is 23 % of it)
export const STAGE_2 = (MAX_PULL / 90) * 0.75
export const STAGE_1 = STAGE_2 * 0.3

/** The path of one of the four wedges of the pad (100 × 100 box), `angle` = the direction of its middle (degrees, 0 = up, clockwise).
 * The channels between the wedges are as wide everywhere (`gap` units, not wider towards the rim), and the channel to the centre key
 * (radius `hub`) is as wide as they are. */
export function sectorPath(angle, gap = 3, hub = 19.5, outer = 49) {
  const inner = hub + gap
  const rad = (angle * Math.PI) / 180
  const along = [Math.sin(rad), -Math.cos(rad)]
  const across = [Math.cos(rad), Math.sin(rad)]
  const h = gap / 2
  // a point on the edge of the wedge, `side` = -1 / 1 the edge on the left / right, at the radius r: the edge is parallel to the diagonal
  const point = (r, side) => {
    const t = Math.sqrt(r * r - h * h)
    const x = (t + h) / Math.SQRT2
    const y = side * ((t - h) / Math.SQRT2)
    return `${(50 + along[0] * x + across[0] * y).toFixed(2)} ${(50 + along[1] * x + across[1] * y).toFixed(2)}`
  }
  return `M${point(outer, -1)}A${outer} ${outer} 0 0 1 ${point(outer, 1)}L${point(inner, 1)}A${inner} ${inner} 0 0 0 ${point(inner, -1)}Z`
}

/** The step a pull of `dx` pixels (to the button's own side positive) has reached, for a control `width` pixels wide: 0 (a tap), 1 (2×), 2 (4×). */
export function stageFor(dx, width) {
  if (dx >= width * STAGE_2) return 2
  if (dx >= width * STAGE_1) return 1
  return 0
}

// swiped down by this share of the control's width after a pull to the side, the winding is held (it stays at its speed until a tap)
export const LOCK_PULL = 0.1

/** Whether a swipe down of `dy` pixels (from where the press began) holds the winding, for a control `width` pixels wide. */
export function latched(dy, width) {
  return dy >= width * LOCK_PULL
}

/** How far the place moves on top of the normal playing in `ms`: forward at 2× / 4× gains 1× / 3× of the time, back at 2× / 4× loses 3× / 5×. */
export function scrubSeconds(dir, stage, ms) {
  if (stage === 0) return 0
  const speed = stage === 1 ? 2 : 4
  return (dir === 1 ? speed - 1 : -(speed + 1)) * (ms / 1000)
}

/** The place on the ring (percent) for a point `dx`, `dy` from the middle: 0 at the top, clockwise. */
export function percentAt(dx, dy) {
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI
  return ((degrees + 360) % 360) / 3.6
}

/** Whether a point at this distance from the middle (share of the width) is on the ring and the frame - not on the pad. */
export function onRing(distance) {
  return distance >= 0.375 && distance <= 0.5
}

/** The mode the box is told while a track button is pulled: 'f2', 'f4' (forward), 'b2', 'b4' (back). */
export function windMode(dir, stage) {
  return `${dir === 1 ? 'f' : 'b'}${stage === 1 ? 2 : 4}`
}

/** The next repeat mode: all, then one, then none. */
export function nextRepeat(mode) {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'
}

/** The setting "hold" (seconds the centre key is held), as milliseconds: 1, 2 or 3 s; anything else is 2 s. */
export function holdMs(settings) {
  const s = Number(settings?.holdSeconds)
  return s === 1 || s === 3 ? s * 1000 : LONG_PRESS_MS
}

// The colours of the ring (and of what is lit in the second set), chosen in the settings: a palette, the accent colour of the theme
// (the one of its own progress bar) or the background colour of the player (lightened - on the black groove the plain colour would not show).
export const RING_COLORS = {
  blue: '#2878ff',
  red: '#ff3b3b',
  orange: '#ff8a1f',
  yellow: '#ffd21f',
  green: '#34d058',
  mint: '#1fd1b0',
  cyan: '#22c7ff',
  purple: '#9b5cff',
  pink: '#ff5fb0',
  white: '#e8ecf2',
  theme: 'var(--km-apricot, var(--ion-color-primary, #2878ff))',
  background: 'color-mix(in srgb, var(--km-night, var(--ion-background-color, #1d2b27)) 55%, white)',
}

/** The colour (a CSS value) of the ring for the setting "ringColor"; null: the one of the design (the default); anything unknown is blue. */
export function ringColor(settings) {
  const name = settings?.ringColor
  if (name === undefined || name === 'auto') return null
  return Object.hasOwn(RING_COLORS, name) ? RING_COLORS[name] : RING_COLORS.blue
}

export const DESIGNS = ['classic', 'kids', 'neon']

/** The design of the knob for the setting "design": classic (metal), kids (colourful) or neon; anything else is classic. */
export function designOf(settings) {
  return DESIGNS.includes(settings?.design) ? settings.design : 'classic'
}
