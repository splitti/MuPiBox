const { EventEmitter } = require('node:events')
const jsStringEscape = require('js-string-escape')
const { spawn } = require('node:child_process')
const byLine = require('byline')
const debug = require('debug')('mplayer-wrapper')

const parsers = require('./parsers')

const MPLAYER_RESPAWN_MAX_BACKOFF_MS = 30_000
const MPLAYER_HEALTHY_RUN_MS = 30_000

const createPlayer = () => {
  const out = new EventEmitter()

  // mplayer -> wrapper. Defined before spawnMplayer so the spawn closure
  // can reference it without a forward declaration.
  const onLine = (line) => {
    debug(`line: ${line}`)
    if (line === 'Starting playback...') return out.emit('track-change')

    //Callback when playlist finishes
    if (line === 'ANS_ERROR=PROPERTY_UNAVAILABLE') return out.emit('playlist-finish')
    // todo: `ANS_ERROR=PROPERTY_UNAVAILABLE`

    const parts = /^ANS_([\w]+)=/g.exec(line)
    if (!parts || !parts[1]) return null
    const prop = parts[1]

    const parser = parsers[prop]
    if (!parser) return null
    const val = parser(line.slice(parts[0].length))
    out.emit('prop', prop, val)
    out.emit(prop, val)
  }

  // Auto-respawn: previously a single mplayer crash (SIGSEGV, OOM, mp3
  // decoder bug) bricked the player until pm2 restarted backend-player.
  // Now we re-spawn with exponential backoff (1, 2, 4, 8, 16, 30, 30…s),
  // and reset the counter once a fresh process has run cleanly for 30s.
  let proc = null
  let shutdown = false
  let respawnAttempts = 0
  let healthyTimer = null

  const spawnMplayer = () => {
    if (shutdown) return

    proc = spawn(
      'mplayer',
      [
        '-slave', // 😔
        '-idle',
        '-novideo',
        '-quiet',
        '-msglevel',
        'all=1:global=4:cplayer=4',
      ],
      {
        env: process.env,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    )

    // Spawn-itself errors (binary missing, ENOMEM during fork). Without
    // this listener Node would re-throw and kill the entire backend-player.
    proc.on('error', (err) => {
      debug(`mplayer process error: ${err.message}`)
      out.emit('mplayer-error', err)
    })

    // EPIPE on stdin when mplayer dies mid-write. The 'close' handler
    // below owns the respawn; here we just absorb the error so it doesn't
    // become an uncaught exception.
    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        debug(`mplayer stdin error: ${err.message}`)
      })
    }

    proc.stdout.pipe(byLine.createStream()).on('data', (line) => {
      onLine(Buffer.isBuffer(line) ? line.toString() : line)
    })

    proc.on('close', (code) => {
      if (healthyTimer) {
        clearTimeout(healthyTimer)
        healthyTimer = null
      }
      if (shutdown) {
        out.emit('close', code)
        return
      }
      const backoff = Math.min(1000 * 2 ** respawnAttempts, MPLAYER_RESPAWN_MAX_BACKOFF_MS)
      respawnAttempts++
      debug(`mplayer exited unexpectedly (code ${code}), respawn in ${backoff}ms (attempt ${respawnAttempts})`)
      out.emit('mplayer-crash', { code, attempt: respawnAttempts, backoffMs: backoff })
      setTimeout(spawnMplayer, backoff)
    })

    healthyTimer = setTimeout(() => {
      respawnAttempts = 0
      healthyTimer = null
    }, MPLAYER_HEALTHY_RUN_MS)
  }

  spawnMplayer()

  // wrapper -> mplayer
  const exec = (cmd, args = []) => {
    let str = cmd
    for (const arg of args) {
      str += ' '
      if ('string' === typeof arg) {
        // Decode percent-encoded paths/URLs FIRST, then escape. The
        // previous code decoded AFTER jsStringEscape — that undid the
        // quote/newline protection and let `%22%0Astop%0A` become a
        // literal `"\nstop\n` injection (HIGH-7). Decoding before
        // escape keeps the legitimate use case (RSS/playlist track
        // names with %20 etc. that callers pass through) while
        // jsStringEscape now sees and escapes any quote/newline that
        // came out of the decode.
        let decoded = arg
        try {
          decoded = decodeURIComponent(arg)
        } catch {
          // Malformed percent sequence (e.g. literal `%FF` that isn't
          // valid UTF-8). Fall through with the original string —
          // jsStringEscape will still neutralise quotes/newlines.
        }
        if (decoded.includes(' ')) str += `"`
        str += jsStringEscape(decoded)
        if (decoded.includes(' ')) str += `"`
      } else str += arg
    }
    debug(`exec: ${str}`)
    if (proc?.stdin?.writable) {
      proc.stdin.write(`${str}\n`)
    } else {
      // mplayer is between crash and respawn — drop the command rather
      // than hard-error. Callers that care can react to mplayer-crash.
      debug(`exec dropped (mplayer not ready): ${str}`)
    }
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
    shutdown = true
    if (proc?.stdin?.writable) exec('quit')
  }

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

module.exports = createPlayer
