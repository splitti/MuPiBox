const express = require('express')
const http = require('node:http')
const bodyParser = require('body-parser')
const path = require('node:path')
const dns = require('node:dns')
const SpotifyWebApi = require('spotify-web-api-node')
const createMpv = require('./mpv-wrapper.js')
const { createExtensionHost, redactSecrets } = require('./extensions.js')
const Q = require('./queue.js')
const { isPlaylistUrl, pointsAtBox, resolveStreamUrl } = require('./playlist-url.js')
const googleTTS = require('google-tts-api')
const fs = require('node:fs')
const childProcess = require('node:child_process')

// Force IPv4 for DNS lookups to avoid EAI_AGAIN errors on Raspberry Pi
// This fixes issues where IPv6 is misconfigured or not supported
dns.setDefaultResultOrder('ipv4first')

let configBasePath = './config'
if (process.env.NODE_ENV === 'development') {
  configBasePath = '../config'
}
// What the box keeps and what it can fetch again, since 5.1 beside the player's folder (~/.mupibox/player):
// ~/.mupibox/data (an update never touches it) and ~/.mupibox/cache - as the server's paths.ts. In development
// next to the player's config.
const MUPI_HOME = '/home/dietpi/.mupibox'
const DATA_DIR = process.env.NODE_ENV === 'development' ? configBasePath : `${MUPI_HOME}/data`
const LIBRARY_DIR = process.env.NODE_ENV === 'development' ? configBasePath : `${DATA_DIR}/library`
const CACHE_DIR = process.env.NODE_ENV === 'development' ? configBasePath : `${MUPI_HOME}/cache`

// mupiboxconfig.json supports live reload — admin saves take effect within ~50ms
// without a pm2 restart. config.json (Spotify creds, log level, port) is read once
// at startup because spotifyApi/log/server.listen() seal those values; changing those
// still requires a pm2 restart.
const MUPIBOX_CONFIG_PATH = `${configBasePath}/mupiboxconfig.json`

function readMupiBoxConfigFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(MUPIBOX_CONFIG_PATH, 'utf8'))
  } catch (err) {
    console.error(`${new Date().toLocaleString()}: [Config] Failed to read ${MUPIBOX_CONFIG_PATH}:`, err)
    return null
  }
}

let muPiBoxConfig = readMupiBoxConfigFromDisk()
if (!muPiBoxConfig) {
  console.error(
    `${new Date().toLocaleString()}: [Config] mupiboxconfig.json missing or unparseable on startup, exiting.`,
  )
  process.exit(1)
}

// Watch the directory containing the resolved file (the local path is typically a symlink
// to /etc/mupibox/mupiboxconfig.json on the box). Watching the directory rather than the
// symlinked file is what makes atomic-rename writes (admin uses `mv tmp dest`) trigger.
//
// History: an earlier version of this watcher had no 'error' listener, no debounce, and
// blindly read mid-write. On an admin save (`sudo mv` from /tmp into /etc/mupibox/) the
// rename briefly produced EACCES (file owned by www-data while move was in flight) and/or
// ENOENT (cross-fs mv = unlink + create, with a window where the path didn't exist). The
// readFileSync errors were caught — but the FSWatcher itself emitted three rapid-fire
// 'change' events for the same atomic save, and on box restarts where the symlink target
// got rebuilt, the FSWatcher emitted an 'error' event with no listener attached, which
// Node turns into an uncaught exception → process exit. pm2 saw 5 crash-restarts per
// 30 minutes, manifesting as audio glitches every few minutes.
function setupMupiBoxConfigWatch() {
  let watchDir
  let watchFile
  try {
    const realPath = fs.realpathSync(MUPIBOX_CONFIG_PATH)
    watchDir = path.dirname(realPath)
    watchFile = path.basename(realPath)
  } catch (err) {
    console.warn(
      `${new Date().toLocaleString()}: [Config] Cannot resolve ${MUPIBOX_CONFIG_PATH} for watch (live-reload disabled):`,
      err,
    )
    return
  }
  // Re-watch on watcher failure (e.g. directory replaced during update). Capped at one
  // reattach per 5s so a permanently broken setup just disables live-reload silently.
  let lastReattach = 0
  const startWatch = () => {
    let watcher
    try {
      watcher = fs.watch(watchDir, { persistent: false }, (_event, filename) => {
        if (!filename || filename.toString() !== watchFile) return
        scheduleReload()
      })
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [Config] fs.watch failed (live-reload disabled):`, err)
      return
    }
    watcher.on('error', (err) => {
      console.warn(`${new Date().toLocaleString()}: [Config] Watcher error, attempting reattach:`, err)
      try {
        watcher.close()
      } catch {
        // best-effort
      }
      const now = Date.now()
      if (now - lastReattach > 5000) {
        lastReattach = now
        setTimeout(startWatch, 250)
      } else {
        console.warn(`${new Date().toLocaleString()}: [Config] Watcher reattach skipped (rate-limited), live-reload disabled until next pm2 restart`)
      }
    })
    console.log(`${new Date().toLocaleString()}: [Config] Watching ${watchDir}/${watchFile} for live-reload`)
  }

  // Debounce: a single `sudo mv` from PHP fires three FSWatcher events in quick
  // succession (rename, attribute change, possibly chmod). Coalesce them into one
  // re-read so the log isn't spammed with three "Reloaded" lines per save, and the
  // mid-write race window narrows (we wait until everyone's done writing before reading).
  let reloadTimer = null
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      const fresh = readMupiBoxConfigFromDisk()
      if (fresh) {
        muPiBoxConfig = fresh
        console.log(`${new Date().toLocaleString()}: [Config] Reloaded mupiboxconfig.json (live)`)
        if (typeof applyLoudness === 'function') applyLoudness()
      }
      // On parse failure we keep the old in-memory copy. fs.watch can still fire
      // mid-write occasionally even with debounce, so a parse error here is normal
      // and silently ignored — the next event will pick up the final state.
    }, 100)
  }

  startWatch()
}
setupMupiBoxConfigWatch()

// Returns true iff the Telegram integration is fully configured (active flag,
// non-empty token, at least one chat id). Replaces the chatId.length > 1 +
// token.length > 1 + active checks scattered throughout the file. Necessary
// because chatId can now be a single string (legacy), or an array of strings,
// or an array of {id, label?} objects (new admin-UI format).
// Messages about playback (start, every track with a screenshot, pause, stop, continue) only when the parents asked
// for them (telegram.notifyPlayback, off by default): they came by the dozen a day and buried the important ones
// (listening time used up, quiet time, shutdown). The bot's commands do not depend on them.
function telegramPlaybackNotices() {
  return hasConfiguredTelegram() && muPiBoxConfig?.telegram?.notifyPlayback === true
}

function hasConfiguredTelegram() {
  const t = muPiBoxConfig?.telegram
  if (!t || t.active !== true) return false
  if (!t.token || String(t.token).length <= 1) return false
  const chats = t.chatId
  if (typeof chats === 'string') return chats.length > 1
  if (typeof chats === 'number') return true
  if (Array.isArray(chats)) {
    return chats.some((c) => {
      if (typeof c === 'string') return c.length > 1
      if (typeof c === 'number') return true
      if (c && typeof c === 'object') return c.id != null && String(c.id).length > 1
      return false
    })
  }
  return false
}

const config = require(`${configBasePath}/config.json`)

const log = require('console-log-level')({ level: config.server.logLevel })

/*set up express router and set headers for cross origin requests*/
const app = express()
const server = http.createServer(app)
// The engine for everything that is not Spotify: mpv (mpv-wrapper.js). mplayer, the engine up to 5.0.6 and the
// fallback until 5.0.9, is gone - "mupibox.playerEngine" in mupiboxconfig.json and MUPIBOX_PLAYER are not read any
// more. The installation and the update install mpv; a box without it plays nothing but Spotify, said in the log.
const installed = (bin) =>
  (process.env.PATH || '/usr/bin:/bin')
    .split(':')
    .some((dir) => dir && fs.existsSync(`${dir}/${bin}`))
if (!installed('mpv'))
  console.error(`${new Date().toLocaleString()}: [Player] mpv is not installed - nothing but Spotify plays (sudo apt-get install mpv)`)
const player = createMpv()
console.log(`${new Date().toLocaleString()}: [Player] engine: mpv`)
// The levelling of the loudness (mupibox.loudness: off | soft | strong, the app's "Lautstärke angleichen"): set when
// the engine is up and whenever the config changes; only mpv has it
let loudnessApplied = null
function applyLoudness() {
  const mode = ['soft', 'strong'].includes(muPiBoxConfig?.mupibox?.loudness) ? muPiBoxConfig.mupibox.loudness : 'off'
  if (mode === loudnessApplied) return
  loudnessApplied = mode
  player.setLoudness?.(mode)
  console.log(`${new Date().toLocaleString()}: [Player] loudness levelling: ${mode}`)
}
// The Winamp theme's equaliser and balance (the display's windows, see frontend-box/src/app/winamp): kept in a file so
// they come back after a restart; only mpv has the filters
const WINAMP_SOUND_FILE = '/home/dietpi/.mupibox/winamp-sound.json'
const winampSound = { on: false, auto: false, preamp: 0, bands: new Array(10).fill(0), balance: 0 }
try {
  Object.assign(winampSound, JSON.parse(fs.readFileSync(WINAMP_SOUND_FILE, 'utf8')))
} catch {
  // none saved yet
}
const applyWinampSound = () => player.setSound?.(winampSound)
player.on('ready', () => {
  loudnessApplied = null // (a new mpv process after a respawn starts without the filter)
  applyLoudness()
  applyWinampSound()
})

// Refuse commands a foreign web page sends through a visitor's browser; CORS only for the box's
// own pages (was: Access-Control-Allow-Origin * for everyone). See request-guard.js.
app.use(require('./request-guard').browserGuard)
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

const spotifyApi = new SpotifyWebApi({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret,
  refreshToken: config.spotify.refreshToken,
})

/* sets and refreshes access token every hour */
// .catch: without network (e.g. right after boot) the refresh fails, and an unhandled rejection
// ends the process under Node 22 - the player then crash-looped until the WiFi was up.
const refreshTokenLogged = () =>
  refreshToken().catch(() => console.warn(`${now()}: [Spotify Control] Access token refresh failed (offline?), will retry`))
refreshTokenLogged()
// (every 50 minutes: the token lasts an hour - refreshed right at its end, the commands around it met a 401 and were lost)
setInterval(refreshTokenLogged, 1000 * 60 * 50)

const apiAccessToken = {
  accessToken: null,
  expires: Date.now(),
}

player.on('percent_pos', (val) => {
  //console.log('track progress is', val);
  if (!isCuePlayback() && !albumNow()?.progress) currentMeta.progressTime = val
})

// --- CUE albums (one audio file, tracks by start time - see /api/nas/tracklist) ---
// mplayer only knows the single file, so the current track is worked out from the playing time, and
// "next", "previous", a track chosen in the list and the progress bar seek inside the file.
let currentCue = null // { tracks: [{ position, name, startSeconds }], fileLength } while such an album plays

function isCuePlayback() {
  return currentCue !== null && currentMeta.currentType === 'nas' && currentMeta.currentPlayer === 'mplayer'
}

function cueTrackEnd(index) {
  const next = currentCue.tracks[index + 1]
  return next ? next.startSeconds : currentCue.fileLength
}

function cueTrackAt(seconds) {
  let index = 0
  for (let i = 0; i < currentCue.tracks.length; i++) {
    if (currentCue.tracks[i].startSeconds <= seconds + 0.25) index = i
  }
  return index
}

// mplayer can drop a seek that arrives while it is still buffering after the previous one (a child pressing
// "next" twice quickly). So a seek is remembered until the playing time really got there, and sent again
// (twice at most) if it did not.
let pendingCueSeek = null // { seconds, at, tries }
function cueSeek(seconds) {
  // absolute position in seconds: mplayer "seek <seconds> 2"
  player.exec('pausing_keep seek', [seconds, 2])
  pendingCueSeek = { seconds, at: Date.now(), tries: 0 }
}

player.on('length', (val) => {
  if (currentCue) currentCue.fileLength = val
  if (!isCuePlayback() && !albumNow()?.progress) currentMeta.durationSeconds = val
})
player.on('time_pos', (seconds) => {
  // an album that is no folder (an extension's: the audio CD) says where in its track the playing time of the whole is
  const album = currentMeta.currentPlayer === 'mplayer' ? albumNow() : undefined
  if (album?.progress) {
    const at = album.progress(seconds, player.trackIndex?.() ?? currentMeta.currentTracknr - 1)
    if (at) {
      currentMeta.positionSeconds = at.position
      if (at.duration !== undefined) currentMeta.durationSeconds = at.duration
      if (at.progress !== undefined) currentMeta.progressTime = at.progress
    } else currentMeta.positionSeconds = seconds
    return
  }
  if (!isCuePlayback()) {
    pendingCueSeek = null
    currentMeta.positionSeconds = seconds
    noteEpisodePosition(seconds)
    return
  }
  if (pendingCueSeek) {
    if (Date.now() - pendingCueSeek.at < 2500) return // keep the number/title the user just chose while mplayer catches up
    if (Math.abs(seconds - pendingCueSeek.seconds) > 8 && pendingCueSeek.tries < 2) {
      pendingCueSeek.tries++
      pendingCueSeek.at = Date.now()
      player.exec('pausing_keep seek', [pendingCueSeek.seconds, 2])
      return
    }
    pendingCueSeek = null // arrived (or given up)
  }
  const index = cueTrackAt(seconds)
  const track = currentCue.tracks[index]
  if (currentMeta.currentTracknr !== index + 1) {
    const before = currentMeta.currentTracknr
    currentMeta.currentTracknr = index + 1
    currentMeta.currentTrackname = track.name
    if (typeof before === 'number' && before >= 1 && index + 1 > before) graceSongBoundary() // played on into the next song
  }
  const end = cueTrackEnd(index)
  if (end > track.startSeconds) {
    currentMeta.progressTime = Math.max(0, Math.min(100, Math.round(((seconds - track.startSeconds) * 100) / (end - track.startSeconds))))
    currentMeta.positionSeconds = Math.max(0, seconds - track.startSeconds)
    currentMeta.durationSeconds = end - track.startSeconds
  }
})
setInterval(() => {
  if (!isCuePlayback()) return
  if (!currentCue.fileLength) player.getProps(['length'])
  player.getProps(['time_pos'])
}, 1000)

// Seeks to the start of track number `position` (1-based) of the playing CUE album.
function seekToCueTrack(position) {
  const target = Math.max(1, Math.min(currentCue.tracks.length, position))
  const track = currentCue.tracks[target - 1]
  log.debug(`${now()}: [Spotify Control] CUE: seeking to track ${target} at ${track.startSeconds}s`)
  cueSeek(track.startSeconds)
  currentMeta.currentTracknr = target
  currentMeta.currentTrackname = track.name
  currentMeta.progressTime = 0
}
player.on('pause', (val) => {
  currentMeta.playing = !val
})
// Phase 13 B2: a single per-second timer fetches both props. getProps()
// iterates and sends one `get_property` per item (see mplayer-wrapper.js), so
// this is behaviour-identical to the two separate setIntervals it replaces —
// one JS timer instead of two. The audit's idle-gate half is intentionally
// NOT done: marginal benefit, with a real risk of stale percent_pos/pause
// across play/stop transitions (the resume-tracking area Phase 7.5 fixed).
setInterval(() => {
  player.getProps(['percent_pos', 'pause'])
  // playing time and length of the file (the display shows them under the progress bar); CUE albums have their
  // own timer above
  if (currentMeta.currentPlayer === 'mplayer' && !isCuePlayback()) player.getProps(['time_pos', 'length'])
}, 1000)

player.on('metadata', (val) => {
  log.debug('track metadata is', val)
  // (an answer of mplayer/mpv that comes in after Spotify took over is not Spotify's track)
  if (currentMeta.currentPlayer === 'spotify') return
  //currentMeta.currentTracknr = parseInt(val.Comment?.split(',').pop(), 10);
  // (an engine that knows its place in the playlist says it; else every file that starts counts one up)
  const trackIndex = player.trackIndex?.() ?? -1
  currentMeta.currentTracknr = trackIndex >= 0 ? trackIndex + 1 : currentMeta.currentTracknr + 1
  log.debug(`${now()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
  if (currentMeta.currentType === 'nas') {
    // Mplayer would report the stream-proxy URL as "filename"/"path" for NAS
    // tracks, so use the track name already known from the live NAS tracklist
    // instead of trying to parse anything out of mplayer's own metadata.
    const track = currentNasTracks[currentMeta.currentTracknr - 1]
    if (track) {
      currentMeta.currentTrackname = track.cue ? track.name : track.name.replace(/\.[^./]+$/, '')
    }
    // the file that plays: the display and the web app show its embedded picture (/api/track-cover)
    currentMeta.trackFile = track ? `nas:${track.path}` : undefined
  } else if (currentMeta.currentType === 'tidal') {
    const track = currentTidalTracks[currentMeta.currentTracknr - 1]
    if (track) currentMeta.currentTrackname = track.name
  } else if (albumNow()) {
    // (an album that is no folder - an extension's - names its tracks)
    currentMeta.currentTrackname = albumNow().trackName?.(currentMeta.currentTracknr, val) || val.Title
  } else if (currentMeta.currentType !== 'rss' && currentMeta.currentType !== 'radio') {
    currentMeta.currentTrackname = val.Title
  }
})
player.on('track-change', () => player.getProps(['metadata']))

// --- Going on where it was left, for streams (the NAS, podcasts) ---
// A stream plays only once mplayer's buffer is filled (a second or two after the load); until then mplayer takes
// neither the volume nor a seek - both were sent with the load, came to nothing, and the beginning was heard before
// a later retry jumped. So they wait for "Starting playback..." (the wrapper's track-change), and the sound comes
// back once the playing time shows the position (or after maxMs at the latest).
let onPlaybackStart = null // { generation, run } for the next start of the current playback
function atPlaybackStart(run) {
  onPlaybackStart = { generation: playbackGeneration, run }
}
player.on('track-change', () => {
  const next = onPlaybackStart
  if (!next) return
  onPlaybackStart = null
  if (next.generation !== playbackGeneration) return
  player.setVolume(0)
  next.run()
})
let silence = null // { reached, timer } while playback is on its way to where it was left
function silentUntil(reached, maxMs) {
  if (silence) clearTimeout(silence.timer)
  player.setVolume(0)
  silence = { reached, timer: setTimeout(() => endSilence(), maxMs) }
}
function endSilence(delayMs = 0) {
  const s = silence
  if (!s) return
  clearTimeout(s.timer)
  silence = null
  // (a moment after arriving, so what is still in the audio buffer from before is not heard)
  setTimeout(() => {
    if (!silence) player.setVolume(volumeStart)
  }, delayMs)
}
function checkSilence() {
  if (silence?.reached()) endSilence(400)
}

// --- Buffering of streams before playback starts ---
// mpv reports 0-100 of its goal (cachePrefillPercent, 100)
const cachePrefillPercent = player.cachePrefillPercent ?? 100
let loadingTimer = null
// The dots on the cover are shown for at least this long (ms): on a fast line the stream plays after a second or so, and
// the display (it asks once a second) hardly saw them.
const MIN_LOADING_MS = 2000
let loadingSince = 0
let loadingEndTimer = null
// Where the stream starts (s): an episode that goes on reports that position at once - the sound runs once time_pos
// is past it. And time_pos counts only once the new file is loaded (track-change): an answer to a time-pos query sent
// before the loadfile came in afterwards with the position of the file before, and ended the loading.
let loadingFromPos = 0
let loadingFileLoaded = false

function startLoading(fromSeconds = 0) {
  currentMeta.loading = true
  currentMeta.loadProgress = 0
  loadingSince = Date.now()
  loadingFromPos = Number(fromSeconds) || 0
  loadingFileLoaded = false
  clearTimeout(loadingEndTimer)
  clearTimeout(loadingTimer)
  // Never leave the display waiting for ever (unreachable stream, stream ended, ...).
  loadingTimer = setTimeout(stopLoading, 90 * 1000)
}

function stopLoading() {
  clearTimeout(loadingTimer)
  clearTimeout(loadingEndTimer)
  currentMeta.loading = false
  currentMeta.loadProgress = 0
}

// The stream plays: the dots end - after MIN_LOADING_MS at the earliest (a stop or a failure ends it at once)
function finishLoading() {
  if (!currentMeta.loading) return
  const rest = MIN_LOADING_MS - (Date.now() - loadingSince)
  if (rest <= 0) {
    stopLoading()
    return
  }
  clearTimeout(loadingEndTimer)
  loadingEndTimer = setTimeout(stopLoading, rest)
}

// mpv says file-loaded (track-change) as soon as the stream is OPEN and fills its cache after that - the dots ended in
// that moment, and the display showed nothing for the seconds until the sound came. The loading ends with the cache
// filled, or, for a stream that reports no buffering, with the sound running (time_pos past where it started).
// what the file is, for the Winamp theme's little displays (kbit/s, kHz, mono / stereo)
player.on('audio-info', (info) => Object.assign(currentMeta, info))
player.on('cache-fill', (percent) => {
  if (currentMeta.loading) {
    currentMeta.loadProgress = Math.min(100, Math.round((percent / cachePrefillPercent) * 100))
    if (currentMeta.loadProgress >= 100) finishLoading()
  }
})
player.on('track-change', () => {
  loadingFileLoaded = true
})
player.on('time_pos', (seconds) => {
  if (currentMeta.loading && loadingFileLoaded && Number(seconds) > loadingFromPos + 0.5) finishLoading()
})
player.on('percent_pos', checkSilence)
player.on('time_pos', checkSilence)

//player.on('length', console.log)
//player.on('track-change', () => player.getProps(['length']))

player.on('filename', (val) => {
  log.debug('track name is', val)
  if (!currentMeta.currentTrackname && currentMeta.currentPlayer !== 'spotify' && !albumNow()) {
    currentMeta.currentTrackname = val
      .split('.mp3')[0]
      .split('.flac')[0]
      .split('.wma')[0]
      .split('.wav')[0]
      .split('.m4a')[0]
  }
})
player.on('track-change', () => player.getProps(['filename']))

player.on('path', (val) => {
  log.debug('track path is', val)
  // A local file that plays (NAS: set from the track list, see 'metadata'): its embedded picture is shown.
  const mediaRoot = '/home/dietpi/MuPiBox/media/'
  if (currentMeta.currentType !== 'nas') {
    currentMeta.trackFile =
      typeof val === 'string' && val.startsWith(mediaRoot) ? `local:${val.slice(mediaRoot.length)}` : undefined
  }
  if (!['rss', 'radio', 'nas', 'tidal'].includes(currentMeta.currentType) && !albumNow()) {
    // The folder holding the file, whatever the folder depth (was: fixed 7th segment).
    const pathParts = val.split('/')
    if (pathParts.length > 2) {
      currentMeta.album = pathParts[pathParts.length - 2]
    }
  }
})
player.on('track-change', () => player.getProps(['path']))

player.on('track-change', () => {
  if (telegramPlaybackNotices() && (currentMeta.currentType === 'rss' || currentMeta.currentType === 'radio'))
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py')
  if (telegramPlaybackNotices() && currentMeta.currentType === 'local')
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py')
})

// Playtime + Quiet-Hours grace: stop at the next natural mplayer break point
// (start of next track, or end of playlist). Spotify doesn't surface these
// events, so for Spotify the grace timeout in the tick is the only stop trigger.
// Both sub-systems are checked independently — a single track-change can
// finalize either or both if both happen to be in grace simultaneously.
// The next song is about to start: in "let the song finish" mode this is the moment to stop. In "let the album
// finish" mode songs simply run on until the playlist is over.
function graceSongBoundary() {
  if (playtimeState.state === 'grace' && playtimeState.graceMode === 'track') {
    finalizePlaytimeBlock('next track would start during grace period', true)
  }
  if (quietHoursState.state === 'grace' && quietHoursState.graceMode === 'track') {
    finalizeQuietHoursBlock('next track would start during grace period', true)
  }
  if (tileState.state === 'grace' && tileState.graceMode === 'track') {
    finalizeTileBlock('next track would start during grace period', true)
  }
}
player.on('track-change', graceSongBoundary)
player.on('playlist-finish', () => {
  if (playtimeState.state === 'grace') {
    finalizePlaytimeBlock('playlist finished during grace period', true)
  }
  if (quietHoursState.state === 'grace') {
    finalizeQuietHoursBlock('playlist finished during grace period', true)
  }
  if (tileState.state === 'grace') {
    finalizeTileBlock('playlist finished during grace period', true)
  }
  // (a stream that ended or broke off before it played: no loading any more - it stayed on until the 90-s guard, and
  // the display took the box for playing meanwhile. A reconnect below starts a loading of its own.)
  stopLoading()
  // A podcast episode that ended long before its end: the connection to its server broke (mplayer takes that as
  // the end of the file) - it is opened again where it stopped
  if (reconnectEpisode()) return
  // the album or episode played to its end (not a stop: that empties currentPlayer first) - the display goes back
  // to its list at once instead of waiting 10 s for the player to stay silent
  if (currentMeta.currentPlayer === 'mplayer') currentMeta.finished = true
  albumNow()?.onFinished?.() // (an album that is no folder: it played to its end)
  heardPlaylistFinished()
  extensions.emit('finished')
  // Library album finished naturally — drop its resume entry so the user
  // isn't offered "weiterhören" at the very end next time. Spotify and RSS
  // are skipped: Spotify gives no clean end-of-album signal via the
  // mplayer wrapper anyway, and RSS isn't tracked with enough metadata in
  // currentMeta to build a composite key.
  deleteResumeForFinishedLibraryAlbum()
})

// POSTs a minimal Media-shape body to /api/deleteresume so the backend-api
// removes the matching resume.json entry by composite key. Best-effort: a
// failure here just leaves a stale resume entry, no playback impact.
function deleteResumeForFinishedLibraryAlbum() {
  if (currentMeta.currentPlayer !== 'mplayer') return
  const rawPath = currentMeta.path
  if (!rawPath) return
  let body
  if (currentMeta.currentType === 'tidal') {
    // a TIDAL album or playlist: its resume entry is keyed by TIDAL's id (path is <album|playlist>:<id>)
    const id = String(rawPath).split(':')[1]
    if (!id) return
    body = JSON.stringify({ type: 'tidal', id })
  } else {
    if (currentMeta.currentType !== 'local') return
    const parts = String(rawPath).split('/')
    if (parts.length < 3) return
    body = JSON.stringify({
      type: 'library',
      artist: decodeURIComponent(parts[1]),
      title: decodeURIComponent(parts[2]),
    })
  }
  const req = http.request(
    {
      host: '127.0.0.1',
      port: 8200,
      path: '/api/deleteresume',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (response) => {
      response.resume() // drain
      log.debug(
        `${now()}: [Spotify Control] deleteresume status=${response.statusCode} for ${rawPath}`,
      )
    },
  )
  req.on('error', (err) => {
    log.debug(`${now()}: [Spotify Control] deleteresume failed: ${err.message}`)
  })
  req.write(body)
  req.end()
}

// --- Heard (5.1, issue #180): the ticks at the covers of a list on the display ---
// What plays counts as "started" after a minute of playing and as "finished" when its last track played to its last 30 s
// (or to its end); the two moments go to the backend (heard.ts), which keeps them. What plays is named with its start
// (?heard=, by the display and the app), else it is formed from what plays (a start from Telegram, Home Assistant, an
// extension) - the same keys: lib:<folder>, nas:<path>, tidal:<album|playlist>:<id>, spotify:<kind>:<id>.
// Podcast episodes have their own (the episode positions); radio has none.
const HEARD_KEY = /^(lib|nas|tidal|spotify):[^\n]{1,400}$/
const HEARD_STARTED_S = 60
const HEARD_END_S = 30
// given: the key the start named, for the playback it started (gen); key: what is counted now
const heardState = { given: null, gen: -1, key: null, played: 0, started: false, finished: false, track: 0, settle: 0 }
// what the display's Spotify player last told of what it plays (see /display/spotify-progress)
let spotifyProgress = null
const spotifyLastFetchFailed = new Map() // album id -> when asking for its last track failed (not again for a while)

function startHeard(given) {
  Object.assign(heardState, { given, gen: playbackRequest, key: null, played: 0, started: false, finished: false, track: 0, settle: 0 })
  spotifyProgress = null
}

// What plays now, as its key (the same as the display's: the folder, the NAS path, TIDAL's kind:id, Spotify's uri)
function heardKeyPlaying() {
  const p = currentMeta.path
  if (currentMeta.currentPlayer === 'mplayer') {
    if (!p) return null
    if (currentMeta.currentType === 'local') return `lib:${p}`
    if (currentMeta.currentType === 'nas') return `nas:${p}`
    if (currentMeta.currentType === 'tidal') return `tidal:${p}`
    return null
  }
  if (currentMeta.currentPlayer === 'spotify') {
    const m = /^spotify:(album|playlist|episode|show):([A-Za-z0-9]+)/.exec(currentMeta.activeSpotifyId || '')
    return m ? `spotify:${m[1]}:${m[2]}` : null
  }
  return null
}

function heardKeyNow() {
  // What plays first: a start that failed (the NAS away, TIDAL not signed in, Spotify blocking) left the album before
  // playing - counted under the key the failed start named - and another episode chosen in the player's list came with
  // the key of the one opened. The key the start named only when what plays has none of its own (the same playback).
  const playing = heardKeyPlaying()
  if (playing) return playing
  return heardState.given && heardState.gen === playbackRequest ? heardState.given : null
}

function noteHeard(key, state) {
  if (!HEARD_KEY.test(key)) return
  const body = JSON.stringify({ key, state })
  const req = http.request(
    { host: '127.0.0.1', port: 8200, path: '/api/heard/note', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    (response) => {
      response.resume()
      log.debug(`${now()}: [Spotify Control] heard ${state} ${key}: ${response.statusCode}`)
    },
  )
  req.on('error', (err) => log.debug(`${now()}: [Spotify Control] heard note failed: ${err.message}`))
  req.write(body)
  req.end()
}

// Whether the Spotify track that plays is the last of what was started: an episode is its own; an album's last track as
// Spotify lists it (asked once per album); else the display's player has nothing after it
function spotifyIsLast(p) {
  const m = /^spotify:(album|playlist|episode|show):([A-Za-z0-9]+)/.exec(currentMeta.activeSpotifyId || '')
  if (!m) return false
  if (m[1] === 'episode') return true
  // (Spotify went on with something else - its autoplay: not what was started)
  if (p.ctx && p.ctx !== `spotify:${m[1]}:${m[2]}`) return false
  // (nothing after it in what was started; or an album's last track - Spotify's autoplay may line up others after it.
  // Shuffled: the album's last track comes at any place - only nothing after it counts, as for the box's own player)
  if (p.shuffle) return p.next === 0
  return p.next === 0 || (m[1] === 'album' && !!p.track && spotifyAlbumLastTrack.get(m[2]) === p.track)
}

// The last track of an album by its id, for spotifyIsLast (kept with the grace check's, see spotifyLastTrackOfAlbum)
async function learnSpotifyAlbumEnd(id) {
  if (spotifyAlbumLastTrack.has(id) || spotifyBlockedUntil()) return
  const failed = spotifyLastFetchFailed.get(id)
  if (failed && Date.now() - failed < 10 * 60_000) return
  spotifyLastFetchFailed.set(id, Date.now()) // (also while it is asked: once at a time)
  try {
    const { body } = await spotifyApi.getAlbum(id)
    const total = body?.tracks?.total ?? body?.total_tracks ?? 0
    const items = body?.tracks?.items ?? []
    if (total > 0 && items.length >= total && items[total - 1]?.id) {
      if (spotifyAlbumLastTrack.size > 200) spotifyAlbumLastTrack.clear()
      spotifyAlbumLastTrack.set(id, items[total - 1].id)
    } else await spotifyLastTrackOfAlbum({ id, total_tracks: total })
    if (spotifyAlbumLastTrack.has(id)) spotifyLastFetchFailed.delete(id)
  } catch (err) {
    log.debug(`${now()}: [Spotify Control] heard: the album's last track not known (${err?.message ?? err})`)
  }
}

function heardNearEnd() {
  if (currentMeta.currentPlayer === 'mplayer') {
    // (shuffled: its last track is any - only the end of the list counts, see heardPlaylistFinished)
    if (currentMeta.shuffle || heardState.settle > 0) return false
    const nr = Number(currentMeta.currentTracknr)
    const total = Number(currentMeta.totalTracks)
    const dur = Number(currentMeta.durationSeconds)
    const pos = Number(currentMeta.positionSeconds)
    return total > 0 && nr >= total && dur > 0 && pos > 0 && pos >= dur - HEARD_END_S
  }
  if (currentMeta.currentPlayer === 'spotify') {
    const p = spotifyProgress
    if (!p || p.paused || !(p.durMs > 0)) return false
    const at = p.posMs + (Date.now() - p.at)
    return at >= p.durMs - HEARD_END_S * 1000 && spotifyIsLast(p)
  }
  return false
}

// every second (combinedTick): a minute played - started; the last 30 s of the last track - finished
function heardTickStep() {
  const key = heardKeyNow()
  if (key !== heardState.key) Object.assign(heardState, { key, played: 0, started: false, finished: false, track: 0, settle: 0 })
  if (!key || heardState.finished) return
  // (a track that just began: the times of the one before stand for a moment - the last one began, with the position of
  // the end of the one before it, was taken for its end)
  const nr = Number(currentMeta.currentTracknr) || 0
  if (nr !== heardState.track) {
    heardState.track = nr
    heardState.settle = 3
  } else if (heardState.settle > 0) heardState.settle--
  if (!isActuallyPlaying()) return
  heardState.played++
  if (!heardState.started && heardState.played >= HEARD_STARTED_S) {
    heardState.started = true
    noteHeard(key, 'started')
  }
  if (heardNearEnd()) {
    heardState.finished = true
    noteHeard(key, 'finished')
  }
}

// the box's player came to the end of its list (not a stop): what played is heard to its end
function heardPlaylistFinished() {
  if (currentMeta.currentPlayer !== 'mplayer') return
  // (only when the last track really played to its end: the list also runs out when every track after one fails - the
  // NAS gone, the WiFi moving to another access point, TIDAL's sign-in expired - an audio play broken off after its
  // third episode was green. Shuffled: any track is the last one, its end counts)
  const nr = Number(currentMeta.currentTracknr)
  const total = Number(currentMeta.totalTracks)
  const dur = Number(currentMeta.durationSeconds)
  const pos = Number(currentMeta.positionSeconds)
  if (!(dur > 0 && pos >= dur - HEARD_END_S) || (!currentMeta.shuffle && !(total > 0 && nr >= total))) return
  const key = heardKeyNow()
  if (!key || (heardState.key === key && heardState.finished)) return
  if (heardState.key !== key) Object.assign(heardState, { key, played: 0, started: true })
  heardState.finished = true
  noteHeard(key, 'finished')
}

// H1: amixer was forked once per second to mirror the system volume into
// currentMeta.volume. setVolume() already pushes the new value into
// currentMeta.volume directly when the user changes it; the periodic poll
// is only there to catch external changes (e.g. someone running amixer
// over SSH). 5s is plenty for that — fewer fork+exec syscalls is worth
// far more than 5s of staleness on a value the kid never touches.
setInterval(() => {
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"
  childProcess.exec(cmdVolume, (e, stdout, _stderr) => {
    // A failed amixer call (sound card busy or not there yet) used to be thrown inside this
    // callback - an uncaught exception that ended the whole player. Keep the last value instead.
    if (e instanceof Error) {
      if (process.env.NODE_ENV !== 'development') {
        log.debug(`${now()}: [Spotify Control] amixer volume poll failed: ${e.message}`)
      }
      return
    }
    const match = /\[(\d+)%\]/.exec(stdout)
    if (match) {
      currentMeta.volume = Number.parseInt(match[1], 10)
      // headphones just connected, the box louder than their maximum: down to it (whoever set the volume)
      const btMax = muPiBoxConfig.mupibox?.btMaxVolume
      if (Number.isInteger(btMax) && currentMeta.volume > btMax) {
        bluetoothAudio().then((on) => {
          if (!on) return
          log.info(`${now()}: [Spotify Control] Bluetooth audio: volume ${currentMeta.volume} % down to its maximum ${btMax} %`)
          _volumeOpQueue = _volumeOpQueue.then(() => cmdCall(`/usr/bin/amixer sset Master ${btMax}%`)).catch(() => {})
          currentMeta.volume = btMax
        })
      }
    }
  })
}, 5000)

let activeDevice = null
let displaySpotifyDevice = null // the display's Web Playback SDK device, as reported by the display
let displayDeviceReportedAt = 0 // when the display last reported it (see playOnDevice)
let displayRecoveryAt = 0 // when the display was last asked to sign in to Spotify anew
// AR5-4: was `const nowDate = new Date()` evaluated once at module-load.
// All 86 log templates that used `${now()}` printed
// the boot timestamp on every line, making production debugging useless.
// Use a fresh Date per call so timestamps reflect the actual event.
const now = () => new Date().toLocaleString()
const volumeStart = 99
let playerstate
let spotifyRunning = false
let date = ''
const counter = {
  countgetMyCurrentPlaybackState: 0,
  countgetMyCurrentPlaybackStateHTTP: 0,
  countfreshAccessToken: 0,
  countsetAccessToken: 0,
  counterror: 0,
  counterrorAccessToken: 0,
  counterrorInvalidID: 0,
  counterrorNoActivDevice: 0,
  countgetAlbum: 0,
  countgetArtist: 0,
  countgetMyDevices: 0,
  countpause: 0,
  countplay: 0,
  countseek: 0,
  countsetShuffle: 0,
  countsetVolume: 0,
  countskipToNext: 0,
  countskipToPrevious: 0,
  counterrorToManyRequest: 0,
  counttransferMyPlayback: 0,
}
const currentMeta = {
  activeSpotifyId: '',
  currentPlayer: '',
  currentType: '',
  playing: false,
  pause: false,
  album: '',
  path: '',
  finished: false, // the local album or episode played to its end (see playlist-finish)
  episode: '', // the address of the podcast episode that plays (rss) - the display's id of it, see the rss command
  currentTrackname: '',
  currentTracknr: 0,
  totalTracks: '',
  progressTime: '',
  // mplayer: playing time and length of the current track in seconds (0 = unknown, e.g. a radio stream)
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 0,
  // the file that plays (mpv): kbit/s, kHz, channels - 0 when not known
  bitrate: 0,
  khz: 0,
  channels: 0,
  // the playlist starts again at its end (Winamp theme's REP button)
  repeat: false,
  // Shuffle of a local or NAS album (mpv): "next" and the end of a track choose a track not played yet; the numbers stay
  shuffle: false,
  // Radio streams and podcasts are buffered before they start: how far along that is.
  loading: false,
  // Cover of a radio station or podcast episode started by the parents' app (?cover=): the display shows it when it
  // opens the player for playback it did not start itself (it knows no cover of its own then)
  cover: '',
  loadProgress: 0,
  // Phase 19 Stufe B: wer hat den letzten Command geschickt? Werte:
  // 'box' (Default — Display-Frontend), 'eltern' (WebApp-Proxy),
  // 'telegram' (Bot), 'unknown' (alles andere). triggerAt = ms-Epoch.
  // Display pollt /local und navigiert zur Player-View, wenn neuer
  // triggerSource !== 'box' kommt.
  triggerSource: 'box',
  triggerAt: 0,
  // The parents' web app switched the theme and asked the display to show it now: the display polls
  // /local anyway and swaps its stylesheet when this goes up (no page reload, playback goes on).
  themeReloadAt: 0,
  // ... and to load its page again, e.g. after a setting it only reads when a page loads (names under the covers,
  // hidden categories, hold times): gentler than the admin interface's kiosk restart, playback goes on.
  pageReloadAt: 0,
  // The display's Spotify player is silent: paused, or the playback is not on it (reported by the display, see
  // /display/spotify-silent). A pause from a phone over Spotify Connect left the pause flag unset - the play time and
  // the background bar counted a silent box as playing.
  spotifySilent: false,
}
// Live tracklist (with real names) of the currently playing NAS folder, fetched
// once in playNasList() - used to name each track as it plays, since mplayer
// only ever sees the stream-proxy URL, not the real filename.
let currentNasTracks = []
// the same for a TIDAL album or playlist (playTidalList): mpv sees the service's /stream/<id> only
let currentTidalTracks = []
// the box's TIDAL service (scripts/mupibox/tidal_service.py)
const TIDAL_SERVICE = 'http://127.0.0.1:5011'

// === Playtime Limit (daily listening cap) ===
// Per-weekday limit on active playback time. Configured in mupiboxconfig.json
// under "playtimeLimit". Working state lives in /tmp (tmpfs, no SD wear);
// a checkpoint on the SD card persists across reboots, written at most every 60s.
// Config changes require a player restart (consistent with other config in this file).
const PLAYTIME_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const PLAYTIME_DEFAULT_LIMITS = { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 }
const PLAYTIME_WORKING_PATH = '/tmp/playtime.json'
const PLAYTIME_CHECKPOINT_PATH = path.join(DATA_DIR, 'playtime-checkpoint.json')
const PLAYTIME_CHECKPOINT_INTERVAL_MS = 60_000

// What may happen when a limit is reached (play time used up / a quiet window starts):
//   'stop'  - playback stops at once
//   'track' - the song that is playing may finish, then it stops
//   'album' - the album that is playing may finish, then it stops
// Older configs only have maxOverrunMinutes (0 = stop at once, anything else = let the song finish).
function readGraceMode(raw) {
  if (raw.graceMode === 'stop' || raw.graceMode === 'track' || raw.graceMode === 'album') return raw.graceMode
  return raw.maxOverrunMinutes === 0 ? 'stop' : 'track'
}
// Whatever mode is chosen, two kinds of content are treated the same way:
//   - podcasts may always finish the episode (a cut-off episode is worthless, and the next one is not started)
//   - radio streams have no end and are always cut off at once
// On Spotify the kind is only known from the playback state: a song follows the chosen mode, an episode may finish
// (see spotifyGraceCheck).
function effectiveGraceMode(configured) {
  if (currentMeta.currentType === 'radio') return 'stop'
  if (currentMeta.currentType === 'rss') return 'track'
  if (currentMeta.currentPlayer === 'spotify' && configured === 'stop') return 'track' // decided by spotifyGraceCheck
  return configured
}
// Spotify + "stop" chosen: playback goes on only if it turns out to be a podcast episode
function stopUnlessEpisode(configured) {
  return configured === 'stop' && currentMeta.currentPlayer === 'spotify' && currentMeta.currentType !== 'rss' && currentMeta.currentType !== 'radio'
}
// How long a song, album or podcast episode may play on after the limit at most: the parents choose it (graceMaxMinutes
// of the limit or the quiet times, 1-180, default 15). Before, 30 min (song) and 3 h (album, episode) were fixed - more
// than a whole day's limit of 120 min. Normally the song ends long before; a never-ending one stops at this time.
const GRACE_MAX_DEFAULT_MINUTES = 15
function readGraceMaxMinutes(raw) {
  const m = Number(raw.graceMaxMinutes)
  return Number.isInteger(m) && m >= 1 && m <= 180 ? m : GRACE_MAX_DEFAULT_MINUTES
}
function graceCapMs(cfg) {
  return cfg.graceMaxMinutes * 60 * 1000
}

function readPlaytimeConfig() {
  const raw = muPiBoxConfig?.playtimeLimit || {}
  const resetHour = Number.isInteger(raw.resetHour) && raw.resetHour >= 0 && raw.resetHour < 24 ? raw.resetHour : 0
  return {
    enabled: raw.enabled === true,
    resetHour,
    graceMode: readGraceMode(raw),
    graceMaxMinutes: readGraceMaxMinutes(raw),
    limitsMinutes: { ...PLAYTIME_DEFAULT_LIMITS, ...(raw.limitsMinutes || {}) },
    todayBonus: raw.todayBonus || null,
  }
}

// Bonus minutes awarded by parent (via Telegram /extend or Admin) for today only.
// If the stored date doesn't match the current logical day, the bonus is treated
// as 0 — auto-resets at day rollover without needing to clear it explicitly.
function getTodayBonusMinutes(cfg, todayDateStr) {
  const b = cfg.todayBonus
  if (!b || typeof b !== 'object') return 0
  if (b.date !== todayDateStr) return 0
  const m = Number(b.minutes)
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.min(m, 1440)
}

// Parent overrides via Telegram or admin endpoints.
// allowUntil   → bypass all blocks (state stays 'normal', no finalize calls)
// forceBlockUntil → force playback off (state forced to 'blocked', stop() called)
function readPlaybackOverrides() {
  const raw = muPiBoxConfig?.playbackOverride || {}
  const allowUntil = Number(raw.allowUntil) || 0
  const forceBlockUntil = Number(raw.forceBlockUntil) || 0
  return { allowUntil, forceBlockUntil }
}

function isAllowOverrideActive() {
  return Date.now() < readPlaybackOverrides().allowUntil
}

function isForceBlockActive() {
  return Date.now() < readPlaybackOverrides().forceBlockUntil
}

// === Quiet Hours ===
const QUIET_DEFAULT_SCHEDULE = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

function readQuietHoursConfig() {
  const raw = muPiBoxConfig?.quietHours || {}
  return {
    enabled: raw.enabled === true,
    graceMode: readGraceMode(raw),
    graceMaxMinutes: readGraceMaxMinutes(raw),
    schedule: { ...QUIET_DEFAULT_SCHEDULE, ...(raw.schedule || {}) },
  }
}

// 'HH:MM' → minutes since midnight, or null if invalid.
function parseHHMMToMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// Returns the active quiet window object {from, to, label?} that contains "now",
// or null if no window applies. Windows belong to the day they start on; a
// midnight-spanning window (from > to) covers from `from` of its day until `to`
// of the next day.
function findActiveQuietWindow(now, schedule) {
  const todayKey = PLAYTIME_DAY_KEYS[now.getDay()]
  const yesterdayKey = PLAYTIME_DAY_KEYS[(now.getDay() + 6) % 7]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  for (const w of schedule[todayKey] || []) {
    const fromMin = parseHHMMToMinutes(w.from)
    const toMin = parseHHMMToMinutes(w.to)
    if (fromMin === null || toMin === null) continue
    if (fromMin < toMin) {
      if (nowMinutes >= fromMin && nowMinutes < toMin) return w
    } else if (fromMin > toMin) {
      // Same-day half of a midnight-spanning window
      if (nowMinutes >= fromMin) return w
    }
    // fromMin === toMin: zero-length, skip
  }
  // Yesterday's wrapping windows (the to-half lands in today's early hours)
  for (const w of schedule[yesterdayKey] || []) {
    const fromMin = parseHHMMToMinutes(w.from)
    const toMin = parseHHMMToMinutes(w.to)
    if (fromMin === null || toMin === null) continue
    if (fromMin > toMin && nowMinutes < toMin) return w
  }
  return null
}

// Reset-hour shifts when "today" begins. With resetHour=4, Sunday 02:00 still counts as Saturday.
function getLogicalDay(now, resetHour) {
  const shifted = new Date(now.getTime() - resetHour * 3600 * 1000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return { dateStr: `${y}-${m}-${d}`, dayKey: PLAYTIME_DAY_KEYS[shifted.getDay()] }
}

function isActuallyPlaying() {
  if (!currentMeta.currentPlayer) return false
  if (currentMeta.currentPlayer === 'spotify') return currentMeta.pause === false && !currentMeta.spotifySilent
  if (currentMeta.currentPlayer === 'mplayer') return currentMeta.playing === true
  return false
}

// Grace period with nothing playing any more (stopped, paused, the player page left): there is nothing left
// to let finish, so block now. Counted in seconds of the 1 s ticks; a few of them so that the short gap of a
// track change is not taken for "stopped".
const GRACE_IDLE_LIMIT_S = 5
let playtimeGraceIdle = 0
let quietGraceIdle = 0

// state machine: 'normal' (under limit) → 'grace' (over limit, current track finishing) → 'blocked' (stopped)
const playtimeState = {
  date: '',
  dayKey: 'mon',
  usedSeconds: 0,
  state: 'normal',
  graceEndsAt: null,
  graceMode: null, // 'track' | 'album' while in grace
  stopUnlessEpisode: false, // Spotify + "stop": only a podcast episode may go on
}
let playtimeLastCheckpointAt = 0
let playtimeLastCheckpointSeconds = -1

// Quiet hours uses the same state machine but is purely time-window-driven (no counter).
const quietHoursState = {
  state: 'normal',
  graceEndsAt: null,
  graceMode: null, // 'track' | 'album' while in grace
  stopUnlessEpisode: false,
  activeWindow: null, // current window object {from, to, label?} when in_window
}

function loadPlaytimeCheckpoint() {
  try {
    if (!fs.existsSync(PLAYTIME_CHECKPOINT_PATH)) return
    const data = JSON.parse(fs.readFileSync(PLAYTIME_CHECKPOINT_PATH, 'utf8'))
    const today = getLogicalDay(new Date(), readPlaytimeConfig().resetHour)
    // (the photo time's count of the same day, and the last reset of it the parents asked for that was done)
    photoTimeState.resetApplied = Number(data?.photoResetApplied) || 0
    if (data && data.photoDate === today.dateStr) {
      photoTimeState.date = data.photoDate
      photoTimeState.dayKey = data.photoDayKey || today.dayKey
      photoTimeState.usedSeconds = Number(data.photoUsedSeconds) || 0
    }
    // (the tiles' counts of the same day)
    if (data && data.tileDate === today.dateStr && data.tileUsed && typeof data.tileUsed === 'object') {
      tileState.date = data.tileDate
      for (const [k, v] of Object.entries(data.tileUsed)) {
        if (TILE_KEY.test(k) && Number.isFinite(Number(v)) && Number(v) >= 0) tileState.used[k] = Math.floor(Number(v))
      }
      // (what is on the card already: not written again)
      tileLastCheckpointUsed = tileCheckpointText()
    }
    if (data && data.date === today.dateStr) {
      playtimeState.date = data.date
      playtimeState.dayKey = data.dayKey || today.dayKey
      playtimeState.usedSeconds = Number(data.usedSeconds) || 0
      // console.log so it shows even when logLevel='error' (the default)
      console.log(
        `${new Date().toLocaleString()}: [Playtime] Resumed counter: ${playtimeState.usedSeconds}s for ${playtimeState.date}`,
      )
    }
  } catch (e) {
    console.error(`${new Date().toLocaleString()}: [Playtime] Failed to load checkpoint:`, e)
  }
}

function writeCombinedWorking() {
  const ptCfg = readPlaytimeConfig()
  const qhCfg = readQuietHoursConfig()
  const ovr = readPlaybackOverrides()
  const now = Date.now()
  const inForceBlock = now < ovr.forceBlockUntil
  const inAllowOverride = now < ovr.allowUntil

  if (!ptCfg.enabled && !qhCfg.enabled && !inForceBlock && !inAllowOverride) {
    fs.writeFile(PLAYTIME_WORKING_PATH, JSON.stringify({ enabled: false, photos: photoTimeStatus(), tiles: tileStatus() }), () => {})
    return
  }

  // Effective state: forceBlock wins, then allowOverride forces normal,
  // otherwise combine the two sub-systems naturally.
  let state = 'normal'
  let blockSource = null
  if (inForceBlock) {
    state = 'blocked'
    blockSource = 'override'
  } else if (!inAllowOverride) {
    if (playtimeState.state === 'blocked' || quietHoursState.state === 'blocked') state = 'blocked'
    else if (playtimeState.state === 'grace' || quietHoursState.state === 'grace') state = 'grace'
    if (state !== 'normal') {
      // Prefer 'quiet' over 'playtime' if both restrict — more explainable
      if (quietHoursState.state !== 'normal') blockSource = 'quiet'
      else if (playtimeState.state !== 'normal') blockSource = 'playtime'
    }
  }
  // else: allowUntil-override active → state stays 'normal'

  const baseLimit = ptCfg.enabled ? (ptCfg.limitsMinutes[playtimeState.dayKey] ?? 60) : 0
  const bonus = ptCfg.enabled ? getTodayBonusMinutes(ptCfg, playtimeState.date) : 0
  const ptLimit = baseLimit + bonus
  const ptGraceEndsInSeconds =
    playtimeState.graceEndsAt !== null ? Math.max(0, Math.ceil((playtimeState.graceEndsAt - Date.now()) / 1000)) : 0
  const qhGraceEndsInSeconds =
    quietHoursState.graceEndsAt !== null ? Math.max(0, Math.ceil((quietHoursState.graceEndsAt - Date.now()) / 1000)) : 0

  const payload = {
    enabled: true,
    state,
    blockSource,
    playtime: {
      enabled: ptCfg.enabled,
      state: playtimeState.state,
      date: playtimeState.date,
      dayKey: playtimeState.dayKey,
      limitMinutes: ptLimit,
      usedSeconds: playtimeState.usedSeconds,
      remainingSeconds: ptCfg.enabled ? Math.max(0, ptLimit * 60 - playtimeState.usedSeconds) : 0,
      graceEndsInSeconds: ptGraceEndsInSeconds,
      graceMode: ptCfg.graceMode,
      resetHour: ptCfg.resetHour,
    },
    quiet: {
      enabled: qhCfg.enabled,
      state: quietHoursState.state,
      inWindow: quietHoursState.activeWindow !== null,
      ...(quietHoursState.activeWindow?.label ? { label: quietHoursState.activeWindow.label } : {}),
      graceEndsInSeconds: qhGraceEndsInSeconds,
      graceMode: qhCfg.graceMode,
    },
    override: {
      allowUntil: ovr.allowUntil,
      forceBlockUntil: ovr.forceBlockUntil,
    },
    photos: photoTimeStatus(),
    tiles: tileStatus(),
  }
  fs.writeFile(PLAYTIME_WORKING_PATH, JSON.stringify(payload), () => {})
}

function writePlaytimeCheckpoint() {
  const payload = {
    date: playtimeState.date,
    dayKey: playtimeState.dayKey,
    usedSeconds: playtimeState.usedSeconds,
    photoDate: photoTimeState.date,
    photoDayKey: photoTimeState.dayKey,
    photoUsedSeconds: photoTimeState.usedSeconds,
    photoResetApplied: photoTimeState.resetApplied,
    tileDate: tileState.date,
    tileUsed: tileState.used,
  }
  tileLastCheckpointUsed = tileCheckpointText()
  // (a file of its own first, then renamed: a power cut mid-write left half a file, and the day's count began at 0)
  const tmp = `${PLAYTIME_CHECKPOINT_PATH}.tmp`
  fs.writeFile(tmp, JSON.stringify(payload), (err) => {
    if (err) {
      log.error(`${new Date().toLocaleString()}: [Playtime] Failed to write checkpoint:`, err)
      return
    }
    fs.rename(tmp, PLAYTIME_CHECKPOINT_PATH, (e) => {
      if (e) log.error(`${new Date().toLocaleString()}: [Playtime] Failed to write checkpoint:`, e)
    })
  })
  playtimeLastCheckpointAt = Date.now()
  playtimeLastCheckpointSeconds = playtimeState.usedSeconds
  photoLastCheckpointSeconds = photoTimeState.usedSeconds
}

// === Photo time ("Bildzeit", 5.1: Einstellungen › Fotoanzeige, Spielzeit › Bildzeit) ===
// Counted while an album is open on the display (its grid, a picture, the slideshow - not the choice of albums, not
// with the display off, not in the grid untouched for a while): the display says so every few seconds
// (POST /photos/active); no word for 12 s and it is closed - a display that hangs does not count on.
//   'separate': a day's account of its own (limit per weekday, +minutes / free / reset for today from the app); at 0
//               only the photos pause - the display shows its pause page, listening goes on.
//   'shared':   no account of its own: the photos use the listening time; a second with both counts once.
// The day changes with the listening time's reset hour. Kept in the same checkpoint as the listening time.
const PHOTO_DAY_DEFAULT_MINUTES = 20
const PHOTO_ACTIVE_MS = 12_000
const photoTimeState = { date: '', dayKey: 'mon', usedSeconds: 0, resetApplied: 0 }
let photoActiveUntil = 0
let photoLastCheckpointSeconds = -1

function readPhotoTimeConfig() {
  const raw = muPiBoxConfig?.photos || {}
  const days = raw.dailyMinutes && typeof raw.dailyMinutes === 'object' ? raw.dailyMinutes : {}
  const dailyMinutes = {}
  for (const d of PLAYTIME_DAY_KEYS) {
    const m = Number(days[d])
    dailyMinutes[d] = Number.isInteger(m) && m >= 0 && m <= 1440 ? m : PHOTO_DAY_DEFAULT_MINUTES
  }
  const warn = Number(raw.warnMinutes)
  const idle = Number(raw.idlePauseSeconds)
  return {
    enabled: raw.enabled === true,
    mode: raw.limitMode === 'shared' ? 'shared' : 'separate',
    limitEnabled: raw.limitEnabled !== false,
    dailyMinutes,
    warnMinutes: [0, 2, 5, 10].includes(warn) ? warn : 5,
    idlePauseSeconds: [0, 60, 120, 300].includes(idle) ? idle : 120,
    today: raw.today && typeof raw.today === 'object' ? raw.today : {},
  }
}

const photosOpen = () => Date.now() < photoActiveUntil
// the photos count on the listening time ('shared')
function photosUseListeningTime() {
  const cfg = readPhotoTimeConfig()
  return cfg.enabled && cfg.mode === 'shared' && photosOpen()
}

function photoTimeTickStep() {
  const cfg = readPhotoTimeConfig()
  if (!cfg.enabled) {
    photoActiveUntil = 0
    return
  }
  const today = getLogicalDay(new Date(), readPlaytimeConfig().resetHour)
  if (today.dateStr !== photoTimeState.date) {
    photoTimeState.date = today.dateStr
    photoTimeState.dayKey = today.dayKey
    photoTimeState.usedSeconds = 0
    writePlaytimeCheckpoint()
  }
  // "Zurücksetzen" in the app: today's count from 0 again (once per press - the time of the press is kept as done)
  const reset = Number(cfg.today.reset) || 0
  if (cfg.today.date === today.dateStr && reset > photoTimeState.resetApplied) {
    photoTimeState.usedSeconds = 0
    photoTimeState.resetApplied = reset
    console.log(`${new Date().toLocaleString()}: [PhotoTime] Reset for today by the parents`)
    writePlaytimeCheckpoint()
  }
  // (also with 'shared' and without a limit: the app shows how long the photos were looked at)
  if (photosOpen()) photoTimeState.usedSeconds++
  if (
    Date.now() - playtimeLastCheckpointAt >= PLAYTIME_CHECKPOINT_INTERVAL_MS &&
    photoTimeState.usedSeconds !== photoLastCheckpointSeconds
  ) {
    writePlaytimeCheckpoint()
  }
}

// What the display and the app read (in /tmp/playtime.json, under photos)
function photoTimeStatus() {
  const cfg = readPhotoTimeConfig()
  if (!cfg.enabled) return undefined
  const t = cfg.today
  const isToday = t.date === photoTimeState.date
  const free = isToday && t.free === true
  const bonusRaw = Number(t.bonusMinutes)
  const bonusMinutes = isToday && Number.isFinite(bonusRaw) && bonusRaw > 0 ? Math.min(1440, bonusRaw) : 0
  const limitMinutes = cfg.dailyMinutes[photoTimeState.dayKey] + bonusMinutes
  const limited = cfg.mode === 'separate' && cfg.limitEnabled && !free
  const remainingSeconds = limited ? Math.max(0, limitMinutes * 60 - photoTimeState.usedSeconds) : null
  return {
    enabled: true,
    mode: cfg.mode,
    limitEnabled: cfg.limitEnabled,
    free,
    limited,
    limitMinutes,
    bonusMinutes,
    usedSeconds: photoTimeState.usedSeconds,
    remainingSeconds,
    state: limited && remainingSeconds <= 0 ? 'blocked' : 'normal',
    counting: photosOpen(),
    warnMinutes: cfg.warnMinutes,
    idlePauseSeconds: cfg.idlePauseSeconds,
  }
}

// === Tile time (5.1, "Kachel-Limit": a day's limit per tile of the start page) ===
// The display, the app and Home Assistant say with every start which tile of the start page it belongs to (?tile=, the
// key as the display forms it: artist:<category>:<name>, lib:<category>/<folder>, nas:<path>, single:<category>:<id>).
// The time is counted per tile while something plays - every tile played today, also one without a limit (the app shows
// it). A tile with a limit (playtimeLimit.tileLimits) used up: what plays of it ends as at the end of the listening time
// (its grace mode, radio at once), then its starts are refused (423 tile_limit_reached) until the next day, minutes
// added or "free today" (playtimeLimit.tileToday). It counts on the listening time as before; starts without a tile
// count for the listening time only. The parents' release (allowUntil) lifts these blocks too.
const TILE_KEY = /^(artist|lib|nas|single):[^\n]{1,400}$/
const tileState = {
  date: '',
  used: {}, // key -> seconds today
  current: null, // the tile of what plays (or was played last)
  state: 'normal', // of the current tile: 'normal' | 'grace' | 'blocked'
  graceMode: null,
  stopUnlessEpisode: false,
  graceEndsAt: null,
  // the key the start named (an album inside a folder: its own folder) - current is the tile with a limit it belongs to,
  // found anew every second (a limit set while it plays counts at once)
  raw: null,
}
let tileGraceIdle = 0

// What a second of playing counts for: the key the start named and, for a folder, every folder above it - a limit set
// later on one of them starts from what was heard of it today
function tileCountKeys(raw) {
  const m = /^(lib|nas):(.*)$/.exec(raw ?? '')
  if (!m) return raw ? [raw] : []
  const parts = m[2].split('/').filter(Boolean)
  return parts.map((_, i) => `${m[1]}:${parts.slice(0, i + 1).join('/')}`)
}
// (what the last checkpoint held of them - none at the start: no write at every start of the box)
let tileLastCheckpointUsed = '{}'

function readTileConfig() {
  const raw = muPiBoxConfig?.playtimeLimit || {}
  const limits = new Map()
  for (const t of Array.isArray(raw.tileLimits) ? raw.tileLimits : []) {
    const m = Number(t?.minutes)
    if (typeof t?.key === 'string' && TILE_KEY.test(t.key) && Number.isInteger(m) && m >= 1 && m <= 1440) {
      limits.set(t.key, { name: typeof t.name === 'string' ? t.name.slice(0, 200) : '', minutes: m })
    }
  }
  const today = raw.tileToday && typeof raw.tileToday === 'object' ? raw.tileToday : {}
  return { limits, today }
}

// What makes a checkpoint worth writing: the counts of the tiles with a limit. The others are counted too (a limit
// set later in the day starts from what was heard), but only kept in memory - else every minute of every playback was
// a write to the SD card, also on a box without any tile limit.
function tileCheckpointText(cfg = readTileConfig()) {
  const out = {}
  for (const k of cfg.limits.keys()) if (tileState.used[k]) out[k] = tileState.used[k]
  return JSON.stringify(out)
}

// a tile's allowance today: its minutes with the ones added for today, and whether it is free today; null: no limit
function tileAllowance(cfg, key, dateStr) {
  const l = cfg.limits.get(key)
  if (!l) return null
  const t = cfg.today.date === dateStr ? cfg.today : {}
  const b = Number(t.bonus && typeof t.bonus === 'object' ? t.bonus[key] : 0)
  const bonus = Number.isFinite(b) && b > 0 ? Math.min(1440, b) : 0
  return { name: l.name, minutes: Math.min(1440, l.minutes + bonus), bonus, free: Array.isArray(t.free) && t.free.includes(key) }
}

function tileUsedUp(key, cfg = readTileConfig()) {
  if (!key || isAllowOverrideActive()) return false
  const a = tileAllowance(cfg, key, tileState.date)
  if (!a || a.free) return false
  return (tileState.used[key] ?? 0) >= a.minutes * 60
}

// A folder (lib:, nas:) is named as what plays - an album inside the tile's folder: it counts for the tile with a limit
// whose folder it is in (the start page's tile; a NAS collection split into its subfolders has one per subfolder)
function resolveTile(key, cfg = readTileConfig()) {
  if (!key) return null
  const m = /^(lib|nas):(.*)$/.exec(key)
  if (!m) return key
  let best = null
  for (const k of cfg.limits.keys()) {
    if (!k.startsWith(`${m[1]}:`)) continue
    const p = k.slice(m[1].length + 1)
    if ((m[2] === p || m[2].startsWith(`${p}/`)) && (!best || k.length > best.length)) best = k
  }
  return best ?? key
}

// What plays of the current tile ends: as finalizePlaytimeBlock, for this tile only
function finalizeTileBlock(reason, immediate = false) {
  if (isAllowOverrideActive()) return
  console.log(`${new Date().toLocaleString()}: [TileTime] Finalizing block of ${tileState.current} (${reason})`)
  tileState.state = 'blocked'
  tileState.graceEndsAt = null
  const stopNow = () => {
    const wasSpotify = currentMeta.currentPlayer === 'spotify'
    try {
      stop()
    } catch (e) {
      console.error(`${new Date().toLocaleString()}: [TileTime] Error stopping playback:`, e)
    }
    if (wasSpotify) silenceSpotifyOnDisplay('tile limit')
  }
  if (immediate) stopNow()
  else fadeOutThen(stopNow)
  writePlaytimeCheckpoint()
}

// The tile of a new start (or none): its state machine starts anew
// raw: the key the start named (or none); current is the tile with a limit it belongs to (see tileTickStep)
function setCurrentTile(raw) {
  tileState.raw = raw
  switchTile(resolveTile(raw))
}

function switchTile(key) {
  if (key === tileState.current) return
  tileState.current = key
  tileState.state = 'normal'
  tileState.graceMode = null
  tileState.stopUnlessEpisode = false
  tileState.graceEndsAt = null
  tileGraceIdle = 0
}

function tileTickStep() {
  const pt = readPlaytimeConfig()
  const now = new Date()
  const today = getLogicalDay(now, pt.resetHour)
  if (today.dateStr !== tileState.date) {
    // (a new day - or the first tick after a start without a count of today: nothing to write then)
    const hadCounts = tileCheckpointText() !== '{}'
    tileState.date = today.dateStr
    tileState.used = {}
    tileState.state = 'normal'
    tileState.graceEndsAt = null
    if (hadCounts) writePlaytimeCheckpoint()
  }
  if (!tileState.raw) return
  const cfg = readTileConfig()
  // (the limits as they are now: one set on its folder while it plays takes over at once)
  switchTile(resolveTile(tileState.raw, cfg))
  const key = tileState.current
  if (isActuallyPlaying()) for (const k of tileCountKeys(tileState.raw)) tileState.used[k] = (tileState.used[k] ?? 0) + 1
  const a = tileAllowance(cfg, key, today.dateStr)
  const reached = !isAllowOverrideActive() && !!a && !a.free && tileState.used[key] >= a.minutes * 60
  if (reached) {
    if (tileState.state === 'normal') {
      const graceMode = effectiveGraceMode(pt.graceMode)
      if (graceMode !== 'stop' && isActuallyPlaying()) {
        tileState.state = 'grace'
        tileState.graceMode = graceMode
        tileState.stopUnlessEpisode = stopUnlessEpisode(pt.graceMode)
        tileState.graceEndsAt = Date.now() + graceCapMs(pt)
        console.log(`${now.toLocaleString()}: [TileTime] Limit of ${key} reached (${a.minutes} min). Letting the ${graceMode} finish.`)
        writePlaytimeCheckpoint()
      } else if (isActuallyPlaying()) {
        finalizeTileBlock(`limit reached (${a.minutes} min, ${currentMeta.currentType === 'radio' ? 'radio stream' : 'no grace configured'})`)
      } else {
        // (nothing of it plays: nothing to stop - its starts are refused from now on)
        tileState.state = 'blocked'
      }
    } else if (tileState.state === 'grace') {
      tileGraceIdle = isActuallyPlaying() ? 0 : tileGraceIdle + 1
      if (tileState.graceEndsAt !== null && Date.now() >= tileState.graceEndsAt) {
        finalizeTileBlock(`grace safety limit reached (${tileState.graceMode})`)
      } else if (tileGraceIdle >= GRACE_IDLE_LIMIT_S) {
        tileGraceIdle = 0
        finalizeTileBlock('nothing playing any more during the grace period')
      }
    }
  } else if (tileState.state !== 'normal') {
    // (minutes added, free today, the limit raised or the parents' release)
    console.log(`${now.toLocaleString()}: [TileTime] ${key} released`)
    tileState.state = 'normal'
    tileState.graceEndsAt = null
  }
  if (Date.now() - playtimeLastCheckpointAt >= PLAYTIME_CHECKPOINT_INTERVAL_MS && tileCheckpointText(cfg) !== tileLastCheckpointUsed) {
    writePlaytimeCheckpoint()
  }
}

// What the display, the app and the bot read (in /tmp/playtime.json, under tiles): every tile with a limit, and the
// tile of what plays
function tileStatus() {
  const cfg = readTileConfig()
  const list = []
  for (const [key, l] of cfg.limits) {
    const a = tileAllowance(cfg, key, tileState.date)
    const used = tileState.used[key] ?? 0
    list.push({
      key,
      name: l.name,
      limitMinutes: a.minutes,
      bonusMinutes: a.bonus,
      free: a.free,
      usedSeconds: used,
      remainingSeconds: a.free ? null : Math.max(0, a.minutes * 60 - used),
      blocked: tileUsedUp(key, cfg),
    })
  }
  const cur = tileState.current
  return {
    list,
    // (playing: the display's warning "Noch 5 Minuten" comes only while it plays)
    current: cur ? { key: cur, state: tileState.state, usedSeconds: tileState.used[cur] ?? 0, limited: cfg.limits.has(cur), playing: isActuallyPlaying() } : null,
  }
}

// Used by the catch-all to decide whether to refuse new play/resume/skip commands.
// Combines the natural state of both sub-systems with parent overrides:
//  - forceBlockUntil active → always blocked (highest priority)
//  - allowUntil active     → never blocked  (parent gave the green light)
//  - otherwise: blocked if playtime OR quiet hours says so
function isPlaybackBlocked() {
  if (isForceBlockActive()) return true
  if (isAllowOverrideActive()) return false
  return (
    playtimeState.state === 'grace' ||
    playtimeState.state === 'blocked' ||
    quietHoursState.state === 'grace' ||
    quietHoursState.state === 'blocked'
  )
}

// Transition to fully-stopped state. Called from the tick on grace timeout, from the
// mplayer track-change/playlist-finish handlers, or directly when grace=0.
// While allowUntil-override is active, transitions are suppressed — the parent has
// explicitly green-lit playback for this window, so neither grace nor stop fire.
// immediate: the song is over (the next one is starting) - stopped at once; else faded out, as a cut into a song
function finalizePlaytimeBlock(reason, immediate = false) {
  if (isAllowOverrideActive()) return
  console.log(`${new Date().toLocaleString()}: [Playtime] Finalizing block (${reason})`)
  playtimeState.state = 'blocked'
  playtimeState.graceEndsAt = null
  const stopNow = () => {
    // (Spotify: the display pauses its player as well - a pause through the Web API alone failed in a block, and then
    // the music went on uncounted)
    const wasSpotify = currentMeta.currentPlayer === 'spotify'
    try {
      stop()
    } catch (e) {
      console.error(`${new Date().toLocaleString()}: [Playtime] Error stopping playback:`, e)
    }
    if (wasSpotify) silenceSpotifyOnDisplay('daily limit')
  }
  // (faded out when it cuts into a song: see fadeOutThen)
  if (immediate) stopNow()
  else fadeOutThen(stopNow)
  writePlaytimeCheckpoint()
  // Notify parents that today's listening time is up. telegram_send_message.py
  // loops over all configured chatIds, so both Family group and individual DMs
  // receive the message.
  if (hasConfiguredTelegram()) {
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py --key n_playtime_used_up')
  }
}

function finalizeQuietHoursBlock(reason, immediate = false) {
  if (isAllowOverrideActive()) return
  console.log(`${new Date().toLocaleString()}: [QuietHours] Finalizing block (${reason})`)
  const label = quietHoursState.activeWindow?.label
  quietHoursState.state = 'blocked'
  quietHoursState.graceEndsAt = null
  if (hasConfiguredTelegram()) {
    // Sent as a text key: telegram_send_message.py puts it into the bot's language (German/English).
    const msg = label ? ['--key', 'n_quiet_started_label', `label=${label}`] : ['--key', 'n_quiet_started']
    // No shell: the label is free text from the parents' UI, and escaping only `"` left
    // $(...) and backticks inside the double quotes executable.
    require('node:child_process').execFile(
      '/usr/bin/python3',
      ['/usr/local/bin/mupibox/telegram_send_message.py', ...msg],
      (e) => e && console.error(`${new Date().toLocaleString()}: [QuietHours] Telegram message failed: ${e.message}`),
    )
  }
  const stopNow = () => {
    // (Spotify: the display pauses its player as well - a pause through the Web API alone failed in a block, and then
    // the music went on uncounted)
    const wasSpotify = currentMeta.currentPlayer === 'spotify'
    try {
      stop()
    } catch (e) {
      console.error(`${new Date().toLocaleString()}: [QuietHours] Error stopping playback:`, e)
    }
    if (wasSpotify) silenceSpotifyOnDisplay('quiet time')
  }
  if (immediate) stopNow()
  else fadeOutThen(stopNow)
}

// Spotify: the player does not get track events from it, so while a limit is in its grace period the playback
// state is polled and playback stops when the song (or the last song of the album) is about to end.
let spotifyGraceBusy = false
let spotifyGraceItemId = null
// Position (disc, track) of the previous poll in album mode: a jump back means the album ended and
// Spotify started over (repeat context), even if the 2.5 s window before the end was missed.
let spotifyGracePos = null
// Polls in a row that gave no usable state (API error, token, rate limit, nothing reported).
let spotifyGraceMisses = 0
const SPOTIFY_GRACE_MAX_MISSES = 3 // ~9 s
// When Spotify is asked next: it was asked every 1.5 s for the whole grace period (up to the parents' maximum, e.g.
// 15 min - 600 requests), which Spotify answers with a block of hours. Now from what the answer tells: the time left
// of the song, close polls only in its last seconds, at the latest every 20 s (a skip, a seek, a pause).
let spotifyGraceNextAt = 0
const SPOTIFY_GRACE_NEAR_END_MS = 6000
const SPOTIFY_GRACE_MAX_WAIT_MS = 20000
const SPOTIFY_GRACE_RETRY_MS = 3000
// Last track of an album, per album id: track_number counts per disc and total_tracks over all
// discs, so on a multi-disc album (audiobook boxes) the two never matched.
const spotifyAlbumLastTrack = new Map()
async function spotifyLastTrackOfAlbum(album) {
  if (!album?.id) return null
  if (spotifyAlbumLastTrack.has(album.id)) return spotifyAlbumLastTrack.get(album.id)
  const total = album.total_tracks ?? 0
  if (total <= 0) return null
  const { body } = await spotifyApi.getAlbumTracks(album.id, { offset: total - 1, limit: 1 })
  const last = body?.items?.[0]?.id ?? null
  if (last) {
    if (spotifyAlbumLastTrack.size > 200) spotifyAlbumLastTrack.clear()
    spotifyAlbumLastTrack.set(album.id, last)
  }
  return last
}
function spotifyGraceFinalize(reason) {
  if (playtimeState.state === 'grace') finalizePlaytimeBlock(reason, true)
  if (quietHoursState.state === 'grace') finalizeQuietHoursBlock(reason, true)
  if (tileState.state === 'grace') finalizeTileBlock(reason, true)
  spotifyGraceItemId = null
  spotifyGracePos = null
  spotifyGraceMisses = 0
  spotifyGraceNextAt = 0
}
// "stop" chosen: the player only waits to learn whether it is a podcast episode. If the Web API
// can't tell (error, expired token, rate limit), it stops instead of letting a song run for 30 min.
function spotifyGraceMissed(why) {
  spotifyGraceMisses++
  const waitingForKind =
    (playtimeState.state === 'grace' && playtimeState.stopUnlessEpisode) ||
    (quietHoursState.state === 'grace' && quietHoursState.stopUnlessEpisode) ||
    (tileState.state === 'grace' && tileState.stopUnlessEpisode)
  if (waitingForKind && spotifyGraceMisses >= SPOTIFY_GRACE_MAX_MISSES) {
    log.warn(`${now()}: [Spotify Control] Grace check: no playback state (${why}) - "stop" chosen, stopping now`)
    spotifyGraceFinalize('spotify: no playback state, "stop" chosen')
  }
}
async function spotifyGraceCheck() {
  if (currentMeta.currentPlayer !== 'spotify' || spotifyGraceBusy) return
  const modes = []
  if (playtimeState.state === 'grace') modes.push(playtimeState.graceMode)
  if (quietHoursState.state === 'grace') modes.push(quietHoursState.graceMode)
  if (tileState.state === 'grace') modes.push(tileState.graceMode)
  if (modes.length === 0) {
    spotifyGraceItemId = null
    spotifyGracePos = null
    spotifyGraceMisses = 0
    spotifyGraceNextAt = 0
    return
  }
  if (Date.now() < spotifyGraceNextAt) return
  if (spotifyBlockedUntil()) {
    // (not asked: counted as a miss - "stop unless a podcast episode" stops then; the others end with the parents'
    // maximum time)
    spotifyGraceMissed('Spotify blocks the requests')
    spotifyGraceNextAt = Date.now() + SPOTIFY_GRACE_RETRY_MS
    return
  }
  let mode = modes.includes('track') ? 'track' : 'album' // if both are in grace the stricter one counts
  spotifyGraceBusy = true
  // (the next poll: an answer below sets it from the song's time left; a failed one is tried again soon)
  let nextInMs = SPOTIFY_GRACE_RETRY_MS
  try {
    const { body } = await spotifyApi.getMyCurrentPlaybackState({ additional_types: 'episode,track' })
    const item = body?.item
    if (!item) {
      spotifyGraceMissed('nothing reported')
      return
    }
    spotifyGraceMisses = 0
    const remainingMs = (item.duration_ms ?? 0) - (body.progress_ms ?? 0)
    const isEpisode = item.type === 'episode'
    if (!isEpisode) {
      // "stop" was chosen and it is a song, not a podcast episode: no grace at all
      if (playtimeState.state === 'grace' && playtimeState.stopUnlessEpisode) finalizePlaytimeBlock('spotify: song, "stop" chosen')
      if (quietHoursState.state === 'grace' && quietHoursState.stopUnlessEpisode) finalizeQuietHoursBlock('spotify: song, "stop" chosen')
      if (tileState.state === 'grace' && tileState.stopUnlessEpisode) finalizeTileBlock('spotify: song, "stop" chosen')
      if (playtimeState.state !== 'grace' && quietHoursState.state !== 'grace' && tileState.state !== 'grace') {
        spotifyGraceItemId = null
        spotifyGracePos = null
        return
      }
    }
    // (a podcast episode may finish too - within the same time the parents chose)
    // "album" only means something inside an album played in order; a playlist, podcast, audiobook,
    // shuffled or repeated album counts as its current item (its "end" can't be told reliably)
    const inAlbum = body.context?.type === 'album'
    if (mode === 'album' && (!inAlbum || body.shuffle_state === true || (body.repeat_state && body.repeat_state !== 'off'))) {
      mode = 'track'
    }
    let lastOfWhatMayFinish = mode === 'track' || isEpisode
    let jumpedBack = false
    if (mode === 'album' && !isEpisode) {
      const pos = { disc: item.disc_number ?? 1, track: item.track_number ?? 0 }
      jumpedBack =
        spotifyGracePos !== null &&
        (pos.disc < spotifyGracePos.disc || (pos.disc === spotifyGracePos.disc && pos.track < spotifyGracePos.track))
      spotifyGracePos = pos
      const lastId = await spotifyLastTrackOfAlbum(item.album)
      lastOfWhatMayFinish = lastId ? item.id === lastId : item.track_number === item.album?.total_tracks
    }
    const movedOn = spotifyGraceItemId !== null && spotifyGraceItemId !== item.id && (mode === 'track' || isEpisode)
    if (spotifyGraceItemId === null) spotifyGraceItemId = item.id
    if (movedOn || jumpedBack || (lastOfWhatMayFinish && remainingMs <= 2500)) {
      spotifyGraceFinalize('spotify: song / album finished during grace period')
      return
    }
    if (body.is_playing === false) nextInMs = 10000 // paused: nothing runs out meanwhile
    else if (!lastOfWhatMayFinish) nextInMs = remainingMs + 1500 // (album: the next song is looked at once it began)
    else if (remainingMs > SPOTIFY_GRACE_NEAR_END_MS) nextInMs = remainingMs - SPOTIFY_GRACE_NEAR_END_MS + 1500
    else nextInMs = 1500 // its last seconds: as before
    nextInMs = Math.max(1500, Math.min(SPOTIFY_GRACE_MAX_WAIT_MS, nextInMs))
  } catch (e) {
    isSpotify429(e, 'grace check')
    spotifyGraceMissed(String(e))
    // once per series of failures: the log is on the SD card
    if (spotifyGraceMisses === 1) log.warn(`${now()}: [Spotify Control] Grace check failed: ${e}`)
  } finally {
    spotifyGraceBusy = false
    // (the grace period over: the next one starts with a poll at once)
    const stillGrace = playtimeState.state === 'grace' || quietHoursState.state === 'grace' || tileState.state === 'grace'
    spotifyGraceNextAt = stillGrace ? Date.now() + nextInMs : 0
  }
}
setInterval(spotifyGraceCheck, 1500)

// Commands that *start or resume* playback. These get blocked when the daily cap is hit.
// Pause/stop/volume/system commands are NOT blocked — those should always work.
// True when `segment` is one whole path segment of the command's directory. The URLs look like
// /<device>/radio/<encoded stream url>/..., and a substring test matched inside the encoded
// URL: an RSS feed from deutschlandradio.de also ran the radio branch, a URL containing "nas"
// the NAS branch.
function hasDirSegment(command, segment) {
  return typeof command.dir === 'string' && command.dir.split('/').includes(segment)
}

function isPlayInitiatingCommand(command) {
  if (command.name?.includes('spotify:')) return true
  // 'nas' was missing: NAS playback ignored the playtime limit and quiet hours
  if (['library', 'nas', 'tidal', 'radio', 'rss', 'say'].some((segment) => hasDirSegment(command, segment))) {
    return true
  }
  if (['play', 'next', 'previous', 'replay', 'seek+30', 'seek-30'].includes(command.name)) return true
  if (command.name?.startsWith('seekpos:')) return true
  return false
}

// Updates playtimeState only (counter, day rollover, state transitions, SD checkpoint).
// Working-state file is written separately by writeCombinedWorking once both
// sub-systems have ticked, so the payload is consistent.
function playtimeTickStep() {
  const cfg = readPlaytimeConfig()
  if (!cfg.enabled) {
    if (playtimeState.state !== 'normal' || playtimeState.graceEndsAt !== null) {
      playtimeState.state = 'normal'
      playtimeState.graceEndsAt = null
    }
    return
  }
  const now = new Date()
  const today = getLogicalDay(now, cfg.resetHour)
  // Day rollover: reset counter and state
  if (today.dateStr !== playtimeState.date) {
    playtimeState.date = today.dateStr
    playtimeState.dayKey = today.dayKey
    playtimeState.usedSeconds = 0
    playtimeState.state = 'normal'
    playtimeState.graceEndsAt = null
    writePlaytimeCheckpoint()
    console.log(`${now.toLocaleString()}: [Playtime] New day: ${today.dateStr} (${today.dayKey})`)
  }
  // Increment counter only when actually playing - or an album is open on the display and the photos use the listening
  // time (once, when both)
  if (isActuallyPlaying() || photosUseListeningTime()) {
    playtimeState.usedSeconds++
  }
  // Effective limit = base + bonus (bonus auto-zeroes when its date doesn't match today)
  const baseLimit = cfg.limitsMinutes[today.dayKey] ?? 60
  const bonus = getTodayBonusMinutes(cfg, today.dateStr)
  const limit = baseLimit + bonus
  const limitSeconds = limit * 60
  const limitReached = playtimeState.usedSeconds >= limitSeconds
  if (limitReached) {
    if (playtimeState.state === 'normal') {
      // nothing playing (paused, or the limit was lowered): there is nothing to let finish
      const graceMode = effectiveGraceMode(cfg.graceMode)
      if (graceMode !== 'stop' && isActuallyPlaying()) {
        playtimeState.state = 'grace'
        playtimeState.graceMode = graceMode
        playtimeState.stopUnlessEpisode = stopUnlessEpisode(cfg.graceMode)
        playtimeState.graceEndsAt = Date.now() + graceCapMs(cfg)
        console.log(
          `${now.toLocaleString()}: [Playtime] Daily limit reached (${limit} min for ${today.dayKey}${bonus > 0 ? `, +${bonus} bonus` : ''}). Letting the ${graceMode} finish.`,
        )
        writePlaytimeCheckpoint()
      } else {
        finalizePlaytimeBlock(`limit reached (${limit} min, ${!isActuallyPlaying() ? 'nothing playing' : currentMeta.currentType === 'radio' ? 'radio stream' : 'no grace configured'})`)
      }
    } else if (playtimeState.state === 'grace') {
      // (the song / album ending is handled by the player events and the Spotify check below)
      playtimeGraceIdle = isActuallyPlaying() ? 0 : playtimeGraceIdle + 1
      if (playtimeState.graceEndsAt !== null && Date.now() >= playtimeState.graceEndsAt) {
        finalizePlaytimeBlock(`grace safety limit reached (${playtimeState.graceMode})`)
      } else if (playtimeGraceIdle >= GRACE_IDLE_LIMIT_S) {
        playtimeGraceIdle = 0
        finalizePlaytimeBlock('nothing playing any more during the grace period')
      }
    } else if (playtimeState.state === 'blocked') {
      // Still blocked, but parent might have just added bonus — re-evaluate
      if (playtimeState.usedSeconds < limitSeconds) {
        playtimeState.state = 'normal'
        console.log(
          `${now.toLocaleString()}: [Playtime] Bonus applied (${bonus} min) — releasing block, ${Math.ceil((limitSeconds - playtimeState.usedSeconds) / 60)} min remaining.`,
        )
      }
    }
  } else if (playtimeState.state !== 'normal') {
    // Counter is below the limit (e.g. parent extended the limit) — release.
    playtimeState.state = 'normal'
    playtimeState.graceEndsAt = null
    console.log(
      `${now.toLocaleString()}: [Playtime] Released — usedSeconds (${playtimeState.usedSeconds}) below new limit (${limitSeconds})`,
    )
  }
  if (
    Date.now() - playtimeLastCheckpointAt >= PLAYTIME_CHECKPOINT_INTERVAL_MS &&
    playtimeState.usedSeconds !== playtimeLastCheckpointSeconds
  ) {
    writePlaytimeCheckpoint()
  }
}

// Updates quietHoursState based on whether "now" falls inside any configured window.
// Mirror of playtimeTickStep but purely time-window-driven (no counter).
function quietHoursTickStep() {
  // AR5-14: parent's allowUntil override suppresses ALL state transitions —
  // not just blocked-entry. Without this, a quiet window that starts mid-
  // override would silently mutate state to 'grace' or 'blocked'; the
  // moment the override ended, the kid would be hit with no grace at all
  // (state already 'blocked'). Skipping the tick keeps state at 'normal'
  // throughout the override, so the post-override tick walks the proper
  // normal -> grace -> blocked path again.
  if (isAllowOverrideActive()) return
  const cfg = readQuietHoursConfig()
  if (!cfg.enabled) {
    if (quietHoursState.state !== 'normal' || quietHoursState.activeWindow !== null) {
      // User just disabled mid-window: instantly release. Playback isn't auto-started
      // (it was stopped by the previous block) — kid taps play to resume.
      quietHoursState.state = 'normal'
      quietHoursState.graceEndsAt = null
      quietHoursState.activeWindow = null
    }
    return
  }
  const now = new Date()
  const window = findActiveQuietWindow(now, cfg.schedule)
  if (window) {
    if (quietHoursState.state === 'normal') {
      // Just entered a window
      quietHoursState.activeWindow = window
      const graceMode = effectiveGraceMode(cfg.graceMode)
      if (graceMode !== 'stop' && isActuallyPlaying()) {
        quietHoursState.state = 'grace'
        quietHoursState.graceMode = graceMode
        quietHoursState.stopUnlessEpisode = stopUnlessEpisode(cfg.graceMode)
        quietHoursState.graceEndsAt = Date.now() + graceCapMs(cfg)
        console.log(
          `${now.toLocaleString()}: [QuietHours] Entered window ${window.from}-${window.to}${window.label ? ` (${window.label})` : ''}. Letting the ${graceMode} finish.`,
        )
      } else {
        finalizeQuietHoursBlock(`entered window ${window.from}-${window.to} (${!isActuallyPlaying() ? 'nothing playing' : currentMeta.currentType === 'radio' ? 'radio stream' : 'no grace configured'})`)
      }
    } else if (quietHoursState.state === 'grace') {
      // (the window as the settings have it now: its name changed in the app while it runs is the display's heading
      // at once - it stayed the one of its start until the next window or a restart)
      quietHoursState.activeWindow = window
      quietGraceIdle = isActuallyPlaying() ? 0 : quietGraceIdle + 1
      if (quietHoursState.graceEndsAt !== null && Date.now() >= quietHoursState.graceEndsAt) {
        finalizeQuietHoursBlock(`grace safety limit reached (${quietHoursState.graceMode})`)
      } else if (quietGraceIdle >= GRACE_IDLE_LIMIT_S) {
        quietGraceIdle = 0
        finalizeQuietHoursBlock('nothing playing any more during the grace period')
      }
    }
    // 'blocked': stay blocked (with the window as the settings have it now, see above)
    else quietHoursState.activeWindow = window
  } else if (quietHoursState.state !== 'normal') {
    // Just exited a window — release without auto-starting playback
    console.log(`${now.toLocaleString()}: [QuietHours] Window ended. Playback can resume on user action.`)
    quietHoursState.state = 'normal'
    quietHoursState.graceEndsAt = null
    quietHoursState.activeWindow = null
  }
}

// Tracks whether forceBlock was active on the previous tick so we only call stop()
// once on entry (not every second while it's still in effect).
let forceBlockWasActive = false

function combinedTick() {
  if (isForceBlockActive()) {
    if (!forceBlockWasActive) {
      const until = readPlaybackOverrides().forceBlockUntil
      console.log(
        `${new Date().toLocaleString()}: [Override] Force-block engaged until ${new Date(until).toLocaleString()}`,
      )
      try {
        stop()
      } catch (e) {
        console.error(`${new Date().toLocaleString()}: [Override] Error stopping playback:`, e)
      }
    }
    forceBlockWasActive = true
    // Skip natural ticks: we don't want playtimeState/quietHoursState mutating
    // while force-block is in effect (it would mask the actual reason in /status).
    writeCombinedWorking()
    return
  }
  if (forceBlockWasActive) {
    console.log(`${new Date().toLocaleString()}: [Override] Force-block ended.`)
    forceBlockWasActive = false
  }
  photoTimeTickStep()
  playtimeTickStep()
  quietHoursTickStep()
  tileTickStep()
  heardTickStep()
  writeCombinedWorking()
}

loadPlaytimeCheckpoint()
setInterval(combinedTick, 1000)

function writeplayerstatePlay() {
  playerstate = 'play'
  fs.writeFile('/tmp/playerstate', playerstate, (err) => {
    if (err) {
      console.error(err)
      return
    }
    log.debug(`${now()}: [Spotify Control] Write play to /tmp/playerstate`)
  })
}

function writeplayerstatePause() {
  playerstate = 'pause'
  fs.writeFile('/tmp/playerstate', playerstate, (err) => {
    if (err) {
      console.error(err)
      return
    }
    log.debug(`${now()}: [Spotify Control] Write play to /tmp/playerstate`)
  })
}

function writeCounter() {
  if (date === '') {
    const now = new Date()
    date = `${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}_${now.getHours()}_${now.getMinutes()}_${now.getSeconds()}`
  }
  const pathCounter = `/home/dietpi/.pm2/logs/${date}_counter`
  fs.writeFile(pathCounter, JSON.stringify(counter), (err) => {
    if (err) {
      console.error(err)
      return
    }
    //log.debug(nowDate.toLocaleString() + ": [Spotify Control] Write Counter to " + pathCounter);
  })
}

async function refreshToken() {
  return new Promise((resolve, reject) => {
    refreshTokenApi()
      .then((accessToken) => {
        setAccessToken(accessToken)
        resolve(accessToken)
      })
      .catch(() => reject())
  })
}

// Spotify refused the login (invalid_grant: its 6 months are over, or it was withdrawn): the backend tells the parents
// (app, Telegram) - see backend-api app-api/spotify-auth-age.ts. The mark goes when a refresh works again.
const AUTH_REFUSED_FLAG = '/tmp/.spotify_auth_invalid'
function markLoginRefused(refused) {
  try {
    if (refused) {
      if (!fs.existsSync(AUTH_REFUSED_FLAG)) {
        fs.writeFileSync(AUTH_REFUSED_FLAG, JSON.stringify({ since: new Date().toISOString() }))
        console.warn(`${now()}: [Spotify Control] Spotify refused the login (invalid_grant) - a new login is needed`)
      }
    } else if (fs.existsSync(AUTH_REFUSED_FLAG)) fs.rmSync(AUTH_REFUSED_FLAG, { force: true })
  } catch {
    // (only a hint for the parents)
  }
}

async function refreshTokenApi() {
  return spotifyApi.refreshAccessToken().then(
    (data) => {
      apiAccessToken.accessToken = data.body.access_token
      apiAccessToken.expires = Date.now() + data.body.expires_in * 1000
      markLoginRefused(false)
      return apiAccessToken.accessToken
    },
    (err) => {
      log.debug(`${now()}: Could not refresh access token`, err)
      if (err?.body?.error === 'invalid_grant') markLoginRefused(true)
      throw err
    },
  )
}

function setAccessToken(token) {
  log.debug(`${now()}: The access token has been refreshed!`)
  counter.countfreshAccessToken++
  if (config.server.logLevel === 'debug') {
    writeCounter()
  }
  spotifyApi.setAccessToken(token)
  counter.countsetAccessToken++
  if (config.server.logLevel === 'debug') {
    writeCounter()
  }
  // A start that failed because the token had run out is made once more with the new one - only that start, right
  // after it (the same start: nothing stopped or started since), and not while playback is blocked. Every hourly
  // refresh started the last Spotify start again when it was not running: after a local album, at night, with the
  // daily limit used up (it played next to mplayer or alone, uncounted).
  const replay = spotifyReplayAfterRefresh
  spotifyReplayAfterRefresh = null
  if (
    replay &&
    replay.generation === playbackGeneration &&
    Date.now() - replay.at < 60000 &&
    currentMeta.currentPlayer === 'spotify' &&
    currentMeta.activeSpotifyId.includes('spotify:') &&
    !spotifyRunning &&
    !currentMeta.pause &&
    !isPlaybackBlocked()
  ) {
    playMe()
  }
}

// a start (playMe) that failed with an expired token: made once more after the refresh, see setAccessToken
let spotifyReplayAfterRefresh = null
// the start (playbackGeneration) a recovery was tried for: one per start - the recoveries ran into each other (a 400
// moved the playback and started it again, which failed the same way) until Spotify blocked the app for hours
let spotifyRecoveredGeneration = -1
// the errors of these commands may be recovered (another device made active, the start tried again); the others -
// pause, stop, seek, shuffle, questions about the state - only log (a recovery started or moved the playback)
const SPOTIFY_RECOVER_FROM = new Set(['playMe', 'play'])
function spotifyMayRecover(from) {
  if (!SPOTIFY_RECOVER_FROM.has(from) || spotifyRecoveredGeneration === playbackGeneration || isPlaybackBlocked()) return false
  spotifyRecoveredGeneration = playbackGeneration
  return true
}

/*called in all error cases*/
/*token expired and no_device error are handled explicitly*/
function handleSpotifyError(err, from) {
  if (err?.overtaken) {
    log.debug(`${now()}: [Spotify Control] ${from}: ${err.message}`)
    return
  }
  if (err?.body?.error?.status === 401) {
    log.debug(`${now()}: access token expired, refreshing...`)
    log.debug(`${now()}: Error from: ${from}`)
    counter.counterrorAccessToken++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (from === 'playMe') spotifyReplayAfterRefresh = { generation: playbackGeneration, at: Date.now() }
    if (currentMeta.activeSpotifyId !== '0') {
      refreshTokenLogged()
    }
  } else if (err?.body?.error?.status === 400) {
    // (a content Spotify refuses - a wrong id, an offset past the end: another device does not help)
    log.debug(`${now()}: invalid id`)
    log.debug(`${now()}: Error from: ${from}`)
    log.debug(`${now()}: ${err}`)
    counter.counterrorInvalidID++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
  } else if (err?.body?.error?.status === 429 || err?.statusCode === 429) {
    noteSpotifyBlockFromPlayer(err, from)
    log.debug(`${now()}: To many requests on th spotify web api`)
    log.debug(`${now()}: Error from: ${from}`)
    log.debug(`${now()}: ${err}`)
    counter.counterrorToManyRequest++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    //setTimeout(function(){
    //
    //},2000)
  } else if (err.toString().includes('NO_ACTIVE_DEVICE')) {
    log.debug(`${now()}: no active device, setting the first one found to active`)
    log.debug(`${now()}: Error from: ${from}`)
    log.debug(`${now()}: playID: ${currentMeta.activeSpotifyId}`)
    counter.counterrorNoActivDevice++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0' && spotifyMayRecover(from)) {
      setActiveDevice()
    }
  } else if (err.toString().includes('Device not found')) {
    log.debug(`${now()}: Device not found: ${err}`)
    log.debug(`${now()}: ${err}`)
    log.debug(`${now()}: Error from: ${from}`)
    counter.counterror++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    // (it played the content's URI as a device id - without one: whatever device of the account was active, e.g. a
    // parent's phone - and its failure came back here. The box's own player made active instead, once per start)
    if (currentMeta.activeSpotifyId !== '0' && spotifyMayRecover(from)) {
      setActiveDevice()
    }
  } else {
    log.debug(`${now()}: an error occured: ${err}`)
    log.debug(`${now()}: ${err}`)
    log.debug(`${now()}: Error from: ${from}`)
    counter.counterror++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
  }
}

/* makes the box's own Spotify player the active device and starts again there */
// (only the box's: the display's player, else the account's device with the box's name - it took the first device of
// the account, a parent's phone or a TV, and played there)
function setActiveDevice() {
  const own = displaySpotifyDevice || activeDevice
  if (own) {
    activeDevice = own
    transferPlaybackToActiveDevice()
    return
  }
  spotifyApi.getMyDevices().then(
    (data) => {
      counter.countgetMyDevices++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      const name = muPiBoxConfig?.mupibox?.host
      const mine = (data.body.devices ?? []).find((d) => d?.id && name && d.name === name)
      if (mine) {
        activeDevice = mine.id
        log.debug(`${now()}: [Spotify Control] The box's Spotify player by its name: ${activeDevice}`)
        transferPlaybackToActiveDevice()
      } else {
        log.debug(`${now()}: [Spotify Control] The box's Spotify player is not among the account's devices`)
      }
    },
    (err) => {
      log.debug(`${now()}: [Spotify Control] Error getting devices: ${err}`)
      handleSpotifyError(err, 'getMyDevices')
    },
  )
}

function transferPlaybackToActiveDevice() {
  spotifyApi.transferMyPlayback([activeDevice]).then(
    () => {
      counter.counttransferMyPlayback++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${now()}: [Spotify Control] Transfering playback to ${activeDevice}`)
      if (currentMeta.activeSpotifyId.includes('spotify:')) {
        if (currentMeta.pause) {
          play()
        } else {
          playMe()
        }
      }
    },
    (err) => {
      handleSpotifyError(err, 'transferMyPlayback')
    },
  )
}

// (mplayer's playing flag comes from the poll once a second: a second /pause or /play within that second - the
// display and the app, Telegram, an announcement - toggled mplayer twice, and the music went on)
let mplayerToggleAt = 0
function mplayerToggle() {
  if (Date.now() - mplayerToggleAt < 1200) return false
  mplayerToggleAt = Date.now()
  player.playPause()
  return true
}

// ---------- Spotify's block of the box's Spotify app, shared with the server (backend-api spotify-block.ts) ----------
// Its cache/spotify-block.json: every request during a block only keeps it going - the player did not know of it and
// went on asking (the grace check every 3 s, the app's state, the pauses). Read again when the file changed; a 429
// here (with a wait of more than a few seconds) is written into it, so the server and the Smart-Sync wait as well.
const SPOTIFY_BLOCK_FILE =
  process.env.SPOTIFY_BLOCK_FILE || path.join(CACHE_DIR, 'spotify-block.json')
let spotifyBlockKept = { mtimeMs: -1, until: 0 }
function spotifyBlockedUntil() {
  try {
    const { mtimeMs } = fs.statSync(SPOTIFY_BLOCK_FILE)
    if (mtimeMs !== spotifyBlockKept.mtimeMs) {
      const until = Number(JSON.parse(fs.readFileSync(SPOTIFY_BLOCK_FILE, 'utf8'))?.until) || 0
      spotifyBlockKept = { mtimeMs, until }
    }
  } catch {
    spotifyBlockKept = { mtimeMs: -1, until: 0 }
  }
  return spotifyBlockKept.until > Date.now() ? spotifyBlockKept.until : 0
}
// a 429 of any request of the player: into the shared block - also where nothing is recovered (the state, a pause)
function isSpotify429(err, from) {
  const status = err?.statusCode ?? err?.body?.error?.status
  if (status !== 429) return false
  noteSpotifyBlockFromPlayer(err, from)
  return true
}
function noteSpotifyBlockFromPlayer(err, from) {
  const given = Number.parseInt(err?.headers?.['retry-after'] ?? '', 10)
  // (every wait Spotify asks for - a short one let the next request out at once; none given: a minute)
  const seconds = given > 0 ? given : 60
  const until = Date.now() + seconds * 1000
  if (until <= spotifyBlockedUntil()) return
  try {
    fs.mkdirSync(path.dirname(SPOTIFY_BLOCK_FILE), { recursive: true })
    const tmp = `${SPOTIFY_BLOCK_FILE}.player.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ until, source: 'player', reason: `429 from the player (${from}, Spotify: wait ${seconds} s)`, since: Date.now() }))
    fs.renameSync(tmp, SPOTIFY_BLOCK_FILE)
  } catch (e) {
    console.warn(`${now()}: [Spotify Control] Spotify block not written: ${e.message}`)
  }
  console.warn(`${now()}: [Spotify Control] Spotify blocks the box's requests for ${Math.round(seconds / 60)} min (${from})`)
}

// The display pauses its own Spotify player (the Web Playback SDK) when this changes (it reads /local): without a
// request to Spotify, so also during a block, without a token, offline - and only the box's player. Used when a
// pause through Spotify's Web API failed or could not be asked (a limit or quiet time stopped "successfully", Spotify
// went on playing and nothing counted it any more). A start sets it back to 0.
currentMeta.spotifySilenceAt = 0
function silenceSpotifyOnDisplay(why) {
  currentMeta.spotifySilenceAt = Date.now()
  log.debug(`${now()}: [Spotify Control] The display pauses its Spotify player (${why})`)
}
// whether Spotify was started since this process runs: else a switch to a local album only tells the display
// (a box that never plays Spotify asked Spotify twice at every switch)
let spotifyStartedHere = false

// The box's own Spotify player for transport commands (resume, next, previous, seek, shuffle): without a device they
// went to whatever device of the account was active - a parent's phone resumed, skipped or shuffled
function ownSpotifyDeviceOptions() {
  const own = activeDevice || displaySpotifyDevice
  return own ? { device_id: own } : {}
}

// A pause on the box's own Spotify player only: the device the box played on, else the display's (Web Playback SDK).
// Without a device Spotify pauses whatever device of the account plays - a phone playing with the same account was
// paused when the box stopped, started a local album or shut down (hyperbit). Not playing there (another device took
// over): nothing to pause, and none of handleSpotifyError's recoveries - they start or move the playback.
function pauseOwnSpotify(why) {
  const own = activeDevice || displaySpotifyDevice
  // (not known yet - after a restart of this process the display tells its player within 3 minutes: known by the
  // name it signs in with: the box's host name, see set_hostname.sh)
  const ownName = muPiBoxConfig?.mupibox?.host
  const notOwn = (message, extra = {}) => Object.assign(new Error(message), { notOwn: true }, extra)
  if (spotifyBlockedUntil()) return Promise.reject(notOwn('Spotify blocks the requests', { blocked: true }))
  const generation = playbackGeneration
  // (asked first which device plays: a device id in the pause alone is not a promise that Spotify leaves the others be)
  return spotifyApi
    .getMyCurrentPlaybackState()
    .then(
      ({ body }) => {
        const device = body?.device
        if (device?.id && (device.id === own || (!own && ownName && device.name === ownName))) return device.id
        if (device?.id) throw notOwn(`another device plays (${device.name ?? device.id})`, { foreign: true })
        if (!own) throw notOwn('no own Spotify player known')
        return own
      },
      (err) => {
        // (the state not known: the pause, aimed at the box's player, all the same - not after a 429: the display
        // pauses its player then, see the callers)
        if (err?.body?.error?.status === 401) throw err
        if (isSpotify429(err, why)) throw notOwn('Spotify blocks the requests', { blocked: true })
        if (!own) throw notOwn('no own Spotify player known')
        return own
      },
    )
    .then((id) => {
      // (a Spotify start came in while Spotify was asked: the pause is for what played before - sent now it paused the
      // new start, and the box said "Spotify plays" while it did not; tested with a stop right before a start)
      if (generation !== playbackGeneration && currentMeta.currentPlayer === 'spotify') {
        throw notOwn('a new start came in between', { foreign: true })
      }
      return spotifyApi.pause({ device_id: id })
    })
    .catch((err) => {
      if (err?.body?.error?.status === 401) handleSpotifyError(err, why)
      else if (!isSpotify429(err, why)) log.debug(`${now()}: [Spotify Control] ${why}: the box's Spotify player is not playing (${err?.message ?? err?.statusCode ?? err})`)
      // (a Spotify start came in while this pause was on its way: its failure is about what played before - it must
      // not have the display pause the new start)
      const overtaken = generation !== playbackGeneration && currentMeta.currentPlayer === 'spotify'
      throw Object.assign(err ?? new Error('pause failed'), { notOwn: true }, overtaken ? { foreign: true } : {})
    })
}

function pause() {
  forgetSpotifyState()
  playPauseRequest++
  // (a start waiting for the token's renewal is not made after a pause - it started the music again)
  spotifyReplayAfterRefresh = null
  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Pause"')
  currentMeta.pause = true
  if (currentMeta.currentPlayer === 'spotify') {
    pauseOwnSpotify('pause').then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Playback paused`)
        writeplayerstatePause()
      },
      (err) => {
        // another device plays: the box does not; anything else (a block, no answer): its own player is paused by the
        // display. Either way the box counts as paused (it counted playtime for a silent box)
        if (!err?.foreign) silenceSpotifyOnDisplay('pause')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.playing && mplayerToggle()) {
      //currentMeta.playing = false;
      writeplayerstatePause()
    }
  }
}

// Bumped by every stop and every new playback start; an async start (NAS) that finds it changed
// after its awaits was overtaken and must not play.
let playbackGeneration = 0
// Bumped by every stop and every new playback asked for (a command that starts media) - not by the loads inside one
// (a podcast's reconnect, a radio's stream address): which playback /local names, and a command with ?gen= is for.
// Begins at the start time of this process: after a restart of the player the numbers are new - a stop the display
// still had for a playback before the restart stopped the first new one, which had the same number.
let playbackRequest = Date.now()
// the start what plays comes from (/local "origin"): the number of that start - kept by a podcast's next episode (src=skip),
// so an NFC tag taken off still pauses the podcast it started after "next"
let playbackOrigin = playbackRequest
// Bumped by every play and pause: a play that waited for the box's device is not made after a pause meanwhile
let playPauseRequest = 0
// An album paused while its track list was loading (NAS): not started then - the start of the list takes a
// pause back - but kept, paused, and started by the next "play". A stop or another start (playbackGeneration) let it
// go. (Dropping it left "play" without anything to play: the album had to be chosen again.)
let heldStart = null
function startHeld() {
  const held = heldStart
  heldStart = null
  if (!held || held.generation !== playbackGeneration) return false
  held.begin()
  return true
}
// Paused while a list loaded (asked: playPauseRequest when it began)? Then its start is held instead of made.
const pausedSince = (asked) => asked !== playPauseRequest && currentMeta.pause === true

// The two players don't know of each other: Spotify plays in the kiosk browser (Web Playback SDK), local
// media, radio, podcasts and the NAS in mplayer. The player only knew what was playing from its own state,
// which is empty after a restart of this process - a stop then stopped nothing, and a local album started
// while Spotify was still playing ran in parallel. So a switch always silences the other side.
function pauseSpotifyQuietly(why) {
  // (nothing playing on the box's Spotify player, no token, offline: the display pauses its player)
  if (!spotifyStartedHere && currentMeta.currentPlayer !== 'spotify') silenceSpotifyOnDisplay(why)
  else pauseOwnSpotify(why).catch((err) => err?.foreign || silenceSpotifyOnDisplay(why))
  spotifyRunning = false
}
function switchToMplayer() {
  if (currentMeta.currentPlayer !== 'mplayer') pauseSpotifyQuietly('switch to mplayer')
  currentMeta.currentPlayer = 'mplayer'
  currentMeta.finished = false
}
// What mplayer/mpv said of its track (name, album, place) - gone once it no longer plays
function forgetLocalTrack() {
  currentMeta.currentTrackname = ''
  currentMeta.progressTime = ''
  currentMeta.positionSeconds = 0
  currentMeta.durationSeconds = 0
  currentMeta.album = ''
  currentMeta.path = ''
  currentMeta.episode = ''
  currentMeta.currentTracknr = ''
  currentMeta.totalTracks = ''
}

function stop() {
  forgetSpotifyState()
  playbackGeneration++
  playbackRequest++
  playbackOrigin = playbackRequest
  currentMeta.finished = false
  clearLibraryResumeTimers()
  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Stop"')
  if (currentMeta.currentPlayer === 'spotify') {
    pauseOwnSpotify('stop').then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Playback stopped`)
        writeplayerstatePause()
      },
      (err) => err?.foreign || silenceSpotifyOnDisplay('stop'),
    )

    currentMeta.currentPlayer = ''
    currentMeta.activeSpotifyId = ''
    currentMeta.pause = false
    spotifyRunning = false
  } else if (currentMeta.currentPlayer === 'mplayer') {
    resetLocalShuffle()
    stopLoading()
    player.stop()
    // mplayer ignores 'stop' while it is still opening a playlist; it then starts playing after all, and
    // since the player already counts as stopped nothing stopped it any more (seen when leaving the player
    // page during the silent first seconds of a resume). Say it again unless something new was started.
    const stopGeneration = playbackGeneration
    for (const delay of [800, 2000]) {
      setTimeout(() => {
        if (stopGeneration === playbackGeneration) player.stop()
      }, delay)
    }
    albumNow()?.onStop?.()
    extensions.emit('stop')
    //currentMeta.playing = false;
    writeplayerstatePause()
    currentMeta.bitrate = 0
    currentMeta.khz = 0
    currentMeta.channels = 0
    forgetLocalTrack()
    currentMeta.currentPlayer = ''
    currentMeta.pause = false
    spotifyRunning = false
    log.debug(`${now()}: [Spotify Control] Playback stopped`)
  } else {
    // State unknown (e.g. after a restart of this process while something was playing): silence both.
    player.stop()
    pauseSpotifyQuietly('stop with unknown state')
    writeplayerstatePause()
  }
}

function play() {
  forgetSpotifyState()
  if (currentMeta.currentPlayer === 'spotify') {
    if (spotifyBlockedUntil()) return log.debug(`${now()}: [Spotify Control] play: Spotify blocks the requests`)
    // (only a play that is really sent takes back a pause the display still has to make: one refused in a block let
    // the music go on)
    currentMeta.spotifySilenceAt = 0
    // (only on the box's own player - without a device Spotify went on on the account's active one, a phone)
    const asked = ++playPauseRequest
    const generation = playbackGeneration
    ownDeviceForStart()
      .then((own) => {
        // (while the device was looked for: a pause, a stop, another start, a limit or a block - the play is not made,
        // it started the music again, uncounted after a stop)
        const overtaken =
          asked !== playPauseRequest ||
          generation !== playbackGeneration ||
          currentMeta.currentPlayer !== 'spotify' ||
          isPlaybackBlocked() ||
          !!spotifyBlockedUntil()
        if (overtaken) throw overtakenStart()
        if (!own) throw new Error("The box's Spotify player is not known - not played")
        activeDevice = activeDevice || own
        return spotifyApi.play({ device_id: activeDevice })
      })
      .then(
        () => {
          counter.countplay++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          // (a pause, a stop or another start while Spotify answered: its state stays - the late answer set "playing"
          // over a pause already made)
          if (asked !== playPauseRequest || generation !== playbackGeneration) {
            log.debug(`${now()}: [Spotify Control] Play answered after a pause, stop or start - state left as it is`)
            return
          }
          log.debug(`${now()}: [Spotify Control] Playback started`)
          currentMeta.pause = false
          writeplayerstatePlay()
        },
        (err) => {
          handleSpotifyError(err, 'play')
        },
      )
    if (telegramPlaybackNotices())
      cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Continue playing"')
    //if (hasConfiguredTelegram()) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
  } else if (currentMeta.currentPlayer === 'mplayer') {
    // an album paused while its list loaded: started now (see heldStart)
    if (startHeld()) {
      currentMeta.pause = false
      return
    }
    // (a list still loading, nothing to unpause yet: the pause made meanwhile no longer counts - it starts when it is
    // there)
    if (!currentMeta.playing && !mplayerToggle()) {
      currentMeta.pause = false
      return
    }
    if (!currentMeta.playing) {
      currentMeta.pause = false
      //currentMeta.playing = true;
      writeplayerstatePlay()
      if (telegramPlaybackNotices())
        cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Continue playing"')
      // if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1 && (currentMeta.currentType === 'rss' || currentMeta.currentType === 'radio')) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py');
      // if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1 && currentMeta.currentType === 'local') cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py');
    }
  }
}

// "next" and "previous" at a podcast episode: the episode below (above) in the list of its tile, as the display lists it
// - the parents' choice of episodes, the entry's sorting, without internet the episodes on the SD card. The backend API
// knows the list (/api/rssfeed/neighbour: the player knows no feed address). At an end of the list the episode plays on
// where it is (it started again from its beginning before - the place in a long episode was gone). It is started as the display starts an episode (the same route), so the tile time, the listening
// time and the pause rules count as for any start; the source "skip" makes the display's player page follow to the new
// episode (the navigator). Presses while one is asked are added up: three detents of the knob go three episodes.
const episodeSkip = { pending: 0, running: false }
function skipEpisode(steps) {
  episodeSkip.pending += steps
  if (!episodeSkip.running) void runEpisodeSkips()
}

async function runEpisodeSkips() {
  episodeSkip.running = true
  let base = currentMeta.episode
  // (the episode that played and the ones these presses started: another start than these ends the presses)
  const ours = new Set([base])
  try {
    while (episodeSkip.pending !== 0) {
      const steps = episodeSkip.pending
      episodeSkip.pending = 0
      const query = new URLSearchParams({ url: base, dir: steps > 0 ? 'next' : 'previous', steps: String(Math.abs(steps)) })
      const tile = tileState.raw || tileState.current
      if (tile) query.set('tile', tile)
      const response = await fetch(`http://127.0.0.1:8200/api/rssfeed/neighbour?${query}`, { signal: AbortSignal.timeout(20000) })
      const found = response.ok ? await response.json() : null
      if (!found?.found || typeof found.url !== 'string') {
        log.debug(`${now()}: [Spotify Control] skip at an episode: no neighbour found`)
        break
      }
      // (another start came meanwhile: it stays)
      if (currentMeta.currentType !== 'rss' || !ours.has(currentMeta.episode)) break
      if (found.same) {
        log.debug(`${now()}: [Spotify Control] skip at an episode: at the end of the list - it plays on`)
        break
      }
      const start = new URLSearchParams({ src: 'skip' })
      if (typeof found.cover === 'string' && found.cover.startsWith('/api/')) start.set('cover', found.cover)
      // (the key the first start named - the tile it was resolved to would be taken as a start of that tile itself)
      const startTile = tileState.raw || tileState.current
      if (startTile) start.set('tile', startTile)
      const started = await fetch(
        `http://127.0.0.1:${config.server.port}/rss/${encodeURIComponent(found.url)}/${encodeURIComponent(String(found.title ?? ''))}:title:artist:${encodeURIComponent(String(currentMeta.album || found.artist || ''))}?${start}`,
        { signal: AbortSignal.timeout(4000) },
      )
      if (!started.ok) break
      base = found.url
      ours.add(found.url)
    }
  } catch (err) {
    log.debug(`${now()}: [Spotify Control] skip at an episode failed: ${err}`)
  } finally {
    episodeSkip.pending = 0
    episodeSkip.running = false
  }
}

function next() {
  forgetSpotifyState()
  if (currentMeta.currentPlayer === 'mplayer' && currentMeta.currentType === 'rss' && currentMeta.episode) return void skipEpisode(1)
  if (currentMeta.currentPlayer === 'spotify') {
    if (spotifyBlockedUntil()) return log.debug(`${now()}: [Spotify Control] next: Spotify blocks the requests`)
    spotifyApi.skipToNext(ownSpotifyDeviceOptions()).then(
      () => {
        counter.countskipToNext++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Skip to next`)
      },
      (err) => {
        handleSpotifyError(err, 'next')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (isCuePlayback() && currentMeta.currentTracknr < currentCue.tracks.length) {
      seekToCueTrack(currentMeta.currentTracknr + 1)
      return
    }
    //currentMeta.currentTracknr = currentMeta.currentTracknr + 1;
    //log.debug(nowDate.toLocaleString() + ': [Spotify Control] Current Tracknr: ' + currentMeta.currentTracknr);
    player.next() // (on the last track of a CUE album this ends the playlist, as for any other album)
  }
}

function previous() {
  forgetSpotifyState()
  if (currentMeta.currentPlayer === 'mplayer' && currentMeta.currentType === 'rss' && currentMeta.episode) return void skipEpisode(-1)
  if (currentMeta.currentPlayer === 'spotify') {
    if (spotifyBlockedUntil()) return log.debug(`${now()}: [Spotify Control] previous: Spotify blocks the requests`)
    spotifyApi.skipToPrevious(ownSpotifyDeviceOptions()).then(
      () => {
        counter.countskipToPrevious++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Skip to previous`)
      },
      (err) => {
        handleSpotifyError(err, 'previous')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (isCuePlayback()) {
      seekToCueTrack(currentMeta.currentTracknr - 1) // on the first track this restarts it
      return
    }
    if (currentMeta.currentTracknr > 1) {
      currentMeta.currentTracknr = currentMeta.currentTracknr - 2
    }
    log.debug(`${now()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
    player.previous()
  }
}

// "From the beginning" (a long press on a button of the box, see the buttons extension): the album or the playlist starts
// again with its first track. A radio station has no beginning; with nothing loaded there is nothing to start.
function replay() {
  if (currentMeta.currentPlayer === 'spotify') {
    // spotify:<kind>:<id>[:<track>:<position>] - without the place to go on at it is the first track, from its start
    const parts = String(currentMeta.activeSpotifyId ?? '').split(':')
    if (parts.length < 3 || parts[0] !== 'spotify' || !parts[2]) return
    forgetSpotifyState()
    currentMeta.activeSpotifyId = parts.slice(0, 3).join(':')
    playbackGeneration++
    currentMeta.finished = false
    currentMeta.pause = false
    log.debug(`${now()}: [Spotify Control] From the beginning: ${currentMeta.activeSpotifyId}`)
    playMe()
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.currentType === 'radio') return
    log.debug(`${now()}: [Spotify Control] From the beginning (track ${currentMeta.currentTracknr})`)
    if (isCuePlayback()) return seekToCueTrack(1)
    // (the first track is playing: back to its start - a jump to the track one is on does nothing)
    if (currentMeta.currentTracknr > 1) return jumpToTrack(1)
    // (an album that is no folder - a CD - knows where its track starts in the whole, as in seek())
    const albumStart = albumNow()?.seek?.(0, player.trackIndex?.() ?? 0)
    if (typeof albumStart === 'number') player.exec('seek', [albumStart, '2'])
    else player.seekPercent(0)
  }
}

function jumpToTrack(targetPosition) {
  if (isCuePlayback()) {
    seekToCueTrack(targetPosition)
    return
  }
  if (currentMeta.currentPlayer === 'mplayer') {
    const offset = targetPosition - currentMeta.currentTracknr
    if (offset !== 0) {
      log.debug(`${now()}: [Spotify Control] Jumping ${offset} track(s) to position ${targetPosition}`)
      // The player's 'metadata' event always bumps currentTracknr by exactly 1 per
      // track-change, regardless of how many tracks pt_step actually skipped. Pre-set
      // it here so that upcoming +1 lands exactly on targetPosition, no matter the offset.
      currentMeta.currentTracknr = targetPosition - 1
      player.exec('pt_step', [offset])
    }
  }
}

// Shuffle of a local or NAS album: only the engine's choice of the next track (mpv-wrapper.js), nothing at Spotify
function localShuffle(on) {
  if (currentMeta.currentPlayer !== 'mplayer' || typeof player.setShuffle !== 'function' || isCuePlayback()) return false
  currentMeta.shuffle = on
  player.setShuffle(on)
  log.debug(`${now()}: [Spotify Control] Shuffle of the album: ${on ? 'on' : 'off'}`)
  return true
}
// (every playback starts without shuffle, as the player page switches Spotify's off when it is left)
function resetLocalShuffle() {
  if (currentMeta.shuffle || player.shuffling?.()) {
    currentMeta.shuffle = false
    player.setShuffle?.(false)
  }
}

function shuffleon() {
  if (localShuffle(true)) return
  forgetSpotifyState()
  if (spotifyBlockedUntil()) return
  spotifyApi.setShuffle(true, ownSpotifyDeviceOptions()).then(
    () => {
      counter.countsetShuffle++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${now()}: [Spotify Control] Toggle Shuffle`)
    },
    (err) => {
      handleSpotifyError(err, 'shuffleon')
    },
  )
}

function shuffleoff() {
  if (localShuffle(false)) return
  resetLocalShuffle()
  forgetSpotifyState()
  if (spotifyBlockedUntil()) return
  spotifyApi.setShuffle(false, ownSpotifyDeviceOptions()).then(
    () => {
      counter.countsetShuffle++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${now()}: [Spotify Control] Toggle Shuffle`)
    },
    (err) => {
      handleSpotifyError(err, 'shuffleoff')
    },
  )
}

// Spotify's play on the box's own device - never without one (see ownDeviceForStart).
// Spotify does not know the display's player (it lost its sign-in, e.g. when the token could not be renewed at
// start-up without network): the display is reloaded - it signs in anew and reports its device - and the start is
// tried once more there. Only when a start failed, so a normal start takes no longer; at most once a minute.
const DISPLAY_RECOVERY_WAIT_MS = 25_000
async function recoverDisplayDevice() {
  if (Date.now() - displayRecoveryAt < 60_000) return null
  displayRecoveryAt = Date.now()
  const askedAt = Date.now()
  console.warn(`${now()}: [Spotify Control] Spotify does not know the display's player - the display signs in anew`)
  currentMeta.pageReloadAt = askedAt
  while (Date.now() - askedAt < DISPLAY_RECOVERY_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 250))
    if (displayDeviceReportedAt > askedAt && displaySpotifyDevice) return displaySpotifyDevice
  }
  console.warn(`${now()}: [Spotify Control] The display did not report a Spotify player within ${DISPLAY_RECOVERY_WAIT_MS / 1000} s`)
  return null
}

// A start overtaken while it waited for the display (a stop, another start, the play time or a quiet time): it must
// not play after all - its callers' error handling knows it by this flag and leaves the state alone
function overtakenStart() {
  const e = new Error('Spotify start overtaken by a stop or another start')
  e.overtaken = true
  return e
}

// The box's own Spotify player for a start that names none (after a restart of this player the display has not told its
// device yet): by its name among the account's devices, else the display signs in anew. A start without a device plays
// on the account's active one - a parent's phone that plays right now.
async function ownDeviceForStart() {
  if (displaySpotifyDevice) return displaySpotifyDevice
  const name = config?.['node-sonos-http-api']?.server || muPiBoxConfig?.mupibox?.host
  if (name) {
    try {
      const data = await spotifyApi.getMyDevices()
      counter.countgetMyDevices++
      const mine = (data.body.devices ?? []).find((d) => d?.id && d.name === name)
      if (mine) return mine.id
    } catch (err) {
      if (isSpotify429(err, 'ownDeviceForStart')) throw err
      log.debug(`${now()}: [Spotify Control] Devices not read: ${err}`)
    }
  }
  return recoverDisplayDevice()
}

async function playOnDevice(playOptions) {
  forgetSpotifyState()
  const generation = playbackGeneration
  // (overtaken also by a block of Spotify's requests set while waiting for the display - asked again it only grew)
  const overtaken = () => generation !== playbackGeneration || isPlaybackBlocked() || !!spotifyBlockedUntil()
  if (!playOptions.device_id) {
    const own = await ownDeviceForStart()
    if (overtaken()) throw overtakenStart()
    if (!own) {
      // (nothing plays: the state says so, else the play time counted a silent box)
      currentMeta.currentPlayer = ''
      currentMeta.activeSpotifyId = ''
      throw new Error("The box's Spotify player is not known - not started")
    }
    activeDevice = own
    playOptions = { ...playOptions, device_id: own }
  }
  return spotifyApi.play(playOptions).catch(async (err) => {
    if (err?.statusCode !== 404) throw err
    // the display's device (or, without one, no active device at all): the display signs in anew first
    if (playOptions.device_id === displaySpotifyDevice) {
      const fresh = await recoverDisplayDevice()
      if (overtaken()) throw overtakenStart()
      if (fresh) {
        activeDevice = fresh
        // (a moment for Spotify to list the new device)
        await new Promise((r) => setTimeout(r, 1500))
        if (overtaken()) throw overtakenStart()
        return spotifyApi.play({ ...playOptions, device_id: fresh })
      }
    }
    // (no start on "the active device" of the account instead - a parent's phone, a TV)
    if (activeDevice === playOptions.device_id) activeDevice = null
    throw err
  })
}

function playMe() {
  log.debug(`${now()}: [Spotify Control] Spotify play ${currentMeta.activeSpotifyId}`)
  if (spotifyBlockedUntil()) {
    // (Spotify blocks the requests: a start would only make the block longer - a new one is refused before anything
    // changes, see useSpotify; a recovery or a repeat is not made)
    log.debug(`${now()}: [Spotify Control] Spotify start not sent: Spotify blocks the requests`)
    return
  }
  spotifyStartedHere = true
  currentMeta.spotifySilenceAt = 0
  // (a stop, a local album or a limit that came while Spotify was asked: the start that arrives after it is paused
  // again - it played on, uncounted, or next to the local album. Another Spotify start in between replaces it anyway)
  const generation = playbackGeneration
  const startOvertaken = () => {
    if (generation === playbackGeneration && !isPlaybackBlocked()) return false
    if (currentMeta.currentPlayer === 'spotify' && !isPlaybackBlocked()) return false
    log.debug(`${now()}: [Spotify Control] Spotify start overtaken - paused again`)
    pauseOwnSpotify('start overtaken').catch((err) => err?.foreign || silenceSpotifyOnDisplay('start overtaken'))
    return true
  }
  // spotify:<kind>:<id>:<track 1-based>:<position ms>. These were undeclared (global) variables: two starts in quick
  // succession could mix up each other's values.
  const parts = currentMeta.activeSpotifyId.split(':')
  let resumeOffset = Number.parseInt(parts[3], 10) || 0
  log.debug(`${now()}: [Spotify Control] Spotify resume ${resumeOffset}`)
  if (resumeOffset > 0) resumeOffset--
  log.debug(`${now()}: [Spotify Control] Spotify offset ${resumeOffset}`)
  const resumeProgess = Number.parseInt(parts[4], 10) || 0
  const contextUri = `${parts[0]}:${parts[1]}:${parts[2]}`

  // Prepare play options with device_id if available
  const playOptions = {
    offset: { position: resumeOffset },
    position_ms: resumeProgess,
  }

  // Add device_id if we have an active device
  if (activeDevice) {
    playOptions.device_id = activeDevice
    log.debug(`${now()}: [Spotify Control] Playing on device: ${activeDevice}`)
  }

  if (contextUri.split(':')[1] === 'episode') {
    playOptions.uris = [contextUri]
    playOnDevice(playOptions).then(
      (_data) => {
        if (startOvertaken()) return
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Playback started`)
        writeplayerstatePlay()
        spotifyRunning = true
        if (telegramPlaybackNotices())
          cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
        //if (hasConfiguredTelegram()) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
      },
      (err) => {
        log.debug(`${now()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'playMe')
      },
    )
    // spotifyApi.setVolume(volumeStart).then(function () {
    //   log.debug(nowDate.toLocaleString() + ': [Spotify Control] Setting volume to '+ 99);
    //   counter.countsetVolume++;
    //   if (config.server.logLevel === 'debug'){writeCounter();}
    //   }, function(err) {
    //   handleSpotifyError(err,"setVolume");
    // });
  } else {
    playOptions.context_uri = contextUri
    playOnDevice(playOptions).then(
      (_data) => {
        if (startOvertaken()) return
        log.debug(`${now()}: [Spotify Control] Playback started`)
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        writeplayerstatePlay()
        spotifyRunning = true
        if (telegramPlaybackNotices())
          cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
        //if (hasConfiguredTelegram()) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
      },
      (err) => {
        log.debug(`${now()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'playMe')
      },
    )
    // spotifyApi.setVolume(volumeStart).then(function () {
    //   counter.countsetVolume++;
    //   if (config.server.logLevel === 'debug'){writeCounter();}
    //   log.debug(nowDate.toLocaleString() + ': [Spotify Control] Setting volume to '+ 99);
    //   }, function(err) {
    //   handleSpotifyError(err,"setVolume");
    // });
  }
}

const localAudioPattern = /\.(mp3|flac|wav|wma|ogg|m4a)$/i

function listLocalAudioFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => localAudioPattern.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

// Local albums are read straight from their folder, so files added or removed in
// the file explorer are picked up without any "reload media database" run.
function refreshLocalPlaylist(albumDir) {
  try {
    const files = listLocalAudioFiles(albumDir)
    fs.writeFileSync(`${albumDir}/playlist.m3u`, `${files.join('\n')}\n`)
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Could not refresh playlist.m3u for ${albumDir}: ${error}`)
  }
}

// Library resume: jump straight to track N (1-indexed) and seek to its
// position percentage. The previous frontend approach fired N skipNext
// commands in close succession, which made mplayer play short fragments
// of every intermediate track ("tick-tick-tick…" when resuming a long
// audiobook). A single mplayer `pt_step (N-1)` is atomic — no audible
// fragments. The two setTimeouts here cover the fact that mplayer doesn't
// emit a "playlist loaded" event we can hook; empirically ~1.2s is enough
// for the m3u parse plus the first track to start.
// Delayed steps of a library resume. Cleared when another album starts: a child who picks the
// next album within these 1-2 seconds used to get the old album's track jump and seek applied
// to the new one.
let libraryResumeTimers = []
// mplayer's own (per stream) volume is 0 while a resume jumps to its track and position: the first
// seconds of track 1 and of the target track used to be heard before the jump.
let libraryResumeMuted = false
function unmuteLibraryResume() {
  if (!libraryResumeMuted) return
  libraryResumeMuted = false
  player.setVolume(volumeStart)
}
function clearLibraryResumeTimers() {
  for (const timer of libraryResumeTimers) clearTimeout(timer)
  libraryResumeTimers = []
  unmuteLibraryResume()
}

function playListAtTrack(playedList, trackNr, progressPct) {
  log.debug(
    `${now()}: [Spotify Control] Library resume — track ${trackNr}, pct ${progressPct}, list ${playedList}`,
  )
  if (player.startsAt) {
    // mpv opens that track at that part of it right away (nothing to mute, no jumps); the metadata handler counts
    // the one track that starts
    playList(playedList, { track: trackNr, percent: progressPct })
    currentMeta.currentTracknr = Math.max(0, trackNr - 1)
    return
  }
  playList(playedList)
  scheduleResumeJumps(trackNr, progressPct, 1200)
}

// The jumps of a resume after an album was loaded: to track trackNr (a moment after the start), then to
// progressPct % of it; silent until they are done. firstJumpMs: when mplayer has the first track open (the NAS takes
// longer than the SD card). The NAS's CUE albums are one file: there both are a seek inside it.
function scheduleResumeJumps(trackNr, progressPct, firstJumpMs) {
  const jumps = trackNr > 1 || progressPct > 1
  if (!jumps) return
  // silent until the jump is done; set again once mplayer has opened its audio output
  libraryResumeMuted = true
  player.setVolume(0)
  libraryResumeTimers.push(setTimeout(() => player.setVolume(0), 300))
  const seekAt = trackNr > 1 ? firstJumpMs * 2 : firstJumpMs
  if (trackNr > 1) {
    libraryResumeTimers.push(
      setTimeout(() => {
        if (isCuePlayback()) return seekToCueTrack(trackNr)
        // The 'metadata' handler adds exactly 1 per track change, however far pt_step jumps (see
        // jumpToTrack). Without this the counter stood at 2 after the jump, the player page saved
        // track 2 as the resume position, and every further resume lost more of the progress.
        currentMeta.currentTracknr = trackNr - 1
        player.exec('pt_step', [trackNr - 1])
      }, firstJumpMs),
    )
  }
  if (progressPct > 1) {
    libraryResumeTimers.push(
      setTimeout(() => {
        if (!isCuePlayback()) return player.seekPercent(progressPct)
        const index = Math.max(0, Math.min(currentCue.tracks.length, trackNr) - 1)
        const start = currentCue.tracks[index].startSeconds
        const end = cueTrackEnd(index)
        if (end > start) cueSeek(start + ((end - start) * progressPct) / 100)
      }, seekAt),
    )
  }
  // a moment after the last jump, so the old position is no longer in the audio buffer
  const lastJump = progressPct > 1 ? seekAt : firstJumpMs
  libraryResumeTimers.push(setTimeout(unmuteLibraryResume, lastJump + 400))
}

// resume: { track, percent } - where the album goes on (only an engine that starts there takes it, see playListAtTrack)
function playList(playedList, resume) {
  const album = extensions.albumFor(decodeURI(playedList).replace(/:/g, '/'))
  if (album) return playAlbumProvider(album)
  playbackGeneration++
  currentMeta.trackFile = undefined // the new album's first file sets it (see the path event)
  clearLibraryResumeTimers()
  //let playedTitel = playedList.split('album:').pop();
  playedTitelmod = decodeURI(playedList).replace(/:/g, '/')
  refreshLocalPlaylist(`/home/dietpi/MuPiBox/media/${playedTitelmod}`)
  //playedTitelmod = playedTitel.replace(/%20/g," ");
  log.debug(`${now()}: [Spotify Control] Starting currentMeta.playing:${playedTitelmod}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.playList(`/home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`, resume)
  player.setVolume(volumeStart)
  log.debug(`${now()}: /home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
  currentMeta.currentTracknr = 0
  currentMeta.path = playedTitelmod

  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing local"')
  //if (hasConfiguredTelegram()) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py');

  // Same list as the playlist.m3u that was just written (also counts upper-case extensions).
  try {
    currentMeta.totalTracks = listLocalAudioFiles(`/home/dietpi/MuPiBox/media/${playedTitelmod}`).length
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Could not count tracks: ${error}`)
  }
}

// Plays a NAS folder live: the tracklist and stream URLs are fetched
// fresh from backend-api on every play (no local caching), so NAS changes
// need no separate "update media" step. The resulting playlist is a normal
// m3u file whose lines are HTTP(S) stream-proxy URLs - mplayer already plays
// remote URLs from an m3u today for radio/rss, so this reuses the exact same
// player.playList() path (and with it, track-jump/track-count handling).
// resume: {trackNr, progressPct} to go on where it was left (the display's resume tile; see scheduleResumeJumps)
async function playNasList(nasPath, resume = null) {
  const decodedPath = decodeURIComponent(nasPath)
  log.debug(`${now()}: [Spotify Control] Starting NAS playback: ${decodedPath}`)
  const generation = ++playbackGeneration
  // (a pause while the list loads: the start is held until "play" - see heldStart)
  const asked = playPauseRequest
  clearLibraryResumeTimers()

  try {
    // The NAS may not answer at the first try (waking up, WiFi hiccup): one more try after 3 s. An empty or failed
    // list used to be played anyway - an empty playlist, "playing" set, and nothing to hear.
    const loadTracks = async () => {
      const response = await fetch(`http://localhost:8200/api/nas/tracklist?path=${encodeURIComponent(decodedPath)}`)
      const list = response.ok ? await response.json() : []
      return Array.isArray(list) ? list : []
    }
    let tracks = await loadTracks()
    if (tracks.length === 0 && generation === playbackGeneration) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      tracks = await loadTracks()
    }
    if (tracks.length === 0) {
      console.warn(`${now()}: [Spotify Control] NAS playback of ${decodedPath} not started: no tracks (NAS not reachable?)`)
      return
    }
    // The track list can take seconds (NAS over WebDAV). A stop, another album, or a playtime /
    // quiet-hours block in the meantime used to be overtaken: the late answer started playback
    // anyway. Such a start is dropped now.
    if (generation !== playbackGeneration || isPlaybackBlocked()) {
      log.debug(`${now()}: [Spotify Control] NAS playback of ${decodedPath} dropped (stopped, replaced or blocked meanwhile)`)
      return
    }
    currentNasTracks = tracks
    rememberNasTracks(tracks)
    // Tracks of a CUE album all point at the same file: it is loaded once and the tracks are found by time.
    const cueMode = tracks.length > 1 && tracks.every((track) => track.cue === true)
    currentCue = cueMode ? { tracks, fileLength: 0 } : null
    const folderName = decodedPath.split('/').filter(Boolean).pop() || decodedPath

    // Set metadata explicitly up front (like the radio/rss branches do) rather
    // than relying on mplayer's parsed filename/path, which would otherwise
    // show the raw stream-proxy URL as the "now playing" name.
    currentMeta.currentType = 'nas'
    currentMeta.currentTrackname = tracks[0]?.name?.replace(/\.[^./]+$/, '') || folderName
    currentMeta.album = folderName
    currentMeta.path = decodedPath
    currentMeta.trackFile = undefined

    // mplayer takes an http URL of a .wma file for a Windows Media stream server (STREAM_ASF) and stops at once;
    // through ffmpeg's http reader it plays as the file it is.
    const playlistLines = (cueMode ? [tracks[0]] : tracks).map((track) => {
      const url = `http://localhost:8200/api/nas/stream?path=${encodeURIComponent(track.path)}`
      return /\.wma$/i.test(track.path) ? `ffmpeg://${url}` : url
    })
    const tmpPlaylistPath = '/tmp/nas_playlist.m3u'
    fs.writeFileSync(tmpPlaylistPath, playlistLines.join('\n'))
    currentMeta.currentTracknr = 0
    currentMeta.totalTracks = tracks.length

    const begin = () => {
      writeplayerstatePlay()
      // An engine that starts where it was left (mpv): the track and the part of it with the list; a CUE album is one
      // file, there the position in it. The CUE's track and name follow from the playing time (see the time_pos handler).
      const startAt = resume && player.startsAt ? nasStartOptions(Math.min(resume.trackNr, tracks.length), resume.progressPct) : null
      player.playList(tmpPlaylistPath, startAt ?? undefined)
      player.setVolume(volumeStart)
      currentMeta.currentTracknr = startAt ? Math.max(0, startAt.track - 1) : 0
      if (resume && !startAt) resumeNasAt(Math.min(resume.trackNr, tracks.length), resume.progressPct)
    }
    if (pausedSince(asked)) {
      heldStart = { generation, begin }
      log.debug(`${now()}: [Spotify Control] NAS playback of ${decodedPath} paused while loading - starts with "play"`)
      return
    }
    begin()
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Error starting NAS playback: ${error}`)
  }
}

// Plays a TIDAL album or playlist ("album:<id>" / "playlist:<id>"): the box's TIDAL service lists its tracks, and mpv
// plays an m3u of the service's /stream/<track> - each sends mpv on to the track's address at TIDAL, asked for when
// the track starts (they run out after a while, a list made at the start would not last an album). Like the NAS:
// the list is fetched on every start, a start overtaken meanwhile is dropped.
// resume: {trackNr, progressPct} to go on where it was left
async function playTidalList(ref, resume = null) {
  const [kind, id] = String(ref).split(':')
  if (!['album', 'playlist'].includes(kind) || !/^[A-Za-z0-9-]{1,64}$/.test(id ?? '')) {
    console.warn(`${now()}: [Spotify Control] TIDAL: not a list to play: ${ref}`)
    return
  }
  const generation = ++playbackGeneration
  // (a pause while the list loads: the start is held until "play" - see heldStart)
  const asked = playPauseRequest
  clearLibraryResumeTimers()
  try {
    const response = await fetch(`${TIDAL_SERVICE}/tracks?kind=${kind}&id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(45000) })
    const body = response.ok ? await response.json() : null
    const tracks = Array.isArray(body?.list) ? body.list : []
    if (tracks.length === 0) {
      console.warn(`${now()}: [Spotify Control] TIDAL ${kind} ${id} not started: ${response.ok ? 'no playable tracks' : `the service answered ${response.status} (signed in to TIDAL?)`}`)
      return
    }
    if (generation !== playbackGeneration || isPlaybackBlocked()) {
      log.debug(`${now()}: [Spotify Control] TIDAL ${kind} ${id} dropped (stopped, replaced or blocked meanwhile)`)
      return
    }
    currentTidalTracks = tracks
    currentMeta.currentType = 'tidal'
    currentMeta.album = body.name || ''
    currentMeta.path = `${kind}:${id}`
    currentMeta.trackFile = undefined
    const first = resume ? Math.min(Math.max(1, resume.trackNr), tracks.length) : 1
    currentMeta.currentTrackname = tracks[first - 1].name
    const tmpPlaylistPath = '/tmp/tidal_playlist.m3u'
    fs.writeFileSync(tmpPlaylistPath, tracks.map((track) => `${TIDAL_SERVICE}/stream/${track.id}`).join('\n'))
    currentMeta.currentTracknr = first - 1
    currentMeta.totalTracks = tracks.length
    const begin = () => {
      writeplayerstatePlay()
      const startAt = resume && (first > 1 || resume.progressPct > 1) ? { track: first, percent: resume.progressPct } : null
      player.playList(tmpPlaylistPath, startAt ?? undefined)
      player.setVolume(volumeStart)
    }
    if (pausedSince(asked)) {
      heldStart = { generation, begin }
      log.debug(`${now()}: [Spotify Control] TIDAL ${kind} ${id} paused while loading - starts with "play"`)
      return
    }
    begin()
  } catch (error) {
    console.warn(`${now()}: [Spotify Control] TIDAL ${kind} ${id} not started: ${error}`)
  }
}

// Where a NAS album goes on, for an engine that starts there: { track, percent } - or for a CUE album (one file)
// { track: 1, startSeconds } at the part of the track in the file
function nasStartOptions(trackNr, progressPct) {
  if (trackNr <= 1 && progressPct <= 1) return null
  if (!isCuePlayback()) return { track: trackNr, percent: progressPct }
  const index = Math.max(0, Math.min(currentCue.tracks.length, trackNr) - 1)
  const start = currentCue.tracks[index].startSeconds
  const end = cueTrackEnd(index)
  return { track: 1, startSeconds: end > start ? start + ((end - start) * progressPct) / 100 : start }
}

// A NAS album where it was left: when its first track starts, on to track trackNr (another start, it is a stream too)
// and then to progressPct % of it; silent until the playing time shows it. A CUE album is one file: one seek.
function resumeNasAt(trackNr, progressPct) {
  if (trackNr <= 1 && progressPct <= 1) return
  player.setVolume(0)
  silentUntil(() => false, 30000)
  const reached = () => currentMeta.currentTracknr === trackNr && (progressPct <= 1 || Number(currentMeta.progressTime) >= progressPct - 3)
  const seekInTrack = () => {
    if (progressPct > 1) player.seekPercent(progressPct)
    silentUntil(reached, 15000)
    checkSilence()
  }
  atPlaybackStart(() => {
    if (isCuePlayback()) {
      const index = Math.max(0, Math.min(currentCue.tracks.length, trackNr) - 1)
      const start = currentCue.tracks[index].startSeconds
      const end = cueTrackEnd(index)
      currentMeta.currentTracknr = index + 1
      currentMeta.currentTrackname = currentCue.tracks[index].name
      cueSeek(end > start ? start + ((end - start) * progressPct) / 100 : start)
      silentUntil(reached, 15000)
      return
    }
    if (trackNr > 1) {
      player.exec('pt_step', [trackNr - 1])
      // (the 'metadata' handler adds 1 at each track change - see jumpToTrack. Set at the start of the target track,
      // not before the step: the first track's metadata answer arrives after this start and would count one on top)
      atPlaybackStart(() => {
        currentMeta.currentTracknr = trackNr - 1
        seekInTrack()
      })
    } else seekInTrack()
  })
}

// A name read out with the voice chosen in the app (Sprachausgabe): a Piper voice on the box, Google as before, or
// nothing at all (stumm). The backend works the Piper sound out (speech.ts).
async function sayName(text) {
  try {
    const r = await fetch('http://127.0.0.1:8200/api/app/speech/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20000),
    })
    const b = await r.json()
    if (b.off) return
    if (b.file) {
      playNameSound(b.file)
      return
    }
  } catch (err) {
    log.debug(`${now()}: [Spotify Control] Piper not asked: ${err?.message || err}`)
  }
  const filename = `/home/dietpi/MuPiBox/tts_files/${text}.mp3`
  if (fs.existsSync(filename)) playFile(text)
  else downloadTTS(text)
}

function playFile(playedFile) {
  const playedTitel = `${playedFile}.mp3`
  log.debug(`${now()}: [Spotify Control] Name read: ${playedTitel}`)
  playNameSound(`/home/dietpi/MuPiBox/tts_files/${playedTitel}`)
}

// A name read out, next to the music: by the backend, which makes the music quieter or pauses it as set (Sprachausgabe
// › Vorgelesene Namen, speech.ts playName); without an answer from it, by an mpv of its own over the music. It went
// through the music's player: what played was replaced by the name - the mini player showed the sound's file name, and
// when the name was over nothing played any more.
function playNameSound(file) {
  fetch('http://127.0.0.1:8200/api/app/speech/name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`backend ${r.status}`)
    })
    .catch((err) => {
      log.debug(`${now()}: [Spotify Control] name read here (backend: ${err?.message || err})`)
      playNameSoundHere(file)
    })
}

// (a name while the one before is still read - quick scrolling - cuts that one off)
let nameSound = null
function playNameSoundHere(file) {
  if (nameSound) {
    try {
      nameSound.kill()
    } catch {
      /* gone already */
    }
  }
  // (a name of its own for PulseAudio, which keeps the volume per program name - see speech.ts playName)
  const child = require('node:child_process').spawn('mpv', ['--no-video', '--really-quiet', '--no-config', '--ao=pulse,alsa', '--audio-client-name=mupibox-name', `--volume=${volumeStart}`, file], {
    stdio: 'ignore',
  })
  nameSound = child
  child.on('error', (e) => log.debug(`${now()}: [Spotify Control] Name not read: ${e?.message || e}`))
  child.on('exit', () => {
    if (nameSound === child) nameSound = null
  })
}

// A radio link may be a playlist (m3u / pls) instead of the stream itself: its FIRST stream is played (see
// playlist-url.js). The playlist is fetched first, so the start waits for it (a few seconds at most, the display shows
// the loading dots meanwhile); a stop or another start in that time wins. Everything else starts at once, as before.
function playRadioURL(radioURL) {
  if (!isPlaylistUrl(radioURL)) {
    playURL(radioURL)
    return
  }
  const generation = ++playbackGeneration
  startLoading()
  resolveStreamUrl(radioURL)
    .then((streamURL) => {
      // like the NAS path: playtime / quiet hours may have started a grace period while the playlist was read
      if (generation !== playbackGeneration || isPlaybackBlocked()) {
        log.debug(`${now()}: [Spotify Control] Playlist ${radioURL} dropped (stopped, replaced or blocked meanwhile)`)
        if (generation === playbackGeneration) stopLoading()
        return
      }
      if (streamURL !== radioURL) {
        log.info(`${now()}: [Spotify Control] Opened playlist ${radioURL}: playing its first stream ${streamURL}`)
      }
      playURL(streamURL)
    })
    .catch((err) => {
      log.error(`${now()}: [Spotify Control] Could not start ${radioURL}: ${err}`)
      if (generation === playbackGeneration) stopLoading()
    })
}

// --- Where each podcast episode was left ---
// Every episode that was played is remembered with its position (mupibox.episodeResume, on unless switched off),
// for mupibox.episodeResumeDays days after it was last heard (0: without end). Started again - from the episode
// list, the app or a resume tile - it goes on there. An episode heard to its last half minute counts as heard and
// starts from the beginning next time. The backend reads the file for the app's episode list.
const EPISODE_POSITIONS_FILE = path.join(LIBRARY_DIR, 'episode-positions.json')
const EPISODE_POSITIONS_MAX = 5000
let episodePositions = null // { [episode key]: { pos, len, at, done } } (by the address, from before the keys)
// What stays the same of an episode's address from one fetch of its feed to the next - the same as backend-api's
// episodeKey (podcast-offline.ts): the query of an address whose path names the audio file is left out (values for
// statistics or ads, new at every fetch - the position and the kept file were lost with them).
function episodeKey(url) {
  try {
    const u = new URL(url)
    if (/\.(mp3|m4a|mp4|aac|ogg|oga|opus|wav|flac)$/i.test(u.pathname)) return `${u.host.toLowerCase()}${u.pathname}`
  } catch {
    // no URL: as it is
  }
  return url
}
const positionOf = (url) => {
  const all = loadEpisodePositions()
  return all[episodeKey(url)] ?? all[url]
}
// The length of an episode as its feed gives it (backend-api /api/rssfeed/episode-duration): mplayer only estimates
// the length of an MP3 with a changing bitrate - an episode counted as heard too early, or a broken connection was
// not seen as one. 0: not known.
let episodeFeedLength = { url: '', seconds: 0 }
function loadEpisodeFeedLength(url) {
  episodeFeedLength = { url, seconds: 0 }
  fetch(`http://127.0.0.1:8200/api/rssfeed/episode-duration?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      if (episodeFeedLength.url === url && Number(body?.seconds) > 60) episodeFeedLength.seconds = Number(body.seconds)
    })
    .catch(() => undefined)
}
// The feed's length if it gave one, else mplayer's
function episodeLength() {
  return (episodeFeedLength.url === playingEpisode && episodeFeedLength.seconds) || Number(currentMeta.durationSeconds) || 0
}
let episodePositionsDirty = false
let playingEpisode = null // the address of the episode mplayer plays, while it plays one
function episodeResumeOn() {
  return muPiBoxConfig?.mupibox?.episodeResume !== false
}
function loadEpisodePositions() {
  if (episodePositions) return episodePositions
  try {
    episodePositions = JSON.parse(fs.readFileSync(EPISODE_POSITIONS_FILE, 'utf8')) ?? {}
  } catch {
    episodePositions = {}
  }
  return episodePositions
}
// Written at most once a minute while an episode plays (and when it ends), not every second: the SD card
function saveEpisodePositions() {
  if (!episodePositionsDirty || !episodePositions) return
  episodePositionsDirty = false
  const days = Number(muPiBoxConfig?.mupibox?.episodeResumeDays ?? 180)
  const oldest = days > 0 ? Date.now() - days * 24 * 3600 * 1000 : 0
  const kept = Object.entries(episodePositions)
    .filter(([, p]) => p && p.at >= oldest)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, EPISODE_POSITIONS_MAX)
  episodePositions = Object.fromEntries(kept)
  const tmp = `${EPISODE_POSITIONS_FILE}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(episodePositions))
    fs.renameSync(tmp, EPISODE_POSITIONS_FILE)
  } catch (err) {
    log.debug(`${now()}: [Spotify Control] Episode positions not saved: ${err}`)
  }
}
setInterval(saveEpisodePositions, 60 * 1000)
// The play of an episode starts: the one before is written away. Returns where it goes on (seconds), or null to
// start from the beginning.
function startEpisode(url) {
  saveEpisodePositions()
  if (pendingEpisodeSeek) endEpisodeSeek()
  playingEpisode = url
  loadEpisodeFeedLength(url)
  if (!episodeResumeOn()) return null
  const p = positionOf(url)
  if (!p || p.done || !(p.pos > 10) || (p.len && p.pos > p.len - 30)) return null
  const target = Math.max(0, p.pos - 5)
  // (the sound comes back when mplayer got there - or after 8 s at the latest, see playURL)
  pendingEpisodeSeek = { url, target, sent: 0, tries: 0, timer: setTimeout(() => endEpisodeSeek(), 20000) }
  log.debug(`${now()}: [Spotify Control] Episode goes on at ${Math.round(target)}s`)
  episodeResumedAt = Date.now()
  return target
}
// The episode mplayer plays: { url, generation (of the playback), retries, endedAt (where it ended before) }. A stop,
// another start or a block changes playbackGeneration - then its end is no broken connection.
let episodeRun = null
function reconnectEpisode() {
  const run = episodeRun
  if (!run || run.generation !== playbackGeneration || currentMeta.currentType !== 'rss' || playingEpisode !== run.url) return false
  const pos = Number(currentMeta.positionSeconds) || 0
  const len = episodeLength()
  if (!(len > 60) || pos < 5 || pos >= len - 30 || run.retries >= 3 || isPlaybackBlocked()) return false
  // Opened again and ended at the same place: that is the real end (a feed that gives the episode as longer than it
  // is) - not opened a third time, and the episode counts as heard
  if (run.endedAt !== undefined && Math.abs(pos - run.endedAt) < 10) {
    noteEpisodeDone(run.url, pos)
    return false
  }
  run.endedAt = pos
  run.retries++
  const target = Math.max(0, pos - 3)
  console.warn(`${now()}: [Spotify Control] Episode ended at ${Math.round(pos)}s of ${Math.round(len)}s - opened again (${run.retries}/3)`)
  if (pendingEpisodeSeek) endEpisodeSeek()
  pendingEpisodeSeek = { url: run.url, target, sent: 0, tries: 0, timer: setTimeout(() => endEpisodeSeek(), 20000) }
  episodeResumedAt = Date.now()
  playURL(offlineEpisodeFile(run.url) ?? run.url, target)
  run.generation = playbackGeneration
  return true
}
// (the display's resume tile seeks 2 s after the start to its own position, up to 30 s older: not after this did)
let episodeResumedAt = 0
let pendingEpisodeSeek = null // { url, target, sent, tries, timer } while an episode is on its way to where it was left
function endEpisodeSeek(delayMs = 0) {
  const s = pendingEpisodeSeek
  if (!s) return
  clearTimeout(s.timer)
  pendingEpisodeSeek = null
  if (!delayMs) return player.setVolume(volumeStart)
  // (a moment after the jump, so the beginning still in the audio buffer is not heard)
  setTimeout(() => {
    if (!pendingEpisodeSeek) player.setVolume(volumeStart)
  }, delayMs)
}
// (from mplayer's playing time, every second)
function continueEpisodeSeek(seconds) {
  const s = pendingEpisodeSeek
  if (!s) return
  if (s.url !== playingEpisode || currentMeta.currentType !== 'rss') return endEpisodeSeek()
  if (seconds >= s.target - 3) return endEpisodeSeek(400) // there
  // (sent again when mplayer dropped it while still buffering, as with the CUE albums)
  if (s.sent && Date.now() - s.sent > 2500) {
    // a server that does not let mplayer seek (no range requests): after the retries on where it is - silent for
    // up to 20 s before
    if (s.tries >= 2) {
      console.warn(`${now()}: [Spotify Control] Episode could not go on at ${Math.round(s.target)}s (the server does not seek), plays on from ${Math.round(seconds)}s`)
      return endEpisodeSeek()
    }
    s.tries++
    s.sent = Date.now()
    player.exec('pausing_keep seek', [s.target, 2])
  }
}
function noteEpisodePosition(seconds) {
  continueEpisodeSeek(seconds)
  // (not while it is still on its way: the beginning would overwrite the position)
  if (pendingEpisodeSeek) return
  // (noted also with going on switched off: an episode once started is no longer "new", see backend-api episode-state.ts)
  if (!playingEpisode || currentMeta.currentType !== 'rss' || !(seconds > 0)) return
  const len = episodeLength()
  const done = len > 60 && seconds >= len - 30
  const all = loadEpisodePositions()
  if (all[playingEpisode] && episodeKey(playingEpisode) !== playingEpisode) delete all[playingEpisode] // (the entry of before the keys)
  all[episodeKey(playingEpisode)] = { pos: done ? 0 : Math.round(seconds), len: Math.round(len), at: Date.now(), done }
  episodePositionsDirty = true
}
// An episode heard to its end although its feed gave it as longer (see reconnectEpisode): its real length is where it ended
function noteEpisodeDone(url, seconds) {
  const all = loadEpisodePositions()
  all[episodeKey(url)] = { pos: 0, len: Math.round(seconds), at: Date.now(), done: true }
  episodePositionsDirty = true
  saveEpisodePositions()
}

// A podcast episode kept on the SD card (backend-api podcast-offline.ts): <sha1 of its address>.<ext> in this folder.
// Played from there - also without internet - instead of being streamed; the address stays what the rest knows.
const podcastOfflineDir = '/home/dietpi/MuPiBox/podcasts'
const podcastOfflineExtensions = ['.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.opus']
function offlineEpisodeFile(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return undefined
  const sha1 = (text) => require('node:crypto').createHash('sha1').update(text).digest('hex')
  for (const hash of new Set([sha1(episodeKey(url)), sha1(url)])) {
    for (const ext of podcastOfflineExtensions) {
      const file = path.join(podcastOfflineDir, `${hash}${ext}`)
      if (fs.existsSync(file)) {
        log.debug(`${now()}: [Spotify Control] Episode from the SD card: ${file}`)
        return file
      }
    }
  }
  return undefined
}

// resumeAt: a podcast episode goes on there (seconds). The seek is sent right behind the loadfile, so mplayer takes it
// with its first round, and the volume stays at 0 until it got there (endEpisodeSeek): the beginning played for a
// second or so before the jump.
function playURL(playedURL, resumeAt = null) {
  // an episode or radio address on the box itself is no media: its servers would take it as a command (playlist-url.js)
  if (pointsAtBox(playedURL)) {
    log.warn(`${now()}: [Spotify Control] Refused to play ${JSON.stringify(String(playedURL).slice(0, 200))}: an address on the box itself`)
    stopLoading()
    return
  }
  playbackGeneration++
  // (an episode that goes on: the sound runs once mpv is past that position)
  startLoading(resumeAt != null && player.startsAt ? resumeAt : 0)
  log.debug(`${now()}: [Spotify Control] Starting currentMeta.playing:${playedURL}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  if (resumeAt != null && player.startsAt) {
    // mpv begins at the position itself; the seek logic of the episode (pendingEpisodeSeek) only watches that it
    // got there, and tries a seek when the server did not let it start there
    player.play(playedURL, { startSeconds: resumeAt })
    player.setVolume(volumeStart)
    if (pendingEpisodeSeek) pendingEpisodeSeek.sent = Date.now()
    log.debug(`${now()}: ${playedURL} from ${resumeAt}s`)
    if (telegramPlaybackNotices())
      cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing stream"')
    return
  }
  player.play(playedURL)
  if (resumeAt != null) {
    player.setVolume(0)
    atPlaybackStart(() => {
      if (pendingEpisodeSeek) pendingEpisodeSeek.sent = Date.now()
      player.exec('pausing_keep seek', [resumeAt, 2])
    })
  } else player.setVolume(volumeStart)
  log.debug(`${now()}: ${playedURL}`)
  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing stream"')
  //if (hasConfiguredTelegram()) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py');
}

/*seek 30 secends back or forward*/
function seek(progress) {
  forgetSpotifyState()
  let currentProgress = 0
  let targetProgress = 0
  log.debug(`${now()}: [Spotify Control] Setting progress to ${progress}`)
  if (currentMeta.currentPlayer === 'spotify') {
    if (spotifyBlockedUntil()) return
    if (progress > 1) {
      spotifyApi.seek(progress, ownSpotifyDeviceOptions()).then(
        () => {
          counter.countseek++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          log.debug(`${now()}: [Spotify Control] Progress is ${progress}`)
        },
        (err) => {
          handleSpotifyError(err, 'seek')
        },
      )
    } else {
      spotifyApi
        .getMyCurrentPlaybackState()
        .then((data) => {
          counter.countgetMyCurrentPlaybackState++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          currentProgress = data.body?.progress_ms
          log.debug(
            `${now()}: [Spotify Control]Current progress for active device is ${currentProgress}`,
          )
          // (nothing playing: no position to go from - a seek to NaN or below 0 failed and set off the recoveries)
          if (typeof currentProgress !== 'number') throw Object.assign(new Error('no playback position'), { overtaken: true })
          if (progress) targetProgress = currentProgress + 30000
          else targetProgress = Math.max(0, currentProgress - 30000)
        })
        .then(
          () => {
            spotifyApi.seek(targetProgress, ownSpotifyDeviceOptions()).then(
              () => {
                counter.countseek++
                if (config.server.logLevel === 'debug') {
                  writeCounter()
                }
                log.debug(`${now()}: [Spotify Control] Setting progress to ${targetProgress}`)
              },
              (err) => {
                handleSpotifyError(err, 'seek')
              },
            )
          },
          (err) => {
            handleSpotifyError(err, 'seek')
          },
        )
    }
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (progress > 1) {
      // (an album that is no folder: a place in its track, as an absolute time of the whole)
      const albumSeek = albumNow()?.seek?.(progress, player.trackIndex?.() ?? currentMeta.currentTracknr - 1)
      if (typeof albumSeek === 'number') {
        player.exec('seek', [albumSeek, '2'])
      } else if (isCuePlayback()) {
        const index = Math.max(0, currentMeta.currentTracknr - 1)
        const track = currentCue.tracks[index]
        const end = cueTrackEnd(index)
        // the last track's end is only known once mplayer told the file length: until then no seek (it would go backwards)
        if (end > track.startSeconds) cueSeek(track.startSeconds + ((end - track.startSeconds) * progress) / 100)
      } else {
        player.seekPercent(progress)
      }
    } else {
      if (progress) player.seek(+30)
      else player.seek(-30)
    }
  }
}

// HIGH-1: previously this spliced caller-controlled `deleteFile` into a
// shell `rm -r "…"` command, then ran it through `exec()`. The two
// `decodeURIComponent` passes meant any %-encoded backtick / quote /
// semicolon in the path was decoded back to its literal form before
// reaching the shell — a frontend WebSocket call with deleteFile of
// `foo"; touch /tmp/PWN; "` broke out of the quoted argument and ran
// arbitrary commands as the dietpi user. Auth-protected (frontend
// only), but defence-in-depth matters here because the same
// surface picks up RSS-fed strings from the resume-list path.
//
// Fix:
//   1. Use execFile so arguments don't reach a shell at all.
//   2. Resolve the requested path under the media root and refuse
//      anything that escapes (`..`, absolute paths, symlink games).
//   3. Reject the request entirely if the validated path doesn't
//      already exist — silent no-op rather than exec'ing rm against
//      something dubious.
function deleteLocal(deleteFile) {
  const MEDIA_ROOT = '/home/dietpi/MuPiBox/media/'
  let decoded
  try {
    // Single decode — `decodeURI` then `decodeURIComponent` is a footgun
    // (chains can re-introduce escapes). decodeURIComponent handles the
    // standard %xx-encoding the frontend produces.
    decoded = decodeURIComponent(deleteFile)
  } catch (err) {
    log.warn(`${now()}: [deleteLocal] decode failed for ${deleteFile}: ${err?.message || err}`)
    return
  }
  // Frontend uses ':' as a path-segment separator (e.g. "audiobook:Foo:Bar")
  // — translate to '/' before resolving.
  const relPath = decoded.replace(/:/g, '/')
  const fullPath = path.resolve(MEDIA_ROOT, relPath)
  // path.resolve normalises `..` segments, so any traversal collapses
  // to an absolute path that's no longer under MEDIA_ROOT — we just
  // reject anything that doesn't end up inside the root.
  if (!fullPath.startsWith(MEDIA_ROOT)) {
    log.warn(`${now()}: [deleteLocal] path-traversal attempt rejected: ${relPath} → ${fullPath}`)
    return
  }
  // Only an album: the display sends category:artist:title (m3u_generator.sh: media/<category>/<artist>/<album>). A
  // category alone ("audiobook"), category:artist, a call with an empty part ("audiobook::") or one going back up
  // ("audiobook:x:.." - the command's parser also leaves "." of it) resolved to a whole category's or artist's folder
  // and removed all of it. Exactly three parts, each one folder level.
  const parts = decoded.split(':')
  const levels = path.relative(MEDIA_ROOT, fullPath).split(path.sep)
  if (
    parts.length !== 3 ||
    parts.some((part) => part.trim() === '' || part === '.' || part === '..') ||
    levels.length !== parts.length
  ) {
    log.warn(`${now()}: [deleteLocal] refusing to delete more than an album: ${JSON.stringify(relPath)}`)
    return
  }
  // Don't shell out to a non-existent target — that's the symptom of
  // either a glitched frontend call or an active probe.
  if (!fs.existsSync(fullPath)) {
    log.warn(`${now()}: [deleteLocal] target does not exist, refusing: ${fullPath}`)
    return
  }
  log.debug(`${now()}: rm -r ${fullPath}`)
  const execFile = require('node:child_process').execFile
  execFile('rm', ['-r', fullPath], (e, stdout, stderr) => {
    if (e instanceof Error) {
      log.warn(`${now()}: [deleteLocal] rm failed: ${e.message}`)
      return
    }
    if (stdout) console.log('stdout', stdout)
    if (stderr) console.log('stderr', stderr)
  })
}

function cmdCall(cmd) {
  log.debug(`${now()}: [Spotify Control]Cmd  ${cmd}`)
  const call = new Promise((resolve, reject) => {
    childProcess.exec(cmd, (error, standardOutput, standardError) => {
      if (error) {
        log.debug(`${now()}: [Spotify Control]error ${error}`)
        reject()
        return
      }
      if (standardError) {
        log.debug(`${now()}: [Spotify Control]StandardError ${standardError}`)
        reject(standardError)
        return
      }
      log.debug(`${now()}: [Spotify Control]StandardOutput ${standardOutput}`)
      resolve(standardOutput)
    })
  })
  // Most callers fire and forget. Any output on stderr (a sudo warning, a Python traceback of a
  // Telegram script) rejects, and without a handler that rejection ended the whole process under
  // Node 22. Callers that chain their own .catch still get the error.
  call.catch(() => {})
  return call
}

// Serialise setVolume calls so two rapid taps from the touchscreen
// can't both read the same stale currentMeta.volume and double-increment
// past maxVolume. The previous code fired exec(cmdVolume) WITHOUT
// awaiting the callback and then immediately compared against the
// not-yet-updated currentMeta.volume — for fast taps the comparison
// always saw the value from before any of the in-flight operations,
// so the maxVolume cap (Hörschutz) was bypassable. Bug class: TOCTOU.
let _volumeOpQueue = Promise.resolve()
const _execAsync = (cmd) =>
  new Promise((resolve, reject) => {
    require('node:child_process').exec(cmd, (e, stdout, stderr) => {
      if (e) reject(e)
      else resolve({ stdout, stderr })
    })
  })

// Bluetooth audio on (PulseAudio's default output is a Bluetooth device, e.g. headphones): its own maximum volume
// counts (mupibox.btMaxVolume), else the box's (maxVolume). Asked at most every 3 seconds.
let btAudio = { at: 0, on: false }
async function bluetoothAudio() {
  if (Date.now() - btAudio.at < 3000) return btAudio.on
  // (headphones: a Bluetooth device, or the board's 3.5 mm output - its card is "bcm2835 Headphones", see backend-api
  // audio-output.ts; the own limit for headphones counts there too, not only the box's maximum)
  const on = await _execAsync('/usr/bin/pactl get-default-sink')
    .then(async ({ stdout }) => {
      const sink = String(stdout).trim()
      if (sink.startsWith('bluez_')) return true
      if (!sink.startsWith('alsa_output.') || !sink.includes('bcm2835')) return false
      const { stdout: list } = await _execAsync('LC_ALL=C /usr/bin/pactl list sinks')
      const block = String(list).split(/\n(?=Sink #)/).find((b) => b.includes(`Name: ${sink}\n`)) ?? ''
      return /alsa\.card_name = "[^"]*Headphones/i.test(block)
    })
    .catch(() => false)
  btAudio = { at: Date.now(), on }
  return on
}
async function volumeCap() {
  const mb = muPiBoxConfig.mupibox
  return Number.isInteger(mb.btMaxVolume) && (await bluetoothAudio()) ? mb.btMaxVolume : mb.maxVolume
}

/*gets available devices, searches for the active one and returns its volume*/
// An absolute volume (the Winamp theme's slider), in the same queue as the steps and under the same maximum
async function setVolumeTo(percent) {
  _volumeOpQueue = _volumeOpQueue.then(async () => {
    const cap = await volumeCap()
    const target = Math.max(0, Math.min(cap, percent))
    await cmdCall(`/usr/bin/amixer sset Master ${target}%`)
    currentMeta.volume = target
  }).catch((err) => {
    log.warn(`${now()}: [setVolumeTo] op failed:`, err?.message || err)
  })
  return _volumeOpQueue
}

async function setVolume(volume, step = 5) {
  // step: percent per change (5 for the +5 / -5 commands, 1..10 for the rotary encoder)
  const volumeUp = `/usr/bin/amixer sset Master ${step}%+`
  const volumeDown = `/usr/bin/amixer sset Master ${step}%-`
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"

  // Chain onto the queue so concurrent invocations run strictly serially.
  // Each invocation reads the ACTUAL current volume from amixer first,
  // checks the cap, then writes — no stale-comparison window.
  _volumeOpQueue = _volumeOpQueue.then(async () => {
    let actualVolume
    try {
      const { stdout } = await _execAsync(cmdVolume)
      actualVolume = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
    } catch (e) {
      log.warn(`${now()}: [setVolume] amixer read failed, skipping op:`, e?.message || e)
      return
    }
    if (Number.isNaN(actualVolume)) {
      log.warn(`${now()}: [setVolume] amixer returned unparseable volume, skipping op`)
      return
    }
    currentMeta.volume = actualVolume
    const cap = await volumeCap()
    const volumeMax = `/usr/bin/amixer sset Master ${cap}%`

    if (volume) {
      if (actualVolume < cap) {
        // never above the max volume, also when the step does not divide the remaining room
        await cmdCall(actualVolume + step > cap ? volumeMax : volumeUp)
        currentMeta.volume = Math.min(actualVolume + step, cap)
      } else {
        currentMeta.volume = cap
        await cmdCall(volumeMax)
      }
    } else {
      await cmdCall(volumeDown)
      currentMeta.volume = Math.max(actualVolume - step, 0)
    }
  }).catch((err) => {
    // Don't let one failed op poison the queue for subsequent ops.
    log.warn(`${now()}: [setVolume] op failed:`, err?.message || err)
  })

  return _volumeOpQueue
}

// Ends playback gently: the box's volume (amixer Master - every source, Spotify too) goes down over FADE_OUT_MS,
// then `done` runs (the stop) and the volume is set back - silently, for the next playback. The end of the playing
// time and of a quiet time came as a hard cut before.
const FADE_OUT_MS = 20_000
const FADE_OUT_STEPS = 40
let fadingOut = false
function fadeOutThen(done) {
  if (fadingOut) return
  fadingOut = true
  _volumeOpQueue = _volumeOpQueue.then(async () => {
    let start = Number.NaN
    try {
      const { stdout } = await _execAsync("/usr/bin/amixer sget Master | grep 'Right:'")
      start = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
    } catch {
      // not readable: stopped at once
    }
    const nothingToFade = !Number.isFinite(start) || start <= 0 || !isActuallyPlaying()
    if (!nothingToFade) {
      log.debug(`${now()}: [Spotify Control] Fading out from ${start}% over ${FADE_OUT_MS / 1000}s`)
      for (let i = 1; i <= FADE_OUT_STEPS; i++) {
        await new Promise((r) => setTimeout(r, FADE_OUT_MS / FADE_OUT_STEPS))
        await _execAsync(`/usr/bin/amixer sset Master ${Math.round(start * (1 - i / FADE_OUT_STEPS))}%`).catch(() => undefined)
      }
    }
    try {
      done()
    } finally {
      if (!nothingToFade) {
        // (a moment after the stop, so nothing plays at the old volume any more)
        await new Promise((r) => setTimeout(r, 1500))
        await _execAsync(`/usr/bin/amixer sset Master ${start}%`).catch(() => undefined)
      }
      fadingOut = false
    }
  })
}

async function transferPlayback(id) {
  forgetSpotifyState()
  await spotifyApi.transferMyPlayback([id]).then(
    () => {
      counter.counttransferMyPlayback++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${now()}: [Spotify Control] Transfering playback to ${id}`)
    },
    (err) => {
      log.debug(`${now()}: [Spotify Control] Transfering playback error.`)
      handleSpotifyError(err, id, 'transferPlayback')
    },
  )
}

function downloadTTS(name) {
  const namedl = name
  log.debug(`${now()}: [Spotify Control] TTS Name: ${namedl} in ${config.ttsLanguage}`)
  googleTTS
    .getAudioBase64(namedl, { lang: config.ttsLanguage, slow: false })
    .then((base64) => {
      console.log({ base64 })
      const buffer = Buffer.from(base64, 'base64')
      const filename = `/home/dietpi/MuPiBox/tts_files/${namedl}.mp3`
      log.debug(`${now()}: [Spotify Control] TTS Filename: ${filename}`)
      fs.writeFileSync(filename, buffer, { encoding: 'base64' })
      playFile(namedl)
    })
    .catch(console.error)
}

async function useSpotify(command) {
  // (Spotify blocks the requests: the start is not made, and what plays now goes on as it was - counted. The state
  // was set for the new start first, and then the music that went on counted as nothing)
  if (spotifyBlockedUntil()) {
    log.debug(`${now()}: [Spotify Control] Spotify start refused: Spotify blocks the requests`)
    return
  }
  playbackGeneration++
  currentMeta.finished = false
  if (currentMeta.currentPlayer !== 'spotify') {
    clearLibraryResumeTimers()
    player.stop() // local media, radio or a podcast may still be playing in mplayer
    // (Spotify names no track here: the name of the MP3 played before stayed in the bar of the display until a
    // restart of this player)
    forgetLocalTrack()
  }
  currentMeta.currentPlayer = 'spotify'
  currentMeta.currentType = 'spotify'
  const dir = command.dir
  const newdevice = dir.split('/')[1]

  log.debug(`${now()}: [Spotify Control] Stored device: ${activeDevice}, Requested: ${newdevice}`)

  // Update active device (will be used in playMe() via device_id parameter)
  if (newdevice !== 'current') {
    activeDevice = newdevice
    log.debug(`${now()}: [Spotify Control] Device set to: ${activeDevice}`)
  } else {
    // Not from the display: play on the display's device when it reported one. Spotify's "currently active
    // device" often is none (after a restart, or after the NAS or local media played) - then nothing played.
    // None reported (after a restart of this player): playOnDevice() looks for the box's own one first.
    activeDevice = displaySpotifyDevice
    log.debug(`${now()}: [Spotify Control] No device in the request, using the display's: ${activeDevice}`)
  }

  currentMeta.activeSpotifyId = command.name
  playMe()
}

/*endpoint to return all spotify connect devices on the network*/
/*only used if sonos-kids-player is modified*/
app.get('/getDevices', (_req, res) => {
  if (spotifyBlockedUntil()) return res.status(503).json({ error: 'Spotify blocks the requests' })
  spotifyApi.getMyDevices().then(
    (data) => {
      counter.countgetMyDevices++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      const availableDevices = data.body.devices
      log.debug(`${now()}: [Spotify Control] Getting available devices...`)
      res.send(availableDevices)
    },
    (err) => {
      // (an answer also on a failure - the request waited for its timeout; only a token renewal, no recovery)
      if (err?.body?.error?.status === 401) handleSpotifyError(err, 'getMyDevicesHTTP')
      else isSpotify429(err, 'getMyDevicesHTTP')
      res.status(502).json({ error: 'devices not available' })
    },
  )
})

/*endpoint transfer a playback to a specific device*/
/*only used if sonos-kids-player is modified*/
app.get('/setDevice', (req, res) => {
  // (it moved a session to the box also during the daily limit or a quiet time, and never answered)
  if (isPlaybackBlocked()) return res.status(423).json({ error: 'playback blocked' })
  transferPlayback(req.query.id)
  res.json({ ok: true })
})

/*endpoint to return all state information*/
/*only used if sonos-kids-player is modified*/
// The Spotify state for the parents' app (its start page asks every 5 s while it is open): kept for 15 s, the progress
// moved on by the time since - every ask went to Spotify (720 requests an hour). A command of the box (play, pause,
// skip, ...) asks anew.
let spotifyStateKept = null
const SPOTIFY_STATE_KEEP_MS = 15000
function forgetSpotifyState() {
  spotifyStateKept = null
}
const EMPTY_STATE = () => ({
  item: {
    album: {
      name: '',
      total_tracks: '',
    },
    name: '',
    track_number: '',
  },
  currently_playing_type: '',
})
app.get('/state', (_req, res) => {
  if (currentMeta.currentPlayer === 'spotify') {
    const kept = spotifyStateKept
    const age = kept ? Date.now() - kept.at : Number.POSITIVE_INFINITY
    // (its song over meanwhile: asked anew for the next one)
    const progress = kept?.state.is_playing && typeof kept.state.progress_ms === 'number' ? kept.state.progress_ms + age : kept?.state.progress_ms
    if (kept && age < SPOTIFY_STATE_KEEP_MS && !(progress >= (kept.state.item?.duration_ms ?? Number.POSITIVE_INFINITY))) {
      res.send({ ...kept.state, progress_ms: progress })
      return
    }
    if (spotifyBlockedUntil()) {
      res.send(EMPTY_STATE())
      return
    }
    spotifyApi
      .getMyCurrentPlaybackState({
        additional_types: 'episode,track',
      })
      .then(
        (data) => {
          counter.countgetMyCurrentPlaybackStateHTTP++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          let state = data.body
          if (!state || Object.keys(state).length === 0) {
            state = EMPTY_STATE()
          } else {
            spotifyStateKept = { at: Date.now(), state }
          }
          res.send(state)
        },
        (err) => {
          // (only a question: none of handleSpotifyError's recoveries - they start or move the playback - and an
          // answer all the same, the app waited for its timeout; an expired token is renewed, a block noted)
          if (err?.body?.error?.status === 401) handleSpotifyError(err, 'stateHTTP')
          else isSpotify429(err, 'stateHTTP')
          res.send(EMPTY_STATE())
        },
      )
  } else {
    const state = {
      item: {
        album: {
          name: '',
          total_tracks: '',
        },
        name: '',
        track_number: '',
      },
      currently_playing_type: '',
    }
    res.send(state)
  }
})

// The display reports its Spotify device (the Web Playback SDK in the kiosk) when it connects. Starts that
// don't come from the display (/current/..., e.g. the parents' web app or Telegram) play there.
// Whether something plays now (the backend's announcements pause it and go on afterwards, speech.ts)
app.get('/playing', (_req, res) => {
  res.json({ playing: isActuallyPlaying() })
})

// Which device the display reported (the app's page "Zugangsdaten" asks Spotify whether it still knows it)
app.get('/display/spotify-device', (_req, res) => {
  res.json({ id: displaySpotifyDevice })
})
app.get('/display/spotify-device/:id', (req, res) => {
  if (!/^[A-Za-z0-9]{20,64}$/.test(req.params.id)) {
    res.status(400).json({ error: 'bad device id' })
    return
  }
  displaySpotifyDevice = req.params.id
  displayDeviceReportedAt = Date.now()
  log.debug(`${now()}: [Spotify Control] Display device: ${displaySpotifyDevice}`)
  res.json({ ok: true })
})

app.get('/display/spotify-silent/:on', (req, res) => {
  // (only from the device the display reported - the display's page opened in a parent's browser through the app has
  // no player of its own, and its "silent" counted the playing box as silent)
  if (!displaySpotifyDevice || req.query.device !== displaySpotifyDevice) {
    res.status(409).json({ error: 'not the display device' })
    return
  }
  currentMeta.spotifySilent = req.params.on === '1'
  res.json({ ok: true })
})

// The display's Spotify player says where it is (at each change of its state: a track, a pause, a seek), for the ticks of
// what was heard (see "Heard"): track, pos and dur (ms), paused, next (tracks after it), ctx (what plays), album (its id).
// Only from the display's own device, as /display/spotify-silent.
app.get('/display/spotify-progress', (req, res) => {
  if (!displaySpotifyDevice || req.query.device !== displaySpotifyDevice) {
    res.status(409).json({ error: 'not the display device' })
    return
  }
  const q = req.query
  const id = (v) => (typeof v === 'string' && /^[A-Za-z0-9]{1,64}$/.test(v) ? v : '')
  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const ctx = typeof q.ctx === 'string' && /^spotify:[a-z]+:[A-Za-z0-9]{1,64}$/.test(q.ctx) ? q.ctx : ''
  spotifyProgress = { track: id(q.track), posMs: num(q.pos), durMs: num(q.dur), paused: q.paused === '1', next: num(q.next), ctx, shuffle: q.shuffle === '1', at: Date.now() }
  // (an album's last track: asked once, when an album plays)
  const album = id(q.album)
  if (album && ctx === `spotify:album:${album}`) learnSpotifyAlbumEnd(album)
  res.json({ ok: true })
})

// Called by the backend on the box (the parents' web app's "reload the display now").
app.post('/display/reload-theme', (_req, res) => {
  currentMeta.themeReloadAt = Date.now()
  res.json({ ok: true })
})
app.post('/display/reload-page', (_req, res) => {
  currentMeta.pageReloadAt = Date.now()
  res.json({ ok: true })
})

// The display: an album is open and the photo time counts (every few seconds while it does - see photoTimeTickStep);
// {active: false} when it stops counting (the album left, the display off, the grid idle): it stops at once
app.post('/photos/active', (req, res) => {
  photoActiveUntil = req.body?.active !== false && readPhotoTimeConfig().enabled ? Date.now() + PHOTO_ACTIVE_MS : 0
  res.json({ ok: true })
})

// The Winamp theme's equaliser and balance: GET reads them (supported: false = mplayer, which has no filter), POST sets
// them live and keeps them in a file
app.get('/winamp/sound', (_req, res) => {
  res.json({ supported: typeof player.setSound === 'function', ...winampSound })
})
app.post('/winamp/sound', (req, res) => {
  const body = req.body ?? {}
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0))
  winampSound.on = body.on === true
  winampSound.auto = body.auto === true
  winampSound.preamp = num(body.preamp, -12, 12)
  winampSound.bands = Array.from({ length: 10 }, (_, i) => num(Array.isArray(body.bands) ? body.bands[i] : 0, -12, 12))
  winampSound.balance = num(body.balance, -100, 100)
  applyWinampSound()
  fs.writeFile(WINAMP_SOUND_FILE, JSON.stringify(winampSound), () => undefined)
  res.json({ ok: true })
})

// The equaliser's presets of the Winamp theme: the ones the children / parents saved (named), the auto-load ones (one per
// album: AUTO loads them when the album plays) and the default. The display keeps the whole set and sends it back whole.
const WINAMP_PRESETS_FILE = '/home/dietpi/.mupibox/winamp-presets.json'
const cleanValues = (v) => {
  const num = (x) => Math.max(-12, Math.min(12, Math.round((Number(x) || 0) * 2) / 2))
  return { preamp: num(v?.preamp), bands: Array.from({ length: 10 }, (_, i) => num(Array.isArray(v?.bands) ? v.bands[i] : 0)) }
}
const cleanSet = (body, max) => {
  const out = {}
  for (const [name, v] of Object.entries(body && typeof body === 'object' ? body : {}).slice(0, max)) {
    const key = [...String(name)].filter((c) => c.charCodeAt(0) >= 32).join('').trim().slice(0, 80)
    if (key) out[key] = cleanValues(v)
  }
  return out
}
function readPresets() {
  try {
    const f = JSON.parse(fs.readFileSync(WINAMP_PRESETS_FILE, 'utf8'))
    return { presets: cleanSet(f.presets, 60), auto: cleanSet(f.auto, 300), default: f.default ? cleanValues(f.default) : null }
  } catch {
    return { presets: {}, auto: {}, default: null }
  }
}
app.get('/winamp/presets', (_req, res) => res.json(readPresets()))
app.post('/winamp/presets', (req, res) => {
  const b = req.body ?? {}
  const set = { presets: cleanSet(b.presets, 60), auto: cleanSet(b.auto, 300), default: b.default ? cleanValues(b.default) : null }
  fs.writeFile(WINAMP_PRESETS_FILE, JSON.stringify(set), (err) => (err ? res.status(500).json({ error: 'write_failed' }) : res.json({ ok: true })))
})

// --- Extensions (docs/extensions.md) ---
// Files that extensions bring along (~/.mupibox/data/extensions/<id>/player.js) are loaded here: they add routes (/ext/<id>/...), listen to
// what the player does and may be the source of albums that are no folders - the player asks them where it has a folder name
// (albumFor). The audio CD is such an extension. An error in one of them is caught and switches it off, not the player.
const extensions = createExtensionHost({
  app,
  log: {
    debug: (text) => log.debug(`${now()}: [Spotify Control] ${text}`),
    info: (text) => log.info(`${now()}: [Spotify Control] ${text}`),
    warn: (text) => console.warn(`${now()}: [Spotify Control] ${text}`),
  },
  getConfig: () => redactSecrets(muPiBoxConfig ?? {}),
  getMeta: () => currentMeta,
  engine: {
    command: (command) => (typeof player.command === 'function' ? player.command(command) : Promise.resolve(null)),
    playEntries: (entries) => player.playEntries?.(entries),
    setVolume: (percent) => player.setVolume(percent),
    startVolume: () => volumeStart,
    trackIndex: () => player.trackIndex?.() ?? -1,
  },
  stop: () => stop(),
  generation: () => playbackGeneration,
})
extensions.load()

/** The album that plays, when its folder name is an extension's (the audio CD), else undefined. */
const albumNow = () => extensions.albumFor(currentMeta.path)

// An album of an extension starts: it puts its tracks in mpv's playlist (host.engine.playEntries) and says what it is; the rest -
// counting, the volume, the state - is as for a folder. Nothing to play (no disc): nothing changes.
async function playAlbumProvider(album) {
  playbackGeneration++
  currentMeta.trackFile = undefined
  clearLibraryResumeTimers()
  const started = await album.play()
  if (!started) return
  writeplayerstatePlay()
  player.setVolume(volumeStart)
  currentMeta.currentTracknr = 0
  currentMeta.path = album.folder
  if (started.album) currentMeta.album = started.album
  if (started.totalTracks) currentMeta.totalTracks = started.totalTracks
}

// --- The queue: the Winamp playlist window edits what plays ---
// The playlist of a local album (a folder of the library) or of a NAS album is mpv's own playlist; the display's Winamp playlist
// window selects entries, removes them (remove, crop, new list), sorts them, adds a folder (of the library, or of the NAS) and
// saves and loads lists (queue.js has the logic around it). Nothing here touches a file or a folder, on the box or on the NAS:
// only what is queued changes. An audio CD, a CUE album of the NAS, TIDAL and Spotify have no such queue (their lists are not
// files); /queue says so (editable: false). A queue holds files of one kind: the library's, or the NAS's.
const MEDIA_ROOT = '/home/dietpi/MuPiBox/media'
const NAS_PREFIX = 'nas:' // (in a path of the folder browser and in a saved list: a path on the NAS)
const queueLists = Q.createListStore('/home/dietpi/.mupibox/winamp-lists')

// The tracks of the NAS, by their path: kept from every NAS list that was played or added, so the names of a queue that was
// sorted or cut down are known (the playlist of mpv holds only the stream addresses)
const nasTrackByPath = new Map()
const rememberNasTracks = (tracks) => {
  for (const track of tracks) if (track?.path) nasTrackByPath.set(track.path, track)
}
const nasStreamUrl = (track) => {
  const url = `http://localhost:8200/api/nas/stream?path=${encodeURIComponent(track.path)}`
  return /\.wma$/i.test(track.path) ? `ffmpeg://${url}` : url
}

/** 'local', 'nas', or null: what kind of queue plays now (null - nothing, a CD, a CUE album, TIDAL, Spotify: no queue to edit) */
function queueKind() {
  if (currentMeta.currentPlayer !== 'mplayer' || typeof player.list !== 'object') return null
  if (currentMeta.currentType === 'local' && !albumNow()) return 'local'
  if (currentMeta.currentType === 'nas' && currentCue === null) return 'nas'
  return null
}
const queueEditable = () => queueKind() !== null

/** [{ position, id, file, source, name, current }] of the playlist as it is now; null when mpv did not answer */
async function queueEntries() {
  const entries = await player.list.entries()
  if (!entries) return null
  return entries.map((e, i) => {
    const source = Q.describeSource(e.filename, MEDIA_ROOT)
    const nas = nasTrackByPath.get(source.full)
    return { position: i + 1, id: e.id, file: e.filename, source, name: nas ? String(nas.name).replace(/\.[^./]+$/, '') : Q.nameOfFile(source.full), current: e.current }
  })
}

// After an edit: the player's own count and place follow the playlist (the next track change would only tell it later); a NAS
// queue's track list (the names the player shows) is put in the order of the playlist
async function queueFollowEdit() {
  const entries = await queueEntries()
  if (!entries) return null
  currentMeta.totalTracks = entries.length
  const at = entries.findIndex((e) => e.current)
  if (at >= 0) currentMeta.currentTracknr = at + 1
  if (currentMeta.currentType === 'nas') currentNasTracks = entries.map((e) => nasTrackByPath.get(e.source.full) ?? { path: e.source.full, name: e.source.file })
  return entries
}

const queueNotEditable = (res) => res.status(409).json({ ok: false, error: 'not editable' })

app.get('/queue', async (_req, res) => {
  if (!queueEditable()) return res.json({ editable: false, entries: [] })
  const entries = await queueEntries()
  if (!entries) return res.json({ editable: false, entries: [] })
  res.json({ editable: true, current: entries.findIndex((e) => e.current) + 1, entries: entries.map(({ position, name, source }) => ({ position, name, file: source.file })) })
})

// remove the entries at ?pos=1,3 (1-based, as the display counts), or everything else (crop)
for (const [route, keepChosen] of [['remove', false], ['crop', true]]) {
  app.get(`/queue/${route}`, async (req, res) => {
    if (!queueEditable()) return queueNotEditable(res)
    const entries = await queueEntries()
    if (!entries) return res.status(503).json({ ok: false })
    const chosen = Q.indexesOf(req.query.pos, entries.length)
    const gone = keepChosen ? Q.others(chosen, entries.length) : chosen
    if (gone.length >= entries.length || gone.length === 0) {
      // (nothing chosen, or everything: the list is not emptied by accident - "new list" does that)
      return res.json({ ok: gone.length === 0, removed: 0 })
    }
    await player.list.remove(gone)
    await queueFollowEdit()
    res.json({ ok: true, removed: gone.length })
  })
}

// sort: title, file, path, reverse, random - the entry that plays keeps playing (mpv moves entries, it does not restart them)
app.get('/queue/sort/:mode', async (req, res) => {
  if (!queueEditable()) return queueNotEditable(res)
  const entries = await queueEntries()
  if (!entries) return res.status(503).json({ ok: false })
  let target
  try {
    // (the title of a NAS entry is the NAS's own name for it; the file and path are those on the NAS)
    target = Q.sortedIds(entries.map((e) => ({ id: e.id, filename: e.source.full, title: e.name })), req.params.mode)
  } catch {
    return res.status(400).json({ ok: false, error: 'unknown sort' })
  }
  for (const [from, to] of Q.movesFor(entries.map((e) => e.id), target)) await player.list.move(from, to)
  await queueFollowEdit()
  res.json({ ok: true })
})

// a new list: what plays stops, nothing is queued
app.get('/queue/new', async (_req, res) => {
  if (!queueEditable()) return queueNotEditable(res)
  const nas = currentMeta.currentType === 'nas'
  stop()
  await new Promise((resolve) => setTimeout(resolve, 300))
  await player.list.clear()
  if (nas) currentNasTracks = []
  currentMeta.totalTracks = 0
  currentMeta.currentTracknr = 0
  res.json({ ok: true })
})

// ---- the folders to add from: the library's, or the NAS's (a path that starts with "nas:") ----

// the NAS's own lists (the box's backend API; they cost a call to the NAS): the folders shown on the box, or the ones below a folder
async function nasFolders(nasPath, ms = 25000) {
  const url = nasPath ? `http://localhost:8200/api/nas/children?path=${encodeURIComponent(nasPath)}` : 'http://localhost:8200/api/nas/artists?expand=1'
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ms) })
    const list = response.ok ? await response.json() : null
    if (!Array.isArray(list)) return null
    return list
      .filter((entry) => entry?.nasPath)
      .map((entry) => ({ name: String(entry.title || entry.artist || path.posix.basename(entry.nasPath)), path: `${NAS_PREFIX}${entry.nasPath}`, audio: 0 }))
  } catch {
    return null
  }
}

// the audio tracks of a NAS folder, as the NAS tab plays them (an album with a cue sheet is one file: it is not added)
async function nasFolderTracks(nasPath) {
  try {
    const response = await fetch(`http://localhost:8200/api/nas/tracklist?path=${encodeURIComponent(nasPath)}`, { signal: AbortSignal.timeout(25000) })
    const list = response.ok ? await response.json() : null
    return Array.isArray(list) ? list.filter((t) => t?.path && t.cue !== true) : []
  } catch {
    return []
  }
}

// the folders of the library to add from (?path= the folder, '' the library itself). A queue of the NAS adds from the NAS; with nothing
// queued the browser starts at the library and has the NAS (when it has folders to show) as a folder of its own.
app.get('/queue/dirs', async (req, res) => {
  const wanted = String(req.query.path ?? '')
  const kind = queueKind()
  if (wanted.startsWith(NAS_PREFIX) || (kind === 'nas' && wanted === '')) {
    const nasPath = wanted.slice(NAS_PREFIX.length)
    const folders = await nasFolders(nasPath)
    if (!folders) return res.status(502).json({ ok: false, error: 'NAS not reachable' })
    return res.json({ ok: true, path: wanted, audio: 0, canAdd: nasPath !== '', folders })
  }
  if (kind === 'nas') return res.status(409).json({ ok: false, error: 'not the same kind' })
  const listing = Q.listFolders(MEDIA_ROOT, wanted)
  if (!listing) return res.status(404).json({ ok: false })
  // (the library's root holds the three categories - the other folders there are the box's own: covers, the NAS copy, downloads)
  if (wanted === '') listing.folders = listing.folders.filter((f) => ['audiobook', 'music', 'other'].includes(f.name))
  if (wanted === '' && kind === null && (await nasFolders('', 4000))?.length) listing.folders.push({ name: 'NAS', path: NAS_PREFIX, audio: 0 })
  res.json({ ok: true, ...listing, canAdd: listing.audio > 0 })
})

// the audio files directly in ?path= are queued after the last entry (an empty queue: they start playing)
app.get('/queue/add', async (req, res) => {
  const wanted = String(req.query.path ?? '')
  if (typeof player.list !== 'object') return res.status(409).json({ ok: false })
  const kind = queueKind()
  if (wanted.startsWith(NAS_PREFIX)) {
    const nasPath = wanted.slice(NAS_PREFIX.length)
    if (!nasPath) return res.status(400).json({ ok: false })
    if (kind === 'local') return res.status(409).json({ ok: false, error: 'not the same kind' })
    if (kind === null) {
      // nothing queued: the folder plays as an album of the NAS does (its list is asked for, the start held while paused, ...)
      switchToMplayer()
      currentMeta.currentType = 'nas'
      await playNasList(encodeURIComponent(nasPath))
      return res.json({ ok: true })
    }
    const tracks = await nasFolderTracks(nasPath)
    if (tracks.length === 0) return res.status(404).json({ ok: false, error: 'no audio there' })
    rememberNasTracks(tracks)
    await player.list.append(tracks.map(nasStreamUrl))
    await queueFollowEdit()
    return res.json({ ok: true, added: tracks.length })
  }
  if (kind === 'nas') return res.status(409).json({ ok: false, error: 'not the same kind' })
  const files = Q.audioFilesIn(MEDIA_ROOT, wanted)
  if (!files || files.length === 0) return res.status(404).json({ ok: false, error: 'no audio there' })
  if (kind === 'local') {
    await player.list.append(files)
    await queueFollowEdit()
  } else {
    await playQueueFiles(files, wanted)
  }
  res.json({ ok: true, added: files.length })
})

// these files are the playlist and play from the first (a folder added to an empty queue, a loaded list)
async function playQueueFiles(files, label) {
  playbackGeneration++
  playbackRequest++
  playbackOrigin = playbackRequest
  resetLocalShuffle()
  clearLibraryResumeTimers()
  switchToMplayer()
  currentCue = null
  currentMeta.currentType = 'local'
  currentMeta.trackFile = undefined
  currentMeta.finished = false
  currentMeta.pause = false
  currentMeta.currentTracknr = 0
  currentMeta.path = label
  currentMeta.totalTracks = files.length
  writeplayerstatePlay()
  await player.list.replace(files)
  player.setVolume(volumeStart)
}

// the same for tracks of the NAS (a loaded list of the NAS)
async function playQueueNas(tracks, label) {
  playbackGeneration++
  playbackRequest++
  playbackOrigin = playbackRequest
  resetLocalShuffle()
  clearLibraryResumeTimers()
  switchToMplayer()
  currentCue = null
  rememberNasTracks(tracks)
  currentNasTracks = tracks
  currentMeta.currentType = 'nas'
  currentMeta.trackFile = undefined
  currentMeta.finished = false
  currentMeta.pause = false
  currentMeta.currentTracknr = 0
  currentMeta.path = label
  currentMeta.album = label
  currentMeta.totalTracks = tracks.length
  currentMeta.currentTrackname = String(tracks[0]?.name ?? label).replace(/\.[^./]+$/, '')
  writeplayerstatePlay()
  await player.list.replace(tracks.map(nasStreamUrl))
  player.setVolume(volumeStart)
}

// save the queue under a name (?name=; without one: the album and the day). A NAS queue is saved as paths on the NAS.
app.get('/queue/save', async (req, res) => {
  if (!queueEditable()) return queueNotEditable(res)
  const entries = await queueEntries()
  if (!entries || entries.length === 0) return res.status(409).json({ ok: false, error: 'nothing to save' })
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')
  const fallback = `${String(currentMeta.album || 'List').replace(/[^\p{L}\p{N} ._()-]/gu, ' ').trim().slice(0, 40) || 'List'} ${stamp}`
  const nas = currentMeta.currentType === 'nas'
  const name = queueLists.save(req.query.name ?? fallback, entries.map((e) => (nas ? `${NAS_PREFIX}${e.source.full}` : e.file)))
  if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
  res.json({ ok: true, name })
})

app.get('/queue/lists', (_req, res) => res.json({ ok: true, lists: queueLists.list() }))

app.get('/queue/load', async (req, res) => {
  const saved = queueLists.load(req.query.name) ?? []
  if (typeof player.list !== 'object') return res.status(409).json({ ok: false })
  if (saved[0]?.startsWith(NAS_PREFIX)) {
    // (a list of the NAS: its tracks - a track the NAS does not have any more is skipped by mpv when it comes to it)
    const tracks = saved.filter((f) => f.startsWith(NAS_PREFIX)).map((f) => f.slice(NAS_PREFIX.length)).map((p) => nasTrackByPath.get(p) ?? { path: p, name: path.posix.basename(p) })
    await playQueueNas(tracks, String(req.query.name))
    return res.json({ ok: true, count: tracks.length })
  }
  // (a file that is gone from the box is left out of the list)
  const files = saved.filter((f) => f.startsWith(`${MEDIA_ROOT}/`) && !f.includes('..') && fs.existsSync(f))
  if (files.length === 0) return res.status(404).json({ ok: false, error: 'list not found or empty' })
  await playQueueFiles(files, String(req.query.name))
  res.json({ ok: true, count: files.length })
})

app.get('/queue/deletelist', (req, res) => res.json({ ok: queueLists.remove(req.query.name) }))

// what is known of the entry at ?pos=
app.get('/queue/info', async (req, res) => {
  const entries = await queueEntries()
  const entry = entries?.[Q.indexesOf(req.query.pos, entries?.length ?? 0)[0]]
  if (!entry) return res.status(404).json({ ok: false })
  let size = 0
  if (entry.source.inLibrary) {
    try {
      size = fs.statSync(entry.source.full).size
    } catch {
      // gone
    }
  }
  res.json({ ok: true, position: entry.position, name: entry.name, file: entry.source.file, folder: entry.source.folder, size, extension: entry.source.extension })
})

/*endpoint to return all local metainformation*/
/*only used if sonos-kids-player is modified*/
app.get('/local', (_req, res) => {
  // Frische Object-Komposition statt res.send(currentMeta) — Express
  // setzt sonst einen ETag/Content-Length aus dem initialen Object-Shape
  // und neue Felder (triggerSource/triggerAt aus Phase 19 Stufe B)
  // landen nicht in der Response, obwohl die Mutationen am Objekt
  // ankommen.
  // (generation: which start this is - a stop of the display's background playback names it, see ?gen=)
  res.json({ ...currentMeta, generation: playbackRequest, origin: playbackOrigin, shuffleSupported: typeof player.setShuffle === 'function' })
})

app.get('/spotify/token', (_req, res) => {
  const accessTokenData = apiAccessToken
  const refreshToken = refreshTokenApi

  if (accessTokenData.accessToken !== null && accessTokenData.expires > Date.now()) {
    res.send(accessTokenData.accessToken)
  } else {
    refreshToken()
      .then(() => res.send(accessTokenData.accessToken))
      .catch((err) => res.status(500).send(`Error refreshing token: ${err}`))
  }
})

/*returns the track list of a local library album, read live from its folder*/
app.get('/local/tracklist/:encoded', (req, res) => {
  const playedTitelmod = decodeURI(req.params.encoded).replace(/:/g, '/')
  if (playedTitelmod.split('/').includes('..')) {
    res.status(400).json({ error: 'invalid path' })
    return
  }
  const album = extensions.albumFor(playedTitelmod)
  if (album?.tracklist) {
    res.json(album.tracklist())
    return
  }

  let files
  try {
    files = listLocalAudioFiles(`/home/dietpi/MuPiBox/media/${playedTitelmod}`)
  } catch (_err) {
    res.status(404).json({ error: 'album folder not found' })
    return
  }

  const tracks = files.map((filename, index) => {
    const nameWithoutExt = filename.replace(/\.[^./]+$/, '')
    const title = nameWithoutExt.replace(/^\d+\s*[-._]?\s*/, '') || nameWithoutExt
    return { position: index + 1, name: title }
  })

  res.json(tracks)
})

/*returns the track list of a NAS folder, listed live from the NAS (no local cache)*/
app.get('/nas/tracklist/:encoded', async (req, res) => {
  const nasPath = decodeURIComponent(req.params.encoded)

  try {
    const response = await fetch(`http://localhost:8200/api/nas/tracklist?path=${encodeURIComponent(nasPath)}`)
    const tracks = await response.json()
    res.json((tracks ?? []).map((track) => ({ position: track.position, name: track.name.replace(/\.[^./]+$/, '') })))
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Error fetching NAS tracklist for ${nasPath}: ${error}`)
    res.status(502).json({ error: 'tracklist not available' })
  }
})

/*returns the track list of a TIDAL album or playlist (<album|playlist>:<id>), from the box's TIDAL service*/
app.get('/tidal/tracklist/:ref', async (req, res) => {
  const [kind, id] = String(req.params.ref).split(':')
  if (!['album', 'playlist'].includes(kind) || !/^[A-Za-z0-9-]{1,64}$/.test(id ?? '')) {
    res.status(400).json({ error: 'invalid list' })
    return
  }
  // the list that plays: as mpv has it (tidaltrack:N jumps by position) - asked anew, a playlist changed on TIDAL since
  // its start (a track added in front) would put every pick one track off
  if (currentMeta.currentType === 'tidal' && currentMeta.path === `${kind}:${id}` && currentTidalTracks.length > 0) {
    res.json(currentTidalTracks.map((track, i) => ({ position: i + 1, name: track.name })))
    return
  }
  try {
    const response = await fetch(`${TIDAL_SERVICE}/tracks?kind=${kind}&id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(45000) })
    const body = response.ok ? await response.json() : null
    if (!Array.isArray(body?.list)) {
      res.status(response.status === 401 ? 401 : 502).json({ error: 'tracklist not available' })
      return
    }
    res.json(body.list.map((track) => ({ position: track.number, name: track.name })))
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Error fetching TIDAL tracklist for ${kind}:${id}: ${error}`)
    res.status(502).json({ error: 'tracklist not available' })
  }
})

/*returns the albums of a TIDAL artist (a whole artist in the library: the display lists them), from the box's TIDAL service*/
app.get('/tidal/artist/:id/albums', async (req, res) => {
  const id = String(req.params.id)
  if (!/^\d{1,15}$/.test(id)) {
    res.status(400).json({ error: 'invalid artist' })
    return
  }
  try {
    // (the entry's range and left-out albums - see tidal_service.py narrowed)
    const q = new URLSearchParams()
    for (const k of ['from', 'to']) if (typeof req.query[k] === 'string' && /^\d{1,5}$/.test(req.query[k])) q.set(k, req.query[k])
    if (typeof req.query.exclude === 'string' && /^\d{1,15}(,\d{1,15}){0,499}$/.test(req.query.exclude)) q.set('exclude', req.query.exclude)
    if (req.query.by === 'number') q.set('by', 'number')
    const response = await fetch(`${TIDAL_SERVICE}/artist/${id}/albums${q.size ? `?${q}` : ''}`, { signal: AbortSignal.timeout(45000) })
    const body = response.ok ? await response.json() : null
    if (!Array.isArray(body?.albums)) {
      res.status(response.status === 401 ? 401 : 502).json({ error: 'albums not available' })
      return
    }
    // (the full date too: "Älteste zuerst" of an entry orders the episodes of one year by it)
    res.json({ albums: body.albums.map((a) => ({ id: a.id, name: a.name, cover: a.cover ?? null, year: a.year ?? null, date: typeof a.date === 'string' && /^\d{4}(-\d\d){0,2}$/.test(a.date) ? a.date : null })) })
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Error fetching TIDAL albums of artist ${id}: ${error}`)
    res.status(502).json({ error: 'albums not available' })
  }
})

/*sonos-kids-controller sends commands via http get and uses path names for encoding*/
/*commands are as defined in sonos-kids-controller and mapped spotify calls*/
// The pause for names read out (speech.ts playName, "Anhalten"): the backend pauses what plays for a row of names and
// lets it go on after the last one - only if it is still its pause. Asked and done here in one step (the backend
// checked the last command first and sent play afterwards: a pause from the display in between was undone). Any other
// command (display, app, Telegram) takes the pause over; names read out and announcements do not (see the command
// handler below). token: which pause - the backend's own number for it (it knows it even when this answer gets lost),
// 0 = none of the backend's.
let speechPauseToken = 0
app.get('/speechpause', (req, res) => {
  const token = Number(req.query.token)
  if (!Number.isSafeInteger(token) || token <= 0) return res.status(400).json({ paused: false })
  if (!isActuallyPlaying()) return res.json({ paused: false })
  pause()
  speechPauseToken = token
  res.json({ paused: true })
})
app.get('/speechresume', (req, res) => {
  const token = Number(req.query.token)
  if (!token || token !== speechPauseToken) return res.json({ resumed: false })
  speechPauseToken = 0
  // (playtime over or a quiet time began meanwhile: it stays paused, as a play would be refused)
  if (isPlaybackBlocked()) return res.json({ resumed: false, blocked: true })
  play()
  res.json({ resumed: true })
})

app.use((req, res) => {
  // Phase 19 Stufe B: Quelle aus optionalem ?src=... Query lesen.
  // path.parse() ignoriert Query nicht — parsen wir vorher mit URL().
  // Base-URL ist irrelevant, sie wird nur vom URL-Constructor verlangt.
  let pathname = req.url
  let triggerSource = 'box'
  let triggerCover = ''
  // the tile of the start page what starts belongs to (5.1, see "Tile time")
  let triggerTile = null
  // what of the library starts, for the ticks of what was heard (5.1, see "Heard")
  let triggerHeard = null
  try {
    const u = new URL(req.url, 'http://localhost')
    pathname = u.pathname
    const tile = u.searchParams.get('tile')
    if (tile && TILE_KEY.test(tile)) triggerTile = tile
    const heard = u.searchParams.get('heard')
    if (heard && HEARD_KEY.test(heard)) triggerHeard = heard
    const src = u.searchParams.get('src')
    if (src && /^[a-z0-9_-]{1,20}$/i.test(src)) triggerSource = src
    // (an announcement pauses the music and goes on afterwards: no start - the display jumped to the big player after
    // every announcement, away from where the child was looking for something)
    if (triggerSource === 'speech') triggerSource = null
    // (a name read out is no command either - the display sends it as /<device>/say/<name>: every name of a row counted
    // as one and the music paused for the names did not go on, see /speechpause)
    if (/\/say\//.test(u.pathname)) triggerSource = null
    // (only a picture address of the box's own API or of the web - it lands in an <img> on the display)
    const cover = u.searchParams.get('cover') ?? ''
    if (cover.length < 2000 && /^(\/api\/|https?:\/\/)/.test(cover)) triggerCover = cover
  } catch {
    /* malformed — bleibt 'box', pathname bleibt req.url */
  }
  if (triggerSource !== null) {
    // (louder, quieter, a jump within the track, shuffle, repeat, pause, stop: nothing new plays - a button or the rotary
    // encoder pressed while the child browsed the library took the display to the player at every press)
    if (!/\/(?:[+-]\d{1,2}|=\d{1,3}|seek[+-]\d+|seekpos:[^/]*|shuffle(?:on|off)|repeat(?:on|off)|pause|stop|shutoff)$/.test(pathname)) {
      currentMeta.triggerSource = triggerSource
      currentMeta.triggerAt = Date.now()
    }
    // (a command of the display, the app, Telegram …: the pause for names read out is not the backend's any more)
    speechPauseToken = 0
  }

  const command = path.parse(pathname)
  log.debug(`${now()}: [Spotify Control]name: ${command.name}`)
  log.debug(`${now()}: [Spotify Control]dir: ${command.dir}`)

  // Playtime / Quiet-Hours: refuse new playback when either is restricting.
  // Pause/stop/volume/system commands fall through normally.
  if (isPlaybackBlocked() && isPlayInitiatingCommand(command)) {
    const inQuiet = quietHoursState.state !== 'normal'
    const reason = inQuiet ? 'quiet_hours_active' : 'playtime_limit_reached'
    const tag = inQuiet ? 'QuietHours' : 'Playtime'
    console.log(
      `${new Date().toLocaleString()}: [${tag}] Rejected command (${reason}): name=${command.name} dir=${command.dir}`,
    )
    res.status(423).send({ status: 'blocked', error: reason })
    return
  }

  // Tile time: a start of something new names its tile (or none: it counts for the listening time only); play, next,
  // previous, seek go on with the current one. Its time used up (or what plays of it finishing in its grace period): refused.
  const newStart = command.name.includes('spotify:') || ['library', 'nas', 'tidal', 'radio', 'rss'].some((s) => hasDirSegment(command, s))
  if (isPlayInitiatingCommand(command) && !hasDirSegment(command, 'say')) {
    const tile = newStart ? resolveTile(triggerTile) : tileState.current
    const inGrace = tile !== null && tile === tileState.current && tileState.state === 'grace' && !isAllowOverrideActive()
    if (tile && (tileUsedUp(tile) || inGrace)) {
      console.log(`${new Date().toLocaleString()}: [TileTime] Rejected command (tile_limit_reached ${tile}): name=${command.name} dir=${command.dir}`)
      res.status(423).send({ status: 'blocked', error: 'tile_limit_reached', tile })
      return
    }
  }

  // A Spotify start while Spotify blocks the requests: refused before anything changes (the pause flag of what was
  // paused was cleared first - it counted as playing) and said so
  if (command.name.includes('spotify:') && spotifyBlockedUntil()) {
    log.debug(`${now()}: [Spotify Control] Spotify start refused: Spotify blocks the requests`)
    res.status(503).send({ status: 'blocked', error: 'spotify_blocked' })
    return
  }
  // A command for one playback only (?gen=, see /local): another one started meanwhile - the display's background stop
  // stopped it, and kept its place under the album before
  const onlyFor = (() => {
    try {
      return new URL(req.url, 'http://localhost').searchParams.get('gen')
    } catch {
      return null
    }
  })()
  if (onlyFor !== null && Number(onlyFor) !== playbackRequest) {
    log.debug(`${now()}: [Spotify Control] ${command.name} not made: for playback ${onlyFor}, now ${playbackRequest}`)
    res.status(409).send({ status: 'overtaken', error: 'another playback' })
    return
  }

  // A new playback starts unpaused and without the picture of the one before: a "pause" of the playback before stayed
  // set (the display showed the play button while the new one played), and a local or NAS album kept the episode
  // picture of a podcast played before it (radio and podcasts set their own below, Spotify brings its own).
  const newMedia = command.name.includes('spotify:') || ['library', 'nas', 'tidal', 'radio', 'rss'].some((segment) => hasDirSegment(command, segment))
  // (the tile of what starts now - only here, once the start is not refused any more: a Spotify start refused while
  // Spotify blocks the box left what played counting for the other tile)
  if (newStart && isPlayInitiatingCommand(command) && !hasDirSegment(command, 'say')) setCurrentTile(triggerTile)
  if (newMedia) {
    resetLocalShuffle()
    playbackRequest++
    if (triggerSource !== 'skip') playbackOrigin = playbackRequest
    startHeard(triggerHeard)
    currentMeta.pause = false
    if (['library', 'nas', 'tidal'].some((segment) => hasDirSegment(command, segment))) currentMeta.cover = triggerCover
  }

  /*this is the first command to be received. It always includes the device id encoded in between two /*/
  /*check this if we need to transfer the playback to a new device*/
  if (command.name.includes('spotify:')) {
    useSpotify(command)
  }

  if (hasDirSegment(command, 'library')) {
    switchToMplayer()
    currentMeta.currentType = 'local'
    // /musicsearch/library/resume/<cat:artist:title:trackNr:progressPct>
    // Falls back to plain playList() if the suffix doesn't parse — this
    // keeps the route forward-safe if the frontend ever sends a malformed
    // resume URL, and isn't a regression because the only writer of this
    // path is player.service.resumeLibraryMedia.
    // playList() takes command.base since 5.0.0; only the resume suffix is
    // parsed out of command.name.
    if (hasDirSegment(command, 'resume')) {
      // command.base, not command.name: path.parse() takes everything after the last dot as an
      // extension, so a title like "Vol. 2" lost its end and the resume fell back to playing
      // "<folder>:<track>:<pct>" as a folder name - nothing played. The folder has at least two
      // segments (category + album of a live library entry; older entries are cat:artist:title).
      const parts = command.base.split(':')
      const progressPct = Number.parseFloat(parts[parts.length - 1])
      const trackNr = Number.parseInt(parts[parts.length - 2], 10)
      if (parts.length >= 4 && Number.isFinite(progressPct) && Number.isFinite(trackNr) && trackNr >= 1) {
        playListAtTrack(parts.slice(0, parts.length - 2).join(':'), trackNr, progressPct)
      } else {
        playList(command.base)
      }
    } else {
      playList(command.base)
    }
  }

  if (hasDirSegment(command, 'nas')) {
    switchToMplayer()
    currentMeta.currentType = 'nas'
    // /musicsearch/nas/resume/<encoded path>:<trackNr>:<progressPct> (the path is encoded: no ":" of its own)
    const parts = hasDirSegment(command, 'resume') ? command.base.split(':') : []
    const trackNr = Number.parseInt(parts[1], 10)
    const progressPct = Number.parseFloat(parts[2])
    if (parts.length === 3 && trackNr >= 1 && Number.isFinite(progressPct)) playNasList(parts[0], { trackNr, progressPct })
    else playNasList(command.base)
  }

  if (hasDirSegment(command, 'tidal')) {
    switchToMplayer()
    currentMeta.currentType = 'tidal'
    // /musicsearch/tidal/<album|playlist>:<id>, to go on: /musicsearch/tidal/resume/<album|playlist>:<id>:<trackNr>:<progressPct>
    const parts = command.base.split(':')
    const trackNr = Number.parseInt(parts[2], 10)
    const progressPct = Number.parseFloat(parts[3])
    if (hasDirSegment(command, 'resume') && parts.length === 4 && trackNr >= 1 && Number.isFinite(progressPct)) {
      playTidalList(`${parts[0]}:${parts[1]}`, { trackNr, progressPct })
    } else playTidalList(`${parts[0]}:${parts[1]}`)
  }

  if (hasDirSegment(command, 'radio')) {
    switchToMplayer()
    currentMeta.currentType = 'radio'
    currentMeta.cover = triggerCover
    const parts = decodeURIComponent(command.base).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1]
    const dir = command.dir
    let radioURL = dir.split('radio/').pop()
    radioURL = decodeURIComponent(radioURL)
    playRadioURL(radioURL)
    currentMeta.path = '' // (not the last local album's folder, see the rss command)
    currentMeta.episode = ''
  }

  if (hasDirSegment(command, 'rss')) {
    switchToMplayer()
    currentMeta.currentType = 'rss'
    currentMeta.cover = triggerCover
    // (command.base, not command.name: path.parse() took everything after the last dot as an extension - "Folge 12. Der
    // Dachs" became "Folge 12" and the podcast's name was gone; the display builds its player page from these since
    // "next" at an episode)
    const parts = decodeURIComponent(command.base).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1] ?? ''
    const dir = command.dir
    let rssURL = dir.split('rss/').pop()
    rssURL = decodeURIComponent(rssURL)
    // the episode's address is the id the display knows it by (rssfeed.service: id = enclosure url) - the display's
    // player page needs it when the episode was started from the parents' app (it builds its media from /local);
    // the path of the last local album must not stay here - it was read as the podcast's artist
    currentMeta.episode = rssURL
    currentMeta.path = ''
    playURL(offlineEpisodeFile(rssURL) ?? rssURL, startEpisode(rssURL))
    episodeRun = { url: rssURL, generation: playbackGeneration, retries: 0 }
  }

  if (hasDirSegment(command, 'say')) {
    const dir = command.dir
    let nameTTS = dir.split('say/').pop()
    nameTTS = decodeURIComponent(nameTTS)
    nameTTS = nameTTS.replace(/\//g, ' ')
    log.debug(`${now()}: [Spotify Control] Say: ${nameTTS}`)
    sayName(nameTTS).catch((err) => console.error(err))
  }

  if (hasDirSegment(command, 'deletelocal')) {
    deleteLocal(command.name)
  } else if (command.name === 'pause') pause()
  else if (command.name === 'play') play()
  else if (command.name === 'stop') stop()
  else if (command.name === 'next') next()
  else if (command.name === 'previous') previous()
  else if (command.name === 'replay') replay()
  else if (/^[+-]\d{1,2}$/.test(command.name)) {
    // +5 / -5 as before; other steps (1..10) come from the rotary encoder
    const step = Math.min(10, Math.max(1, Math.abs(Number.parseInt(command.name, 10))))
    setVolume(command.name.startsWith('+') ? 1 : 0, step)
  }
  else if (/^=\d{1,3}$/.test(command.name)) setVolumeTo(Number.parseInt(command.name.slice(1), 10))
  else if (command.name === 'repeaton' || command.name === 'repeatoff') {
    // (mpv: the playlist loops; with mplayer nothing changes and the button shows it)
    currentMeta.repeat = command.name === 'repeaton' && typeof player.setRepeat === 'function'
    player.setRepeat?.(command.name === 'repeaton')
  }
  else if (command.name === 'shuffleon') shuffleon()
  else if (command.name === 'shuffleoff') shuffleoff()
  else if (command.name === 'shutoff') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./shutdown.sh &"')
  else if (command.name === 'clearresume') cmdCall('sudo bash /usr/local/bin/mupibox/clearresume.sh')
  else if (command.name === 'maxresume') cmdCall('sudo bash /usr/local/bin/mupibox/remove_max_resume.sh')
  else if (command.name === 'networkrestart') cmdCall('WIFI_IF=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh); sudo service ifup@$WIFI_IF stop && sudo service ifup@$WIFI_IF start')
  else if (command.name === 'reboot') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./restart.sh &"')
  else if (command.name === 'index') cmdCall('sudo bash /usr/local/bin/mupibox/add_index.sh')
  else if (command.name === 'seek+30') seek(1)
  else if (command.name === 'seek-30') seek(0)
  else if (command.name.includes('seekpos:')) {
    const pos = command.name.split(':')[1]
    if (currentMeta.currentType === 'rss' && Date.now() - episodeResumedAt < 5000) {
      log.debug(`${now()}: [Spotify Control] seekpos ${pos} skipped: the episode already went on where it was left`)
    } else seek(pos)
  } else if (command.name === 'albumstop') cmdCall('bash /usr/local/bin/mupibox/albumstop.sh')
  else if (command.name === 'enablewifi')
    cmdCall(
      // (set_onboard_wifi.sh finds the boot configuration on every DietPi and takes only its own line out - this removed
      // the LAST line of /boot/config.txt, whatever it was)
      "sudo /usr/local/bin/mupibox/set_onboard_wifi.sh on && sudo su - -c '/usr/local/bin/mupibox/restart.sh &'",
    )

  else if (command.name.includes('localtrack:')) {
    const targetPosition = Number.parseInt(command.name.split(':')[1], 10)
    jumpToTrack(targetPosition)
  } else if (command.name.includes('nastrack:') || command.name.includes('tidaltrack:')) {
    const targetPosition = Number.parseInt(command.name.split(':')[1], 10)
    jumpToTrack(targetPosition)
  }

  const resp = { status: 'ok', error: 'none' }
  res.send(resp)
})

// Safety net like backend-api's: an unhandled rejection somewhere in the Spotify/mplayer code
// used to end the process (Node 22 default) - pm2 restarted it, but the running playback and all
// state in memory (grace periods, current album) were gone. Log it and keep playing.
process.on('unhandledRejection', (reason) => {
  console.error(`${now()}: [Spotify Control] Unhandled promise rejection:`, reason)
})

// On the box itself only (its display, the backend, the scripts, the Telegram bot call it on localhost): open to the
// whole network, anyone could start, stop or change what plays. IPv4 and IPv6 (localhost may resolve to ::1 first).
server.listen(config.server.port, '127.0.0.1')
http
  .createServer(app)
  .on('error', (err) => console.warn(`${now()}: [Spotify Control] no IPv6 loopback listener: ${err.message}`))
  .listen(config.server.port, '::1')
console.log(
  `${now()}: [mupibox-backend-player] Server started at http://localhost:${config.server.port}`,
)
