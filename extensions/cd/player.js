// The CD drive, player side. An audio CD in the USB drive plays like a local album of a folder that does not exist
// (`_audio_cd_`): the display's player page, the track list, next / previous, a tap on a track, shuffle and repeat work as for any
// album, because the player asks this extension where the folder is a provider's (host.albums). Besides: the drive is watched
// (cd-drive.js), what the internet knows of the disc is looked up (cd-lookup.js: Discogs, then MusicBrainz), the disc stops
// spinning when it is stopped, and the tray opens from the display's eject button.

const fs = require('node:fs')
const path = require('node:path')
const { createCdWatcher, driveCommand, DEVICE } = require('./cd-drive.js')
const { downloadCover, lookupDisc, musicBrainzDiscId } = require('./cd-lookup.js')

const FOLDER = '_audio_cd_'
// the picture of the disc in the drive: the extension's API part shows it (api.js)
const COVER_FILE = '/tmp/mupibox-cd-cover.jpg'
// discs the internet did not know, and when it was asked (not again for half an hour: a drive that flaps - a weak power supply
// resets its USB port every now and then - would ask MusicBrainz and Discogs over and over)
const MISS_MS = 30 * 60 * 1000

exports.activate = (host) => {
  // What the internet knows about the disc: artist, album, the names of the tracks and a cover. Kept on the card by the disc's
  // id, so a disc that was in the drive before is known at once - and without the internet.
  let info = null
  let lookupRun = 0
  const misses = new Map()
  const cacheDir = path.join(host.dataDir, 'cache')

  const trackTitle = (nr) => info?.tracks?.[nr - 1]?.title || `Track ${nr}`

  async function startLookup(state) {
    const run = ++lookupRun
    info = null
    // (at once, not later: the picture of this disc may be written right below)
    fs.rmSync(COVER_FILE, { force: true })
    if (!state.present || host.settings.get('cdLookup', true) === false || !Array.isArray(state.lbas)) return
    const first = state.first ?? 1
    const disc = { first, last: first + state.tracks - 1, lbas: state.lbas, barcode: state.mcn }
    const key = musicBrainzDiscId(disc.first, disc.last, disc.lbas).replace(/[^A-Za-z0-9._-]/g, '_')
    const done = (found) => {
      if (run !== lookupRun) return false // (another disc came in meanwhile)
      info = found
      if (found.tracks?.length && host.meta().path === FOLDER) {
        const title = found.tracks[host.meta().currentTracknr - 1]?.title
        host.setMeta({ ...(title ? { currentTrackname: title } : {}), ...(found.album ? { album: found.album } : {}) })
      }
      return true
    }
    try {
      const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, `${key}.json`), 'utf8'))
      if (done(cached)) {
        if (cached.hasCover) {
          try {
            fs.copyFileSync(path.join(cacheDir, `${key}.jpg`), COVER_FILE)
          } catch {
            info = { ...info, hasCover: false } // (the picture is gone from the card)
          }
        }
        host.log.debug(`${cached.artist} - ${cached.album} (from the card)`)
      }
      return
    } catch {
      // not seen before
    }
    if (Date.now() - (misses.get(key) ?? 0) < MISS_MS) return
    const found = await lookupDisc(disc, {
      token: String(host.settings.get('discogsToken', '')).trim(),
      log: (message) => host.log.debug(`lookup - ${message}`),
    })
    if (!found) {
      misses.set(key, Date.now())
      return
    }
    if (run !== lookupRun) return
    const cover = await downloadCover(found)
    if (run !== lookupRun) return
    const stored = { source: found.source, artist: found.artist, album: found.album, tracks: found.tracks, hasCover: !!cover }
    if (!done(stored)) return
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(stored))
      if (cover) {
        fs.writeFileSync(path.join(cacheDir, `${key}.jpg`), cover)
        fs.writeFileSync(COVER_FILE, cover)
      }
    } catch (err) {
      host.log.debug(`could not keep the answer: ${err.message}`)
    }
  }

  const watcher = createCdWatcher({
    onChange: (state) => {
      host.log.debug(`CD drive: ${state.present ? `audio CD, ${state.tracks} tracks` : 'no CD'}`)
      void startLookup(state).catch((err) => host.log.debug(`lookup failed: ${err.message}`))
    },
    // (a drive that is not readable by this user - the udev rule of the extension normally opens it; this is for a rule that
    // did not run yet: opened for reading and writing - libcdio also wants write access for its commands to the drive)
    fixAccess: () => {
      require('node:child_process').execFile('sudo', ['-n', 'chmod', 'a+rw', DEVICE], () => undefined)
    },
  })
  watcher.start()

  // what the display needs: the disc and what is known of it (the table of contents stays here)
  host.route('get', '/state', (_req, res) => {
    const { present, tracks, id, starts } = watcher.state
    res.json({ present, tracks, id, drive: watcher.drive, ...(starts ? { starts } : {}), ...(info ? { artist: info.artist, album: info.album, source: info.source, cover: !!info.hasCover } : {}) })
  })

  // the tray opens (or closes, when it is open) from the display's eject button; what plays from the disc stops first - a disc
  // that is read cannot be taken out
  host.route('get', '/eject', async (_req, res) => {
    if (!watcher.drive) return res.status(404).json({ ok: false, error: 'no drive' })
    if (host.meta().path === FOLDER && host.meta().currentPlayer === 'mplayer') {
      host.playback.stop()
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    const result = await driveCommand('eject', DEVICE)
    if (result.ok && !result.closing) watcher.ejected()
    host.log.debug(result.ok ? (result.closing ? 'tray closed' : 'tray opened') : `eject failed (${result.error ?? result.errno ?? '?'})`)
    res.json(result)
  })

  // The disc stops spinning when it is stopped or has played to its end (the drive would turn on for minutes otherwise).
  // mpv has to let go of the disc first: a stop is given a moment, and another playback in that moment is not disturbed.
  function spinDown(afterMs) {
    const generation = host.playback.generation()
    setTimeout(() => {
      if (generation === host.playback.generation()) void driveCommand('stop', DEVICE)
    }, afterMs)
  }

  // A CD plays as a playlist of the same disc, each entry from the start of its track to the start of the next: mpv tells the
  // time of the whole disc, so the place in the track and its length are worked out from where the tracks start (the drive's
  // table of contents).
  const rangeOf = (index) => {
    const starts = watcher.state.starts
    return Array.isArray(starts) && index >= 0 && index + 1 < starts.length ? { start: starts[index], end: starts[index + 1] } : null
  }

  host.albums.register({
    folder: FOLDER,
    play() {
      const count = watcher.state.tracks
      if (!watcher.state.present || count < 1) {
        host.log.debug('nothing to play')
        return null
      }
      host.engine.playEntries(
        Array.from({ length: count }, (_, i) => ({
          file: 'cdda://',
          options: [`start=#${i + 1}`, i + 1 < count ? `end=#${i + 2}` : '', `cdda-device=${DEVICE}`].filter(Boolean).join(','),
        })),
      )
      return { album: info?.album || 'Audio-CD', totalTracks: count }
    },
    tracklist: () => Array.from({ length: watcher.state.tracks }, (_, i) => ({ position: i + 1, name: trackTitle(i + 1) })),
    // (the disc has no file names: its tracks are numbered, and a title the disc carries - CD-TEXT - is used)
    trackName: (nr, tags) => tags?.Title || trackTitle(nr),
    progress(seconds, index) {
      const range = rangeOf(index)
      if (!range || range.end <= range.start) return { position: seconds }
      const length = range.end - range.start
      const at = Math.max(0, Math.min(length, seconds - range.start))
      return { position: at, duration: length, progress: Math.round((at / length) * 100) }
    },
    // a place in the track of the disc: percent of the track, as an absolute time of the disc
    seek(percent, index) {
      const range = rangeOf(index)
      return range ? range.start + ((range.end - range.start) * percent) / 100 : null
    },
    onStop: () => spinDown(2500),
    onFinished: () => spinDown(1500),
  })
}
