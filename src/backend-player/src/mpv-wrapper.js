// mpv as the box's player for everything that is not Spotify (local media, the NAS, radio, podcasts, announcements).
// Same interface as mplayer-wrapper.js - the player (spotify-control.js) does not know which of the two runs:
//   play, playList, queue, next, previous, playPause, seek, seekPercent, setVolume, stop, getProps, exec, close
//   events: track-change, playlist-finish, cache-fill, prop + <prop> (percent_pos, time_pos, length, pause, metadata,
//   filename, path), close, mplayer-error
// Instead of mplayer's text protocol on stdin/stdout, mpv is driven over its JSON IPC socket: every answer belongs to a
// request, and mpv reports changes by itself (observe_property) - nothing has to be parsed out of status text.
const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const debug = require('debug')('mpv-wrapper')

const RESPAWN_MAX_BACKOFF_MS = 30_000
const HEALTHY_RUN_MS = 30_000
const CONNECT_RETRY_MS = 100
const CONNECT_GIVE_UP_MS = 10_000

// the player asks for mplayer's property names; mpv's differ
const PROPERTY = {
  time_pos: 'time-pos',
  length: 'duration',
  percent_pos: 'percent-pos',
  pause: 'pause',
  metadata: 'metadata',
  filename: 'filename',
  path: 'path',
  volume: 'volume',
}
// the values as mplayer's parsers (parsers.js) delivered them
const CONVERT = {
  time_pos: (v) => (typeof v === 'number' ? v : Number.NaN),
  length: (v) => (typeof v === 'number' ? v : Number.NaN),
  percent_pos: (v) => (typeof v === 'number' ? Math.trunc(v) : Number.NaN),
  pause: (v) => v === true,
  metadata: (v) => metadataOf(v),
  filename: (v) => (typeof v === 'string' ? v : ''),
  path: (v) => (typeof v === 'string' ? v : ''),
  volume: (v) => (typeof v === 'number' ? v : Number.NaN),
}
// mplayer named the tags Title, Artist, ... (see parsers.js knownMetaProps); ffmpeg's keys vary in case
const META_KEYS = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  date: 'Year',
  year: 'Year',
  comment: 'Comment',
  genre: 'Genre',
}
function metadataOf(v) {
  const res = Object.create(null)
  if (!v || typeof v !== 'object') return res
  for (const [k, val] of Object.entries(v)) {
    const key = META_KEYS[k.toLowerCase()]
    if (key && typeof val === 'string' && val !== '' && !(key in res)) res[key] = val
  }
  return res
}

// mplayer took a percent-encoded path or URL as the player passes it (see mplayer-wrapper.js exec)
function decodeArg(arg) {
  if (typeof arg !== 'string') return arg
  try {
    return decodeURIComponent(arg)
  } catch {
    return arg
  }
}

const createPlayer = (options = {}) => {
  const out = new EventEmitter()
  const socketPath = options.socketPath ?? path.join(os.tmpdir(), `mupibox-mpv-${process.pid}.sock`)
  const binary = options.binary ?? 'mpv'

  let proc = null
  let sock = null
  let shutdown = false
  let respawnAttempts = 0
  let healthyTimer = null
  let requestId = 0
  const pending = new Map() // request_id -> what the answer is for
  let rxBuffer = ''
  // Set by the start of a file, cleared when mpv goes idle after it: only then the idle is "the playlist finished"
  let playbackActive = false
  let playlistPos = -1
  // nothing loaded (before the first file, after a stop or the end): mplayer answered no property then - and
  // "pause" as yes, which the player reads as "not playing"
  let idleActive = true
  // (the end of the previous file is followed by the start of the next one in a playlist; "idle" comes only when
  // nothing follows)

  // ---- mpv <- wrapper ----
  const send = (command, meta) => {
    if (!sock || sock.destroyed) {
      debug(`dropped (no mpv): ${JSON.stringify(command)}`)
      return
    }
    const id = ++requestId
    if (meta) pending.set(id, meta)
    sock.write(`${JSON.stringify({ command, request_id: id })}\n`)
  }
  const getProps = (props) => {
    for (const prop of props) {
      const name = PROPERTY[prop]
      if (!name) continue
      if (idleActive && prop !== 'volume') {
        if (prop === 'pause') {
          out.emit('prop', 'pause', true)
          out.emit('pause', true)
        }
        continue
      }
      send(['get_property', name], { prop })
    }
  }
  // mplayer's slave commands as the player still sends a few of them raw (seek to a position, a step in the playlist)
  const exec = (cmd, args = []) => {
    const a = args.map(decodeArg)
    switch (cmd) {
      case 'loadfile':
        return send(['loadfile', String(a[0]), a[1] === 1 || a[1] === '1' ? 'append-play' : 'replace'])
      case 'loadlist':
        return send(['loadlist', String(a[0]), 'replace'])
      case 'pt_step': {
        const step = Number.parseInt(String(a[0] ?? '1'), 10) || 0
        const target = Math.max(0, (playlistPos < 0 ? 0 : playlistPos) + step)
        return send(['playlist-play-index', target])
      }
      case 'pause':
        return send(['cycle', 'pause'])
      case 'seek':
      case 'pausing_keep seek': {
        const mode = { 0: 'relative', 1: 'absolute-percent', 2: 'absolute' }[String(a[1] ?? '0')] ?? 'relative'
        return send(['seek', Number(a[0]) || 0, mode])
      }
      case 'volume':
      case 'pausing_keep volume':
        return send(['set_property', 'volume', Math.max(0, Math.min(100, Number(a[0]) || 0))])
      case 'stop':
        return send(['stop'])
      case 'quit':
        return send(['quit'])
      case 'get_property':
      case 'pausing_keep_force get_property':
        return getProps([String(a[0])])
      default:
        debug(`unknown command ignored: ${cmd} ${a.join(' ')}`)
    }
  }

  // ---- mpv -> wrapper ----
  const onMessage = (msg) => {
    if (msg.request_id !== undefined) {
      const meta = pending.get(msg.request_id)
      pending.delete(msg.request_id)
      if (!meta) return
      if (meta.prop && msg.error === 'success') {
        const val = CONVERT[meta.prop](msg.data)
        out.emit('prop', meta.prop, val)
        out.emit(meta.prop, val)
      }
      return
    }
    switch (msg.event) {
      case 'file-loaded':
        // (mplayer said "Starting playback..." here: the file is open, its tags are known, the sound follows)
        playbackActive = true
        out.emit('track-change')
        break
      case 'idle':
        // nothing to play any more - the playlist ran out, or a stop. mplayer's wrapper told it by the first
        // unavailable property after a playback; the player (spotify-control.js) handles both the same way
        if (playbackActive) {
          playbackActive = false
          out.emit('playlist-finish')
        }
        break
      case 'end-file':
        if (msg.reason === 'error') debug(`end-file error: ${msg.file_error ?? ''}`)
        break
      case 'property-change':
        if (msg.name === 'playlist-pos') playlistPos = typeof msg.data === 'number' ? msg.data : -1
        else if (msg.name === 'idle-active') idleActive = msg.data === true
        else if (msg.name === 'cache-buffering-state' && typeof msg.data === 'number') {
          // mplayer reported the fill of its cache in percent and started at 10 % of it (cache-min); the player
          // scales the loading bar by that (cachePrefillPercent) - so mpv's 0-100 of its buffering goal is handed
          // over as 0-10
          out.emit('cache-fill', msg.data / 10)
        }
        break
      default:
    }
  }
  const onData = (chunk) => {
    rxBuffer += chunk
    let nl = rxBuffer.indexOf('\n')
    while (nl >= 0) {
      const line = rxBuffer.slice(0, nl)
      rxBuffer = rxBuffer.slice(nl + 1)
      if (line) {
        try {
          onMessage(JSON.parse(line))
        } catch (e) {
          debug(`unreadable line: ${line.slice(0, 120)} (${e.message})`)
        }
      }
      nl = rxBuffer.indexOf('\n')
    }
  }

  const connect = (startedAt) => {
    if (shutdown || !proc) return
    const s = net.createConnection(socketPath)
    s.setEncoding('utf8')
    s.on('connect', () => {
      sock = s
      rxBuffer = ''
      pending.clear()
      // (what mpv reports by itself: the place in the playlist, the buffering of a stream)
      send(['observe_property', 1, 'playlist-pos'])
      send(['observe_property', 2, 'cache-buffering-state'])
      send(['observe_property', 3, 'idle-active'])
      debug('connected')
      out.emit('ready')
    })
    s.on('data', onData)
    s.on('error', (err) => {
      if (sock === s) {
        debug(`socket error: ${err.message}`)
        return
      }
      // not up yet: mpv creates the socket a moment after its start
      if (Date.now() - startedAt < CONNECT_GIVE_UP_MS) setTimeout(() => connect(startedAt), CONNECT_RETRY_MS).unref()
      else {
        debug('mpv socket did not appear - giving up until the next spawn')
        out.emit('mplayer-error', new Error('mpv socket did not appear'))
      }
    })
    s.on('close', () => {
      if (sock === s) sock = null
    })
  }

  const spawnMpv = () => {
    if (shutdown) return
    try {
      fs.rmSync(socketPath, { force: true })
    } catch {
      /* none there */
    }
    playbackActive = false
    playlistPos = -1
    proc = spawn(
      binary,
      [
        '--idle=yes',
        '--no-video',
        '--no-terminal',
        '--no-config',
        '--ao=pulse,alsa',
        '--volume=100',
        '--volume-max=100',
        '--audio-display=no',
        '--ytdl=no',
        '--keep-open=no',
        '--loop-playlist=no',
        // tracks of an album follow each other without a gap
        '--gapless-audio=weak',
        // a stream that broke off (WiFi) is taken up again instead of ending the playback
        '--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_delay_max=5',
        // network streams are buffered before they start (as mplayer's cache-min did)
        '--cache=yes',
        '--demuxer-readahead-secs=20',
        '--cache-pause-initial=yes',
        '--network-timeout=20',
        `--input-ipc-server=${socketPath}`,
      ],
      { env: process.env, stdio: ['ignore', 'ignore', 'ignore'] },
    )
    proc.on('error', (err) => {
      debug(`mpv process error: ${err.message}`)
      out.emit('mplayer-error', err)
    })
    proc.on('close', (code) => {
      if (healthyTimer) {
        clearTimeout(healthyTimer)
        healthyTimer = null
      }
      if (sock) {
        sock.destroy()
        sock = null
      }
      out.emit('close', code)
      if (shutdown) return
      respawnAttempts += 1
      const delayMs = Math.min(1000 * 2 ** (respawnAttempts - 1), RESPAWN_MAX_BACKOFF_MS)
      debug(`mpv exited (code ${code}), respawn attempt ${respawnAttempts} in ${delayMs}ms`)
      setTimeout(spawnMpv, delayMs).unref()
    })
    healthyTimer = setTimeout(() => {
      respawnAttempts = 0
      healthyTimer = null
    }, HEALTHY_RUN_MS)
    healthyTimer.unref()
    connect(Date.now())
  }

  spawnMpv()

  out.exec = exec
  out.getProps = getProps
  out.seek = (pos) => exec('seek', [pos, '0'])
  out.seekPercent = (pos) => exec('seek', [pos, '1'])
  out.play = (fileOrUrl) => exec('loadfile', [fileOrUrl])
  out.playList = (fileOrUrl) => exec('loadlist', [fileOrUrl])
  out.queue = (fileOrUrl) => exec('loadfile', [fileOrUrl, '1'])
  out.next = () => exec('pt_step', ['1'])
  out.previous = () => exec('pt_step', ['-1'])
  out.playPause = () => exec('pause')
  out.setVolume = (amount) => exec('volume', [amount, '1'])
  out.stop = () => exec('stop')
  out.close = () => {
    shutdown = true
    if (healthyTimer) {
      clearTimeout(healthyTimer)
      healthyTimer = null
    }
    exec('quit')
    setTimeout(() => {
      if (proc && proc.exitCode === null) proc.kill()
    }, 1500).unref()
  }
  out.engine = 'mpv'
  return out
}

module.exports = createPlayer
