// Football, the second source: football-data.org (v4) with the user's own key - the big leagues of Europe, the Champions
// League, the World Cup. The free tier allows 10 requests a minute and gives the scores with a delay, so this source asks at
// most every two minutes: the whole season's matches of the competition once an hour (every ten minutes while the page is
// open), the matchday that runs every two minutes while a match of interest is on, the table hourly or after a match ended.
// The club's matches are those of this competition (another one of the club is not asked for).

'use strict'

const L = require('./logic')

const BASE = 'https://api.football-data.org/v4'
const MIN_GAP = 2 * L.MIN

/**
 * The source for the competition `code` (L.FOOTBALLDATA_LEAGUES) with the key `key`. `getJson(url, headers)` is the API part's
 * request (it throws an error with `status` for an answer that is not ok).
 */
function footballData(code, key, getJson) {
  const info = L.FOOTBALLDATA_LEAGUES[code]
  const headers = { 'X-Auth-Token': key }
  const url = (p) => `${BASE}/competitions/${encodeURIComponent(code)}${p}`
  return {
    minGap: MIN_GAP,
    cup: !!info?.cup,
    leagueName: info?.name ?? code,
    delayed: true,
    async load(teamId, prev, { full = true } = {}, now = Date.now()) {
      let asked = 0
      let answered = 0
      let failed = null
      const ask = async (u) => {
        asked += 1
        try {
          const body = await getJson(u, headers)
          answered += 1
          return body
        } catch (error) {
          failed = error
          // (the key refused, or too many: no further request in this load)
          if (error?.status === 401 || error?.status === 403 || error?.status === 429) throw error
          return undefined
        }
      }
      let { season, all = [], allAt = 0, liveAt = 0, current = null, table = null, tableAt = 0 } = prev ?? {}
      const before = all
      // the season's matches: hourly, every ten minutes while the page is open
      if (!allAt || now - allAt >= (full ? 10 * L.MIN : L.HOUR)) {
        const body = await ask(url('/matches'))
        if (Array.isArray(body?.matches)) {
          all = body.matches.map((m) => L.fdMatch(m, now))
          allAt = now
          liveAt = now
          const first = body.matches[0]?.season
          current = Number(first?.currentMatchday) || current
          season = Number(String(first?.startDate ?? '').slice(0, 4)) || season
        }
      }
      // a match of interest on: the matches of its matchday (or of today) anew, every two minutes
      const on = all.filter((m) => L.inPlay(m, now) && (full || L.playsIn(m, teamId)))
      if (on.length > 0 && now - liveAt >= MIN_GAP) {
        const day = on.find((m) => m.matchday)?.matchday
        const today = new Date(now).toISOString().slice(0, 10)
        const body = await ask(day ? url(`/matches?matchday=${day}`) : url(`/matches?dateFrom=${today}&dateTo=${today}`))
        if (Array.isArray(body?.matches)) {
          const fresh = new Map(body.matches.map((m) => L.fdMatch(m, now)).map((m) => [m.id, m]))
          all = all.map((m) => fresh.get(m.id) ?? m)
          liveAt = now
        }
      }
      // the table: hourly, or when a match ended since the last look
      const ended = before.some((old) => old.state !== 'finished' && all.some((m) => m.id === old.id && m.state === 'finished'))
      // (a competition of several groups has no one table: asked again only once a day)
      if (!tableAt || (table && ended) || now - tableAt >= (table ? L.HOUR : 24 * L.HOUR)) {
        // (a table that does not come does not make the load fail - tried again ten minutes later; the key refused or too many
        // still end the load)
        try {
          table = L.fdTable(await getJson(url('/standings'), headers))
          tableAt = now
        } catch (error) {
          if (error?.status === 401 || error?.status === 403 || error?.status === 429) throw error
          tableAt = now - L.HOUR + 10 * L.MIN
        }
      }
      if (asked > 0 && answered === 0) throw failed
      if (!allAt) throw failed ?? new Error('no matches')
      const matchday = matchdayOf(all, current, now)
      return { season, all, allAt, liveAt, current, matchday, dayAt: allAt, table, tableAt, mine: teamId ? all.filter((m) => L.playsIn(m, teamId)) : [], mineAt: now, partial: !!failed, asked }
    },
    async matchday(_season, n, now = Date.now()) {
      const body = await getJson(url(`/matches?matchday=${n}`), headers)
      const matches = (Array.isArray(body?.matches) ? body.matches : []).map((m) => L.fdMatch(m, now)).sort(L.byKickoff)
      return { number: n, name: '', matches }
    },
    async teams() {
      return L.fdTeams(await getJson(url('/teams'), headers))
    },
  }
}

/** The matchday that runs: the competition's current one; a cup without matchdays: the matches of three days back to four ahead */
function matchdayOf(all, current, now = Date.now()) {
  const from = now - 3 * 24 * L.HOUR
  // (the knockout rounds of a cup have no matchday: the source's current one is then the last of the league phase, long over -
  // while matches without a matchday come; a league in a break between matchdays keeps its current one)
  const ofCurrent = current ? all.filter((m) => m.matchday === current) : []
  const over = ofCurrent.length > 0 && ofCurrent.every((m) => Date.parse(m.kickoff) < from)
  const rounds = all.some((m) => !m.matchday && Date.parse(m.kickoff) >= from)
  if (ofCurrent.length > 0 && !(over && rounds)) return { number: current, name: '', matches: ofCurrent.sort(L.byKickoff) }
  const to = now + 4 * 24 * L.HOUR
  return { number: null, name: '', matches: all.filter((m) => Date.parse(m.kickoff) >= from && Date.parse(m.kickoff) <= to).sort(L.byKickoff) }
}

module.exports = { footballData, matchdayOf, MIN_GAP }
