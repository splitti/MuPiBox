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
  const back = new URLSearchParams(location.search)
  if (back.has('spotify_connected') || back.has('spotify_error')) {
    history.replaceState(null, '', `${location.pathname.replace(/\/?$/, '/')}#/spotify`)
    setTimeout(() => toast(back.has('spotify_connected') ? 'Mit Spotify verbunden' : `Spotify-Anmeldung fehlgeschlagen (${back.get('spotify_error')})`, back.has('spotify_connected') ? 'ok' : 'info'), 300)
  }
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
  closeSheet() // (a sheet belongs to the page it was opened on)
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
  const own = ctrlOf(page)?.top
  if (own) return own(page)
  switch (page.id) {
    case 'start':
      return startSkeleton()
    case 'hoeren':
      return hearSkeleton()
    case 'spielzeit':
      return [`<section class="card hero wide pt-hero" id="pt-hero"><div class="loading"><p>Lade …</p></div></section>`]
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
  if (page.id === 'hoeren' || ctrlOf(page)?.ownNav) return [] // these pages show their sub pages themselves
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
  // (also on reading: some routes of the box take the app's session only with its token, see localOrElternSession)
  if (state.csrf) headers['x-mupibox-csrf'] = state.csrf
  const r = await fetch(path, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  if (!r) return { ok: false, status: 0, body: null, text: '' }
  const text = await r.text().catch(() => '')
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* no JSON (some old endpoints answer with a plain "ok") */
  }
  return { ok: r.ok, status: r.status, body: data, text }
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

/* Bibliothek: all content (library entries and the SD card's folders), edit, delete, sync */

const CATS = [
  ['audiobook', 'Hörspiele', 'Hörbuch/Hörspiel'],
  ['music', 'Musik', 'Musik'],
  ['other', 'Sonstiges', 'Sonstiges'],
]
const catLabel = (c) => CATS.find(([id]) => id === c)?.[1] ?? ''
const catFromLabel = (label) => CATS.find(([, , long]) => long === label)?.[0] ?? 'audiobook'
const SYNC_API = '/api/spotify-sync'

// items: /api/data; local: category -> artist folders; cat / src / q: the filters
const lib = { items: null, local: {}, cat: 'all', src: 'all', q: '', sync: null }

async function loadLib() {
  const [data, sync, ...local] = await Promise.all([
    api('/api/data'),
    api(`${SYNC_API}/status`),
    ...CATS.map(([c]) => api(`/api/library/artists?category=${c}`)),
  ])
  lib.items = Array.isArray(data.body) ? data.body : []
  lib.sync = sync.ok ? sync.body : null
  CATS.forEach(([c], i) => (lib.local[c] = Array.isArray(local[i].body) ? local[i].body : []))
}

// After a change the lists of Hören are read again too
function libChanged() {
  hear.items = null
  hear.loadedAt = 0
}

function libTop() {
  return [
    `<div class="card wide lib-head"><div class="btns"><button class="btn primary" id="lib-add">${icon('plus', 18)}Hinzufügen</button>
      <button class="btn" id="lib-sync">${icon('sync', 18)}Jetzt synchronisieren</button></div><p class="help" id="lib-sync-line"></p></div>`,
    `<div class="card nav-card wide"><div class="navlist">${['verwaltet', 'spotify', 'nas', 'cover']
      .map((id) => state.pages.get(id))
      .filter(Boolean)
      .map((p) => navRow(p.id, p.title, NAV_SUB[p.id], p.icon))
      .join('')}</div></div>`,
    `<section class="card wide">
      <div class="search">${icon('search')}<input class="input" id="lib-q" type="search" placeholder="In der Bibliothek suchen" autocomplete="off" value="${esc(lib.q)}"></div>
      <div class="pills" id="lib-cat">${[['all', 'Alle'], ...CATS].map(([id, t]) => `<button aria-selected="${lib.cat === id}" data-v="${id}">${t}</button>`).join('')}</div>
      <div class="seg" id="lib-src">${[['all', 'Alle'], ['manual', 'Manuell'], ['spotify-sync', 'Sync'], ['local', 'SD-Karte']]
        .map(([id, t]) => `<button aria-pressed="${lib.src === id}" data-v="${id}">${t}</button>`)
        .join('')}</div>
      <p class="help" id="lib-count"></p>
      <div class="rows lib-list" id="lib-list"><div class="loading"><p>Lade …</p></div></div>
    </section>`,
  ]
}
const NAV_SUB = {
  verwaltet: 'Künstler-Abos und Alben aus der Suche',
  spotify: 'Smart-Sync und Spotify-Konto',
  nas: 'Ordner vom Netzwerkspeicher',
  cover: 'Eigene Bilder und Online-Cover',
}

function libRows() {
  const q = norm(lib.q.trim())
  const rows = []
  if (lib.src !== 'local') {
    for (const it of lib.items) {
      if (!it || it.isResume === true || it.category === 'resume' || it.type === 'library') continue
      const cat = it.category === 'radio' ? 'other' : it.category
      if (lib.cat !== 'all' && cat !== lib.cat) continue
      const src = it.source ?? 'manual'
      if (lib.src !== 'all' && src !== lib.src) continue
      const title = String(it.title_override ?? it.title ?? it.artist_override ?? it.artist ?? '—')
      const artist = String(it.artist_override ?? it.artist ?? '')
      if (q && !norm(`${title} ${artist}`).includes(q)) continue
      const tags = [catLabel(it.category_override ?? cat)]
      if (src === 'spotify-sync') tags.push('Sync')
      else if (badgeOf(it)) tags.push(badgeOf(it))
      if (it.type === 'spotify' && !it.id && !it.playlistid && !it.showid && !it.audiobookid && it.artistid) tags.push('Alle Folgen')
      rows.push({ kind: 'entry', item: it, title, sub: artist === title ? '' : artist, cover: it.cover_override ?? it.cover ?? it.artistcover_override ?? it.artistcover ?? spotifyCover(it), tags })
    }
  }
  if (lib.src === 'all' || lib.src === 'local') {
    for (const [c] of CATS) {
      if (lib.cat !== 'all' && lib.cat !== c) continue
      for (const f of lib.local[c] ?? []) {
        if (q && !norm(`${f.title} ${f.artist}`).includes(q)) continue
        rows.push({ kind: 'local', folder: f, title: String(f.title ?? '—'), sub: '', cover: f.cover, tags: [catLabel(c), 'SD-Karte'] })
      }
    }
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }))
}

let libShown = []

function drawLib() {
  const list = $('#lib-list')
  if (!list || !lib.items) return
  libShown = libRows()
  $('#lib-count').textContent = `${libShown.length} ${libShown.length === 1 ? 'Eintrag' : 'Einträge'}`
  if (libShown.length === 0) {
    list.innerHTML = `<p class="help covers-empty">${lib.q ? 'Nichts gefunden.' : 'Hier ist noch nichts.'}</p>`
    return
  }
  list.innerHTML = libShown
    .map(
      (r, i) => `<button class="entry lib-row" data-i="${i}"><span class="lib-thumb">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy">` : ''}${icon(r.kind === 'local' ? 'folder' : 'music', 18)}</span>
        <span class="lbl"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}<span class="tags">${r.tags.filter(Boolean).map((t) => `<span class="chip${t === 'Sync' ? ' ok' : ''}">${esc(t)}</span>`).join('')}</span></span>
        <span class="chev">${icon('chevron', 18)}</span></button>`,
    )
    .join('')
  for (const img of list.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of list.querySelectorAll('.lib-row')) {
    b.onclick = () => {
      const r = libShown[Number(b.dataset.i)]
      if (r.kind === 'local') openLocalSheet(r.folder)
      else openEntrySheet(r.item)
    }
  }
}

function drawSyncLine() {
  const el = $('#lib-sync-line')
  if (!el) return
  const s = lib.sync
  const end = s?.state?.last_sync_end
  el.textContent = !s ? '' : !s.enabled ? 'Smart-Sync ist aus (Bibliothek › Spotify).' : s.state?.current_state && s.state.current_state !== 'IDLE' ? 'Synchronisiert gerade …' : end ? `Zuletzt synchronisiert um ${hhmm(Date.parse(end))} Uhr.` : 'Noch nicht synchronisiert.'
  const btn = $('#lib-sync')
  if (btn) btn.hidden = !s?.enabled
}

// Starts a sync run and says what happens; used after every change of the managed content
async function fireSync() {
  const r = await api(`${SYNC_API}/trigger?source=webapp`, { method: 'POST' })
  const b = r.body ?? {}
  if (r.status === 202 && b.status === 'scheduled') return `Der Sync läuft in ${b.scheduledInSeconds ?? 60} s.`
  if (r.status === 202) return 'Der Sync läuft.'
  if (r.status === 409) return 'Ein Sync läuft gerade.'
  if (b.status === 'disabled') return 'Smart-Sync ist aus – erst in Bibliothek › Spotify einschalten.'
  return 'Beim nächsten Sync kommt es auf die Box.'
}

// /api/edit, /api/delete and /api/add answer with the text "ok"; "locked" and "error" come with status 200 too
function libWriteOk(r) {
  if (r.ok && r.text.trim() === 'ok') return true
  toast(r.status === 409 ? 'Die Bibliothek hat sich inzwischen geändert – bitte noch einmal.' : r.text.trim() === 'locked' ? 'Die Bibliothek wird gerade geschrieben – bitte gleich noch einmal.' : 'Das hat nicht geklappt', 'info')
  return false
}

async function libReload() {
  libChanged()
  await loadLib()
  if (currentPage()?.id === 'bibliothek') drawLib()
}

function catSelect(id, value, withSync) {
  const opts = [...(withSync ? [['', 'wie vom Sync']] : []), ...CATS.map(([c, , long]) => [c, long])]
  return `<select class="input" id="${id}">${opts.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
}

// The sheet of a library entry: manual ones change their fields, synced ones get overrides (the sync keeps its own)
function openEntrySheet(item) {
  const isSync = (item.source ?? 'manual') === 'spotify-sync'
  const fields = [
    ['artist', 'Interpret'],
    ['title', 'Titel'],
    ['cover', 'Cover (Bild-URL)'],
    ['artistcover', 'Interpret-Cover (Bild-URL)'],
  ]
  const val = (k) => item[`${k}_override`] ?? (isSync ? '' : item[k] ?? '')
  openSheet(
    `<h2>${esc(item.title_override ?? item.title ?? item.artist_override ?? item.artist ?? 'Eintrag')}</h2>
     <p class="help" style="margin:0">${isSync ? 'Kommt vom Spotify-Sync. Was du hier einträgst, gilt statt der Werte von Spotify; leer = der Wert von Spotify.' : 'Von Hand hinzugefügt.'}</p>
     ${fields
       .map(([k, l]) => `<div class="field"><label for="e-${k}">${l}</label><input class="input" id="e-${k}" value="${esc(val(k))}" placeholder="${esc(isSync ? item[k] ?? '' : '')}" autocomplete="off"></div>`)
       .join('')}
     <div class="field"><label for="e-cat">Kategorie</label>${catSelect('e-cat', item.category_override ?? (isSync ? '' : item.category === 'radio' ? 'other' : item.category), isSync)}</div>
     ${isSync ? `<p class="help" style="margin:0">Entfernen geht über Bibliothek › Verwaltete Inhalte oder die Spotify-Playlist.</p>` : ''}
     <div class="btns">${isSync ? '' : `<button class="btn danger" data-del>Löschen</button>`}<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-ok]').onclick = async () => {
        const updated = { ...item }
        for (const [k] of fields) {
          const v = sheet.querySelector(`#e-${k}`).value.trim()
          const key = isSync ? `${k}_override` : k
          if (v) updated[key] = v
          else delete updated[key]
        }
        const cat = sheet.querySelector('#e-cat').value
        if (isSync) {
          if (cat) updated.category_override = cat
          else delete updated.category_override
        } else if (cat) updated.category = cat
        const r = await api('/api/edit', { method: 'POST', body: { index: item.index, data: updated, original: item } })
        if (!libWriteOk(r)) return
        close()
        toast('Gespeichert')
        libReload()
      }
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        close()
        confirmSheet('Löschen', `„${item.title ?? item.artist ?? 'Eintrag'}“ aus der Bibliothek löschen?`, async () => {
          const r = await api('/api/delete', { method: 'POST', body: { index: item.index, original: item } })
          if (!libWriteOk(r)) return
          toast('Gelöscht')
          libReload()
        })
      })
    },
  )
}

// A folder of the SD card: its albums, each one or the whole folder can be deleted
async function openLocalSheet(folder) {
  const r = folder.libraryIsContainer ? await api(`/api/library/children?path=${encodeURIComponent(folder.libraryPath)}`) : { body: [] }
  const albums = (Array.isArray(r.body) ? r.body : []).filter((a) => !a.ownFiles)
  openSheet(
    `<h2>${esc(folder.title)}</h2><p class="help" style="margin:0">Ordner auf der SD-Karte · ${esc(catLabel(folder.category))}${albums.length ? ` · ${albums.length} ${albums.length === 1 ? 'Album' : 'Alben'}` : ''}</p>
     ${albums.length ? `<div class="rows">${albums.map((a, i) => `<div class="entry"><span class="lbl"><b>${esc(a.title)}</b></span><button class="btn danger sm" data-a="${i}">Löschen</button></div>`).join('')}</div>` : ''}
     <div class="btns"><button class="btn danger" data-all>${albums.length ? 'Ganzen Ordner löschen' : 'Löschen'}</button><button class="btn" data-close>Schließen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      const del = (path, name, what) => {
        close()
        confirmSheet('Löschen', `${what} „${name}“ wird mit allen Dateien von der SD-Karte gelöscht. Das lässt sich nicht rückgängig machen.`, async () => {
          const d = await api(`${API}/local/delete`, { method: 'POST', body: { path } })
          if (!d.ok) return toast(errorText(d), 'info')
          toast('Gelöscht')
          libReload()
        })
      }
      sheet.querySelector('[data-all]').onclick = () => del(folder.libraryPath, folder.title, albums.length ? 'Der Ordner' : 'Das Album')
      for (const b of sheet.querySelectorAll('[data-a]')) {
        const a = albums[Number(b.dataset.a)]
        b.onclick = () => del(a.libraryPath, a.title, 'Das Album')
      }
    },
  )
}

/* Verwaltete Inhalte: the artist subscriptions and albums added from the search */

const managed = { subs: null }

function managedTop() {
  const s = managed.subs ?? {}
  const artists = s.artists ?? []
  const albums = s.explicit_albums ?? []
  const range = (a) => (a.range_from || a.range_to ? `Folgen ${a.range_from ?? 1}–${a.range_to ?? '…'}` : 'alle Folgen')
  return [
    `<p class="page-intro">Über die Suche hinzugefügte Künstler-Abos und Alben. Beim Künstler den Bereich (Folge von–bis) eingrenzen und einzelne Alben aus- oder einschließen.</p>`,
    `<section class="card"><h2>Künstler-Abos</h2>${
      artists.length
        ? `<div class="rows">${artists
            .map((a, i) => `<button class="entry lib-row" data-sub="${i}"><span class="avatar">${esc(initials(a.name || a.id))}</span><span class="lbl"><b>${esc(a.name || a.id)}</b><small>${esc(range(a))} · ${esc(catLabel(a.category))}${a.exclude_album_ids?.length ? ` · ${a.exclude_album_ids.length} ausgeschlossen` : ''}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`)
            .join('')}</div>`
        : `<p class="help" style="margin:0">Noch keine. Über „Auf Spotify suchen“ einen Künstler mit ＋ abonnieren.</p>`
    }</section>`,
    `<section class="card"><h2>Einzelne Alben</h2>${
      albums.length
        ? `<div class="rows">${albums
            .map((a, i) => `<div class="entry"><span class="avatar">${esc(initials(a.name || a.id))}</span><span class="lbl"><b>${esc(a.name || a.id)}</b><small>${esc(catLabel(a.category))}</small></span><button class="btn danger sm" data-album="${i}">Entfernen</button></div>`)
            .join('')}</div>`
        : `<p class="help" style="margin:0">Noch keine.</p>`
    }</section>`,
  ]
}

async function loadManaged() {
  const r = await api(`${API}/library/subscriptions`)
  if (!r.ok) throw new Error(`subscriptions ${r.status}`)
  managed.subs = r.body ?? {}
}

async function managedDone(text, page) {
  const sync = await fireSync()
  toast(`${text} ${sync}`)
  libChanged()
  if (currentPage()?.id === page.id) renderPage(page)
}

function openSubSheet(a, page) {
  openSheet(
    `<h2>${esc(a.name || a.id)}</h2><p class="help" style="margin:0">„Folge“ ist die Position nach Erscheinungsdatum (1 = die älteste). Leer = offen.</p>
     <div class="rule-times"><div class="field"><label for="s-from">Folge von</label><input class="input" id="s-from" type="number" min="1" value="${esc(a.range_from ?? '')}"></div>
       <div class="field"><label for="s-to">Folge bis</label><input class="input" id="s-to" type="number" min="1" value="${esc(a.range_to ?? '')}"></div></div>
     <div class="btns"><button class="btn primary" data-range>Bereich übernehmen</button><button class="btn" data-albums>Alben ein-/ausschließen</button></div>
     <div id="s-albums"></div>
     <div class="btns"><button class="btn danger" data-unsub>Abo entfernen</button><button class="btn" data-close>Schließen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-range]').onclick = async () => {
        const num = (id) => {
          const v = sheet.querySelector(id).value.trim()
          return v === '' ? undefined : Math.floor(Number(v))
        }
        const range_from = num('#s-from')
        const range_to = num('#s-to')
        if ([range_from, range_to].some((v) => v !== undefined && !(v >= 1)) || (range_from && range_to && range_from > range_to)) return toast('Bitte einen gültigen Bereich eintragen', 'info')
        const r = await api(`${API}/library/subscribe-artist`, { method: 'POST', body: { artistId: a.id, name: a.name, category: a.category, range_from, range_to } })
        if (!r.ok) return toast(r.body?.error ?? 'Das hat nicht geklappt', 'info')
        close()
        managedDone('Bereich übernommen.', page)
      }
      sheet.querySelector('[data-albums]').onclick = () => loadSubAlbums(a, sheet.querySelector('#s-albums'))
      sheet.querySelector('[data-unsub]').onclick = () => {
        close()
        confirmSheet('Abo entfernen', `„${a.name || a.id}“ abbestellen? Der nächste Sync nimmt die Alben von der Box.`, async () => {
          const r = await api(`${API}/library/unsubscribe-artist`, { method: 'POST', body: { artistId: a.id } })
          if (!r.ok) return toast('Das hat nicht geklappt', 'info')
          managedDone('Abo entfernt.', page)
        })
      }
    },
  )
}

async function loadSubAlbums(a, box) {
  box.innerHTML = `<p class="help">Lade die Alben von Spotify …</p>`
  const r = await api(`${SYNC_API}/artist-albums?artistId=${encodeURIComponent(a.id)}`)
  if (!r.ok) {
    box.innerHTML = `<p class="help">Die Alben ließen sich nicht laden${r.status === 409 ? ' (Spotify ist nicht verbunden)' : ''}.</p>`
    return
  }
  const albums = r.body?.albums ?? []
  if (!albums.length) {
    box.innerHTML = `<p class="help">Keine Alben gefunden.</p>`
    return
  }
  box.innerHTML = `<div class="rows">${albums
    .map(
      (al, i) => `<div class="entry${al.inRange ? '' : ' out'}"><span class="pos">${al.position}</span><span class="lib-thumb">${al.cover ? `<img src="${esc(al.cover)}" alt="" loading="lazy">` : ''}</span>
        <span class="lbl"><b>${esc(al.name || al.id)}</b>${al.inRange ? '' : '<small>außerhalb des Bereichs</small>'}</span>
        <label class="switch"><input type="checkbox" data-al="${i}" ${al.inRange && !al.excluded ? 'checked' : ''} ${al.inRange ? '' : 'disabled'} aria-label="${esc(al.name)} auf der Box"><span></span></label></div>`,
    )
    .join('')}</div>`
  for (const cb of box.querySelectorAll('[data-al]')) {
    cb.onchange = async () => {
      const al = albums[Number(cb.dataset.al)]
      const r2 = await api(`${API}/library/artist-exclude`, { method: 'POST', body: { artistId: a.id, albumId: al.id, excluded: !cb.checked } })
      if (!r2.ok) {
        cb.checked = !cb.checked
        return toast('Das hat nicht geklappt', 'info')
      }
      const sync = await fireSync()
      toast(`${cb.checked ? 'Wieder dabei' : 'Ausgeschlossen'}: ${al.name}. ${sync}`)
      libChanged()
    }
  }
}

/* Auf Spotify suchen */

const search = { q: '', type: 'Alle', cat: 'audiobook', result: null, busy: false }

function searchTop() {
  return [
    `<section class="card wide">
      <div class="search">${icon('search')}<input class="input" id="s-q" type="search" placeholder="Künstler, Album oder Titel …" autocomplete="off" value="${esc(search.q)}" enterkeyhint="search"></div>
      <div class="seg" id="s-type">${['Alle', 'Künstler', 'Alben', 'Titel'].map((t) => `<button aria-pressed="${search.type === t}" data-v="${t}">${t}</button>`).join('')}</div>
      <div class="field"><label for="s-cat">Hinzufügen als</label>${catSelect('s-cat', search.cat, false)}</div>
      <div class="btns"><button class="btn primary" id="s-go">Suchen</button></div>
    </section>`,
    `<div id="s-results" class="wide-stack"></div>`,
  ]
}

async function doSpotifySearch() {
  const q = search.q.trim()
  if (q.length < 2) return toast('Bitte mindestens 2 Zeichen eingeben', 'info')
  const types = { Alle: 'artist,album,track', Künstler: 'artist', Alben: 'album', Titel: 'track' }[search.type]
  const box = $('#s-results')
  box.innerHTML = `<div class="loading"><p>Suche …</p></div>`
  const r = await api(`/api/spotify/search?q=${encodeURIComponent(q)}&types=${types}&limit=8`)
  if (!r.ok) {
    box.innerHTML = `<p class="help">Die Suche ging nicht${r.body?.error ? ` (${esc(r.body.error)})` : ''}.</p>`
    return
  }
  search.result = r.body ?? {}
  drawSearch()
}

function drawSearch() {
  const box = $('#s-results')
  const d = search.result
  if (!box || !d) return
  const img = (images) => (Array.isArray(images) && images.length ? images[1]?.url || images[0]?.url : '')
  const names = (arr) => (arr ?? []).map((x) => x?.name).filter(Boolean).join(', ')
  const groups = [
    ['Künstler', (d.artists ?? []).filter((a) => a.id).map((a) => ({ kind: 'artist', id: a.id, name: a.name, t: a.name, s: 'Künstler – alle Folgen abonnieren', img: img(a.images) }))],
    ['Alben', (d.albums ?? []).filter((a) => a.id).map((a) => ({ kind: 'album', id: a.id, name: a.name, t: a.name, s: names(a.artists), img: img(a.images) }))],
    ['Titel', (d.tracks ?? []).filter((t) => t.album?.id).map((t) => ({ kind: 'album', id: t.album.id, name: t.album.name ?? t.name, t: t.name, s: `${names(t.artists)} · ${t.album?.name ?? ''}`, img: img(t.album?.images) }))],
  ].filter(([, rows]) => rows.length)
  search.rows = groups.flatMap(([, rows]) => rows)
  let n = 0
  box.innerHTML = groups.length
    ? groups
        .map(
          ([title, rows]) => `<section class="card"><h2>${title}</h2><div class="rows">${rows
            .map((r) => `<div class="entry"><span class="lib-thumb">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : ''}${icon('music', 18)}</span><span class="lbl"><b>${esc(r.t)}</b><small>${esc(r.s)}</small></span>
              <button class="icon-btn soft" data-r="${n++}" aria-label="${esc(`${r.kind === 'artist' ? 'Abonnieren' : 'Hinzufügen'}: ${r.t}`)}">${icon('plus', 18)}</button></div>`)
            .join('')}</div>${title === 'Titel' ? '<p class="help" style="margin:0">＋ fügt das ganze Album des Titels hinzu.</p>' : ''}</section>`,
        )
        .join('')
    : `<p class="help">Nichts gefunden.</p>`
  for (const b of box.querySelectorAll('[data-r]')) b.onclick = () => addFromSearch(search.rows[Number(b.dataset.r)], b)
}

async function addFromSearch(r, btn) {
  const run = async () => {
    btn.disabled = true
    const res =
      r.kind === 'artist'
        ? await api(`${API}/library/subscribe-artist`, { method: 'POST', body: { artistId: r.id, name: r.name, category: search.cat } })
        : await api(`${API}/library/add-album`, { method: 'POST', body: { albumId: r.id, category: search.cat, name: r.name } })
    if (!res.ok) {
      btn.disabled = false
      return toast(res.body?.error ?? 'Das hat nicht geklappt', 'info')
    }
    btn.innerHTML = icon('check', 18)
    const sync = await fireSync()
    toast(`${r.kind === 'artist' ? 'Abonniert' : 'Hinzugefügt'}: ${r.name}. ${sync}`)
    libChanged()
  }
  if (r.kind === 'artist') {
    return openSheet(
      `<h2>${esc(r.name)} abonnieren?</h2><p class="help" style="margin:0">Alle Folgen kommen als ${esc(catLabel(search.cat))} auf die Box, neue später von selbst. Den Bereich kannst du danach unter „Verwaltete Inhalte“ eingrenzen.</p>
       <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Abonnieren</button></div>`,
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

/* Link einfügen (Spotify-Link, Radiosender, Podcast) */

function spotifyIdFrom(url, kind) {
  const m = new RegExp(`${kind}/([A-Za-z0-9]+)`).exec(url)
  return m ? m[1] : null
}

async function addLink(page) {
  const type = state.values.get('lType') ?? 'Spotify-Link'
  const url = String(state.values.get('lUrl') ?? '').trim()
  const label = String(state.values.get('lLabel') ?? '').trim()
  const title = String(state.values.get('lTitle') ?? '').trim()
  const category = catFromLabel(state.values.get('lCat') ?? 'Hörbuch/Hörspiel')
  if (!url) return toast('Bitte eine URL eintragen', 'info')
  const body = { category, source: 'manual' }
  if (type === 'Spotify-Link') {
    if (!url.startsWith('https://open.spotify.com/')) return toast('Spotify-Links beginnen mit https://open.spotify.com/', 'info')
    const kinds = [['playlist', 'playlistid'], ['artist', 'artistid'], ['album', 'id'], ['show', 'showid'], ['audiobook', 'audiobookid']]
    const hit = kinds.map(([k, field]) => [field, spotifyIdFrom(url, k)]).find(([, id]) => id)
    if (!hit) return toast('Diese Art von Spotify-Link kennt die Box nicht', 'info')
    Object.assign(body, { type: 'spotify', spotify_url: url, [hit[0]]: hit[1] })
    if (label) body.artist = label
  } else {
    if (!/^https?:\/\//.test(url)) return toast('Die URL muss mit http:// oder https:// beginnen', 'info')
    // (as the box's own add page: the player takes the streams over http)
    const id = url.startsWith('https://') ? url.replace('https://', 'http://') : url
    if (type === 'Radio-Stream') Object.assign(body, { type: 'radio', id, artist: label || 'Radio', title: title || 'Stream' })
    else Object.assign(body, { type: 'rss', id, artist: label || 'Podcast' })
  }
  const r = await api('/api/add', { method: 'POST', body })
  if (!libWriteOk(r)) return
  for (const k of ['lUrl', 'lLabel', 'lTitle']) state.values.delete(k)
  toast('Hinzugefügt')
  libChanged()
  lib.items = null
  go('bibliothek')
}

/* Vom Gerät hochladen */

const UP_AUDIO = /\.(mp3|flac|wav|wma|ogg|m4a)$/i
const UP_IMAGE = /\.(jpe?g|jfif|png|webp)$/i
// items: {file, top, sub} - top is the chosen folder's name ('' for single files), sub the path below it
const up = { cat: 'audiobook', artist: '', album: '', items: [], cover: null, skipped: 0, free: null, reserve: 0, running: false, xhr: null, cancelled: false, artists: [], albums: [] }

function formatBytes(n) {
  if (!Number.isFinite(n)) return '–'
  const gb = n / 1024 ** 3
  return gb >= 1 ? `${gb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB` : `${Math.round(n / 1024 ** 2)} MB`
}

function uploadTop() {
  return [
    `<section class="card"><h2>Wohin?</h2><p class="help">Titel oder ganze Ordner werden auf die SD-Karte kopiert und erscheinen danach von selbst auf dem Display.</p>
      <div class="field"><label>Kategorie</label><div class="seg" id="u-cat">${CATS.map(([c, t]) => `<button aria-pressed="${up.cat === c}" data-v="${c}">${t}</button>`).join('')}</div></div>
      <div class="field"><label for="u-artist">Interpret</label><input class="input" id="u-artist" list="u-artists" placeholder="z. B. Benjamin Blümchen" autocomplete="off" value="${esc(up.artist)}"><datalist id="u-artists"></datalist></div>
      <div class="field"><label for="u-album">Album</label><input class="input" id="u-album" list="u-albums" placeholder="z. B. Folge 1 (leer = direkt beim Interpreten)" autocomplete="off" value="${esc(up.album)}"><datalist id="u-albums"></datalist></div>
      <p class="help" id="u-where" style="margin:0"></p></section>`,
    `<section class="card"><h2>Dateien</h2>
      <div class="btns"><button class="btn" id="u-files">${icon('music', 18)}Titel wählen</button><button class="btn" id="u-folder">${icon('folder', 18)}Ordner wählen</button><button class="btn" id="u-coverbtn">${icon('image', 18)}Cover wählen</button></div>
      <input type="file" id="u-in-files" multiple accept="audio/*,.mp3,.flac,.wav,.wma,.ogg,.m4a,image/*" hidden>
      <input type="file" id="u-in-folder" webkitdirectory multiple hidden>
      <input type="file" id="u-in-cover" accept="image/*,.jpg,.jpeg,.jfif,.png,.webp" hidden>
      <div class="drop" id="u-drop">Oder Dateien und Ordner hierher ziehen.</div>
      <p class="help" id="u-summary" style="margin:0"></p>
      <ul class="u-list" id="u-list"></ul>
      <div class="bar" id="u-progress" hidden><div class="track"><i id="u-fill" style="width:0%"></i></div><small id="u-ptext"></small></div>
      <dl class="kv"><div><dt>Frei auf der SD-Karte</dt><dd id="u-free">–</dd></div></dl>
      <div class="btns"><button class="btn" id="u-clear">Auswahl leeren</button><button class="btn danger" id="u-cancel" hidden>Abbrechen</button><button class="btn primary" id="u-start">${icon('up', 18)}Hochladen</button></div>
    </section>`,
  ]
}

async function loadUploadFolders(withArtist) {
  const q = new URLSearchParams({ category: up.cat })
  if (withArtist) {
    if (!up.artist.trim()) {
      up.albums = []
      return drawUpload()
    }
    q.set('artist', up.artist.trim())
  }
  const r = await api(`${API}/local/folders?${q}`)
  if (!r.ok) return
  if (withArtist) up.albums = r.body?.folders ?? []
  else up.artists = r.body?.folders ?? []
  if (Number.isFinite(r.body?.free)) {
    up.free = r.body.free
    up.reserve = r.body.reserve ?? 0
  }
  drawUpload()
}

const upTotal = () => up.items.reduce((s, it) => s + it.file.size, 0) + (up.cover?.size ?? 0)

// With more than one folder (or no album given) each keeps its own folder, so several albums land side by side
function upPathOf(item) {
  const tops = new Set(up.items.map((it) => it.top).filter(Boolean))
  return item.top && (tops.size > 1 || up.album.trim() === '') ? `${item.top}/${item.sub}` : item.sub
}

function drawUpload() {
  const where = $('#u-where')
  if (!where) return
  const fill = (id, names) => {
    const l = $(id)
    if (l) l.replaceChildren(...names.map((n) => Object.assign(document.createElement('option'), { value: n })))
  }
  fill('#u-artists', up.artists)
  fill('#u-albums', up.albums)
  const artist = up.artist.trim()
  where.textContent = artist ? `Ziel: ${[catLabel(up.cat), artist, up.album.trim()].filter(Boolean).join(' › ')}` : 'Bitte einen Interpreten eintragen.'
  const n = up.items.length
  const total = upTotal()
  let summary = n === 0 && !up.cover ? 'Noch nichts ausgewählt.' : `${n} ${n === 1 ? 'Datei' : 'Dateien'} · ${formatBytes(total)}`
  if (up.cover) summary += ' · mit Cover'
  if (up.skipped) summary += ` · ${up.skipped} übersprungen (kein Audio/Bild)`
  $('#u-summary').textContent = summary
  const items = up.items.slice(0, 50).map((it) => `<li>${esc(upPathOf(it))}</li>`)
  if (n > 50) items.push(`<li class="help">… und ${n - 50} weitere</li>`)
  $('#u-list').innerHTML = items.join('')
  const room = up.free === null ? null : up.free - up.reserve
  $('#u-free').textContent = room === null ? '–' : formatBytes(Math.max(0, room))
  const tooBig = room !== null && total > room
  $('#u-start').disabled = up.running || !artist || (n === 0 && !up.cover) || tooBig
  $('#u-start').textContent = tooBig ? 'Zu wenig Platz' : 'Hochladen'
  for (const id of ['#u-files', '#u-folder', '#u-coverbtn', '#u-clear', '#u-artist', '#u-album']) $(id).disabled = up.running
  for (const b of $('#u-cat').children) b.disabled = up.running
  $('#u-cancel').hidden = !up.running
}

function addUploadItems(entries) {
  for (const { file, top, sub } of entries) {
    if (file.name.startsWith('.')) continue
    if (!UP_AUDIO.test(file.name) && !UP_IMAGE.test(file.name)) {
      up.skipped++
      continue
    }
    const key = `${top}/${sub}`
    up.items = up.items.filter((it) => `${it.top}/${it.sub}` !== key)
    up.items.push({ file, top, sub })
  }
  up.items.sort((a, b) => `${a.top}/${a.sub}`.localeCompare(`${b.top}/${b.sub}`, undefined, { numeric: true }))
  // one folder chosen and no album yet: the folder's name is the album's
  const tops = new Set(up.items.map((it) => it.top).filter(Boolean))
  if (tops.size === 1 && up.album.trim() === '') {
    up.album = [...tops][0]
    $('#u-album').value = up.album
  }
  drawUpload()
}

async function droppedEntries(dataTransfer) {
  const out = []
  const readDir = (dir) =>
    new Promise((resolve) => {
      const reader = dir.createReader()
      const all = []
      const next = () => reader.readEntries((batch) => (batch.length ? (all.push(...batch), next()) : resolve(all)), () => resolve(all))
      next()
    })
  const fileOf = (entry) => new Promise((resolve) => entry.file(resolve, () => resolve(null)))
  const walk = async (entry, top, prefix) => {
    if (entry.isFile) {
      const file = await fileOf(entry)
      if (file) out.push({ file, top, sub: prefix + file.name })
    } else if (entry.isDirectory) {
      for (const child of await readDir(entry)) await walk(child, top, `${prefix}${entry.name}/`)
    }
  }
  const roots = Array.from(dataTransfer.items ?? []).map((item) => item.webkitGetAsEntry?.()).filter(Boolean)
  if (roots.length === 0) return Array.from(dataTransfer.files ?? []).map((file) => ({ file, top: '', sub: file.name }))
  for (const root of roots) {
    if (root.isDirectory) for (const child of await readDir(root)) await walk(child, root.name, '')
    else await walk(root, '', '')
  }
  return out
}

function uploadOne(path, file, onProgress) {
  return new Promise((resolve) => {
    const q = new URLSearchParams({ category: up.cat, artist: up.artist.trim(), album: up.album.trim(), path })
    const xhr = new XMLHttpRequest()
    up.xhr = xhr
    xhr.open('PUT', `${API}/local/upload?${q}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('x-mupibox-csrf', state.csrf)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => resolve(xhr.status)
    xhr.onerror = () => resolve(0)
    xhr.onabort = () => resolve(-1)
    xhr.send(file)
  })
}

async function startUpload() {
  if (up.running) return
  const jobs = up.items.map((it) => ({ path: upPathOf(it), file: it.file }))
  if (up.cover) {
    const ext = (up.cover.name.match(/\.[^.]+$/)?.[0] ?? '.jpg').toLowerCase()
    // the cover of the album (or of the artist, without an album); it is taken before any other picture there
    jobs.unshift({ path: `cover${ext}`, file: up.cover })
  }
  if (!up.artist.trim() || jobs.length === 0) return
  up.running = true
  up.cancelled = false
  drawUpload()
  $('#u-progress').hidden = false
  const total = jobs.reduce((s, j) => s + j.file.size, 0) || 1
  let done = 0
  let ok = 0
  let failed = 0
  let stopWith = ''
  for (const [i, job] of jobs.entries()) {
    if (up.cancelled) break
    const status = await uploadOne(job.path, job.file, (loaded) => {
      const pct = Math.min(100, ((done + loaded) / total) * 100)
      $('#u-fill').style.width = `${pct.toFixed(1)}%`
      $('#u-ptext').textContent = `${i + 1} von ${jobs.length}: ${job.path} · ${Math.round(pct)} %`
    })
    done += job.file.size
    if (status === 200) ok++
    else if (status === -1) break
    else if (status === 401 || status === 403) stopWith = 'Die Anmeldung ist abgelaufen – bitte neu anmelden.'
    else if (status === 507) stopWith = 'Auf der SD-Karte ist nicht mehr genug Platz.'
    else failed++
    if (stopWith) break
  }
  up.running = false
  up.xhr = null
  $('#u-progress').hidden = true
  $('#u-fill').style.width = '0%'
  if (ok > 0) {
    up.items = []
    up.cover = null
    up.skipped = 0
    libChanged()
    lib.items = null
  }
  const parts = []
  if (ok > 0) parts.push(`${ok} ${ok === 1 ? 'Datei' : 'Dateien'} hochgeladen – gleich auf dem Display.`)
  if (up.cancelled) parts.push('Abgebrochen.')
  if (failed > 0) parts.push(`${failed} fehlgeschlagen.`)
  if (stopWith) parts.push(stopWith)
  toast(parts.join(' ') || 'Nichts hochgeladen', failed || stopWith || !ok ? 'info' : 'ok')
  loadUploadFolders(false)
  loadUploadFolders(true)
}

function mountUpload(root) {
  const pick = (btn, input) => ($(btn, root).onclick = () => $(input, root).click())
  pick('#u-files', '#u-in-files')
  pick('#u-folder', '#u-in-folder')
  pick('#u-coverbtn', '#u-in-cover')
  $('#u-in-files', root).onchange = (e) => {
    addUploadItems(Array.from(e.target.files ?? []).map((file) => ({ file, top: '', sub: file.name })))
    e.target.value = ''
  }
  $('#u-in-folder', root).onchange = (e) => {
    addUploadItems(
      Array.from(e.target.files ?? []).map((file) => {
        const parts = (file.webkitRelativePath || file.name).split('/')
        return parts.length > 1 ? { file, top: parts[0], sub: parts.slice(1).join('/') } : { file, top: '', sub: file.name }
      }),
    )
    e.target.value = ''
  }
  $('#u-in-cover', root).onchange = (e) => {
    const file = e.target.files?.[0]
    if (file && UP_IMAGE.test(file.name)) up.cover = file
    e.target.value = ''
    drawUpload()
  }
  // a folder dialog is not offered everywhere (e.g. iPhone): the button goes then
  if (!('webkitdirectory' in $('#u-in-folder', root))) $('#u-folder', root).hidden = true
  const drop = $('#u-drop', root)
  drop.ondragover = (e) => {
    e.preventDefault()
    drop.classList.add('over')
  }
  drop.ondragleave = () => drop.classList.remove('over')
  drop.ondrop = async (e) => {
    e.preventDefault()
    drop.classList.remove('over')
    if (!up.running) addUploadItems(await droppedEntries(e.dataTransfer))
  }
  $('#u-cat', root).onclick = (e) => {
    const b = e.target.closest('button')
    if (!b || up.running) return
    up.cat = b.dataset.v
    for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
    loadUploadFolders(false)
    loadUploadFolders(true)
  }
  let timer = null
  $('#u-artist', root).oninput = (e) => {
    up.artist = e.target.value
    drawUpload()
    clearTimeout(timer)
    timer = setTimeout(() => loadUploadFolders(true), 300)
  }
  $('#u-album', root).oninput = (e) => {
    up.album = e.target.value
    drawUpload()
  }
  $('#u-clear', root).onclick = () => {
    up.items = []
    up.cover = null
    up.skipped = 0
    drawUpload()
  }
  $('#u-cancel', root).onclick = () => {
    up.cancelled = true
    up.xhr?.abort()
  }
  $('#u-start', root).onclick = startUpload
  drawUpload()
  loadUploadFolders(false)
  loadUploadFolders(true)
}

// a running upload keeps going when the page is left; leaving the app asks first
window.addEventListener('beforeunload', (e) => {
  if (up.running) e.preventDefault()
})

/* Spotify: Smart-Sync (playlists land on the box by themselves) and the player's access */

const spot = { status: null, access: null }

function relTime(iso) {
  const t = Date.parse(iso ?? '')
  if (!t) return '–'
  const min = Math.round((t - Date.now()) / 60000)
  if (Math.abs(min) < 1) return 'gerade eben'
  if (min < 0) return -min < 60 ? `vor ${-min} min` : -min < 1440 ? `vor ${Math.round(-min / 60)} h` : `am ${new Date(t).toLocaleDateString('de-DE')}`
  return min < 60 ? `in ${min} min` : `in ${Math.round(min / 60)} h`
}

async function loadSpotify() {
  const [status, access] = await Promise.all([api(`${SYNC_API}/status`), api(`${API}/spotify-access`)])
  if (!status.ok && !access.ok) throw new Error(`spotify ${status.status}`)
  spot.status = status.ok ? status.body : null
  spot.access = access.ok ? access.body : null
}

// Starts the Spotify login; Spotify comes back to /app (see boot)
async function connectSpotify() {
  const r = await api(`${API}/spotify-oauth/init?return=${encodeURIComponent('/app')}`)
  if (r.ok && r.body?.authorize_url) {
    location.href = r.body.authorize_url
    return
  }
  if (r.body?.error === 'no_client_id') {
    toast('Erst die Client ID eintragen (Assistent, Schritt 3)', 'info')
    return go('wizard')
  }
  toast('Die Anmeldung ließ sich nicht starten', 'info')
}

function spotifyTop() {
  const s = spot.status ?? {}
  const a = spot.access ?? {}
  const st = s.state ?? {}
  const tok = s.token ?? {}
  const connection = !tok.configured ? ['warn', 'Nicht eingerichtet'] : !tok.scopes_ok ? ['warn', 'Bitte neu anmelden (fehlende Rechte)'] : ['ok', 'Verbunden']
  const last = st.last_sync_status === 'COMPLETED' ? `+${st.additions_count ?? 0} neu · ${st.updates_count ?? 0} geändert · ${st.removals_count ?? 0} entfernt` : st.last_sync_status ?? '–'
  const running = st.current_state && st.current_state !== 'IDLE' && st.current_state !== 'COMPLETED'
  const playlists = st.playlists_seen ?? []
  const conflicts = st.conflicts ?? []
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
  return [
    `<p class="page-intro">Oben Smart-Sync (Playlists landen automatisch auf der Box), darunter der Zugang, mit dem der Player Spotify abspielt.</p>`,
    `<section class="card"><h2>Smart-Sync</h2><p class="help">Playlists, deren Name mit dem Playlist-Präfix beginnt, landen automatisch auf der Box.</p>
      <div class="chips"><span class="chip ${connection[0]}">${esc(connection[1])}</span><span class="chip${s.enabled ? ' ok' : ''}">${s.enabled ? 'Sync an' : 'Sync aus'}</span></div>
      ${kv([
        ['Letzter Sync', running ? 'läuft gerade …' : relTime(st.last_sync_end)],
        ['Ergebnis', last],
        ['Nächster Sync', s.enabled ? relTime(st.next_scheduled_sync) : '–'],
        ['Playlist-Präfix', s.playlist_prefix ?? '–'],
      ])}
      <div class="btns">${s.enabled ? `<button class="btn primary" data-sp="sync">${icon('sync', 18)}Jetzt synchronisieren</button>` : ''}
        ${tok.configured && tok.scopes_ok ? `<button class="btn" data-sp="toggle">${s.enabled ? 'Smart-Sync ausschalten' : 'Smart-Sync einschalten'}</button>` : `<button class="btn primary" data-sp="connect">Mit Spotify verbinden</button>`}
        ${tok.configured ? `<button class="btn" data-sp="disconnect">Trennen</button>` : ''}</div></section>`,
    `<section class="card"><h2>Gefundene Playlists</h2>${
      playlists.length
        ? `<div class="rows">${playlists.map((p) => `<div class="entry"><span class="avatar">${icon('music', 16)}</span><span class="lbl"><b>${esc(p.name)}</b></span><span class="chip">${esc(p.items)} Einträge</span></div>`).join('')}</div>`
        : `<p class="help" style="margin:0">Noch keine. Lege in Spotify eine Playlist an, deren Name mit „${esc(s.playlist_prefix ?? 'MuPiBox')}“ beginnt.</p>`
    }</section>`,
    conflicts.length
      ? `<section class="card"><h2>Konflikte</h2><p class="help">Inhalte, die schon von Hand auf der Box sind und auch in einer Playlist stehen.</p><div class="rows">${conflicts
          .map((c, i) => `<div class="entry"><span class="lbl"><b>${esc(`${c.manualArtist ?? '?'} – ${c.manualTitle ?? '?'}`)}</b><small>auch in ${esc((c.inPlaylists ?? []).join(', '))}</small></span><button class="btn sm" data-conflict="${i}">Vom Sync verwalten</button></div>`)
          .join('')}</div></section>`
      : '',
    `<div class="card nav-card"><div class="navlist">${navRow('syncopt', 'Sync-Einstellungen', 'Playlist-Präfix, Intervall, an/aus', 'gear')}${navRow('wizard', 'Einrichtungs-Assistent', 'Spotify neu verbinden in 5 Schritten', 'sync')}</div></div>`,
    `<section class="card"><h2>Zugang des Players</h2><p class="help">Damit der Player auf der Box Spotify abspielen kann. Die Spotify-App legst du auf developer.spotify.com an (siehe Assistent).</p>
      <div class="field"><label for="sp-id">Client ID</label><input class="input mono" id="sp-id" value="${esc(a.clientId ?? '')}" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="sp-secret">Client Secret</label><div class="input-wrap"><input class="input has-eye mono" id="sp-secret" type="password" autocomplete="off" placeholder="${a.hasSecret ? 'gespeichert – leer lassen = behalten' : 'nicht gesetzt (optional)'}"><button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div></div>
      ${kv([['Anmeldung', a.connected ? `angemeldet${a.tokenUpdatedAt ? ` (${relTime(a.tokenUpdatedAt)})` : ''}` : 'nicht angemeldet']])}
      <div class="btns"><button class="btn primary" data-sp="save">Speichern</button><button class="btn" data-sp="connect">${a.connected ? 'Neu anmelden' : 'Bei Spotify anmelden'}</button></div></section>`,
    `<section class="card"><h2>Playlists & Cache</h2>
      <div class="row"><span class="lbl"><b>Playlists verarbeiten</b><small>Titel von Spotify-Playlists einzeln lesen. Aus = schneller, aber ohne Titelliste.</small></span>
        <label class="switch"><input type="checkbox" id="sp-pl" ${a.processPlaylists !== false ? 'checked' : ''} aria-label="Playlists verarbeiten"><span></span></label></div>
      <div class="btns"><button class="btn" data-sp="cache">Spotify-Cache leeren</button></div></section>`,
    `<section class="card"><h2>Zugang zurücksetzen</h2><p class="help">Löscht die Spotify-Zugangsdaten des Players (Client ID, Secret, Anmeldung, Spotify-Connect-Login).</p>
      <div class="btns"><button class="btn danger" data-sp="reset">Spotify-Zugang zurücksetzen</button></div></section>`,
  ]
}

function mountSpotify(root, page) {
  const again = async (text, delay = 0) => {
    if (text) toast(text)
    setTimeout(async () => {
      await loadSpotify().catch(() => undefined)
      if (currentPage()?.id === page.id) renderPage(page, false)
    }, delay)
  }
  const acts = {
    sync: async () => again(await fireSync(), 3000),
    toggle: async () => {
      const on = !spot.status?.enabled
      const done = async () => {
        const r = await api(`${SYNC_API}/config`, { method: 'POST', body: { enabled: on } })
        if (!r.ok) return toast(r.body?.error ?? 'Das hat nicht geklappt', 'info')
        again(on ? 'Smart-Sync ist an' : 'Smart-Sync ist aus')
      }
      if (on) return done()
      confirmSheet('Ausschalten', 'Smart-Sync ausschalten? Dann gibt es auch keinen Sync von Hand (Knopf, Telegram) – die Inhalte auf der Box bleiben.', done)
    },
    connect: connectSpotify,
    disconnect: () =>
      confirmSheet('Trennen', 'Die Spotify-Anmeldung löschen? Smart-Sync hört auf, und der Player verliert beim nächsten Neustart den Zugang zu Spotify.', async () => {
        const r = await api(`${API}/spotify-oauth/disconnect`, { method: 'POST' })
        if (!r.ok) return toast('Das hat nicht geklappt', 'info')
        again('Getrennt')
      }),
    save: async () => {
      const clientId = $('#sp-id', root).value.trim()
      const secret = $('#sp-secret', root).value.trim()
      if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return toast('Die Client ID hat 16–64 Buchstaben und Ziffern', 'info')
      if (secret && !/^[A-Za-z0-9]{16,64}$/.test(secret)) return toast('Das Secret hat 16–64 Buchstaben und Ziffern', 'info')
      const r = await api(`${API}/spotify-credentials`, { method: 'POST', body: secret ? { clientId, clientSecret: secret } : { clientId } })
      if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
      again('Gespeichert')
    },
    cache: () =>
      confirmSheet('Leeren', 'Die zwischengespeicherten Spotify-Daten (Alben, Künstler, Cover) löschen? Sie werden beim nächsten Aufruf neu geladen – die Box ist dann kurz langsamer.', async () => {
        const r = await api(`${API}/spotify-access/clear-cache`, { method: 'POST' })
        toast(r.ok && r.body?.ok ? 'Spotify-Cache geleert' : 'Nicht alles ließ sich löschen', r.ok && r.body?.ok ? 'ok' : 'info')
      }),
    reset: () =>
      confirmSheet('Zurücksetzen', 'Alle Spotify-Zugangsdaten des Players löschen? Spotify spielt danach erst nach einer neuen Einrichtung wieder; der Player startet neu.', async () => {
        const r = await api(`${API}/spotify-access/reset`, { method: 'POST' })
        if (!r.ok) return toast('Das hat nicht geklappt', 'info')
        again('Spotify-Zugang zurückgesetzt')
      }),
  }
  for (const b of root.querySelectorAll('[data-sp]')) b.onclick = () => acts[b.dataset.sp]()
  $('#sp-pl', root).onchange = async (e) => {
    const r = await api(`${API}/spotify-access/playlists`, { method: 'POST', body: { enabled: e.target.checked } })
    if (!r.ok) {
      e.target.checked = !e.target.checked
      return toast('Nicht gespeichert', 'info')
    }
    toast(e.target.checked ? 'Playlists werden verarbeitet' : 'Playlists werden nicht verarbeitet')
  }
  for (const b of root.querySelectorAll('[data-conflict]')) {
    const c = spot.status.state.conflicts[Number(b.dataset.conflict)]
    b.onclick = () => {
      const key = String(c.groupKey ?? '')
      const value = key.startsWith('compilation:') ? key.split(':').at(-1) : key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
      if (!c.identifierField || !value) return toast('Dieser Konflikt lässt sich hier nicht auflösen', 'info')
      confirmSheet('Übergeben', `„${c.manualArtist ?? '?'} – ${c.manualTitle ?? '?'}“ vom Sync verwalten lassen? Er hält den Eintrag dann aktuell und nimmt ihn weg, wenn er aus der Playlist fliegt.`, async () => {
        const r = await api(`${SYNC_API}/conflicts/promote`, { method: 'POST', body: { identifierField: c.identifierField, identifierValue: value } })
        if (!r.ok) return toast(r.body?.error ?? 'Das hat nicht geklappt', 'info')
        libChanged()
        again('Wird jetzt vom Sync verwaltet')
      })
    }
  }
  // a running sync: look again until it is done
  const st = spot.status?.state
  if (st?.current_state && st.current_state !== 'IDLE' && st.current_state !== 'COMPLETED') again('', 3000)
}

/* Sync-Einstellungen and the setup assistant */

async function loadSyncConfig() {
  const r = await api(`${SYNC_API}/config`)
  if (!r.ok) throw new Error(`sync config ${r.status}`)
  const c = r.body ?? {}
  // the prefix is prefilled with the box's name
  state.values.set('prefix', c.playlist_prefix || state.boxName)
  state.values.set('syncInt', Math.max(5, Math.min(60, Math.round((c.polling_interval_seconds ?? 900) / 60 / 5) * 5)))
  state.values.set('syncOn', !!c.enabled)
}

function prefixOk(p) {
  if (p.length < 2 || p.length > 30) {
    toast('Der Präfix hat 2 bis 30 Zeichen', 'info')
    return false
  }
  return true
}

function wizardSections(page) {
  const redirect = `${location.protocol}//${location.host}/api/eltern/spotify-oauth/callback`
  const [s1, s2, s3, s4, s5] = page.sections
  return [
    { ...s1, items: [{ type: 'buttons', buttons: [['developer.spotify.com öffnen', 'ghost', 'devsite']] }] },
    {
      ...s2,
      items: [
        { type: 'kv', rows: [['App name', state.boxName], ['Description', 'MuPiBox Smart-Sync'], ['Redirect URI', redirect]] },
        { type: 'note', text: 'Bei „Which API/SDKs are you planning to use?“ die „Web API“ und das „Web Playback SDK“ ankreuzen.' },
        { type: 'buttons', buttons: [['Redirect URI kopieren', 'ghost', 'copy']] },
      ],
    },
    { ...s3, items: [{ ...s3.items[0], default: spot.access?.clientId ?? '' }, { type: 'buttons', buttons: [['Speichern + weiter', 'primary', 'saveid']] }] },
    { ...s4, help: 'Öffnet Spotify; nach der Anmeldung kommst du hierher zurück.', items: [{ type: 'buttons', buttons: [['Mit Spotify verbinden', 'primary', 'connect']] }] },
    { ...s5, items: [s5.items[0], { type: 'buttons', buttons: [['Fertig', 'primary', 'finish']] }] },
  ]
}

/* Cover: own pictures (e.g. for radio streams) and the online covers of NAS and local albums */

const cov = { own: [], oc: null, settings: {}, alsoRejected: false, file: null }

async function loadCovers() {
  const [own, oc, settings] = await Promise.all([api(`${API}/covers`), api('/api/online-covers'), api(`${API}/online-covers-settings`)])
  cov.own = own.body?.covers ?? []
  cov.oc = oc.ok ? oc.body : null
  cov.settings = settings.body ?? {}
}

function coverTop() {
  const entries = cov.oc?.entries ?? []
  const count = { found: 0, none: 0, rejected: 0 }
  let saved = 0
  for (const e of entries) {
    if (e.status in count) count[e.status]++
    if (e.status === 'found' && (e.savedTo === 'nas' || e.savedTo === 'local')) saved++
  }
  const found = entries.filter((e) => e.status === 'found' && /^[a-f0-9]{40}\.jpg$/.test(String(e.file ?? ''))).sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
  cov.found = found
  const pending = cov.oc?.pending ?? 0
  const sw = (id, label, help, on) =>
    `<div class="row"><span class="lbl"><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`
  return [
    `<section class="card"><h2>Eigene Cover</h2><p class="help">Quadratische Bilder (JPG, PNG, GIF, WEBP, 300–1200 px), z. B. für Radiosender. Die Adresse trägst du beim Eintrag als Cover ein.</p>
      <input type="file" id="c-file" accept=".jpg,.jpeg,.png,.gif,.webp,image/*" hidden>
      <div class="btns"><button class="btn" id="c-pick">${icon('image', 18)}Bild wählen</button><button class="btn primary" id="c-up" disabled>${icon('up', 18)}Hochladen</button></div>
      <p class="help" id="c-picked" style="margin:0"></p>
      ${
        cov.own.length
          ? `<div class="rows">${cov.own
              .map((c, i) => `<div class="entry"><span class="lib-thumb"><img src="${API}/covers/file/${encodeURIComponent(c.name)}" alt="" loading="lazy"></span>
                <span class="lbl"><b>${esc(c.name)}</b><small>${esc(c.url)}</small></span>
                <button class="icon-btn soft" data-copy="${i}" aria-label="Adresse kopieren">${icon('link', 18)}</button><button class="btn danger sm" data-del="${i}">Löschen</button></div>`)
              .join('')}</div>`
          : `<p class="help" style="margin:0">Noch keine eigenen Bilder.</p>`
      }</section>`,
    `<section class="card"><h2>Online-Cover für NAS- und lokale Alben</h2><p class="help">Alben ohne eigenes Bild bekommen ihr Cover von iTunes oder Deezer – nur bei eindeutigem Treffer. Die Ordnernamen werden dafür an Apple und Deezer geschickt.</p>
      ${sw('c-on', 'Cover online suchen', 'Ein paar Minuten nach jedem Start und alle 6 Stunden für neue Ordner.', cov.settings.onlineCovers)}
      ${sw('c-save', 'Auch als cover.jpg im Albumordner speichern', 'Nur in Ordner ohne Bild. Auf dem NAS braucht das Schreibrecht.', cov.settings.onlineCoversSave)}
      <dl class="kv"><div><dt>Gefunden</dt><dd>${count.found}</dd></div><div><dt>Kein Treffer</dt><dd>${count.none}</dd></div><div><dt>Verworfen</dt><dd>${count.rejected}</dd></div>
        ${pending || cov.oc?.scanning ? `<div><dt>Noch zu suchen</dt><dd>${pending}${cov.oc?.scanning ? ' (liest Ordner …)' : ''}</dd></div>` : ''}
        ${cov.settings.onlineCoversSave ? `<div><dt>Im Albumordner gespeichert</dt><dd>${saved} von ${count.found}</dd></div>` : ''}</dl>
      ${sw('c-rej', 'Auch verworfene erneut suchen', '', cov.alsoRejected)}
      <div class="btns"><button class="btn" id="c-retry">Ohne Treffer erneut suchen</button>${cov.settings.onlineCovers ? `<button class="btn primary" id="c-scan">Alle Alben jetzt suchen</button>` : ''}
        ${cov.settings.onlineCoversSave && count.found > saved ? `<button class="btn" id="c-saveall">Übrige gefundene speichern</button>` : ''}</div>
      ${cov.oc ? '' : `<p class="help" style="margin:0">Der Stand der Online-Cover ließ sich nicht laden.</p>`}</section>`,
    found.length
      ? `<section class="card wide"><h2>Zuletzt gefunden</h2><p class="help">Falsches Cover? Verwerfen – das Album fällt dann auf das Bild des Ordners darüber zurück.</p>
          <div class="covers">${found
            .slice(0, 30)
            .map(
              (e, i) => `<div class="cover-tile"><span class="cover-img"><img src="/api/online-cover/${e.file}" alt="" loading="lazy"><span class="cover-badge">${String(e.key).startsWith('nas:') ? 'NAS' : 'SD-Karte'}</span></span>
                <b>${esc(e.album ?? '')}</b><small>${esc(e.series ?? '')} · ${e.source === 'itunes' ? 'iTunes' : 'Deezer'}</small>
                <button class="btn danger sm" data-reject="${i}">Verwerfen</button></div>`,
            )
            .join('')}</div>${found.length > 30 ? `<p class="help" style="margin:0">… und ${found.length - 30} weitere.</p>` : ''}</section>`
      : '',
  ]
}

// A file name the box takes: letters, digits, dot, dash and underscore
function coverName(file) {
  const ext = (file.name.match(/\.(jpe?g|png|gif|webp)$/i)?.[0] ?? '').toLowerCase()
  const base = file.name
    .slice(0, file.name.length - ext.length)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return ext ? `${base || 'cover'}${ext}` : ''
}

function mountCovers(root, page) {
  const again = async (text, kind = 'ok') => {
    if (text) toast(text, kind)
    await loadCovers().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  const input = $('#c-file', root)
  $('#c-pick', root).onclick = () => input.click()
  input.onchange = () => {
    cov.file = input.files?.[0] ?? null
    const name = cov.file ? coverName(cov.file) : ''
    $('#c-picked', root).textContent = cov.file ? (name ? `Wird gespeichert als ${name}${cov.own.some((c) => c.name === name) ? ' (ersetzt das vorhandene Bild)' : ''}` : 'Das ist kein JPG, PNG, GIF oder WEBP.') : ''
    $('#c-up', root).disabled = !name
  }
  $('#c-up', root).onclick = async () => {
    const name = coverName(cov.file)
    const r = await fetch(`${API}/covers/upload?name=${encodeURIComponent(name)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'x-mupibox-csrf': state.csrf },
      body: cov.file,
    }).catch(() => null)
    const b = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) {
      const why = {
        not_square: `Das Bild ist nicht quadratisch (${b.width} × ${b.height} px).`,
        bad_size: `Das Bild muss 300 bis 1200 px groß sein (hat ${b.width} px).`,
        not_an_image: 'Das ist kein JPG, PNG, GIF oder WEBP.',
        too_large: 'Das Bild ist größer als 10 MB.',
      }[b.error]
      return toast(why ?? 'Hochladen ging nicht', 'info')
    }
    cov.file = null
    again(b.replaced ? 'Bild ersetzt' : 'Bild hochgeladen')
  }
  for (const b of root.querySelectorAll('[data-copy]')) b.onclick = () => copyText(cov.own[Number(b.dataset.copy)].url)
  for (const b of root.querySelectorAll('[data-del]')) {
    const c = cov.own[Number(b.dataset.del)]
    b.onclick = () =>
      confirmSheet('Löschen', `„${c.name}“ löschen? Einträge, die es als Cover nutzen, zeigen dann kein Bild mehr.`, async () => {
        const r = await api(`${API}/covers/delete`, { method: 'POST', body: { name: c.name } })
        if (!r.ok) return toast('Das hat nicht geklappt', 'info')
        again('Gelöscht')
      })
  }
  const setting = (id, key, after) =>
    ($(id, root).onchange = async (e) => {
      const on = e.target.checked
      const r = await api(`${API}/online-covers-settings`, { method: 'POST', body: { [key]: on } })
      if (!r.ok) {
        e.target.checked = !on
        return toast('Nicht gespeichert', 'info')
      }
      cov.settings[key] = on
      // switched on: as the admin interface's cover page, start the work right away (the backend reads the switch live)
      if (on) setTimeout(() => after(), 1000)
      again(on ? 'Eingeschaltet' : 'Ausgeschaltet')
    })
  setting('#c-on', 'onlineCovers', () => api('/api/online-covers/scan', { method: 'POST', body: {} }))
  setting('#c-save', 'onlineCoversSave', () => api('/api/online-covers/save-all', { method: 'POST', body: {} }))
  $('#c-rej', root).onchange = (e) => (cov.alsoRejected = e.target.checked)
  $('#c-retry', root).onclick = async () => {
    const r = await api('/api/online-covers/retry', { method: 'POST', body: { alsoRejected: cov.alsoRejected } })
    if (!r.ok || !r.body?.success) return toast('Das hat nicht geklappt', 'info')
    await api('/api/online-covers/scan', { method: 'POST', body: {} })
    again(`${r.body.cleared ?? 0} Alben werden im Hintergrund neu gesucht`)
  }
  $('#c-scan', root)?.addEventListener('click', async () => {
    const r = await api('/api/online-covers/scan', { method: 'POST', body: {} })
    again(r.ok ? 'Die Suche läuft im Hintergrund' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
  })
  $('#c-saveall', root)?.addEventListener('click', async () => {
    const r = await api('/api/online-covers/save-all', { method: 'POST', body: {} })
    again(r.body?.success ? `${r.body.queued ?? 0} Cover werden gespeichert` : r.body?.error ?? 'Das hat nicht geklappt', r.body?.success ? 'ok' : 'info')
  })
  for (const b of root.querySelectorAll('[data-reject]')) {
    const e = cov.found[Number(b.dataset.reject)]
    b.onclick = () =>
      confirmSheet('Verwerfen', `Das Cover von „${e.album ?? ''}“ verwerfen? Das Album wird nicht mehr online gesucht${e.savedTo === 'nas' || e.savedTo === 'local' ? ', und das gespeicherte cover.jpg wird gelöscht' : ''}.`, async () => {
        const r = await api('/api/online-covers/reject', { method: 'POST', body: { key: e.key } })
        again(r.body?.success ? 'Verworfen' : 'Das hat nicht geklappt', r.body?.success ? 'ok' : 'info')
      })
  }
  // while albums are still looked up: the numbers follow
  if ((cov.oc?.pending ?? 0) > 0 || cov.oc?.scanning) every(15000, async () => {
    if (document.activeElement?.closest?.('#content')) return
    await again()
  })
}

/* NAS: login, profiles, the folders the box shows / hides / keeps on the SD card */

// st: /api/nas/state; path: the folder shown (''= top); entries: its subfolders; edits: path -> {show, hide, download}
const nas = { st: null, profiles: [], index: null, dl: null, path: '', entries: null, err: '', edits: new Map(), q: '', hits: null, onlySel: false, loginOpen: false }

async function loadNas() {
  const [st, profiles, index, dl] = await Promise.all([api('/api/nas/state'), api('/api/nas/profiles'), api('/api/nas/index/status'), api('/api/nas/download/status')])
  if (!st.ok) throw new Error(`nas state ${st.status}`)
  nas.st = st.body
  nas.profiles = profiles.body?.profiles ?? []
  nas.index = index.ok ? index.body : null
  nas.dl = dl.ok ? dl.body : null
}

async function loadNasFolder() {
  nas.entries = null
  nas.err = ''
  drawNasFolders()
  const r = await api(`/api/nas/browse?path=${encodeURIComponent(nas.path || '/')}`)
  nas.entries = r.ok ? r.body?.entries ?? [] : []
  if (!r.ok) nas.err = r.status === 401 ? 'Die Box ist nicht beim NAS angemeldet.' : 'Das NAS antwortet gerade nicht.'
  drawNasFolders()
}

function nasTop() {
  const st = nas.st ?? {}
  const loginForm = !st.loggedIn || nas.loginOpen
  const sw = (id, label, on) => `<div class="row"><span class="lbl"><b>${label}</b></span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`
  const dl = nas.dl
  return [
    `<section class="card"><h2>Anmeldung</h2>${
      loginForm
        ? `<p class="help">Die Box meldet sich per WebDAV beim NAS an (z. B. Synology: WebDAV-Server einschalten, Port 5005 bzw. 5006 für HTTPS).</p>
          <div class="field"><label for="n-addr">Server (Adresse:Port)</label><input class="input" id="n-addr" value="${esc(st.address ?? '')}" placeholder="z. B. 192.168.1.10:5005" autocomplete="off"></div>
          ${sw('n-https', 'HTTPS', st.https)}
          <div class="field"><label for="n-acc">Benutzer</label><input class="input" id="n-acc" value="${esc(st.account ?? '')}" autocomplete="off"></div>
          <div class="field"><label for="n-pw">Passwort</label><div class="input-wrap"><input class="input has-eye" id="n-pw" type="password" autocomplete="new-password"><button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div></div>
          ${sw('n-remember', 'Anmeldung merken', st.rememberMe || !st.address)}
          <p class="help" style="margin:0">Ohne „merken“ vergisst die Box das Passwort beim nächsten Neustart – der NAS-Reiter ist dann leer. Gespeichert wird es verschlüsselt.</p>
          <div class="btns"><button class="btn primary" id="n-login">Anmelden</button>${nas.loginOpen ? '<button class="btn" id="n-cancel">Abbrechen</button>' : ''}</div>`
        : `<dl class="kv"><div><dt>Server</dt><dd>${esc(st.address)}${st.https ? ' (HTTPS)' : ''}</dd></div><div><dt>Benutzer</dt><dd>${esc(st.account)}</dd></div>
            <div><dt>Status</dt><dd>${st.offline ? 'gerade nicht erreichbar' : 'angemeldet'}</dd></div></dl>
          <div class="btns"><button class="btn" id="n-other">Andere Anmeldung</button><button class="btn" id="n-logout">Abmelden</button></div>`
    }</section>`,
    st.loggedIn
      ? `<section class="card"><h2>Profile</h2><p class="help">Ein Profil merkt sich die Ordner-Auswahl (Anzeigen, Ausblenden, Laden) für ein NAS und Konto – nicht das Passwort.</p>
        <div class="rows">${nas.profiles
          .map(
            (p, i) => `<div class="entry"><span class="lbl"><b>${esc(p.name === 'standard' ? 'Standard' : p.name)}</b><small>${p.shown} angezeigt · ${p.hidden} ausgeblendet · ${p.download} laden${p.matchesLogin ? '' : ` · anderes NAS (${esc(p.account ?? '')}@${esc(p.address ?? '')})`}</small></span>
              ${p.active ? '<span class="chip ok">aktiv</span>' : `<button class="btn sm" data-pload="${i}" ${p.matchesLogin ? '' : 'disabled'}>Laden</button>`}${p.name === 'standard' ? '' : `<button class="btn danger sm" data-pdel="${i}">Löschen</button>`}</div>`,
          )
          .join('')}</div>
        <div class="btns"><button class="btn" id="n-pnew">${icon('plus', 18)}Auswahl als Profil speichern</button></div></section>`
      : '',
    st.loggedIn
      ? `<section class="card wide"><h2>Ordner</h2><p class="help">Anzeigen = erscheint auf der Box. Ausblenden = bleibt verborgen (auch alles darunter). Laden = auf die SD-Karte kopieren, damit es auch ohne NAS spielt.</p>
        <div class="search">${icon('search')}<input class="input" id="n-q" type="search" placeholder="Ordner auf dem ganzen NAS suchen" autocomplete="off" value="${esc(nas.q)}"></div>
        <p class="help" id="n-index" style="margin:0"></p>
        ${sw('n-only', 'Nur die Auswahl zeigen', nas.onlySel)}
        <nav class="crumbs" id="n-crumbs"></nav>
        <div class="rows" id="n-list"><div class="loading"><p>Lade …</p></div></div>
        <div class="btns"><button class="btn sm" data-bulk="show1">Alle anzeigen</button><button class="btn sm" data-bulk="show0">Keine anzeigen</button><button class="btn sm" data-bulk="dl1">Alle laden</button><button class="btn sm" data-bulk="dl0">Keine laden</button></div>
        <p class="help" id="n-changes" style="margin:0"></p>
        <div class="btns"><button class="btn primary" id="n-save">Auswahl speichern</button><button class="btn" id="n-dl">${icon('up', 18)}Ausgewählte herunterladen</button><button class="btn" id="n-covers">Cover neu laden</button><button class="btn" id="n-reindex">Index aktualisieren</button></div>
        <div class="bar" id="n-dlbar" ${dl?.running ? '' : 'hidden'}><div class="track"><i id="n-dlfill" style="width:0%"></i></div><small id="n-dltext"></small></div>
        <p class="help" id="n-dlmsg" style="margin:0"></p>
        <div class="btns"><button class="btn danger" id="n-dlcancel" ${dl?.running ? '' : 'hidden'}>Download abbrechen</button></div></section>`
      : '',
  ]
}

// The rows shown: search hits, the saved selection, or the subfolders of the open folder
function nasRows() {
  const st = nas.st ?? {}
  const flags = (p) => ({ isMarked: st.artistFolders.includes(p), isHidden: st.hiddenFolders.includes(p), isDownload: st.downloadFolders.includes(p) })
  const of = (p) => ({ name: p.slice(p.lastIndexOf('/') + 1) || p, path: p, sub: p.slice(0, p.lastIndexOf('/')) || '/', flat: true, ...flags(p) })
  if (nas.q.trim().length >= 2) return nas.hits === null ? null : nas.hits.map(of)
  if (nas.onlySel) return [...new Set([...st.artistFolders, ...st.hiddenFolders, ...st.downloadFolders])].sort((a, b) => a.localeCompare(b, 'de')).map(of)
  return nas.entries
}

const nasFlag = (row, key) => {
  const e = nas.edits.get(row.path)
  if (e) return e[key]
  return key === 'show' ? row.isMarked && !row.isHidden : key === 'hide' ? row.isHidden : row.isDownload
}

function setNasFlag(row, key, on) {
  const e = nas.edits.get(row.path) ?? { show: nasFlag(row, 'show'), hide: nasFlag(row, 'hide'), download: nasFlag(row, 'download') }
  e[key] = on
  // a folder is either shown or hidden
  if (on && key === 'show') e.hide = false
  if (on && key === 'hide') e.show = false
  nas.edits.set(row.path, e)
}

let nasShown = []

function drawNasFolders() {
  const list = $('#n-list')
  if (!list) return
  const crumbs = $('#n-crumbs')
  const flat = nas.q.trim().length >= 2 || nas.onlySel
  crumbs.hidden = flat
  const parts = nas.path.split('/').filter(Boolean)
  crumbs.innerHTML = [{ t: 'NAS', p: '' }, ...parts.map((t, i) => ({ t, p: `/${parts.slice(0, i + 1).join('/')}` }))]
    .map((c, i, all) => (i === all.length - 1 ? `<span aria-current="page">${esc(c.t)}</span>` : `<button data-crumb="${esc(c.p)}">${esc(c.t)}</button><span class="sep">›</span>`))
    .join('')
  for (const b of crumbs.querySelectorAll('[data-crumb]')) {
    b.onclick = () => {
      nas.path = b.dataset.crumb
      loadNasFolder()
    }
  }
  const rows = nasRows()
  $('#n-changes').textContent = nas.edits.size ? `${nas.edits.size} ${nas.edits.size === 1 ? 'Ordner geändert' : 'Ordner geändert'} – noch nicht gespeichert.` : ''
  if (rows === null) {
    list.innerHTML = `<div class="loading"><p>Lade …</p></div>`
    return
  }
  nasShown = rows
  if (!rows.length) {
    list.innerHTML = `<p class="help">${esc(nas.err || (flat ? 'Nichts gefunden.' : 'Keine Unterordner.'))}</p>`
    return
  }
  const chip = (i, key, label, row) => `<button class="tog" data-i="${i}" data-k="${key}" aria-pressed="${nasFlag(row, key)}">${label}</button>`
  list.innerHTML = rows
    .map(
      (r, i) => `<div class="entry nas-row${nas.edits.has(r.path) ? ' changed' : ''}"><button class="lbl nas-open" data-open="${i}"><b>${icon('folder', 16)} ${esc(r.name)}</b>${r.flat ? `<small>${esc(r.sub)}</small>` : ''}${r.isDownloaded ? '<small class="ok-text">✓ auf der Box</small>' : ''}</button>
        <span class="togs">${chip(i, 'show', 'Anzeigen', r)}${chip(i, 'hide', 'Ausblenden', r)}${chip(i, 'download', 'Laden', r)}</span></div>`,
    )
    .join('')
  for (const b of list.querySelectorAll('.tog')) {
    b.onclick = () => {
      const row = nasShown[Number(b.dataset.i)]
      setNasFlag(row, b.dataset.k, b.getAttribute('aria-pressed') !== 'true')
      drawNasFolders()
    }
  }
  for (const b of list.querySelectorAll('[data-open]')) {
    b.onclick = () => {
      nas.path = nasShown[Number(b.dataset.open)].path
      nas.q = ''
      nas.onlySel = false
      const q = $('#n-q')
      if (q) q.value = ''
      const only = $('#n-only')
      if (only) only.checked = false
      loadNasFolder()
    }
  }
}

function drawNasIndex() {
  const el = $('#n-index')
  const ix = nas.index
  if (!el || !ix) return
  el.textContent = ix.running ? `Suchindex wird erstellt … (${ix.folders ?? 0} Ordner)` : ix.exists ? `Suchindex: ${ix.count} Ordner, Stand ${relTime(new Date(ix.updated).toISOString())}` : 'Noch kein Suchindex – „Index aktualisieren“.'
}

function drawNasDownload() {
  const d = nas.dl
  const bar = $('#n-dlbar')
  if (!bar || !d) return
  bar.hidden = !d.running
  $('#n-dlcancel').hidden = !d.running
  const pct = d.bytesTotal ? (d.bytesDone / d.bytesTotal) * 100 : d.filesTotal ? (d.filesDone / d.filesTotal) * 100 : 0
  $('#n-dlfill').style.width = `${Math.min(100, pct).toFixed(1)}%`
  $('#n-dltext').textContent = `${d.filesDone} von ${d.filesTotal} Dateien · ${formatBytes(d.bytesDone)} von ${formatBytes(d.bytesTotal)}`
  $('#n-dlmsg').textContent = d.spaceError
    ? `Passt nicht auf die SD-Karte: nötig ${formatBytes(d.spaceError.needed)}, frei ${formatBytes(Math.max(0, d.spaceError.free - d.spaceError.reserve))}.`
    : d.error
      ? `Fehler: ${d.error}`
      : d.message && d.message !== 'Idle'
        ? `Download: ${d.message}${d.cancelled ? ' (abgebrochen)' : ''}`
        : ''
}

async function saveNasSelection() {
  if (!nas.edits.size) return true
  const shown = [...nas.edits.keys()]
  const pick = (k) => shown.filter((p) => nas.edits.get(p)[k])
  const r = await api('/api/nas/selection', { method: 'POST', body: { shown, show: pick('show'), hide: pick('hide'), download: pick('download') } })
  if (!r.ok || !r.body?.success) {
    toast('Nicht gespeichert', 'info')
    return false
  }
  nas.edits.clear()
  const st = await api('/api/nas/state')
  if (st.ok) nas.st = st.body
  libChanged()
  libChanged()
  return true
}

async function nasLogin(root, page, fingerprint) {
  const address = $('#n-addr', root).value.trim()
  const account = $('#n-acc', root).value.trim()
  const password = $('#n-pw', root).value
  if (!address || !account || !password) return toast('Bitte Server, Benutzer und Passwort eintragen', 'info')
  const body = { address, https: $('#n-https', root).checked, account, password, rememberMe: $('#n-remember', root).checked, ...(fingerprint ? { certFingerprint: fingerprint } : {}) }
  const btn = $('#n-login', root)
  btn.disabled = true
  btn.textContent = 'Melde an …'
  const r = await api('/api/nas/login', { method: 'POST', body })
  btn.disabled = false
  btn.textContent = 'Anmelden'
  if (r.body?.success) {
    nas.loginOpen = false
    nas.path = ''
    nas.edits.clear()
    toast('Beim NAS angemeldet')
    libChanged()
    await loadNas().catch(() => undefined)
    return renderPage(page, false)
  }
  const cert = r.body?.certificate
  if (cert?.fingerprint && !fingerprint) {
    return openSheet(
      `<h2>Zertifikat bestätigen</h2><p class="help" style="margin:0">Das NAS nutzt ein eigenes (selbst signiertes) Zertifikat. Vergleiche den Fingerabdruck mit dem im NAS (bzw. im Browser über das Schloss-Symbol). Nur wenn er übereinstimmt:</p>
       <dl class="kv"><div><dt>Ausgestellt für</dt><dd>${esc(cert.subject)}</dd></div><div><dt>Gültig bis</dt><dd>${esc(cert.validTo)}</dd></div></dl>
       <p class="mono-block">${esc(cert.fingerprint)}</p>
       <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Vertrauen und anmelden</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        sheet.querySelector('[data-ok]').onclick = () => {
          close()
          nasLogin(root, page, cert.fingerprint)
        }
      },
    )
  }
  toast(r.body?.error ? `Anmeldung fehlgeschlagen: ${r.body.error}` : 'Anmeldung fehlgeschlagen', 'info')
}

function mountNas(root, page) {
  const again = async (text) => {
    if (text) toast(text)
    await loadNas().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  $('#n-login', root)?.addEventListener('click', () => nasLogin(root, page))
  $('#n-cancel', root)?.addEventListener('click', () => {
    nas.loginOpen = false
    renderPage(page, false)
  })
  $('#n-other', root)?.addEventListener('click', () => {
    nas.loginOpen = true
    renderPage(page, false)
  })
  $('#n-logout', root)?.addEventListener('click', () =>
    confirmSheet('Abmelden', 'Die Box vom NAS abmelden und das gespeicherte Passwort löschen? Der NAS-Reiter auf der Box ist dann leer, bis du dich wieder anmeldest. Heruntergeladene Ordner spielen weiter.', async () => {
      const r = await api('/api/nas/logout', { method: 'POST', body: {} })
      if (!r.body?.success) return toast('Das hat nicht geklappt', 'info')
      libChanged()
      again('Abgemeldet')
    }),
  )
  if (!nas.st?.loggedIn) return
  // profiles
  for (const b of root.querySelectorAll('[data-pload]')) {
    const p = nas.profiles[Number(b.dataset.pload)]
    b.onclick = () =>
      confirmSheet('Laden', `Profil „${p.name === 'standard' ? 'Standard' : p.name}“ laden? Die aktuelle Ordner-Auswahl wird ersetzt${nas.edits.size ? ' (auch deine ungespeicherten Änderungen)' : ''}.`, async () => {
        const r = await api('/api/nas/profiles/load', { method: 'POST', body: { name: p.name } })
        if (r.body?.error === 'different_login') return toast('Das Profil gehört zu einem anderen NAS oder Konto', 'info')
        if (!r.body?.success) return toast('Das hat nicht geklappt', 'info')
        nas.edits.clear()
        libChanged()
        const missing = r.body.missing ?? []
        if (missing.length) {
          await again()
          return openSheet(
            `<h2>Ordner fehlen</h2><p class="help" style="margin:0">Das Profil ist geladen, aber ${missing.length} Ordner gibt es auf dem NAS nicht mehr:</p><ul class="u-list">${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
             <div class="btns"><button class="btn" data-close>Behalten</button><button class="btn primary" data-ok>Aus dem Profil entfernen</button></div>`,
            (sheet, close) => {
              sheet.querySelector('[data-close]').onclick = close
              sheet.querySelector('[data-ok]').onclick = async () => {
                close()
                await api('/api/nas/profiles/remove-missing', { method: 'POST', body: { name: p.name, paths: missing } })
                again('Entfernt')
              }
            },
          )
        }
        again(r.body.unverified ? `Geladen – ${r.body.unverified} Ordner ließen sich nicht prüfen` : 'Profil geladen')
      })
  }
  for (const b of root.querySelectorAll('[data-pdel]')) {
    const p = nas.profiles[Number(b.dataset.pdel)]
    b.onclick = () =>
      confirmSheet('Löschen', `Profil „${p.name}“ löschen? Die aktuelle Auswahl auf der Box bleibt.`, async () => {
        const r = await api('/api/nas/profiles/delete', { method: 'POST', body: { name: p.name } })
        again(r.body?.success ? 'Profil gelöscht' : 'Das hat nicht geklappt')
      })
  }
  $('#n-pnew', root).onclick = () =>
    openSheet(
      `<h2>Als Profil speichern</h2><p class="help" style="margin:0">Speichert die gespeicherte Ordner-Auswahl unter einem Namen und macht es zum aktiven Profil.</p>
       <div class="field"><label for="p-name">Name</label><input class="input" id="p-name" maxlength="40" placeholder="z. B. Oma und Opa"></div>
       <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        const create = async (overwrite) => {
          const name = sheet.querySelector('#p-name').value.trim()
          if (!/^[\p{L}\p{N} .()-]{1,40}$/u.test(name)) return toast('Nur Buchstaben, Ziffern, Leerzeichen und . ( ) -', 'info')
          if (!(await saveNasSelection())) return
          const r = await api('/api/nas/profiles/create', { method: 'POST', body: { name, overwrite } })
          if (r.body?.error === 'exists' && !overwrite) {
            close()
            return confirmSheet('Ersetzen', `Ein Profil „${name}“ gibt es schon. Ersetzen?`, async () => {
              const r2 = await api('/api/nas/profiles/create', { method: 'POST', body: { name, overwrite: true } })
              again(r2.body?.success ? 'Profil gespeichert' : 'Das hat nicht geklappt')
            })
          }
          close()
          again(r.body?.success ? 'Profil gespeichert' : r.body?.error === 'invalid_name' ? 'Ungültiger Name' : 'Das hat nicht geklappt')
        }
        sheet.querySelector('[data-ok]').onclick = () => create(false)
      },
    )
  // folders
  let timer = null
  const q = $('#n-q', root)
  q.addEventListener('input', () => {
    nas.q = q.value
    clearTimeout(timer)
    if (nas.q.trim().length < 2) {
      nas.hits = null
      return drawNasFolders()
    }
    nas.hits = null
    drawNasFolders()
    timer = setTimeout(async () => {
      const r = await api(`/api/nas/index/search?q=${encodeURIComponent(nas.q.trim())}`)
      nas.hits = r.body?.paths ?? []
      if (r.body && !r.body.success) nas.err = 'Noch kein Suchindex – bitte „Index aktualisieren“.'
      drawNasFolders()
    }, 300)
  })
  $('#n-only', root).onchange = (e) => {
    nas.onlySel = e.target.checked
    drawNasFolders()
  }
  for (const b of root.querySelectorAll('[data-bulk]')) {
    b.onclick = () => {
      const [key, on] = b.dataset.bulk === 'show1' ? ['show', true] : b.dataset.bulk === 'show0' ? ['show', false] : b.dataset.bulk === 'dl1' ? ['download', true] : ['download', false]
      for (const row of nasShown) setNasFlag(row, key, on)
      drawNasFolders()
    }
  }
  $('#n-save', root).onclick = async () => {
    if (!nas.edits.size) return toast('Nichts geändert', 'info')
    if (await saveNasSelection()) {
      toast('Auswahl gespeichert – der NAS-Reiter der Box zeigt sie gleich')
      loadNasFolder()
    }
  }
  $('#n-dl', root).onclick = () =>
    confirmSheet('Herunterladen', 'Die Ordner mit „Laden“ auf die SD-Karte kopieren? Lokale Kopien von Ordnern ohne „Laden“ werden dabei gelöscht.', async () => {
      if (!(await saveNasSelection())) return
      const r = await api('/api/nas/download/sync', { method: 'POST', body: {} })
      if (!r.body?.success) return toast(r.status === 409 ? 'Es läuft schon ein Download oder das Neuladen der Cover' : 'Das hat nicht geklappt', 'info')
      toast('Download gestartet')
      pollNasDownload()
    })
  $('#n-covers', root).onclick = async () => {
    toast('Cover werden neu geladen …')
    const r = await api('/api/nas/covers/refresh', { method: 'POST', body: {} })
    toast(r.body?.success ? 'Cover neu geladen' : r.body?.error ?? 'Das hat nicht geklappt', r.body?.success ? 'ok' : 'info')
  }
  $('#n-reindex', root).onclick = async () => {
    const r = await api('/api/nas/index/refresh', { method: 'POST', body: {} })
    if (!r.body?.success) return toast('Das hat nicht geklappt', 'info')
    toast('Der Suchindex wird im Hintergrund erstellt')
    pollNasIndex()
  }
  $('#n-dlcancel', root).onclick = async () => {
    await api('/api/nas/download/cancel', { method: 'POST', body: {} })
    toast('Wird abgebrochen …')
  }
  drawNasIndex()
  drawNasDownload()
  if (nas.q.trim().length >= 2 || nas.onlySel) drawNasFolders()
  else loadNasFolder()
  if (nas.dl?.running) pollNasDownload()
  if (nas.index?.running) pollNasIndex()
}

function pollNasDownload() {
  every(2000, async () => {
    const r = await api('/api/nas/download/status')
    if (r.ok) nas.dl = r.body
    drawNasDownload()
    if (!nas.dl?.running) {
      stopPageTimers()
      if (nas.index?.running) pollNasIndex()
    }
  })
}

function pollNasIndex() {
  every(3000, async () => {
    const r = await api('/api/nas/index/status')
    if (r.ok) nas.index = r.body
    drawNasIndex()
    if (!nas.index?.running) stopPageTimers()
  })
}

/* the controllers: load(page) reads the box before drawing, mount(root, page) runs after it, change(key, value)
   saves a setting, act / byLabel run the buttons, sections(page) gives the building blocks with the box's values,
   top(page) draws the page's own top part (instead of customTop's), ownNav: the page shows its sub pages itself */
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
  bibliothek: {
    async load() {
      if (!lib.items) {
        await loadLib()
        lib.loadedAt = Date.now()
      }
    },
    top: libTop,
    sections: () => [],
    ownNav: true,
    mount(root) {
      $('#lib-add', root).onclick = openAdd
      $('#lib-sync', root).onclick = async () => {
        toast(await fireSync())
        setTimeout(async () => {
          const s = await api(`${SYNC_API}/status`)
          if (s.ok) lib.sync = s.body
          drawSyncLine()
        }, 2500)
      }
      const q = $('#lib-q', root)
      q.addEventListener('input', () => {
        lib.q = q.value
        drawLib()
      })
      $('#lib-cat', root).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        lib.cat = b.dataset.v
        for (const x of b.parentElement.children) x.setAttribute('aria-selected', String(x === b))
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        drawLib()
      }
      $('#lib-src', root).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        lib.src = b.dataset.v
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
        drawLib()
      }
      drawLib()
      drawSyncLine()
      // known state first, then read again (the sync or the box may have changed it)
      if (Date.now() - (lib.loadedAt ?? 0) > 5000) {
        lib.loadedAt = Date.now()
        loadLib().then(() => {
          if (currentPage()?.id !== 'bibliothek') return
          drawLib()
          drawSyncLine()
        })
      }
    },
  },
  verwaltet: {
    load: loadManaged,
    top: managedTop,
    sections: () => [],
    mount(root, page) {
      for (const b of root.querySelectorAll('[data-sub]')) b.onclick = () => openSubSheet(managed.subs.artists[Number(b.dataset.sub)], page)
      for (const b of root.querySelectorAll('[data-album]')) {
        const al = managed.subs.explicit_albums[Number(b.dataset.album)]
        b.onclick = () =>
          confirmSheet('Entfernen', `„${al.name || al.id}“ entfernen? Der nächste Sync nimmt es von der Box.`, async () => {
            const r = await api(`${API}/library/remove-album`, { method: 'POST', body: { albumId: al.id } })
            if (!r.ok) return toast('Das hat nicht geklappt', 'info')
            managedDone('Entfernt.', page)
          })
      }
    },
  },
  suche: {
    top: searchTop,
    sections: () => [],
    mount(root) {
      const q = $('#s-q', root)
      q.addEventListener('input', () => (search.q = q.value))
      q.addEventListener('keydown', (e) => e.key === 'Enter' && doSpotifySearch())
      $('#s-type', root).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        search.type = b.dataset.v
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
        if (search.q.trim().length >= 2) doSpotifySearch()
      }
      $('#s-cat', root).onchange = (e) => (search.cat = e.target.value)
      $('#s-go', root).onclick = doSpotifySearch
      drawSearch()
    },
  },
  link: {
    change(key, v, page) {
      if (key !== 'lType') return
      state.values.set('lCat', v === 'Spotify-Link' ? 'Hörbuch/Hörspiel' : 'Sonstiges')
      renderPage(page, false)
    },
    byLabel: {
      Hinzufügen: (_arg, _label, page) => addLink(page),
    },
  },
  spotify: {
    load: loadSpotify,
    top: spotifyTop,
    sections: () => [],
    ownNav: true,
    mount: mountSpotify,
  },
  syncopt: {
    load: loadSyncConfig,
    // (the prototype said a manual sync stays possible: it does not, see the scheduler)
    sections: (page) =>
      page.sections.map((sec) => ({
        ...sec,
        items: sec.items.map((it) => (it.key === 'syncOn' ? { ...it, help: 'Aus = gar kein Sync, auch nicht von Hand (Knopf, Telegram /resync). Die Inhalte auf der Box bleiben.' } : it)),
      })),
    byLabel: {
      async Speichern() {
        const prefix = String(state.values.get('prefix') ?? '').trim()
        const minutes = Number(state.values.get('syncInt'))
        if (!prefixOk(prefix)) return
        const r = await api(`${SYNC_API}/config`, {
          method: 'POST',
          body: { enabled: !!state.values.get('syncOn'), playlist_prefix: prefix, polling_interval_seconds: minutes * 60 },
        })
        toast(r.ok ? 'Gespeichert' : r.body?.error ?? 'Nicht gespeichert', r.ok ? 'ok' : 'info')
      },
    },
  },
  wizard: {
    async load() {
      await Promise.all([loadSpotify().catch(() => undefined), state.values.has('prefix') ? null : loadSyncConfig().catch(() => undefined)])
    },
    sections: wizardSections,
    act: {
      devsite: () => window.open('https://developer.spotify.com/dashboard', '_blank', 'noopener'),
      copy: () => copyText(`${location.protocol}//${location.host}/api/eltern/spotify-oauth/callback`),
      async saveid() {
        const clientId = String(state.values.get('wzClient') ?? spot.access?.clientId ?? '').trim()
        if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return toast('Die Client ID hat 16–64 Buchstaben und Ziffern', 'info')
        const r = await api(`${API}/spotify-credentials`, { method: 'POST', body: { clientId } })
        if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
        toast('Client ID gespeichert – weiter mit Schritt 4')
        spot.access = { ...(spot.access ?? {}), clientId }
      },
      connect: connectSpotify,
      async finish() {
        const prefix = String(state.values.get('prefix') ?? '').trim()
        if (!prefixOk(prefix)) return
        const r = await api(`${SYNC_API}/config`, { method: 'POST', body: { enabled: true, playlist_prefix: prefix } })
        if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
        toast('Smart-Sync ist eingerichtet')
        go('spotify')
      },
    },
  },
  nas: {
    load: loadNas,
    top: nasTop,
    sections: () => [],
    mount: mountNas,
  },
  cover: {
    load: loadCovers,
    top: coverTop,
    sections: () => [],
    mount: mountCovers,
  },
  upload: {
    top: uploadTop,
    sections: () => [],
    mount: mountUpload,
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

let openSheetClose = null
function closeSheet() {
  openSheetClose?.()
  openSheetClose = null
}

function openSheet(html, onOpen) {
  const sheet = $('#sheet')
  const scrim = $('#sheet-scrim')
  const before = document.activeElement
  sheet.innerHTML = `<div class="grip"></div>${html}`
  sheet.hidden = false
  scrim.hidden = false
  const close = () => {
    if (sheet.hidden) return
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
  openSheetClose = close
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

function copyText(text) {
  const done = () => toast('Kopiert')
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done, () => toast('Kopieren ging nicht', 'info'))
  const ta = Object.assign(document.createElement('textarea'), { value: text })
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.append(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  ok ? done() : toast(`Bitte von Hand kopieren: ${text}`, 'info')
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
