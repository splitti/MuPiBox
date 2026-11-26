// The dialog of the rip (cd-rip-form.js): what it offers, and the check of what comes back.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildForm, parseRequest } = require('../cd-rip-form.js')

const disc = { present: true, tracks: 3, id: 7, first: 1, lbas: [0, 15000, 30000, 45000] }
const info = { album: 'Nevermind', artist: 'Nirvana', year: '1991', genre: 'Grunge', hasCover: true, tracks: [{ title: 'A', artist: 'Kurt' }, { title: 'B' }, { title: 'C' }] }
const artists = { audiobook: ['Bibi'], music: ['Abba', 'Nirvana'], other: [] }
const mediaDir = () => {
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-form-'))
  fs.mkdirSync(path.join(media, 'music'))
  return media
}

test('the dialog: what the internet knows is filled in, the folders suggest the existing ones', () => {
  const form = buildForm({ disc, info, settings: { format: 'mp3', bitrate: 320 }, artists, hasCover: true })
  const value = (key) => form.fields.find((f) => f.key === key).value
  assert.equal(value('album'), 'Nevermind')
  assert.equal(value('albumArtist'), 'Nirvana')
  assert.equal(value('genre'), 'Grunge')
  assert.equal(value('year'), '1991')
  assert.equal(value('category'), 'music')
  assert.equal(value('artistFolder'), 'Nirvana')
  assert.equal(value('albumFolder'), 'Nevermind')
  assert.deepEqual(form.fields.find((f) => f.key === 'artistFolder').optionsBy, { key: 'category', map: artists })
  assert.deepEqual(form.fields.find((f) => f.key === 'category').options.map((o) => o.value), ['audiobook', 'music', 'other'])
  assert.equal(form.image.url, '/api/ext/cd/cover?v=7')
  assert.deepEqual(form.rows.items, [{ nr: 1, title: 'A', artist: 'Kurt' }, { nr: 2, title: 'B', artist: 'Nirvana' }, { nr: 3, title: 'C', artist: 'Nirvana' }])
  assert.match(form.message, /MP3, 320 kbit\/s/)
})

test('the dialog: a disc nobody knows gets names to be filled in', () => {
  const form = buildForm({ disc, info: null, settings: { format: 'flac', bitrate: 320 }, artists, hasCover: false })
  assert.equal(form.fields.find((f) => f.key === 'album').value, 'Audio-CD')
  assert.equal(form.fields.find((f) => f.key === 'artistFolder').value, 'Unbekannt')
  assert.equal(form.image.url, null)
  assert.equal(form.rows.items.length, 3)
  assert.match(form.message, /FLAC \(ohne Qualitätsverlust\)/)
})

const body = (extra = {}) => ({
  values: { album: 'Nevermind', albumArtist: 'Nirvana', genre: 'Grunge', year: '1991', category: 'music', artistFolder: 'Nirvana', albumFolder: 'Nevermind' },
  rows: [{ title: 'A', artist: 'Kurt' }, { title: 'B', artist: '' }, { title: '' }],
  image: null,
  ...extra,
})

test('the request: a plan with the tracks named, numbered on the disc and sized by their length', () => {
  const media = mediaDir()
  const { plan, error } = parseRequest(body(), { disc, settings: { format: 'aac', bitrate: 256 }, media, mediaCover: path.join(media, 'cover') })
  assert.equal(error, undefined)
  assert.equal(plan.dir, path.join(media, 'music', 'Nirvana', 'Nevermind'))
  assert.equal(plan.format, 'aac')
  assert.deepEqual(plan.tracks.map((t) => t.file), ['01 A.m4a', '02 B.m4a', '03 Track 03.m4a'])
  assert.deepEqual(plan.tracks.map((t) => t.artist), ['Kurt', 'Nirvana', 'Nirvana'], 'a track without an artist has the album artist')
  assert.deepEqual(plan.tracks.map((t) => t.number), [1, 2, 3])
  assert.equal(plan.tracks[0].bytes, 15000 * 2352 + 44)
  assert.deepEqual(plan.cover, { kind: 'disc' })
})

test('the request: tracks of a disc that starts at another number keep the numbers of the disc', () => {
  const media = mediaDir()
  const { plan } = parseRequest(body(), { disc: { ...disc, first: 5 }, settings: { format: 'mp3', bitrate: 128 }, media, mediaCover: media })
  assert.deepEqual(plan.tracks.map((t) => t.number), [5, 6, 7])
  assert.deepEqual(plan.tracks.map((t) => t.nr), [1, 2, 3])
})

test('the request: a picture the user chose is one of the box\'s own pictures - nothing else', () => {
  const media = mediaDir()
  const ctx = { disc, settings: { format: 'mp3', bitrate: 128 }, media, mediaCover: path.join(media, 'cover') }
  const picked = parseRequest(body({ image: 'http://mupibox/cover/cd-cover-ab12cd.jpg' }), ctx).plan.cover
  assert.deepEqual(picked, { kind: 'picked', file: path.join(media, 'cover', 'cd-cover-ab12cd.jpg') })
  assert.match(parseRequest(body({ image: 'http://x/cover/..%2F..%2Fetc%2Fpasswd' }), ctx).error, /Cover/)
  assert.match(parseRequest(body({ image: 'http://x/cover/evil.sh' }), ctx).error, /Cover/)
})

test('the request: what is wrong is told in words', () => {
  const media = mediaDir()
  const ctx = { disc, settings: { format: 'mp3', bitrate: 128 }, media, mediaCover: media }
  const withValues = (v) => body({ values: { ...body().values, ...v } })
  assert.match(parseRequest(withValues({ album: '  ' }), ctx).error, /Albumnamen/)
  assert.match(parseRequest(withValues({ year: '91' }), ctx).error, /vier Ziffern/)
  assert.match(parseRequest(withValues({ category: 'videos' }), ctx).error, /Kategorie/)
  assert.match(parseRequest(withValues({ artistFolder: '' }), ctx).error, /Interpreten/)
  assert.match(parseRequest(withValues({ albumFolder: '..' }), ctx).error, /Album/)
  assert.match(parseRequest(body(), { ...ctx, disc: { ...disc, lbas: [0, 1] } }).error, /Inhaltsverzeichnis/)
})

test('the request: a format the box does not know falls back to MP3', () => {
  const media = mediaDir()
  const { plan } = parseRequest(body(), { disc, settings: { format: 'ogg', bitrate: 128 }, media, mediaCover: media })
  assert.equal(plan.format, 'mp3')
})
