// Ripping an audio CD into a folder of the box's media: cdparanoia reads a track (error corrected, as WAV on its standard output),
// ffmpeg encodes it (MP3, AAC, WMA, FLAC or ALAC) and tags it; the file is written as a hidden ".part" first and renamed when it is
// complete, so the library never lists half a file (as the app's upload does). Everything that does not need a disc - the names, the
// arguments of the programs, the estimate of the size, the job with its progress and its clean-up - is plain logic that runs in a
// test with a pretend `ripTrack`.

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

/** The categories of the media folder, as the app's upload knows them (server.ts libraryCategories). */
const CATEGORIES = ['audiobook', 'music', 'other']
/** What stays free on the card (as the upload keeps it): the box needs room for its logs, caches and updates. */
const RESERVE_BYTES = 512 * 1024 * 1024
const BITRATES = [128, 160, 192, 256, 320]
const WAV_HEADER = 44
const SECTOR_BYTES = 2352
// the audio is read this many times at most per sector - a disc that stays unreadable is a failed track, not a job that never ends
const NEVER_SKIP = '--never-skip=10'

const FORMATS = {
  mp3: { label: 'MP3', ext: 'mp3', muxer: 'mp3', codec: ['-c:a', 'libmp3lame'], lossy: true, cover: true, extra: ['-id3v2_version', '3'] },
  aac: { label: 'AAC', ext: 'm4a', muxer: 'ipod', codec: ['-c:a', 'aac'], lossy: true, cover: true },
  wma: { label: 'WMA', ext: 'wma', muxer: 'asf', codec: ['-c:a', 'wmav2'], lossy: true, cover: false },
  flac: { label: 'FLAC', ext: 'flac', muxer: 'flac', codec: ['-c:a', 'flac', '-compression_level', '8'], lossy: false, cover: true },
  alac: { label: 'ALAC', ext: 'm4a', muxer: 'ipod', codec: ['-c:a', 'alac'], lossy: false, cover: true },
}

/**
 * One name of a folder or file as it may stand on the card (as cleanName of the app's upload): no path separators or characters
 * Windows (Samba) cannot show, no control characters, no leading dot, no trailing dot or space. '' when nothing is left.
 */
function cleanName(raw) {
  if (typeof raw !== 'string') return ''
  let name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  // (at most 200 bytes: ext4 allows 255 per name, and the ".part" name adds some)
  while (Buffer.byteLength(name, 'utf8') > 200) name = Array.from(name).slice(0, -1).join('').trimEnd()
  return name === '.' || name === '..' ? '' : name
}

/** A text for a tag: no control characters, at most 200 characters. */
const tagText = (raw) => String(raw ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)

const pad2 = (n) => String(n).padStart(2, '0')

/** "03 Title.mp3" - the number of the track on the album, then its title ("Track 03" when it has none). */
function trackFileName(nr, title, ext) {
  const name = cleanName(`${pad2(nr)} ${tagText(title) || `Track ${pad2(nr)}`}`)
  // (a name that is cut keeps room for the extension and the ".part" of the hidden file)
  return `${Array.from(name).slice(0, 150).join('')}.${ext}`
}

/** The picture's kind from its first bytes: 'jpg', 'png' or null. */
function imageKind(bytes) {
  if (bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes?.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  return null
}

/** The arguments of ffmpeg for a track coming in as WAV on its standard input. `coverFile`: the picture to embed (not for WMA). */
function ffmpegArgs({ format, bitrate, tags, coverFile, outFile }) {
  const spec = FORMATS[format]
  if (!spec) throw new Error(`unknown format: ${format}`)
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'wav', '-i', 'pipe:0']
  const cover = !!coverFile && spec.cover
  if (cover) args.push('-i', coverFile)
  args.push('-map', '0:a')
  if (cover) args.push('-map', '1:v', '-c:v', 'copy', '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
  args.push(...spec.codec)
  if (spec.lossy) args.push('-b:a', `${bitrate}k`)
  args.push('-map_metadata', '-1')
  for (const [key, value] of Object.entries(tags)) if (value !== '' && value !== undefined) args.push('-metadata', `${key}=${value}`)
  args.push(...(spec.extra ?? []), '-f', spec.muxer, outFile)
  return args
}

/** The tags of one track of the album. */
function trackTags({ album, albumArtist, genre, year, track, tracks }) {
  return {
    title: tagText(track.title) || `Track ${pad2(track.nr)}`,
    artist: tagText(track.artist) || tagText(albumArtist),
    album: tagText(album),
    album_artist: tagText(albumArtist),
    genre: tagText(genre),
    date: /^\d{4}$/.test(String(year ?? '').trim()) ? String(year).trim() : '',
    track: `${track.nr}/${tracks}`,
  }
}

/** About how many bytes the files of the disc will take (to see before it starts that the card has room). */
function estimateBytes(format, bitrate, lbas) {
  const sectors = Math.max(0, lbas[lbas.length - 1] - lbas[0])
  const wav = sectors * SECTOR_BYTES
  const spec = FORMATS[format]
  if (!spec) return wav
  // (the music of a CD packs to a little more than half of its size without loss)
  return spec.lossy ? Math.ceil((sectors / 75) * ((bitrate * 1000) / 8)) : Math.ceil(wav * 0.65)
}

/**
 * One track: cdparanoia reads it, ffmpeg encodes it into `outFile`. `onBytes(n)` is told how many bytes of the track's audio came
 * through so far; `signal` stops both programs. Resolves when both ended well; rejects with what they said otherwise.
 */
function ripTrack({ device, number, args, outFile, onBytes = () => {}, signal, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    const reader = spawnImpl('cdparanoia', ['-q', '-w', NEVER_SKIP, '-d', device, String(number), '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const encoder = spawnImpl('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] })
    // (the box has other things to do while a CD is encoded: the player, the display, the app)
    for (const child of [reader, encoder]) {
      try {
        if (child.pid) os.setPriority(child.pid, 15)
      } catch {
        // not allowed or already gone
      }
    }
    const said = { reader: '', encoder: '' }
    const exit = { reader: null, encoder: null }
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', stop)
      if (error) {
        for (const child of [reader, encoder]) {
          try {
            child.kill('SIGKILL')
          } catch {
            // never started, or gone already
          }
        }
        reject(error)
      } else resolve()
    }
    const stop = () => finish(Object.assign(new Error('cancelled'), { cancelled: true }))
    if (signal?.aborted) return stop()
    signal?.addEventListener('abort', stop, { once: true })
    const keep = (who) => (chunk) => {
      said[who] = (said[who] + chunk).slice(-600)
    }
    reader.stderr.on('data', keep('reader'))
    encoder.stderr.on('data', keep('encoder'))
    let counted = 0
    const counter = new Transform({
      transform(chunk, _enc, done) {
        counted += chunk.length
        onBytes(Math.max(0, counted - WAV_HEADER))
        done(null, chunk)
      },
    })
    // (the encoder may close its input early when it fails: that is its error to report, not an error of the pipe)
    pipeline(reader.stdout, counter, encoder.stdin).catch(() => undefined)
    const ended = () => {
      if (exit.reader === null || exit.encoder === null) return
      if (exit.reader !== 0) return finish(new Error(`cdparanoia: ${said.reader.trim() || `exit ${exit.reader}`}`))
      if (exit.encoder !== 0) return finish(new Error(`ffmpeg: ${said.encoder.trim() || `exit ${exit.encoder}`}`))
      finish()
    }
    reader.on('error', (err) => finish(Object.assign(new Error(`cdparanoia: ${err.message}`), { missing: err.code === 'ENOENT' ? 'cdparanoia' : undefined })))
    encoder.on('error', (err) => finish(Object.assign(new Error(`ffmpeg: ${err.message}`), { missing: err.code === 'ENOENT' ? 'ffmpeg' : undefined })))
    reader.on('close', (code) => {
      exit.reader = code ?? 1
      ended()
    })
    encoder.on('close', (code) => {
      exit.encoder = code ?? 1
      ended()
    })
  })
}

const within = (real, base) => real === base || real.startsWith(base + path.sep)

/**
 * The folder of an album below the media, checked: the category is one of the box's, the names are clean, and nothing on the way is
 * a link that leads out of the media (as the app's upload checks it). Returns { dir } or { error }.
 */
function albumDirectory(media, category, artist, album) {
  if (!CATEGORIES.includes(category)) return { error: 'Die Kategorie gibt es nicht.' }
  const artistName = cleanName(artist)
  const albumName = cleanName(album)
  if (!artistName) return { error: 'Bitte einen Ordner für den Interpreten angeben.' }
  if (!albumName) return { error: 'Bitte einen Ordner für das Album angeben.' }
  const dir = path.join(media, category, artistName, albumName)
  let top
  let base
  try {
    top = fs.realpathSync(media)
    base = fs.realpathSync(path.join(media, category))
  } catch {
    // (the category folder is not there yet: made when the album is)
    return { dir, fresh: true }
  }
  if (base === top || !within(base, top)) return { error: 'Dieser Ordner liegt nicht auf der Box.' }
  let existing = dir
  while (!fs.existsSync(existing)) existing = path.dirname(existing)
  let real
  try {
    real = fs.realpathSync(existing)
  } catch {
    return { error: 'Dieser Ordner ist nicht zugänglich.' }
  }
  return within(real, base) ? { dir } : { error: 'Dieser Ordner liegt nicht auf der Box.' }
}

/** The artists (folders) of every category - what the form offers as "an existing folder". */
function listArtists(media) {
  const out = {}
  for (const category of CATEGORIES) {
    try {
      out[category] = fs
        .readdirSync(path.join(media, category), { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    } catch {
      out[category] = []
    }
  }
  return out
}

/** Files of the album folder that the new ones would replace (the names of the tracks, the same format) - none is replaced. */
function conflicts(dir, files) {
  let present
  try {
    present = new Set(fs.readdirSync(dir).map((n) => n.toLowerCase()))
  } catch {
    return []
  }
  return files.filter((f) => present.has(f.toLowerCase()))
}

const COVER_NAMES = ['cover', 'folder', 'front']
const hasCoverFile = (dir) => {
  try {
    return fs.readdirSync(dir).some((n) => COVER_NAMES.includes(path.parse(n).name.toLowerCase()) && /\.(jpe?g|png)$/i.test(n))
  } catch {
    return false
  }
}

/**
 * The job. `plan`: { dir, format, bitrate, album, albumArtist, genre, year, tracks: [{ nr, number (of the disc), title, artist, bytes }],
 * cover?: { bytes, replace } }. `rip(track, outFile, args, onBytes, signal)` does one track (ripTrack in the box, pretended in a test).
 * `report(state)` hears every change: { state: 'running' | 'done' | 'failed' | 'cancelled', track, tracks, percent, message? }.
 * Returns { cancel(), done: Promise }. A job that does not end well leaves nothing behind: its files and the folders it made are gone.
 */
function startJob(plan, { rip, report = () => {}, device = '/dev/sr0' }) {
  const controller = new AbortController()
  const made = []
  const madeDirs = []
  const total = plan.tracks.reduce((sum, t) => sum + t.bytes, 0) || 1
  let before = 0
  const tell = (extra) => report({ album: plan.album, tracks: plan.tracks.length, ...extra })

  const cleanUp = () => {
    for (const file of made.splice(0)) fs.rmSync(file, { force: true })
    for (const dir of madeDirs.splice(0).reverse()) {
      try {
        fs.rmdirSync(dir) // (only while empty: whatever else is in a folder stays)
      } catch {
        // not empty
      }
    }
  }

  const run = async () => {
    // (the folders that are made here, so that a job that fails takes them away again)
    const missing = []
    for (let d = plan.dir; !fs.existsSync(d); d = path.dirname(d)) missing.push(d)
    for (const d of missing.reverse()) {
      fs.mkdirSync(d)
      madeDirs.push(d)
    }
    let coverFile = null
    if (plan.cover?.bytes) {
      const kind = imageKind(plan.cover.bytes)
      if (kind) {
        // (the picture is embedded from a hidden file of its own; the album's own cover.* only when there is none or the user chose this one)
        coverFile = path.join(plan.dir, `.rip-cover.${kind}`)
        fs.writeFileSync(coverFile, plan.cover.bytes)
        made.push(coverFile)
        if (plan.cover.replace || !hasCoverFile(plan.dir)) {
          for (const old of ['cover.jpg', 'cover.png']) fs.rmSync(path.join(plan.dir, old), { force: true })
          const own = path.join(plan.dir, `cover.${kind}`)
          fs.writeFileSync(own, plan.cover.bytes)
          made.push(own)
        }
      }
    }
    for (const [index, track] of plan.tracks.entries()) {
      if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
      const final = path.join(plan.dir, track.file)
      const part = path.join(plan.dir, `.${track.file}.part`)
      made.push(part)
      const args = ffmpegArgs({
        format: plan.format,
        bitrate: plan.bitrate,
        tags: trackTags({ album: plan.album, albumArtist: plan.albumArtist, genre: plan.genre, year: plan.year, track, tracks: plan.tracks.length }),
        coverFile,
        outFile: part,
      })
      tell({ state: 'running', track: index + 1, percent: Math.floor((before / total) * 100) })
      await rip(track, part, args, (bytes) => tell({ state: 'running', track: index + 1, percent: Math.min(99, Math.floor(((before + Math.min(bytes, track.bytes)) / total) * 100)) }), controller.signal, device)
      fs.renameSync(part, final)
      made.splice(made.indexOf(part), 1, final)
      before += track.bytes
    }
    // (the hidden picture was only for embedding)
    if (coverFile) {
      fs.rmSync(coverFile, { force: true })
      made.splice(made.indexOf(coverFile), 1)
    }
  }

  const done = run().then(
    () => {
      tell({ state: 'done', track: plan.tracks.length, percent: 100 })
      return { ok: true }
    },
    (error) => {
      cleanUp()
      const cancelled = !!error?.cancelled || controller.signal.aborted
      tell({ state: cancelled ? 'cancelled' : 'failed', track: 0, percent: 0, message: cancelled ? '' : String(error?.message ?? error), missing: error?.missing })
      return { ok: false, cancelled, error: String(error?.message ?? error) }
    },
  )
  return { cancel: () => controller.abort(), done }
}

/** One track on the box: the disc is read by the drive named, the file written below `outFile`'s folder. */
const boxRip = (track, outFile, args, onBytes, signal, device) => ripTrack({ device, number: track.number, args, outFile, onBytes, signal })

module.exports = {
  boxRip,
  CATEGORIES,
  FORMATS,
  BITRATES,
  RESERVE_BYTES,
  SECTOR_BYTES,
  cleanName,
  tagText,
  trackFileName,
  imageKind,
  ffmpegArgs,
  trackTags,
  estimateBytes,
  ripTrack,
  albumDirectory,
  listArtists,
  conflicts,
  hasCoverFile,
  startJob,
}
