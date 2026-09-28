// Phase 14c + 15a — Eltern-WebApp client.
// Vanilla ES2020. No framework dependency keeps the bundle small and
// boots fast on flaky LAN.
//
// Phase 15a turned the single-screen Smart-Sync dashboard into a hub
// with 9 sections (sync, library, caps, power, wlan, bluetooth,
// telegram, system, plus the wizard/settings sub-screens of sync).
// Navigation is hash-based so browser-back works and links from the
// Telegram bot can deep-link straight to a section.

import { applyI18n, getLang, getLangPref, localeTag, setLangPref, t, tn } from './i18n.js'

const API = '/api/eltern'
const SYNC_API = '/api/spotify-sync'

/* ---------- helpers ---------- */

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))

const state = {
  csrf: null,
  passwordConfigured: false,
  wizardStep: Number(sessionStorage.getItem('wizard.step') ?? 1),
  spotifyError: new URLSearchParams(location.search).get('spotify_error'),
  spotifyConnected: new URLSearchParams(location.search).get('spotify_connected') === '1',
  currentSection: null, // set by router; not by ad-hoc showScreen calls
}

/* ---------- routing (Phase 15a) ---------- */

// Map of section -> { titleKey (i18n), parent (for back), loader }.
// Parent === null means top-level (back button hidden, "←" goes to hub).
// loader is called whenever the section becomes active so live data
// fetches happen only for the visible section.
const SECTIONS = {
  hub:       { titleKey: 'section.hub',       parent: null, loader: () => loadHub() },
  sync:      { titleKey: 'section.sync',      parent: 'hub', loader: () => loadSync() },
  settings:  { titleKey: 'section.settings',  parent: 'sync', loader: () => loadSettings() },
  wizard:    { titleKey: 'section.wizard',    parent: 'sync', loader: () => loadWizard() },
  library:   { titleKey: 'section.library',   parent: 'hub', loader: () => { loadLibrary(); loadSubscriptions(); loadSyncStatus() } },
  play:      { titleKey: 'section.play',      parent: 'hub', loader: () => loadPlay() },
  search:    { titleKey: 'section.search',    parent: 'library', loader: () => resetSearch() },
  upload:    { titleKey: 'section.upload',    parent: 'library', loader: () => loadUpload() },
  caps:      { titleKey: 'section.caps',      parent: 'hub', loader: () => { loadCaps(); loadDisplayTexts() } },
  power:     { titleKey: 'section.power',     parent: 'hub', loader: () => loadPower() },
  wlan:      { titleKey: 'section.wlan',      parent: 'hub', loader: () => loadWlan() },
  bluetooth: { titleKey: 'section.bluetooth', parent: 'hub', loader: () => loadBluetooth() },
  telegram:  { titleKey: 'section.telegram',  parent: 'hub', loader: () => loadTelegram() },
  system:    { titleKey: 'section.system',    parent: 'hub', loader: () => loadSystem() },
  theme:     { titleKey: 'section.theme',     parent: 'hub', loader: () => { loadTheme(); loadBootscreen() } },
  history:   { titleKey: 'section.history',   parent: 'hub', loader: () => loadHistory() },
}

/** Switch to a screen — hides all .screen sections, shows the requested
 *  one, updates the header (title + back-button visibility), and calls
 *  the section's loader. Top-level screens (loading, no-session) bypass
 *  the title-rewrite to preserve their dedicated headers. */
function showScreen(id) {
  for (const s of $$('.screen')) s.hidden = true
  const target = $(`#screen-${id}`)
  if (!target) return
  target.hidden = false

  // Loading / no-session don't have a logical section parent — keep the
  // header in brand-only mode.
  if (id === 'loading' || id === 'no-session') {
    $('#header-back-btn').hidden = true
    $('#header-title').textContent = '🎵 MuPiBox'
    return
  }

  const meta = SECTIONS[id]
  if (meta) {
    $('#header-title').textContent = t(meta.titleKey)
    $('#header-back-btn').hidden = meta.parent === null
    state.currentSection = id
  }
  // Window scrolls to top whenever section changes — feels more like
  // a native app than a single-page-scroll.
  window.scrollTo(0, 0)
}

/** Read the current hash, default to 'hub' for empty/no-fragment. Returns
 *  the section id (without leading '#'). */
function routeFromHash() {
  const hash = (location.hash || '#hub').replace(/^#/, '')
  // Defence: unknown hash → hub. Prevents typos / stale bookmarks from
  // blanking the page.
  return SECTIONS[hash] ? hash : 'hub'
}

/** Programmatic navigation: pushes a new hash, lets hashchange + onRoute
 *  do the actual screen-swap. */
function navigate(section) {
  if (location.hash.replace(/^#/, '') === section) {
    // Already on it — still trigger the loader so reload works.
    onRoute()
    return
  }
  location.hash = `#${section}`
}

/** hashchange + initial-route handler. */
function onRoute() {
  // Only route after the session bootstrap finished — otherwise hashchange
  // fires before we know whether to show no-session or the hub.
  if (state.csrf === null) return
  const section = routeFromHash()
  showScreen(section)
  const meta = SECTIONS[section]
  if (meta?.loader) {
    try { meta.loader() } catch (err) { console.error('section loader threw:', err) }
  }
}

async function api(path, opts = {}) {
  const init = {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.csrf && opts.method && opts.method !== 'GET' ? { 'x-mupibox-csrf': state.csrf } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }
  const res = await fetch(path, init)
  let payload = null
  try { payload = await res.json() } catch {}
  return { status: res.status, ok: res.ok, body: payload }
}

function setText(sel, text) {
  const el = $(sel)
  if (el) el.textContent = text
}

function feedback(sel, kind, text) {
  // Phase 19 Welle 4: Inline-Feedback gibt's nur noch für Sektionen, die
  // ein dediziertes Feld haben (z.B. Login, Add-Sheet). Alles andere wird
  // automatisch als Toast ausgespielt, damit die Meldung nicht in einer
  // Karte versteckt unten dranklebt und auf Hub-Ebene gesehen wird.
  const el = $(sel)
  if (!el || !document.body.contains(el)) {
    toast(kind, text)
    return
  }
  el.hidden = false
  el.className = `feedback ${kind}`
  el.textContent = text
}

/** Welle 4 — Toast-System. Globaler Container unten Mitte. Erlaubt
 *  Stapelung; auto-hide nach 3.5 s (Fehler 5 s); manuell früher
 *  schliessbar via Tap. Icons: ✓ ! i ⚠. */
function toast(kind, text, opts = {}) {
  const stack = $('#toast-stack')
  if (!stack) return
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  const ic = document.createElement('span')
  ic.className = 'toast-icon'
  ic.setAttribute('aria-hidden', 'true')
  ic.textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'warn' ? '⚠' : 'i'
  const tx = document.createElement('span')
  tx.className = 'toast-text'
  tx.textContent = text
  el.append(ic, tx)
  el.addEventListener('click', () => dismissToast(el))
  stack.appendChild(el)
  const ttl = opts.duration ?? (kind === 'error' ? 5000 : 3500)
  setTimeout(() => dismissToast(el), ttl)
}
function dismissToast(el) {
  if (!el || el.classList.contains('is-hiding')) return
  el.classList.add('is-hiding')
  setTimeout(() => el.remove(), 250)
}

/** Welle 4 — confirmDialog im Sheet-System, ersetzt native confirm().
 *  Liefert ein Promise<boolean>. `destructive: true` färbt OK rot. */
let _confirmResolve = null
function confirmDialog(title, body, opts = {}) {
  const back = $('#confirm-backdrop')
  const sheet = back?.querySelector('.confirm-sheet')
  const okBtn = $('#confirm-ok-btn')
  const cancelBtn = $('#confirm-cancel-btn')
  if (!back || !sheet || !okBtn || !cancelBtn) return Promise.resolve(window.confirm(`${title}\n\n${body}`))
  setText('#confirm-title', title)
  setText('#confirm-body', body || '')
  okBtn.textContent = opts.confirmLabel ?? 'OK'
  cancelBtn.textContent = opts.cancelLabel ?? t('common.cancel')
  sheet.classList.toggle('is-destructive', !!opts.destructive)
  back.hidden = false
  return new Promise((resolve) => {
    _confirmResolve = resolve
    setTimeout(() => okBtn.focus(), 50)
  })
}
function _confirmClose(result) {
  const back = $('#confirm-backdrop')
  if (back) back.hidden = true
  const r = _confirmResolve
  _confirmResolve = null
  if (r) r(result)
}

/** Welle 5 — Empty-State-HTML-Snippet. icon ist optional Emoji,
 *  text der Hauptsatz. Mit ctaLabel + ctaHref/ctaOnClick optional Button. */
function emptyStateHtml(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">${icon ?? '·'}</div><div class="empty-state-text">${text ?? ''}</div></div>`
}

/** Welle 5 — Skelett-Linien. n = Anzahl Zeilen. */
function skeletonLines(n = 3) {
  let s = ''
  for (let i = 0; i < n; i++) s += '<div class="skeleton skeleton-line"></div>'
  return s
}

/** Welle 6 — Range-Slider-Fill: aktualisiert --range-pct anhand des
 *  aktuellen Werts, damit der Track links vom Thumb farbig wird (WebKit
 *  hat keine native progress-pseudo). Wird beim Init für alle Slider
 *  einmalig gebunden + dann via 'input'-Event live nachgeführt. */
function updateRangeFill(input) {
  if (!input) return
  const min = Number(input.min) || 0
  const max = Number(input.max) || 100
  const val = Number(input.value) || 0
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0
  input.style.setProperty('--range-pct', `${pct}%`)
}
function initRangeFills() {
  document.querySelectorAll('input[type="range"]').forEach((inp) => {
    updateRangeFill(inp)
    inp.addEventListener('input', () => updateRangeFill(inp))
  })
}

/* ---------- Welle 7 — Format-Helpers ---------- */

/** Sekunden → "12:34" (mm:ss) für Countdowns / Progress.
 *  Über 60 min: "1:23:45" (hh:mm:ss). */
function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Sekunden → "45 Min" / "1 h 23 min" für tageshäppchen-Anzeige
 *  (Hör-Verlauf, Cap-Status). */
function fmtMinutes(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return t('unit.minutes', { n: totalMin })
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? t('unit.hoursMinutes', { h, m }) : `${h} h`
}

/** Date/ISO → "HH:MM" lokal, fürs Schnellzeigen. */
function fmtClock(d) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
}

/** mV → "8.30 V" für die Akku-Anzeige. */
function fmtVoltage(mV) {
  if (!Number.isFinite(mV)) return '—'
  return `${(mV / 1000).toFixed(2)} V`
}

function formatRelative(isoString) {
  if (!isoString) return '—'
  const then = Date.parse(isoString)
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  if (diffMs < 0) return t('rel.soon')
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return t('rel.secondsAgo', { n: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return t('rel.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('rel.hoursAgo', { n: hr })
  return t('rel.daysAgo', { n: Math.floor(hr / 24) })
}

function formatRelativeFuture(isoString) {
  if (!isoString) return '—'
  const then = Date.parse(isoString)
  if (Number.isNaN(then)) return '—'
  const diffMs = then - Date.now()
  if (diffMs < 0) return t('rel.dueNow')
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return t('rel.inSeconds', { n: sec })
  const min = Math.floor(sec / 60)
  return t('rel.inMinutes', { n: min })
}

/* ---------- screen: library (Phase 15e) ---------- */

const libraryState = {
  items: [],              // raw library (active_data.json)
  categoryFilter: 'all',  // 'all' | 'audiobook' | 'music' | 'other'
  sourceFilter: 'all',    // 'all' | 'manual' | 'spotify-sync'
  search: '',
}

async function loadLibrary() {
  try {
    const res = await fetch('/api/data', { credentials: 'same-origin' })
    if (!res.ok) {
      $('#library-list').innerHTML = `<div class="dim" style="padding:24px;text-align:center;">${t('common.loadFailedStatus', { status: res.status })}</div>`
      return
    }
    libraryState.items = await res.json()
    if (!Array.isArray(libraryState.items)) libraryState.items = []
    renderLibrary()
  } catch (err) {
    $('#library-list').innerHTML = `<div class="dim" style="padding:24px;text-align:center;">${escapeHtml(t('common.errorMsg', { msg: err.message }))}</div>`
  }
}

/** Spotify entries added by hand carry only an id, no cover: the box looks the picture up (cached) and
 *  serves it from its cover cache. '' for everything else. */
function spotifyCoverUrl(item) {
  if (item?.type !== 'spotify') return ''
  const ref = item.id
    ? ['album', item.id]
    : item.artistid
      ? ['artist', item.artistid]
      : item.playlistid
        ? ['playlist', item.playlistid]
        : item.showid
          ? ['show', item.showid]
          : item.audiobookid
            ? ['audiobook', item.audiobookid]
            : null
  return ref ? `/api/spotify/cover-for/${ref[0]}/${encodeURIComponent(String(ref[1]))}` : ''
}

function renderLibrary() {
  const list = $('#library-list')
  // Filter pipeline
  const q = libraryState.search.trim().toLowerCase()
  let filtered = libraryState.items.filter((m) => {
    // Skip resume entries — they're internal, not parent-managed.
    if (!m || m.isResume === true || m.category === 'resume') return false
    if (libraryState.categoryFilter !== 'all' && m.category !== libraryState.categoryFilter) return false
    const source = m.source ?? 'manual'
    if (libraryState.sourceFilter !== 'all' && source !== libraryState.sourceFilter) return false
    if (q) {
      const a = (m.artist_override ?? m.artist ?? '').toLowerCase()
      const t = (m.title_override ?? m.title ?? '').toLowerCase()
      if (!a.includes(q) && !t.includes(q)) return false
    }
    return true
  })

  setText('#library-count', tn('library.count', filtered.length))

  if (filtered.length === 0) {
    list.innerHTML = `<div class="dim" style="padding:24px;text-align:center;">${t('library.emptyFilter')}</div>`
    return
  }

  list.innerHTML = ''
  for (const item of filtered) {
    const el = document.createElement('div')
    el.className = 'library-item'
    el.addEventListener('click', () => openLibraryEditSheet(item))

    const cover = document.createElement('img')
    cover.className = 'library-item-cover'
    cover.loading = 'lazy'
    cover.alt = ''
    const src = item.cover_override ?? item.cover ?? item.artistcover_override ?? item.artistcover ?? spotifyCoverUrl(item)
    // no picture to be had: keep the empty tile instead of a broken-image icon
    cover.onerror = () => cover.removeAttribute('src')
    if (src) cover.src = src

    const meta = document.createElement('div')
    meta.className = 'library-item-meta'
    const title = document.createElement('div')
    title.className = 'library-item-title'
    title.textContent = item.title_override ?? item.title ?? item.artist_override ?? item.artist ?? t('library.unnamed')
    const sub = document.createElement('div')
    sub.className = 'library-item-sub'
    sub.textContent = item.artist_override ?? item.artist ?? item.type ?? ''
    meta.append(title, sub)

    const badges = document.createElement('div')
    badges.className = 'library-item-badges'
    const cat = item.category_override ?? item.category
    if (cat) {
      const b = document.createElement('span')
      b.className = `library-item-badge ${cat === 'audiobook' ? 'audiobook' : ''}`
      b.textContent = cat === 'audiobook' ? t('badge.audiobook') : cat === 'music' ? t('cat.music') : t('badge.other')
      badges.appendChild(b)
    }
    if ((item.source ?? 'manual') === 'spotify-sync') {
      const b = document.createElement('span')
      b.className = 'library-item-badge sync'
      b.textContent = '🔗 Sync'
      badges.appendChild(b)
    }

    el.append(cover, meta, badges)
    list.appendChild(el)
  }
}

function openLibraryEditSheet(item) {
  const isSync = (item.source ?? 'manual') === 'spotify-sync'
  const body = $('#library-edit-body')
  setText('#library-edit-title', item.title_override ?? item.title ?? item.artist_override ?? item.artist ?? t('library.edit'))
  body.innerHTML = ''

  const note = document.createElement('p')
  note.className = 'dim'
  note.textContent = isSync
    ? t('libedit.syncNote')
    : t('libedit.manualNote')
  body.appendChild(note)

  const fields = [
    { key: 'artist_override', fallback: 'artist', label: t('field.artist'), isOverride: true },
    { key: 'title_override', fallback: 'title', label: t('field.title'), isOverride: true },
    { key: 'cover_override', fallback: 'cover', label: t('field.cover'), isOverride: true },
    { key: 'artistcover_override', fallback: 'artistcover', label: t('field.artistCover'), isOverride: true },
  ]
  const inputs = {}
  for (const f of fields) {
    const row = document.createElement('div')
    row.className = 'form-row'
    const lab = document.createElement('label')
    lab.textContent = f.label + (f.isOverride && isSync ? ' (Override)' : '')
    lab.setAttribute('for', `library-edit-${f.key}`)
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.id = `library-edit-${f.key}`
    inp.value = item[f.key] ?? (isSync ? '' : item[f.fallback] ?? '')
    if (isSync && f.isOverride) {
      inp.placeholder = t('libedit.syncValue', { v: item[f.fallback] ?? '—' })
    }
    row.append(lab, inp)
    body.appendChild(row)
    inputs[f.key] = inp
  }

  // Category override
  const catRow = document.createElement('div')
  catRow.className = 'form-row'
  const catLab = document.createElement('label')
  catLab.textContent = t('libadd.category') + (isSync ? ' (Override)' : '')
  const catSel = document.createElement('select')
  catSel.id = 'library-edit-category'
  for (const opt of [
    { v: '', l: t('libedit.syncDefault') },
    { v: 'audiobook', l: t('cat.audiobookLong') },
    { v: 'music', l: t('cat.music') },
    { v: 'other', l: t('cat.other') },
  ]) {
    const o = document.createElement('option')
    o.value = opt.v
    o.textContent = opt.l
    if ((item.category_override ?? (isSync ? '' : item.category)) === opt.v) o.selected = true
    catSel.appendChild(o)
  }
  catRow.append(catLab, catSel)
  body.appendChild(catRow)

  // Actions
  const actions = document.createElement('div')
  actions.className = 'actions'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'primary'
  saveBtn.textContent = t('common.save')
  saveBtn.addEventListener('click', async () => {
    // Build full media body so /api/edit receives a complete entry. Only
    // change override fields (and base fields if !isSync).
    const updated = { ...item }
    for (const f of fields) {
      const v = inputs[f.key].value.trim()
      if (isSync) {
        // Override path only.
        if (v) updated[f.key] = v
        else delete updated[f.key]
      } else {
        // Manual: write straight to the base field, ignore overrides.
        if (v) updated[f.fallback] = v
        else delete updated[f.fallback]
      }
    }
    const catVal = catSel.value
    if (isSync) {
      if (catVal) updated.category_override = catVal
      else delete updated.category_override
    } else if (catVal) {
      updated.category = catVal
    }
    const res = await fetch('/api/edit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: item.index, data: updated, original: item }),
    })
    await handleLibraryWriteResult(res, 'common.saveFailedStatus')
  })
  actions.appendChild(saveBtn)
  if (!isSync) {
    const delBtn = document.createElement('button')
    delBtn.className = 'danger'
    delBtn.textContent = t('common.delete')
    delBtn.addEventListener('click', async () => {
      if (!(await confirmDialog(t('libedit.deleteQ', { name: updated_or_label(item) }), t('libedit.deleteBody'), { destructive: true, confirmLabel: t('common.delete') }))) return
      const res = await fetch('/api/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: item.index, original: item }),
      })
      await handleLibraryWriteResult(res, 'common.deleteFailedStatus')
    })
    actions.appendChild(delBtn)
  } else {
    const hint = document.createElement('p')
    hint.className = 'dim'
    hint.style.marginTop = '12px'
    hint.textContent = t('libedit.syncDeleteHint')
    body.appendChild(hint)
  }
  body.appendChild(actions)

  $('#library-edit-backdrop').hidden = false
}

// /api/edit and /api/delete answer "ok"; "locked"/"error" come with status 200 too, so the text counts.
async function handleLibraryWriteResult(res, failKey) {
  const text = res.ok ? await res.text().catch(() => '') : ''
  if (res.ok && text.trim() === 'ok') {
    closeLibraryEditSheet()
    await loadLibrary()
    return
  }
  if (res.status === 409) {
    // the library changed since it was loaded: show the current one instead of touching the wrong entry
    toast('error', t('libedit.changedReload'))
    closeLibraryEditSheet()
    await loadLibrary()
    return
  }
  toast('error', t(failKey, { status: res.ok ? text.trim() || res.status : res.status }))
}

function updated_or_label(item) {
  return item.title_override ?? item.title ?? item.artist_override ?? item.artist ?? t('libedit.thisItem')
}

function closeLibraryEditSheet() {
  $('#library-edit-backdrop').hidden = true
}

function openLibraryAddSheet() {
  // Reset form
  $('#library-add-url').value = ''
  $('#library-add-label').value = ''
  $('#library-add-title').value = ''
  $('#library-add-category').value = 'audiobook'
  $('#library-add-type').value = 'spotifyURL'
  onAddTypeChange()
  $('#library-add-feedback').hidden = true
  $('#library-add-backdrop').hidden = false
}
function closeLibraryAddSheet() { $('#library-add-backdrop').hidden = true }

function onAddTypeChange() {
  const type = $('#library-add-type').value
  $('#library-add-label-row').hidden = (type === 'spotifyURL')
  $('#library-add-title-row').hidden = (type !== 'streamURL')
  // Category defaults nach Type
  if (type === 'streamURL') $('#library-add-category').value = 'other'
  else if (type === 'rssURL') $('#library-add-category').value = 'other'
  else $('#library-add-category').value = 'audiobook'
}

function spotifyIdFromUrl(url, keyword) {
  const ki = url.indexOf(keyword)
  if (ki < 0) return null
  const qi = url.indexOf('?', ki)
  return qi < 0 ? url.slice(ki + keyword.length) : url.substring(ki + keyword.length, qi)
}

async function submitLibraryAdd() {
  const type = $('#library-add-type').value
  const url = $('#library-add-url').value.trim()
  const label = $('#library-add-label').value.trim()
  const title = $('#library-add-title').value.trim()
  const category = $('#library-add-category').value
  if (!url) {
    feedback('#library-add-feedback', 'error', t('libadd.urlRequired'))
    return
  }
  const body = { type: '', category, source: 'manual' }
  if (type === 'spotifyURL') {
    if (!url.startsWith('https://open.spotify.com/')) {
      feedback('#library-add-feedback', 'error', t('libadd.spotifyPrefix'))
      return
    }
    body.type = 'spotify'
    body.spotify_url = url
    if (url.includes('playlist/')) body.playlistid = spotifyIdFromUrl(url, 'playlist/')
    else if (url.includes('artist/')) body.artistid = spotifyIdFromUrl(url, 'artist/')
    else if (url.includes('album/')) body.id = spotifyIdFromUrl(url, 'album/')
    else if (url.includes('show/')) body.showid = spotifyIdFromUrl(url, 'show/')
    else if (url.includes('audiobook/')) body.audiobookid = spotifyIdFromUrl(url, 'audiobook/')
    else {
      feedback('#library-add-feedback', 'error', t('libadd.unknownType'))
      return
    }
    if (label) body.artist = label
  } else if (type === 'streamURL') {
    body.type = 'radio'
    body.id = url.startsWith('https://') ? url.replace('https://', 'http://') : url
    body.artist = label || 'Radio'
    body.title = title || 'Stream'
  } else if (type === 'rssURL') {
    body.type = 'rss'
    body.id = url.startsWith('https://') ? url.replace('https://', 'http://') : url
    body.artist = label || 'Podcast'
  }
  const res = await fetch('/api/add', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) {
    feedback('#library-add-feedback', 'success', t('libadd.added'))
    setTimeout(async () => {
      closeLibraryAddSheet()
      await loadLibrary()
    }, 600)
  } else {
    feedback('#library-add-feedback', 'error', t('common.errorStatus', { status: res.status }))
  }
}

/* ---------- screen: caps (Phase 15h — Spielzeit & Ruhe) ---------- */

const DAYS = [
  { key: 'mon' },
  { key: 'tue' },
  { key: 'wed' },
  { key: 'thu' },
  { key: 'fri' },
  { key: 'sat' },
  { key: 'sun' },
]

// In-memory caps state — built from /api/eltern/caps-config, mutated by
// the form, sent back on Save. Keeps a clean separation between live
// status (re-fetched each render) and config (only re-fetched on entry).
let capsConfig = null

async function loadCaps() {
  await Promise.all([loadCapsStatus(), loadCapsConfig(), loadSleepTimer()])
}

/** What may happen to what is playing when a limit is reached (set in the admin interface). */
function capsGraceText(mode) {
  if (mode === 'stop') return t('grace.stop')
  if (mode === 'album') return t('grace.album')
  return t('grace.song')
}

/** Translate the player's raw state token to a friendly badge text (active UI language). */
function capsStateText(state, kind) {
  if (state === 'normal') return t('capstate.normal')
  if (state === 'grace') return kind === 'quiet' ? t('capstate.grace') : t('capstate.graceOver')
  if (state === 'blocked') return kind === 'quiet' ? t('capstate.blockedQuiet') : t('capstate.blocked')
  return '—'
}

async function loadCapsStatus() {
  try {
    const res = await fetch('/api/playtime', { credentials: 'same-origin' })
    if (!res.ok) return
    const body = await res.json().catch(() => ({}))
    // /api/playtime shape (player-side): {enabled, state, playtime:{enabled,state,
    //   usedSeconds, remainingSeconds, limitMinutes, ...}, quiet:{enabled, state,
    //   inWindow, label?, ...}, override:{...}}. WebApp was reading non-existent
    //   keys (usedMinutes, remainingMinutes, body.quietHours.*) — fixed in 17j.
    const pt = body?.playtime ?? {}
    const qh = body?.quiet ?? {}

    setText('#caps-playtime-enabled', pt.enabled ? t('common.checkActive') : t('common.crossOff'))
    if (pt.enabled) {
      const usedMin = Number.isFinite(pt.usedSeconds) ? Math.floor(pt.usedSeconds / 60) : null
      const remMin = Number.isFinite(pt.remainingSeconds) ? Math.floor(pt.remainingSeconds / 60) : null
      const limit = Number.isFinite(pt.limitMinutes) ? pt.limitMinutes : null
      setText('#caps-today-used', usedMin != null && limit != null ? t('caps.usedOfLimit', { used: usedMin, limit }) : usedMin != null ? t('unit.minutes', { n: usedMin }) : '—')
      setText('#caps-today-remaining', remMin != null ? t('unit.minutes', { n: remMin }) : '—')
      setText('#caps-state', capsStateText(pt.state, 'playtime'))
    } else {
      setText('#caps-today-used', '—')
      setText('#caps-today-remaining', '—')
      setText('#caps-state', '—')
    }

    if (qh.enabled) {
      const label = qh.label ? ` (${qh.label})` : ''
      const inWin = qh.inWindow ? ` · ${t('caps.inWindow')}` : ''
      setText('#caps-quiet-state', `${capsStateText(qh.state, 'quiet')}${label}${inWin && qh.state === 'normal' ? '' : inWin}`)
    } else {
      setText('#caps-quiet-state', t('common.crossOff'))
    }
  } catch { /* swallow */ }
}

async function loadCapsConfig() {
  const res = await api(`${API}/caps-config`)
  if (!res.ok) {
    feedback('#caps-config-feedback', 'error', t('caps.configLoadFailed', { status: res.status }))
    return
  }
  capsConfig = res.body ?? {}
  renderCapsDayGrid()
  renderQuietSchedule()
  $('#caps-playtime-toggle').checked = !!capsConfig.playtimeLimit?.enabled
  $('#caps-quiet-toggle').checked = !!capsConfig.quietHours?.enabled
  setText('#caps-overrun-info', capsGraceText(capsConfig.playtimeLimit?.graceMode))
}

function renderCapsDayGrid() {
  const grid = $('#caps-day-grid')
  grid.innerHTML = ''
  const limits = capsConfig?.playtimeLimit?.limitsMinutes ?? {}
  for (const { key } of DAYS) {
    const label = t(`day.short.${key}`)
    const cell = document.createElement('div')
    cell.className = 'day-cell'
    const lab = document.createElement('label')
    lab.textContent = label
    lab.setAttribute('for', `caps-limit-${key}`)
    const inp = document.createElement('input')
    inp.type = 'number'
    inp.id = `caps-limit-${key}`
    inp.dataset.day = key
    inp.min = '0'
    inp.max = '1440'
    inp.step = '5'
    inp.value = limits[key] ?? 60
    inp.addEventListener('input', () => {
      const v = Math.max(0, Math.min(1440, Math.floor(Number(inp.value) || 0)))
      if (!capsConfig.playtimeLimit.limitsMinutes) capsConfig.playtimeLimit.limitsMinutes = {}
      capsConfig.playtimeLimit.limitsMinutes[key] = v
    })
    cell.append(lab, inp)
    grid.appendChild(cell)
  }
}

function renderQuietSchedule() {
  const root = $('#caps-quiet-schedule')
  root.innerHTML = ''
  const schedule = capsConfig?.quietHours?.schedule ?? {}
  for (const { key } of DAYS) {
    const label = t(`day.short.${key}`)
    const windows = schedule[key] ?? []
    const dayEl = document.createElement('div')
    dayEl.className = 'quiet-day'
    const header = document.createElement('div')
    header.className = 'quiet-day-header'
    const labelSpan = document.createElement('span')
    labelSpan.className = 'quiet-day-label'
    labelSpan.textContent = label
    const addBtn = document.createElement('button')
    addBtn.className = 'quiet-add-btn'
    addBtn.textContent = t('caps.addWindow')
    addBtn.addEventListener('click', () => {
      if (!capsConfig.quietHours.schedule) capsConfig.quietHours.schedule = {}
      const list = capsConfig.quietHours.schedule[key] ?? []
      // {from,to,label?} — matches the player (spotify-control.js) and Admin
      // (mupi.php). The earlier {start,end} was a WebApp-only shape mismatch
      // that the player couldn't read (fixed in 17j).
      list.push({ from: '20:00', to: '07:00', label: t('caps.defaultWindowLabel') })
      capsConfig.quietHours.schedule[key] = list
      renderQuietSchedule()
    })
    header.append(labelSpan, addBtn)
    dayEl.appendChild(header)
    windows.forEach((w, idx) => {
      const row = document.createElement('div')
      row.className = 'quiet-window'
      const from = document.createElement('input')
      from.type = 'time'
      from.value = w.from ?? '20:00'
      from.addEventListener('change', () => { capsConfig.quietHours.schedule[key][idx].from = from.value })
      const arrow = document.createElement('span')
      arrow.className = 'arrow'
      arrow.textContent = '→'
      const to = document.createElement('input')
      to.type = 'time'
      to.value = w.to ?? '07:00'
      to.addEventListener('change', () => { capsConfig.quietHours.schedule[key][idx].to = to.value })
      const labelInp = document.createElement('input')
      labelInp.type = 'text'
      labelInp.className = 'quiet-window-label'
      labelInp.placeholder = 'Label (optional)'
      labelInp.value = w.label ?? ''
      labelInp.addEventListener('input', () => {
        const v = labelInp.value.trim()
        if (v) capsConfig.quietHours.schedule[key][idx].label = v
        else delete capsConfig.quietHours.schedule[key][idx].label
      })
      const rm = document.createElement('button')
      rm.className = 'remove'
      rm.textContent = '×'
      rm.addEventListener('click', () => {
        capsConfig.quietHours.schedule[key].splice(idx, 1)
        renderQuietSchedule()
      })
      row.append(from, arrow, to, labelInp, rm)
      dayEl.appendChild(row)
    })
    root.appendChild(dayEl)
  }
}

// Texts of the overlays on the box display. The box shows per text: own text > chosen language > English.
// Languages and their texts come from the box frontend's assets/i18n/display-texts.json (same server).
const DISPLAY_TEXT_FIELDS = [
  { key: 'blockedHeading', labelKey: 'dfield.blockedHeading' },
  { key: 'blockedSubheading', labelKey: 'dfield.blockedSubheading' },
  { key: 'quietHeading', labelKey: 'dfield.quietHeading' },
  { key: 'quietSubheading', labelKey: 'dfield.quietSubheading' },
  { key: 'parentsTitle', labelKey: 'dfield.parentsTitle' },
  { key: 'parentsHint', labelKey: 'dfield.parentsHint' },
  { key: 'parentsCountdown', labelKey: 'dfield.parentsCountdown' },
  { key: 'parentsClose', labelKey: 'dfield.parentsClose' },
]
let displayLanguages = {}

function applyDisplayPlaceholders() {
  const code = $('#display-lang')?.value || 'en'
  const texts = displayLanguages[code]?.texts ?? displayLanguages.en?.texts ?? {}
  for (const input of document.querySelectorAll('#display-texts-form input[data-key]')) {
    input.placeholder = texts[input.dataset.key] ?? ''
  }
}

async function loadDisplayTexts() {
  const box = $('#display-texts-form')
  if (!box) return
  const [res, file] = await Promise.all([
    api(`${API}/display-texts`),
    fetch('/assets/i18n/display-texts.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ])
  displayLanguages = file?.languages ?? {}
  const texts = res.ok ? (res.body?.texts ?? {}) : {}
  const current = res.ok ? (res.body?.language ?? 'en') : 'en'
  box.textContent = ''

  const langRow = document.createElement('div')
  langRow.className = 'form-row'
  const langLabel = document.createElement('label')
  langLabel.htmlFor = 'display-lang'
  langLabel.textContent = t('dtexts.language')
  const select = document.createElement('select')
  select.id = 'display-lang'
  const codes = Object.keys(displayLanguages)
  if (!codes.includes(current)) codes.unshift(current)
  for (const code of codes) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = displayLanguages[code]?.name ?? code
    if (code === current) opt.selected = true
    select.appendChild(opt)
  }
  select.addEventListener('change', applyDisplayPlaceholders)
  langRow.append(langLabel, select)
  box.appendChild(langRow)

  const hint = document.createElement('p')
  hint.className = 'dim'
  hint.textContent = t('dtexts.ownHint')
  box.appendChild(hint)

  for (const field of DISPLAY_TEXT_FIELDS) {
    const row = document.createElement('div')
    row.className = 'form-row'
    const label = document.createElement('label')
    label.htmlFor = `display-text-${field.key}`
    label.textContent = t(field.labelKey)
    const input = document.createElement('input')
    input.type = 'text'
    input.id = `display-text-${field.key}`
    input.dataset.key = field.key
    input.maxLength = 120
    input.value = texts[field.key] ?? ''
    row.append(label, input)
    box.appendChild(row)
  }
  applyDisplayPlaceholders()
}

async function saveDisplayTexts() {
  const texts = {}
  for (const input of document.querySelectorAll('#display-texts-form input[data-key]')) {
    texts[input.dataset.key] = input.value.trim()
  }
  const language = $('#display-lang')?.value || 'en'
  const res = await api(`${API}/display-texts`, { method: 'POST', body: { language, texts } })
  if (res.ok) {
    feedback('#display-texts-feedback', 'success', t('dtexts.saved'))
  } else {
    feedback('#display-texts-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

async function saveCapsConfig() {
  if (!capsConfig) return
  // Pull current toggle values into the in-memory config before send.
  capsConfig.playtimeLimit.enabled = $('#caps-playtime-toggle').checked
  capsConfig.quietHours.enabled = $('#caps-quiet-toggle').checked
  const res = await api(`${API}/caps-config`, {
    method: 'POST',
    body: {
      playtimeLimit: {
        enabled: capsConfig.playtimeLimit.enabled,
        graceMode: capsConfig.playtimeLimit.graceMode,
        limitsMinutes: capsConfig.playtimeLimit.limitsMinutes,
      },
      quietHours: {
        enabled: capsConfig.quietHours.enabled,
        graceMode: capsConfig.quietHours.graceMode,
        schedule: capsConfig.quietHours.schedule,
      },
    },
  })
  if (res.ok) {
    feedback('#caps-config-feedback', 'success', t('common.savedNow'))
    loadCapsStatus()
  } else {
    feedback('#caps-config-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

function getCapsOverrideMinutes() {
  const v = Number($('#caps-override-minutes').value)
  if (!Number.isFinite(v) || v < 1 || v > 1440) {
    feedback('#caps-action-feedback', 'error', t('caps.minutesRange'))
    return null
  }
  return v
}

async function capsExtend() {
  const mins = getCapsOverrideMinutes()
  if (mins === null) return
  // via api(): sends the session's CSRF token, which these endpoints require off-box
  const res = await api('/api/playtime/extend', { method: 'POST', body: { minutes: mins } })
  if (res.ok) {
    feedback('#caps-action-feedback', 'success', t('caps.extended', { n: mins }))
    loadCapsStatus()
  } else {
    feedback('#caps-action-feedback', 'error', t('common.errorStatus', { status: res.status }))
  }
}

async function capsRelease() {
  const mins = getCapsOverrideMinutes()
  if (mins === null) return
  // via api(): sends the session's CSRF token, which these endpoints require off-box
  const res = await api('/api/playtime/release', { method: 'POST', body: { minutes: mins } })
  if (res.ok) {
    feedback('#caps-action-feedback', 'success', t('caps.released', { n: mins }))
    loadCapsStatus()
  } else {
    feedback('#caps-action-feedback', 'error', t('common.errorStatus', { status: res.status }))
  }
}

async function capsQuietNow() {
  const mins = getCapsOverrideMinutes()
  if (mins === null) return
  // via api(): sends the session's CSRF token, which these endpoints require off-box
  const res = await api('/api/quiethours/now', { method: 'POST', body: { minutes: mins } })
  if (res.ok) {
    feedback('#caps-action-feedback', 'success', t('caps.quietNowDone', { n: mins }))
    loadCapsStatus()
  } else {
    feedback('#caps-action-feedback', 'error', t('common.errorStatus', { status: res.status }))
  }
}

/* ---------- screen: search (Phase 17a) ---------- */

const searchState = { type: 'all' }

function pickSearchImg(images) {
  if (!Array.isArray(images) || !images.length) return ''
  return images[1]?.url || images[0]?.url || ''
}

function searchResultRow(thumb, title, subtitle, actionEl) {
  const row = document.createElement('div')
  row.className = 'search-result-row'
  const img = document.createElement('img')
  img.className = 'search-thumb'
  img.loading = 'lazy'
  img.alt = ''
  if (thumb) img.src = thumb
  const info = document.createElement('div')
  info.className = 'search-result-info'
  const t = document.createElement('span')
  t.className = 'value'
  t.textContent = title
  const s = document.createElement('span')
  s.className = 'dim'
  s.textContent = subtitle
  info.append(t, s)
  row.append(img, info)
  if (actionEl) row.append(actionEl)
  return row
}

/** "+" button that pins an album (Phase 17b). Artist-add comes in 17c. */
function makeAddAlbumBtn(albumId, name) {
  const b = document.createElement('button')
  b.className = 'ghost search-add-btn'
  b.textContent = '+'
  b.title = t('search.addToBox')
  b.addEventListener('click', () => addAlbumFromSearch(albumId, name, b))
  return b
}

async function addAlbumFromSearch(albumId, name, btn) {
  const category = $('#search-add-category')?.value || 'audiobook'
  if (btn) {
    btn.disabled = true
    btn.textContent = '…'
  }
  const res = await api(`${API}/library/add-album`, { method: 'POST', body: { albumId, category, name } })
  if (!res.ok) {
    feedback('#search-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    if (btn) {
      btn.disabled = false
      btn.textContent = '+'
    }
    return
  }
  const sync = await fireSyncTrigger()
  if (btn) {
    btn.textContent = '✓'
    btn.classList.add('added')
  }
  feedback('#search-feedback', sync.kind, t('search.albumAdded', { name, sync: sync.text }))
}

function renderSearchResults(data) {
  const wrap = $('#search-results')
  if (!wrap) return
  wrap.innerHTML = ''
  const artistNames = (arr) => (arr || []).map((x) => x?.name).filter(Boolean).join(', ')
  const groups = [
    [
      t('search.artists'),
      (data.artists || []).map((a) =>
        searchResultRow(pickSearchImg(a.images), a.name, t('search.artistSub'), a.id ? makeSubscribeArtistBtn(a.id, a.name) : undefined),
      ),
    ],
    [
      t('search.albums'),
      (data.albums || []).map((a) =>
        searchResultRow(pickSearchImg(a.images), a.name, artistNames(a.artists), a.id ? makeAddAlbumBtn(a.id, a.name) : undefined),
      ),
    ],
    [
      t('search.tracks'),
      (data.tracks || []).map((t) =>
        searchResultRow(
          pickSearchImg(t.album?.images),
          t.name,
          `${artistNames(t.artists)} · ${t.album?.name ?? ''}`,
          t.album?.id ? makeAddAlbumBtn(t.album.id, t.album?.name ?? t.name) : undefined,
        ),
      ),
    ],
  ]
  let any = false
  for (const [label, rows] of groups) {
    if (!rows.length) continue
    any = true
    const card = document.createElement('div')
    card.className = 'card'
    const h = document.createElement('h3')
    h.textContent = label
    card.appendChild(h)
    for (const r of rows) card.appendChild(r)
    wrap.appendChild(card)
  }
  if (!any) {
    const c = document.createElement('div')
    c.className = 'card'
    const p = document.createElement('p')
    p.className = 'dim'
    p.textContent = t('search.noResults')
    c.appendChild(p)
    wrap.appendChild(c)
  }
}

async function doSearch() {
  const q = ($('#search-query')?.value ?? '').trim()
  if (q.length < 2) {
    feedback('#search-feedback', 'error', t('search.minChars'))
    return
  }
  const types = searchState.type === 'all' ? 'artist,album,track' : searchState.type
  feedback('#search-feedback', 'success', t('search.searching'))
  const res = await api(`/api/spotify/search?q=${encodeURIComponent(q)}&types=${types}&limit=8`)
  if (!res.ok) {
    feedback('#search-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  const fb = $('#search-feedback')
  if (fb) fb.hidden = true
  renderSearchResults(res.body ?? {})
}

/** "+" button that subscribes to a whole artist (Phase 17c). */
function makeSubscribeArtistBtn(artistId, name) {
  const b = document.createElement('button')
  b.className = 'ghost search-add-btn'
  b.textContent = '+'
  b.title = t('search.subscribeArtist')
  b.addEventListener('click', () => subscribeArtistFromSearch(artistId, name, b))
  return b
}

async function subscribeArtistFromSearch(artistId, name, btn) {
  const category = $('#search-add-category')?.value || 'audiobook'
  if (!(await confirmDialog(t('search.subscribeQ', { name }), t('search.subscribeBody'), { confirmLabel: t('search.subscribe') }))) {
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = '…'
  }
  const res = await api(`${API}/library/subscribe-artist`, { method: 'POST', body: { artistId, name, category } })
  if (!res.ok) {
    feedback('#search-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    if (btn) {
      btn.disabled = false
      btn.textContent = '+'
    }
    return
  }
  const sync = await fireSyncTrigger()
  if (btn) {
    btn.textContent = '✓'
    btn.classList.add('added')
  }
  feedback('#search-feedback', sync.kind, t('search.subscribed', { name, sync: sync.text }))
  loadSubscriptions()
}

/** Clear stale search results when (re-)entering the search screen. The
 *  managed-content list now lives in the Library, not here. */
function resetSearch() {
  const wrap = $('#search-results')
  if (wrap) wrap.innerHTML = ''
  const fb = $('#search-feedback')
  if (fb) fb.hidden = true
}

/* ---------- managed content (Phase 17d) ---------- */

async function loadSubscriptions() {
  const res = await api(`${API}/library/subscriptions`)
  if (!res.ok) return
  renderSubscriptions(res.body ?? {})
}

function renderSubscriptions(data) {
  const wrap = $('#managed-list')
  if (!wrap) return
  wrap.innerHTML = ''
  const artists = data.artists ?? []
  const albums = data.explicit_albums ?? []
  if (!artists.length && !albums.length) {
    const p = document.createElement('p')
    p.className = 'dim'
    p.textContent = t('managed.empty')
    wrap.appendChild(p)
    return
  }
  for (const a of artists) {
    const row = document.createElement('div')
    row.className = 'managed-row'
    const head = document.createElement('div')
    head.className = 'managed-head'
    const nm = document.createElement('span')
    nm.className = 'value'
    nm.textContent = `🎤 ${a.name || a.id}`
    const manage = document.createElement('button')
    manage.className = 'ghost'
    manage.textContent = t('managed.manageAlbums')
    manage.addEventListener('click', () => toggleArtistAlbums(a, row, manage))
    const rm = document.createElement('button')
    rm.className = 'ghost'
    rm.textContent = t('common.remove')
    rm.addEventListener('click', () => unsubscribeArtist(a.id, a.name || a.id))
    const btns = document.createElement('div')
    btns.className = 'managed-btns'
    btns.append(manage, rm)
    head.append(nm, btns)
    const range = document.createElement('div')
    range.className = 'managed-range'
    const lbl = document.createElement('span')
    lbl.className = 'dim'
    lbl.textContent = t('managed.episodes')
    const from = document.createElement('input')
    from.type = 'number'
    from.min = '1'
    from.placeholder = t('managed.from')
    from.value = a.range_from ?? ''
    const sep = document.createElement('span')
    sep.className = 'dim'
    sep.textContent = '–'
    const to = document.createElement('input')
    to.type = 'number'
    to.min = '1'
    to.placeholder = t('managed.to')
    to.value = a.range_to ?? ''
    const apply = document.createElement('button')
    apply.className = 'ghost'
    apply.textContent = t('common.apply')
    apply.addEventListener('click', () => applyArtistRange(a, from.value, to.value, apply))
    range.append(lbl, from, sep, to, apply)
    row.append(head, range)
    wrap.appendChild(row)
  }
  for (const al of albums) {
    const row = document.createElement('div')
    row.className = 'managed-row'
    const head = document.createElement('div')
    head.className = 'managed-head'
    const nm = document.createElement('span')
    nm.className = 'value'
    nm.textContent = `💿 ${al.name || al.id}`
    const rm = document.createElement('button')
    rm.className = 'ghost'
    rm.textContent = t('common.remove')
    rm.addEventListener('click', () => removeAlbum(al.id, al.name || al.id))
    head.append(nm, rm)
    row.append(head)
    wrap.appendChild(row)
  }
}

async function unsubscribeArtist(artistId, name) {
  if (!(await confirmDialog(t('common.removeQ', { name }), t('managed.unsubBody'), { destructive: true, confirmLabel: t('common.remove') }))) return
  const res = await api(`${API}/library/unsubscribe-artist`, { method: 'POST', body: { artistId } })
  if (!res.ok) {
    feedback('#managed-feedback', 'error', t('common.errorStatus', { status: res.status }))
    return
  }
  const sync = await fireSyncTrigger()
  feedback('#managed-feedback', sync.kind, t('managed.removed', { name, sync: sync.text }))
  loadSubscriptions()
}

async function removeAlbum(albumId, name) {
  if (!(await confirmDialog(t('common.removeQ', { name }), t('managed.removeAlbumBody'), { destructive: true, confirmLabel: t('common.remove') }))) return
  const res = await api(`${API}/library/remove-album`, { method: 'POST', body: { albumId } })
  if (!res.ok) {
    feedback('#managed-feedback', 'error', t('common.errorStatus', { status: res.status }))
    return
  }
  const sync = await fireSyncTrigger()
  feedback('#managed-feedback', sync.kind, t('managed.removed', { name, sync: sync.text }))
  loadSubscriptions()
}

async function applyArtistRange(sub, fromStr, toStr, btn) {
  const range_from = fromStr ? Number(fromStr) : undefined
  const range_to = toStr ? Number(toStr) : undefined
  if (btn) {
    btn.disabled = true
    btn.textContent = '…'
  }
  const res = await api(`${API}/library/subscribe-artist`, {
    method: 'POST',
    body: { artistId: sub.id, name: sub.name, category: sub.category, range_from, range_to },
  })
  if (btn) {
    btn.disabled = false
    btn.textContent = t('common.apply')
  }
  if (!res.ok) {
    feedback('#managed-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  const sync = await fireSyncTrigger()
  feedback('#managed-feedback', sync.kind, t('managed.rangeApplied', { sync: sync.text }))
  loadSubscriptions()
}

/* ---------- per-artist album include/exclude (Phase 17e) ---------- */

/** Expand/collapse the album list under an artist subscription row. Lazy-
 *  loads from the sync's own ordering so positions match the range. */
async function toggleArtistAlbums(a, row, btn) {
  const open = row.querySelector('.managed-albums')
  if (open) {
    open.remove()
    btn.textContent = t('managed.manageAlbums')
    return
  }
  btn.disabled = true
  btn.textContent = t('common.loadingLower')
  const res = await api(`${SYNC_API}/artist-albums?artistId=${encodeURIComponent(a.id)}`)
  btn.disabled = false
  btn.textContent = t('managed.hideAlbums')
  const panel = document.createElement('div')
  panel.className = 'managed-albums'
  if (!res.ok) {
    panel.innerHTML = `<p class="dim">${t('managed.albumsLoadFailed')}</p>`
    btn.textContent = t('managed.manageAlbums')
  } else {
    renderArtistAlbums(a, res.body?.albums ?? [], panel)
  }
  row.appendChild(panel)
}

function renderArtistAlbums(a, albums, panel) {
  panel.innerHTML = ''
  if (!albums.length) {
    panel.innerHTML = `<p class="dim">${t('managed.noAlbums')}</p>`
    return
  }
  for (const al of albums) {
    const line = document.createElement('div')
    line.className = 'album-line' + (al.inRange ? '' : ' out') + (al.excluded ? ' excluded' : '')
    const idx = document.createElement('span')
    idx.className = 'album-idx'
    idx.textContent = al.position
    const thumb = document.createElement('img')
    thumb.className = 'album-thumb'
    thumb.alt = ''
    thumb.loading = 'lazy'
    if (al.cover) thumb.src = al.cover
    const nm = document.createElement('span')
    nm.className = 'album-nm'
    nm.textContent = al.name || al.id
    const act = document.createElement('button')
    act.className = 'ghost'
    if (!al.inRange) {
      act.textContent = t('managed.outside')
      act.disabled = true
      act.title = t('managed.outsideTitle')
    } else if (al.excluded) {
      act.textContent = t('managed.include')
      act.addEventListener('click', () => setExclude(a, al, false, panel))
    } else {
      act.textContent = t('managed.exclude')
      act.addEventListener('click', () => setExclude(a, al, true, panel))
    }
    line.append(idx, thumb, nm, act)
    panel.appendChild(line)
  }
}

async function setExclude(a, al, excluded, panel) {
  const res = await api(`${API}/library/artist-exclude`, {
    method: 'POST',
    body: { artistId: a.id, albumId: al.id, excluded },
  })
  if (!res.ok) {
    feedback('#managed-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  const sync = await fireSyncTrigger()
  feedback(
    '#managed-feedback',
    sync.kind,
    excluded ? t('managed.excluded', { name: al.name, sync: sync.text }) : t('managed.reincluded', { name: al.name, sync: sync.text }),
  )
  const r2 = await api(`${SYNC_API}/artist-albums?artistId=${encodeURIComponent(a.id)}`)
  if (r2.ok) renderArtistAlbums(a, r2.body?.albums ?? [], panel)
}

/* ---------- screen: bluetooth (Phase 15d) ---------- */

async function loadBluetooth() {
  const res = await api(`${API}/bluetooth`)
  if (!res.ok) return
  const b = res.body ?? {}
  const power = $('#bt-power')
  if (power) power.checked = b.powered === true
  const ac = $('#bt-autoconnect')
  if (ac) ac.checked = b.autoconnect === true
  renderBtPaired(b.devices ?? [])
}

function renderBtPaired(devices) {
  const wrap = $('#bt-paired-list')
  if (!wrap) return
  wrap.innerHTML = ''
  if (!devices.length) {
    const p = document.createElement('p')
    p.className = 'dim'
    p.textContent = t('bt.noPaired')
    wrap.appendChild(p)
    return
  }
  for (const d of devices) {
    const row = document.createElement('div')
    row.className = 'bt-device-row'
    const info = document.createElement('span')
    info.className = 'bt-device-info'
    info.textContent = d.connected ? `🟢 ${d.name || d.mac}` : `${d.name || d.mac} · ${d.mac}`
    const rm = document.createElement('button')
    rm.className = 'ghost'
    rm.textContent = t('bt.unpair')
    rm.addEventListener('click', () => btRemove(d.mac, d.name || d.mac))
    row.append(info, rm)
    wrap.appendChild(row)
  }
}

async function btSetPower() {
  const on = $('#bt-power').checked
  feedback('#bt-power-feedback', 'success', on ? t('bt.enabling') : t('bt.disabling'))
  const res = await api(`${API}/bluetooth/power`, { method: 'POST', body: { on } })
  if (res.ok) {
    feedback('#bt-power-feedback', 'success', t('common.done'))
    setTimeout(loadBluetooth, 1500)
  } else {
    feedback('#bt-power-feedback', 'error', t('common.errorStatus', { status: res.status }))
  }
}

async function btSetAutoconnect() {
  const enable = $('#bt-autoconnect').checked
  const res = await api(`${API}/bluetooth/autoconnect`, { method: 'POST', body: { enable } })
  if (!res.ok) feedback('#bt-power-feedback', 'error', t('bt.autoconnectError', { status: res.status }))
}

async function btScan() {
  const btn = $('#bt-scan-btn')
  if (btn) {
    btn.disabled = true
    btn.textContent = t('bt.scanning')
  }
  feedback('#bt-feedback', 'success', t('bt.searching'))
  const res = await api(`${API}/bluetooth/scan`, { method: 'POST' })
  if (btn) {
    btn.disabled = false
    btn.textContent = t('bt.scan')
  }
  if (!res.ok) {
    feedback('#bt-feedback', 'error', t('common.scanFailed', { status: res.status }))
    return
  }
  renderBtScan(res.body?.found ?? [])
}

function renderBtScan(found) {
  const wrap = $('#bt-scan-list')
  if (!wrap) return
  wrap.innerHTML = ''
  if (!found.length) {
    const p = document.createElement('p')
    p.className = 'dim'
    p.textContent = t('bt.noneFound')
    wrap.appendChild(p)
    return
  }
  for (const d of found) {
    const row = document.createElement('div')
    row.className = 'bt-device-row'
    const info = document.createElement('span')
    info.className = 'bt-device-info'
    info.textContent = `${d.name || d.mac} · ${d.mac}`
    const pair = document.createElement('button')
    pair.className = 'primary'
    pair.textContent = t('bt.pair')
    pair.addEventListener('click', () => btPair(d.mac, d.name || d.mac, pair))
    row.append(info, pair)
    wrap.appendChild(row)
  }
  feedback('#bt-feedback', 'success', t('bt.found', { n: found.length }))
}

async function btPair(mac, name, btn) {
  if (btn) {
    btn.disabled = true
    btn.textContent = t('bt.pairing')
  }
  const res = await api(`${API}/bluetooth/pair`, { method: 'POST', body: { mac } })
  if (res.ok) {
    feedback('#bt-feedback', 'success', t('bt.pairedMsg', { name }))
    setTimeout(loadBluetooth, 1500)
  } else {
    feedback('#bt-feedback', 'error', res.body?.error ?? t('bt.pairFailed', { status: res.status }))
    if (btn) {
      btn.disabled = false
      btn.textContent = t('bt.pair')
    }
  }
}

async function btRemove(mac, name) {
  if (!(await confirmDialog(t('bt.unpairQ', { name }), t('bt.unpairBody'), { destructive: true, confirmLabel: t('bt.unpair') }))) return
  const res = await api(`${API}/bluetooth/remove`, { method: 'POST', body: { mac } })
  if (res.ok) {
    feedback('#bt-feedback', 'success', t('bt.unpaired', { name }))
    setTimeout(loadBluetooth, 1500)
  } else {
    feedback('#bt-feedback', 'error', t('bt.unpairFailed', { status: res.status }))
  }
}

/* ---------- screen: telegram (Phase 15f) ---------- */

const telegramState = { chatIds: [] }

async function loadTelegram() {
  const res = await api(`${API}/telegram-config`)
  if (!res.ok) return
  const cfg = res.body ?? {}
  const active = $('#tg-active')
  if (active) active.checked = cfg.active === true
  const playback = $('#tg-notify-playback')
  if (playback) playback.checked = cfg.notifyPlayback === true
  setText('#tg-token-status', cfg.token_configured ? t('tg.tokenSet') : t('tg.tokenUnset'))
  const tok = $('#tg-token')
  if (tok) tok.value = ''
  telegramState.chatIds = Array.isArray(cfg.chatIds) ? cfg.chatIds.map((c) => ({ id: String(c.id ?? ''), label: String(c.label ?? '') })) : []
  renderTelegramChats()
}

/** Build chat rows with DOM methods (not innerHTML) so user-supplied
 *  ids/labels can't inject markup. */
function renderTelegramChats() {
  const wrap = $('#tg-chat-list')
  if (!wrap) return
  wrap.innerHTML = ''
  telegramState.chatIds.forEach((c, idx) => {
    const row = document.createElement('div')
    row.className = 'tg-chat-row'
    const idInp = document.createElement('input')
    idInp.type = 'text'
    idInp.inputMode = 'numeric'
    idInp.placeholder = t('tg.chatId')
    idInp.value = c.id
    idInp.addEventListener('input', () => { telegramState.chatIds[idx].id = idInp.value.trim() })
    const labelInp = document.createElement('input')
    labelInp.type = 'text'
    labelInp.placeholder = t('tg.chatLabel')
    labelInp.value = c.label
    labelInp.addEventListener('input', () => { telegramState.chatIds[idx].label = labelInp.value })
    const rm = document.createElement('button')
    rm.className = 'ghost'
    rm.textContent = '×'
    rm.setAttribute('aria-label', t('common.remove'))
    rm.addEventListener('click', () => { telegramState.chatIds.splice(idx, 1); renderTelegramChats() })
    row.append(idInp, labelInp, rm)
    wrap.appendChild(row)
  })
}

function addTelegramChat() {
  telegramState.chatIds.push({ id: '', label: '' })
  renderTelegramChats()
}

async function saveTelegram() {
  for (const c of telegramState.chatIds) {
    if (!/^-?\d{1,20}$/.test(c.id)) {
      feedback('#tg-feedback', 'error', t('tg.invalidChatId', { id: c.id }))
      return
    }
  }
  const body = { active: $('#tg-active').checked, notifyPlayback: $('#tg-notify-playback')?.checked === true, chatIds: telegramState.chatIds }
  const tok = $('#tg-token').value.trim()
  if (tok) body.token = tok
  const res = await api(`${API}/telegram-config`, { method: 'POST', body })
  if (res.ok) {
    feedback('#tg-feedback', 'success', t('tg.saved'))
    if (tok) {
      $('#tg-token').value = ''
      setText('#tg-token-status', t('tg.tokenSet'))
    }
  } else {
    feedback('#tg-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

/* ---------- screen: system (Phase 15g) ---------- */

function formatUptime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '—'
  const gb = n / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`
}

/* ---------- Upload: tracks and folders onto the SD card ---------- */

// What the box plays and the pictures it takes as covers (as in the backend, eltern/upload.ts)
const UPLOAD_AUDIO = /\.(mp3|flac|wav|wma|ogg|m4a)$/i
const UPLOAD_IMAGE = /\.(jpe?g|jfif|png|webp)$/i

// items: {file, top, sub} - top is the chosen folder's name ('' for single files), sub the path below it
const uploadState = { items: [], cover: null, skipped: 0, free: null, reserve: 0, running: false, xhr: null, cancelled: false }

const uploadCategory = () => $('#upload-category')?.value || 'audiobook'
const uploadArtist = () => ($('#upload-artist')?.value ?? '').trim()
const uploadAlbum = () => ($('#upload-album')?.value ?? '').trim()

function fillDatalist(sel, names) {
  const list = $(sel)
  if (!list) return
  list.replaceChildren(...names.map((n) => Object.assign(document.createElement('option'), { value: n })))
}

async function loadUploadFolders(withArtist) {
  const q = new URLSearchParams({ category: uploadCategory() })
  if (withArtist) {
    if (!uploadArtist()) return fillDatalist('#upload-album-list', [])
    q.set('artist', uploadArtist())
  }
  const res = await api(`${API}/local/folders?${q}`)
  if (!res.ok) return
  fillDatalist(withArtist ? '#upload-album-list' : '#upload-artist-list', res.body?.folders ?? [])
  if (Number.isFinite(res.body?.free)) {
    uploadState.free = res.body.free
    uploadState.reserve = res.body.reserve ?? 0
  }
  renderUpload()
}

function loadUpload() {
  loadUploadFolders(false)
  loadUploadFolders(true)
}

function uploadTotal() {
  return uploadState.items.reduce((sum, it) => sum + it.file.size, 0) + (uploadState.cover?.size ?? 0)
}

// The path of an item below media/<category>/<artist>/<album>/: with more than one folder (or no album given) each
// keeps its own folder, so several albums at once land side by side.
function uploadPathOf(item) {
  const tops = new Set(uploadState.items.map((it) => it.top).filter(Boolean))
  const keepTop = item.top && (tops.size > 1 || uploadAlbum() === '')
  return keepTop ? `${item.top}/${item.sub}` : item.sub
}

function renderUpload() {
  const artist = uploadArtist()
  const album = uploadAlbum()
  const catLabel = $('#upload-category')?.selectedOptions?.[0]?.textContent ?? ''
  setText('#upload-where', artist ? `${t('upload.where')} ${[catLabel, artist, album].filter(Boolean).join(' › ')}` : t('upload.needArtist'))

  const n = uploadState.items.length
  const total = uploadTotal()
  let summary = n === 0 && !uploadState.cover ? t('upload.none') : `${tn('upload.count', n)} · ${formatBytes(total)}`
  if (uploadState.cover) summary += ` · ${t('upload.withCover')}`
  if (uploadState.skipped > 0) summary += ` · ${tn('upload.skipped', uploadState.skipped)}`
  setText('#upload-summary', summary)

  const list = $('#upload-list')
  if (list) {
    const shown = uploadState.items.slice(0, 50).map((it) => {
      const li = document.createElement('li')
      li.textContent = uploadPathOf(it)
      return li
    })
    if (n > 50) {
      const li = document.createElement('li')
      li.className = 'dim'
      li.textContent = t('upload.more', { n: n - 50 })
      shown.push(li)
    }
    list.replaceChildren(...shown)
  }

  const room = uploadState.free === null ? null : uploadState.free - uploadState.reserve
  setText('#upload-free', room === null ? '—' : t('upload.free', { free: formatBytes(Math.max(0, room)) }))
  const tooBig = room !== null && total > room
  if (tooBig) feedback('#upload-feedback', 'error', t('upload.noSpace'))
  const start = $('#upload-start')
  if (start) start.disabled = uploadState.running || !artist || (n === 0 && !uploadState.cover) || tooBig
  for (const id of ['#upload-pick-files', '#upload-pick-folder', '#upload-pick-cover', '#upload-clear', '#upload-category', '#upload-artist', '#upload-album']) {
    const el = $(id)
    if (el) el.disabled = uploadState.running
  }
  const cancel = $('#upload-cancel')
  if (cancel) cancel.hidden = !uploadState.running
}

function addUploadItems(entries) {
  for (const { file, top, sub } of entries) {
    if (!UPLOAD_AUDIO.test(file.name) && !UPLOAD_IMAGE.test(file.name)) {
      uploadState.skipped++
      continue
    }
    if (file.name.startsWith('.')) continue
    // the same place twice: the later one counts
    const key = `${top}/${sub}`
    uploadState.items = uploadState.items.filter((it) => `${it.top}/${it.sub}` !== key)
    uploadState.items.push({ file, top, sub })
  }
  uploadState.items.sort((a, b) => `${a.top}/${a.sub}`.localeCompare(`${b.top}/${b.sub}`, undefined, { numeric: true }))
  // one folder chosen and no album yet: the folder's name is the album's
  const tops = new Set(uploadState.items.map((it) => it.top).filter(Boolean))
  if (tops.size === 1 && uploadAlbum() === '') $('#upload-album').value = [...tops][0]
  $('#upload-feedback').hidden = true
  renderUpload()
}

// Files of a folder chosen with the file dialog: webkitRelativePath is "Folder/sub/file.mp3"
function folderEntriesOf(files) {
  return Array.from(files).map((file) => {
    const parts = (file.webkitRelativePath || file.name).split('/')
    return parts.length > 1 ? { file, top: parts[0], sub: parts.slice(1).join('/') } : { file, top: '', sub: file.name }
  })
}

// Dropped files and folders (a folder is read with all its subfolders)
async function droppedEntries(dataTransfer) {
  const out = []
  const readDir = (dir) =>
    new Promise((resolve) => {
      const reader = dir.createReader()
      const all = []
      const next = () =>
        reader.readEntries((batch) => (batch.length ? (all.push(...batch), next()) : resolve(all)), () => resolve(all))
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
  const roots = Array.from(dataTransfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean)
  if (roots.length === 0) return Array.from(dataTransfer.files ?? []).map((file) => ({ file, top: '', sub: file.name }))
  for (const root of roots) {
    if (root.isDirectory) {
      for (const child of await readDir(root)) await walk(child, root.name, '')
    } else {
      await walk(root, '', '')
    }
  }
  return out
}

function uploadOne(path, file, onProgress) {
  return new Promise((resolve) => {
    const q = new URLSearchParams({ category: uploadCategory(), artist: uploadArtist(), album: uploadAlbum(), path })
    const xhr = new XMLHttpRequest()
    uploadState.xhr = xhr
    xhr.open('PUT', `${API}/local/upload?${q}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    if (state.csrf) xhr.setRequestHeader('x-mupibox-csrf', state.csrf)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => resolve(xhr.status)
    xhr.onerror = () => resolve(0)
    xhr.onabort = () => resolve(-1)
    xhr.send(file)
  })
}

async function startUpload() {
  if (uploadState.running) return
  const jobs = uploadState.items.map((it) => ({ path: uploadPathOf(it), file: it.file }))
  if (uploadState.cover) {
    const ext = (uploadState.cover.name.match(/\.[^.]+$/)?.[0] ?? '.jpg').toLowerCase()
    // the cover of the album (or of the artist, without an album); it is taken before any other picture there
    jobs.unshift({ path: `cover${ext}`, file: uploadState.cover })
  }
  if (!uploadArtist() || jobs.length === 0) return
  uploadState.running = true
  uploadState.cancelled = false
  renderUpload()
  $('#upload-feedback').hidden = true
  $('#upload-progress').hidden = false
  const total = jobs.reduce((s, j) => s + j.file.size, 0) || 1
  let done = 0
  let ok = 0
  let failed = 0
  let stopWith = null
  for (const [i, job] of jobs.entries()) {
    if (uploadState.cancelled) break
    const status = await uploadOne(job.path, job.file, (loaded) => {
      const pct = Math.min(100, ((done + loaded) / total) * 100)
      $('#upload-progress-fill').style.width = `${pct.toFixed(1)}%`
      setText('#upload-progress-text', t('upload.progress', { i: i + 1, n: jobs.length, name: job.path, pct: Math.round(pct) }))
    })
    done += job.file.size
    if (status === 200) ok++
    else if (status === -1) break
    else if (status === 401 || status === 403) stopWith = t('upload.sessionGone')
    else if (status === 507) stopWith = t('upload.noSpace')
    else failed++
    if (stopWith) break
  }
  uploadState.running = false
  uploadState.xhr = null
  $('#upload-progress').hidden = true
  $('#upload-progress-fill').style.width = '0%'
  if (ok > 0) {
    // what arrived is no longer in the list; what failed stays for another try
    uploadState.items = []
    uploadState.cover = null
    uploadState.skipped = 0
  }
  const parts = []
  if (ok > 0) parts.push(`${tn('upload.done', ok)} ${t('upload.visible')}`)
  if (uploadState.cancelled) parts.push(t('upload.cancelled'))
  if (failed > 0) parts.push(tn('upload.failed', failed))
  if (stopWith) parts.push(stopWith)
  feedback('#upload-feedback', failed > 0 || stopWith ? (ok > 0 ? 'warn' : 'error') : uploadState.cancelled ? 'info' : 'success', parts.join(' '))
  loadUpload()
}

function initUpload() {
  const pick = (btn, input) => $(btn)?.addEventListener('click', () => $(input)?.click())
  pick('#upload-pick-files', '#upload-input-files')
  pick('#upload-pick-folder', '#upload-input-folder')
  pick('#upload-pick-cover', '#upload-input-cover')
  $('#upload-input-files')?.addEventListener('change', (e) => {
    addUploadItems(Array.from(e.target.files ?? []).map((file) => ({ file, top: '', sub: file.name })))
    e.target.value = ''
  })
  $('#upload-input-folder')?.addEventListener('change', (e) => {
    addUploadItems(folderEntriesOf(e.target.files ?? []))
    e.target.value = ''
  })
  $('#upload-input-cover')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (file && UPLOAD_IMAGE.test(file.name)) uploadState.cover = file
    e.target.value = ''
    renderUpload()
  })
  // a folder dialog is not offered everywhere (e.g. iPhone): the button goes then
  const folderInput = $('#upload-input-folder')
  if (folderInput && !('webkitdirectory' in folderInput)) $('#upload-pick-folder').hidden = true
  const drop = $('#upload-drop')
  if (drop) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault()
      drop.classList.add('over')
    })
    drop.addEventListener('dragleave', () => drop.classList.remove('over'))
    drop.addEventListener('drop', async (e) => {
      e.preventDefault()
      drop.classList.remove('over')
      if (uploadState.running) return
      addUploadItems(await droppedEntries(e.dataTransfer))
    })
  }
  $('#upload-category')?.addEventListener('change', () => {
    loadUploadFolders(false)
    loadUploadFolders(true)
  })
  let artistTimer = null
  $('#upload-artist')?.addEventListener('input', () => {
    renderUpload()
    clearTimeout(artistTimer)
    artistTimer = setTimeout(() => loadUploadFolders(true), 300)
  })
  $('#upload-album')?.addEventListener('input', renderUpload)
  $('#upload-clear')?.addEventListener('click', () => {
    uploadState.items = []
    uploadState.cover = null
    uploadState.skipped = 0
    $('#upload-feedback').hidden = true
    renderUpload()
  })
  $('#upload-cancel')?.addEventListener('click', () => {
    uploadState.cancelled = true
    uploadState.xhr?.abort()
  })
  $('#upload-start')?.addEventListener('click', startUpload)
  // leaving the page while it uploads: the browser asks first
  window.addEventListener('beforeunload', (e) => {
    if (uploadState.running) e.preventDefault()
  })
}

async function loadSystem() {
  const res = await api(`${API}/system`)
  if (res.ok) {
    const s = res.body ?? {}
    setText('#sys-hostname', s.hostname || '—')
    setText('#sys-uptime', formatUptime(s.uptime_seconds))
    setText('#sys-load', Number.isFinite(s.load_1) ? `${s.load_1}${s.cpu_count ? ` · ${t('sys.cores', { n: s.cpu_count })}` : ''}` : '—')
    setText('#sys-temp', Number.isFinite(s.cpu_temp_c) ? `${s.cpu_temp_c} °C` : '—')
    const memUsed = s.mem_total != null && s.mem_free != null ? s.mem_total - s.mem_free : null
    setText('#sys-mem', memUsed != null ? `${formatBytes(memUsed)} / ${formatBytes(s.mem_total)}` : '—')
    if (s.disk) {
      setText('#sys-disk', t('sys.diskUsed', { used: formatBytes(s.disk.total - s.disk.free), total: formatBytes(s.disk.total) }))
    } else {
      setText('#sys-disk', '—')
    }
  }
  renderPasswordStatus()
  loadAudio()
}

/* ---------- Audio (Phase 18 Item 1) ---------- */

let audioVolumeDebounce = null

async function loadAudio() {
  let res = await api(`${API}/audio`)
  if (res.status === 503) {
    // Config briefly not loaded right after pm2 restart — retry once.
    await new Promise((r) => setTimeout(r, 500))
    res = await api(`${API}/audio`)
  }
  if (!res.ok) return
  const a = res.body ?? {}
  setText('#audio-current', Number.isFinite(a.current) ? `${a.current} %` : '—')

  const live = $('#audio-volume')
  if (live && Number.isFinite(a.current)) {
    live.value = a.current
    setText('#audio-volume-out', a.current)
    updateRangeFill(live)
  }
  const max = $('#audio-max')
  if (max && Number.isFinite(a.maxVolume)) {
    max.value = a.maxVolume
    setText('#audio-max-out', a.maxVolume)
    updateRangeFill(max)
  }
  const en = $('#audio-startup-enable')
  const startup = $('#audio-startup')
  const startupRow = $('#audio-startup-row')
  const startupEnabled = Number.isFinite(a.startupVolume)
  if (en) en.checked = startupEnabled
  if (startup) {
    startup.value = startupEnabled ? a.startupVolume : 30
    setText('#audio-startup-out', startupEnabled ? a.startupVolume : 30)
    startup.disabled = !startupEnabled
    updateRangeFill(startup)
  }
  if (startupRow) startupRow.style.opacity = startupEnabled ? '1' : '0.5'
}

/** Debounced live setter: only POST 250 ms after the user stops dragging
 *  so we don't spam amixer with every intermediate value. */
function setLiveVolume(v) {
  if (audioVolumeDebounce) clearTimeout(audioVolumeDebounce)
  audioVolumeDebounce = setTimeout(async () => {
    let res = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 500))
      res = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
    }
    if (!res.ok) {
      feedback('#audio-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
      return
    }
    const applied = res.body?.applied ?? v
    setText('#audio-current', `${applied} %`)
    if (res.body?.capped) {
      feedback('#audio-feedback', 'info', t('audio.capped', { n: applied }))
      const sl = $('#audio-volume')
      if (sl) {
        sl.value = applied
        setText('#audio-volume-out', applied)
      }
    } else {
      const fb = $('#audio-feedback')
      if (fb) fb.hidden = true
    }
  }, 250)
}

async function saveAudioConfig() {
  const max = Math.floor(Number($('#audio-max').value))
  const startupEnabled = $('#audio-startup-enable').checked
  const startupVal = startupEnabled ? Math.floor(Number($('#audio-startup').value)) : null
  if (!Number.isFinite(max) || max < 10 || max > 100) {
    feedback('#audio-feedback', 'error', t('audio.maxRange'))
    return
  }
  if (startupEnabled && (!Number.isFinite(startupVal) || startupVal < 0 || startupVal > 100)) {
    feedback('#audio-feedback', 'error', t('audio.startupRange'))
    return
  }
  if (startupEnabled && startupVal > max) {
    feedback('#audio-feedback', 'error', t('audio.startupAboveMax', { startup: startupVal, max }))
    return
  }
  const res = await api(`${API}/audio/config`, {
    method: 'POST',
    body: { maxVolume: max, startupVolume: startupVal },
  })
  if (!res.ok) {
    feedback('#audio-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  feedback(
    '#audio-feedback',
    'success',
    startupVal != null
      ? t('audio.savedWithStartup', { max, startup: startupVal })
      : t('audio.savedNoStartup', { max }),
  )
}

/** Reflect state.passwordConfigured in the System Eltern-Passwort card. */
function renderPasswordStatus() {
  setText('#pw-status', state.passwordConfigured ? t('pw.isSet') : t('pw.notSet'))
  const clearBtn = $('#pw-clear-btn')
  if (clearBtn) clearBtn.hidden = !state.passwordConfigured
}

async function setPassword() {
  const inp = $('#pw-new')
  const pw = (inp?.value ?? '').trim()
  if (!pw) {
    feedback('#pw-feedback', 'error', t('pw.enterOrRemove'))
    return
  }
  if (pw.length < 4) {
    feedback('#pw-feedback', 'error', t('pw.minLength'))
    return
  }
  const res = await api(`${API}/password`, { method: 'POST', body: { password: pw } })
  if (!res.ok) {
    feedback('#pw-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  if (inp) inp.value = ''
  state.passwordConfigured = !!res.body?.configured
  renderPasswordStatus()
  feedback('#pw-feedback', 'success', t('pw.saved'))
}

async function clearPassword() {
  if (!(await confirmDialog(t('pw.removeQ'), t('pw.removeBody'), { destructive: true, confirmLabel: t('common.remove') }))) return
  const res = await api(`${API}/password`, { method: 'POST', body: { password: '' } })
  if (!res.ok) {
    feedback('#pw-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  state.passwordConfigured = !!res.body?.configured
  renderPasswordStatus()
  feedback('#pw-feedback', 'success', t('pw.removed'))
}

/* ---------- Quick-Pause / Now-Playing (Phase 18 Item 5 + 8) ---------- */

let playbackPollHandle = null
let playbackVolDebounce = null
let playbackMaxVolume = 100

/** Lädt /audio einmalig beim Hub-Eintritt: setzt initialen Slider-Wert,
 *  Cap-Marker und unhide. Danach synct renderPlayback() den Wert aus dem
 *  5-s-Polling weiter (siehe unten). */
async function loadPlaybackVolume() {
  let res
  try { res = await api(`${API}/audio`) } catch { return }
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 500))
    res = await api(`${API}/audio`)
  }
  if (!res.ok) return
  const a = res.body ?? {}
  playbackMaxVolume = Number.isFinite(a.maxVolume) ? a.maxVolume : 100
  const wrap = $('#playback-volume')
  const slider = $('#playback-volume-input')
  const cap = $('#playback-volume-cap')
  if (!wrap || !slider) return
  if (Number.isFinite(a.current)) {
    slider.value = a.current
    setText('#playback-volume-out', `${a.current}%`)
    updateRangeFill(slider)
  }
  if (cap) {
    if (playbackMaxVolume < 100) {
      cap.style.left = `${playbackMaxVolume}%`
      cap.hidden = false
    } else {
      cap.hidden = true
    }
  }
  wrap.hidden = false
}

function setPlaybackVolume(v) {
  if (playbackVolDebounce) clearTimeout(playbackVolDebounce)
  playbackVolDebounce = setTimeout(async () => {
    let res = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 500))
      res = await api(`${API}/audio/volume`, { method: 'POST', body: { volume: v } })
    }
    if (!res.ok) {
      toast('error', res.body?.error ?? t('playback.volumeFailed', { status: res.status }))
      return
    }
    const applied = res.body?.applied ?? v
    setText('#playback-volume-out', `${applied}%`)
    if (res.body?.capped) {
      const sl = $('#playback-volume-input')
      if (sl) {
        sl.value = applied
        updateRangeFill(sl)
      }
      toast('info', t('audio.capped', { n: applied }))
    }
  }, 200)
}

async function loadPlayback() {
  if (playbackPollHandle) {
    clearTimeout(playbackPollHandle)
    playbackPollHandle = null
  }
  let res
  try {
    res = await api(`${API}/playback`)
  } catch {
    return
  }
  if (!res.ok) {
    setText('#playback-title', '—')
    setText('#playback-meta', t('common.statusUnavailable'))
    return
  }
  const b = res.body ?? {}
  renderPlayback(b)
  // Self-schedule next poll while still on hub.
  if (state.currentSection === 'hub') {
    playbackPollHandle = setTimeout(loadPlayback, 5000)
  }
}

function renderPlayback(b) {
  const icon = $('#playback-icon')
  const cover = $('#playback-cover')
  const toggleBtn = $('#playback-toggle-btn')
  const toggleIcon = $('#playback-toggle-icon')
  const stopBtn = $('#playback-stop-btn')
  const prevBtn = $('#playback-prev-btn')
  const nextBtn = $('#playback-next-btn')
  const progressWrap = $('#playback-progress')
  const progressFill = $('#playback-progress-fill')

  // Cover-Bild: wenn vorhanden, zeigen + Icon ausblenden. Wechsel sanft
  // via Opacity damit das Bild nicht flackert.
  if (b.coverUrl) {
    if (cover) {
      // getAttribute: cover.src is the absolute URL, a relative coverUrl (NAS/local album) would differ on every
      // refresh and make the picture flicker
      if (cover.getAttribute('src') !== b.coverUrl) {
        cover.style.opacity = '0'
        cover.src = b.coverUrl
        cover.onload = () => { cover.style.opacity = '1' }
      }
      cover.hidden = false
    }
    if (icon) icon.hidden = true
  } else {
    if (cover) cover.hidden = true
    if (icon) icon.hidden = false
  }

  // Track ist nur dann "wiederaufnehmbar" wenn der Player auch wirklich
  // einen aktiven Slot hat (currentPlayer gesetzt). Sonst liefert play/stop
  // auf der Player-API einen Fehler ("nichts zu starten").
  const hasTrack = !!b.player && (!!b.title || !!b.artist)
  if (b.playing) {
    if (icon) icon.textContent = '▶'
    setText('#playback-title', b.title || t('playback.running'))
    setText('#playback-meta', `${b.artist || ''}${b.artist && b.album ? ' · ' : ''}${b.album || ''}` || t('playback.playing'))
    if (toggleBtn) {
      toggleBtn.hidden = false
      toggleBtn.dataset.state = 'playing'
      toggleBtn.setAttribute('aria-label', t('playback.pause'))
    }
    if (toggleIcon) toggleIcon.textContent = '⏸'
    if (stopBtn) stopBtn.hidden = false
    if (prevBtn) prevBtn.hidden = false
    if (nextBtn) nextBtn.hidden = false
  } else if (hasTrack) {
    if (icon) icon.textContent = '⏸'
    setText('#playback-title', b.title || '—')
    setText('#playback-meta', `${b.artist || ''}${b.artist && b.album ? ' · ' : ''}${b.album || ''}` || t('playback.paused'))
    if (toggleBtn) {
      toggleBtn.hidden = false
      toggleBtn.dataset.state = 'paused'
      toggleBtn.setAttribute('aria-label', t('playback.play'))
    }
    if (toggleIcon) toggleIcon.textContent = '▶'
    if (stopBtn) stopBtn.hidden = false
    if (prevBtn) prevBtn.hidden = false
    if (nextBtn) nextBtn.hidden = false
  } else {
    if (icon) icon.textContent = '⏹'
    setText('#playback-title', t('playback.idleTitle'))
    setText('#playback-meta', t('playback.idleMeta'))
    if (toggleBtn) toggleBtn.hidden = true
    if (stopBtn) stopBtn.hidden = true
    if (prevBtn) prevBtn.hidden = true
    if (nextBtn) nextBtn.hidden = true
  }

  // Volume-Slider mit Box-Wert syncen — aber nicht während User draggt
  // (focus = aktive Interaktion, eigene Eingabe nicht überschreiben).
  const volSlider = $('#playback-volume-input')
  if (volSlider && Number.isFinite(b.volume) && document.activeElement !== volSlider) {
    if (Number(volSlider.value) !== b.volume) {
      volSlider.value = b.volume
      setText('#playback-volume-out', `${b.volume}%`)
      updateRangeFill(volSlider)
    }
  }

  // Progress-Bar: nur sichtbar wenn wir Dauer kennen und etwas läuft/pausiert.
  if (progressWrap && progressFill) {
    if (Number.isFinite(b.progressMs) && Number.isFinite(b.durationMs) && b.durationMs > 0) {
      const pct = Math.max(0, Math.min(100, (b.progressMs / b.durationMs) * 100))
      progressFill.style.width = `${pct}%`
      progressWrap.hidden = false
    } else {
      progressWrap.hidden = true
    }
  }
}

async function playbackAction(action) {
  const res = await api(`${API}/playback/${action}`, { method: 'POST' })
  if (!res.ok) {
    const code = res.body?.error ?? ''
    const friendly = {
      playtime_limit_reached: t('err.playtimeLimit'),
      quiet_hours_active: t('err.quietHours'),
      no_active_track: t('err.noActiveTrack'),
    }[code] ?? t('playback.actionFailed', { action, code: code || res.status })
    toast(code === 'playtime_limit_reached' || code === 'quiet_hours_active' ? 'warn' : 'error', friendly)
    return
  }
  // Kurze Verzögerung, damit der Player den Zustand übernommen hat, dann refresh.
  setTimeout(loadPlayback, 600)
}

/* ---------- Wiedergabe starten (Stufe A, Variante β) ----------
 *  Tile-Grid aus active_data.json, Tap = POST /library/play {index}.
 *  Eigener State (search + categoryFilter), unabhängig von der Library-
 *  Sektion (die hat ihren eigenen). */

const playState = {
  items: [],
  search: '',
  category: 'all',  // all | music | audiobook | radio | nas
  // NAS: the folders selected in the admin interface, browsed live like the box's NAS tab.
  nasStack: [],     // the opened folders, [{ title, path }]; empty = the top level
  nasItems: null,   // entries of the current level (null = not loaded yet)
  nasError: '',
  // "All" shows the NAS folders too (the top level, read live like the NAS tab): null = not loaded yet
  nasTop: null,
}

/** Loads one NAS level: the selected folders (top) or the subfolders of `path`. */
async function loadNasLevel() {
  const grid = $('#play-grid')
  const top = playState.nasStack.at(-1)
  playState.nasItems = null
  playState.nasError = ''
  renderPlay()
  if (grid) grid.innerHTML = skeletonLines(6)
  try {
    const url = top ? `/api/nas/children?path=${encodeURIComponent(top.path)}` : '/api/nas/artists'
    const res = await fetch(url, { credentials: 'same-origin' })
    // 503: folders are selected, but the NAS can't be reached right now
    if (res.status === 503) playState.nasError = t('play.nasUnreachable')
    else if (!res.ok) playState.nasError = t('play.libraryNotLoaded', { status: res.status })
    const data = res.ok ? await res.json() : []
    playState.nasItems = Array.isArray(data) ? data : []
  } catch (err) {
    playState.nasItems = []
    playState.nasError = t('common.errorMsg', { msg: err.message })
  }
  renderPlay()
}

function renderNasCrumbs() {
  const nav = $('#play-crumbs')
  if (!nav) return
  nav.hidden = playState.category !== 'nas'
  if (nav.hidden) return
  const parts = [{ title: 'NAS' }, ...playState.nasStack]
  nav.innerHTML = parts
    .map((p, i) =>
      i === parts.length - 1
        ? `<span class="play-crumb is-current">${escapeHtml(p.title)}</span>`
        : `<button class="play-crumb" data-depth="${i}">${escapeHtml(p.title)}</button><span class="play-crumb-sep">›</span>`,
    )
    .join('')
}

function renderNas(grid, q) {
  if (playState.nasItems === null) return // loading
  if (playState.nasError) {
    grid.innerHTML = emptyStateHtml('⚠️', escapeHtml(playState.nasError))
    return
  }
  const entries = playState.nasItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (!q) return true
      return `${item.title ?? ''} ${item.artist ?? ''}`.toLowerCase().includes(q)
    })
  if (entries.length === 0) {
    grid.innerHTML = emptyStateHtml('🗄️', q ? t('play.noSearchResults') : playState.nasStack.length ? t('play.emptyCategory') : t('play.nasEmpty'))
    return
  }
  grid.innerHTML = entries.map(({ item, idx }) => nasTileHtml(item, `data-nas-idx="${idx}"`)).join('')
  nasCoverFallbacks(grid)
}

/** A NAS tile (folder or album); `dataAttr` tells the click handler which list it belongs to. */
function nasTileHtml(item, dataAttr) {
  const title = escapeHtml(String(item.title ?? '—'))
  const artist = escapeHtml(String(item.artist ?? ''))
  const cover = item.cover ? escapeHtml(String(item.cover)) : ''
  const isFolder = item.nasIsContainer === true
  const coverEl = cover
    ? `<img class="play-tile-cover" src="${cover}" alt="" loading="lazy">`
    : `<div class="play-tile-cover-placeholder">${isFolder ? '📁' : '🎧'}</div>`
  const aria = isFolder ? t('play.openAria', { title }) : t('play.playAria', { title })
  return `
      <button class="play-tile" ${dataAttr} data-nas-folder="${isFolder ? '1' : ''}" aria-label="${aria}">
        ${coverEl}
        <span class="play-tile-badge">${isFolder ? `📁 ${t('play.nasFolder')}` : 'NAS'}</span>
        <div class="play-tile-overlay">
          <div class="play-tile-title">${title}</div>
          <div class="play-tile-artist">${artist}</div>
        </div>
      </button>`
}

/** NAS covers that can't be loaded become the folder / headphones placeholder. */
function nasCoverFallbacks(grid) {
  for (const img of grid.querySelectorAll('.play-tile[data-nas-folder] img.play-tile-cover')) {
    img.addEventListener('error', () => {
      const ph = document.createElement('div')
      ph.className = 'play-tile-cover-placeholder'
      ph.textContent = img.closest('.play-tile')?.dataset.nasFolder ? '📁' : '🎧'
      img.replaceWith(ph)
    }, { once: true })
  }
}

/** "All": the NAS folders selected in the admin interface (top level), read live once per visit. */
async function loadNasTop() {
  try {
    const res = await fetch('/api/nas/artists', { credentials: 'same-origin' })
    const data = res.ok ? await res.json() : []
    playState.nasTop = Array.isArray(data) ? data : []
  } catch {
    playState.nasTop = [] // NAS not reachable: "All" shows the rest (the NAS tab says what is wrong)
  }
  if (playState.category === 'all') renderPlay()
}

/** A NAS tile under "All": a folder opens in the NAS tab, an album plays on the box. */
function onNasTopTile(idx) {
  const item = playState.nasTop?.[idx]
  if (!item?.nasPath) return
  if (item.nasIsContainer) {
    playState.category = 'nas'
    for (const pill of $('.play-pill')) pill.classList.toggle('is-active', pill.dataset.cat === 'nas')
    playState.nasStack = [{ title: String(item.title ?? ''), path: item.nasPath }]
    playState.search = ''
    const search = $('#play-search')
    if (search) search.value = ''
    loadNasLevel()
    return
  }
  startPlayback(String(item.title ?? t('play.newTrack')), `${API}/library/play-nas`, { path: item.nasPath })
}

/** A NAS tile: a folder with subfolders opens, an album plays on the box. */
function onNasTile(idx) {
  const item = playState.nasItems?.[idx]
  if (!item?.nasPath) return
  if (item.nasIsContainer) {
    playState.nasStack.push({ title: String(item.title ?? ''), path: item.nasPath })
    playState.search = ''
    const search = $('#play-search')
    if (search) search.value = ''
    loadNasLevel()
    return
  }
  startPlayback(String(item.title ?? t('play.newTrack')), `${API}/library/play-nas`, { path: item.nasPath })
}

async function loadPlay() {
  const grid = $('#play-grid')
  if (!grid) return
  grid.innerHTML = skeletonLines(6)
  try {
    const res = await fetch('/api/data', { credentials: 'same-origin' })
    if (!res.ok) {
      grid.innerHTML = emptyStateHtml('⚠️', t('play.libraryNotLoaded', { status: res.status }))
      return
    }
    const data = await res.json()
    playState.items = Array.isArray(data) ? data : []
    playState.nasTop = null
    loadNasTop()
    renderPlay()
  } catch (err) {
    grid.innerHTML = emptyStateHtml('⚠️', `${escapeHtml(t('common.errorMsg', { msg: err.message }))}`)
  }
}

function renderPlay() {
  const grid = $('#play-grid')
  if (!grid) return
  const q = playState.search.trim().toLowerCase()
  const cat = playState.category
  renderNasCrumbs()
  if (cat === 'nas') {
    renderNas(grid, q)
    return
  }
  const filtered = playState.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (!item || typeof item !== 'object') return false
      if (!item || item.isResume === true || item.category === 'resume') return false
      // Filter nach Top-Level-Kategorie. 'radio' deckt sowohl category='radio'
      // als auch type='radio' ab (manche Einträge haben nur eines gesetzt).
      if (cat === 'radio') {
        if (item.category !== 'radio' && item.type !== 'radio') return false
      } else if (cat !== 'all') {
        if (item.category !== cat) return false
      }
      // type='spotify' mit nur artistid (whole-artist subscription) ist nicht
      // einzeln abspielbar — gehört in die Library-Sektion zum Verwalten.
      if (item.type === 'spotify' && !item.id && !item.playlistid && !item.showid && !item.audiobookid) return false
      if (q) {
        const a = String(item.artist_override ?? item.artist ?? '').toLowerCase()
        const t = String(item.title_override ?? item.title ?? '').toLowerCase()
        if (!a.includes(q) && !t.includes(q)) return false
      }
      return true
    })
  const nasTop = cat === 'all'
    ? (playState.nasTop ?? [])
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !q || `${item.title ?? ''} ${item.artist ?? ''}`.toLowerCase().includes(q))
    : []
  if (filtered.length === 0 && nasTop.length === 0) {
    grid.innerHTML = emptyStateHtml('🎧', q ? t('play.noSearchResults') : t('play.emptyCategory'))
    return
  }
  grid.innerHTML = filtered.map(({ item, idx }) => {
    const artist = escapeHtml(String(item.artist_override ?? item.artist ?? ''))
    const title = escapeHtml(String(item.title_override ?? item.title ?? item.artist ?? '—'))
    const coverUrl = item.cover_override ?? item.cover ?? spotifyCoverUrl(item)
    const cover = coverUrl ? escapeHtml(String(coverUrl)) : ''
    const typeLabel = playTypeLabel(item)
    const coverEl = cover
      ? `<img class="play-tile-cover" src="${cover}" alt="" loading="lazy">`
      : `<div class="play-tile-cover-placeholder">${typeIcon(item)}</div>`
    return `
      <button class="play-tile" data-idx="${idx}" aria-label="${t('play.playAria', { title })}">
        ${coverEl}
        ${typeLabel ? `<span class="play-tile-badge">${typeLabel}</span>` : ''}
        <div class="play-tile-overlay">
          <div class="play-tile-title">${title}</div>
          <div class="play-tile-artist">${artist}</div>
        </div>
      </button>`
  }).join('') + nasTop.map(({ item, idx }) => nasTileHtml(item, `data-nas-top-idx="${idx}"`)).join('')
  nasCoverFallbacks(grid)
  // a cover that can't be loaded (no picture on Spotify, box offline) becomes the placeholder
  for (const img of grid.querySelectorAll('.play-tile[data-idx] img.play-tile-cover')) {
    img.addEventListener('error', () => {
      const idx = Number(img.closest('.play-tile')?.dataset.idx)
      const ph = document.createElement('div')
      ph.className = 'play-tile-cover-placeholder'
      ph.innerHTML = typeIcon(playState.items[idx] ?? {})
      img.replaceWith(ph)
    }, { once: true })
  }
}

function playTypeLabel(item) {
  const type = item.type
  if (type === 'spotify') return 'Spotify'
  if (type === 'library') return t('play.local')
  if (type === 'radio' || item.category === 'radio') return 'Radio'
  if (type === 'rss') return 'Podcast'
  return ''
}

function typeIcon(item) {
  const t = item.type
  if (t === 'spotify') return '🎵'
  if (t === 'library') return '💾'
  if (t === 'radio' || item.category === 'radio') return '📻'
  if (t === 'rss') return '🎙️'
  return '🎧'
}

async function playLibraryItem(idx) {
  const item = playState.items[idx]
  if (!item) return
  await startPlayback(String(item.title_override ?? item.title ?? item.artist ?? t('play.newTrack')), `${API}/library/play`, { index: idx })
}

/** Starts something on the box (a library entry or a NAS album): asks first when something is playing. */
async function startPlayback(newLabel, url, body) {
  // Wenn schon was läuft: kurze Bestätigung. Im Idle direkt loslegen.
  let playback
  try {
    const r = await api(`${API}/playback`)
    playback = r.ok ? r.body : null
  } catch { /* egal — wenn /playback hängt, fragen wir trotzdem nicht */ }
  if (playback?.playing) {
    const currentLabel = playback.title || playback.artist || t('play.currentTrack')
    const ok = await confirmDialog(
      t('play.overrideQ'),
      t('play.overrideBody', { current: currentLabel, next: newLabel }),
      { confirmLabel: t('play.playNow') },
    )
    if (!ok) return
  }
  const res = await api(url, { method: 'POST', body })
  if (!res.ok) {
    const code = res.body?.error ?? ''
    const friendly = {
      playtime_limit_reached: t('err.playtimeLimit'),
      quiet_hours_active: t('err.quietHours'),
      spotify_id_missing: t('err.spotifyIdMissing'),
      resume_entry_not_playable: t('err.resumeNotPlayable'),
      item_not_found: t('err.itemNotFound'),
      library_unavailable: t('err.libraryUnavailable'),
      nas_path_not_selected: t('err.nasNotSelected'),
    }[code] ?? t('play.failed', { code: code || res.status })
    toast(code === 'playtime_limit_reached' || code === 'quiet_hours_active' ? 'warn' : 'error', friendly)
    return
  }
  const label = res.body?.item?.title ?? res.body?.item?.artist ?? t('field.title')
  toast('success', `▶ ${label}`)
  // Kurze Verzögerung, dann zurück zum Hub damit man Now-Playing sieht.
  setTimeout(() => {
    navigate('hub')
    loadPlayback()
  }, 800)
}

/* ---------- Hör-Verlauf (Phase 18 Item 4) ---------- */

async function loadHistory() {
  // Two parallel fetches: today summary + 7-day stats with charts.
  const [today, week] = await Promise.all([
    api(`${API}/playlog?range=today`),
    api(`${API}/playlog?range=week`),
  ])
  if (today.ok) renderHistoryToday(today.body ?? {})
  if (week.ok) renderHistoryWeek(week.body ?? {})
}

function renderHistoryToday(d) {
  setText('#hist-today-mins', t('unit.minutes', { n: d.totalMinutes ?? 0 }))
  setText('#hist-today-count', tn('hist.tracks', d.trackCount ?? 0))
  const top = (d.topArtists ?? []).slice(0, 3).map((a) => `${a.name} (${t('unit.minutes', { n: a.minutes })})`).join(' · ')
  setText('#hist-today-top', top || t('hist.nothingToday'))
}

function renderHistoryWeek(d) {
  // Tagesbalken (Mini-SVG): pro-Tag-Minuten, lineare Skala, ohne Lib.
  const tl = d.timeline ?? []
  const wrap = $('#hist-week-chart')
  if (wrap) {
    wrap.innerHTML = ''
    if (!tl.length) {
      wrap.innerHTML = `<p class="dim">${t('common.noData')}</p>`
    } else {
      const max = Math.max(1, ...tl.map((x) => x.minutes))
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => t(`day.short.${k}`))
      for (const day of tl) {
        const bar = document.createElement('div')
        bar.className = 'hist-bar'
        const fill = document.createElement('div')
        fill.className = 'hist-bar-fill'
        fill.style.height = `${Math.max(2, Math.round((day.minutes / max) * 100))}%`
        fill.title = `${day.date}: ${t('unit.minutes', { n: day.minutes })}`
        const lbl = document.createElement('span')
        lbl.className = 'hist-bar-label'
        const dt = new Date(day.date)
        lbl.textContent = dayNames[dt.getDay()]
        const val = document.createElement('span')
        val.className = 'hist-bar-value'
        val.textContent = day.minutes
        bar.append(fill, val, lbl)
        wrap.appendChild(bar)
      }
    }
  }
  setText('#hist-week-summary', t('hist.weekSummary', { min: d.totalMinutes ?? 0, tracks: d.trackCount ?? 0 }))

  const ta = $('#hist-top-artists')
  if (ta) {
    const arts = d.topArtists ?? []
    if (!arts.length) ta.innerHTML = `<p class="dim">${t('common.noDataYet')}</p>`
    else {
      ta.innerHTML = ''
      for (const a of arts) {
        const row = document.createElement('div')
        row.className = 'hist-row'
        row.innerHTML = `<span class="hist-row-name">${escapeHtml(a.name)}</span><span class="hist-row-meta">${t('unit.minutes', { n: a.minutes })} · ${a.count}×</span>`
        ta.appendChild(row)
      }
    }
  }
  const tt = $('#hist-top-titles')
  if (tt) {
    const tits = d.topTitles ?? []
    if (!tits.length) tt.innerHTML = `<p class="dim">${t('common.noDataYet')}</p>`
    else {
      tt.innerHTML = ''
      for (const entry of tits) {
        const row = document.createElement('div')
        row.className = 'hist-row'
        row.innerHTML = `<span class="hist-row-name">${escapeHtml(entry.title)}<span class="dim"> — ${escapeHtml(entry.artist || '')}</span></span><span class="hist-row-meta">${t('unit.minutes', { n: entry.minutes })} · ${entry.count}×</span>`
        tt.appendChild(row)
      }
    }
  }
}

/* ---------- Theme-Switcher (Phase 18 Item 3) ---------- */

async function loadTheme() {
  const wrap = $('#theme-grid')
  if (!wrap) return
  const res = await api(`${API}/theme`)
  if (!res.ok) {
    wrap.innerHTML = `<p class="dim">${t('common.loadError', { status: res.status })}</p>`
    return
  }
  const current = res.body?.current ?? ''
  const available = res.body?.available ?? []
  // children's themes: German names only while the web app is in German
  const labels = (getLang() === 'de' ? res.body?.labelsDe : res.body?.labels) ?? {}
  // in the order of the names shown (the kids' themes by their name in the active language)
  available.sort((a, b) => String(labels[a] ?? a).localeCompare(String(labels[b] ?? b), localeTag(), { sensitivity: 'base' }))
  showThemeStage(res.body, current in (res.body?.labels ?? {}))
  if (!available.length) {
    wrap.innerHTML = `<p class="dim">${t('theme.none')}</p>`
    return
  }
  wrap.innerHTML = ''
  for (const name of available) {
    const card = document.createElement('div')
    card.className = 'theme-card' + (name === current ? ' active' : '')
    const img = document.createElement('img')
    img.className = 'theme-preview'
    // ?v=2: phones had kept the "not found" of the children's themes from before they had a preview
    img.src = `${API}/theme-preview/${encodeURIComponent(name)}?v=2`
    img.alt = name
    img.loading = 'lazy'
    img.addEventListener('error', () => {
      img.style.opacity = '0.25'
      img.removeAttribute('src')
    })
    const lbl = document.createElement('div')
    lbl.className = 'theme-name'
    lbl.textContent = labels[name] ?? name
    const badge = document.createElement('div')
    badge.className = 'theme-badge'
    if (name === current) badge.textContent = t('common.checkActiveLower')
    card.append(img, lbl, badge)
    if (name !== current) {
      card.addEventListener('click', () => applyTheme(name))
    }
    wrap.appendChild(card)
  }
}

/* ---------- Start- und Wartungsbild (wie MuPi-Conf > Boot & maintenance screens) ---------- */

// The scenes (bootscreens.json), the settings and the languages of the display texts, as the box has them.
const bsState = { screens: null, byId: {}, languages: {}, selected: '' }

async function loadBootscreen() {
  const card = $('#bootscreen-card')
  if (!card) return
  const res = await api(`${API}/bootscreen`)
  // boot screens not installed yet (older box): the card stays hidden
  card.hidden = !res.ok
  if (!res.ok) return
  const { screens, languages, current } = res.body
  bsState.screens = screens
  bsState.languages = languages ?? {}
  bsState.byId = {}
  for (const b of screens.bootscreens) bsState.byId[b.id] = b
  bsState.selected = current.bootscreen || screens.defaultBootscreen

  const name = $('#bs-name')
  name.maxLength = screens.nameMaxLength || 14
  name.placeholder = screens.defaultName || 'MuPiBox'
  name.value = current.boxName ?? ''
  name.oninput = bsUpdate

  const label = (b) => (getLang() === 'de' ? b.label : b.labelEn) ?? b.label ?? b.id
  const maint = $('#bs-maint')
  maint.innerHTML = ''
  maint.append(new Option(t('bs.maintSame'), 'same'))
  for (const b of screens.bootscreens) maint.append(new Option(label(b), b.id))
  maint.value = current.maintenanceScreen || 'same'
  maint.onchange = bsUpdate

  const lang = $('#bs-lang')
  lang.innerHTML = ''
  for (const [code, l] of Object.entries(bsState.languages)) lang.append(new Option(l.name ?? code, code))
  lang.value = current.bootscreenLanguage || 'en'
  lang.onchange = bsUpdate
  $('#bs-kind').onchange = bsUpdate

  const grid = $('#bs-grid')
  grid.innerHTML = ''
  const tile = (id, caption, thumb) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'bs-tile'
    b.dataset.id = id
    b.append(thumb)
    const cap = document.createElement('span')
    cap.className = 'bs-caption'
    cap.textContent = caption
    b.append(cap)
    b.addEventListener('click', () => {
      bsState.selected = id
      bsUpdate()
    })
    grid.append(b)
  }
  const random = document.createElement('span')
  random.className = 'bs-thumb bs-random'
  random.textContent = '🔀'
  tile('random', t('bs.random'), random)
  for (const b of screens.bootscreens) {
    const thumb = document.createElement('span')
    thumb.className = 'bs-thumb'
    const img = document.createElement('img')
    img.src = bsScene(b.id, 'scene')
    img.alt = ''
    const text = document.createElement('span')
    text.className = 'bs-text'
    text.dataset.bsName = b.id
    thumb.append(img, text)
    tile(b.id, b.id === screens.defaultBootscreen ? `${label(b)} (${t('bs.default')})` : label(b), thumb)
  }
  $('#bs-save-btn').onclick = saveBootscreen
  bsUpdate()
  // the names are laid out in the font of the box: again once it is loaded
  document.fonts?.load?.('600 20px FredokaBS').then(bsUpdate, bsUpdate)
}

function bsScene(id, kind) {
  return `${API}/bootscreen-scene/${encodeURIComponent(id)}/${kind}`
}

function bsBoxName() {
  const s = bsState.screens
  const n = Array.from($('#bs-name').value.trim()).slice(0, s.nameMaxLength || 14).join('')
  return n || s.defaultName || 'MuPiBox'
}

function bsScaledShadow(spec, s) {
  if (!spec || spec === 'none') return 'none'
  return spec.replace(/(-?[\d.]+)px/g, (m, v) => `${parseFloat(v) * s}px`)
}

// the name at its place, as the box puts it in: the given size, made smaller when it is wider than maxWidth
function bsPlaceName(el, b, width) {
  const s = width / 800
  const n = b.name
  el.textContent = bsBoxName()
  el.style.fontSize = `${n.fontSize * s}px`
  el.style.fontWeight = n.fontWeight
  el.style.letterSpacing = `${n.letterSpacing * s}px`
  el.style.color = n.color
  el.style.textShadow = bsScaledShadow(n.textShadow, s)
  el.style.top = `${n.y * s}px`
  el.style.transform = 'none'
  const center = n.align === 'center'
  el.style.left = center ? '50%' : `${n.x * s}px`
  const scale = Math.min(1, (n.maxWidth * s) / Math.max(1, el.scrollWidth))
  el.style.transformOrigin = center ? 'center top' : 'left top'
  el.style.transform = `${center ? 'translateX(-50%) ' : ''}scale(${scale})`
}

// title and line of text of the maintenance / goodbye / battery screen at their place
function bsPlaceMaint(box, b, width, kind, lang) {
  const s = width / 800
  const m = b[`${kind}Text`] || b.maintenanceText
  const p = m.subPill
  const texts = bsState.screens.texts[kind] ?? {}
  const [title, sub] = texts[lang] ?? texts.en ?? ['', '']
  box.innerHTML = ''
  box.style.left = m.align === 'center' ? `${(400 - m.maxWidth / 2) * s}px` : `${m.x * s}px`
  box.style.top = `${m.y * s}px`
  box.style.width = `${m.maxWidth * s}px`
  box.style.textAlign = m.align === 'center' ? 'center' : 'left'
  const t1 = document.createElement('span')
  t1.className = 't'
  t1.textContent = title
  t1.style.cssText = `font-size:${m.titleSize * s}px;font-weight:${m.titleWeight};color:${m.color};text-shadow:${bsScaledShadow(m.textShadow, s)};letter-spacing:${-1 * s}px;margin-bottom:${m.gap * s}px`
  const t2 = document.createElement('span')
  t2.className = 's'
  t2.textContent = sub
  t2.style.cssText = `font-size:${m.subSize * s}px;font-weight:${m.subWeight};color:${p.color};background:${p.background};border-radius:${p.radius * s}px;padding:${p.padY * s}px ${p.padX * s}px`
  box.append(t1, t2)
  // the title in at most 2 lines: smaller when it needs more, as on the box
  for (let ts = m.titleSize; ts > 24 && t1.getBoundingClientRect().height > 2.2 * ts * 1.05 * s; ts--) t1.style.fontSize = `${(ts - 1) * s}px`
}

function bsUpdate() {
  const s = bsState.screens
  if (!s || $('#bootscreen-card').hidden) return
  for (const tile of document.querySelectorAll('#bs-grid .bs-tile')) tile.classList.toggle('active', tile.dataset.id === bsState.selected)
  // "random": the previews show the first scene
  const shown = bsState.byId[bsState.selected] ?? s.bootscreens[0]
  const kind = $('#bs-kind').value
  const lang = $('#bs-lang').value
  const onScene = kind === 'goodbye' || kind === 'battery'
  const maintId = $('#bs-maint').value
  const mb = onScene || maintId === 'same' ? shown : bsState.byId[maintId] ?? shown
  const boot = $('#bs-boot-preview')
  const maint = $('#bs-maint-preview')
  boot.querySelector('img').src = bsScene(shown.id, 'scene')
  maint.querySelector('img').src = bsScene(mb.id, onScene ? kind : 'maintenance')
  $('#bs-maint-title').textContent = onScene ? t('bs.previewOff') : t('bs.previewMaint')
  bsPlaceName(boot.querySelector('.bs-text'), shown, boot.clientWidth || 400)
  bsPlaceMaint(maint.querySelector('.bs-maint'), mb, maint.clientWidth || 400, kind, lang)
  // the name in every tile, at the size the tile has on this screen
  for (const el of document.querySelectorAll('#bs-grid [data-bs-name]')) {
    bsPlaceName(el, bsState.byId[el.dataset.bsName], el.parentElement.clientWidth || 130)
  }
}
window.addEventListener('resize', () => bsUpdate())

async function saveBootscreen() {
  const body = {
    bootscreen: bsState.selected,
    maintenanceScreen: $('#bs-maint').value,
    boxName: $('#bs-name').value,
    bootscreenLanguage: $('#bs-lang').value,
  }
  const res = await api(`${API}/bootscreen`, { method: 'POST', body })
  if (!res.ok) {
    feedback('#bs-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  $('#bs-name').value = res.body?.current?.boxName ?? body.boxName
  feedback('#bs-feedback', 'success', t('bs.saved'))
  bsUpdate()
}

// Children's themes: the Cover Flow view ("stage") and reading the name aloud when it stops - only offered while
// one of them is active (the other themes do not know these settings).
function showThemeStage(body, isKidsTheme) {
  const card = $('#theme-stage-card')
  if (!card) return
  card.hidden = !isKidsTheme
  if (!isKidsTheme) return
  const stage = $('#theme-stage-toggle')
  const autoRead = $('#theme-autoread-toggle')
  stage.checked = body?.stage === true
  autoRead.checked = body?.stageAutoRead === true
  $('#theme-autoread-row').hidden = !stage.checked
  stage.onchange = () => saveThemeStage({ stage: stage.checked })
  autoRead.onchange = () => saveThemeStage({ autoRead: autoRead.checked })
}

async function saveThemeStage(change) {
  const res = await api(`${API}/theme-stage`, { method: 'POST', body: change })
  if (!res.ok) {
    feedback('#theme-stage-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    loadTheme()
    return
  }
  $('#theme-autoread-row').hidden = res.body?.stage !== true
  if (res.body?.displayUpdated) feedback('#theme-stage-feedback', 'success', t('theme.stageSaved'))
  else feedback('#theme-stage-feedback', 'error', t('theme.stageReloadFailed'))
}

async function applyTheme(theme) {
  if (!(await confirmDialog(t('theme.switchQ', { theme }), t('theme.switchBody'), { confirmLabel: t('theme.apply') }))) return
  const res = await api(`${API}/theme`, { method: 'POST', body: { theme } })
  if (!res.ok) {
    feedback('#theme-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  loadTheme()
  // Show it on the display right away? "No" keeps the old behaviour: it shows on the next display reload.
  if (!(await confirmDialog(t('theme.reloadQ'), t('theme.reloadBody'), { confirmLabel: t('theme.reloadNow'), cancelLabel: t('theme.reloadLater') }))) {
    feedback('#theme-feedback', 'success', t('theme.saved', { theme }))
    return
  }
  const rl = await api(`${API}/display/reload-theme`, { method: 'POST', body: {} })
  if (rl.ok) feedback('#theme-feedback', 'success', t('theme.reloaded', { theme }))
  else feedback('#theme-feedback', 'error', t('theme.reloadFailed', { theme }))
}

/** Phase 17h: submit the no-session password form. On success, re-run
 *  bootstrap so the session cookie is picked up and the hub appears. */
async function doLogin() {
  const inp = $('#login-password')
  const pw = inp?.value ?? ''
  if (!pw) {
    feedback('#login-feedback', 'error', t('login.enterPassword'))
    return
  }
  const btn = $('#login-submit-btn')
  if (btn) btn.disabled = true
  const res = await api(`${API}/login`, { method: 'POST', body: { password: pw } })
  if (btn) btn.disabled = false
  if (!res.ok) {
    if (res.status === 429) {
      feedback('#login-feedback', 'error', t('login.tooMany'))
    } else {
      feedback('#login-feedback', 'error', t('login.wrong'))
    }
    if (inp) {
      inp.value = ''
      inp.focus()
    }
    return
  }
  if (inp) inp.value = ''
  await bootstrap()
}

async function systemReboot() {
  if (!(await confirmDialog(t('sys.rebootQ'), t('sys.rebootBody'), { destructive: true, confirmLabel: t('sys.rebootLabel') }))) return
  feedback('#sys-feedback', 'success', t('sys.rebooting'))
  await fetch('/api/reboot', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

async function systemShutdown() {
  if (!(await confirmDialog(t('sys.shutdownQ'), t('sys.shutdownBody'), { destructive: true, confirmLabel: t('sys.shutdownLabel') }))) return
  feedback('#sys-feedback', 'success', t('sys.shuttingDown'))
  await fetch('/api/shutdown', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

/* ---------- screen: wlan (Phase 15c) ---------- */

/** Status (read-only) + Phase 18 Item 2 management (add/list/remove). The
 *  active-network is rendered with the remove-button disabled — we can't
 *  test-roll-back a switch over a network the WebApp is using, so the safer
 *  pattern is "add only" + "remove inactive only". */
async function loadWlan() {
  try {
    const res = await fetch('/api/network', { credentials: 'same-origin' })
    if (res.ok) {
      const n = await res.json().catch(() => ({}))
      const online = n.onlinestate === 'online'
      setText('#wlan-online', online ? '🟢 Online' : '🔴 Offline')
      setText('#wlan-ssid', n.wifi || '—')
      setText('#wlan-signal', n.wifisignal ? `${n.wifisignal}${n.wifilink ? ` · ${n.wifilink}` : ''}` : '—')
      setText('#wlan-ip', n.ip || '—')
      setText('#wlan-gateway', n.gateway || '—')
      setText('#wlan-dns', n.dns || '—')
      setText('#wlan-subnet', n.subnet || '—')
      setText('#wlan-mac', n.mac || '—')
    }
  } catch { /* swallow */ }
  loadWlanSaved()
}

async function loadWlanSaved() {
  const wrap = $('#wlan-saved-list')
  if (!wrap) return
  const res = await api(`${API}/wlan/saved`)
  if (!res.ok) {
    wrap.innerHTML = `<p class="dim">${t('common.loadError', { status: res.status })}</p>`
    return
  }
  const networks = res.body?.networks ?? []
  if (!networks.length) {
    wrap.innerHTML = `<p class="dim">${t('wlan.noneSaved')}</p>`
    return
  }
  wrap.innerHTML = ''
  for (const n of networks) {
    const row = document.createElement('div')
    row.className = 'wlan-row' + (n.active ? ' active' : '')
    const nm = document.createElement('span')
    nm.className = 'wlan-ssid'
    nm.textContent = n.ssid
    const badge = document.createElement('span')
    badge.className = 'wlan-badge'
    badge.textContent = n.active ? t('common.checkActiveLower') : ''
    const rm = document.createElement('button')
    rm.className = 'ghost'
    rm.textContent = t('common.remove')
    if (n.active) {
      rm.disabled = true
      rm.title = t('wlan.activeNoRemove')
    } else {
      rm.addEventListener('click', () => removeWlan(n.ssid))
    }
    row.append(nm, badge, rm)
    wrap.appendChild(row)
  }
}

async function scanWlan() {
  const btn = $('#wlan-scan-btn')
  const wrap = $('#wlan-scan-results')
  if (!wrap) return
  if (btn) {
    btn.disabled = true
    btn.textContent = t('wlan.scanning')
  }
  wrap.hidden = false
  wrap.innerHTML = `<p class="dim">${t('wlan.scanRunning')}</p>`
  const res = await api(`${API}/wlan/scan`)
  if (btn) {
    btn.disabled = false
    btn.textContent = '📡 Scan'
  }
  if (!res.ok) {
    wrap.innerHTML = `<p class="dim">${t('wlan.scanFailed', { status: res.status })}</p>`
    return
  }
  const networks = res.body?.networks ?? []
  if (!networks.length) {
    wrap.innerHTML = `<p class="dim">${t('wlan.noneInRange')}</p>`
    return
  }
  wrap.innerHTML = ''
  for (const n of networks) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'wlan-row wlan-scan-row'
    const nm = document.createElement('span')
    nm.className = 'wlan-ssid'
    nm.textContent = `${n.encrypted ? '🔒 ' : ''}${n.ssid}`
    const sig = document.createElement('span')
    sig.className = 'wlan-badge'
    sig.textContent = `${n.signal_dbm} dBm`
    row.append(nm, sig)
    row.addEventListener('click', () => {
      const ssidIn = $('#wlan-add-ssid')
      const pwIn = $('#wlan-add-password')
      if (ssidIn) ssidIn.value = n.ssid
      if (pwIn && n.encrypted) pwIn.focus()
      else if (pwIn) pwIn.value = ''
      wrap.hidden = true
    })
    wrap.appendChild(row)
  }
}

async function addWlan() {
  const ssid = ($('#wlan-add-ssid')?.value ?? '').trim()
  const password = $('#wlan-add-password')?.value ?? ''
  if (!ssid) {
    feedback('#wlan-add-feedback', 'error', t('wlan.enterSsid'))
    return
  }
  const res = await api(`${API}/wlan/add`, { method: 'POST', body: { ssid, password } })
  if (!res.ok) {
    feedback('#wlan-add-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  feedback('#wlan-add-feedback', 'success', t('wlan.queued', { ssid }))
  if ($('#wlan-add-ssid')) $('#wlan-add-ssid').value = ''
  if ($('#wlan-add-password')) $('#wlan-add-password').value = ''
  // 3 s warten, dann saved-Liste neu laden — der Daemon braucht ~2 s.
  setTimeout(() => loadWlanSaved(), 3500)
}

async function removeWlan(ssid) {
  if (!(await confirmDialog(t('common.removeQ', { name: ssid }), t('wlan.removeBody'), { destructive: true, confirmLabel: t('common.remove') }))) return
  const res = await api(`${API}/wlan/remove`, { method: 'POST', body: { ssid } })
  if (!res.ok) {
    feedback('#wlan-add-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  feedback('#wlan-add-feedback', 'success', t('common.removedMsg', { name: ssid }))
  loadWlanSaved()
}

/* ---------- screen: power (Phase 15i) ---------- */

/** Pulls /api/mupihat (live readings) + /api/eltern/power-config (profile
 *  + idle timeouts) in parallel, renders the power-section. */
async function loadPower() {
  await Promise.all([loadPowerLive(), loadPowerConfig(), loadBatteryChart()])
}

/** Phase 18 Item 6: 24 h battery chart — fetches the per-minute snapshot
 *  log written by the backend's startBatteryLogPoller and renders a simple
 *  SVG polyline (percent over time). No chart library. */
async function loadBatteryChart() {
  const svg = $('#battery-chart')
  const info = $('#battery-chart-info')
  if (!svg) return
  const res = await api(`${API}/battery-history?hours=24`)
  if (!res.ok) {
    svg.innerHTML = `<text x="300" y="90" text-anchor="middle" fill="#888" font-size="14">${t('common.errorStatus', { status: res.status })}</text>`
    return
  }
  const samples = res.body?.samples ?? []
  if (samples.length < 2) {
    svg.innerHTML = `<text x="300" y="90" text-anchor="middle" fill="#888" font-size="14">${t('chart.collecting')}</text>`
    if (info) info.textContent = t('chart.soFar', { n: samples.length })
    return
  }
  const W = 600
  const H = 180
  const padL = 30
  const padR = 8
  const padT = 8
  const padB = 24
  const tsMs = samples.map((s) => Date.parse(s.ts))
  const minTs = tsMs[0]
  const maxTs = tsMs[tsMs.length - 1]
  const tsRange = Math.max(1, maxTs - minTs)
  const xs = (i) => padL + ((tsMs[i] - minTs) / tsRange) * (W - padL - padR)
  const ys = (v) => padT + (1 - v / 100) * (H - padT - padB)
  // Build polyline points only for samples that have a percent value
  let path = ''
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].percent
    if (p == null) continue
    const x = xs(i).toFixed(1)
    const y = ys(p).toFixed(1)
    path += `${path ? 'L' : 'M'}${x},${y} `
  }
  // Grid lines at 0/25/50/75/100 % plus labels
  let grid = ''
  for (const v of [0, 25, 50, 75, 100]) {
    const y = ys(v).toFixed(1)
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" />`
    grid += `<text x="${padL - 4}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#888" font-size="10">${v}%</text>`
  }
  // X-axis time labels (start, mid, end)
  const fmt = (ms) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const xlabels = `
    <text x="${padL}" y="${H - 6}" fill="#888" font-size="10">${fmt(minTs)}</text>
    <text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" fill="#888" font-size="10">${fmt(minTs + tsRange / 2)}</text>
    <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="#888" font-size="10">${fmt(maxTs)}</text>`
  svg.innerHTML = `${grid}<path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2" />${xlabels}`
  if (info) {
    const last = samples[samples.length - 1]
    const hoursCovered = Math.round((maxTs - minTs) / 36000) / 100
    info.textContent = t('chart.info', { n: samples.length, hours: hoursCovered, last: last.percent ?? '—', time: fmt(maxTs) })
  }
}

async function loadPowerLive() {
  try {
    const res = await fetch('/api/mupihat', { credentials: 'same-origin' })
    if (!res.ok) return
    const body = await res.json().catch(() => ({}))
    // Bat_Percent (Phase 12) is the granular 5%-step value. Fall back to
    // the legacy Bat_SOC string for older mupihat.py outputs.
    const pct = body?.Bat_Percent ?? Number.parseInt(String(body?.Bat_SOC ?? '').replace('%', ''), 10)
    const charging = (body?.IBus ?? 0) > 0
    const pctEl = $('#power-percent')
    if (pctEl) {
      if (Number.isFinite(pct)) {
        pctEl.textContent = `${charging ? '⚡' : ''}${pct}%`
        pctEl.classList.remove('low', 'critical')
        if (pct <= 15) pctEl.classList.add('critical')
        else if (pct <= 30) pctEl.classList.add('low')
      } else {
        pctEl.textContent = '—'
      }
    }
    setText('#power-state', charging ? t('power.charging') : (body?.Bat_Stat ?? body?.Charger_Status ?? '—'))
    setText('#power-vbat', body?.Vbat ? fmtVoltage(body.Vbat) : '—')
    setText('#power-vbus', body?.Vbus ? fmtVoltage(body.Vbus) : '—')
    setText('#power-ibat', typeof body?.Ibat === 'number' ? `${body.Ibat} mA` : '—')
    setText('#power-temp', typeof body?.Temp === 'number' ? `${body.Temp} °C` : '—')
    setText('#power-chargerstatus', body?.Charger_Status ?? '—')
  } catch { /* swallow */ }
}

async function loadPowerConfig() {
  const res = await api(`${API}/power-config`)
  if (!res.ok) return
  const body = res.body ?? {}
  setText('#power-profile-name', body.battery?.selected ?? '—')
  const p = body.battery?.profile ?? {}
  // Phase 18 Item 7: profile fields are now editable inputs (mV).
  // Number conversion because config stores them as strings.
  if ($('#pwr-prof-v100')) $('#pwr-prof-v100').value = p.v_100 ? Number(p.v_100) : ''
  if ($('#pwr-prof-warn')) $('#pwr-prof-warn').value = p.th_warning ? Number(p.th_warning) : ''
  if ($('#pwr-prof-shut')) $('#pwr-prof-shut').value = p.th_shutdown ? Number(p.th_shutdown) : ''
  if ($('#pwr-prof-vreg')) $('#pwr-prof-vreg').value = p.vreg ? Number(p.vreg) : ''
  const t = body.timeout ?? {}
  $('#power-idle-shutdown').value = t.idlePiShutdown ?? 0
  $('#power-idle-display').value = t.idleDisplayOff ?? 10
}

async function saveBatteryProfile() {
  const v100 = Number($('#pwr-prof-v100')?.value)
  const warn = Number($('#pwr-prof-warn')?.value)
  const shut = Number($('#pwr-prof-shut')?.value)
  const vreg = Number($('#pwr-prof-vreg')?.value)
  // VREG-Sicherheits-Confirm: zu hoch = Akku-Schaden. Frag explizit nach.
  if (Number.isFinite(vreg) && vreg > 8400) {
    if (!(await confirmDialog(t('power.vregHighQ', { vreg }), t('power.vregHighBody'), { destructive: true, confirmLabel: t('power.saveAnyway') }))) {
      return
    }
  }
  const batteryProfile = {}
  if (Number.isFinite(v100) && v100 > 0) batteryProfile.v_100 = v100
  if (Number.isFinite(warn) && warn > 0) batteryProfile.th_warning = warn
  if (Number.isFinite(shut) && shut > 0) batteryProfile.th_shutdown = shut
  if (Number.isFinite(vreg) && vreg > 0) batteryProfile.vreg = vreg
  if (Object.keys(batteryProfile).length === 0) {
    feedback('#pwr-prof-feedback', 'error', t('power.noValues'))
    return
  }
  const res = await api(`${API}/power-config`, { method: 'POST', body: { batteryProfile } })
  if (!res.ok) {
    feedback('#pwr-prof-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  const vregMsg = Number.isFinite(vreg) && vreg > 0 ? ` ${t('power.vregNote')}` : ''
  feedback('#pwr-prof-feedback', 'success', `${t('power.profileSaved')}${vregMsg}`)
  loadPowerConfig()
}

async function savePowerConfig() {
  const idleShutdown = Number($('#power-idle-shutdown').value)
  const idleDisplay = Number($('#power-idle-display').value)
  if (!Number.isFinite(idleShutdown) || idleShutdown < 0 || idleShutdown > 1440) {
    feedback('#power-feedback', 'error', t('power.idleShutdownRange'))
    return
  }
  if (!Number.isFinite(idleDisplay) || idleDisplay < 0 || idleDisplay > 1440) {
    feedback('#power-feedback', 'error', t('power.idleDisplayRange'))
    return
  }
  const res = await api(`${API}/power-config`, {
    method: 'POST',
    body: { idlePiShutdown: idleShutdown, idleDisplayOff: idleDisplay },
  })
  if (res.ok) {
    feedback('#power-feedback', 'success', t('common.savedChangesNow'))
  } else {
    feedback('#power-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

/* ---------- Schlaftimer (Phase 17i) ---------- */

let sleepTimerTickHandle = null

/** Fetch + render the current SleepTimer state. Self-schedules the next
 *  poll: ~5s while a timer is active so the countdown is live; ~30s when
 *  idle so we still pick up a timer started elsewhere (mupi.php, Telegram).
 *  Polling auto-stops when the user leaves the Akku screen. */
async function loadSleepTimer() {
  if (sleepTimerTickHandle) {
    clearTimeout(sleepTimerTickHandle)
    sleepTimerTickHandle = null
  }
  const statusEl = $('#sleeptimer-status')
  const stopBtn = $('#sleeptimer-stop-btn')
  let intervalMs = 30000
  try {
    const res = await api(`${API}/sleeptimer`)
    if (res.ok) {
      const b = res.body ?? {}
      if (b.active) {
        const rem = Number(b.remaining_seconds) || 0
        const until = b.until_iso ? new Date(b.until_iso) : null
        const untilText = until ? ` (${t('sleep.until', { time: fmtClock(until) })})` : ''
        if (statusEl) {
          statusEl.textContent = t('sleep.active', { dur: fmtDuration(rem), until: untilText })
        }
        if (stopBtn) stopBtn.hidden = false
        intervalMs = 5000
      } else {
        if (statusEl) statusEl.textContent = t('common.off')
        if (stopBtn) stopBtn.hidden = true
      }
    } else if (statusEl) {
      statusEl.textContent = t('common.statusUnavailable')
    }
  } catch {
    if (statusEl) statusEl.textContent = t('common.statusUnavailable')
  }
  // Only keep polling while the Spielzeit & Ruhe screen is the active one.
  if (state.currentSection === 'caps') {
    sleepTimerTickHandle = setTimeout(loadSleepTimer, intervalMs)
  }
}

async function startSleepTimer() {
  const slider = $('#sleeptimer-minutes')
  const minutes = Number(slider?.value)
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    feedback('#sleeptimer-feedback', 'error', t('sleep.invalid'))
    return
  }
  const btn = $('#sleeptimer-start-btn')
  if (btn) btn.disabled = true
  const res = await api(`${API}/sleeptimer/start`, { method: 'POST', body: { minutes } })
  if (btn) btn.disabled = false
  if (!res.ok) {
    feedback('#sleeptimer-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  feedback('#sleeptimer-feedback', 'success', t('sleep.started', { n: minutes }))
  loadSleepTimer()
}

async function stopSleepTimer() {
  if (!(await confirmDialog(t('sleep.stopQ'), t('sleep.stopBody'), { confirmLabel: t('sleep.stop') }))) return
  const res = await api(`${API}/sleeptimer/stop`, { method: 'POST' })
  if (!res.ok) {
    feedback('#sleeptimer-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    return
  }
  feedback('#sleeptimer-feedback', 'success', t('sleep.stopped'))
  loadSleepTimer()
}

/* ---------- screen: hub overview (Phase 15a) ---------- */

/** Hub-overview card subs — live stats so parents see at a glance what
 *  needs attention. Sync card shows last-sync timing + count; power card
 *  shows battery %. Other cards stay descriptive — they'll be wired
 *  with real data in 15c/d/f/g once their backends exist. */
async function loadHub() {
  loadPlayback() // Phase 18 Item 5: top Now-Playing card
  loadPlaybackVolume() // Volume-Slider im Hero (Phase 19 follow-up)
  loadStatusBand() // Phase 19 Welle 2: 4-Chip Live-Status oberhalb Grid
  // Sync-Card sub: last sync + counts. Fail silently — hub overview
  // shouldn't break if the sync endpoint hiccups.
  try {
    const res = await api(`${SYNC_API}/status`)
    if (res.ok) {
      const cfg = res.body ?? {}
      const last = cfg.state?.last_sync_status
      const when = formatRelative(cfg.state?.last_sync_end)
      if (!cfg.token?.configured) {
        setText('#hub-card-sync-sub', t('sync.notSetUp'))
      } else if (!cfg.token?.scopes_ok) {
        setText('#hub-card-sync-sub', t('sync.reauthWarn'))
      } else if (!cfg.enabled) {
        setText('#hub-card-sync-sub', t('common.disabled'))
      } else if (last === 'COMPLETED') {
        const a = cfg.state.additions_count ?? 0
        const r = cfg.state.removals_count ?? 0
        setText('#hub-card-sync-sub', t('sync.hubActive', { when, a, r }))
      } else {
        setText('#hub-card-sync-sub', last ?? '—')
      }
    }
  } catch { /* swallow */ }

  // Power-Card sub: pull /api/mupihat for battery %. Best-effort.
  try {
    const res = await fetch('/api/mupihat', { credentials: 'same-origin' })
    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      const pct = body?.Bat_Percent ?? body?.Bat_SOC
      const charging = body?.IBus > 0
      if (typeof pct === 'number') {
        setText('#hub-card-power-sub', `${charging ? '⚡' : ''}${pct}%`)
      } else if (typeof pct === 'string') {
        setText('#hub-card-power-sub', pct)
      }
    }
  } catch { /* swallow */ }
}

/** Live-Status-Band (Welle 2). Vier Chips: Akku, Cap, Quiet, Netz.
 *  Aggregiert in einem Promise.all, färbt jeden Chip nach Zustand
 *  (ok/warn/danger). Pollt nicht; loadHub() ruft das beim Eintritt
 *  und das Playback-Polling stösst es indirekt nicht an — bewusst, damit
 *  der Band nicht ständig flackert. */
async function loadStatusBand() {
  const [hat, pt, net] = await Promise.all([
    fetch('/api/mupihat', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/playtime', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/network', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])

  // Akku-Chip
  const chipBat = $('a[href="#power"].status-chip') // nimmt den ersten Battery-Chip
  if (chipBat) {
    let pct = hat?.Bat_Percent
    if (!Number.isFinite(pct)) pct = Number.parseInt(String(hat?.Bat_SOC ?? '').replace('%', ''), 10)
    const charging = (hat?.IBus ?? 0) > 0
    chipBat.classList.remove('is-ok', 'is-warn', 'is-danger', 'is-active')
    if (Number.isFinite(pct)) {
      setText('#status-chip-battery', `${charging ? '⚡' : ''}${pct}%`)
      if (pct <= 15) chipBat.classList.add('is-danger')
      else if (pct <= 30) chipBat.classList.add('is-warn')
      else if (charging) chipBat.classList.add('is-active')
    } else {
      setText('#status-chip-battery', '—')
    }
  }

  // Cap-Chip
  const ptB = pt?.playtime ?? {}
  const chipCap = $('a[href="#caps"].status-chip:nth-of-type(2)')
  if (chipCap) {
    chipCap.classList.remove('is-ok', 'is-warn', 'is-danger')
    if (ptB.enabled) {
      const used = Math.floor((ptB.usedSeconds ?? 0) / 60)
      setText('#status-chip-cap', `${used} m`)
      if (ptB.state === 'blocked') chipCap.classList.add('is-danger')
      else if (ptB.state === 'grace') chipCap.classList.add('is-warn')
    } else {
      setText('#status-chip-cap', t('common.offLower'))
      chipCap.classList.add('is-warn')
    }
  }

  // Quiet-Chip
  const qh = pt?.quiet ?? {}
  const chipQuiet = $('#status-chip-quiet')?.closest('.status-chip')
  if (chipQuiet) {
    chipQuiet.classList.remove('is-ok', 'is-warn', 'is-danger')
    if (qh.enabled) {
      if (qh.state === 'blocked') {
        setText('#status-chip-quiet', qh.label || t('chip.quiet'))
        chipQuiet.classList.add('is-warn')
      } else if (qh.state === 'grace') {
        setText('#status-chip-quiet', t('capstate.grace'))
        chipQuiet.classList.add('is-warn')
      } else {
        setText('#status-chip-quiet', t('chip.free'))
      }
    } else {
      setText('#status-chip-quiet', t('common.offLower'))
    }
  }

  // Netz-Chip
  const chipNet = $('#status-chip-net')?.closest('.status-chip')
  if (chipNet) {
    chipNet.classList.remove('is-ok', 'is-warn', 'is-danger')
    if (net?.onlinestate === 'online' && net?.wifi) {
      setText('#status-chip-net', net.wifi)
    } else if (net?.wifi) {
      setText('#status-chip-net', net.wifi + ' (offline)')
      chipNet.classList.add('is-danger')
    } else {
      setText('#status-chip-net', 'offline')
      chipNet.classList.add('is-danger')
    }
  }
}

/* ---------- screen: sync (Phase 14, formerly 'dashboard') ---------- */

async function loadSync() {
  const res = await api(`${SYNC_API}/status`)
  if (!res.ok) {
    feedback('#sync-feedback', 'error', t('sync.statusLoadFailed', { status: res.status }))
    return
  }
  const data = res.body
  const cfg = data || {}
  setText('#sync-prefix', cfg.playlist_prefix ?? '—')
  setText('#sync-last', formatRelative(cfg.state?.last_sync_end))
  setText('#sync-state', cfg.state?.last_sync_status ?? '—')
  setText('#sync-next', formatRelativeFuture(cfg.state?.next_scheduled_sync))

  // Last-run summary.
  const counts = $('#sync-counts')
  if (cfg.state?.last_sync_status === 'COMPLETED') {
    counts.hidden = false
    const a = cfg.state.additions_count ?? 0
    const u = cfg.state.updates_count ?? 0
    const r = cfg.state.removals_count ?? 0
    setText('#sync-summary', `+${a} / ↻${u} / −${r}`)
  } else {
    counts.hidden = true
  }

  // Spotify-Card.
  const sActions = $('#spotify-actions')
  const sStatus = $('#spotify-status')
  sActions.innerHTML = ''
  if (!cfg.token?.configured) {
    sStatus.innerHTML = `<span class="dim">${t('sync.notSetUp')}</span>`
    addBtn(sActions, 'primary', t('sync.setupSpotify'), () => goWizard())
  } else if (!cfg.token?.scopes_ok) {
    sStatus.innerHTML = `<span class="dim">${t('sync.scopesInsufficient')}</span>`
    addBtn(sActions, 'primary', t('sync.reauth'), () => connectSpotify())
  } else {
    sStatus.innerHTML = `<span class="value">${t('sync.connected')}</span>`
    addBtn(sActions, 'ghost', t('sync.disconnect'), () => disconnectSpotify())
    if (!cfg.enabled) {
      addBtn(sActions, 'primary', t('sync.enable'), () => toggleSync(true))
    } else {
      addBtn(sActions, 'ghost', t('sync.disable'), () => toggleSync(false))
    }
  }

  // Playlists-Liste
  const pls = $('#sync-playlists')
  pls.innerHTML = ''
  for (const p of cfg.state?.playlists_seen ?? []) {
    const div = document.createElement('div')
    div.className = 'playlist-item'
    div.innerHTML = `<span>📂 ${escapeHtml(p.name)}</span><span class="dim">${p.items} Items</span>`
    pls.appendChild(div)
  }

  // Konflikte (Phase 14e: jetzt mit Aktions-Button "Vom Sync verwalten lassen")
  const confs = cfg.state?.conflicts ?? []
  $('#conflicts-card').hidden = confs.length === 0
  const list = $('#conflicts-list')
  list.innerHTML = ''
  for (const c of confs) {
    const li = document.createElement('li')
    const meta = document.createElement('div')
    meta.textContent = `${c.manualArtist ?? '?'} – ${c.manualTitle ?? '?'}`
    const pl = document.createElement('div')
    pl.className = 'dim'
    pl.textContent = t('sync.alsoIn', { list: (c.inPlaylists || []).join(', ') })
    const actions = document.createElement('div')
    actions.className = 'actions'
    addBtn(actions, 'ghost', t('sync.promote'), () => promoteConflict(c))
    li.append(meta, pl, actions)
    list.appendChild(li)
  }
}

/** POST /api/spotify-sync/conflicts/promote with the conflict's identifier
 *  pair. On success: reload dashboard so the conflict is gone (item is now
 *  source='spotify-sync' and will be updated by the next sync). */
async function promoteConflict(conflict) {
  const field = conflict.identifierField
  // The group key is `<prefix>:<id>` (or `compilation:<artistId>:<albumId>`).
  // For matching against library we need the bare id — same extraction as
  // the diff module does.
  let value = ''
  const groupKey = conflict.groupKey ?? ''
  if (groupKey.startsWith('compilation:')) {
    const parts = groupKey.split(':')
    value = parts[parts.length - 1] ?? ''
  } else if (groupKey.includes(':')) {
    value = groupKey.slice(groupKey.indexOf(':') + 1)
  } else {
    value = groupKey
  }
  if (!field || !value) {
    feedback('#sync-feedback', 'error', t('sync.conflictIncomplete'))
    return
  }
  if (!(await confirmDialog(t('sync.promoteQ', { name: `${conflict.manualArtist ?? '?'} – ${conflict.manualTitle ?? '?'}` }), t('sync.promoteBody'), { confirmLabel: t('sync.handOver') }))) {
    return
  }
  const res = await api(`${SYNC_API}/conflicts/promote`, {
    method: 'POST',
    body: { identifierField: field, identifierValue: value },
  })
  if (res.ok) {
    feedback('#sync-feedback', 'success', t('sync.promoted'))
    await loadSync()
  } else {
    feedback('#sync-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

function addBtn(parent, cls, label, onClick) {
  const b = document.createElement('button')
  b.className = cls
  b.textContent = label
  b.addEventListener('click', onClick)
  parent.appendChild(b)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/* ---------- actions ---------- */

/** Fire a sync trigger and translate the response into an honest, short
 *  status phrase. Thanks to the trailing-edge scheduler, a throttled trigger
 *  comes back as 202 'scheduled' (it WILL run automatically when the cooldown
 *  ends) — so we never claim "läuft" when nothing actually started. */
async function fireSyncTrigger() {
  const res = await api(`${SYNC_API}/trigger?source=webapp`, { method: 'POST' })
  const b = res.body || {}
  if (res.status === 202 && b.status === 'scheduled') {
    return { kind: 'info', text: t('sync.autoIn', { n: b.scheduledInSeconds ?? 60 }) }
  }
  if (res.status === 202) return { kind: 'success', text: t('sync.running') }
  if (res.status === 409) return { kind: 'info', text: t('sync.runningNowLower') }
  if (b.status === 'disabled') return { kind: 'error', text: t('sync.disabledShort') }
  return { kind: 'info', text: t('sync.nextRun') }
}

/** Welle 7: alias auf fmtClock — keeps existing call sites. */
const fmtTimeShort = fmtClock

/** Library "Letzter Sync"-Zeile aktualisieren (beim Betreten + nach Läufen). */
async function loadSyncStatus() {
  const el = $('#library-sync-status')
  if (!el) return
  const s = await api(`${SYNC_API}/status`)
  if (!s.ok) {
    el.textContent = ''
    return
  }
  if (!s.body?.enabled) {
    el.textContent = t('sync.disabledDot')
    return
  }
  const st = s.body?.state || {}
  el.textContent = st.last_sync_end ? t('sync.lastAt', { time: fmtTimeShort(st.last_sync_end) }) : t('sync.none')
}

/** Prominent "Jetzt synchronisieren": triggert + pollt /status bis ein neuer
 *  Lauf fertig ist und zeigt das Ergebnis (+x / −y). */
async function manualSyncNow() {
  const btn = $('#library-sync-btn')
  const el = $('#library-sync-status')
  if (btn) btn.disabled = true
  let before = null
  try {
    const s = await api(`${SYNC_API}/status`)
    before = s.body?.state?.last_sync_start ?? null
  } catch {}
  const sync = await fireSyncTrigger()
  if (el) el.textContent = sync.text
  const deadline = Date.now() + 90000
  const poll = async () => {
    if (Date.now() > deadline) {
      if (btn) btn.disabled = false
      loadSyncStatus()
      return
    }
    const s = await api(`${SYNC_API}/status`)
    const st = s.body?.state
    const done =
      st && st.last_sync_start && st.last_sync_start !== before && (st.current_state === 'IDLE' || st.current_state === 'COMPLETED')
    if (done) {
      const add = st.additions_count ?? 0
      const rem = st.removals_count ?? 0
      const upd = st.updates_count ?? 0
      if (el) el.textContent = t('sync.finished', { add, rem, upd: upd ? ` / ~${upd}` : '', time: fmtTimeShort(st.last_sync_end) })
      if (btn) btn.disabled = false
      loadSubscriptions()
      return
    }
    setTimeout(poll, 2000)
  }
  setTimeout(poll, 2000)
}

async function triggerSync() {
  const btn = $('#sync-trigger-btn')
  btn.disabled = true
  feedback('#sync-feedback', 'info', t('sync.started'))
  const res = await api(`${SYNC_API}/trigger?source=webapp`, { method: 'POST' })
  if (res.status === 202 && res.body?.status === 'scheduled') {
    feedback('#sync-feedback', 'info', t('sync.cooldown', { n: res.body?.scheduledInSeconds ?? 60 }))
    btn.disabled = false
  } else if (res.status === 202) {
    feedback('#sync-feedback', 'info', t('sync.background'))
    setTimeout(async () => {
      await loadSync()
      feedback('#sync-feedback', 'success', t('sync.statusUpdated'))
      btn.disabled = false
    }, 5000)
  } else if (res.status === 409) {
    feedback('#sync-feedback', 'info', t('sync.alreadyRunning'))
    btn.disabled = false
  } else {
    feedback('#sync-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
    btn.disabled = false
  }
}

async function toggleSync(enable) {
  const res = await api(`${SYNC_API}/config`, { method: 'POST', body: { enabled: enable } })
  if (res.ok) {
    feedback('#sync-feedback', 'success', enable ? t('sync.enabledMsg') : t('sync.disabledMsg'))
    await loadSync()
  } else {
    feedback('#sync-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

async function connectSpotify() {
  const res = await api(`${API}/spotify-oauth/init?return=${encodeURIComponent(location.pathname.startsWith('/eltern') ? '/eltern' : '/parents')}`)
  if (res.ok && res.body?.authorize_url) {
    location.href = res.body.authorize_url
  } else if (res.status === 400 && res.body?.error === 'no_client_id') {
    goWizard()
  } else {
    feedback('#sync-feedback', 'error', t('sync.oauthFailed', { status: res.status }))
  }
}

async function disconnectSpotify() {
  if (!(await confirmDialog(t('sync.disconnectQ'), t('sync.disconnectBody'), { destructive: true, confirmLabel: t('sync.disconnect') }))) return
  const res = await api(`${API}/spotify-oauth/disconnect`, { method: 'POST' })
  if (res.ok) {
    await loadSync()
    feedback('#sync-feedback', 'success', t('sync.disconnected'))
  }
}

async function logout() {
  await api(`${API}/logout`, { method: 'POST' })
  location.reload()
}

/* ---------- settings (Phase 14e polish) ---------- */

async function goSettings() {
  navigate('settings')
}

async function loadSettings() {
  const res = await api(`${SYNC_API}/config`)
  if (!res.ok) {
    feedback('#settings-feedback', 'error', t('common.loadFailedColon', { status: res.status }))
    return
  }
  const cfg = res.body ?? {}
  $('#settings-prefix').value = cfg.playlist_prefix ?? ''
  // Backend stores seconds; UI shows minutes — Q6=B default 900s = 15min.
  $('#settings-interval').value = Math.max(5, Math.min(60, Math.round((cfg.polling_interval_seconds ?? 900) / 60)))
  $('#settings-enabled').checked = !!cfg.enabled
  updateSettingsExamples()
}

function updateSettingsExamples() {
  const name = $('#settings-prefix').value.trim() || 'LeniBox'
  setText('#settings-prefix-example-1', t('example.audiobooks', { name }))
  setText('#settings-prefix-example-2', t('example.music', { name }))
}

async function saveSettings() {
  const prefix = $('#settings-prefix').value.trim()
  const intervalMin = Number($('#settings-interval').value)
  const enabled = $('#settings-enabled').checked

  if (prefix.length < 2 || prefix.length > 30) {
    feedback('#settings-feedback', 'error', t('settings.nameLength'))
    return
  }
  if (!Number.isFinite(intervalMin) || intervalMin < 5 || intervalMin > 60) {
    feedback('#settings-feedback', 'error', t('settings.intervalRange'))
    return
  }

  // Save: only send the three fields the user can change here. Backend
  // ignores anything else and clamps polling_interval_seconds to [300, 3600].
  const res = await api(`${SYNC_API}/config`, {
    method: 'POST',
    body: {
      enabled,
      playlist_prefix: prefix,
      polling_interval_seconds: intervalMin * 60,
    },
  })
  if (res.ok) {
    feedback('#settings-feedback', 'success', t('settings.saved'))
  } else {
    feedback('#settings-feedback', 'error', res.body?.error ?? t('common.errorStatus', { status: res.status }))
  }
}

/* ---------- wizard ---------- */

function goWizard() {
  navigate('wizard')
}

/** Router-bound loader for the wizard section. Restores the step the
 *  user was on (sessionStorage-backed) so a hashchange/back-button
 *  trip doesn't reset progress. */
function loadWizard() {
  setWizardStep(state.wizardStep || 1)
  updateWizardExamples()
}

function setWizardStep(step) {
  state.wizardStep = step
  sessionStorage.setItem('wizard.step', String(step))
  setText('#wizard-step-label', t('wizard.stepOf', { step }))
  for (const el of $$('.wizard-step')) el.hidden = true
  const target = $(`#wizard-step-${step}`)
  if (target) target.hidden = false
  if (step === 2) updateWizardRedirectUri()
}

function updateWizardRedirectUri() {
  const el = $('#wizard-redirect-uri')
  if (el) el.textContent = `${location.protocol}//${location.host}/api/eltern/spotify-oauth/callback`
}

function updateWizardExamples() {
  const name = $('#wizard-box-name').value.trim() || 'LeniBox'
  setText('#wizard-example-1', t('example.audiobooks', { name }))
  setText('#wizard-example-2', t('example.music', { name }))
  setText('#wizard-example-3', t('example.bedtime', { name }))
  $('#wizard-app-name').textContent = name
}

async function wizardSaveClientId() {
  const clientId = $('#wizard-client-id').value.trim()
  if (!clientId || !/^[a-zA-Z0-9]+$/.test(clientId) || clientId.length < 16) {
    toast('warn', t('wizard.invalidClientId'))
    return
  }
  // Optional Client-Secret-Feld (Phase 14e — wizard kann auch klassisch
  // statt PKCE, falls Eltern's Spotify-App sowieso ein Secret hat).
  // Wizard-UI zeigt das nicht als Pflichtfeld; leerer Wert => PKCE.
  const clientSecret = ''
  const res = await api(`${API}/spotify-credentials`, {
    method: 'POST',
    body: { clientId, clientSecret },
  })
  if (!res.ok) {
    toast('error', t('common.saveFailedColon', { err: res.body?.error ?? res.status }))
    return
  }
  setWizardStep(4)
}

async function wizardConnectSpotify() {
  await connectSpotify()
}

async function wizardFinish() {
  const name = $('#wizard-box-name').value.trim()
  if (name.length < 2) {
    toast('warn', t('wizard.nameMin'))
    return
  }
  const res = await api(`${SYNC_API}/config`, {
    method: 'POST',
    body: { enabled: true, playlist_prefix: name },
  })
  if (res.ok) {
    sessionStorage.removeItem('wizard.step')
    state.wizardStep = 1
    navigate('sync')
  } else {
    toast('error', t('wizard.configSaveFailed', { status: res.status }))
  }
}

/* ---------- bootstrap ---------- */

async function bootstrap() {
  showScreen('loading')
  const res = await api(`${API}/session`)
  if (res.status === 401 || !res.ok) {
    // Phase 17h: if a parent password is configured, offer a login form on the
    // no-session screen so the parent can re-enter without a fresh magic-link.
    const info = await api(`${API}/auth-info`)
    state.passwordConfigured = !!info.body?.passwordConfigured
    const pwCard = $('#no-session-password')
    if (pwCard) pwCard.hidden = !state.passwordConfigured
    const fb = $('#login-feedback')
    if (fb) fb.hidden = true
    const inp = $('#login-password')
    if (inp) inp.value = ''
    showScreen('no-session')
    if (state.passwordConfigured && inp) setTimeout(() => inp.focus(), 80)
    return
  }
  state.csrf = res.body.csrf_token
  state.passwordConfigured = !!res.body.passwordConfigured
  $('#logout-btn').hidden = false
  // Welle 6: Initialise Range-Slider-Fill (--range-pct CSS-Variable).
  initRangeFills()

  // Returned from Spotify OAuth callback? Land on sync so the user sees
  // the confirmation feedback immediately, and strip the query so a
  // reload doesn't re-trigger it.
  if (state.spotifyConnected) {
    history.replaceState({}, '', `${location.pathname}#sync`)
    onRoute()
    // Allow loadSync's render to complete, then push feedback over it.
    setTimeout(() => feedback('#sync-feedback', 'success', t('sync.connectedMsg')), 50)
    return
  }
  if (state.spotifyError) {
    history.replaceState({}, '', `${location.pathname}#sync`)
    onRoute()
    setTimeout(() => feedback('#sync-feedback', 'error', t('sync.spotifyError', { err: state.spotifyError })), 50)
    return
  }

  // Standard path: route by hash (defaults to hub).
  onRoute()
}

/* ---------- wiring ---------- */

function wire() {
  $('#logout-btn').addEventListener('click', logout)
  // Sprachwahl (Hub + Anmelde-Screen).
  for (const sel of $$('.lang-select')) sel.addEventListener('change', onLanguageChange)
  $('#sync-trigger-btn').addEventListener('click', triggerSync)
  // Phase 14e polish: "Einstellungen" -> dedicated short settings screen
  // (Box-Name + interval + enable toggle), NOT the full setup wizard.
  $('#sync-config-btn').addEventListener('click', () => goSettings())

  // Phase 15a — header back-button: navigate to the current section's
  // parent (set in SECTIONS map). Default to hub if parent is missing.
  $('#header-back-btn').addEventListener('click', () => {
    const meta = SECTIONS[state.currentSection ?? 'hub']
    navigate(meta?.parent ?? 'hub')
  })

  // Settings-screen buttons.
  $('#settings-back-btn').addEventListener('click', () => navigate('sync'))
  $('#settings-save-btn').addEventListener('click', saveSettings)
  $('#settings-rerun-wizard-btn').addEventListener('click', () => goWizard())
  $('#settings-prefix').addEventListener('input', updateSettingsExamples)

  // Phase 15i — Power-screen save.
  $('#power-save-btn')?.addEventListener('click', savePowerConfig)
  $('#pwr-prof-save-btn')?.addEventListener('click', saveBatteryProfile)
  $('#sleeptimer-start-btn')?.addEventListener('click', startSleepTimer)
  $('#sleeptimer-stop-btn')?.addEventListener('click', stopSleepTimer)
  $('#sleeptimer-minutes')?.addEventListener('input', (e) => {
    const out = $('#sleeptimer-minutes-out')
    if (out) out.textContent = String(e.target.value)
  })

  // WLAN (Phase 15c) — read-only status + manual refresh.
  $('#wlan-refresh-btn')?.addEventListener('click', loadWlan)
  $('#wlan-add-btn')?.addEventListener('click', addWlan)
  $('#wlan-scan-btn')?.addEventListener('click', scanWlan)

  // System (Phase 15g) — status refresh + reboot/shutdown.
  $('#sys-refresh-btn')?.addEventListener('click', loadSystem)
  $('#sys-reboot-btn')?.addEventListener('click', systemReboot)
  $('#sys-shutdown-btn')?.addEventListener('click', systemShutdown)
  $('#pw-set-btn')?.addEventListener('click', setPassword)
  $('#pw-clear-btn')?.addEventListener('click', clearPassword)
  $('#login-submit-btn')?.addEventListener('click', doLogin)
  $('#login-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin()
  })

  // Audio (Phase 18 Item 1)
  $('#audio-volume')?.addEventListener('input', (e) => {
    const v = Number(e.target.value)
    setText('#audio-volume-out', v)
    setLiveVolume(v)
  })
  $('#audio-max')?.addEventListener('input', (e) => {
    setText('#audio-max-out', Number(e.target.value))
  })
  $('#audio-startup')?.addEventListener('input', (e) => {
    setText('#audio-startup-out', Number(e.target.value))
  })
  $('#audio-startup-enable')?.addEventListener('change', (e) => {
    const on = e.target.checked
    const startup = $('#audio-startup')
    const row = $('#audio-startup-row')
    if (startup) startup.disabled = !on
    if (row) row.style.opacity = on ? '1' : '0.5'
  })
  $('#audio-save-btn')?.addEventListener('click', saveAudioConfig)

  // Quick-Pause (Phase 18 Item 5)
  $('#playback-toggle-btn')?.addEventListener('click', (e) => {
    const state = e.currentTarget.dataset.state
    playbackAction(state === 'playing' ? 'pause' : 'play')
  })
  $('#playback-stop-btn')?.addEventListener('click', () => playbackAction('stop'))
  $('#playback-prev-btn')?.addEventListener('click', () => playbackAction('previous'))
  $('#playback-next-btn')?.addEventListener('click', () => playbackAction('next'))
  $('#playback-volume-input')?.addEventListener('input', (e) => {
    const v = Number(e.target.value)
    setText('#playback-volume-out', `${v}%`)
    updateRangeFill(e.target)
    setPlaybackVolume(v)
  })

  // Wiedergabe-Sektion (Stufe A, Variante β)
  $('#play-search')?.addEventListener('input', (e) => {
    playState.search = e.target.value
    renderPlay()
  })
  $('#play-filter-pills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.play-pill')
    if (!pill) return
    playState.category = pill.dataset.cat ?? 'all'
    for (const p of $$('.play-pill')) p.classList.toggle('is-active', p === pill)
    // the NAS is read live when it is opened (each time from the top: the selection may have changed)
    if (playState.category === 'nas') {
      playState.nasStack = []
      loadNasLevel()
      return
    }
    renderPlay()
  })
  $('#play-grid')?.addEventListener('click', (e) => {
    const tile = e.target.closest('.play-tile')
    if (!tile) return
    if (tile.dataset.nasIdx !== undefined) {
      onNasTile(Number(tile.dataset.nasIdx))
      return
    }
    if (tile.dataset.nasTopIdx !== undefined) {
      onNasTopTile(Number(tile.dataset.nasTopIdx))
      return
    }
    const idx = Number(tile.dataset.idx)
    if (Number.isInteger(idx)) playLibraryItem(idx)
  })
  $('#play-crumbs')?.addEventListener('click', (e) => {
    const crumb = e.target.closest('.play-crumb[data-depth]')
    if (!crumb) return
    playState.nasStack = playState.nasStack.slice(0, Number(crumb.dataset.depth))
    loadNasLevel()
  })

  // Confirm-Dialog (Welle 4) — OK/Cancel-Buttons + Backdrop-Click + Esc.
  $('#confirm-ok-btn')?.addEventListener('click', () => _confirmClose(true))
  $('#confirm-cancel-btn')?.addEventListener('click', () => _confirmClose(false))
  $('#confirm-backdrop')?.addEventListener('click', (e) => {
    if (e.target?.id === 'confirm-backdrop') _confirmClose(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#confirm-backdrop')?.hidden) _confirmClose(false)
  })

  // Telegram (Phase 15f) — config editor.
  $('#tg-back-btn')?.addEventListener('click', () => navigate('hub'))
  $('#tg-save-btn')?.addEventListener('click', saveTelegram)
  $('#tg-add-chat-btn')?.addEventListener('click', addTelegramChat)

  // Bluetooth (Phase 15d) — power/autoconnect toggles + scan/pair/remove.
  $('#bt-power')?.addEventListener('change', btSetPower)
  $('#bt-autoconnect')?.addEventListener('change', btSetAutoconnect)
  $('#bt-scan-btn')?.addEventListener('click', btScan)

  // Spotify-Suche (Phase 17a)
  $('#library-search-spotify-btn')?.addEventListener('click', () => navigate('search'))
  $('#library-upload-btn')?.addEventListener('click', () => navigate('upload'))
  initUpload()
  $('#library-sync-btn')?.addEventListener('click', manualSyncNow)
  $('#search-go-btn')?.addEventListener('click', doSearch)
  $('#search-query')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch()
  })
  $('#search-type-filter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-stype]')
    if (!btn) return
    searchState.type = btn.dataset.stype
    for (const p of $('#search-type-filter').querySelectorAll('.pill')) p.classList.toggle('active', p === btn)
    if (($('#search-query')?.value ?? '').trim().length >= 2) doSearch()
  })

  // Phase 15h — Caps-screen actions.
  $('#caps-back-btn')?.addEventListener('click', () => navigate('hub'))
  $('#caps-save-btn')?.addEventListener('click', saveCapsConfig)
  $('#display-texts-save-btn')?.addEventListener('click', saveDisplayTexts)
  $('#caps-extend-btn')?.addEventListener('click', capsExtend)
  $('#caps-release-btn')?.addEventListener('click', capsRelease)
  $('#caps-quietnow-btn')?.addEventListener('click', capsQuietNow)

  // Phase 15e — Library wiring.
  $('#library-add-btn')?.addEventListener('click', openLibraryAddSheet)
  $('#library-add-close')?.addEventListener('click', closeLibraryAddSheet)
  $('#library-add-cancel')?.addEventListener('click', closeLibraryAddSheet)
  $('#library-add-submit')?.addEventListener('click', submitLibraryAdd)
  $('#library-add-type')?.addEventListener('change', onAddTypeChange)
  $('#library-edit-close')?.addEventListener('click', closeLibraryEditSheet)
  $('#library-search')?.addEventListener('input', (e) => {
    libraryState.search = e.target.value
    renderLibrary()
  })
  // Filter pills — delegate per-group.
  $('#library-category-filter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill')
    if (!btn) return
    for (const p of $$('#library-category-filter .pill')) p.classList.toggle('active', p === btn)
    libraryState.categoryFilter = btn.dataset.cat
    renderLibrary()
  })
  $('#library-source-filter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill')
    if (!btn) return
    for (const p of $$('#library-source-filter .pill')) p.classList.toggle('active', p === btn)
    libraryState.sourceFilter = btn.dataset.src
    renderLibrary()
  })
  // Click on backdrop (outside sheet) closes both overlays.
  $('#library-edit-backdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLibraryEditSheet()
  })
  $('#library-add-backdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLibraryAddSheet()
  })

  for (const btn of $$('[data-go-step]')) {
    btn.addEventListener('click', () => setWizardStep(Number(btn.dataset.goStep)))
  }
  $('#wizard-save-client-id').addEventListener('click', wizardSaveClientId)
  $('#wizard-connect-btn').addEventListener('click', wizardConnectSpotify)
  $('#wizard-finish-btn').addEventListener('click', wizardFinish)
  $('#wizard-box-name').addEventListener('input', updateWizardExamples)

  // Copy buttons
  for (const btn of $$('.copy-btn')) {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copyText ?? $(`#${btn.dataset.copy}`)?.textContent ?? ''
      try {
        await navigator.clipboard.writeText(text)
        const old = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => { btn.textContent = old }, 1200)
      } catch {
        toast('info', t('common.copyManually', { text }))
      }
    })
  }
}

/* Pausiert die beiden Self-Scheduling-Poller (Hub-Wiedergabe alle 5s,
 * Spielzeit-Status alle 5-30s), solange die Seite nicht sichtbar ist.
 * Ohne das pollt ein vergessener Handy-Tab die Box endlos weiter -- auch
 * bei ausgeschaltetem Display, und die Box läuft auf Akku. Beim
 * Zurückkehren wird sofort einmal aktualisiert, damit nicht bis zum
 * nächsten Intervall veraltete Werte stehen. */
function pauseSectionPolling() {
  if (playbackPollHandle) {
    clearTimeout(playbackPollHandle)
    playbackPollHandle = null
  }
  if (sleepTimerTickHandle) {
    clearTimeout(sleepTimerTickHandle)
    sleepTimerTickHandle = null
  }
}

function resumeSectionPolling() {
  // Nur wieder anwerfen, wenn der Bootstrap durch ist (state.csrf gesetzt) --
  // sonst laufen die Poller gegen eine noch nicht authentifizierte Session.
  if (!state.csrf) return
  if (state.currentSection === 'hub') loadPlayback()
  else if (state.currentSection === 'caps') loadSleepTimer()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseSectionPolling()
  else resumeSectionPolling()
})

/* ---------- Sprache (i18n) ---------- */

/** Show the stored preference (auto / de / en) in every language selector. */
function syncLangSelects() {
  for (const sel of $$('.lang-select')) sel.value = getLangPref()
}

/** Fill all static texts (data-i18n*) in the active language. Runs before
 *  anything else renders, so dynamic texts set later are not overwritten. */
function initLanguage() {
  applyI18n(document)
  syncLangSelects()
}

/** Language switch: re-apply the static texts, then re-run the active
 *  section's loader so the dynamically rendered texts follow as well. */
function onLanguageChange(e) {
  setLangPref(e.target.value)
  applyI18n(document)
  syncLangSelects()
  if (state.csrf !== null) onRoute()
}

document.addEventListener('DOMContentLoaded', () => {
  initLanguage()
  wire()
  // Phase 15a: hash-based routing. hashchange re-routes (browser back/
  // forward + Telegram-bot deep-links). onRoute is gated by state.csrf
  // being non-null, so the listener firing before bootstrap finishes
  // is a no-op.
  window.addEventListener('hashchange', onRoute)
  bootstrap()
})
