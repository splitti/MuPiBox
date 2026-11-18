'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const voice = require('../voice.js')

const manifest = require('../manifest.json')

test('every message has a switch and a text in the manifest, and a default in every language', () => {
  for (const [id, keys] of Object.entries(voice.MESSAGES)) {
    assert.equal(manifest.settings[keys.on].type, 'boolean', id)
    assert.equal(manifest.settings[keys.on].default, true, id)
    assert.equal(manifest.settings[keys.text].type, 'string', id)
    assert.equal(manifest.settings[keys.text].default, voice.DEFAULTS.de[id], `${id}: the setting starts with the German text`)
    for (const [lang, texts] of Object.entries(voice.DEFAULTS)) assert.ok(texts[id] && texts[id].length <= 200, `${lang} ${id}`)
  }
  assert.equal(Object.keys(voice.MESSAGES).length, 8)
})

test('the text: the user\'s own, else the default of the language of the box; nothing when it is switched off', () => {
  const settings = { sayTagNewOn: true, sayTagNewText: voice.DEFAULTS.de.tagNew }
  assert.equal(voice.textOf(settings, 'tagNew', 'de'), voice.DEFAULTS.de.tagNew)
  assert.equal(voice.textOf(settings, 'tagNew', 'en'), voice.DEFAULTS.en.tagNew, 'the German default is not said by a box that speaks English')
  assert.equal(voice.textOf(settings, 'tagNew', 'ar'), voice.DEFAULTS.en.tagNew, 'a language without defaults: English')
  assert.equal(voice.textOf({ sayTagNewText: ' Neuer Tag! ' }, 'tagNew', 'en'), 'Neuer Tag!', 'an own text is said as it is')
  assert.equal(voice.textOf({ sayTagNewText: '' }, 'tagNew', 'fr'), voice.DEFAULTS.fr.tagNew, 'an empty text: the default')
  assert.equal(voice.textOf({ sayTagNewOn: false }, 'tagNew', 'de'), '')
  assert.equal(voice.textOf({}, 'nothing', 'de'), '')
})

test('the language of the box', () => {
  assert.equal(voice.languageOf({ mupibox: { ttsLanguage: 'en' } }), 'en')
  assert.equal(voice.languageOf({ mupibox: { ttsLanguage: 'no' } }), 'nb')
  assert.equal(voice.languageOf({}), 'de')
  assert.equal(voice.languageOf({ mupibox: { ttsLanguage: 'English' } }), 'de')
})

test('the network file: no router, trouble, weak, ok', () => {
  const online = { onlinestate: 'online', wifi: 'Home', ip: '192.168.1.5', wifisignal: '-60 dBm' }
  assert.equal(voice.networkVerdict(online), 'ok')
  assert.equal(voice.networkVerdict({ ...online, wifisignal: '-75 dBm' }), 'weak')
  assert.equal(voice.networkVerdict({ ...online, wifisignal: '-76 dBm' }), 'weak')
  assert.equal(voice.networkVerdict({ ...online, wifisignal: '-74 dBm' }), 'ok')
  assert.equal(voice.networkVerdict({ ...online, wifisignal: '' }), 'ok', 'no signal value: not weak')
  assert.equal(voice.networkVerdict({ onlinestate: 'online', wifi: '', ip: '192.168.1.5', wifisignal: '' }), 'ok', 'a cable')
  assert.equal(voice.networkVerdict({ ...online, onlinestate: 'offline' }), 'trouble', 'joined, but no way out')
  assert.equal(voice.networkVerdict({ onlinestate: 'offline', wifi: '', ip: '' }), 'noRouter')
  assert.equal(voice.networkVerdict({ onlinestate: 'offline', wifi: 'Home', ip: '' }), 'noRouter', 'no address from the router')
  assert.equal(voice.networkVerdict({ onlinestate: 'starting' }), null)
  assert.equal(voice.networkVerdict(null), null)
  assert.deepEqual(['noRouter', 'trouble', 'weak'].map((v) => voice.NETWORK_MESSAGE[v]), ['noRouter', 'wifiTrouble', 'wifiWeak'])
})

test('a medium needs the network unless it is on the SD card; the NAS address', () => {
  assert.equal(voice.needsNetwork({ type: 'library' }), false)
  for (const type of ['nas', 'spotify', 'radio', 'rss', 'tidal']) assert.equal(voice.needsNetwork({ type }), true, type)
  assert.equal(voice.needsNetwork(null), false)
  assert.equal(voice.nasUrl({ nas: { address: '192.168.1.20:5000' } }), 'http://192.168.1.20:5000')
  assert.equal(voice.nasUrl({ nas: { address: 'nas.local', https: true } }), 'https://nas.local')
  assert.equal(voice.nasUrl({ nas: { address: 'https://nas.local:5001' } }), 'https://nas.local:5001')
  assert.equal(voice.nasUrl({ nas: { address: '  ' } }), '')
  assert.equal(voice.nasUrl({}), '')
})

test('the battery: said once at 10 %, not while charging, again after it was above 15 % or charged', () => {
  const hat = (percent, extra = {}) => ({ Bat_Percent: percent, Ibat: -300, BatteryConnected: 1, Measurement_Valid: true, ...extra })
  const watch = voice.batteryWatch()
  assert.equal(watch(hat(40)), false)
  assert.equal(watch(hat(11)), false)
  assert.equal(watch(hat(10)), true, 'at 10 %')
  assert.equal(watch(hat(9)), false, 'once')
  assert.equal(watch(hat(5)), false)
  assert.equal(watch(hat(12)), false, 'still low-ish: not armed again')
  assert.equal(watch(hat(10)), false)
  assert.equal(watch(hat(20)), false, 'above 15 %: armed again')
  assert.equal(watch(hat(9)), true)
  // charging: nothing is said, and the next low is new
  const charged = voice.batteryWatch()
  assert.equal(charged(hat(8, { Ibat: 900 })), false, 'plugged in')
  assert.equal(charged(hat(9)), true, 'unplugged again and low')
  // no battery, no HAT, stale or invalid values
  for (const bad of [{}, null, hat(5, { BatteryConnected: 0 }), hat(5, { Bat_PercentSource: 'none' }), hat(5, { Measurement_Valid: false }), hat(5, { BatteryStaleSince: '2026-01-01' }), { Bat_Percent: 'x' }]) {
    assert.equal(voice.batteryWatch()(bad), false)
  }
})

test('how often: the same message once in the gap, never two at once', async () => {
  let now = 1_000_000
  const said = []
  const speak = voice.makeSpeaker(async (text) => {
    said.push(text)
    return true
  }, { gapMs: 120000, now: () => now })
  assert.equal(await speak('slowLoad', 'Lahm'), true)
  assert.equal(await speak('slowLoad', 'Lahm'), false, 'the same message again at once')
  assert.equal(await speak('lowBattery', 'Akku'), false, 'another while the first is being said')
  now += 5000
  assert.equal(await speak('lowBattery', 'Akku'), true, 'after the first was said')
  assert.equal(await speak('slowLoad', 'Lahm'), false, 'inside the gap')
  now += 130000
  assert.equal(await speak('slowLoad', 'Lahm'), true, 'after the gap')
  assert.equal(await speak('slowLoad', ''), false, 'no text')
  assert.deepEqual(said, ['Lahm', 'Akku', 'Lahm'])
  // an unassigned tag is told every time it is laid on - once the sentence before is said
  now += 5000
  assert.equal(await speak('tagNew', 'Neu'), true)
  assert.equal(await speak('tagNew', 'Neu'), false, 'still being said')
  now += 5000
  assert.equal(await speak('tagNew', 'Neu'), true, 'laid on again: told again, no waiting time')
  assert.equal(said.at(-1), 'Neu')
  const failing = voice.makeSpeaker(async () => {
    throw new Error('no voice')
  })
  assert.equal(await failing('x', 'y'), false, 'a voice that fails is not an error')
  const silent = voice.makeSpeaker(async () => false)
  assert.equal(await silent('x', 'y'), false, 'the voice is off: not said')
})

test('reachable: any answer counts, no answer does not', async () => {
  assert.equal(await voice.reachable('https://x.test/', { fetch: async () => ({ status: 401 }) }), true)
  assert.equal(await voice.reachable('https://x.test/', { fetch: async () => Promise.reject(new Error('ECONNREFUSED')) }), false)
  assert.equal(await voice.reachable('', { fetch: async () => ({}) }), false)
})

test('tcpReachable: a connection to the host of the address', async () => {
  const server = net.createServer((socket) => socket.end())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  assert.equal(await voice.tcpReachable(`http://127.0.0.1:${port}`, { ms: 2000 }), true)
  await new Promise((resolve) => server.close(resolve))
  assert.equal(await voice.tcpReachable(`http://127.0.0.1:${port}`, { ms: 2000 }), false, 'nobody listens any more')
  assert.equal(await voice.tcpReachable('not an address'), false)
})

test('the box\'s own limits are not a network problem', () => {
  assert.equal(voice.blockedByLimits({ playtime: { state: 'blocked' } }), true)
  assert.equal(voice.blockedByLimits({ quiet: { inWindow: true } }), true)
  assert.equal(voice.blockedByLimits({ playtime: { state: 'normal' }, quiet: { inWindow: false } }), false)
  assert.equal(voice.blockedByLimits(null), false)
})
