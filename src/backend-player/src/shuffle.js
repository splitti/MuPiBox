// Shuffle for a local or NAS album, as the box wants it: the playlist keeps its order and its track numbers - "next"
// only jumps to a track chosen by chance. A track that was played is not chosen again until all of them were played (a
// round); then the album ends - or, with repeat, a new round starts. "Previous" goes back through the tracks that were
// played, in the order they came. Pure logic, no engine: mpv-wrapper.js asks it where to go.

function createShuffler(random = Math.random) {
  /** tracks played in this round (0-based playlist places) */
  let played = new Set()
  /** the places in the order they were played; the last one is the track that plays */
  let history = []

  return {
    reset() {
      played = new Set()
      history = []
    },

    /** A track starts (whatever the reason: the end of the one before, "next", a tap in the list). */
    visit(index) {
      if (index < 0) return
      played.add(index)
      if (history[history.length - 1] !== index) history.push(index)
    },

    /**
     * Where "next" goes from the track that plays: a track not played in this round, chosen by chance; -1 when the
     * round is over and there is no repeat (the album ends). With repeat a new round starts: everything is open again
     * except the track that plays.
     */
    next(current, count, repeat = false) {
      if (count < 2) return -1
      let open = []
      for (let i = 0; i < count; i++) if (i !== current && !played.has(i)) open.push(i)
      if (open.length === 0) {
        if (!repeat) return -1
        played = new Set([current])
        history = [current]
        for (let i = 0; i < count; i++) if (i !== current) open.push(i)
      }
      return open[Math.min(open.length - 1, Math.floor(random() * open.length))]
    },

    /** Where "previous" goes: the track played before this one; -1 when there is none (the track starts again). */
    previous() {
      if (history.length < 2) return -1
      history.pop()
      const index = history[history.length - 1]
      // (the track left stays played: it was heard)
      return index
    },

    /** for the tests: how many tracks of the round are played */
    get playedCount() {
      return played.size
    },
  }
}

module.exports = { createShuffler }
