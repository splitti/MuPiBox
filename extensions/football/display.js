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
    noClub: 'Kein Lieblingsverein gewählt. In der Webapp unter Erweiterungen › Fußball einen Verein suchen.',
    noClubMatches: 'Für deinen Verein sind gerade keine Spiele eingetragen.',
    penalties: (a, b) => `i.E. ${a}:${b}`,
    offline: 'Keine Verbindung zur Quelle.',
    offlineOld: 'Keine Verbindung zur Quelle – letzter Stand',
    noMatches: 'Für diesen Spieltag sind keine Spiele eingetragen.',
    stand: (t) => `Stand ${t}`,
    delayed: 'mit Verzögerung',
    head: { played: 'Sp', diff: 'TD', points: 'Pkt' },
    postponed: 'abgesagt',
    halftime: (a, b) => `Halbzeit ${a}:${b}`,
    days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  },
  en: {
    title: 'Football',
    club: 'My club',
    matchday: 'Matchday',
    table: 'Table',
    live: 'live',
    last: 'Last match',
    next: 'Next match',
    none: 'No match planned',
    place: (n) => `Place ${n}`,
    today: 'today',
    tomorrow: 'tomorrow',
    loading: 'Loading …',
    noClub: 'No favourite club chosen. Search for one in the web app under Extensions › Football.',
    noClubMatches: 'There are no matches of your club right now.',
    penalties: (a, b) => `pens ${a}:${b}`,
    offline: 'No connection to the source.',
    offlineOld: 'No connection to the source – last values',
    noMatches: 'No matches for this matchday.',
    stand: (t) => `As of ${t}`,
    delayed: 'delayed',
    // (the names of the API part are German: those that are not names of their own)
    leagues: { 'DFB-Pokal': 'DFB Cup', 'Frauen-Bundesliga': "Women's Bundesliga", Weltmeisterschaft: 'World Cup', Europameisterschaft: 'European Championship' },
    head: { played: 'P', diff: 'GD', points: 'Pts' },
    postponed: 'postponed',
    halftime: (a, b) => `Half time ${a}:${b}`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
}
export const textsFor = (lang) => TEXTS[String(lang ?? '').slice(0, 2)] ?? TEXTS.en

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
const ZONE_COLOR = { up: '#2e9d57', playoff: '#d68a1c', down: '#c8423b' }

/** The score of a match as text ("2:1"); before it, the kick-off; running without a goal yet 0:0; over without a known result –:– */
export function scoreText(m, now = Date.now(), lang = 'de') {
  if (m?.state === 'postponed') return textsFor(lang).postponed
  if (m?.score) return `${m.score.home}:${m.score.away}`
  if (m?.state === 'live') return '0:0'
  if (m?.state === 'finished') return '–:–'
  return m?.kickoff ? kickoffText(m.kickoff, now, lang) : ''
}

const STYLE = `
.fb{position:absolute;inset:0;display:flex;flex-direction:column;color:inherit;font-family:var(--ion-font-family,inherit)}
.fb-tabs{flex:none;display:flex;gap:8px;justify-content:center;padding:10px 64px 6px}
.fb-tab{min-height:48px;padding:0 18px;border-radius:24px;border:2px solid rgba(255,255,255,.35);background:transparent;color:inherit;font-weight:600;font-size:18px;line-height:1}
.fb-tab[aria-pressed="true"]{background:rgba(255,255,255,.18);border-color:currentColor}
.fb-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 16px 8px;touch-action:pan-y;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.35) transparent}
.fb-foot{flex:none;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:.7}
.fb-crest{width:var(--s,32px);height:var(--s,32px);object-fit:contain;flex:none}
.fb-tla{width:var(--s,32px);height:var(--s,32px);border-radius:50%;border:2px solid currentColor;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:calc(var(--s,32px)*.32);flex:none;opacity:.8}
.fb-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:4px 10px;border-radius:12px}
.fb-row.mine{background:rgba(255,255,255,.16)}
.fb-row .name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:19px}
.fb-row .name.away{text-align:right}
.fb-row .mid{flex:none;min-width:96px;text-align:center;font-weight:700;font-size:20px;line-height:1.1}
.fb-row .mid small{display:block;font-size:13px;font-weight:500;opacity:.75}
.fb-live{color:#ff5a4f}
.fb-day{display:flex;align-items:center;justify-content:center;gap:12px;margin:2px 0 6px;font-weight:600;font-size:18px;line-height:1}
.fb-arrow{width:48px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,.12);color:inherit;font-size:24px}
.fb-arrow:disabled{opacity:.3}
.fb-table{width:100%;border-collapse:collapse;font-size:18px}
.fb-table th{font-size:14px;font-weight:600;text-align:right;padding:2px 6px;position:sticky;top:-4px;background:var(--fb-bg,#111);color:rgba(255,255,255,.7);z-index:1}
.fb-table td{padding:4px 6px;text-align:right;white-space:nowrap}
.fb-table td.team{text-align:left;width:100%;max-width:0;overflow:hidden;text-overflow:ellipsis}
.fb-table td.team span{display:inline-flex;align-items:center;gap:8px;vertical-align:middle}
.fb-table tr.mine{background:rgba(255,255,255,.16)}
.fb-table td.rank{border-left:5px solid transparent;font-weight:700}
.fb-club{display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:6px;text-align:center}
.fb-club h2{margin:0;font-size:24px}
.fb-club .place{opacity:.8;font-size:17px}
.fb-big{display:flex;align-items:center;justify-content:center;gap:18px;font-weight:800;font-size:54px;line-height:1}
.fb-card{width:min(560px,100%);border-radius:16px;background:rgba(255,255,255,.08);padding:10px 14px}
.fb-card h3{margin:0 0 4px;font-size:15px;font-weight:600;opacity:.75}
.fb-msg{padding:24px 12px;text-align:center;font-size:18px;opacity:.85}
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
  const teamId = settings.source === 'footballdata' ? Number(settings.fdTeamId) || 0 : Number(settings.teamId) || 0
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
        if (view === 'club' && !(teamId > 0)) view = 'matchday'
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
        let t = textsFor('de')
        let centred = false

        const drawTabs = () => {
          // (a table when the source has one: the league phase of the Champions League too, never the DFB-Pokal)
          const views = [...(data?.teamId ? ['club'] : []), 'matchday', ...(data?.table?.length ? ['table'] : [])]
          // (before the first answer the view chosen stays: the club's tab comes with the answer)
          if (data && !views.includes(view)) view = views[0]
          tabs.replaceChildren(
            ...views.map((v) => {
              const b = document.createElement('button')
              b.type = 'button'
              b.className = 'fb-tab'
              b.textContent = t[v]
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

        // One match as a row: home crest and name, the score (or the time), away name and crest
        const matchRow = (m) => {
          const row = document.createElement('div')
          row.className = 'fb-row'
          if (data?.teamId && (m.home.id === data.teamId || m.away.id === data.teamId)) row.classList.add('mine')
          const name = (team, away) => {
            const n = document.createElement('span')
            n.className = away ? 'name away' : 'name'
            n.textContent = team.short || team.name
            return n
          }
          const mid = document.createElement('span')
          mid.className = 'mid'
          mid.textContent = scoreText(m, Date.now(), data?.lang)
          if (m.state === 'live') {
            mid.classList.add('fb-live')
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
            const last = data.table?.length > 1 ? 2 * (data.table.length - 1) : 60
            const base = wanted ?? day.number
            b.disabled = !Number.isInteger(base) || base + dir < 1 || base + dir > last
            b.onclick = () => void go((wanted ?? day.number) + dir)
            return b
          }
          const label = document.createElement('span')
          label.textContent = day.name || (day.number ? `${day.number}. ${t.matchday}` : t.matchday)
          head.append(arrow(-1), label, arrow(1))
          body.append(head)
          if (!day.matches?.length) body.append(message(t.noMatches))
          for (const m of day.matches ?? []) body.append(matchRow(m))
        }

        const drawTable = () => {
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
          let mine = null
          for (const r of data.table) {
            const tr = document.createElement('tr')
            if (data.teamId && r.team.id === data.teamId) {
              tr.className = 'mine'
              mine = tr
            }
            const rank = document.createElement('td')
            rank.className = 'rank'
            rank.textContent = String(r.rank)
            const zone = zoneOf(data.league, r.rank)
            if (zone) rank.style.borderLeftColor = ZONE_COLOR[zone]
            const team = document.createElement('td')
            team.className = 'team'
            const wrap = document.createElement('span')
            const name = document.createElement('span')
            name.textContent = r.team.short || r.team.name
            wrap.append(crest(r.team, 26), name)
            team.append(wrap)
            const cell = (v) => {
              const td = document.createElement('td')
              td.textContent = String(v)
              return td
            }
            tr.append(rank, team, cell(r.played), cell(r.diff > 0 ? `+${r.diff}` : r.diff), cell(r.points))
            table.append(tr)
          }
          body.append(table)
          // (the club in the middle when the table opens; afterwards the user scrolls)
          if (mine && !centred) {
            centred = true
            requestAnimationFrame(() => {
              body.scrollTop = Math.max(0, mine.offsetTop - body.clientHeight / 2 + mine.offsetHeight / 2)
            })
          }
        }

        const drawClub = () => {
          const c = data.club
          const box = document.createElement('div')
          box.className = 'fb-club'
          if (!c?.team) {
            box.append(message(data.teamId ? t.noClubMatches : t.noClub))
            body.append(box)
            return
          }
          const name = document.createElement('h2')
          name.textContent = c.team.name
          box.append(crest(c.team, 88), name)
          if (c.rank) {
            const place = document.createElement('div')
            place.className = 'place'
            place.textContent = t.place(c.rank)
            box.append(place)
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
            big.className = 'fb-big fb-live'
            const score = document.createElement('span')
            score.textContent = scoreText(c.live, Date.now(), data.lang)
            big.append(crest(c.live.home, 64), score, crest(c.live.away, 64))
            const when = document.createElement('div')
            when.className = 'fb-live'
            when.textContent = t.live
            box.append(big, when)
          }
          box.append(card(t.last, c.last), card(t.next, c.next))
          body.append(box)
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
          else if (view === 'table' && data.table) drawTable()
          else drawMatchday()
          if (view !== 'table' || centred) body.scrollTop = top
          const time = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString(data.lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
          foot.textContent = [t.leagues?.[data.leagueName] ?? data.leagueName, data.stale ? t.offlineOld : time ? t.stand(time) : '', data.delayed ? t.delayed : ''].filter(Boolean).join('  ·  ')
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
          swipe = view === 'matchday' ? { x: e.clientX, y: e.clientY } : null
        })
        body.addEventListener('pointerup', (e) => {
          if (!swipe) return
          const dx = e.clientX - swipe.x
          const dy = e.clientY - swipe.y
          swipe = null
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
  if (configured && teamId > 0 && settings.header !== false) {
    // (the header is on several pages at once - one look a minute for all of its places)
    const places = new Set()
    let shared = null
    let looking = null
    const lookAll = async () => {
      const answer = await api.fetchApi('/live')
      shared = answer?.live ?? null
      for (const draw of places) draw(shared)
    }
    api.header.add({
      mount(place) {
        ensureStyle()
        const item = document.createElement('button')
        item.type = 'button'
        item.style.cssText = 'display:none;align-items:center;gap:4px;padding:0 6px;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;font-size:16px'
        item.onclick = open
        place.append(item)
        let last = ''
        const draw = (m) => {
          const text = m ? `${m.id}:${scoreText(m)}` : ''
          if (text === last) return
          last = text
          if (!m) {
            item.style.display = 'none'
            item.replaceChildren()
            return
          }
          const score = document.createElement('span')
          score.textContent = scoreText(m)
          item.replaceChildren(crest(m.home, 22), score, crest(m.away, 22))
          item.setAttribute('aria-label', `${m.home.short} ${scoreText(m)} ${m.away.short}`)
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
