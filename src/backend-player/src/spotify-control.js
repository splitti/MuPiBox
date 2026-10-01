const express = require('express')
const http = require('node:http')
const bodyParser = require('body-parser')
const path = require('node:path')
const dns = require('node:dns')
const SpotifyWebApi = require('spotify-web-api-node')
const createPlayer = require('./mplayer-wrapper.js')
const { isPlaylistUrl, resolveStreamUrl } = require('./playlist-url.js')
const googleTTS = require('google-tts-api')
const fs = require('node:fs')
const childProcess = require('node:child_process')

// Force IPv4 for DNS lookups to avoid EAI_AGAIN errors on Raspberry Pi
// This fixes issues where IPv6 is misconfigured or not supported
dns.setDefaultResultOrder('ipv4first')

let configBasePath = './config'
//let networkConfigBasePath = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config'
if (process.env.NODE_ENV === 'development') {
  configBasePath = '../config'
  //networkConfigBasePath = '../../backend-api/config'
}

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
const player = createPlayer()

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
setInterval(refreshTokenLogged, 1000 * 60 * 60)

const apiAccessToken = {
  accessToken: null,
  expires: Date.now(),
}

player.on('percent_pos', (val) => {
  //console.log('track progress is', val);
  if (!isCuePlayback()) currentMeta.progressTime = val
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
  if (!isCuePlayback()) currentMeta.durationSeconds = val
})
player.on('time_pos', (seconds) => {
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
  console.log('track metadata is', val)
  //currentMeta.currentTracknr = parseInt(val.Comment?.split(',').pop(), 10);
  currentMeta.currentTracknr = currentMeta.currentTracknr + 1
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
// mplayer starts once cache-min percent of the cache are filled (see the wrapper).
const cachePrefillPercent = 10
let loadingTimer = null

function startLoading() {
  currentMeta.loading = true
  currentMeta.loadProgress = 0
  clearTimeout(loadingTimer)
  // Never leave the display waiting for ever (unreachable stream, stream ended, ...).
  loadingTimer = setTimeout(stopLoading, 90 * 1000)
}

function stopLoading() {
  clearTimeout(loadingTimer)
  currentMeta.loading = false
  currentMeta.loadProgress = 0
}

player.on('cache-fill', (percent) => {
  if (currentMeta.loading) {
    currentMeta.loadProgress = Math.min(100, Math.round((percent / cachePrefillPercent) * 100))
  }
})
player.on('track-change', stopLoading)
player.on('percent_pos', checkSilence)
player.on('time_pos', checkSilence)

//player.on('length', console.log)
//player.on('track-change', () => player.getProps(['length']))

player.on('filename', (val) => {
  console.log('track name is', val)
  if (!currentMeta.currentTrackname) {
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
  console.log('track path is', val)
  // A local file that plays (NAS: set from the track list, see 'metadata'): its embedded picture is shown.
  const mediaRoot = '/home/dietpi/MuPiBox/media/'
  if (currentMeta.currentType !== 'nas') {
    currentMeta.trackFile =
      typeof val === 'string' && val.startsWith(mediaRoot) ? `local:${val.slice(mediaRoot.length)}` : undefined
  }
  if (currentMeta.currentType !== 'rss' && currentMeta.currentType !== 'radio' && currentMeta.currentType !== 'nas') {
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
    finalizePlaytimeBlock('next track would start during grace period')
  }
  if (quietHoursState.state === 'grace' && quietHoursState.graceMode === 'track') {
    finalizeQuietHoursBlock('next track would start during grace period')
  }
}
player.on('track-change', graceSongBoundary)
player.on('playlist-finish', () => {
  if (playtimeState.state === 'grace') {
    finalizePlaytimeBlock('playlist finished during grace period')
  }
  if (quietHoursState.state === 'grace') {
    finalizeQuietHoursBlock('playlist finished during grace period')
  }
  // A podcast episode that ended long before its end: the connection to its server broke (mplayer takes that as
  // the end of the file) - it is opened again where it stopped
  if (reconnectEpisode()) return
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
  if (currentMeta.currentType !== 'local') return
  const rawPath = currentMeta.path
  if (!rawPath) return
  const parts = String(rawPath).split('/')
  if (parts.length < 3) return
  const body = JSON.stringify({
    type: 'library',
    artist: decodeURIComponent(parts[1]),
    title: decodeURIComponent(parts[2]),
  })
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
  currentTrackname: '',
  currentTracknr: 0,
  totalTracks: '',
  progressTime: '',
  // mplayer: playing time and length of the current track in seconds (0 = unknown, e.g. a radio stream)
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 0,
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
}
// Live tracklist (with real names) of the currently playing NAS folder, fetched
// once in playNasList() - used to name each track as it plays, since mplayer
// only ever sees the stream-proxy URL, not the real filename.
let currentNasTracks = []

// === Playtime Limit (daily listening cap) ===
// Per-weekday limit on active playback time. Configured in mupiboxconfig.json
// under "playtimeLimit". Working state lives in /tmp (tmpfs, no SD wear);
// a checkpoint on the SD card persists across reboots, written at most every 60s.
// Config changes require a player restart (consistent with other config in this file).
const PLAYTIME_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const PLAYTIME_DEFAULT_LIMITS = { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 }
const PLAYTIME_WORKING_PATH = '/tmp/playtime.json'
const PLAYTIME_CHECKPOINT_PATH = path.join(configBasePath, 'playtime-checkpoint.json')
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
  if (currentMeta.currentPlayer === 'spotify') return currentMeta.pause === false
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
    fs.writeFile(PLAYTIME_WORKING_PATH, JSON.stringify({ enabled: false }), () => {})
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
  }
  fs.writeFile(PLAYTIME_WORKING_PATH, JSON.stringify(payload), () => {})
}

function writePlaytimeCheckpoint() {
  const payload = {
    date: playtimeState.date,
    dayKey: playtimeState.dayKey,
    usedSeconds: playtimeState.usedSeconds,
  }
  fs.writeFile(PLAYTIME_CHECKPOINT_PATH, JSON.stringify(payload), (err) => {
    if (err) log.error(`${new Date().toLocaleString()}: [Playtime] Failed to write checkpoint:`, err)
  })
  playtimeLastCheckpointAt = Date.now()
  playtimeLastCheckpointSeconds = playtimeState.usedSeconds
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
function finalizePlaytimeBlock(reason) {
  if (isAllowOverrideActive()) return
  console.log(`${new Date().toLocaleString()}: [Playtime] Finalizing block (${reason})`)
  playtimeState.state = 'blocked'
  playtimeState.graceEndsAt = null
  // (faded out, not cut: see fadeOutThen)
  fadeOutThen(() => {
    try {
      stop()
    } catch (e) {
      console.error(`${new Date().toLocaleString()}: [Playtime] Error stopping playback:`, e)
    }
  })
  writePlaytimeCheckpoint()
  // Notify parents that today's listening time is up. telegram_send_message.py
  // loops over all configured chatIds, so both Family group and individual DMs
  // receive the message.
  if (hasConfiguredTelegram()) {
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py --key n_playtime_used_up')
  }
}

function finalizeQuietHoursBlock(reason) {
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
  fadeOutThen(() => {
    try {
      stop()
    } catch (e) {
      console.error(`${new Date().toLocaleString()}: [QuietHours] Error stopping playback:`, e)
    }
  })
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
const SPOTIFY_GRACE_MAX_MISSES = 3 // ~4.5 s
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
  if (playtimeState.state === 'grace') finalizePlaytimeBlock(reason)
  if (quietHoursState.state === 'grace') finalizeQuietHoursBlock(reason)
  spotifyGraceItemId = null
  spotifyGracePos = null
  spotifyGraceMisses = 0
}
// "stop" chosen: the player only waits to learn whether it is a podcast episode. If the Web API
// can't tell (error, expired token, rate limit), it stops instead of letting a song run for 30 min.
function spotifyGraceMissed(why) {
  spotifyGraceMisses++
  const waitingForKind =
    (playtimeState.state === 'grace' && playtimeState.stopUnlessEpisode) ||
    (quietHoursState.state === 'grace' && quietHoursState.stopUnlessEpisode)
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
  if (modes.length === 0) {
    spotifyGraceItemId = null
    spotifyGracePos = null
    spotifyGraceMisses = 0
    return
  }
  let mode = modes.includes('track') ? 'track' : 'album' // if both are in grace the stricter one counts
  spotifyGraceBusy = true
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
      if (playtimeState.state !== 'grace' && quietHoursState.state !== 'grace') {
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
    }
  } catch (e) {
    spotifyGraceMissed(String(e))
    // once per series of failures: the check runs every 1.5 s and the log is on the SD card
    if (spotifyGraceMisses === 1) log.warn(`${now()}: [Spotify Control] Grace check failed: ${e}`)
  } finally {
    spotifyGraceBusy = false
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
  if (['library', 'nas', 'radio', 'rss', 'say'].some((segment) => hasDirSegment(command, segment))) {
    return true
  }
  if (['play', 'next', 'previous', 'seek+30', 'seek-30'].includes(command.name)) return true
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
  // Increment counter only when actually playing
  if (isActuallyPlaying()) {
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
      quietGraceIdle = isActuallyPlaying() ? 0 : quietGraceIdle + 1
      if (quietHoursState.graceEndsAt !== null && Date.now() >= quietHoursState.graceEndsAt) {
        finalizeQuietHoursBlock(`grace safety limit reached (${quietHoursState.graceMode})`)
      } else if (quietGraceIdle >= GRACE_IDLE_LIMIT_S) {
        quietGraceIdle = 0
        finalizeQuietHoursBlock('nothing playing any more during the grace period')
      }
    }
    // 'blocked': stay blocked
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
  playtimeTickStep()
  quietHoursTickStep()
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
// (app, Telegram) - see backend-api eltern/spotify-auth-age.ts. The mark goes when a refresh works again.
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
  if (currentMeta.activeSpotifyId.includes('spotify:') && !spotifyRunning) {
    playMe()
  }
}

/*called in all error cases*/
/*token expired and no_device error are handled explicitly*/
function handleSpotifyError(err, from) {
  if (err?.body?.error?.status === 401) {
    log.debug(`${now()}: access token expired, refreshing...`)
    log.debug(`${now()}: Error from: ${from}`)
    counter.counterrorAccessToken++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      refreshTokenLogged()
    }
  } else if (err?.body?.error?.status === 400) {
    log.debug(`${now()}: invalid id`)
    log.debug(`${now()}: Error from: ${from}`)
    log.debug(`${now()}: ${err}`)
    counter.counterrorInvalidID++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      setActiveDevice()
    }
  } else if (err?.body?.error?.status === 429) {
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
    if (currentMeta.activeSpotifyId !== '0') {
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
    spotifyApi.play({ device_id: currentMeta.activeSpotifyId }).then(
      () => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Transfering playback play deviceID`)
        writeplayerstatePlay()
      },
      (err) => {
        log.debug(`${now()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'ack')
      },
    )
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

/*queries all devices and transfers playback to the first one discovered*/
function setActiveDevice() {
  // If activeDevice is not set, get available devices and use the first one
  if (!activeDevice || activeDevice === '') {
    spotifyApi.getMyDevices().then(
      (data) => {
        counter.countgetMyDevices++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        const availableDevices = data.body.devices
        if (availableDevices && availableDevices.length > 0) {
          activeDevice = availableDevices[0].id
          log.debug(`${now()}: [Spotify Control] Auto-selected device: ${activeDevice}`)
          // Now transfer playback to the selected device
          transferPlaybackToActiveDevice()
        } else {
          log.debug(`${now()}: [Spotify Control] No available devices found`)
        }
      },
      (err) => {
        log.debug(`${now()}: [Spotify Control] Error getting devices: ${err}`)
        handleSpotifyError(err, 'getMyDevices')
      },
    )
  } else {
    // activeDevice is already set, proceed with transfer
    transferPlaybackToActiveDevice()
  }
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

function pause() {
  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Pause"')
  currentMeta.pause = true
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Playback paused`)
        writeplayerstatePause()
      },
      (err) => {
        handleSpotifyError(err, 'pause')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.playing) {
      player.playPause()
      //currentMeta.playing = false;
      writeplayerstatePause()
    }
  }
}

// Bumped by every stop and every new playback start; an async start (NAS) that finds it changed
// after its awaits was overtaken and must not play.
let playbackGeneration = 0

// The two players don't know of each other: Spotify plays in the kiosk browser (Web Playback SDK), local
// media, radio, podcasts and the NAS in mplayer. The player only knew what was playing from its own state,
// which is empty after a restart of this process - a stop then stopped nothing, and a local album started
// while Spotify was still playing ran in parallel. So a switch always silences the other side.
function pauseSpotifyQuietly(why) {
  spotifyApi.pause().catch((err) => {
    // nothing playing on Spotify, no token, offline: fine here
    log.debug(`${now()}: [Spotify Control] Pause on ${why} not needed/possible: ${err?.statusCode ?? err}`)
  })
  spotifyRunning = false
}
function switchToMplayer() {
  if (currentMeta.currentPlayer !== 'mplayer') pauseSpotifyQuietly('switch to mplayer')
  currentMeta.currentPlayer = 'mplayer'
}

function stop() {
  playbackGeneration++
  clearLibraryResumeTimers()
  if (telegramPlaybackNotices())
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Stop"')
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${now()}: [Spotify Control] Playback stopped`)
        writeplayerstatePause()
      },
      (err) => {
        handleSpotifyError(err, 'stop')
      },
    )

    currentMeta.currentPlayer = ''
    currentMeta.activeSpotifyId = ''
    currentMeta.pause = false
    spotifyRunning = false
  } else if (currentMeta.currentPlayer === 'mplayer') {
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
    //currentMeta.playing = false;
    writeplayerstatePause()
    currentMeta.currentTrackname = ''
    currentMeta.progressTime = ''
    currentMeta.positionSeconds = 0
    currentMeta.durationSeconds = 0
    currentMeta.album = ''
    currentMeta.path = ''
    currentMeta.currentTracknr = ''
    currentMeta.totalTracks = ''
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
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.play().then(
      () => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
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
    if (!currentMeta.playing) {
      player.playPause()
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

function next() {
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.skipToNext().then(
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
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.skipToPrevious().then(
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

function shuffleon() {
  spotifyApi.setShuffle(true).then(
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
  spotifyApi.setShuffle(false).then(
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

// Spotify's play on the chosen device; when that device is gone (404: the display reported it, then its page
// was reloaded), once more without a device, i.e. on the currently active one - as before.
function playOnDevice(playOptions) {
  return spotifyApi.play(playOptions).catch((err) => {
    if (!playOptions.device_id || err?.statusCode !== 404) throw err
    log.debug(`${now()}: [Spotify Control] Device ${playOptions.device_id} not found, playing on the active device`)
    if (activeDevice === playOptions.device_id) activeDevice = null
    const { device_id: _gone, ...withoutDevice } = playOptions
    return spotifyApi.play(withoutDevice)
  })
}

function playMe() {
  log.debug(`${now()}: [Spotify Control] Spotify play ${currentMeta.activeSpotifyId}`)
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

function playList(playedList) {
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
  player.playList(`/home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
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

    writeplayerstatePlay()
    player.playList(tmpPlaylistPath)
    player.setVolume(volumeStart)
    currentMeta.currentTracknr = 0
    currentMeta.totalTracks = tracks.length
    if (resume) resumeNasAt(Math.min(resume.trackNr, tracks.length), resume.progressPct)
  } catch (error) {
    log.debug(`${now()}: [Spotify Control] Error starting NAS playback: ${error}`)
  }
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
      writeplayerstatePlay()
      player.play(b.file)
      player.setVolume(volumeStart)
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
  log.debug(`${now()}: [Spotify Control] Starting currentMeta.playing:${playedTitel}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.play(`/home/dietpi/MuPiBox/tts_files/${playedTitel}`)
  player.setVolume(volumeStart)
  log.debug(`${now()}: /home/dietpi/MuPiBox/tts_files/${playedTitel}`)
}

// A radio link may be a playlist (m3u / pls) instead of the stream itself: its FIRST stream is played (see
// playlist-url.js). The playlist is fetched first, so the start waits for it (a few seconds at most, the display shows
// the loading ring meanwhile); a stop or another start in that time wins. Everything else starts at once, as before.
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
const EPISODE_POSITIONS_FILE = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/episode-positions.json'
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
  playbackGeneration++
  startLoading()
  log.debug(`${now()}: [Spotify Control] Starting currentMeta.playing:${playedURL}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
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
  let currentProgress = 0
  let targetProgress = 0
  log.debug(`${now()}: [Spotify Control] Setting progress to ${progress}`)
  if (currentMeta.currentPlayer === 'spotify') {
    if (progress > 1) {
      spotifyApi.seek(progress).then(
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
          currentProgress = data.body.progress_ms
          log.debug(
            `${now()}: [Spotify Control]Current progress for active device is ${currentProgress}`,
          )
          if (progress) targetProgress = currentProgress + 30000
          else targetProgress = currentProgress - 30000
        })
        .then(
          () => {
            spotifyApi.seek(targetProgress).then(
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
      if (isCuePlayback()) {
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
  const on = await _execAsync('/usr/bin/pactl get-default-sink')
    .then(({ stdout }) => String(stdout).trim().startsWith('bluez_'))
    .catch(() => false)
  btAudio = { at: Date.now(), on }
  return on
}
async function volumeCap() {
  const mb = muPiBoxConfig.mupibox
  return Number.isInteger(mb.btMaxVolume) && (await bluetoothAudio()) ? mb.btMaxVolume : mb.maxVolume
}

/*gets available devices, searches for the active one and returns its volume*/
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
  playbackGeneration++
  if (currentMeta.currentPlayer !== 'spotify') {
    clearLibraryResumeTimers()
    player.stop() // local media, radio or a podcast may still be playing in mplayer
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
    // If that device is gone, playMe() tries once more without a device (see playOnDevice()).
    activeDevice = displaySpotifyDevice
    log.debug(`${now()}: [Spotify Control] No device in the request, using the display's: ${activeDevice}`)
  }

  currentMeta.activeSpotifyId = command.name
  playMe()
}

/*endpoint to return all spotify connect devices on the network*/
/*only used if sonos-kids-player is modified*/
app.get('/getDevices', (_req, res) => {
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
      handleSpotifyError(err, 'getMyDevicesHTTP')
    },
  )
})

/*endpoint transfer a playback to a specific device*/
/*only used if sonos-kids-player is modified*/
app.get('/setDevice', (req, _res) => {
  transferPlayback(req.query.id)
})

/*endpoint to return all state information*/
/*only used if sonos-kids-player is modified*/
app.get('/state', (_req, res) => {
  if (currentMeta.currentPlayer === 'spotify') {
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
          if (Object.keys(state).length === 0) {
            state = {
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
          }
          res.send(state)
        },
        (err) => {
          handleSpotifyError(err, 'stateHTTP')
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
  log.debug(`${now()}: [Spotify Control] Display device: ${displaySpotifyDevice}`)
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

/*endpoint to return all local metainformation*/
/*only used if sonos-kids-player is modified*/
app.get('/local', (_req, res) => {
  // Frische Object-Komposition statt res.send(currentMeta) — Express
  // setzt sonst einen ETag/Content-Length aus dem initialen Object-Shape
  // und neue Felder (triggerSource/triggerAt aus Phase 19 Stufe B)
  // landen nicht in der Response, obwohl die Mutationen am Objekt
  // ankommen.
  res.json({ ...currentMeta })
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

/*sonos-kids-controller sends commands via http get and uses path names for encoding*/
/*commands are as defined in sonos-kids-controller and mapped spotify calls*/
app.use((req, res) => {
  // Phase 19 Stufe B: Quelle aus optionalem ?src=... Query lesen.
  // path.parse() ignoriert Query nicht — parsen wir vorher mit URL().
  // Base-URL ist irrelevant, sie wird nur vom URL-Constructor verlangt.
  let pathname = req.url
  let triggerSource = 'box'
  let triggerCover = ''
  try {
    const u = new URL(req.url, 'http://localhost')
    pathname = u.pathname
    const src = u.searchParams.get('src')
    if (src && /^[a-z0-9_-]{1,20}$/i.test(src)) triggerSource = src
    // (only a picture address of the box's own API or of the web - it lands in an <img> on the display)
    const cover = u.searchParams.get('cover') ?? ''
    if (cover.length < 2000 && /^(\/api\/|https?:\/\/)/.test(cover)) triggerCover = cover
  } catch {
    /* malformed — bleibt 'box', pathname bleibt req.url */
  }
  currentMeta.triggerSource = triggerSource
  currentMeta.triggerAt = Date.now()

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

  // A new playback starts unpaused and without the picture of the one before: a "pause" of the playback before stayed
  // set (the display showed the play button while the new one played), and a local or NAS album kept the episode
  // picture of a podcast played before it (radio and podcasts set their own below, Spotify brings its own).
  const newMedia = command.name.includes('spotify:') || ['library', 'nas', 'radio', 'rss'].some((segment) => hasDirSegment(command, segment))
  if (newMedia) {
    currentMeta.pause = false
    if (hasDirSegment(command, 'library') || hasDirSegment(command, 'nas')) currentMeta.cover = triggerCover
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

  if (hasDirSegment(command, 'radio')) {
    switchToMplayer()
    currentMeta.currentType = 'radio'
    currentMeta.cover = triggerCover
    const parts = decodeURIComponent(command.name).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1]
    const dir = command.dir
    let radioURL = dir.split('radio/').pop()
    radioURL = decodeURIComponent(radioURL)
    playRadioURL(radioURL)
  }

  if (hasDirSegment(command, 'rss')) {
    switchToMplayer()
    currentMeta.currentType = 'rss'
    currentMeta.cover = triggerCover
    const parts = decodeURIComponent(command.name).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1]
    const dir = command.dir
    let rssURL = dir.split('rss/').pop()
    rssURL = decodeURIComponent(rssURL)
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
  else if (/^[+-]\d{1,2}$/.test(command.name)) {
    // +5 / -5 as before; other steps (1..10) come from the rotary encoder
    const step = Math.min(10, Math.max(1, Math.abs(Number.parseInt(command.name, 10))))
    setVolume(command.name.startsWith('+') ? 1 : 0, step)
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
      "sudo sed -i -e 's/dtoverlay=disable-wifi//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt && sudo su - -c '/usr/local/bin/mupibox/restart.sh &'",
    )

  else if (command.name.includes('localtrack:')) {
    const targetPosition = Number.parseInt(command.name.split(':')[1], 10)
    jumpToTrack(targetPosition)
  } else if (command.name.includes('nastrack:')) {
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
