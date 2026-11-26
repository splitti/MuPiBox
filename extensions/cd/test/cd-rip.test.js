// Ripping a CD (cd-rip.js): names, arguments of the programs, the job with its progress and its clean-up - no disc, no cdparanoia and no
// ffmpeg needed (npm test): the programs are pretended by small node scripts.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const R = require('../cd-rip.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cd-rip-'))

test('names for the card: no characters Windows cannot show, no hidden or dotted names', () => {
  assert.equal(R.cleanName('AC/DC: Back In Black?'), 'AC-DC- Back In Black-')
  assert.equal(R.cleanName('  ..hidden. '), 'hidden')
  assert.equal(R.cleanName('..'), '')
  assert.equal(R.cleanName(42), '')
  assert.ok(Buffer.byteLength(R.cleanName('ä'.repeat(300)), 'utf8') <= 200)
})

test('the file of a track: number, title, extension - and a name for a track without a title', () => {
  assert.equal(R.trackFileName(3, 'Smells Like Teen Spirit', 'mp3'), '03 Smells Like Teen Spirit.mp3')
  assert.equal(R.trackFileName(12, '', 'flac'), '12 Track 12.flac')
  assert.equal(R.trackFileName(1, 'a/b', 'm4a'), '01 a-b.m4a')
  assert.ok(R.trackFileName(1, 'x'.repeat(500), 'mp3').length < 170)
})

test('ffmpeg: the codec of each format, the bitrate only for the lossy ones, the picture only where it fits', () => {
  const tags = { title: 'T', artist: 'A', album: 'B', album_artist: 'A', genre: '', date: '1991', track: '1/12' }
  const mp3 = R.ffmpegArgs({ format: 'mp3', bitrate: 320, tags, coverFile: '/c.jpg', outFile: '/o.part' })
  assert.deepEqual(mp3.slice(mp3.indexOf('-c:a'), mp3.indexOf('-c:a') + 4), ['-c:a', 'libmp3lame', '-b:a', '320k'])
  assert.ok(mp3.includes('/c.jpg') && mp3.includes('attached_pic') && mp3.includes('-id3v2_version'))
  assert.equal(mp3[mp3.length - 1], '/o.part')
  assert.deepEqual(mp3.slice(-3, -1), ['-f', 'mp3'])
  const flac = R.ffmpegArgs({ format: 'flac', bitrate: 320, tags, coverFile: null, outFile: '/o.part' })
  assert.ok(!flac.includes('-b:a') && !flac.includes('attached_pic'), 'no bitrate for FLAC, no picture where none was given')
  const wma = R.ffmpegArgs({ format: 'wma', bitrate: 128, tags, coverFile: '/c.jpg', outFile: '/o.part' })
  assert.ok(wma.includes('wmav2') && wma.includes('128k') && !wma.includes('/c.jpg'), 'WMA takes no picture')
  assert.ok(R.ffmpegArgs({ format: 'alac', bitrate: 0, tags, coverFile: null, outFile: 'x' }).includes('alac'))
  assert.ok(R.ffmpegArgs({ format: 'aac', bitrate: 192, tags, coverFile: null, outFile: 'x' }).includes('192k'))
  // the tags, but not the empty ones
  assert.ok(mp3.includes('title=T') && mp3.includes('track=1/12') && mp3.includes('date=1991'))
  assert.ok(!mp3.some((a) => a.startsWith('genre=')))
  assert.throws(() => R.ffmpegArgs({ format: 'ogg', bitrate: 1, tags, outFile: 'x' }), /unknown format/)
})

test('the tags of a track: the artist of the track, else the album artist; a year is four digits', () => {
  const tags = R.trackTags({ album: 'Nevermind', albumArtist: 'Nirvana', genre: 'Grunge', year: '1991', track: { nr: 2, title: 'In Bloom', artist: '' }, tracks: 12 })
  assert.deepEqual(tags, { title: 'In Bloom', artist: 'Nirvana', album: 'Nevermind', album_artist: 'Nirvana', genre: 'Grunge', date: '1991', track: '2/12' })
  assert.equal(R.trackTags({ album: 'x', albumArtist: '', genre: '', year: '91', track: { nr: 1, title: '', artist: 'Y' }, tracks: 1 }).date, '')
  assert.equal(R.trackTags({ album: 'x', albumArtist: '', genre: '', year: '', track: { nr: 1, title: '', artist: '\u0000Y\n' }, tracks: 1 }).artist, 'Y')
})

test('the size to expect: bitrate times length for a lossy format, about two thirds of the WAV without loss', () => {
  const lbas = [0, 75 * 60, 75 * 120] // two minutes
  assert.equal(R.estimateBytes('mp3', 128, lbas), 120 * 16000)
  assert.equal(R.estimateBytes('flac', 0, lbas), Math.ceil(75 * 120 * R.SECTOR_BYTES * 0.65))
})

test('the picture kinds', () => {
  assert.equal(R.imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg')
  assert.equal(R.imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'png')
  assert.equal(R.imageKind(Buffer.from('GIF89a')), null)
  assert.equal(R.imageKind(null), null)
})

test('the album folder: a clean path below the category; nothing outside the media', () => {
  const media = tmp()
  fs.mkdirSync(path.join(media, 'music'))
  assert.deepEqual(R.albumDirectory(media, 'music', 'Nirvana', 'Nevermind'), { dir: path.join(media, 'music', 'Nirvana', 'Nevermind') })
  assert.match(R.albumDirectory(media, 'videos', 'a', 'b').error, /Kategorie/)
  assert.match(R.albumDirectory(media, 'music', '..', 'b').error, /Interpreten/)
  assert.match(R.albumDirectory(media, 'music', 'a', '  ').error, /Album/)
  assert.equal(R.albumDirectory(media, 'music', 'a/../../b', 'c').dir, path.join(media, 'music', 'a-..-..-b', 'c'), 'separators are made harmless')
  // a link that leads out of the media is no place to write
  try {
    fs.symlinkSync(tmp(), path.join(media, 'music', 'Link'), 'dir')
    assert.match(R.albumDirectory(media, 'music', 'Link', 'x').error, /nicht auf der Box/)
  } catch (err) {
    if (err.code !== 'EPERM') throw err // (Windows lets only an administrator make a link: the check runs on the box's tests)
  }
})

test('the artists of each category, the ones that exist', () => {
  const media = tmp()
  fs.mkdirSync(path.join(media, 'music', 'B'), { recursive: true })
  fs.mkdirSync(path.join(media, 'music', 'a'), { recursive: true })
  fs.mkdirSync(path.join(media, 'music', '.hidden'))
  fs.writeFileSync(path.join(media, 'music', 'file.txt'), '')
  assert.deepEqual(R.listArtists(media), { audiobook: [], music: ['a', 'B'], other: [] })
})

test('files that are there already are found - whatever the case', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, '01 Song.mp3'), '')
  assert.deepEqual(R.conflicts(dir, ['01 song.MP3', '02 Other.mp3']), ['01 song.MP3'])
  assert.deepEqual(R.conflicts(path.join(dir, 'nope'), ['a']), [])
})

// ---- the programs, pretended by node ----

/** A spawn that runs a node script in place of cdparanoia and of ffmpeg. */
function pretend({ readerScript, encoderScript }) {
  return (cmd, args, options) => spawn(process.execPath, ['-e', cmd === 'cdparanoia' ? readerScript : encoderScript, '--', ...args], options)
}
const readerOk = `const n = Number(process.env.WAV_BYTES || 4000); process.stdout.write(Buffer.alloc(n, 1)); process.stdout.end()`
// the encoder writes what it got into the last argument (the output file of ffmpeg's arguments)
const encoderOk = `const fs = require('fs'); const chunks = []; process.stdin.on('data', (c) => chunks.push(c)); process.stdin.on('end', () => { fs.writeFileSync(process.argv[process.argv.length - 1], Buffer.concat(chunks)) })`

test('one track: the disc is read, encoded into the file, and the bytes are counted', async () => {
  const dir = tmp()
  const out = path.join(dir, 'a.part')
  let seen = 0
  await R.ripTrack({ device: '/dev/null', number: 1, args: [out], outFile: out, onBytes: (n) => (seen = n), spawnImpl: pretend({ readerScript: readerOk, encoderScript: encoderOk }) })
  assert.equal(fs.statSync(out).size, 4000)
  assert.equal(seen, 4000 - 44)
})

test('one track: a reader that fails says what it said', async () => {
  const bad = `process.stderr.write('scsi error'); process.exit(3)`
  await assert.rejects(R.ripTrack({ device: '/dev/null', number: 1, args: [path.join(os.tmpdir(), 'cd-rip-never')], outFile: 'x', spawnImpl: pretend({ readerScript: bad, encoderScript: encoderOk }) }), /cdparanoia: scsi error/)
})

test('one track: an encoder that fails says what it said', async () => {
  const bad = `process.stdin.resume(); process.stderr.write('no codec'); process.exit(1)`
  await assert.rejects(R.ripTrack({ device: '/dev/null', number: 1, args: [path.join(os.tmpdir(), 'cd-rip-never')], outFile: 'x', spawnImpl: pretend({ readerScript: readerOk, encoderScript: bad }) }), /ffmpeg: no codec/)
})

test('one track: a program that is not installed is named', async () => {
  const gone = () => spawn('definitely-not-installed-xyz', [], { stdio: ['pipe', 'pipe', 'pipe'] })
  await assert.rejects(R.ripTrack({ device: '/dev/null', number: 1, args: [], outFile: 'x', spawnImpl: gone }), (err) => err.missing === 'cdparanoia' || err.missing === 'ffmpeg')
})

test('one track: cancelling stops both programs', async () => {
  const slow = `setInterval(() => process.stdout.write(Buffer.alloc(100)), 20)`
  const sink = `process.stdin.resume()`
  const controller = new AbortController()
  const run = R.ripTrack({ device: '/dev/null', number: 1, args: [path.join(os.tmpdir(), 'cd-rip-never')], outFile: 'x', signal: controller.signal, spawnImpl: pretend({ readerScript: slow, encoderScript: sink }) })
  setTimeout(() => controller.abort(), 150)
  await assert.rejects(run, (err) => err.cancelled === true)
})

// ---- the job ----

const plan = (dir, extra = {}) => ({
  dir,
  format: 'mp3',
  bitrate: 192,
  album: 'Nevermind',
  albumArtist: 'Nirvana',
  genre: 'Grunge',
  year: '1991',
  tracks: [1, 2, 3].map((nr) => ({ nr, number: nr, title: `Song ${nr}`, artist: '', bytes: 1000, file: R.trackFileName(nr, `Song ${nr}`, 'mp3') })),
  ...extra,
})
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
// a ripper that writes its file as the real one does, in the hidden .part file the job names
const writes = (log) => async (track, out, args, onBytes) => {
  log.push({ out, args })
  onBytes(500)
  fs.writeFileSync(out, `audio ${track.nr}`)
  onBytes(1000)
}

test('the job: files named by number and title, the picture beside them, nothing hidden left, progress up to the end', async () => {
  const dir = path.join(tmp(), 'music', 'Nirvana', 'Nevermind')
  const log = []
  const heard = []
  const job = R.startJob(plan(dir, { cover: { bytes: JPEG, replace: false } }), { rip: writes(log), report: (s) => heard.push(s) })
  assert.deepEqual(await job.done, { ok: true })
  assert.deepEqual(fs.readdirSync(dir).sort(), ['01 Song 1.mp3', '02 Song 2.mp3', '03 Song 3.mp3', 'cover.jpg'])
  assert.equal(fs.readFileSync(path.join(dir, '02 Song 2.mp3'), 'utf8'), 'audio 2')
  assert.ok(log[0].args.includes(path.join(dir, '.rip-cover.jpg')), 'the picture goes into the file')
  assert.equal(heard.at(-1).state, 'done')
  assert.equal(heard.at(-1).percent, 100)
  const percents = heard.filter((s) => s.state === 'running').map((s) => s.percent)
  assert.deepEqual(percents, [...percents].sort((a, b) => a - b), 'the progress only goes up')
  assert.ok(percents.every((p) => p < 100))
})

test('the job: the album keeps its own cover unless the user chose another', async () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'cover.jpg'), 'mine')
  await R.startJob(plan(dir, { cover: { bytes: JPEG, replace: false } }), { rip: writes([]) }).done
  assert.equal(fs.readFileSync(path.join(dir, 'cover.jpg'), 'utf8'), 'mine')
  await R.startJob(plan(dir, { tracks: plan(dir).tracks.map((t) => ({ ...t, file: `x${t.file}` })), cover: { bytes: JPEG, replace: true } }), { rip: writes([]) }).done
  assert.deepEqual(fs.readFileSync(path.join(dir, 'cover.jpg')), JPEG)
})

test('the job: a track that fails keeps the tracks that are done - only the half written one goes', async () => {
  const root = tmp()
  const dir = path.join(root, 'music', 'New Artist', 'New Album')
  const heard = []
  const failing = async (track, out, args, onBytes) => {
    if (track.nr === 3) {
      fs.writeFileSync(out, 'half')
      throw new Error('cdparanoia: scsi error')
    }
    await writes([])(track, out, args, onBytes)
  }
  const result = await R.startJob(plan(dir, { cover: { bytes: JPEG, replace: true } }), { rip: failing, report: (s) => heard.push(s) }).done
  assert.equal(result.ok, false)
  assert.match(result.error, /scsi error/)
  assert.deepEqual(fs.readdirSync(dir).sort(), ['01 Song 1.mp3', '02 Song 2.mp3', 'cover.jpg'], 'the finished tracks and the picture stay, nothing hidden is left')
  assert.equal(heard.at(-1).state, 'failed')
  assert.equal(heard.at(-1).finished, 2)
  assert.deepEqual(heard.at(-1).percents, [100, 100, 0])
  assert.match(heard.at(-1).message, /scsi error/)
})

test('the job: when not one track was done, nothing is left - no picture, no folder it made', async () => {
  const root = tmp()
  const dir = path.join(root, 'music', 'New Artist', 'New Album')
  const heard = []
  const failing = async (track, out) => {
    fs.writeFileSync(out, 'half')
    throw new Error('scsi error')
  }
  await R.startJob(plan(dir, { cover: { bytes: JPEG, replace: true } }), { rip: failing, report: (s) => heard.push(s) }).done
  assert.equal(fs.existsSync(path.join(root, 'music')), false)
  assert.equal(heard.at(-1).finished, 0)
})

test('the job: every track tells how far it is', async () => {
  const dir = tmp()
  const heard = []
  const rip = async (track, out, args, onBytes) => {
    onBytes(250)
    onBytes(500)
    fs.writeFileSync(out, 'x')
  }
  await R.startJob(plan(dir), { rip, report: (s) => heard.push(s) }).done
  const during = heard.find((s) => s.track === 2 && s.percents[1] === 25)
  assert.deepEqual(during.percents, [100, 25, 0])
  assert.equal(during.finished, 1)
  assert.deepEqual(heard.at(-1).percents, [100, 100, 100])
})

test('the job: what was in the folder before stays when the job fails', async () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, '01 Old.mp3'), 'old')
  await R.startJob(plan(dir), { rip: async () => Promise.reject(new Error('boom')) }).done
  assert.deepEqual(fs.readdirSync(dir), ['01 Old.mp3'])
})

test('the job: cancelling ends it as cancelled; the tracks that were done stay', async () => {
  const dir = path.join(tmp(), 'a', 'b')
  const heard = []
  let job
  const rip = async (track, out, args, onBytes, signal) => {
    fs.writeFileSync(out, 'half')
    if (track.nr === 2) {
      job.cancel()
      // (as the real ripper: the programs are stopped, the track ends with an error)
      if (signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true })
    }
    onBytes(1000)
  }
  job = R.startJob(plan(dir), { rip, report: (s) => heard.push(s) })
  const result = await job.done
  assert.equal(result.cancelled, true)
  assert.equal(heard.at(-1).state, 'cancelled')
  assert.equal(heard.at(-1).finished, 1)
  assert.deepEqual(fs.readdirSync(dir), ['01 Song 1.mp3'])
})

test('the job: the programs are named when one is missing', async () => {
  const dir = tmp()
  const heard = []
  await R.startJob(plan(dir), { rip: async () => Promise.reject(Object.assign(new Error('ffmpeg: spawn ffmpeg ENOENT'), { missing: 'ffmpeg' })), report: (s) => heard.push(s) }).done
  assert.equal(heard.at(-1).missing, 'ffmpeg')
})
