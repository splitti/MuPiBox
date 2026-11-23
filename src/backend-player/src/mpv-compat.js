// What depends on the version of mpv or on the playlist, kept apart from the wrapper so that it can be tested without an engine
// (mpv-wrapper.js uses it; test/compat.test.js).

/** Whether this mpv's "loadfile" takes an index before its options: from 0.38 on (Debian 12 has 0.35). `versionOutput` is what
 *  "mpv --version" prints; a text that says nothing about the version counts as an older mpv. */
function takesLoadfileIndex(versionOutput) {
  const m = /mpv v?(\d+)\.(\d+)/.exec(String(versionOutput ?? ''))
  return !!m && (Number(m[1]) > 0 || Number(m[2]) >= 38)
}

/** The "loadfile" command for one entry of a list: the first replaces what plays, the others are appended. The options go after
 *  the index (-1: at the end) where mpv takes one, else directly after the mode. */
function loadfileCommand(withIndex, entry, i) {
  const mode = i === 0 ? 'replace' : 'append'
  const options = entry.options ?? ''
  return withIndex
    ? ['loadfile', String(entry.file), mode, -1, options]
    : ['loadfile', String(entry.file), mode, options]
}

/** Where to go when a track played to its end with shuffle on (mpv holds it there with keep-open=always): a track chosen by the
 *  shuffler; in a list of one track it starts again with repeat, else -1 - the album ends. */
function targetAfterEnd({ shuffler, playlistPos, playlistCount, repeatOn }) {
  return playlistCount > 1 ? shuffler.next(playlistPos, playlistCount, repeatOn) : repeatOn ? 0 : -1
}

module.exports = { takesLoadfileIndex, loadfileCommand, targetAfterEnd }
