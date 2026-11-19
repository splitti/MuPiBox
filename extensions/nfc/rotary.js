// The rotary knob chooses among the albums of an artist cover (or a folder) a tag belongs to. Plain functions and data, no timers and no
// files: api.js keeps one state, feeds it what the knob does and starts what the state says.
//
// The state is { uid, albums, index, until, windowMs, selecting }:
//   uid       the tag whose collection is being looked at ('' = no tag: the knob is not taken over)
//   albums    [{ key, label, media }] in the order of the list
//   index     the album the knob is on
//   until     the time up to which the knob is taken over; every turn of the knob starts the time anew (Infinity: no limit - 0 seconds)
//   selecting true once the knob was turned: only then does a press choose the album (a press before turning chooses nothing)
'use strict'

/** A state in which the knob belongs to nobody. */
const idle = () => ({ uid: '', albums: [], index: 0, until: 0, windowMs: 0, selecting: false })

/** Is the knob taken over at `now`? A collection with one album has nothing to choose from. */
const isActive = (state, now) => Boolean(state.uid) && state.albums.length > 1 && now < state.until

/**
 * A tag of a collection was laid on: the knob is taken over for `seconds` (0: until a choice is made) and stands on the album the tag plays (`currentKey`, the
 * albumKey of its medium - the first album if it is not in the list).
 */
function begin({ uid, albums, currentKey, seconds, now }) {
  const found = albums.findIndex((album) => album.key === currentKey)
  const limit = seconds > 0 ? seconds * 1000 : 0
  return { uid, albums, index: Math.max(0, found), until: limit ? now + limit : Infinity, windowMs: limit, selecting: false }
}

/**
 * The knob was turned by one detent (+1 clockwise, -1 the other way): on to the next album or back to the one before, round and round.
 * Returns { state, shown } - `shown` is the album now chosen ({ album, index, count }) - or null when the knob is not taken over.
 */
function turn(state, direction, now) {
  if (!isActive(state, now)) return null
  const count = state.albums.length
  const index = (((state.index + (direction > 0 ? 1 : -1)) % count) + count) % count
  const next = { ...state, index, until: state.windowMs > 0 ? now + state.windowMs : Infinity, selecting: true }
  return { state: next, shown: { album: next.albums[index], index, count } }
}

/**
 * The button of the knob was pressed. Returns { state, album } - the album to play - or null when nothing was chosen (the knob not taken over,
 * or not turned yet). The knob stays the knob of this tag's albums, now standing on the one that plays, and the time starts anew: another
 * album can be chosen right away. It ends with the time, or when another tag is laid on.
 */
function press(state, now) {
  if (!isActive(state, now) || !state.selecting) return null
  return { state: { ...state, until: state.windowMs > 0 ? now + state.windowMs : Infinity, selecting: false }, album: state.albums[state.index] }
}

module.exports = { idle, isActive, begin, turn, press }
