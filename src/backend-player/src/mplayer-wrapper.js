const { EventEmitter } = require('node:events')
const jsStringEscape = require('js-string-escape')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const byLine = require('byline')
const debug = require('debug')('mplayer-wrapper')

const parsers = require('./parsers')

const createPlayer = () => {
  const out = new EventEmitter()

  // A 1 MB cache for http(s) streams only (local files are read directly); playback starts once
  // 10% of it (about 100 KB) is filled. "cache=6" in the msglevel makes mplayer report the fill level.
  const streamProfile = path.join(os.tmpdir(), 'mupibox-mplayer-streams.conf')
  fs.writeFileSync(
    streamProfile,
    ['[protocol.http]', 'cache=1024', 'cache-min=10', '[protocol.https]', 'cache=1024', 'cache-min=10', ''].join('\n'),
  )

  const proc = spawn(
    'mplayer',
    [
      '-slave', // 😔
      '-idle',
      '-novideo',
      '-quiet',
      // Network streams and podcasts are buffered before they start (see streamProfile below).
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

  // wrapper -> mplayer
  const exec = (cmd, args = []) => {
    let str = cmd
    for (const arg of args) {
      str += ' '
      if ('string' === typeof arg) {
        if (arg.includes(' ')) str += `"`
        str += jsStringEscape(arg)
        if (arg.includes(' ')) str += `"`
      } else str += arg
    }
    str = decodeURIComponent(str)
    debug(`exec: ${str}`)
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

  let closed = false
  proc.on('close', (code) => {
    closed = true
    out.emit('close', code)
    if (code > 0) {
      // todo: emit err from proc.stderr
    }
  })
  const close = () => {
    if (!closed) exec('quit')
  }

  // mplayer -> wrapper
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

  // The cache fill level arrives as status text ("Cache fill: 12.50% (131072 bytes)").
  proc.stdout.on('data', (chunk) => {
    const matches = [...chunk.toString('latin1').matchAll(/Cache fill:\s*([\d.]+)%/g)]
    if (matches.length > 0) out.emit('cache-fill', Number.parseFloat(matches[matches.length - 1][1]))
  })

  proc.stdout.pipe(byLine.createStream()).on('data', (line) => {
    const text = Buffer.isBuffer(line) ? line.toString() : line
    // Status text is written with carriage returns and can sit in front of an answer.
    onLine(text.includes('\r') ? text.slice(text.lastIndexOf('\r') + 1) : text)
  })

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
