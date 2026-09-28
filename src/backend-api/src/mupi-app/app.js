// MuPiBox app – one app for everything (replaces the admin interface and the parents' web app step by step).
//
// The pages come from schema.json (docs/eine-app/app-schema.json): areas, settings groups, pages with sections and
// their building blocks (toggle, slider, select, …). This file draws them and handles navigation, sheets, search,
// the light/dark switch and the login. Pages are connected to the box one by one (see docs/app-mapping.md): until a
// page is in CONNECTED, its controls only change locally and the page says so.

import { icon } from './icons.js'

const API = '/api/eltern'

// Pages whose settings already read from and write to the box: the pages with a controller (see CONTROLLERS)
const CONNECTED = new Set()
const ctrlOf = (page) => CONTROLLERS[page?.id]

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

// Counts the drawings: a page whose data arrives after the user went on is not drawn any more
let renderToken = 0

async function renderPage(page, reload = true) {
  const main = $('#content')
  const ctrl = ctrlOf(page)
  const token = ++renderToken
  if (ctrl?.load && reload) {
    // another page's controls must not stay usable while this one loads
    if (main.dataset.page !== page.id) main.innerHTML = `<div class="loading"><p>Lade …</p></div>`
    main.dataset.page = page.id
    try {
      await ctrl.load(page)
    } catch (err) {
      console.error(err)
      toast('Die Werte der Box ließen sich nicht laden', 'info')
    }
    if (token !== renderToken) return
  }
  const parts = []
  const connected = CONNECTED.has(page.id) || !!ctrl
  if (page.description && page.parent) parts.push(`<p class="page-intro">${esc(page.description)}</p>`)
  if (!connected && hasSettings(page)) {
    parts.push(`<div class="preview-note">${icon('info', 18)}<span>Vorschau: Diese Seite ist noch nicht mit der Box verbunden. Änderungen werden nicht gespeichert.</span></div>`)
  }
  parts.push(...customTop(page))
  // a connected page may put its own values into the schema's building blocks (lists, charts, …)
  for (const sec of ctrl?.sections?.(page) ?? page.sections ?? []) parts.push(renderSection(sec))
  parts.push(...childNav(page))
  // a redraw with the values already loaded (after a change) stays where the user is
  const keepScroll = !reload && main.dataset.page === page.id ? window.scrollY : null
  main.innerHTML = parts.join('')
  main.dataset.page = page.id
  // two columns on a wide PC screen when the page has several cards (the start page has its own layout)
  main.classList.toggle('start', page.id === 'start')
  main.classList.toggle('cols', page.id !== 'start' && main.querySelectorAll(':scope > .card').length >= 3)
  wire(main, page)
  if (page.id === 'start') mountStart(main)
  ctrl?.mount?.(main, page)
  if (keepScroll != null) window.scrollTo(0, keepScroll)
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
      return hearSkeleton()
    case 'spielzeit':
      return [`<section class="card hero wide pt-hero" id="pt-hero"><div class="loading"><p>Lade …</p></div></section>`]
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
  if (page.id === 'hoeren') return [] // Hören shows its sub page (the history) above the grid
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
      return renderRules()
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
      if (el.type === 'checkbox') ctrlOf(page)?.change?.(el.dataset.key, v, page)
      if (el.type === 'range') {
        el.style.setProperty('--fill', `${((v - it.min) / (it.max - it.min)) * 100}%`)
        const out = root.querySelector(`[data-out="${CSS.escape(el.dataset.key)}"]`)
        if (out) out.textContent = fmt(v, it)
      }
    })
  }
  for (const el of root.querySelectorAll('input.input[data-key]')) {
    // text and number fields are saved when they are left (or with Enter)
    el.addEventListener('change', () => ctrlOf(page)?.change?.(el.dataset.key, el.type === 'number' ? Number(el.value) : el.value, page))
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
      ctrlOf(page)?.change?.(seg.dataset.seg, b.dataset.v, page)
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
  // a connected page runs the button itself (by its action, or by its label where the schema has a placeholder)
  const ctrl = ctrlOf(page)
  const fn = ctrl?.byLabel?.[label] ?? ctrl?.act?.[kind]
  if (fn) return fn(arg, label, page)
  if (kind === 'sheet') {
    return confirmSheet(label, 'Diese Aktion ist in der Vorschau noch nicht verbunden.', () => toast('Noch nicht verbunden', 'info'))
  }
  if (!CONNECTED.has(page.id) && !ctrl) return toast('Vorschau: noch nicht mit der Box verbunden', 'info')
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

/* ---------- connected pages ---------- */

// What a limit or a quiet time does when it begins: the words of the page and the values of the box
const GRACE = { 'Sofort stoppen': 'stop', 'Titel zu Ende spielen': 'track', 'Album zu Ende spielen': 'album' }
const GRACE_LABEL = Object.fromEntries(Object.entries(GRACE).map(([label, v]) => [v, label]))
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const hhmm = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

// Friendly words for the errors of the play and save endpoints
function errorText(r, fallback = 'Das hat nicht geklappt') {
  const code = r.body?.error ?? ''
  return (
    {
      playtime_limit_reached: 'Die Hörzeit für heute ist aufgebraucht.',
      quiet_hours_active: 'Gerade ist Ruhezeit.',
      spotify_id_missing: 'Dieser Eintrag hat keine Spotify-ID.',
      item_not_found: 'Den Eintrag gibt es nicht mehr.',
      library_unavailable: 'Die Bibliothek ließ sich nicht lesen.',
      nas_path_not_selected: 'Dieser NAS-Ordner ist nicht freigegeben.',
      invalid_path: 'Dieser Ordner lässt sich nicht abspielen.',
    }[code] ?? fallback
  )
}

/* Spielzeit: ring, instant actions, sleep timer, daily limits, quiet rules */

const caps = { config: null, status: null, sleep: null }

async function saveCaps(body, done = 'Gespeichert') {
  const r = await api(`${API}/caps-config`, { method: 'POST', body })
  toast(r.ok ? done : 'Nicht gespeichert – bitte noch einmal versuchen', r.ok ? 'ok' : 'info')
  if (r.ok) setTimeout(() => refreshPlaytime(), 1500) // the player writes its status a moment later
  return r.ok
}

async function loadCaps() {
  const [cfg, st, sleep] = await Promise.all([api(`${API}/caps-config`), api('/api/playtime'), api(`${API}/sleeptimer`)])
  if (!cfg.ok) throw new Error(`caps-config ${cfg.status}`)
  caps.config = cfg.body
  caps.status = st.ok ? st.body : null
  caps.sleep = sleep.body?.active ? sleep.body : null
  const pl = cfg.body.playtimeLimit ?? {}
  const qh = cfg.body.quietHours ?? {}
  state.values.set('limitOn', !!pl.enabled)
  DAY_KEYS.forEach((d, i) => state.values.set(`lim${i}`, Number(pl.limitsMinutes?.[d] ?? 0)))
  state.values.set('resetHour', String(pl.resetHour ?? 0))
  state.values.set('limitGrace', GRACE_LABEL[pl.graceMode] ?? 'Titel zu Ende spielen')
  state.values.set('quietOn', !!qh.enabled)
  state.values.set('quietGrace', GRACE_LABEL[qh.graceMode] ?? 'Titel zu Ende spielen')
}

async function refreshPlaytime() {
  const hero = $('#pt-hero')
  if (!hero) return
  const [st, sleep] = await Promise.all([api('/api/playtime'), api(`${API}/sleeptimer`)])
  if (st.ok) caps.status = st.body
  caps.sleep = sleep.body?.active ? sleep.body : null
  drawRing()
  drawSleep()
}

// The ring of today: minutes left of the limit, plus what else holds the box right now
function drawRing() {
  const hero = $('#pt-hero')
  if (!hero) return
  const st = caps.status ?? {}
  const p = st.playtime ?? {}
  const q = st.quiet ?? {}
  const ov = st.override ?? {}
  const now = Date.now()
  const used = Math.floor((p.usedSeconds ?? 0) / 60)
  const limited = !!p.enabled && Number.isFinite(p.limitMinutes)
  const left = limited ? Math.max(0, Math.ceil((p.remainingSeconds ?? (p.limitMinutes - used) * 60) / 60)) : null
  const pct = limited ? (p.limitMinutes > 0 ? Math.min(1, used / p.limitMinutes) : 1) : 0
  const blocked = p.state === 'blocked'
  const kind = blocked ? 'danger' : limited && left <= 10 ? 'warn' : 'accent'
  const r = 54
  const len = 2 * Math.PI * r
  const chips = []
  if (ov.forceBlockUntil > now) chips.push(['danger', `Ruhe sofort bis ${hhmm(ov.forceBlockUntil)}`])
  else if (ov.allowUntil > now) chips.push(['ok', `Sperren aufgehoben bis ${hhmm(ov.allowUntil)}`])
  if (q.enabled && (q.inWindow || q.state === 'blocked')) chips.push(['warn', `Ruhezeit${q.label ? ` · ${q.label}` : ''}`])
  else if (q.enabled) {
    const next = nextQuiet(caps.config?.quietHours?.schedule)
    if (next) chips.push(['', `Ruhezeit ${next}`])
  }
  if (p.state === 'grace' || q.state === 'grace') chips.push(['warn', 'Läuft noch zu Ende'])
  if (caps.sleep) chips.push(['', `Schlaftimer: noch ${Math.ceil((caps.sleep.remaining_seconds ?? 0) / 60)} min`])
  hero.innerHTML = `<div class="ring-wrap">
      <svg class="ring" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" class="ring-bg"/>
        <circle cx="64" cy="64" r="${r}" class="ring-fg" data-kind="${kind}" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - pct)}"/></svg>
      <div class="ring-text">${limited ? `<b>${left}</b><small>min übrig</small>` : `<b>${used}</b><small>min gehört</small>`}</div>
    </div>
    <div class="ring-side"><h2>Heute</h2>
      <p class="ring-line">${limited ? `${used} von ${p.limitMinutes} min gehört${blocked ? ' – aufgebraucht' : ''}` : 'Kein Tageslimit aktiv'}</p>
      <div class="chips">${chips.map(([k, t]) => `<span class="chip${k ? ` ${k}` : ''}">${esc(t)}</span>`).join('')}</div>
    </div>`
}

// The sleep timer card says whether a timer runs
function drawSleep() {
  const btns = [...document.querySelectorAll('#content [data-act="sleep"]')][0]?.closest('.card')
  if (!btns) return
  let line = btns.querySelector('.sleep-line')
  if (!line) {
    line = document.createElement('p')
    line.className = 'sleep-line help'
    btns.querySelector('.btns')?.before(line)
  }
  const s = caps.sleep
  line.textContent = s
    ? `Läuft: die Box schaltet sich in ${Math.ceil((s.remaining_seconds ?? 0) / 60)} min aus${s.until_iso ? ` (um ${hhmm(Date.parse(s.until_iso))})` : ''}.`
    : 'Gerade läuft kein Schlaftimer.'
}

function capMinutes() {
  const m = Math.floor(Number(state.values.get('capMin') ?? 30))
  if (!Number.isFinite(m) || m < 1 || m > 1440) {
    toast('Bitte 1 bis 1440 Minuten eintragen', 'info')
    return null
  }
  return m
}

async function capAction(path, minutes, done) {
  const r = await api(path, { method: 'POST', body: { minutes } })
  toast(r.ok ? done : errorText(r), r.ok ? 'ok' : 'info')
  if (r.ok) setTimeout(() => refreshPlaytime(), 1500)
}

/* the quiet rules: the schedule's windows, one rule for the same time and name on several days */

function quietRules() {
  const schedule = caps.config?.quietHours?.schedule ?? {}
  const rules = new Map()
  DAY_KEYS.forEach((d, i) => {
    for (const w of schedule[d] ?? []) {
      const from = String(w.from ?? w.start ?? '')
      const to = String(w.to ?? w.end ?? '')
      const label = String(w.label ?? '')
      const key = `${from}|${to}|${label}`
      if (!rules.has(key)) rules.set(key, { from, to, label, days: [] })
      rules.get(key).days.push(i)
    }
  })
  return [...rules.values()].sort((a, b) => a.days[0] - b.days[0] || a.from.localeCompare(b.from))
}

// "Mo–Fr", "Sa, So", "Täglich"
function dayRange(days) {
  if (days.length === 7) return 'Täglich'
  const runs = []
  for (const d of days) {
    const last = runs.at(-1)
    if (last && d === last[1] + 1) last[1] = d
    else runs.push([d, d])
  }
  return runs.map(([a, b]) => (a === b ? DAY_SHORT[a] : b === a + 1 ? `${DAY_SHORT[a]}, ${DAY_SHORT[b]}` : `${DAY_SHORT[a]}–${DAY_SHORT[b]}`)).join(', ')
}

function renderRules() {
  if (!caps.config) return `<div class="placeholder">${icon('time')}Die Ruhezeiten werden geladen …</div>`
  const rules = quietRules()
  if (rules.length === 0) return `<p class="help rules-empty">Noch keine Zeitfenster. Leg eins an, z. B. Schlafenszeit 19:30–7:00.</p>`
  return `<div class="rules">${rules
    .map(
      (r, i) => `<button class="rule" data-rule="${i}"><span class="rule-time">${esc(r.from)}–${esc(r.to)}</span>
        <span class="lbl"><b>${esc(r.label || 'Ruhezeit')}</b><small>${esc(dayRange(r.days))}${r.to <= r.from ? ' · über Mitternacht' : ''}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`,
    )
    .join('')}</div>`
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

function timeSelect(id, value) {
  const opts = TIMES.includes(value) ? TIMES : [...TIMES, value].sort()
  return `<select class="input" id="${id}">${opts.map((t) => `<option${t === value ? ' selected' : ''}>${t}</option>`).join('')}</select>`
}

// The sheet of one rule (rule = null: a new one)
function openRule(rule, page) {
  const r = rule ?? { from: '19:30', to: '07:00', label: '', days: [0, 1, 2, 3, 4, 5, 6] }
  const days = new Set(r.days)
  openSheet(
    `<h2>${rule ? 'Zeitfenster bearbeiten' : 'Neues Zeitfenster'}</h2>
     <div class="field"><label for="rule-label">Bezeichnung</label><input class="input" id="rule-label" maxlength="80" placeholder="z. B. Schlafenszeit" value="${esc(r.label)}"></div>
     <div class="rule-times"><div class="field"><label for="rule-from">Von</label>${timeSelect('rule-from', r.from)}</div>
       <div class="field"><label for="rule-to">Bis</label>${timeSelect('rule-to', r.to)}</div></div>
     <div class="field"><label>Tage</label><div class="daypick" id="rule-days">${DAY_SHORT.map((d, i) => `<button aria-pressed="${days.has(i)}" data-d="${i}" aria-label="${DAY_LONG[i]}">${d}</button>`).join('')}</div></div>
     <p class="help" id="rule-hint"></p>
     <div class="btns">${rule ? `<button class="btn danger" data-del>Löschen</button>` : ''}<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`,
    (sheet, close) => {
      const hint = () => {
        const f = sheet.querySelector('#rule-from').value
        const t = sheet.querySelector('#rule-to').value
        sheet.querySelector('#rule-hint').textContent = f === t ? 'Von und Bis dürfen nicht gleich sein.' : t < f ? 'Geht über Mitternacht bis zum nächsten Morgen.' : ''
      }
      hint()
      sheet.querySelector('#rule-from').onchange = hint
      sheet.querySelector('#rule-to').onchange = hint
      sheet.querySelector('#rule-days').onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        const d = Number(b.dataset.d)
        if (days.has(d)) days.delete(d)
        else days.add(d)
        b.setAttribute('aria-pressed', String(days.has(d)))
      }
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        close()
        await saveRule(rule, null, page)
      })
      sheet.querySelector('[data-ok]').onclick = async () => {
        const next = {
          from: sheet.querySelector('#rule-from').value,
          to: sheet.querySelector('#rule-to').value,
          label: sheet.querySelector('#rule-label').value.trim(),
          days: [...days].sort(),
        }
        if (next.from === next.to) return toast('Von und Bis dürfen nicht gleich sein', 'info')
        if (next.days.length === 0) return toast('Bitte mindestens einen Tag wählen', 'info')
        close()
        await saveRule(rule, next, page)
      }
    },
  )
}

// Replaces the windows of the old rule by the new one (null: removes it) and saves the whole schedule
async function saveRule(old, next, page) {
  const cur = caps.config?.quietHours?.schedule ?? {}
  const schedule = {}
  DAY_KEYS.forEach((d, i) => {
    const same = (w) => old && old.days.includes(i) && String(w.from ?? w.start) === old.from && String(w.to ?? w.end) === old.to && String(w.label ?? '') === old.label
    schedule[d] = (cur[d] ?? [])
      .filter((w) => !same(w))
      .map((w) => ({ from: String(w.from ?? w.start), to: String(w.to ?? w.end), ...(w.label ? { label: String(w.label) } : {}) }))
    if (next?.days.includes(i)) schedule[d].push({ from: next.from, to: next.to, ...(next.label ? { label: next.label } : {}) })
    schedule[d].sort((a, b) => a.from.localeCompare(b.from))
  })
  const ok = await saveCaps({ quietHours: { schedule } }, next ? 'Zeitfenster gespeichert' : 'Zeitfenster gelöscht')
  if (!ok) return
  caps.config.quietHours = { ...(caps.config.quietHours ?? {}), schedule }
  if (currentPage()?.id === page.id) renderPage(page, false)
}

/* Hör-Verlauf */

const listenLog = { today: null, week: null }

function historySections(page) {
  const [secToday, secWeek, secArtists, secTitles] = page.sections
  const t = listenLog.today ?? {}
  const w = listenLog.week ?? {}
  const top = t.topArtists?.[0]?.name
  const tl = (w.timeline ?? []).slice(-7)
  const noData = { type: 'note', text: 'Noch nichts gehört.' }
  const row = (r) => ({ t: r.title ?? r.name, s: r.title ? r.artist ?? '' : '', r: `${r.minutes} min · ${r.count}×` })
  return [
    { ...secToday, items: [{ type: 'big', value: `${t.totalMinutes ?? 0} min`, subtitle: t.trackCount ? `${t.trackCount} Titel${top ? ` · meistgehört: ${top}` : ''}` : 'Heute wurde noch nichts gehört.' }] },
    {
      ...secWeek,
      items: tl.length
        ? [
            { type: 'chart', vals: tl.map((d) => d.minutes), labels: tl.map((d) => DAY_SHORT[(new Date(`${d.date}T12:00`).getDay() + 6) % 7]) },
            { type: 'note', text: `Insgesamt ${w.totalMinutes ?? 0} Minuten in ${w.trackCount ?? 0} Titeln.` },
          ]
        : [noData],
    },
    { ...secArtists, items: w.topArtists?.length ? [{ type: 'rows', rows: w.topArtists.slice(0, 5).map(row) }] : [noData] },
    { ...secTitles, items: w.topTitles?.length ? [{ type: 'rows', rows: w.topTitles.slice(0, 5).map(row) }] : [noData] },
  ]
}

/* Hören: search, filters and the cover grid (library, local folders, NAS) */

const PILLS = [
  ['all', 'Alle'],
  ['audiobook', 'Hörspiele'],
  ['music', 'Musik'],
  ['other', 'Radio'],
  ['nas', 'NAS'],
]
// items: /api/data; local: category -> folders; nasTop: the selected NAS folders;
// stack: the opened folders [{ kind: 'artist'|'local'|'nas', title, path }]; level: the entries of the opened folder
const hear = { items: null, local: {}, nasTop: null, cat: 'all', q: '', stack: [], level: null, levelError: '' }

function hearSkeleton() {
  return [
    `<div class="card nav-card wide"><div class="navlist">${navRow('verlauf', 'Hör-Verlauf', 'Was heute und in den letzten 7 Tagen lief', 'hist')}</div></div>`,
    `<section class="card wide hear">
      <div class="search">${icon('search')}<input class="input" id="hear-q" type="search" placeholder="Suchen – Titel oder Interpret" autocomplete="off" value="${esc(hear.q)}"></div>
      <div class="pills" id="hear-pills" role="tablist">${PILLS.map(([id, t]) => `<button role="tab" aria-selected="${hear.cat === id}" data-cat="${id}">${t}</button>`).join('')}</div>
      <nav class="crumbs" id="hear-crumbs" hidden></nav>
      <div class="covers" id="hear-grid"><div class="loading"><p>Lade …</p></div></div>
    </section>`,
  ]
}

const itemTitle = (it) => String(it.title_override ?? it.title ?? it.artist_override ?? it.artist ?? '—')
const itemArtist = (it) => String(it.artist_override ?? it.artist ?? '')
const catOf = (it) => (it.category === 'radio' ? 'other' : it.category)

function spotifyCover(it) {
  if (it.type !== 'spotify') return ''
  const ref = it.id ? ['album', it.id] : it.playlistid ? ['playlist', it.playlistid] : it.showid ? ['show', it.showid] : it.audiobookid ? ['audiobook', it.audiobookid] : null
  return ref ? `/api/spotify/cover-for/${ref[0]}/${encodeURIComponent(ref[1])}` : ''
}
const coverOf = (it) => it.cover_override ?? it.cover ?? spotifyCover(it) ?? ''

// Spotify entries that only name an artist are not playable on their own (the box looks their albums up itself)
const playable = (it) => it && typeof it === 'object' && !it.isResume && it.category !== 'resume' && it.type !== 'library' && !(it.type === 'spotify' && !it.id && !it.playlistid && !it.showid && !it.audiobookid)

async function loadHear() {
  const [data, nas, ...local] = await Promise.all([
    api('/api/data'),
    api('/api/nas/artists'),
    ...['audiobook', 'music', 'other'].map((c) => api(`/api/library/artists?category=${c}`)),
  ])
  hear.items = Array.isArray(data.body) ? data.body.map((it, index) => ({ ...it, _index: index })) : []
  hear.nasTop = Array.isArray(nas.body) ? nas.body : []
  hear.nasError = nas.status === 503 ? 'Das NAS ist gerade nicht erreichbar.' : ''
  ;['audiobook', 'music', 'other'].forEach((c, i) => (hear.local[c] = Array.isArray(local[i].body) ? local[i].body : []))
}

// The tiles of the top level: library entries grouped by artist (like the box), local folders and NAS folders
function topTiles() {
  const cat = hear.cat
  const q = norm(hear.q.trim())
  const match = (t) => !q || norm(t).includes(q)
  const tiles = []
  if (cat !== 'nas') {
    const items = hear.items.filter((it) => playable(it) && (cat === 'all' || catOf(it) === cat))
    if (q) {
      for (const it of items) if (match(`${itemTitle(it)} ${itemArtist(it)}`)) tiles.push(entryTile(it))
    } else {
      const groups = new Map()
      for (const it of items) {
        const a = itemArtist(it) || itemTitle(it)
        if (!groups.has(a)) groups.set(a, [])
        groups.get(a).push(it)
      }
      for (const [artist, list] of groups) {
        if (list.length === 1) tiles.push(entryTile(list[0]))
        else tiles.push({ kind: 'artist', title: artist, sub: `${list.length} Einträge`, cover: list[0].artistcover ?? coverOf(list[0]), badge: badgeOf(list[0]), folder: true, path: artist })
      }
    }
    for (const c of cat === 'all' ? ['audiobook', 'music', 'other'] : [cat]) {
      for (const f of hear.local[c] ?? []) if (match(`${f.title} ${f.artist}`)) tiles.push(localTile(f))
    }
  }
  if (cat === 'all' || cat === 'nas') for (const f of hear.nasTop ?? []) if (match(`${f.title} ${f.artist}`)) tiles.push(nasTile(f))
  return tiles.sort((a, b) => a.title.localeCompare(b.title, 'de'))
}

function badgeOf(it) {
  if (it.type === 'spotify') return 'Spotify'
  if (it.type === 'radio' || it.category === 'radio') return 'Radio'
  if (it.type === 'rss') return 'Podcast'
  return ''
}
const entryTile = (it) => ({ kind: 'entry', title: itemTitle(it), sub: itemArtist(it) === itemTitle(it) ? '' : itemArtist(it), cover: coverOf(it), badge: badgeOf(it), index: it._index })
const localTile = (f) => ({ kind: 'local', title: String(f.title ?? '—'), sub: f.ownFiles ? 'Alle Titel hier' : f.artist !== f.title ? String(f.artist ?? '') : '', cover: f.cover, badge: 'SD-Karte', folder: !!f.libraryIsContainer, path: f.libraryPath })
const nasTile = (f) => ({ kind: 'nas', title: String(f.title ?? '—'), sub: f.artist !== f.title ? String(f.artist ?? '') : '', cover: f.cover, badge: 'NAS', folder: !!f.nasIsContainer, path: f.nasPath })

// The tiles of an opened folder
function levelTiles() {
  const top = hear.stack.at(-1)
  const q = norm(hear.q.trim())
  const match = (t) => !q || norm(t).includes(q)
  if (top.kind === 'artist') {
    return hear.items
      .filter((it) => playable(it) && (hear.cat === 'all' || catOf(it) === hear.cat) && (itemArtist(it) || itemTitle(it)) === top.path)
      .filter((it) => match(itemTitle(it)))
      .map(entryTile)
      .sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }))
  }
  return (hear.level ?? []).filter((f) => match(`${f.title} ${f.artist}`)).map(top.kind === 'nas' ? nasTile : localTile)
}

async function openLevel() {
  const top = hear.stack.at(-1)
  hear.level = null
  hear.levelError = ''
  drawHear()
  if (!top || top.kind === 'artist') return
  const r = await api(top.kind === 'nas' ? `/api/nas/children?path=${encodeURIComponent(top.path)}` : `/api/library/children?path=${encodeURIComponent(top.path)}`)
  if (hear.stack.at(-1) !== top) return // the user went on meanwhile
  hear.level = Array.isArray(r.body) ? r.body : []
  if (r.status === 503) hear.levelError = 'Das NAS ist gerade nicht erreichbar.'
  else if (!r.ok) hear.levelError = 'Der Ordner ließ sich nicht lesen.'
  drawHear()
}

let hearTiles = []

function drawHear() {
  const grid = $('#hear-grid')
  if (!grid) return
  const crumbs = $('#hear-crumbs')
  crumbs.hidden = hear.stack.length === 0
  crumbs.innerHTML = [{ title: PILLS.find(([id]) => id === hear.cat)[1] }, ...hear.stack]
    .map((p, i, all) => (i === all.length - 1 ? `<span aria-current="page">${esc(p.title)}</span>` : `<button data-depth="${i}">${esc(p.title)}</button><span class="sep">›</span>`))
    .join('')
  for (const b of crumbs.querySelectorAll('[data-depth]')) {
    b.onclick = () => {
      hear.stack = hear.stack.slice(0, Number(b.dataset.depth))
      hear.q = ''
      $('#hear-q').value = ''
      openLevel()
    }
  }
  if (!hear.items) return
  const top = hear.stack.at(-1)
  if (top && top.kind !== 'artist' && hear.level === null) {
    grid.innerHTML = `<div class="loading"><p>Lade …</p></div>`
    return
  }
  const err = top ? hear.levelError : hear.cat === 'nas' ? hear.nasError : ''
  hearTiles = top ? levelTiles() : topTiles()
  if (hearTiles.length === 0) {
    grid.innerHTML = `<p class="help covers-empty">${esc(err || (hear.q ? 'Nichts gefunden.' : hear.cat === 'nas' ? 'Im Admin-Bereich sind keine NAS-Ordner freigegeben.' : 'Hier ist noch nichts.'))}</p>`
    return
  }
  grid.innerHTML = hearTiles
    .map(
      (t, i) => `<button class="cover-tile" data-i="${i}" aria-label="${esc(`${t.folder ? 'Öffnen' : 'Abspielen'}: ${t.title}`)}">
        <span class="cover-img">${t.cover ? `<img src="${esc(t.cover)}" alt="" loading="lazy">` : ''}<span class="cover-ph">${icon(t.folder ? 'folder' : 'music', 28)}</span>
          ${t.badge ? `<span class="cover-badge">${esc(t.badge)}</span>` : ''}${t.folder ? `<span class="cover-folder">${icon('folder', 14)}</span>` : ''}</span>
        <b>${esc(t.title)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</button>`,
    )
    .join('')
  for (const img of grid.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of grid.querySelectorAll('.cover-tile')) b.onclick = () => onTile(hearTiles[Number(b.dataset.i)])
}

function onTile(t) {
  if (!t) return
  if (t.folder) {
    hear.stack.push({ kind: t.kind, title: t.title, path: t.path })
    hear.q = ''
    $('#hear-q').value = ''
    openLevel()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (t.kind === 'entry') return startPlay(t.title, `${API}/library/play`, { index: t.index })
  if (t.kind === 'nas') return startPlay(t.title, `${API}/library/play-nas`, { path: t.path })
  return startPlay(t.title, `${API}/library/play-local`, { path: t.path })
}

// Starts something on the box; asks first when something else is playing
async function startPlay(title, path, body) {
  const now = await api(`${API}/playback`)
  const run = async () => {
    const r = await api(path, { method: 'POST', body })
    if (!r.ok) return toast(errorText(r), 'info')
    toast(`▶ ${title}`)
    setTimeout(() => go('start'), 800)
  }
  if (now.body?.playing) {
    const cur = now.body.title || now.body.artist || 'etwas anderes'
    return openSheet(
      `<h2>Jetzt abspielen?</h2><p class="help" style="margin:0">Gerade läuft „${esc(cur)}“. Stattdessen „${esc(title)}“ spielen?</p>
       <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Jetzt abspielen</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        sheet.querySelector('[data-ok]').onclick = () => {
          close()
          run()
        }
      },
    )
  }
  return run()
}

/* the controllers: load(page) reads the box before drawing, mount(root, page) runs after it, change(key, value)
   saves a setting, act / byLabel run the buttons, sections(page) gives the building blocks with the box's values */
const CONTROLLERS = {
  spielzeit: {
    load: loadCaps,
    mount() {
      drawRing()
      drawSleep()
      every(20000, refreshPlaytime)
    },
    change(key, v) {
      switch (key) {
        case 'limitOn':
          return saveCaps({ playtimeLimit: { enabled: v } }, v ? 'Tageslimits an' : 'Tageslimits aus')
        case 'quietOn':
          return saveCaps({ quietHours: { enabled: v } }, v ? 'Ruhezeiten an' : 'Ruhezeiten aus')
        case 'limitGrace':
          return saveCaps({ playtimeLimit: { graceMode: GRACE[v] } })
        case 'quietGrace':
          return saveCaps({ quietHours: { graceMode: GRACE[v] } })
        case 'resetHour': {
          const h = Number(v)
          if (!Number.isInteger(h) || h < 0 || h > 23) {
            toast('Bitte eine volle Stunde von 0 bis 23 eintragen', 'info')
            const el = $('#k-resetHour')
            if (el) el.value = String(caps.config?.playtimeLimit?.resetHour ?? 0)
            return
          }
          return saveCaps({ playtimeLimit: { resetHour: h } }, `Neuer Tag beginnt um ${h}:00 Uhr`)
        }
      }
      const day = /^lim([0-6])$/.exec(key)
      if (day) {
        const i = Number(day[1])
        return saveCaps({ playtimeLimit: { limitsMinutes: { [DAY_KEYS[i]]: Number(v) } } }, `${DAY_LONG[i]}: ${Number(v) === 0 ? 'gesperrt' : `${v} min`}`)
      }
    },
    act: {
      bonus() {
        const m = capMinutes()
        if (m) capAction('/api/playtime/extend', m, `${m} Minuten mehr für heute`)
      },
      quiet() {
        const m = capMinutes()
        if (m) confirmSheet('Ruhe sofort', `Die Box stoppt jetzt und spielt ${m} Minuten lang nichts.`, () => capAction('/api/quiethours/now', m, `Ruhe für ${m} Minuten`))
      },
      async sleep() {
        const m = Number(state.values.get('sleepMin') ?? 60)
        const r = await api(`${API}/sleeptimer/start`, { method: 'POST', body: { minutes: m } })
        toast(r.ok ? `Schlaftimer: ${m} Minuten` : errorText(r), r.ok ? 'ok' : 'info')
        setTimeout(() => refreshPlaytime(), 1200)
      },
      async sleepoff() {
        const r = await api(`${API}/sleeptimer/stop`, { method: 'POST' })
        toast(r.ok ? (caps.sleep ? 'Schlaftimer gestoppt' : 'Es lief kein Schlaftimer') : errorText(r), r.ok ? 'ok' : 'info')
        setTimeout(() => refreshPlaytime(), 800)
      },
      sheet(arg, _label, page) {
        if (arg === 'rule-new') openRule(null, page)
      },
    },
    byLabel: {
      'Sperren aufheben'() {
        const m = capMinutes()
        if (m) capAction('/api/playtime/release', m, `Sperren für ${m} Minuten aufgehoben`)
      },
    },
  },
  verlauf: {
    async load() {
      const [today, week] = await Promise.all([api(`${API}/playlog?range=today`), api(`${API}/playlog?range=week`)])
      if (!today.ok && !week.ok) throw new Error(`playlog ${today.status}`)
      listenLog.today = today.body
      listenLog.week = week.body
    },
    sections: historySections,
  },
  hoeren: {
    async load() {
      if (!hear.items) {
        await loadHear()
        hear.loadedAt = Date.now()
      }
    },
    mount(root) {
      const q = $('#hear-q', root)
      q.addEventListener('input', () => {
        hear.q = q.value
        drawHear()
      })
      $('#hear-pills', root).onclick = (e) => {
        const b = e.target.closest('[data-cat]')
        if (!b || b.dataset.cat === hear.cat) return
        hear.cat = b.dataset.cat
        hear.stack = []
        for (const x of b.parentElement.children) x.setAttribute('aria-selected', String(x === b))
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        drawHear()
      }
      // the library may have changed since the last visit: show the known state, then read it again
      if (hear.stack.length) openLevel()
      else drawHear()
      if (Date.now() - (hear.loadedAt ?? 0) > 5000) {
        hear.loadedAt = Date.now()
        loadHear().then(() => currentPage()?.id === 'hoeren' && hear.stack.length === 0 && drawHear())
      }
    },
  },
}
for (const id of Object.keys(CONTROLLERS)) CONNECTED.add(id)

// Quiet rules: tap on a rule opens its sheet (the rules are drawn by renderItem, so wire them here)
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('#content .rule[data-rule]')
  if (!b) return
  const page = currentPage()
  openRule(quietRules()[Number(b.dataset.rule)], page)
})

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
          ctrlOf(currentPage())?.change?.(it.key, b.dataset.v, currentPage())
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
        renderPage(page, false)
        ctrlOf(page)?.change?.(key, v, page)
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
