// MuPiBox app – one app for everything (replaces the admin interface and the parents' web app step by step).
//
// The pages come from schema.json (docs/eine-app/app-schema.json): areas, settings groups, pages with sections and
// their building blocks (toggle, slider, select, …). This file draws them and handles navigation, sheets, search,
// the light/dark switch and the login. Pages are connected to the box one by one (see docs/app-mapping.md): until a
// page is in CONNECTED, its controls only change locally and the page says so.

import { icon } from './icons.js'

const API = '/api/eltern'

// Pages whose settings already read from and write to the box (filled step by step)
const CONNECTED = new Set()

// The five areas of the tab bar / side bar
const AREAS = [
  { id: 'start', title: 'Start', icon: 'home' },
  { id: 'hoeren', title: 'Hören', icon: 'phones' },
  { id: 'spielzeit', title: 'Spielzeit', icon: 'time' },
  { id: 'bibliothek', title: 'Bibliothek', icon: 'lib' },
  { id: 'einstellungen', title: 'Einstellungen', icon: 'gear' },
]

const state = {
  schema: null,
  pages: new Map(), // id -> page
  values: new Map(), // setting key -> current value (defaults until the page is connected)
  csrf: '',
  boxName: 'MuPiBox',
}

const $ = (sel, root = document) => root.querySelector(sel)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------- start ---------- */

async function boot() {
  const [schema, session] = await Promise.all([
    fetch('schema.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch(`${API}/session`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  state.schema = schema
  for (const p of schema.pages) state.pages.set(p.id, p)
  for (const g of schema.settingsGroups) {
    // the settings groups are pages of their own in the schema; keep their icon and text for the lists
    const page = state.pages.get(g.id)
    if (page) Object.assign(page, { icon: page.icon || g.icon, description: page.description || g.description })
  }
  if (!session?.csrf_token) {
    renderLogin()
    return
  }
  state.csrf = session.csrf_token
  loadBoxName()
  window.addEventListener('hashchange', route)
  route()
}

async function loadBoxName() {
  try {
    const r = await fetch(`${API}/bootscreen`, { credentials: 'same-origin' })
    if (r.ok) {
      const name = (await r.json())?.current?.boxName
      if (typeof name === 'string' && name.trim()) state.boxName = name.trim()
      renderChrome(currentPage())
    }
  } catch {
    /* the name is only cosmetic */
  }
}

/* ---------- routing ---------- */

function currentId() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  return state.pages.has(id) ? id : 'start'
}
function currentPage() {
  return state.pages.get(currentId())
}
function go(id) {
  if (location.hash !== `#/${id}`) location.hash = `#/${id}`
  else route()
}
function areaOf(page) {
  let p = page
  while (p && p.parent) p = state.pages.get(p.parent)
  return p?.id ?? page?.area ?? 'start'
}

// Timers of the page shown (polling); stopped when another page is opened
const pageTimers = new Set()
function every(ms, fn) {
  const id = setInterval(fn, ms)
  pageTimers.add(id)
}
function stopPageTimers() {
  for (const id of pageTimers) clearInterval(id)
  pageTimers.clear()
}

function route() {
  const page = currentPage()
  stopPageTimers()
  renderChrome(page)
  renderPage(page)
  window.scrollTo(0, 0)
  $('#content').focus({ preventScroll: true })
}

/* ---------- frame: top bar, tab bar, side bar ---------- */

function renderChrome(page) {
  if (!page) return
  const area = areaOf(page)
  const isArea = !page.parent
  const title = page.id === 'start' ? state.boxName : page.title
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  $('#topbar').innerHTML = `
    ${isArea ? `<div class="brand-dot"><img src="mupi.svg" alt=""></div>` : `<button class="icon-btn" id="back" aria-label="Zurück">${icon('back')}</button>`}
    <div class="title">${esc(title)}</div>
    <button class="icon-btn soft" id="theme-btn" aria-label="${theme === 'light' ? 'Dunkel' : 'Hell'}">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
    <button class="icon-btn" id="logout-btn" aria-label="Abmelden">${icon('logout')}</button>`
  $('#back')?.addEventListener('click', () => go(page.parent && page.parent.startsWith('g-') ? page.parent : page.parent || 'start'))
  $('#theme-btn').addEventListener('click', toggleTheme)
  $('#logout-btn').addEventListener('click', logout)

  $('#tabbar').innerHTML = AREAS.map(
    (a) => `<button class="tab" data-go="${a.id}" ${a.id === area ? 'aria-current="page"' : ''}><span class="pill">${icon(a.icon, 21)}</span><span>${a.title}</span></button>`,
  ).join('')

  const groups = area === 'einstellungen' ? state.schema.settingsGroups : []
  const groupOf = (() => {
    let p = page
    while (p && p.parent && !p.parent.startsWith('g-') && p.parent !== 'einstellungen') p = state.pages.get(p.parent)
    return p?.id?.startsWith('g-') ? p.id : p?.parent
  })()
  $('#sidebar').innerHTML = `
    <div class="brand"><img src="mupi.svg" alt=""><span>${esc(state.boxName)}</span></div>
    ${AREAS.map(
      (a) => `<button class="side-link" data-go="${a.id}" ${a.id === area && !(area === 'einstellungen' && page.id !== 'einstellungen') ? 'aria-current="page"' : ''}>${icon(a.icon)}${a.title}</button>
      ${a.id === 'einstellungen' ? groups.map((g) => `<button class="side-link sub" data-go="${g.id}" ${g.id === groupOf ? 'aria-current="page"' : ''}>${icon(g.icon, 18)}${esc(g.title)}</button>`).join('') : ''}`,
    ).join('')}`
  for (const el of document.querySelectorAll('[data-go]')) el.onclick = () => go(el.dataset.go)
}

function toggleTheme() {
  const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', now)
  try {
    localStorage.setItem('mupi-theme', now)
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  renderChrome(currentPage())
}

/* ---------- pages ---------- */

function renderPage(page) {
  const main = $('#content')
  const parts = []
  const connected = CONNECTED.has(page.id)
  if (page.description && page.parent) parts.push(`<p class="page-intro">${esc(page.description)}</p>`)
  if (!connected && hasSettings(page)) {
    parts.push(`<div class="preview-note">${icon('info', 18)}<span>Vorschau: Diese Seite ist noch nicht mit der Box verbunden. Änderungen werden nicht gespeichert.</span></div>`)
  }
  parts.push(...customTop(page))
  for (const sec of page.sections || []) parts.push(renderSection(sec))
  parts.push(...childNav(page))
  main.innerHTML = parts.join('')
  // two columns on a wide PC screen when the page has several cards (the start page has its own layout)
  main.classList.toggle('start', page.id === 'start')
  main.classList.toggle('cols', page.id !== 'start' && main.querySelectorAll(':scope > .card').length >= 3)
  wire(main, page)
  if (page.id === 'start') mountStart(main)
}

function hasSettings(page) {
  return (page.sections || []).some((s) => (s.items || []).some((i) => i.key || i.type === 'buttons'))
}

// Pages that are drawn by the app itself (not only from the schema); filled in the next steps
function customTop(page) {
  switch (page.id) {
    case 'start':
      return startSkeleton()
    case 'hoeren':
      return [`<div class="card wide"><h2>Wiedergabe starten</h2><div class="placeholder">${icon('grid')}Suche, Filter und Cover-Raster – kommt in Schritt 3.</div></div>`]
    case 'spielzeit':
      return [`<div class="card hero wide"><h2>Heute</h2><div class="placeholder">${icon('time')}Ring mit der verbleibenden Zeit – kommt in Schritt 3.</div></div>`]
    case 'bibliothek':
      return [`<div class="card wide"><h2>Inhalte</h2><div class="btns"><button class="btn primary" data-sheet="add">${icon('plus', 18)}Hinzufügen</button></div><div class="placeholder">${icon('lib')}Liste mit Suche und Filtern – kommt in Schritt 4.</div></div>`]
    case 'einstellungen':
      return [
        `<div class="search wide">${icon('search')}<input class="input" id="settings-search" type="search" placeholder="Einstellung suchen – z. B. WLAN, Lüfter, Passwort" autocomplete="off"></div>`,
        `<div class="card nav-card hits wide" id="search-hits" hidden></div>`,
      ]
    default:
      return []
  }
}

// Sub pages of an area or a group that no nav item of the page already leads to
function childNav(page) {
  const linked = new Set((page.sections || []).flatMap((s) => (s.items || []).filter((i) => i.type === 'nav').map((i) => i.target)))
  const kids = state.schema.pages.filter((p) => p.parent === page.id && !linked.has(p.id))
  if (kids.length === 0) return []
  return [`<div class="card nav-card${page.id === 'einstellungen' ? ' wide' : ''}"><div class="navlist">${kids.map((k) => navRow(k.id, k.title, k.description, k.icon)).join('')}</div></div>`]
}

function navRow(target, title, subtitle, ic) {
  const ext = String(target).startsWith('ext:')
  return `<button class="navrow" data-go="${esc(target)}"><span class="tile">${icon(ic || state.pages.get(target)?.icon || 'chevron', 18)}</span>
    <span class="lbl"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span><span class="chev">${icon(ext ? 'ext' : 'chevron', 18)}</span></button>`
}

function renderSection(sec) {
  const items = (sec.items || []).map(renderItem).join('')
  const wide = (sec.items || []).some((i) => ['themegrid', 'bootgrid', 'log', 'json', 'checks'].includes(i.type))
  const onlyNav = (sec.items || []).length > 0 && sec.items.every((i) => i.type === 'nav')
  return `<section class="card${wide ? ' wide' : ''}${onlyNav && !sec.title ? ' nav-card' : ''}">
    ${sec.title ? `<h2>${esc(sec.title)}</h2>` : ''}${sec.help ? `<p class="help">${esc(sec.help)}</p>` : ''}${items}</section>`
}

function value(item) {
  if (!state.values.has(item.key)) state.values.set(item.key, item.default)
  return state.values.get(item.key)
}

function renderItem(it) {
  const help = it.help ? `<small>${esc(it.help)}</small>` : ''
  switch (it.type) {
    case 'toggle':
      return `<div class="row"><span class="lbl"><b>${esc(it.label)}</b>${help}</span>
        <label class="switch"><input type="checkbox" data-key="${esc(it.key)}" ${value(it) ? 'checked' : ''} aria-label="${esc(it.label)}"><span></span></label></div>`
    case 'slider': {
      const v = Number(value(it))
      const fill = ((v - it.min) / (it.max - it.min)) * 100
      return `<div class="field"><div class="slider-head"><label for="k-${esc(it.key)}">${esc(it.label)}</label><span class="value-pill" data-out="${esc(it.key)}">${fmt(v, it)}</span></div>
        <input type="range" id="k-${esc(it.key)}" data-key="${esc(it.key)}" min="${it.min}" max="${it.max}" step="${it.step ?? 1}" value="${v}" style="--fill:${fill}%">
        <div class="range-ends"><span>${fmt(it.min, it)}</span><span>${fmt(it.max, it)}</span></div>${help}</div>`
    }
    case 'select':
      return `<div class="field"><label>${esc(it.label)}</label>
        <button class="select-btn" data-select="${esc(it.key)}"><span data-out="${esc(it.key)}">${esc(value(it))}</span>${icon('chevron', 18)}</button>${help}</div>`
    case 'seg':
      return `<div class="field"><label>${esc(it.label)}</label><div class="seg" data-seg="${esc(it.key)}">${it.options
        .map((o) => `<button aria-pressed="${o === value(it)}" data-v="${esc(o)}">${esc(o)}</button>`)
        .join('')}</div></div>`
    case 'text': {
      const kind = it.kind || 'text'
      const type = kind === 'password' ? 'password' : kind === 'number' ? 'number' : kind === 'url' ? 'url' : 'text'
      const unit = it.unit ? `<span class="unit">${esc(it.unit)}</span>` : ''
      const eye = kind === 'password' ? `<button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button>` : ''
      return `<div class="field"><label for="k-${esc(it.key)}">${esc(it.label)}</label>
        <div class="input-wrap"><input class="input${unit ? ' has-unit' : ''}${eye ? ' has-eye' : ''}" id="k-${esc(it.key)}" type="${type}" data-key="${esc(it.key)}"
          value="${esc(kind === 'password' ? '' : value(it) ?? '')}" placeholder="${esc(it.placeholder ?? '')}" autocomplete="off">${unit}${eye}</div>${help}</div>`
    }
    case 'buttons':
      return `<div class="btns">${it.buttons
        .map(([label, kind, act]) => `<button class="btn ${kind === 'ghost' ? '' : esc(kind)}" data-act="${esc(act ?? '')}" data-label="${esc(label)}">${esc(label)}</button>`)
        .join('')}</div>`
    case 'nav':
      return `<div class="navlist">${navRow(it.target, it.label, it.subtitle)}</div>`
    case 'kv':
      return `<dl class="kv">${it.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    case 'big':
      return `<div><div class="big">${esc(it.value ?? '–')}</div>${it.subtitle ? `<small>${esc(it.subtitle)}</small>` : ''}</div>`
    case 'bar':
      return `<div class="bar"><div class="slider-head"><b>${esc(it.label)}</b><span class="value-pill">${esc(it.value ?? '')}</span></div><div class="track"><i></i></div></div>`
    case 'chart': {
      const max = Math.max(1, ...it.vals)
      return `<div class="chart" style="--n:${it.vals.length}">${it.vals
        .map((v, i) => `<div class="col${i === it.vals.length - 1 ? ' today' : ''}"><i style="height:${(v / max) * 100}%"></i>${esc(it.labels?.[i] ?? '')}</div>`)
        .join('')}</div>`
    }
    case 'note':
    case 'warn':
      return `<div class="note${it.type === 'warn' ? ' warn' : ''}">${icon('info', 18)}<span>${esc(it.text)}</span></div>`
    case 'rows':
      return `<div class="rows">${it.rows
        .map((r) => `<div class="entry"><span class="avatar">${esc(initials(r.t))}</span><span class="lbl"><b>${esc(r.t)}</b>${r.s ? `<small>${esc(r.s)}</small>` : ''}</span>${r.r ? `<span class="chip">${esc(r.r)}</span>` : ''}</div>`)
        .join('')}</div>`
    case 'days':
      return renderDays(it)
    case 'rules':
      return `<div class="placeholder">${icon('time')}Ruhezeit-Regeln (Tag, von–bis, Bezeichnung, Bearbeiten im Blatt) – kommt in Schritt 3.</div><button class="dashed" data-act="toast:Noch nicht verbunden">+ Zeitfenster</button>`
    case 'checks':
      return `<div class="placeholder">${icon('check')}Mehrfachauswahl – wird mit der Seite verbunden.</div>`
    case 'file':
      return `<div class="field"><label>${esc(it.label)}</label><div class="drop">Datei wählen oder hierher ziehen</div></div>`
    case 'themegrid':
      return `<div class="thumbs">${state.schema.themes
        .slice(0, 15)
        .map((t) => `<button class="thumb" aria-pressed="${t === 'Tag & Nacht'}">${esc(t)}</button>`)
        .join('')}</div><small class="help">Alle ${state.schema.themes.length} Themes mit echter Vorschau – wird mit der Seite verbunden.</small>`
    case 'bootgrid':
      return `<div class="thumbs">${state.schema.bootscreens.map((b) => `<button class="thumb" aria-pressed="${b.file === 'karte'}">${esc(b.label)}</button>`).join('')}</div>`
    default:
      return `<div class="placeholder">${icon('info')}${esc(PLACEHOLDER[it.type] ?? it.type)} – wird mit der Seite verbunden.</div>`
  }
}

const PLACEHOLDER = {
  bootprev: 'Vorschau des Start- und Wartungsbilds (800 × 480)',
  dtprev: 'Live-Vorschau der Texte auf dem Display (800 × 480)',
  dtfields: 'Eigene Texte für „Limit erreicht“, „Ruhezeit“ und „QR-Code für Eltern“',
  livescreen: 'Aktuelles Bild des Displays',
  versions: 'Liste der MuPiBox-Versionen (stabil, Beta, Dev)',
  log: 'Protokoll-Ansicht',
  json: 'JSON-Editor der Konfiguration',
}

function renderDays(it) {
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const today = (new Date().getDay() + 6) % 7
  const vals = names.map((_, i) => Number(state.values.get(`${it.keyPrefix}${i}`) ?? it.default[i]))
  const max = Math.max(60, ...vals)
  return `<div class="days">${names
    .map((n, i) => `<button class="day${i === today ? ' today' : ''}" data-day="${i}" data-prefix="${esc(it.keyPrefix)}"><span class="col"><i style="height:${(vals[i] / max) * 100}%"></i></span><b>${n}</b><span>${vals[i]}</span></button>`)
    .join('')}</div>`
}

function initials(t) {
  const w = String(t).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '·'
}

function fmt(v, it) {
  const n = Number(v)
  return `${Number.isInteger(n) ? n : n.toLocaleString('de-DE')}${it.unit ?? ''}`
}

/* ---------- behaviour of the drawn page ---------- */

function wire(root, page) {
  for (const el of root.querySelectorAll('[data-go]')) {
    el.onclick = () => {
      const t = el.dataset.go
      if (t.startsWith('ext:')) openExternal(t.slice(4))
      else go(t)
    }
  }
  for (const el of root.querySelectorAll('input[data-key]')) {
    el.addEventListener('input', () => {
      const it = findItem(page, el.dataset.key)
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value
      state.values.set(el.dataset.key, v)
      if (el.type === 'range') {
        el.style.setProperty('--fill', `${((v - it.min) / (it.max - it.min)) * 100}%`)
        const out = root.querySelector(`[data-out="${CSS.escape(el.dataset.key)}"]`)
        if (out) out.textContent = fmt(v, it)
      }
    })
  }
  for (const el of root.querySelectorAll('[data-eye]')) {
    el.onclick = () => {
      const input = el.parentElement.querySelector('input')
      input.type = input.type === 'password' ? 'text' : 'password'
    }
  }
  for (const seg of root.querySelectorAll('[data-seg]')) {
    seg.onclick = (e) => {
      const b = e.target.closest('button')
      if (!b) return
      state.values.set(seg.dataset.seg, b.dataset.v)
      for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b))
    }
  }
  for (const el of root.querySelectorAll('[data-select]')) el.onclick = () => openSelect(findItem(page, el.dataset.select), el)
  for (const el of root.querySelectorAll('.day')) el.onclick = () => openDay(el, page)
  for (const el of root.querySelectorAll('.thumb')) {
    el.onclick = () => {
      for (const x of el.parentElement.children) x.setAttribute('aria-pressed', String(x === el))
    }
  }
  for (const el of root.querySelectorAll('[data-act]')) el.onclick = () => action(el.dataset.act, el.dataset.label, page)
  for (const el of root.querySelectorAll('[data-sheet="add"]')) el.onclick = openAdd
  const search = $('#settings-search', root)
  if (search) search.addEventListener('input', () => showHits(search.value))
}

// Pages outside the app: the previous admin interface (port 80) and the DietPi dashboard (port 5252)
function openExternal(which) {
  const host = location.hostname
  const url = which === 'dietpi' ? `http://${host}:5252/` : `${location.protocol === 'https:' ? 'https' : 'http'}://${host}/`
  window.open(url, '_blank', 'noopener')
}

function findItem(page, key) {
  for (const s of page.sections || []) for (const i of s.items || []) if (i.key === key) return i
  return {}
}

function action(act, label, page) {
  const [kind, arg] = [act.split(':')[0], act.slice(act.indexOf(':') + 1)]
  if (kind === 'go') return go(arg)
  if (kind === 'sheet') {
    return confirmSheet(label, 'Diese Aktion ist in der Vorschau noch nicht verbunden.', () => toast('Noch nicht verbunden', 'info'))
  }
  if (!CONNECTED.has(page.id)) return toast('Vorschau: noch nicht mit der Box verbunden', 'info')
  toast(kind === 'toast' ? arg : label)
}

/* ---------- talking to the box ---------- */

// JSON request with the session's CSRF token on everything that changes something. Never throws.
async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['x-mupibox-csrf'] = state.csrf
  const r = await fetch(path, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  if (!r) return { ok: false, status: 0, body: null }
  let data = null
  try {
    data = await r.json()
  } catch {
    /* no JSON */
  }
  return { ok: r.ok, status: r.status, body: data }
}

/* ---------- Start ---------- */

// The parts of the start page; filled by mountStart() and refreshed while the page is shown
function startSkeleton() {
  return [
    `<section class="card hero now" id="now"><div class="now-idle">${icon('music')}<span>Verbinde …</span></div></section>`,
    `<div class="start-side">
      <div id="notices"></div>
      <div class="tiles" id="tiles">
        ${tile('akku', 'bat', 'Akku', '–')}${tile('spielzeit', 'time', 'Heute gehört', '–')}
        ${tile('spielzeit', 'moon', 'Ruhezeit', '–', 'quiet')}${tile('wlan', 'wifi', 'WLAN', '–')}
      </div>
      <div class="section-label">Schnell</div>
      <div class="quick">
        <button class="qbtn accent" id="q-plus">${icon('plus', 22)}<span>+15 min</span></button>
        <button class="qbtn blue" id="q-quiet">${icon('moon', 22)}<span>Ruhe sofort</span></button>
        <button class="qbtn" id="q-sleep">${icon('time', 22)}<span id="q-sleep-label">Schlaftimer</span></button>
      </div>
    </div>`,
    `<section class="card nav-card start-more"><div class="navlist">
      ${navRow('g-aussehen', 'Aussehen des Displays', 'Theme, Start- und Wartungsbilder', 'pal')}
      ${navRow('spotify', 'Spotify', 'Smart-Sync und Zugang', 'sync')}
      ${navRow('verlauf', 'Hör-Verlauf', 'Heute und die letzten 7 Tage', 'hist')}
      ${navRow('bluetooth', 'Bluetooth', 'Kopfhörer und Lautsprecher', 'bt')}
      ${navRow('telegram', 'Telegram', 'Eltern-Bot', 'tg')}
      ${navRow('g-system', 'System', 'Über die Box, Neustart, Updates', 'gear')}
      ${navRow('ext:admin', 'Erweiterte Einstellungen', 'Das bisherige Admin-Interface', 'ext')}
    </div></section>`,
  ]
}

function tile(target, ic, label, val, id) {
  return `<button class="tile-card" data-go="${target}" ${id ? `id="tile-${id}"` : `id="tile-${target}"`}>
    <span class="tile-head">${icon(ic, 16)}${label}</span><b class="tile-val">${val}</b><span class="tile-bar" hidden><i></i></span></button>`
}

const startState = { maxVolume: 100, volTimer: null, sleep: null }

function mountStart(root) {
  loadNow(root)
  loadStatus(root)
  loadVolumeCap(root)
  loadNotices(root)
  every(5000, () => loadNow(root))
  every(30000, () => loadStatus(root))
  $('#q-plus', root).onclick = async () => {
    const r = await api('/api/playtime/extend', { method: 'POST', body: { minutes: 15 } })
    toast(r.ok ? '15 Minuten mehr für heute' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    if (r.ok) loadStatus(root)
  }
  $('#q-quiet', root).onclick = () => minutesSheet('Ruhe sofort', 'Die Box spielt für diese Zeit nichts.', [15, 30, 60, 120], 30, async (m) => {
    const r = await api('/api/quiethours/now', { method: 'POST', body: { minutes: m } })
    toast(r.ok ? `Ruhe für ${m} Minuten` : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    if (r.ok) loadStatus(root)
  })
  $('#q-sleep', root).onclick = () => sleepSheet(root)
}

async function loadNow(root) {
  const box = $('#now', root)
  if (!box) return
  const r = await api(`${API}/playback`)
  const b = r.body ?? {}
  const hasTrack = !!b.player && !!(b.title || b.artist)
  if (!r.ok || (!b.playing && !hasTrack)) {
    if (!box.querySelector('.now-empty')) {
      box.innerHTML = `<div class="now-empty"><div class="mupi-circle"><img src="mupi.svg" alt="" width="64" height="67"></div>
        <b>Die Box ist ruhig.</b><small>${r.ok ? 'Gerade läuft nichts.' : 'Der Status ist gerade nicht erreichbar.'}</small>
        <button class="btn primary" data-go="hoeren">${icon('phones', 18)}Etwas abspielen</button></div>${volumeRow()}`
      box.querySelector('[data-go]').onclick = () => go('hoeren')
      wireVolume(root)
    }
    setVolume(root, b.volume)
    return
  }
  if (!box.querySelector('.now-track')) {
    box.innerHTML = `<div class="now-track">
        <div class="now-cover"><img alt="" hidden><span>${icon('music', 32)}</span></div>
        <div class="now-text"><span class="now-label"></span><b class="now-title"></b><small class="now-meta"></small></div>
      </div>
      <div class="now-progress" hidden><div class="track"><i></i></div><div class="range-ends"><span class="t0"></span><span class="t1"></span></div></div>
      <div class="now-ctrl">
        <button class="cbtn" data-a="stop" aria-label="Stopp">${STOP_SVG}</button>
        <button class="cbtn" data-a="previous" aria-label="Zurück">${PREV_SVG}</button>
        <button class="cbtn big" data-a="toggle" aria-label="Play/Pause"></button>
        <button class="cbtn" data-a="next" aria-label="Weiter">${NEXT_SVG}</button>
      </div>${volumeRow()}`
    for (const btn of box.querySelectorAll('[data-a]')) btn.onclick = () => playbackAction(root, btn.dataset.a === 'toggle' ? (btn.dataset.state === 'playing' ? 'pause' : 'play') : btn.dataset.a)
    wireVolume(root)
  }
  const img = box.querySelector('.now-cover img')
  if (b.coverUrl) {
    if (img.getAttribute('src') !== b.coverUrl) img.src = b.coverUrl
    img.hidden = false
  } else img.hidden = true
  box.querySelector('.now-label').innerHTML = `<i class="dot"></i>${b.playing ? 'Läuft gerade' : 'Pausiert'}`
  box.querySelector('.now-title').textContent = b.title || '—'
  box.querySelector('.now-meta').textContent = [b.artist, b.album].filter(Boolean).join(' · ')
  const toggle = box.querySelector('[data-a="toggle"]')
  toggle.dataset.state = b.playing ? 'playing' : 'paused'
  toggle.innerHTML = b.playing ? PAUSE_SVG : PLAY_SVG
  const prog = box.querySelector('.now-progress')
  if (Number.isFinite(b.progressMs) && Number.isFinite(b.durationMs) && b.durationMs > 0) {
    prog.hidden = false
    prog.querySelector('i').style.width = `${Math.min(100, (b.progressMs / b.durationMs) * 100)}%`
    prog.querySelector('.t0').textContent = clock(b.progressMs)
    prog.querySelector('.t1').textContent = clock(b.durationMs)
  } else prog.hidden = true
  setVolume(root, b.volume)
}

const PLAY_SVG = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
const STOP_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
const PREV_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>'
const NEXT_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>'
const PAUSE_SVG = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'

function clock(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function playbackAction(root, action) {
  const r = await api(`${API}/playback/${action}`, { method: 'POST' })
  if (!r.ok) {
    const code = r.body?.error ?? ''
    toast(
      { playtime_limit_reached: 'Die Hörzeit für heute ist aufgebraucht.', quiet_hours_active: 'Gerade ist Ruhezeit.', no_active_track: 'Es ist nichts zum Fortsetzen da.' }[code] ??
        'Das hat nicht geklappt',
      'info',
    )
  }
  setTimeout(() => loadNow(root), 600)
}

function volumeRow() {
  return `<div class="now-vol">${icon('vol', 20)}<div class="vol-wrap"><input type="range" id="vol" min="0" max="100" step="1" value="0" aria-label="Lautstärke"><i class="vol-cap" hidden></i></div><span class="value-pill" id="vol-out">–</span></div>`
}

async function loadVolumeCap(root) {
  const r = await api(`${API}/audio`)
  if (!r.ok) return
  startState.maxVolume = Number.isFinite(r.body?.maxVolume) ? r.body.maxVolume : 100
  showCap(root)
  setVolume(root, r.body?.current)
}

function showCap(root) {
  const cap = $('.vol-cap', root)
  if (!cap) return
  cap.hidden = startState.maxVolume >= 100
  cap.style.left = `${startState.maxVolume}%`
}

function setVolume(root, v) {
  const input = $('#vol', root)
  if (!input || !Number.isFinite(v) || document.activeElement === input) return
  input.value = v
  input.style.setProperty('--fill', `${v}%`)
  $('#vol-out', root).textContent = `${v} %`
}

function wireVolume(root) {
  const input = $('#vol', root)
  if (!input) return
  showCap(root)
  input.addEventListener('input', () => {
    const v = Number(input.value)
    input.style.setProperty('--fill', `${v}%`)
    $('#vol-out', root).textContent = `${v} %`
    clearTimeout(startState.volTimer)
    startState.volTimer = setTimeout(async () => {
      const r = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
      if (r.ok && r.body?.capped) {
        toast(`Hörschutz: höchstens ${r.body.applied} %`, 'info')
        input.value = r.body.applied
        input.style.setProperty('--fill', `${r.body.applied}%`)
        $('#vol-out', root).textContent = `${r.body.applied} %`
      } else if (!r.ok) toast('Lautstärke ließ sich nicht setzen', 'info')
    }, 200)
  })
}

async function loadStatus(root) {
  const [hat, pt, net, caps, sleep] = await Promise.all([
    api('/api/mupihat'),
    api('/api/playtime'),
    api('/api/network'),
    api(`${API}/caps-config`),
    api(`${API}/sleeptimer`),
  ])
  // battery
  let pct = hat.body?.Bat_Percent
  if (!Number.isFinite(pct)) pct = Number.parseInt(String(hat.body?.Bat_SOC ?? ''), 10)
  const charging = (hat.body?.IBus ?? 0) > 0
  setTile(root, 'tile-akku', Number.isFinite(pct) ? `${pct} %${charging ? ' ⚡' : ''}` : '–', Number.isFinite(pct) ? pct : null, pct <= 15 ? 'danger' : pct <= 30 ? 'warn' : 'ok')
  // listened today
  const p = pt.body?.playtime ?? {}
  if (p.enabled && Number.isFinite(p.limitMinutes)) {
    const used = Math.floor((p.usedSeconds ?? 0) / 60)
    setTile(root, 'tile-spielzeit', `${used} / ${p.limitMinutes} min`, p.limitMinutes > 0 ? Math.min(100, (used / p.limitMinutes) * 100) : 100, p.state === 'blocked' ? 'danger' : 'accent')
  } else {
    setTile(root, 'tile-spielzeit', 'kein Limit', null)
  }
  // quiet time
  const q = pt.body?.quiet ?? {}
  let quiet = 'aus'
  if (q.enabled) quiet = q.state === 'blocked' || q.inWindow ? `jetzt${q.label ? ` · ${q.label}` : ''}` : nextQuiet(caps.body?.quietHours?.schedule) ?? 'keine geplant'
  setTile(root, 'tile-quiet', quiet, null)
  // WiFi
  const n = net.body ?? {}
  setTile(root, 'tile-wlan', n.wifi ? `${n.wifi}${n.onlinestate === 'online' ? '' : ' (offline)'}` : n.onlinestate === 'online' ? 'LAN' : 'offline', null)
  // sleep timer on its quick button
  startState.sleep = sleep.body?.active ? sleep.body : null
  const label = $('#q-sleep-label', root)
  if (label) label.textContent = startState.sleep ? `noch ${Math.ceil((startState.sleep.remaining_seconds ?? 0) / 60)} min` : 'Schlaftimer'
}

function setTile(root, id, text, pct, kind) {
  const el = $(`#${id}`, root)
  if (!el) return
  el.querySelector('.tile-val').textContent = text
  const bar = el.querySelector('.tile-bar')
  bar.hidden = pct == null
  if (pct != null) {
    bar.querySelector('i').style.width = `${pct}%`
    bar.dataset.kind = kind ?? 'ok'
  }
}

// The next start of a quiet-time window, e.g. "ab 20:00" today or "Di ab 20:00"
function nextQuiet(schedule) {
  if (!schedule) return null
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const short = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const now = new Date()
  const today = (now.getDay() + 6) % 7
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let d = 0; d < 7; d++) {
    const day = (today + d) % 7
    const starts = (schedule[keys[day]] ?? [])
      .map((w) => String(w.from ?? w.start ?? ''))
      .filter((f) => /^\d{2}:\d{2}$/.test(f))
      .map((f) => [f, Number(f.slice(0, 2)) * 60 + Number(f.slice(3))])
      .filter(([, m]) => d > 0 || m > nowMin)
      .sort((a, b) => a[1] - b[1])
    if (starts.length) return d === 0 ? `ab ${starts[0][0]}` : `${short[day]} ab ${starts[0][0]}`
  }
  return null
}

async function loadNotices(root) {
  const [hat, sync] = await Promise.all([api('/api/mupihat'), api('/api/spotify-sync/status')])
  const notes = []
  const pct = hat.body?.Bat_Percent
  if (Number.isFinite(pct) && pct <= 15 && !((hat.body?.IBus ?? 0) > 0)) {
    notes.push(['bat', 'Akku fast leer', `Noch ${pct} % – bitte bald laden.`, 'akku'])
  }
  const tok = sync.body?.token
  if (sync.body?.enabled && tok?.configured && tok.scopes_ok === false) {
    notes.push(['sync', 'Spotify-Anmeldung abgelaufen', 'Bitte neu verbinden, damit der Sync weiterläuft.', 'spotify'])
  }
  const box = $('#notices', root)
  if (!box) return
  box.innerHTML = notes
    .map(([ic, t, s, target]) => `<div class="notice"><button class="notice-body" data-go="${target}">${icon(ic, 20)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button><button class="notice-x" aria-label="Schließen">${icon('close', 16)}</button></div>`)
    .join('')
  for (const n of box.querySelectorAll('.notice')) {
    n.querySelector('.notice-body').onclick = () => go(n.querySelector('.notice-body').dataset.go)
    n.querySelector('.notice-x').onclick = () => n.remove()
  }
}

function minutesSheet(title, text, choices, def, onOk) {
  let minutes = def
  openSheet(
    `<h2>${esc(title)}</h2><p class="help" style="margin:0">${esc(text)}</p>
     <div class="seg" id="m-seg">${choices.map((m) => `<button aria-pressed="${m === def}" data-v="${m}">${m} min</button>`).join('')}</div>
     <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#m-seg').onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        minutes = Number(b.dataset.v)
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
      }
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-ok]').onclick = () => {
        close()
        onOk(minutes)
      }
    },
  )
}

function sleepSheet(root) {
  const active = startState.sleep
  if (active) {
    const until = active.until_iso ? new Date(active.until_iso) : null
    openSheet(
      `<h2>Schlaftimer läuft</h2><p class="help" style="margin:0">Die Box schaltet sich in ${Math.ceil((active.remaining_seconds ?? 0) / 60)} Minuten aus${until ? ` (um ${until.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})` : ''}.</p>
       <div class="btns"><button class="btn" data-close>Schließen</button><button class="btn danger" data-ok>Timer stoppen</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        sheet.querySelector('[data-ok]').onclick = async () => {
          close()
          const r = await api(`${API}/sleeptimer/stop`, { method: 'POST' })
          toast(r.ok ? 'Schlaftimer gestoppt' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
          loadStatus(root)
        }
      },
    )
    return
  }
  minutesSheet('Schlaftimer', 'Die Box schaltet sich danach komplett aus – egal, ob gerade etwas läuft.', [15, 30, 45, 60, 90], 30, async (m) => {
    const r = await api(`${API}/sleeptimer/start`, { method: 'POST', body: { minutes: m } })
    toast(r.ok ? `Schlaftimer: ${m} Minuten` : r.body?.error ?? 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    loadStatus(root)
  })
}

/* ---------- settings search ---------- */

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

function showHits(q) {
  const box = $('#search-hits')
  const n = norm(q.trim())
  if (n.length < 2) {
    box.hidden = true
    return
  }
  const seen = new Set()
  const hits = state.schema.searchIndex.filter((h) => norm(h.l).includes(n) && !seen.has(h.l + h.id) && seen.add(h.l + h.id)).slice(0, 12)
  box.hidden = false
  box.innerHTML = hits.length
    ? `<div class="navlist">${hits.map((h) => navRow(h.id, h.l, h.where, state.pages.get(h.id)?.icon)).join('')}</div>`
    : `<p class="help" style="margin:10px 0">Nichts gefunden.</p>`
  for (const el of box.querySelectorAll('[data-go]')) el.onclick = () => go(el.dataset.go)
}

/* ---------- sheets and toasts ---------- */

function openSheet(html, onOpen) {
  const sheet = $('#sheet')
  const scrim = $('#sheet-scrim')
  const before = document.activeElement
  sheet.innerHTML = `<div class="grip"></div>${html}`
  sheet.hidden = false
  scrim.hidden = false
  const close = () => {
    sheet.hidden = true
    scrim.hidden = true
    document.removeEventListener('keydown', onKey)
    before?.focus?.()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close()
    if (e.key === 'Tab') {
      // the focus stays in the sheet
      const f = [...sheet.querySelectorAll('button, input, select, textarea, [tabindex]')].filter((x) => !x.disabled)
      if (f.length === 0) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    }
  }
  document.addEventListener('keydown', onKey)
  scrim.onclick = close
  onOpen?.(sheet, close)
  sheet.querySelector('input, button')?.focus()
  return close
}

function openSelect(it, btn) {
  const opts = it.options || []
  const long = opts.length > 12
  openSheet(
    `<h2>${esc(it.label)}</h2>${long ? `<div class="search">${icon('search')}<input class="input" type="search" placeholder="Suchen …" data-filter></div>` : ''}
     <div class="opts" role="listbox">${opts.map((o) => `<button class="opt" role="option" aria-selected="${o === value(it)}" data-v="${esc(o)}"><span>${esc(o)}</span>${o === value(it) ? icon('check', 18) : ''}</button>`).join('')}</div>`,
    (sheet, close) => {
      sheet.querySelector('[data-filter]')?.addEventListener('input', (e) => {
        const n = norm(e.target.value)
        for (const b of sheet.querySelectorAll('.opt')) b.hidden = !norm(b.dataset.v).includes(n)
      })
      for (const b of sheet.querySelectorAll('.opt')) {
        b.onclick = () => {
          state.values.set(it.key, b.dataset.v)
          btn.querySelector('[data-out]').textContent = b.dataset.v
          close()
        }
      }
    },
  )
}

function openDay(el, page) {
  const names = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  const i = Number(el.dataset.day)
  const key = `${el.dataset.prefix}${i}`
  const cur = el.querySelector('span:last-child').textContent
  openSheet(
    `<h2>${names[i]}</h2><div class="field"><label for="day-min">Minuten (0 = gesperrt)</label>
      <div class="input-wrap"><input class="input has-unit" id="day-min" type="number" min="0" max="1440" value="${esc(cur)}"><span class="unit">min</span></div></div>
     <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-ok]').onclick = () => {
        const v = Math.max(0, Math.min(1440, Number(sheet.querySelector('#day-min').value) || 0))
        state.values.set(key, v)
        close()
        renderPage(page)
      }
    },
  )
}

function openAdd() {
  const ways = [
    ['suche', 'search', 'Auf Spotify suchen', 'Hörspiele, Alben und Künstler finden'],
    ['link', 'link', 'Link einfügen', 'Spotify-Link, Radiosender oder Podcast'],
    ['upload', 'up', 'Vom Gerät hochladen', 'Titel oder ganze Ordner auf die SD-Karte'],
  ]
  openSheet(`<h2>Was möchtest du hinzufügen?</h2><div class="navlist">${ways.map(([id, ic, t, s]) => navRow(id, t, s, ic)).join('')}</div>`, (sheet, close) => {
    for (const el of sheet.querySelectorAll('[data-go]')) {
      el.onclick = () => {
        close()
        go(el.dataset.go)
      }
    }
  })
}

function confirmSheet(title, text, onOk) {
  openSheet(
    `<h2>${esc(title)}</h2><p class="help" style="margin:0">${esc(text)}</p>
     <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn danger" data-ok>${esc(title)}</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-ok]').onclick = () => {
        close()
        onOk()
      }
    },
  )
}

function toast(text, kind = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'info', 18)}<span>${esc(text)}</span>`
  $('#toasts').append(el)
  setTimeout(() => el.remove(), 3200)
}

/* ---------- login ---------- */

function renderLogin() {
  $('#topbar').innerHTML = ''
  $('#tabbar').hidden = true
  $('#sidebar').hidden = true
  $('#content').innerHTML = `
    <div class="login">
      <div class="logo"><img src="mupi.svg" alt="" width="64" height="67"></div>
      <h1>Willkommen zurück</h1>
      <p class="help" style="margin:0">Melde dich mit dem Passwort an – oder scanne den QR-Code am Display (Statusanzeige lange drücken) bzw. nutze den Link aus Telegram.</p>
      <form class="card" id="login-form">
        <div class="field"><label for="pw">Passwort</label>
          <div class="input-wrap"><input class="input has-eye" id="pw" type="password" autocomplete="current-password" required><button type="button" class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div></div>
        <button class="btn primary block" type="submit">Anmelden</button>
        <p class="help" id="login-msg" style="margin:0" hidden></p>
      </form>
    </div>`
  $('[data-eye]').onclick = () => {
    const i = $('#pw')
    i.type = i.type === 'password' ? 'text' : 'password'
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const msg = $('#login-msg')
    const r = await fetch(`${API}/login`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#pw').value }),
    }).catch(() => null)
    if (r?.ok) {
      location.reload()
      return
    }
    msg.hidden = false
    msg.textContent = r?.status === 429 ? 'Zu viele Versuche – bitte kurz warten.' : r?.status === 401 ? 'Das Passwort stimmt nicht (oder es ist keins gesetzt – dann den QR-Code nutzen).' : 'Die Box ist gerade nicht erreichbar.'
  })
}

async function logout() {
  await fetch(`${API}/logout`, { method: 'POST', credentials: 'same-origin', headers: { 'x-mupibox-csrf': state.csrf } }).catch(() => null)
  location.reload()
}

boot().catch((err) => {
  console.error(err)
  $('#content').innerHTML = `<div class="loading"><p>Die App konnte nicht geladen werden.</p></div>`
})
