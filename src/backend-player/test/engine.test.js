// The player's engine wrapper (mplayer-wrapper.js or mpv-wrapper.js) driven as spotify-control.js drives it: the same
// calls, the same events expected, against files made here (sine tones) and a stream from a local HTTP server.
// Run on the box (the engines are there):
//   npm run build:test && scp ../deploy/engine-test.js mupibox:/tmp/ && ssh mupibox 'ENGINE=mpv node /tmp/engine-test.js'
// ENGINE=mplayer|mpv (default mpv). Sound comes out of the box's speaker at a low volume while it runs.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const ENGINE = process.env.ENGINE || 'mpv'
const createPlayer = ENGINE === 'mplayer' ? require('../src/mplayer-wrapper.js') : require('../src/mpv-wrapper.js')
const STARTS_AT = ENGINE !== 'mplayer' // (mplayer-wrapper.js seeks after the start; see out.startsAt)

const TRACK_SECONDS = 4
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-engine-test-'))
const files = ['01 - erster.wav', '02 - zweiter.wav', '03 - dritter.wav'].map((n) => path.join(dir, n))
let server
let port
let player
const events = []
let pollTimer

// a mono 16-bit WAV with a sine tone (no ffmpeg on the box)
function writeWav(file, seconds, hz) {
  const rate = 22050
  const n = rate * seconds
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 6000), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  fs.writeFileSync(file, Buffer.concat([h, data]))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// waits for the next event of that name (optionally one whose value passes the check)
function waitFor(name, ms, check = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      player.off(name, on)
      reject(new Error(`no "${name}" within ${ms} ms (events so far: ${events.slice(-8).join(', ')})`))
    }, ms)
    const on = (val) => {
      if (!check(val)) return
      clearTimeout(timer)
      player.off(name, on)
      resolve(val)
    }
    player.on(name, on)
  })
}
// one property, asked for as the player does (getProps) and answered by an event
async function prop(name, ms = 2000) {
  const p = waitFor(name, ms)
  player.getProps([name])
  return p
}
async function settle() {
  player.stop()
  await sleep(600)
  events.length = 0
}

before(async () => {
  files.forEach((f, i) => writeWav(f, TRACK_SECONDS, 440 + i * 110))
  fs.writeFileSync(path.join(dir, 'playlist.m3u'), `#EXTM3U\n${files.map((f) => path.basename(f)).join('\n')}\n`)
  server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.slice(1)))
    if (!fs.existsSync(f)) {
      res.writeHead(404).end()
      return
    }
    // with HTTP Range, as the box's NAS stream (/api/nas/stream) - a CUE album seeks in its one file
    const size = fs.statSync(f).size
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2])
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      res.writeHead(206, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
      fs.createReadStream(f, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': size })
    fs.createReadStream(f).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
  player = createPlayer()
  for (const e of ['track-change', 'playlist-finish', 'cache-fill', 'close', 'mplayer-error'])
    player.on(e, (v) => events.push(e === 'cache-fill' ? `cache-fill:${v}` : e))
  // spotify-control.js asks for the position once a second; mplayer's wrapper tells the end of a playlist only by
  // the answer to such a poll
  pollTimer = setInterval(() => player.getProps(['percent_pos']), 500)
  await sleep(ENGINE === 'mpv' ? 1500 : 1000)
  player.setVolume(5)
})

after(async () => {
  clearInterval(pollTimer)
  player.close()
  server.close()
  await sleep(500)
  fs.rmSync(dir, { recursive: true, force: true })
})

test(`${ENGINE}: a file plays, reports its properties and ends`, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  const length = await prop('length')
  assert.ok(Math.abs(length - TRACK_SECONDS) < 0.6, `length ${length}`)
  assert.equal(await prop('filename'), path.basename(files[0]))
  assert.equal(await prop('path'), files[0])
  const meta = await prop('metadata')
  assert.equal(typeof meta, 'object')
  await sleep(1200)
  const t = await prop('time_pos')
  assert.ok(t > 0.5 && t < TRACK_SECONDS, `time_pos ${t}`)
  assert.equal(await prop('pause'), false)
  await waitFor('playlist-finish', TRACK_SECONDS * 1000 + 4000)
})

test(`${ENGINE}: pause holds the position, play goes on`, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  await sleep(800)
  player.playPause()
  await sleep(300)
  assert.equal(await prop('pause'), true)
  const t1 = await prop('time_pos')
  await sleep(1000)
  const t2 = await prop('time_pos')
  assert.ok(Math.abs(t2 - t1) < 0.15, `position moved while paused: ${t1} -> ${t2}`)
  player.playPause()
  await sleep(300)
  assert.equal(await prop('pause'), false)
  await sleep(800)
  const t3 = await prop('time_pos')
  assert.ok(t3 > t2 + 0.4, `position did not go on: ${t2} -> ${t3}`)
})

test(`${ENGINE}: seek to a position and back (as the player sends it: "pausing_keep seek <s> 2")`, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  await sleep(300)
  player.exec('pausing_keep seek', [2, 2])
  await sleep(400)
  const t = await prop('time_pos')
  assert.ok(t >= 1.8 && t < TRACK_SECONDS, `absolute seek: ${t}`)
  player.seek(-1.5)
  await sleep(300)
  const t2 = await prop('time_pos')
  assert.ok(t2 < t, `relative seek back: ${t} -> ${t2}`)
})

test(`${ENGINE}: a playlist plays its tracks in order and ends`, async () => {
  await settle()
  const seen = []
  const first = waitFor('track-change', 6000)
  player.playList(path.join(dir, 'playlist.m3u'))
  await first
  seen.push(await prop('filename'))
  await waitFor('track-change', TRACK_SECONDS * 1000 + 3000)
  seen.push(await prop('filename'))
  await waitFor('track-change', TRACK_SECONDS * 1000 + 3000)
  seen.push(await prop('filename'))
  assert.deepEqual(
    seen,
    files.map((f) => path.basename(f)),
  )
  await waitFor('playlist-finish', TRACK_SECONDS * 1000 + 4000)
})

test(`${ENGINE}: next, previous and a jump in the playlist (pt_step)`, async () => {
  await settle()
  const first = waitFor('track-change', 6000)
  player.playList(path.join(dir, 'playlist.m3u'))
  await first
  await sleep(300)
  let tc = waitFor('track-change', 4000)
  player.next()
  await tc
  assert.equal(await prop('filename'), path.basename(files[1]))
  tc = waitFor('track-change', 4000)
  player.previous()
  await tc
  assert.equal(await prop('filename'), path.basename(files[0]))
  tc = waitFor('track-change', 4000)
  player.exec('pt_step', [2])
  await tc
  assert.equal(await prop('filename'), path.basename(files[2]))
})

test(`${ENGINE}: volume is set and read back`, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[1])
  await tc
  player.setVolume(30)
  await sleep(300)
  const v = await prop('volume')
  // (mplayer answers with the volume of its mixer, not with the value set - only mpv reads it back exactly)
  if (ENGINE === 'mpv') assert.ok(Math.abs(v - 30) < 1, `volume ${v}`)
  else assert.ok(Number.isFinite(v), `volume ${v}`)
  player.setVolume(5)
})

test(`${ENGINE}: stop ends the playback (the player hears "playlist-finish")`, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[1])
  await tc
  await sleep(500)
  const fin = waitFor('playlist-finish', 3000)
  player.stop()
  await fin
})

test(`${ENGINE}: a stream over HTTP starts and plays`, async () => {
  await settle()
  const tc = waitFor('track-change', 10000)
  player.play(`http://127.0.0.1:${port}/${encodeURIComponent(path.basename(files[2]))}`)
  await tc
  await sleep(1500)
  const t = await prop('time_pos')
  assert.ok(t > 0.3, `stream position ${t}`)
  assert.equal(await prop('filename'), path.basename(files[2]))
  await waitFor('playlist-finish', TRACK_SECONDS * 1000 + 6000)
})

test(`${ENGINE}: a file that does not exist does not kill the player; the next one plays`, async () => {
  await settle()
  player.play(path.join(dir, 'gibt-es-nicht.wav'))
  await sleep(1500)
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  assert.equal(await prop('filename'), path.basename(files[0]))
})

test(`${ENGINE}: a file starts at a position (play with startSeconds)`, { skip: !STARTS_AT && 'this engine seeks after the start' }, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[0], { startSeconds: 2 })
  await tc
  await sleep(250)
  const t = await prop('time_pos')
  assert.ok(t >= 1.9 && t < 3.2, `started at ${t}`)
  // the next file begins at 0 again
  await settle()
  const tc2 = waitFor('track-change', 6000)
  player.play(files[1])
  await tc2
  await sleep(250)
  const t2 = await prop('time_pos')
  assert.ok(t2 < 1.2, `next file started at ${t2}`)
})

test(`${ENGINE}: a playlist goes on with a track at a part of it (playList with track and percent)`, { skip: !STARTS_AT && 'this engine seeks after the start' }, async () => {
  await settle()
  let changes = 0
  const count = () => changes++
  player.on('track-change', count)
  const tc = waitFor('track-change', 6000)
  player.playList(path.join(dir, 'playlist.m3u'), { track: 3, percent: 50 })
  await tc
  await sleep(400)
  assert.equal(await prop('filename'), path.basename(files[2]))
  const t = await prop('time_pos')
  assert.ok(t >= TRACK_SECONDS * 0.5 - 0.3 && t < TRACK_SECONDS, `position ${t}`)
  await sleep(300)
  player.off('track-change', count)
  assert.equal(changes, 1, `track-change fired ${changes} times (the skipped first track must not count)`)
})

test(`${ENGINE}: two "next" in a row land on the third track, and the engine knows the place (trackIndex)`, async () => {
  await settle()
  const first = waitFor('track-change', 6000)
  player.playList(path.join(dir, 'playlist.m3u'))
  await first
  await sleep(300)
  player.next()
  player.next()
  await sleep(2500)
  assert.equal(await prop('filename'), path.basename(files[2]))
  const idx = player.trackIndex()
  if (STARTS_AT) assert.equal(idx, 2, `trackIndex ${idx}`)
  else assert.equal(idx, -1)
})

test(`${ENGINE}: the levelling of the loudness is set and taken off while playing`, { skip: !STARTS_AT && 'mplayer has no levelling' }, async () => {
  await settle()
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  player.setLoudness('soft')
  await sleep(700)
  const t1 = await prop('time_pos')
  await sleep(1000)
  const t2 = await prop('time_pos')
  assert.ok(t2 > t1 + 0.5, `playback stalled with the filter: ${t1} -> ${t2}`)
  player.setLoudness('strong')
  await sleep(700)
  player.setLoudness('off')
  await sleep(700)
  const t3 = await prop('time_pos')
  assert.ok(t3 > t2, `playback stalled after the filter: ${t2} -> ${t3}`)
})

test(`${ENGINE}: a pause sent while nothing plays does not leave the next file paused`, async () => {
  await settle()
  // (a pause after the end of a playback: mpv kept the flag and every later file stood paused)
  player.playPause()
  await sleep(300)
  const tc = waitFor('track-change', 6000)
  player.play(files[0])
  await tc
  await sleep(1200)
  assert.equal(await prop('pause'), false)
  const t = await prop('time_pos')
  assert.ok(t > 0.6, `did not play after a pause in idle: ${t}`)
})

test(`${ENGINE}: "next" on the last track (an album of one track) keeps it playing, "previous" on the first too`, async () => {
  await settle()
  // (mplayer's pt_step without "force" does nothing at the end of the list - a child pressing "next" on the last or
  // only track did not stop the story)
  let finished = false
  const onFinish = () => {
    finished = true
  }
  const tc = waitFor('track-change', 6000)
  player.playList(path.join(dir, 'playlist.m3u'))
  await tc
  await sleep(300)
  player.exec('pt_step', [2])
  await waitFor('track-change', 4000)
  player.on('playlist-finish', onFinish)
  await sleep(500)
  const t1 = await prop('time_pos')
  player.next()
  await sleep(1200)
  assert.equal(finished, false, 'next on the last track ended the playback')
  assert.equal(await prop('filename'), path.basename(files[2]))
  const t2 = await prop('time_pos')
  assert.ok(t2 > t1 + 0.5, `the last track did not go on: ${t1} -> ${t2}`)
  player.off('playlist-finish', onFinish)
})

test(`${ENGINE}: a CUE album (one file over HTTP) starts inside it and seeks to its tracks forward and back`, async () => {
  await settle()
  // as spotify-control.js plays a CUE album from the NAS: a list with the one file (the stream of the box's NAS proxy),
  // tracks found by the playing time, "next"/"previous" and the track list seek to a track's start time
  const cueFile = path.join(dir, 'cue-album.wav')
  writeWav(cueFile, 30, 330)
  const list = path.join(dir, 'cue.m3u')
  fs.writeFileSync(list, `http://127.0.0.1:${port}/${encodeURIComponent(path.basename(cueFile))}\n`)
  const near = async (want, label) => {
    let t = 0
    // (a seek over HTTP takes a moment: up to 4 s, as the player's pendingCueSeek waits and repeats)
    for (let i = 0; i < 8; i++) {
      await sleep(500)
      t = await prop('time_pos')
      if (t >= want - 0.5 && t < want + 3) return t
    }
    assert.fail(`${label}: position ${t}, wanted about ${want}`)
  }
  const tc = waitFor('track-change', 10000)
  // going on in track 2 (it starts at 10 s) at 12 s - an engine without the start option seeks after the start
  if (STARTS_AT) player.playList(list, { track: 1, startSeconds: 12 })
  else player.playList(list)
  await tc
  if (!STARTS_AT) player.exec('pausing_keep seek', [12, 2])
  await near(12, 'resume inside the file')
  const len = await prop('length')
  assert.ok(len > 29 && len < 31, `length ${len}`)
  player.exec('pausing_keep seek', [20, 2]) // "next": track 3
  await near(20, 'seek forward to track 3')
  player.exec('pausing_keep seek', [0, 2]) // track list: track 1
  await near(0, 'seek back to track 1')
  player.exec('pausing_keep seek', [10, 2]) // "next": track 2
  await near(10, 'seek forward to track 2')
})

test(`${ENGINE}: the start position of a file that never opened does not carry over to the next file`, { skip: !STARTS_AT && 'this engine seeks after the start' }, async () => {
  await settle()
  player.play(path.join(dir, 'gibt-es-nicht.wav'), { startSeconds: 2 })
  await sleep(1500)
  const tc = waitFor('track-change', 6000)
  player.play(files[1])
  await tc
  await sleep(250)
  const t = await prop('time_pos')
  assert.ok(t < 1.2, `next file started at ${t}`)
})

test(`${ENGINE}: a file chosen while the engine is started anew (after a crash) plays once it is up`, { skip: ENGINE !== 'mpv' && 'mplayer-wrapper.js has no queue' }, async () => {
  await settle()
  const closed = waitFor('close', 4000)
  // (pkill without a shell: a shell's own command line would hold the pattern - see pgrep matching itself)
  require('node:child_process').execFileSync('pkill', ['-f', `mupibox-mpv-${process.pid}.sock`])
  await closed
  const tc = waitFor('track-change', 10000)
  player.play(files[2])
  await tc
  assert.equal(await prop('filename'), path.basename(files[2]))
  player.setVolume(5)
})
