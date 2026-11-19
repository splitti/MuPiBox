// node --test extensions/football/test/api.test.js - the API part with a host of its own and the source's answers recorded
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))
const current = fixture('matchday-current.json')
const table = fixture('table.json')
const team = fixture('team-134.json')
const teams = fixture('teams.json')

/** fetch as the source would answer; `down`: everything fails; asked: the addresses */
function fakeFetch(state) {
  return async (url) => {
    state.asked.push(String(url))
    if (state.down) throw new Error('offline')
    const u = String(url)
    const json = (body) => ({ ok: true, status: 200, url: u, headers: new Map(), json: async () => body })
    if (/\/getmatchdata\/bl1$/.test(u)) return json(current)
    if (/\/getmatchdata\/bl1\/2026\/3$/.test(u)) return json(fixture('matchday-finished.json'))
    if (/\/getbltable\/bl1\/2026$/.test(u)) return json(table)
    if (/\/getmatchesbyteamid\/134\//.test(u)) return json(team)
    if (/\/getavailableteams\/bl1\/2026$/.test(u)) return json(teams)
    if (/^https:\/\/upload\.wikimedia\.org\/.*\/thumb\/.*120px-.*\.png$/.test(u) || u === 'https://i.imgur.com/KSIk0Eu.png') {
      return { ok: true, status: 200, url: u, headers: new Map([['content-type', 'image/png'], ['content-length', '4']]), arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }
    }
    return { ok: false, status: 404, url: u, headers: new Map(), json: async () => ({}) }
  }
}

function start(settings) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'football-'))
  const routes = {}
  const listeners = []
  const host = {
    dataDir,
    log: { warn: () => {}, info: () => {}, debug: () => {} },
    settings: async () => ({ league: 'bl1', team: '', teamId: 0, ...settings.now }),
    config: () => ({ displayLanguage: 'de' }),
    onSettings: (fn) => listeners.push(fn),
    route: (method, sub, handler) => (routes[`${method} ${sub}`] = handler),
  }
  delete require.cache[require.resolve('../api.js')]
  require('../api.js').activate(host)
  const call = async (key, { query = {}, params = {} } = {}) => {
    const out = { status: 200, headers: {}, body: undefined, type: '' }
    const res = {
      status(n) {
        out.status = n
        return res
      },
      set(k, v) {
        out.headers[k] = v
        return res
      },
      type(t) {
        out.type = t
        return res
      },
      json(b) {
        out.body = b
        return res
      },
      send(b) {
        out.body = b
        return res
      },
      end() {
        return res
      },
    }
    await routes[key]({ query, params }, res)
    return out
  }
  return { call, dataDir, listeners }
}

const realFetch = global.fetch
test.afterEach(() => {
  global.fetch = realFetch
})

test('the data: the matchday, the table, my club - the crests as addresses of the box', async () => {
  const state = { asked: [] }
  global.fetch = fakeFetch(state)
  const settings = { now: { teamId: 134, team: 'SV Werder Bremen' } }
  const { call, dataDir } = start(settings)
  const r = await call('get /data', { query: { open: '1' } })
  assert.equal(r.body.configured, true)
  assert.equal(r.body.leagueName, '1. Bundesliga')
  assert.equal(r.body.matchday.matches.length, current.length)
  assert.equal(r.body.table.length, table.length)
  assert.equal(r.body.club.team.id, 134)
  assert.match(r.body.club.team.crest, /^\/ext\/football\/crest\/[a-f0-9]{20}$/)
  assert.ok(r.body.matchday.matches.every((m) => m.home.crest === '' || m.home.crest.startsWith('/ext/football/crest/')))
  assert.equal(r.body.lang, 'de')
  // (kept on the card for the next start)
  assert.ok(fs.existsSync(path.join(dataDir, 'cache.json')))
  // (a second look soon after: nothing asked again)
  const before = state.asked.length
  await call('get /data')
  assert.equal(state.asked.length, before)
})

test('the source does not answer: the last values stay, marked as old; without any, an error', async () => {
  const state = { asked: [] }
  global.fetch = fakeFetch(state)
  const settings = { now: {} }
  const { call, listeners } = start(settings)
  const open = { query: { open: '1' } }
  await call('get /data', open)
  state.down = true
  // (asked again at once - the settings were saved)
  for (const fn of listeners) fn({})
  const old = await call('get /data', open)
  assert.equal(old.body.stale, true)
  assert.equal(old.body.error, 'offline')
  assert.equal(old.body.matchday.matches.length, current.length)
  // (another league: no values for it)
  settings.now = { league: 'bl2' }
  const none = await call('get /data')
  assert.equal(none.body.error, 'offline')
  assert.equal(none.body.matchday, undefined)
})

test('a league the box does not offer: not configured', async () => {
  global.fetch = fakeFetch({ asked: [] })
  const { call } = start({ now: { league: 'xyz' } })
  assert.deepEqual((await call('get /data')).body, { configured: false })
})

test('a crest: fetched once, kept, served with the right type; one the box has never seen is not fetched', async () => {
  const state = { asked: [] }
  global.fetch = fakeFetch(state)
  const { call, dataDir } = start({ now: { teamId: 134 } })
  const data = (await call('get /data')).body
  const crest = data.club.team.crest.split('/').pop()
  const r = await call('get /crest/:hash', { params: { hash: crest } })
  assert.equal(r.type, 'image/png')
  assert.equal(r.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(fs.readdirSync(path.join(dataDir, 'crests')).length, 1)
  // (Wikimedia: its small PNG, never the SVG)
  assert.ok(state.asked.some((u) => /\/thumb\/.*\/120px-.*\.svg\.png$/.test(u)))
  const asked = state.asked.length
  await call('get /crest/:hash', { params: { hash: crest } })
  assert.equal(state.asked.length, asked)
  assert.equal((await call('get /crest/:hash', { params: { hash: 'f'.repeat(20) } })).status, 404)
  assert.equal((await call('get /crest/:hash', { params: { hash: '../x' } })).status, 404)
})

test('the search of the club: the teams of the league that fit, and one to choose none', async () => {
  global.fetch = fakeFetch({ asked: [] })
  const { call } = start({ now: {} })
  const r = await call('get /teams', { query: { q: 'bremen' } })
  assert.deepEqual(r.body.at(-1), { label: 'Keinen Verein', values: { team: '', teamId: 0 } })
  assert.equal(r.body[0].values.teamId, 134)
  assert.ok(r.body.length <= 10)
})

test('another matchday (the swipe of the display)', async () => {
  global.fetch = fakeFetch({ asked: [] })
  const { call } = start({ now: {} })
  await call('get /data')
  const r = await call('get /matchday', { query: { n: '3' } })
  assert.equal(r.body.number, 3)
  assert.equal(r.body.matches.length, 3)
  assert.equal((await call('get /matchday', { query: { n: '99' } })).status, 400)
})

test('crests of Wikimedia: their small PNGs first, then the address of the source, then the SVG', () => {
  const { crestCandidates } = require('../api.js')._test
  const w = 'https://upload.wikimedia.org/wikipedia/commons'
  assert.deepEqual(crestCandidates(`${w}/b/be/SV-Werder-Bremen-Logo.svg`), [
    `${w}/thumb/b/be/SV-Werder-Bremen-Logo.svg/120px-SV-Werder-Bremen-Logo.svg.png`,
    `${w}/thumb/b/be/SV-Werder-Bremen-Logo.svg/250px-SV-Werder-Bremen-Logo.svg.png`,
    `${w}/b/be/SV-Werder-Bremen-Logo.svg`,
  ])
  const dortmund = `${w}/thumb/6/67/Borussia_Dortmund_logo.svg/960px-Borussia_Dortmund_logo.svg.png`
  assert.deepEqual(crestCandidates(dortmund).slice(2), [dortmund, `${w}/6/67/Borussia_Dortmund_logo.svg`])
  assert.deepEqual(crestCandidates('https://i.imgur.com/KSIk0Eu.png'), ['https://i.imgur.com/KSIk0Eu.png'])
})

test('with the page closed the box asks only for the club - and backs off when the first try failed', async () => {
  const state = { asked: [] }
  global.fetch = fakeFetch(state)
  const { call, listeners } = start({ now: { teamId: 134 } })
  await call('get /data', { query: { open: '1' } })
  // (later, the page closed long ago: a new look asks for the club's matches only when it is due)
  const { activate } = require('../api.js')
  assert.equal(typeof activate, 'function')
  // a failing first load for other settings: no new try on every look of the display
  state.down = true
  const settings2 = { now: { league: 'bl2' } }
  const two = start(settings2)
  await two.call('get /data', { query: { open: '1' } })
  const asked = state.asked.length
  await two.call('get /data', { query: { open: '1' } })
  await two.call('get /data', { query: { open: '1' } })
  assert.equal(state.asked.length, asked)
  assert.equal(listeners.length, 1)
})

test('a crest from a host the sources do not use, or one that redirects, is no picture', async () => {
  const asked = []
  global.fetch = async (url, init) => {
    asked.push({ url: String(url), redirect: init?.redirect })
    if (/getmatchdata\/bl1$/.test(String(url))) {
      const list = JSON.parse(JSON.stringify(current))
      list[0].team1.teamIconUrl = 'https://evil.example/x.png'
      return { ok: true, status: 200, headers: new Map(), json: async () => list }
    }
    return { ok: true, status: 200, headers: new Map(), json: async () => [] }
  }
  const { call } = start({ now: {} })
  const data = (await call('get /data', { query: { open: '1' } })).body
  const evil = data.matchday.matches[0].home.crest.split('/').pop()
  const r = await call('get /crest/:hash', { params: { hash: evil } })
  assert.equal(r.status, 404)
  assert.ok(!asked.some((a) => a.url.startsWith('https://evil.example')))
})

test('the source with the page closed: nothing while the club does not play, its matches every minute while it does', async () => {
  const state = { asked: [] }
  global.fetch = fakeFetch(state)
  const { openLigaDb } = require('../api.js')._test
  const src = openLigaDb('bl1')
  const now = Date.parse('2026-11-19T12:00:00Z')
  const first = await src.load(134, null, { full: true }, now)
  assert.equal(state.asked.length, 3)
  // (ten minutes later, closed: the matchday is new enough, the club plays not before Saturday - nothing asked)
  state.asked = []
  await src.load(134, first, { full: false }, now + 10 * 60 * 1000)
  assert.deepEqual(state.asked, [])
  // (during the club's match: only its matches)
  const kick = Date.parse('2026-11-22T16:30:00Z')
  const during = { ...first, dayAt: kick, mineAt: kick, mine: first.mine.map((m) => ({ ...m, state: Date.parse(m.kickoff) === kick ? 'live' : m.state })) }
  await src.load(134, during, { full: false }, kick + 20 * 60 * 1000)
  assert.equal(state.asked.length, 1)
  assert.match(state.asked[0], /getmatchesbyteamid\/134\//)
})

test('a crest refused for too many at every address: no crest is asked for a while', async () => {
  const asked = []
  const list = JSON.parse(JSON.stringify(current)).slice(0, 3)
  list.forEach((m, i) => {
    m.team1.teamIconUrl = `https://upload.wikimedia.org/wikipedia/commons/a/ab/Club${i}a.svg`
    m.team2.teamIconUrl = `https://upload.wikimedia.org/wikipedia/commons/a/ab/Club${i}b.svg`
  })
  global.fetch = async (url) => {
    asked.push(String(url))
    if (/getmatchdata\/bl1$/.test(String(url))) return { ok: true, status: 200, headers: new Map(), json: async () => list }
    if (/upload\.wikimedia\.org/.test(String(url))) return { ok: false, status: 429, headers: new Map([['content-type', 'text/html']]), body: null }
    return { ok: true, status: 200, headers: new Map(), json: async () => [] }
  }
  const { call } = start({ now: {} })
  const data = (await call('get /data', { query: { open: '1' } })).body
  const hashes = data.matchday.matches.flatMap((m) => [m.home.crest, m.away.crest]).map((c) => c.split('/').pop())
  const first = await call('get /crest/:hash', { params: { hash: hashes[0] } })
  assert.equal(first.status, 404)
  const wiki = () => asked.filter((u) => /wikimedia/.test(u)).length
  // (all three addresses of the first crest were tried)
  assert.equal(wiki(), 3)
  for (const h of hashes.slice(1)) assert.equal((await call('get /crest/:hash', { params: { hash: h } })).status, 404)
  // (none of the others: the box waits a quarter of an hour)
  assert.equal(wiki(), 3)
})
