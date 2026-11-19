// Football, API part: asks the source (OpenLigaDB, free and without a key) for the matchday, the table and the matches of the
// chosen club, keeps them in memory and in its data folder, and gives the display one plain answer (logic.js). While the page
// is open it asks for all of it, every minute while a match runs (logic.nextDelay); with the page closed only for the chosen
// club (the header, the goal), every minute while the club plays and hourly else; without a club, nothing. The crests are
// fetched once and served by the box - the display never asks a server outside.
//   GET /api/ext/football/data[?open=1]  -> { configured, source, league, leagueName, cup, teamId, lang, fetchedAt, stale, error,
//                                             matchday: { number, name, matches }, table, club: { team, live, last, next, rank, points } }
//   GET /api/ext/football/matchday?n=    -> { number, name, matches } (another matchday: the display's swipe)
//   GET /api/ext/football/crest/<hash>   -> the picture
//   GET /api/ext/football/teams?q=       -> [{ label, values: { team, teamId } }] (the app's search, with the login of the parents)
//   GET /api/ext/football/state          -> { rows } (the status block of the app)

'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const L = require('./logic')
const { footballData } = require('./footballdata')

const OLDB = 'https://api.openligadb.de'
const TIMEOUT_MS = 15000
const USER_AGENT = 'MuPiBox-football-extension/0.1 (github.com/wowa1990/MuPiBox)'
// (crests: at most this many on the card, each at most this large; only pictures)
const CREST_MAX = 200
const CREST_BYTES = 512 * 1024
const CREST_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
const EXT_TYPES = Object.fromEntries(Object.entries(CREST_TYPES).map(([t, e]) => [e, t]))
const HASH = /^[a-f0-9]{20}$/
// (football-data.org allows 10 requests a minute; the box keeps to 8)
const FD_PER_MINUTE = 8
// (the matchdays the display swiped to: kept a while, then asked again)
const OTHER_DAY_MS = 10 * L.MIN

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
    // (football-data.org says of a wrong key 400 "Your API token is invalid." - a key refused, as 401)
    if (response.status === 400) {
      const text = await response.text().catch(() => '')
      if (/token/i.test(text)) error.status = 401
    }
    throw error
  }
  return response.json()
}

/** The season of a league that has no matchday right now (the summer break): the year it began. */
const seasonOf = (now = new Date()) => (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1)

/**
 * The addresses to try for a crest, the smallest first. Wikimedia: its small PNG thumbnails (an SVG can be large), then the
 * address of the source, then the SVG itself - Wikimedia makes a thumbnail of a new size for a program only now and then (429),
 * one that exists it gives at once. Other addresses as they are.
 */
function crestCandidates(url) {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/([a-z]+)\/(?:thumb\/)?([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+?\.svg)(?:\/\d+px-[^/?#]+)?$/i.exec(url)
  if (!m) return [url]
  const base = `https://upload.wikimedia.org/wikipedia/${m[1]}`
  const thumb = (px) => `${base}/thumb/${m[2]}/${m[3]}/${m[4]}/${px}px-${m[4]}.png`
  return [...new Set([thumb(120), thumb(250), url, `${base}/${m[2]}/${m[3]}/${m[4]}`])]
}
const crestHash = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)

// (only from these hosts: where the sources keep their crests - an address of another host, or a redirect, is no picture; the
// display then draws the circle with the short name)
const CREST_HOSTS = new Set(['upload.wikimedia.org', 'i.imgur.com', 'assets.dfb.de', 'crests.football-data.org'])
const crestAllowed = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && CREST_HOSTS.has(u.hostname) && !u.port
  } catch {
    return false
  }
}
// (a crest that could not be fetched: not asked again for an hour)
const CREST_FAILED_MS = L.HOUR
// (the page counts as open this long after the display last asked with ?open=1)
const OPEN_MS = 2 * L.MIN

/** Reads the body of a response up to `max` bytes; null when it is larger (it stops reading then). */
async function readLimited(response, max) {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const all = Buffer.from(await response.arrayBuffer())
    return all.length > max ? null : all
  }
  const parts = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  return Buffer.concat(parts)
}

/** The source: OpenLigaDB. load() -> { season, matchday, dayAt, table, tableAt, mine, mineAt }; matchday(n) -> { number, name, matches }. */
function openLigaDb(league) {
  const info = L.OPENLIGADB_LEAGUES[league]
  return {
    minGap: 0,
    cup: !!info?.cup,
    leagueName: info?.name ?? league,
    /**
     * What is asked depends on who looks: with the page open (`full`) the matchday, the table and the club's matches; else only
     * what the header and the goal need - the club's matches, and they only while one of them is on (else hourly). `prev`: what
     * the last load left, kept for what is not asked now. Throws only when nothing it asked for came.
     */
    async load(teamId, prev, { full = true } = {}, now = Date.now()) {
      let asked = 0
      let answered = 0
      let failed = null
      const ask = async (url) => {
        asked += 1
        try {
          const body = await getJson(url)
          answered += 1
          return body
        } catch (error) {
          failed = error
          return undefined
        }
      }
      let { season, matchday, dayAt = 0, table = null, tableAt = 0, mine = [], mineAt = 0 } = prev ?? {}
      if (full || !matchday || now - dayAt >= L.HOUR) {
        const current = await ask(`${OLDB}/getmatchdata/${encodeURIComponent(league)}`)
        if (Array.isArray(current)) {
          season = Number(current[0]?.leagueSeason) || season || seasonOf(new Date(now))
          const matches = current.map((m) => L.olMatch(m, now)).sort(L.byKickoff)
          const ended = (matchday?.matches ?? []).some((old) => old.state !== 'finished' && matches.some((m) => m.id === old.id && m.state === 'finished'))
          matchday = { number: matches[0]?.matchday ?? null, name: matches[0]?.matchdayName ?? '', matches }
          dayAt = now
          if (!info?.cup && (!table || ended || prev?.season !== season || now - tableAt >= L.HOUR)) {
            const rows = await ask(`${OLDB}/getbltable/${encodeURIComponent(league)}/${season}`)
            if (Array.isArray(rows)) {
              table = L.olTable(rows)
              tableAt = now
            }
          }
        }
      }
      // (the club's matches in every competition: a few weeks back and ahead)
      const clubOn = mine.some((m) => L.inPlay(m, now))
      if (teamId && (!mineAt || clubOn || now - mineAt >= (full ? 10 * L.MIN : L.HOUR))) {
        const list = await ask(`${OLDB}/getmatchesbyteamid/${teamId}/5/10`)
        if (Array.isArray(list)) {
          mine = list.map((m) => L.olMatch(m, now))
          mineAt = now
        }
      }
      if (!teamId) mine = []
      if (asked > 0 && answered === 0) throw failed
      if (!matchday) throw failed ?? new Error('no matchday')
      return { season: season ?? seasonOf(new Date(now)), matchday, dayAt, table: info?.cup ? null : table, tableAt, mine, mineAt, partial: !!failed }
    },
    async matchday(season, n, now = Date.now()) {
      const list = await getJson(`${OLDB}/getmatchdata/${encodeURIComponent(league)}/${season}/${n}`)
      const matches = (Array.isArray(list) ? list : []).map((m) => L.olMatch(m, now)).sort(L.byKickoff)
      return { number: n, name: matches[0]?.matchdayName ?? '', matches }
    },
    async teams(season) {
      const list = await getJson(`${OLDB}/getavailableteams/${encodeURIComponent(league)}/${season}`)
      return L.olTeams(Array.isArray(list) ? list : [])
    },
  }
}

exports.activate = (host) => {
  const dataDir = host.dataDir
  const crestDir = path.join(dataDir, 'crests')
  const cacheFile = path.join(dataDir, 'cache.json')
  /** what was loaded last, for the settings it was loaded for (key) */
  let view = null
  let loading = null
  let timer = null
  let errors = 0
  let lastError = ''
  let nextAt = 0
  /** the settings the last load that failed was for: no new try for them before nextAt (the back-off) */
  let failedKey = ''
  /** when the display last asked with the page open */
  let lastOpenAt = 0
  /** hash -> address of the crests in what the box shows */
  const crests = new Map()
  /** hash -> when fetching it failed */
  const crestFailed = new Map()
  const otherDays = new Map()
  /** the tables of the clubs' leagues beside the one chosen: "o:bl2" -> { at, table } */
  const tables = new Map()
  /** the teams of a league for the app's search: key -> { at, teams } */
  const teamLists = new Map()

  try {
    const kept = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (kept && typeof kept.key === 'string' && kept.matchday) view = kept
    for (const [k, v] of Object.entries(kept?.clubData ?? {})) if (/^[of]:\d{1,8}$/.test(k) && Array.isArray(v?.matches)) clubData.set(k, v)
    for (const [h, u] of Object.entries(kept?.crests ?? {})) if (HASH.test(h) && typeof u === 'string') crests.set(h, u)
  } catch {
    // (none yet)
  }

  // (the source chosen: OpenLigaDB, or football-data.org with the user's key)
  const fd = (s) => s?.source === 'footballdata'
  const leagueOf = (s) => (fd(s) ? s.fdLeague : s.league)
  // (the league - matchday and table; the clubs the user follows are a layer of their own, see loadClubs)
  const srcOf = (s) => (fd(s) ? 'f' : 'o')
  const keyOf = (s) => `${fd(s) ? 'footballdata' : 'openligadb'}:${leagueOf(s)}`
  const clubsOfS = (s) => L.clubsOf(s?.clubs)
  /** what was loaded of each club followed: "o:40" -> { matches, at } */
  const clubData = new Map()
  const clubKey = (c) => `${c.src}:${c.id}`
  // (football-data.org allows 10 requests a minute for the key: loads, swipes and the app's search together stay at 8 - one more
  // is refused here as too many, without asking, and the last values stay)
  const fdAsked = []
  const fdGetJson = (url, headers) => {
    const now = Date.now()
    while (fdAsked.length && now - fdAsked[0] > L.MIN) fdAsked.shift()
    if (fdAsked.length >= FD_PER_MINUTE) return Promise.reject(Object.assign(new Error('too many requests (box limit)'), { status: 429 }))
    fdAsked.push(now)
    return getJson(url, headers)
  }
  const sourceOf = (s) => (fd(s) ? footballData(s.fdLeague, String(s.apiKey ?? ''), fdGetJson) : openLigaDb(s.league))
  const configured = (s) =>
    fd(s) ? typeof s.fdLeague === 'string' && Object.hasOwn(L.FOOTBALLDATA_LEAGUES, s.fdLeague) && typeof s.apiKey === 'string' && s.apiKey.trim() !== '' : typeof s?.league === 'string' && Object.hasOwn(L.OPENLIGADB_LEAGUES, s.league)
  const pageOpen = () => Date.now() - lastOpenAt < OPEN_MS

  /** The crest of a team as an address of the box (the source's address noted for /crest). */
  function withCrests(team) {
    if (!team) return team
    if (!team.crest) return { ...team, crest: '' }
    const hash = crestHash(team.crest)
    crests.set(hash, team.crest)
    return { ...team, crest: `/ext/football/crest/${hash}` }
  }
  const matchOut = (m) => (m ? { ...m, home: withCrests(m.home), away: withCrests(m.away) } : m)

  /** The teams of what is loaded (for the crests that are still needed) */
  const teamsOfView = () =>
    [...(view?.matchday?.matches ?? []), ...[...clubData.values()].flatMap((c) => c.matches)].flatMap((m) => [m.home, m.away]).concat((view?.table ?? []).map((r) => r.team))

  let savedKey = ''
  let savedAt = 0
  function save() {
    const now = `${view?.key ?? ''}|${[...clubData.keys()].join(',')}`
    if (now === savedKey && Date.now() - savedAt < 10 * L.MIN) return
    savedKey = now
    savedAt = Date.now()
    try {
      // (only the crests of what is loaded - and those on the card: an address the source no longer gives is forgotten)
      const wanted = new Set(teamsOfView().filter((t) => t?.crest).map((t) => crestHash(t.crest)))
      let onCard = new Set()
      try {
        onCard = new Set(fs.readdirSync(crestDir).map((n) => n.split('.')[0]))
      } catch {
        // (none yet)
      }
      for (const h of [...crests.keys()]) if (!wanted.has(h) && !onCard.has(h)) crests.delete(h)
      fs.mkdirSync(dataDir, { recursive: true })
      const tmp = `${cacheFile}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ ...view, clubData: Object.fromEntries(clubData), crests: Object.fromEntries(crests) }))
      fs.renameSync(tmp, cacheFile)
    } catch (error) {
      host.log.warn(`[Extension football] cache: ${error.message}`)
    }
  }

  /** The matches that decide how often to ask: the clubs' always, the matchday's while the page is open */
  const interesting = () => {
    const clubs = [...clubData.values()].flatMap((c) => c.matches)
    return pageOpen() ? [...(view?.matchday?.matches ?? []), ...clubs] : clubs
  }

  /**
   * The matches of the clubs followed, each asked at its source: when not known yet, every minute (two at football-data.org)
   * while one of its matches is on, every ten minutes while the page is open, else hourly. A club whose request fails keeps
   * what it had. Clubs no longer followed are forgotten.
   */
  async function loadClubs(s, full, now = Date.now()) {
    const clubs = clubsOfS(s)
    for (const k of [...clubData.keys()]) if (!clubs.some((c) => clubKey(c) === k)) clubData.delete(k)
    let failed = null
    for (const c of clubs) {
      const have = clubData.get(clubKey(c))
      const on = have?.matches?.some((m) => L.inPlay(m, now))
      const every = on ? (c.src === 'f' ? 2 * L.MIN : L.MIN) : full ? 10 * L.MIN : L.HOUR
      // (after an error: again at retryAt - a minute after "too many", else up to five minutes)
      if (have && (have.retryAt ? now < have.retryAt : now - have.at < every)) continue
      try {
        const got = await clubMatchesOf(s, c, now, have?.days)
        clubData.set(clubKey(c), { at: now, okAt: now, days: got.days, matches: got.matches })
      } catch (error) {
        failed = error
        host.log.warn(`[Extension football] club ${clubKey(c)}: ${error?.message}`)
        const retryAt = now + (error?.status === 429 ? L.MIN : Math.min(every, 5 * L.MIN))
        if (have) Object.assign(have, { at: now, retryAt })
        else clubData.set(clubKey(c), { at: now, okAt: 0, retryAt, matches: [], failed: true })
      }
    }
    return failed
  }
  /** One club's matches, a few weeks back and ahead */
  async function clubMatchesOf(s, c, now, days) {
    if (c.src === 'o') {
      const list = await getJson(`${OLDB}/getmatchesbyteamid/${c.id}/5/10`)
      return { matches: L.clubDays((Array.isArray(list) ? list : []).map((m) => L.olMatch(m, now)), c.id) }
    }
    const key = String(s.apiKey ?? '').trim()
    if (!key) throw Object.assign(new Error('no key'), { status: 401 })
    const day = (d) => new Date(now + d * 24 * L.HOUR).toISOString().slice(0, 10)
    const ask = (days) => fdGetJson(`https://api.football-data.org/v4/teams/${c.id}/matches?dateFrom=${day(-days)}&dateTo=${day(days)}`, { 'X-Auth-Token': key })
    // (a range the free tier does not take: a shorter one - and that one from then on, not two requests each time)
    let range = days === 10 ? 10 : 21
    const body = await ask(range).catch((error) => {
      if (error?.status !== 400 || range === 10) throw error
      range = 10
      return ask(10)
    })
    return { days: range, matches: L.clubDays((Array.isArray(body?.matches) ? body.matches : []).map((m) => L.fdMatch(m, now)), c.id) }
  }

  /** Loads anew for the settings `s` (one load at a time; one that was asked for meanwhile does not run when the values are new). */
  async function load(s) {
    const key = keyOf(s)
    while (loading) {
      await loading.catch(() => undefined)
      if (view?.key === key && Date.now() < nextAt && (!pageOpen() || Date.now() - (view.dayAt ?? 0) < L.MIN)) return
    }
    const prev = view?.key === key ? view : null
    const full = pageOpen() || !prev
    loading = (async () => {
      const src = sourceOf(s)
      try {
        const got = await src.load(0, prev, { full })
        view = { key, league: leagueOf(s), fetchedAt: Date.now(), ...got }
        errors = got.partial ? errors + 1 : 0
        lastError = got.partial ? lastError || 'offline' : ''
        failedKey = ''
      } catch (error) {
        errors += 1
        lastError = error?.status === 429 ? 'too_many' : error?.status === 401 || error?.status === 403 ? 'refused' : 'offline'
        failedKey = key
        host.log.warn(`[Extension football] ${leagueOf(s)}: ${error?.message}`)
        // (the last values stay - for other settings there are none)
        if (!prev) view = null
      }
      // (the clubs: whatever became of the league)
      await loadClubs(s, full).catch(() => undefined)
      // (the tables of the clubs' other leagues: only for a look at the page)
      if (full) await loadTables(s).catch(() => undefined)
      save()
      // (the voice takes a few seconds: the load does not wait for it)
      void goals(s, key).catch((error) => host.log.warn(`[Extension football] goal: ${error?.message}`))
      // (the clubs at their own pace: a league that waits after errors does not hold them back)
      const clubsDue = Math.min(...[...clubData.values()].filter((c) => c.retryAt).map((c) => c.retryAt - Date.now()), Infinity)
      nextAt = Date.now() + Math.min(L.nextDelay(interesting(), Date.now(), { errors, minGap: src.minGap }), L.nextDelay([...clubData.values()].flatMap((c) => c.matches), Date.now(), { minGap: src.minGap }), Math.max(5000, clubsDue))
    })()
    try {
      await loading
    } finally {
      loading = null
    }
  }

  // ---- the goal of the club, said by the box (F4) ----
  /** the scores of the club's matches as the last look saw them, for the settings `goalKey` (other settings: a first look again) */
  let goalSeen = new Map()
  const startedAt = Date.now()
  let goalKey = ''
  let saidAt = 0
  const fresh = (m, now = Date.now()) => (m.state === 'postponed' ? m : { ...m, state: L.stateOf({ kickoff: m.kickoff, finished: m.state === 'finished' }, now) })
  /** One club's matches with their state anew */
  const matchesOfClub = (c, now = Date.now()) => (clubData.get(clubKey(c))?.matches ?? []).map((m) => fresh(m, now))
  /** After a load: a goal of the club since the last look is said - when the user wants it, not at the first look, not in the
   *  quiet hours or while the box is blocked, at most once a minute (several at once: the last one) */
  async function goals(s, key) {
    const clubs = clubsOfS(s)
    if (clubs.length === 0) return
    // (other clubs: a first look again)
    const first = goalKey !== `${key}|${s.clubs}`
    const before = first ? new Map() : goalSeen
    const seen = new Map()
    const scored = []
    for (const c of clubs) {
      if (!((clubData.get(clubKey(c))?.okAt ?? 0) >= startedAt)) continue
      // (the matches of a club by source and number: two sources may give one number to two clubs)
      const mine = new Map([...before].filter(([k]) => k.startsWith(`${clubKey(c)}:`)).map(([k, v]) => [Number(k.split(':')[2]), v]))
      const got = L.newGoals(matchesOfClub(c), c.id, mine)
      for (const [id, v] of got.seen) seen.set(`${clubKey(c)}:${id}`, v)
      for (const g of got.goals) scored.push({ ...g, club: c })
    }
    scored.sort((a, b) => (Date.parse(a.match.kickoff) || 0) - (Date.parse(b.match.kickoff) || 0))
    // (said a moment ago: the goal stays new, the next look - in a minute - says it)
    if (scored.length > 0 && s.announce === true && Date.now() - saidAt < L.MIN) {
      for (const g of scored) seen.set(`${clubKey(g.club)}:${g.match.id}`, before.get(`${clubKey(g.club)}:${g.match.id}`))
    }
    goalSeen = seen
    goalKey = `${key}|${s.clubs}`
    if (scored.length === 0 || s.announce !== true || Date.now() - saidAt < L.MIN) return
    const rest = typeof host.rest === 'function' ? await host.rest() : { quiet: false, blocked: false }
    if (rest.quiet || rest.blocked) return
    saidAt = Date.now()
    const lang = String(host.config()?.mupibox?.ttsLanguage ?? 'de')
    await host.say?.(L.goalText(scored.at(-1), lang))
  }

  /** Whether a load for `s` is due: other settings than those loaded (unless their last try failed and waits), or the time came */
  const due = (s) => {
    const key = keyOf(s)
    if (clubsOfS(s).some((c) => !clubData.has(clubKey(c)))) return true
    if (view?.key !== key) return failedKey !== key || Date.now() >= nextAt
    return Date.now() >= nextAt
  }

  // With a club chosen the box asks on its own (the header shows a match that runs, the goal is announced) - seldom, unless
  // one of the club's matches is on; without a club only while the page is open (/data asks when the values are old).
  async function tick() {
    clearTimeout(timer)
    timer = null
    let wait = 5 * L.MIN
    try {
      const s = await host.settings()
      if (!configured(s) || clubsOfS(s).length === 0) return
      if (due(s)) await load(s)
      wait = Math.max(5000, nextAt - Date.now())
    } catch (error) {
      host.log.warn(`[Extension football] ${error?.message}`)
    }
    timer = setTimeout(() => void tick(), wait)
    timer.unref?.()
  }
  host.onSettings(() => {
    nextAt = 0
    // (clubs that failed: asked again at once; new ones are due anyway, see due())
    for (const c of clubData.values()) if (c.failed || c.retryAt) c.retryAt = 1
    errors = 0
    failedKey = ''
    otherDays.clear()
    void tick()
  })
  // (a little after the start: the server has other things to do first)
  setTimeout(() => void tick(), 20000).unref?.()

  host.route('get', '/data', async (req, res) => {
    const s = await host.settings()
    res.set('Cache-Control', 'no-store')
    if (!configured(s)) {
      res.json({ configured: false })
      return
    }
    // (the page is open: the box asks for all of it, and as often as the matchday needs)
    if (req.query?.open === '1') {
      const wasOpen = pageOpen()
      lastOpenAt = Date.now()
      if (!wasOpen && view?.key === keyOf(s)) nextAt = Math.min(nextAt, Date.now() + L.nextDelay(interesting(), Date.now(), { errors, minGap: sourceOf(s).minGap }))
      if (!wasOpen && view?.key === keyOf(s) && Date.now() - (view.dayAt ?? 0) >= 10 * L.MIN) nextAt = 0
    }
    if (due(s)) await load(s)
    const lang = String(host.config()?.displayLanguage ?? 'de').slice(0, 2)
    if (!view || view.key !== keyOf(s)) {
      res.json({ configured: true, league: leagueOf(s), lang, error: lastError || 'offline' })
      return
    }
    const src = sourceOf(s)
    const now = Date.now()
    // (the state of each match anew from the time: a kick-off passed since the last load, a match the source never said was over)
    const matches = (view.matchday?.matches ?? []).map((m) => fresh(m, now))
    // (each club: its last, next and running match; its place when it plays in the league shown)
    const clubs = clubsOfS(s).map((c) => {
      // (its place: in the table of its league when the box has it, else in the league chosen)
      const own = L.clubLeague(c.src, clubData.get(clubKey(c))?.matches)
      const table = (own && tableOf(s, `${c.src}:${own}`)) || (c.src === srcOf(s) ? view.table : null)
      const got = L.myClub(matchesOfClub(c, now), table, c.id, now)
      const team = got?.team ?? { id: c.id, name: c.name, short: c.name, tla: L.tlaOf({ name: c.name }), crest: '' }
      return { src: c.src, ...got, team: withCrests(team), live: matchOut(got?.live), last: matchOut(got?.last), next: matchOut(got?.next), known: !clubData.get(clubKey(c))?.failed }
    })
    res.json({
      configured: true,
      source: fd(s) ? 'footballdata' : 'openligadb',
      league: leagueOf(s),
      leagueName: src.leagueName,
      // (football-data.org gives the scores of its free tier with a delay: the display says so)
      delayed: !!src.delayed,
      cup: src.cup,
      // (the clubs of this source: highlighted in the matchday and the table)
      teamIds: clubsOfS(s).filter((c) => c.src === srcOf(s)).map((c) => c.id),
      lang,
      fetchedAt: view.fetchedAt,
      stale: errors > 0,
      error: lastError || null,
      matchday: { number: view.matchday?.number ?? null, name: view.matchday?.name ?? '', matches: matches.map(matchOut) },
      table: view.table ? view.table.map((r) => ({ ...r, team: withCrests(r.team) })) : null,
      // (the leagues with a table to choose: the one chosen and those of the clubs)
      tables: tableLeagues(s).map(({ key, name, code }) => ({ key, name, league: code })),
      clubs,
    })
  })

  // The header of the display: the club's match that runs now - what was loaded last, never a new request (the box asks on its
  // own every minute while the club plays). Nothing in the quiet hours, while the box is blocked, or when the user switched it off.
  host.route('get', '/live', async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    const s = await host.settings()
    if (!configured(s) || s.header === false || clubsOfS(s).length === 0) {
      res.json({ live: [] })
      return
    }
    const rest = typeof host.rest === 'function' ? await host.rest() : { quiet: false, blocked: false }
    // (only from a fresh look at the club - the box asks every minute while it plays: after the source went away, or after a
    // start with old values from the card, no match counts as running)
    if (rest.quiet || rest.blocked) {
      res.json({ live: [] })
      return
    }
    // (each club's match that runs, each match once - two clubs followed may play each other)
    const live = new Map()
    for (const c of clubsOfS(s)) {
      const fresh = Date.now() - (clubData.get(clubKey(c))?.okAt ?? 0) < 3 * L.MIN
      const m = fresh ? matchesOfClub(c).find((x) => x.state === 'live') : null
      if (m && !live.has(`${c.src}:${m.id}`)) live.set(`${c.src}:${m.id}`, matchOut(m))
    }
    res.json({ live: [...live.values()].slice(0, 3) })
  })

  /** The leagues with a table to choose at the display: the one chosen first (when it has a table), then those of the clubs */
  function tableLeagues(s) {
    const out = []
    const add = (src, code) => {
      if (!code || out.some((l) => l.src === src && l.code === code)) return
      out.push({ key: `${src}:${code}`, src, code, name: L.leagueName(src, code) })
    }
    if (view?.table?.length) add(srcOf(s), leagueOf(s))
    for (const c of clubsOfS(s)) {
      // (football-data.org without a key: no table of its leagues)
      if (c.src === 'f' && !String(s.apiKey ?? '').trim()) continue
      add(c.src, L.clubLeague(c.src, clubData.get(clubKey(c))?.matches))
    }
    return out
  }
  /** The table of a league: the one chosen from the view, the others as kept */
  const tableOf = (s, key) => (key === `${srcOf(s)}:${leagueOf(s)}` ? (view?.table ?? null) : (tables.get(key)?.table ?? null))
  /** The tables of the clubs' leagues beside the one chosen: each asked once an hour (after an error ten minutes later) */
  async function loadTables(s, now = Date.now()) {
    const wanted = tableLeagues(s).filter((l) => l.key !== `${srcOf(s)}:${leagueOf(s)}`)
    for (const k of [...tables.keys()]) if (!wanted.some((l) => l.key === k)) tables.delete(k)
    for (const l of wanted) {
      const have = tables.get(l.key)
      if (have && now - have.at < L.HOUR) continue
      try {
        let table = null
        if (l.src === 'o') table = L.olTable(await getJson(`${OLDB}/getbltable/${encodeURIComponent(l.code)}/${seasonOf(new Date(now))}`))
        else table = L.fdTable(await fdGetJson(`https://api.football-data.org/v4/competitions/${encodeURIComponent(l.code)}/standings`, { 'X-Auth-Token': String(s.apiKey ?? '').trim() }))
        tables.set(l.key, { at: now, table })
      } catch (error) {
        host.log.warn(`[Extension football] table ${l.key}: ${error?.message}`)
        tables.set(l.key, { at: now - L.HOUR + 10 * L.MIN, table: have?.table ?? null })
      }
    }
  }

  // Another table of the display (the league of a club): as kept, asked when there is none yet
  host.route('get', '/table', async (req, res) => {
    const s = await host.settings()
    res.set('Cache-Control', 'no-store')
    const l = tableLeagues(s).find((x) => x.key === String(req.query.l ?? ''))
    if (!configured(s) || !l) {
      res.status(404).json({ error: 'no table' })
      return
    }
    if (!tableOf(s, l.key) && !tables.has(l.key)) await loadTables(s).catch(() => undefined)
    const table = tableOf(s, l.key)
    res.json({
      key: l.key,
      name: l.name,
      league: l.code,
      table: table ? table.map((r) => ({ ...r, team: withCrests(r.team) })) : null,
      // (the clubs of this source: highlighted)
      teamIds: clubsOfS(s).filter((c) => c.src === l.src).map((c) => c.id),
    })
  })

  host.route('get', '/matchday', async (req, res) => {
    const s = await host.settings()
    const n = Number(req.query.n)
    res.set('Cache-Control', 'no-store')
    if (!configured(s) || !view || view.key !== keyOf(s) || !Number.isInteger(n) || n < 1 || n > 60) {
      res.status(400).json({ error: 'no matchday' })
      return
    }
    if (Array.isArray(view.all)) {
      const matches = view.all.filter((m) => m.matchday === n).sort(L.byKickoff)
      res.json({ number: n, name: '', matches: matches.map(matchOut) })
      return
    }
    const key = `${keyOf(s)}:${view.season}:${n}`
    let entry = otherDays.get(key)
    if (!entry || Date.now() - entry.at > OTHER_DAY_MS) {
      try {
        entry = { at: Date.now(), day: await sourceOf(s).matchday(view.season, n) }
        otherDays.set(key, entry)
        // (a few only: the display swipes through some, never all)
        if (otherDays.size > 12) otherDays.delete(otherDays.keys().next().value)
      } catch (error) {
        host.log.warn(`[Extension football] matchday ${n}: ${error.message}`)
        if (!entry) {
          res.status(502).json({ error: 'offline' })
          return
        }
      }
    }
    res.json({ ...entry.day, matches: entry.day.matches.map(matchOut) })
  })

  // A crest: from the card when the box has it, else fetched once (from the hosts the sources use, https, a picture, not too
  // large, no redirect) and kept
  host.route('get', '/crest/:hash', async (req, res) => {
    const hash = String(req.params.hash)
    const none = () => res.status(404).set('Cache-Control', 'public, max-age=900').end()
    if (!HASH.test(hash)) {
      none()
      return
    }
    const send = (file, type) => {
      res.set('Cache-Control', 'public, max-age=604800')
      res.set('X-Content-Type-Options', 'nosniff')
      // (an SVG is a document: no script, nothing from outside - and the display shows it as an <img> only)
      if (type === 'image/svg+xml') res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      res.type(type).send(fs.readFileSync(file))
    }
    const kept = onCard(hash)
    if (kept) {
      send(kept.file, kept.type)
      return
    }
    const url = crests.get(hash)
    if (!url || !crestAllowed(url) || Date.now() < busyUntil || Date.now() - (crestFailed.get(hash) ?? 0) < CREST_FAILED_MS) {
      none()
      return
    }
    // (only a few wait for their crest: a page of twenty crests at once would hold the display's other requests - the rest is
    // fetched in the background, and the display asks for it once more a little later)
    const job = getCrest(hash, url)
    if (crestWaiting > CREST_WAIT) {
      job.catch(() => undefined)
      res.status(404).set('Cache-Control', 'no-store').end()
      return
    }
    const got = await job.catch(() => null)
    if (got) send(got.file, got.type)
    else none()
  })

  // (the crests asked for and not fetched yet; how many requests wait for one; until when the servers refused - 429 - and no
  // crest is asked for)
  const crestJobs = new Map()
  let crestWaiting = 0
  let busyUntil = 0
  const CREST_WAIT = 3
  /** The crest `hash` fetched (one at a time) and put on the card: { file, type } */
  function getCrest(hash, url) {
    if (crestJobs.has(hash)) return crestJobs.get(hash)
    crestWaiting += 1
    const job = crestQueue(async () => {
      const already = onCard(hash)
      if (already) return already
      if (Date.now() < busyUntil || Date.now() - (crestFailed.get(hash) ?? 0) < CREST_FAILED_MS) throw new Error('not now')
      try {
        const { type, body } = await fetchCrest(url)
        fs.mkdirSync(crestDir, { recursive: true })
        const file = path.join(crestDir, `${hash}.${CREST_TYPES[type]}`)
        fs.writeFileSync(file, body)
        crestFailed.delete(hash)
        tidyCrests()
        return { file, type }
      } catch (error) {
        // (refused for too many: no crest at all for a quarter of an hour; else this one not for an hour)
        if (error.busy) busyUntil = Date.now() + 15 * L.MIN
        else crestFailed.set(hash, Date.now())
        // (a few hundred at most: the oldest go)
        if (crestFailed.size > 300) crestFailed.delete(crestFailed.keys().next().value)
        host.log.warn(`[Extension football] crest: ${error.message}`)
        throw error
      }
    }).finally(() => {
      crestWaiting -= 1
      crestJobs.delete(hash)
    })
    crestJobs.set(hash, job)
    return job
  }

  /** The crest when the box has it: { file, type } */
  function onCard(hash) {
    for (const ext of Object.keys(EXT_TYPES)) {
      const file = path.join(crestDir, `${hash}.${ext}`)
      if (fs.existsSync(file)) return { file, type: EXT_TYPES[ext] }
    }
    return null
  }
  let crestChain = Promise.resolve()
  const crestQueue = (work) => {
    const run = crestChain.then(work)
    crestChain = run.catch(() => undefined)
    return run
  }
  /** A crest from the first of its addresses that gives a picture: { type, body } */
  async function fetchCrest(url) {
    let why = 'no address'
    let refused = 0
    let tried = 0
    for (const candidate of crestCandidates(url)) {
      tried += 1
      try {
        const response = await fetch(candidate, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
        const type = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        // (too many: Wikimedia says so for a thumbnail it would have to make - the next address may be one it has; refused for
        // all of them, the box waits, see getCrest)
        if (response.status === 429) {
          await response.body?.cancel?.().catch(() => undefined)
          refused += 1
          why = 'too many requests (429)'
          continue
        }
        if (!response.ok || !CREST_TYPES[type] || Number(response.headers.get('content-length')) > CREST_BYTES) {
          why = `not a picture (${response.status} ${type})`
          await response.body?.cancel?.().catch(() => undefined)
          continue
        }
        const body = await readLimited(response, CREST_BYTES)
        if (body && body.length > 0) return { type, body }
        why = 'too large or empty'
      } catch (error) {
        why = error.message
      }
    }
    const error = new Error(why)
    // (every address refused for too many)
    error.busy = refused > 0 && refused === tried
    throw error
  }

  /** At most CREST_MAX crests: the oldest go. */
  function tidyCrests() {
    try {
      const files = fs.readdirSync(crestDir).map((name) => ({ name, at: fs.statSync(path.join(crestDir, name)).mtimeMs }))
      if (files.length <= CREST_MAX) return
      files.sort((a, b) => a.at - b.at)
      for (const f of files.slice(0, files.length - CREST_MAX)) fs.rmSync(path.join(crestDir, f.name), { force: true })
    } catch {
      // (tidied next time)
    }
  }

  // The app's search of the clubs to follow: the teams of the source chosen that fit (OpenLigaDB: its leagues of the box and the
  // national teams; football-data.org: the competition chosen) - a tap adds the club; and the clubs followed, a tap takes one
  // away. The answer carries the whole new list (the app saves what a hit says). For the user chosen in the app (?user=).
  host.route(
    'get',
    '/teams',
    async (req, res) => {
      const s = await host.settings(typeof req.query.user === 'string' ? req.query.user : undefined)
      const q = String(req.query.q ?? '').trim().toLocaleLowerCase('de').slice(0, 60)
      const followed = clubsOfS(s)
      const entry = (label, list) => ({ label, values: { clubs: L.clubsText(list), clubNames: L.clubNames(list) } })
      const out = []
      if (configured(s) && followed.length < L.MAX_CLUBS) {
        try {
          const teams = await searchTeams(s)
          const src = srcOf(s)
          for (const team of teams) {
            if (out.length >= 10 - followed.length) break
            if (q && !team.name.toLocaleLowerCase('de').includes(q) && !team.short.toLocaleLowerCase('de').includes(q)) continue
            if (followed.some((c) => c.src === src && c.id === team.id)) continue
            out.push(entry(`＋ ${team.name}`, [...followed, { src, id: team.id, name: team.name }]))
          }
        } catch (error) {
          host.log.warn(`[Extension football] teams: ${error.message}`)
          if (followed.length === 0) {
            res.status(502).json({ error: 'search failed' })
            return
          }
        }
      }
      for (const c of followed) out.push(entry(`✕ ${c.name}`, followed.filter((x) => x !== c)))
      res.json(out)
    },
    { session: true },
  )

  // (OpenLigaDB: the leagues of the box and those its people keep for the national teams - the World Cup, the matches of the DFB)
  const OLDB_SEARCH = ['bl1', 'bl2', 'bl3', 'ffb1', 'DFBN', 'wm26']
  /** The teams to search, kept an hour per source and league */
  async function searchTeams(s) {
    const season = seasonOf()
    const sets = fd(s) ? [[`f:${s.fdLeague}`, () => sourceOf(s).teams()]] : OLDB_SEARCH.map((l) => [`o:${l}:${season}`, () => openLigaDb(l).teams(season)])
    let answered = 0
    const lists = await Promise.all(
      sets.map(async ([key, get]) => {
        const kept = teamLists.get(key)
        if (kept && Date.now() - kept.at < L.HOUR) {
          answered += 1
          return kept.teams
        }
        try {
          const teams = await get()
          answered += 1
          teamLists.set(key, { at: Date.now(), teams })
          if (teamLists.size > 16) teamLists.delete(teamLists.keys().next().value)
          return teams
        } catch {
          // (not kept: the next search asks again)
          return kept ? kept.teams : []
        }
      }),
    )
    if (answered === 0) throw new Error('no answer')
    const all = lists.flat()
    const seen = new Set()
    return all.filter((team) => team.id && !seen.has(team.id) && seen.add(team.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }

  // The status block of the app: fixed sentences (the app translates those it knows)
  host.route(
    'get',
    '/state',
    async (_req, res) => {
      const s = await host.settings()
      const rows = []
      if (fd(s) && !(typeof s.apiKey === 'string' && s.apiKey.trim())) rows.push({ label: 'Zustand', value: 'Schlüssel fehlt', tone: 'warn' })
      else if (!configured(s)) rows.push({ label: 'Zustand', value: 'Keine Liga gewählt', tone: 'warn' })
      else if (lastError === 'too_many') rows.push({ label: 'Zustand', value: 'Zu viele Abfragen, die Box wartet', tone: 'warn' })
      else if (lastError === 'refused') rows.push({ label: 'Zustand', value: 'Schlüssel abgelehnt', tone: 'error' })
      else if (lastError) rows.push({ label: 'Zustand', value: 'Quelle nicht erreichbar', tone: 'error' })
      else rows.push({ label: 'Zustand', value: view ? 'OK' : 'Noch nicht abgefragt', tone: view ? 'ok' : 'warn' })
      if (view?.fetchedAt) rows.push({ label: 'Letzte Abfrage', value: new Date(view.fetchedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) })
      res.json({ rows })
    },
    { session: true },
  )
}

exports._test = { crestCandidates, crestHash, seasonOf, openLigaDb }
