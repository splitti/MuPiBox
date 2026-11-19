// node --test extensions/football/test/display.test.js - the helpers of the display part (no DOM)
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../display.js')

test('the kick-off as a child reads it: today, tomorrow, else the day of the week and the date', async () => {
  const { kickoffText } = await load()
  const now = new Date(2026, 10, 21, 10, 0).getTime()
  assert.equal(kickoffText(new Date(2026, 10, 21, 15, 30).toISOString(), now, 'de'), 'heute 15:30')
  assert.equal(kickoffText(new Date(2026, 10, 22, 17, 30).toISOString(), now, 'de'), 'morgen 17:30')
  assert.equal(kickoffText(new Date(2026, 10, 27, 20, 30).toISOString(), now, 'de'), 'Fr 27.11. 20:30')
  assert.equal(kickoffText(new Date(2026, 10, 21, 15, 30).toISOString(), now, 'en'), 'today 15:30')
  assert.equal(kickoffText('nonsense', now, 'de'), '')
})

test('the score, or the kick-off when there is none; a match called off says so', async () => {
  const { scoreText } = await load()
  const now = new Date(2026, 10, 21, 10, 0).getTime()
  assert.equal(scoreText({ state: 'live', score: { home: 2, away: 1 } }, now), '2:1')
  assert.equal(scoreText({ state: 'scheduled', score: null, kickoff: new Date(2026, 10, 21, 15, 30).toISOString() }, now), 'heute 15:30')
  assert.equal(scoreText({ state: 'postponed', score: null }, now, 'en'), 'postponed')
})

test('the zones of the table: up, the play-off, down - none for a cup', async () => {
  const { zoneOf } = await load()
  assert.equal(zoneOf('bl1', 1), 'up')
  assert.equal(zoneOf('bl1', 4), 'up')
  assert.equal(zoneOf('bl1', 5), '')
  assert.equal(zoneOf('bl1', 16), 'playoff')
  assert.equal(zoneOf('bl1', 18), 'down')
  assert.equal(zoneOf('bl2', 3), 'playoff')
  assert.equal(zoneOf('bl2', 16), 'playoff')
  assert.equal(zoneOf('bl3', 20), 'down')
  assert.equal(zoneOf('dfb', 1), '')
})

test('the texts: German and English, English for any other language', async () => {
  const { textsFor } = await load()
  assert.equal(textsFor('de').club, 'Mein Verein')
  assert.equal(textsFor('en').club, 'My club')
  assert.equal(textsFor('fr').club, 'My club')
  assert.equal(textsFor(undefined).club, 'My club')
})

test('a match running without a goal yet shows 0:0, one over without a known result –:–', async () => {
  const { scoreText, textsFor, zoneOf } = await load()
  assert.equal(scoreText({ state: 'live', score: null, kickoff: new Date().toISOString() }), '0:0')
  assert.equal(scoreText({ state: 'finished', score: null, kickoff: new Date().toISOString() }), '–:–')
  assert.equal(textsFor('de').penalties(5, 4), 'i.E. 5:4')
  assert.equal(textsFor('en').penalties(5, 4), 'pens 5:4')
  assert.equal(zoneOf('ffb1', 14), 'down')
})

test('the name of a matchday: the source\'s in German, its number or the round of a cup in English; the place in English', async () => {
  const { matchdayLabel, textsFor } = await load()
  assert.equal(matchdayLabel({ number: 12, name: '12. Spieltag' }, 'de'), '12. Spieltag')
  assert.equal(matchdayLabel({ number: 12, name: '12. Spieltag' }, 'en'), 'Matchday 12')
  assert.equal(matchdayLabel({ number: 3, name: 'Achtelfinale' }, 'en'), 'Round of 16')
  assert.equal(matchdayLabel({ number: null, name: '' }, 'de'), 'Spieltag')
  assert.equal(textsFor('en').place(1), '1st place')
  assert.equal(textsFor('en').place(12), '12th place')
  assert.equal(textsFor('en').place(23), '23rd place')
})
