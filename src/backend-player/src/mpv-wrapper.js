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
  let playlistCount = 0
  // nothing loaded (before the first file, after a stop or the end): mplayer answered no property then - and
  // "pause" as yes, which the player reads as "not playing"
  let idleActive = true
  // A start position for the next file (loadfile/loadlist with start=): mpv's "start" option applies to every file
  // loaded while it is set, so it is taken off again once the intended file is open (file-loaded). A playlist entry
  // skipped by playlist-play-index right after loadlist never gets to file-loaded (seen on the box).
  let startPending = false
  const setStart = (value) => {
    startPending = value !== 'none'
    send(['set_property', 'start', value])
  }
  // (the end of the previous file is followed by the start of the next one in a playlist; "idle" comes only when
  // nothing follows)

  // the loudness filter in use - set again on a new mpv (one that crashed and was started anew has none)
  let audioFilter = ''
  // Commands while mpv is not reachable (starting, started anew after a crash, its socket lost): kept and sent once it
  // is - a child's choice in those seconds was lost before. Questions for a value are not kept (asked again anyway).
  const MAX_QUEUED = 20
  const queued = []

  // ---- mpv <- wrapper ----
  const send = (command, meta) => {
    if (!sock || sock.destroyed) {
      if (meta) return
      if (queued.length >= MAX_QUEUED) queued.shift()
      queued.push(command)
      debug(`kept until mpv is reachable: ${JSON.stringify(command)}`)
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
      // mpv keeps its pause flag across files and while idle - mplayer did not, a new file always played. So every
      // load takes the flag off (a pause sent after the end of a playback left every later file standing paused
      // and silent, seen on the box), and a pause while nothing plays is ignored.
      case 'loadfile':
        send(['set_property', 'pause', false])
        return send(['loadfile', String(a[0]), a[1] === 1 || a[1] === '1' ? 'append-play' : 'replace'])
      case 'loadlist':
        send(['set_property', 'pause', false])
        return send(['loadlist', String(a[0]), 'replace'])
      case 'pt_step': {
        const step = Number.parseInt(String(a[0] ?? '1'), 10) || 0
        // one step: mpv's own next/prev count on from where they stand at once, so two of them in a row land two
        // further (a jump worked out here from the reported place did not - the report lags); "weak": at the end of
        // the list nothing happens, as with mplayer's pt_step without "force" - "next" on the last (or only) track
        // ended the story before (seen on the box; engine test 15)
        if (step === 1) return send(['playlist-next', 'weak'])
        if (step === -1) return send(['playlist-prev', 'weak'])
        if (step === 0) return
        const target = Math.max(0, (playlistPos < 0 ? 0 : playlistPos) + step)
        return send(['playlist-play-index', playlistCount > 0 ? Math.min(playlistCount - 1, target) : target])
      }
      case 'pause':
        if (idleActive) return
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
        if (startPending) setStart('none')
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
        else if (msg.name === 'playlist-count') playlistCount = typeof msg.data === 'number' ? msg.data : 0
        else if (msg.name === 'idle-active') idleActive = msg.data === true
        else if (msg.name === 'cache-buffering-state' && typeof msg.data === 'number') {
          // 0-100 of mpv's buffering goal before a stream starts (the player scales its loading bar by
          // cachePrefillPercent below - 100 here, 10 with mplayer's cache-min)
          out.emit('cache-fill', msg.data)
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

  // (for this mpv process only: a retry of one that is gone meanwhile stops)
  const connect = (startedAt, forProc) => {
    if (shutdown || !proc || proc !== forProc) return
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
      send(['observe_property', 4, 'playlist-count'])
      if (audioFilter) send(['set_property', 'af', audioFilter])
      for (const command of queued.splice(0)) send(command)
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
      if (Date.now() - startedAt < CONNECT_GIVE_UP_MS) setTimeout(() => connect(startedAt, forProc), CONNECT_RETRY_MS).unref()
      else {
        // mpv runs but cannot be reached: started anew (its close starts the next one) - else every command was lost
        debug('mpv socket did not appear - mpv started anew')
        out.emit('mplayer-error', new Error('mpv socket did not appear'))
        if (proc === forProc && forProc.exitCode === null) forProc.kill()
      }
    })
    s.on('close', () => {
      if (sock !== s) return
      sock = null
      // The connection lost while mpv goes on running: connected again (mpv's close handles a mpv that ended)
      if (!shutdown && proc === forProc && forProc.exitCode === null) {
        debug('mpv socket closed - connecting again')
        setTimeout(() => connect(Date.now(), forProc), CONNECT_RETRY_MS).unref()
      }
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
    playlistCount = 0
    idleActive = true
    startPending = false
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
    connect(Date.now(), proc)
  }

  spawnMpv()

  out.exec = exec
  out.getProps = getProps
  out.seek = (pos) => exec('seek', [pos, '0'])
  out.seekPercent = (pos) => exec('seek', [pos, '1'])
  // opts.startSeconds: the file begins there (a podcast episode, a CUE album where it was left) - no seek after the
  // start, nothing of the beginning is heard. opts.track (1-based) and opts.percent for a playlist: the album goes
  // on with that track at that part of it; only that track is opened (see setStart).
  // Every start sets its start position - also "from the beginning": a start position whose file never opened (not
  // found, a stream that did not answer) was still set, and the next file began there too.
  out.play = (fileOrUrl, opts) => {
    if (opts?.startSeconds > 0) setStart(String(opts.startSeconds))
    else if (startPending) setStart('none')
    exec('loadfile', [fileOrUrl])
  }
  out.playList = (fileOrUrl, opts) => {
    if (opts?.startSeconds > 0) setStart(String(opts.startSeconds))
    else if (opts?.percent > 1) setStart(`${Math.min(99, opts.percent)}%`)
    else if (startPending) setStart('none')
    exec('loadlist', [fileOrUrl])
    if (opts?.track > 1) send(['playlist-play-index', Math.trunc(opts.track) - 1])
  }
  // Levelling of the loudness (mupibox.loudness): 'soft' = EBU R128 loudnorm, leaves an audiobook its dynamics;
  // 'strong' = dynaudnorm, evens out more (music, radio); 'off' = no filter in the chain. Set live, playback goes on.
  out.setLoudness = (mode) => {
    const filter = { soft: 'lavfi=[loudnorm=I=-16:TP=-1.5:LRA=11]', strong: 'lavfi=[dynaudnorm=f=250:g=15:p=0.9]' }[mode]
    audioFilter = filter ?? ''
    // (not reachable now: set when it is - see connect)
    if (sock && !sock.destroyed) send(['set_property', 'af', audioFilter])
  }
  out.startsAt = true
  out.cachePrefillPercent = 100
  // The place in the playlist of the file that plays (0-based; -1: none). mpv reports it before the file is loaded,
  // so the player reads the track number from it - counting the loaded files (as with mplayer) misses a track
  // that was skipped before it was open (two "next" in a row).
  out.trackIndex = () => playlistPos
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
