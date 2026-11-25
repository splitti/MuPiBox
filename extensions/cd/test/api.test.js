// The routes of the API part (api.js) for the rip, with a pretend host and a pretend player.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const api = require('../api.js')

function setup({ player = {}, settings = {}, withTools = true } = {}) {
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-api-'))
  fs.mkdirSync(path.join(media, 'music', 'Abba'), { recursive: true })
  const routes = {}
  const host = {
    playerUrl: 'http://player',
    paths: { media },
    settings: () => settings,
    log: { info() {}, debug() {}, warn() {} },
    libraryChanged: () => (host.changed = (host.changed ?? 0) + 1),
    route: (method, sub, handler, options) => (routes[`${method} ${sub}`] = { handler, options }),
  }
  // a directory with two programs that are none (found by name and the executable bit)
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-bin-'))
  if (withTools) for (const name of ['cdparanoia', 'ffmpeg']) fs.writeFileSync(path.join(bin, name), '', { mode: 0o755 })
  process.env.PATH = bin
  const asked = []
  global.fetch = async (url) => {
    asked.push(String(url))
    const route = String(url).replace('http://player/ext/cd', '').split('?')[0]
    const answer = player[route]
    if (answer === undefined) throw new Error('player not there')
    return { ok: true, json: async () => answer }
  }
  api.activate(host)
  const call = async (key, req = {}) => {
    let out
    await routes[key].handler({ body: {}, query: {}, headers: {}, ...req }, { json: (v) => (out = v) })
    return out
  }
  return { host, routes, call, media, asked }
}

const disc = { present: true, tracks: 2, id: 1, first: 1, lbas: [0, 15000, 30000], info: { album: 'Arrival', artist: 'Abba', tracks: [{ title: 'A' }, { title: 'B' }] } }

test('every route of the rip needs the parents\' login', () => {
  const { routes } = setup()
  for (const key of ['get /ripform', 'get /riplookup', 'post /rip', 'post /ripcancel', 'get /ripstatus']) assert.equal(routes[key].options?.session, true, key)
  assert.equal(routes['get /cover'].options, undefined, 'the cover is public (the display shows it)')
})

test('the dialog opens for a disc, with the folders of the media', async () => {
  const { call } = setup({ player: { '/info': disc } })
  const form = await call('get /ripform')
  assert.equal(form.ok, true)
  assert.deepEqual(form.fields.find((f) => f.key === 'artistFolder').optionsBy.map.music, ['Abba'])
  assert.equal(form.rows.items.length, 2)
})

test('the dialog says why it does not open', async () => {
  assert.match((await setup({ player: { '/info': { present: false } } }).call('get /ripform')).message, /keine Audio-CD/)
  assert.match((await setup({ player: {} }).call('get /ripform')).message, /Player/)
  assert.match((await setup({ player: { '/info': { ...disc, ripping: true } } }).call('get /ripform')).message, /gelesen/)
  const missing = await setup({ player: { '/info': disc }, withTools: false }).call('get /ripform')
  assert.equal(missing.ok, false)
  assert.match(missing.message, /cdparanoia und ffmpeg fehlen/)
})

test('a rip is refused with a word when the folder or the disc is wrong - and the player is not asked to take the disc', async () => {
  const { call, asked } = setup({ player: { '/info': disc, '/ripping': { ok: true } } })
  const values = { album: 'Arrival', albumArtist: 'Abba', genre: '', year: '', category: 'music', artistFolder: 'Abba', albumFolder: 'Arrival' }
  const rows = [{ title: 'A' }, { title: 'B' }]
  assert.match((await call('post /rip', { body: { values, rows: [{}] } })).message, /gewechselt/)
  assert.match((await call('post /rip', { body: { values: { ...values, category: 'x' }, rows } })).message, /Kategorie/)
  assert.ok(!asked.some((u) => u.includes('/ripping')))
})

test('a rip that finds its files there already says so, and the status says "ready"', async () => {
  const { call, media, asked } = setup({ player: { '/info': disc, '/ripping': { ok: true } } })
  const dir = path.join(media, 'music', 'Abba', 'Arrival')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '01 A.mp3'), '')
  const values = { album: 'Arrival', albumArtist: 'Abba', genre: '', year: '', category: 'music', artistFolder: 'Abba', albumFolder: 'Arrival' }
  const answer = await call('post /rip', { body: { values, rows: [{ title: 'A' }, { title: 'B' }] } })
  assert.equal(answer.ok, false)
  assert.match(answer.message, /01 A\.mp3/)
  assert.ok(!asked.some((u) => u.includes('/ripping')))
  assert.deepEqual((await call('get /ripstatus')).rows[0].value, 'Bereit – 2 Titel auf der CD')
})

test('nothing to cancel', async () => {
  assert.equal((await setup().call('post /ripcancel')).ok, false)
})
