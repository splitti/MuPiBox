// The player's extension host (src/extensions.js): extensions in a temporary folder, a pretend express app - no box (npm test).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const E = require('../src/extensions.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-ext-'))

function install(extDir, id, { manifest = {}, player = 'exports.activate = () => {}', enabled = true } = {}) {
  const dir = path.join(extDir, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, name: id, version: '1.0.0', hostApi: 1, player: 'player.js', ...manifest }))
  fs.writeFileSync(path.join(dir, 'player.js'), player)
  const stateFile = path.join(extDir, 'state.json')
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, [id]: { version: '1.0.0', enabled } }))
}

function pretendApp() {
  const routes = {}
  return { routes, get: (p, h) => (routes[`GET ${p}`] = h), post: (p, h) => (routes[`POST ${p}`] = h) }
}

const logs = []
const log = { debug: () => {}, info: () => {}, warn: (t) => logs.push(t) }
const meta = { album: '', path: '', totalTracks: 0 }
const engine = { command: async () => null }
const hostOf = (extDir, app = pretendApp()) => ({ app, host: E.createExtensionHost({ app, log, getConfig: () => ({}), getMeta: () => meta, engine, extDir }) })

test('only extensions that are installed, switched on and made for this host are loaded', () => {
  const dir = tmp()
  install(dir, 'on')
  install(dir, 'off', { enabled: false })
  install(dir, 'future', { manifest: { hostApi: 99 } })
  install(dir, 'wrongid', { manifest: { id: 'other' } })
  assert.deepEqual(E.enabledExtensions(dir).map((e) => e.id), ['on'])
  assert.equal(E.readManifest(dir, '../x'), null)
})

test('an extension is started with a host: its routes live under /ext/<id>/', () => {
  const dir = tmp()
  install(dir, 'demo', { player: `exports.activate = (host) => { host.route('get', '/hello', (req, res) => res.json({ id: host.id })) }` })
  const { app, host } = hostOf(dir)
  assert.deepEqual(host.load(), ['demo'])
  const out = {}
  app.routes['GET /ext/demo/hello']({}, { json: (b) => (out.body = b), headersSent: false })
  assert.deepEqual(out.body, { id: 'demo' })
})

test('a route of the wrong kind is refused when the extension starts; the extension then is not running', () => {
  const dir = tmp()
  install(dir, 'bad', { player: `exports.activate = (host) => host.route('delete', '/x', () => {})` })
  const { host } = hostOf(dir)
  assert.deepEqual(host.load(), [])
  assert.deepEqual(host.running, [])
})

test('an album source: the player finds it by folder name; its calls are guarded', async () => {
  const dir = tmp()
  install(dir, 'cdlike', {
    player: `exports.activate = (host) => host.albums.register({ folder: '_virtual_', play: () => ({ album: 'A' }), tracklist: () => [{ position: 1, name: 'One' }], progress: () => { throw new Error('boom') } })`,
  })
  const { host } = hostOf(dir)
  host.load()
  const p = host.albumFor('_virtual_')
  assert.deepEqual(p.play(), { album: 'A' })
  assert.deepEqual(p.tracklist(), [{ position: 1, name: 'One' }])
  assert.equal(host.albumFor('/music/real'), undefined)
  // a throwing call gives the fallback, no exception
  assert.equal(p.progress(1, 0), undefined)
})

test('five errors switch an extension off for the session; the others go on', () => {
  const dir = tmp()
  install(dir, 'flaky', { player: `exports.activate = (host) => { host.on('stop', () => { throw new Error('no') }); host.albums.register({ folder: '_flaky_', play: () => 1 }) }` })
  install(dir, 'fine', { player: `exports.activate = (host) => { host.on('stop', () => { host.meta().album = 'seen' }) }` })
  const { host } = hostOf(dir)
  assert.deepEqual(host.load().sort(), ['fine', 'flaky'])
  for (let i = 0; i < 5; i++) host.emit('stop')
  assert.deepEqual(host.running, ['fine'])
  assert.equal(host.albumFor('_flaky_'), undefined)
  assert.equal(meta.album, 'seen')
  host.emit('stop') // (no more calls to the stopped one, no more errors)
})

test('a folder name is taken once; an unknown event is refused', () => {
  const dir = tmp()
  install(dir, 'one', { player: `exports.activate = (h) => h.albums.register({ folder: '_same_', play: () => 1 })` })
  install(dir, 'two', { player: `exports.activate = (h) => h.albums.register({ folder: '_same_', play: () => 1 })` })
  install(dir, 'three', { player: `exports.activate = (h) => h.on('nonsense', () => {})` })
  const { host } = hostOf(dir)
  assert.deepEqual(host.load().sort(), ['one'])
})

test('settings: the extension\'s own file, the defaults of its manifest behind it', () => {
  const dir = tmp()
  install(dir, 'conf', {
    manifest: { settings: { lookup: { type: 'boolean', default: true }, token: { type: 'secret' } } },
    player: `exports.activate = (h) => { h.setMetaTest = () => {}; h.log.debug(String(h.settings.get('lookup'))); h.settings.set('token', 'abc'); h.on('config', () => {}) }`,
  })
  const s = E.createSettings(dir, 'conf', E.readManifest(dir, 'conf'))
  assert.equal(s.get('lookup'), true)
  assert.equal(s.get('token', ''), '')
  s.set('token', 'abc')
  assert.equal(s.get('token'), 'abc')
  s.set('lookup', false)
  assert.deepEqual(s.all(), { lookup: false, token: 'abc' })
})

test('settings per user (hostApi 13): those of the user in place, the box\'s value behind them', () => {
  // (the users' file is next to the extensions' folder)
  const root = tmp()
  const dir = path.join(root, 'extensions')
  install(dir, 'club', { manifest: { hostApi: 13, settings: { team: { type: 'string', default: '', perUser: true }, league: { type: 'string', default: 'bl1' } } } })
  const s = E.createSettings(dir, 'club', E.readManifest(dir, 'club'))
  // (no users' file: the one user "main")
  s.set('team', 'SVW')
  s.set('league', 'bl2')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings', 'club.json'), 'utf8')), { '@users': { main: { team: 'SVW' } }, league: 'bl2' })
  assert.deepEqual(s.all(), { team: 'SVW', league: 'bl2' })
  fs.mkdirSync(path.join(root, 'users'))
  fs.writeFileSync(path.join(root, 'users', 'users.json'), JSON.stringify({ current: 'leni', users: [{ id: 'main' }, { id: 'leni' }] }))
  assert.deepEqual(s.all(), { team: '', league: 'bl2' })
  s.set('team', 'FCB')
  assert.equal(s.get('team'), 'FCB')
  fs.writeFileSync(path.join(root, 'users', 'users.json'), JSON.stringify({ current: 'gone', users: [{ id: 'main' }, { id: 'leni' }] }))
  assert.equal(s.get('team'), 'SVW')
})

test('an extension sets only the fields of the playback it may', () => {
  const dir = tmp()
  install(dir, 'meta', { player: `exports.activate = (h) => h.on('track', () => h.setMeta({ album: 'Album', totalTracks: 3, volume: 99 }))` })
  const { host } = hostOf(dir)
  host.load()
  host.emit('track')
  assert.equal(meta.album, 'Album')
  assert.equal(meta.totalTracks, 3)
  assert.equal(meta.volume, undefined)
})

test('the configuration an extension sees has no secrets, at any depth', () => {
  const out = E.redactSecrets({ mupibox: { theme: 'dark', token: 'x', nested: [{ password: 'p', ok: 1 }] }, discogs: { token: 't' }, telegram: { chatId: '1', token: 'y' } })
  assert.deepEqual(out, { mupibox: { theme: 'dark', nested: [{ ok: 1 }] }, discogs: {}, telegram: { chatId: '1' } })
})
