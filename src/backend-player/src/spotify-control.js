const express = require('express')
const http = require('node:http')
const bodyParser = require('body-parser')
const path = require('node:path')
const dns = require('node:dns')
const SpotifyWebApi = require('spotify-web-api-node')
const createPlayer = require('./mplayer-wrapper.js')
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

const muPiBoxConfig = require(`${configBasePath}/mupiboxconfig.json`)
const config = require(`${configBasePath}/config.json`)

const log = require('console-log-level')({ level: config.server.logLevel })

/*set up express router and set headers for cross origin requests*/
const app = express()
const server = http.createServer(app)
const player = createPlayer()

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

const spotifyApi = new SpotifyWebApi({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret,
  refreshToken: config.spotify.refreshToken,
})

/* sets and refreshes access token every hour */
refreshToken()
setInterval(refreshToken, 1000 * 60 * 60)

const apiAccessToken = {
  accessToken: null,
  expires: Date.now(),
}

player.on('percent_pos', (val) => {
  //console.log('track progress is', val);
  currentMeta.progressTime = val
})
setInterval(() => {
  player.getProps(['percent_pos'])
}, 1000)

player.on('pause', (val) => {
  currentMeta.playing = !val
})
setInterval(() => {
  player.getProps(['pause'])
}, 1000)

player.on('metadata', (val) => {
  console.log('track metadata is', val)
  //currentMeta.currentTracknr = parseInt(val.Comment?.split(',').pop(), 10);
  currentMeta.currentTracknr = currentMeta.currentTracknr + 1
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
  if (currentMeta.currentType !== 'rss' && currentMeta.currentType !== 'radio') {
    currentMeta.currentTrackname = val.Title
  }
})
player.on('track-change', () => player.getProps(['metadata']))

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
  if (currentMeta.currentType !== 'rss' && currentMeta.currentType !== 'radio') {
    currentMeta.album = val.split('/')[7]
  }
})
player.on('track-change', () => player.getProps(['path']))

player.on('track-change', () => {
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1 &&
    (currentMeta.currentType === 'rss' || currentMeta.currentType === 'radio')
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py')
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1 &&
    currentMeta.currentType === 'local'
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py')
})

// Playtime + Quiet-Hours grace: stop at the next natural mplayer break point
// (start of next track, or end of playlist). Spotify doesn't surface these
// events, so for Spotify the grace timeout in the tick is the only stop trigger.
// Both sub-systems are checked independently — a single track-change can
// finalize either or both if both happen to be in grace simultaneously.
player.on('track-change', () => {
  if (playtimeState.state === 'grace') {
    finalizePlaytimeBlock('next track would start during grace period')
  }
  if (quietHoursState.state === 'grace') {
    finalizeQuietHoursBlock('next track would start during grace period')
  }
})
player.on('playlist-finish', () => {
  if (playtimeState.state === 'grace') {
    finalizePlaytimeBlock('playlist finished during grace period')
  }
  if (quietHoursState.state === 'grace') {
    finalizeQuietHoursBlock('playlist finished during grace period')
  }
})

setInterval(() => {
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"
  const exec = require('node:child_process').exec
  exec(cmdVolume, (e, stdout, _stderr) => {
    if (e instanceof Error) {
      // TODO: Get this to run in development.
      if (process.env.NODE_ENV === 'development') {
        return
      }
      throw e
    }
    currentMeta.volume = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
  })
}, 1000)

let activeDevice = null
const nowDate = new Date()
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
  volume: 0,
}

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

function readPlaytimeConfig() {
  const raw = muPiBoxConfig?.playtimeLimit || {}
  const resetHour = Number.isInteger(raw.resetHour) && raw.resetHour >= 0 && raw.resetHour < 24 ? raw.resetHour : 0
  // Grace period in minutes after the limit is reached during which playback may
  // continue (current track allowed to finish). 0 = stop immediately at the limit.
  const maxOverrunMinutes =
    Number.isInteger(raw.maxOverrunMinutes) && raw.maxOverrunMinutes >= 0 && raw.maxOverrunMinutes <= 60
      ? raw.maxOverrunMinutes
      : 10
  return {
    enabled: raw.enabled === true,
    resetHour,
    maxOverrunMinutes,
    limitsMinutes: { ...PLAYTIME_DEFAULT_LIMITS, ...(raw.limitsMinutes || {}) },
  }
}

// === Quiet Hours ===
const QUIET_DEFAULT_SCHEDULE = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

function readQuietHoursConfig() {
  const raw = muPiBoxConfig?.quietHours || {}
  const maxOverrunMinutes =
    Number.isInteger(raw.maxOverrunMinutes) && raw.maxOverrunMinutes >= 0 && raw.maxOverrunMinutes <= 60
      ? raw.maxOverrunMinutes
      : 10
  return {
    enabled: raw.enabled === true,
    maxOverrunMinutes,
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

// state machine: 'normal' (under limit) → 'grace' (over limit, current track finishing) → 'blocked' (stopped)
const playtimeState = {
  date: '',
  dayKey: 'mon',
  usedSeconds: 0,
  state: 'normal',
  graceEndsAt: null,
}
let playtimeLastCheckpointAt = 0
let playtimeLastCheckpointSeconds = -1

// Quiet hours uses the same state machine but is purely time-window-driven (no counter).
const quietHoursState = {
  state: 'normal',
  graceEndsAt: null,
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

  if (!ptCfg.enabled && !qhCfg.enabled) {
    fs.writeFile(PLAYTIME_WORKING_PATH, JSON.stringify({ enabled: false }), () => {})
    return
  }

  // Combined effective state across both sub-systems
  let state = 'normal'
  if (playtimeState.state === 'blocked' || quietHoursState.state === 'blocked') state = 'blocked'
  else if (playtimeState.state === 'grace' || quietHoursState.state === 'grace') state = 'grace'

  // blockSource: prefer 'quiet' over 'playtime' if both are restricting (more "explainable" to the kid)
  let blockSource = null
  if (quietHoursState.state !== 'normal') blockSource = 'quiet'
  else if (playtimeState.state !== 'normal') blockSource = 'playtime'

  const ptLimit = ptCfg.enabled ? (ptCfg.limitsMinutes[playtimeState.dayKey] ?? 60) : 0
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
      resetHour: ptCfg.resetHour,
    },
    quiet: {
      enabled: qhCfg.enabled,
      state: quietHoursState.state,
      inWindow: quietHoursState.activeWindow !== null,
      ...(quietHoursState.activeWindow?.label ? { label: quietHoursState.activeWindow.label } : {}),
      graceEndsInSeconds: qhGraceEndsInSeconds,
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
// True if EITHER playtime OR quiet hours is currently restricting playback.
function isPlaybackBlocked() {
  return (
    playtimeState.state === 'grace' ||
    playtimeState.state === 'blocked' ||
    quietHoursState.state === 'grace' ||
    quietHoursState.state === 'blocked'
  )
}
// Backwards-compat alias kept so older call sites keep working.
const isPlaytimeBlocked = isPlaybackBlocked

// Transition to fully-stopped state. Called from the tick on grace timeout, from the
// mplayer track-change/playlist-finish handlers, or directly when grace=0.
function finalizePlaytimeBlock(reason) {
  // console.log so it shows even when logLevel='error' (the default)
  console.log(`${new Date().toLocaleString()}: [Playtime] Finalizing block (${reason})`)
  playtimeState.state = 'blocked'
  playtimeState.graceEndsAt = null
  try {
    stop()
  } catch (e) {
    console.error(`${new Date().toLocaleString()}: [Playtime] Error stopping playback:`, e)
  }
  writePlaytimeCheckpoint()
}

function finalizeQuietHoursBlock(reason) {
  console.log(`${new Date().toLocaleString()}: [QuietHours] Finalizing block (${reason})`)
  quietHoursState.state = 'blocked'
  quietHoursState.graceEndsAt = null
  try {
    stop()
  } catch (e) {
    console.error(`${new Date().toLocaleString()}: [QuietHours] Error stopping playback:`, e)
  }
}

// Commands that *start or resume* playback. These get blocked when the daily cap is hit.
// Pause/stop/volume/system commands are NOT blocked — those should always work.
function isPlayInitiatingCommand(command) {
  if (command.name?.includes('spotify:')) return true
  if (
    command.dir &&
    (command.dir.includes('library') ||
      command.dir.includes('radio') ||
      command.dir.includes('rss') ||
      command.dir.includes('say/'))
  ) {
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
  const limit = cfg.limitsMinutes[today.dayKey] ?? 60
  const limitSeconds = limit * 60
  const limitReached = playtimeState.usedSeconds >= limitSeconds
  if (limitReached) {
    if (playtimeState.state === 'normal') {
      const overrunMs = cfg.maxOverrunMinutes * 60 * 1000
      if (overrunMs > 0) {
        playtimeState.state = 'grace'
        playtimeState.graceEndsAt = Date.now() + overrunMs
        console.log(
          `${now.toLocaleString()}: [Playtime] Daily limit reached (${limit} min for ${today.dayKey}). Entering grace period (max ${cfg.maxOverrunMinutes} min until current track ends).`,
        )
        writePlaytimeCheckpoint()
      } else {
        finalizePlaytimeBlock(`limit reached (${limit} min, no grace configured)`)
      }
    } else if (playtimeState.state === 'grace') {
      if (playtimeState.graceEndsAt !== null && Date.now() >= playtimeState.graceEndsAt) {
        finalizePlaytimeBlock(`grace period expired (${cfg.maxOverrunMinutes} min)`)
      }
    }
    // else 'blocked': stay blocked
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
      const overrunMs = cfg.maxOverrunMinutes * 60 * 1000
      if (overrunMs > 0) {
        quietHoursState.state = 'grace'
        quietHoursState.graceEndsAt = Date.now() + overrunMs
        console.log(
          `${now.toLocaleString()}: [QuietHours] Entered window ${window.from}-${window.to}${window.label ? ` (${window.label})` : ''}. Entering grace period (max ${cfg.maxOverrunMinutes} min).`,
        )
      } else {
        finalizeQuietHoursBlock(`entered window ${window.from}-${window.to} (no grace configured)`)
      }
    } else if (quietHoursState.state === 'grace') {
      if (quietHoursState.graceEndsAt !== null && Date.now() >= quietHoursState.graceEndsAt) {
        finalizeQuietHoursBlock(`grace period expired (${cfg.maxOverrunMinutes} min)`)
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

function combinedTick() {
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
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Write play to /tmp/playerstate`)
  })
}

function writeplayerstatePause() {
  playerstate = 'pause'
  fs.writeFile('/tmp/playerstate', playerstate, (err) => {
    if (err) {
      console.error(err)
      return
    }
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Write play to /tmp/playerstate`)
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

async function refreshTokenApi() {
  return spotifyApi.refreshAccessToken().then(
    (data) => {
      apiAccessToken.accessToken = data.body.access_token
      apiAccessToken.expires = Date.now() + data.body.expires_in * 1000
      return apiAccessToken.accessToken
    },
    (err) => {
      log.debug(`${nowDate.toLocaleString()}: Could not refresh access token`, err)
      throw err
    },
  )
}

function setAccessToken(token) {
  log.debug(`${nowDate.toLocaleString()}: The access token has been refreshed!`)
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
  if (err.body.error?.status === 401) {
    log.debug(`${nowDate.toLocaleString()}: access token expired, refreshing...`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    counter.counterrorAccessToken++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      refreshToken()
    }
  } else if (err.body.error?.status === 400) {
    log.debug(`${nowDate.toLocaleString()}: invalid id`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    counter.counterrorInvalidID++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      setActiveDevice()
    }
  } else if (err.body.error?.status === 429) {
    log.debug(`${nowDate.toLocaleString()}: To many requests on th spotify web api`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    counter.counterrorToManyRequest++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    //setTimeout(function(){
    //
    //},2000)
  } else if (err.toString().includes('NO_ACTIVE_DEVICE')) {
    log.debug(`${nowDate.toLocaleString()}: no active device, setting the first one found to active`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: playID: ${currentMeta.activeSpotifyId}`)
    counter.counterrorNoActivDevice++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      setActiveDevice()
    }
  } else if (err.toString().includes('Device not found')) {
    log.debug(`${nowDate.toLocaleString()}: Device not found: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
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
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback play deviceID`)
        writeplayerstatePlay()
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'ack')
      },
    )
  } else {
    log.debug(`${nowDate.toLocaleString()}: an error occured: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
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
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Auto-selected device: ${activeDevice}`)
          // Now transfer playback to the selected device
          transferPlaybackToActiveDevice()
        } else {
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] No available devices found`)
        }
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Error getting devices: ${err}`)
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
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback to ${activeDevice}`)
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
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Pause"')
  currentMeta.pause = true
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback paused`)
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

function stop() {
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Stop"')
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback stopped`)
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
    player.stop()
    //currentMeta.playing = false;
    writeplayerstatePause()
    currentMeta.currentTrackname = ''
    currentMeta.progressTime = ''
    currentMeta.album = ''
    currentMeta.path = ''
    currentMeta.currentTracknr = ''
    currentMeta.totalTracks = ''
    currentMeta.currentPlayer = ''
    currentMeta.pause = false
    spotifyRunning = false
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback stopped`)
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
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
        currentMeta.pause = false
        writeplayerstatePlay()
      },
      (err) => {
        handleSpotifyError(err, 'play')
      },
    )
    if (
      muPiBoxConfig.telegram.active &&
      //network.onlinestate === 'online' &&
      muPiBoxConfig.telegram.token.length > 1 &&
      muPiBoxConfig.telegram.chatId.length > 1
    )
      cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Continue playing"')
    //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (!currentMeta.playing) {
      player.playPause()
      currentMeta.pause = false
      //currentMeta.playing = true;
      writeplayerstatePlay()
      if (
        muPiBoxConfig.telegram.active &&
        //network.onlinestate === 'online' &&
        muPiBoxConfig.telegram.token.length > 1 &&
        muPiBoxConfig.telegram.chatId.length > 1
      )
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
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Skip to next`)
      },
      (err) => {
        handleSpotifyError(err, 'next')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    //currentMeta.currentTracknr = currentMeta.currentTracknr + 1;
    //log.debug(nowDate.toLocaleString() + ': [Spotify Control] Current Tracknr: ' + currentMeta.currentTracknr);
    player.next()
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
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Skip to previous`)
      },
      (err) => {
        handleSpotifyError(err, 'previous')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.currentTracknr > 1) {
      currentMeta.currentTracknr = currentMeta.currentTracknr - 2
    }
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
    player.previous()
  }
}

function shuffleon() {
  spotifyApi.setShuffle(true).then(
    () => {
      counter.countsetShuffle++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Toggle Shuffle`)
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
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Toggle Shuffle`)
    },
    (err) => {
      handleSpotifyError(err, 'shuffleoff')
    },
  )
}

function playMe() {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify play ${currentMeta.activeSpotifyId}`)
  resumeOffset = currentMeta.activeSpotifyId.split(':')[3]
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify resume ${resumeOffset}`)
  if (resumeOffset > 0) resumeOffset--
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify offset ${resumeOffset}`)
  resumeProgess = currentMeta.activeSpotifyId.split(':')[4]
  tmp = currentMeta.activeSpotifyId.split(':')
  contextUri = `${tmp[0]}:${tmp[1]}:${tmp[2]}`

  // Prepare play options with device_id if available
  const playOptions = {
    offset: { position: resumeOffset },
    position_ms: resumeProgess,
  }

  // Add device_id if we have an active device
  if (activeDevice) {
    playOptions.device_id = activeDevice
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playing on device: ${activeDevice}`)
  }

  if (contextUri.split(':')[1] === 'episode') {
    playOptions.uris = [contextUri]
    spotifyApi.play(playOptions).then(
      (_data) => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
        writeplayerstatePlay()
        spotifyRunning = true
        if (
          muPiBoxConfig.telegram.active &&
          //network.onlinestate === 'online' &&
          muPiBoxConfig.telegram.token.length > 1 &&
          muPiBoxConfig.telegram.chatId.length > 1
        )
          cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
        //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
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
    spotifyApi.play(playOptions).then(
      (_data) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        writeplayerstatePlay()
        spotifyRunning = true
        if (
          muPiBoxConfig.telegram.active &&
          //network.onlinestate === 'online' &&
          muPiBoxConfig.telegram.token.length > 1 &&
          muPiBoxConfig.telegram.chatId.length > 1
        )
          cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
        //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
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

function playList(playedList) {
  //let playedTitel = playedList.split('album:').pop();
  playedTitelmod = decodeURI(playedList).replace(/:/g, '/')
  //playedTitelmod = playedTitel.replace(/%20/g," ");
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedTitelmod}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.playList(`/home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: /home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
  currentMeta.currentTracknr = 0
  currentMeta.path = playedTitelmod

  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing local"')
  //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py');

  setTimeout(() => {
    const cmdtotalTracks = `find "/home/dietpi/MuPiBox/media/${decodeURIComponent(currentMeta.path)}" -type f -name "*.mp3" -or -name "*.flac" -or -name "*.m4a" -or -name "*.wma" -or -name "*.wav"| wc -l`
    console.log(cmdtotalTracks)
    const exec = require('node:child_process').exec
    exec(cmdtotalTracks, (e, stdout, stderr) => {
      if (e instanceof Error) {
        console.error(e)
        throw e
      }
      currentMeta.totalTracks = Number.parseInt(stdout.split(/\r?\n/)[0], 10)
      console.log('stdout', stdout)
      console.log('stderr', stderr)
    })
  }, 500)
}

function playFile(playedFile) {
  const playedTitel = `${playedFile}.mp3`
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedTitel}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.play(`/home/dietpi/MuPiBox/tts_files/${playedTitel}`)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: /home/dietpi/MuPiBox/tts_files/${playedTitel}`)
}

function playURL(playedURL) {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedURL}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.play(playedURL)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: ${playedURL}`)
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing stream"')
  //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py');
}

/*seek 30 secends back or forward*/
function seek(progress) {
  let currentProgress = 0
  let targetProgress = 0
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Setting progress to ${progress}`)
  if (currentMeta.currentPlayer === 'spotify') {
    if (progress > 1) {
      spotifyApi.seek(progress).then(
        () => {
          counter.countseek++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Progress is ${progress}`)
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
            `${nowDate.toLocaleString()}: [Spotify Control]Current progress for active device is ${currentProgress}`,
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
                log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Setting progress to ${targetProgress}`)
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
      player.seekPercent(progress)
    } else {
      if (progress) player.seek(+30)
      else player.seek(-30)
    }
  }
}

function deleteLocal(deleteFile) {
  const deleteFilePath = decodeURI(deleteFile).replace(/:/g, '/')
  const deleteCMD = `rm -r "/home/dietpi/MuPiBox/media/${decodeURIComponent(deleteFilePath)}"`
  //cmdCall(deleteCMD);
  log.debug(`${nowDate.toLocaleString()}: rm -r "/home/dietpi/MuPiBox/media/${decodeURIComponent(deleteFilePath)}"`)
  const exec = require('node:child_process').exec
  exec(deleteCMD, (e, stdout, stderr) => {
    if (e instanceof Error) {
      console.error(e)
      throw e
    }
    console.log('stdout', stdout)
    console.log('stderr', stderr)
  })
}

function cmdCall(cmd) {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]Cmd  ${cmd}`)
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, (error, standardOutput, standardError) => {
      if (error) {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control]error ${error}`)
        reject()
        return
      }
      if (standardError) {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control]StandardError ${standardError}`)
        reject(standardError)
        return
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control]StandardOutput ${standardOutput}`)
      resolve(standardOutput)
    })
  })
}

/*gets available devices, searches for the active one and returns its volume*/
async function setVolume(volume) {
  const volumeUp = '/usr/bin/amixer sset Master 5%+'
  const volumeDown = '/usr/bin/amixer sset Master 5%-'
  const volumeMax = `/usr/bin/amixer sset Master ${muPiBoxConfig.mupibox.maxVolume}%`
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"

  const exec = require('node:child_process').exec
  exec(cmdVolume, (e, stdout, _stderr) => {
    if (e instanceof Error) {
      console.error(nowDate.toLocaleString() + e)
      throw e
    }
    currentMeta.volume = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
    //console.log('stdout', stdout);
    //console.log('stderr', stderr);
  })

  if (volume) {
    if (currentMeta.volume < muPiBoxConfig.mupibox.maxVolume) {
      await cmdCall(volumeUp)
      currentMeta.volume = Number.parseInt(currentMeta.volume, 10) + 5
    } else {
      currentMeta.volume = muPiBoxConfig.mupibox.maxVolume
      await cmdCall(volumeMax)
    }
  } else {
    await cmdCall(volumeDown)
    if (currentMeta.volume > 0) {
      currentMeta.volume = Number.parseInt(currentMeta.volume, 10) - 5
    } else {
      currentMeta.volume = 0
    }
  }
}

async function transferPlayback(id) {
  await spotifyApi.transferMyPlayback([id]).then(
    () => {
      counter.counttransferMyPlayback++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback to ${id}`)
    },
    (err) => {
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback error.`)
      handleSpotifyError(err, id, 'transferPlayback')
    },
  )
}

function downloadTTS(name) {
  const namedl = name
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] TTS Name: ${namedl} in ${config.ttsLanguage}`)
  googleTTS
    .getAudioBase64(namedl, { lang: config.ttsLanguage, slow: false })
    .then((base64) => {
      console.log({ base64 })
      const buffer = Buffer.from(base64, 'base64')
      const filename = `/home/dietpi/MuPiBox/tts_files/${namedl}.mp3`
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] TTS Filename: ${filename}`)
      fs.writeFileSync(filename, buffer, { encoding: 'base64' })
      playFile(namedl)
    })
    .catch(console.error)
}

async function useSpotify(command) {
  currentMeta.currentPlayer = 'spotify'
  currentMeta.currentType = 'spotify'
  const dir = command.dir
  const newdevice = dir.split('/')[1]

  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Stored device: ${activeDevice}, Requested: ${newdevice}`)

  // Update active device (will be used in playMe() via device_id parameter)
  if (newdevice !== 'current') {
    activeDevice = newdevice
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Device set to: ${activeDevice}`)
  } else {
    // Reset device to let Spotify use the currently active device
    activeDevice = null
    log.debug(
      `${nowDate.toLocaleString()}: [Spotify Control] Using current active Spotify device (no device_id specified)`,
    )
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
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Getting available devices...`)
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

/*endpoint to return all local metainformation*/
/*only used if sonos-kids-player is modified*/
app.get('/local', (_req, res) => {
  res.send(currentMeta)
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

/*sonos-kids-controller sends commands via http get and uses path names for encoding*/
/*commands are as defined in sonos-kids-controller and mapped spotify calls*/
app.use((req, res) => {
  const command = path.parse(req.url)
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]name: ${command.name}`)
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]dir: ${command.dir}`)

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

  /*this is the first command to be received. It always includes the device id encoded in between two /*/
  /*check this if we need to transfer the playback to a new device*/
  if (command.name.includes('spotify:')) {
    useSpotify(command)
  }

  if (command.dir.includes('library')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'local'
    playList(command.name)
  }

  if (command.dir.includes('radio')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'radio'
    const parts = decodeURIComponent(command.name).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1]
    const dir = command.dir
    let radioURL = dir.split('radio/').pop()
    radioURL = decodeURIComponent(radioURL)
    playURL(radioURL)
  }

  if (command.dir.includes('rss')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'rss'
    const parts = decodeURIComponent(command.name).split(':title:artist:')
    currentMeta.currentTrackname = parts[0]
    currentMeta.album = parts[1]
    const dir = command.dir
    let rssURL = dir.split('rss/').pop()
    rssURL = decodeURIComponent(rssURL)
    playURL(rssURL)
  }

  if (command.dir.includes('say/')) {
    const dir = command.dir
    let nameTTS = dir.split('say/').pop()
    nameTTS = decodeURIComponent(nameTTS)
    nameTTS = nameTTS.replace(/\//g, ' ')
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Say: ${nameTTS}`)
    const filename = `/home/dietpi/MuPiBox/tts_files/${nameTTS}.mp3`
    try {
      if (fs.existsSync(filename)) {
        console.log('The file exists.')
        playFile(nameTTS)
      } else {
        console.log('The file does not exist.')
        downloadTTS(nameTTS)
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (command.dir.includes('deletelocal')) {
    deleteLocal(command.name)
  } else if (command.name === 'pause') pause()
  else if (command.name === 'play') play()
  else if (command.name === 'stop') stop()
  else if (command.name === 'next') next()
  else if (command.name === 'previous') previous()
  else if (command.name === '+5') setVolume(1)
  else if (command.name === '-5') setVolume(0)
  else if (command.name === 'shuffleon') shuffleon()
  else if (command.name === 'shuffleoff') shuffleoff()
  else if (command.name === 'shutoff') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./shutdown.sh &"')
  else if (command.name === 'clearresume') cmdCall('sudo bash /usr/local/bin/mupibox/clearresume.sh')
  else if (command.name === 'maxresume') cmdCall('sudo bash /usr/local/bin/mupibox/remove_max_resume.sh')
  else if (command.name === 'networkrestart') cmdCall('sudo service ifup@wlan0 stop && sudo service ifup@wlan0 start')
  else if (command.name === 'reboot') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./restart.sh &"')
  else if (command.name === 'index') cmdCall('sudo bash /usr/local/bin/mupibox/add_index.sh')
  else if (command.name === 'seek+30') seek(1)
  else if (command.name === 'seek-30') seek(0)
  else if (command.name.includes('seekpos:')) {
    const pos = command.name.split(':')[1]
    seek(pos)
  } else if (command.name === 'albumstop') cmdCall('bash /usr/local/bin/mupibox/albumstop.sh')
  else if (command.name === 'enablewifi')
    cmdCall(
      "sudo sed -i -e 's/dtoverlay=disable-wifi//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt && sudo su - -c '/usr/local/bin/mupibox/restart.sh &'",
    )

  /*   else if (command.name.includes("jumpto:")){
    let offsetTrackNr = command.name.split(':')[1];
    jumpTo(offsetTrackNr);
  } */

  const resp = { status: 'ok', error: 'none' }
  res.send(resp)
})

server.listen(config.server.port)
console.log(
  `${nowDate.toLocaleString()}: [mupibox-backend-player] Server started at http://localhost:${config.server.port}`,
)
