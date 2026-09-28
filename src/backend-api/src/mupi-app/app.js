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

function route() {
  const page = currentPage()
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
  // two columns on a wide PC screen when the page has several cards
  main.classList.toggle('cols', main.querySelectorAll(':scope > .card').length >= 3)
  wire(main, page)
}

function hasSettings(page) {
  return (page.sections || []).some((s) => (s.items || []).some((i) => i.key || i.type === 'buttons'))
}

// Pages that are drawn by the app itself (not only from the schema); filled in the next steps
function customTop(page) {
  switch (page.id) {
    case 'start':
      return [
        `<div class="card hero wide"><h2>Läuft gerade</h2><div class="placeholder">${icon('music')}Wiedergabe, Bedienung und Lautstärke – kommt in Schritt 2.</div></div>`,
        `<div class="card"><h2>Status</h2><div class="placeholder">${icon('bat')}Akku, heute gehört, Ruhezeit, WLAN – kommt in Schritt 2.</div></div>`,
        `<div class="card"><h2>Schnell</h2><div class="btns"><button class="btn accent" data-act="toast:+15 min (noch nicht verbunden)">+15 min</button><button class="btn" data-act="toast:Ruhe sofort (noch nicht verbunden)">Ruhe sofort</button><button class="btn" data-go="spielzeit">Schlaftimer</button></div></div>`,
      ]
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
      if (t.startsWith('ext:')) toast('Öffnet sich künftig in einem neuen Fenster', 'info')
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
