// Languages of the app: the languages of the box's display texts (frontend-box src/assets/i18n/display-texts.json).
//
// German is the source language: app.js and schema.json are written in German, and i18n/<lang>.json maps these texts to
// a language (keyed by the German text, as gettext does; scripts/dev/app-i18n/extract.cjs lists the texts and checks
// the files). The page is translated where it is drawn: an observer translates every text and visible attribute that
// comes into the document before the browser paints it (its callbacks run before the next frame). So the code keeps its
// texts, and the values it works with (data-v, keys, button labels) stay German.
//
// The language: the choice stored in this browser, else the browser's languages (navigator.languages), else English.
// A text missing in a language is shown in English.

export const LANGS = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  nb: 'Norsk',
  fi: 'Suomi',
  pl: 'Polski',
  pt: 'Português',
  tr: 'Türkçe',
  uk: 'Українська',
  ru: 'Русский',
  cs: 'Čeština',
  el: 'Ελληνικά',
}
const DEFAULT = 'en'
const STORAGE_KEY = 'mupi-lang'
// the browser names Norwegian no, nb or nn
const ALIASES = { no: 'nb', nn: 'nb' }

function readPref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && LANGS[v] ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** The first of the browser's languages the app has, else English */
export function detectBrowserLanguage() {
  let tags = []
  try {
    tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean)
  } catch {
    // no navigator
  }
  for (const tag of tags) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0]
    const code = ALIASES[primary] ?? primary
    if (LANGS[code]) return code
  }
  return DEFAULT
}

let pref = readPref()
let lang = pref === 'auto' ? detectBrowserLanguage() : pref

export const getLang = () => lang
export const getLangPref = () => pref
/** The short sign of the language shown (DE, EN, …; with "automatic" the one the browser gave) */
export const langBadge = () => lang.toUpperCase()

/**
 * Stores the choice ('auto' or a language) in this browser and loads the language. The app then draws itself again:
 * what is on the page now was translated from German and cannot be translated once more.
 */
export async function setLangPref(value) {
  pref = LANGS[value] ? value : 'auto'
  try {
    if (pref === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // private mode: the choice lasts for this page only
  }
  lang = pref === 'auto' ? detectBrowserLanguage() : pref
  await loadLanguage()
}

/** For toLocale*String and Intl: the browser's variant of the language if it has one (en-GB, pt-BR, …) */
export function localeTag() {
  try {
    for (const tag of navigator.languages ?? []) {
      const primary = String(tag).toLowerCase().split(/[-_]/)[0]
      if ((ALIASES[primary] ?? primary) === lang) return tag
    }
  } catch {
    // no navigator
  }
  return lang === 'en' ? 'en-GB' : lang
}

/* ---------- the texts ---------- */

let exact = new Map() // German text -> translation
let patterns = [] // texts with {} (values put in by the code): [regex, translation, literal length]
const SEPARATORS = /( · | – | — | › | \| |: )/
const JOINERS = / · | › | \| /

async function loadFile(code) {
  try {
    const r = await fetch(`i18n/${code}.json`, { cache: 'no-cache' })
    return r.ok ? await r.json() : {}
  } catch {
    return {}
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Loads the language (and English for what it lacks). German needs nothing. */
export async function loadLanguage() {
  document.documentElement.lang = lang
  const [own, en] = lang === 'de' ? [{}, {}] : await Promise.all([loadFile(lang), lang === DEFAULT ? {} : loadFile(DEFAULT)])
  const all = { ...en, ...own }
  exact = new Map()
  patterns = []
  for (const [src, dst] of Object.entries(all)) {
    if (typeof dst !== 'string' || !dst || src.startsWith('_')) continue
    add(src, dst)
    // a piece the code appends (" · über Mitternacht", " – das aktive Theme …"): also without its separator, as the
    // page is split at the separators when it has no text as a whole
    const lead = /^([·–—›|]) /.exec(src)
    if (lead) add(src.slice(2), dst.replace(/^[·–—›|] /, ''))
  }
  // the most specific first ("{} von {} Inhalten" before "{} von {}")
  patterns.sort((a, b) => b[2] - a[2])
}

function add(src, dst) {
  if (src.includes('{}')) {
    const parts = src.split('{}')
    // (a value may be empty: a part the code leaves out)
    const re = new RegExp(`^${parts.map(escapeRe).join('([\\s\\S]*?)')}$`)
    patterns.push([re, dst, parts.join('').length, parts[0], parts[parts.length - 1], JOINERS.test(src)])
  } else if (!exact.has(src)) exact.set(src, dst)
}

function fill(dst, values) {
  let i = 0
  // {} in order, or {0} {1} where a language needs another order; a value may be a text of its own (a part the code
  // puts in: " – das aktive Theme (…) nutzt sie nicht")
  return dst.replace(/\{(\d*)\}/g, (_, n) => {
    const v = values[n === '' ? i++ : Number(n)] ?? ''
    const core = v.trim()
    if (!core || !/\p{L}/u.test(core)) return v
    const t = translateText(core)
    return t === null ? v : v.replace(core, () => t)
  })
}

function translateCore(s) {
  const hit = exact.get(s)
  if (hit !== undefined) return hit
  for (const [re, dst, , head, tail, joins] of patterns) {
    if (!s.startsWith(head) || !s.endsWith(tail)) continue
    const m = re.exec(s)
    // (a short text must not swallow a longer one put together by the code: "{} von {}" is no match for
    // "216 von 216 Inhalten · letzter Sync 07:10")
    if (m && (joins || !m.slice(1).some((v) => JOINERS.test(v)))) return fill(dst, m.slice(1))
  }
  // a number and a word put together by the code ("0 Alben")
  const counted = /^(\d[\d.,]*)\s+(\S.*)$/.exec(s)
  if (counted) {
    const word = exact.get(counted[2])
    if (word !== undefined) return `${counted[1]} ${word}`
  }
  return null
}

// a text as a whole, else put together by the code: sentences one by one ("{} Das gilt erst nach einem Neustart"),
// the longest known start before a separator and the rest ("3 angezeigt · … · anderes NAS (…)"), the parts one by one
// ("Stabil · 4.2.4", "Netzwerk › WLAN"). null: nothing known.
function translateText(core) {
  const whole = translateCore(core)
  if (whole !== null) return whole
  const sentences = core.split(/(?<=[.!?…])\s+(?=\S)/)
  if (sentences.length > 1) {
    const done = sentences.map((x) => translateText(x))
    if (done.some((d) => d !== null)) return done.map((d, i) => d ?? sentences[i]).join(' ')
  }
  const parts = core.split(SEPARATORS)
  if (parts.length > 1) {
    for (let i = parts.length - 2; i >= 3; i -= 2) {
      const head = translateCore(parts.slice(0, i).join(''))
      if (head !== null) {
        const rest = parts.slice(i + 1).join('')
        return head + parts[i] + (translateText(rest) ?? rest)
      }
    }
    const done = parts.map((p, i) => (i % 2 ? null : translateCore(p)))
    if (done.some((d) => d !== null)) return done.map((d, i) => d ?? parts[i]).join('')
  }
  return null
}

/** The translation of a (German) text, or the text itself. Keeps its surrounding blanks. */
export function tr(text) {
  if (lang === 'de' || text == null) return text
  const s = String(text)
  const core = s.trim()
  if (!core || !/\p{L}/u.test(core)) return s
  const out = translateText(core)
  if (out === null || out === core) return s
  return s.replace(core, () => out)
}

/* ---------- the document ---------- */

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'label'] // (label: of an <optgroup>)
// no translation: code, logs, JSON, what people type (a textarea's text; a field's value is no text node), and
// everything marked translate="no"
const REJECT = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE', 'svg'])
const SKIP = new Set([...REJECT, 'TEXTAREA'])
const done = new WeakMap() // node -> the text it got from here (it is not translated twice)

function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
    if (SKIP.has(e.nodeName) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true
  }
  return false
}

function textNode(n) {
  if (done.get(n) === n.data || skipped(n.parentNode)) return
  const t = tr(n.data)
  if (t !== n.data) n.data = t
  done.set(n, n.data)
}

function attrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (!v) continue
    const key = `a:${a}`
    let seen = done.get(el)
    if (seen?.[key] === v) continue
    const t = tr(v)
    if (t !== v) el.setAttribute(a, t)
    seen = seen ?? {}
    seen[key] = t
    done.set(el, seen)
  }
}

function tree(root) {
  if (root.nodeType === 3) return textNode(root)
  if (root.nodeType !== 1 || skipped(root)) return
  attrs(root)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && (REJECT.has(n.nodeName) || n.getAttribute('translate') === 'no') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) textNode(n)
    else attrs(n)
  }
}

/** Translates the document now and everything that comes into it from now on */
export function watchDocument() {
  // (also in German: the language can change while the app is open)
  document.title = tr(document.title)
  tree(document.body)
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') for (const n of m.addedNodes) tree(n)
      else if (m.type === 'characterData') textNode(m.target)
      else if (m.type === 'attributes') attrs(m.target)
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}
