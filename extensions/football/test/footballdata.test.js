// node --test extensions/football/test/footballdata.test.js - the second source with answers in the form football-data.org v4
// documents (no key in the tests, no network)
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../logic')
const { footballData, matchdayOf } = require('../footballdata')

const MIN = 60 * 1000
const team = (id, name, shortName, tla) => ({ id, name, shortName, tla, crest: `https://crests.football-data.org/${id}.png` })
const ARS = team(57, 'Arsenal FC', 'Arsenal', 'ARS')
const CHE = team(61, 'Chelsea FC', 'Chelsea', 'CHE')
const LIV = team(64, 'Liverpool FC', 'Liverpool', 'LIV')
const MCI = team(65, 'Manchester City FC', 'Man City', 'MCI')
const season = { id: 2400, startDate: '2026-08-15', endDate: '2027-05-23', currentMatchday: 12 }
const match = (id, matchday, utcDate, home, away, status, score = {}) => ({ id, matchday, utcDate, status, homeTeam: home, awayTeam: away, season, competition: { code: 'PL' }, score: { duration: 'REGULAR', fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, ...score } })

test('a match of football-data.org in the plain form: state from its status, the score, the half time', () => {
  const m = L.fdMatch(match(1, 11, '2026-11-08T15:00:00Z', ARS, CHE, 'FINISHED', { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } }))
  assert.equal(m.state, 'finished')
  assert.deepEqual(m.score, { home: 2, away: 1 })
  assert.deepEqual(m.halftime, { home: 1, away: 0 })
  assert.equal(m.home.tla, 'ARS')
  assert.equal(m.home.crest, 'https://crests.football-data.org/57.png')
  assert.equal(L.fdMatch(match(2, 12, '2026-11-22T15:00:00Z', ARS, CHE, 'TIMED')).state, 'scheduled')
  assert.equal(L.fdMatch(match(2, 12, '2026-11-22T15:00:00Z', ARS, CHE, 'TIMED')).score, null)
  assert.deepEqual(L.fdMatch(match(3, 12, '2026-11-22T15:00:00Z', ARS, CHE, 'IN_PLAY')).score, { home: 0, away: 0 })
  assert.equal(L.fdMatch(match(3, 12, '2026-11-22T15:00:00Z', ARS, CHE, 'PAUSED')).state, 'live')
  assert.equal(L.fdMatch(match(4, 12, '2026-11-22T15:00:00Z', ARS, CHE, 'POSTPONED')).state, 'postponed')
})

test('a shoot-out: the score of the play, the shoot-out beside it', () => {
  const m = L.fdMatch(
    match(5, null, '2026-11-08T20:00:00Z', ARS, CHE, 'FINISHED', {
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 6, away: 5 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 0 },
      penalties: { home: 5, away: 4 },
    }),
  )
  assert.deepEqual(m.score, { home: 1, away: 1 })
  assert.deepEqual(m.penalties, { home: 5, away: 4 })
})

test('the table: the one total table; a competition of groups has none', () => {
  const row = (position, t, points) => ({ position, team: t, playedGames: 11, won: 7, draw: 2, lost: 2, points, goalsFor: 20, goalsAgainst: 9, goalDifference: 11 })
  const t = L.fdTable({ standings: [{ type: 'TOTAL', table: [row(1, ARS, 23), row(2, MCI, 22)] }, { type: 'HOME', table: [] }] })
  assert.equal(t.length, 2)
  assert.equal(t[1].team.short, 'Man City')
  assert.equal(t[0].diff, 11)
  assert.equal(L.fdTable({ standings: [{ type: 'TOTAL', group: 'GROUP_A', table: [] }, { type: 'TOTAL', group: 'GROUP_B', table: [] }] }), null)
})

test('the source: the season once, the matchday that runs every two minutes while the club plays, the key sent along', async () => {
  const now = Date.parse('2026-11-22T15:20:00Z')
  const all = [
    match(1, 11, '2026-11-08T15:00:00Z', ARS, CHE, 'FINISHED', { fullTime: { home: 2, away: 1 } }),
    match(2, 12, '2026-11-22T15:00:00Z', LIV, ARS, 'IN_PLAY', { fullTime: { home: 0, away: 0 } }),
    match(3, 12, '2026-11-22T17:30:00Z', MCI, CHE, 'TIMED'),
    match(4, 13, '2026-11-29T15:00:00Z', ARS, MCI, 'TIMED'),
  ]
  const asked = []
  const getJson = async (u, headers) => {
    asked.push({ u, key: headers['X-Auth-Token'] })
    if (/\/matches\?matchday=12$/.test(u)) return { matches: [match(2, 12, '2026-11-22T15:00:00Z', LIV, ARS, 'IN_PLAY', { fullTime: { home: 0, away: 1 } }), all[2]] }
    if (/\/matches$/.test(u)) return { matches: all }
    if (/\/standings$/.test(u)) return { standings: [{ type: 'TOTAL', table: [] }] }
    throw Object.assign(new Error('HTTP 404'), { status: 404 })
  }
  const src = footballData('PL', 'k3y', getJson)
  assert.equal(src.minGap, 2 * MIN)
  const first = await src.load(57, null, { full: true }, now)
  assert.ok(asked.every((a) => a.key === 'k3y'))
  assert.deepEqual(asked.map((a) => a.u.split('/v4/')[1]), ['competitions/PL/matches', 'competitions/PL/standings'])
  assert.equal(first.matchday.number, 12)
  assert.equal(first.matchday.matches.length, 2)
  assert.equal(first.mine.length, 3)
  // (a minute later, the page closed: nothing - the source allows a request every two minutes)
  asked.length = 0
  const second = await src.load(57, first, { full: false }, now + MIN)
  assert.deepEqual(asked, [])
  // (two minutes later: the matchday that runs, the club's goal in it)
  const third = await src.load(57, second, { full: false }, now + 2 * MIN)
  assert.deepEqual(asked.map((a) => a.u.split('/v4/')[1]), ['competitions/PL/matches?matchday=12'])
  assert.deepEqual(third.mine.find((m) => m.id === 2).score, { home: 0, away: 1 })
})

test('the key refused: an error with its status, no further request', async () => {
  let n = 0
  const src = footballData('PL', 'bad', async () => {
    n += 1
    throw Object.assign(new Error('HTTP 403'), { status: 403 })
  })
  await assert.rejects(src.load(57, null, { full: true }), (e) => e.status === 403)
  assert.equal(n, 1)
})

test('a cup without a matchday that runs: the matches of three days back to four ahead', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  const m = (id, d) => ({ id, kickoff: new Date(now + d * 24 * 60 * MIN).toISOString(), matchday: null })
  const day = matchdayOf([m(1, -5), m(2, -1), m(3, 2), m(4, 6)], null, now)
  assert.deepEqual(day.matches.map((x) => x.id), [2, 3])
  assert.equal(day.number, null)
})

test('the knockout rounds of a cup: no longer the last matchday of the league phase, the matches around today', () => {
  const now = Date.parse('2027-02-17T12:00:00Z')
  const m = (id, matchday, iso) => ({ id, matchday, kickoff: iso })
  const all = [m(1, 8, '2027-01-28T20:00:00Z'), m(2, null, '2027-02-17T20:00:00Z'), m(3, null, '2027-02-18T20:00:00Z'), m(4, null, '2027-03-10T20:00:00Z')]
  assert.deepEqual(matchdayOf(all, 8, now).matches.map((x) => x.id), [2, 3])
  // (a league in a break: its next matchday in two weeks stays)
  const league = [m(5, 12, '2027-03-01T15:00:00Z')]
  assert.equal(matchdayOf(league, 12, now).number, 12)
})
