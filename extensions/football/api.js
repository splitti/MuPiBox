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

const OLDB = 'https://api.openligadb.de'
const TIMEOUT_MS = 15000
const USER_AGENT = 'MuPiBox-football-extension/0.1 (github.com/wowa1990/MuPiBox)'
// (crests: at most this many on the card, each at most this large; only pictures)
const CREST_MAX = 200
const CREST_BYTES = 512 * 1024
const CREST_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
const EXT_TYPES = Object.fromEntries(Object.entries(CREST_TYPES).map(([t, e]) => [e, t]))
const HASH = /^[a-f0-9]{20}$/
// (the matchdays the display swiped to: kept a while, then asked again)
const OTHER_DAY_MS = 10 * L.MIN

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
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

  try {
    const kept = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (kept && typeof kept.key === 'string' && kept.matchday) view = kept
    for (const [h, u] of Object.entries(kept?.crests ?? {})) if (HASH.test(h) && typeof u === 'string') crests.set(h, u)
  } catch {
    // (none yet)
  }

  const keyOf = (s) => `openligadb:${s.league}:${Number(s.teamId) || 0}`
  const sourceOf = (s) => openLigaDb(s.league)
  const configured = (s) => typeof s?.league === 'string' && Object.hasOwn(L.OPENLIGADB_LEAGUES, s.league)
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
  const teamsOfView = () => [...(view?.matchday?.matches ?? []), ...(view?.mine ?? [])].flatMap((m) => [m.home, m.away]).concat((view?.table ?? []).map((r) => r.team))

  function save() {
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
      fs.writeFileSync(tmp, JSON.stringify({ ...view, crests: Object.fromEntries(crests) }))
      fs.renameSync(tmp, cacheFile)
    } catch (error) {
      host.log.warn(`[Extension football] cache: ${error.message}`)
    }
  }

  /** The matches that decide how often to ask: all of them while the page is open, else only the club's. */
  const interesting = () => {
    const all = [...(view?.matchday?.matches ?? []), ...(view?.mine ?? [])]
    return pageOpen() ? all : all.filter((m) => L.playsIn(m, view?.teamId))
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
        const got = await src.load(Number(s.teamId) || 0, prev, { full })
        view = { key, league: s.league, teamId: Number(s.teamId) || 0, fetchedAt: Date.now(), ...got }
        errors = got.partial ? errors + 1 : 0
        lastError = got.partial ? lastError || 'offline' : ''
        failedKey = ''
        save()
      } catch (error) {
        errors += 1
        lastError = error?.status === 429 ? 'too_many' : error?.status === 401 || error?.status === 403 ? 'refused' : 'offline'
        failedKey = key
        host.log.warn(`[Extension football] ${s.league}: ${error?.message}`)
        // (the last values stay - for other settings there are none)
        if (!prev) view = null
      }
      nextAt = Date.now() + L.nextDelay(interesting(), Date.now(), { errors, minGap: src.minGap })
    })()
    try {
      await loading
    } finally {
      loading = null
    }
  }

  /** Whether a load for `s` is due: other settings than those loaded (unless their last try failed and waits), or the time came */
  const due = (s) => {
    const key = keyOf(s)
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
      if (!configured(s) || !(Number(s.teamId) > 0)) return
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
      res.json({ configured: true, league: s.league, lang, error: lastError || 'offline' })
      return
    }
    const src = sourceOf(s)
    const now = Date.now()
    // (the state of each match anew from the time: a kick-off passed since the last load, a match the source never said was over)
    const fresh = (m) => (m.state === 'postponed' ? m : { ...m, state: L.stateOf({ kickoff: m.kickoff, finished: m.state === 'finished' }, now) })
    const matches = (view.matchday?.matches ?? []).map(fresh)
    const mine = (view.mine ?? []).map(fresh)
    // (the club's own list last: asked more often than the matchday when the page is closed)
    const club = L.myClub([...matches, ...mine], view.table, view.teamId, now)
    res.json({
      configured: true,
      source: 'openligadb',
      league: s.league,
      leagueName: src.leagueName,
      cup: src.cup,
      teamId: view.teamId || null,
      lang,
      fetchedAt: view.fetchedAt,
      stale: errors > 0,
      error: lastError || null,
      matchday: { number: view.matchday?.number ?? null, name: view.matchday?.name ?? '', matches: matches.map(matchOut) },
      table: view.table ? view.table.map((r) => ({ ...r, team: withCrests(r.team) })) : null,
      club: club ? { ...club, team: withCrests(club.team), live: matchOut(club.live), last: matchOut(club.last), next: matchOut(club.next) } : null,
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

  // The app's search of the club: the teams of the league chosen (for the user chosen in the app - ?user=)
  host.route(
    'get',
    '/teams',
    async (req, res) => {
      const s = await host.settings(typeof req.query.user === 'string' ? req.query.user : undefined)
      const q = String(req.query.q ?? '').trim().toLocaleLowerCase('de').slice(0, 60)
      if (!configured(s)) {
        res.json([])
        return
      }
      try {
        const season = view?.league === s.league && view.season ? view.season : seasonOf()
        const teams = await sourceOf(s).teams(season)
        res.json(
          teams
            .filter((t) => !q || t.name.toLocaleLowerCase('de').includes(q) || t.short.toLocaleLowerCase('de').includes(q))
            .slice(0, 9)
            .map((t) => ({ label: t.name, values: { team: t.name, teamId: t.id } }))
            // (and one to choose none again - the app lists ten)
            .concat([{ label: 'Keinen Verein', values: { team: '', teamId: 0 } }]),
        )
      } catch (error) {
        host.log.warn(`[Extension football] teams: ${error.message}`)
        res.status(502).json({ error: 'search failed' })
      }
    },
    { session: true },
  )

  // The status block of the app: fixed sentences (the app translates those it knows)
  host.route(
    'get',
    '/state',
    async (_req, res) => {
      const s = await host.settings()
      const rows = []
      if (!configured(s)) rows.push({ label: 'Zustand', value: 'Keine Liga gewählt', tone: 'warn' })
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
