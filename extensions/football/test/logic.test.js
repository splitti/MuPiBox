// node --test extensions/football/test/logic.test.js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../logic')

const finished = require('./fixtures/matchday-finished.json')
const table = require('./fixtures/table.json')
const teams = require('./fixtures/teams.json')
const MIN = 60 * 1000

// a match of OpenLigaDB as the source sends it, with what a test needs changed
const raw = (over = {}) => ({ ...JSON.parse(JSON.stringify(finished[0])), ...over })

test('a match that is over: the result at the end, the half time, the teams with a short name of three letters', () => {
  const m = L.olMatch(finished[0])
  assert.equal(m.state, 'finished')
  assert.deepEqual(m.score, { home: 3, away: 1 })
  assert.deepEqual(m.halftime, { home: 1, away: 1 })
  assert.equal(m.home.short, 'HSV')
  assert.equal(m.away.short, 'Gladbach')
  assert.match(m.home.crest, /^https:\/\//)
  assert.equal(m.matchday, 9)
  assert.equal(m.competition, 'bl1')
  assert.match(m.kickoff, /Z$/)
  assert.equal(L.olMatch(finished[2]).score.home, 5)
})

test('the state from the time: scheduled before the kick-off, live during it, over at the latest three hours later', () => {
  const kickoff = Date.parse(finished[0].matchDateTimeUTC)
  const open = raw({ matchIsFinished: false, matchResults: [], goals: [] })
  assert.equal(L.olMatch(open, kickoff - MIN).state, 'scheduled')
  assert.equal(L.olMatch(open, kickoff - MIN).score, null)
  const live = L.olMatch(open, kickoff + 10 * MIN)
  assert.equal(live.state, 'live')
  assert.deepEqual(live.score, { home: 0, away: 0 })
  assert.equal(L.olMatch(open, kickoff + 181 * MIN).state, 'finished')
})

test('while it runs the score is that of the last goal, or of a result the source keeps up to date - whichever has more', () => {
  const kickoff = Date.parse(finished[0].matchDateTimeUTC)
  const goals = finished[0].goals.slice(0, 2)
  const m = L.olMatch(raw({ matchIsFinished: false, matchResults: [], goals }), kickoff + 50 * MIN)
  assert.deepEqual(m.score, { home: goals[1].scoreTeam1, away: goals[1].scoreTeam2 })
  const ahead = L.olMatch(raw({ matchIsFinished: false, goals: goals.slice(0, 1) }), kickoff + 80 * MIN)
  assert.deepEqual(ahead.score, { home: 3, away: 1 })
})

test('a cup match after extra time: the last result of the source counts', () => {
  const m = L.olMatch(
    raw({
      matchResults: [
        { resultTypeID: 1, resultOrderID: 1, pointsTeam1: 0, pointsTeam2: 0 },
        { resultTypeID: 2, resultOrderID: 2, pointsTeam1: 1, pointsTeam2: 1 },
        { resultTypeID: 3, resultOrderID: 3, pointsTeam1: 2, pointsTeam2: 1 },
      ],
    }),
  )
  assert.deepEqual(m.score, { home: 2, away: 1 })
  assert.deepEqual(m.halftime, { home: 0, away: 0 })
})

test('the table and the teams in the plain form; no address that is not https', () => {
  const t = L.olTable(table)
  assert.equal(t.length, table.length)
  assert.equal(t[0].rank, 1)
  assert.equal(t[0].points, table[0].points)
  assert.equal(t[0].against, table[0].opponentGoals)
  assert.equal(t[0].diff, table[0].goalDiff)
  const list = L.olTeams([...teams, teams[0], { teamId: 5, teamName: 'X', teamIconUrl: 'http://example.org/x.png' }])
  assert.equal(list.length, teams.length + 1)
  assert.equal(list.find((x) => x.id === 5).crest, '')
  assert.ok(list.every((x, i) => i === 0 || list[i - 1].name.localeCompare(x.name, 'de') <= 0))
})

test('a short name of three letters for the circle without a crest', () => {
  assert.equal(L.tlaOf({ tla: 'svw' }), 'SVW')
  assert.equal(L.tlaOf({ short: 'Bremen', name: 'SV Werder Bremen' }), 'BRE')
  assert.equal(L.tlaOf({ name: '1. FC Köln' }), 'FCK')
  assert.equal(L.tlaOf({}), '?')
})

test('my club: the last match over, the next one, one that runs, the place in the table', () => {
  const now = Date.parse('2026-11-19T12:00:00Z')
  const t = L.olTable(table)
  const mine = require('./fixtures/team-134.json').map((m) => L.olMatch(m, now))
  const club = L.myClub(mine, t, 134, now)
  assert.equal(club.team.id, 134)
  assert.equal(club.last.state, 'finished')
  assert.ok(Date.parse(club.next.kickoff) > now)
  assert.equal(club.live, null)
  assert.equal(club.rank, t.find((r) => r.team.id === 134).rank)
  assert.equal(L.myClub(mine, t, 0, now), null)
  // (during the next match: it runs)
  const during = Date.parse(club.next.kickoff) + 20 * MIN
  const live = L.myClub(require('./fixtures/team-134.json').map((m) => L.olMatch(m, during)), t, 134, during)
  assert.equal(live.live.id, club.next.id)
})

test('how often to ask: every minute while a match runs, every quarter of an hour on a day with matches, else hourly; longer after errors', () => {
  const at = Date.parse('2026-11-21T14:30:00Z')
  const m = (kickoff, state = 'scheduled') => ({ kickoff: new Date(kickoff).toISOString(), state })
  assert.equal(L.nextDelay([m(at, 'live')], at + 10 * MIN), MIN)
  assert.equal(L.nextDelay([m(at)], at - 3 * MIN), MIN)
  // (the kick-off in two hours: asked again just before it)
  assert.ok(L.nextDelay([m(at)], at - 2 * 60 * MIN) <= 15 * MIN)
  assert.equal(L.nextDelay([m(at, 'finished')], at + 4 * 60 * MIN), 60 * MIN)
  assert.equal(L.nextDelay([m(at + 5 * 24 * 60 * MIN)], at), 60 * MIN)
  assert.equal(L.nextDelay([], at, { errors: 1 }), 2 * MIN)
  assert.equal(L.nextDelay([], at, { errors: 9 }), 30 * MIN)
  assert.equal(L.nextDelay([m(at, 'live')], at, { minGap: 2 * MIN }), 2 * MIN)
})

test('new goals of my club: not at the first look, only while the match runs, an own goal of the other side counts', () => {
  const match = (home, away, state = 'live') => ({ id: 1, state, home: { id: 134, short: 'Bremen' }, away: { id: 87, short: 'Gladbach' }, score: { home, away } })
  const first = L.newGoals([match(1, 0)], 134, new Map())
  assert.equal(first.goals.length, 0)
  const second = L.newGoals([match(2, 0)], 134, first.seen)
  assert.equal(second.goals.length, 1)
  assert.equal(L.goalText(second.goals[0], 'de'), 'Tor für Bremen! 2 zu 0.')
  // (a goal of the other side: nothing)
  assert.equal(L.newGoals([match(2, 1)], 134, second.seen).goals.length, 0)
  // (the club away)
  const away = L.newGoals([match(2, 2)], 87, new Map([[1, { home: 2, away: 1, live: true }]]))
  assert.equal(L.goalText(away.goals[0], 'en'), 'Goal for Gladbach! 2 to 2.')
  // (with the whistle: a match seen running counts; one never seen does not)
  assert.equal(L.newGoals([match(3, 0, 'finished')], 134, second.seen).goals.length, 1)
  assert.equal(L.newGoals([match(3, 0, 'finished')], 134, new Map([[2, { home: 0, away: 0 }]])).goals.length, 0)
  assert.equal(L.newGoals([match(4, 0, 'finished')], 134, new Map([[1, { home: 3, away: 0, live: false }]])).goals.length, 0)
})

test('a match over without any result: no score that did not happen; a shoot-out stands beside the score', () => {
  const kickoff = Date.parse(finished[0].matchDateTimeUTC)
  const none = L.olMatch(raw({ matchIsFinished: false, matchResults: [], goals: [] }), kickoff + 200 * MIN)
  assert.equal(none.state, 'finished')
  assert.equal(none.score, null)
  const shootout = L.olMatch(
    raw({
      matchResults: [
        { resultTypeID: 1, resultOrderID: 1, pointsTeam1: 0, pointsTeam2: 1, resultName: 'Halbzeit' },
        { resultTypeID: 2, resultOrderID: 2, pointsTeam1: 1, pointsTeam2: 1, resultName: 'Endergebnis' },
        { resultTypeID: 4, resultOrderID: 4, pointsTeam1: 5, pointsTeam2: 4, resultName: 'nach Elfmeterschießen' },
      ],
    }),
  )
  assert.deepEqual(shootout.score, { home: 1, away: 1 })
  assert.deepEqual(shootout.penalties, { home: 5, away: 4 })
  // (a date the source got wrong: no kick-off, not begun)
  const bad = L.olMatch(raw({ matchDateTimeUTC: 'soon', matchIsFinished: false, matchResults: [], goals: [] }))
  assert.equal(bad.kickoff, null)
  assert.equal(bad.state, 'scheduled')
})

test('on now: from five minutes before the kick-off until three hours after, unless over', () => {
  const at = Date.parse('2026-11-21T14:30:00Z')
  const m = { kickoff: new Date(at).toISOString(), state: 'scheduled' }
  assert.equal(L.inPlay(m, at - 10 * MIN), false)
  assert.equal(L.inPlay(m, at - 4 * MIN), true)
  assert.equal(L.inPlay({ ...m, state: 'live' }, at + 100 * MIN), true)
  assert.equal(L.inPlay({ ...m, state: 'finished' }, at + 100 * MIN), false)
  assert.equal(L.inPlay(m, at + 181 * MIN), false)
})
