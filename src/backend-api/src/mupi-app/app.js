// MuPiBox app – one app for everything (replaces the admin interface and the parents' web app step by step).
//
// The pages come from schema.json: areas, settings groups, pages with sections and
// their building blocks (toggle, slider, select, …). This file draws them and handles navigation, sheets, search,
// the light/dark switch and the login. Pages are connected to the box one by one (see docs/app-mapping.md): until a
// page is in CONNECTED, its controls only change locally and the page says so.

import { getLang, getLangPref, langBadge, LANGS, loadLanguage as loadAppLanguage, localeTag, setLangPref, tr, watchDocument } from './i18n.js'
import { icon } from './icons.js'

const API = '/api/app'
// The app's own port (8200): the display's pages are there, also when the app is used through port 80 (whose root is
// the admin interface's)
const BOX_ORIGIN = `http://${location.hostname}:8200`
// Where Spotify sends the browser back after the login: https through the box's web server (port 443) - Spotify takes
// no http addresses except 127.0.0.1. It has to be entered in the Spotify app. Which one the box uses comes from the box
// (eltern/oauth.ts redirectModeOf: /app/spotify-callback, or /spotify.php for a box set up before the app).
const spotifyRedirect = () => spot.access?.redirectUris?.[spot.access.redirectMode] ?? `https://${location.hostname}/app/spotify-callback`
// numbers and dates in the language of the app (see i18n.js)
let LOCALE = localeTag()

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
  bySlug: new Map(), // address (#/battery) -> id
  values: new Map(), // setting key -> current value (defaults until the page is connected)
  csrf: '',
  boxName: 'MuPiBox',
}

const $ = (sel, root = document) => root.querySelector(sel)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------- start ---------- */

// (a request the box never answers - its backend busy or restarting - ends after this long instead of leaving the
// start screen there for ever; see bootWatch)
const BOOT_REQUEST_MS = 15_000
const withinBoot = (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('Die Box hat nicht geantwortet.')), BOOT_REQUEST_MS))])

async function boot() {
  window.mupiBootStep = 'language'
  await loadAppLanguage()
  watchDocument()
  window.mupiBootStep = 'box'
  const [schema, session] = await Promise.all([
    withinBoot(fetch('schema.json', { cache: 'no-cache' }).then((r) => r.json())),
    withinBoot(fetch(`${API}/session`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null))).catch(() => null),
  ])
  window.mupiBootStep = 'page'
  state.schema = schema
  for (const p of schema.pages) {
    state.pages.set(p.id, p)
    if (p.slug) state.bySlug.set(p.slug, p.id)
  }
  for (const g of schema.settingsGroups) {
    // the settings groups are pages of their own in the schema; keep their icon and text for the lists
    const page = state.pages.get(g.id)
    if (page) Object.assign(page, { icon: page.icon || g.icon, description: page.description || g.description })
  }
  if (!session?.csrf_token || new URLSearchParams(location.search).has('portal')) {
    window.mupiBootStep = ''
    renderLogin(!!session?.csrf_token)
    return
  }
  state.csrf = session.csrf_token
  // (open in the home network: no login, so no logout either)
  state.open = session.open === true
  const back = new URLSearchParams(location.search)
  if (back.has('spotify_connected') || back.has('spotify_error')) {
    // (back to the page that started the login: the assistant goes on with its last step)
    const from = back.get('from') === 'wizard' ? 'wizard' : 'spotify'
    history.replaceState(null, '', `${location.pathname.replace(/\/?$/, '/')}${hashOf(from)}`)
    setTimeout(() => toast(back.has('spotify_connected') ? 'Mit Spotify verbunden' : `Spotify-Anmeldung fehlgeschlagen (${back.get('spotify_error')})`, back.has('spotify_connected') ? 'ok' : 'info'), 300)
  }
  loadBoxName()
  // (back and forward: popstate; an address typed or a link with #/…: hashchange)
  window.addEventListener('popstate', routeIfMoved)
  window.addEventListener('hashchange', routeIfMoved)
  refreshOnReturn()
  route()
  window.mupiBootStep = ''
}

// "Verbinde mit der Box …" stayed for ever when the start got stuck (a request the box did not answer): after a
// while the screen says which step it is at, and offers the two ways out - loading again, or the login page
// (/app/?portal), which got people in when the page itself did not.
const BOOT_STEPS = { language: 'Schritt: Sprache laden', box: 'Schritt: Antwort der Box', page: 'Schritt: Seite aufbauen' }
function bootWays() {
  return `<div class="boot-actions"><button type="button" class="btn primary" data-boot="reload">Neu laden</button><button type="button" class="btn" data-boot="login">Zur Anmeldung</button></div>`
}
function wireBootWays() {
  $('[data-boot="reload"]')?.addEventListener('click', () => location.reload())
  $('[data-boot="login"]')?.addEventListener('click', () => {
    location.href = `${location.pathname.replace(/\/?$/, '/')}?portal`
  })
}
setTimeout(() => {
  const p = $('#content .loading p')
  if (!p || !window.mupiBootStep) return
  p.textContent = 'Das dauert länger als gewohnt.'
  p.insertAdjacentHTML('afterend', `<p class="help">${esc(BOOT_STEPS[window.mupiBootStep] ?? window.mupiBootStep)}</p>${bootWays()}`)
  wireBootWays()
}, 12_000)

// On the phone the app stays open in the background (home screen: no reload, no pull to refresh). Back after a while:
// the page shown is loaded afresh, unless something is being typed or a sheet is open.
function refreshOnReturn() {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      return
    }
    const away = hiddenAt && Date.now() - hiddenAt > 60_000
    const busy = !$('#sheet').hidden || document.activeElement?.matches?.('input, textarea, select')
    if (!away || busy || !state.csrf) return
    // (where one was on the page stays)
    const y = window.scrollY
    const page = currentPage()
    stopPageTimers()
    renderChrome(page)
    renderPage(page).then(() => window.scrollTo(0, y))
  })
}

async function loadBoxName() {
  try {
    const r = await fetch(`${API}/bootscreen`, { credentials: 'same-origin' })
    if (r.ok) {
      const name = (await r.json())?.current?.boxName
      if (typeof name === 'string' && name.trim()) state.boxName = name.trim()
      // (the name of the tab and of the icon when the app is put on the home screen)
      document.title = state.boxName
      const title = $('meta[name="apple-mobile-web-app-title"]')
      if (title) title.content = state.boxName
      renderChrome(currentPage())
    }
  } catch {
    /* the name is only cosmetic */
  }
}

/* ---------- routing ---------- */

// The address of a page is its English slug (#/battery); the ids in the code stay as they are. The old addresses
// (#/akku: bookmarks, home-screen icons) still lead to their page.
const hashOf = (id) => `#/${state.pages.get(id)?.slug ?? id}`
function currentId() {
  const name = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  if (state.bySlug.has(name)) return state.bySlug.get(name)
  return state.pages.has(name) ? name : 'start'
}
function currentPage() {
  return state.pages.get(currentId())
}
function go(id) {
  // (an address outside the app, e.g. "Erweiterte Einstellungen": whoever wired the click)
  if (String(id).startsWith('ext:')) return openExternal(id.slice(4))
  // (the address by pushState, then drawn: setting location.hash made the app on the iPhone's home screen load itself
  // again after every change of page - "Verbinde mit der Box …" - while Safari and Chrome only fired hashchange)
  if (location.hash !== hashOf(id)) history.pushState(null, '', hashOf(id))
  route()
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
  return id
}
// one timer of the page ends (the others go on)
function stopTimer(id) {
  clearInterval(id)
  pageTimers.delete(id)
}
function stopPageTimers() {
  for (const id of pageTimers) clearInterval(id)
  pageTimers.clear()
}

// The pages walked through since the last tab (Start, Hören, …): the back button returns to the one before - Spotify
// opened from the start page goes back there, not to the library it belongs to. A page shown again cuts the trail
// there (Spotify › Assistent › "Zur Spotify-Seite": back leads where Spotify was opened from).
const trail = []
function noteTrail(page) {
  if (!page.parent) {
    trail.length = 0
    trail.push(page.id)
    return
  }
  const at = trail.indexOf(page.id)
  if (at >= 0) trail.length = at + 1
  else trail.push(page.id)
}
// where the back button leads: the page before, else (opened by a link, reloaded) the one above
function backTarget(page) {
  return trail.length >= 2 && trail.at(-1) === page.id ? trail.at(-2) : page.parent || 'start'
}

// The address drawn last: a step back fires popstate and hashchange - drawn once
let routedHash = null
function routeIfMoved() {
  if (location.hash !== routedHash) route()
}

function route() {
  const page = currentPage()
  noteTrail(page)
  // an old or unknown address: the page's own one in the address bar (no extra step back)
  if (location.hash && location.hash !== hashOf(page.id)) history.replaceState(null, '', hashOf(page.id))
  routedHash = location.hash
  stopPageTimers()
  closeSheet() // (a sheet belongs to the page it was opened on)
  renderChrome(page)
  renderPage(page)
  window.scrollTo(0, 0)
  $('#content').focus({ preventScroll: true })
}

/* ---------- language of the app (the button in the top bar and on the login page) ---------- */

const LANG_AUTO_LABEL = 'Automatisch (Sprache des Browsers)'

function langButton() {
  return `<button class="lang-btn" id="lang-btn" aria-label="Sprache der App">${icon('globe', 20)}<span translate="no">${esc(langBadge())}</span></button>`
}

function openLangSheet() {
  const pref = getLangPref()
  const opt = (code, name, badge) => {
    const on = pref === code
    return `<button class="lang-opt${code === 'auto' ? ' wide' : ''}" data-lang="${code}" aria-pressed="${on}">
      <span class="lang-code" translate="no">${esc(badge)}</span><span class="lang-name"${code === 'auto' ? '' : ' translate="no"'}>${esc(name)}</span>${on ? icon('check', 18) : ''}</button>`
  }
  openSheet(
    `<h2>Sprache der App</h2>
     <div class="lang-grid">${opt('auto', LANG_AUTO_LABEL, 'Auto')}${Object.entries(LANGS)
       .map(([code, name]) => opt(code, name, code.toUpperCase()))
       .join('')}</div>
     <p class="help" style="margin:0">Gilt nur für diese App in diesem Browser. Die Sprache der Box (Display, Startbilder) stellst du unter Einstellungen › System › Sprache ein.</p>`,
    (sheet, close) => {
      for (const b of sheet.querySelectorAll('[data-lang]')) {
        b.onclick = async () => {
          close()
          await changeAppLanguage(b.dataset.lang)
        }
      }
    },
  )
}

// right away, without loading the app again: the language, then everything drawn once more
async function changeAppLanguage(code) {
  await setLangPref(code)
  LOCALE = localeTag()
  // (the same setting as under System › Sprache)
  state.values.set('appLang', code === 'auto' ? APP_LANG_AUTO : LANGS[code])
  const page = state.csrf ? currentPage() : null
  if (page) {
    renderChrome(page)
    await renderPage(page, false)
  } else renderLogin()
  toast(`Sprache: ${code === 'auto' ? 'Automatisch' : LANGS[code]}`)
}

// MuPi: with an outline on the light design (white on light blue is too weak), the plain one on the dark
function mupiImg(attrs = '') {
  return `<img class="mupi-d" src="mupi.svg" alt="" ${attrs}><img class="mupi-l" src="mupi-hell.svg" alt="" ${attrs}>`
}

/* ---------- frame: top bar, tab bar, side bar ---------- */

function renderChrome(page) {
  if (!page) return
  const area = areaOf(page)
  const isArea = !page.parent
  const title = page.id === 'start' ? state.boxName : page.title
  $('#topbar').innerHTML = `
    ${isArea ? `<div class="brand-dot">${mupiImg()}</div>` : `<button class="icon-btn" id="back" aria-label="Zurück">${icon('back')}</button>`}
    <div class="title">${esc(title)}</div>
    ${langButton()}
    ${themeButton()}
    ${state.open ? '' : `<button class="icon-btn" id="logout-btn" aria-label="Abmelden">${icon('logout')}</button>`}`
  $('#back')?.addEventListener('click', () => go(backTarget(page)))
  $('#lang-btn').addEventListener('click', openLangSheet)
  $('#theme-btn').addEventListener('click', toggleTheme)
  $('#logout-btn')?.addEventListener('click', () => confirmSheet('Abmelden', 'Von der App abmelden? Danach fragt sie wieder nach dem Passwort.', logout))

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
    <div class="brand"><span class="brand-dot">${mupiImg()}</span><span>${esc(state.boxName)}</span></div>
    ${AREAS.map(
      (a) => `<button class="side-link" data-go="${a.id}" ${a.id === area && !(area === 'einstellungen' && page.id !== 'einstellungen') ? 'aria-current="page"' : ''}>${icon(a.icon)}${a.title}</button>
      ${a.id === 'einstellungen' ? groups.map((g) => `<button class="side-link sub" data-go="${g.id}" ${g.id === groupOf ? 'aria-current="page"' : ''}>${icon(g.icon, 18)}${esc(g.title)}</button>`).join('') : ''}`,
    ).join('')}`
  for (const el of document.querySelectorAll('[data-go]')) el.onclick = () => go(el.dataset.go)
}

function themeButton() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  return `<button class="icon-btn soft" id="theme-btn" aria-label="${theme === 'light' ? 'Dunkel' : 'Hell'}">${icon(theme === 'light' ? 'moon' : 'sun')}</button>`
}

// the phone's bars around the app (status bar, browser) in the page's background colour (as index.html sets it)
function themeColor(theme) {
  const meta = $('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'light' ? '#F3F6F9' : '#0F1522'
}

function toggleTheme() {
  const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', now)
  themeColor(now)
  try {
    localStorage.setItem('mupi-theme', now)
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  // (not signed in: only the buttons of the login page)
  if (state.csrf) renderChrome(currentPage())
  else renderLoginBar()
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
      // without its values a page would draw empty or wrong (the NAS page: an empty login form) - it says so instead
      console.error(err)
      if (token !== renderToken) return
      return pageNotLoaded(main, page)
    }
    if (token !== renderToken) return
  }
  const parts = []
  const connected = CONNECTED.has(page.id) || !!ctrl
  if (page.description && page.parent) parts.push(`<p class="page-intro">${esc(page.description)}</p>`)
  if (!connected && hasSettings(page)) {
    parts.push(`<div class="preview-note">${icon('info', 18)}<span>Vorschau: Diese Seite ist noch nicht mit der Box verbunden. Änderungen werden nicht gespeichert.</span></div>`)
  }
  try {
    parts.push(...customTop(page))
    // a connected page may put its own values into the schema's building blocks (lists, charts, …)
    const sections = ctrl?.sections?.(page) ?? page.sections ?? []
    // (kept for the handlers: a select's options may come from the box, see findItem)
    state.shown = { id: page.id, sections }
    for (const sec of sections) parts.push(renderSection(sec))
  } catch (err) {
    // the box's values did not come (the page cannot be drawn without them): say so, instead of "Lade …" for ever
    console.error(err)
    return pageNotLoaded(main, page)
  }
  parts.push(...childNav(page))
  // a redraw with the values already loaded (after a change) stays where the user is
  const keepScroll = !reload && main.dataset.page === page.id ? window.scrollY : null
  main.innerHTML = parts.join('')
  main.dataset.page = page.id
  // two columns on a wide PC screen when the page has several cards (the start page has its own layout)
  main.classList.toggle('start', page.id === 'start')
  main.classList.toggle('cols', page.id !== 'start' && main.querySelectorAll(':scope > .card, :scope > .col-stack').length >= 2)
  // (a page drawn again sets up its polling again: the timers of the drawing before go, else they pile up)
  stopPageTimers()
  wire(main, page)
  try {
    if (page.id === 'start') mountStart(main)
    ctrl?.mount?.(main, page)
  } catch (err) {
    console.error(err)
    toast('Ein Teil der Seite ließ sich nicht einrichten', 'info')
  }
  // (a pin on each card with a heading, see pinInject)
  pinInject(main, page)
  balanceCols(main)
  if (keepScroll != null) window.scrollTo(0, keepScroll)
}

// Two columns on the PC: the cards go into two columns of their own, each into the one that is shorter so far (in the
// page's order; a card with data-col into that one). In rows of the grid the taller card of a row set its height, and
// a short card left a gap under it. Wide cards stay across both; pages with their own layout (.col-stack) are left.
const WIDE_SCREEN = window.matchMedia('(min-width: 1200px)')
const OWN_LAYOUT = new Set(['start', 'ueber', 'rechtliches'])

function balanceCols(main) {
  // (first back into the page's order: on a phone, and before sorting again)
  // (a page drawn anew has no columns of its own any more: nothing to put back)
  if (main._order && main.querySelector(':scope > .auto-col')) {
    for (const s of main.querySelectorAll(':scope > .auto-col')) s.remove()
    for (const el of main._order) main.appendChild(el)
  }
  main._order = null
  if (!WIDE_SCREEN.matches || !main.classList.contains('cols') || OWN_LAYOUT.has(main.dataset.page) || main.querySelector(':scope > .col-stack')) return
  const kids = [...main.children]
  const runs = []
  let run = []
  for (const el of kids) {
    if (el.matches('.card') && !el.matches('.wide')) run.push(el)
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  // (two cards are side by side anyway)
  const sorted = runs.filter((r) => r.length >= 3 || r.some((c) => c.dataset.col))
  if (!sorted.length) return
  main._order = kids
  for (const cards of sorted) {
    const heights = cards.map((c) => c.getBoundingClientRect().height)
    const cols = [document.createElement('div'), document.createElement('div')]
    const h = [0, 0]
    for (const c of cols) c.className = 'col-stack auto-col'
    cards[0].before(cols[0], cols[1])
    cards.forEach((c, i) => {
      const at = c.dataset.col ? Number(c.dataset.col) - 1 : h[0] <= h[1] ? 0 : 1
      cols[at].appendChild(c)
      h[at] += heights[i]
    })
  }
}
WIDE_SCREEN.addEventListener('change', () => {
  const main = $('#content')
  if (main) balanceCols(main)
})

// A page whose values did not come from the box: a card that says so and tries again
function pageNotLoaded(main, page) {
  main.innerHTML = `<section class="card"><h2>Nicht geladen</h2><p class="help">Die Werte dieser Seite ließen sich nicht von der Box laden.</p>
    <div class="btns"><button class="btn primary" id="page-retry">Erneut versuchen</button></div></section>`
  main.dataset.page = page.id
  main.classList.remove('start', 'cols')
  $('#page-retry', main).onclick = () => renderPage(page)
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
  // the settings: a card per group (as the design; two columns on the PC)
  if (page.id === 'einstellungen') {
    return [
      `<div class="group-grid wide">${kids
        .map(
          (k) =>
            `<button class="group-card" data-go="${esc(k.id)}"><span class="tile">${icon(k.icon || 'chevron', 20)}</span><span class="lbl"><b>${esc(k.title)}</b>${k.description ? `<small>${esc(k.description)}</small>` : ''}</span><span class="chev">${icon('chevron', 18)}</span></button>`,
        )
        .join('')}</div>`,
    ]
  }
  return [`<div class="card nav-card"><div class="navlist">${kids.map((k) => navRow(k.id, k.title, k.description, k.icon)).join('')}</div></div>`]
}

// (badge: a place right in the row for a short state, filled later - "5.0.4", "Update verfügbar")
function navRow(target, title, subtitle, ic, badge = '') {
  const ext = String(target).startsWith('ext:')
  return `<button class="navrow" data-go="${esc(target)}"><span class="tile">${icon(ic || state.pages.get(target)?.icon || 'chevron', 18)}</span>
    <span class="lbl"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${badge}<span class="chev">${icon(ext ? 'ext' : 'chevron', 18)}</span></button>`
}

function renderSection(sec) {
  const items = (sec.items || []).map(renderItem).join('')
  // (the page's save button under its cards, over both columns - not in the last card, as if it saved only that)
  if (sec.bar) return `<div class="btns save-bar wide">${items}</div>`
  const wide = sec.wide === true || (sec.items || []).some((i) => ['themegrid', 'bootgrid', 'log', 'json', 'checks'].includes(i.type))
  const onlyNav = (sec.items || []).length > 0 && sec.items.every((i) => i.type === 'nav')
  // sec.col: the column on the PC (1 left, 2 right; see balanceCols), sec.badge: a chip beside the title
  const head = sec.title
    ? sec.badge
      ? `<div class="card-head"><h2>${esc(sec.title)}</h2><span class="chip ${esc(sec.badge.kind ?? '')}">${esc(sec.badge.text)}</span></div>`
      : `<h2>${esc(sec.title)}</h2>`
    : ''
  // (data-card: the card's id for pinning it to the start page, from the heading as the schema has it - see pinInject)
  return `<section class="card${wide ? ' wide' : ''}${onlyNav && !sec.title ? ' nav-card' : ''}${sec.cls ? ` ${esc(sec.cls)}` : ''}"${sec.col ? ` data-col="${sec.col}"` : ''}${sec.title ? ` data-card="${esc(pinSlug(sec.title))}"` : ''}>
    ${head}${sec.help ? `<p class="help">${esc(sec.help)}</p>` : ''}${items}</section>`
}

function value(item) {
  if (!state.values.has(item.key)) state.values.set(item.key, item.default)
  return state.values.get(item.key)
}

// A building block that belongs to a switch (it.dep: its key): shown only while the switch is on, a little indented;
// it.dim: shown, but dimmed while it is off (see wire)
function renderItem(it) {
  const html = renderItemOnly(it)
  if (it.dep) return `<div class="dep" data-dep="${esc(it.dep)}"${state.values.get(it.dep) ? '' : ' hidden'}>${html}</div>`
  if (it.dim) return `<div class="dimmable${state.values.get(it.dim) ? '' : ' off'}" data-dim="${esc(it.dim)}">${html}</div>`
  return html
}

// A slider over fixed steps (it.stops: 0, 1, 2, 5, 10 … min): the range runs over their places
const stopIndex = (it, v) => Math.max(0, it.stops.findIndex((s) => s >= Number(v)))
const rangeValue = (it, el) => (it.stops ? it.stops[Number(el.value)] : Number(el.value))

function renderItemOnly(it) {
  const help = it.help ? `<small${it.helpId ? ` id="${esc(it.helpId)}"` : ''}>${esc(it.help)}</small>` : ''
  // (a technical name beside the label, small: "Voll · 100 %" v_100)
  const sub = it.sub ? ` <span class="lbl-sub" translate="no">${esc(it.sub)}</span>` : ''
  switch (it.type) {
    case 'toggle':
      return `<div class="row"><span class="lbl"><b>${esc(it.label)}</b>${help}</span>
        <label class="switch"><input type="checkbox" data-key="${esc(it.key)}" ${value(it) ? 'checked' : ''} ${it.disabled ? 'disabled' : ''} aria-label="${esc(it.label)}"><span></span></label></div>`
    case 'slider': {
      const v = Number(value(it))
      const [min, max, at] = it.stops ? [0, it.stops.length - 1, stopIndex(it, v)] : [it.min, it.max, v]
      const fill = ((at - min) / (max - min)) * 100
      const ends = it.stops ? [it.stops[0], it.stops[it.stops.length - 1]] : [it.min, it.max]
      return `<div class="field"><div class="slider-head"><label for="k-${esc(it.key)}">${esc(it.label)}</label><span class="value-pill" data-out="${esc(it.key)}">${fmt(v, it)}</span></div>
        <input type="range" id="k-${esc(it.key)}" data-key="${esc(it.key)}" min="${min}" max="${max}" step="${it.stops ? 1 : it.step ?? 1}" value="${at}" style="--fill:${fill}%"${it.disabled ? ' disabled' : ''}>
        <div class="range-ends"><span>${fmt(ends[0], it)}</span><span>${fmt(ends[1], it)}</span></div>${help}</div>`
    }
    // several fields side by side (it.cols: their widths, e.g. "2fr 1fr"); under each other on a narrow phone
    case 'pair':
      return `<div class="pair${it.keep ? ' keep' : ''}${it.cls ? ` ${esc(it.cls)}` : ''}" style="--cols:${esc(it.cols ?? `repeat(${it.items.length}, minmax(0, 1fr))`)}">${it.items.map(renderItem).join('')}</div>`
    // a number with − and + (instead of a slider from 1 to 99, where one hardly hits 9)
    case 'stepper':
      return `<div class="row stepper-row"><span class="lbl"><b>${esc(it.label)}</b>${help}</span>
        <div class="stepper"><button type="button" class="icon-btn soft" data-step="-1" data-for="${esc(it.key)}" aria-label="Weniger">−</button>
        <input class="input" type="number" id="k-${esc(it.key)}" data-key="${esc(it.key)}" min="${it.min}" max="${it.max}" value="${esc(value(it))}" aria-label="${esc(it.label)}">
        <button type="button" class="icon-btn soft" data-step="1" data-for="${esc(it.key)}" aria-label="Mehr">+</button></div></div>`
    // a page's own drawing inside a card (a preview, a chart)
    case 'html':
      return it.html
    case 'select':
      return `<div class="field"><label>${esc(it.label)}</label>
        <button class="select-btn" data-select="${esc(it.key)}"><span data-out="${esc(it.key)}">${esc(value(it))}</span>${icon('chevron', 18)}</button>${help}</div>`
    case 'seg':
      return `<div class="field"><label>${esc(it.label)}</label><div class="seg" data-seg="${esc(it.key)}">${it.options
        .map((o) => `<button aria-pressed="${o === value(it)}" data-v="${esc(o)}">${esc(o)}</button>`)
        .join('')}</div></div>`
    case 'text': {
      const kind = it.kind || 'text'
      const type = kind === 'password' ? 'password' : kind === 'number' ? 'number' : kind === 'url' ? 'url' : kind === 'time' ? 'time' : 'text'
      const unit = it.unit ? `<span class="unit">${esc(it.unit)}</span>` : ''
      const eye = kind === 'password' ? `<button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button>` : ''
      return `<div class="field"><label for="k-${esc(it.key)}">${esc(it.label)}${sub}</label>
        <div class="input-wrap"><input class="input${unit ? ' has-unit' : ''}${eye ? ' has-eye' : ''}${it.mono ? ' mono' : ''}" id="k-${esc(it.key)}" type="${type}" data-key="${esc(it.key)}"
          value="${esc(kind === 'password' ? '' : value(it) ?? '')}" placeholder="${esc(it.placeholder ?? '')}" ${NO_PW_MANAGER}>${unit}${eye}</div>${help}</div>`
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
      // (with its values: each above its bar, as the battery's chart - the bars alone gave no scale)
      if (it.shown)
        return `<div class="chart vals" style="--n:${it.vals.length}">${it.vals
          .map(
            (v, i) =>
              `<div class="col${i === it.vals.length - 1 ? ' today' : ''}"><div class="bar-area"><b translate="no">${esc(it.shown[i] ?? '')}</b><i style="height:calc((100% - 18px) * ${v / max})"></i></div><span>${esc(it.labels?.[i] ?? '')}</span></div>`,
          )
          .join('')}</div>`
      return `<div class="chart" style="--n:${it.vals.length}">${it.vals
        .map((v, i) => `<div class="col${i === it.vals.length - 1 ? ' today' : ''}"><i style="height:${(v / max) * 100}%"></i>${esc(it.labels?.[i] ?? '')}</div>`)
        .join('')}</div>`
    }
    case 'note':
    case 'warn':
      return `<div class="note${it.type === 'warn' ? ' warn' : ''}">${icon('info', 18)}<span>${esc(it.text)}</span></div>`
    case 'rows':
      return `<div class="rows">${it.rows
        .map((r) => `<div class="entry"><span class="avatar">${esc(initials(r.t))}</span><span class="lbl"><b${r.tr ? '' : ' translate="no"'}>${esc(r.t)}</b>${r.s ? `<small translate="no">${esc(r.s)}</small>` : ''}</span>${r.r ? `<span class="chip">${esc(r.r)}</span>` : ''}</div>`)
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
  // (a slider whose 0 means "never": it says so)
  if (n === 0 && it.zero) return it.zero
  return `${Number.isInteger(n) ? n : n.toLocaleString(LOCALE)}${it.unit ?? ''}`
}

/* ---------- behaviour of the drawn page ---------- */

// A setting changed on the page: saved by the page's controller. When it says the box did not take it (false), the
// control goes back to the value it had - it must not show what the box does not do.
const shownValues = new Map()
async function commitChange(page, key, v, before) {
  const ok = await ctrlOf(page)?.change?.(key, v, page)
  if (ok === false) {
    state.values.set(key, before)
    if (currentPage()?.id === page.id) renderPage(page, false)
  } else shownValues.set(key, v)
}

function wire(root, page) {
  // (the values as drawn: what a change that fails goes back to)
  shownValues.clear()
  for (const [k, v] of state.values) shownValues.set(k, v)
  const commit = (key, v) => commitChange(page, key, v, shownValues.get(key))
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
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? rangeValue(it, el) : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value
      state.values.set(el.dataset.key, v)
      if (el.type === 'checkbox') {
        // what belongs to the switch shows or dims with it
        for (const d of root.querySelectorAll(`[data-dep="${CSS.escape(el.dataset.key)}"]`)) d.hidden = !v
        for (const d of root.querySelectorAll(`[data-dim="${CSS.escape(el.dataset.key)}"]`)) d.classList.toggle('off', !v)
        commit(el.dataset.key, v)
      }
      if (el.type === 'range') {
        const [min, max] = it.stops ? [0, it.stops.length - 1] : [it.min, it.max]
        el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min)) * 100}%`)
        const out = root.querySelector(`[data-out="${CSS.escape(el.dataset.key)}"]`)
        if (out) out.textContent = fmt(v, it)
      }
    })
  }
  for (const el of root.querySelectorAll('input[type="range"][data-key]')) {
    el.addEventListener('change', () => commit(el.dataset.key, rangeValue(findItem(page, el.dataset.key), el)))
  }
  // − and + of a number: one step, within its limits, saved as a typed number is
  for (const b of root.querySelectorAll('[data-step]')) {
    b.onclick = () => {
      const input = $(`#k-${CSS.escape(b.dataset.for)}`, root)
      const next = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + Number(b.dataset.step)))
      if (next === Number(input.value)) return
      input.value = String(next)
      state.values.set(b.dataset.for, next)
      input.dispatchEvent(new Event('change'))
    }
  }
  for (const el of root.querySelectorAll('input.input[data-key]')) {
    // text and number fields are saved when they are left (or with Enter)
    el.addEventListener('change', () => commit(el.dataset.key, el.type === 'number' ? Number(el.value) : el.value))
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
      commit(seg.dataset.seg, b.dataset.v)
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
async function openExternal(which) {
  const host = location.hostname
  if (which === 'dietpi') {
    window.open(`http://${host}:5252/`, '_blank', 'noopener')
    return
  }
  // the admin interface, signed in with a one-time ticket of this app's session (no second login there). The window
  // opens at once: one opened after waiting for the ticket is blocked as a popup.
  const win = window.open('', '_blank')
  let url = `${location.protocol === 'https:' ? 'https' : 'http'}://${host}/index.php`
  const r = await api(`${API}/admin-ticket`, { method: 'POST' })
  if (r.ok && r.body?.ticket) url += `?app_ticket=${r.body.ticket}`
  if (!win) {
    location.href = url
    return
  }
  win.opener = null
  win.location.href = url
}

// the building block as shown (a connected page may have filled in its own options), else the schema's
function findItem(page, key) {
  // (also inside a pair of fields)
  const inItems = (items) => {
    for (const i of items || []) {
      if (i.key === key) return i
      const inner = i.items && inItems(i.items)
      if (inner) return inner
    }
    return null
  }
  for (const s of (state.shown?.id === page.id ? state.shown.sections : page.sections) || []) {
    const hit = inItems(s.items)
    if (hit) return hit
  }
  return {}
}

// The schema's building block with this key, with what the page changes in it
function schemaItem(page, key, over = {}) {
  for (const s of page.sections || []) for (const i of s.items || []) if (i.key === key) return { ...i, ...over }
  return { key, ...over }
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
  if (r.status === 401 && data?.error === 'unauthenticated') sessionGone()
  return { ok: r.ok, status: r.status, body: data, text }
}

// The session ended (24 h over, the box restarted, signed out elsewhere): the app starts again - with the login when
// the box asks for one, else with a new session - instead of "Das hat nicht geklappt" on every button. (At most once
// in half a minute: no loop when the box keeps refusing.)
function sessionGone() {
  if (!state.csrf) return
  state.csrf = ''
  stopPageTimers()
  try {
    const last = Number(sessionStorage.getItem('mupi-session-gone') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('mupi-session-gone', String(Date.now()))
  } catch {
    // no storage: reload anyway
  }
  toast('Die Anmeldung ist abgelaufen – die App lädt neu.', 'info')
  setTimeout(() => location.reload(), 1200)
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
      <div class="section-label">Sofort-Aktionen</div>
      <div class="quick">
        <button class="qbtn accent" id="q-plus">${icon('plus', 22)}<span>+15 min</span></button>
        <button class="qbtn blue" id="q-quiet">${icon('moon', 22)}<span id="q-quiet-label">Ruhe sofort</span></button>
        <button class="qbtn" id="q-sleep">${icon('time', 22)}<span id="q-sleep-label">Schlaftimer</span></button>
        <button class="qbtn" id="q-say">${icon('vol', 22)}<span>Durchsage</span></button>
      </div>
    </div>`,
    // (the pinned cards: see drawPins)
    `<div class="pins-area" id="pins" hidden></div>`,
    `<div class="update-note" id="update-note"></div>`,
    `<section class="card nav-card start-more"><div class="navlist">
      ${navRow('g-aussehen', 'Aussehen des Displays', 'Theme, Start- und Wartungsbilder', 'pal')}
      ${navRow('displaylive', 'Display live', 'Aktuelles Bild, Fernsteuerung (VNC)', 'display')}
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

const startState = { maxVolume: 100, volTimer: null, sleep: null, quietUntil: 0 }

// After a quick action: the start page's state now and twice more (the player takes a change over within seconds)
function statusSoon(root) {
  loadStatus(root)
  for (const ms of [1500, 5000]) setTimeout(() => root.isConnected && loadStatus(root), ms)
}

function mountStart(root) {
  drawPins(root)
  loadOutput(root)
  every(15000, () => loadOutput(root))
  root.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-out]')
    if (b) chooseOutput(root, b.dataset.out)
  })
  loadNow(root)
  loadStatus(root)
  loadVolumeCap(root)
  loadNotices(root)
  every(5000, () => loadNow(root))
  every(30000, () => loadStatus(root))
  $('#q-plus', root).onclick = async () => {
    const r = await api('/api/playtime/extend', { method: 'POST', body: { minutes: 15 } })
    toast(r.ok ? '15 Minuten mehr für heute' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    if (r.ok) statusSoon(root)
  }
  $('#q-quiet', root).onclick = () => {
    // (a quiet running: the same button ends it - the planned times and the limit count again)
    if (startState.quietUntil > Date.now()) {
      return confirmSheet('Ruhe beenden', `Die Ruhe läuft noch bis ${hhmm(startState.quietUntil)}. Jetzt beenden? Dann gelten wieder die normalen Zeiten.`, async () => {
        const r = await api('/api/playtime/override/clear', { method: 'POST', body: {} })
        toast(r.ok ? 'Ruhe beendet' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
        if (r.ok) statusSoon(root)
      })
    }
    minutesSheet('Ruhe sofort', 'Die Box spielt für diese Zeit nichts.', [15, 30, 60, 120], 30, async (m) => {
      const r = await api('/api/quiethours/now', { method: 'POST', body: { minutes: m } })
      toast(r.ok ? `Ruhe für ${m} Minuten` : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      if (r.ok) statusSoon(root)
    })
  }
  $('#q-sleep', root).onclick = () => sleepSheet(root)
  $('#q-say', root).onclick = () => saySheet()
}

async function loadNow(root) {
  const box = $('#now', root)
  if (!box) return
  const r = await api(`${API}/playback`)
  const b = r.body ?? {}
  const hasTrack = !!b.player && !!(b.title || b.artist)
  if (!r.ok || (!b.playing && !hasTrack)) {
    const empty = box.querySelector('.now-empty')
    if (!empty || empty.dataset.ok !== String(r.ok)) {
      box.innerHTML = `<div class="now-empty" data-ok="${r.ok}">${mupiImg('class="now-mupi" width="92" height="96"')}
        <b>${r.ok ? 'Die Box ist ruhig.' : 'Keine Verbindung zur Box'}</b><small>${r.ok ? 'Gerade läuft nichts.' : 'Der Status ist gerade nicht erreichbar.'}</small>
        <button class="btn primary" data-go="hoeren">${icon('phones', 18)}Etwas abspielen</button></div>${volumeRow()}`
      box.querySelector('[data-go]').onclick = () => go('hoeren')
      wireVolume(root)
      showCap(root)
    }
    setVolume(root, b.volume)
    return
  }
  if (!box.querySelector('.now-track')) {
    box.innerHTML = `<div class="now-track">
        <div class="now-cover"><img alt="" hidden><span>${icon('music', 32)}</span></div>
        <div class="now-text"><span class="now-label"></span><b class="now-title" translate="no"></b><small class="now-meta" translate="no"></small></div>
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

// Where the box plays (backend-api audio-output.ts), for the row above the volume: kept here, the card is drawn anew
// every few seconds (see loadNow); read again every 15 s and after a change
const outState = { data: null, busy: null }

function outputRow() {
  const o = outState.data
  if (!o?.devices?.length) return ''
  const btn = (target, ic, label) =>
    `<button data-out="${esc(target)}" aria-pressed="${o.current === target}" ${outState.busy ? 'disabled' : ''}>${outState.busy === target ? '<span class="spin sm"></span>' : icon(ic, 16)}<span translate="${target === 'box' ? 'yes' : 'no'}">${esc(label)}</span></button>`
  return `<div class="out-row"><span class="out-label">Ausgabe</span><div class="seg out-seg">${btn('box', 'vol', 'Lautsprecher')}${o.devices.map((d) => btn(d.mac, 'phones', d.name)).join('')}</div></div>`
}

async function loadOutput(root) {
  const r = await api('/api/audio-output')
  if (!r.ok) return
  outState.data = r.body
  const row = $('#out-slot', root)
  if (row) row.innerHTML = outputRow()
}

// A tap on an output: the box switches (connecting a device takes some seconds)
async function chooseOutput(root, target) {
  if (outState.busy || outState.data?.current === target) return
  outState.busy = target
  const slot = $('#out-slot', root)
  if (slot) slot.innerHTML = outputRow()
  const r = await api('/api/audio-output', { method: 'POST', body: { target } })
  outState.busy = null
  const name = target === 'box' ? tr('Lautsprecher') : (outState.data?.devices ?? []).find((d) => d.mac === target)?.name ?? ''
  toast(r.ok ? `${tr('Ausgabe')}: ${name}` : r.status === 504 ? `${name}: ${tr('nicht gefunden – ist es an?')}` : 'Das ging nicht', r.ok ? 'ok' : 'info')
  await loadOutput(root)
}

function volumeRow() {
  return `<div id="out-slot">${outputRow()}</div><div class="now-vol">${icon('vol', 20)}<div class="vol-wrap"><input type="range" id="vol" min="0" max="100" step="1" value="0" aria-label="Lautstärke"><i class="vol-cap" hidden></i></div><span class="value-pill" id="vol-out">–</span></div>`
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
  if (!input || !Number.isFinite(v) || input.dataset.dragging === '1') return
  input.value = v
  input.style.setProperty('--fill', `${v}%`)
  $('#vol-out', root).textContent = `${v} %`
}

function wireVolume(root) {
  const input = $('#vol', root)
  if (!input) return
  showCap(root)
  const hold = (on) => () => (input.dataset.dragging = on ? '1' : '')
  input.addEventListener('pointerdown', hold(true))
  for (const ev of ['pointerup', 'pointercancel', 'change']) input.addEventListener(ev, hold(false))
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
  const charging = batteryCharging(hat.body)
  if (hat.ok && noBattery(hat.body)) setTile(root, 'tile-akku', 'Netzbetrieb', null, 'ok')
  else setTile(root, 'tile-akku', Number.isFinite(pct) ? `${pct} %${charging ? ' ⚡' : ''}` : '–', Number.isFinite(pct) ? pct : null, pct <= 15 ? 'danger' : pct <= 30 ? 'warn' : 'ok')
  // listened today
  const p = pt.body?.playtime ?? {}
  // (bonus minutes go onto today's limit: without one they do nothing)
  const plus = $('#q-plus', root)
  if (plus) {
    plus.disabled = !p.enabled
    plus.title = p.enabled ? '' : 'Nur mit Tageslimit'
  }
  if (p.enabled && Number.isFinite(p.limitMinutes)) {
    const used = Math.floor((p.usedSeconds ?? 0) / 60)
    setTile(root, 'tile-spielzeit', `${used} / ${p.limitMinutes} min`, p.limitMinutes > 0 ? Math.min(100, (used / p.limitMinutes) * 100) : 100, p.state === 'blocked' ? 'danger' : 'accent')
  } else if (Number.isFinite(p.usedSeconds)) {
    setTile(root, 'tile-spielzeit', `${Math.floor(p.usedSeconds / 60)} min`, null)
  } else {
    // (limit and quiet times off: the player keeps no count - the listening history has it)
    const log = await api(`${API}/playlog?range=today`)
    setTile(root, 'tile-spielzeit', Number.isFinite(log.body?.totalMinutes) ? `${log.body.totalMinutes} min` : 'Kein Limit', null)
  }
  // quiet time
  // (a parent's "Ruhe sofort" or "Sperren aufheben" comes before the planned times)
  const q = pt.body?.quiet ?? {}
  const ov = pt.body?.override ?? {}
  const now = Date.now()
  let quiet = 'Aus'
  // the "Ruhe sofort" button: until when, and it ends the quiet (see mountStart)
  startState.quietUntil = ov.forceBlockUntil > now ? ov.forceBlockUntil : 0
  const quietLabel = $('#q-quiet-label', root)
  if (quietLabel) {
    // (until when: in the tile beside it - the button stays short)
    quietLabel.textContent = startState.quietUntil ? 'Ruhe beenden' : 'Ruhe sofort'
    $('#q-quiet', root).classList.toggle('on', !!startState.quietUntil)
  }
  if (ov.forceBlockUntil > now) quiet = `Ruhe bis ${hhmm(ov.forceBlockUntil)}`
  else if (ov.allowUntil > now) quiet = `Frei bis ${hhmm(ov.allowUntil)}`
  else if (q.enabled) quiet = q.state === 'blocked' || q.inWindow ? (q.label ? `Jetzt · ${q.label}` : 'Jetzt') : nextQuiet(caps.body?.quietHours?.schedule) ?? 'Keine geplant'
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
  const [hat, sync, access] = await Promise.all([api('/api/mupihat'), api('/api/spotify-sync/status'), api(`${API}/spotify-access`)])
  const notes = []
  const pct = hat.body?.Bat_Percent
  const battery = hat.ok && !noBattery(hat.body)
  if (battery && hat.body?.ChargeProblemSince) notes.push(['plug', 'Akku lädt nicht', NOT_CHARGING, 'akku'])
  if (hat.body?.BatteryStaleSince) notes.push(['bat', 'Akku-Werte veraltet', BATTERY_STALE, 'akku'])
  if (battery && Number.isFinite(pct) && pct <= 15 && !batteryCharging(hat.body)) {
    notes.push(['bat', 'Akku fast leer', `Noch ${pct} % – bitte bald laden.`, 'akku'])
  }
  // the Spotify login: refused by Spotify, or its 6 months end within two weeks (see spotifyLogin)
  const tok = sync.body?.token
  const login = access.ok ? spotifyLogin(access.body) : { state: 'none' }
  // (a tap starts the new login at Spotify right away; back on this page afterwards)
  if (login.state === 'refused') {
    notes.push(['sync', 'Spotify-Anmeldung abgelaufen', 'Die Box spielt kein Spotify. Antippen, um dich neu anzumelden.', connectSpotify])
  } else if (login.state === 'soon') {
    notes.push(['sync', 'Spotify-Anmeldung läuft bald ab', `Sie gilt bis ${login.until}. Antippen, um dich neu anzumelden.`, connectSpotify])
  } else if (login.state === 'unknown' && !remembered('mupi-spotify-unknown-dismissed')) {
    notes.push(['sync', 'Spotify: Ablauf der Anmeldung unbekannt', 'Einmal neu anmelden, dann erinnert die Box rechtzeitig. Antippen zum Anmelden.', connectSpotify, () => remember('mupi-spotify-unknown-dismissed', '1')])
  } else if (sync.body?.enabled && tok?.configured && tok.scopes_ok === false) {
    notes.push(['sync', 'Spotify-Anmeldung abgelaufen', 'Bitte neu verbinden, damit der Sync weiterläuft.', 'spotify'])
  }
  // Spotify blocks the box's requests (too many - see spotify-block.ts): until when, without reading logs
  const block = sync.body?.spotify_block
  if (block?.until && Date.parse(block.until) > Date.now()) {
    notes.push(['sync', 'Spotify sperrt die Box gerade', `Zu viele Anfragen – bis ${untilWhen(Date.parse(block.until))} zeigt die Box gespeicherte Spotify-Inhalte, Neues kommt danach.`, 'spotify'])
  }
  const box = $('#notices', root)
  if (!box) return
  drawNotices(box, notes)
  // a new version / an update running, and the MuPiBox news: the band under the player (from GitHub, which may take a
  // moment: after the rest)
  const band = $('#update-note', root)
  const [u, n] = await Promise.all([api(`${API}/updates`), api(`${API}/news`)])
  const job = u.body?.job
  const next = u.body?.update
  const items = []
  if (job?.phase === 'running') items.push(['sync', 'Update läuft', `${JOB_LABEL[job.kind] ?? 'Update'} – ${job.percent} %`, 'updates'])
  else if (next && next.version !== remembered('mupi-update-dismissed')) {
    items.push(['sync', 'Neue Version verfügbar', `MuPiBox ${next.version} (${CHANNEL_LABEL[next.channel] ?? next.channel}) · Details ansehen`, 'updates', () => remember('mupi-update-dismissed', next.version)])
  }
  const news = typeof n.body?.text === 'string' ? n.body.text.trim() : ''
  if (news) {
    // (the news as the box's developer writes them, in English: their first heading, the whole text on "Über die Box";
    // closed, they stay away until the text changes)
    const key = `${news.length}:${news.slice(0, 120)}`
    const head = new DOMParser().parseFromString(news, 'text/html').querySelector('h1,h2,h3,h4,b,strong')?.textContent?.trim()
    if (key !== remembered('mupi-news-dismissed')) {
      items.push(['info', 'Neuigkeiten', head || 'Neues von MuPiBox', () => showNews(news), () => remember('mupi-news-dismissed', key)])
    }
  }
  if (band?.isConnected) drawNotices(band, items)
}

// the whole news over the start page (not the page "Über die Box": the parents stay where they are)
function showNews(news) {
  openSheet(
    `<h2>Neuigkeiten</h2><pre class="news news-sheet">${esc(newsText(news))}</pre>
     <div class="btns"><button class="btn primary" data-close>Schließen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      // (the focus goes to the button at the end: the text still starts at the top)
      requestAnimationFrame(() => (sheet.scrollTop = 0))
    },
  )
}

// what was closed on the start page (a version's announcement, the news): it stays away until something newer comes
function remembered(name) {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}
function remember(name, value) {
  try {
    localStorage.setItem(name, value)
  } catch {
    // private mode: only for this visit
  }
}

function drawNotices(box, notes) {
  box.innerHTML = notes
    .map(
      ([ic, t, s, target]) =>
        `<div class="notice"><button class="notice-body"${typeof target === 'string' ? ` data-go="${esc(target)}"` : ''}>${icon(ic, 20)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button><button class="notice-x" aria-label="Schließen">${icon('close', 16)}</button></div>`,
    )
    .join('')
  // (the fourth part: a page to go to, or what to do instead; the fifth: what to remember when it is closed)
  box.querySelectorAll('.notice').forEach((n, i) => {
    const target = notes[i][3]
    n.querySelector('.notice-body').onclick = () => (typeof target === 'function' ? target() : go(target))
    n.querySelector('.notice-x').onclick = () => {
      n.remove()
      notes[i][4]?.()
    }
  })
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
      `<h2>Schlaftimer läuft</h2><p class="help" style="margin:0">Die Box schaltet sich in ${Math.ceil((active.remaining_seconds ?? 0) / 60)} Minuten aus${until ? ` (um ${until.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })})` : ''}.</p>
       <div class="btns"><button class="btn" data-close>Schließen</button><button class="btn danger" data-ok>Timer stoppen</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        sheet.querySelector('[data-ok]').onclick = async () => {
          close()
          const r = await api(`${API}/sleeptimer/stop`, { method: 'POST' })
          toast(r.ok ? 'Schlaftimer gestoppt' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
          setTimeout(() => loadStatus(root), 1200)
        }
      },
    )
    return
  }
  minutesSheet('Schlaftimer', 'Die Box schaltet sich danach komplett aus – egal, ob gerade etwas läuft.', [15, 30, 45, 60, 90], 30, async (m) => {
    const r = await api(`${API}/sleeptimer/start`, { method: 'POST', body: { minutes: m } })
    toast(r.ok ? `Schlaftimer: ${m} Minuten` : errorText(r), r.ok ? 'ok' : 'info')
    // (the timer script writes its state a moment later)
    setTimeout(() => loadStatus(root), 1200)
  })
}

/* ---------- connected pages ---------- */

// What a limit or a quiet time does when it begins: the words of the page and the values of the box
const GRACE = { 'Sofort stoppen': 'stop', 'Titel zu Ende spielen': 'track', 'Album zu Ende spielen': 'album' }
const GRACE_LABEL = Object.fromEntries(Object.entries(GRACE).map(([label, v]) => [v, label]))
// how long it may play on at most after the limit / when a quiet time begins (the player's graceMaxMinutes)
const GRACE_MAX = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180]
const graceMaxLabel = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`)
const graceMaxOf = (label) => GRACE_MAX.find((m) => graceMaxLabel(m) === label)
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const hhmm = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
// a time that may be on another day (a Spotify block lasts up to a day): with the day then
const untilWhen = (ms) =>
  new Date(ms).toDateString() === new Date().toDateString()
    ? hhmm(ms)
    : new Date(ms).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

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
  state.values.set('limitGraceMax', graceMaxLabel(pl.graceMaxMinutes ?? 15))
  state.values.set('quietOn', !!qh.enabled)
  state.values.set('quietGrace', GRACE_LABEL[qh.graceMode] ?? 'Titel zu Ende spielen')
  state.values.set('quietGraceMax', graceMaxLabel(qh.graceMaxMinutes ?? 15))
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
      ${ov.forceBlockUntil > now || ov.allowUntil > now ? `<button class="btn sm" id="ov-clear">${ov.forceBlockUntil > now ? 'Ruhe beenden' : 'Aufhebung beenden'}</button>` : ''}
    </div>`
  // (a parent's "quiet now" / "release" ended early: the planned times and the limit count again)
  const clear = hero.querySelector('#ov-clear')
  if (clear) {
    clear.onclick = async () => {
      clear.disabled = true
      const r = await api('/api/playtime/override/clear', { method: 'POST', body: {} })
      toast(r.ok ? 'Beendet – es gelten wieder die normalen Zeiten' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      setTimeout(() => refreshPlaytime(), 1200)
    }
  }
}

// "+ Bonus-Zeit" adds to today's limit: only with the daily limits on
function bonusButton(root, on = !!state.values.get('limitOn')) {
  const b = root?.querySelector('[data-act="bonus"]')
  if (!b) return
  b.disabled = !on
  b.title = on ? '' : 'Nur mit Tageslimit'
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
        <span class="lbl"><b${r.label ? ' translate="no"' : ''}>${esc(r.label || 'Ruhezeit')}</b><small>${esc(dayRange(r.days))}${r.to <= r.from ? ' · über Mitternacht' : ''}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`,
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
  const top = t.topArtists?.find((a) => a.name)?.name
  const tl = (w.timeline ?? []).slice(-7)
  const noData = { type: 'note', text: 'Noch nichts gehört.' }
  const row = (r) => {
    const name = r.title ?? r.name
    return { t: name || 'Ohne Interpret', tr: !name, s: r.title ? r.artist ?? '' : '', r: `${r.minutes} min · ${r.count}×` }
  }
  return [
    { ...secToday, items: [{ type: 'big', value: `${t.totalMinutes ?? 0} min`, subtitle: t.trackCount ? (top ? `${t.trackCount} Titel · meistgehört: ${top}` : `${t.trackCount} Titel`) : 'Heute wurde noch nichts gehört.' }] },
    {
      ...secWeek,
      items: tl.length
        ? [
            {
              type: 'chart',
              vals: tl.map((d) => d.minutes),
              // (short enough for a narrow bar: "45 min", from an hour on "2:05 h")
              shown: tl.map((d) => (d.minutes < 60 ? `${d.minutes} min` : `${Math.floor(d.minutes / 60)}:${String(d.minutes % 60).padStart(2, '0')} h`)),
              labels: tl.map((d) => DAY_SHORT[(new Date(`${d.date}T12:00`).getDay() + 6) % 7]),
            },
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
  ['other', 'Radio & Podcasts'],
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
// (a category changed in the library (category_override) counts, as on the display)
const catOf = (it) => {
  const c = it.category_override ?? it.category
  return c === 'radio' ? 'other' : c
}

// The picture of an entry that has none of its own: Spotify's, a podcast's channel picture (as the box shows it)
function serviceCover(it) {
  if (it.type === 'rss' && it.id) return `/api/rssfeed/cover?url=${encodeURIComponent(it.id)}&w=400`
  if (it.type !== 'spotify') return ''
  // (an entry of a whole artist - "Alle Folgen": the artist's picture, as its tile on "Hören")
  const ref = it.id ? ['album', it.id] : it.playlistid ? ['playlist', it.playlistid] : it.showid ? ['show', it.showid] : it.audiobookid ? ['audiobook', it.audiobookid] : it.artistid ? ['artist', it.artistid] : null
  return ref ? `/api/spotify/cover-for/${ref[0]}/${encodeURIComponent(ref[1])}` : ''
}
// (no cover of its own and none from the service - a radio station, a local entry: the artist's cover, if one is set)
const coverOf = (it) => it.cover_override ?? it.cover ?? (serviceCover(it) || it.artistcover_override || it.artistcover || '')

// Spotify entries that only name an artist are not playable on their own (the box looks their albums up itself)
// Entries that subscribe a whole Spotify artist (only artistid): a folder of that artist's albums (as on the box)
const isSpotifyArtist = (it) => it && it.type === 'spotify' && !!it.artistid && !it.id && !it.playlistid && !it.showid && !it.audiobookid && !it.isResume
const spotifyArtistTile = (it) => ({
  kind: 'spartist',
  title: itemArtist(it) || itemTitle(it),
  sub: catOf(it) === 'music' ? 'Alle Alben' : 'Alle Folgen',
  cover: it.artistcover_override ?? it.artistcover ?? it.cover_override ?? it.cover ?? `/api/spotify/cover-for/artist/${encodeURIComponent(it.artistid)}`,
  badge: 'Spotify',
  folder: true,
  path: it.artistid,
  index: it._index,
})
const playable = (it) => it && typeof it === 'object' && !it.isResume && it.category !== 'resume' && it.type !== 'library' && !(it.type === 'spotify' && !it.id && !it.playlistid && !it.showid && !it.audiobookid)

async function loadHear() {
  const [data, nas, ...local] = await Promise.all([
    api('/api/data'),
    api('/api/nas/artists?expand=1'),
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
    for (const it of hear.items) {
      if (isSpotifyArtist(it) && (cat === 'all' || catOf(it) === cat) && match(`${itemArtist(it)} ${itemTitle(it)}`)) tiles.push(spotifyArtistTile(it))
    }
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
  // (a NAS folder in a category shows there, as on the box; "NAS": the ones without one)
  for (const f of hear.nasTop ?? []) if ((cat === 'all' || cat === (f.nasCategory ?? 'nas')) && match(`${f.title} ${f.artist}`)) tiles.push(nasTile(f))
  return tiles.sort((a, b) => a.title.localeCompare(b.title, 'de'))
}

function badgeOf(it) {
  if (it.type === 'spotify') return 'Spotify'
  if (it.type === 'radio' || it.category === 'radio') return 'Radio'
  if (it.type === 'rss') return 'Podcast'
  return ''
}
const ENTRY_IDENT = ['type', 'id', 'playlistid', 'showid', 'audiobookid', 'artistid', 'title', 'artist']
const entryIdent = (it) => Object.fromEntries(ENTRY_IDENT.map((k) => [k, it[k] ?? null]))
const entryTile = (it) => ({ kind: 'entry', title: itemTitle(it), sub: itemArtist(it) === itemTitle(it) ? '' : itemArtist(it), subIsName: true, cover: coverOf(it), badge: badgeOf(it), index: it._index, ident: entryIdent(it) })
const localTile = (f) => ({ kind: 'local', title: String(f.title ?? '—'), sub: f.ownFiles ? 'Alle Titel hier' : f.artist !== f.title ? String(f.artist ?? '') : '', subIsName: !f.ownFiles, cover: f.cover, badge: 'SD-Karte', folder: !!f.libraryIsContainer, path: f.libraryPath })
const nasTile = (f) => ({ kind: 'nas', title: String(f.title ?? '—'), sub: f.artist !== f.title ? String(f.artist ?? '') : '', subIsName: true, cover: f.cover, badge: 'NAS', folder: !!f.nasIsContainer, path: f.nasPath })

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
  if (top.kind === 'spartist') {
    return (hear.level ?? [])
      .filter((a) => a?.id && match(a.name ?? ''))
      .map((a) => ({ kind: 'spalbum', title: String(a.name ?? '—'), sub: '', cover: a.images?.[1]?.url ?? a.images?.[0]?.url ?? '', badge: 'Spotify', index: top.index, albumId: a.id }))
      .sort((x, y) => x.title.localeCompare(y.title, 'de', { numeric: true }))
  }
  return (hear.level ?? []).filter((f) => match(`${f.title} ${f.artist}`)).map(top.kind === 'nas' ? nasTile : localTile)
}

async function openLevel() {
  const top = hear.stack.at(-1)
  hear.level = null
  hear.levelError = ''
  drawHear()
  if (!top || top.kind === 'artist') return
  if (top.kind === 'spartist') {
    // the artist's albums from Spotify: the box's backend gives at most 10 at a time (Benjamin Blümchen has more than
    // 280), so the pages after the first are asked for six at a time, and the grid fills as they come
    const page = (offset) => api(`/api/spotify/artist/${encodeURIComponent(top.path)}/albums?limit=50&offset=${offset}`)
    const first = await page(0)
    if (hear.stack.at(-1) !== top) return
    if (!first.ok) hear.levelError = 'Spotify antwortet gerade nicht.'
    const all = [...(first.body?.items ?? [])]
    hear.level = [...all]
    drawHear()
    const step = first.body?.items?.length || 10
    const total = Math.min(1000, Number(first.body?.total) || 0)
    const offsets = []
    for (let o = step; o < total; o += step) offsets.push(o)
    for (let i = 0; i < offsets.length; i += 6) {
      const pages = await Promise.all(offsets.slice(i, i + 6).map(page))
      if (hear.stack.at(-1) !== top) return
      for (const p of pages) all.push(...(p.body?.items ?? []))
      hear.level = [...all]
      drawHear()
    }
    return
  }
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
        <b translate="no">${esc(t.title)}</b>${t.sub ? `<small${t.subIsName ? ' translate="no"' : ''}>${esc(t.sub)}</small>` : ''}</button>`,
    )
    .join('')
  for (const img of grid.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of grid.querySelectorAll('.cover-tile')) b.onclick = () => onTile(hearTiles[Number(b.dataset.i)])
}

function onTile(t) {
  if (!t) return
  if (t.folder) {
    hear.stack.push({ kind: t.kind, title: t.title, path: t.path, index: t.index })
    hear.q = ''
    $('#hear-q').value = ''
    openLevel()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  // a podcast: its episodes to choose from, as on the box
  if (t.kind === 'entry' && t.ident?.type === 'rss') return openEpisodes(t)
  if (t.kind === 'entry') return startPlay(t.title, `${API}/library/play`, { index: t.index, expect: t.ident })
  if (t.kind === 'spalbum') return startPlay(t.title, `${API}/library/play`, { index: t.index, albumId: t.albumId })
  if (t.kind === 'nas') return startPlay(t.title, `${API}/library/play-nas`, { path: t.path })
  return startPlay(t.title, `${API}/library/play-local`, { path: t.path })
}

// An episode's length as a feed gives it - seconds ("697") or h:mm:ss ("00:24:09") - in minutes
function durationText(v) {
  const parts = String(v ?? '').trim().split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return ''
  const seconds = parts.reduce((sum, n) => sum * 60 + n, 0)
  return seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : ''
}

// How far an episode was heard (the player remembers it, see Bedienung am Display › Podcasts weiterhören)
function heardText(e) {
  if (e.isNew) return 'Neu'
  if (e.done) return 'gehört'
  if (!(e.pos > 0)) return ''
  const left = e.len > e.pos ? Math.max(1, Math.round((e.len - e.pos) / 60)) : 0
  return left ? `noch ${left} min` : 'Angefangen'
}

// Why a podcast's feed could not be read (reason of /library/episodes, see feedFailureOf in server.ts)
const FEED_FAILURES = {
  not_found: 'Server nicht gefunden: Die Box kennt den Namen dieses Servers nicht. Stimmt die Adresse?',
  ipv6_only: 'Der Server ist nur über IPv6 erreichbar, die Box hat aber kein IPv6. Trag eine IPv4-Adresse des Servers ein – im Heimnetz z. B. 192.168.…',
  unreachable: 'Server nicht erreichbar: Er antwortet der Box nicht. Ist er an und aus dem Netz der Box erreichbar?',
  blocked: 'Der Server liegt im Heimnetz. Die Box ruft ihn erst ab, wenn du ihn erlaubst.',
  http: 'Der Server hat mit einem Fehler geantwortet. Stimmt die Adresse?',
  invalid: 'Unter dieser Adresse liegt kein Podcast-Feed, den die Box lesen kann.',
  slow: 'Der Feed lädt noch. Öffne ihn gleich noch einmal.',
}

// The episodes of a podcast (newest first, from its feed as the box reads it); a tap plays one on the box
async function openEpisodes(t) {
  let shown = 40
  let episodes = null
  openSheet(
    `<h2 translate="no">${esc(t.title)}</h2><div id="ep-list"><p class="help">Lade die Folgen …</p></div>
     <div class="btns"><button class="btn" data-close>Schließen</button></div>`,
    async (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      const box = sheet.querySelector('#ep-list')
      const r = await api(`${API}/library/episodes?index=${t.index}`)
      if (!box.isConnected) return
      if (!r.ok) {
        // (why the box could not read the feed - see feedFailureOf in server.ts; a server of the home network that is
        // not allowed yet can be allowed right here)
        const reason = r.body?.reason
        box.innerHTML = `<p class="help">${esc(FEED_FAILURES[reason] ?? 'Die Folgen ließen sich nicht laden.')}</p>`
        if (reason === 'blocked') {
          sheet.querySelector('[data-close]').insertAdjacentHTML('beforebegin', `<button class="btn primary" data-allow>${esc('Erlauben')}</button>`)
          sheet.querySelector('[data-allow]').onclick = async () => {
            if (!(await allowLanFeed(t.ident?.id))) return
            close()
            openEpisodes(t)
          }
        }
        return
      }
      episodes = r.body?.episodes ?? []
      const draw = () => {
        if (!episodes.length) {
          box.innerHTML = `<p class="help">${esc('Keine Folgen gefunden.')}</p>`
          return
        }
        // (the button on the right keeps an episode on the SD card - it plays without internet then - or deletes it)
        // (an ARD episode the ARD does not release for download: streaming only, a lock instead - see
        // podcast-offline.ts mayKeep)
        const saveBtn = (e, i) =>
          e.saveable === false && !e.saved
            ? `<button class="icon-btn soft ep-save ep-locked" data-locked="1" aria-label="${esc(`Nur mit Internet: ${e.title}`)}">${icon('lock', 18)}</button>`
            : `<button class="icon-btn soft ep-save" data-save="${i}" aria-pressed="${!!e.saved}" aria-label="${esc(e.saved ? `Von der Box löschen: ${e.title}` : `Auf der Box speichern: ${e.title}`)}">${icon(e.saved ? 'check' : e.queued ? 'sync' : 'save', 18)}</button>`
        box.innerHTML = `<p class="help" style="margin:0 0 6px">${esc(`${episodes.length} Folgen`)}${episodes.some((e) => e.saved) ? ` · ${esc(`${episodes.filter((e) => e.saved).length} auf der Box gespeichert`)}` : ''}</p><div class="rows">${episodes
          .slice(0, shown)
          .map(
            (e, i) => `<div class="entry ep-row"><button class="lib-row ep-play" data-ep="${i}">${e.cover ? `<span class="lib-thumb"><img src="${esc(e.cover)}" alt="" loading="lazy"></span>` : ''}
              <span class="lbl"><b translate="no">${esc(e.title)}</b><small>${esc([e.date ? new Date(e.date).toLocaleDateString(LOCALE) : '', durationText(e.duration), heardText(e)].filter(Boolean).join(' · '))}</small></span></button>${saveBtn(e, i)}</div>`,
          )
          .join('')}</div>${shown < episodes.length ? `<div class="btns"><button class="btn" data-more>${esc('Weitere Folgen anzeigen')}</button></div>` : ''}`
        for (const img of box.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
        for (const b of box.querySelectorAll('[data-ep]')) {
          const e = episodes[Number(b.dataset.ep)]
          b.onclick = () => startPlay(e.title, `${API}/library/play`, { index: t.index, expect: t.ident, episode: e.url })
        }
        for (const b of box.querySelectorAll('[data-locked]')) b.onclick = () => toast('Diese Folge gibt die ARD nicht zum Herunterladen frei – sie spielt nur mit Internet.', 'info')
        for (const b of box.querySelectorAll('[data-save]')) {
          const e = episodes[Number(b.dataset.save)]
          b.onclick = async () => {
            b.disabled = true
            const keep = !e.saved
            const r = await api(`${API}/podcast-offline/episode`, { method: 'POST', body: { feed: t.ident?.id, url: e.url, keep } })
            b.disabled = false
            if (!r.ok) return toast(r.body?.error === 'not_downloadable' ? 'Diese Folge gibt die ARD nicht zum Herunterladen frei – sie spielt nur mit Internet.' : 'Das hat nicht geklappt', 'info')
            if (keep) {
              e.queued = true
              toast('Wird auf die Box geladen')
            } else {
              e.saved = false
              toast('Von der Box gelöscht')
            }
            draw()
          }
        }
        box.querySelector('[data-more]')?.addEventListener('click', () => {
          shown += 40
          draw()
        })
      }
      draw()
    },
  )
}

// Starts something on the box; asks first when something else is playing
async function startPlay(title, path, body) {
  const now = await api(`${API}/playback`)
  const run = async () => {
    const r = await api(path, { method: 'POST', body })
    if (r.body?.error === 'library_changed') {
      // (the library moved since the list was drawn - a sync, a delete: the list is read again)
      hear.items = null
      hear.loadedAt = 0
      toast('Die Bibliothek hat sich gerade geändert – bitte noch einmal antippen.', 'info')
      return currentPage()?.id === 'hoeren' && renderPage(currentPage())
    }
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
  // (the box shows a radio for it; radio stations and podcasts are added here)
  ['other', 'Radio & Podcasts', 'Radio & Podcasts'],
]
const catLabel = (c) => CATS.find(([id]) => id === c)?.[1] ?? ''
// (the old name "Sonstiges" too: a value kept from before)
const catFromLabel = (label) => (label === 'Sonstiges' ? 'other' : CATS.find(([, , long]) => long === label)?.[0] ?? 'audiobook')
const SYNC_API = '/api/spotify-sync'

// items: /api/data; local: category -> artist folders; cat / src / q: the filters
// items: /api/data; local: category -> folders of the SD card; nas: the NAS folders shown on the box;
// cat / src / q: the filters; subs, nasProfile, covers: the numbers of the tiles
const lib = { items: null, local: {}, nas: [], cat: 'all', src: 'all', q: '', sync: null, subs: null, nasProfile: '', covers: null, mounts: 0 }

async function loadLib() {
  const [data, sync, nas, subs, profiles, covers, ...local] = await Promise.all([
    api('/api/data'),
    api(`${SYNC_API}/status`),
    api('/api/nas/artists'),
    api(`${API}/library/subscriptions`),
    api('/api/nas/profiles'),
    api('/api/online-covers'),
    ...CATS.map(([c]) => api(`/api/library/artists?category=${c}`)),
  ])
  lib.items = Array.isArray(data.body) ? data.body : []
  lib.sync = sync.ok ? sync.body : null
  lib.nas = Array.isArray(nas.body) ? nas.body : []
  lib.subs = subs.ok ? subs.body : null
  const active = (profiles.body?.profiles ?? []).find((p) => p.active)
  lib.nasProfile = active ? (active.name === 'standard' ? 'Standard' : active.name) : ''
  lib.covers = covers.ok ? (covers.body?.entries ?? []).filter((e) => e.status === 'found').length : null
  CATS.forEach(([c], i) => (lib.local[c] = Array.isArray(local[i].body) ? local[i].body : []))
}

// After a change the lists of Hören are read again too
function libChanged() {
  hear.items = null
  hear.loadedAt = 0
}

// Where the content comes from. Spotify: every Spotify entry, added by hand or by the Smart-Sync; Smart-Sync: only
// the Sync's; Podcasts: every podcast (the ARD Audiothek's shows among them); Radio: the stations
const LIB_SOURCES = [
  ['all', 'Alle Quellen'],
  ['spotify', 'Spotify'],
  ['spotify-sync', 'Smart-Sync'],
  ['podcast', 'Podcasts'],
  ['radio', 'Radio'],
  ['local', 'SD-Karte'],
  ['nas', 'NAS'],
]
const SOURCE_LABEL = { local: 'SD-Karte', nas: 'NAS' }
// Whether an entry of the library belongs to a source of the filter
const entryInSource = (it, src) =>
  src === 'all' ||
  (src === 'spotify' && it.type === 'spotify') ||
  (src === 'spotify-sync' && (it.source ?? 'manual') === 'spotify-sync') ||
  (src === 'podcast' && it.type === 'rss') ||
  (src === 'radio' && it.type === 'radio')
// A show of ARD Sounds: a podcast whose "feed" is ard:<show id> (the box builds its episode list from the ARD)
const isArdEntry = (it) => it?.type === 'rss' && String(it.id ?? '').startsWith('ard:')
const CAT_SHORT = { audiobook: 'Hörspiel', music: 'Musik', other: 'Radio & Podcasts' }
const AVATAR_COLORS = ['#F2B45A', '#7FC7F0', '#9ED8A6', '#F4A3B4', '#C9B6F2', '#8FD6C8', '#F6C58A', '#A8C6F5']
const avatarColor = (name) => AVATAR_COLORS[[...String(name)].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7) % AVATAR_COLORS.length]

function libTop() {
  return [
    `<button class="btn primary block lib-add" id="lib-add">${icon('plus', 18)}Hinzufügen</button>`,
    `<div class="lib-tiles wide" id="lib-tiles"></div>`,
    `<div class="search wide">${icon('search')}<input class="input" id="lib-q" type="search" placeholder="In der Bibliothek suchen" autocomplete="off" value="${esc(lib.q)}"></div>`,
    `<div class="pills wide" id="lib-cat">${[['all', 'Alle'], ...CATS.map(([c]) => [c, CAT_SHORT[c]]), ['nas', 'NAS']].map(([id, t]) => `<button aria-selected="${lib.cat === id}" data-v="${id}">${t}</button>`).join('')}</div>`,
    // (a source only when the library has something of it)
    `<div class="pills small wide" id="lib-src">${LIB_SOURCES.filter(([id]) => lib.src === id || libSourceHas(id))
      .map(([id, t]) => `<button aria-selected="${lib.src === id}" data-v="${id}">${t}</button>`)
      .join('')}</div>`,
    `<p class="help wide lib-count" id="lib-count"></p>`,
    `<section class="card wide lib-card"><div class="rows lib-list" id="lib-list"><div class="loading"><p>Lade …</p></div></div></section>`,
  ]
}

function libSourceHas(id) {
  if (id === 'all' || !lib.items) return true
  if (id === 'local') return Object.values(lib.local).some((l) => l.length)
  if (id === 'nas') return lib.nas.length > 0
  return lib.items.some((it) => it && !it.isResume && it.category !== 'resume' && entryInSource(it, id))
}

// The four tiles: where the content comes from, each with its state in a few words
function drawLibTiles() {
  const box = $('#lib-tiles')
  if (!box) return
  const s = lib.sync
  const spotify = !s ? '' : !s.token?.configured ? 'nicht eingerichtet' : `Smart-Sync ${s.enabled ? (s.state?.last_sync_end ? relTime(s.state.last_sync_end) : 'an') : 'aus'}${s.token?.scopes_ok ? ' · Zugang ok' : ' · neu anmelden'}`
  const a = lib.subs?.artists?.length ?? 0
  const al = lib.subs?.explicit_albums?.length ?? 0
  const tiles = [
    ['spotify', 'music', 'Spotify', spotify],
    ['verwaltet', 'lib', 'Verwaltete Inhalte', lib.subs ? `${a} ${a === 1 ? 'Abo' : 'Abos'} · ${al} ${al === 1 ? 'Album' : 'Alben'}` : ''],
    ['nas', 'server', 'NAS', lib.nasProfile ? `Profil ${lib.nasProfile}` : `${lib.nas.length} Ordner`],
    ['cover', 'image', 'Cover', lib.covers != null ? `${lib.covers} gefunden` : 'Eigene Bilder'],
  ]
  box.innerHTML = tiles
    .map(([id, ic, t, sub]) => `<button class="lib-tile" data-go="${id}"><span class="tile">${icon(ic, 18)}</span><span class="lbl"><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`)
    .join('')
  for (const b of box.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go)
}

// The list: everything grouped by artist (as the box shows it), per source; a group opens its entries
function libGroups() {
  const q = norm(lib.q.trim())
  const groups = new Map()
  const add = (key, g) => {
    if (!groups.has(key)) groups.set(key, { ...g, entries: [] })
    return groups.get(key)
  }
  // (a source of before - "Manuell", "ARD Sounds" - is "all" now)
  if (!LIB_SOURCES.some(([id]) => id === lib.src)) lib.src = 'all'
  if (lib.src !== 'local' && lib.src !== 'nas') {
    for (const it of lib.items) {
      if (!it || it.isResume === true || it.category === 'resume' || it.type === 'library') continue
      const cat = it.category_override ?? (it.category === 'radio' ? 'other' : it.category)
      if (lib.cat !== 'all' && cat !== lib.cat) continue
      const src = it.source ?? 'manual'
      if (!entryInSource(it, lib.src)) continue
      const title = String(it.title_override ?? it.title ?? it.artist_override ?? it.artist ?? '—')
      const artist = String(it.artist_override ?? it.artist ?? title)
      if (q && !norm(`${title} ${artist}`).includes(q)) continue
      const g = add(`${src}|${cat}|${artist}`, { kind: 'entries', artist, src, cat, cover: it.artistcover_override ?? it.artistcover ?? it.cover_override ?? it.cover ?? serviceCover(it) })
      g.entries.push({ item: it, title })
    }
  }
  if (lib.src === 'all' || lib.src === 'local') {
    for (const [c] of CATS) {
      if (lib.cat !== 'all' && lib.cat !== c) continue
      for (const f of lib.local[c] ?? []) {
        if (q && !norm(`${f.title} ${f.artist}`).includes(q)) continue
        add(`local|${c}|${f.libraryPath}`, { kind: 'local', artist: String(f.title ?? '—'), src: 'local', cat: c, cover: f.cover, folder: f })
      }
    }
  }
  if (lib.src === 'all' || lib.src === 'nas') {
    for (const f of lib.nas) {
      // (the category NAS: the folders in the box's NAS tab, those not sorted into one of the others)
      const c = f.nasCategory && f.nasCategory !== 'nas' ? f.nasCategory : ''
      if (lib.cat !== 'all' && lib.cat !== (c || 'nas')) continue
      if (q && !norm(`${f.title} ${f.artist}`).includes(q)) continue
      add(`nas|${f.nasPath}`, { kind: 'nas', artist: String(f.title ?? '—'), src: 'nas', cat: c, cover: f.cover, folder: f })
    }
  }
  return [...groups.values()].sort((a, b) => a.artist.localeCompare(b.artist, 'de', { numeric: true }))
}

let libShown = []

function libSub(g) {
  const spotify = g.kind === 'entries' && g.entries[0]?.item.type === 'spotify'
  const first = g.kind === 'entries' ? g.entries[0]?.item : null
  const src = spotify
    ? g.src === 'spotify-sync'
      ? 'Spotify · Smart-Sync'
      : 'Spotify'
    : first?.type === 'rss'
      ? isArdEntry(first)
        ? 'Podcast · ARD Audiothek'
        : 'Podcast'
      : first?.type === 'radio'
        ? 'Radio'
        : (SOURCE_LABEL[g.src] ?? '')
  if (g.kind === 'local') return `${g.folder.libraryIsContainer ? 'Ordner' : 'Album'} · ${src}`
  if (g.kind === 'nas') return `${g.folder.nasIsContainer ? 'Ordner' : 'Album'} · ${src}`
  if (g.entries.length === 1) {
    const e = g.entries[0]
    const whole = e.item.type === 'spotify' && !e.item.id && !e.item.playlistid && !e.item.showid && !e.item.audiobookid
    // (the source already says Spotify: what kind of Spotify entry it is instead)
    // (a podcast or a station under its own name: the source says what it is - not "Podcast · Podcast")
    if ((e.item.type === 'rss' || e.item.type === 'radio') && e.title === g.artist) return src
    const what = spotify ? (e.item.playlistid ? 'Playlist' : e.item.showid ? 'Podcast' : e.item.audiobookid ? 'Hörbuch' : 'Album') : badgeOf(e.item) || 'Eintrag'
    return `${whole ? (g.cat === 'music' ? 'Alle Alben' : 'Alle Folgen') : e.title !== g.artist ? e.title : what} · ${src}`
  }
  return `${g.entries.length} ${g.cat === 'music' ? 'Alben' : 'Folgen'} · ${src}`
}

function drawLib() {
  const list = $('#lib-list')
  if (!list || !lib.items) return
  drawLibTiles()
  libShown = libGroups()
  const total = libShown.reduce((n, g) => n + (g.entries?.length || 1), 0)
  const all = lib.items.filter((it) => it && !it.isResume && it.category !== 'resume' && it.type !== 'library').length + Object.values(lib.local).reduce((n, l) => n + l.length, 0) + lib.nas.length
  const end = lib.sync?.state?.last_sync_end
  $('#lib-count').textContent = `${total} von ${all} Inhalten${end ? ` · letzter Sync ${hhmm(Date.parse(end))}` : ''}`
  if (libShown.length === 0) {
    list.innerHTML = `<p class="help covers-empty">${lib.q ? 'Nichts gefunden.' : 'Hier ist noch nichts.'}</p>`
    return
  }
  list.innerHTML = libShown
    .map(
      (g, i) => `<button class="entry lib-row" data-i="${i}"><span class="lib-thumb" style="background:${avatarColor(g.artist)}"><b>${esc(initials(g.artist))}</b>${g.cover ? `<img src="${esc(stampedCover(g.cover))}" alt="" loading="lazy">` : ''}</span>
        <span class="lbl"><b translate="no">${esc(g.artist)}</b><small>${esc(libSub(g))}</small></span>
        ${g.cat ? `<span class="chip cat-${g.cat}">${esc(CAT_SHORT[g.cat] ?? '')}</span>` : ''}<span class="chev">${icon('chevron', 18)}</span></button>`,
    )
    .join('')
  for (const img of list.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of list.querySelectorAll('.lib-row')) b.onclick = () => openLibGroup(libShown[Number(b.dataset.i)])
}

// A group: one entry opens right away, several are listed first
function openLibGroup(g) {
  if (g.kind === 'local') return openLocalSheet(g.folder)
  if (g.kind === 'nas') return openNasSheet(g.folder)
  if (g.entries.length === 1) return openEntrySheet(g.entries[0].item)
  const entries = [...g.entries].sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }))
  openSheet(
    `<h2 translate="no">${esc(g.artist)}</h2><p class="help" style="margin:0">${esc(libSub(g))}${g.src === 'spotify-sync' ? ' – kommt vom Spotify-Sync, Abo und Bereich unter „Verwaltete Inhalte“.' : ''}</p>
     <div class="rows">${entries
       .map((e, i) => `<button class="entry lib-row" data-e="${i}"><span class="lbl"><b translate="no">${esc(e.title)}</b></span><span class="chev">${icon('chevron', 18)}</span></button>`)
       .join('')}</div>
     <div class="btns"><button class="btn" data-close>Schließen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      // (back from an entry: the list where it was)
      if (g.scrollTop) sheet.scrollTop = g.scrollTop
      for (const b of sheet.querySelectorAll('[data-e]')) {
        b.onclick = () => {
          g.scrollTop = sheet.scrollTop
          openEntrySheet(entries[Number(b.dataset.e)].item, { title: g.artist, open: () => openLibGroup(g) })
        }
      }
    },
  )
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

// Where an entry stands in the library (its place in /api/data, which edit and delete check against the entry itself):
// the stored "index" can be behind after a delete elsewhere
const libPlace = (item) => {
  const i = lib.items?.indexOf(item) ?? -1
  return i >= 0 ? i : item.index
}

// Order, shuffle and a part of the episodes of an entry (the fields of "Link einfügen"): empty "von/bis" = all
function entryPlayFields(item) {
  const opts = SORTINGS.map(([v, l]) => `<option value="${v}"${(item.sorting ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')
  const part = item.aPartOfAll === true
  return `<div class="field"><label for="e-sort">Sortierung</label><select class="input" id="e-sort">${opts}</select></div>
    ${item.type === 'spotify' ? `<div class="row"><span class="lbl"><b>Zufällig abspielen</b></span><label class="switch"><input type="checkbox" id="e-shuffle" ${item.shuffle ? 'checked' : ''} aria-label="Zufällig abspielen"><span></span></label></div>` : ''}
    ${
      item.type === 'rss'
        ? episodePickFields('e', item)
        : `<div class="field"><label>Nur einen Teil (Nr. von – bis, leer = alle)</label><div class="rule-times"><input class="input" id="e-from" type="number" min="1" inputmode="numeric" value="${part ? esc(item.aPartOfAllMin ?? 1) : ''}" placeholder="von" aria-label="von"><input class="input" id="e-to" type="number" min="1" inputmode="numeric" value="${part ? esc(item.aPartOfAllMax ?? '') : ''}" placeholder="bis" aria-label="bis"></div></div>`
    }`
}

// Which episodes of a podcast come on the box (entry field "episodePick", see ../episode-pick.ts): counted by date,
// episode 1 is the oldest the feed has. The display, the lists here and the SD card follow it.
const EPISODE_PICKS = [
  ['', 'Alle Folgen'],
  ['newest:10', 'Die 10 neuesten'],
  ['newest:20', 'Die 20 neuesten'],
  ['newest:50', 'Die 50 neuesten'],
  ['oldest:10', 'Die ersten 10'],
  ['oldest:20', 'Die ersten 20'],
  ['oldest:50', 'Die ersten 50'],
  ['range', 'Eigener Bereich …'],
]

// The chosen ones of a list that is newest first, in its order (as pickEpisodes of ../episode-pick.ts)
function pickEpisodes(newestFirst, pick) {
  const n = newestFirst.length
  let m = /^(newest|oldest):(\d{1,4})$/.exec(pick ?? '')
  if (m) return m[1] === 'newest' ? newestFirst.slice(0, Number(m[2])) : newestFirst.slice(Math.max(0, n - Number(m[2])))
  m = /^range:(\d{1,5})-(\d{1,5})$/.exec(pick ?? '')
  if (!m) return newestFirst
  const from = Math.min(Number(m[1]), Number(m[2]))
  const to = Math.max(Number(m[1]), Number(m[2]))
  return newestFirst.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}

// The choice's fields (p: the prefix of their ids). An entry with a part as before ("Nur einen Teil", counted in the
// feed's order) keeps it until another choice is made.
function episodePickFields(p, item) {
  const pick = typeof item.episodePick === 'string' ? item.episodePick : ''
  const range = /^range:(\d+)-(\d+)$/.exec(pick)
  const other = /^(newest|oldest):(\d+)$/.exec(pick)
  const legacy = !pick && item.aPartOfAll === true
  const opts = [
    ...(legacy ? [['legacy', `Wie bisher (Nr. ${item.aPartOfAllMin ?? 1} – ${item.aPartOfAllMax ?? '…'} im Feed)`]] : []),
    ...EPISODE_PICKS,
    ...(other && !EPISODE_PICKS.some(([v]) => v === pick) ? [[pick, other[1] === 'newest' ? `Die ${other[2]} neuesten` : `Die ersten ${other[2]}`]] : []),
  ]
  const chosen = legacy ? 'legacy' : range ? 'range' : pick
  return `<div class="field"><label for="${p}-pick">Welche Folgen auf die Box</label><select class="input" id="${p}-pick">${opts
    .map(([v, l]) => `<option value="${v}"${v === chosen ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select></div>
    <div class="field" id="${p}-range"${range ? '' : ' hidden'}><label>Folge von – bis</label><div class="rule-times"><input class="input" id="${p}-from" type="number" min="1" inputmode="numeric" value="${range ? range[1] : ''}" placeholder="von" aria-label="von"><input class="input" id="${p}-to" type="number" min="1" inputmode="numeric" value="${range ? range[2] : ''}" placeholder="bis" aria-label="bis"></div>
      <small>Gezählt nach Datum: Folge 1 ist die älteste.</small></div>`
}

// The choice as its fields say it: '' (all), 'legacy', 'newest:N' …, or null (a range that does not fit)
function episodePickOf(sheet, p) {
  const v = sheet.querySelector(`#${p}-pick`).value
  if (v !== 'range') return v
  const from = Number(sheet.querySelector(`#${p}-from`).value) || 0
  const to = Number(sheet.querySelector(`#${p}-to`).value) || 0
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= 99999 ? `range:${from}-${to}` : null
}

// A change of the choice: the range's fields shown or not, then `changed`
function wireEpisodePick(sheet, p, changed) {
  const select = sheet.querySelector(`#${p}-pick`)
  select.addEventListener('change', () => {
    sheet.querySelector(`#${p}-range`).hidden = select.value !== 'range'
    changed()
  })
  for (const k of ['from', 'to']) sheet.querySelector(`#${p}-${k}`).addEventListener('input', changed)
}

const BAD_RANGE = 'Bitte beide Nummern eintragen (ab 1, die zweite nicht kleiner als die erste)'

// How many of a podcast's newest episodes stay on the SD card (entry field "offline"; see podcast-offline.ts); with a
// choice of episodes the newest of the chosen ones - or all of them (at most 50, as the box keeps)
const OFFLINE_KEEP = [
  [0, 'Aus'],
  [1, 'Die neueste Folge'],
  [3, 'Die 3 neuesten Folgen'],
  [5, 'Die 5 neuesten Folgen'],
  [10, 'Die 10 neuesten Folgen'],
  [20, 'Die 20 neuesten Folgen'],
]
const OFFLINE_ALL_PICKED = 50

function offlineOptions(keep, picked) {
  const opts = [...OFFLINE_KEEP, ...(picked ? [[OFFLINE_ALL_PICKED, 'Die gewählten Folgen (höchstens 50)']] : [])]
  if (!opts.some(([n]) => n === keep)) opts.push([keep, `Die ${keep} neuesten Folgen`])
  return opts.map(([n, l]) => `<option value="${n}"${n === keep ? ' selected' : ''}>${esc(l)}</option>`).join('')
}

// The SD card's choice again after the choice of episodes changed (what was chosen there stays)
function refreshOfflineOptions(select, picked) {
  if (select) select.innerHTML = offlineOptions(Number(select.value) || 0, picked)
}

function offlineField(item) {
  const keep = Number(item.offline) || 0
  return `<div class="field"><label for="e-offline">Auf der Box speichern (ohne Internet hören)</label><select class="input" id="e-offline">${offlineOptions(keep, !!item.episodePick)}</select></div>
    <p class="help" id="e-offline-status" style="margin:0">${esc('Neue Folgen kommen von selbst, ältere gehen wieder. Einzelne Folgen merkst du dir unter Hören.')}</p>${
      String(item.id ?? '').startsWith('ard:')
        ? `<p class="help" style="margin:0">${esc('Nur Folgen, die die ARD zum Herunterladen freigibt. Nimmt die ARD eine Folge aus ihrem Angebot, wird sie auch auf der Box gelöscht.')}</p>`
        : ''
    }`
}

// What of a podcast is on the SD card, in a line under its setting
async function loadOfflineStatus(feed, box) {
  const r = await api(`${API}/podcast-offline?feed=${encodeURIComponent(feed)}`)
  if (!box?.isConnected || !r.ok) return
  const n = Object.keys(r.body.files ?? {}).length
  const waiting = (r.body.queued ?? []).length + (r.body.current ? 1 : 0)
  const size = formatBytes(r.body.bytes)
  const parts = [n === 0 ? 'Noch keine Folge gespeichert' : n === 1 ? `Eine Folge gespeichert (${size})` : `${n} Folgen gespeichert (${size})`]
  if (waiting) parts.push(`${waiting} in der Warteschlange`)
  if (r.body.lastError?.error === 'not_enough_space') parts.push('Zu wenig Platz auf der SD-Karte')
  box.textContent = parts.join(' · ')
}

// The sheet of a library entry: manual ones change their fields, synced ones get overrides (the sync keeps its own)
// The albums of a whole Spotify artist in its entry (as Spotify lists them, oldest first; the box shows them in the
// order the entry chooses)
async function loadArtistAlbums(item, box) {
  const r = await api(`${SYNC_API}/artist-albums?artistId=${encodeURIComponent(item.artistid)}`)
  if (!box.isConnected) return
  if (!r.ok) {
    box.innerHTML = `<p class="help">${r.status === 409 ? 'Spotify ist nicht verbunden.' : 'Die Alben ließen sich nicht laden.'}</p>`
    return
  }
  const albums = r.body?.albums ?? []
  if (!albums.length) {
    box.innerHTML = '<p class="help">Keine Alben gefunden.</p>'
    return
  }
  // (the first ten, the others on request: an artist with hundreds of albums would push the sheet's buttons far down)
  const draw = (all) => {
    const shown = all ? albums : albums.slice(0, 10)
    box.innerHTML = `<p class="help" style="margin:0 0 6px">${esc(`${albums.length} ${albums.length === 1 ? 'Album' : 'Alben'}`)}</p><div class="rows">${shown
      .map(
        (al) => `<div class="entry"><span class="lib-thumb">${al.cover ? `<img src="${esc(al.cover)}" alt="" loading="lazy">` : ''}</span>
          <span class="lbl"><b translate="no">${esc(al.name || al.id)}</b>${al.release_date ? `<small>${esc(String(al.release_date).slice(0, 4))}</small>` : ''}</span></div>`,
      )
      .join('')}</div>${shown.length < albums.length ? `<div class="btns"><button class="btn" data-all-albums>${esc(`Alle ${albums.length} Alben zeigen`)}</button></div>` : ''}`
    for (const img of box.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
    box.querySelector('[data-all-albums]')?.addEventListener('click', () => draw(true))
  }
  draw(false)
}

// back: opened from the list of an artist's entries ({title, open}) - a way back to it, and "Abbrechen" goes there too
function openEntrySheet(item, back = null) {
  const isSync = (item.source ?? 'manual') === 'spotify-sync'
  // a whole Spotify artist ("Alle Folgen"): its albums are listed, as the folders of the SD card and the NAS
  const wholeArtist = item.type === 'spotify' && item.artistid && !item.id && !item.playlistid && !item.showid && !item.audiobookid
  // (order, shuffle, a part of the episodes: of the entries one adds by hand - Spotify and podcasts)
  const playOptions = !isSync && (item.type === 'spotify' || item.type === 'rss')
  // a radio station or a podcast: its address (stream / feed) can be changed too
  // (not for a show of ARD Sounds: its "address" is the ARD's id of the show)
  const addressLabel = !isSync && !isArdEntry(item) && { radio: 'Stream-Adresse (URL)', rss: 'Feed-Adresse (URL)' }[item.type]
  const fields = [
    ['artist', 'Interpret'],
    ['title', 'Titel'],
    ...(addressLabel ? [['id', addressLabel]] : []),
    ['cover', 'Cover (Bild-URL)'],
    ['artistcover', 'Interpret-Cover (Bild-URL)'],
  ]
  const val = (k) => item[`${k}_override`] ?? (isSync ? '' : item[k] ?? '')
  openSheet(
    `${back ? `<button class="sheet-back" data-back>${icon('back', 18)}<span translate="no">${esc(back.title)}</span></button>` : ''}
     <h2 translate="no">${esc(item.title_override ?? item.title ?? item.artist_override ?? item.artist ?? 'Eintrag')}</h2>
     <p class="help" style="margin:0">${isSync ? 'Kommt vom Spotify-Sync. Was du hier einträgst, gilt statt der Werte von Spotify; leer = der Wert von Spotify.' : 'Von Hand hinzugefügt.'}</p>
     ${fields
       .map(([k, l]) => {
         const input = `<input class="input" id="e-${k}"${k === 'id' ? ' type="url" inputmode="url" spellcheck="false" translate="no"' : ''} value="${esc(val(k))}" placeholder="${esc(isSync ? item[k] ?? '' : '')}" autocomplete="off">`
         // the picture fields: also chosen from a search or the device (see openCoverPicker)
         return k.endsWith('cover')
           ? `<div class="field"><label for="e-${k}">${l}</label><div class="field-pick">${input}<button type="button" class="icon-btn soft" data-pick="${k}" aria-label="Bild suchen oder hochladen">${icon('image', 18)}</button></div></div>`
           : `<div class="field"><label for="e-${k}">${l}</label>${input}</div>`
       })
       .join('')}
     <div class="field"><label for="e-cat">Kategorie</label>${catSelect('e-cat', item.category_override ?? (isSync ? '' : item.category === 'radio' ? 'other' : item.category), isSync)}</div>
     ${playOptions ? entryPlayFields(item) : ''}
     ${item.type === 'rss' ? offlineField(item) : ''}
     ${isSync ? `<p class="help" style="margin:0">Entfernen geht über Bibliothek › Verwaltete Inhalte oder die Spotify-Playlist.</p>` : ''}
     ${wholeArtist ? `<div class="section-label" style="margin:0">Alben</div><div id="e-albums"><p class="help">Lade die Alben von Spotify …</p></div>` : ''}
     <div class="btns">${isSync ? '' : `<button class="btn danger" data-del>Löschen</button>`}<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = back ? back.open : close
      sheet.querySelector('[data-back]')?.addEventListener('click', back?.open)
      if (wholeArtist) loadArtistAlbums(item, sheet.querySelector('#e-albums'))
      if (item.type === 'rss') loadOfflineStatus(item.id, sheet.querySelector('#e-offline-status'))
      if (playOptions && item.type === 'rss') {
        wireEpisodePick(sheet, 'e', () =>
          refreshOfflineOptions(sheet.querySelector('#e-offline'), !['', 'legacy'].includes(sheet.querySelector('#e-pick').value)),
        )
      }
      // A chosen picture lands among the own pictures and is saved into the entry right away (the picker takes the
      // sheet's place, what was typed here and not saved yet stays as it was on the box)
      for (const b of sheet.querySelectorAll('[data-pick]')) {
        const k = b.dataset.pick
        const artist = String(item.artist_override ?? item.artist ?? '')
        const title = String(item.title_override ?? item.title ?? '')
        b.onclick = () =>
          openCoverPicker({
            target: `own:${k === 'artistcover' ? artist : `${artist} ${title}`}`,
            title: k === 'artistcover' ? artist || title : title || artist,
            query: k === 'artistcover' ? artist : `${artist} ${title}`.trim(),
            fallbacks: k === 'artistcover' ? [] : [withoutNumber(title), artist],
            current: item[`${k}_override`] ?? item[k] ?? (k === 'cover' ? serviceCover(item) : ''),
            onDone: async (body) => {
              const key = isSync ? `${k}_override` : k
              const r = await api('/api/edit', { method: 'POST', body: { index: libPlace(item), data: { ...item, [key]: body.url }, original: item } })
              if (!libWriteOk(r)) return
              toast('Cover übernommen')
              libReload()
            },
          })
      }
      sheet.querySelector('[data-ok]').onclick = async () => {
        if (addressLabel) {
          const address = sheet.querySelector('#e-id').value.trim()
          if (!/^https?:\/\/\S+$/i.test(address)) {
            sheet.querySelector('#e-id').focus()
            return toast('Bitte eine Adresse eintragen, die mit http:// oder https:// beginnt.', 'info')
          }
          if (item.type === 'rss' && address !== item.id && !(await allowLanFeed(address))) return
        }
        const updated = { ...item }
        for (const [k] of fields) {
          const v = sheet.querySelector(`#e-${k}`).value.trim()
          const key = isSync ? `${k}_override` : k
          if (v) updated[key] = v
          else delete updated[key]
        }
        if (playOptions) {
          const sorting = sheet.querySelector('#e-sort').value
          if (sorting) updated.sorting = sorting
          else delete updated.sorting
          const shuffle = sheet.querySelector('#e-shuffle')
          if (shuffle) updated.shuffle = shuffle.checked
          const pick = item.type === 'rss' ? episodePickOf(sheet, 'e') : undefined
          const from = Number(sheet.querySelector('#e-from')?.value) || 0
          const to = Number(sheet.querySelector('#e-to')?.value) || 0
          if (pick === null) return toast(BAD_RANGE, 'info')
          if (pick === 'legacy') {
            // (the part as before stays)
          } else if (pick !== undefined) {
            if (pick) updated.episodePick = pick
            else delete updated.episodePick
            updated.aPartOfAll = false
            delete updated.aPartOfAllMin
            delete updated.aPartOfAllMax
          } else if (from || to) {
            if ((to && to < (from || 1)) || from < 0) return toast('Der Bereich passt nicht (von 1 an, „bis“ nicht vor „von“)', 'info')
            Object.assign(updated, { aPartOfAll: true, aPartOfAllMin: from || 1 })
            if (to) updated.aPartOfAllMax = to
            else delete updated.aPartOfAllMax
          } else {
            updated.aPartOfAll = false
            delete updated.aPartOfAllMin
            delete updated.aPartOfAllMax
          }
        }
        const cat = sheet.querySelector('#e-cat').value
        if (isSync) {
          if (cat) updated.category_override = cat
          else delete updated.category_override
        } else if (cat) updated.category = cat
        const keep = item.type === 'rss' ? Number(sheet.querySelector('#e-offline').value) || 0 : 0
        if (keep) updated.offline = keep
        else delete updated.offline
        const r = await api('/api/edit', { method: 'POST', body: { index: libPlace(item), data: updated, original: item } })
        if (!libWriteOk(r)) return
        close()
        toast('Gespeichert')
        // (the episodes on the SD card follow the setting now, not only at the next hourly round)
        // (the choice of episodes too: other episodes to keep)
        const changedKeep = keep !== (Number(item.offline) || 0) || (updated.episodePick ?? '') !== (item.episodePick ?? '')
        if (item.type === 'rss' && changedKeep) api(`${API}/podcast-offline/sync`, { method: 'POST', body: { feed: updated.id } })
        libReload()
      }
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        close()
        confirmSheet('Löschen', `„${item.title ?? item.artist ?? 'Eintrag'}“ aus der Bibliothek löschen?`, async () => {
          const r = await api('/api/delete', { method: 'POST', body: { index: libPlace(item), original: item } })
          if (!libWriteOk(r)) return
          toast('Gelöscht')
          libReload()
        })
      })
    },
  )
}

// A cover of the SD card after it was changed: the same address, so the browser is told it is new (its memory would
// show the old picture)
function stampedCover(url) {
  return url && lib.coverStamp && String(url).startsWith('/api/library/file') ? `${url}&v=${lib.coverStamp}` : url
}
const localCoverUrl = (path) => `/api/library/file?path=${encodeURIComponent(path)}&w=400`

// Deletes a folder of the SD card (an artist with its albums, or one album), asked first
function deleteLocal(path, name, what) {
  confirmSheet('Löschen', `${what} „${name}“ wird mit allen Dateien von der SD-Karte gelöscht. Das lässt sich nicht rückgängig machen.`, async () => {
    const d = await api(`${API}/local/delete`, { method: 'POST', body: { path } })
    if (!d.ok) return toast(errorText(d), 'info')
    toast('Gelöscht')
    libReload()
  })
}

// A folder of the SD card or the NAS as the box lists it now (after "Cover entfernen" / "Cover wieder zeigen": its
// picture and coverHidden); from the list it is in - the one of its parent, or the top list
async function freshFolder(folder, parent) {
  const nas = folder.nasPath !== undefined
  const address = nas
    ? parent
      ? `/api/nas/children?path=${encodeURIComponent(parent.nasPath)}`
      : '/api/nas/artists'
    : parent
      ? `/api/library/children?path=${encodeURIComponent(parent.libraryPath)}`
      : `/api/library/artists?category=${encodeURIComponent(folder.category)}`
  const r = await api(address)
  const same = (a) => (nas ? a.nasPath === folder.nasPath : a.libraryPath === folder.libraryPath) && !a.ownFiles
  return (Array.isArray(r.body) ? r.body.find(same) : undefined) ?? folder
}

// "Kein Cover" / "Cover wieder zeigen" in the cover picker of a folder: the box shows it without a picture, or with its
// pictures again (nothing is deleted); done: called with the folder as the box lists it then
function hideFolderCover(target, hide, folder, parent, done) {
  return async () => {
    const r = await api(`${API}/cover-hide`, { method: 'POST', body: { target, hide } })
    if (!r.ok) {
      toast(r.body?.error === 'nas_not_selected' ? 'Dieser NAS-Ordner ist nicht freigegeben.' : 'Das hat nicht geklappt', 'info')
      return false
    }
    lib.coverStamp = Date.now()
    toast(hide ? 'Ohne Cover – gleich auf dem Display' : 'Cover wird wieder gezeigt')
    libReload()
    done(await freshFolder({ ...folder, cover: undefined, coverHidden: hide }, parent))
    return true
  }
}

// The cover picker for a folder of the SD card (cover.jpg there); done: called with the folder as it is then
function pickLocalCover(folder, parent, done) {
  const album = folder.title
  const artist = parent?.title ?? ''
  const target = `local:${folder.libraryPath}`
  openCoverPicker({
    target,
    title: album,
    query: artist ? `${artist} ${album}` : album,
    fallbacks: artist ? [`${artist} ${withoutNumber(album)}`, withoutNumber(album), artist] : [withoutNumber(album)],
    current: stampedCover(folder.cover),
    hidden: !!folder.coverHidden,
    onHide: (hide) => hideFolderCover(target, hide, folder, parent, done)(),
    onDone: (body) => {
      lib.coverStamp = Date.now()
      toast('Cover übernommen – gleich auf dem Display')
      libReload()
      done({ ...folder, coverHidden: false, cover: body?.path ? localCoverUrl(body.path) : folder.cover })
    },
  })
}

// A folder of the SD card: an artist (or a folder of folders) with its cover and its albums, each album opens on its
// own sheet; a folder that is an album itself opens as one. parent: the folder above, to go back to.
async function openLocalSheet(folder, parent = null) {
  if (!folder.libraryIsContainer) return openLocalAlbumSheet(folder, parent)
  const r = await api(`/api/library/children?path=${encodeURIComponent(folder.libraryPath)}`)
  const albums = (Array.isArray(r.body) ? r.body : []).filter((a) => !a.ownFiles)
  const thumb = (cover) => `<span class="lib-thumb">${cover ? `<img src="${esc(stampedCover(cover))}" alt="" loading="lazy">` : icon('image', 18)}</span>`
  openSheet(
    `${parent ? `<button class="sheet-back" data-back>${icon('back', 18)}<span translate="no">${esc(parent.title)}</span></button>` : ''}
     <div class="local-head"><span class="local-cover">${folder.cover ? `<img src="${esc(stampedCover(folder.cover))}" alt="">` : icon('image', 28)}</span>
       <div class="lbl"><h2 translate="no">${esc(folder.title)}</h2><p class="help" style="margin:0">${esc(['Ordner auf der SD-Karte', catLabel(folder.category), `${albums.length} ${albums.length === 1 ? 'Album' : 'Alben'}`].join(' · '))}</p>
       <button class="btn sm" data-cover>${icon('image', 16)}${folder.cover ? 'Cover ändern' : 'Cover wählen'}</button></div></div>
     ${albums.length ? `<div class="section-label" style="margin:0">Alben</div><div class="rows">${albums.map((a, i) => `<button class="entry lib-row" data-a="${i}">${thumb(a.cover)}<span class="lbl"><b translate="no">${esc(a.title)}</b>${a.libraryIsContainer ? '<small>Ordner</small>' : ''}</span><span class="chev">${icon('chevron', 18)}</span></button>`).join('')}</div>` : ''}
     <div class="btns"><button class="btn danger" data-all>Ganzen Ordner löschen</button><button class="btn" data-close>${parent ? 'Zurück' : 'Schließen'}</button></div>`,
    (sheet, close) => {
      for (const img of sheet.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
      const back = () => (parent ? openLocalSheet(parent) : close())
      sheet.querySelector('[data-close]').onclick = back
      sheet.querySelector('[data-back]')?.addEventListener('click', back)
      sheet.querySelector('[data-cover]').onclick = () => pickLocalCover(folder, parent, (f) => openLocalSheet(f, parent))
      for (const b of sheet.querySelectorAll('[data-a]')) b.onclick = () => openLocalSheet(albums[Number(b.dataset.a)], folder)
      sheet.querySelector('[data-all]').onclick = () => {
        close()
        deleteLocal(folder.libraryPath, folder.title, 'Der Ordner')
      }
    },
  )
}

// The cover picker for a folder of the NAS (cover.jpg there, needs write permission); done: the folder as it is then
function pickNasCover(folder, parent, done) {
  const album = folder.title
  const artist = parent?.title ?? ''
  const target = `nas:${folder.nasPath}`
  openCoverPicker({
    target,
    title: album,
    query: artist ? `${artist} ${album}` : album,
    fallbacks: artist ? [`${artist} ${withoutNumber(album)}`, withoutNumber(album), artist] : [withoutNumber(album)],
    current: folder.cover,
    hidden: !!folder.coverHidden,
    onHide: (hide) => hideFolderCover(target, hide, folder, parent, done)(),
    onDone: (body) => {
      toast('Cover übernommen – gleich auf dem Display')
      libReload()
      done({ ...folder, coverHidden: false, cover: body?.path ? `/api/nas/stream?path=${encodeURIComponent(body.path)}&w=400&v=${Date.now()}` : folder.cover })
    },
  })
}

// Where a shown NAS folder of the library is on the box (its entry from /api/nas/artists: nasCategory, nasSplit):
// a line with "Ändern", which saves the choice at once (the download setting stays as it is)
function nasPlaceLine(folder) {
  if (!folder?.nasCategory) return ''
  const where = NAS_WHERE[folder.nasCategory === 'nas' ? '' : folder.nasCategory] ?? NAS_WHERE['']
  return `<div class="nas-place"><span>${esc(`Auf der Box: ${where}`)}${folder.nasSplit ? ` · ${esc(tr('Unterordner einzeln'))}` : ''}</span><button class="btn sm" data-place>Ändern</button></div>`
}

function changeNasPlace(folder, reopen) {
  const category = folder.nasCategory && folder.nasCategory !== 'nas' ? folder.nasCategory : ''
  nasWhereSheet(
    { name: folder.title, path: folder.nasPath },
    {
      shown: true,
      category,
      split: !!folder.nasSplit,
      apply: async (show, cat, split) => {
        const p = folder.nasPath
        const st = await api('/api/nas/state')
        if (!st.ok) return toast('Das hat nicht geklappt', 'info')
        const download = (st.body?.downloadFolders ?? []).includes(p)
        const r = await api('/api/nas/selection', {
          method: 'POST',
          body: { shown: [p], show: show ? [p] : [], hide: [], download: download ? [p] : [], categories: show && cat ? { [p]: cat } : {}, split: show && cat && split ? [p] : [] },
        })
        if (!r.ok || !r.body?.success) return toast('Nicht gespeichert', 'info')
        toast(show ? `${NAS_WHERE[cat] ?? NAS_WHERE['']} – gleich auf dem Display` : 'Nicht mehr angezeigt')
        await libReload()
        if (show) reopen({ ...folder, nasCategory: cat || 'nas', nasSplit: !!(cat && split) })
      },
    },
  )
}

// A folder of the NAS (as openLocalSheet): the folders in it, each opens on its own sheet; an album shows its cover
// and plays. The NAS administration (login, shown folders, downloads) is a button away.
async function openNasSheet(folder, parent = null) {
  if (!folder.nasIsContainer) return openNasAlbumSheet(folder, parent)
  const r = await api(`/api/nas/children?path=${encodeURIComponent(folder.nasPath)}`)
  const albums = Array.isArray(r.body) ? r.body : []
  const thumb = (cover) => `<span class="lib-thumb">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : icon('folder', 18)}</span>`
  openSheet(
    `${parent ? `<button class="sheet-back" data-back>${icon('back', 18)}<span translate="no">${esc(parent.title)}</span></button>` : ''}
     <div class="local-head"><span class="local-cover">${folder.cover ? `<img src="${esc(folder.cover)}" alt="">` : icon('folder', 28)}</span>
       <div class="lbl"><h2 translate="no">${esc(folder.title)}</h2><p class="help" style="margin:0">${esc(['Ordner auf dem NAS', `${albums.length} ${albums.length === 1 ? 'Album' : 'Alben'}`].join(' · '))}</p>
       <button class="btn sm" data-cover>${icon('image', 16)}${folder.cover ? 'Cover ändern' : 'Cover wählen'}</button></div></div>
     ${parent ? '' : nasPlaceLine(folder)}
     ${r.ok ? '' : `<p class="help" style="margin:0">Das NAS antwortet gerade nicht.</p>`}
     ${albums.length ? `<div class="section-label" style="margin:0">Alben</div><div class="rows">${albums.map((a, i) => `<button class="entry lib-row" data-a="${i}">${thumb(a.cover)}<span class="lbl"><b translate="no">${esc(a.title)}</b>${a.nasIsContainer ? '<small>Ordner</small>' : ''}</span><span class="chev">${icon('chevron', 18)}</span></button>`).join('')}</div>` : ''}
     <div class="btns"><button class="btn" data-admin>NAS-Verwaltung</button><button class="btn" data-close>${parent ? 'Zurück' : 'Schließen'}</button></div>`,
    (sheet, close) => {
      for (const img of sheet.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
      const back = () => (parent ? openNasSheet(parent) : close())
      sheet.querySelector('[data-close]').onclick = back
      sheet.querySelector('[data-back]')?.addEventListener('click', back)
      sheet.querySelector('[data-admin]').onclick = () => {
        close()
        go('nas')
      }
      for (const b of sheet.querySelectorAll('[data-a]')) b.onclick = () => openNasSheet(albums[Number(b.dataset.a)], folder)
      sheet.querySelector('[data-cover]').onclick = () => pickNasCover(folder, parent, (f) => openNasSheet(f, parent))
      sheet.querySelector('[data-place]')?.addEventListener('click', () => changeNasPlace(folder, (f) => openNasSheet(f)))
    },
  )
}

// An album of the NAS: its cover large, play it; back to its folder
function openNasAlbumSheet(album, parent) {
  openSheet(
    `${parent ? `<button class="sheet-back" data-back>${icon('back', 18)}<span translate="no">${esc(parent.title)}</span></button>` : ''}
     <span class="album-cover">${album.cover ? `<img src="${esc(album.cover)}" alt="">` : icon('folder', 40)}</span>
     <div class="album-title"><h2 translate="no">${esc(album.title)}</h2><p class="help" style="margin:0">${esc(['Album auf dem NAS', parent?.title].filter(Boolean).join(' · '))}</p></div>
     ${parent ? '' : nasPlaceLine(album)}
     <button class="btn primary block" data-play>${icon('phones', 18)}Abspielen</button>
     <div class="btns"><button class="btn" data-cover>${icon('image', 18)}${album.cover ? 'Cover ändern' : 'Cover wählen'}</button><button class="btn" data-admin>NAS-Verwaltung</button><button class="btn" data-close>${parent ? 'Zurück' : 'Schließen'}</button></div>`,
    (sheet, close) => {
      for (const img of sheet.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
      const back = () => (parent ? openNasSheet(parent) : close())
      sheet.querySelector('[data-close]').onclick = back
      sheet.querySelector('[data-back]')?.addEventListener('click', back)
      sheet.querySelector('[data-admin]').onclick = () => {
        close()
        go('nas')
      }
      sheet.querySelector('[data-play]').onclick = () => {
        close()
        startPlay(album.title, `${API}/library/play-nas`, { path: album.nasPath })
      }
      sheet.querySelector('[data-cover]').onclick = () => pickNasCover(album, parent, (f) => openNasAlbumSheet(f, parent))
      sheet.querySelector('[data-place]')?.addEventListener('click', () => changeNasPlace(album, (f) => openNasAlbumSheet(f, null)))
    },
  )
}

// An album of the SD card: its cover large, change it or delete the album; back to its artist
function openLocalAlbumSheet(album, parent) {
  openSheet(
    `${parent ? `<button class="sheet-back" data-back>${icon('back', 18)}<span translate="no">${esc(parent.title)}</span></button>` : ''}
     <span class="album-cover">${album.cover ? `<img src="${esc(stampedCover(album.cover))}" alt="">` : icon('image', 40)}</span>
     <div class="album-title"><h2 translate="no">${esc(album.title)}</h2><p class="help" style="margin:0">${esc(['Album auf der SD-Karte', catLabel(album.category), parent?.title].filter(Boolean).join(' · '))}</p></div>
     <button class="btn primary block" data-cover>${icon('image', 18)}${album.cover ? 'Cover ändern' : 'Cover wählen'}</button>
     <div class="btns"><button class="btn danger" data-del>Album löschen</button><button class="btn" data-close>${parent ? 'Zurück' : 'Schließen'}</button></div>`,
    (sheet, close) => {
      for (const img of sheet.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
      const back = () => (parent ? openLocalSheet(parent) : close())
      sheet.querySelector('[data-close]').onclick = back
      sheet.querySelector('[data-back]')?.addEventListener('click', back)
      sheet.querySelector('[data-cover]').onclick = () => pickLocalCover(album, parent, (f) => openLocalAlbumSheet(f, parent))
      sheet.querySelector('[data-del]').onclick = () => {
        close()
        deleteLocal(album.libraryPath, album.title, 'Das Album')
      }
    },
  )
}

// the services of the cover search, as their badge on a result
const COVER_SOURCES = { itunes: 'iTunes', deezer: 'Deezer', spotify: 'Spotify' }

/* Choosing a cover: a search at iTunes, Deezer and Spotify or an own picture, for a folder of the SD card or an entry */

// target: 'local:<path>' (the folder gets it as cover.jpg) or 'own:<name>' (stored among the own pictures, onDone gets
// its address); query: the search it starts with, fallbacks: shorter ones when it finds nothing; current: the picture
// shown now. onHide (folders): "Kein Cover" (hide true) or, when hidden, "Cover wieder zeigen" (false); true when done
function openCoverPicker({ target, title, query, fallbacks, current, hidden = false, onDone, onHide }) {
  let results = []
  let chosen = null // { i } of a result, or { blob, url } of an own picture
  const coverError = (r) =>
    ({
      download_failed: 'Das Bild ließ sich nicht laden – bitte ein anderes nehmen.',
      too_small: 'Das Bild ist zu klein (mindestens 200 × 200 px).',
      not_an_image: 'Das ist kein JPG- oder PNG-Bild.',
      too_large: 'Das Bild ist zu groß.',
      item_not_found: 'Den Ordner gibt es nicht mehr.',
      nas_denied: 'Die Box darf in diesen NAS-Ordner nicht schreiben – dem NAS-Konto der Box fehlt das Schreibrecht.',
      nas_offline: 'Das NAS antwortet gerade nicht.',
      nas_not_selected: 'Dieser NAS-Ordner ist nicht freigegeben.',
      nas_failed: 'Das NAS hat das Bild nicht angenommen.',
    })[r.body?.error] ?? 'Das hat nicht geklappt'
  openSheet(
    `<h2>Cover für „${esc(title)}“</h2>
     <div class="cover-now">${current ? `<span class="lib-thumb"><img src="${esc(current)}" alt=""></span>` : ''}<p class="help" style="margin:0">Ein Bild antippen und übernehmen – oder ein eigenes Bild vom Gerät nehmen. Es wird quadratisch zugeschnitten.</p></div>
     ${onHide && hidden ? `<div class="cover-hidden"><p class="help" style="margin:0">Dieser Ordner wird gerade ohne Cover gezeigt.</p><button class="btn sm" id="cp-hide">Cover wieder zeigen</button></div>` : ''}
     ${onHide && !hidden && current ? `<div class="cover-hidden"><p class="help" style="margin:0">Lieber gar kein Bild? Die Bilder im Ordner bleiben dabei erhalten.</p><button class="btn sm" id="cp-hide">${icon('close', 16)}Kein Cover</button></div>` : ''}
     <form class="cover-search" id="cp-form"><div class="search">${icon('search')}<input class="input" id="cp-q" type="search" value="${esc(query)}" autocomplete="off" enterkeyhint="search" aria-label="Cover suchen"></div><button class="btn" type="submit">Suchen</button></form>
     <p class="help" style="margin:0">Sucht bei iTunes, Deezer und Spotify – der Suchbegriff geht dafür an Apple, Deezer und Spotify.</p>
     <div class="covers cover-pick" id="cp-list"></div>
     <input type="file" id="cp-file" accept="image/*" hidden>
     <div class="btns cover-actions"><button class="btn" id="cp-own">${icon('image', 18)}Eigenes Bild</button><button class="btn" data-close>Abbrechen</button><button class="btn primary" id="cp-ok" disabled>Übernehmen</button></div>`,
    (sheet, close) => {
      const list = $('#cp-list', sheet)
      const ok = $('#cp-ok', sheet)
      const draw = () => {
        const own = chosen?.blob
          ? `<button type="button" class="cover-tile" data-own aria-pressed="true"><span class="cover-img"><img src="${chosen.url}" alt=""><span class="cover-badge">Eigenes</span></span><b>Eigenes Bild</b><small>vom Gerät</small></button>`
          : ''
        const tiles = results.map(
          (c, i) => `<button type="button" class="cover-tile" data-i="${i}" aria-pressed="${chosen?.i === i}"><span class="cover-img"><img src="${esc(c.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="cover-badge">${COVER_SOURCES[c.source] ?? ''}</span></span>
            <b translate="no">${esc(c.title)}</b><small translate="no">${esc(c.artist)}</small></button>`,
        )
        list.innerHTML = own + (tiles.length ? tiles.join('') : own ? '' : `<p class="help covers-empty">Nichts gefunden – anders suchen oder ein eigenes Bild nehmen.</p>`)
        for (const b of list.querySelectorAll('[data-i]')) {
          b.onclick = () => {
            if (chosen?.url) URL.revokeObjectURL(chosen.url)
            chosen = { i: Number(b.dataset.i) }
            draw()
          }
        }
        ok.disabled = !chosen
      }
      // The first search: when the whole name finds nothing, shorter ones are tried (the album without its number, the
      // artist alone); the field shows the one that found something
      const search = async (tries = [$('#cp-q', sheet).value.trim()]) => {
        const queries = [...new Set(tries.map((t) => t.trim()).filter((t) => t.length >= 2))]
        if (queries.length === 0) return
        list.innerHTML = `<div class="loading"><p>Suche …</p></div>`
        let r
        for (const q of queries) {
          r = await api(`${API}/cover-search?q=${encodeURIComponent(q)}`)
          if (!sheet.contains(list)) return // (closed meanwhile)
          if (!r.ok || (r.body?.results ?? []).length > 0) {
            $('#cp-q', sheet).value = q
            break
          }
        }
        results = r.ok ? (r.body?.results ?? []) : []
        if (chosen && !chosen.blob) chosen = null
        draw()
        if (!r.ok) list.innerHTML = `<p class="help covers-empty">${r.status === 502 ? 'iTunes, Deezer und Spotify sind gerade nicht erreichbar.' : 'Die Suche hat nicht geklappt.'}</p>`
      }
      $('#cp-form', sheet).onsubmit = (e) => {
        e.preventDefault()
        $('#cp-q', sheet).blur() // (the phone's keyboard goes, the results show)
        search()
      }
      const file = $('#cp-file', sheet)
      $('#cp-own', sheet).onclick = () => file.click()
      file.onchange = async () => {
        const f = file.files?.[0]
        file.value = ''
        if (!f) return
        const blob = await squareImage(f).catch(() => null)
        if (!blob) return toast(blob === null ? 'Das Bild ließ sich nicht öffnen.' : 'Das Bild ist zu klein (mindestens 200 × 200 px).', 'info')
        if (chosen?.url) URL.revokeObjectURL(chosen.url)
        chosen = { blob, url: URL.createObjectURL(blob) }
        draw()
      }
      sheet.querySelector('[data-close]').onclick = close
      const hideButton = $('#cp-hide', sheet)
      if (hideButton) {
        hideButton.onclick = async () => {
          hideButton.disabled = true
          close()
          await onHide(!hidden)
        }
      }
      ok.onclick = async () => {
        ok.disabled = true
        ok.textContent = 'Wird übernommen …'
        const r = chosen.blob
          ? await fetch(`${API}/cover-apply?target=${encodeURIComponent(target)}`, {
              method: 'PUT',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/octet-stream', 'x-mupibox-csrf': state.csrf },
              body: chosen.blob,
            }).then(
              async (x) => ({ ok: x.ok, status: x.status, body: await x.json().catch(() => ({})) }),
              () => ({ ok: false, status: 0, body: {} }),
            )
          : await api(`${API}/cover-apply`, { method: 'POST', body: { target, image: results[chosen.i].image } })
        if (!r.ok) {
          ok.disabled = false
          ok.textContent = 'Übernehmen'
          return toast(coverError(r), 'info')
        }
        close()
        onDone?.(r.body)
      }
      draw()
      search([query, ...(fallbacks ?? [])])
      // (on a phone no keyboard over the results: the search field gets the focus only when tapped)
      if (matchMedia('(pointer: coarse)').matches) requestAnimationFrame(() => $('#cp-q', sheet)?.blur())
    },
    () => {
      if (chosen?.url) URL.revokeObjectURL(chosen.url)
    },
  )
}

// "084 Das Zirkusfest" / "1 - Flucht in der Nacht" without the episode number (catalogs often name it otherwise)
const withoutNumber = (name) => String(name).replace(/^\d{1,4}\s*(?:[-.:)_]\s*)?/, '').trim() || String(name)

// An own picture squared (the middle of it) and at most 1000 px, as JPEG; undefined when it is smaller than 200 px
async function squareImage(file, max = 1000) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (side < 200) return undefined
    const out = Math.min(side, max)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? null), 'image/jpeg', 0.9))
  } finally {
    URL.revokeObjectURL(url)
  }
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
            .map((a, i) => `<button class="entry lib-row" data-sub="${i}"><span class="avatar">${esc(initials(a.name || a.id))}</span><span class="lbl"><b translate="no">${esc(a.name || a.id)}</b><small>${esc(range(a))} · ${esc(catLabel(a.category))}${a.exclude_album_ids?.length ? ` · ${a.exclude_album_ids.length} ausgeschlossen` : ''}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`)
            .join('')}</div>`
        : `<p class="help" style="margin:0">Noch keine. Über „Auf Spotify suchen“ einen Künstler mit ＋ abonnieren.</p>`
    }</section>`,
    `<section class="card"><h2>Einzelne Alben</h2>${
      albums.length
        ? `<div class="rows">${albums
            .map((a, i) => `<div class="entry"><span class="avatar">${esc(initials(a.name || a.id))}</span><span class="lbl"><b translate="no">${esc(a.name || a.id)}</b><small>${esc(catLabel(a.category))}</small></span><button class="btn danger sm" data-album="${i}">Entfernen</button></div>`)
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
    `<h2 translate="no">${esc(a.name || a.id)}</h2><p class="help" style="margin:0">„Folge“ ist die Position nach Erscheinungsdatum (1 = die älteste). Leer = offen.</p>
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
        <span class="lbl"><b translate="no">${esc(al.name || al.id)}</b>${al.inRange ? '' : '<small>außerhalb des Bereichs</small>'}</span>
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
    // (the backend's reason is English, e.g. "Failed to search"; 503: Spotify is not set up)
    box.innerHTML = `<p class="help">${r.status === 503 ? 'Die Suche braucht eine eingerichtete Spotify-Verbindung (Bibliothek › Spotify).' : 'Die Suche hat nicht geklappt.'}</p>`
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
            .map((r) => `<div class="entry"><span class="lib-thumb">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : ''}${icon('music', 18)}</span><span class="lbl"><b translate="no">${esc(r.t)}</b><small>${esc(r.s)}</small></span>
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
      return toast('Das hat nicht geklappt', 'info')
    }
    btn.innerHTML = icon('check', 18)
    const sync = await fireSync()
    toast(`${r.kind === 'artist' ? 'Abonniert' : 'Hinzugefügt'}: ${r.name}. ${sync}`)
    libChanged()
  }
  if (r.kind === 'artist') {
    // (subscribed already: a second subscribe would replace its range and category - it is changed where it is managed)
    const subs = await api(`${API}/library/subscriptions`)
    if ((subs.body?.artists ?? []).some((a) => a.id === r.id || a.artistId === r.id)) {
      btn.innerHTML = icon('check', 18)
      return toast('Schon abonniert – Bereich und Kategorie änderst du unter „Verwaltete Inhalte“.', 'info')
    }
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

/* Podcasts suchen (Apple's podcast directory, in the stores of a language; see podcast-search.ts) */

// lang: remembered on this device (first time: the app's language); suggestions: shows for children before a search
const pod = { q: '', lang: '', kids: true, result: null, suggestions: null, suggestionsLang: '' }
function podLang() {
  if (pod.lang && svc.available.some((l) => l.code === pod.lang)) return pod.lang
  let saved = ''
  try {
    saved = localStorage.getItem('mupi-pod-lang') ?? ''
  } catch {
    // (private mode: the app's language)
  }
  const known = (c) => svc.available.some((l) => l.code === c)
  pod.lang = known(saved) ? saved : known(getLang()) ? getLang() : 'de'
  return pod.lang
}

function podTop() {
  if (!svc.podcasts) {
    return [
      `<section class="card wide"><p class="help" style="margin:0">${esc('Die Podcast-Suche ist ausgeschaltet. Einschalten unter Einstellungen › Dienste.')}</p>
        <div class="btns"><button class="btn primary" id="pod-services">Dienste öffnen</button></div></section>`,
    ]
  }
  podLang()
  const langs = svc.available
  return [
    `<section class="card wide">
      <p class="help" style="margin:0">${esc('Findet Podcasts vieler Sender und Anbieter – auch Deutschlandfunk, SRF, ORF, RTÉ oder BBC, bei Deutsch zusätzlich die ARD Audiothek. Eine Sendung kommt wie ein Podcast auf die Box, neue Folgen erscheinen von selbst. Der Suchbegriff geht an Apples Podcast-Verzeichnis (bei Deutsch auch an die ARD).')}</p>
      <div class="search">${icon('search')}<input class="input" id="pod-q" type="search" placeholder="${esc('Sendung suchen – z. B. Gutenachtgeschichten')}" autocomplete="off" value="${esc(pod.q)}" enterkeyhint="search"></div>
      <div class="field"><label for="pod-lang">Sprache</label><select class="input" id="pod-lang">${langs
        .map((l) => `<option value="${esc(l.code)}"${l.code === pod.lang ? ' selected' : ''} translate="no">${esc(l.name)}</option>`)
        .join('')}</select></div>
      <div class="seg" id="pod-kids"><button aria-pressed="${pod.kids}" data-v="1">Für Kinder</button><button aria-pressed="${!pod.kids}" data-v="0">Alles</button></div>
      <div class="btns"><button class="btn primary" id="pod-go">Suchen</button></div>
    </section>`,
    `<div id="pod-results" class="wide-stack"></div>`,
  ]
}

async function doPodSearch() {
  const q = pod.q.trim()
  if (q.length < 2) return toast('Bitte mindestens 2 Zeichen eingeben', 'info')
  const box = $('#pod-results')
  box.innerHTML = `<div class="loading"><p>Suche …</p></div>`
  const r = await api(`${API}/podcast-search?${new URLSearchParams({ q, lang: pod.lang, ...(pod.kids ? { kids: '1' } : {}) })}`)
  if (!r.ok) {
    box.innerHTML = `<p class="help">${esc('Das Podcast-Verzeichnis ist gerade nicht erreichbar.')}</p>`
    return
  }
  pod.result = r.body?.shows ?? []
  drawPod()
}

// Before a search: suggestions for children in the chosen language (German: the ARD Audiothek's children's shows)
async function loadPodSuggestions() {
  const box = $('#pod-results')
  if (!box || pod.result) return
  if (pod.suggestions && pod.suggestionsLang === pod.lang) return drawPod()
  box.innerHTML = `<div class="loading"><p>Lade …</p></div>`
  const lang = pod.lang
  const r = await api(`${API}/podcast-suggestions?lang=${encodeURIComponent(lang)}`)
  if (lang !== pod.lang) return
  pod.suggestions = r.ok ? (r.body?.shows ?? []) : []
  pod.suggestionsLang = lang
  drawPod()
}

function drawPod() {
  const box = $('#pod-results')
  if (!box) return
  if (!pod.result) {
    // (nothing searched yet: the suggestions, if the language has some)
    const shows = pod.suggestionsLang === pod.lang ? (pod.suggestions ?? []) : []
    box.innerHTML = shows.length ? podList('Vorschläge für Kinder', shows) : ''
    wirePodList(box, shows)
    return
  }
  const shows = pod.result
  box.innerHTML = shows.length ? podList('Gefunden', shows) : `<p class="help">${esc(pod.kids ? 'Nichts für Kinder gefunden – mit „Alles“ noch einmal suchen?' : 'Nichts gefunden.')}</p>`
  wirePodList(box, shows)
}

// (the provider under the name: the ARD Audiothek's shows come with their station, the others with their publisher)
function podList(title, shows) {
  return `<section class="card"><h2>${esc(title)}</h2><div class="rows">${shows
    .map(
      (s, i) => `<button class="entry lib-row ard-show" data-show="${i}"><span class="lib-thumb">${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : ''}${icon('music', 18)}</span>
        <span class="lbl"><b translate="no">${esc(s.title)}</b><small translate="no">${esc([s.author, s.genre === 'ARD Audiothek' ? 'ARD Audiothek' : '', s.episodes ? `${s.episodes} Folgen` : ''].filter(Boolean).join(' · '))}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`,
    )
    .join('')}</div></section>`
}
function wirePodList(box, shows) {
  for (const img of box.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of box.querySelectorAll('[data-show]')) b.onclick = () => openPodShow(shows[Number(b.dataset.show)])
}

// A show of the directory: its newest episodes (from its feed, as the box reads it) and how it comes onto the box
async function openPodShow(s) {
  const data = await api('/api/data')
  const same = (id) => String(id ?? '').replace(/^https?:\/\//, '') === s.feedUrl.replace(/^https?:\/\//, '')
  const have = Array.isArray(data.body) && data.body.some((it) => it?.type === 'rss' && same(it.id))
  openSheet(
    `<div class="ard-head">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}<span class="lbl"><h2 translate="no" style="margin:0">${esc(s.title)}</h2><small translate="no">${esc([s.author, s.genre].filter(Boolean).join(' · '))}</small></span></div>
     ${
       have
         ? `<div class="section-label" style="margin:0">${esc('Neueste Folgen')}</div><div id="pod-eps"><p class="help">Lade die Folgen …</p></div>
            <p class="help" style="margin:0">${esc('Schon in der Bibliothek.')}</p><div class="btns"><button class="btn" data-close>Schließen</button></div>`
         : `<div class="field"><label for="pod-cat">Hinzufügen als</label>${catSelect('pod-cat', 'audiobook', false)}</div>
            ${episodePickFields('pod', {})}
            <div class="field"><label for="pod-sort">Reihenfolge auf der Box</label><select class="input" id="pod-sort"><option value="${SORT_VALUES[4]}">Neueste zuerst</option><option value="${SORT_VALUES[3]}">Älteste zuerst</option></select></div>
            <div class="section-label" style="margin:0">${esc('Folgen auf der Box')}</div><div id="pod-eps"><p class="help">Lade die Folgen …</p></div>
            <div class="field"><label for="pod-off">Auf der Box speichern (ohne Internet hören)</label><select class="input" id="pod-off">${offlineOptions(0, false)}</select></div>
            <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-add>${icon('plus', 18)}Hinzufügen</button></div>`
     }`,
    async (sheet, close) => {
      for (const b of sheet.querySelectorAll('[data-close]')) b.onclick = close
      // the feed's episodes, newest first (by date; without one in the feed's order), numbered by date: 1 = the oldest
      let episodes = null
      const preview = () => {
        const box = sheet.querySelector('#pod-eps')
        if (!box?.isConnected || !episodes) return
        if (!episodes.length) {
          box.innerHTML = `<p class="help">${esc('Die Folgen ließen sich nicht laden.')}</p>`
          return
        }
        const row = (e, out) =>
          `<div class="entry${out ? ' out' : ''}"><span class="lbl"><b translate="no">${esc(e.title)}</b><small>${esc([`Folge ${e.no}`, e.when ? new Date(e.when).toLocaleDateString(LOCALE) : '', durationText(e.duration)].filter(Boolean).join(' · '))}</small></span></div>`
        if (have) {
          box.innerHTML = `<div class="rows">${episodes.slice(0, 5).map((e) => row(e, false)).join('')}</div>`
          return
        }
        const pick = episodePickOf(sheet, 'pod')
        if (pick === null) {
          box.innerHTML = `<p class="help">${esc(BAD_RANGE)}</p>`
          return
        }
        // in the box's order: the chosen ones (the first few), then the next ones that are not on the box, greyed
        const asc = sheet.querySelector('#pod-sort').value === SORT_VALUES[3]
        const chosen = new Set(pickEpisodes(episodes, pick))
        const ordered = asc ? [...episodes].reverse() : episodes
        const inBox = ordered.filter((e) => chosen.has(e))
        const lastAt = ordered.indexOf(inBox[inBox.length - 1])
        const outside = [...ordered.slice(lastAt + 1), ...ordered.slice(0, lastAt + 1)].filter((e) => !chosen.has(e))
        const n = episodes.length
        box.innerHTML = `<p class="help" style="margin:0"><b>${esc(inBox.length === n ? `Alle ${n} Folgen kommen auf die Box` : `${inBox.length} von ${n} Folgen kommen auf die Box`)}</b></p>
          <div class="rows">${inBox
            .slice(0, 4)
            .map((e) => row(e, false))
            .join('')}${inBox.length > 4 ? `<p class="help" style="margin:4px 0">${esc(`… und ${inBox.length - 4} weitere`)}</p>` : ''}${outside
            .slice(0, 2)
            .map((e) => row(e, true))
            .join('')}</div>${outside.length ? `<p class="help" style="margin:0">${esc(`Grau: nicht auf der Box (${outside.length} Folgen)`)}</p>` : ''}`
      }
      if (!have) {
        // "the first N" and a range read from the oldest on, the newest N from the newest - until the order is chosen
        let sortTouched = false
        sheet.querySelector('#pod-sort').addEventListener('change', () => {
          sortTouched = true
          preview()
        })
        wireEpisodePick(sheet, 'pod', () => {
          const v = sheet.querySelector('#pod-pick').value
          if (!sortTouched) sheet.querySelector('#pod-sort').value = /^(oldest|range)/.test(v) ? SORT_VALUES[3] : SORT_VALUES[4]
          refreshOfflineOptions(sheet.querySelector('#pod-off'), v !== '')
          preview()
        })
      }
      sheet.querySelector('[data-add]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget
        const pick = episodePickOf(sheet, 'pod')
        if (pick === null) return toast(BAD_RANGE, 'info')
        btn.disabled = true
        const keep = Number(sheet.querySelector('#pod-off').value) || 0
        const asc = sheet.querySelector('#pod-sort').value === SORT_VALUES[3]
        const body = {
          type: 'rss',
          id: s.feedUrl,
          artist: s.title,
          category: sheet.querySelector('#pod-cat').value,
          source: 'manual',
          ...(pick ? { episodePick: pick } : {}),
          ...(asc ? { sorting: SORT_VALUES[3] } : {}),
          ...(keep ? { offline: keep } : {}),
        }
        const r = await api('/api/add', { method: 'POST', body })
        btn.disabled = false
        if (!libWriteOk(r)) return
        close()
        toast(`Hinzugefügt: ${s.title}`)
        if (keep) api(`${API}/podcast-offline/sync`, { method: 'POST', body: {} })
        libChanged()
        lib.items = null
      })
      // (the feed as the box reads it - it is in the box's cache then, the display shows it at once after adding)
      const r = await api(`/api/rssfeed/cached?url=${encodeURIComponent(s.feedUrl)}`)
      const box = sheet.querySelector('#pod-eps')
      if (!box?.isConnected) return
      const raw = r.body?.rss?.channel?.item
      const text = (v) => (typeof v === 'string' ? v : (v?._cdata ?? v?._text ?? ''))
      const list = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .filter((it) => it?.enclosure?._attributes?.url)
        .map((it, i) => {
          const when = Date.parse(text(it.pubDate))
          return { title: text(it.title) || 'Folge', when: Number.isFinite(when) ? when : null, duration: text(it['itunes:duration']), i }
        })
        // (as the box counts: one without a date after all dated ones, in the feed's order)
        .sort((a, b) => (b.when ?? -b.i) - (a.when ?? -a.i))
      episodes = list.map((e, i) => ({ ...e, no: list.length - i }))
      preview()
    },
  )
}

/* Radiosender suchen (radio-browser.info, see radio-search.ts) */

// the language is the one of the podcast search (the same choice, remembered on this device)
const radio = { q: '', kids: true, result: null, suggestions: null, suggestionsLang: '' }

function radioTop() {
  if (!svc.radio) {
    return [
      `<section class="card wide"><p class="help" style="margin:0">${esc('Die Radiosender-Suche ist ausgeschaltet. Einschalten unter Einstellungen › Dienste.')}</p>
        <div class="btns"><button class="btn primary" id="radio-services">Dienste öffnen</button></div></section>`,
    ]
  }
  podLang()
  return [
    `<section class="card wide">
      <p class="help" style="margin:0">${esc('Findet Radiosender aus vielen Ländern, auch Kinderradio. Der Sender kommt unter Radio & Podcasts auf die Box. Das Verzeichnis (radio-browser.info) wird von seinen Nutzern gepflegt; der Suchbegriff geht dorthin.')}</p>
      <div class="search">${icon('search')}<input class="input" id="radio-q" type="search" placeholder="${esc('Sender suchen – z. B. Die Maus')}" autocomplete="off" value="${esc(radio.q)}" enterkeyhint="search"></div>
      <div class="field"><label for="radio-lang">Sprache</label><select class="input" id="radio-lang">${svc.available
        .map((l) => `<option value="${esc(l.code)}"${l.code === pod.lang ? ' selected' : ''} translate="no">${esc(l.name)}</option>`)
        .join('')}</select></div>
      <div class="seg" id="radio-kids"><button aria-pressed="${radio.kids}" data-v="1">Für Kinder</button><button aria-pressed="${!radio.kids}" data-v="0">Alles</button></div>
      <div class="btns"><button class="btn primary" id="radio-go">Suchen</button></div>
    </section>`,
    `<div id="radio-results" class="wide-stack"></div>`,
  ]
}

async function doRadioSearch() {
  const q = radio.q.trim()
  if (q.length < 2) return toast('Bitte mindestens 2 Zeichen eingeben', 'info')
  const box = $('#radio-results')
  box.innerHTML = `<div class="loading"><p>Suche …</p></div>`
  const r = await api(`${API}/radio-search?${new URLSearchParams({ q, lang: pod.lang, ...(radio.kids ? { kids: '1' } : {}) })}`)
  if (!r.ok) {
    box.innerHTML = `<p class="help">${esc('Das Senderverzeichnis ist gerade nicht erreichbar.')}</p>`
    return
  }
  radio.result = r.body?.stations ?? []
  drawRadio()
}

// Before a search: the children's stations of the language
async function loadRadioSuggestions() {
  const box = $('#radio-results')
  if (!box || radio.result) return
  if (radio.suggestions && radio.suggestionsLang === pod.lang) return drawRadio()
  box.innerHTML = `<div class="loading"><p>Lade …</p></div>`
  const lang = pod.lang
  const r = await api(`${API}/radio-suggestions?lang=${encodeURIComponent(lang)}`)
  if (lang !== pod.lang) return
  radio.suggestions = r.ok ? (r.body?.stations ?? []) : []
  radio.suggestionsLang = lang
  drawRadio()
}

function drawRadio() {
  const box = $('#radio-results')
  if (!box) return
  const searched = !!radio.result
  const stations = searched ? radio.result : radio.suggestionsLang === pod.lang ? (radio.suggestions ?? []) : []
  box.innerHTML = stations.length
    ? `<section class="card"><h2>${esc(searched ? 'Gefunden' : 'Kinderradio')}</h2><div class="rows">${stations
        .map(
          (s, i) => `<button class="entry lib-row ard-show" data-station="${i}"><span class="lib-thumb">${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : ''}${icon('vol', 18)}</span>
            <span class="lbl"><b translate="no">${esc(s.name)}</b><small translate="no">${esc([s.country, s.tags.join(', ')].filter(Boolean).join(' · '))}</small></span><span class="chev">${icon('chevron', 18)}</span></button>`,
        )
        .join('')}</div></section>`
    : searched
      ? `<p class="help">${esc(radio.kids ? 'Nichts für Kinder gefunden – mit „Alles“ noch einmal suchen?' : 'Nichts gefunden.')}</p>`
      : ''
  for (const img of box.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true })
  for (const b of box.querySelectorAll('[data-station]')) b.onclick = () => openRadioStation(stations[Number(b.dataset.station)])
}

// A station: its details and how it comes onto the box
async function openRadioStation(s) {
  const data = await api('/api/data')
  const have = Array.isArray(data.body) && data.body.some((it) => it?.type === 'radio' && String(it.id ?? '').replace(/^https?:\/\//, '') === s.url.replace(/^https?:\/\//, ''))
  openSheet(
    `<div class="ard-head">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}<span class="lbl"><h2 translate="no" style="margin:0">${esc(s.name)}</h2><small translate="no">${esc([s.country, s.codec, s.bitrate ? `${s.bitrate} kbit/s` : ''].filter(Boolean).join(' · '))}</small></span></div>
     ${s.tags.length ? `<p class="ard-synopsis" translate="no">${esc(s.tags.join(', '))}</p>` : ''}
     ${
       have
         ? `<p class="help" style="margin:0">${esc('Schon in der Bibliothek.')}</p><div class="btns"><button class="btn" data-close>Schließen</button></div>`
         : `<div class="field"><label for="radio-cat">Hinzufügen als</label>${catSelect('radio-cat', 'other', false)}</div>
            <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-add>${icon('plus', 18)}Hinzufügen</button></div>`
     }`,
    (sheet, close) => {
      for (const b of sheet.querySelectorAll('[data-close]')) b.onclick = close
      sheet.querySelector('[data-add]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget
        btn.disabled = true
        const body = { type: 'radio', id: s.url, artist: s.name, title: s.name, category: sheet.querySelector('#radio-cat').value, source: 'manual', ...(s.image ? { cover: s.image } : {}) }
        const r = await api('/api/add', { method: 'POST', body })
        btn.disabled = false
        if (!libWriteOk(r)) return
        close()
        toast(`Hinzugefügt: ${s.name}`)
        libChanged()
        lib.items = null
      })
    },
  )
}

/* Link einfügen (Spotify-Link, Radiosender, Podcast) */

function spotifyIdFrom(url, kind) {
  const m = new RegExp(`${kind}/([A-Za-z0-9]+)`).exec(url)
  return m ? m[1] : null
}

// The order of an entry's albums / episodes (data.json "sorting"; none: podcasts newest first, else A–Z)
const SORT_VALUES = ['', 'Alphabetical' + 'Ascending', 'Alphabetical' + 'Descending', 'ReleaseDate' + 'Ascending', 'ReleaseDate' + 'Descending']
const SORTINGS = ['Standard', 'Alphabetisch A–Z', 'Alphabetisch Z–A', 'Älteste zuerst', 'Neueste zuerst'].map((label, i) => [SORT_VALUES[i], label])
const sortingOf = (label) => SORTINGS.find(([, l]) => l === label)?.[0] ?? ''

// Whether Spotify knows the id as this kind (the box asks it): true / false, or null when it cannot tell (offline, no
// access yet) - then the entry is taken as it is
async function spotifyKnows(id, type) {
  const r = await api('/api/spotify/validate', { method: 'POST', body: { id, type } })
  if (r.ok && r.body?.valid) return true
  return r.status === 0 || r.status >= 500 ? null : false
}

// The fields of the "Link einfügen" page that all kinds share: covers, order, shuffle, a part of the episodes
function linkExtras(body, kind) {
  const cover = String(state.values.get('lCover') ?? '').trim()
  const artistcover = String(state.values.get('lArtistCover') ?? '').trim()
  for (const [k, v] of [['cover', cover], ['artistcover', artistcover]]) {
    if (!v) continue
    if (!/^https?:\/\//.test(v)) return 'Bild-Adressen beginnen mit http:// oder https://'
    body[k] = v
  }
  if (kind === 'radio') return ''
  const sorting = sortingOf(state.values.get('lSort'))
  if (sorting) body.sorting = sorting
  if (kind === 'spotify') body.shuffle = !!state.values.get('lShuffle')
  if (state.values.get('lPart')) {
    const from = Number(state.values.get('lFrom') ?? 1) || 1
    const to = Number(state.values.get('lTo') ?? 0) || 0
    if (from < 1 || (to && to < from)) return 'Der Bereich passt nicht (von 1 an, „bis“ nicht vor „von“)'
    Object.assign(body, { aPartOfAll: true, aPartOfAllMin: from, ...(to ? { aPartOfAllMax: to } : {}) })
  }
  return ''
}

// A feed in the home network (e.g. Pinepods on 192.168.…): the box fetches no address there unless its server is
// allowed (see lan-feeds.ts) - asked once per server. True when the feed may be added.
async function allowLanFeed(url) {
  const r = await api(`${API}/feed-hosts/check`, { method: 'POST', body: { url } })
  if (!r.ok || !r.body?.lan || r.body.allowed) return true
  if (r.body.never) {
    toast('Diese Adresse ist die Box selbst – von dort holt sie keine Feeds.', 'info')
    return false
  }
  const host = r.body.host
  const ok = await ask(
    'Server im Heimnetz',
    `Der Feed liegt im Heimnetz (${host}). Adressen im Heimnetz ruft die Box sonst nicht ab, damit niemand sie als Umweg zu anderen Geräten nutzen kann. Diesen Server für Feeds erlauben? Das gilt nur für ${host}; ansehen und entfernen unter Einstellungen › Dienste.`,
    'Erlauben',
  )
  if (!ok) return false
  const a = await api(`${API}/feed-hosts`, { method: 'POST', body: { url, allow: true } })
  if (!a.ok) toast(a.body?.error === 'too_many' ? 'Es sind schon 20 Server erlaubt' : 'Nicht gespeichert', 'info')
  return a.ok
}

async function addLink(page) {
  const type = state.values.get('lType') ?? 'Spotify-Link'
  const url = String(state.values.get('lUrl') ?? '').trim()
  const label = String(state.values.get('lLabel') ?? '').trim()
  const title = String(state.values.get('lTitle') ?? '').trim()
  const category = catFromLabel(state.values.get('lCat') ?? 'Hörbuch/Hörspiel')
  if (!url) return toast(type === 'Spotify-Suche' ? 'Bitte einen Suchbegriff eintragen' : 'Bitte eine URL eintragen', 'info')
  const body = { category, source: 'manual' }
  const kind = type.startsWith('Spotify') ? 'spotify' : type === 'Radio-Stream' ? 'radio' : 'rss'
  const problem = linkExtras(body, kind)
  if (problem) return toast(problem, 'info')
  const button = document.querySelector('[data-label="Hinzufügen"]')
  if (button) button.disabled = true
  try {
    if (type === 'Spotify-Suche') {
      // (the box looks the search up itself: its first hit plays - a name is needed for the tile)
      if (!label) return toast('Bitte auch einen Namen eintragen (so heißt die Kachel)', 'info')
      Object.assign(body, { type: 'spotify', query: url, artist: label })
    } else if (type === 'Spotify-Link') {
      if (!url.startsWith('https://open.spotify.com/')) return toast('Spotify-Links beginnen mit https://open.spotify.com/', 'info')
      const kinds = [['playlist', 'playlistid', 'playlist'], ['artist', 'artistid', 'artist'], ['album', 'id', 'album'], ['show', 'showid', 'show'], ['audiobook', 'audiobookid', 'audiobook']]
      const hit = kinds.map(([k, field, check]) => [field, spotifyIdFrom(url, k), check]).find(([, id]) => id)
      if (!hit) return toast('Diese Art von Spotify-Link kennt die Box nicht', 'info')
      let [field, id, check] = hit
      // a "show" link that is an audiobook at Spotify: stored as one (as the box's own add page did)
      if (field === 'showid' && (await spotifyKnows(id, 'audiobook'))) {
        field = 'audiobookid'
        check = 'audiobook'
      }
      if ((await spotifyKnows(id, check)) === false) return toast('Diesen Inhalt kennt Spotify nicht – ist der Link richtig?', 'info')
      Object.assign(body, { type: 'spotify', spotify_url: url, [field]: id })
      if (label) body.artist = label
    } else {
      if (!/^https?:\/\//.test(url)) return toast('Die URL muss mit http:// oder https:// beginnen', 'info')
      let address = url
      // a playlist file of a radio station (.m3u, .pls): the stream it names
      if (type === 'Radio-Stream' && /\.(m3u|pls)(\?|#|$)/i.test(new URL(url).pathname + new URL(url).search)) {
        const r = await api(`/api/stream/resolve?url=${encodeURIComponent(url)}`)
        if (r.ok && r.body?.resolved) {
          address = r.body.url
          toast('Stream-Adresse aus der Playlist übernommen')
        }
      }
      // (as the box's own add page: the player takes the streams over http)
      const id = address.startsWith('https://') ? address.replace('https://', 'http://') : address
      // a link to a show on ardsounds.de / ardaudiothek.de: taken as the show of ARD Sounds (its page is no feed)
      const ardLink = type !== 'Radio-Stream' && /^https:\/\/(www\.)?(ardsounds|ardaudiothek)\.de\/sendung\//i.test(url)
      const ardId = ardLink ? (await api(`${API}/ard/resolve`, { method: 'POST', body: { url } })).body?.id : null
      if (ardLink && !ardId) return toast('Diese Sendung kennt die ARD Audiothek nicht – ist der Link richtig?', 'info')
      if (type !== 'Radio-Stream' && !ardLink && !(await allowLanFeed(id))) return
      if (type === 'Radio-Stream') Object.assign(body, { type: 'radio', id, artist: label || 'Radio', title: title || 'Stream' })
      else Object.assign(body, { type: 'rss', id: ardId ? `ard:${ardId}` : id, artist: label || 'Podcast' })
    }
  } finally {
    if (button) button.disabled = false
  }
  const r = await api('/api/add', { method: 'POST', body })
  if (!libWriteOk(r)) return
  for (const k of ['lUrl', 'lLabel', 'lTitle', 'lCover', 'lArtistCover', 'lFrom', 'lTo']) state.values.delete(k)
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
  return gb >= 1 ? `${gb.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} GB` : `${Math.round(n / 1024 ** 2)} MB`
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
  $('#u-start').innerHTML = tooBig ? esc('Zu wenig Platz') : `${icon('up', 18)}${esc('Hochladen')}`
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
  // one folder chosen and no album yet: the folder's name is the album's. A second folder: each keeps its own name
  // again (the first one's name as the album put the second one inside it)
  const tops = new Set(up.items.map((it) => it.top).filter(Boolean))
  if (tops.size === 1 && up.album.trim() === '') {
    up.album = [...tops][0]
    up.albumAuto = true
    $('#u-album').value = up.album
  } else if (tops.size > 1 && up.albumAuto) {
    up.album = ''
    up.albumAuto = false
    $('#u-album').value = ''
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
    xhr.onload = () => {
      // (where the box put it, with the names as it cleaned them: for the cover offer afterwards)
      try {
        up.savedPath = xhr.status === 200 ? String(JSON.parse(xhr.responseText).path ?? '') : ''
      } catch {
        up.savedPath = ''
      }
      resolve(xhr.status)
    }
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
  // the album folders the tracks went to, and whether a picture came along
  const albumFolders = new Set()
  const withPicture = jobs.some((j) => UP_IMAGE.test(j.path))
  const artistName = up.artist.trim()
  for (const [i, job] of jobs.entries()) {
    if (up.cancelled) break
    const status = await uploadOne(job.path, job.file, (loaded) => {
      const pct = Math.min(100, ((done + loaded) / total) * 100)
      $('#u-fill').style.width = `${pct.toFixed(1)}%`
      $('#u-ptext').textContent = `${i + 1} von ${jobs.length}: ${job.path} · ${Math.round(pct)} %`
    })
    done += job.file.size
    if (status === 200) {
      ok++
      // category/artist/album/…/file: the album is the third part (a track right in the artist's folder: the artist)
      const parts = up.savedPath.split('/')
      if (parts.length >= 3 && UP_AUDIO.test(job.path)) albumFolders.add(parts.slice(0, Math.min(3, parts.length - 1)).join('/'))
    } else if (status === -1) break
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
  // one album without a picture: a cover from the internet is offered (asked first, the search goes to Apple/Deezer)
  if (ok > 0 && !withPicture && !up.cancelled && albumFolders.size === 1) offerCover([...albumFolders][0], artistName)
}

function offerCover(folder, artist) {
  const name = folder.split('/').pop()
  openSheet(
    `<h2>Cover suchen?</h2>
     <p class="help" style="margin:0">Für „${esc(name)}“ war kein Cover dabei. Soll ich bei iTunes, Deezer und Spotify nach einem suchen? Du wählst dann eins aus – oder nimmst ein eigenes Bild.</p>
     <div class="btns"><button class="btn" data-close>Später</button><button class="btn primary" data-search>${icon('search', 18)}Cover suchen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-search]').onclick = () =>
        openCoverPicker({
          target: `local:${folder}`,
          title: name,
          query: name === artist ? artist : `${artist} ${name}`,
          fallbacks: name === artist ? [] : [`${artist} ${withoutNumber(name)}`, withoutNumber(name), artist],
          onDone: () => {
            lib.coverStamp = Date.now()
            toast('Cover übernommen – gleich auf dem Display')
            libChanged()
            lib.items = null
          },
        })
    },
  )
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
    up.albumAuto = false
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
  if (min < 0) return -min < 60 ? `vor ${-min} min` : -min < 1440 ? `vor ${Math.round(-min / 60)} h` : `am ${new Date(t).toLocaleDateString(LOCALE)}`
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
  // (the way back says where from: Spotify returns to https://<box>, another address than this one - its storage is
  // not there)
  const back = currentId() === 'wizard' ? '/app?from=wizard' : '/app'
  const r = await api(`${API}/spotify-oauth/init?return=${encodeURIComponent(back)}`)
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

// (password managers leave these fields alone: they are no login of a web page)
const NO_PW_MANAGER = 'autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other"'

const spDate = (iso) => (iso ? new Date(iso).toLocaleDateString(LOCALE) : '')

// The player's Spotify login: since when, until when (Spotify: 6 months), refused (see eltern/spotify-auth-age.ts)
function spotifyLogin(a = spot.access ?? {}) {
  const l = a.login ?? {}
  if (!a.connected) return { state: 'none', text: 'Nicht angemeldet' }
  if (l.invalid) return { state: 'refused', text: 'Von Spotify abgelehnt' }
  // (a login older than this version, or given in the admin interface: the box does not know when - its end may be
  // near. A new login makes it known; until then no date is shown that could be too late)
  if (!l.expiresAt || l.estimated) return { state: 'unknown', since: 'Unbekannt', until: 'Unbekannt' }
  const soon = l.daysLeft != null && l.daysLeft <= 14
  return { state: soon ? 'soon' : 'ok', since: spDate(l.authorizedAt), until: spDate(l.expiresAt), days: l.daysLeft }
}

// What is set up (the assistant's steps; the Smart-Sync is optional)
function spotifySteps() {
  const a = spot.access ?? {}
  const tok = spot.status?.token ?? {}
  const login = spotifyLogin(a)
  const keys = !!a.clientId && !!a.hasSecret
  return [
    { id: 'app', short: 'App', title: 'Spotify-App anlegen', done: !!a.clientId },
    { id: 'fields', short: 'Felder', title: 'Felder ausfüllen', done: !!a.clientId },
    { id: 'keys', short: 'Zugang', title: 'Client ID und Client Secret', done: keys },
    { id: 'login', short: 'Login', title: 'Bei Spotify anmelden', done: keys && a.connected && login.state !== 'refused' && tok.scopes_ok !== false },
    { id: 'sync', short: 'Sync', title: 'Smart-Sync', done: !!spot.status?.enabled, optional: true },
  ]
}

const spKv = (rows) => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`

function spotifyTop() {
  const s = spot.status ?? {}
  const a = spot.access ?? {}
  const st = s.state ?? {}
  const tok = s.token ?? {}
  const steps = spotifySteps()
  const login = spotifyLogin(a)
  const ready = steps.slice(0, 4).every((x) => x.done)
  const needsLogin = !!a.clientId && !!a.hasSecret && (!a.connected || login.state === 'refused' || tok.scopes_ok === false)
  const playlists = st.playlists_seen ?? []
  const conflicts = st.conflicts ?? []
  const prefix = s.playlist_prefix || state.boxName || 'MuPiBox'
  const parts = []

  if (!ready) {
    // not (fully) set up, or the login is gone: what is missing, and the way there
    const missing = steps.find((x) => !x.done && !x.optional)
    const title = login.state === 'refused' ? 'Spotify-Anmeldung abgelaufen' : a.clientId ? 'Spotify fertig einrichten' : 'Spotify einrichten'
    const why =
      login.state === 'refused'
        ? 'Spotify hat die Anmeldung der Box abgelehnt – sie ist abgelaufen (Spotify verlangt alle 6 Monate eine neue) oder wurde zurückgezogen. Bis zur neuen Anmeldung spielt die Box kein Spotify.'
        : 'Damit die Box Spotify abspielen kann, braucht sie eine eigene Spotify-App (kostenlos, auf developer.spotify.com) und deine Anmeldung. Der Assistent führt Schritt für Schritt hin.'
    parts.push(`<section class="card wide sp-setup"><h2>${esc(title)}</h2><p class="help">${esc(why)}</p>
      <ul class="sp-checks">${steps
        .filter((x) => x.id !== 'fields')
        .map((x) => `<li class="${x.done ? 'done' : x === missing ? 'next' : ''}">${icon(x.done ? 'check' : 'chevron', 16)}<span>${esc(x.title)}${x.optional ? ` <small>(optional)</small>` : ''}</span></li>`)
        .join('')}</ul>
      <div class="btns">${needsLogin ? `<button class="btn primary" data-sp="connect">${icon('sync', 18)}${a.connected ? 'Neu anmelden' : 'Bei Spotify anmelden'}</button><button class="btn" data-go="wizard">Assistent öffnen</button>` : `<button class="btn primary" data-go="wizard">${icon('sync', 18)}${a.clientId ? 'Assistent fortsetzen' : 'Assistent starten'}</button>`}</div></section>`)
  } else {
    const SYNC_STATUS = {
      IDLE: '–',
      NETWORK_ERROR: 'Keine Verbindung zu Spotify',
      RATE_LIMITED: 'Spotify bremst gerade – später noch einmal',
      AUTH_FAILED: 'Anmeldung bei Spotify fehlgeschlagen',
      AUTH_NEEDS_REAUTH: 'Bitte bei Spotify neu anmelden',
      INTERNAL_ERROR: 'Fehler auf der Box (siehe Protokolle)',
    }
    const running = st.current_state && st.current_state !== 'IDLE' && st.current_state !== 'COMPLETED'
    const result = st.last_sync_status === 'COMPLETED' ? `+${st.additions_count ?? 0} neu · ${st.updates_count ?? 0} geändert · ${st.removals_count ?? 0} entfernt` : SYNC_STATUS[st.last_sync_status] ?? st.last_sync_status ?? '–'
    const chip = login.state === 'soon' ? ['warn', 'Anmeldung läuft bald ab'] : login.state === 'unknown' ? ['warn', 'Ablauf unbekannt'] : ['ok', 'Angemeldet']
    parts.push(`<section class="card wide"><div class="sp-head"><h2>Spotify</h2><div class="chips"><span class="chip ${chip[0]}">${esc(chip[1])}</span><span class="chip${s.enabled ? ' ok' : ''}">${s.enabled ? 'Smart-Sync an' : 'Smart-Sync aus'}</span></div></div>
      ${
        login.state === 'soon'
          ? `<div class="note warn">${icon('info', 18)}<span>${esc(`Die Anmeldung läuft am ${login.until} ab.`)} ${esc('Spotify verlangt alle 6 Monate eine neue Anmeldung – danach spielt die Box kein Spotify, bis du dich neu anmeldest.')}</span></div>`
          : login.state === 'unknown'
            ? `<div class="note">${icon('info', 18)}<span>Seit wann die Anmeldung besteht, weiß die Box nicht (sie ist älter als diese Version oder kam aus dem Admin-Interface). Spotify lässt eine Anmeldung 6 Monate gelten – einmal neu anmelden, dann kennt die Box das Datum und erinnert rechtzeitig.</span></div>`
            : ''
      }
      <div class="sp-cols">
        <div>${spKv([
          ['Angemeldet seit', login.since ?? '–'],
          ['Gültig bis', login.until ?? '–'],
        ])}</div>
        <div>${spKv(
          s.enabled
            ? [
                // Spotify blocks the box (too many requests): until when - the sync and the display's lists wait
                s.spotify_block?.until && Date.parse(s.spotify_block.until) > Date.now()
                  ? ['Spotify-Sperre', `bis ${untilWhen(Date.parse(s.spotify_block.until))} (zu viele Anfragen)`]
                  : null,
                ['Letzter Sync', running ? 'läuft gerade …' : relTime(st.last_sync_end)],
                ['Ergebnis', result],
                // why it failed (Spotify's answer), and what a completed run could not read - nothing removed then
                st.last_sync_status !== 'COMPLETED' && st.last_sync_reason ? ['Grund', st.last_sync_reason] : null,
                st.last_sync_status === 'COMPLETED' && st.last_sync_skipped?.length
                  ? ['Nicht gelesen', `${st.last_sync_skipped.join(', ')} – darum wurde nichts entfernt`]
                  : null,
                ['Nächster Sync', relTime(st.next_scheduled_sync)],
              ]
            : [['Smart-Sync', 'aus – Playlists werden nicht übernommen']],
        )}</div>
      </div>
      <div class="btns">${s.enabled ? `<button class="btn primary" data-sp="sync">${icon('sync', 18)}Jetzt synchronisieren</button>` : `<button class="btn primary" data-sp="toggle">Smart-Sync einschalten</button>`}
        <button class="btn${login.state === 'soon' || login.state === 'unknown' ? ' primary' : ''}" data-sp="connect">Neu anmelden</button></div></section>`)

    parts.push(`<section class="card"><h2>${esc(`Playlists mit „${prefix}“`)}</h2>${
      playlists.length
        ? `<div class="rows">${playlists.map((p) => `<div class="entry"><span class="avatar">${icon('music', 16)}</span><span class="lbl"><b translate="no">${esc(p.name)}</b></span><span class="chip">${esc(p.items)} Einträge</span></div>`).join('')}</div>`
        : `<p class="help" style="margin:0">${esc(`Noch keine. Lege in Spotify eine Playlist an, deren Name mit „${prefix}“ beginnt, z. B. „${prefix} Hörspiele“ – ihre Inhalte kommen beim nächsten Sync auf die Box.`)}</p>`
    }${s.enabled ? '' : `<p class="help" style="margin:0">Smart-Sync ist aus: Playlists werden gerade nicht übernommen.</p>`}</section>`)
  }

  parts.push(`<section class="card nav-card"><div class="navlist">
      ${navRow('syncopt', 'Sync-Einstellungen', 'Playlist-Präfix, Intervall, an/aus', 'gear')}
      ${navRow('spzugang', 'Zugangsdaten', 'Client ID, Secret, Anmeldung', 'lock')}
      ${navRow('wizard', 'Einrichtungs-Assistent', ready ? 'Alles eingerichtet – Schritt für Schritt ansehen' : 'Schritt für Schritt – zeigt, was fehlt', 'sync')}
    </div></section>`)

  if (conflicts.length) {
    parts.push(`<section class="card wide"><h2>Konflikte</h2><p class="help">Inhalte, die schon von Hand auf der Box sind und auch in einer Playlist stehen.</p><div class="rows">${conflicts
      .map((c, i) => `<div class="entry"><span class="lbl"><b translate="no">${esc(`${c.manualArtist ?? '?'} – ${c.manualTitle ?? '?'}`)}</b><small>auch in ${esc((c.inPlaylists ?? []).join(', '))}</small></span><button class="btn sm" data-conflict="${i}">Vom Sync verwalten</button></div>`)
      .join('')}</div></section>`)
  }

  if (a.clientId) {
    parts.push(`<section class="card"><h2>Playlists & Cache</h2>
      <div class="row"><span class="lbl"><b>Playlists verarbeiten</b><small>Titel von Spotify-Playlists einzeln lesen. Aus = schneller, aber ohne Titelliste.</small></span>
        <label class="switch"><input type="checkbox" id="sp-pl" ${a.processPlaylists !== false ? 'checked' : ''} aria-label="Playlists verarbeiten"><span></span></label></div>
      <div class="btns"><button class="btn" data-sp="cache">Spotify-Cache leeren</button></div></section>`)
    parts.push(`<section class="card"><h2>Trennen & zurücksetzen</h2><p class="help">Selten gebraucht. Die Inhalte in der Bibliothek bleiben jeweils erhalten.</p>
      <div class="sp-danger">
        ${s.enabled ? `<div class="row"><span class="lbl"><b>Smart-Sync ausschalten</b><small>Keine Playlists mehr übernehmen, auch nicht von Hand.</small></span><button class="btn sm" data-sp="toggle">Ausschalten</button></div>` : ''}
        ${a.connected ? `<div class="row"><span class="lbl"><b>Trennen</b><small>Die Anmeldung löschen: kein Sync, der Player verliert Spotify.</small></span><button class="btn sm" data-sp="disconnect">Trennen</button></div>` : ''}
        <div class="row"><span class="lbl"><b>Zugang zurücksetzen</b><small>Client ID, Secret und Anmeldung löschen.</small></span><button class="btn sm danger" data-sp="reset">Zurücksetzen</button></div>
      </div></section>`)
  }
  return parts
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
    sync: async () => {
      // the result comes when the run ended: asked every 3 s for up to two minutes (a run takes a while)
      const before = spot.status?.state?.last_sync_end
      toast(await fireSync())
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        if (currentPage()?.id !== page.id) return
        await loadSpotify().catch(() => undefined)
        if (spot.status?.state?.last_sync_end !== before) break
      }
      if (currentPage()?.id === page.id) renderPage(page, false)
    },
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
  const pl = $('#sp-pl', root)
  if (pl) {
    pl.onchange = async (e) => {
      const r = await api(`${API}/spotify-access/playlists`, { method: 'POST', body: { enabled: e.target.checked } })
      if (!r.ok) {
        e.target.checked = !e.target.checked
        return toast('Nicht gespeichert', 'info')
      }
      toast(e.target.checked ? 'Playlists werden verarbeitet' : 'Playlists werden nicht verarbeitet')
    }
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

// Zugangsdaten: the player's Spotify app (Client ID, Secret) and its login
function spotifyAccessTop() {
  const a = spot.access ?? {}
  const login = spotifyLogin(a)
  const keys = !!a.clientId && !!a.hasSecret
  // how much of the six months is left: a bar, yellow from 14 days, red when refused or gone
  const days = login.days
  const bar =
    days != null
      ? `<div class="life ${login.state === 'soon' ? 'warn' : 'ok'}"><i style="width:${Math.max(3, Math.min(100, (days / 183) * 100))}%"></i></div>`
      : ''
  const head = { none: ['Nicht angemeldet', 'warn'], refused: ['Von Spotify abgelehnt', 'danger'], soon: ['Läuft bald ab', 'warn'], unknown: ['Angemeldet', 'ok'], ok: ['Angemeldet', 'ok'] }[login.state]
  const app = keys
    ? `<div class="row"><span class="lbl"><b>Client ID</b><small class="mono" translate="no">…${esc(String(a.clientId).slice(-6))} · Secret gespeichert</small></span><button class="btn sm" id="sp-edit">Ändern</button></div>`
    : `<ol class="steps-mini"><li>Auf developer.spotify.com eine App anlegen.</li><li>Dort die Redirect URI unten eintragen.</li><li>Client ID und Client Secret hier eintragen.</li><li>Bei Spotify anmelden.</li></ol>
       <div class="btns"><button class="btn" data-go="wizard">Schritt für Schritt einrichten</button></div>`
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Anmeldung</h2><span class="chip ${head[1]}">${esc(head[0])}</span></div>
      ${days != null ? `<div class="status-line"><span>${esc(days === 1 ? 'Noch 1 Tag gültig' : `Noch ${days} Tage gültig`)}</span></div>${bar}` : ''}
      ${spKv([
        login.since && ['Angemeldet seit', login.since],
        login.until && ['Gültig bis', login.until],
      ]).replace('</dl>', a.connected ? '<div id="sp-account-row" hidden><dt>Konto</dt><dd id="sp-account"></dd></div></dl>' : '</dl>')}
      <p class="help" style="margin:0">Spotify lässt eine Anmeldung 6 Monate gelten. Die Box erinnert 14 und 3 Tage vorher (App und Telegram).</p>
      <div class="btns"><button class="btn${login.state === 'ok' ? '' : ' primary'}" data-sp="connect">${a.connected ? 'Neu anmelden' : 'Bei Spotify anmelden'}</button></div></section>`,
    `<section class="card" data-col="1"><div class="card-head"><h2>Vom Handy abspielen</h2><span class="chip" id="sp-dev-chip">…</span></div>
      <p class="help" style="margin:0" id="sp-dev">${esc('Solange das Display läuft, erscheint die Box in der Spotify-App auf dem Handy unter „Geräte“. Dort auswählen und direkt vom Handy abspielen.')}</p></section>`,
    `<section class="card" data-col="2"><h2>Spotify-App</h2><p class="help">Deine App auf developer.spotify.com – damit spielt der Player ab und liest der Smart-Sync deine Playlists.</p>
      ${app}
      <div id="sp-fields"${keys ? ' hidden' : ''}>
        <div class="field"><label for="sp-id">Client ID</label><input class="input mono" id="sp-id" value="${esc(a.clientId ?? '')}" ${NO_PW_MANAGER} spellcheck="false"></div>
        <div class="field"><label for="sp-secret">Client Secret</label><div class="input-wrap"><input class="input has-eye mono" id="sp-secret" type="password" ${NO_PW_MANAGER} placeholder="${a.hasSecret ? 'gespeichert – leer lassen = behalten' : 'unter „View client secret“'}"><button type="button" class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div></div>
        <div class="btns"><button class="btn primary" data-sp="save">Speichern</button></div></div>
      <div class="field"><label>Redirect URI</label><div class="field-pick"><input class="input mono" value="${esc(spotifyRedirect())}" readonly aria-label="Redirect URI" ${NO_PW_MANAGER}><button type="button" class="btn sm" data-sp="copyuri">Kopieren</button></div>
        <small>Muss in deiner Spotify-App unter „Redirect URIs“ stehen, sonst lehnt Spotify die Anmeldung ab.</small></div>
      ${
        a.redirectUris
          ? `<div class="field"><label>Welche Adresse steht in deiner Spotify-App?</label><div class="pills small" id="sp-rd" role="radiogroup" aria-label="Redirect URI">${[
              ['app', '/app/spotify-callback'],
              ['legacy', '/spotify.php'],
            ]
              .map(([m, t]) => `<button role="radio" aria-selected="${a.redirectMode === m}" data-rd="${m}" translate="no">${t}</button>`)
              .join('')}</div></div>
            <details class="more"><summary>Warum zwei Adressen?</summary><p class="help" style="margin:0">${esc('Boxen, die vor der App eingerichtet wurden, nutzen /spotify.php – dann muss in der Spotify-App nichts geändert werden. Beim Zurückkommen von Spotify fragt der Browser wegen des Zertifikats der Box eventuell einmal nach.')}</p></details>`
          : ''
      }</section>`,
  ]
}

function mountSpotifyAccess(root, page) {
  $('#sp-edit', root)?.addEventListener('click', (e) => {
    $('#sp-fields', root).hidden = false
    e.target.closest('.row').hidden = true
  })
  // the account signed in (Premium: the display's player needs it), and whether Spotify sees the display as a device
  api(`${API}/spotify-access/account`).then((r) => {
    const acc = r.ok ? r.body : null
    if (acc?.name && $('#sp-account', root)) {
      $('#sp-account', root).textContent = `${acc.name}${acc.premium === false ? ' · kein Premium' : acc.premium ? ' · Premium' : ''}`
      $('#sp-account-row', root).hidden = false
    }
    const chip = $('#sp-dev-chip', root)
    if (!chip) return
    if (!acc || acc.deviceVisible == null) return chip.remove()
    chip.textContent = acc.deviceVisible ? 'sichtbar' : 'nicht sichtbar'
    chip.className = `chip ${acc.deviceVisible ? 'ok' : 'warn'}`
    if (!acc.deviceVisible) $('#sp-dev', root).textContent = 'Gerade nicht in Spotify zu sehen – läuft das Display? Sonst hilft ein Neustart des Displays.'
    else if (acc.deviceName) $('#sp-dev', root).textContent = `Die Box erscheint in der Spotify-App auf dem Handy unter „Geräte“ als „${acc.deviceName}“. Dort auswählen und direkt vom Handy abspielen.`
  })
  const acts = {
    connect: connectSpotify,
    copyuri: () => copyText(spotifyRedirect()),
    save: async () => {
      const clientId = $('#sp-id', root).value.trim()
      const secret = $('#sp-secret', root).value.trim()
      if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return toast('Die Client ID hat 16–64 Buchstaben und Ziffern', 'info')
      if (secret && !/^[A-Za-z0-9]{16,64}$/.test(secret)) return toast('Der Client Secret hat 16–64 Buchstaben und Ziffern', 'info')
      const r = await api(`${API}/spotify-credentials`, { method: 'POST', body: secret ? { clientId, clientSecret: secret } : { clientId } })
      if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
      toast('Gespeichert')
      await loadSpotify().catch(() => undefined)
      if (currentPage()?.id === page.id) renderPage(page, false)
    },
  }
  for (const b of root.querySelectorAll('[data-sp]')) b.onclick = () => acts[b.dataset.sp]()
  // which Redirect URI the Spotify app names (the next login uses it)
  for (const b of root.querySelectorAll('[data-rd]')) {
    b.onclick = async () => {
      if (b.getAttribute('aria-selected') === 'true') return
      const r = await api(`${API}/spotify-access/redirect`, { method: 'POST', body: { mode: b.dataset.rd } })
      if (!r.ok) return toast('Nicht gespeichert', 'info')
      toast('Gespeichert')
      await loadSpotify().catch(() => undefined)
      if (currentPage()?.id === page.id) renderPage(page, false)
    }
  }
}

/* Sync-Einstellungen and the setup assistant */

async function loadSyncConfig() {
  const r = await api(`${SYNC_API}/config`)
  if (!r.ok) throw new Error(`sync config ${r.status}`)
  const c = r.body ?? {}
  // the prefix is prefilled with the box's name while none was chosen (the backend fills in its default "MuPiBox")
  state.values.set('prefix', (c.prefix_set && c.playlist_prefix) || state.boxName)
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

// The setup assistant, one step at a time: it starts where something is missing (all done: an overview); a done step
// can be opened again. wz.step: the step shown (-1: the overview).
const wz = { step: null }

function wizardStart() {
  const steps = spotifySteps()
  const next = steps.findIndex((x) => !x.done)
  return next < 0 ? -1 : next
}

function wizardTop() {
  const steps = spotifySteps()
  if (wz.step === null) wz.step = wizardStart()
  const at = wz.step
  const a = spot.access ?? {}
  const login = spotifyLogin(a)
  const bar = `<ol class="wz-steps">${steps
    .map((x, i) => `<li class="${x.done ? 'done' : ''}${i === at ? ' current' : ''}"><button type="button" data-step="${i}"${i === at ? ' aria-current="step"' : ''}><span class="bar"></span><span class="lbl">${x.done ? icon('check', 14) : `<i>${i + 1}</i>`}${esc(x.short)}</span></button></li>`)
    .join('')}</ol>`
  if (at < 0) {
    return [
      `<section class="card wide wz">${bar}<h2>Alles eingerichtet</h2><p class="help">${spot.status?.enabled ? 'Die Box spielt Spotify, und der Smart-Sync holt deine Playlists.' : 'Die Box spielt Spotify.'} Einen Schritt antippen, um ihn noch einmal anzusehen.</p>
        <ul class="sp-checks">${steps.map((x) => `<li class="${x.done ? 'done' : ''}">${icon(x.done ? 'check' : 'chevron', 16)}<span>${esc(x.title)}${x.optional && !x.done ? ' <small>(optional, aus)</small>' : ''}</span></li>`).join('')}</ul>
        ${login.days != null ? `<p class="help" style="margin:0">${esc(`Die Anmeldung gilt bis ${login.until}; die Box erinnert rechtzeitig.`)}</p>` : ''}
        <div class="btns"><button class="btn primary" data-go="spotify">Zur Spotify-Seite</button></div></section>`,
    ]
  }
  const step = steps[at]
  const body = {
    app: `<h2>Spotify-App anlegen</h2>
      <p class="help">Die Box braucht eine eigene, kostenlose Spotify-App. Auf developer.spotify.com mit deinem Spotify-Konto anmelden und „Create app“ wählen – die Felder dafür kommen im nächsten Schritt.</p>
      <div class="btns"><button class="btn" data-wz="devsite">${icon('ext', 18)}developer.spotify.com öffnen</button></div>`,
    fields: `<h2>Felder ausfüllen</h2><p class="help">Diese Werte in die neue Spotify-App eintragen (nachträglich: „Settings“ › „Edit“).</p>
      ${spKv([
        ['App name', state.boxName || 'MuPiBox'],
        ['App description', 'MuPiBox'],
        ['Redirect URI', spotifyRedirect()],
      ])}
      <div class="note">${icon('info', 18)}<span>Bei „Which API/SDKs are you planning to use?“ die „Web API“ und das „Web Playback SDK“ ankreuzen.</span></div>
      <div class="btns"><button class="btn" data-wz="copy">${icon('link', 18)}Redirect URI kopieren</button></div>`,
    keys: `<h2>Client ID und Client Secret</h2><p class="help">Stehen in der Spotify-App unter „Settings“; den Secret zeigt „View client secret“. Die Box braucht beide – ohne Secret findet sie bei Spotify keine Alben und Cover.</p>
      <div class="field"><label for="wz-id">Client ID</label><input class="input mono" id="wz-id" value="${esc(state.values.get('wzClient') ?? a.clientId ?? '')}" ${NO_PW_MANAGER} spellcheck="false" placeholder="aus der Spotify-App"></div>
      <div class="field"><label for="wz-secret">Client Secret</label><div class="input-wrap"><input class="input has-eye mono" id="wz-secret" type="password" ${NO_PW_MANAGER} placeholder="${a.hasSecret ? 'gespeichert – leer lassen = behalten' : 'aus der Spotify-App'}"><button type="button" class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div></div>`,
    login: `<h2>Bei Spotify anmelden</h2><p class="help">Öffnet Spotify: anmelden und zustimmen, danach kommst du hierher zurück. Die Anmeldung gilt 6 Monate – die Box erinnert 14 und 3 Tage vorher.</p>
      ${a.connected ? spKv([['Status', login.state === 'refused' ? 'Von Spotify abgelehnt – bitte neu anmelden' : 'Angemeldet'], login.until && ['Gültig bis', login.until]]) : ''}
      <div class="btns"><button class="btn${step.done ? '' : ' primary'}" data-wz="connect">${icon('sync', 18)}${a.connected ? 'Neu anmelden' : 'Mit Spotify verbinden'}</button></div>`,
    sync: `<h2>Smart-Sync <small class="wz-opt">optional</small></h2><p class="help">Playlists in deinem Spotify, deren Name mit dem Präfix beginnt, landen von selbst auf der Box – z. B. „${esc(String(state.values.get('prefix') ?? state.boxName ?? 'MuPiBox'))} Hörspiele“. Ohne Smart-Sync fügst du Spotify-Inhalte von Hand hinzu.</p>
      <div class="field"><label for="wz-prefix">Playlist-Präfix</label><input class="input" id="wz-prefix" value="${esc(String(state.values.get('prefix') ?? state.boxName ?? ''))}" maxlength="30" autocomplete="off"></div>`,
  }[step.id]
  // the way on: Weiter (step 3 saves first, step 4 only once logged in), the last step ends the assistant
  const last = at === steps.length - 1
  const nextBtn = last
    ? `<button class="btn" data-wz="skip">Ohne Smart-Sync</button><button class="btn primary" data-wz="finish">${spot.status?.enabled ? 'Speichern' : 'Smart-Sync einschalten'}</button>`
    : step.id === 'keys'
      ? `<button class="btn primary" data-wz="savekeys">Speichern und weiter</button>`
      : `<button class="btn primary" data-wz="next"${step.id === 'login' && !step.done ? ' disabled' : ''}>Weiter</button>`
  return [
    `<section class="card wide wz">${bar}<div class="wz-count">${esc(`Schritt ${at + 1} von ${steps.length}`)}</div>${body}
      <div class="wz-foot"><button class="btn" data-wz="back"${at === 0 ? ' disabled' : ''}>${icon('back', 18)}Zurück</button><span class="wz-next">${nextBtn}</span></div></section>`,
  ]
}

function mountWizard(root, page) {
  const show = (i) => {
    wz.step = i
    renderPage(page, false)
    window.scrollTo(0, 0)
  }
  const acts = {
    devsite: () => window.open('https://developer.spotify.com/dashboard', '_blank', 'noopener'),
    copy: () => copyText(spotifyRedirect()),
    connect: connectSpotify,
    back: () => show(Math.max(0, wz.step - 1)),
    next: () => show(Math.min(spotifySteps().length - 1, wz.step + 1)),
    async savekeys() {
      const clientId = $('#wz-id', root).value.trim()
      const clientSecret = $('#wz-secret', root).value.trim()
      state.values.set('wzClient', clientId)
      if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return toast('Die Client ID hat 16–64 Buchstaben und Ziffern', 'info')
      if (clientSecret && !/^[A-Za-z0-9]{16,64}$/.test(clientSecret)) return toast('Der Client Secret hat 16–64 Buchstaben und Ziffern', 'info')
      // (the box looks albums, covers and search up at Spotify with ID and secret: without one it finds nothing)
      if (!clientSecret && !spot.access?.hasSecret) return toast('Bitte auch den Client Secret eintragen – ohne ihn findet die Box bei Spotify keine Alben und Cover.', 'info')
      const unchanged = clientId === spot.access?.clientId && !clientSecret
      if (!unchanged) {
        const r = await api(`${API}/spotify-credentials`, { method: 'POST', body: clientSecret ? { clientId, clientSecret } : { clientId } })
        if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
        toast(clientSecret ? 'Client ID und Secret gespeichert' : 'Client ID gespeichert')
        await loadSpotify().catch(() => undefined)
      }
      show(wz.step + 1)
    },
    async finish() {
      const prefix = $('#wz-prefix', root).value.trim()
      if (!prefixOk(prefix)) return
      state.values.set('prefix', prefix)
      const r = await api(`${SYNC_API}/config`, { method: 'POST', body: { enabled: true, playlist_prefix: prefix } })
      if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
      toast('Smart-Sync ist eingerichtet')
      wz.step = null
      go('spotify')
    },
    skip() {
      wz.step = null
      go('spotify')
    },
  }
  for (const b of root.querySelectorAll('[data-wz]')) b.onclick = () => acts[b.dataset.wz]()
  for (const b of root.querySelectorAll('[data-step]')) b.onclick = () => show(Number(b.dataset.step))
}

/* Cover: own pictures (e.g. for radio streams) and the online covers of NAS and local albums */

const cov = { own: [], oc: null, settings: {}, alsoRejected: false, file: null, q: '', src: 'all', page: 0 }

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
                <span class="lbl"><b translate="no">${esc(c.name)}</b><small translate="no">${esc(c.url)}</small></span>
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
      ? `<section class="card wide found-card" id="c-found-card"><h2>Gefundene Cover</h2><p class="help">Die neuesten zuerst. Falsches Cover? Verwerfen – das Album fällt dann auf das Bild des Ordners darüber zurück.</p>
          <div class="found-tools"><div class="search">${icon('search')}<input class="input" id="c-q" type="search" placeholder="Album oder Reihe suchen" autocomplete="off" value="${esc(cov.q)}"></div>
            <div class="pills small" id="c-src">${[['all', 'Alle'], ['nas', 'NAS'], ['local', 'SD-Karte']].map(([v, t]) => `<button aria-selected="${cov.src === v}" data-v="${v}">${t}</button>`).join('')}</div></div>
          <p class="help" id="c-count" style="margin:0"></p>
          <div class="covers found-covers" id="c-found"></div>
          <nav class="pager" id="c-pager" aria-label="Seiten"></nav></section>`
      : '',
  ]
}

// The found covers, a page at a time (30: two, three, five or six in a row fill it), filtered by name and place
const COVER_PAGE = 30
function drawFound(root) {
  const grid = $('#c-found', root)
  if (!grid) return
  const q = norm(cov.q.trim())
  const shown = (cov.found ?? []).filter(
    (e) => (cov.src === 'all' || String(e.key).startsWith(`${cov.src}:`)) && (!q || norm(`${e.album ?? ''} ${e.series ?? ''}`).includes(q)),
  )
  const pages = Math.max(1, Math.ceil(shown.length / COVER_PAGE))
  cov.page = Math.min(Math.max(0, cov.page), pages - 1)
  const from = cov.page * COVER_PAGE
  const part = shown.slice(from, from + COVER_PAGE)
  $('#c-count', root).textContent = shown.length ? `${from + 1}–${from + part.length} von ${shown.length} Covern` : ''
  grid.innerHTML = part.length
    ? part
        .map(
          (e, i) => `<div class="cover-tile"><span class="cover-img"><img src="/api/online-cover/${e.file}" alt="" loading="lazy"><span class="cover-badge">${String(e.key).startsWith('nas:') ? 'NAS' : 'SD-Karte'}</span></span>
            <b translate="no">${esc(e.album ?? '')}</b><small><span translate="no">${esc(e.series ?? '')}</span> · ${COVER_SOURCES[e.source] ?? ''}</small>
            <button class="btn danger sm" data-reject="${i}">Verwerfen</button></div>`,
        )
        .join('')
    : `<p class="help covers-empty">Nichts gefunden.</p>`
  for (const b of grid.querySelectorAll('[data-reject]')) {
    const e = part[Number(b.dataset.reject)]
    b.onclick = () =>
      confirmSheet('Verwerfen', `Das Cover von „${e.album ?? ''}“ verwerfen? Das Album wird nicht mehr online gesucht${e.savedTo === 'nas' || e.savedTo === 'local' ? ', und das gespeicherte cover.jpg wird gelöscht' : ''}.`, async () => {
        const r = await api('/api/online-covers/reject', { method: 'POST', body: { key: e.key } })
        toast(r.body?.success ? 'Verworfen' : 'Das hat nicht geklappt', r.body?.success ? 'ok' : 'info')
        await loadCovers().catch(() => undefined)
        coverTop() // (the list of found ones again)
        drawFound(root)
      })
  }
    const pager = $('#c-pager', root)
  if (pages <= 1) {
    pager.innerHTML = ''
    return
  }
  pager.innerHTML = pagerButtons(cov.page, pages)
  for (const b of pager.querySelectorAll('[data-page]')) {
    b.onclick = () => {
      cov.page = Number(b.dataset.page)
      drawFound(root)
      $('#c-found-card', root)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }
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
    // (a photo from the phone is rarely square: squared and made smaller here, as in the cover picker - then a JPEG)
    const squared = await squareImage(cov.file, 1000).catch(() => null)
    const name = squared ? coverName(cov.file).replace(/\.[a-z]+$/i, '.jpg') : coverName(cov.file)
    const r = await fetch(`${API}/covers/upload?name=${encodeURIComponent(name)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'x-mupibox-csrf': state.csrf },
      body: squared ?? cov.file,
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
  // the found covers: search, place and page (drawn on their own, the rest of the page stays)
  drawFound(root)
  $('#c-q', root)?.addEventListener('input', (e) => {
    cov.q = e.target.value
    cov.page = 0
    drawFound(root)
  })
  $('#c-src', root)?.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    cov.src = b.dataset.v
    cov.page = 0
    for (const x of b.parentElement.children) x.setAttribute('aria-selected', String(x === b))
    drawFound(root)
  })
  // while albums are still looked up: the numbers follow
  if ((cov.oc?.pending ?? 0) > 0 || cov.oc?.scanning) every(15000, async () => {
    // (not while something is typed in a field of the page - the page's own focus after opening does not count)
    if (document.activeElement?.matches?.('#content input, #content textarea, #content select')) return
    await again()
  })
}

/* NAS: login, profiles, the folders the box shows / hides / keeps on the SD card */

// st: /api/nas/state; path: the folder shown (''= top); entries: its subfolders; edits: path -> {show, hide, download}
const nas = { st: null, profiles: [], index: null, dl: null, path: '', tree: new Map(), open: new Set(), autoOpened: false, err: '', edits: new Map(), q: '', hits: null, onlySel: false, loginOpen: false, page: new Map() }
// (an opened folder shows this many subfolders a page, with a pager: a share with hundreds of albums made the page very
// long)
const NAS_PAGE = 20

// The buttons of a pager (data-page = the page's number from 0): first, last and the ones around the one shown, gaps
// as "…", with back and forth
function pagerButtons(page, pages) {
  const nums = [...new Set([0, pages - 1, page - 1, page, page + 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b)
  const parts = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) parts.push('<span class="gap">…</span>')
    parts.push(`<button data-page="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="Seite ${n + 1}">${n + 1}</button>`)
  })
  return `<button data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Vorherige Seite">${icon('back', 18)}</button>${parts.join('')}<button data-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''} aria-label="Nächste Seite" class="next">${icon('back', 18)}</button>`
}

async function loadNas() {
  const [st, profiles, index, dl] = await Promise.all([api('/api/nas/state'), api('/api/nas/profiles'), api('/api/nas/index/status'), api('/api/nas/download/status')])
  if (!st.ok) throw new Error(`nas state ${st.status}`)
  nas.st = st.body
  nas.profiles = profiles.body?.profiles ?? []
  nas.index = index.ok ? index.body : null
  nas.dl = dl.ok ? dl.body : null
}

// The folder tree as the admin interface shows it: children per folder (null = loading), the folders opened.
// At first the folders leading to the selection are open, so what the box shows is in sight.
async function loadNasChildren(path) {
  if (nas.tree.has(path)) return
  nas.tree.set(path, null)
  const r = await api(`/api/nas/browse?path=${encodeURIComponent(path)}`)
  if (r.ok) nas.tree.set(path, r.body?.entries ?? [])
  else {
    nas.tree.delete(path)
    nas.err = r.status === 401 ? 'Die Box ist nicht beim NAS angemeldet.' : 'Das NAS antwortet gerade nicht.'
  }
  drawNasFolders()
}

function openNasPath(path) {
  const parts = path.split('/').filter(Boolean)
  for (let i = 1; i < parts.length; i++) nas.open.add(`/${parts.slice(0, i).join('/')}`)
}

// (Re)loads the tree: the top level and every folder that is open
async function loadNasFolder() {
  nas.tree = new Map()
  nas.err = ''
  if (!nas.autoOpened && nas.st) {
    nas.autoOpened = true
    for (const p of [...nas.st.artistFolders, ...nas.st.hiddenFolders, ...nas.st.downloadFolders]) openNasPath(p)
  }
  drawNasFolders()
  await loadNasChildren('/')
  for (const p of nas.open) loadNasChildren(p)
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
            <div><dt>Status</dt><dd>${st.offline ? 'Gerade nicht erreichbar' : 'Angemeldet'}</dd></div></dl>
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
      ? `<section class="card wide"><h2>Ordner</h2><p class="help">Anzeigen = erscheint auf der Box – antippen und wählen, wo: in Hörspiele, Musik oder Radio & Podcasts (neben SD-Karte und Spotify) oder im NAS-Reiter. Ausblenden = bleibt verborgen (auch alles darunter). Laden = auf die SD-Karte kopieren, damit es auch ohne NAS spielt.</p>
        <div class="search">${icon('search')}<input class="input" id="n-q" type="search" placeholder="Ordner auf dem ganzen NAS suchen" autocomplete="off" value="${esc(nas.q)}"></div>
        <p class="help" id="n-index" style="margin:0"></p>
        ${sw('n-only', 'Nur die Auswahl zeigen', nas.onlySel)}
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

// The rows shown: search hits or the saved selection (flat), else the tree (with its depth)
function nasTreeRows(path, depth, out) {
  const kids = nas.tree.get(path)
  if (!kids) {
    out.push({ loading: true, depth })
    if (kids === undefined) loadNasChildren(path)
    return out
  }
  if (depth > 0 && kids.length === 0) out.push({ empty: true, depth })
  const pages = Math.ceil(kids.length / NAS_PAGE)
  const page = Math.min(nas.page.get(path) ?? 0, Math.max(0, pages - 1))
  for (const k of kids.slice(page * NAS_PAGE, (page + 1) * NAS_PAGE)) {
    out.push({ ...k, depth, isOpen: nas.open.has(k.path) })
    if (nas.open.has(k.path)) nasTreeRows(k.path, depth + 1, out)
  }
  if (pages > 1) out.push({ pager: path, name: path.slice(path.lastIndexOf('/') + 1) || path, page, pages, depth })
  return out
}

function nasRows() {
  const st = nas.st ?? {}
  const flags = (p) => ({ isMarked: st.artistFolders.includes(p), isHidden: st.hiddenFolders.includes(p), isDownload: st.downloadFolders.includes(p) })
  const of = (p) => ({ name: p.slice(p.lastIndexOf('/') + 1) || p, path: p, sub: p.slice(0, p.lastIndexOf('/')) || '/', flat: true, depth: 0, ...flags(p) })
  if (nas.q.trim().length >= 2) return nas.hits === null ? null : nas.hits.map(of)
  if (nas.onlySel) return [...new Set([...st.artistFolders, ...st.hiddenFolders, ...st.downloadFolders])].sort((a, b) => a.localeCompare(b, 'de')).map(of)
  if (nas.tree.get('/') === undefined && nas.err) return []
  return nasTreeRows('/', 0, [])
}

const nasFlag = (row, key) => {
  const e = nas.edits.get(row.path)
  if (e) return e[key]
  if (key === 'category') return nas.st?.folderCategories?.[row.path] ?? ''
  if (key === 'split') return (nas.st?.folderSplit ?? []).includes(row.path)
  // (from the saved selection as read last: the folders of the tree keep what they were when they were loaded, so a
  // folder set to "Nicht anzeigen" still showed as shown until the page was loaded again)
  const st = nas.st
  if (Array.isArray(st?.artistFolders) && Array.isArray(st?.hiddenFolders) && Array.isArray(st?.downloadFolders)) {
    const hidden = st.hiddenFolders.includes(row.path)
    return key === 'show' ? st.artistFolders.includes(row.path) && !hidden : key === 'hide' ? hidden : st.downloadFolders.includes(row.path)
  }
  return key === 'show' ? row.isMarked && !row.isHidden : key === 'hide' ? row.isHidden : row.isDownload
}

function setNasFlag(row, key, on) {
  const e = nas.edits.get(row.path) ?? {
    show: nasFlag(row, 'show'),
    hide: nasFlag(row, 'hide'),
    download: nasFlag(row, 'download'),
    category: nasFlag(row, 'category'),
    split: nasFlag(row, 'split'),
  }
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
  const flat = nas.q.trim().length >= 2 || nas.onlySel
  const rows = nasRows()
  $('#n-changes').textContent = nas.edits.size ? `${nas.edits.size} Ordner geändert – noch nicht gespeichert.` : ''
  if (rows === null) {
    list.innerHTML = `<div class="loading"><p>Lade …</p></div>`
    return
  }
  nasShown = rows.filter((r) => r.path)
  if (!rows.length) {
    list.innerHTML = `<p class="help">${esc(nas.err || (flat ? 'Nichts gefunden.' : 'Keine Ordner.'))}</p>`
    return
  }
  const chip = (i, key, label, row) => `<button class="tog" data-i="${i}" data-k="${key}" aria-pressed="${nasFlag(row, key)}">${label}</button>`
  // (shown: where - a category tab of the box or the NAS tab)
  const showChip = (i, row) => {
    const on = nasFlag(row, 'show')
    const where = NAS_WHERE[nasFlag(row, 'category')] ?? NAS_WHERE['']
    return `<button class="tog${on ? ' where' : ''}" data-i="${i}" data-k="show" aria-pressed="${on}">${on ? esc(where) : 'Anzeigen'}</button>`
  }
  let i = -1
  list.innerHTML = rows
    .map((r) => {
      const pad = `style="--depth:${r.depth}"`
      if (r.loading) return `<div class="nas-note" ${pad}>Lade …</div>`
      if (r.empty) return `<div class="nas-note" ${pad}>Keine Unterordner</div>`
      if (r.pager)
        return `<div class="nas-pager" ${pad}><small>${esc(tr(`„${r.name}“: Seite ${r.page + 1} von ${r.pages}`))}</small><nav class="pager" data-pager="${esc(r.pager)}" aria-label="Seiten">${pagerButtons(r.page, r.pages)}</nav></div>`
      i++
      return `<div class="entry nas-row${nas.edits.has(r.path) ? ' changed' : ''}" ${pad}>
        ${flat ? '' : `<button class="nas-chev" data-toggle="${i}" aria-expanded="${r.isOpen}" aria-label="${r.isOpen ? 'Zuklappen' : 'Aufklappen'}">${icon('chevron', 16)}</button>`}
        <button class="lbl nas-open" data-open="${i}"><b translate="no">${icon('folder', 16)} ${esc(r.name)}</b>${r.flat ? `<small translate="no">${esc(r.sub)}</small>` : ''}${r.isDownloaded ? '<small class="ok-text">✓ auf der Box</small>' : ''}</button>
        <span class="togs">${showChip(i, r)}${chip(i, 'hide', 'Ausblenden', r)}${chip(i, 'download', 'Laden', r)}</span></div>`
    })
    .join('')
  for (const b of list.querySelectorAll('.tog')) {
    b.onclick = () => {
      const row = nasShown[Number(b.dataset.i)]
      if (b.dataset.k === 'show') return nasWhereSheet(row)
      setNasFlag(row, b.dataset.k, b.getAttribute('aria-pressed') !== 'true')
      drawNasFolders()
    }
  }
  const toggle = (row) => {
    if (nas.open.has(row.path)) nas.open.delete(row.path)
    else nas.open.add(row.path)
    drawNasFolders()
  }
  for (const b of list.querySelectorAll('[data-toggle]')) b.onclick = () => toggle(nasShown[Number(b.dataset.toggle)])
  for (const nav of list.querySelectorAll('[data-pager]')) {
    for (const b of nav.querySelectorAll('[data-page]')) {
      b.onclick = () => {
        nas.page.set(nav.dataset.pager, Number(b.dataset.page))
        drawNasFolders()
      }
    }
  }
  for (const b of list.querySelectorAll('[data-open]')) {
    b.onclick = () => {
      const row = nasShown[Number(b.dataset.open)]
      if (!flat) return toggle(row)
      // from the search or the selection into the tree, at that folder
      nas.q = ''
      nas.onlySel = false
      const q = $('#n-q')
      if (q) q.value = ''
      const only = $('#n-only')
      if (only) only.checked = false
      openNasPath(row.path)
      drawNasFolders()
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

// Where a shown NAS folder appears on the box: a category tab (next to Spotify and the SD card) or the NAS tab
const NAS_WHERE = { '': 'Im NAS-Reiter', audiobook: 'In Hörspiele', music: 'In Musik', other: 'In Radio & Podcasts' }

// "Anzeigen" of a NAS folder: shown where - a category, or the NAS tab - and, in a category, whether its subfolders
// are tiles of their own (a collection of series) or the folder is one tile; or not shown
// place: { shown, category, split, apply(show, category, split) } from the library (saved at once); without it the
// NAS page's selection (saved with "Auswahl speichern")
async function nasWhereSheet(row, place = null) {
  const shown = place ? place.shown : nasFlag(row, 'show')
  let category = shown ? (place ? place.category : nasFlag(row, 'category')) : ''
  // (a folder already in a category keeps its choice; else the default below, by what is in it)
  let split = shown && category ? (place ? place.split : nasFlag(row, 'split')) : null
  // what is in it (for the choice "one by one" and its default): the subfolders, and which of them hold subfolders
  let subs = null
  const peek = (async () => {
    const r = await api(`/api/nas/browse?path=${encodeURIComponent(row.path)}`)
    const names = (r.body?.entries ?? []).map((e) => e.name)
    const deeper = await Promise.all(
      (r.body?.entries ?? []).slice(0, 8).map((e) => api(`/api/nas/browse?path=${encodeURIComponent(e.path)}`).then((x) => (x.body?.entries ?? []).length > 0)),
    )
    subs = { names, series: deeper.filter(Boolean).length }
  })().catch(() => {
    subs = { names: [], series: 0 }
  })
  const option = (id, title, text) =>
    `<button class="where-opt" data-where="${id}" aria-pressed="${category === id}"><b>${esc(title)}</b><small>${esc(text)}</small></button>`
  openSheet(
    `<h2 translate="no">${esc(row.name)}</h2>
     <p class="help" style="margin:0">Wo soll der Ordner auf der Box erscheinen?</p>
     <div class="where-grid">
       ${option('audiobook', 'Hörspiele', 'neben SD-Karte und Spotify')}
       ${option('music', 'Musik', 'neben SD-Karte und Spotify')}
       ${option('other', 'Radio & Podcasts', 'neben Radiosendern und Podcasts')}
       ${option('', 'NAS-Reiter', 'eigener Reiter nur fürs NAS')}
     </div>
     <div class="where-split" id="w-split" hidden>
       <div class="row"><span class="lbl"><b>Unterordner einzeln zeigen</b><small id="w-split-help">Lade …</small></span>
         <label class="switch"><input type="checkbox" id="w-split-on" aria-label="Unterordner einzeln zeigen"><span></span></label></div>
     </div>
     <div class="btns">${shown ? '<button class="btn danger" data-hide-folder>Nicht anzeigen</button>' : ''}<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button></div>`,
    (sheet, close) => {
      const splitBox = $('#w-split', sheet)
      const splitOn = $('#w-split-on', sheet)
      const help = $('#w-split-help', sheet)
      const drawSplit = () => {
        for (const b of sheet.querySelectorAll('[data-where]')) b.setAttribute('aria-pressed', String(b.dataset.where === category))
        splitBox.hidden = category === ''
        if (!subs) return
        // (default: one by one when several subfolders hold folders of their own - a collection of series)
        if (split === null) split = subs.series >= 2
        splitOn.checked = split
        const some = subs.names.slice(0, 3).join(', ')
        help.textContent = split
          ? tr(`Jeder Unterordner wird eine eigene Kachel (${subs.names.length}: ${some}${subs.names.length > 3 ? ' …' : ''}) – für eine Sammlung von Serien.`)
          : tr(`Der Ordner ist eine Kachel „${row.name}“, sein Inhalt liegt darin – z. B. eine Serie mit ihren Folgen.`)
      }
      peek.then(() => sheet.isConnected && drawSplit())
      drawSplit()
      for (const b of sheet.querySelectorAll('[data-where]')) {
        b.onclick = () => {
          category = b.dataset.where
          drawSplit()
        }
      }
      splitOn.onchange = () => {
        split = splitOn.checked
        drawSplit()
      }
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-hide-folder]')?.addEventListener('click', () => {
        close()
        if (place) return place.apply(false, '', false)
        setNasFlag(row, 'show', false)
        saveNasRow(row)
      })
      sheet.querySelector('[data-ok]').onclick = () => {
        close()
        if (place) return place.apply(true, category, category !== '' && !!split)
        setNasFlag(row, 'show', true)
        setNasFlag(row, 'category', category)
        setNasFlag(row, 'split', category !== '' && !!split)
        saveNasRow(row)
      }
    },
  )
}

// One folder of the NAS page saved at once (its place on the box was chosen: shown where, or not): its show / hide /
// download and category, the other changes of the page wait for "Auswahl speichern"
async function saveNasRow(row) {
  const p = row.path
  const show = nasFlag(row, 'show')
  const category = show ? nasFlag(row, 'category') : ''
  const split = !!category && nasFlag(row, 'split')
  const r = await api('/api/nas/selection', {
    method: 'POST',
    body: { shown: [p], show: show ? [p] : [], hide: nasFlag(row, 'hide') ? [p] : [], download: nasFlag(row, 'download') ? [p] : [], categories: category ? { [p]: category } : {}, split: split ? [p] : [] },
  })
  if (!r.ok || !r.body?.success) {
    drawNasFolders()
    return toast('Nicht gespeichert', 'info')
  }
  nas.edits.delete(p)
  const st = await api('/api/nas/state')
  if (st.ok) nas.st = st.body
  libChanged()
  toast(show ? `${NAS_WHERE[category] ?? NAS_WHERE['']} – gleich auf dem Display` : 'Nicht mehr angezeigt')
  drawNasFolders()
}

async function saveNasSelection() {
  if (!nas.edits.size) return true
  const shown = [...nas.edits.keys()]
  const pick = (k) => shown.filter((p) => nas.edits.get(p)[k])
  // (the category of each shown folder of the page: none = the NAS tab)
  const categories = Object.fromEntries(shown.filter((p) => nas.edits.get(p).show && nas.edits.get(p).category).map((p) => [p, nas.edits.get(p).category]))
  const r = await api('/api/nas/selection', {
    method: 'POST',
    body: { shown, show: pick('show'), hide: pick('hide'), download: pick('download'), categories, split: shown.filter((p) => nas.edits.get(p).show && nas.edits.get(p).category && nas.edits.get(p).split) },
  })
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

// The download's and the search index's progress, each its own timer (the one ending must not stop the other), and
// each only once however often the page is drawn
function pollNasDownload() {
  if (pageTimers.has(nas.dlTimer)) return
  nas.dlTimer = every(2000, async () => {
    const r = await api('/api/nas/download/status')
    if (r.ok) nas.dl = r.body
    drawNasDownload()
    if (!nas.dl?.running) stopTimer(nas.dlTimer)
  })
}

function pollNasIndex() {
  if (pageTimers.has(nas.indexTimer)) return
  nas.indexTimer = every(3000, async () => {
    const r = await api('/api/nas/index/status')
    if (r.ok) nas.index = r.body
    drawNasIndex()
    if (!nas.index?.running) stopTimer(nas.indexTimer)
  })
}

/* Einstellungen › Aussehen and › Display & Bedienung */

const disp = { theme: null, opts: null, power: null, bs: null, bsSel: '', dt: null, dtLangs: {}, dtScreen: 'blocked' }

async function loadTheme() {
  const r = await api(`${API}/theme`)
  if (!r.ok) throw new Error(`theme ${r.status}`)
  disp.theme = r.body
}
async function loadDisplayOptions() {
  const r = await api(`${API}/display-options`)
  if (!r.ok) throw new Error(`display-options ${r.status}`)
  disp.opts = r.body
}

// What the display did after a save, in words
function displayNote(b) {
  if (b?.restartKiosk) return 'Das Display startet neu.'
  if (b?.reboot) return 'Wird nach einem Neustart der Box übernommen.'
  if (b?.restartPlayer) return 'Der Player startet neu.'
  if (b?.reloaded === true) return 'Das Display lädt neu.'
  if (b?.reloaded === false) return 'Das Display zeigt es nach dem nächsten Neuladen.'
  return ''
}

async function saveDisplayOptions(body, done = 'Gespeichert') {
  const r = await api(`${API}/display-options`, { method: 'POST', body })
  if (!r.ok) {
    toast(r.body?.error === 'at least one category must stay visible' ? 'Mindestens eine Kategorie bleibt sichtbar' : 'Nicht gespeichert', 'info')
    return false
  }
  toast(`${done}. ${displayNote(r.body)}`.trim())
  return r.body
}

// the names of the children's themes from their registry: German in German, English in every other language
// the older themes have only their id as name (captainamerica, clone-wars): written as a name
const THEME_NAMES = { captainamerica: 'Captain America', fantasybutterflies: 'Fantasy Butterflies', 'clone-wars': 'Clone Wars', darkred: 'Dark Red', deepblue: 'Deep Blue', supermario: 'Super Mario', spiderman: 'Spider-Man', ironman: 'Iron Man', 'wall-e': 'WALL·E', xmas: 'Xmas' }
const prettyTheme = (name) => (name === 'custom' ? (getLang() === 'de' ? 'Eigenes' : 'Custom') : THEME_NAMES[name] ?? name.replace(/[-_]+/g, ' ').replace(/(^|\s)(\p{L})/gu, (_m, sp, c) => sp + c.toUpperCase()))
const themeLabel = (name) => {
  const label = (getLang() === 'de' ? disp.theme?.labelsDe?.[name] : null) ?? disp.theme?.labels?.[name]
  return label && label !== name ? label : prettyTheme(name)
}
const isKidsTheme = (name) => !!disp.theme?.labels && name in disp.theme.labels

/* Theme */

function themeTop() {
  const t = disp.theme ?? {}
  const list = [...(t.available ?? [])].sort((a, b) => themeLabel(a).localeCompare(themeLabel(b), LOCALE, { sensitivity: 'base' }))
  return [
    `<section class="card wide"><h2>Theme</h2><p class="help">Tippe auf ein Theme, um es auf der Box zu verwenden.</p>
      <div class="search">${icon('search')}<input class="input" id="t-q" type="search" placeholder="Theme suchen" autocomplete="off"></div>
      <div class="theme-grid" id="t-grid">${list
        .map(
          (n) => `<button class="theme-card" data-theme="${esc(n)}" aria-pressed="${n === t.current}"><span class="theme-img"><img src="${API}/theme-preview/${encodeURIComponent(n)}?v=2" alt="" loading="lazy"></span>
            <b translate="no">${esc(themeLabel(n))}</b>${n === t.current ? '<small>aktiv</small>' : ''}</button>`,
        )
        .join('')}</div></section>`,
  ]
}

function mountTheme(root, page) {
  for (const img of root.querySelectorAll('.theme-img img')) img.addEventListener('error', () => img.remove(), { once: true })
  $('#t-q', root).addEventListener('input', (e) => {
    const q = norm(e.target.value.trim())
    for (const c of root.querySelectorAll('.theme-card')) c.hidden = !!q && !norm(`${c.dataset.theme} ${c.textContent}`).includes(q)
  })
  for (const c of root.querySelectorAll('.theme-card')) {
    const name = c.dataset.theme
    if (name === disp.theme.current) continue
    c.onclick = () =>
      openSheet(
        `<h2 translate="no">${esc(themeLabel(name))}</h2><div class="theme-big"><img src="${API}/theme-preview/${encodeURIComponent(name)}?v=2" alt=""></div>
         <p class="help" style="margin:0">Dieses Theme auf der Box verwenden?</p>
         <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn" data-later>Beim nächsten Neuladen</button><button class="btn primary" data-now>Jetzt anzeigen</button></div>`,
        (sheet, close) => {
          sheet.querySelector('[data-close]').onclick = close
          const apply = async (now) => {
            close()
            const before = disp.theme.current
            const r = await api(`${API}/theme`, { method: 'POST', body: { theme: name } })
            if (!r.ok) return toast('Das hat nicht geklappt', 'info')
            let note = 'Das Display zeigt es nach dem nächsten Neuladen.'
            if (now) {
              // the cover-flow theme builds its page differently: switching to or from it needs the page loaded again
              const whole = before === 'coverflow' || name === 'coverflow'
              const rl = await api(`${API}/display/${whole ? 'reload-page' : 'reload-theme'}`, { method: 'POST', body: {} })
              note = rl.ok && rl.body?.ok !== false ? 'Das Display zeigt es gleich.' : 'Das Display zeigt es nach dem nächsten Neuladen.'
            }
            toast(`${themeLabel(name)} ist aktiv. ${note}`)
            await loadTheme()
            if (currentPage()?.id === page.id) renderPage(page, false)
          }
          sheet.querySelector('[data-later]').onclick = () => apply(false)
          sheet.querySelector('[data-now]').onclick = () => apply(true)
        },
      )
  }
}

/* Eigenes Theme: the background picture of the theme "custom" */

function bgTop() {
  const active = disp.theme?.current === 'custom'
  return [
    `<section class="card"><h2>Hintergrundbild</h2><p class="help">Das Bild des Themes „Eigenes“ (custom): ein JPG, am besten 800 × 480 Pixel oder größer. Es füllt das ganze Display.</p>
      <div class="bg-preview"><img id="b-img" src="${API}/display/background?t=${Date.now()}" alt=""></div>
      <input type="file" id="b-file" accept=".jpg,.jpeg,image/jpeg" hidden>
      <div class="btns"><button class="btn" id="b-pick">${icon('image', 18)}Bild wählen</button><button class="btn primary" id="b-up" disabled>${icon('up', 18)}Bild hochladen</button></div>
      <p class="help" id="b-picked" style="margin:0"></p>
      ${active ? '<p class="help" style="margin:0">Das Theme „Eigenes“ ist aktiv.</p>' : `<div class="btns"><button class="btn" id="b-activate">Theme „Eigenes“ verwenden</button></div>`}</section>`,
  ]
}

function mountCustom(root, page) {
  let file = null
  const img = $('#b-img', root)
  img.addEventListener('error', () => img.remove(), { once: true })
  $('#b-pick', root).onclick = () => $('#b-file', root).click()
  $('#b-file', root).onchange = (e) => {
    file = e.target.files?.[0] ?? null
    const ok = file && /\.jpe?g$/i.test(file.name)
    $('#b-picked', root).textContent = file ? (ok ? file.name : 'Bitte ein JPG wählen.') : ''
    $('#b-up', root).disabled = !ok
  }
  $('#b-up', root).onclick = async () => {
    const r = await fetch(`${API}/display/background`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg', 'x-mupibox-csrf': state.csrf }, body: file }).catch(() => null)
    const b = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) {
      return toast({ not_jpeg: 'Das ist kein JPG.', too_small: `Das Bild ist zu klein (${b.width} × ${b.height}).`, too_large: 'Das Bild ist größer als 15 MB.' }[b.error] ?? 'Hochladen ging nicht', 'info')
    }
    toast(`Bild gespeichert.${b.active ? ` ${b.reloaded ? 'Das Display lädt neu.' : ''}` : ' Es erscheint, wenn das Theme „Eigenes“ aktiv ist.'}`)
    renderPage(page, false)
  }
  $('#b-activate', root)?.addEventListener('click', async () => {
    const r = await api(`${API}/theme`, { method: 'POST', body: { theme: 'custom' } })
    if (!r.ok) return toast('Das hat nicht geklappt', 'info')
    const rl = await api(`${API}/display/reload-page`, { method: 'POST', body: {} })
    toast(rl.ok && rl.body?.ok !== false ? 'Theme „Eigenes“ ist aktiv. Das Display lädt neu.' : 'Theme „Eigenes“ ist aktiv. Das Display zeigt es nach dem nächsten Neuladen.')
    await loadTheme()
    renderPage(page, false)
  })
}

/* Start- und Wartungsbilder: the scenes with the box name / texts laid over them as the box puts them in */

/* Startbilder › Eigene Bilder: a photo or logo instead of the design's start, goodbye and empty-battery picture. The
   app fits it to the display (fill: cut at the edges; whole: a border in the colour of the picture's edge) and sends a
   PNG of the display's size; the box puts it in place (eltern/bootscreen-custom.ts, bootscreen_update.sh). */

const BS_OWN = [
  ['splash', 'Start'],
  ['goodbye', 'Tschüss'],
  ['battery', 'Akku leer'],
]

// The average colour of a picture's edge (the border of a small copy)
function edgeColor(src) {
  const k = 32
  const c = document.createElement('canvas')
  c.width = k
  c.height = k
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(src, 0, 0, k, k)
  const d = g.getImageData(0, 0, k, k).data
  const sum = [0, 0, 0]
  let n = 0
  for (let y = 0; y < k; y++) {
    for (let x = 0; x < k; x++) {
      if (x > 0 && y > 0 && x < k - 1 && y < k - 1) continue
      const i = (y * k + x) * 4
      sum[0] += d[i]
      sum[1] += d[i + 1]
      sum[2] += d[i + 2]
      n++
    }
  }
  return sum.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')
}

// A chosen file as the display's picture: {blob (PNG W × H), color (its edge, rrggbb)}
async function ownBootPicture(file, W, H, fit) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = no
      i.src = url
    })
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')
    g.fillStyle = `#${edgeColor(img)}`
    g.fillRect(0, 0, W, H)
    const s = fit === 'contain' ? Math.min(W / img.naturalWidth, H / img.naturalHeight) : Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const w = img.naturalWidth * s
    const h = img.naturalHeight * s
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'))
    return { blob, color: edgeColor(c) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function bsOwnCard() {
  const own = disp.bsOwn
  if (!own) return ''
  // (an empty place shows the design's picture it keeps: the design chosen before, with "random" the standard one)
  const design = disp.bsBase === 'random' || !disp.bsBase ? disp.bs.screens.defaultBootscreen : disp.bsBase
  const baseName = bsLabel(disp.bsById?.[design] ?? { id: design })
  const slot = ([kind, label]) => {
    const at = own.pictures[kind]
    return `<div class="own-slot"><b>${esc(label)}</b>
      <div class="own-prev" style="aspect-ratio:${own.width} / ${own.height}">${at ? `<img src="${API}/bootscreen/custom/${kind}.png?t=${Math.round(at)}" alt="">` : `<img src="${bsScene(design, kind === 'splash' ? 'scene' : kind)}" alt="" class="design"><span class="own-tag">${esc('Design')}</span>`}</div>
      <div class="btns"><button class="btn sm${at ? '' : ' primary'}" data-own-pick="${kind}">${icon('image', 16)}${at ? 'Anderes Bild' : 'Bild wählen'}</button>${at ? `<button class="btn sm danger" data-own-rm="${kind}">Entfernen</button>` : ''}</div>
      <input type="file" accept="image/*" hidden data-own-file="${kind}"></div>`
  }
  return `<section class="card wide" id="bs-own"${disp.bsSel === 'custom' ? '' : ' hidden'}><h2>Eigene Bilder</h2>
    <p class="help">${esc(`Statt des Designs ein eigenes Bild, z. B. ein Foto oder ein Logo. Die Box passt es an das Display an (${own.width} × ${own.height}).`)}</p>
    <div class="field"><label>Anpassen</label><div class="seg" id="bs-fit"><button aria-pressed="${disp.bsFit !== 'contain'}" data-v="cover">Ausfüllen</button><button aria-pressed="${disp.bsFit === 'contain'}" data-v="contain">Ganz zeigen</button></div>
      <small>Ausfüllen schneidet am Rand ab, „Ganz zeigen“ lässt einen Rand in der Farbe des Bildrands.</small></div>
    <div class="own-grid">${BS_OWN.map(slot).join('')}</div>
    <p class="help" style="margin:0">${esc(`Ohne eigenes Bild und für die Wartungsbilder (Update, WLAN) gilt das Design „${baseName}“.`)} ${esc('Zu sehen ab dem nächsten Start bzw. beim nächsten Ausschalten.')}</p></section>`
}

function mountBsOwn(root, page) {
  const again = async () => {
    const r = await api(`${API}/bootscreen/custom`)
    if (r.ok) disp.bsOwn = r.body
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  const fit = $('#bs-fit', root)
  if (fit) {
    fit.onclick = (e) => {
      const b = e.target.closest('button')
      if (!b) return
      disp.bsFit = b.dataset.v
      for (const x of fit.children) x.setAttribute('aria-pressed', String(x === b))
    }
  }
  for (const b of root.querySelectorAll('[data-own-pick]')) {
    const input = $(`[data-own-file="${b.dataset.ownPick}"]`, root)
    b.onclick = () => input.click()
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      b.disabled = true
      try {
        const { blob, color } = await ownBootPicture(file, disp.bsOwn.width, disp.bsOwn.height, disp.bsFit)
        const r = await fetch(`${API}/bootscreen/custom?kind=${b.dataset.ownPick}&color=${color}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'image/png', 'x-mupibox-csrf': state.csrf },
          body: blob,
        }).catch(() => null)
        toast(r?.ok ? 'Gespeichert – ab dem nächsten Mal zu sehen' : r?.status === 413 ? 'Das Bild ist zu groß' : 'Nicht gespeichert', r?.ok ? 'ok' : 'info')
        if (r?.ok) disp.bsSel = 'custom'
      } catch {
        toast('Dieses Bild lässt sich nicht öffnen', 'info')
      }
      b.disabled = false
      again()
    }
  }
  for (const b of root.querySelectorAll('[data-own-rm]')) {
    b.onclick = () =>
      confirmSheet('Entfernen', 'Das eigene Bild entfernen? Dann gilt wieder das Bild des Designs.', async () => {
        const r = await api(`${API}/bootscreen/custom/remove`, { method: 'POST', body: { kind: b.dataset.ownRm } })
        toast(r.ok ? 'Entfernt' : 'Das ging nicht', r.ok ? 'ok' : 'info')
        again()
      })
  }
}

async function loadBootscreens() {
  const [r, own] = await Promise.all([api(`${API}/bootscreen`), api(`${API}/bootscreen/custom`)])
  if (!r.ok) throw new Error(`bootscreen ${r.status}`)
  disp.bs = r.body
  disp.bsOwn = own.ok ? own.body : null
  disp.bsSel = r.body.current.bootscreen || r.body.screens.defaultBootscreen
  // (the design the own pictures keep for what has none)
  disp.bsBase = r.body.current.base || r.body.screens.defaultBootscreen
  disp.bsMaint = r.body.current.maintenanceScreen || 'same'
  disp.bsKind = BS_KINDS.some(([k]) => k === disp.bsKind) ? disp.bsKind : 'update'
}

const bsScene = (id, kind) => `${API}/bootscreen-scene/${encodeURIComponent(id)}/${kind}`
const bsLabel = (b) => b.label ?? b.labelEn ?? b.id
const bsShadow = (spec, s) => (!spec || spec === 'none' ? 'none' : spec.replace(/(-?[\d.]+)px/g, (_, v) => `${Number.parseFloat(v) * s}px`))

function bsName() {
  const s = disp.bs.screens
  return Array.from(String(disp.bs.current.boxName || '').trim()).slice(0, s.nameMaxLength || 14).join('') || s.defaultName || 'MuPiBox'
}

// the name at its place: the given size, made smaller when it is wider than maxWidth (as bootscreen_update.sh)
function bsPlaceName(el, b, width) {
  const s = width / 800
  const n = b.name
  el.textContent = bsName()
  Object.assign(el.style, {
    fontSize: `${n.fontSize * s}px`,
    fontWeight: n.fontWeight,
    letterSpacing: `${n.letterSpacing * s}px`,
    color: n.color,
    textShadow: bsShadow(n.textShadow, s),
    top: `${n.y * s}px`,
    transform: 'none',
    left: n.align === 'center' ? '50%' : `${n.x * s}px`,
  })
  const scale = Math.min(1, (n.maxWidth * s) / Math.max(1, el.scrollWidth))
  el.style.transformOrigin = n.align === 'center' ? 'center top' : 'left top'
  el.style.transform = `${n.align === 'center' ? 'translateX(-50%) ' : ''}scale(${scale})`
}

// title and line of the maintenance / goodbye / battery screen at their place
function bsPlaceMaint(box, b, width, kind, lang) {
  const s = width / 800
  const m = b[`${kind}Text`] || b.maintenanceText // (update / install / wlan: the maintenance layout)
  const p = m.subPill
  const texts = disp.bs.screens.texts?.[kind] ?? {}
  const [title, sub] = texts[lang] ?? texts.en ?? ['', '']
  box.innerHTML = ''
  Object.assign(box.style, { left: m.align === 'center' ? `${(400 - m.maxWidth / 2) * s}px` : `${m.x * s}px`, top: `${m.y * s}px`, width: `${m.maxWidth * s}px`, textAlign: m.align === 'center' ? 'center' : 'left' })
  const t1 = Object.assign(document.createElement('span'), { className: 't', textContent: title })
  t1.style.cssText = `font-size:${m.titleSize * s}px;font-weight:${m.titleWeight};color:${m.color};text-shadow:${bsShadow(m.textShadow, s)};letter-spacing:${-1 * s}px;margin-bottom:${m.gap * s}px`
  const t2 = Object.assign(document.createElement('span'), { className: 's', textContent: sub })
  t2.style.cssText = `font-size:${m.subSize * s}px;font-weight:${m.subWeight};color:${p.color};background:${p.background};border-radius:${p.radius * s}px;padding:${p.padY * s}px ${p.padX * s}px`
  box.append(t1, t2)
  for (let ts = m.titleSize; ts > 24 && t1.getBoundingClientRect().height > 2.2 * ts * 1.05 * s; ts--) t1.style.fontSize = `${(ts - 1) * s}px`
}

const MAINT_KINDS = ['update', 'install', 'wlan']
const BS_KINDS = [
  ['update', 'Update läuft'],
  ['install', 'Installation läuft'],
  ['wlan', 'Neues WLAN wird eingerichtet'],
  ['goodbye', 'Tschüss (schaltet aus)'],
  ['battery', 'Akku leer (schaltet aus)'],
]

function bootTop() {
  const { screens, current, languages } = disp.bs
  const byId = Object.fromEntries(screens.bootscreens.map((b) => [b.id, b]))
  disp.bsById = byId
  const opt = (v, l, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`
  return [
    `<div class="card nav-card"><div class="navlist">${navRow('ueber', 'Name der Box', current.boxName || screens.defaultName || 'MuPiBox', 'text')}${navRow('sprache', 'Sprache der Box', languages[current.bootscreenLanguage]?.name ?? current.bootscreenLanguage, 'globe')}</div></div>`,
    `<section class="card wide"><h2>Startbild</h2><p class="help">${screens.bootscreens.length} Szenen zur Auswahl – oder bei jedem Start eine zufällige. Der Name der Box steht auf dem Bild.</p>
      <div class="bs-grid" id="bs-grid">
        <button class="bs-tile" data-id="custom" aria-pressed="${disp.bsSel === 'custom'}"><span class="bs-thumb bs-random">${disp.bsOwn?.pictures?.splash ? `<img src="${API}/bootscreen/custom/splash.png?t=${Math.round(disp.bsOwn.pictures.splash)}" alt="">` : icon('image', 28)}</span><span class="bs-cap">Eigene Bilder</span></button>
        <button class="bs-tile" data-id="random" aria-pressed="${disp.bsSel === 'random'}"><span class="bs-thumb bs-random">${icon('sync', 28)}</span><span class="bs-cap">Jeden Start zufällig</span></button>
        ${screens.bootscreens
          .map(
            (b) => `<button class="bs-tile" data-id="${esc(b.id)}" aria-pressed="${disp.bsSel === b.id}"><span class="bs-thumb"><img src="${bsScene(b.id, 'scene')}" alt=""><span class="bs-text" data-bs-name="${esc(b.id)}"></span></span>
              <span class="bs-cap">${esc(bsLabel(b))}${b.id === screens.defaultBootscreen ? ' (Standard)' : ''}</span></button>`,
          )
          .join('')}</div></section>`,
    bsOwnCard(),
    `<section class="card wide"><h2>Wartungsbild & Vorschau</h2><p class="help">Bei Update, Installation, neuem WLAN, beim Ausschalten und bei leerem Akku.</p>
      <div class="rule-times stack-phone"><div class="field"><label for="bs-maint">Wartungsbild</label><select class="input" id="bs-maint">${opt('same', 'Wie das Startbild', disp.bsMaint)}${screens.bootscreens.map((b) => opt(b.id, bsLabel(b), disp.bsMaint)).join('')}</select></div>
        <div class="field"><label for="bs-kind">Vorschau</label><select class="input" id="bs-kind">${BS_KINDS.map(([v, l]) => opt(v, l, disp.bsKind)).join('')}</select></div></div>
      <div class="bs-previews"><div><small class="help">Startbild</small><div class="bs-preview" id="bs-boot"><img alt=""><span class="bs-text"></span></div></div>
        <div><small class="help" id="bs-mtitle">Wartungsbild</small><div class="bs-preview" id="bs-mprev"><img alt=""><div class="bs-maint"></div></div></div></div>
      <div class="btns"><button class="btn primary" id="bs-save">Speichern</button></div>
      <p class="help" style="margin:0">Die Bilder werden nach dem Speichern auf der Box erzeugt und sind ab dem nächsten Start zu sehen.</p></section>`,
  ]
}

function bsUpdate(root) {
  const s = disp.bs.screens
  const byId = disp.bsById
  for (const t of root.querySelectorAll('.bs-tile')) t.setAttribute('aria-pressed', String(t.dataset.id === disp.bsSel))
  const custom = disp.bsSel === 'custom'
  const shown = byId[custom ? disp.bsBase : disp.bsSel] ?? byId[s.defaultBootscreen] ?? s.bootscreens[0]
  const own = $('#bs-own', root)
  if (own) own.hidden = !custom
  const kind = disp.bsKind
  const off = !MAINT_KINDS.includes(kind)
  const mb = off || disp.bsMaint === 'same' ? shown : byId[disp.bsMaint] ?? shown
  const boot = $('#bs-boot', root)
  const maint = $('#bs-mprev', root)
  // (the own start picture as it is, without the name on it)
  const ownSplash = custom && disp.bsOwn?.pictures?.splash
  boot.querySelector('img').src = ownSplash ? `${API}/bootscreen/custom/splash.png?t=${Math.round(ownSplash)}` : bsScene(shown.id, 'scene')
  boot.querySelector('.bs-text').hidden = !!ownSplash
  maint.querySelector('img').src = bsScene(mb.id, off ? kind : 'maintenance')
  $('#bs-mtitle', root).textContent = off ? 'Beim Ausschalten' : 'Wartungsbild'
  bsPlaceName(boot.querySelector('.bs-text'), shown, boot.clientWidth || 400)
  bsPlaceMaint(maint.querySelector('.bs-maint'), mb, maint.clientWidth || 400, kind, disp.bs.current.bootscreenLanguage || 'en')
  for (const el of root.querySelectorAll('#bs-grid [data-bs-name]')) bsPlaceName(el, byId[el.dataset.bsName], el.parentElement.clientWidth || 130)
}

function mountBoot(root, page) {
  mountBsOwn(root, page)
  for (const t of root.querySelectorAll('.bs-tile')) {
    t.onclick = () => {
      disp.bsSel = t.dataset.id
      bsUpdate(root)
    }
  }
  $('#bs-maint', root).onchange = (e) => {
    disp.bsMaint = e.target.value
    bsUpdate(root)
  }
  $('#bs-kind', root).onchange = (e) => {
    disp.bsKind = e.target.value
    bsUpdate(root)
  }
  $('#bs-save', root).onclick = async () => {
    const r = await api(`${API}/bootscreen`, { method: 'POST', body: { bootscreen: disp.bsSel, maintenanceScreen: disp.bsMaint } })
    if (!r.ok) return toast('Nicht gespeichert', 'info')
    disp.bs.current = r.body.current
    disp.bsBase = r.body.current.base || disp.bs.screens.defaultBootscreen
    toast('Gespeichert – die Bilder werden erzeugt')
  }
  bsUpdate(root)
  // the names are laid out in the font of the box: again once it is loaded
  document.fonts?.load?.('600 20px Fredoka').then(() => currentPage()?.id === 'startbilder' && bsUpdate(root), () => undefined)
  every(1000, () => {
    // the grid changes its size with the window: place the names again (cheap, only when the width changed)
    const w = $('#bs-boot', root)?.clientWidth
    if (w && w !== disp.bsWidth) {
      disp.bsWidth = w
      bsUpdate(root)
    }
  })
}

/* Texte auf dem Display: own texts of the overlays, preview of the box's own page */

const DT_FIELDS = [
  ['blocked', 'blockedHeading', 'Überschrift'],
  ['blocked', 'blockedSubheading', 'Text darunter'],
  ['quiet', 'quietHeading', 'Überschrift'],
  ['quiet', 'quietSubheading', 'Text darunter'],
  ['parents', 'parentsTitle', 'Titel'],
  ['parents', 'parentsHint', 'Hinweis'],
  ['parents', 'parentsCountdown', 'Countdown ({s} = Sekunden)'],
  ['parents', 'parentsClose', 'Knopf „Schließen“'],
]
const DT_SCREENS = [
  ['blocked', 'Limit erreicht'],
  ['quiet', 'Ruhezeit'],
  ['parents', 'QR-Code für Eltern'],
]

async function loadDisplayTexts() {
  const [r, file] = await Promise.all([
    api(`${API}/display-texts`),
    fetch('/assets/i18n/display-texts.json', { cache: 'no-cache' }).then((x) => (x.ok ? x.json() : {})).catch(() => ({})),
  ])
  if (!r.ok) throw new Error(`display-texts ${r.status}`)
  disp.dt = { texts: { ...(r.body?.texts ?? {}) }, language: r.body?.language ?? 'en' }
  disp.dtLangs = file?.languages ?? {}
}

function textsTop() {
  const lang = disp.dt.language
  const defaults = disp.dtLangs[lang]?.texts ?? disp.dtLangs.en?.texts ?? {}
  return [
    `<div class="card nav-card"><div class="navlist">${navRow('sprache', 'Sprache der Box', disp.dtLangs[lang]?.name ?? lang, 'globe')}</div></div>`,
    `<section class="card wide"><h2>Texte</h2><p class="help">Was das Kind sieht, wenn die Spielzeit aufgebraucht ist oder eine Ruhezeit läuft, dazu der QR-Code für Eltern. Leer = der Text der Sprache (grau).</p>
      <div class="seg" id="dt-seg">${DT_SCREENS.map(([v, l]) => `<button aria-pressed="${disp.dtScreen === v}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="dt-frame" id="dt-frame"><iframe src="${BOX_ORIGIN}/text-preview?screen=${disp.dtScreen}" title="Vorschau" tabindex="-1"></iframe></div>
      <div id="dt-fields">${DT_FIELDS.filter(([sc]) => sc === disp.dtScreen)
        .map(([, key, label]) => `<div class="field"><label for="dt-${key}">${label}</label><input class="input" id="dt-${key}" data-dt="${key}" maxlength="120" value="${esc(disp.dt.texts[key] ?? '')}" placeholder="${esc(defaults[key] ?? '')}"></div>`)
        .join('')}</div>
      <div class="btns"><button class="btn primary" id="dt-save">Texte speichern</button></div></section>`,
  ]
}

function mountTexts(root, page) {
  const frame = $('#dt-frame iframe', root)
  const box = $('#dt-frame', root)
  const fit = () => frame.style.setProperty('--s', String(box.clientWidth / 800))
  fit()
  every(1000, fit)
  const send = () => frame.contentWindow?.postMessage({ type: 'mupibox-display-texts', language: disp.dt.language, texts: disp.dt.texts }, BOX_ORIGIN)
  frame.addEventListener('load', () => setTimeout(send, 400))
  for (const input of root.querySelectorAll('[data-dt]')) {
    input.addEventListener('input', () => {
      disp.dt.texts[input.dataset.dt] = input.value
      send()
    })
  }
  $('#dt-seg', root).onclick = (e) => {
    const b = e.target.closest('button')
    if (!b || b.dataset.v === disp.dtScreen) return
    disp.dtScreen = b.dataset.v
    renderPage(page, false)
  }
  $('#dt-save', root).onclick = async () => {
    // all eight texts go together (the box replaces the whole set)
    const texts = Object.fromEntries(DT_FIELDS.map(([, key]) => [key, String(disp.dt.texts[key] ?? '').trim()]))
    const r = await api(`${API}/display-texts`, { method: 'POST', body: { language: disp.dt.language, texts } })
    toast(r.ok ? 'Texte gespeichert' : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
  }
}

/* Display: brightness, off after, rotation, resolution */

const HDMI_ROT = [
  ['Aus (Standard)', '0'],
  ['90°', '1'],
  ['180°', '2'],
  ['270°', '3'],
  ['Horizontal spiegeln', '0x10000'],
  ['Vertikal spiegeln', '0x20000'],
]
const LCD_ROT = [
  ['Aus (Standard)', '0'],
  ['180°', '2'],
]
// The display's usual sizes; anything else is "Eigene …" with its two fields
const RES_PRESETS = [
  ['800 × 480', 800, 480],
  ['1024 × 600', 1024, 600],
  ['1280 × 720', 1280, 720],
  ['1280 × 800', 1280, 800],
  ['1920 × 1080', 1920, 1080],
]
// "Display aus nach": the steps of its slider (min, 0 = never)
const DISPLAY_OFF_STOPS = [0, 1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120]

// A rotation as tiles: a small screen turned as the display will be (its top marked), the mirrorings flipped
function rotTiles(key, list) {
  const now = state.values.get(key)
  const look = { 'Aus (Standard)': ['0°', 'rotate(0)'], '90°': ['90°', 'rotate(90deg)'], '180°': ['180°', 'rotate(180deg)'], '270°': ['270°', 'rotate(270deg)'], 'Horizontal spiegeln': ['Spiegeln ↔', 'scaleX(-1)'], 'Vertikal spiegeln': ['Spiegeln ↕', 'scaleY(-1)'] }
  return `<div class="rot-tiles">${list
    .map(([label]) => {
      const [text, tf] = look[label] ?? [label, 'none']
      return `<button type="button" class="rot-tile" data-rot-key="${esc(key)}" data-rot="${esc(label)}" aria-pressed="${label === now}"><span class="scr" style="transform:${tf}"><i></i><b>F</b></span><small>${esc(text)}</small></button>`
    })
    .join('')}</div>`
}

const rotLabel = (list, v) => list.find(([, x]) => x === String(v))?.[0] ?? list[0][0]
const rotValue = (list, label) => list.find(([l]) => l === label)?.[1] ?? '0'

async function loadDisplaySettings() {
  const [, power] = await Promise.all([loadDisplayOptions(), api(`${API}/power-config`)])
  const o = disp.opts
  disp.power = power.body ?? {}
  if (o.brightness != null) state.values.set('bright', o.brightness)
  state.values.set('dispOff', Number(disp.power.idleDisplayOff ?? disp.power.timeout?.idleDisplayOff ?? 10))
  state.values.set('hdmiRot', rotLabel(HDMI_ROT, o.rotation.display_hdmi_rotate))
  state.values.set('lcdRot', rotLabel(LCD_ROT, o.rotation.lcd_rotate))
  state.values.set('dlcdRot', rotLabel(LCD_ROT, o.rotation.display_lcd_rotate))
  state.values.set('resX', String(o.resX))
  state.values.set('resY', String(o.resY))
  const nd = o.nightDim ?? {}
  state.values.set('ndOn', nd.enabled === true)
  state.values.set('ndFrom', nd.from ?? '19:00')
  state.values.set('ndTo', nd.to ?? '07:00')
  state.values.set('ndLevel', nd.level ?? 30)
  state.values.set('ndFade', nd.fade ?? 30)
  state.values.set('ndQuiet', nd.withQuiet === true)
}

async function loadControls() {
  await loadDisplayOptions()
  const o = disp.opts
  const hidden = new Set(o.hiddenCategories)
  state.values.set('hideA', hidden.has('audiobook'))
  state.values.set('hideM', hidden.has('music'))
  state.values.set('hideN', hidden.has('nas'))
  state.values.set('hideO', hidden.has('other'))
  state.values.set('resume', o.resume)
  state.values.set('listTimer', o.listviewTimer)
  state.values.set('setTimer', o.settingsAccessTimer)
  state.values.set('epResume', o.episodeResume !== false)
  state.values.set('outPick', o.outputPicker !== false)
  state.values.set('epDays', EP_DAYS.find(([, d]) => d === o.episodeResumeDays)?.[0] ?? `${o.episodeResumeDays} Tage`)
  state.values.set('epNew', o.newEpisodes !== false)
  state.values.set('epNewDays', `${o.newEpisodeDays ?? 7} Tage`)
  state.values.set('epProgress', o.episodeProgress !== false)
}

// The display's tabs: hidden key, the page's switch (on = shown), its name
const TAB_KEYS = [
  ['hideA', 'showA', 'Hörspiele'],
  ['hideM', 'showM', 'Musik'],
  ['hideN', 'showN', 'NAS'],
  ['hideO', 'showO', 'Radio & Podcasts'],
]

// How long a podcast episode's position is remembered (mupibox.episodeResumeDays; 0: without end)
const EP_DAYS = [
  ['1 Monat', 30],
  ['3 Monate', 90],
  ['6 Monate', 180],
  ['1 Jahr', 365],
  ['Unbegrenzt', 0],
]

/* Display live: a picture of the display, the remote control */

function liveTop() {
  return [
    `<section class="card wide"><h2>Aktuelles Bild</h2><p class="help">So sieht das Display gerade aus. Aktualisiert sich alle 5 Sekunden, solange die Seite offen ist.</p>
      <div class="live-shot"><img id="lv-img" alt="Bild des Displays"></div><p class="help" id="lv-note" style="margin:0"></p>
      <div class="btns"><button class="btn" id="lv-refresh">Aktualisieren</button></div></section>`,
    `<section class="card" id="lv-card"><h2>Fernsteuerung (VNC)</h2><p class="help">Das Display im Browser bedienen – mit der Anmeldung der App, ohne eigenes Passwort. Dafür muss VNC unter Dienste › Freigaben & Fernzugriff an sein.</p>
      <p class="help" id="lv-vnc" style="margin:0"></p><div class="btns"><button class="btn primary" id="lv-open" disabled>Fernsteuerung öffnen</button><button class="btn" id="lv-shares" hidden>Zu Freigaben & Fernzugriff</button></div>
      <div class="vnc-frame" id="lv-frame" hidden><iframe title="Fernsteuerung" allow="fullscreen; clipboard-read; clipboard-write"></iframe>
        <div class="btns"><button class="btn" id="lv-full">${icon('ext', 18)}Vollbild</button><button class="btn" id="lv-tab">In neuem Tab</button><button class="btn" id="lv-close">Schließen</button></div></div></section>`,
  ]
}

function mountLive(root) {
  const img = $('#lv-img', root)
  // (fetched, not an <img src>: the picture's time comes with it - a failed shot brings the one before, with its time)
  const shot = async () => {
    const r = await fetch(`${API}/display/screenshot?t=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
    if (!img.isConnected) return
    if (!r?.ok) {
      $('#lv-note', root).textContent = 'Das Bild ließ sich nicht holen.'
      return
    }
    const at = Number(r.headers.get('x-shot-at')) || Date.now()
    const url = URL.createObjectURL(await r.blob())
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url)
    img.src = url
    img.dataset.url = url
    $('#lv-note', root).textContent = `Stand ${new Date(at).toLocaleTimeString(LOCALE)}`
  }
  shot()
  every(5000, () => document.visibilityState === 'visible' && shot())
  $('#lv-refresh', root).onclick = shot
  api(`${API}/display/vnc`).then((r) => {
    const on = r.body?.active
    $('#lv-vnc', root).textContent = on ? 'Die Fernsteuerung läuft.' : 'Die Fernsteuerung ist aus.'
    const btn = $('#lv-open', root)
    btn.disabled = !on
    const shares = $('#lv-shares', root)
    shares.hidden = !!on
    shares.onclick = () => go('freigaben')
    // (the app on port 8200 of the same box: its login goes with it)
    const url = `http://${location.hostname}:${r.body.port ?? 8200}${r.body.path ?? r.body.url ?? ''}`
    const frame = $('#lv-frame', root)
    const iframe = frame.querySelector('iframe')
    const card = $('#lv-card', root)
    btn.onclick = () => {
      // (a page of https does not show one of http inside it: a tab of its own there)
      if (location.protocol === 'https:') return window.open(url, '_blank', 'noopener')
      iframe.src = url
      frame.hidden = false
      card.classList.add('wide')
      btn.hidden = true
      frame.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    $('#lv-full', root).onclick = () => (iframe.requestFullscreen ? iframe.requestFullscreen() : window.open(url, '_blank', 'noopener'))
    $('#lv-tab', root).onclick = () => window.open(url, '_blank', 'noopener')
    $('#lv-close', root).onclick = () => {
      iframe.src = 'about:blank'
      frame.hidden = true
      card.classList.remove('wide')
      btn.hidden = false
    }
  })
}

const fmtSec = (v) => `${Number(v).toLocaleString(LOCALE)} s`

/* Einstellungen › Audio and › Akku & Strom */

const hw = { data: null, audio: null, bt: null, found: null, scanning: false, power: null, hat: null, hist: null }

async function loadHardware() {
  const r = await api(`${API}/hardware`)
  if (!r.ok) throw new Error(`hardware ${r.status}`)
  hw.data = r.body
}

// Leaves out the schema's save button of a page that saves each change right away
const withoutSave = (page) => page.sections.map((sec) => ({ ...sec, items: sec.items.filter((it) => !(it.type === 'buttons' && it.buttons.some(([l]) => l === 'Speichern'))) }))

async function offerReboot(text) {
  if (!(await ask('Neu starten?', text, 'Jetzt neu starten'))) return toast('Wird beim nächsten Neustart übernommen', 'info')
  const r = await api('/api/reboot', { method: 'POST', body: {} })
  toast(r.ok ? 'Die Box startet neu …' : 'Neustart ging nicht', r.ok ? 'ok' : 'info')
}

/* Lautstärke */

async function loadVolume() {
  const r = await api(`${API}/audio`)
  if (!r.ok) throw new Error(`audio ${r.status}`)
  hw.audio = r.body
  state.values.set('vol', Number(r.body.current ?? 0))
  state.values.set('volMax', Number(r.body.maxVolume ?? 100))
  state.values.set('volFix', r.body.startupVolume != null)
  state.values.set('volStart', Number(r.body.startupVolume ?? 30))
  // (with Bluetooth audio: an own maximum - for headphones)
  state.values.set('volBtOn', r.body.btMaxVolume != null)
  state.values.set('volBtMax', Number(r.body.btMaxVolume ?? Math.min(60, Number(r.body.maxVolume ?? 100))))
  // the levelling of the loudness (off | soft | strong): a switch and, with it on, the strength
  state.values.set('loudOn', r.body.loudness === 'soft' || r.body.loudness === 'strong')
  state.values.set('loudMode', r.body.loudness === 'strong' ? 'Kräftig' : 'Sanft')
}

/* Soundkarte, Drehregler */

const BTN_FN = [
  ['Aus', 'off'],
  ['Play/Pause', 'playpause'],
  ['Nächster Titel', 'next'],
  ['Vorspulen', 'ffwd'],
]

/* Bluetooth */

async function loadBluetooth() {
  const r = await api(`${API}/bluetooth`)
  if (!r.ok) throw new Error(`bluetooth ${r.status}`)
  hw.bt = r.body
}

// (a found device that told no name: its address only - those go under "Weitere Geräte")
const btNameless = (d) => !d.name || d.name === d.mac || /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i.test(d.name)
// how long a search takes about (the backend scans ~20 s, see /bluetooth/scan)
const BT_SCAN_S = 25

function btTop() {
  const b = hw.bt ?? {}
  const chip = b.chip ?? { on: true, present: true, rebootNeeded: false }
  const sw = (id, label, help, on, off = false) =>
    `<div class="row"><span class="lbl"><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} aria-label="${label}"><span></span></label></div>`
  const devices = b.devices ?? []
  const noHw = !chip.present
  const linked = devices.find((d) => d.connected)
  // the everyday switches, with what the box does now
  const main = `<section class="card bt-main" data-col="1"><div class="card-head"><h2>Bluetooth</h2><span class="chip ${b.powered ? 'ok' : ''}">${b.powered ? 'an' : 'aus'}</span></div>
    ${noHw ? `<div class="note warn">${icon('info', 18)}<span>Der Bluetooth-Chip ist ausgeschaltet (gilt nach einem Neustart). Einschalten unten unter „Hardware“.</span></div>` : ''}
    ${b.powered ? `<div class="status-line"><span class="dot ${linked ? 'ok' : ''}"></span><span>${linked ? `Verbunden mit <b translate="no">${esc(linked.name)}</b>` : 'Kein Gerät verbunden'}</span></div>` : ''}
    ${sw('bt-on', 'Bluetooth', 'Für Kopfhörer oder Lautsprecher.', b.powered, noHw)}${sw('bt-auto', 'Automatisch verbinden', 'Verbindet ein bekanntes Gerät von selbst, sobald es an ist.', b.autoconnect, noHw)}
    <div class="navlist">${navRow('lautstaerke', 'Lautstärkegrenze für Kopfhörer', 'Eigenes Maximum, solange Bluetooth-Audio läuft', 'vol')}</div></section>`
  const paired = b.powered
    ? `<section class="card" data-col="1" data-card="gekoppelte-gerate"><h2>Gekoppelte Geräte</h2>${
        devices.length
          ? `<div class="rows">${devices
              .map(
                (d, i) =>
                  `<div class="entry"><span class="avatar">${icon('bt', 16)}</span><span class="lbl"><b translate="no">${esc(d.name)}</b><small>${d.connected ? 'verbunden' : 'nicht verbunden'}</small></span>
                  ${d.connected ? `<button class="btn sm" data-bt-disc="${i}">Trennen</button>` : `<button class="btn sm" data-bt-conn="${i}">Verbinden</button>`}<button class="btn danger sm" data-bt-rm="${i}">Entfernen</button></div>`,
              )
              .join('')}</div>`
          : `<p class="help" style="margin:0">Noch kein Gerät gekoppelt. Neue Geräte koppelst du unter „Neues Gerät koppeln“.</p>`
      }</section>`
    : ''
  const found = hw.found ?? []
  const named = found.filter((d) => !btNameless(d))
  const nameless = found.filter(btNameless)
  const foundRow = (d) => `<div class="entry"><span class="avatar">${icon('bt', 16)}</span><span class="lbl"><b translate="no">${esc(d.name || d.mac)}</b><small>${esc(d.mac)}</small></span><button class="btn sm" data-bt-pair="${found.indexOf(d)}">Koppeln</button></div>`
  const left = hw.scanning ? Math.max(1, BT_SCAN_S - Math.round((Date.now() - (hw.scanStart ?? Date.now())) / 1000)) : 0
  const pair = b.powered
    ? `<section class="card" data-col="2"><h2>Neues Gerät koppeln</h2><p class="help">Gerät in den Kopplungsmodus versetzen (meist die Taste lange drücken), dann suchen.</p>
        <div class="btns"><button class="btn primary" id="bt-scan" ${hw.scanning ? 'disabled' : ''}>${hw.scanning ? `<span class="spin"></span><span id="bt-left">Suche läuft … noch ${left} s</span>` : hw.found ? 'Neu suchen' : 'Suchen'}</button></div>
        ${
          hw.found
            ? found.length
              ? `${named.length ? `<div class="rows">${named.map(foundRow).join('')}</div>` : '<p class="help" style="margin:0">Kein Gerät mit Namen gefunden.</p>'}
                 ${nameless.length ? `<details class="more"><summary>${esc(nameless.length === 1 ? 'Ein weiteres Gerät ohne Namen' : `${nameless.length} weitere Geräte ohne Namen`)}</summary><div class="rows">${nameless.map(foundRow).join('')}</div></details>` : ''}`
              : '<p class="help" style="margin:0">Nichts gefunden. Ist das Gerät im Kopplungsmodus?</p>'
            : ''
        }</section>`
    : ''
  // the hardware: rarely needed, folded away
  const hardware = `<section class="card" data-col="2"><h2>Hardware</h2>
    ${chip.rebootNeeded ? `<div class="note warn">${icon('info', 18)}<span>${chip.on ? 'Der Chip wird beim nächsten Neustart eingeschaltet.' : 'Der Chip wird beim nächsten Neustart abgeschaltet.'}</span></div><div class="btns"><button class="btn" id="bt-reboot">Jetzt neu starten</button></div>` : ''}
    <details class="more"${noHw ? ' open' : ''}><summary>Bluetooth-Chip und Controller</summary>
    ${sw('bt-chip', 'Bluetooth-Chip', 'Schaltet die Bluetooth-Hardware des Raspberry Pi ganz ab: für stabileres Onboard-WLAN (es teilt sich den Funk mit Bluetooth), etwas weniger Strom oder die serielle Schnittstelle, die der Chip belegt. Gilt nach einem Neustart.', chip.on)}
    ${b.controller ? `<dl class="kv"><div><dt>Controller</dt><dd translate="no">${esc(b.controller.name)} · ${esc(b.controller.mac)}</dd></div></dl>` : ''}</details></section>`
  return [main, paired, pair, hardware]
}

function mountBluetooth(root, page) {
  const again = async (text, kind) => {
    if (text) toast(text, kind)
    await loadBluetooth().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  $('#bt-on', root).onchange = async (e) => {
    const on = e.target.checked
    const r = await api(`${API}/bluetooth/power`, { method: 'POST', body: { on } })
    hw.found = null
    again(r.body?.ok ? (on ? 'Bluetooth an' : 'Bluetooth aus') : 'Das hat nicht geklappt', r.body?.ok ? 'ok' : 'info')
  }
  $('#bt-auto', root).onchange = async (e) => {
    const r = await api(`${API}/bluetooth/autoconnect`, { method: 'POST', body: { enable: e.target.checked } })
    toast(r.ok ? (e.target.checked ? 'Verbindet automatisch' : 'Verbindet nicht mehr automatisch') : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    if (!r.ok) e.target.checked = !e.target.checked // (the switch shows what the box does)
  }
  $('#bt-chip', root).onchange = async (e) => {
    const on = e.target.checked
    const text = on
      ? 'Die Bluetooth-Hardware wird beim nächsten Neustart eingeschaltet.'
      : 'Die Bluetooth-Hardware wird beim nächsten Neustart ganz abgeschaltet. Kopfhörer und Lautsprecher lassen sich dann nicht mehr verbinden, bis sie wieder eingeschaltet wird.'
    if (!(await ask(on ? 'Bluetooth-Chip einschalten?' : 'Bluetooth-Chip abschalten?', text, on ? 'Einschalten' : 'Abschalten'))) {
      e.target.checked = !on
      return
    }
    const r = await api(`${API}/bluetooth/chip`, { method: 'POST', body: { on } })
    if (!r.ok || !r.body?.ok) return again('Das hat nicht geklappt', 'info')
    await again()
    if (r.body.rebootNeeded) offerReboot(on ? 'Der Chip wird eingeschaltet.' : 'Der Chip wird abgeschaltet.')
  }
  $('#bt-reboot', root)?.addEventListener('click', () => offerReboot(hw.bt?.chip?.on ? 'Der Chip wird eingeschaltet.' : 'Der Chip wird abgeschaltet.'))
  // while searching: the time it still takes, every second
  if (hw.scanning) {
    every(1000, () => {
      const el = $('#bt-left', root)
      if (el) el.textContent = `Suche läuft … noch ${Math.max(1, BT_SCAN_S - Math.round((Date.now() - hw.scanStart) / 1000))} s`
    })
  }
  // (connect and disconnect a paired device)
  for (const [attr, path, ok, no] of [
    ['btConn', 'connect', 'verbunden', 'ließ sich nicht verbinden – ist es an?'],
    ['btDisc', 'disconnect', 'getrennt', 'ließ sich nicht trennen'],
  ]) {
    for (const b of root.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) {
      const d = hw.bt.devices[Number(b.dataset[attr])]
      b.onclick = async () => {
        b.disabled = true
        const r = await api(`${API}/bluetooth/${path}`, { method: 'POST', body: { mac: d.mac } })
        again(r.body?.ok ? `${d.name} ${ok}` : `${d.name} ${no}`, r.body?.ok ? 'ok' : 'info')
      }
    }
  }
  $('#bt-scan', root)?.addEventListener('click', async () => {
    hw.scanning = true
    hw.scanStart = Date.now()
    renderPage(page, false)
    const r = await api(`${API}/bluetooth/scan`, { method: 'POST', body: {} })
    hw.scanning = false
    hw.found = r.body?.found ?? []
    if (currentPage()?.id === page.id) renderPage(page, false)
  })
  for (const b of root.querySelectorAll('[data-bt-pair]')) {
    const d = hw.found[Number(b.dataset.btPair)]
    b.onclick = async () => {
      b.disabled = true
      b.textContent = 'Kopple …'
      const r = await api(`${API}/bluetooth/pair`, { method: 'POST', body: { mac: d.mac } })
      hw.found = hw.found.filter((x) => x !== d)
      again(r.body?.ok ? `${d.name} gekoppelt` : `${d.name} ließ sich nicht koppeln`, r.body?.ok ? 'ok' : 'info')
    }
  }
  for (const b of root.querySelectorAll('[data-bt-rm]')) {
    const d = hw.bt.devices[Number(b.dataset.btRm)]
    b.onclick = () =>
      confirmSheet('Entfernen', `„${d.name}“ entfernen? Zum erneuten Verbinden muss es wieder gekoppelt werden.`, async () => {
        // (at once: the row greyed out and its buttons off, until the list comes again)
        const row = b.closest('.entry')
        row?.classList.add('out')
        for (const x of row?.querySelectorAll('button') ?? []) x.disabled = true
        toast('Wird entfernt …')
        const r = await api(`${API}/bluetooth/remove`, { method: 'POST', body: { mac: d.mac } })
        again(r.ok ? 'Entfernt' : 'Das Gerät ließ sich nicht entfernen', r.ok ? 'ok' : 'info')
      })
  }
}

/* Akku */

// the battery takes current (not: the power supply gives some - that also runs the Pi; with the charger stuck it gave
// 45 mA and the app showed the flash while the battery ran down)
const batteryCharging = (h) => Number.isFinite(h?.Ibat) && h.Ibat > 50
// (the box saw it for 10 minutes: /api/mupihat ChargeProblemSince, see checkCharging in server.ts)
const NOT_CHARGING = 'Das Netzteil steckt, aber der Akku lädt nicht. Bitte das Netzteil an der Box kurz abziehen und wieder anstecken.'
// (the MuPiHAT service did not update the values for 10 minutes, a restart of it did not help: BatteryStaleSince, see
// checkHatFresh in server.ts)
const BATTERY_STALE = 'Die Box liest den Akku nicht mehr aus, die Werte sind veraltet. Ein Neustart des MuPiHAT-Dienstes hat nicht geholfen – bitte die Box neu starten.'

async function loadBattery() {
  const [hat, hist] = await Promise.all([api('/api/mupihat'), api(`${API}/battery-history?hours=24`)])
  hw.hat = hat.ok ? hat.body : null
  hw.hist = hist.ok ? hist.body?.samples ?? [] : []
}

function batteryTop() {
  const h = hw.hat
  if (h === null) return [`<section class="card"><h2>Akku-Stand</h2><p class="help" style="margin:0">Die Akku-Werte ließen sich gerade nicht laden.</p></section>`]
  if (!h || !Object.keys(h).length) return [`<section class="card"><h2>Akku-Stand</h2><p class="help" style="margin:0">Kein MuPiHAT gefunden – die Box läuft ohne Akku-Anzeige.</p></section>`]
  const volt = (mv) => (Number.isFinite(mv) && mv > 0 ? `${(mv / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V` : '–')
  if (noBattery(h)) {
    return [
      `<section class="card"><h2>Akku-Stand</h2><div class="bat-now"><div class="bat-pct">Netzbetrieb</div><small>${esc(NO_BATTERY_TEXT)}</small></div>
      <dl class="kv"><div><dt>USB-Spannung</dt><dd>${volt(h.Vbus)}</dd></div><div><dt>Temperatur Lade-Chip</dt><dd>${Number.isFinite(h.Temp) ? `${h.Temp.toLocaleString(LOCALE)} °C` : '–'}</dd></div></dl></section>`,
    ]
  }
  let pct = h.Bat_Percent
  if (!Number.isFinite(pct)) pct = Number.parseInt(String(h.Bat_SOC ?? ''), 10)
  const charging = batteryCharging(h)
  const v = (mv) => (Number.isFinite(mv) && mv > 0 ? `${(mv / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V` : '–')
  const status = { 'Not Charging': 'lädt nicht', 'Pre-charge': 'Vorladen', 'Fast charge (CC mode)': 'lädt (schnell)', 'Fast Charging': 'lädt (schnell)', 'Fast charging': 'lädt (schnell)', 'Trickle Charge': 'lädt (Erhaltung)', 'Taper Charge (CV mode)': 'lädt (fast voll)', 'Taper Charging': 'lädt (fast voll)', 'Top-off Timer Active Charging': 'lädt (fast voll)', 'Charge Termination Done': 'vollständig geladen' }[h.Charger_Status] ?? h.Charger_Status ?? '–'
  // what the battery does now, under the big number (as the design: "OK · entlädt")
  const state = charging
    ? 'lädt'
    : /termination|done/i.test(h.Charger_Status ?? '')
      ? 'vollständig geladen'
      : Number.isFinite(h.Ibat) && h.Ibat < -50
        ? 'entlädt'
        : 'Ruhezustand'
  const health = { OK: 'OK', LOW: 'Niedrig', SHUTDOWN: 'Leer' }[h.Bat_Stat] ?? h.Bat_Stat
  // the last 24 hours in twelve steps of two hours: the charge at the end of each (the last reading in it), so every
  // bar says how full the box was then
  const now = Date.now()
  const samples = (hw.hist ?? []).filter((s) => Number.isFinite(s.percent) && Number.isFinite(Date.parse(s.ts)))
  const steps = Array.from({ length: 12 }, (_, i) => {
    const from = now - (12 - i) * 2 * 3600e3
    const inStep = samples.filter((s) => {
      const t = Date.parse(s.ts)
      return t >= from && t < from + 2 * 3600e3
    })
    return { from, value: inStep.length ? inStep[inStep.length - 1].percent : null }
  })
  const last = samples[samples.length - 1]
  const chart = `<div class="chart vals" style="--n:12">${steps
    .map(
      (s, i) =>
        `<div class="col${i === 11 ? ' today' : ''}"><div class="bar-area"><b>${s.value ?? '–'}</b>${s.value === null ? '' : `<i style="height:calc((100% - 18px) * ${s.value / 100})"></i>`}</div><span>${new Date(i === 11 ? now : s.from + 2 * 3600e3).getHours()}</span></div>`,
    )
    .join('')}</div>`
  return [
    `<section class="card"><h2>Akku-Stand</h2>${h.ChargeProblemSince ? `<div class="note warn">${icon('plug', 18)}<span>${esc(NOT_CHARGING)}</span></div>` : ''}${
      h.BatteryStaleSince
        ? `<div class="note warn">${icon('bat', 18)}<span>${esc(BATTERY_STALE)} ${esc(`Letzte Werte von ${hhmm(Date.parse(h.BatteryStaleSince))} Uhr.`)}</span></div>
           <div class="btns"><button class="btn" id="hat-reboot">Box neu starten</button></div>`
        : ''
    }<div class="bat-now"><div class="bat-pct">${Number.isFinite(pct) ? `${pct} %` : '–'}</div><small>${esc([health, state].filter(Boolean).join(' · '))}</small></div>
      <dl class="kv"><div><dt>Akku-Spannung</dt><dd>${v(h.Vbat)}</dd></div><div><dt>USB-Spannung</dt><dd>${v(h.Vbus)}</dd></div>
        <div><dt>Akku-Strom</dt><dd>${Number.isFinite(h.Ibat) ? `${h.Ibat.toLocaleString(LOCALE)} mA` : '–'}</dd></div><div><dt>Temperatur Lade-Chip</dt><dd>${Number.isFinite(h.Temp) ? `${h.Temp.toLocaleString(LOCALE)} °C` : '–'}</dd></div>
        <div><dt>Ladegerät</dt><dd>${esc(status)}</dd></div></dl></section>`,
    `<section class="card"><h2>Verlauf (24 h)</h2>${
      last
        ? `${chart}<p class="help" style="margin:0">${esc(`Zuletzt ${last.percent} % um ${hhmm(Date.parse(last.ts))}.`)}</p>`
        : '<p class="help" style="margin:0">Noch keine Messwerte.</p>'
    }</section>`,
  ]
}

/* MuPiHAT & Akku-Profil */

const BATTERY_NAMES = { 'USB-C mode (no battery)': 'USB-C-Betrieb (ohne Akku)', Custom: 'Eigenes Profil' }
const batteryLabel = (n) => BATTERY_NAMES[n] ?? n
// No battery: the charger sees none (VBAT_PRESENT), or the profile "USB-C mode" is chosen - the box runs from the
// USB-C plug (a power supply or a power bank). Then no percent, no "nearly empty", no curve: the HAT reports 0 %
// with the placeholder profile, which read as an empty battery before.
const USB_C_PROFILE = Object.keys(BATTERY_NAMES).find((n) => /^USB-C/.test(n))
// (Bat_PercentSource "none": the HAT runs with the placeholder profile, see v_100 <= 10 in mupihat_bq25792.py)
const noBattery = (h) => h?.BatteryConnected === 0 || h?.Bat_PercentSource === 'none' || hw.data?.mupihat?.battery === USB_C_PROFILE
const NO_BATTERY_TEXT = 'Kein Akku – die Box läuft über USB-C (Netzteil oder Powerbank).'
// The profiles as offered: the batteries in the order of the config, the two special ones (no battery, own
// profile) at the end - a profile added later stood behind them (the 2S3P after "Custom")
const batteryOptions = (names) => [...names.filter((n) => !(n in BATTERY_NAMES)), ...names.filter((n) => n in BATTERY_NAMES)].map(batteryLabel)
const PROFILE_KEYS = [
  ['v100', 'v_100'],
  ['v75', 'v_75'],
  ['v50', 'v_50'],
  ['v25', 'v_25'],
  ['v0', 'v_0'],
  ['thWarn', 'th_warning'],
  ['thShut', 'th_shutdown'],
  ['vreg', 'vreg'],
]

async function loadHat() {
  const [, power, now] = await Promise.all([loadHardware(), api(`${API}/power-config`), api('/api/mupihat')])
  hw.power = power.body ?? {}
  hw.hat = now.ok ? now.body : null
  state.values.set('hatOn', hw.data.mupihat.active)
  state.values.set('battery', batteryLabel(hw.data.mupihat.battery))
  const p = hw.power.battery?.profile ?? {}
  for (const [key, field] of PROFILE_KEYS) state.values.set(key, p[field] != null ? String(p[field]) : '')
}

// What the battery reads now, under the choice of the profile: "7,85 V · 82 % · lädt"
function hatNowLine() {
  const h = hw.hat
  if (h && noBattery(h)) {
    const usb = Number.isFinite(h.Vbus) && h.Vbus > 0 ? `${(h.Vbus / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V` : '–'
    return `<div class="status-line"><span class="dot ok"></span><span><span>Jetzt</span> <b>${esc(`USB ${usb} · kein Akku`)}</b></span></div>`
  }
  if (!h || !Number.isFinite(h.Vbat)) return ''
  const pct = Number.isFinite(h.Bat_Percent) ? h.Bat_Percent : Number.parseInt(String(h.Bat_SOC ?? ''), 10)
  const what = batteryCharging(h) ? 'lädt' : Number.isFinite(h.Ibat) && h.Ibat < -50 ? 'entlädt' : 'Ruhezustand'
  const parts = [`${(h.Vbat / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V`, Number.isFinite(pct) ? `${pct} %` : '', what].filter(Boolean)
  return `<div class="status-line"><span class="dot ok"></span><span><span>Jetzt</span> <b>${esc(parts.join(' · '))}</b></span></div>`
}

// The profile's values as typed (numbers, or NaN)
const hatVals = () => Object.fromEntries(PROFILE_KEYS.map(([key]) => [key, Number.parseInt(String(state.values.get(key) ?? '').trim(), 10)]))

// What is wrong with the typed profile, per field (as the backend checks it, and more)
function hatProfileErrors() {
  const v = hatVals()
  const e = {}
  const curve = ['v0', 'v25', 'v50', 'v75', 'v100']
  for (const k of curve) if (!(v[k] >= 5000 && v[k] <= 9000)) e[k] = '5000–9000'
  curve.forEach((k, i) => {
    if (i > 0 && !e[k] && !e[curve[i - 1]] && v[k] <= v[curve[i - 1]]) e[k] = 'Muss größer sein als links daneben'
  })
  if (!(v.thWarn >= 5500 && v.thWarn <= 8000)) e.thWarn = '5500–8000'
  if (!(v.thShut >= 5000 && v.thShut <= 7500)) e.thShut = '5000–7500'
  else if (!e.thWarn && v.thShut >= v.thWarn) e.thShut = 'Muss unter der Warnung liegen'
  const vreg = String(state.values.get('vreg') ?? '').trim()
  if (vreg && !(v.vreg >= 6000 && v.vreg <= 8400)) e.vreg = v.vreg > 8400 ? 'Höher als 8400 mV schadet einem 2S-Akku' : '6000–8400'
  return e
}

// The charge curve: charge (0–100 %) against voltage, with the warning and switch-off lines and where the battery is now
function hatChart() {
  const v = hatVals()
  const pts = [
    [0, v.v0],
    [25, v.v25],
    [50, v.v50],
    [75, v.v75],
    [100, v.v100],
  ].filter(([, y]) => Number.isFinite(y))
  if (pts.length < 2) return ''
  const ys = [...pts.map(([, y]) => y), v.thWarn, v.thShut, hw.hat?.Vbat].filter(Number.isFinite)
  const lo = Math.floor((Math.min(...ys) - 150) / 100) * 100
  const hi = Math.ceil((Math.max(...ys) + 150) / 100) * 100
  const W = 320
  const H = 150
  const L = 34
  const B = 18
  const x = (p) => L + (p / 100) * (W - L - 6)
  const y = (mv) => 6 + (1 - (mv - lo) / (hi - lo)) * (H - B - 6)
  const volts = (mv) => (mv / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const grid = [lo, (lo + hi) / 2, hi].map((mv) => `<line x1="${L}" x2="${W - 6}" y1="${y(mv)}" y2="${y(mv)}" class="g"/><text x="${L - 4}" y="${y(mv) + 4}" text-anchor="end">${volts(mv)} V</text>`).join('')
  const xs = [0, 25, 50, 75, 100].map((p) => `<text x="${x(p)}" y="${H - 4}" text-anchor="${p === 0 ? 'start' : p === 100 ? 'end' : 'middle'}">${p} %</text>`).join('')
  const line = (mv, cls) => (Number.isFinite(mv) ? `<line x1="${L}" x2="${W - 6}" y1="${y(mv)}" y2="${y(mv)}" class="${cls}"/>` : '')
  const curve = pts.map(([p, mv]) => `${x(p)},${y(mv)}`).join(' ')
  // where the battery is: its voltage on the curve
  let now = ''
  const mv = hw.hat?.Vbat
  if (Number.isFinite(mv)) {
    const seg = pts.findIndex(([, a], i) => i < pts.length - 1 && mv >= a && mv <= pts[i + 1][1])
    const p = mv <= pts[0][1] ? 0 : mv >= pts[pts.length - 1][1] ? 100 : seg >= 0 ? pts[seg][0] + ((mv - pts[seg][1]) / (pts[seg + 1][1] - pts[seg][1])) * (pts[seg + 1][0] - pts[seg][0]) : null
    if (p !== null) now = `<circle cx="${x(p)}" cy="${y(mv)}" r="5" class="now"/>`
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ladekurve">${grid}${xs}${line(v.thWarn, 'warn')}${line(v.thShut, 'off')}<polyline points="${curve}" class="c"/>${pts.map(([p, m]) => `<circle cx="${x(p)}" cy="${y(m)}" r="3" class="p"/>`).join('')}${now}</svg>
    <div class="hat-legend"><span><i class="c"></i>Ladekurve</span><span><i class="warn"></i>Warnung</span><span><i class="off"></i>Abschalten</span>${now ? '<span><i class="now"></i>Jetzt</span>' : ''}</div>`
}

/* Taster und LED, Lüfter */

function pinOptions(reserved) {
  return (hw.data?.pins ?? []).filter((p) => !reserved.includes(p))
}

// The GPIO pins other parts use (OnOffShim, power LED, fan, rotary knob 26/24 and its button 10): a pin for one of
// them must not be one of these - LED and fan both on 13 were offered. without: the part asking.
function pinsInUse(without) {
  const d = hw.data ?? {}
  const used = [...(d.shim?.reserved ?? [])]
  if (without !== 'led' && d.shim?.ledPin) used.push(String(d.shim.ledPin))
  if (without !== 'fan' && d.fan?.active && d.fan?.gpio) used.push(String(d.fan.gpio))
  if (d.rotary?.active) used.push('26', '24', '10')
  return used
}

/* Einstellungen › Netzwerk and › Dienste */

const net = { status: null, scan: null, scanning: false, saved: null, shares: null, tg: null, tgFound: null, mqtt: null, wled: null }

/* WLAN */

async function loadWlan() {
  const [st, saved, fixed] = await Promise.all([api('/api/network'), api(`${API}/wifi/saved`), api(`${API}/wifi/static`)])
  net.status = st.ok ? st.body : null
  net.saved = saved.ok ? saved.body?.networks ?? [] : null
  // (the networks with a fixed address, by name - see eltern/wifi-static.ts; reverted: one the box took back to DHCP)
  net.fixed = fixed.ok ? fixed.body?.networks ?? {} : {}
  net.reverted = fixed.ok ? fixed.body?.reverted ?? null : null
}

// Gespeicherte Netze › Adresse: DHCP or a fixed address for this network (the box's address in it)
const WIFI_STATIC_ERRORS = {
  ip: 'Die IP-Adresse stimmt nicht (Form 192.168.1.50)',
  mask: 'Die Netzmaske stimmt nicht (z. B. 255.255.255.0)',
  gateway: 'Die Adresse des Routers stimmt nicht',
  dns: 'Die Adresse des DNS-Servers stimmt nicht',
  subnet: 'Adresse und Router liegen nicht im selben Netz',
  same: 'Die Adresse ist die des Routers',
  host: 'Diese Adresse ist im Netz reserviert – bitte eine andere',
}
// The checks of the test before saving (see test in eltern/wifi-static.ts): [text when fine, text when not]
const WIFI_TESTS = {
  network: ['Router und Adressbereich wie im Netz jetzt', 'Router oder Adressbereich anders als im Netz jetzt – Tippfehler?'],
  own: ['Die Adresse hat die Box gerade selbst', ''],
  free: ['Die Adresse ist frei', 'Die Adresse nutzt schon ein anderes Gerät'],
  router: ['Der Router antwortet unter der neuen Adresse', 'Der Router antwortet unter der neuen Adresse nicht'],
  dns: ['Der DNS-Server antwortet', 'Der DNS-Server antwortet nicht'],
}
const wifiTestHtml = (checks) =>
  `<div class="rows">${checks
    .map((c) => `<div class="entry"><span class="chip ${c.ok ? 'ok' : 'warn'}">${c.ok ? '✓' : c.warn ? '!' : '✗'}</span><span class="lbl">${esc(WIFI_TESTS[c.id]?.[c.ok ? 0 : 1] ?? c.id)}</span></div>`)
    .join('')}</div>`

function openWifiAddress(w, page) {
  const fixed = net.fixed?.[w.ssid]
  const s = net.status ?? {}
  // (a suggestion from now: in the network the box is in, the address and router it has from DHCP)
  const pre = fixed ?? (w.active ? { ip: s.ip, mask: s.subnet, gateway: s.gateway, dns: String(s.dns ?? '').split(/\s+/)[0] } : {})
  let mode = fixed && !fixed.paused ? 'Statisch' : 'DHCP'
  // the values last tested and whether all was fine (saving asks again when not)
  let tested = null
  const field = (k, label, placeholder, v) =>
    `<div class="field"><label for="wa-${k}">${esc(label)}</label><div class="input-wrap"><input class="input mono" id="wa-${k}" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(v ?? '')}"></div></div>`
  const when = w.active ? 'Die Box wechselt danach gleich auf diese Adresse, die WLAN-Verbindung bleibt bestehen.' : 'Gilt, sobald die Box sich das nächste Mal mit diesem Netz verbindet.'
  openSheet(
    `<h2 translate="no">${esc(w.ssid)}</h2>
     <div class="field"><label>${esc('Adresse beziehen')}</label><div class="seg" id="wa-mode">${['DHCP', 'Statisch'].map((o) => `<button aria-pressed="${o === mode}" data-v="${o}">${esc(o)}</button>`).join('')}</div></div>
     <div id="wa-fields"${mode === 'DHCP' ? ' hidden' : ''}>
       ${field('ip', 'IP-Adresse', 'z. B. 192.168.1.50', pre.ip)}${field('mask', 'Netzmaske', '255.255.255.0', pre.mask || '255.255.255.0')}
       ${field('gw', 'Router (Gateway)', 'z. B. 192.168.1.1', pre.gateway)}${field('dns', 'DNS-Server (optional)', 'leer = der Router', pre.dns && pre.dns !== pre.gateway ? pre.dns : '')}
       <p class="help">${esc(when)} ${esc('Erreicht sie damit ihren Router nicht, nimmt sie wieder DHCP und behält die Werte hier zum Korrigieren.')}</p>
       <p class="help">${esc('Die Adresse sollte außerhalb des Bereichs liegen, den der Router selbst vergibt – oder im Router für die Box reserviert sein.')}</p>
       ${w.active ? `<div class="btns"><button class="btn" data-test>${icon('check', 16)}${esc('Testen')}</button></div><div id="wa-test"></div>` : `<p class="help">${esc('Testen geht nur im Netz, in dem die Box gerade ist.')}</p>`}
     </div>
     <p class="help" id="wa-dhcp"${mode === 'DHCP' ? '' : ' hidden'}>${esc(fixed?.paused ? `Die Adresse kommt vom Router. Die feste Adresse ${fixed.ip} ist pausiert – „Statisch" wählen, um sie zu korrigieren und neu zu probieren.` : 'Die Adresse kommt vom Router.')}</p>
     <div class="btns"><button class="btn primary" data-save>${esc('Speichern')}</button><button class="btn" data-close>${esc('Abbrechen')}</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      for (const b of sheet.querySelectorAll('#wa-mode button')) {
        b.onclick = () => {
          mode = b.dataset.v
          for (const x of sheet.querySelectorAll('#wa-mode button')) x.setAttribute('aria-pressed', String(x === b))
          sheet.querySelector('#wa-fields').hidden = mode === 'DHCP'
          sheet.querySelector('#wa-dhcp').hidden = mode !== 'DHCP'
        }
      }
      const val = (k) => sheet.querySelector(`#wa-${k}`).value.trim()
      const values = () => ({ ssid: w.ssid, ip: val('ip'), mask: val('mask'), gateway: val('gw'), dns: val('dns') })
      // the test: its list in the sheet; true when all is fine
      const runTest = async () => {
        const body = values()
        const box = sheet.querySelector('#wa-test')
        box.innerHTML = `<p class="help">${esc('Wird getestet – die Verbindung bleibt dabei bestehen …')}</p>`
        const r = await api(`${API}/wifi/static/test`, { method: 'POST', body })
        if (!r.ok) {
          box.innerHTML = `<p class="help">${esc(WIFI_STATIC_ERRORS[r.body?.field] ?? (r.status === 409 ? 'Die Box ändert gerade die Adresse – gleich noch einmal' : 'Der Test ließ sich nicht ausführen'))}</p>`
          tested = null
          return null
        }
        if (r.body?.active === false) {
          // (the box left this network meanwhile: nothing was tested - saved without the switch, see the backend)
          box.innerHTML = `<p class="help">${esc('Die Box ist gerade nicht in diesem Netz – nichts zu testen. Die Adresse gilt, sobald sie wieder drin ist.')}</p>`
          tested = null
          return true
        }
        box.innerHTML = wifiTestHtml(r.body.checks ?? [])
        tested = { key: JSON.stringify(body), ok: (r.body.checks ?? []).every((c) => c.ok) }
        return tested.ok
      }
      const testBtn = sheet.querySelector('[data-test]')
      if (testBtn) testBtn.onclick = runTest
      sheet.querySelector('[data-save]').onclick = async () => {
        const body = mode === 'DHCP' ? { ssid: w.ssid, dhcp: true } : values()
        if (mode === 'DHCP' && !fixed) return close()
        if (w.active && mode !== 'DHCP') {
          // (in the network the box is in: tested first - with these values - and asked again when something failed)
          const ok = tested?.key === JSON.stringify(body) ? tested.ok : await runTest()
          if (ok === null) return
          if (!ok && !(await ask('Trotzdem speichern?', 'Beim Test ist etwas nicht gut gegangen (siehe Liste). Erreicht die Box mit der neuen Adresse ihren Router nicht, nimmt sie nach etwa 30 Sekunden wieder DHCP.', 'Trotzdem speichern'))) return
        }
        if (w.active) {
          const text = mode === 'DHCP' ? 'Die Box holt sich ihre Adresse wieder vom Router. Die App ist danach eventuell unter einer anderen Adresse erreichbar.' : `Die Box wechselt auf ${body.ip}. Erreicht sie dort ihren Router nicht, nimmt sie nach etwa 30 Sekunden wieder DHCP.`
          if (!(await ask('Adresse ändern?', text, 'Ändern'))) return
        }
        const r = await api(`${API}/wifi/static`, { method: 'POST', body })
        if (!r.ok) return toast(WIFI_STATIC_ERRORS[r.body?.field] ?? (r.status === 409 ? 'Die Box ändert gerade die Adresse – gleich noch einmal' : 'Nicht gespeichert'), 'info')
        close()
        if (r.body?.active && mode !== 'DHCP') {
          toast(`Gespeichert – die Box ist gleich unter ${body.ip} erreichbar`)
          // (the app opened by the old address: on to the new one)
          if (s.ip && location.hostname === s.ip && body.ip !== s.ip) setTimeout(() => location.assign(location.href.replace(s.ip, body.ip)), 9000)
        } else {
          toast(r.body?.active ? 'Gespeichert – die Box holt sich ihre Adresse vom Router' : 'Gespeichert')
        }
        // (the list shows the saved address at once - also for the network the box is in)
        await loadWlan().catch(() => undefined)
        if (currentPage()?.id === page.id) renderPage(page, false)
      }
    },
  )
}

const signalWord = (dbm) => (dbm >= -55 ? 'sehr gut' : dbm >= -67 ? 'gut' : dbm >= -75 ? 'mittel' : 'schwach')
// the signal as four bars (as the phone shows it)
const signalBars = (dbm) => {
  const n = !Number.isFinite(dbm) ? 0 : dbm >= -55 ? 4 : dbm >= -67 ? 3 : dbm >= -75 ? 2 : 1
  return `<span class="sig" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i${i <= n ? ' class="on"' : ''}></i>`).join('')}</span>`
}

function wlanTop() {
  const n = net.status ?? {}
  const row = (k, v) => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '')
  const dbm = Number.parseInt(String(n.wifisignal ?? ''), 10)
  const online = n.onlinestate === 'online'
  const name = n.wifi || (n.interface?.startsWith('eth') ? 'LAN-Kabel' : '')
  const scan = net.scan ?? []
  const inRange = new Map(scan.map((w) => [w.ssid, w.signal_dbm]))
  const saved = new Set((net.saved ?? []).map((w) => w.ssid))
  const pick = net.pick
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Verbindung</h2><button class="icon-btn soft" id="w-refresh" aria-label="Aktualisieren">${icon('sync', 18)}</button></div>
      <div class="wifi-now"><span class="avatar">${icon('wifi', 18)}</span><span class="lbl"><b translate="no">${esc(name || 'Nicht verbunden')}</b>
        <small>${Number.isFinite(dbm) ? `${signalBars(dbm)} Empfang ${signalWord(dbm)}` : ''}</small></span><span class="chip ${online ? 'ok' : 'warn'}">${online ? 'online' : 'offline'}</span></div>
      <dl class="kv">${row('IP-Adresse', n.ip)}${(Array.isArray(n.ipv6) ? n.ipv6 : []).map((a) => row('IPv6-Adresse', a)).join('')}</dl>
      <details class="more"><summary>Details</summary><dl class="kv">${row('Signal', n.wifisignal)}${row('Gateway', n.gateway)}${row('DNS', n.dns)}${row('MAC', n.mac)}</dl></details></section>`,
    `<section class="card" data-col="1"><h2>Gespeicherte Netze</h2>${
      net.reverted
        ? `<div class="note warn">${icon('info', 18)}<span>${esc(`Mit der festen Adresse hat die Box im Netz „${net.reverted.ssid}“ ihren Router nicht erreicht. Dort holt sie sich ihre Adresse jetzt wieder vom Router (DHCP).`)}</span><button class="btn sm" id="w-rev-ok">OK</button></div>`
        : ''
    }${
      net.saved
        ? net.saved.length
          ? `<div class="rows">${net.saved
              .map((w, i) => {
                const sig = inRange.get(w.ssid)
                const where = w.active ? 'verbunden' : sig !== undefined ? `in Reichweite · ${signalWord(sig)}` : net.scan ? 'nicht in Reichweite' : ''
                const fixed = net.fixed?.[w.ssid]
                // (the buttons in a group of their own: on a phone it goes below the name, see .wifi-net)
                return `<div class="entry wifi-net"><span class="avatar">${icon('wifi', 16)}</span><span class="lbl"><b translate="no">${esc(w.ssid)}</b>${where ? `<small>${sig !== undefined && !w.active ? signalBars(sig) : ''} ${esc(where)}</small>` : ''}${fixed ? `<small>${esc(fixed.paused ? `feste Adresse ${fixed.ip} pausiert` : `feste Adresse ${fixed.ip}`)}</small>` : ''}</span>
                  <span class="wifi-acts">${w.active ? '<span class="chip ok">aktiv</span>' : ''}<button class="btn sm" data-wip="${i}">Adresse</button>${w.active ? '' : `<button class="btn sm" data-wpw="${i}">Passwort</button><button class="btn danger sm" data-wrm="${i}">Entfernen</button>`}</span></div>`
              })
              .join('')}</div><p class="help" style="margin:0">Das verbundene Netz lässt sich nicht entfernen – die Box wäre sonst offline.</p>`
          : '<p class="help" style="margin:0">Keine.</p>'
        : '<p class="help" style="margin:0">Die gespeicherten Netze ließen sich nicht lesen.</p>'
    }</section>`,
    `<section class="card" data-col="2"><h2>Netz hinzufügen</h2>
      <div class="btns"><button class="btn${net.scan ? '' : ' primary'}" id="w-scan" ${net.scanning ? 'disabled' : ''}>${net.scanning ? '<span class="spin"></span>Suche läuft …' : net.scan ? 'Neu suchen' : 'Netze in Reichweite suchen'}</button></div>
      ${
        net.scan
          ? net.scan.length
            ? `<div class="rows">${net.scan
                .map(
                  (w, i) =>
                    `<button class="entry lib-row${pick === w.ssid ? ' picked' : ''}" data-w="${i}"><span class="avatar">${signalBars(w.signal_dbm)}</span><span class="lbl"><b translate="no">${esc(w.ssid)}</b><small>${esc(signalWord(w.signal_dbm))}${w.encrypted ? '' : ' · offen'}</small></span>${n.wifi === w.ssid ? '<span class="chip ok">verbunden</span>' : saved.has(w.ssid) ? '<span class="chip">gespeichert</span>' : ''}${w.encrypted ? `<span class="chev">${icon('lock', 16)}</span>` : ''}</button>`,
                )
                .join('')}</div>`
            : `<p class="help" style="margin:0">${net.scanFailed ? 'Die Suche hat nicht geklappt – bitte noch einmal.' : 'Keine Netze gefunden.'}</p>`
          : ''
      }
      <div class="wifi-form" id="w-form"${pick ? '' : ' hidden'}>
        <div class="field"><label for="w-pw">Passwort <span class="lbl-sub" id="w-pick" translate="no">${esc(pick ?? '')}</span></label><div class="input-wrap"><input class="input has-eye" id="w-pw" type="password" maxlength="63" autocomplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore="true"><button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div>
          <small id="w-pw-hint">8–63 Zeichen, leer bei einem offenen Netz.</small></div>
        <div class="btns"><button class="btn primary" id="w-add">${net.pwChange ? 'Passwort ändern' : 'Hinzufügen'}</button></div></div>
      <details class="more" id="w-hidden"><summary>Verstecktes Netz eingeben</summary>
        <div class="field"><label for="w-ssid">Netzname (SSID)</label><input class="input" id="w-ssid" maxlength="32" ${NO_PW_MANAGER}></div>
        <div class="field"><label for="w-pw2">Passwort</label><div class="input-wrap"><input class="input has-eye" id="w-pw2" type="password" maxlength="63" autocomplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore="true"><button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div><small>8–63 Zeichen, leer bei einem offenen Netz.</small></div>
        <div class="btns"><button class="btn primary" id="w-add2">Hinzufügen</button></div></details>
      <p class="help" style="margin:0">Die Box bleibt im aktuellen Netz und nimmt das neue, wenn es in Reichweite und besser ist.</p></section>`,
  ]
}

function mountWlan(root, page) {
  const again = async (text, kind) => {
    if (text) toast(text, kind)
    await loadWlan().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  $('#w-refresh', root).onclick = () => again('Aktualisiert')
  $('#w-scan', root).onclick = async () => {
    net.scanning = true
    renderPage(page, false)
    const r = await api(`${API}/wifi/scan`)
    net.scanning = false
    net.scan = r.ok ? r.body?.networks ?? [] : []
    // (a failed search is no "no networks")
    net.scanFailed = !r.ok
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  // a network of the list: its password next (an open one needs none)
  for (const b of root.querySelectorAll('[data-w]')) {
    b.onclick = () => {
      const w = net.scan[Number(b.dataset.w)]
      net.pick = w.ssid
      net.pwChange = false
      $('#w-add', root).textContent = 'Hinzufügen'
      for (const x of root.querySelectorAll('[data-w]')) x.classList.toggle('picked', x === b)
      $('#w-pick', root).textContent = w.ssid
      $('#w-form', root).hidden = false
      $('#w-pw', root).hidden = !w.encrypted
      $('#w-pw-hint', root).textContent = w.encrypted ? '8–63 Zeichen.' : 'Ein offenes Netz – ohne Passwort.'
      if (w.encrypted) $('#w-pw', root).focus()
    }
  }
  // a saved network's new password (the router got a new one)
  for (const b of root.querySelectorAll('[data-wip]')) b.onclick = () => openWifiAddress(net.saved[Number(b.dataset.wip)], page)
  const revOk = $('#w-rev-ok', root)
  if (revOk) {
    revOk.onclick = async () => {
      await api(`${API}/wifi/static/seen`, { method: 'POST' })
      net.reverted = null
      renderPage(page, false)
    }
  }
  for (const b of root.querySelectorAll('[data-wpw]')) {
    b.onclick = () => {
      const w = net.saved[Number(b.dataset.wpw)]
      net.pick = w.ssid
      net.pwChange = true
      $('#w-pick', root).textContent = w.ssid
      $('#w-pw', root).hidden = false
      $('#w-pw-hint', root).textContent = 'Das neue Passwort des Netzes, 8–63 Zeichen.'
      $('#w-add', root).textContent = 'Passwort ändern'
      $('#w-form', root).hidden = false
      $('#w-pw', root).focus()
      $('#w-form', root).scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }
  const add = async (ssid, password) => {
    if (!ssid.trim()) return toast('Bitte den Netznamen eintragen', 'info')
    if (password && (password.length < 8 || password.length > 63)) return toast('Das Passwort hat 8 bis 63 Zeichen', 'info')
    const r = await api(`${API}/wifi/add`, { method: 'POST', body: { ssid, password } })
    if (!r.ok) return toast(r.body?.error ?? 'Das hat nicht geklappt', 'info')
    net.pick = null
    setTimeout(() => again(), 8000)
    toast(`„${ssid}“ wird eingetragen`)
    renderPage(page, false)
  }
  $('#w-add', root).onclick = async () => {
    if (!net.pwChange) return add(net.pick ?? '', $('#w-pw', root).value)
    const password = $('#w-pw', root).value
    if (password.length < 8 || password.length > 63) return toast('Das Passwort hat 8 bis 63 Zeichen', 'info')
    const r = await api(`${API}/wifi/password`, { method: 'POST', body: { ssid: net.pick, password } })
    if (!r.ok) return toast(r.body?.error === 'connected_network' ? 'Das verbundene Netz lässt sich hier nicht ändern' : 'Das hat nicht geklappt', 'info')
    toast(`Neues Passwort für „${net.pick}“ gespeichert`)
    net.pick = null
    net.pwChange = false
    renderPage(page, false)
  }
  $('#w-add2', root).onclick = () => add($('#w-ssid', root).value, $('#w-pw2', root).value)
  for (const b of root.querySelectorAll('[data-wrm]')) {
    const w = net.saved[Number(b.dataset.wrm)]
    b.onclick = () =>
      confirmSheet('Entfernen', `Das Netz „${w.ssid}“ vergessen? Die Box verbindet sich dann nicht mehr damit.`, async () => {
        const r = await api(`${API}/wifi/remove`, { method: 'POST', body: { ssid: w.ssid } })
        again(r.ok ? 'Entfernt' : r.body?.error ?? 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      })
  }
}

/* Freigaben & Fernzugriff */

async function loadShares() {
  const r = await api(`${API}/shares`)
  if (!r.ok) throw new Error(`shares ${r.status}`)
  net.shares = r.body
  for (const k of ['samba', 'ftp', 'vnc']) state.values.set(k, r.body[k].active)
}

/* Telegram */

async function loadTelegram() {
  const r = await api(`${API}/telegram-config`)
  if (!r.ok) throw new Error(`telegram ${r.status}`)
  net.tg = { ...r.body, chatIds: [...(r.body.chatIds ?? [])] }
}

// The bot's commands a parent uses most (the whole list: /command in Telegram, see telegram_i18n.py)
const TG_COMMANDS = [
  ['/help', 'die wichtigsten Befehle als Knöpfe'],
  ['/status', 'Spielzeit und Ruhezeiten jetzt'],
  ['/extend 30', 'Bonus-Minuten für heute'],
  ['/release 60', 'alle Sperren für eine Weile aufheben'],
  ['/quietnow 60', 'Wiedergabe für eine Weile sperren'],
  ['/pause', 'Wiedergabe anhalten'],
  ['/vol 40', 'Lautstärke setzen (0–100)'],
  ['/sag Text', 'Durchsage: die Box sagt den Text'],
  ['/login', 'Link zu dieser App'],
  ['/command', 'alle Befehle'],
]

function tgTop() {
  const t = net.tg
  const sw = (id, label, help, on) =>
    `<div class="row"><span class="lbl"><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`
  // the token: once set, only a button to change it (the field comes on the click)
  const tokenField = `<div class="field" id="tg-token-field"${t.token_configured ? ' hidden' : ''}><label for="tg-token">${t.token_configured ? 'Neuer Token' : 'Bot-Token'}</label><div class="input-wrap"><input class="input mono has-eye" id="tg-token" type="password" ${NO_PW_MANAGER} placeholder="123456789:AA…"><button type="button" class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div>
      <small>Den Token bekommst du bei @BotFather in Telegram (/newbot).</small></div>`
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Eltern-Bot</h2><span class="chip ${t.active ? 'ok' : ''}">${t.active ? 'aktiv' : 'aus'}</span></div>
      ${sw('tg-on', 'Bot aktiv', 'Steuern und Nachfragen per Telegram.', t.active)}
      ${sw('tg-report', 'Wiedergabe melden', 'Schickt jeden Start, Titel und Stopp – meist zu viel.', t.notifyPlayback)}
      ${sw('tg-week', 'Wochenrückblick', 'Sonntagabend: wie lange und was die Woche über gehört wurde.', t.weeklySummary)}
      <div class="row"><span class="lbl"><b>Bot-Token</b><small>${t.token_configured ? '✓ Eingerichtet' : 'Fehlt noch'}</small></span>${t.token_configured ? '<button class="btn sm" id="tg-token-edit">Ändern</button>' : ''}</div>
      ${tokenField}
      <div class="btns"><button class="btn" id="tg-test" ${t.token_configured && t.chatIds.length ? '' : 'disabled'}>${icon('tg', 18)}Testnachricht senden</button></div></section>`,
    `<section class="card" data-col="2"><h2>Erlaubte Chats</h2><p class="help">Nur diese Chats dürfen den Bot steuern.</p>
      ${
        t.chatIds.length
          ? `<div class="rows">${t.chatIds.map((c, i) => `<div class="entry"><span class="avatar">${icon('tg', 16)}</span><span class="lbl"><b${c.label ? ' translate="no"' : ''}>${esc(c.label || 'Ohne Namen')}</b><small>${esc(c.id)}</small></span><button class="btn danger sm" data-tgrm="${i}">Entfernen</button></div>`).join('')}</div>`
          : '<p class="help" style="margin:0">Noch keiner – ohne erlaubten Chat antwortet der Bot niemandem.</p>'
      }
      <div class="pair keep" style="--cols:1fr 1fr"><div class="field"><label for="tg-id">Chat-ID</label><input class="input mono" id="tg-id" ${NO_PW_MANAGER} inputmode="numeric"></div><div class="field"><label for="tg-name">Name</label><input class="input" id="tg-name" maxlength="60" ${NO_PW_MANAGER}></div></div>
      <div class="btns"><button class="btn" id="tg-add">${icon('plus', 18)}Hinzufügen</button><button class="btn" id="tg-detect" ${t.token_configured ? '' : 'disabled'}>Chat-ID ermitteln</button></div></section>`,
    `<div class="btns save-bar wide"><button class="btn primary" id="tg-save">Speichern</button></div>`,
    `<section class="card wide"><h2>Befehle</h2><p class="help">Im Chat mit dem Bot, z. B.:</p>
      <dl class="cmds cols2">${TG_COMMANDS.map(([c, d]) => `<div><dt translate="no">${esc(c)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></section>`,
  ]
}

function mountTelegram(root, page) {
  const redraw = () => currentPage()?.id === page.id && renderPage(page, false)
  $('#tg-token-edit', root)?.addEventListener('click', (e) => {
    $('#tg-token-field', root).hidden = false
    e.target.hidden = true
    $('#tg-token', root).focus()
  })
  $('#tg-test', root).onclick = async () => {
    const r = await api(`${API}/telegram/test`, { method: 'POST', body: {} })
    // (with the saved settings: the bot switched on, its token and a chat saved)
    toast(r.status === 409 ? 'Erst Bot aktiv, Token und einen Chat speichern' : r.body?.ok ? 'Testnachricht geschickt – kam sie an?' : 'Das ging nicht', r.body?.ok ? 'ok' : 'info')
  }
  $('#tg-on', root).onchange = (e) => (net.tg.active = e.target.checked)
  $('#tg-report', root).onchange = (e) => (net.tg.notifyPlayback = e.target.checked)
  $('#tg-week', root).onchange = (e) => (net.tg.weeklySummary = e.target.checked)
  for (const b of root.querySelectorAll('[data-tgrm]')) {
    b.onclick = () => {
      net.tg.chatIds.splice(Number(b.dataset.tgrm), 1)
      redraw()
      toast('Entfernt – noch speichern', 'info')
    }
  }
  const addChat = (id, label) => {
    if (!/^-?\d{1,20}$/.test(id)) return toast('Eine Chat-ID besteht aus Ziffern (Gruppen mit Minus davor)', 'info')
    if (net.tg.chatIds.some((c) => c.id === id)) return toast('Diesen Chat gibt es schon', 'info')
    net.tg.chatIds.push({ id, label: label.slice(0, 60) })
    redraw()
    toast('Hinzugefügt – noch speichern', 'info')
  }
  $('#tg-add', root).onclick = () => addChat($('#tg-id', root).value.trim(), $('#tg-name', root).value.trim())
  $('#tg-detect', root).onclick = () => {
    openSheet(
      `<h2>Chat-ID ermitteln</h2><p class="help" style="margin:0">Schreib dem Bot jetzt in Telegram eine Nachricht (z. B. „Hallo“). Die Box wartet bis zu 40 Sekunden darauf; der Bot ist so lange kurz aus.</p>
       <div class="loading" id="tg-wait"><p>Warte auf eine Nachricht …</p></div><div id="tg-res"></div>
       <div class="btns"><button class="btn" data-close>Schließen</button></div>`,
      async (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        const r = await api(`${API}/telegram/detect-chats`, { method: 'POST', body: {} })
        const wait = sheet.querySelector('#tg-wait')
        if (wait) wait.remove()
        const chats = r.body?.chats ?? []
        const box = sheet.querySelector('#tg-res')
        if (!box) return
        box.innerHTML = chats.length
          ? `<div class="rows">${chats.map((c, i) => `<div class="entry"><span class="lbl"><b${c.label ? ' translate="no"' : ''}>${esc(c.label || 'Ohne Namen')}</b><small>${esc(c.id)}</small></span><button class="btn sm" data-found="${i}">Übernehmen</button></div>`).join('')}</div>`
          : `<p class="help">${r.ok ? 'Keine Nachricht angekommen. Noch einmal versuchen?' : 'Das ging nicht.'}</p>`
        for (const b of box.querySelectorAll('[data-found]')) {
          b.onclick = () => {
            const c = chats[Number(b.dataset.found)]
            close()
            addChat(c.id, c.label)
          }
        }
      },
    )
  }
  $('#tg-save', root).onclick = async () => {
    const token = $('#tg-token', root).value.trim()
    if (token && !/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(token)) return toast('Der Token sieht nicht richtig aus (Zahl:Buchstaben)', 'info')
    const body = { active: net.tg.active, notifyPlayback: net.tg.notifyPlayback, weeklySummary: net.tg.weeklySummary, chatIds: net.tg.chatIds, ...(token ? { token } : {}) }
    const r = await api(`${API}/telegram-config`, { method: 'POST', body })
    if (!r.ok) {
      const why = {
        token_missing: 'Zum Einschalten braucht der Bot einen Token.',
        chat_missing: 'Zum Einschalten braucht der Bot mindestens einen erlaubten Chat.',
        invalid_token: 'Der Token sieht nicht richtig aus (Zahl:Buchstaben)',
        invalid_chat_id: 'Eine Chat-ID besteht aus Ziffern (Gruppen mit Minus davor)',
      }[r.body?.error]
      return toast(why ?? 'Nicht gespeichert', 'info')
    }
    toast(net.tg.active ? 'Gespeichert – der Bot startet neu' : 'Gespeichert – der Bot ist aus')
    await loadTelegram().catch(() => undefined)
    redraw()
  }
}

/* MQTT */

const MQTT_KEYS = [
  ['mqttOn', 'active'],
  ['mqName', 'name'],
  ['mqBroker', 'broker'],
  ['mqPort', 'port'],
  ['mqTopic', 'topic'],
  ['mqClient', 'clientId'],
  ['mqUser', 'username'],
  ['mqRef', 'refresh'],
  ['mqIdle', 'refreshIdle'],
  ['mqTo', 'timeout'],
  ['haOn', 'haActive'],
  ['haTopic', 'haTopic'],
]

// the example of the box's configuration template: shown as an empty field with a hint, not as a real broker
const MQTT_EXAMPLE_BROKER = 'mqtt-example-broker.com'

async function loadMqtt() {
  const r = await api(`${API}/mqtt`)
  if (!r.ok) throw new Error(`mqtt ${r.status}`)
  net.mqtt = r.body
  for (const [key, field] of MQTT_KEYS) state.values.set(key, r.body[field])
  if (r.body.broker === MQTT_EXAMPLE_BROKER) state.values.set('mqBroker', '')
  state.values.set('mqPw', '')
}

// One of the topics the box sends to, from what is typed (scripts/mqtt/mqtt.py: topic/client-id/state …)
function mqttTopicPreview() {
  const t = String(state.values.get('mqTopic') ?? '').trim() || '…'
  const c = String(state.values.get('mqClient') ?? '').trim() || '…'
  return `z. B. ${t}/${c}/state`
}

/* WLED */

const WLED_BAUD = ['300', '1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']

async function loadWled() {
  const r = await api(`${API}/wled`)
  if (!r.ok) throw new Error(`wled ${r.status}`)
  net.wled = r.body
}

function wledTop() {
  const w = net.wled
  const sw = (id, label, on, help = '', extra = '') =>
    `<div class="row"><span class="lbl"><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span>${extra}<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`
  // a preset: the WLED device's list when it answered, else its number
  const preset = (id, value, label = '') =>
    w.presets.length
      ? `<select class="input" id="${id}" aria-label="${esc(label || 'Preset')}"><option value="">–</option>${w.presets.map((p) => `<option value="${esc(p.id)}"${p.id === value ? ' selected' : ''}>${esc(`${p.id} · ${p.name}`)}</option>`).join('')}</select>`
      : `<input class="input" id="${id}" inputmode="numeric" maxlength="3" value="${esc(value)}" placeholder="Nr." aria-label="${esc(label || 'Preset')}">`
  const pct = (v) => Math.round((v / 255) * 100)
  const slider = (id, label, v) =>
    `<div class="field"><div class="slider-head"><label for="${id}">${label}</label><span class="value-pill" id="${id}-out">${pct(v)} %</span></div><input type="range" id="${id}" min="0" max="255" value="${v}" style="--fill:${(v / 255) * 100}%"></div>`
  const dev = w.device
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Verbindung</h2><span class="chip ${dev ? 'ok' : 'warn'}">${dev ? 'verbunden' : 'kein Gerät'}</span></div>
      <div class="status-line"><span class="dot ${dev ? 'ok' : 'warn'}"></span><span>${dev ? esc([dev.name, dev.version && `Version ${dev.version}`, dev.ip].filter(Boolean).join(' · ')) : 'Kein WLED-Gerät hat geantwortet. Speichern geht trotzdem.'}</span>${dev ? '' : '<button class="btn sm" id="wl-retry">Erneut suchen</button>'}</div>
      ${sw('wl-on', 'WLED aktiv', w.active, 'Die LEDs zeigen, was die Box tut.')}
      <div class="pair keep" style="--cols:3fr 2fr"><div class="field"><label for="wl-port">Schnittstelle</label><input class="input mono" id="wl-port" value="${esc(w.port || '/dev/ttyUSB0')}" ${NO_PW_MANAGER}></div>
        <div class="field"><label for="wl-baud">Baudrate</label><select class="input" id="wl-baud">${WLED_BAUD.map((b) => `<option${b === w.baud ? ' selected' : ''}>${b}</option>`).join('')}</select></div></div></section>`,
    `<section class="card" data-col="2"><h2>Presets</h2>
      <div class="row"><span class="lbl"><b>Im normalen Betrieb</b></span><span class="mini-field">${preset('wl-main', w.mainId, 'Im normalen Betrieb')}</span></div>
      ${sw('wl-booton', 'Beim Start', w.bootActive, 'ein eigenes Preset', `<span class="mini-field" data-show="wl-booton"${w.bootActive ? '' : ' hidden'}>${preset('wl-boot', w.bootId, 'Beim Start')}</span>`)}
      ${sw('wl-offon', 'Beim Ausschalten', w.shutdownActive, 'ein eigenes Preset', `<span class="mini-field" data-show="wl-offon"${w.shutdownActive ? '' : ' hidden'}>${preset('wl-off', w.shutdownId, 'Beim Ausschalten')}</span>`)}</section>`,
    `<section class="card" data-col="1"><h2>Helligkeit</h2>${slider('wl-bright', 'Normal', w.brightness)}${slider('wl-dim', 'Gedimmt', w.dimmed)}</section>`,
    `<div class="save-card wide"><span>${esc(w.device ? 'Verbindung, Presets und Helligkeit – gehen beim Speichern auch an das WLED-Gerät.' : 'Verbindung, Presets und Helligkeit.')}</span><button class="btn primary" id="wl-save">Speichern</button></div>`,
  ]
}

function mountWled(root, page) {
  for (const id of ['wl-bright', 'wl-dim']) {
    const el = $(`#${id}`, root)
    el.oninput = () => {
      el.style.setProperty('--fill', `${(el.value / 255) * 100}%`)
      $(`#${id}-out`, root).textContent = `${Math.round((el.value / 255) * 100)} %`
    }
  }
  // the preset of a switch only while it is on
  for (const id of ['wl-booton', 'wl-offon']) $(`#${id}`, root).addEventListener('change', (e) => ($(`[data-show="${id}"]`, root).hidden = !e.target.checked))
  $('#wl-retry', root)?.addEventListener('click', async () => {
    await loadWled().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
    toast(net.wled?.device ? 'WLED-Gerät gefunden' : 'Wieder keine Antwort', net.wled?.device ? 'ok' : 'info')
  })
  $('#wl-save', root).onclick = async () => {
    const v = (id) => $(`#${id}`, root).value.trim()
    const body = {
      active: $('#wl-on', root).checked,
      port: v('wl-port'),
      baud: v('wl-baud'),
      mainId: v('wl-main'),
      bootActive: $('#wl-booton', root).checked,
      bootId: v('wl-boot'),
      shutdownActive: $('#wl-offon', root).checked,
      shutdownId: v('wl-off'),
      brightness: Number(v('wl-bright')),
      dimmed: Number(v('wl-dim')),
    }
    if (!/^\/dev\/tty[A-Za-z0-9]+$/.test(body.port)) return toast('Die Schnittstelle sieht aus wie /dev/ttyUSB0', 'info')
    const r = await api(`${API}/wled`, { method: 'POST', body })
    if (!r.ok) return toast(r.body?.error ?? 'Nicht gespeichert', 'info')
    toast(`Gespeichert${r.body?.device ? ' – auch im WLED-Gerät' : ''}`)
    await loadWled().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
}

/* Einstellungen › Sicherheit: one password for the app and the admin interface, "Anmeldung verlangen" */

const sec = { st: null }

async function loadAuthState() {
  const [r, list] = await Promise.all([api(`${API}/auth-state`), api(`${API}/auth/sessions`)])
  if (!r.ok) throw new Error(`auth-state ${r.status}`)
  sec.st = r.body
  // (the devices signed in: from the box's sessions; an older box has no list - then only their number)
  sec.sessions = list.ok && Array.isArray(list.body?.sessions) ? list.body.sessions : null
}

// "vor 2 Stunden", "gestern", "am 12.9."
function agoText(ts) {
  const min = Math.round((Date.now() - Date.parse(ts)) / 60000)
  if (!Number.isFinite(min)) return ''
  if (min < 2) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  if (min < 24 * 60) return `vor ${Math.round(min / 60)} h`
  if (min < 48 * 60) return 'gestern'
  return `am ${new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' })}`
}

// the devices listed by name (the last used); the others only counted
const SESSIONS_SHOWN = 6

function securityTop() {
  const st = sec.st
  const eye = `<button class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button>`
  const sessions = sec.sessions
  const devices = sessions
    ? `<div class="rows">${sessions
        .slice(0, SESSIONS_SHOWN)
        .map(
          (x) =>
            `<div class="entry"><span class="avatar">${icon(/iphone|android|ipad/i.test(x.device ?? '') ? 'mobile' : 'display', 16)}</span><span class="lbl"><b>${esc(x.device || 'Unbekanntes Gerät')}</b><small>${esc([x.current ? 'dieses Gerät' : '', x.kept ? 'bleibt angemeldet' : '', x.lastSeen ? `zuletzt ${agoText(x.lastSeen)}` : ''].filter(Boolean).join(' · '))}</small></span>${x.current ? '<span class="chip ok">dieses Gerät</span>' : `<button class="btn sm" data-sec-out="${esc(x.id)}">Abmelden</button>`}</div>`,
        )
        .join('')}</div>${sessions.length > SESSIONS_SHOWN ? `<p class="help" style="margin:0">${esc(sessions.length - SESSIONS_SHOWN === 1 ? 'Dazu eine ältere Anmeldung.' : `Dazu ${sessions.length - SESSIONS_SHOWN} ältere Anmeldungen.`)}</p>` : ''}`
    : `<p class="help">${st.keptDevices ? (st.keptDevices === 1 ? '1 Gerät bleibt angemeldet („Angemeldet bleiben“).' : `${st.keptDevices} Geräte bleiben angemeldet („Angemeldet bleiben“).`) : 'Kein Gerät bleibt dauerhaft angemeldet.'}</p>`
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Passwort</h2><span class="chip ${st.passwordSet && !st.defaultPassword ? 'ok' : 'warn'}">${st.passwordSet ? (st.defaultPassword ? 'Standardpasswort' : 'gesetzt') : 'nicht gesetzt'}</span></div>
      <p class="help">Ein Passwort für diese App und das bisherige Admin-Interface.</p>
      ${st.defaultPassword ? `<div class="note warn">${icon('info', 18)}<span>Es gilt noch das Standardpasswort, das im Admin-Interface steht. Bitte ein eigenes festlegen.</span></div>` : ''}
      ${st.resetOpen ? `<div class="note">${icon('info', 18)}<span>Du bist über den QR-Code oder Telegram hereingekommen: Ein paar Minuten lang geht ein neues Passwort ohne das alte.</span></div>` : ''}
      ${st.passwordSet && !st.resetOpen ? `<div class="field"><label for="sec-cur">Aktuelles Passwort</label><div class="input-wrap"><input class="input has-eye" id="sec-cur" type="password" autocomplete="current-password">${eye}</div></div>` : ''}
      <div class="field"><label for="sec-new">Neues Passwort</label><div class="input-wrap"><input class="input has-eye" id="sec-new" type="password" autocomplete="new-password"><button class="eye" id="sec-eye2" aria-label="Anzeigen">${icon('eye', 18)}</button></div><small id="sec-len">Mindestens 6 Zeichen.</small></div>
      <div class="field"><label for="sec-new2">Neues Passwort wiederholen</label><input class="input" id="sec-new2" type="password" autocomplete="new-password"><small id="sec-match"></small></div>
      <p class="help" style="margin:0">Ein neues Passwort meldet alle anderen Geräte ab.</p>
      <div class="btns"><button class="btn primary" id="sec-save" disabled>${st.passwordSet ? 'Passwort ändern' : 'Passwort festlegen'}</button></div>
      <details class="more"><summary>Passwort vergessen?</summary><p class="help" style="margin:0">${esc('Über den QR-Code am Display (die Status-Symbole oben lange drücken) oder /login beim Telegram-Bot kommst du ohne Passwort in die App. Danach lässt sich hier 10 Minuten lang ein neues Passwort ohne das alte festlegen.')}</p></details></section>`,
    `<section class="card" data-col="2"><div class="card-head"><h2>Anmeldung</h2><span class="chip ${st.loginRequired ? 'ok' : 'warn'}">${st.loginRequired ? 'an' : 'aus'}</span></div>
      <div class="row"><span class="lbl"><b>Anmeldung verlangen</b><small>Der QR-Code am Display und der Telegram-Link gehen immer.</small></span>
        <label class="switch"><input type="checkbox" id="sec-login" ${st.loginSwitch ? 'checked' : ''} ${st.passwordSet ? '' : 'disabled'} aria-label="Anmeldung verlangen"><span></span></label></div>
      ${st.passwordSet ? '' : '<p class="help" style="margin:0">Erst ein Passwort festlegen, dann lässt sich die Anmeldung einschalten.</p>'}
      ${st.loginRequired ? '<div class="status-line"><span class="dot ok"></span><span>Die App fragt im Heimnetz nach dem Passwort.</span></div>' : `<div class="note warn">${icon('info', 18)}<span>Jeder im Heimnetz kann die App ohne Passwort bedienen.</span></div>`}</section>`,
    `<section class="card" data-col="2"><h2>Angemeldete Geräte</h2>${devices}
      <div class="btns"><button class="btn danger" id="sec-others">Alle anderen abmelden</button></div></section>`,
  ]
}

function mountSecurity(root, page) {
  for (const b of root.querySelectorAll('[data-eye]')) {
    b.onclick = () => {
      const i = b.parentElement.querySelector('input')
      i.type = i.type === 'password' ? 'text' : 'password'
    }
  }
  // the new password's eye shows both new fields
  $('#sec-eye2', root).onclick = () => {
    const show = $('#sec-new', root).type === 'password'
    for (const id of ['sec-new', 'sec-new2']) $(`#${id}`, root).type = show ? 'text' : 'password'
  }
  // checked while typing: long enough, both the same - the button only then
  const check = () => {
    const a = $('#sec-new', root).value
    const b = $('#sec-new2', root).value
    const len = $('#sec-len', root)
    len.textContent = a && a.length < 6 ? `Noch ${6 - a.length} Zeichen` : 'Mindestens 6 Zeichen.'
    len.classList.toggle('err', !!a && a.length < 6)
    const m = $('#sec-match', root)
    m.textContent = b ? (a === b ? '✓ Stimmt überein' : 'Stimmt nicht überein') : ''
    m.className = b && a !== b ? 'err' : ''
    $('#sec-save', root).disabled = !(a.length >= 6 && a === b)
  }
  for (const id of ['sec-new', 'sec-new2']) $(`#${id}`, root).addEventListener('input', check)
  for (const b of root.querySelectorAll('[data-sec-out]')) {
    b.onclick = async () => {
      const r = await api(`${API}/auth/sign-out`, { method: 'POST', body: { id: b.dataset.secOut } })
      toast(r.ok ? 'Abgemeldet' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      await loadAuthState()
      renderPage(page, false)
    }
  }
  $('#sec-save', root).onclick = async () => {
    const current = $('#sec-cur', root)?.value ?? ''
    const password = $('#sec-new', root).value
    if (password.length < 6) return toast('Das neue Passwort braucht mindestens 6 Zeichen', 'info')
    if (password !== $('#sec-new2', root).value) return toast('Die beiden neuen Passwörter sind verschieden', 'info')
    const r = await api(`${API}/auth/password`, { method: 'POST', body: { current, password } })
    if (!r.ok) return toast(r.body?.error === 'wrong_password' ? 'Das aktuelle Passwort stimmt nicht' : r.status === 429 ? 'Zu viele Versuche – bitte kurz warten' : 'Nicht gespeichert', 'info')
    toast('Passwort gespeichert – es gilt auch im Admin-Interface')
    await loadAuthState()
    renderPage(page, false)
  }
  $('#sec-others', root).onclick = () =>
    confirmSheet('Abmelden', 'Alle anderen Geräte abmelden – auch die mit „Angemeldet bleiben“? Dieses Gerät bleibt angemeldet.', async () => {
      const r = await api(`${API}/auth/sign-out-others`, { method: 'POST', body: {} })
      if (!r.ok) return toast('Das hat nicht geklappt', 'info')
      toast(r.body?.ended ? `${r.body.ended} Anmeldungen beendet` : 'Es war kein anderes Gerät angemeldet')
      await loadAuthState()
      renderPage(page, false)
    })
  $('#sec-login', root).onchange = async (e) => {
    const required = e.target.checked
    if (!(await ask(required ? 'Anmeldung einschalten' : 'Anmeldung ausschalten', required ? 'Die App und das Admin-Interface fragen dann nach dem Passwort.' : 'Dann kommt jeder im Heimnetz ohne Passwort in die App und das Admin-Interface.', required ? 'Einschalten' : 'Ausschalten'))) {
      e.target.checked = !required
      return
    }
    const r = await api(`${API}/auth/login-required`, { method: 'POST', body: { required } })
    if (!r.ok) {
      e.target.checked = !required
      return toast(r.body?.error === 'wrong_password' ? 'Das Passwort stimmt nicht' : r.status === 429 ? 'Zu viele Versuche – bitte kurz warten' : 'Nicht gespeichert', 'info')
    }
    toast(required ? 'Anmeldung eingeschaltet' : 'Anmeldung ausgeschaltet')
    await loadAuthState()
    renderPage(page, false)
  }
}

/* Einstellungen › Sicherheit › Verschlüsselung (HTTPS): the box's certificate (eltern/tls.ts, tls_cert.sh) - to
   install on the phones (then https shows no warning, and Android installs the app), "Nur sichere Verbindung", the
   address for links, an own certificate */

const tlsState = { st: null, trust: null }

async function loadTls() {
  const r = await api(`${API}/tls`)
  if (!r.ok) throw new Error(`tls ${r.status}`)
  tlsState.st = r.body
  tlsState.trust = null
}

// Whether this device reaches the box by https without a warning: a request to it fails when the certificate is not
// trusted (no-cors: only whether the connection itself worked)
async function checkTlsTrust(host) {
  try {
    await fetch(`https://${host}/api/app/auth-info`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) })
    return true
  } catch {
    return false
  }
}

// The device the app runs on: its guide is the one shown open
const devicePlatform = () => {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : ''
}

// How to install the box's certificate, per system
const TLS_GUIDES = [
  ['android', 'Android', ['„Zertifikat laden“ tippen – die Datei landet in „Downloads“.', 'Einstellungen › Sicherheit › Weitere Einstellungen › Verschlüsselung & Anmeldedaten › Zertifikat installieren › CA-Zertifikat (je nach Handy leicht anders benannt), den Hinweis bestätigen und die Datei wählen.', 'In Chrome die App über https öffnen und im Menü „App installieren“ wählen.']],
  ['ios', 'iPhone / iPad', ['In Safari „Zertifikat laden“ tippen und „Zulassen“.', 'Einstellungen › Allgemein › VPN und Geräteverwaltung › das MuPiBox-Profil › Installieren.', 'Einstellungen › Allgemein › Info › Zertifikatsvertrauenseinstellungen › das MuPiBox-Zertifikat einschalten.', 'Die App über https in Safari öffnen › Teilen › „Zum Home-Bildschirm“.']],
  ['win', 'Windows', ['„Zertifikat laden“ und die Datei öffnen › „Zertifikat installieren …“.', '„Alle Zertifikate in folgendem Speicher speichern“ › „Vertrauenswürdige Stammzertifizierungsstellen“ › Fertig stellen.', 'Den Browser neu starten. (Firefox hat eigene Zertifikate: Einstellungen › Datenschutz & Sicherheit › Zertifikate anzeigen › Zertifizierungsstellen › Importieren.)']],
  ['mac', 'Mac', ['„Zertifikat laden“ und die Datei öffnen – die Schlüsselbundverwaltung geht auf.', 'Das MuPiBox-Zertifikat doppelklicken › „Vertrauen“ › „Bei Verwendung dieses Zertifikats“: „Immer vertrauen“.', 'Den Browser neu laden.']],
]

function tlsTop() {
  const st = tlsState.st
  const c = st.cert
  const host = st.linkHost || location.hostname
  const httpsApp = `https://${host}/app/`
  const custom = st.mode === 'custom'
  const trust = tlsState.trust
  const onHttps = location.protocol === 'https:'
  const platform = devicePlatform()
  const months = c ? Math.round((Date.parse(c.validTo) - Date.now()) / (30.4 * 86400e3)) : null
  const now =
    trust === null
      ? `<span class="spin"></span><span>Prüfe, ob dieses Gerät der Box vertraut …</span>`
      : trust && onHttps
        ? `<span class="dot ok"></span><span><b>Dieses Gerät ist sicher verbunden</b> – über https, ohne Warnung.</span>`
        : trust
          ? `<span class="dot ok"></span><span><b>Dieses Gerät vertraut der Box.</b> Die App ist gerade noch über http offen.</span><a class="btn sm" href="${esc(httpsApp)}">${icon('lock', 16)}Über https öffnen</a>`
          : `<span class="dot warn"></span><span><b>Dieses Gerät vertraut der Box noch nicht.</b> ${custom ? '' : 'Einmal das Zertifikat installieren, dann warnt der Browser nicht mehr.'}</span>${custom ? '' : `<a class="btn sm primary" href="${API}/tls/ca.crt" download>${icon('save', 16)}Zertifikat laden</a>`}`
  const step = (n, done, title, body) => `<li class="${done ? 'done' : ''}"><span class="num">${done ? icon('check', 14) : n}</span><div><b>${esc(title)}</b>${body}</div></li>`
  const names = [...new Set([...(c?.names ?? []), ...(st.boxNames ?? [])])].filter((n) => n !== '127.0.0.1' && n !== 'localhost')
  return [
    `<section class="card wide tls-now"><div class="status-line">${now}</div></section>`,
    `<section class="card" data-col="1"><div class="card-head"><h2>Zertifikat</h2><span class="chip ok">${custom ? 'eigenes' : 'der Box'}</span></div>
      ${spKv([
        c && ['Gilt für', c.names.join(', ')],
        c && ['Gültig bis', `${new Date(c.validTo).toLocaleDateString(LOCALE)}${months != null && months >= 1 ? ` · noch ${months} ${months === 1 ? 'Monat' : 'Monate'}` : ''}`],
        c && custom && ['Aussteller', c.issuer.replace(/\n/g, ', ')],
      ])}
      <p class="help" style="margin:0">${esc(custom ? 'Die Box erinnert vor dem Ablauf. Ein neues Zertifikat unten wieder hochladen.' : 'Die Box erneuert es selbst rechtzeitig. Auf den Geräten muss dafür nichts neu installiert werden.')}</p>
      ${custom && !st.coversBox ? `<div class="note warn">${icon('info', 18)}<span>${esc('Das Zertifikat gilt für keine der Adressen, unter denen die Box gerade erreichbar ist – dort warnt der Browser. Unten eine Adresse für Links eintragen, unter der es gilt.')}</span></div>` : ''}</section>`,
    `<section class="card" data-col="1"><h2>${esc('Nur sichere Verbindung')}</h2>
      <div class="row"><span class="lbl"><b>${esc('http auf https umleiten')}</b><small>${esc('Die App öffnet sich dann immer über https, auch über QR-Code und Telegram-Links.')}</small></span>
        <label class="switch"><input type="checkbox" id="tls-only" ${st.httpsOnly ? 'checked' : ''} ${!st.httpsOnly && trust === false ? 'disabled' : ''} aria-label="${esc('http auf https umleiten')}"><span></span></label></div>
      ${!st.httpsOnly && trust === false ? `<p class="help" style="margin:0">${esc('Erst dieses Gerät einrichten (rechts) – sonst sperrst du dich mit einer Warnung aus.')}</p>` : ''}
      <details class="more"><summary>Was ausgenommen ist</summary><p class="help" style="margin:0">${esc('Das Display der Box bleibt bei http, und über Port 8200 ist die App immer per http erreichbar. Auf Geräten ohne das Zertifikat warnt der Browser.')}</p></details></section>`,
    custom
      ? ''
      : `<section class="card" data-col="2"><h2>${esc('Diesem Gerät die Box bekannt machen')}</h2><p class="help">${esc('Einmal pro Handy oder Computer. Es gilt nur für Adressen im Heimnetz.')}</p>
      <ol class="tls-steps">
        ${step(1, !!trust, 'Zertifikat laden', `<div class="btns"><a class="btn${trust ? '' : ' primary'}" href="${API}/tls/ca.crt" download>${icon('save', 18)}${esc('Zertifikat laden')}</a></div>`)}
        ${step(2, !!trust, 'Auf dem Gerät installieren', TLS_GUIDES.map(([id, name, lines]) => `<details class="howto"${id === platform && !trust ? ' open' : ''}><summary><b>${esc(name)}</b>${id === platform ? ' <span class="chip">dieses Gerät</span>' : ''}</summary><ol>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`).join(''))}
        ${step(3, !!trust && onHttps, 'Über https öffnen', trust && onHttps ? '<small>Erledigt.</small>' : `<div class="btns"><a class="btn" href="${esc(httpsApp)}">${icon('lock', 18)}${esc('Über https öffnen')}</a></div>`)}
      </ol></section>`,
    `<section class="card" data-col="2"><h2>${esc('Adresse für Links')}</h2>
      <p class="help">${esc('Unter welchem Namen QR-Code und Telegram-Links die Box nennen. Leer = die IP-Adresse der Box.')}</p>
      ${names.length ? `<div class="pills small">${names.map((n) => `<button type="button" data-host="${esc(n)}" aria-selected="${n === st.linkHost}" translate="no">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="field"><input class="input mono" id="tls-host" value="${esc(st.linkHost)}" placeholder="${esc(st.boxNames?.[0] ?? '')}" spellcheck="false" ${NO_PW_MANAGER}><small id="tls-host-warn" class="err" hidden>${esc('Diese Adresse deckt das Zertifikat nicht ab – der Browser wird warnen.')}</small></div>
      <div class="btns"><button class="btn" id="tls-host-save">Speichern</button></div></section>`,
    `<section class="card wide"><details class="more plain"${custom ? ' open' : ''}><summary>${esc('Eigenes Zertifikat (für Fortgeschrittene)')}</summary>
      <p class="help">${esc('Ein Zertifikat für einen eigenen Namen (z. B. von Let’s Encrypt) samt Zwischenzertifikaten und der Schlüssel ohne Passwort, beides im PEM-Format. Der Schlüssel wird nie wieder angezeigt.')}</p>
      <div class="pair">
        <div class="field"><label>${esc('Zertifikat (PEM)')}</label><button type="button" class="drop" data-file="tls-crt">${icon('doc', 20)}<span id="tls-crt-name">${esc('Datei wählen oder hierher ziehen')}</span></button><input type="file" id="tls-crt-file" accept=".pem,.crt,.cer,.txt" hidden><textarea class="input mono" id="tls-crt" rows="4" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----" hidden></textarea></div>
        <div class="field"><label>${esc('Schlüssel (PEM)')}</label><button type="button" class="drop" data-file="tls-key">${icon('lock', 20)}<span id="tls-key-name">${esc('Datei wählen oder hierher ziehen')}</span></button><input type="file" id="tls-key-file" accept=".pem,.key,.txt" hidden><textarea class="input mono" id="tls-key" rows="4" spellcheck="false" placeholder="-----BEGIN PRIVATE KEY-----" ${NO_PW_MANAGER} hidden></textarea></div>
      </div>
      <div class="btns"><button class="btn" id="tls-paste">${esc('Text einfügen statt Datei')}</button>${custom ? `<button class="btn" id="tls-box">${esc('Zurück zum Zertifikat der Box')}</button>` : ''}<button class="btn primary" id="tls-upload">${esc('Hochladen')}</button></div></details></section>`,
  ]
}

function mountTls(root, page) {
  const st = tlsState.st
  const again = async (delay = 0) => {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    await loadTls().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  if (tlsState.trust === null) {
    checkTlsTrust(st.linkHost || location.hostname).then((ok) => {
      tlsState.trust = ok
      if (currentPage()?.id === page.id) renderPage(page, false)
    })
  }
  // a name of the certificate as the address; a typed one it does not hold: said at once
  const hostWarn = () => {
    const v = $('#tls-host', root).value.trim()
    $('#tls-host-warn', root).hidden = !v || !st.cert || st.cert.names.includes(v)
  }
  for (const b of root.querySelectorAll('[data-host]')) {
    b.onclick = () => {
      $('#tls-host', root).value = b.dataset.host
      for (const x of root.querySelectorAll('[data-host]')) x.setAttribute('aria-selected', String(x === b))
      hostWarn()
    }
  }
  $('#tls-host', root).addEventListener('input', hostWarn)
  hostWarn()
  $('#tls-paste', root).onclick = (e) => {
    for (const id of ['tls-crt', 'tls-key']) $(`#${id}`, root).hidden = false
    e.target.hidden = true
  }
  for (const b of root.querySelectorAll('.drop[data-file]')) {
    const take = async (f) => {
      if (!f || f.size >= 65536) return
      $(`#${b.dataset.file}`, root).value = await f.text()
      $(`#${b.dataset.file}-name`, root).textContent = f.name
      b.classList.add('chosen')
    }
    b.ondragover = (e) => e.preventDefault()
    b.ondrop = (e) => {
      e.preventDefault()
      take(e.dataTransfer?.files?.[0])
    }
    const input = $(`#${b.dataset.file}-file`, root)
    input.onchange = () => take(input.files?.[0])
  }
  for (const b of root.querySelectorAll('.drop[data-file]')) b.onclick = () => $(`#${b.dataset.file}-file`, root).click()
  $('#tls-only', root).onchange = async (e) => {
    const on = e.target.checked
    if (on && !(await ask('Nur sichere Verbindung', 'Auf Geräten ohne das Zertifikat der Box warnt der Browser danach bei jedem Aufruf. Einschalten?', 'Einschalten'))) {
      e.target.checked = false
      return
    }
    const r = await api(`${API}/tls/https-only`, { method: 'POST', body: { on } })
    if (!r.ok) {
      e.target.checked = !on
      return toast('Nicht gespeichert', 'info')
    }
    toast(on ? 'http leitet jetzt auf https um' : 'http und https gehen wieder beide')
    again(3000)
  }
  $('#tls-host-save', root).onclick = async () => {
    const r = await api(`${API}/tls/link-host`, { method: 'POST', body: { host: $('#tls-host', root).value.trim() } })
    if (!r.ok) return toast(r.body?.error === 'invalid_host' ? 'Das ist kein gültiger Name' : 'Nicht gespeichert', 'info')
    toast('Gespeichert')
    again()
  }
  $('#tls-upload', root).onclick = async () => {
    const cert = $('#tls-crt', root).value.trim()
    const key = $('#tls-key', root).value.trim()
    if (!cert || !key) return toast('Bitte Zertifikat und Schlüssel einfügen', 'info')
    const r = await api(`${API}/tls/custom`, { method: 'POST', body: { cert, key } })
    const why = { certificate: 'Das ist kein Zertifikat im PEM-Format.', key: 'Der Schlüssel lässt sich nicht lesen (PEM, ohne Passwort?).', mismatch: 'Der Schlüssel gehört nicht zu diesem Zertifikat.', expired: 'Das Zertifikat ist abgelaufen.' }
    if (!r.ok) return toast(why[r.body?.error] ?? 'Nicht übernommen', 'info')
    toast(r.body?.coversBox ? 'Wird eingesetzt – die Seite lädt gleich neu' : 'Wird eingesetzt – es gilt aber für keine Adresse der Box, siehe Hinweis')
    again(4000)
  }
  $('#tls-box', root)?.addEventListener('click', () =>
    confirmSheet('Zurück', 'Wieder das Zertifikat der Box verwenden? Das eigene wird entfernt.', async () => {
      const r = await api(`${API}/tls/box`, { method: 'POST', body: {} })
      if (!r.ok) return toast('Das hat nicht geklappt', 'info')
      toast('Das Zertifikat der Box wird wieder eingesetzt')
      again(4000)
    }),
  )
}

/* Einstellungen › System */

/* Einstellungen › System: its pages in four groups, a short state beside some (version, health, update) */

const SYS_GROUPS = [
  ['Die Box', ['ueber', 'zustand', 'updates', 'backup']],
  ['Betrieb', ['neustart', 'protokolle', 'systemopt']],
  ['Für Fortgeschrittene', ['browser', 'experten']],
  ['Allgemein', ['sprache', 'rechtliches']],
]

function systemTop() {
  return SYS_GROUPS.map(([title, ids]) => {
    const rows = ids
      .map((id) => state.pages.get(id))
      .filter(Boolean)
      .map((p) => navRow(p.id, p.title, p.description, p.icon, `<span class="nav-badge" id="sysb-${p.id}"></span>`))
      .join('')
    return `<section class="card nav-card"><div class="group-title">${esc(title)}</div><div class="navlist">${rows}</div></section>`
  })
}

// the states come after the page: each from its own request, none holds up the others
function mountSystem(root) {
  const put = (id, html) => {
    const el = $(`#sysb-${id}`, root)
    if (el) el.innerHTML = html
  }
  api(`${API}/version`).then((r) => r.body?.version && put('ueber', `<span translate="no">${esc(r.body.version)}</span>`))
  api(`${API}/health`).then((r) => {
    const checks = r.body?.checks
    if (!Array.isArray(checks)) return
    const bad = checks.filter((c) => c.status === 'error').length
    const warn = checks.filter((c) => c.status === 'warn').length
    put('zustand', bad ? `<span class="dot bad"></span>${bad === 1 ? 'Ein Problem' : `${bad} Probleme`}` : warn ? `<span class="dot warn"></span>${warn === 1 ? 'Ein Hinweis' : `${warn} Hinweise`}` : '<span class="dot ok"></span>OK')
  })
  api(`${API}/updates`).then((r) => {
    if (r.body?.job?.phase === 'running') put('updates', '<span class="chip">läuft …</span>')
    else if (r.body?.update) put('updates', `<span class="chip ok">${esc(`${r.body.update.version} verfügbar`)}</span>`)
  })
}

/* Einstellungen › Audio › Sprachausgabe: the voice (Piper on the box, Google, silent), the voices per language, the
   automatic announcements and the parents' ones (speech.ts, eltern/speech-routes.ts) */

const speech = { data: null, lang: null, voices: {}, known: {}, licenses: {}, showAll: false, poll: null }
const SPEECH_QUALITY = { x_low: 'sehr niedrig', low: 'niedrig', medium: 'mittel', high: 'hoch' }
const SPEECH_LEVELS = [
  [0.4, 'leise'],
  [0.7, 'mittel'],
  [1, 'wie die Musik'],
]
const fmtMB = (bytes) => `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString(LOCALE)} MB`

async function loadSpeech() {
  const r = await api(`${API}/speech${speech.lang ? `?lang=${speech.lang}` : ''}`)
  if (!r.ok) throw new Error(`speech ${r.status}`)
  speech.data = r.body
  speech.lang ??= r.body.boxLanguage
  if (!speech.voices[speech.lang]) {
    const v = await api(`${API}/speech/voices?lang=${speech.lang}`)
    speech.voices[speech.lang] = v.ok ? v.body.voices : []
    // (the list of voices was there: an empty one means no voice of this language runs on the box)
    speech.known[speech.lang] = v.ok && v.body.known === true
  }
}

// The languages the box speaks (speech.ts SPEECH_LANGS): the app's and four more, each by its own name
const SPEECH_NAMES = { ...LANGS, ar: 'العربية', zh: '中文', hi: 'हिन्दी', ja: '日本語' }

// the voice the box speaks a language with: the chosen one if loaded, else the first loaded one
const speechActive = (lang) => {
  const d = speech.data
  const loaded = d.installed[lang] ?? []
  return loaded.includes(d.config.voices[lang]) ? d.config.voices[lang] : loaded[0] ?? null
}

function speechTop() {
  const d = speech.data
  const c = d.config
  const box = d.boxLanguage
  const active = d.active
  // (thorsten_emotional → Thorsten Emotional)
  const voiceName = (key) => (key ? key.split('-')[1].replace(/_/g, ' ').replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : '')
  const sw = (id, label, help, on, extra = '') =>
    `<div class="row"><span class="lbl"><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${extra} aria-label="${esc(label)}"><span></span></label></div>`
  const choice = (id, label, help, badge = '') =>
    `<button type="button" class="choice${c.engine === id ? ' on' : ''}" data-engine="${id}" aria-pressed="${c.engine === id}"><span class="radio"></span><span class="lbl"><b>${esc(label)}</b><small>${esc(help)}</small></span>${badge}</button>`
  const status =
    c.engine === 'off'
      ? `<span class="dot"></span><span>Die Box spricht nicht – keine Ansagen, keine vorgelesenen Namen.</span>`
      : c.engine === 'piper' && active
        ? `<span class="dot ok"></span><span>Die Box spricht mit <b translate="no">${esc(voiceName(active))}</b> – ohne Internet.</span>`
        : c.engine === 'piper'
          ? `<span class="dot warn"></span><span>Für die Sprache der Box ist noch keine Stimme geladen – unten eine laden. ${c.fallback === 'google' ? 'Bis dahin spricht Google.' : 'Bis dahin bleibt die Box stumm.'}</span>`
          : `<span class="dot ok"></span><span>Die Box spricht mit Google – dafür braucht sie Internet.</span>`
  // the voices of the language chosen in the list
  const lang = speech.lang
  const list = speech.voices[lang] ?? []
  const job = d.job
  const shown = speech.showAll ? list : list.slice(0, 8)
  const activeHere = speechActive(lang)
  // (the country only where a language has several: en GB / US, pt PT / BR)
  const regions = new Set(list.map((v) => v.region)).size > 1
  const voiceRow = (v) => {
    const running = job?.state === 'running' && job.key === v.key
    const lic = speech.licenses[v.key]
    const right = running
      ? `<span class="chip">${esc(`lädt … ${job.total ? Math.round((job.bytes / job.total) * 100) : 0} %`)}</span>`
      : v.key === activeHere
        ? `<span class="chip ok">aktiv</span><button class="btn danger sm" data-v-rm="${esc(v.key)}">Löschen</button>`
        : v.installed
          ? `<button class="btn sm" data-v-use="${esc(v.key)}">Verwenden</button><button class="btn danger sm" data-v-rm="${esc(v.key)}">Löschen</button>`
          : `<button class="btn sm" data-v-get="${esc(v.key)}" ${job?.state === 'running' ? 'disabled' : ''}>${icon('save', 14)}Laden</button>`
    return `<div class="entry voice"><button type="button" class="icon-btn soft" data-v-hear="${esc(v.key)}" aria-label="Anhören">${icon('vol', 16)}</button>
      <span class="lbl"><b translate="no">${esc(voiceName(v.key))}</b><small>${esc([`Qualität ${SPEECH_QUALITY[v.quality] ?? v.quality}`, fmtMB(v.size), regions ? v.region : ''].filter(Boolean).join(' · '))}${v.quality === 'high' ? ` · <span class="slow">${esc('langsam: einige Sekunden je Name')}</span>` : ''}${lic?.license && !/^see /i.test(lic.license) ? ` · <span translate="no">${esc(lic.license.replace(/^https?:\/\/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)\/?$/i, (_m, k, n) => `CC ${k.toUpperCase()} ${n}`))}</span>` : ''}</small></span>${right}</div>`
  }
  const langOptions = Object.entries(SPEECH_NAMES)
    .map(([code, name]) => {
      const n = d.installed[code]?.length ?? 0
      return `<option value="${code}"${code === lang ? ' selected' : ''}>${esc(name)}${n ? ` · ${n} ✓` : ''}${code === box ? ' ★' : ''}</option>`
    })
    .join('')
  const t = d.texts
  const text = (id, value, hint) =>
    `<div class="field"><div class="field-pick"><input class="input" id="${id}" value="${esc(value)}" maxlength="300" dir="auto" ${NO_PW_MANAGER}><button type="button" class="btn sm" data-sp-test="${id}">${icon('vol', 14)}Probe</button></div>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`
  return [
    `<section class="card" data-col="1"><div class="card-head"><h2>Stimme</h2><span class="chip ${c.engine === 'off' ? '' : 'ok'}">${c.engine === 'piper' && active ? 'offline' : c.engine === 'off' ? 'stumm' : 'online'}</span></div>
      <div class="status-line">${status}</div>
      <div class="choices">
        ${choice('piper', 'Piper – auf der Box', 'Natürliche Stimmen, ohne Internet. Jede Stimme wird einmal geladen (etwa 20–120 MB).', '<span class="chip">empfohlen</span>')}
        ${choice('google', 'Google – online', 'Braucht Internet; der Text geht dafür einmal an Google.')}
        ${choice('off', 'Stumm', 'Keine Ansagen, keine vorgelesenen Namen.')}
      </div>
      ${c.engine === 'piper' ? `<div class="field"><label>Ohne geladene Stimme für die Sprache der Box</label><div class="seg" id="sp-fallback"><button aria-pressed="${c.fallback === 'google'}" data-v="google">Google nehmen</button><button aria-pressed="${c.fallback === 'off'}" data-v="off">Stumm bleiben</button></div></div>` : ''}
      <div class="field"><label for="sp-speak">Die Box spricht</label><select class="input" id="sp-speak" translate="no">${Object.entries(SPEECH_NAMES).map(([code, name]) => `<option value="${code}"${code === box ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>
        <small>Für Ansagen, Durchsagen und vorgelesene Namen (einschalten unter Aussehen › Ansicht).</small></div></section>`,
    `<section class="card" data-col="1"><div class="card-head"><h2>Stimmen</h2><span class="chip">${esc(`${fmtMB(d.bytes)} belegt`)}</span></div>
      <div class="field"><label for="sp-lang">Sprache</label><select class="input" id="sp-lang" translate="no">${langOptions}</select></div>
      ${list.length ? `<div class="rows">${shown.map(voiceRow).join('')}</div>` : `<p class="help" style="margin:0">${esc(speech.known?.[lang] ? `Für ${SPEECH_NAMES[lang] ?? lang} gibt es noch keine Stimme, die auf der Box läuft. Mit Google spricht die Box die Sprache trotzdem.` : 'Die Liste der Stimmen ließ sich nicht laden (keine Verbindung zu Hugging Face?).')}</p>`}
      ${list.length > shown.length ? `<button class="btn" id="sp-all">${esc(`Alle ${list.length} Stimmen zeigen`)}</button>` : ''}
      ${list.length ? speechTry(d, lang, activeHere, voiceName) : ''}
      ${job?.state === 'failed' ? `<div class="note warn">${icon('info', 18)}<span>${esc('Die Stimme ließ sich nicht laden. Bitte noch einmal versuchen.')}</span></div>` : ''}
      <p class="help" style="margin:0">${esc(`Stimmen von Piper (rhasspy/piper-voices); die Lizenz steht bei jeder Stimme. ${d.free != null ? `Noch ${(d.free / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} GB frei.` : ''}`)}</p><audio id="sp-audio" hidden></audio></section>`,
    `<section class="card" data-col="2"><div class="card-head"><h2>Automatische Ansagen</h2><span class="chip" translate="no">${esc(SPEECH_NAMES[box] ?? box)}</span></div><p class="help">${esc('Die Box sagt selbst etwas, während etwas läuft.')}</p>
      ${sw('sp-rest', 'Restzeit ansagen', 'Bevor die Spielzeit für heute endet.', c.rest.on)}
      <div class="dep" data-dep-id="sp-rest"${c.rest.on ? '' : ' hidden'}><div class="field"><label>Wie lange vorher</label><div class="seg" id="sp-rest-min">${[2, 5, 10, 15].map((m) => `<button aria-pressed="${c.rest.minutes === m}" data-v="${m}">${m} min</button>`).join('')}</div></div>
        ${text('sp-t-rest', t.rest, '{min} setzt die Box ein.')}</div>
      ${sw('sp-bed', 'Ruhezeit ansagen', 'Wenn eine Ruhezeit beginnt, z. B. die Schlafenszeit.', c.bedtime.on)}
      <div class="dep" data-dep-id="sp-bed"${c.bedtime.on ? '' : ' hidden'}>${text('sp-t-bedtime', t.bedtime, '{name} ist der Name der Ruhezeit.')}</div>
      ${sw('sp-sleep', 'Ende des Schlaftimers ansagen', 'Eine Minute bevor der Schlaftimer die Wiedergabe beendet.', c.sleepEnd.on)}
      <div class="dep" data-dep-id="sp-sleep"${c.sleepEnd.on ? '' : ' hidden'}>${text('sp-t-sleepEnd', t.sleepEnd, '')}</div>
      <div class="field"><label>Lautstärke der Ansagen</label><div class="seg" id="sp-level">${SPEECH_LEVELS.map(([v, l]) => `<button aria-pressed="${c.level === v}" data-v="${v}">${esc(l)}</button>`).join('')}</div><small>Nie lauter als die Box gerade ist (Hörschutz).</small></div></section>`,
    `<section class="card" data-col="2" data-card="eltern-durchsagen"><div class="card-head"><h2>Eltern-Durchsagen</h2><span class="chips"><span class="chip" translate="no">${esc(SPEECH_NAMES[box] ?? box)}</span><span class="chip ${c.parents.on ? 'ok' : ''}">${c.parents.on ? 'an' : 'aus'}</span></span></div>
      <p class="help">${esc('Vom Handy etwas auf der Box sagen lassen: über „Durchsage“ auf der Startseite oder per Telegram (/sag Text).')}</p>
      ${sw('sp-parents', 'Durchsagen erlauben', '', c.parents.on)}
      <div class="rows" id="sp-templates">${t.templates.map((x, i) => `<div class="entry"><span class="avatar">${icon('vol', 16)}</span><span class="lbl"><b dir="auto">${esc(x)}</b></span><button class="btn sm primary" data-tpl-say="${i}">Jetzt</button><button class="btn sm" data-tpl-rm="${i}">Entfernen</button></div>`).join('')}</div>
      <div class="field-pick"><input class="input" id="sp-tpl-new" maxlength="300" dir="auto" placeholder="${esc('Neue Vorlage, z. B. „Oma ist da!“')}" ${NO_PW_MANAGER}><button type="button" class="btn" id="sp-tpl-add">${icon('plus', 16)}Hinzufügen</button></div>
      ${sw('sp-gong', 'Gong vorher', 'Ein kurzer Ton, damit das Kind aufhorcht.', c.parents.gong)}
      ${sw('sp-pause', 'Wiedergabe anhalten und danach weiter', 'Sonst wird die Musik während der Durchsage nur leiser.', c.parents.pause)}</section>`,
  ]
}

// Trying a voice on the box itself: a sentence (changeable) with one of the loaded voices of the language chosen above
function speechTry(d, lang, activeHere, voiceName) {
  const loaded = d.installed[lang] ?? []
  if (!loaded.length) return `<p class="help" style="margin:0">${esc('Zum Anhören auf der Box erst eine Stimme laden. Die Hörprobe am Handy (Lautsprecher-Knopf) geht auch so.')}</p>`
  const quality = (key) => SPEECH_QUALITY[key.slice(key.lastIndexOf('-') + 1)] ?? ''
  return `<div class="speech-try"><div class="field"><label for="sp-try-text">Probe auf der Box</label><textarea class="input" id="sp-try-text" rows="2" maxlength="300" dir="auto">${esc(d.hello ?? '')}</textarea></div>
    <div class="field-pick"><select class="input" id="sp-try-voice" aria-label="Stimme">${loaded.map((k) => `<option value="${esc(k)}"${k === activeHere ? ' selected' : ''} translate="no">${esc(`${voiceName(k)} · ${tr(quality(k))}`)}</option>`).join('')}</select>
    <button type="button" class="btn primary" id="sp-try">${icon('vol', 16)}Auf der Box anhören</button></div></div>`
}

async function speechSave(body, done = 'Gespeichert') {
  const r = await api(`${API}/speech`, { method: 'POST', body })
  toast(r.ok ? done : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
  return r.ok
}

function mountSpeech(root, page) {
  const d = speech.data
  const again = async () => {
    await loadSpeech().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }
  for (const b of root.querySelectorAll('[data-engine]')) {
    b.onclick = async () => {
      if (b.dataset.engine === d.config.engine) return
      if (await speechSave({ engine: b.dataset.engine })) again()
    }
  }
  const seg = (id, fn) => {
    const el = $(`#${id}`, root)
    if (!el) return
    el.onclick = async (e) => {
      const b = e.target.closest('button')
      if (!b || b.getAttribute('aria-pressed') === 'true') return
      for (const x of el.children) x.setAttribute('aria-pressed', String(x === b))
      await fn(b.dataset.v)
    }
  }
  seg('sp-fallback', (v) => speechSave({ fallback: v }).then(again))
  seg('sp-rest-min', (v) => speechSave({ rest: { minutes: Number(v) } }))
  seg('sp-level', (v) => speechSave({ level: Number(v) }))
  // switches (and what belongs to them)
  for (const [id, body] of [
    ['sp-rest', (on) => ({ rest: { on } })],
    ['sp-bed', (on) => ({ bedtime: { on } })],
    ['sp-sleep', (on) => ({ sleepEnd: { on } })],
    ['sp-parents', (on) => ({ parents: { on } })],
    ['sp-gong', (on) => ({ parents: { gong: on } })],
    ['sp-pause', (on) => ({ parents: { pause: on } })],
  ]) {
    const el = $(`#${id}`, root)
    el.onchange = async () => {
      const dep = $(`[data-dep-id="${id}"]`, root)
      if (dep) dep.hidden = !el.checked
      if (!(await speechSave(body(el.checked)))) el.checked = !el.checked
      if (id === 'sp-parents') again()
    }
  }
  // the texts (of the box's language), saved when left; a sample of each on the box
  for (const k of ['rest', 'bedtime', 'sleepEnd']) {
    const el = $(`#sp-t-${k}`, root)
    el.onchange = () => speechSave({ lang: d.boxLanguage, texts: { [k]: el.value } })
  }
  for (const b of root.querySelectorAll('[data-sp-test]')) {
    b.onclick = async () => {
      const text = $(`#${b.dataset.spTest}`, root).value.replace('{min}', '5').replace('{name}', 'Schlafenszeit')
      const r = await api(`${API}/speech/say`, { method: 'POST', body: { text, test: true } })
      toast(r.ok ? 'Die Box spricht …' : r.body?.error === 'speech_off' ? 'Die Box ist auf stumm gestellt' : 'Das ging nicht', r.ok ? 'ok' : 'info')
    }
  }
  // the templates
  const templates = [...d.texts.templates]
  const saveTemplates = () => speechSave({ lang: d.boxLanguage, templates }).then(again)
  for (const b of root.querySelectorAll('[data-tpl-rm]')) {
    b.onclick = () => {
      templates.splice(Number(b.dataset.tplRm), 1)
      saveTemplates()
    }
  }
  for (const b of root.querySelectorAll('[data-tpl-say]')) b.onclick = () => speechSay(templates[Number(b.dataset.tplSay)])
  $('#sp-tpl-add', root).onclick = () => {
    const v = $('#sp-tpl-new', root).value.trim()
    if (!v) return
    templates.push(v)
    saveTemplates()
  }
  // a sentence with one loaded voice, on the box
  $('#sp-try', root)?.addEventListener('click', async () => {
    const text = $('#sp-try-text', root).value.trim()
    if (!text) return toast('Bitte einen Text eingeben', 'info')
    const r = await api(`${API}/speech/say`, { method: 'POST', body: { text, test: true, voice: $('#sp-try-voice', root).value } })
    toast(r.ok ? 'Die Box spricht …' : 'Das ging nicht', r.ok ? 'ok' : 'info')
  })
  // the voices: the language of the list, listen (on this phone), load, use, delete
  $('#sp-lang', root).onchange = async (e) => {
    speech.lang = e.target.value
    speech.showAll = false
    await again()
  }
  $('#sp-all', root)?.addEventListener('click', () => {
    speech.showAll = true
    renderPage(page, false)
  })
  const audio = $('#sp-audio', root)
  for (const b of root.querySelectorAll('[data-v-hear]')) {
    b.onclick = () => {
      audio.src = `${API}/speech/sample?key=${encodeURIComponent(b.dataset.vHear)}`
      audio.play().catch(() => toast('Die Hörprobe ließ sich nicht abspielen', 'info'))
    }
  }
  for (const b of root.querySelectorAll('[data-v-get]')) {
    b.onclick = async () => {
      const r = await api(`${API}/speech/voice/install`, { method: 'POST', body: { key: b.dataset.vGet } })
      if (!r.ok) return toast('Gerade lädt schon eine Stimme', 'info')
      toast(existsPiper() ? 'Die Stimme wird geladen …' : 'Piper und die Stimme werden geladen …')
      await again()
    }
  }
  // the language the box speaks (the reading-out language of the display too): the player starts again with it
  const speakIn = async (code) => {
    const r = await api(`${API}/display-options`, { method: 'POST', body: { ttsLanguage: code === 'nb' ? 'no' : code } })
    toast(r.ok ? `Die Box spricht jetzt ${SPEECH_NAMES[code] ?? code}` : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    return r.ok
  }
  $('#sp-speak', root).onchange = async (e) => {
    if (await speakIn(e.target.value)) {
      speech.lang = e.target.value
      again()
    }
  }
  for (const b of root.querySelectorAll('[data-v-use]')) {
    b.onclick = async () => {
      if (!(await speechSave({ voice: { lang: speech.lang, key: b.dataset.vUse } }, 'Stimme gewählt'))) return
      // a voice of another language: the box to speak that language too? (else it stays with the old one)
      if (speech.lang !== d.boxLanguage && (await ask('Sprache der Box', `Die Box spricht gerade ${SPEECH_NAMES[d.boxLanguage] ?? d.boxLanguage}. Soll sie ab jetzt ${SPEECH_NAMES[speech.lang] ?? speech.lang} sprechen – Ansagen, Durchsagen und vorgelesene Namen?`, 'Umstellen'))) await speakIn(speech.lang)
      again()
    }
  }
  for (const b of root.querySelectorAll('[data-v-rm]')) {
    b.onclick = () =>
      confirmSheet('Löschen', 'Diese Stimme von der Box löschen? Sie lässt sich jederzeit wieder laden.', async () => {
        const r = await api(`${API}/speech/voice/remove`, { method: 'POST', body: { key: b.dataset.vRm } })
        toast(r.ok ? 'Gelöscht' : 'Das ging nicht', r.ok ? 'ok' : 'info')
        speech.voices = {}
        again()
      })
  }
  // a voice loading: its progress every 2 s, the list again when it is there
  if (d.job?.state === 'running') {
    every(2000, async () => {
      const r = await api(`${API}/speech/job`)
      const job = r.body?.job
      if (!job) return
      if (job.state !== 'running') {
        toast(job.state === 'done' ? 'Die Stimme ist geladen' : 'Die Stimme ließ sich nicht laden', job.state === 'done' ? 'ok' : 'info')
        speech.voices = {}
        // (the first voice of the box's language: taken at once)
        if (job.state === 'done' && d.config.engine !== 'piper' && !speechActive(d.boxLanguage)) await api(`${API}/speech`, { method: 'POST', body: { engine: 'piper' } })
        return again()
      }
      d.job = job
      const chip = root.querySelector('.entry.voice .chip:not(.ok)')
      if (chip) chip.textContent = `lädt … ${job.total ? Math.round((job.bytes / job.total) * 100) : 0} %`
    })
  }
  // the licences of the voices shown (their model cards), one after the other
  // (drawn again only when a new one came: else the drawing would start this again, without end)
  ;(async () => {
    let fetched = 0
    for (const v of (speech.voices[speech.lang] ?? []).slice(0, speech.showAll ? 50 : 8)) {
      if (speech.licenses[v.key] || currentPage()?.id !== page.id) continue
      const r = await api(`${API}/speech/license?key=${encodeURIComponent(v.key)}`)
      speech.licenses[v.key] = r.body ?? {}
      fetched++
    }
    if (fetched && currentPage()?.id === page.id) {
      const y = window.scrollY
      renderPage(page, false)
      window.scrollTo(0, y)
    }
  })()
}
// (Piper itself is on the box once any voice is)
const existsPiper = () => Object.values(speech.data?.installed ?? {}).some((l) => l.length)

// A text said on the box now (a template or the parents' own)
async function speechSay(text) {
  const r = await api(`${API}/speech/say`, { method: 'POST', body: { text } })
  toast(r.ok ? 'Wird durchgesagt …' : r.body?.error === 'announcements_off' ? 'Durchsagen sind ausgeschaltet' : r.body?.error === 'speech_off' ? 'Die Box ist auf stumm gestellt' : 'Das ging nicht', r.ok ? 'ok' : 'info')
  return r.ok
}

// Start › "Durchsage": the templates and an own text - until the speech is set up, its page instead
async function saySheet() {
  const r = await api(`${API}/speech`)
  if (!r.ok || !r.body?.configured) {
    toast('Erst die Sprachausgabe einrichten', 'info')
    return go('sprachausgabe')
  }
  const templates = r.body.texts?.templates ?? []
  openSheet(
    `<h2>Durchsage</h2><p class="help" style="margin:0">${esc(r.body.config.parents.pause ? 'Die Box sagt es sofort – die Musik hält dafür kurz an.' : 'Die Box sagt es sofort – die Musik wird dafür leiser.')}</p>
     ${templates.length ? `<div class="say-grid">${templates.map((t, i) => `<button type="button" class="say-tile" data-say="${i}">${icon('vol', 18)}<span>${esc(t)}</span></button>`).join('')}</div>` : ''}
     <div class="field"><label for="say-text">Oder eigener Text</label><textarea class="input" id="say-text" rows="2" maxlength="300" dir="auto" placeholder="${esc('z. B. „Papa kommt gleich hoch.“')}"></textarea></div>
     <div class="btns"><button class="btn primary" id="say-go">${icon('vol', 18)}Jetzt durchsagen</button><button class="btn" data-close>Schließen</button></div>`,
    (sheet, close) => {
      sheet.querySelector('[data-close]').onclick = close
      for (const b of sheet.querySelectorAll('[data-say]')) b.onclick = async () => (await speechSay(templates[Number(b.dataset.say)])) && close()
      sheet.querySelector('#say-go').onclick = async () => {
        const text = sheet.querySelector('#say-text').value.trim()
        if (!text) return toast('Bitte einen Text eingeben', 'info')
        if (await speechSay(text)) close()
      }
    },
  )
}

const sys = { info: null, version: '', news: null, bs: null, logs: null, logSel: 'log:server-error', logGrep: '', logText: '', logAuto: false, debug: null, browser: null, range: 1 }

const fmtUptime = (s) => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d} T ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

/* Über die Box */

// news.txt is an HTML snippet from GitHub: turned into plain text (headings, bullet points) - nothing of it is run
// or inserted as HTML (the admin interface printed it as it came)
function newsText(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  const lines = []
  const walk = (node) => {
    for (const el of node.childNodes) {
      if (el.nodeType === 3) {
        const t = el.textContent.replace(/\s+/g, ' ')
        if (t.trim()) lines.push(lines.length && !lines[lines.length - 1].endsWith('\n') ? t : t.trimStart())
        continue
      }
      if (el.nodeType !== 1) continue
      const tag = el.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) lines.push(`\n\n${el.textContent.trim().toUpperCase()}\n`)
      else if (tag === 'li') lines.push(`\n• ${el.textContent.replace(/\s+/g, ' ').trim()}`)
      else if (tag === 'ul' || tag === 'ol') {
        // (what follows a list - in news.txt the <b> headings - starts a new paragraph)
        walk(el)
        lines.push('\n\n')
      } else if (tag === 'br' || tag === 'p' || tag === 'div') {
        lines.push('\n')
        walk(el)
      } else walk(el)
    }
  }
  walk(doc.body)
  return lines.join('').replace(/\n{3,}/g, '\n\n').trim()
}


async function loadAbout() {
  const [info, version, bs] = await Promise.all([api(`${API}/system`), api(`${API}/version`), api(`${API}/bootscreen`)])
  sys.info = info.ok ? info.body : null
  sys.version = version.body?.version ?? ''
  sys.bs = bs.ok ? bs.body : null
  api(`${API}/news`).then((r) => {
    sys.news = r.body?.text ?? ''
    const box = $('#ab-news')
    if (box) box.textContent = sys.news ? newsText(sys.news) : tr('Die Neuigkeiten ließen sich nicht laden (keine Verbindung zu GitHub).')
  })
}

function aboutTop() {
  const i = sys.info ?? {}
  const max = sys.bs?.screens?.nameMaxLength ?? 14
  const disk = i.disk ?? {}
  const used = disk.total ? Math.round(((disk.total - disk.free) / disk.total) * 100) : null
  const row = (k, v) => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '')
  return [
    // (on a wide screen: MuPiBox on the left over two rows, the name and the support beside it, then the history and
    // the news across the whole width)
    `<section class="card about-main"><h2>MuPiBox</h2><dl class="kv">${row('Version', sys.version)}${row('Hostname', i.hostname)}${row('Läuft seit', i.uptime_seconds != null ? fmtUptime(i.uptime_seconds) : '')}${row('CPU-Last', i.load_1 != null ? `${i.load_1.toLocaleString(LOCALE)} (${i.cpu_count} Kerne)` : '')}${row('Temperatur', i.cpu_temp_c != null ? `${Math.round(i.cpu_temp_c)} °C` : '')}${row('Arbeitsspeicher', i.mem_total ? `${formatBytes(i.mem_total - i.mem_free)} von ${formatBytes(i.mem_total)}` : '')}</dl>
      ${used != null ? `<div class="bar"><div class="slider-head"><b>SD-Karte</b><span class="value-pill">${used} %</span></div><div class="track"><i style="--w:${used}%"></i></div><small>${formatBytes(disk.free)} frei von ${formatBytes(disk.total)}</small></div>` : ''}</section>`,
    `<section class="card"><h2>Name der Box</h2><p class="help">Steht auf dem Startbild und oben in der App.</p>
      <div class="field"><label for="ab-name">Name der Box (höchstens ${max} Zeichen)</label><input class="input" id="ab-name" maxlength="${max}" value="${esc(sys.bs?.current?.boxName ?? '')}" placeholder="${esc(sys.bs?.screens?.defaultName ?? 'MuPiBox')}"></div>
      <div class="btns"><button class="btn primary" id="ab-save">Speichern</button></div></section>`,
    `<section class="card"><h2>Support</h2><p class="help">Für Hilfe im Discord: ein Zip mit Bibliothek, Einstellungen (ohne Passwörter, Tokens und Konten), Netz- und Systemstand.</p>
      <div class="btns"><a class="btn" href="${API}/support-info" download>${icon('save', 18)}Support-Infos herunterladen</a></div></section>`,
    `<section class="card wide"><div class="hist-head"><h2>Verlauf</h2><div class="pills small" id="ab-range">${[1, 6, 24].map((h) => `<button aria-selected="${sys.range === h}" data-h="${h}">${h} h</button>`).join('')}</div></div>
      <div class="hist-grid" id="ab-charts"><div class="loading"><p>Lade …</p></div></div>
      <p class="help" style="margin:0"><span id="ab-since"></span> Einmal pro Minute gemessen, nur im Arbeitsspeicher der Box – nach einem Neustart beginnt der Verlauf neu.</p></section>`,
    `<section class="card wide"><h2>Neuigkeiten</h2><pre class="news" id="ab-news">${esc(sys.news ? newsText(sys.news) : tr('Lade …'))}</pre></section>`,
  ]
}

// CPU, RAM and temperature over the last hours (the admin interface's rrd graphs): /system-history, a minute apart
async function drawSystemHistory(root) {
  const box = $('#ab-charts', root)
  if (!box) return
  const range = sys.range
  const r = await api(`${API}/system-history?hours=${range}`)
  // (another range chosen meanwhile: its answer comes, not this one)
  if (!box.isConnected || range !== sys.range) return
  if (!r.ok) {
    box.innerHTML = `<p class="help" style="margin:0">Der Verlauf ließ sich nicht laden.</p>`
    return
  }
  const rows = r.body?.samples ?? []
  const fmt = (v, digits = 0) => v.toLocaleString(LOCALE, { maximumFractionDigits: digits })
  // (a gap: the box was off - more than three times the points' spacing, at least three minutes)
  const gap = Math.max(3 * 60e3, 3 * (Number(r.body?.step) || 60e3))
  // (the whole chosen range from left to right, the box's clock; measured only for a part of it: the line starts later)
  const end = Number(r.body?.now) || Date.now()
  const span = [end - range * 3600e3, end]
  const since = Number(r.body?.since)
  const note = $('#ab-since', root)
  if (note) note.textContent = since > span[0] + 5 * 60e3 ? tr(`Messwerte erst seit ${hhmm(since)} Uhr.`) : ''
  box.innerHTML = [
    lineChart(rows, 1, { title: 'Temperatur', unit: '°C', color: 'var(--mp-warn)', digits: 1, fmt, gap, span }),
    lineChart(rows, 2, { title: 'CPU-Auslastung', unit: '%', min: 0, max: 100, color: 'var(--mp-primary)', fmt, gap, span }),
    lineChart(rows, 3, { title: 'Arbeitsspeicher', unit: '%', min: 0, max: 100, color: 'var(--mp-success)', fmt, gap, span }),
  ].join('')
}

// One value over time as a line (rows: [time, …], k: the value's place). A gap of more than three minutes (the box
// was off) breaks the line. min/max: a fixed scale (percent), else the values' own range with some room.
function lineChart(rows, k, { title, unit, min, max, color, digits = 0, fmt, gap: maxGap = 3 * 60e3, span }) {
  const pts = rows.filter((row) => Number.isFinite(row[k]))
  const head = (value) => `<div class="hist-top"><b>${esc(title)}</b>${value ? `<span class="value-pill">${esc(value)}</span>` : ''}</div>`
  if (pts.length < 2) return `<div class="hist">${head('')}<p class="help" style="margin:0">Noch zu wenige Messwerte.</p></div>`
  const vals = pts.map((row) => row[k])
  const low = Math.min(...vals)
  const high = Math.max(...vals)
  const lo = min ?? Math.floor(low - 2)
  const hi = max ?? Math.ceil(high + 2)
  // (span: the chosen range's start and end - the points lie in it; else from the first to the last point)
  const [t0, t1] = span ?? [pts[0][0], pts[pts.length - 1][0]]
  const x = (t) => Math.min(300, Math.max(0, ((t - t0) / Math.max(1, t1 - t0)) * 300))
  const y = (v) => 100 - ((v - lo) / Math.max(1e-9, hi - lo)) * 100
  let line = ''
  let area = ''
  let start = null
  pts.forEach((row, i) => {
    const gap = i > 0 && row[0] - pts[i - 1][0] > maxGap
    const p = `${x(row[0]).toFixed(1)},${y(row[k]).toFixed(1)}`
    if (i === 0 || gap) {
      if (start !== null) area += `L${x(pts[i - 1][0]).toFixed(1)},100 L${start},100 Z `
      line += `M${p} `
      area += `M${p} `
      start = x(row[0]).toFixed(1)
    } else {
      line += `L${p} `
      area += `L${p} `
    }
  })
  area += `L${x(pts[pts.length - 1][0]).toFixed(1)},100 L${start},100 Z`
  const last = vals[vals.length - 1]
  return `<div class="hist" style="--c:${color}">${head(`${fmt(last, digits)} ${unit}`)}
    <div class="hist-plot"><span class="hi">${fmt(hi)}</span><span class="lo">${fmt(lo)}</span>
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${line}"/></svg></div>
    <div class="hist-axis"><span>${hhmm(t0)}</span><span>${hhmm((t0 + t1) / 2)}</span><span>${hhmm(t1)}</span></div>
    <small>${esc(`Zwischen ${fmt(low, digits)} und ${fmt(high, digits)} ${unit}`)}</small></div>`
}

function mountAbout(root) {
  drawSystemHistory(root)
  every(60_000, () => drawSystemHistory(root))
  $('#ab-range', root).onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    sys.range = Number(b.dataset.h)
    for (const x of b.parentElement.children) x.setAttribute('aria-selected', String(x === b))
    drawSystemHistory(root)
  }
  $('#ab-save', root).onclick = async () => {
    const name = $('#ab-name', root).value.trim()
    const r = await api(`${API}/bootscreen`, { method: 'POST', body: { boxName: name } })
    if (!r.ok) return toast('Nicht gespeichert', 'info')
    state.boxName = r.body?.current?.boxName || 'MuPiBox'
    renderChrome(currentPage())
    toast('Gespeichert – das Startbild wird neu erzeugt')
  }
}

/* Neu starten & Ausschalten */

function restartTop() {
  const rows = [
    ['display', 'display', 'Display neu starten', 'Chromium startet neu (ein paar Sekunden schwarz). Die Wiedergabe läuft weiter.'],
    ['player', 'music', 'Player neu starten', 'Spotify und die lokale Wiedergabe starten neu – was läuft, stoppt.'],
    ['services', 'sync', 'Dienste neu starten', 'Player und Server der Box; die App ist dabei kurz nicht erreichbar.'],
    ['apply', 'gear', 'Einstellungen übernehmen', 'Schreibt alle Einstellungen neu in die Dienste und startet das Display neu (wie „Update settings“ im Admin-Interface).'],
  ]
  // (both across the whole width; on a wide screen their entries in two columns - no small card beside a long one)
  return [
    `<section class="card wide"><h2>Box</h2><div class="rows two-col">
      <div class="entry"><span class="avatar">${icon('sync', 16)}</span><span class="lbl"><b>Neu starten</b><small>Dauert etwa eine Minute; die Wiedergabe endet.</small></span><button class="btn sm" id="rs-reboot">Neu starten</button></div>
      <div class="entry"><span class="avatar">${icon('power', 16)}</span><span class="lbl"><b>Ausschalten</b><small>Wieder einschalten geht nur über den Taster an der Box.</small></span><button class="btn danger sm" id="rs-off">Ausschalten</button></div></div></section>`,
    `<section class="card wide"><h2>Display & Dienste</h2><div class="rows two-col">${rows
      .map(([id, ic, t, s]) => `<div class="entry"><span class="avatar">${icon(ic, 16)}</span><span class="lbl"><b>${t}</b><small>${s}</small></span><button class="btn sm" data-rs="${id}">${id === 'apply' ? 'Übernehmen' : 'Neu starten'}</button></div>`)
      .join('')}</div></section>`,
  ]
}

function mountRestart(root) {
  $('#rs-reboot', root).onclick = () =>
    confirmSheet('Neu starten', 'Die Box jetzt neu starten? Das dauert etwa eine Minute.', async () => {
      const r = await api('/api/reboot', { method: 'POST', body: {} })
      toast(r.ok ? 'Die Box startet neu …' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    })
  $('#rs-off', root).onclick = () =>
    confirmSheet('Ausschalten', 'Die Box jetzt ausschalten? Einschalten geht dann nur noch am Taster.', async () => {
      const r = await api('/api/shutdown', { method: 'POST', body: {} })
      toast(r.ok ? 'Die Box schaltet aus …' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    })
  for (const b of root.querySelectorAll('[data-rs]')) {
    b.onclick = () => {
      const what = b.dataset.rs
      const t = { display: 'Display', player: 'Player', services: 'Dienste', apply: 'Einstellungen übernehmen' }[what]
      // (whole sentences: "Dienste startet neu" was the grammar of one)
      const done = { display: 'Das Display startet neu …', player: 'Der Player startet neu …', services: 'Die Dienste starten neu …', apply: 'Die Einstellungen werden übernommen – das Display startet neu …' }[what]
      const ask = { display: 'Das Display jetzt neu starten?', player: 'Den Player jetzt neu starten?', services: 'Die Dienste jetzt neu starten?' }[what]
      confirmSheet(what === 'apply' ? 'Übernehmen' : 'Neu starten', what === 'apply' ? 'Alle Einstellungen jetzt übernehmen? Das Display startet dabei neu.' : ask ?? `${t} jetzt neu starten?`, async () => {
        const r = what === 'apply' ? await api(`${API}/apply-settings`, { method: 'POST', body: {} }) : await api(`${API}/restart`, { method: 'POST', body: { what } })
        toast(r.ok ? done : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      })
    }
  }
}

/* Zustand der Box */

async function loadHealth() {
  const r = await api(`${API}/health`)
  if (!r.ok) throw new Error(`health ${r.status}`)
  sys.health = r.body
}

// per check: its name, its value when all is well, what a hint means, and where to fix it (a page of the app)
function healthRow(c) {
  const v = c.value
  const names = {
    storage: 'Speicherplatz',
    temperature: 'Temperatur',
    power: 'Stromversorgung',
    sdcard: 'SD-Karte',
    memory: 'Arbeitsspeicher',
    services: 'Dienste der Box',
    internet: 'Internet',
    nas: 'NAS',
    spotify: 'Spotify-Anmeldung',
    certificate: 'Zertifikat (HTTPS)',
    podcasts: 'Gespeicherte Podcast-Folgen',
  }
  const okText = {
    storage: `${v} frei`,
    temperature: v,
    power: 'Keine Unterspannung',
    sdcard: 'Keine Fehler',
    memory: `${v} frei`,
    services: 'Alle laufen',
    internet: 'Verbunden',
    nas: `Erreichbar (${v})`,
    spotify: `Noch ${v} Tage gültig`,
    certificate: `Noch ${v} Tage gültig`,
    // ("<count> · <size>")
    podcasts: /^0\b/.test(v) ? 'Keine' : v.startsWith('1 ') ? `1 Folge · ${v.split(' · ')[1] ?? ''}` : `${v.split(' · ')[0]} Folgen · ${v.split(' · ')[1] ?? ''}`,
  }
  const hints = {
    storage_low: `Nur noch ${v} frei – gespeicherte Folgen oder nicht mehr gebrauchte Medien löschen.`,
    too_hot: `${v} – die Box wird sehr warm. Nicht in die Sonne stellen, die Lüftung frei halten.`,
    undervoltage_now: 'Gerade Unterspannung – Netzteil oder Kabel liefern zu wenig Strom.',
    throttled_now: 'Der Prozessor ist gerade gebremst (zu warm oder zu wenig Strom).',
    undervoltage_since_boot: 'Seit dem Start gab es Unterspannung – Netzteil und Kabel prüfen.',
    sd_readonly: 'Die SD-Karte ist schreibgeschützt, die Box kann nichts speichern. Neu starten; bleibt es so, ist die Karte wohl defekt.',
    sd_errors: `${v} Fehler der SD-Karte seit dem Start – sie könnte bald ausfallen. Am besten ein Backup machen.`,
    memory_low: `Nur noch ${v} frei – ein Neustart der Box hilft.`,
    services_down: `Gestoppt: ${v}. Ein Neustart der Box hilft meist.`,
    offline: 'Keine Verbindung ins Internet – Spotify, Podcasts und Radio spielen nicht.',
    nas_address: 'Die Adresse des NAS ist ungültig.',
    nas_unreachable: `${v} antwortet nicht – ist das NAS an und im selben Netz?`,
    spotify_refused: 'Spotify hat die Anmeldung abgelehnt – bitte neu anmelden.',
    spotify_unknown: 'Seit wann die Anmeldung besteht, ist unbekannt – einmal neu anmelden, dann erinnert die Box rechtzeitig.',
    spotify_soon: `Läuft in ${v} Tagen ab – bitte neu anmelden.`,
    certificate_soon: Number(v) < 0 ? 'Abgelaufen – bitte ein neues hochladen.' : `Läuft in ${v} Tagen ab – bitte ein neues hochladen.`,
  }
  const fix = {
    sd_errors: 'backup',
    memory_low: 'neustart',
    services_down: 'neustart',
    offline: 'wlan',
    nas_address: 'nas',
    nas_unreachable: 'nas',
    spotify_refused: 'spzugang',
    spotify_unknown: 'spzugang',
    spotify_soon: 'spzugang',
    certificate_soon: 'https',
  }
  const icons = { storage: 'save', temperature: 'fan', power: 'plug', sdcard: 'chip', memory: 'chip', services: 'server', internet: 'wifi', nas: 'folder', spotify: 'sync', certificate: 'lock', podcasts: 'music' }
  const chip = { ok: '<span class="chip ok">OK</span>', warn: '<span class="chip warn">Hinweis</span>', error: '<span class="chip danger">Problem</span>', info: '' }[c.status] ?? ''
  const text = c.hint ? hints[c.hint] ?? c.hint : c.status === 'ok' || c.id === 'podcasts' ? okText[c.id] : v
  // (a button to the page that fixes it, where there is one)
  const target = c.hint && fix[c.hint] && state.pages.has(fix[c.hint]) ? fix[c.hint] : ''
  return `<div class="entry health-row"><span class="avatar">${icon(icons[c.id] ?? 'info', 16)}</span><span class="lbl"><b>${names[c.id] ?? esc(c.id)}</b><small>${esc(text ?? '')}</small>${target ? `<button class="btn sm" data-go="${target}">Öffnen</button>` : ''}</span>${chip}</div>`
}

function uptimeText(s) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d} Tage ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

function healthTop() {
  const h = sys.health
  const problems = h.checks.filter((c) => c.status === 'error').length
  const warnings = h.checks.filter((c) => c.status === 'warn').length
  // (each count a chip of its own: whole texts to translate)
  const chips = [
    problems ? `<span class="chip danger">${problems === 1 ? 'Ein Problem' : `${problems} Probleme`}</span>` : '',
    warnings ? `<span class="chip warn">${warnings === 1 ? 'Ein Hinweis' : `${warnings} Hinweise`}</span>` : '',
    problems || warnings ? '' : '<span class="chip ok">OK</span>',
  ].join('')
  return [
    `<section class="card wide"><div class="sp-head"><h2>${problems || warnings ? 'Bitte ansehen' : 'Alles in Ordnung'}</h2><div class="chips">${chips}</div></div>
      <p class="help"><span>Läuft seit</span> <span>${uptimeText(h.uptime)}</span>${h.version ? ` · <span>Version</span> <span translate="no">${esc(h.version)}</span>` : ''}</p>
      <div class="rows">${h.checks.map(healthRow).join('')}</div>
      <div class="btns"><button class="btn" id="hl-refresh">Neu prüfen</button></div></section>`,
  ]
}

function mountHealth(root, page) {
  for (const el of root.querySelectorAll('[data-go]')) el.onclick = () => go(el.dataset.go)
  $('#hl-refresh', root).onclick = async (e) => {
    e.target.disabled = true
    await loadHealth().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
    toast('Neu geprüft')
  }
}

/* Rechtliches */

// The services the box talks to, what for, and their own terms
const LEGAL_SERVICES = [
  ['Spotify', 'Anmeldung, Wiedergabe, Suche, Smart-Sync, Cover', 'https://www.spotify.com/legal/end-user-agreement/'],
  ['ARD Sounds (ARD Audiothek)', 'Suche und Folgen von ARD-Sendungen', 'https://www.ardsounds.de/nutzungsbedingungen/'],
  ['Apple (iTunes Search, Apple Podcasts)', 'Podcast-Suche, Vorschläge, Cover-Suche', 'https://www.apple.com/legal/internet-services/itunes/'],
  ['Deezer', 'Cover-Suche', 'https://www.deezer.com/legal/cgu'],
  ['radio-browser.info', 'Radiosender-Suche', 'https://www.radio-browser.info/'],
  ['Google', 'Gesprochene Ansagen (wenn Google gewählt ist)', 'https://policies.google.com/terms'],
  ['Hugging Face', 'Piper-Stimmen und Hörproben (Sprachausgabe)', 'https://huggingface.co/terms-of-service'],
  ['Telegram', 'Eltern-Bot (wenn eingerichtet)', 'https://telegram.org/tos'],
  ['GitHub', 'Updates, Neuigkeiten, das Programm Piper', 'https://docs.github.com/site-policy/github-terms/github-terms-of-service'],
]

async function loadLegal() {
  const [license, version] = await Promise.all([fetch('legal/LICENSE.md', { cache: 'no-cache' }).catch(() => null), api(`${API}/version`)])
  sys.legalLicense = license?.ok ? await license.text() : ''
  sys.version = version.body?.version ?? sys.version ?? ''
}

function legalTop() {
  const text = sys.legalLicense || ''
  const name = text.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const copyright = /^\s*Copyright\b.*$/m.exec(text)?.[0].trim() ?? ''
  const link = (href, label, cls = 'btn') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${icon('ext', 16)}${esc(label)}</a>`
  return [
    `<section class="card"><h2>MuPiBox</h2><p class="help">Ein freies Open-Source-Projekt für Musikboxen für Kinder.</p>
      ${spKv([
        ['Version', sys.version || '–'],
        copyright && ['Copyright', copyright.replace(/^Copyright\s*(\(c\)|©)?\s*/i, '')],
      ])}
      <div class="btns">${link('https://github.com/splitti/MuPiBox', 'Projekt auf GitHub')}${link('https://mupibox.de', 'mupibox.de')}</div></section>`,
    // (its own license and the third parties in one card: beside "MuPiBox" of about the same height on a wide screen)
    `<section class="card"><h2>Lizenzen</h2>
      <h3 class="legal-h">Lizenz</h3><p class="help">${esc(name ? `MuPiBox steht unter der ${name}.` : 'Die Lizenz ließ sich nicht laden.')}</p>
      ${text ? `<details class="legal"><summary>Lizenztext anzeigen</summary><pre class="logview legal-text" translate="no">${esc(text)}</pre></details>` : ''}
      <h3 class="legal-h">Open Source &amp; Drittanbieter</h3><p class="help">MuPiBox nutzt Software, Schriften und Dienste anderer Projekte. Jede Komponente behält ihre eigene Lizenz; die Liste nennt sie und enthält die Lizenztexte.</p>
      <details class="legal" id="lg-notices"><summary>Drittanbieter-Hinweise anzeigen</summary><pre class="logview legal-text" translate="no">${esc(tr('Lade …'))}</pre></details></section>`,
    `<section class="card"><h2>Datenschutz</h2>
      <p class="help">Alles, was die Box über ihre Nutzung weiß, bleibt auf ihr: Bibliothek, Einstellungen, der Hör-Verlauf der letzten 90 Tage und wo Folgen zuletzt gehört wurden. MuPiBox erhebt keine Nutzungsstatistik und zeigt keine Werbung.</p>
      <p class="help">Nach außen geht nur, was ein Dienst für seine Aufgabe braucht:</p>
      <ul class="legal-list">
        <li>Spotify: die Anmeldung und was abgespielt, gesucht oder synchronisiert wird.</li>
        <li>Podcast- und Radiosender: der Abruf der eingetragenen Feeds und Streams.</li>
        <li>Suchen (Apple, ARD, radio-browser.info, Deezer, bei der Cover-Suche auch Spotify): der Suchbegriff und die gewählte Sprache; bei der automatischen Cover-Suche (wenn eingeschaltet) der Name des Ordners.</li>
        <li>Google: der Text einer gesprochenen Ansage, einmal; die Ansage bleibt danach auf der Box.</li>
        <li>Telegram (nur mit eingerichtetem Bot): die Nachrichten des Bots, bei „Wiedergabe melden“ auch Titel und ein Bildschirmfoto.</li>
        <li>GitHub: die Prüfung auf Updates, die Neuigkeiten und die Updates selbst; beim ersten Laden einer Stimme das Programm Piper.</li>
        <li>Hugging Face (nur mit Piper): die Liste der Stimmen, eine gewählte Stimme und ihre Hörprobe. Was die Box sagt, bleibt auf der Box.</li>
        <li>Das Admin-Interface lädt Bibliotheken von öffentlichen Servern (jQuery, jsDelivr, cdnjs); dabei sehen diese die Adresse des Browsers.</li>
      </ul>
      <p class="help">Für diese Dienste gelten deren eigene Bedingungen und Datenschutzhinweise.</p></section>`,
    `<section class="card"><h2>Externe Dienste</h2><div class="rows">${LEGAL_SERVICES.map(
      ([name, what, href]) => `<div class="entry"><span class="lbl"><b translate="no">${esc(name)}</b><small>${esc(what)}</small></span>${link(href, 'Bedingungen', 'btn sm')}</div>`,
    ).join('')}</div></section>`,
    `<section class="card wide"><h2>Unabhängigkeit</h2><p class="help">MuPiBox ist ein unabhängiges Projekt. Es ist nicht mit Spotify, der ARD, Apple, Deezer, Google, Telegram oder anderen hier genannten Anbietern verbunden und wird von ihnen weder unterstützt noch autorisiert. Alle genannten Marken gehören ihren jeweiligen Inhabern.</p></section>`,
  ]
}

function mountLegal(root) {
  // (the notices are long: loaded only when opened)
  const notices = $('#lg-notices', root)
  notices?.addEventListener(
    'toggle',
    async () => {
      if (!notices.open) return
      const r = await fetch('legal/THIRD_PARTY_NOTICES.md', { cache: 'no-cache' }).catch(() => null)
      const pre = notices.querySelector('pre')
      if (pre) pre.textContent = r?.ok ? await r.text() : tr('Die Hinweise ließen sich nicht laden.')
    },
    { once: true },
  )
}

/* Protokolle */

async function loadLogs() {
  const [list, debug] = await Promise.all([api(`${API}/logs`), api(`${API}/controller-debug`)])
  if (!list.ok) throw new Error(`logs ${list.status}`)
  sys.logs = list.body
  sys.debug = debug.body?.on === true
}

function logsTop() {
  const l = sys.logs
  const opt = (v, t) => `<option value="${esc(v)}"${v === sys.logSel ? ' selected' : ''}>${esc(t)}</option>`
  // (a wide screen: the logs and services as a list on the left - the services with their state - and the log at
  // full height on the right; a phone: the choice as a menu, the log below)
  const word = { active: 'läuft', failed: 'Fehler', inactive: 'gestoppt', activating: 'startet' }
  const item = (value, label, st) =>
    `<button class="lg-item" data-lg="${esc(value)}" aria-current="${value === sys.logSel}">${st ? `<i class="dot st-${esc(st)}" title="${esc(word[st] ?? st)}"></i>` : '<i class="dot"></i>'}<span translate="no">${esc(label)}</span></button>`
  const list = `<nav class="lg-list" aria-label="Logs und Dienste"><small>Logs</small>${l.logs.map((k) => item(`log:${k}`, `${k}.log`)).join('')}<small>Dienste</small>${l.services
    .map((k) => item(`service:${k}`, k, l.states?.[k] ?? ''))
    .join('')}</nav>`
  return [
    `<section class="card wide lg-card"><h2>Protokoll</h2><div class="lg-split"><aside class="lg-side">${list}
      <div class="row lg-debug"><span class="lbl"><b>Ausführliches Player-Log</b><small>Schreibt viel mehr ins spotify-control-Log (Player startet neu). Nach der Fehlersuche wieder aus.</small></span>
      <label class="switch"><input type="checkbox" id="lg-debug" ${sys.debug ? 'checked' : ''} aria-label="Ausführliches Player-Log"><span></span></label></div></aside>
      <div class="lg-main"><div class="rule-times stack-phone"><div class="field lg-pick"><label for="lg-sel">Log oder Dienst</label><select class="input" id="lg-sel"><optgroup label="Logs">${l.logs.map((k) => opt(`log:${k}`, `${k}.log`)).join('')}</optgroup><optgroup label="Dienste (Status)">${l.services.map((k) => opt(`service:${k}`, k)).join('')}</optgroup></select></div>
        <div class="field"><label for="lg-grep">Suche</label><input class="input" id="lg-grep" type="search" value="${esc(sys.logGrep)}" placeholder="z. B. error" autocomplete="off"></div></div>
      <div class="btns"><button class="btn" id="lg-refresh">Aktualisieren</button><button class="btn" id="lg-auto" aria-pressed="${sys.logAuto}">${sys.logAuto ? 'Anhalten' : 'Mitlaufen'}</button><button class="btn" id="lg-dl">Herunterladen</button></div>
      <pre class="logview" id="lg-view">${esc(tr('Lade …'))}</pre></div></div></section>`,
  ]
}

async function showLog() {
  const [kind, key] = sys.logSel.split(':')
  const q = new URLSearchParams({ kind, key, grep: sys.logGrep, lines: '300' })
  const r = await fetch(`${API}/logs/view?${q}`, { credentials: 'same-origin' }).catch(() => null)
  sys.logText = r?.ok ? await r.text() : tr('Das Protokoll ließ sich nicht lesen.')
  const view = $('#lg-view')
  if (!view) return
  const atEnd = view.scrollTop + view.clientHeight >= view.scrollHeight - 20
  view.textContent = sys.logText || tr('(leer)')
  if (atEnd || !sys.logShown) view.scrollTop = view.scrollHeight
  sys.logShown = true
}

function mountLogs(root) {
  sys.logShown = false
  const pick = (value) => {
    sys.logSel = value
    sys.logShown = false
    $('#lg-sel', root).value = value
    for (const b of root.querySelectorAll('[data-lg]')) b.setAttribute('aria-current', String(b.dataset.lg === value))
    showLog()
  }
  $('#lg-sel', root).onchange = (e) => pick(e.target.value)
  for (const b of root.querySelectorAll('[data-lg]')) b.onclick = () => pick(b.dataset.lg)
  let t = null
  $('#lg-grep', root).addEventListener('input', (e) => {
    sys.logGrep = e.target.value
    clearTimeout(t)
    t = setTimeout(showLog, 300)
  })
  $('#lg-refresh', root).onclick = showLog
  $('#lg-auto', root).onclick = (e) => {
    sys.logAuto = !sys.logAuto
    e.target.textContent = sys.logAuto ? 'Anhalten' : 'Mitlaufen'
    e.target.setAttribute('aria-pressed', String(sys.logAuto))
  }
  every(5000, () => sys.logAuto && showLog())
  $('#lg-dl', root).onclick = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([sys.logText], { type: 'text/plain' })), download: `${sys.logSel.split(':')[1]}.txt` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  $('#lg-debug', root).onchange = async (e) => {
    const r = await api(`${API}/controller-debug`, { method: 'POST', body: { on: e.target.checked } })
    if (!r.ok) {
      e.target.checked = !e.target.checked
      return toast('Das hat nicht geklappt', 'info')
    }
    toast(e.target.checked ? 'Ausführliches Player-Log an – der Player startet neu' : 'Ausführliches Player-Log aus – der Player startet neu')
  }
  showLog()
}

/* Browser (Chromium) */

async function loadBrowser() {
  const r = await api(`${API}/browser`)
  if (!r.ok) throw new Error(`browser ${r.status}`)
  sys.browser = r.body
  state.values.set('gpu', r.body.gpu)
  state.values.set('smooth', r.body.smooth)
  state.values.set('kiosk', r.body.kiosk)
  state.values.set('cache', `${r.body.cachesize} MB`)
  state.values.set('chromeDebug', r.body.debug)
}

/* Sprache */

async function loadLanguage() {
  const [r, o] = await Promise.all([api(`${API}/bootscreen`), api(`${API}/display-options`)])
  if (!r.ok) throw new Error(`bootscreen ${r.status}`)
  sys.bs = r.body
  // (the languages the box can speak: a new box language is its speaking language too, where there is one)
  sys.ttsLanguages = (o.body?.ttsLanguages ?? []).map((l) => l.code)
  const cur = r.body.current.bootscreenLanguage || 'en'
  state.values.set('boxLang', r.body.languages[cur]?.name ?? cur)
  const pref = getLangPref()
  state.values.set('appLang', pref === 'auto' ? APP_LANG_AUTO : LANGS[pref])
}

const APP_LANG_AUTO = LANG_AUTO_LABEL

/* Systemoptionen, Experten, Backup, Updates */

const adm = { opts: null, json: { key: 'mupiboxconfig', text: '', keys: [] }, host: '' }

async function loadSystemOptions() {
  const r = await api(`${API}/system-options`)
  if (!r.ok) throw new Error(`system-options ${r.status}`)
  adm.opts = r.body
  for (const k of ['ocSd', 'pm2Ram', 'waitNet', 'turbo', 'noWarn', 'swap']) state.values.set(k, r.body[k])
  state.values.set('gov', r.body.governor)
}

function rebootHint(text) {
  offerReboot(`${text} Das gilt erst nach einem Neustart der Box.`)
}

/* Netzwerk-Optionen */

const nopt = { opts: null, lan: null, drv: 'RTL88X2BU' }
const POWER_LABEL = { 0: 'Aus', 1: 'Minimal', 2: 'Maximal' }
const LAN_FIELDS = [
  ['lanIp', 'ip', 'IP-Adresse', 'z. B. 192.168.1.50'],
  ['lanMask', 'mask', 'Netzmaske', '255.255.255.0'],
  ['lanGw', 'gateway', 'Router (optional)', 'leer = PC direkt am Kabel'],
  ['lanDns', 'dns', 'DNS-Server (optional)', 'leer = der Router'],
]
const netDriver = () => nopt.opts?.drivers?.find((d) => d.id === nopt.drv)

async function loadNetOptions() {
  const [r, lan] = await Promise.all([api(`${API}/network-options`), api('/api/network/ethernet')])
  if (!r.ok) throw new Error(`network-options ${r.status}`)
  nopt.opts = r.body
  nopt.lan = lan.ok ? lan.body : null
  const v = state.values
  v.set('wOnboard', r.body.onboard)
  v.set('dhcpTo', r.body.dhcpTimeout)
  v.set('wMon', r.body.wifiMonitor)
  v.set('wBest', r.body.bestConnection)
  v.set('usbDrv', nopt.drv)
  v.set('usbPm', POWER_LABEL[netDriver()?.power] ?? 'Standard')
  if (nopt.lan) {
    // (the switch as it is set, not whether a cable has a link: without a cable it read "off" although nothing was
    // switched off - the cable has a line of its own on the page)
    v.set('lanOn', !nopt.lan.off)
    v.set('lanMode', nopt.lan.dhcp ? 'DHCP' : 'Statisch')
    for (const [key, field] of LAN_FIELDS) v.set(key, nopt.lan[field] ?? '')
  }
}

function wlanNetSections() {
  const o = nopt.opts
  const d = netDriver()
  const job = d?.job ?? {}
  const onboardHelp = o.onboardBootDisabled
    ? 'Im Moment ganz abgeschaltet – Einschalten gilt nach einem Neustart der Box.'
    : o.onboardRadio === 'unavailable'
      ? 'Kein eingebautes WLAN gefunden.'
      : o.onboardIface && o.onboardIface === o.wifiIface
        ? 'Die Box ist gerade darüber verbunden.'
        : 'Das eingebaute WLAN des Raspberry Pi. Ein USB-WLAN-Adapter bleibt davon unberührt.'
  const driverState = job.running
    ? `Wird gerade ${job.action === 'remove' ? 'entfernt' : 'installiert'} – das dauert einige Minuten.`
    : d?.installed
      ? `Installiert${o.usbIface ? ` · Adapter ${o.usbIface} erkannt` : ''}`
      : 'Nicht installiert'
  const hardware = [
    { type: 'toggle', label: 'Onboard-WLAN an', key: 'wOnboard', help: onboardHelp },
    { type: 'select', label: 'USB-WLAN-Treiber', key: 'usbDrv', options: (o.drivers ?? []).map((x) => x.id), help: driverState },
  ]
  if (job.headersMissing) hardware.push({ type: 'warn', text: 'Die Kernel-Header fehlen, der Treiber ließ sich nicht bauen. In /boot/config.txt muss arm_64bit zum System passen.' })
  else if (job.ok === false && !job.running) hardware.push({ type: 'warn', text: 'Das hat nicht geklappt – Details unter System › Protokolle.' })
  if (!job.running) hardware.push({ type: 'buttons', buttons: [[d?.installed ? 'Treiber entfernen' : 'Treiber installieren', d?.installed ? 'danger' : 'ghost', 'driver']] })
  if (d?.installed) {
    hardware.push({ type: 'select', label: 'Stromsparen des USB-Adapters', key: 'usbPm', options: ['Aus', 'Minimal', 'Maximal'], help: 'Aus = stabilere Verbindung bei manchen Adaptern. Gilt nach einem Neustart.' })
  }
  return [
    {
      title: 'WLAN-Wächter',
      col: 1,
      items: [
        { type: 'toggle', label: 'WLAN-Wächter (DietPi-WiFi-Monitor)', key: 'wMon', help: 'Baut die Verbindung neu auf, wenn sie abreißt.' },
        { type: 'toggle', label: 'Beste Verbindung suchen', key: 'wBest', help: 'Wechselt bei mehreren gespeicherten Netzen zum stärksten.' },
        { type: 'buttons', buttons: [['WLAN neu starten', 'ghost', 'wifirestart']] },
      ],
    },
    { title: 'Adresse (DHCP)', col: 2, items: dhcpItems('wifi') },
    { title: 'WLAN-Hardware', col: 2, items: hardware },
  ]
}

// The address from the router, on the pages WLAN and LAN: the timeout at the start (one value for both - a line of
// dhclient.conf) and fetching the address anew (only that connection's)
const DHCP_TIMEOUT_HELP = 'Beim Start höchstens 10 Sekunden auf eine Adresse warten – gilt für WLAN und LAN.'
function dhcpItems(which) {
  return [
    { type: 'toggle', label: 'DHCP-Timeout', key: 'dhcpTo', help: DHCP_TIMEOUT_HELP },
    { type: 'buttons', buttons: [['Adresse neu holen', 'ghost', which === 'lan' ? 'dhcprenewlan' : 'dhcprenew']] },
  ]
}

// Netzwerk › LAN: the cable
function lanSections() {
  const l = nopt.lan
  if (!l) return [{ title: 'LAN', items: [{ type: 'note', text: 'Diese Box hat keinen LAN-Anschluss, oder er ließ sich nicht lesen.' }] }]
  const cable = l.off ? 'Anschluss ausgeschaltet' : l.carrier === true ? 'verbunden' : l.carrier === false ? 'kein Kabel' : '–'
  const now = [['Kabel', cable], ['Adresse', l.currentIp ?? '–'], ...(l.currentIpv6 ?? []).map((a) => ['IPv6-Adresse', a]), ['Router', l.currentGateway ?? '–']]
  const lan = [
    { type: 'toggle', label: 'LAN an', key: 'lanOn', help: l.off ? 'Ausgeschaltet – bleibt aus, bis es hier wieder eingeschaltet wird.' : 'Mit Kabel hat LAN Vorrang vor dem WLAN.' },
    { type: 'kv', rows: now },
    { type: 'seg', label: 'Adresse beziehen', key: 'lanMode', options: ['DHCP', 'Statisch'] },
  ]
  if (state.values.get('lanMode') === 'Statisch') {
    for (const [key, , label, placeholder] of LAN_FIELDS) lan.push({ type: 'text', label, key, placeholder })
  }
  lan.push({ type: 'buttons', buttons: [['Speichern', 'primary', 'lansave'], ['LAN neu starten', 'ghost', 'lanrestart']] })
  const sections = [{ title: `LAN (${l.interface})`, help: l.currentIp || l.off || l.carrier !== false ? 'Der Kabelanschluss der Box.' : 'Der Kabelanschluss der Box. Im Moment steckt kein Kabel.', items: lan }]
  // (with a fixed address as saved: no DHCP)
  if (l.dhcp) sections.push({ title: 'Adresse (DHCP)', items: dhcpItems('lan') })
  return sections
}

// while a driver is built or removed: its state every 5 s, the page again when it is done
function pollDriverJob(page) {
  stopPageTimers()
  every(5000, async () => {
    const r = await api(`${API}/network-options`)
    if (!r.ok || r.body.drivers.some((x) => x.job.running)) return
    stopPageTimers()
    const job = r.body.drivers.find((x) => x.id === nopt.drv)?.job ?? {}
    if (currentPage()?.id !== page.id) return
    await loadNetOptions().catch(() => undefined)
    renderPage(page, false)
    if (job.ok) offerReboot(`Treiber ${job.action === 'remove' ? 'entfernt' : 'installiert'}. Das gilt erst nach einem Neustart der Box.`)
  })
}

const NET_OPTION = { wOnboard: 'onboard', dhcpTo: 'dhcpTimeout', wMon: 'wifiMonitor', wBest: 'bestConnection' }

async function changeNetOption(key, v, page) {
  const back = async () => {
    await loadNetOptions().catch(() => undefined)
    renderPage(page, false)
  }
  if (key === 'usbDrv') {
    nopt.drv = v
    state.values.set('usbPm', POWER_LABEL[netDriver()?.power] ?? 'Standard')
    return renderPage(page, false)
  }
  if (key === 'lanMode') return renderPage(page, false)
  if (key.startsWith('lan') && key !== 'lanOn') return // saved with "Speichern"
  if (key === 'usbPm') {
    const level = Object.keys(POWER_LABEL).find((k) => POWER_LABEL[k] === v)
    const r = await api(`${API}/usb-wifi-power`, { method: 'POST', body: { driver: nopt.drv, level } })
    return r.ok ? rebootHint('Gespeichert.') : toast('Nicht gespeichert', 'info')
  }
  if (key === 'lanOn') {
    const text = 'Der Anschluss bleibt aus, auch nach einem Neustart, bis er hier wieder eingeschaltet wird. Die Box ist dann nur noch über WLAN erreichbar.'
    if (!v && !(await ask('LAN ausschalten?', text, 'Ausschalten'))) return back()
    const r = await api('/api/network/ethernet/power', { method: 'POST', body: { enabled: v } })
    toast(r.ok ? (v ? 'LAN an' : 'LAN aus') : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    return setTimeout(back, 2000)
  }
  if (key === 'wOnboard' && !v && nopt.opts.onboardIface && nopt.opts.onboardIface === nopt.opts.wifiIface) {
    const text = 'Die Box ist gerade über das eingebaute WLAN verbunden. Ohne LAN-Kabel oder USB-WLAN ist sie danach nicht mehr erreichbar.'
    if (!(await ask('Onboard-WLAN ausschalten?', text, 'Ausschalten'))) return back()
  }
  const r = await api(`${API}/network-options`, { method: 'POST', body: { key: NET_OPTION[key], value: v } })
  if (!r.ok) {
    toast('Das hat nicht geklappt', 'info')
    return back()
  }
  if (r.body?.rebootNeeded) rebootHint('Eingeschaltet.')
  else toast('Gespeichert')
  if (key === 'wOnboard') back()
}

const LAN_ERROR = {
  'Static IP is not a valid IPv4 address': 'Die IP-Adresse stimmt nicht (Form 192.168.1.50)',
  'Static mask is not a valid IPv4 address': 'Die Netzmaske stimmt nicht (meist 255.255.255.0)',
  'Static gateway is not a valid IPv4 address': 'Die Router-Adresse stimmt nicht',
  'Static DNS is not a valid IPv4 address': 'Die DNS-Adresse stimmt nicht',
}

async function saveLan(page) {
  const dhcp = state.values.get('lanMode') !== 'Statisch'
  const body = { dhcp }
  for (const [key, field] of LAN_FIELDS) body[field] = dhcp ? '' : String(state.values.get(key) ?? '').trim()
  // (a typo in a fixed address makes the box unreachable over the cable: asked first, with the address; without a
  // router - a PC plugged straight in - the internet stays with the WiFi)
  const text = body.gateway
    ? `Die Box ist über das Kabel danach unter ${body.ip || '?'} erreichbar – die LAN-Verbindung startet dafür neu. Übernehmen?`
    : `Ohne Router ist die Box über das Kabel nur aus diesem Netz erreichbar, unter ${body.ip || '?'} – etwa von einem PC direkt am Kabel. Ins Internet geht sie weiter über das WLAN. Die LAN-Verbindung startet dafür neu. Übernehmen?`
  if (!dhcp && !(await ask('Feste Adresse', text, 'Übernehmen'))) return
  const r = await api('/api/network/ethernet', { method: 'POST', body })
  if (!r.ok) return toast(LAN_ERROR[r.text] ?? 'Nicht gespeichert', 'info')
  // the new config only takes effect with the port taken down and up
  await api('/api/network/ethernet/restart', { method: 'POST' })
  toast('Gespeichert – LAN startet neu')
  setTimeout(async () => {
    await loadNetOptions().catch(() => undefined)
    if (currentPage()?.id === page.id) renderPage(page, false)
  }, 5000)
}

// The address of the WiFi (lan: of the cable) fetched anew from the router (see dhcp/renew in eltern/network.ts)
async function renewAddress(lan) {
  const text = lan
    ? 'Die Box holt sich ihre Adresse am Kabel neu vom Router. Die Verbindung ist dabei für einen Moment weg.'
    : 'Die Box holt sich ihre Adresse im WLAN neu vom Router. Die Verbindung ist dabei für einen Moment weg.'
  if (!(await ask('Adresse neu holen?', text, 'Neu holen'))) return
  const r = await api(`${API}/dhcp/renew`, { method: 'POST', body: lan ? { lan } : {} })
  toast(r.ok ? 'Wird neu geholt' : r.status === 409 ? 'Hier gibt es gerade keine Adresse per DHCP' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
}

// The options and actions of the network pages WLAN and LAN (see wlanCtrl, lanCtrl)
const netOptionsCtrl = {
  load: loadNetOptions,
  change: changeNetOption,
  act: {
    async driver(_arg, _label, page) {
      const d = netDriver()
      const install = !d.installed
      const ok = await ask(
        install ? `Treiber ${d.label} installieren?` : `Treiber ${d.label} entfernen?`,
        install
          ? 'Der Treiber wird auf der Box gebaut. Das dauert einige Minuten, so lange zeigt die Box eine Wartungsanzeige. Danach die Box neu starten.'
          : 'Ein USB-WLAN-Adapter mit diesem Chip funktioniert danach nicht mehr.',
        install ? 'Installieren' : 'Entfernen',
      )
      if (!ok) return
      const r = await api(`${API}/usb-wifi-driver`, { method: 'POST', body: { driver: d.id, action: install ? 'install' : 'remove' } })
      if (!r.ok) return toast(r.status === 409 ? 'Es läuft schon eine Treiber-Installation' : 'Das hat nicht geklappt', 'info')
      d.job = { running: true, action: install ? 'install' : 'remove' }
      renderPage(page, false)
    },
    async wifirestart() {
      if (!(await ask('WLAN neu starten?', 'Die Verbindung ist für einen Moment weg, die App meldet sich danach von selbst wieder.', 'Neu starten'))) return
      const r = await api(`${API}/wifi/restart`, { method: 'POST' })
      toast(r.ok ? 'WLAN startet neu' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    },
    dhcprenew: () => renewAddress(),
    dhcprenewlan: () => renewAddress(nopt.lan?.interface),
    lansave: (_arg, _label, page) => saveLan(page),
    async lanrestart() {
      const r = await api('/api/network/ethernet/restart', { method: 'POST' })
      toast(r.ok ? 'LAN startet neu' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
    },
  },
}

// Netzwerk › WLAN: the connection and networks (wlanTop), below them the WLAN's hardware and watchdog
// (without the options - they did not load - the networks are still there)
const wlanCtrl = {
  load: () => Promise.all([loadWlan(), loadNetOptions().catch(() => (nopt.opts = null))]),
  top: wlanTop,
  sections: () => (nopt.opts ? wlanNetSections() : []),
  mount(root, page) {
    mountWlan(root, page)
    if (nopt.opts?.drivers?.some((x) => x.job.running)) pollDriverJob(page)
  },
  change: changeNetOption,
  act: netOptionsCtrl.act,
}

// Netzwerk › LAN: the cable - on, its address now, DHCP or a fixed one
const lanCtrl = { load: loadNetOptions, sections: lanSections, change: changeNetOption, act: netOptionsCtrl.act }

/* Experten */

async function loadExperts() {
  const [json, info] = await Promise.all([api(`${API}/json-file?key=${adm.json.key}`), api(`${API}/system`)])
  adm.json.keys = json.body?.keys ?? []
  adm.json.text = json.body?.text ?? ''
  adm.host = info.body?.hostname ?? ''
}

const JSON_LABEL = {
  mupiboxconfig: 'mupiboxconfig.json (Box)',
  data: 'data.json (Bibliothek)',
  config: 'config.json (Server)',
  resume: 'resume.json',
  monitor: 'monitor.json',
  offline_resume: 'offline_resume.json',
  offline_monitor: 'offline_monitor.json',
}

function expertsTop() {
  const resets = [
    ['config', 'Box-Konfiguration zurücksetzen', 'Alle Einstellungen auf den Stand der installierten Version (Spotify, Telegram, WLAN-Liste bleiben nicht erhalten). Das Passwort bleibt.'],
    ['library', 'Bibliothek leeren', 'Alle Einträge der Bibliothek (data.json) weg. Die Tages-Sicherungen bleiben, Dateien auf SD-Karte und NAS auch.'],
    ['server', 'Server-Konfiguration zurücksetzen', 'config.json des Servers aus der Vorlage; der Server startet neu.'],
  ]
  return [
    `<section class="card"><h2>Hostname</h2><p class="help">Der Name der Box im Netzwerk (z. B. http://mupibox/). Buchstaben, Ziffern und „-“.</p>
      <div class="field"><label for="ex-host">Hostname</label><input class="input mono" id="ex-host" maxlength="63" value="${esc(adm.host)}" autocomplete="off"></div>
      <div class="btns"><button class="btn primary" id="ex-hostsave">Speichern</button></div></section>`,
    // (beside the host name: both short)
    `<section class="card"><h2>Weitere Werkzeuge</h2><div class="navlist">${navRow('ext:dietpi', 'DietPi-Dashboard', 'Systemverwaltung von DietPi (Port 5252)', 'ext')}${navRow('ext:admin', 'Bisheriges Admin-Interface', 'Port 80', 'ext')}</div></section>`,
    `<section class="card wide"><h2>Konfiguration direkt bearbeiten</h2>
      <div class="note warn">${icon('info', 18)}<span>Fehler hier können die Box lahmlegen. Nur ändern, was du kennst – vorher ein Backup ziehen.</span></div>
      <div class="field"><label for="ex-file">Datei</label><select class="input" id="ex-file">${adm.json.keys.map((k) => `<option value="${k}"${k === adm.json.key ? ' selected' : ''}>${esc(JSON_LABEL[k] ?? k)}</option>`).join('')}</select></div>
      <textarea class="input json-edit" id="ex-json" spellcheck="false">${esc(adm.json.text)}</textarea>
      <p class="help" id="ex-jsonmsg" style="margin:0"></p>
      <div class="btns"><button class="btn danger" id="ex-jsonsave">Speichern</button><button class="btn" id="ex-jsonreload">Neu laden</button></div></section>`,
    // (last, across the whole width and set apart: what cannot be undone; on a wide screen the three side by side)
    `<section class="card wide danger-zone"><h2>Zurücksetzen</h2><p class="help">Lässt sich nicht rückgängig machen – vorher ein Backup ziehen.</p><div class="rows three-col">${resets
      .map(([id, t, s]) => `<div class="entry"><span class="lbl"><b>${t}</b><small>${s}</small></span><button class="btn danger sm" data-reset="${id}">Zurücksetzen</button></div>`)
      .join('')}</div></section>`,
  ]
}

function mountExperts(root, page) {
  const area = $('#ex-json', root)
  const msg = $('#ex-jsonmsg', root)
  const check = () => {
    try {
      JSON.parse(area.value)
      msg.textContent = 'Gültiges JSON.'
      return true
    } catch (e) {
      msg.textContent = `Kein gültiges JSON: ${e.message}`
      return false
    }
  }
  area.addEventListener('input', check)
  $('#ex-file', root).onchange = async (e) => {
    adm.json.key = e.target.value
    await loadExperts().catch(() => undefined)
    renderPage(page, false)
  }
  $('#ex-jsonreload', root).onclick = async () => {
    await loadExperts().catch(() => undefined)
    renderPage(page, false)
  }
  $('#ex-jsonsave', root).onclick = async () => {
    if (!check()) return toast('Kein gültiges JSON – nicht gespeichert', 'info')
    if (!(await ask('Speichern', `${JSON_LABEL[adm.json.key] ?? adm.json.key} mit diesem Inhalt überschreiben?`, 'Speichern'))) return
    const r = await api(`${API}/json-file`, { method: 'POST', body: { key: adm.json.key, text: area.value } })
    toast(r.ok ? 'Gespeichert' : r.body?.error ?? 'Nicht gespeichert', r.ok ? 'ok' : 'info')
  }
  $('#ex-hostsave', root).onclick = async () => {
    const host = $('#ex-host', root).value.trim()
    if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(host)) return toast('Nur Buchstaben, Ziffern und „-“ (nicht am Anfang oder Ende)', 'info')
    if (host === adm.host) return toast('Nichts geändert', 'info')
    const r = await api(`${API}/hostname`, { method: 'POST', body: { host } })
    if (!r.ok) return toast('Das hat nicht geklappt', 'info')
    rebootHint(`Hostname „${host}“ gespeichert.`)
  }
  for (const b of root.querySelectorAll('[data-reset]')) {
    b.onclick = async () => {
      const what = b.dataset.reset
      const t = { config: 'die Box-Konfiguration', library: 'die Bibliothek', server: 'die Server-Konfiguration' }[what]
      if (!(await ask('Zurücksetzen', `Wirklich ${t} zurücksetzen? Das lässt sich nur mit einem Backup rückgängig machen.`, 'Zurücksetzen'))) return
      const r = await api(`${API}/reset`, { method: 'POST', body: { what } })
      if (!r.ok) return toast(r.body?.error ?? 'Das hat nicht geklappt', 'info')
      libChanged()
      if (r.body?.rebootNeeded) return rebootHint('Zurückgesetzt.')
      toast(what === 'server' ? 'Zurückgesetzt – der Server startet neu' : 'Zurückgesetzt')
    }
  }
  check()
}

/* Backup */

function backupTop() {
  return [
    `<section class="card"><h2>Sichern</h2>
      <div class="rows"><div class="entry"><span class="lbl"><b>Konfigurations-Backup</b><small>Einstellungen (mupiboxconfig.json), Bibliothek (data.json) und eigene Cover. Enthält auch Passwörter und Zugänge – gut aufbewahren.</small></span><a class="btn primary sm" href="${API}/backup?kind=config" download>Herunterladen</a></div>
        <div class="entry"><span class="lbl"><b>Voll-Backup</b><small>Dazu alle Medien der SD-Karte – kann mehrere GB groß sein und dauern.</small></span><a class="btn sm" href="${API}/backup?kind=full" download>Herunterladen</a></div></div></section>`,
    `<section class="card"><h2>Einspielen</h2><p class="help">Eine Backup-Datei dieser App oder des Admin-Interface. Sie überschreibt Einstellungen und Bibliothek; danach startet die Box neu.</p>
      <input type="file" id="bk-file" accept=".zip,application/zip" hidden>
      <div class="btns"><button class="btn" id="bk-pick">Backup-Datei wählen</button><button class="btn danger" id="bk-go" disabled>Backup einspielen</button></div>
      <p class="help" id="bk-name" style="margin:0"></p>
      <div class="bar" id="bk-bar" hidden><div class="track"><i id="bk-fill" style="width:0%"></i></div><small id="bk-text"></small></div></section>`,
  ]
}

function mountBackup(root) {
  let file = null
  $('#bk-pick', root).onclick = () => $('#bk-file', root).click()
  $('#bk-file', root).onchange = (e) => {
    file = e.target.files?.[0] ?? null
    $('#bk-name', root).textContent = file ? `${file.name} · ${formatBytes(file.size)}` : ''
    $('#bk-go', root).disabled = !file
  }
  $('#bk-go', root).onclick = async () => {
    if (!(await ask('Backup einspielen', `„${file.name}“ einspielen? Einstellungen und Bibliothek werden überschrieben, danach startet die Box neu.`, 'Einspielen'))) return
    $('#bk-bar', root).hidden = false
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${API}/backup/restore`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/zip')
    xhr.setRequestHeader('x-mupibox-csrf', state.csrf)
    xhr.upload.onprogress = (e) => {
      const pct = e.total ? (e.loaded / e.total) * 100 : 0
      $('#bk-fill', root).style.width = `${pct.toFixed(1)}%`
      $('#bk-text', root).textContent = pct < 100 ? `Lade hoch … ${Math.round(pct)} %` : 'Wird geprüft und eingespielt …'
    }
    xhr.onload = () => {
      let b = {}
      try {
        b = JSON.parse(xhr.responseText)
      } catch {
        // no JSON
      }
      if (xhr.status === 200) {
        $('#bk-text', root).textContent = 'Eingespielt – die Box startet gleich neu.'
        return toast('Backup eingespielt – die Box startet neu')
      }
      $('#bk-bar', root).hidden = true
      toast(b.error === 'entry_not_allowed' ? `Abgelehnt: „${b.entry}“ gehört nicht in ein Backup` : b.error === 'not a zip file' ? 'Das ist keine Zip-Datei' : b.error === 'not_enough_space' ? 'Zu wenig Platz auf der SD-Karte für dieses Backup' : b.error === 'restore_running' ? 'Es wird gerade schon ein Backup eingespielt' : 'Einspielen ging nicht', 'info')
    }
    xhr.onerror = () => {
      $('#bk-bar', root).hidden = true
      toast('Die Verbindung brach ab', 'info')
    }
    xhr.send(file)
  }
}

/* Updates */

/* Updates */

const upd = { info: null, job: null, offline: false, showOut: false }
const CHANNEL_LABEL = { stable: 'Stabil', beta: 'Beta', dev: 'Entwicklung' }
const JOB_LABEL = { stable: 'MuPiBox-Update · Stabil', beta: 'MuPiBox-Update · Beta', dev: 'MuPiBox-Update · Entwicklung', os: 'Betriebssystem-Update' }
const jobRunning = () => upd.job?.phase === 'running' || upd.job?.phase === 'rebooting'

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}
const installedNumber = () => /\d+(?:\.\d+)+/.exec(upd.info?.installed ?? '')?.[0] ?? null

async function loadUpdates() {
  const r = await api(`${API}/updates`)
  if (!r.ok) throw new Error(`updates ${r.status}`)
  upd.info = r.body
  upd.job = r.body.job
  upd.offline = false
}

function updJobCard() {
  const j = upd.job
  if (!j) return ''
  const when = (t) => (t ? new Date(t).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : '')
  const head = {
    running: 'Läuft …',
    rebooting: 'Fertig – die Box startet neu',
    ok: `Fertig${j.finished ? ` am ${when(j.finished)}` : ''}`,
    failed: `Nicht geklappt${j.finished ? ` (${when(j.finished)})` : ''}`,
  }[j.phase] ?? j.phase
  const pct = j.phase === 'running' ? j.percent : 100
  const note = upd.offline
    ? `<div class="note">${icon('info', 18)}<span>Die Box antwortet gerade nicht. Beim MuPiBox-Update ist das normal, der Server wird ausgetauscht. Die Seite fragt weiter nach.</span></div>`
    : j.phase === 'failed'
      ? `<div class="note warn">${icon('info', 18)}<span>${j.kind === 'os' ? 'Das Betriebssystem-Update ist abgebrochen.' : 'Das Update ist abgebrochen. Die bisherige Installation ist noch da; Einstellungen und Bibliothek liegen zusätzlich in /home/dietpi/mupibox-backups.'} Details in der Ausgabe.</span></div>`
      : ''
  return `<section class="card wide" id="upd-job"><h2>${esc(JOB_LABEL[j.kind] ?? 'Update')}</h2>
    <div class="bar"><div class="slider-head"><b>${esc(head)}</b><span class="value-pill">${pct} %</span></div>
      <div class="track"><i style="--w:${pct}%"></i></div>${j.step && j.phase === 'running' ? `<small>${esc(j.step)}</small>` : ''}</div>
    ${note}
    ${j.phase === 'ok' && j.kind === 'os' ? `<div class="btns"><button class="btn primary" id="upd-reboot">Box neu starten</button></div>` : ''}
    ${j.output ? `<details id="upd-out"${upd.showOut ? ' open' : ''}><summary class="help">Ausgabe</summary><pre class="logview" style="height:240px">${esc(j.output)}</pre></details>` : ''}</section>`
}

function updatesTop() {
  const i = upd.info
  const mine = installedNumber()
  const busy = jobRunning()
  const rows = ['stable', 'beta', 'dev']
    .map((c) => {
      const rel = i?.latest?.[c]
      if (!rel) return ''
      const same = mine && cmpVersion(rel.version, mine) === 0 && i.channel === c
      const older = mine && cmpVersion(rel.version, mine) < 0
      const label = same ? 'Neu installieren' : older ? 'Installieren (älter)' : 'Installieren'
      const kind = c === 'dev' ? 'danger' : c === 'stable' && !same && !older ? 'primary' : ''
      const ver = c === 'dev' && i.devDate ? `${rel.version} · Stand ${i.devDate}` : rel.version
      return `<div class="row"><span class="lbl"><b>${esc(CHANNEL_LABEL[c])} · ${esc(ver)}</b><small>${esc(rel.info)}</small></span>
        <button class="btn ${kind}" data-upd="${c}" ${busy ? 'disabled' : ''}>${label}</button></div>`
    })
    .join('')
  return [
    updJobCard(),
    `<section class="card"><h2>MuPiBox</h2><dl class="kv"><div><dt>Installiert</dt><dd>${esc(i?.installed || '–')}</dd></div></dl>
      ${i?.update ? `<div class="note">${icon('sync', 18)}<span>Neue Version ${esc(i.update.version)} verfügbar.</span></div>` : ''}
      ${rows || `<p class="help">Die Versionen des offiziellen Repositorys ließen sich nicht laden (keine Internetverbindung?).</p>`}
      <p class="help" style="margin:0">Aus dem offiziellen MuPiBox-Repository (splitti/MuPiBox). Die Box ist dabei 10–30 Minuten nicht nutzbar und startet danach von selbst neu. Einstellungen und Bibliothek bleiben erhalten und werden vorher zusätzlich auf der Box gesichert.</p></section>`,
    // (the system and the backup one below the other: beside the long MuPiBox card on a wide screen, no gap between)
    `<div class="col-stack"><section class="card"><h2>Betriebssystem</h2><p class="help">Aktualisiert die Pakete des Systems (apt). Dauert auf älteren Raspberry Pis bis zu 30 Minuten; die Box läuft dabei weiter. Danach neu starten.</p>
      <div class="btns"><button class="btn" data-upd="os" ${busy ? 'disabled' : ''}>Betriebssystem aktualisieren</button></div></section>
      <div class="card nav-card"><div class="navlist">${navRow('backup', 'Backup', 'Vorher herunterladen', 'save')}</div></div></div>`,
  ]
}

async function startUpdate(kind, page) {
  const i = upd.info
  const rel = i?.latest?.[kind]
  const mine = installedNumber()
  let title
  let text
  if (kind === 'os') {
    title = 'Betriebssystem aktualisieren?'
    text = 'Die Pakete des Systems werden aktualisiert. Das dauert einige Minuten bis eine halbe Stunde; die Box läuft dabei weiter. Am besten am Netzteil.'
  } else {
    title = `MuPiBox ${rel.version} installieren?`
    text = `${CHANNEL_LABEL[kind]}-Version aus dem offiziellen Repository. Die Box zeigt 10–30 Minuten eine Wartungsanzeige und startet danach von selbst neu. Am besten am Netzteil.`
    if (kind === 'dev') text += ' Die Entwicklungsversion kann die Installation beschädigen.'
    if (mine && cmpVersion(rel.version, mine) < 0) text += ` Das ist eine ältere Version als die installierte (${mine}).`
  }
  if (!(await ask(title, text, kind === 'os' ? 'Aktualisieren' : 'Installieren'))) return
  const r = await api(`${API}/updates/start`, { method: 'POST', body: { kind } })
  if (!r.ok) return toast(r.status === 409 ? 'Es läuft schon ein Update' : 'Das Update ließ sich nicht starten', 'info')
  upd.job = { kind, phase: 'running', percent: 0, step: 'Start', output: '' }
  upd.showOut = false
  renderPage(page, false)
}

// the running update: its state every 3 s (the box may not answer for a while), the page again when it is done
function pollUpdate(page) {
  stopPageTimers()
  every(3000, async () => {
    const r = await api(`${API}/updates/job`)
    if (!r.ok || !r.body?.job) {
      if (!upd.offline) {
        upd.offline = true
        drawUpdJob()
      }
      return
    }
    const was = upd.job?.phase
    upd.job = r.body.job
    upd.offline = false
    if (jobRunning()) return drawUpdJob()
    stopPageTimers()
    if (was !== upd.job.phase && currentPage()?.id === page.id) {
      await loadUpdates().catch(() => undefined)
      renderPage(page, false)
    }
  })
}

function drawUpdJob() {
  const card = $('#upd-job')
  if (!card) return
  card.outerHTML = updJobCard()
  bindUpdJob()
}

function bindUpdJob() {
  const out = $('#upd-out')
  if (out) out.ontoggle = () => (upd.showOut = out.open)
  const reboot = $('#upd-reboot')
  if (reboot) reboot.onclick = () => offerReboot('Das Betriebssystem ist aktualisiert.')
}

function mountUpdates(root, page) {
  for (const b of root.querySelectorAll('[data-upd]')) b.onclick = () => startUpdate(b.dataset.upd, page)
  bindUpdJob()
  if (jobRunning()) pollUpdate(page)
}

// Einstellungen › Dienste: the block with the box's own shares (Samba, FTP, VNC)
const isSharesSection = (s) => (s.items ?? []).some((it) => it.target === 'freigaben')

/* the controllers: load(page) reads the box before drawing, mount(root, page) runs after it, change(key, value)
   saves a setting, act / byLabel run the buttons, sections(page) gives the building blocks with the box's values,
   top(page) draws the page's own top part (instead of customTop's), ownNav: the page shows its sub pages itself */
const CONTROLLERS = {
  spielzeit: {
    load: loadCaps,
    mount(root) {
      drawRing()
      drawSleep()
      bonusButton(root)
      every(20000, refreshPlaytime)
    },
    change(key, v) {
      switch (key) {
        case 'limitOn':
          bonusButton($('#content'), v)
          return saveCaps({ playtimeLimit: { enabled: v } }, v ? 'Tageslimits an' : 'Tageslimits aus')
        case 'quietOn':
          return saveCaps({ quietHours: { enabled: v } }, v ? 'Ruhezeiten an' : 'Ruhezeiten aus')
        case 'limitGrace':
          return saveCaps({ playtimeLimit: { graceMode: GRACE[v] } })
        case 'quietGrace':
          return saveCaps({ quietHours: { graceMode: GRACE[v] } })
        case 'limitGraceMax':
          return saveCaps({ playtimeLimit: { graceMaxMinutes: graceMaxOf(v) } }, `Höchstens ${v} weiter`)
        case 'quietGraceMax':
          return saveCaps({ quietHours: { graceMaxMinutes: graceMaxOf(v) } }, `Höchstens ${v} weiter`)
        case 'resetHour': {
          const h = Number(v)
          // (an emptied field is no "0:00")
          if (String(v).trim() === '' || !Number.isInteger(h) || h < 0 || h > 23) {
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
        for (const x of b.parentElement.children) x.setAttribute('aria-selected', String(x === b))
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        drawLib()
      }
      drawLib()
      // known state first, then read again (the sync or the box may have changed it)
      if (Date.now() - (lib.loadedAt ?? 0) > 5000) {
        lib.loadedAt = Date.now()
        loadLib().then(() => {
          if (currentPage()?.id !== 'bibliothek') return
          drawLib()
        })
      }
      // Open for a while: a sync run or an upload elsewhere shows up by itself. The box's change token (data.json and
      // the SD card's folders) is asked once a minute; the list is only read again when it moved.
      const token = async () => {
        const r = await api('/api/data-version')
        return r.ok ? `${r.body?.version}|${r.body?.local}` : null
      }
      const mounted = ++lib.mounts
      token().then((first) => {
        // (left or drawn anew meanwhile: no timer for a page that is gone)
        if (currentPage()?.id !== 'bibliothek' || mounted !== lib.mounts) return
        let known = first
        every(60_000, async () => {
          const now = await token()
          if (!now || now === known) return
          known = now
          await loadLib()
          lib.loadedAt = Date.now()
          if (currentPage()?.id === 'bibliothek') drawLib()
        })
      })
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
  podsuche: {
    load: loadServices,
    top: podTop,
    sections: () => [],
    mount(root) {
      const q = $('#pod-q', root)
      // (switched off: only the way to switch it on)
      if (!q) return $('#pod-services', root)?.addEventListener('click', () => go('g-dienste'))
      q.addEventListener('input', () => {
        pod.q = q.value
        // (the field emptied: the suggestions again)
        if (!pod.q.trim() && pod.result) {
          pod.result = null
          loadPodSuggestions()
        }
      })
      q.addEventListener('keydown', (e) => e.key === 'Enter' && doPodSearch())
      $('#pod-lang', root).onchange = (e) => {
        pod.lang = e.target.value
        try {
          localStorage.setItem('mupi-pod-lang', pod.lang)
        } catch {
          // (private mode: for this visit)
        }
        if (pod.q.trim().length >= 2) doPodSearch()
        else loadPodSuggestions()
      }
      $('#pod-kids', root).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        pod.kids = b.dataset.v === '1'
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
        if (pod.q.trim().length >= 2) doPodSearch()
      }
      $('#pod-go', root).onclick = doPodSearch
      if (pod.result) drawPod()
      else loadPodSuggestions()
    },
  },
  radiosuche: {
    load: loadServices,
    top: radioTop,
    sections: () => [],
    mount(root) {
      const q = $('#radio-q', root)
      // (switched off: only the way to switch it on)
      if (!q) return $('#radio-services', root)?.addEventListener('click', () => go('g-dienste'))
      q.addEventListener('input', () => {
        radio.q = q.value
        if (!radio.q.trim() && radio.result) {
          radio.result = null
          loadRadioSuggestions()
        }
      })
      q.addEventListener('keydown', (e) => e.key === 'Enter' && doRadioSearch())
      $('#radio-lang', root).onchange = (e) => {
        pod.lang = e.target.value
        try {
          localStorage.setItem('mupi-pod-lang', pod.lang)
        } catch {
          // (private mode: for this visit)
        }
        if (radio.q.trim().length >= 2) doRadioSearch()
        else loadRadioSuggestions()
      }
      $('#radio-kids', root).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        radio.kids = b.dataset.v === '1'
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b))
        if (radio.q.trim().length >= 2) doRadioSearch()
      }
      $('#radio-go', root).onclick = doRadioSearch
      if (radio.result) drawRadio()
      else loadRadioSuggestions()
    },
  },
  'g-dienste': {
    async load() {
      svc.at = 0
      await loadServices()
      state.values.set('svcPod', svc.podcasts)
      state.values.set('svcRadio', svc.radio)
      const h = await api(`${API}/feed-hosts`)
      svc.feedHosts = h.ok ? (h.body?.hosts ?? []) : []
    },
    // the podcast servers of the home network the box may fetch feeds from (see allowLanFeed) - below the other
    // services, above the box's own shares (Samba, FTP, VNC), which stay last
    sections: (page) => [
      ...page.sections.filter((s) => !isSharesSection(s)),
      {
        title: 'Server im Heimnetz',
        help: 'Podcast-Server im eigenen Netz, z. B. Pinepods oder Audiobookshelf. Andere Adressen im Heimnetz ruft die Box nicht ab. Ein Feed im Heimnetz fragt beim Hinzufügen selbst danach.',
        items: [
          {
            type: 'html',
            html: `${
              svc.feedHosts?.length
                ? `<div class="rows">${svc.feedHosts.map((h, i) => `<div class="entry"><span class="avatar">${icon('server', 16)}</span><span class="lbl"><b translate="no">${esc(h)}</b></span><button class="btn sm" data-fh-rm="${i}">Entfernen</button></div>`).join('')}</div>`
                : `<p class="help" style="margin:0">${esc('Noch keiner erlaubt.')}</p>`
            }
            <div class="field-pick"><input class="input" id="fh-new" placeholder="${esc('z. B. 192.168.1.20:8040')}" autocomplete="off" spellcheck="false" translate="no" ${NO_PW_MANAGER}><button type="button" class="btn" id="fh-add">${icon('plus', 16)}Erlauben</button></div>`,
          },
        ],
      },
      ...page.sections.filter(isSharesSection),
    ],
    mount(root, page) {
      const save = async (body, done) => {
        const r = await api(`${API}/feed-hosts`, { method: 'POST', body })
        if (!r.ok) return toast(r.body?.error === 'never_allowed' ? 'Das ist die Box selbst – nicht möglich' : r.body?.error === 'too_many' ? 'Es sind schon 20 Server erlaubt' : 'Die Adresse passt nicht', 'info')
        svc.feedHosts = r.body.hosts
        toast(done)
        renderPage(page, false)
      }
      for (const b of root.querySelectorAll('[data-fh-rm]')) b.onclick = () => save({ host: svc.feedHosts[Number(b.dataset.fhRm)], allow: false }, 'Entfernt')
      const add = () => {
        const v = $('#fh-new', root).value.trim()
        if (!v) return toast('Bitte eine Adresse eintragen', 'info')
        save({ url: /^https?:\/\//i.test(v) ? v : `http://${v}`, allow: true }, 'Erlaubt')
      }
      $('#fh-add', root).onclick = add
      $('#fh-new', root).onkeydown = (e) => e.key === 'Enter' && add()
    },
    async change(key, v) {
      const field = { svcPod: 'podcastSearch', svcRadio: 'radioSearch' }[key]
      if (!field) return
      const r = await api(`${API}/sources`, { method: 'POST', body: { [field]: !!v } })
      if (!r.ok) return toast('Nicht gespeichert', 'info')
      setSources(r.body)
      toast('Gespeichert')
    },
  },
  link: {
    // (without a Spotify login no Spotify kinds: a podcast is the first choice then)
    async load() {
      await loadServices()
      if (!svc.spotify && String(state.values.get('lType') ?? 'Spotify-Link').startsWith('Spotify')) {
        state.values.set('lType', 'Podcast (RSS)')
        state.values.set('lCat', 'Radio & Podcasts')
      }
    },
    // the fields that fit the kind of link (as the box's own add page)
    sections: (page) => {
      const type = state.values.get('lType') ?? 'Spotify-Link'
      const spotify = type.startsWith('Spotify')
      const radio = type === 'Radio-Stream'
      const part = !!state.values.get('lPart')
      const keep = (it) =>
        !it.key ||
        ({
          lTitle: radio,
          lSort: !radio,
          lShuffle: spotify,
          lPart: !radio,
          lFrom: !radio && part,
          lTo: !radio && part,
        }[it.key] ?? true)
      return page.sections.map((sec) => ({
        ...sec,
        items: sec.items.filter(keep).map((it) =>
          it.key === 'lType' && !svc.spotify
            ? { ...it, options: it.options.filter((o) => !o.startsWith('Spotify')) }
            : it.key === 'lUrl'
              ? {
                  ...it,
                  label: type === 'Spotify-Suche' ? 'Suchbegriff' : 'Link',
                  placeholder: type === 'Spotify-Suche' ? 'z. B. Benjamin Blümchen Folge 1' : 'https://…',
                  ...(svc.spotify ? {} : { help: 'Radio: auch eine .m3u- oder .pls-Datei – die Box liest die Stream-Adresse daraus. Podcast: die Adresse des Feeds.' }),
                }
              : it.key === 'lLabel' && type === 'Spotify-Suche'
                ? { ...it, label: 'Name der Kachel' }
                : it,
        ),
      }))
    },
    change(key, v, page) {
      if (key === 'lType') {
        state.values.set('lCat', v.startsWith('Spotify') ? 'Hörbuch/Hörspiel' : 'Radio & Podcasts')
        renderPage(page, false)
      }
      if (key === 'lPart') renderPage(page, false)
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
  spzugang: { load: loadSpotify, top: spotifyAccessTop, sections: () => [], mount: mountSpotifyAccess },
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
      // (each visit starts where something is missing; back from Spotify's login too)
      wz.step = null
      await Promise.all([loadSpotify().catch(() => undefined), state.values.has('prefix') ? null : loadSyncConfig().catch(() => undefined)])
    },
    top: wizardTop,
    sections: () => [],
    mount: mountWizard,
  },
  theme: { load: loadTheme, top: themeTop, sections: () => [], mount: mountTheme },
  eigenes: { load: loadTheme, top: bgTop, sections: () => [], mount: mountCustom },
  ansicht: {
    async load() {
      await Promise.all([loadTheme(), loadDisplayOptions()])
      state.values.set('stage', disp.theme.stage === true)
      state.values.set('tts', disp.theme.stageAutoRead === true)
      state.values.set('names', disp.opts.coverflowShowNames)
      state.values.set('hideScroll', disp.opts.hideScrollbar)
    },
    sections: (page) =>
      page.sections.map((sec) => ({
        ...sec,
        items: sec.items.map((it) => {
          const cur = themeLabel(disp.theme?.current ?? '')
          if (it.key === 'stage') return { ...it, help: `Große Cover in der Mitte, für die Kinder-Themes${isKidsTheme(disp.theme?.current) ? '' : ` – das aktive Theme (${cur}) nutzt sie nicht`}.` }
          // (reading names out works only with the cover flow: shown under it while it is on)
          if (it.key === 'tts') return { ...it, dep: 'stage' }
          if (it.key === 'names' || it.key === 'hideScroll') return { ...it, help: disp.theme?.current === 'coverflow' ? 'Nur beim Theme „coverflow“.' : `Nur beim Theme „coverflow“ – aktiv ist gerade „${cur}“.` }
          return it
        }),
      })),
    async change(key, v) {
      if (key === 'stage') {
        const r = await api(`${API}/theme-stage`, { method: 'POST', body: { stage: v } })
        return toast(r.ok ? (v ? 'Cover-Flow-Ansicht an' : 'Cover-Flow-Ansicht aus') : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
      }
      if (key === 'tts') {
        const r = await api(`${API}/theme-stage`, { method: 'POST', body: { autoRead: v } })
        return toast(r.ok ? (v ? 'Vorlesen an' : 'Vorlesen aus') : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
      }
      if (key === 'names') return saveDisplayOptions({ coverflowShowNames: v })
      if (key === 'hideScroll') return saveDisplayOptions({ hideScrollbar: v })
    },
  },
  startbilder: { load: loadBootscreens, top: bootTop, sections: () => [], ownNav: true, mount: mountBoot },
  displaytexte: { load: loadDisplayTexts, top: textsTop, sections: () => [], ownNav: true, mount: mountTexts },
  displaysettings: {
    load: loadDisplaySettings,
    // what works at once (brightness, switching off) | what the display takes after a restart (rotation, resolution)
    sections: (page) => {
      const it = (key, over) => schemaItem(page, key, over)
      const custom = !RES_PRESETS.some(([, x, y]) => x === Number(state.values.get('resX')) && y === Number(state.values.get('resY')))
      state.values.set('resCustom', custom)
      state.values.set('resPreset', custom ? 'Eigene …' : `${state.values.get('resX')} × ${state.values.get('resY')}`)
      return [
        {
          title: 'Helligkeit & Ausschalten',
          help: 'Gilt sofort.',
          items: [
            it('bright', { min: 5, disabled: disp.opts?.brightness == null, help: disp.opts?.brightness == null ? 'Dieses Display lässt sich nicht dimmen.' : '' }),
            it('dispOff', { stops: DISPLAY_OFF_STOPS, help: '' }),
          ],
        },
        {
          title: 'Abends dunkler',
          badge: state.values.get('ndOn') ? (disp.opts?.nightDim?.dimmed ? { text: 'gerade gedimmt', kind: 'ok' } : { text: 'an', kind: 'ok' }) : { text: 'aus' },
          items: [
            { type: 'toggle', key: 'ndOn', label: 'Abends dunkler', help: 'Das Display wird abends dunkler und morgens wieder normal hell.', disabled: disp.opts?.brightness == null },
            { type: 'pair', keep: true, dep: 'ndOn', items: [{ type: 'text', kind: 'time', key: 'ndFrom', label: 'Ab' }, { type: 'text', kind: 'time', key: 'ndTo', label: 'Bis' }] },
            { type: 'slider', key: 'ndLevel', label: 'Helligkeit am Abend', min: 5, max: 100, step: 5, unit: ' %', dep: 'ndOn', help: 'Nie heller als die normale Helligkeit.' },
            { type: 'slider', key: 'ndFade', label: 'Sanft abdunkeln über', stops: [0, 15, 30, 60], unit: ' min', zero: 'Sofort', dep: 'ndOn' },
            { type: 'toggle', key: 'ndQuiet', label: 'Auch während der Ruhezeiten', help: 'Zum Beispiel zur Schlafenszeit, auch wenn sie außerhalb der Uhrzeiten liegt.', dep: 'ndOn' },
          ],
        },
        {
          title: 'Drehung',
          help: 'Gilt nach einem Neustart der Box.',
          items: [
            { type: 'html', html: `<div class="field"><label>Display am HDMI-Anschluss</label>${rotTiles('hdmiRot', HDMI_ROT)}</div>` },
            {
              type: 'html',
              html: `<details class="more"><summary>Display am Flachbandkabel (DSI/LCD)</summary><div class="field"><label>LCD-Drehung</label>${rotTiles('lcdRot', LCD_ROT)}</div>
                <div class="field"><label>Display-LCD-Drehung</label>${rotTiles('dlcdRot', LCD_ROT)}</div></details>`,
            },
          ],
        },
        {
          title: 'Auflösung',
          help: 'Das Display startet damit gleich neu.',
          items: [
            { type: 'select', label: 'Größe', key: 'resPreset', options: [...RES_PRESETS.map(([l]) => l), 'Eigene …'] },
            { type: 'pair', dep: 'resCustom', keep: true, items: [it('resX', { label: 'Breite', unit: 'px' }), it('resY', { label: 'Höhe', unit: 'px' })] },
            { type: 'buttons', buttons: [['Auflösung übernehmen', 'primary', 'toast:Gespeichert']] },
          ],
        },
      ]
    },
    mount(root, page) {
      for (const b of root.querySelectorAll('[data-rot-key]')) {
        b.onclick = () => {
          const key = b.dataset.rotKey
          for (const x of root.querySelectorAll(`[data-rot-key="${key}"]`)) x.setAttribute('aria-pressed', String(x === b))
          state.values.set(key, b.dataset.rot)
          commitChange(page, key, b.dataset.rot, shownValues.get(key))
        }
      }
    },
    async change(key, v) {
      if (key === 'bright') return saveDisplayOptions({ brightness: v }, `Helligkeit ${v} %`)
      if (['ndOn', 'ndFrom', 'ndTo', 'ndLevel', 'ndFade', 'ndQuiet'].includes(key)) {
        const nightDim = { enabled: !!state.values.get('ndOn'), from: String(state.values.get('ndFrom')), to: String(state.values.get('ndTo')), level: Number(state.values.get('ndLevel')), fade: Number(state.values.get('ndFade')), withQuiet: !!state.values.get('ndQuiet') }
        if (nightDim.from === nightDim.to) return toast('Beginn und Ende brauchen verschiedene Uhrzeiten', 'info')
        return saveDisplayOptions({ nightDim }, key === 'ndOn' ? (nightDim.enabled ? `Abends dunkler: ${nightDim.from}–${nightDim.to} Uhr` : 'Abends dunkler ist aus') : 'Gespeichert')
      }
      if (key === 'dispOff') {
        const r = await api(`${API}/power-config`, { method: 'POST', body: { idleDisplayOff: Number(v) } })
        if (!r.ok) return toast('Nicht gespeichert', 'info')
        // the display reads the time when its page loads
        const rl = await api(`${API}/display/reload-page`, { method: 'POST', body: {} })
        return toast(`${Number(v) === 0 ? 'Display bleibt an' : `Display aus nach ${v} min`}. ${rl.body?.ok ? 'Das Display lädt neu.' : ''}`.trim())
      }
      const rot = { hdmiRot: ['display_hdmi_rotate', HDMI_ROT], lcdRot: ['lcd_rotate', LCD_ROT], dlcdRot: ['display_lcd_rotate', LCD_ROT] }[key]
      if (rot) return saveDisplayOptions({ rotation: { [rot[0]]: rotValue(rot[1], v) } }, 'Drehung gespeichert – gilt nach einem Neustart')
      if (key === 'resPreset') {
        const p = RES_PRESETS.find(([l]) => l === v)
        if (p) {
          state.values.set('resX', String(p[1]))
          state.values.set('resY', String(p[2]))
        }
        state.values.set('resCustom', !p)
        const pair = $('[data-dep="resCustom"]')
        if (pair) pair.hidden = !!p
      }
    },
    byLabel: {
      async 'Auflösung übernehmen'() {
        const resX = Number(state.values.get('resX'))
        const resY = Number(state.values.get('resY'))
        if (!Number.isInteger(resX) || !Number.isInteger(resY) || resX < 200 || resY < 200) return toast('Bitte Breite und Höhe in Pixeln eintragen', 'info')
        if (resX === disp.opts.resX && resY === disp.opts.resY) return toast('Nichts geändert', 'info')
        if (!(await ask('Auflösung ändern', `Das Display startet mit ${resX} × ${resY} Pixeln neu. Das dauert ein paar Sekunden.`, 'Übernehmen'))) return
        if (await saveDisplayOptions({ resX, resY }, 'Auflösung gespeichert')) Object.assign(disp.opts, { resX, resY })
      },
    },
  },
  bedienung: {
    load: loadControls,
    // the tabs of the display (switched on = shown), how long to hold, where it goes on, podcasts
    sections: (page) => {
      const it = (key, over) => schemaItem(page, key, over)
      const shown = TAB_KEYS.filter(([k]) => !state.values.get(k))
      for (const [k, show] of TAB_KEYS) state.values.set(show, !state.values.get(k))
      const setTimer = Number(state.values.get('setTimer'))
      return [
        {
          title: 'Reiter auf dem Display',
          help: 'Die sichtbaren Reiter teilen sich die Breite. Mindestens einer bleibt.',
          items: [
            { type: 'html', html: `<div class="tab-prev" aria-hidden="true">${shown.map(([, , l]) => `<span>${esc(l)}</span>`).join('')}</div>` },
            ...TAB_KEYS.map(([k, show, label]) => ({ type: 'toggle', key: show, label, disabled: shown.length === 1 && !state.values.get(k) })),
          ],
        },
        {
          title: 'Haltezeiten',
          items: [
            it('listTimer', { help: 'So lange drückt man auf ein Cover, bis die Titelliste aufgeht.' }),
            it('setTimer', { help: 'So lange drückt man auf die Status-Symbole oben, bis die Einstellungen der Box aufgehen.' }),
            ...(setTimer < 3 ? [{ type: 'warn', text: 'So kurz kommen Kinder leicht in die Einstellungen.' }] : []),
          ],
        },
        {
          title: 'Weiterhören',
          items: [
            { type: 'stepper', key: 'resume', label: 'Einträge unter „Fortsetzen“', help: 'So viele zuletzt gehörte Titel bietet das Display zum Weiterhören an.', min: 1, max: 99 },
            it('epResume', { label: 'Podcast-Folgen an der letzten Stelle weiterhören' }),
            it('epDays', { dep: 'epResume' }),
          ],
        },
        {
          title: 'Podcasts',
          help: 'Was neu ist und wie weit gehört – auf dem Display und in der App.',
          items: [it('epNew'), it('epNewDays', { dep: 'epNew' }), it('epProgress')],
        },
        {
          title: 'Kopfhörer',
          items: [
            {
              type: 'toggle',
              key: 'outPick',
              label: 'Box oder Kopfhörer am Display wählen',
              help: 'Ein Tipp auf die Lautstärke oben im Player öffnet „Hören mit“ – nur wenn ein Bluetooth-Gerät gekoppelt ist. In der App geht es immer.',
            },
          ],
        },
      ]
    },
    async change(key, v, page) {
      const cats = { hideA: 'audiobook', hideM: 'music', hideN: 'nas', hideO: 'other' }
      // (a tab switched on: not hidden)
      const tab = TAB_KEYS.find(([, show]) => show === key)
      if (tab) {
        state.values.set(tab[0], !v)
        const hidden = Object.entries(cats).filter(([k]) => state.values.get(k)).map(([, c]) => c)
        const ok = await saveDisplayOptions({ hiddenCategories: hidden })
        renderPage(page, false)
        return ok
      }
      if (key === 'setTimer') {
        const r = await saveDisplayOptions({ settingsAccessTimer: v }, `Einstellungen nach ${fmtSec(v)}`)
        renderPage(page, false)
        return r
      }
      if (key in cats) {
        const hidden = Object.entries(cats).filter(([k]) => state.values.get(k)).map(([, c]) => c)
        if (hidden.length === 4) {
          state.values.set(key, false)
          toast('Mindestens eine Kategorie bleibt sichtbar', 'info')
          return renderPage(page, false)
        }
        return saveDisplayOptions({ hiddenCategories: hidden })
      }
      if (key === 'resume') return saveDisplayOptions({ resume: v }, `${v} Fortsetzen-Einträge`)
      if (key === 'listTimer') return saveDisplayOptions({ listviewTimer: v }, `Titelliste nach ${fmtSec(v)}`)
      if (key === 'setTimer') return saveDisplayOptions({ settingsAccessTimer: v }, `Einstellungen nach ${fmtSec(v)}`)
      if (key === 'outPick') return saveDisplayOptions({ outputPicker: !!v }, v ? 'Kinder können am Display umschalten' : 'Umschalten nur in der App')
      if (key === 'epResume') return saveDisplayOptions({ episodeResume: !!v }, v ? 'Folgen gehen an der letzten Stelle weiter' : 'Folgen beginnen immer von vorn')
      if (key === 'epDays') {
        const days = EP_DAYS.find(([l]) => l === v)?.[1]
        if (days === undefined) return
        return saveDisplayOptions({ episodeResumeDays: days })
      }
      if (key === 'epNew') return saveDisplayOptions({ newEpisodes: !!v })
      if (key === 'epNewDays') {
        const days = Number.parseInt(String(v), 10)
        if ([3, 7, 14].includes(days)) return saveDisplayOptions({ newEpisodeDays: days })
      }
      if (key === 'epProgress') return saveDisplayOptions({ episodeProgress: !!v })
    },
  },
  displaylive: { top: liveTop, sections: () => [], mount: mountLive },
  lautstaerke: {
    load: loadVolume,
    sections: (page) => [
      ...withoutSave(page).map((sec) => ({
        ...sec,
        items: sec.items.flatMap((it) =>
          it.key === 'vol'
            ? {
                ...it,
                help:
                  hw.audio?.bluetooth && state.values.get('volBtOn')
                    ? `Höchstens ${state.values.get('volBtMax')} % – gerade mit Bluetooth-Kopfhörer oder -Lautsprecher.`
                    : `Höchstens ${state.values.get('volMax')} % (Hörschutz).`,
              }
            : it.key === 'volMax'
              ? [
                  { ...it, help: 'Lauter geht es auch am Display und per Telegram nicht.' },
                  { type: 'toggle', key: 'volBtOn', label: 'Eigene Grenze mit Bluetooth', help: 'Für Kopfhörer: gilt, solange Kopfhörer oder ein Lautsprecher per Bluetooth verbunden sind.' },
                  { type: 'slider', key: 'volBtMax', label: 'Maximum mit Bluetooth', min: 10, max: 100, step: 5, unit: ' %', dep: 'volBtOn', help: 'Ist die Box beim Verbinden lauter, geht sie gleich auf diesen Wert herunter.' },
                ]
              : it.key === 'volStart'
                ? // (never above the maximum; only with a fixed start value)
                  { ...it, max: Number(state.values.get('volMax')) || it.max, disabled: !state.values.get('volFix'), help: '' }
                : it,
        ),
      })),
      // (the player levels everything that is not Spotify - that plays through its own program)
      {
        title: 'Lautstärke angleichen',
        help: 'Hörspiele, Musik, Podcasts und Radio werden auf eine gemeinsame Lautheit gebracht – ein leises Hörspiel ist dann nicht leiser als das Album davor. Spotify spielt über sein eigenes Programm und bleibt, wie es ist.',
        items: [
          { type: 'toggle', key: 'loudOn', label: 'Lautstärke angleichen', help: 'Standard aus. Braucht etwas Rechenleistung – auf einem Pi 3 kann es beim Start eines Titels kurz ruckeln.' },
          ...(state.values.get('loudOn') ? [{ type: 'seg', key: 'loudMode', label: 'Stärke', options: ['Sanft', 'Kräftig'], help: 'Sanft lässt der Dynamik eines Hörspiels mehr Raum, kräftig gleicht stärker an.' }] : []),
        ],
      },
    ],
    async change(key, v, page) {
      if (key === 'loudOn' || key === 'loudMode') {
        const on = key === 'loudOn' ? !!v : !!state.values.get('loudOn')
        const strong = (key === 'loudMode' ? v : state.values.get('loudMode')) === 'Kräftig'
        const r = await api(`${API}/audio/config`, { method: 'POST', body: { loudness: on ? (strong ? 'strong' : 'soft') : 'off' } })
        if (!r.ok) return toast('Nicht gespeichert', 'info')
        toast('Gespeichert')
        if (key === 'loudOn') renderPage(page, false)
        return
      }
      if (key === 'vol') {
        const r = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
        if (!r.ok) return toast('Lautstärke ließ sich nicht setzen', 'info')
        if (r.body?.capped) {
          state.values.set('vol', r.body.applied)
          shownValues.set('vol', r.body.applied)
          renderPage(page, false)
          toast(`Hörschutz: höchstens ${r.body.applied} %`, 'info')
          return
        }
        return toast(`Lautstärke ${v} %`)
      }
      const body = key === 'volBtOn' ? { btMaxVolume: v ? Number(state.values.get('volBtMax')) : null } : key === 'volBtMax' ? (state.values.get('volBtOn') ? { btMaxVolume: v } : null) : key === 'volMax' ? { maxVolume: v } : key === 'volFix' ? { startupVolume: v ? Number(state.values.get('volStart')) : null } : key === 'volStart' && state.values.get('volFix') ? { startupVolume: v } : null
      if (!body) return
      const r = await api(`${API}/audio/config`, { method: 'POST', body })
      if (!r.ok) return toast('Nicht gespeichert', 'info')
      toast('Gespeichert')
      if (key === 'volFix') renderPage(page, false)
      if (key === 'volMax') {
        // (the box now louder than the new maximum: down to it at once; the start value keeps below it, see the backend)
        if (Number(state.values.get('vol')) > v) {
          await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
          state.values.set('vol', v)
        }
        if (Number(state.values.get('volStart')) > v) state.values.set('volStart', v)
        renderPage(page, false)
      }
    },
  },
  soundkarte: {
    async load() {
      await loadHardware()
      const sc = hw.data.soundcard
      state.values.set('sound', sc.options.find((o) => o.id === sc.current)?.name ?? sc.current)
    },
    sections: (page) =>
      withoutSave(page).map((sec) => ({
        ...sec,
        // (and what the system has found: a card chosen but not found here has no driver, or wants the restart)
        help: [
          hw.data.mupihat.active ? 'Mit dem MuPiHAT gehört die Soundkarte zum HAT (MAX98357A).' : '',
          'Wird nach einem Neustart übernommen.',
          hw.data.soundcard.detected?.length ? `Vom System erkannt: ${hw.data.soundcard.detected.join(', ')}.` : 'Das System erkennt gerade keine Soundkarte.',
        ]
          .filter(Boolean)
          .join(' '),
        items: sec.items.map((it) => (it.key === 'sound' ? { ...it, options: hw.data.soundcard.options.map((o) => o.name) } : it)),
      })),
    async change(key, v, page) {
      if (key !== 'sound') return
      const opt = hw.data.soundcard.options.find((o) => o.name === v)
      if (!opt || opt.id === hw.data.soundcard.current) return
      if (!(await ask('Soundkarte wechseln', `Auf „${v}“ umstellen? Die Box braucht danach einen Neustart.`, 'Umstellen'))) {
        state.values.set('sound', hw.data.soundcard.options.find((o) => o.id === hw.data.soundcard.current)?.name ?? '')
        return renderPage(page, false)
      }
      toast('Wird umgestellt …')
      const r = await api(`${API}/soundcard`, { method: 'POST', body: { id: opt.id } })
      // (the box checks what was written: DietPi's entry and, for the MAX98357A, its driver)
      if (r.body?.error === 'not_applied') return toast('Die Soundkarte wurde nicht übernommen – bitte noch einmal versuchen', 'info')
      if (!r.ok || r.body?.ok === false) return toast('Das hat nicht geklappt', 'info')
      hw.data.soundcard.current = opt.id
      offerReboot('Die neue Soundkarte gilt nach einem Neustart.')
    },
  },
  drehregler: {
    async load() {
      await loadHardware()
      const r = hw.data.rotary
      state.values.set('rotary', r.active)
      state.values.set('rotStep', r.step)
      state.values.set('btnFn', BTN_FN.find(([, v]) => v === r.button)?.[0] ?? 'Aus')
    },
    sections: (page) =>
      withoutSave(page).map((sec) => ({
        ...sec,
        help: 'Drehregler an GPIO 26/24, Taster an GPIO 10.',
        items: sec.items.map((it) => (it.key === 'btnFn' ? { ...it, label: 'Funktion des Tasters (GPIO 10)' } : it)),
      })),
    async change(key, v) {
      const body = key === 'rotary' ? { active: v } : key === 'rotStep' ? { step: v } : key === 'btnFn' ? { button: BTN_FN.find(([l]) => l === v)?.[1] } : null
      if (!body) return
      const r = await api(`${API}/rotary`, { method: 'POST', body })
      return toast(r.ok ? (key === 'rotary' ? (v ? 'Drehregler an' : 'Drehregler aus') : 'Gespeichert') : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    },
  },
  bluetooth: { load: loadBluetooth, top: btTop, sections: () => [], mount: mountBluetooth },
  sprachausgabe: { load: loadSpeech, top: speechTop, sections: () => [], mount: mountSpeech },
  akku: {
    load: loadBattery,
    top: batteryTop,
    sections: () => [],
    mount(root, page) {
      const reboot = $('#hat-reboot', root)
      if (reboot) reboot.onclick = () => offerReboot('Danach liest die Box den Akku wieder aus.')
      every(30000, async () => {
        await loadBattery().catch(() => undefined)
        if (currentPage()?.id === page.id) renderPage(page, false)
      })
    },
  },
  mupihat: {
    load: loadHat,
    // the HAT and its battery (with what it reads now) | the charge curve as a chart | when it warns and switches off,
    // how full it charges - checked while typing
    sections: (page) => {
      const it = (key, over) => schemaItem(page, key, over)
      const field = (key, label, sub) => it(key, { label, sub, help: '' })
      const usbOnly = hw.data.mupihat.battery === USB_C_PROFILE
      const hat = {
        title: 'MuPiHAT',
        col: 1,
        items: [
          it('hatOn', { help: 'Umschalten stellt auch die Soundkarte um und startet die Box neu.' }),
          it('battery', { options: batteryOptions(hw.data.mupihat.batteries), help: usbOnly ? NO_BATTERY_TEXT : 'Die Spannungen gehören zu diesem Profil.' }),
          { type: 'html', html: hatNowLine() },
        ],
      }
      // (the placeholder profile has no voltages to show or to save - its values are 1 and 0)
      if (usbOnly) return [hat, { title: 'Ladekurve', col: 2, items: [{ type: 'note', text: 'Ohne Akku gibt es keine Ladekurve und keine Schwellen. Ein anderes Profil wählen, sobald ein Akku eingebaut ist.' }] }]
      return [
        hat,
        {
          title: 'Ladekurve',
          help: 'Welche Spannung welchem Ladestand entspricht (mV). Die Werte steigen von „Leer“ nach „Voll“.',
          col: 2,
          items: [
            { type: 'html', html: `<div class="hat-chart" id="hat-chart">${hatChart()}</div>` },
            { type: 'pair', cls: 'grid5', items: [field('v0', 'Leer', 'v_0'), field('v25', '25 %', 'v_25'), field('v50', '50 %', 'v_50'), field('v75', '75 %', 'v_75'), field('v100', 'Voll', 'v_100')] },
          ],
        },
        {
          title: 'Schwellen',
          col: 1,
          items: [
            { type: 'pair', keep: true, items: [field('thWarn', 'Warnung ab', 'th_warning'), field('thShut', 'Abschalten bei', 'th_shutdown')] },
            { type: 'html', html: '<small class="help-line">In mV. Abschalten muss unter der Warnung liegen.</small>' },
          ],
        },
        {
          title: 'Laden',
          col: 1,
          items: [it('vreg', { label: 'Ladeschluss', sub: 'VREG', unit: 'mV', help: 'Leer = Standard des Lade-Chips. Bei zwei Zellen in Reihe höchstens 8400 mV (4,2 V je Zelle) – höher schadet dem Akku.' })],
        },
        { bar: true, items: [{ type: 'buttons', buttons: [['Profil speichern', 'primary', 'toast:Gespeichert']] }] },
      ]
    },
    mount(root) {
      const check = () => {
        const errs = hatProfileErrors()
        for (const [key] of PROFILE_KEYS) {
          const input = $(`#k-${key}`, root)
          if (!input) continue
          input.classList.toggle('bad', !!errs[key])
          const field = input.closest('.field')
          let msg = field.querySelector('small.err')
          if (errs[key] && !msg) {
            msg = document.createElement('small')
            msg.className = 'err'
            field.appendChild(msg)
          }
          if (msg) {
            if (errs[key]) msg.textContent = errs[key]
            else msg.remove()
          }
        }
        const save = root.querySelector('[data-label="Profil speichern"]')
        if (save) save.disabled = Object.keys(errs).length > 0
        const chart = $('#hat-chart', root)
        if (chart) chart.innerHTML = hatChart() // (none with the profile "USB-C mode")
      }
      for (const [key] of PROFILE_KEYS) $(`#k-${key}`, root)?.addEventListener('input', check)
      check()
    },
    async change(key, v, page) {
      if (key === 'hatOn') {
        if (!(await ask(v ? 'MuPiHAT einschalten' : 'MuPiHAT ausschalten', `Die Box stellt die Soundkarte um (${v ? 'MAX98357A' : 'Onboard 3,5 mm'}) und startet gleich neu.`, v ? 'Einschalten' : 'Ausschalten'))) {
          state.values.set('hatOn', !v)
          return renderPage(page, false)
        }
        const r = await api(`${API}/mupihat`, { method: 'POST', body: { active: v } })
        return toast(r.ok ? 'Die Box startet gleich neu …' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      }
      if (key === 'battery') {
        const name = hw.data.mupihat.batteries.find((n) => batteryLabel(n) === v)
        if (!name || name === hw.data.mupihat.battery) return
        const r = await api(`${API}/battery`, { method: 'POST', body: { name } })
        if (!r.ok) return toast('Nicht gespeichert', 'info')
        toast(`Akku: ${v}${r.body?.restarted ? ' – aktiv' : ''}`)
        await loadHat().catch(() => undefined)
        return renderPage(page, false)
      }
    },
    byLabel: {
      async 'Profil speichern'(_a, _l, page) {
        const profile = {}
        for (const [key, field] of PROFILE_KEYS) {
          const raw = String(state.values.get(key) ?? '').trim()
          // (an empty VREG: the charger chip's own value again - the stored one goes)
          if (raw === '' && field === 'vreg') {
            profile.vreg = null
            continue
          }
          if (raw === '') continue
          if (!/^\d{4}$/.test(raw)) return toast(`${field}: bitte eine Spannung in mV (4 Ziffern)`, 'info')
          profile[field] = Number(raw)
        }
        const order = ['v_100', 'v_75', 'v_50', 'v_25', 'v_0'].map((f) => profile[f]).filter((x) => x !== undefined && x !== null)
        if (order.some((x, i) => i > 0 && x >= order[i - 1])) return toast('Die Spannungen müssen von 100 % nach 0 % kleiner werden', 'info')
        if (profile.th_shutdown !== undefined && profile.th_warning !== undefined && profile.th_shutdown >= profile.th_warning) return toast('Abschalten muss unter der Warnung liegen', 'info')
        if (!(await ask('Profil speichern', `Die Spannungen des Profils „${batteryLabel(hw.data.mupihat.battery)}“ ändern? Der MuPiHAT-Dienst startet dafür neu.`, 'Speichern'))) return
        const r = await api(`${API}/power-config`, { method: 'POST', body: { batteryProfile: profile } })
        // (the backend's reason names the field in English: 'v_50 must be 5000-9000 mV')
        if (!r.ok) return toast(/th_shutdown/.test(r.body?.error ?? '') ? 'Abschalten muss unter der Warnung liegen' : /must be/.test(r.body?.error ?? '') ? 'Ein Wert liegt außerhalb des erlaubten Bereichs' : 'Nicht gespeichert', 'info')
        const rs = await api(`${API}/mupihat/restart`, { method: 'POST', body: {} })
        toast(`Profil gespeichert${rs.body?.restarted ? ' und aktiv' : ''}`)
        await loadHat().catch(() => undefined)
        renderPage(page, false)
      },
    },
  },
  autoaus: {
    async load() {
      const r = await api(`${API}/power-config`)
      if (!r.ok) throw new Error(`power-config ${r.status}`)
      state.values.set('idleOff', Number(r.body.timeout?.idlePiShutdown ?? 0))
    },
    sections: (page) => withoutSave(page).map((sec) => ({ ...sec, items: sec.items.map((it) => (it.key === 'idleOff' ? { ...it, help: '0 = nie. Die Box prüft alle 10 Sekunden, ob etwas läuft.' } : it)) })),
    async change(key, v) {
      if (key !== 'idleOff') return
      const r = await api(`${API}/power-config`, { method: 'POST', body: { idlePiShutdown: v } })
      return toast(r.ok ? (v === 0 ? 'Schaltet sich nicht mehr selbst aus' : `Aus nach ${v} min ohne Wiedergabe`) : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    },
  },
  taster: {
    async load() {
      await loadHardware()
      const s = hw.data.shim
      state.values.set('pressDelay', s.pressDelay)
      state.values.set('ledPin', s.ledPin)
      state.values.set('ledMax', s.ledMax)
      state.values.set('ledMin', s.ledMin)
    },
    sections: (page) =>
      withoutSave(page).map((sec) => ({
        ...sec,
        items: sec.items.map((it) =>
          it.key === 'ledPin'
            ? { ...it, options: pinOptions(pinsInUse('led')), help: `Gilt nach einem Neustart. Belegt vom OnOffShim: GPIO ${hw.data.shim.reserved.join(', ')}.` }
            : it.key === 'pressDelay'
              ? { ...it, help: 'So lange muss man den Taster halten, bis die Box ausgeht. Gilt nach einem Neustart.' }
              : it,
        ),
      })),
    async change(key, v) {
      const field = { pressDelay: 'pressDelay', ledPin: 'ledPin', ledMax: 'ledMax', ledMin: 'ledMin' }[key]
      if (!field) return
      const r = await api(`${API}/shim`, { method: 'POST', body: { [field]: key === 'ledPin' ? String(v) : Number(v) } })
      // (the backend's reasons are English words for developers: "pin not allowed", "pressDelay must be 0-5")
      return toast(r.ok ? `Gespeichert${r.body?.rebootNeeded ? ' – gilt nach einem Neustart' : ''}` : r.body?.error === 'pin not allowed' ? 'Dieser GPIO ist schon belegt' : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    },
  },
  luefter: {
    async load() {
      await loadHardware()
      const f = hw.data.fan
      state.values.set('fanOn', f.active)
      state.values.set('fanPin', f.gpio)
      for (const k of ['100', '75', '50', '25']) state.values.set(`fan${k}`, f[`t${k}`])
    },
    sections: (page) =>
      page.sections.map((sec) => ({
        ...sec,
        help: 'Je wärmer die Box, desto schneller läuft der Lüfter. Die Temperaturen müssen von 100 % nach 25 % kleiner werden.',
        items: sec.items.map((it) =>
          it.key === 'fanPin'
            ? {
                ...it,
                options: pinOptions(pinsInUse('fan')),
                // (the fan's pin taken by something else meanwhile: said, a free one is to be chosen)
                help: pinsInUse('fan').includes(String(hw.data.fan.gpio)) ? `GPIO ${hw.data.fan.gpio} ist schon belegt (z. B. von der LED) – bitte einen freien wählen.` : '',
              }
            : it,
        ),
      })),
    byLabel: {
      async Speichern() {
        const body = {
          active: !!state.values.get('fanOn'),
          gpio: String(state.values.get('fanPin')),
          t100: Number(state.values.get('fan100')),
          t75: Number(state.values.get('fan75')),
          t50: Number(state.values.get('fan50')),
          t25: Number(state.values.get('fan25')),
        }
        if (!(body.t100 > body.t75 && body.t75 > body.t50 && body.t50 > body.t25)) return toast('Die Temperaturen müssen von 100 % nach 25 % kleiner werden', 'info')
        const r = await api(`${API}/fan`, { method: 'POST', body })
        toast(r.ok ? (body.active ? 'Lüfter an – mit den neuen Werten' : 'Lüfter aus') : r.body?.error === 'pin not allowed' ? 'Dieser GPIO ist schon belegt' : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
      },
    },
  },
  wlan: wlanCtrl,
  lan: lanCtrl,
  freigaben: {
    load: loadShares,
    sections: (page) =>
      page.sections.map((sec) => ({
        ...sec,
        help: 'Einschalten installiert, was fehlt (kann ein paar Minuten dauern). Ausschalten hält den Dienst nur an.',
        items: sec.items.map((it) => {
          const job = net.shares?.[it.key]?.job
          const busy = job?.running ? ' – wird gerade umgeschaltet …' : job?.ok === false ? ' – das letzte Umschalten ging schief' : ''
          const help = {
            samba: `Der Ordner der Box im Netzwerk: \\\\${location.hostname}\\mupibox (Benutzer dietpi, Passwort mupibox).`,
            ftp: 'Zugriff per FTP (Port 21).',
            vnc: 'Das Display im Browser bedienen (Display & Bedienung › Display live).',
          }[it.key]
          return it.key ? { ...it, help: `${help ?? ''}${busy}` } : it
        }),
      })),
    mount(root, page) {
      if (Object.values(net.shares ?? {}).some((s) => s.job?.running)) {
        every(3000, async () => {
          await loadShares().catch(() => undefined)
          if (!Object.values(net.shares ?? {}).some((s) => s.job?.running)) {
            stopPageTimers()
            renderPage(page, false)
          }
        })
      }
    },
    async change(key, v, page) {
      if (!['samba', 'ftp', 'vnc'].includes(key)) return
      const name = { samba: 'Samba', ftp: 'FTP', vnc: 'VNC' }[key]
      if (!v && !(await ask(`${name} ausschalten`, `${name} anhalten? Es lässt sich hier jederzeit wieder einschalten.`, 'Ausschalten'))) {
        state.values.set(key, true)
        return renderPage(page, false)
      }
      const r = await api(`${API}/shares`, { method: 'POST', body: { name: key, on: v } })
      if (!r.ok) {
        state.values.set(key, !v)
        renderPage(page, false)
        return toast(r.status === 409 ? 'Wird gerade schon umgeschaltet' : 'Das hat nicht geklappt', 'info')
      }
      toast(`${name} wird ${v ? 'eingeschaltet' : 'ausgeschaltet'} …`)
      await loadShares().catch(() => undefined)
      renderPage(page, false)
    },
  },
  telegram: { load: loadTelegram, top: tgTop, sections: () => [], mount: mountTelegram },
  mqtt: {
    load: loadMqtt,
    // the connection (broker and login), the box's names in MQTT, how often, Home Assistant - saved together
    sections: (page) => {
      const it = (key, over) => schemaItem(page, key, over)
      const on = state.values.get('mqttOn')
      const running = net.mqtt?.running
      return [
        {
          title: 'Verbindung',
          badge: on ? (running ? { text: 'verbunden', kind: 'ok' } : { text: 'nicht verbunden', kind: 'warn' }) : { text: 'aus' },
          col: 1,
          items: [
            it('mqttOn', { help: 'Meldet Zustand, Wiedergabe und Werte der Box an einen MQTT-Broker.' }),
            { type: 'pair', cols: '2fr 1fr', keep: true, dim: 'mqttOn', items: [it('mqBroker', { placeholder: 'z. B. 192.168.1.10' }), it('mqPort')] },
            { type: 'pair', dim: 'mqttOn', items: [it('mqUser'), it('mqPw', { kind: 'password', placeholder: net.mqtt?.hasPassword ? 'gespeichert' : '', help: '' })] },
          ],
        },
        {
          title: 'Name & Topic',
          col: 1,
          items: [
            it('mqName', { dim: 'mqttOn' }),
            it('mqTopic', { dim: 'mqttOn', help: mqttTopicPreview(), helpId: 'mq-preview' }),
            it('mqClient', { dim: 'mqttOn' }),
          ],
        },
        { ...page.sections[1], col: 2 },
        { title: 'Home Assistant', col: 2, items: [it('haOn', { help: 'Die Box erscheint in Home Assistant von selbst als Gerät.' }), it('haTopic', { dep: 'haOn' })] },
        { bar: true, items: [{ type: 'buttons', buttons: [['Speichern', 'primary', 'toast:Gespeichert']] }] },
      ]
    },
    mount(root) {
      // the topics as they come out, while typing
      for (const k of ['mqTopic', 'mqClient']) $(`#k-${k}`, root)?.addEventListener('input', () => ($('#mq-preview', root).textContent = mqttTopicPreview()))
    },
    byLabel: {
      async Speichern(_a, _l, page) {
        const body = Object.fromEntries(MQTT_KEYS.map(([key, field]) => [field, state.values.get(key)]))
        for (const f of ['port', 'refresh', 'refreshIdle', 'timeout']) body[f] = Number(body[f])
        // (still switched off with the template's example: it stays in the configuration)
        if (!String(body.broker ?? '').trim() && !body.active && net.mqtt?.broker === MQTT_EXAMPLE_BROKER) body.broker = MQTT_EXAMPLE_BROKER
        const pw = String(state.values.get('mqPw') ?? '')
        if (pw) body.password = pw
        const r = await api(`${API}/mqtt`, { method: 'POST', body })
        if (!r.ok) {
          // (the backend names the field: 'invalid broker')
          const field = { broker: 'Broker', port: 'Port', topic: 'Topic', clientId: 'Client-ID', name: 'Name', username: 'Benutzername', password: 'Passwort', refresh: 'Intervall', refreshIdle: 'Intervall', timeout: 'Zeitlimit', ha_topic: 'Home-Assistant-Topic' }[String(r.body?.error ?? '').replace(/^invalid /, '')]
          return toast(field ? `Nicht gespeichert – bitte „${field}“ prüfen` : 'Nicht gespeichert', 'info')
        }
        toast(body.active ? (r.body?.running ? 'Gespeichert – der Dienst läuft' : 'Gespeichert – der Dienst startet nicht, Werte prüfen') : 'Gespeichert – MQTT ist aus', r.body?.running || !body.active ? 'ok' : 'info')
        await loadMqtt().catch(() => undefined)
        renderPage(page, false)
      },
    },
  },
  wled: { load: loadWled, top: wledTop, sections: () => [], mount: mountWled },
  passwort: { load: loadAuthState, top: securityTop, sections: () => [], mount: mountSecurity },
  https: { load: loadTls, top: tlsTop, sections: () => [], mount: mountTls },
  'g-system': { top: systemTop, sections: () => [], ownNav: true, mount: mountSystem },
  ueber: { load: loadAbout, top: aboutTop, sections: () => [], mount: mountAbout },
  neustart: { top: restartTop, sections: () => [], mount: mountRestart },
  zustand: { load: loadHealth, top: healthTop, sections: () => [], mount: mountHealth },
  rechtliches: { load: loadLegal, top: legalTop, sections: () => [], mount: mountLegal },
  protokolle: { load: loadLogs, top: logsTop, sections: () => [], mount: mountLogs },
  browser: {
    load: loadBrowser,
    // two cards by topic (about the same height side by side), below them the button with what it does, across the width
    sections: (page) => {
      const items = page.sections
        .flatMap((sec) => sec.items)
        .map((it) =>
          it.key === 'kiosk'
            ? { ...it, help: 'Aus = mit Fensterrahmen, nur zum Testen.' }
            : it.key === 'chromeDebug'
              ? { ...it, help: 'Schreibt ein ausführliches Log des Browsers; nach der Fehlersuche wieder aus.' }
              : it,
        )
      const pick = (keys) => items.filter((it) => keys.includes(it.key))
      return [
        { title: 'Darstellung', help: '', items: pick(['gpu', 'smooth', 'kiosk']) },
        { title: 'Speicher & Fehlersuche', help: '', items: pick(['cache', 'chromeDebug']) },
        {
          title: '',
          help: 'Die Änderungen gelten nach einem Neustart des Displays.',
          wide: true,
          items: [{ type: 'buttons', buttons: [['Übernehmen und Display neu starten', 'primary', 'apply']] }],
        },
      ]
    },
    async change(key, v) {
      const body = { gpu: { gpu: v }, smooth: { smooth: v }, kiosk: { kiosk: v }, chromeDebug: { debug: v }, cache: { cachesize: String(v).replace(/\s*MB$/, '') } }[key]
      if (!body) return
      const r = await api(`${API}/browser`, { method: 'POST', body })
      toast(r.ok ? 'Gespeichert – gilt nach dem Neustart des Displays' : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
    },
    act: {
      async apply() {
        if (!(await ask('Display neu starten', 'Das Display startet mit den neuen Einstellungen neu (ein paar Sekunden schwarz).', 'Neu starten'))) return
        const r = await api(`${API}/browser`, { method: 'POST', body: { restart: true } })
        toast(r.ok ? 'Das Display startet neu …' : 'Das hat nicht geklappt', r.ok ? 'ok' : 'info')
      },
    },
  },
  sprache: {
    load: loadLanguage,
    sections: (page) =>
      page.sections.map((sec) => {
        // (one help per card: the card's)
        const own = sec.items.some((it) => it.key === 'appLang')
        return {
          ...sec,
          help: own ? 'Nur diese App in diesem Browser. Automatisch = die Sprache des Browsers, sonst Englisch.' : sec.help,
          items: sec.items.map((it) =>
            it.key === 'appLang'
              ? { ...it, options: [APP_LANG_AUTO, ...Object.values(LANGS)] }
              : it.key === 'boxLang'
                ? { ...it, options: Object.values(sys.bs.languages).map((l) => l.name).sort((x, y) => x.localeCompare(y, 'de')) }
                : it,
          ),
        }
      }),
    async change(key, v) {
      if (key === 'appLang') {
        // right away, as with the button in the top bar
        return changeAppLanguage(Object.keys(LANGS).find((c) => LANGS[c] === v) ?? 'auto')
      }
      if (key !== 'boxLang') return
      const code = Object.entries(sys.bs.languages).find(([, l]) => l.name === v)?.[0]
      if (!code) return
      const r = await api(`${API}/box-language`, { method: 'POST', body: { code } })
      toast(r.ok ? `Sprache der Box: ${v} – das Startbild wird neu erzeugt` : 'Nicht gespeichert', r.ok ? 'ok' : 'info')
      // the box speaks it too (announcements, names read out) - where Google or Piper have it
      const tts = code.split('-')[0] === 'nb' ? 'no' : code.split('-')[0]
      if (r.ok && (sys.ttsLanguages ?? []).includes(tts)) await api(`${API}/display-options`, { method: 'POST', body: { ttsLanguage: tts } })
    },
  },
  systemopt: {
    load: loadSystemOptions,
    sections: (page) =>
      page.sections.map((sec) => ({
        ...sec,
        help: 'Alles hier gilt erst nach einem Neustart der Box (außer dem CPU-Governor).',
        items: sec.items.map((it) => {
          const help = {
            ocSd: 'Schnellerer Zugriff auf die SD-Karte; manche Karten laufen damit nicht stabil.',
            pm2Ram: 'Die Logs von Server und Player im Arbeitsspeicher statt auf der SD-Karte (schont sie).',
            waitNet: 'Die Box wartet beim Start aufs Netzwerk (langsamerer Start, dafür gleich online).',
            turbo: 'Schneller Start (höherer Takt in den ersten 30 Sekunden).',
            noWarn: 'Blendet das Blitz-Symbol bei zu schwacher Stromversorgung aus.',
            swap: 'Auslagerungsdatei auf der SD-Karte.',
          }[it.key]
          if (it.key === 'gov') return { ...it, options: adm.opts?.governors?.length ? adm.opts.governors : it.options, help: 'Wie der Prozessor taktet (ondemand = nach Bedarf). Gilt sofort.' }
          return help ? { ...it, help } : it
        }),
      })),
    async change(key, v, page) {
      // (some cards do not run stably overclocked: asked first)
      if (key === 'ocSd' && v && !(await ask('SD-Karte übertakten', 'Manche SD-Karten laufen übertaktet nicht stabil – die Box startet dann eventuell nicht mehr richtig. Trotzdem einschalten?', 'Einschalten'))) {
        state.values.set('ocSd', false)
        return renderPage(page, false)
      }
      const r = await api(`${API}/system-options`, { method: 'POST', body: { key: key === 'gov' ? 'governor' : key, value: v } })
      if (!r.ok) {
        toast('Das hat nicht geklappt', 'info')
        await loadSystemOptions().catch(() => undefined)
        return renderPage(page, false)
      }
      if (r.body?.rebootNeeded) rebootHint('Gespeichert.')
      else toast('Gespeichert')
    },
  },
  experten: { load: loadExperts, top: expertsTop, sections: () => [], ownNav: true, mount: mountExperts },
  backup: { top: backupTop, sections: () => [], mount: mountBackup },
  updates: { load: loadUpdates, top: updatesTop, sections: () => [], ownNav: true, mount: mountUpdates },
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
  const hits = state.schema.searchIndex.filter((h) => (norm(tr(h.l)).includes(n) || norm(h.l).includes(n)) && !seen.has(h.l + h.id) && seen.add(h.l + h.id)).slice(0, 12)
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

// The sheet shown now: its number, and how it lets go when another one takes its place
let sheetSeq = 0
let sheetRelease = null

// While a sheet is open the page behind it stays where it is: iOS Safari passed the swipe in a sheet on to the page
// (it scrolled in the background, the sheet's list did not). The page is fixed at its place and put back on close.
let sheetLockY = null
function lockPageScroll() {
  if (sheetLockY !== null) return
  sheetLockY = window.scrollY
  Object.assign(document.body.style, { position: 'fixed', top: `-${sheetLockY}px`, left: '0', right: '0', width: '100%' })
}
function unlockPageScroll() {
  if (sheetLockY === null) return
  const y = sheetLockY
  sheetLockY = null
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' })
  window.scrollTo(0, y)
}

// A sheet at the bottom (phone width) is closed by pulling it down, as its grip suggests: from the grip, or anywhere
// while its content is at the top. Far enough (or fast) it goes, else it springs back. Set up once for #sheet.
let sheetDragReady = false
function enableSheetDrag(sheet) {
  if (sheetDragReady) return
  sheetDragReady = true
  let startY = null
  let fromGrip = false
  let dy = 0
  let t0 = 0
  sheet.addEventListener(
    'touchstart',
    (e) => {
      if (window.matchMedia('(min-width: 960px)').matches || e.touches.length !== 1) return
      fromGrip = !!e.target.closest('.grip')
      if (!fromGrip && (sheet.scrollTop > 0 || e.target.closest('input, textarea, select, .switch, .pills'))) return
      startY = e.touches[0].clientY
      dy = 0
      t0 = Date.now()
      sheet.style.transition = 'none'
    },
    { passive: true },
  )
  sheet.addEventListener(
    'touchmove',
    (e) => {
      if (startY === null) return
      dy = e.touches[0].clientY - startY
      // upwards (or the content scrolled meanwhile): the content scrolls as usual
      if (dy <= 0 || (!fromGrip && sheet.scrollTop > 0)) {
        sheet.style.transform = ''
        if (!fromGrip) startY = null
        return
      }
      e.preventDefault()
      sheet.style.transform = `translateY(${dy}px)`
    },
    { passive: false },
  )
  const end = () => {
    if (startY === null) return
    startY = null
    sheet.style.transition = 'transform 180ms ease'
    if (dy > 110 || (dy > 40 && Date.now() - t0 < 250)) {
      sheet.style.transform = 'translateY(100%)'
      setTimeout(() => {
        openSheetClose?.()
        sheet.style.transition = ''
        sheet.style.transform = ''
      }, 180)
    } else {
      sheet.style.transform = ''
    }
  }
  sheet.addEventListener('touchend', end)
  sheet.addEventListener('touchcancel', end)
}

function openSheet(html, onOpen, onClose) {
  const sheet = $('#sheet')
  enableSheetDrag(sheet)
  sheet.style.transition = ''
  sheet.style.transform = ''
  const scrim = $('#sheet-scrim')
  // (a sheet opened from a sheet - an entry's cover picker, an album of a folder: the one before ends properly, its
  // keys and its onClose, e.g. a question that was not answered)
  sheetRelease?.()
  const id = ++sheetSeq
  const before = sheet.hidden ? document.activeElement : null
  sheet.innerHTML = `<div class="grip"></div>${html}`
  sheet.hidden = false
  scrim.hidden = false
  lockPageScroll()
  const release = () => {
    document.removeEventListener('keydown', onKey)
    if (sheetRelease === release) sheetRelease = null
    onClose?.()
  }
  sheetRelease = release
  const close = () => {
    // (the close of a sheet that was replaced meanwhile closes nothing)
    if (sheet.hidden || id !== sheetSeq) return
    release()
    sheet.hidden = true
    scrim.hidden = true
    unlockPageScroll()
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
  // (without scrolling to it: a sheet opened again at its place, e.g. back from an entry to its list, stays there)
  sheet.querySelector('input, button')?.focus({ preventScroll: true })
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
        for (const b of sheet.querySelectorAll('.opt')) b.hidden = !norm(b.textContent).includes(n) && !norm(b.dataset.v).includes(n)
      })
      for (const b of sheet.querySelectorAll('.opt')) {
        b.onclick = () => {
          const before = value(it)
          state.values.set(it.key, b.dataset.v)
          btn.querySelector('[data-out]').textContent = b.dataset.v
          close()
          commitChange(currentPage(), it.key, b.dataset.v, before)
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
        const before = state.values.get(key)
        state.values.set(key, v)
        close()
        renderPage(page, false)
        commitChange(page, key, v, before)
      }
    },
  )
}

// Which services the box has: Spotify signed in (Dienste › Spotify), ARD Sounds switched on (Dienste). Adding offers
// only those - a Spotify search without a Spotify login only ends in an error.
// podcasts: the podcast search (Apple's directory, for German with the ARD Audiothek); available: the languages it
// offers ({code, name})
const svc = { spotify: true, podcasts: true, radio: true, available: [], at: 0 }
async function loadServices() {
  if (Date.now() - svc.at < 30_000) return svc
  const [access, sources] = await Promise.all([api(`${API}/spotify-access`), api(`${API}/sources`)])
  // (the box not answering: everything is offered, as before)
  if (access.ok) svc.spotify = !!access.body?.connected
  if (sources.ok) setSources(sources.body)
  svc.at = Date.now()
  return svc
}
function setSources(b) {
  svc.podcasts = b.podcastSearch !== false
  svc.radio = b.radioSearch !== false
  if (Array.isArray(b.available)) svc.available = b.available
}

async function openAdd() {
  await loadServices()
  const ways = [
    ...(svc.spotify ? [['suche', 'search', 'Auf Spotify suchen', 'Hörspiele, Alben und Künstler finden']] : []),
    ...(svc.podcasts ? [['podsuche', 'globe', 'Podcasts suchen', 'Kinderpodcasts und Hörspiele in vielen Sprachen']] : []),
    ...(svc.radio ? [['radiosuche', 'vol', 'Radiosender suchen', 'Kinderradio und Sender aus vielen Ländern']] : []),
    ['link', 'link', 'Link einfügen', svc.spotify ? 'Spotify-Link, Radiosender oder Podcast' : 'Radiosender oder Podcast'],
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

// A yes/no question in a sheet: true for yes, false for no or when the sheet is closed otherwise
function ask(title, text, okLabel) {
  return new Promise((resolve) => {
    let answer = false
    openSheet(
      `<h2>${esc(title)}</h2><p class="help" style="margin:0">${esc(text)}</p>
       <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`,
      (sheet, close) => {
        sheet.querySelector('[data-close]').onclick = close
        sheet.querySelector('[data-ok]').onclick = () => {
          answer = true
          close()
        }
      },
      () => setTimeout(() => resolve(answer)),
    )
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

// A message at the bottom. Answers whether it was a success ('ok'): a page's change() that ends with
// "return toast(…, 'info')" so says the box did not take the change (see commitChange)
function toast(text, kind = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'info', 18)}<span>${esc(text)}</span>`
  $('#toasts').append(el)
  setTimeout(() => el.remove(), 3200)
  return kind === 'ok'
}

/* ---------- login ---------- */

function renderLoginBar() {
  $('#topbar').innerHTML = `<div class="login-bar">${langButton()}${themeButton()}</div>`
  $('#lang-btn').addEventListener('click', openLangSheet)
  $('#theme-btn').addEventListener('click', toggleTheme)
}

// Where the login leads: this app (beta) or the previous admin interface (PHP on port 80/443, same password). The choice
// is remembered in this browser. The start page of port 80 (/) opens the login with ?portal, also when signed in.
const PORTALS = [
  ['app', 'Web-App', 'Beta', 'grid'],
  ['admin', 'Admin-Interface', 'Die bisherige Oberfläche', 'gear'],
]
const adminUrl = () => `${location.protocol}//${location.hostname}/index.php`

function portalChoice() {
  try {
    return localStorage.getItem('mupi-portal') === 'admin' ? 'admin' : 'app'
  } catch {
    return 'app'
  }
}

function setPortalChoice(v) {
  try {
    localStorage.setItem('mupi-portal', v)
  } catch {
    // private mode: only for this visit
  }
}

// The admin interface takes the password in a form of its own (field "password", any of its pages) - with its CSRF
// token, like every form it takes: its login page carries it. So the page is read first; that works where the admin
// interface is the same origin, i.e. on port 80/443. From port 8200 the login of port 80 does it (admin chosen).
async function openAdmin(password) {
  const url = adminUrl()
  if (password === undefined) {
    location.href = url
    return
  }
  if (new URL(url).origin !== location.origin) {
    location.href = `${location.protocol}//${location.hostname}/app/?portal=admin`
    return
  }
  // (?login_form: the admin interface sends anyone not signed in to this login - but not this request)
  const html = await fetch(`${url}?login_form=1`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.text(), () => '')
  const token = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1]
  // (no login form: signed in there already, or no login asked for)
  if (!token || !/name="password"/.test(html)) {
    location.href = url
    return
  }
  const form = document.createElement('form')
  form.method = 'post'
  form.action = url
  form.hidden = true
  for (const [name, value] of [
    ['password', password],
    ['csrf_token', token],
  ]) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

// "Angemeldet bleiben": as chosen last time on this device; the first time on when the app runs from the home screen
function keepSignedIn() {
  const last = remembered('mupi-keep-signed-in')
  if (last !== null) return last === '1'
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
}

async function renderLogin(hasSession = state.loginHasSession ?? false) {
  state.loginHasSession = hasSession
  $('#tabbar').hidden = true
  $('#sidebar').hidden = true
  // (no side bar: the page gets the whole width, the grid of the shell would keep its column)
  $('#shell').classList.add('no-nav')
  renderLoginBar()
  const info = (await fetch(`${API}/auth-info`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null), () => null)) ?? {}
  // (?portal=admin: sent here from port 8200 with the admin interface chosen)
  if (new URLSearchParams(location.search).get('portal') === 'admin') setPortalChoice('admin')
  let choice = portalChoice()
  const draw = () => {
    // Without a password there is nothing to type in: for the app the page says how to get in instead (a password field
    // that can only fail made people think there was a default password)
    const noPassword = choice === 'app' && !hasSession && info.passwordConfigured === false
    const needPassword = choice === 'admin' ? info.loginRequired === true : !hasSession && !noPassword
    $('#content').innerHTML = `
    <div class="login">
      <div class="logo">${mupiImg('width="64" height="67"')}</div>
      <div class="login-head"><h1>Willkommen zurück</h1><p class="help">Wohin möchtest du?</p></div>
      <form class="card" id="login-form">
        <div class="portal-pick" role="radiogroup" aria-label="Wohin möchtest du?">${PORTALS.map(
          ([id, name, sub, ic]) =>
            `<button type="button" class="portal-opt" role="radio" data-portal="${id}" aria-checked="${id === choice}">${icon(ic, 22)}<span class="lbl"><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>`,
        ).join('')}</div>
        ${
          noPassword
            ? `<p class="help" style="margin:0">Auf dieser Box ist noch kein Passwort gesetzt. Hinein geht es mit dem QR-Code am Display oder dem Telegram-Bot (unten), danach diese Seite neu laden.</p>
               <button class="btn primary block" type="button" id="login-reload">Neu laden</button>`
            : `${
                needPassword
                  ? `<div class="field"><label for="pw">Passwort</label>
                      <div class="input-wrap"><input class="input has-eye" id="pw" type="password" autocomplete="current-password" required><button type="button" class="eye" data-eye aria-label="Anzeigen">${icon('eye', 18)}</button></div>
                      <small>Dasselbe Passwort für die Web-App und das Admin-Interface.</small></div>`
                  : ''
              }${
                needPassword && choice === 'app'
                  ? `<div class="row login-keep"><span class="lbl"><b>Angemeldet bleiben</b><small>90 Tage ab der letzten Nutzung, auch nach einem Neustart der Box</small></span>
                      <label class="switch"><input type="checkbox" id="login-keep" ${keepSignedIn() ? 'checked' : ''} aria-label="Angemeldet bleiben"><span></span></label></div>`
                  : ''
              }
              <p class="login-msg" id="login-msg" role="alert" hidden></p>
              <button class="btn primary block" type="submit">${needPassword ? 'Anmelden' : 'Öffnen'}</button>`
        }
      </form>
      ${
        choice === 'app' && !hasSession
          ? `<div class="login-other">
        <p class="eyebrow">Ohne Passwort</p>
        <div class="entry">${icon('display', 18)}<span class="lbl"><b>QR-Code am Display</b><small>Die Statusanzeige oben am Display lange drücken, dann den Code scannen.</small></span></div>
        <div class="entry">${icon('tg', 18)}<span class="lbl"><b>Telegram</b><small>Dem Bot der Box /login schicken und den Link öffnen.</small></span></div>
      </div>`
          : ''
      }
    </div>`
    for (const b of document.querySelectorAll('[data-portal]')) {
      b.onclick = () => {
        if (b.dataset.portal === choice) return
        choice = b.dataset.portal
        setPortalChoice(choice)
        draw()
      }
    }
    $('#login-reload')?.addEventListener('click', () => location.reload())
    const pw = $('#pw')
    // the cursor in the field at once, but not on a phone (the keyboard would cover the page)
    if (pw && window.matchMedia('(hover: hover) and (pointer: fine)').matches) pw.focus()
    $('[data-eye]')?.addEventListener('click', () => {
      pw.type = pw.type === 'password' ? 'text' : 'password'
    })
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!needPassword) {
        if (choice === 'admin') openAdmin()
        else location.href = location.pathname // the app, without ?portal
        return
      }
      const msg = $('#login-msg')
      const keep = $('#login-keep')
      if (keep) remember('mupi-keep-signed-in', keep.checked ? '1' : '0')
      // (also for the admin interface: the password is checked here first, a typo shows on this page and not on the
      // admin interface's own login; a correct one signs in to the app as well)
      const r = await fetch(`${API}/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.value, remember: keep?.checked === true }),
      }).catch(() => null)
      if (r?.ok) {
        if (choice === 'admin') openAdmin(pw.value)
        else location.href = location.pathname
        return
      }
      msg.hidden = false
      msg.textContent = r?.status === 429 ? 'Zu viele Versuche – bitte kurz warten.' : r?.status === 401 ? 'Das Passwort stimmt nicht.' : 'Die Box ist gerade nicht erreichbar.'
    })
  }
  draw()
}

async function logout() {
  await fetch(`${API}/logout`, { method: 'POST', credentials: 'same-origin', headers: { 'x-mupibox-csrf': state.csrf } }).catch(() => null)
  location.reload()
}

boot().catch((err) => {
  console.error(err)
  window.mupiBootStep = ''
  $('#content').innerHTML = `<div class="loading"><p>Die App konnte nicht geladen werden.</p><p class="help">${esc(String(err?.message ?? err))}</p>${bootWays()}</div>`
  wireBootWays()
})

/* ---------- Start › "Angepinnt" (see eltern/pinned-cards.ts) ----------
 * Every card with a heading gets a pin. Pinned, it is on the start page
 *   - as a link (any card): a tile with its heading and page; a tap opens the page, goes to the card and marks it for
 *     a moment - the card is always the real one, nothing is copied;
 *   - as a whole card (only the cards in LIVE_CARDS): a small version of its own, to see and use on the start page.
 * A card is known by its page and an id (data-card, else made from its heading as written in the app - the
 * translation comes later), not by the heading shown. Idea and first version: Andreas (Lippsson), wowa1990/MuPiBox#11.
 */

const pins = { list: null, jump: null }
const pinSlug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
const pinKey = (p) => `${p.page}:${p.card}`

// The list as the box has it now - read before it is shown or changed: another phone (or another window) may have
// changed it, and a list kept since the app was opened undid that when it was saved whole
async function pinsFetch() {
  const r = await api(`${API}/pinned-cards`)
  if (r.ok && Array.isArray(r.body?.items)) pins.list = r.body.items
  else pins.list ??= []
  return pins.list
}

// A change, made by the box on its list (see pinned-cards.ts): {add: pin}, {remove: {page, card}} or {items} (order)
async function pinsChange(body) {
  const r = await api(`${API}/pinned-cards`, { method: 'POST', body })
  if (r.ok && Array.isArray(r.body?.items)) pins.list = r.body.items
  else toast('Nicht gespeichert', 'info')
  return r.ok
}

// The whole cards for the start page: what they show and how they are wired
const LIVE_CARDS = {
  // the chart of the battery's page (hatChart), to look at; the values are changed on that page
  'mupihat:ladekurve': {
    title: 'Ladekurve',
    async html() {
      await loadHat()
      return `<div class="hat-chart">${hatChart()}</div>${hatNowLine()}
        <div class="btns"><button class="btn sm" data-pin-edit>${icon('sliders', 16)}Werte ändern</button></div>`
    },
    mount(el) {
      el.querySelector('[data-pin-edit]').onclick = () => pinGo({ page: 'mupihat', card: 'ladekurve' })
    },
  },
  // the parents' messages: a template at a tap, or an own text
  'sprachausgabe:eltern-durchsagen': {
    title: 'Durchsagen',
    async html() {
      const r = await api(`${API}/speech`)
      if (!r.ok || !r.body?.configured) return `<p class="help" style="margin:0">${esc('Die Sprachausgabe ist noch nicht eingerichtet.')}</p>`
      const t = r.body.texts?.templates ?? []
      return `${t.length ? `<div class="pin-say">${t.map((x, i) => `<button type="button" class="pin-chip" data-pin-say="${i}">${icon('vol', 16)}<span dir="auto">${esc(x)}</span></button>`).join('')}</div>` : ''}
        <div class="btns"><button class="btn sm" data-pin-own>${icon('plus', 16)}Eigener Text …</button></div>
        ${r.body.config?.parents?.on ? '' : `<p class="help" style="margin:0">${esc('Durchsagen sind gerade ausgeschaltet.')}</p>`}`
    },
    mount(el) {
      for (const b of el.querySelectorAll('[data-pin-say]')) b.onclick = () => speechSay(b.querySelector('span').textContent)
      el.querySelector('[data-pin-own]')?.addEventListener('click', () => saySheet())
    },
  },
  // headphones and speakers: connect or disconnect at a tap
  'bluetooth:gekoppelte-gerate': {
    title: 'Kopfhörer',
    async html() {
      const r = await api(`${API}/bluetooth`)
      const b = r.body ?? {}
      if (!r.ok) return `<p class="help" style="margin:0">${esc('Bluetooth antwortet gerade nicht.')}</p>`
      if (!b.powered) return `<p class="help" style="margin:0">${esc('Bluetooth ist aus.')}</p>`
      pins.btDevices = b.devices ?? []
      return pins.btDevices.length
        ? `<div class="rows">${pins.btDevices
            .map(
              (d, i) =>
                `<div class="entry"><span class="avatar">${icon('phones', 16)}</span><span class="lbl"><b translate="no">${esc(d.name)}</b><small>${d.connected ? 'verbunden' : 'nicht verbunden'}</small></span>${d.connected ? `<button class="btn sm" data-pin-bt="disconnect" data-i="${i}">Trennen</button>` : `<button class="btn sm primary" data-pin-bt="connect" data-i="${i}">Verbinden</button>`}</div>`,
            )
            .join('')}</div>`
        : `<p class="help" style="margin:0">${esc('Noch kein Gerät gekoppelt.')}</p>`
    },
    mount(el, refresh) {
      for (const b of el.querySelectorAll('[data-pin-bt]')) {
        b.onclick = async () => {
          const d = pins.btDevices[Number(b.dataset.i)]
          const connect = b.dataset.pinBt === 'connect'
          b.disabled = true
          const r = await api(`${API}/bluetooth/${b.dataset.pinBt}`, { method: 'POST', body: { mac: d.mac } })
          toast(r.body?.ok ? `${d.name} ${connect ? 'verbunden' : 'getrennt'}` : `${d.name} ${connect ? 'ließ sich nicht verbinden – ist es an?' : 'ließ sich nicht trennen'}`, r.body?.ok ? 'ok' : 'info')
          refresh()
        }
      }
    },
  },
}

// A pinned card's page, scrolled to the card, which is marked for a moment (see pinInject)
function pinGo(p) {
  pins.jump = p
  go(p.page)
}

// A settings page just drawn: a pin in the head of each card with a heading; a card asked for (pinGo) marked
function pinInject(main, page) {
  if (page.id === 'start') return
  for (const card of main.querySelectorAll(':scope > section.card, :scope > .card')) {
    const h2 = card.querySelector(':scope > .card-head > h2, :scope > h2')
    if (!h2 || !h2.textContent.trim()) continue
    const id = card.dataset.card || pinSlug(h2.textContent.trim())
    if (!id) continue
    const p = { page: page.id, card: id, title: h2.textContent.trim() }
    card.dataset.pinKey = pinKey(p)
    let head = card.querySelector(':scope > .card-head')
    if (!head) {
      head = document.createElement('div')
      head.className = 'card-head'
      h2.replaceWith(head)
      head.appendChild(h2)
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'icon-btn soft pin-btn'
    b.dataset.pinFor = pinKey(p)
    b.innerHTML = icon('pin', 16)
    b.onclick = () => pinToggle(p)
    head.appendChild(b)
  }
  pinsFetch().then(() => main.isConnected && pinButtons(main))
  const want = pins.jump
  if (want && want.page === page.id) {
    pins.jump = null
    const card = main.querySelector(`[data-pin-key="${CSS.escape(pinKey(want))}"]`)
    if (card) {
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
        card.classList.add('pin-flash')
        setTimeout(() => card.classList.remove('pin-flash'), 2400)
      }, 80)
    }
  }
}

// The pins' state as the list has it
function pinButtons(root) {
  for (const b of root.querySelectorAll('[data-pin-for]')) {
    const on = (pins.list ?? []).some((p) => pinKey(p) === b.dataset.pinFor)
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', String(on))
    b.setAttribute('aria-label', on ? 'Von der Startseite lösen' : 'An die Startseite heften')
  }
}

// A tap on a pin: off when it is pinned; else on - a card with a version of its own asks how
async function pinToggle(p) {
  const list = await pinsFetch()
  const done = (msg) => {
    pinButtons(document)
    toast(msg, 'ok')
  }
  if (list.some((x) => pinKey(x) === pinKey(p))) {
    if (await pinsChange({ remove: { page: p.page, card: p.card } })) done('Von der Startseite gelöst')
    return
  }
  if (!LIVE_CARDS[pinKey(p)]) {
    if (await pinsChange({ add: { ...p, view: 'link' } })) done('Auf der Startseite – als Verknüpfung')
    return
  }
  openSheet(
    `<h2>An die Startseite</h2><p class="help" style="margin:0">${esc(`„${p.title}“ auf der Startseite zeigen als:`)}</p>
    <div class="choices">
      <button type="button" class="choice on" data-view="card" aria-pressed="true"><span class="radio"></span><span class="lbl"><b>Ganze Karte</b><small>Direkt auf der Startseite sehen und bedienen.</small></span></button>
      <button type="button" class="choice" data-view="link" aria-pressed="false"><span class="radio"></span><span class="lbl"><b>Verknüpfung</b><small>Eine kleine Kachel; ein Tipp springt zur Karte.</small></span></button>
    </div>
    <p class="help" style="margin:0">Umstellen geht später unter Start › Angepinnt › Anordnen.</p>
    <div class="btns"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>${icon('pin', 16)}Anheften</button></div>`,
    (sheet, close) => {
      let view = 'card'
      for (const c of sheet.querySelectorAll('[data-view]')) {
        c.onclick = () => {
          view = c.dataset.view
          for (const x of sheet.querySelectorAll('[data-view]')) {
            x.classList.toggle('on', x === c)
            x.setAttribute('aria-pressed', String(x === c))
          }
        }
      }
      sheet.querySelector('[data-close]').onclick = close
      sheet.querySelector('[data-ok]').onclick = async () => {
        close()
        if (await pinsChange({ add: { ...p, view } })) done(view === 'card' ? 'Auf der Startseite – als ganze Karte' : 'Auf der Startseite – als Verknüpfung')
      }
    },
  )
}

// The page's place for a link: "Audio › Sprachausgabe"
function pinWhere(p) {
  const pg = state.pages.get(p.page)
  const parent = pg?.parent && state.pages.get(pg.parent)
  return [parent?.parent ? parent.title : '', pg?.title].filter(Boolean).join(' › ')
}

// Start: the whole cards in two columns as the player and the tiles above (on a phone one, in the order chosen),
// the links below
async function drawPins(root) {
  await pinsFetch()
  const box = $('#pins', root)
  if (!box?.isConnected) return
  const list = (pins.list ?? []).filter((p) => state.pages.has(p.page))
  if (!list.length) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.hidden = false
  const asCard = (p) => !!LIVE_CARDS[pinKey(p)] && p.view !== 'link'
  const cards = list.filter(asCard)
  const links = list.filter((p) => !asCard(p))
  const cardHtml = (p, i) =>
    `<section class="card pin-card" data-live="${i}" style="order:${i}"><div class="card-head"><h2>${esc(LIVE_CARDS[pinKey(p)].title)}</h2><button class="icon-btn soft pin-btn on" data-unpin="${esc(pinKey(p))}" aria-label="${esc(tr('Von der Startseite lösen'))}">${icon('pin', 16)}</button></div><div class="pin-body"><p class="help" style="margin:0">Lade …</p></div></section>`
  const col = (rest) => `<div class="pin-col">${cards.map((p, i) => (i % 2 === rest ? cardHtml(p, i) : '')).join('')}</div>`
  box.innerHTML = `<div class="pin-label"><span class="section-label" style="margin:0">Angepinnt</span><button class="btn sm ghost" id="pin-arrange">${icon('sliders', 16)}Anordnen</button></div>
    ${cards.length ? `<div class="pin-live">${col(0)}${col(1)}</div>` : ''}
    ${
      links.length
        ? `<div class="pin-links">${links
            .map(
              (p) =>
                `<button class="pin-link" data-pin-go="${esc(pinKey(p))}"><span class="tile">${icon(state.pages.get(p.page)?.icon || 'chevron', 18)}</span><span class="lbl"><b>${esc(p.title || LIVE_CARDS[pinKey(p)]?.title || '')}</b><small>${esc(pinWhere(p))}</small></span><span class="chev">${icon('chevron', 16)}</span></button>`,
            )
            .join('')}</div>`
        : ''
    }`
  for (const b of box.querySelectorAll('[data-pin-go]')) b.onclick = () => pinGo(list.find((p) => pinKey(p) === b.dataset.pinGo))
  for (const b of box.querySelectorAll('[data-unpin]')) {
    b.onclick = async () => {
      const [page, card] = b.dataset.unpin.split(':')
      if (await pinsChange({ remove: { page, card } })) {
        toast('Von der Startseite gelöst', 'ok')
        drawPins(root)
      }
    }
  }
  $('#pin-arrange', box).onclick = () => pinArrange(root)
  for (const [i, p] of cards.entries()) {
    const el = box.querySelector(`[data-live="${i}"] .pin-body`)
    const fill = async () => {
      try {
        const html = await LIVE_CARDS[pinKey(p)].html()
        if (!el.isConnected) return
        el.innerHTML = html
        LIVE_CARDS[pinKey(p)].mount(el, fill)
      } catch {
        if (el.isConnected) el.innerHTML = `<p class="help" style="margin:0">${esc(tr('Ließ sich nicht laden'))}</p>`
      }
    }
    fill()
  }
}

// The order of the pinned cards, card or link, taking one off
async function pinArrange(root) {
  await pinsFetch()
  const draw = (sheet) => {
    const list = pins.list ?? []
    sheet.querySelector('#pin-rows').innerHTML = list.length
      ? list
          .map((p, i) => {
            const live = !!LIVE_CARDS[pinKey(p)]
            return `<div class="entry pin-row"><span class="avatar">${icon(live && p.view !== 'link' ? 'grid' : 'link', 16)}</span><span class="lbl"><b>${esc(p.title)}</b><small>${esc(pinWhere(p))}</small>${
              live
                ? `<div class="seg sm" data-view-of="${i}"><button aria-pressed="${p.view !== 'link'}" data-v="card">Ganze Karte</button><button aria-pressed="${p.view === 'link'}" data-v="link">Verknüpfung</button></div>`
                : `<small>Verknüpfung</small>`
            }</span>
          <button class="icon-btn soft" data-up="${i}" aria-label="${esc(tr('Nach oben'))}" ${i ? '' : 'disabled'}>${icon('up', 16)}</button><button class="btn sm" data-rm="${i}">Lösen</button></div>`
          })
          .join('')
      : `<p class="help" style="margin:0">${esc(tr('Nichts angepinnt.'))}</p>`
    // (order and view: the whole list, read when the sheet opened and after every change; taking one off: by itself)
    const change = async (next) => {
      if (await pinsChange(next)) draw(sheet)
    }
    for (const s of sheet.querySelectorAll('[data-view-of]')) {
      s.onclick = (e) => {
        const btn = e.target.closest('button')
        if (!btn) return
        change({ items: (pins.list ?? []).map((p, i) => (i === Number(s.dataset.viewOf) ? { ...p, view: btn.dataset.v } : p)) })
      }
    }
    for (const b of sheet.querySelectorAll('[data-up]')) {
      b.onclick = () => {
        const next = [...(pins.list ?? [])]
        const i = Number(b.dataset.up)
        const moved = next[i]
        next[i] = next[i - 1]
        next[i - 1] = moved
        change({ items: next })
      }
    }
    for (const b of sheet.querySelectorAll('[data-rm]')) {
      b.onclick = () => {
        const p = (pins.list ?? [])[Number(b.dataset.rm)]
        if (p) change({ remove: { page: p.page, card: p.card } })
      }
    }
  }
  openSheet(
    `<h2>Angepinnt</h2><p class="help" style="margin:0">${esc('Ganze Karten stehen oben, Verknüpfungen darunter. Neues heftest du mit dem Pin oben rechts an einer Karte an.')}</p><div class="rows" id="pin-rows"></div><div class="btns"><button class="btn primary" data-close>Fertig</button></div>`,
    (sheet, close) => {
      draw(sheet)
      sheet.querySelector('[data-close]').onclick = close
    },
    () => root.isConnected && drawPins(root),
  )
}
