// Who is this CD? (src/cd-lookup.js) over a pretend internet: no network needed (npm test).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const L = require('../cd-lookup.js')

// a real disc of MusicBrainz (Nirvana - Nevermind, 12 tracks): its id and table of contents as MusicBrainz lists them
const REAL = { id: '2y0jFMwYQP7gb9iSUKagmoT6DIw-', offsets: [150, 22767, 41887, 58317, 72102, 91375, 104652, 115380, 132165, 143932, 159870, 174597], sectors: 267225 }
const lbas = [...REAL.offsets.map((o) => o - 150), REAL.sectors - 150]
const disc = { first: 1, last: 12, lbas }

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
// a fetch that answers by the start of the address; records what was asked
function pretendInternet(routes) {
  const asked = []
  const fetchImpl = async (url, options) => {
    asked.push({ url, headers: options?.headers ?? {} })
    for (const [start, answer] of routes) if (String(url).startsWith(start)) return typeof answer === 'function' ? answer(url) : answer
    return json({}, 404)
  }
  return { fetchImpl, asked }
}

const mbRelease = (count = 12) => ({
  releases: [
    {
      id: 'rel-1',
      title: 'Nevermind',
      'artist-credit': [{ name: 'Nirvana', joinphrase: '' }],
      'cover-art-archive': { front: true },
      media: [{ discs: [{ id: REAL.id }], tracks: Array.from({ length: count }, (_, i) => ({ position: i + 1, title: `Song ${i + 1}` })) }],
    },
  ],
})

// Discogs: a release whose lengths are the disc's own
const discogsRelease = (seconds) => ({
  title: 'Nevermind (Remastered)',
  artists: [{ name: 'Nirvana', join: '' }],
  images: [{ type: 'secondary', uri: 'https://img/other.jpg' }, { type: 'primary', uri: 'https://img/front.jpg' }],
  tracklist: [{ type_: 'heading', title: 'Disc' }, ...seconds.map((s, i) => ({ type_: 'track', position: `${i + 1}`, title: `Track ${i + 1}`, duration: `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` }))],
})

test("the disc id is MusicBrainz's own (checked against a real disc)", () => {
  assert.equal(L.musicBrainzDiscId(1, 12, lbas), REAL.id)
})

test('the table of contents parameter: first, last, end of the disc, then the starts (with the lead-in)', () => {
  assert.equal(L.musicBrainzToc(1, 12, lbas), `1+12+267225+${REAL.offsets.join('+')}`)
})

test('track lengths in seconds from where the tracks start', () => {
  const s = L.trackSeconds([0, 75, 225, 300])
  assert.deepEqual(s, [1, 2, 1])
})

test('lengths fit the disc: same count, most of them within 4 seconds', () => {
  const disc3 = [180, 200, 220]
  assert.equal(L.fitsDisc([181, 199, 222], disc3), true)
  assert.equal(L.fitsDisc([181, 199], disc3), false)
  assert.equal(L.fitsDisc([100, 200, 222], disc3), false) // 1 of 3 is far off
  assert.equal(L.fitsDisc([Number.NaN, Number.NaN, Number.NaN], disc3), true) // no lengths: the count has to do
})

test('MusicBrainz: the names of the tracks, the artist and the cover of the Cover Art Archive', async () => {
  const net = pretendInternet([['https://musicbrainz.org/ws/2/discid/', json(mbRelease())]])
  const info = await L.lookupDisc(disc, { fetchImpl: net.fetchImpl })
  assert.equal(info.source, 'musicbrainz')
  assert.equal(info.artist, 'Nirvana')
  assert.equal(info.album, 'Nevermind')
  assert.equal(info.tracks.length, 12)
  assert.equal(info.tracks[0].title, 'Song 1')
  assert.equal(info.coverUrl, 'https://coverartarchive.org/release/rel-1/front-500')
  // asked by the disc's id with the table of contents, and as the project (a User-Agent MusicBrainz asks for)
  assert.match(net.asked[0].url, new RegExp(`/discid/${REAL.id.replace('-', '\\-')}\\?toc=1\\+12\\+267225`))
  assert.match(net.asked[0].headers['User-Agent'], /MuPiBox/)
})

test('MusicBrainz: a release with another number of tracks is no match; an unknown disc is null', async () => {
  const wrong = pretendInternet([['https://musicbrainz.org/', json(mbRelease(9))]])
  assert.equal(await L.lookupDisc(disc, { fetchImpl: wrong.fetchImpl }), null)
  const unknown = pretendInternet([])
  assert.equal(await L.lookupDisc(disc, { fetchImpl: unknown.fetchImpl }), null)
})

test('Discogs first: with a token and the disc\'s barcode, a release that fits wins - MusicBrainz is not asked', async () => {
  const seconds = L.trackSeconds(lbas)
  const net = pretendInternet([
    ['https://api.discogs.com/database/search', json({ results: [{ id: 77 }] })],
    ['https://api.discogs.com/releases/77', json(discogsRelease(seconds))],
    ['https://musicbrainz.org/', json(mbRelease())],
  ])
  const info = await L.lookupDisc({ ...disc, barcode: '0720642442524' }, { token: 'T0KEN', fetchImpl: net.fetchImpl })
  assert.equal(info.source, 'discogs')
  assert.equal(info.artist, 'Nirvana')
  assert.equal(info.album, 'Nevermind (Remastered)')
  assert.equal(info.tracks.length, 12)
  assert.equal(info.coverUrl, 'https://img/front.jpg')
  assert.equal(net.asked.every((a) => a.url.startsWith('https://api.discogs.com/')), true)
  assert.match(net.asked[0].url, /barcode=0720642442524/)
  assert.equal(net.asked[0].headers.Authorization, 'Discogs token=T0KEN')
})

test('Discogs does not fit (other lengths) or finds nothing: MusicBrainz answers', async () => {
  const net = pretendInternet([
    ['https://api.discogs.com/database/search', json({ results: [{ id: 77 }] })],
    ['https://api.discogs.com/releases/77', json(discogsRelease(Array.from({ length: 12 }, () => 999)))],
    ['https://musicbrainz.org/', json(mbRelease())],
  ])
  const info = await L.lookupDisc({ ...disc, barcode: '0720642442524' }, { token: 'T0KEN', fetchImpl: net.fetchImpl })
  assert.equal(info.source, 'musicbrainz')
})

test('Discogs is not asked without a token or without a barcode', async () => {
  const net = pretendInternet([['https://musicbrainz.org/', json(mbRelease())]])
  assert.equal((await L.lookupDisc({ ...disc, barcode: '1' }, { token: '', fetchImpl: net.fetchImpl })).source, 'musicbrainz')
  assert.equal((await L.lookupDisc(disc, { token: 'T', fetchImpl: net.fetchImpl })).source, 'musicbrainz')
  assert.equal(net.asked.some((a) => a.url.includes('discogs')), false)
})

test('a failing Discogs (refused token, no internet) is no reason to skip MusicBrainz', async () => {
  const net = pretendInternet([
    ['https://api.discogs.com/', json({}, 401)],
    ['https://musicbrainz.org/', json(mbRelease())],
  ])
  const logged = []
  const info = await L.lookupDisc({ ...disc, barcode: '1' }, { token: 'bad', fetchImpl: net.fetchImpl, log: (m) => logged.push(m) })
  assert.equal(info.source, 'musicbrainz')
  assert.match(logged[0], /Discogs: .*401/)
})

test('lengths from Discogs: minutes and seconds, also hours', () => {
  assert.equal(L.discogsSeconds('3:45'), 225)
  assert.equal(L.discogsSeconds('1:02:03'), 3723)
  assert.ok(Number.isNaN(L.discogsSeconds('')))
})

test('a cover: only a picture, never anything else', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  const ok = async () => ({ ok: true, arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.length) })
  assert.equal((await L.downloadCover({ coverUrl: 'https://x/y.jpg' }, ok)).length, 7)
  const html = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>').buffer })
  assert.equal(await L.downloadCover({ coverUrl: 'https://x/y.jpg' }, html), null)
  assert.equal(await L.downloadCover({ coverUrl: null }, ok), null)
  assert.equal(await L.downloadCover({ coverUrl: 'https://x' }, async () => { throw new Error('offline') }), null)
})
