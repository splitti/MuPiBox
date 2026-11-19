// Football, display part: a "Fußball" tab after the categories that opens a full-screen page with three views - my club (the
// last match, the next one, one that runs now, the place), the matchday (swipe or the arrows for the one before and after) and
// the table. Everything comes from the API part (/api/ext/football/data), the crests too: the display asks no server outside.

const REFRESH_MS = 30 * 1000
// (the header asks what runs as often as the box asks the source while the club plays)
const LIVE_MS = 60 * 1000
// (a page not touched this long counts as closed for the box: it asks only for the club then)
const IDLE_MS = 10 * 60 * 1000

const TEXTS = {
  de: {
    title: 'Fußball',
    club: 'Mein Verein',
    clubs: 'Meine Vereine',
    matchday: 'Spieltag',
    table: 'Tabelle',
    live: 'läuft',
    last: 'Letztes Spiel',
    next: 'Nächstes Spiel',
    none: 'Kein Spiel geplant',
    place: (n) => `Platz ${n}`,
    today: 'heute',
    tomorrow: 'morgen',
    loading: 'Lade …',
    noClub: 'Noch kein Verein. In der App unter Einstellungen › System › Erweiterungen › Fußball bei „Meine Vereine“ suchen.',
    matchdayNo: (n) => `${n}. Spieltag`,
    noClubMatches: 'Für deinen Verein sind gerade keine Spiele eingetragen.',
    penalties: (a, b) => `i.E. ${a}:${b}`,
    offline: 'Keine Verbindung zur Quelle.',
    offlineOld: 'Keine Verbindung zur Quelle – letzter Stand',
    noMatches: 'Für diesen Spieltag sind keine Spiele eingetragen.',
    noTable: 'Für diese Liga gibt es gerade keine Tabelle.',
    stand: (t) => `Stand ${t}`,
    delayed: 'mit Verzögerung',
    // (what the sources ask for: OpenLigaDB's data are under the ODbL, football-data.org wants its sentence)
    credit: { openligadb: 'Daten: OpenLigaDB (ODbL)', footballdata: 'Football data provided by the Football-Data.org API' },
    head: { played: 'Sp', diff: 'TD', points: 'Pkt' },
    postponed: 'abgesagt',
    halftime: (a, b) => `Halbzeit ${a}:${b}`,
    days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  },
  en: {
    title: 'Football',
    club: 'My club',
    clubs: 'My clubs',
    matchday: 'Matchday',
    table: 'Table',
    live: 'live',
    last: 'Last match',
    next: 'Next match',
    none: 'No match planned',
    place: (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'} place`,
    today: 'today',
    tomorrow: 'tomorrow',
    loading: 'Loading …',
    noClub: 'No club yet. Search under “My clubs” in the app: Settings › System › Extensions › Football.',
    matchdayNo: (n) => `Matchday ${n}`,
    // (the rounds of a cup, as OpenLigaDB names them)
    rounds: { '1. Runde': 'Round 1', '2. Runde': 'Round 2', '3. Runde': 'Round 3', Achtelfinale: 'Round of 16', Viertelfinale: 'Quarter-finals', Halbfinale: 'Semi-finals', Finale: 'Final' },
    noClubMatches: 'There are no matches of your club right now.',
    penalties: (a, b) => `pens ${a}:${b}`,
    offline: 'No connection to the source.',
    offlineOld: 'No connection to the source – last values',
    noMatches: 'No matches for this matchday.',
    noTable: 'There is no table for this league right now.',
    stand: (t) => `As of ${t}`,
    delayed: 'delayed',
    credit: { openligadb: 'Data: OpenLigaDB (ODbL)', footballdata: 'Football data provided by the Football-Data.org API' },
    // (the names of the API part are German: those that are not names of their own)
    leagues: { 'DFB-Pokal': 'DFB Cup', 'Frauen-Bundesliga': "Women's Bundesliga", Weltmeisterschaft: 'World Cup', Europameisterschaft: 'European Championship' },
    head: { played: 'P', diff: 'GD', points: 'Pts' },
    postponed: 'postponed',
    halftime: (a, b) => `Half time ${a}:${b}`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
}
export const textsFor = (lang) => TEXTS[String(lang ?? '').slice(0, 2)] ?? TEXTS.en

/** The name of a matchday: the source's in German, else its number (a round of a cup in English) */
export function matchdayLabel(day, lang = 'de') {
  const t = textsFor(lang)
  if (String(lang).startsWith('de') && day?.name) return day.name
  if (day?.name && t.rounds?.[day.name]) return t.rounds[day.name]
  if (Number.isInteger(day?.number)) return t.matchdayNo(day.number)
  return day?.name || t.matchday
}

const pad = (n) => String(n).padStart(2, '0')
/** When a match starts, as a child reads it: "heute 15:30", "morgen 18:30", "Sa 22.11. 15:30". */
export function kickoffText(iso, now = Date.now(), lang = 'de') {
  const t = textsFor(lang)
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - day.getTime()) / 86400000)
  if (diff === 0) return `${t.today} ${time}`
  if (diff === 1) return `${t.tomorrow} ${time}`
  return `${t.days[at.getDay()]} ${pad(at.getDate())}.${pad(at.getMonth() + 1)}. ${time}`
}

/** The colour of a place in the table: up (Champions League, promotion), a play-off, down. */
const ZONES = {
  bl1: { up: [1, 4], playoff: [16, 16], down: [17, 18] },
  bl2: { up: [1, 2], playoff: [3, 3, 16, 16], down: [17, 18] },
  bl3: { up: [1, 2], playoff: [3, 3], down: [17, 20] },
  ffb1: { up: [1, 3], down: [13, 14] },
  // (football-data.org: the competitions of its free tier)
  BL1: { up: [1, 4], playoff: [16, 16], down: [17, 18] },
  PL: { up: [1, 4], down: [18, 20] },
  PD: { up: [1, 4], down: [18, 20] },
  SA: { up: [1, 4], down: [18, 20] },
  FL1: { up: [1, 3], playoff: [16, 16], down: [17, 18] },
  ELC: { up: [1, 2], playoff: [3, 6], down: [22, 24] },
  DED: { up: [1, 2], playoff: [16, 17], down: [18, 18] },
  PPL: { up: [1, 2], playoff: [16, 16], down: [17, 18] },
  CL: { up: [1, 8], playoff: [9, 24], down: [25, 36] },
}
export function zoneOf(league, rank) {
  const z = ZONES[league]
  if (!z || !Number.isInteger(rank)) return ''
  const within = (pairs) => {
    for (let i = 0; i + 1 < (pairs?.length ?? 0); i += 2) if (rank >= pairs[i] && rank <= pairs[i + 1]) return true
    return false
  }
  return within(z.up) ? 'up' : within(z.playoff) ? 'playoff' : within(z.down) ? 'down' : ''
}
const ZONE_COLOR = { up: '#3DDC84', playoff: '#FFB23D', down: '#FF5A4F' }

/** The score of a match as text ("2:1"); before it, the kick-off; running without a goal yet 0:0; over without a known result –:– */
export function scoreText(m, now = Date.now(), lang = 'de') {
  if (m?.state === 'postponed') return textsFor(lang).postponed
  if (m?.score) return `${m.score.home}:${m.score.away}`
  if (m?.state === 'live') return '0:0'
  if (m?.state === 'finished') return '–:–'
  return m?.kickoff ? kickoffText(m.kickoff, now, lang) : ''
}

// The look: a floodlit evening in a stadium - the pitch as the background (pitch.svg, drawn for this extension), everything on
// dark green panels that keep it readable, and the scores as on a scoreboard: amber figures on black. No blur, no motion that
// runs by itself - the Pi draws it at once.
const STYLE = `
.fb{--fb-night:#0B1F33;--fb-panel:rgba(4,20,13,.8);--fb-panel-hi:rgba(10,40,26,.9);--fb-board:#04100A;--fb-line:rgba(234,244,255,.14);--fb-amber:#FFC23D;--fb-live:#FF5A4F;--fb-text:#F2F7F4;--fb-muted:rgba(242,247,244,.7);position:absolute;inset:0;display:flex;flex-direction:column;color:var(--fb-text);background-color:var(--fb-night);background-repeat:no-repeat;background-position:center bottom;background-size:cover;font-family:var(--ion-font-family,inherit)}
.fb button{font-family:inherit;-webkit-tap-highlight-color:transparent}
.fb-tabs{flex:none;align-self:center;display:flex;gap:4px;margin:10px 72px 8px;padding:4px;border-radius:30px;background:var(--fb-panel)}
.fb-tab{min-height:46px;padding:0 22px;border:0;border-radius:24px;background:transparent;color:var(--fb-muted);font-weight:700;font-size:18px;line-height:1;transition:background-color .15s,color .15s}
.fb-tab[aria-pressed="true"]{background:var(--fb-amber);color:var(--fb-night)}
.fb-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px 16px 10px;touch-action:pan-y;scrollbar-width:thin;scrollbar-color:rgba(242,247,244,.35) transparent}
.fb-body>*{max-width:980px;margin-left:auto;margin-right:auto}
.fb-foot{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:26px;padding:3px 12px;background:rgba(3,12,8,.72);color:var(--fb-muted);font-size:13px;line-height:1.3;text-align:center}
.fb-foot small{font-size:11px;opacity:.85}
.fb-crest{width:var(--s,32px);height:var(--s,32px);object-fit:contain;flex:none}
.fb-tla{width:var(--s,32px);height:var(--s,32px);border-radius:50%;border:2px solid var(--fb-muted);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(var(--s,32px)*.32);flex:none;color:var(--fb-muted)}
.fb-row{display:flex;align-items:center;gap:10px;min-height:58px;padding:6px 12px;margin-bottom:8px;border-radius:14px;background:var(--fb-panel)}
.fb-row.mine{background:var(--fb-panel-hi);box-shadow:inset 5px 0 0 var(--fb-amber)}
.fb-row .name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:19px;font-weight:600}
.fb-row .name.away{text-align:right}
.fb-score{flex:none;min-width:104px;padding:6px 10px;border-radius:10px;background:var(--fb-board);border:1px solid rgba(255,194,61,.28);color:var(--fb-amber);text-align:center;font-weight:800;font-size:24px;line-height:1.05;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.fb-score.kick{background:transparent;border-color:transparent;color:var(--fb-text);font-size:16px;font-weight:700;letter-spacing:0}
.fb-score small{display:block;margin-top:2px;color:var(--fb-muted);font-size:12px;font-weight:600;letter-spacing:0}
.fb-score.live{border-color:var(--fb-live)}
.fb-score.live small,.fb-live{color:var(--fb-live)}
.fb-score.live small::before,.fb-live-word::before{content:"";display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:var(--fb-live);vertical-align:1px}
.fb-day{display:flex;align-items:center;justify-content:center;gap:12px;margin:2px auto 10px}
.fb-day span{min-width:180px;padding:9px 18px;border-radius:22px;background:var(--fb-panel);text-align:center;font-weight:700;font-size:18px}
.fb-arrow{width:48px;height:48px;border-radius:50%;border:0;background:var(--fb-panel);color:var(--fb-text);font-size:26px;line-height:1}
.fb-arrow:disabled{opacity:.3}
.fb-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;width:max-content;max-width:100%;margin:0 auto 10px;padding:4px;border-radius:26px;background:var(--fb-panel)}
.fb-chip{min-height:40px;padding:0 16px;border:0;border-radius:20px;background:transparent;color:var(--fb-muted);font-weight:700;font-size:16px;transition:background-color .15s,color .15s}
.fb-chip[aria-pressed="true"]{background:var(--fb-text);color:var(--fb-night)}
.fb-table{width:100%;border-collapse:separate;border-spacing:0;font-size:18px;border-radius:16px;overflow:hidden;background:var(--fb-panel)}
.fb-table th{position:sticky;top:-2px;z-index:1;padding:8px 8px 6px;background:#06170F;color:var(--fb-muted);font-size:13px;font-weight:700;text-align:right}
.fb-table td{padding:6px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--fb-line);font-variant-numeric:tabular-nums}
.fb-table tr:last-child td{border-bottom:0}
.fb-table td.team{text-align:left;width:100%;max-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.fb-table td.team span{display:inline-flex;align-items:center;gap:10px;vertical-align:middle}
.fb-table td.rank{border-left:5px solid transparent;font-weight:800;color:var(--fb-muted)}
.fb-table td.points{color:var(--fb-amber);font-weight:800}
.fb-table tr.mine td{background:rgba(255,194,61,.14)}
.fb-table tr.mine td.rank{color:var(--fb-text)}
.fb-club{display:flex;flex-direction:column;align-items:center;gap:10px;padding:4px 0 6px;text-align:center}
.fb-halo{display:inline-flex;padding:16px;border-radius:50%;background:radial-gradient(circle,rgba(234,244,255,.3) 0,rgba(234,244,255,.08) 55%,transparent 72%)}
.fb-club h2{margin:0;font-size:28px;font-weight:800;letter-spacing:.01em}
.fb-place{display:inline-block;padding:3px 12px;border-radius:999px;background:var(--fb-amber);color:var(--fb-night);font-weight:800;font-size:15px}
.fb-club-small{gap:8px;margin-bottom:14px;padding:10px 12px 12px;border-radius:18px;background:rgba(3,14,9,.55)}
.fb-club-head{display:flex;align-items:center;gap:12px;width:100%}
.fb-club-head h3{flex:1;margin:0;font-size:21px;font-weight:800;text-align:left}
.fb-big{display:flex;align-items:center;justify-content:center;gap:18px}
.fb-big .fb-score{min-width:150px;padding:8px 16px;font-size:52px;border-radius:14px}
.fb-club-small .fb-big .fb-score{min-width:116px;font-size:34px}
.fb-card{width:100%;max-width:620px;padding:8px 10px 2px;border-radius:16px;background:rgba(3,14,9,.5)}
.fb-card h3{margin:0 0 6px 4px;color:var(--fb-muted);font-size:14px;font-weight:700;text-align:left}
.fb-card .fb-row{background:var(--fb-panel)}
.fb-card .fb-row.mine{box-shadow:none;background:var(--fb-panel)}
.fb-msg{margin:24px auto;padding:18px 20px;max-width:560px;border-radius:16px;background:var(--fb-panel);text-align:center;font-size:18px;line-height:1.4}
.fb-head-item{display:none;align-items:center;gap:5px;min-height:36px;padding:0 10px;border:0;border-radius:18px;background:rgba(0,0,0,.32);color:inherit;font:inherit;font-weight:800;font-size:16px}
.fb-head-item b{color:#FFC23D;font-variant-numeric:tabular-nums}
.fb-head-item i{width:8px}
`

/** The style of the page and of the header item, once in the page of the display */
function ensureStyle() {
  if (document.getElementById('fb-style')) return
  const style = document.createElement('style')
  style.id = 'fb-style'
  style.textContent = STYLE
  document.head.append(style)
}

export function activate(api) {
  const settings = api.settings() ?? {}
  // (the API part says whether there is anything: a league of OpenLigaDB, or one of football-data.org with a key - the key
  // itself the display never sees, only that one is set)
  const configured = settings.source === 'footballdata' ? !!settings.apiKeySet && !!settings.fdLeague : ['bl1', 'bl2', 'bl3', 'dfb', 'ffb1'].includes(settings.league)
  // (the club of the source chosen now - each source has its own, as the API part counts it)
  // (the clubs the user follows - "o:40:FC Bayern München|f:81:FC Barcelona", see logic.clubsOf)
  const clubCount = String(settings.clubs ?? '').split('|').filter((p) => /^[of]:\d{1,8}:/.test(p)).length
  const crestUrl = (team) => (team?.crest ? `${api.apiUrl}${team.crest}` : '')

  /** A crest, or a circle with the short name when there is none (or it does not load). */
  function crest(team, size = 32) {
    const box = document.createElement('span')
    box.style.display = 'inline-flex'
    box.style.setProperty('--s', `${size}px`)
    const circle = () => {
      const c = document.createElement('span')
      c.className = 'fb-tla'
      c.textContent = team?.tla || '?'
      box.replaceChildren(c)
    }
    const url = crestUrl(team)
    if (!url) {
      circle()
      return box
    }
    const img = document.createElement('img')
    img.className = 'fb-crest'
    img.alt = ''
    img.decoding = 'async'
    let tried = false
    img.onerror = () => {
      circle()
      // (once more a little later: the box may have been fetching it - the circle stays when it still has none)
      if (tried) return
      tried = true
      setTimeout(() => {
        if (!box.isConnected) return
        const again = document.createElement('img')
        again.className = 'fb-crest'
        again.alt = ''
        again.onload = () => {
          if (box.isConnected) box.replaceChildren(again)
        }
        again.src = `${url}?r=1`
      }, 20000)
    }
    img.src = url
    box.append(img)
    return box
  }

  function open() {
    api.overlay.open({
      title: textsFor('de').title,
      flush: true,
      mount(content) {
        ensureStyle()
        const root = document.createElement('div')
        root.className = 'fb'
        root.style.backgroundImage = `url("${api.url('pitch.svg')}")`
        const tabs = document.createElement('div')
        tabs.className = 'fb-tabs'
        const body = document.createElement('div')
        body.className = 'fb-body'
        const foot = document.createElement('div')
        foot.className = 'fb-foot'
        root.append(tabs, body, foot)
        content.append(root)

        let data = null
        let closed = false
        // (what opens first: as set in the app; the club's view only with a club)
        let view = ['club', 'matchday', 'table'].includes(settings.startView) ? settings.startView : 'club'
        if (view === 'club' && clubCount === 0) view = 'matchday'
        // (another matchday the user went to: its number and its matches; null = the current one)
        let other = null
        // (the matchday asked for last - the arrows count from it while it comes; answers of older ones are dropped)
        let wanted = null
        // (the last answer as text: the same again draws nothing - no jump, no crests loaded anew)
        let lastAnswer = ''
        let refreshing = false
        // (the last touch: a page left open is no longer "open" for the box after a while, see refresh)
        let touchedAt = Date.now()
        root.addEventListener('pointerdown', () => {
          touchedAt = Date.now()
        })
        let t = textsFor(document.documentElement.lang || 'de')
        let centred = false

        const drawTabs = () => {
          // (a table when the source has one: the league phase of the Champions League too, never the DFB-Pokal)
          const views = [...(data?.clubs?.length ? ['club'] : []), 'matchday', ...(data?.table?.length || data?.tables?.length ? ['table'] : [])]
          // (before the first answer the view chosen stays: the club's tab comes with the answer)
          if (data && !views.includes(view)) view = views[0]
          tabs.replaceChildren(
            ...views.map((v) => {
              const b = document.createElement('button')
              b.type = 'button'
              b.className = 'fb-tab'
              b.textContent = v === 'club' && data?.clubs?.length > 1 ? t.clubs : t[v]
              b.setAttribute('aria-pressed', String(v === view))
              b.onclick = () => {
                view = v
                centred = false
                draw(false)
              }
              return b
            }),
          )
        }

        const message = (text) => {
          const p = document.createElement('p')
          p.className = 'fb-msg'
          p.textContent = text
          return p
        }

        // (a team the user follows - of the source shown: its numbers are those of this source)
        const mine = (team) => !!team?.id && (data?.teamIds ?? []).includes(team.id)
        // One match as a row: home crest and name, the score (or the time), away name and crest
        const matchRow = (m) => {
          const row = document.createElement('div')
          row.className = 'fb-row'
          if (mine(m.home) || mine(m.away)) row.classList.add('mine')
          const name = (team, away) => {
            const n = document.createElement('span')
            n.className = away ? 'name away' : 'name'
            n.textContent = team.short || team.name
            return n
          }
          const mid = document.createElement('span')
          // (a score on the board; before the kick-off its day and time, plain)
          mid.className = m.score || m.state === 'live' || m.state === 'finished' ? 'fb-score' : 'fb-score kick'
          mid.textContent = scoreText(m, Date.now(), data?.lang)
          if (m.state === 'live') {
            mid.classList.add('live')
            const s = document.createElement('small')
            s.textContent = t.live
            mid.append(s)
          } else if (m.state === 'finished' && (m.penalties || m.halftime)) {
            // (a shoot-out says who won; else the half time)
            const s = document.createElement('small')
            s.textContent = m.penalties ? t.penalties(m.penalties.home, m.penalties.away) : `(${m.halftime.home}:${m.halftime.away})`
            mid.append(s)
          }
          row.append(crest(m.home), name(m.home, false), mid, name(m.away, true), crest(m.away))
          return row
        }

        const drawMatchday = () => {
          const day = other ?? data.matchday
          const head = document.createElement('div')
          head.className = 'fb-day'
          const arrow = (dir) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'fb-arrow'
            b.textContent = dir < 0 ? '‹' : '›'
            b.setAttribute('aria-label', dir < 0 ? '<' : '>')
            // (a league has twice as many matchdays as other teams: no arrow beyond the last)
            const last = data.league === 'CL' ? 8 : data.table?.length > 1 ? 2 * (data.table.length - 1) : 60
            const base = wanted ?? day.number
            b.disabled = !Number.isInteger(base) || base + dir < 1 || base + dir > last
            b.onclick = () => void go((wanted ?? day.number) + dir)
            return b
          }
          const label = document.createElement('span')
          label.textContent = matchdayLabel(day, data.lang)
          head.append(arrow(-1), label, arrow(1))
          body.append(head)
          if (!day.matches?.length) body.append(message(t.noMatches))
          for (const m of day.matches ?? []) body.append(matchRow(m))
        }

        // (the table shown: the league chosen - null - or that of a club, its key and what came for it)
        let tableKey = null
        let otherTable = null
        let tableWanted = null
        async function showTable(key) {
          const main = data?.tables?.[0]?.key
          if (!key || (key === main && data?.table?.length)) {
            tableWanted = null
            tableKey = null
            otherTable = null
            centred = false
            draw(false)
            return
          }
          tableWanted = key
          // (the chip shows the choice at once - the table may take a moment)
          for (const b of body.querySelectorAll('.fb-chip')) b.setAttribute('aria-pressed', String(b.dataset.key === key))
          const answer = await api.fetchApi(`/table?l=${encodeURIComponent(key)}`)
          if (closed || tableWanted !== key) return
          tableWanted = null
          tableKey = key
          otherTable = answer?.table?.length ? answer : { table: null }
          centred = false
          draw(false)
        }
        const drawTableChoice = () => {
          const list = data?.tables ?? []
          if (list.length < 2) return
          const row = document.createElement('div')
          row.className = 'fb-chips'
          const shown = tableKey ?? (data.table?.length ? list[0].key : null)
          for (const l of list) {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'fb-chip'
            b.dataset.key = l.key
            b.textContent = t.leagues?.[l.name] ?? l.name
            b.setAttribute('aria-pressed', String(l.key === shown))
            b.onclick = () => void showTable(l.key)
            row.append(b)
          }
          body.append(row)
        }

        const drawTable = () => {
          // (the league chosen has no table - a cup: the first of the clubs' leagues)
          if (!tableKey && !data.table?.length && data.tables?.length) {
            if (!tableWanted) void showTable(data.tables[0].key)
            body.append(message(t.loading))
            return
          }
          drawTableChoice()
          // (a league of a club, or the one chosen)
          const rows = tableKey ? otherTable?.table : data.table
          const league = tableKey ? otherTable?.league : data.league
          const ids = tableKey ? (otherTable?.teamIds ?? []) : (data.teamIds ?? [])
          if (!rows?.length) {
            body.append(message(t.noTable))
            return
          }
          const table = document.createElement('table')
          table.className = 'fb-table'
          const head = document.createElement('tr')
          for (const [text, cls] of [['', 'rank'], ['', 'team'], [t.head.played, ''], [t.head.diff, ''], [t.head.points, '']]) {
            const th = document.createElement('th')
            th.textContent = text
            if (cls) th.className = cls
            head.append(th)
          }
          table.append(head)
          let mineRow = null
          for (const r of rows) {
            const tr = document.createElement('tr')
            if (r.team?.id && ids.includes(r.team.id)) {
              tr.className = 'mine'
              mineRow = tr
            }
            const rank = document.createElement('td')
            rank.className = 'rank'
            rank.textContent = String(r.rank)
            const zone = zoneOf(league, r.rank)
            if (zone) rank.style.borderLeftColor = ZONE_COLOR[zone]
            const team = document.createElement('td')
            team.className = 'team'
            const wrap = document.createElement('span')
            const name = document.createElement('span')
            name.textContent = r.team.short || r.team.name
            wrap.append(crest(r.team, 28), name)
            team.append(wrap)
            const cell = (v) => {
              const td = document.createElement('td')
              td.textContent = String(v)
              return td
            }
            const points = cell(r.points)
            points.className = 'points'
            tr.append(rank, team, cell(r.played), cell(r.diff > 0 ? `+${r.diff}` : r.diff), points)
            table.append(tr)
          }
          body.append(table)
          // (the club in the middle when the table opens; afterwards the user scrolls)
          if (mineRow && !centred) {
            centred = true
            requestAnimationFrame(() => {
              body.scrollTop = Math.max(0, mineRow.offsetTop - body.clientHeight / 2 + mineRow.offsetHeight / 2)
            })
          }
        }

        // One club: its crest large, its place, a match that runs large, the last and the next match. Several: each smaller, one
        // under the other (the page scrolls).
        const drawClub = () => {
          const list = data.clubs ?? []
          if (list.length === 0) {
            body.append(message(t.noClub))
            return
          }
          const one = list.length === 1
          for (const c of list) {
            const box = document.createElement('div')
            box.className = one ? 'fb-club' : 'fb-club fb-club-small'
            const name = document.createElement(one ? 'h2' : 'h3')
            name.textContent = c.team.name
            const head = document.createElement('div')
            head.className = 'fb-club-head'
            head.append(crest(c.team, one ? 88 : 44), name)
            if (one) {
              const halo = document.createElement('span')
              halo.className = 'fb-halo'
              halo.append(crest(c.team, 92))
              box.append(halo, name)
            } else box.append(head)
            if (c.rank) {
              const place = document.createElement('span')
              place.className = 'fb-place'
              place.textContent = t.place(c.rank)
              ;(one ? box : head).append(place)
            }
            const card = (title, m) => {
              const el = document.createElement('div')
              el.className = 'fb-card'
              const h = document.createElement('h3')
              // (the last match with its day; the next one has its day in the row already)
              h.textContent = m && m.state === 'finished' && m.kickoff ? `${title} · ${kickoffText(m.kickoff, Date.now(), data.lang)}` : title
              el.append(h)
              el.append(m ? matchRow(m) : message(t.none))
              return el
            }
            if (c.live) {
              // (a match that runs: the score large in the middle)
              const big = document.createElement('div')
              big.className = 'fb-big'
              const score = document.createElement('span')
              score.className = 'fb-score live'
              score.textContent = scoreText(c.live, Date.now(), data.lang)
              big.append(crest(c.live.home, one ? 64 : 44), score, crest(c.live.away, one ? 64 : 44))
              const when = document.createElement('div')
              when.className = 'fb-live fb-live-word'
              when.textContent = t.live
              box.append(big, when)
            }
            if (!c.last && !c.next && !c.live) box.append(message(c.known === false ? t.offline : t.noClubMatches))
            else box.append(card(t.last, c.last), card(t.next, c.next))
            body.append(box)
          }
        }

        /** Draws the page; `keep`: where the list was scrolled stays (a new answer), else it starts at the top (another view or matchday) */
        function draw(keep = true) {
          if (closed) return
          const top = keep ? body.scrollTop : 0
          body.replaceChildren()
          drawTabs()
          if (!data) {
            body.append(message(t.loading))
            return
          }
          if (view === 'club') drawClub()
          else if (view === 'table') drawTable()
          else drawMatchday()
          body.scrollTop = top
          const time = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString(data.lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
          // (the sources of what is shown: the league's, and football-data.org when a club comes from there)
          const credits = [...new Set([data.source, ...(data.clubs ?? []).map((c) => (c.src === 'f' ? 'footballdata' : 'openligadb'))].filter(Boolean))].map((s) => t.credit[s])
          // (the league of the table shown - another one than chosen when a club's is shown)
          const shownLeague = view === 'table' && tableKey && otherTable?.name ? otherTable.name : data.leagueName
          // (scores of football-data.org - the league's or a club's - come with a delay)
          const delayed = data.delayed || (data.clubs ?? []).some((c) => c.src === 'f')
          const info = document.createElement('span')
          info.textContent = [t.leagues?.[shownLeague] ?? shownLeague, data.stale ? t.offlineOld : time ? t.stand(time) : '', delayed ? t.delayed : ''].filter(Boolean).join('  ·  ')
          const credit = document.createElement('small')
          credit.textContent = credits.join('  ·  ')
          foot.replaceChildren(info, credit)
        }

        async function go(n) {
          if (!Number.isInteger(n) || n < 1) return
          if (n === data?.matchday?.number) {
            other = null
            wanted = null
            draw(false)
            return
          }
          wanted = n
          const answer = await api.fetchApi(`/matchday?n=${n}`)
          // (another matchday asked for meanwhile: this answer is old)
          if (closed || wanted !== n) return
          wanted = null
          if (!answer?.matches) {
            draw()
            return
          }
          other = answer
          draw(false)
        }

        // (the swipe: left for the next matchday, right for the one before)
        let swipe = null
        body.addEventListener('pointerdown', (e) => {
          swipe = view === 'matchday' || (view === 'table' && (data?.tables?.length ?? 0) > 1) ? { x: e.clientX, y: e.clientY } : null
        })
        body.addEventListener('pointerup', (e) => {
          if (!swipe) return
          const dx = e.clientX - swipe.x
          const dy = e.clientY - swipe.y
          swipe = null
          if (Math.abs(dx) <= 70 || Math.abs(dx) <= 2 * Math.abs(dy)) return
          // (the table: the league beside it - the leagues of the clubs)
          if (view === 'table') {
            const list = data.tables
            const now = tableWanted ?? tableKey ?? (data.table?.length ? list[0].key : null)
            const at = Math.max(0, list.findIndex((l) => l.key === now))
            const next = list[at + (dx < 0 ? 1 : -1)]
            if (next) void showTable(next.key)
            return
          }
          const day = other ?? data?.matchday
          const base = wanted ?? day?.number
          if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy) && Number.isInteger(base)) void go(base + (dx < 0 ? 1 : -1))
        })

        const refresh = async () => {
          // (one at a time: an answer that takes long must not come after a newer one)
          if (refreshing) return
          refreshing = true
          // (left open and not touched for ten minutes - the display went dark, say: the box asks only as for a closed page)
          const open = Date.now() - touchedAt < IDLE_MS
          const answer = await api.fetchApi(open ? '/data?open=1' : '/data').finally(() => {
            refreshing = false
          })
          if (closed) return
          if (!answer || answer.configured === false || (answer.error && !answer.matchday)) {
            if (answer?.lang) t = textsFor(answer.lang)
            if (!data) {
              body.replaceChildren(message(t.offline))
              tabs.replaceChildren()
            }
            return
          }
          // (a table of a club's league shown: anew too)
          if (view === 'table' && tableKey && !tableWanted) {
            const other = await api.fetchApi(`/table?l=${encodeURIComponent(tableKey)}`)
            if (!closed && other?.table?.length && JSON.stringify(other) !== JSON.stringify(otherTable)) {
              otherTable = other
              draw()
            }
          }
          const text = JSON.stringify(answer)
          if (text === lastAnswer) return
          lastAnswer = text
          data = answer
          t = textsFor(data.lang)
          draw()
        }

        draw()
        void refresh()
        const timer = setInterval(() => void refresh(), REFRESH_MS)
        return () => {
          closed = true
          clearInterval(timer)
          root.remove()
        }
      },
    })
  }

  api.tabs.set({ id: 'football', src: api.url('icon.svg'), visible: configured, onSelect: open })

  // The header: while a match of the club runs, its two crests and the score, small, right of the battery. The API part answers
  // from what it loaded last (it asks every minute while the club plays) and says nothing in the quiet hours or while the box
  // is blocked. A tap opens the page.
  if (configured && clubCount > 0 && settings.header !== false) {
    // (the header is on several pages at once - one look a minute for all of its places)
    const places = new Set()
    let shared = []
    let looking = null
    const lookAll = async () => {
      const answer = await api.fetchApi('/live')
      shared = Array.isArray(answer?.live) ? answer.live : []
      for (const draw of places) draw(shared)
    }
    api.header.add({
      mount(place) {
        ensureStyle()
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'fb-head-item'
        item.onclick = open
        place.append(item)
        let last = ''
        const draw = (lives) => {
          const text = lives.map((m) => `${m.id}:${scoreText(m)}`).join(',')
          if (text === last) return
          last = text
          if (lives.length === 0) {
            item.style.display = 'none'
            item.replaceChildren()
            return
          }
          const parts = []
          // (a small display has room for two beside the battery, the clock and the network)
          for (const m of lives.slice(0, window.innerWidth < 1000 ? 2 : 3)) {
            const score = document.createElement('b')
            score.textContent = scoreText(m)
            if (parts.length) parts.push(document.createElement('i'))
            parts.push(crest(m.home, 24), score, crest(m.away, 24))
          }
          item.replaceChildren(...parts)
          item.setAttribute('aria-label', lives.map((m) => `${m.home.short} ${scoreText(m)} ${m.away.short}`).join(', '))
          item.style.display = 'inline-flex'
        }
        places.add(draw)
        if (looking) draw(shared)
        else {
          void lookAll()
          looking = setInterval(() => void lookAll(), LIVE_MS)
        }
        return () => {
          places.delete(draw)
          if (places.size === 0) {
            clearInterval(looking)
            looking = null
          }
          item.remove()
        }
      },
    })
  }
}
