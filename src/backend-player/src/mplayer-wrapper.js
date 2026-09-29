const { EventEmitter } = require('node:events')
const jsStringEscape = require('js-string-escape')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const debug = require('debug')('mplayer-wrapper')

const parsers = require('./parsers')

const MPLAYER_RESPAWN_MAX_BACKOFF_MS = 30_000
const MPLAYER_HEALTHY_RUN_MS = 30_000

const createPlayer = () => {
  const out = new EventEmitter()

  // A 1 MB cache for http(s) streams only (local files are read directly); playback starts once
  // 10% of it (about 100 KB) is filled. "cache=6" in the msglevel makes mplayer report the fill level.
  const streamProfile = path.join(os.tmpdir(), 'mupibox-mplayer-streams.conf')
  fs.writeFileSync(
    streamProfile,
    ['[protocol.http]', 'cache=1024', 'cache-min=10', '[protocol.https]', 'cache=1024', 'cache-min=10', ''].join('\n'),
  )

  // Auto-respawn state. Previously a single mplayer crash (SIGSEGV, OOM, a
  // decoder bug on a broken file) left the player dead until pm2 restarted
  // backend-player — the box stayed silent and only a reboot brought it back.
  // `proc` is therefore a let: spawnMplayer() below replaces it with a fresh
  // process and re-attaches every listener, and exec() always writes to
  // whichever process is current.
  let proc = null
  let shutdown = false
  let respawnAttempts = 0
  let healthyTimer = null
  // Buffer for the raw-byte line splitting further down. Reset on every spawn
  // so a half-received line from the dead process cannot bleed into the new one.
  let pending = Buffer.alloc(0)

  // wrapper -> mplayer
  const exec = (cmd, args = []) => {
    let str = cmd
    for (const arg of args) {
      str += ' '
      if ('string' === typeof arg) {
        // Decode percent-encoded paths/URLs FIRST, then escape. Decoding
        // AFTER jsStringEscape undid the quote/newline protection and let
        // `%22%0Astop%0A` become a literal `"\nstop\n` injection into
        // mplayer's slave protocol (HIGH-7). Decoding before the escape
        // keeps the legitimate use case (RSS/playlist track names with
        // %20 etc. that callers pass through) while jsStringEscape now
        // sees and escapes any quote/newline that came out of the decode.
        let decoded = arg
        try {
          decoded = decodeURIComponent(arg)
        } catch {
          // Malformed percent sequence (e.g. a literal `%FF` that isn't
          // valid UTF-8). Fall through with the original string —
          // jsStringEscape will still neutralise quotes/newlines.
        }
        if (decoded.includes(' ')) str += `"`
        str += jsStringEscape(decoded)
        if (decoded.includes(' ')) str += `"`
      } else str += arg
    }
    debug(`exec: ${str}`)
    // Commands sent during the respawn gap would otherwise throw on a null
    // proc and take the whole backend-player down with them.
    if (!proc || !proc.stdin || proc.stdin.destroyed) {
      debug('exec dropped: no live mplayer process')
      return
    }
    proc.stdin.write(`${str}\n`)
  }
  const getProps = (props) => {
    for (const prop of props) exec('pausing_keep_force get_property', [prop])
  }

  const play = (fileOrUrl) => exec('loadfile', [fileOrUrl])
  const playList = (fileOrUrl) => exec('loadlist', [fileOrUrl])
  const queue = (fileOrUrl) => exec('loadfile', [fileOrUrl, '1'])
  const next = () => exec('pt_step', ['1'])
  const previous = () => exec('pt_step', ['-1'])
  const playPause = () => exec('pause')
  const seek = (pos) => exec('pausing_keep seek', [pos, '0'])
  const seekPercent = (pos) => exec('pausing_keep seek', [pos, '1'])
  const setVolume = (amount) => exec('pausing_keep volume', [amount, '1'])
  const stop = () => exec('stop')

  const close = () => {
    // Deliberate shutdown: stop respawning, then ask mplayer to quit.
    shutdown = true
    if (healthyTimer) {
      clearTimeout(healthyTimer)
      healthyTimer = null
    }
    exec('quit')
  }

  // Set by 'Starting playback...', cleared by the first "nothing loaded" answer after it.
  let playbackActive = false

  // mplayer -> wrapper
  const onLine = (line) => {
    debug(`line: ${line}`)
    if (line === 'Starting playback...') {
      playbackActive = true
      return out.emit('track-change')
    }

    // Callback when playlist finishes. The player polls percent_pos every second, and an idle
    // mplayer answers every poll with PROPERTY_UNAVAILABLE - so this used to fire once a second
    // the whole time nothing was playing: a playtime/quiet-hours grace period ended after at most
    // a second during Spotify (mplayer idle), and a finished album sent a deleteresume request
    // every second until the next STOP. Only the first answer after a playback counts.
    if (line === 'ANS_ERROR=PROPERTY_UNAVAILABLE') {
      if (!playbackActive) return null
      playbackActive = false
      return out.emit('playlist-finish')
    }

    const parts = /^ANS_([\w]+)=/g.exec(line)
    if (!parts || !parts[1]) return null
    const prop = parts[1]

    const parser = parsers[prop]
    if (!parser) return null
    const val = parser(line.slice(parts[0].length))
    out.emit('prop', prop, val)
    out.emit(prop, val)
  }

  // Spawns mplayer and wires up every listener. Called once at startup and
  // again after each unexpected exit — the stdout handlers below MUST be
  // re-attached per process, they belong to that process's stream.
  const spawnMplayer = () => {
    if (shutdown) return
    pending = Buffer.alloc(0)

    proc = spawn(
      'mplayer',
      [
        '-slave', // 😔
        '-idle',
        '-novideo',
        '-quiet',
        // Network streams and podcasts are buffered before they start (see streamProfile above).
        '-include',
        streamProfile,
        '-msglevel',
        'all=1:global=4:cplayer=4:cache=6',
      ],
      {
        env: process.env,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )

    // Spawn-itself errors (binary missing, ENOMEM during fork). Without this
    // listener Node re-throws and kills the entire backend-player.
    proc.on('error', (err) => {
      debug(`mplayer process error: ${err.message}`)
      out.emit('mplayer-error', err)
    })

    // EPIPE on stdin when mplayer dies mid-write. The close handler owns the
    // respawn; here we only absorb the error so it is not uncaught.
    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        debug(`mplayer stdin error: ${err.message}`)
      })
    }

    // The cache fill level arrives as status text ("Cache fill: 12.50% (131072 bytes)").
    proc.stdout.on('data', (chunk) => {
      const matches = [...chunk.toString('latin1').matchAll(/Cache fill:\s*([\d.]+)%/g)]
      if (matches.length > 0) out.emit('cache-fill', Number.parseFloat(matches[matches.length - 1][1]))
    })

    // Lines are split from the raw bytes (byline would turn them into UTF-8 text first and
    // destroy Latin-1 characters before decodeLine sees them).
    proc.stdout.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk])
      let end = pending.indexOf(10)
      while (end >= 0) {
        const text = decodeLine(pending.subarray(0, end))
        pending = pending.subarray(end + 1)
        // Status text is written with carriage returns and can sit in front of an answer.
        onLine(text.includes('\r') ? text.slice(text.lastIndexOf('\r') + 1) : text)
        end = pending.indexOf(10)
      }
      // Status text without a line break must not pile up.
      if (pending.length > 65536) pending = Buffer.alloc(0)
    })

    proc.on('close', (code) => {
      if (healthyTimer) {
        clearTimeout(healthyTimer)
        healthyTimer = null
      }
      out.emit('close', code)
      if (shutdown) return

      // Exponential backoff: 1, 2, 4, 8, 16, then capped. A binary that is
      // missing or instantly crashing must not spin the CPU in a respawn loop.
      respawnAttempts += 1
      const delayMs = Math.min(1000 * 2 ** (respawnAttempts - 1), MPLAYER_RESPAWN_MAX_BACKOFF_MS)
      debug(`mplayer exited (code ${code}), respawn attempt ${respawnAttempts} in ${delayMs}ms`)
      const timer = setTimeout(spawnMplayer, delayMs)
      if (typeof timer.unref === 'function') timer.unref()
    })

    // A process that ran this long is considered healthy, so the next crash
    // starts its backoff from 1s again instead of inheriting an old, long delay.
    healthyTimer = setTimeout(() => {
      respawnAttempts = 0
      healthyTimer = null
    }, MPLAYER_HEALTHY_RUN_MS)
    if (typeof healthyTimer.unref === 'function') healthyTimer.unref()
  }

  spawnMplayer()

  out.exec = exec
  out.getProps = getProps
  out.seek = seek
  out.play = play
  out.playList = playList
  out.queue = queue
  out.next = next
  out.previous = previous
  out.seekPercent = seekPercent
  out.playPause = playPause
  out.setVolume = setVolume
  out.stop = stop
  out.close = close
  return out
}

// mplayer prints tag text (ID3 title, ...) exactly as it is stored. Many files carry it in
// Latin-1/Windows-1252 (umlauts, sharp s, ...), which is not valid UTF-8 and used to
// turn into replacement characters. So: UTF-8 if the bytes are valid UTF-8, else Windows-1252.
const utf8Strict = new TextDecoder('utf-8', { fatal: true })
const windows1252 = new TextDecoder('windows-1252')
function decodeLine(buffer) {
  try {
    return utf8Strict.decode(buffer)
  } catch {
    return windows1252.decode(buffer)
  }
}

module.exports = createPlayer
