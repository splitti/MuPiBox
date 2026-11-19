// Football, the pure part: what the sources answer turned into one plain form (matches, table, teams), the state of a match, how
// often to ask, what "my club" means right now and which goals are new. No network, no files, no timers - tested on its own
// (node --test extensions/football/test/*.test.js).
//
// The form the display knows (both sources give it):
//   match: { id, kickoff (ISO, UTC), state: 'scheduled' | 'live' | 'finished' | 'postponed', home: team, away: team,
//            score: { home, away } | null, halftime: { home, away } | null, matchday, competition }
//   team:  { id, name, short, tla, crest }   (crest: the address of the picture at the source - the API part keeps a copy)
//   row:   { rank, team, played, won, draw, lost, goals, against, diff, points }

'use strict'

const MIN = 60 * 1000
const HOUR = 60 * MIN

/** The leagues of OpenLigaDB the box offers (the list of the source holds hundreds that people keep for themselves). A cup has no table. */
const OPENLIGADB_LEAGUES = {
  bl1: { name: '1. Bundesliga' },
  bl2: { name: '2. Bundesliga' },
  bl3: { name: '3. Liga' },
  dfb: { name: 'DFB-Pokal', cup: true },
  ffb1: { name: 'Frauen-Bundesliga' },
}

// (a match is "on" from a little before the kick-off until it is over; without word that it is over, at most this long - extra
// time and penalties of a cup included)
const LIVE_BEFORE = 5 * MIN
const LIVE_AFTER = 150 * MIN
const LIVE_LONGEST = 180 * MIN

const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : null)
const text = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** A short name of three letters for a team without one (the circle the display draws when there is no crest). */
function tlaOf(team) {
  const tla = text(team?.tla, 4).toUpperCase()
  if (/^[A-Z0-9]{2,4}$/.test(tla)) return tla
  const base = text(team?.short || team?.name, 40)
    .replace(/^(1\.|SV|FC|VfB|VfL|TSG|SC|BV|RB|FSV|SpVgg|SG|TSV|Borussia|Eintracht|Hertha|Bayer)\s+/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
  return base.slice(0, 3).toUpperCase() || '?'
}
const httpsOrEmpty = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(v) ? v : '')

/** A team of OpenLigaDB (team1, team2, a row of the table, an entry of the teams). */
function olTeam(t) {
  const id = Number(t?.teamId ?? t?.teamInfoId)
  const name = text(t?.teamName, 80)
  const team = { id: Number.isInteger(id) && id > 0 ? id : null, name, short: text(t?.shortName, 40) || name, tla: '', crest: httpsOrEmpty(t?.teamIconUrl) }
  team.tla = tlaOf({ tla: t?.tla, short: team.short, name })
  return team
}

/** The state of a match at `now`: from the word of the source, else from the time of the kick-off. */
function stateOf({ kickoff, finished, postponed }, now) {
  if (postponed) return 'postponed'
  if (finished) return 'finished'
  const at = Date.parse(kickoff)
  if (!Number.isFinite(at)) return 'scheduled'
  if (now < at) return 'scheduled'
  // (no word that it is over after the longest a match can take: it is over, the score as it stood)
  return now - at > LIVE_LONGEST ? 'finished' : 'live'
}

/** A match of OpenLigaDB in the plain form. */
function olMatch(m, now = Date.now()) {
  // (a date the source got wrong: no kick-off - the match counts as not begun)
  const at = typeof m?.matchDateTimeUTC === 'string' ? Date.parse(m.matchDateTimeUTC) : NaN
  const kickoff = Number.isFinite(at) ? new Date(at).toISOString() : null
  const results = Array.isArray(m?.matchResults) ? m.matchResults : []
  const pair = (r) => (r && int(r.pointsTeam1) !== null && int(r.pointsTeam2) !== null ? { home: r.pointsTeam1, away: r.pointsTeam2 } : null)
  // (the half time; the result at the end is the last one the source has - after 90 minutes, after extra time, after penalties)
  const half = pair(results.find((x) => Number(x?.resultTypeID) === 1))
  // (a penalty shoot-out is a result of its own: shown beside the score, never as the score - nor as goals)
  const shootout = (x) => /elfmeter|penalt/i.test(`${x?.resultName ?? ''} ${x?.resultTypeKind ?? ''}`)
  const ends = results.filter((x) => Number(x?.resultTypeID) !== 1 && !shootout(x) && pair(x)).sort((a, b) => (Number(a?.resultOrderID) || 0) - (Number(b?.resultOrderID) || 0))
  const penalties = pair(results.find((x) => shootout(x) && pair(x)))
  const goals = (Array.isArray(m?.goals) ? m.goals : []).filter((g) => int(g?.scoreTeam1) !== null && int(g?.scoreTeam2) !== null)
  const lastGoal = goals.reduce((last, g) => (!last || g.scoreTeam1 + g.scoreTeam2 >= last.scoreTeam1 + last.scoreTeam2 ? g : last), null)
  const finished = m?.matchIsFinished === true
  const state = stateOf({ kickoff, finished }, now)
  // (over: the result at the end; while it runs whichever has more goals - the goals or a result the source keeps up to date)
  const final = pair(ends.at(-1))
  const byGoal = lastGoal ? { home: lastGoal.scoreTeam1, away: lastGoal.scoreTeam2 } : null
  const sum = (s) => (s ? s.home + s.away : -1)
  // (none known: 0:0 while it runs; over without a result - the source has not got it yet, or the match did not take place
  // - no score at all, never a 0:0 that did not happen)
  const known = finished && final ? final : sum(final) >= sum(byGoal) ? final : byGoal
  const score = state === 'scheduled' ? null : (known ?? (state === 'live' ? { home: 0, away: 0 } : null))
  return {
    id: Number(m?.matchID) || null,
    kickoff,
    state,
    home: olTeam(m?.team1),
    away: olTeam(m?.team2),
    score,
    halftime: half,
    penalties,
    matchday: Number(m?.group?.groupOrderID) || null,
    matchdayName: text(m?.group?.groupName, 40),
    competition: text(m?.leagueShortcut, 20),
  }
}

/** The table of OpenLigaDB (in the order of the source, which is the order of the places). */
function olTable(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 40).map((r, i) => ({
    rank: i + 1,
    team: olTeam(r),
    played: int(r?.matches) ?? 0,
    won: int(r?.won) ?? 0,
    draw: int(r?.draw) ?? 0,
    lost: int(r?.lost) ?? 0,
    goals: int(r?.goals) ?? 0,
    against: int(r?.opponentGoals) ?? 0,
    diff: Number.isInteger(r?.goalDiff) ? r.goalDiff : (int(r?.goals) ?? 0) - (int(r?.opponentGoals) ?? 0),
    points: int(r?.points) ?? 0,
  }))
}

/** The teams of a league of OpenLigaDB, sorted by name, each once. */
function olTeams(rows) {
  const seen = new Set()
  return (Array.isArray(rows) ? rows : [])
    .map(olTeam)
    .filter((t) => t.id && t.name && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Matches sorted by kick-off (then by id: the same order on every call). */
const byKickoff = (a, b) => (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0) || (a.id ?? 0) - (b.id ?? 0)

/** Is the match one of the club `teamId`? */
const playsIn = (m, teamId) => !!teamId && (m.home.id === teamId || m.away.id === teamId)

/**
 * What the page "Mein Verein" shows: the last match that is over, the next one, one that runs now, and the place in the table.
 * `matches`: the club's matches (any competition) and those of the matchday - each once.
 */
function myClub(matches, table, teamId, now = Date.now()) {
  if (!teamId) return null
  const mine = dedupe(matches.filter((m) => playsIn(m, teamId))).sort(byKickoff)
  const live = mine.find((m) => m.state === 'live') ?? null
  // (the last one over that has a result; one without - not known yet - only when there is none with)
  const over = [...mine].reverse().filter((m) => m.state === 'finished')
  const last = over.find((m) => m.score) ?? over[0] ?? null
  const next = mine.find((m) => m.state === 'scheduled' && Date.parse(m.kickoff) > now) ?? null
  const row = (table ?? []).find((r) => r.team.id === teamId) ?? null
  const team = row?.team ?? (mine[0] ? (mine[0].home.id === teamId ? mine[0].home : mine[0].away) : null)
  return { team, live, last, next, rank: row?.rank ?? null, points: row?.points ?? null }
}

function dedupe(matches) {
  const seen = new Map()
  for (const m of matches) if (m?.id) seen.set(m.id, m)
  return [...seen.values()]
}

/**
 * How long until the box asks the source again: often while a match of interest runs (or is about to), less on a day with
 * matches, else once an hour; after errors longer, doubled each time, at most half an hour. `minGap`: the least the source
 * allows (football-data: 2 min).
 */
function nextDelay(matches, now = Date.now(), { errors = 0, minGap = 0 } = {}) {
  if (errors > 0) return Math.min(30 * MIN, Math.max(MIN, minGap) * 2 ** Math.min(errors, 5))
  let delay = HOUR
  const today = new Date(now).toDateString()
  for (const m of matches) {
    const at = Date.parse(m.kickoff)
    if (!Number.isFinite(at) || m.state === 'finished' || m.state === 'postponed') continue
    if (m.state === 'live' || (now >= at - LIVE_BEFORE && now <= at + LIVE_AFTER)) return Math.max(MIN, minGap)
    // (the kick-off coming: ask again just before it)
    if (at > now && at - now < delay) delay = Math.max(MIN, at - LIVE_BEFORE - now)
    if (new Date(at).toDateString() === today) delay = Math.min(delay, 15 * MIN)
  }
  return Math.max(delay, minGap, MIN)
}

/** Is the match on now - from a little before the kick-off until it is over (at the longest a match takes)? */
function inPlay(m, now = Date.now()) {
  if (m?.state === 'finished' || m?.state === 'postponed') return false
  const at = Date.parse(m?.kickoff)
  return Number.isFinite(at) && now >= at - LIVE_BEFORE && now <= at + LIVE_LONGEST
}

/** Is any of the matches running (or about to)? - then the box asks often, see nextDelay. */
const anyLive = (matches, now = Date.now()) => matches.some((m) => m.state === 'live' || (m.state === 'scheduled' && Date.parse(m.kickoff) - now <= LIVE_BEFORE && Date.parse(m.kickoff) > now))

/**
 * The goals of the club `teamId` since the last look: for each match of the club that runs, the goals it has more now than
 * before (an own goal of the other side counts too). `before`: Map id -> score, as the last look left it; the first look
 * (empty) never reports - a box that starts would announce old goals; a match it never saw running neither. Returns { goals: [{ match, side, score }], seen }.
 */
function newGoals(matches, teamId, before) {
  const seen = new Map()
  const goals = []
  for (const m of matches) {
    if (!playsIn(m, teamId) || !m.score || (m.state !== 'live' && m.state !== 'finished')) continue
    seen.set(m.id, { ...m.score, live: m.state === 'live' })
    const was = before?.get(m.id)
    // (a goal in the last minute may come with the whistle: a match seen running before counts when it is over too)
    // (not one that was over already: a result the source puts right days later is no goal)
    if (!was || (m.state !== 'live' && !was.live)) continue
    const side = m.home.id === teamId ? 'home' : 'away'
    if (m.score[side] > was[side]) goals.push({ match: m, side, score: m.score })
  }
  return { goals, seen }
}

const TEXTS = {
  de: { goal: (club, a, b) => `Tor für ${club}! ${a} zu ${b}.` },
  en: { goal: (club, a, b) => `Goal for ${club}! ${a} to ${b}.` },
}
/** What the box says for a goal: the club's short name, then the score with the club's goals first. */
function goalText(goal, lang = 'de') {
  const t = TEXTS[String(lang).slice(0, 2)] ?? TEXTS.en
  const mine = goal.side === 'home' ? goal.match.home : goal.match.away
  const other = goal.side === 'home' ? 'away' : 'home'
  return t.goal(mine.short || mine.name, goal.score[goal.side], goal.score[other])
}

module.exports = { OPENLIGADB_LEAGUES, olTeam, olMatch, olTable, olTeams, stateOf, myClub, nextDelay, anyLive, inPlay, newGoals, goalText, byKickoff, playsIn, dedupe, tlaOf, MIN, HOUR }
