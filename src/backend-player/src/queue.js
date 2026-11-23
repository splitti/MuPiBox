// The queue of what plays, as the Winamp playlist window edits it: select, remove (crop, remove all), sort, add a folder,
// save and load lists. The queue IS mpv's own playlist; this file holds the logic around it that needs no engine - the names
// of entries, the order a sort asks for and the moves that bring the playlist there, the list of folders to add from, and
// the saved lists - so it is tested without mpv (test/queue.test.js). Files and folders of the library are never touched:
// everything here changes only what is queued.

const fs = require('node:fs')
const path = require('node:path')

const AUDIO = /\.(mp3|flac|wav|wma|ogg|m4a)$/i
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** The name of a queued file as the track list shows it: without the folder, the ending and a leading track number. */
function nameOfFile(filename) {
  const base = path.basename(String(filename)).replace(/\.[^./]+$/, '')
  return base.replace(/^\d+\s*[-._]?\s*/, '') || base
}

/**
 * Where a queued entry comes from, in words a person can read: the file name, the folder and the ending. A file of the library is
 * a path; an album on the NAS is played through the box's own stream address, which carries the path percent-encoded
 * ("...stream?path=%2Fmusic%2FAlbum%2F01%20Song.mp3") - that path is taken out and decoded. `root` is the library's root folder.
 */
function describeSource(filename, root) {
  const text = String(filename)
  let full = text
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      // (searchParams decodes the percent signs; a plain address is decoded by hand, and left as it is when it does not decode)
      full = url.searchParams.get('path') ?? url.searchParams.get('file') ?? decodeURIComponent(url.pathname)
    } catch {
      full = text
    }
  }
  const inLibrary = full.startsWith(`${root}/`)
  const relative = inLibrary ? full.slice(root.length + 1) : full
  const folder = path.posix.dirname(relative)
  return { file: path.posix.basename(relative), folder: folder === '.' ? '' : folder, extension: path.extname(relative).slice(1).toUpperCase(), inLibrary, full }
}

/**
 * The order of the ids a sort asks for. entries: [{ id, filename }] in the order they are in; mode: title, file, path, reverse or
 * random. `random` is Math.random (or a pretend one in a test). The ids come back as a new array.
 */
function sortedIds(entries, mode, random = Math.random) {
  const list = entries.map((e) => ({ id: e.id, name: e.title ?? nameOfFile(e.filename), file: path.basename(String(e.filename)), full: String(e.filename) }))
  if (mode === 'title') list.sort((a, b) => collator.compare(a.name, b.name))
  else if (mode === 'file') list.sort((a, b) => collator.compare(a.file, b.file))
  else if (mode === 'path') list.sort((a, b) => collator.compare(a.full, b.full))
  else if (mode === 'reverse') list.reverse()
  else if (mode === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  } else throw new Error(`unknown sort: ${mode}`)
  return list.map((e) => e.id)
}

/**
 * The moves that bring a playlist from the order `currentIds` to the order `targetIds`: [from, to] pairs for mpv's
 * playlist-move (entry `from` goes in front of the entry now at `to`), to be done one after the other.
 */
function movesFor(currentIds, targetIds) {
  const now = [...currentIds]
  const moves = []
  for (let to = 0; to < targetIds.length; to++) {
    if (now[to] === targetIds[to]) continue
    const from = now.indexOf(targetIds[to], to + 1)
    if (from < 0) continue
    moves.push([from, to])
    now.splice(to, 0, now.splice(from, 1)[0])
  }
  return moves
}

/** Positions (1-based, as the display counts) from "1,3,7" to a sorted list of 0-based indexes inside 0..count-1. */
function indexesOf(text, count) {
  const out = new Set()
  for (const part of String(text ?? '').split(',')) {
    const n = Number.parseInt(part, 10)
    if (Number.isInteger(n) && n >= 1 && n <= count) out.add(n - 1)
  }
  return [...out].sort((a, b) => a - b)
}

/** Everything but the given indexes: what "crop" removes (and what a removal keeps, the other way round). */
function others(indexes, count) {
  const keep = new Set(indexes)
  return Array.from({ length: count }, (_, i) => i).filter((i) => !keep.has(i))
}

/** A path under the media root, from the way the display writes it (folders joined by "/"); null for anything outside. */
function insideRoot(root, relative) {
  const parts = String(relative ?? '').split('/').filter(Boolean)
  if (parts.some((p) => p === '..' || p === '.' || p.includes('\0'))) return null
  const full = path.join(root, ...parts)
  return full === root || full.startsWith(root + path.sep) ? full : null
}

/** The folders below `relative`, each with the number of audio files directly in it; hidden ones and files left out. */
function listFolders(root, relative) {
  const dir = insideRoot(root, relative)
  if (!dir) return null
  let names
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const rel = String(relative ?? '').split('/').filter(Boolean)
  const audioHere = names.filter((d) => d.isFile() && AUDIO.test(d.name)).length
  const folders = names
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => {
      let audio = 0
      try {
        audio = fs.readdirSync(path.join(dir, d.name)).filter((n) => AUDIO.test(n)).length
      } catch {
        // unreadable: no audio counted
      }
      return { name: d.name, path: [...rel, d.name].join('/'), audio }
    })
    .sort((a, b) => collator.compare(a.name, b.name))
  return { path: rel.join('/'), audio: audioHere, folders }
}

/** The audio files directly in a folder, in the order the library plays them (numbers as numbers). */
function audioFilesIn(root, relative) {
  const dir = insideRoot(root, relative)
  if (!dir) return null
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => AUDIO.test(n))
      .sort((a, b) => collator.compare(a, b))
      .map((n) => path.join(dir, n))
  } catch {
    return null
  }
}

/** A name for a saved list: letters, digits, blank, ".", "-", "_", "(", ")" up to 60; null for anything else. */
function listName(text) {
  const name = String(text ?? '').trim().replace(/\s+/g, ' ')
  return /^[\p{L}\p{N} ._()-]{1,60}$/u.test(name) && !name.startsWith('.') ? name : null
}

/** The saved lists: one JSON file each ({ name, savedAt, files }), in a folder of their own. */
function createListStore(dir) {
  const fileOf = (name) => path.join(dir, `${name}.json`)
  return {
    list() {
      try {
        return fs
          .readdirSync(dir)
          .filter((n) => n.endsWith('.json'))
          .map((n) => {
            try {
              const j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))
              return { name: String(j.name ?? n.slice(0, -5)), count: Array.isArray(j.files) ? j.files.length : 0, savedAt: Number(j.savedAt) || 0 }
            } catch {
              return null
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.savedAt - a.savedAt)
      } catch {
        return []
      }
    },
    save(text, files, now = Date.now()) {
      const name = listName(text)
      if (!name || !Array.isArray(files) || files.length === 0) return null
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(fileOf(name), JSON.stringify({ name, savedAt: now, files }))
      return name
    },
    load(text) {
      const name = listName(text)
      if (!name) return null
      try {
        const j = JSON.parse(fs.readFileSync(fileOf(name), 'utf8'))
        return Array.isArray(j.files) ? j.files.map(String) : null
      } catch {
        return null
      }
    },
    remove(text) {
      const name = listName(text)
      if (!name) return false
      try {
        fs.unlinkSync(fileOf(name))
        return true
      } catch {
        return false
      }
    },
  }
}

module.exports = { AUDIO, nameOfFile, describeSource, sortedIds, movesFor, indexesOf, others, insideRoot, listFolders, audioFilesIn, listName, createListStore }
