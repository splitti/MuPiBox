// Collects the texts of the app (/app: src/backend-api/src/mupi-app) that people see: the string and template
// literals of app.js and the texts of schema.json, as they end up in the page (HTML tags removed, entities decoded,
// ${...} as {}). German is the app's source language; the translations in mupi-app/i18n/<lang>.json are keyed by
// these texts (as gettext does).
//
//   node scripts/dev/app-i18n/extract.cjs            writes mupi-app/i18n/_source.json (the list of texts)
//   node scripts/dev/app-i18n/extract.cjs --check    lists what each language file is missing or has in excess

const fs = require('fs')
const path = require('path')
const ts = require(path.join(__dirname, '../../../node_modules/typescript'))

const APP = path.join(__dirname, '../../../src/backend-api/src/mupi-app')
const I18N = path.join(APP, 'i18n')

// text worth translating: has letters, is not code-like (ids, classes, selectors, urls, paths, css, keys)
function isText(s) {
  const t = s.trim()
  if (t.length < 2 || !/\p{L}/u.test(t)) return false
  if (/^\{\}$/.test(t)) return false
  if (/^(https?:|\/|\.\/|#|\.|\[|@|--)/.test(t)) return false
  if (/^[a-z][a-zA-Z0-9_]*$/.test(t)) return false // identifiers, keys, icon names, single lowercase words used as values
  if (/^[a-z0-9-]+(\s+[a-z0-9-]+)*$/.test(t) && /-/.test(t)) return false // class lists
  if (/^[\w-]+:[\w-]/.test(t) && !/\s/.test(t)) return false // go:x, toast:y actions
  if (/[{};]\s*$/.test(t) && /:\s*[^ ]/.test(t) && !/\p{Lu}/u.test(t[0])) return false // css
  if (/^(GET|POST|PUT|DELETE)\b/.test(t)) return false
  if (/^[\w-]+="/.test(t)) return false // attributes put into a tag (class="…" width="…")
  if (/^\([a-z-]+: /.test(t)) return false // media queries
  if (/^\d+ \d+px /.test(t)) return false // css fonts ("600 20px Fredoka")
  if (/^[a-z0-9#.-]+(,\s*[a-z0-9#.-]+)+$/.test(t)) return false // selectors ("h1,h2,b", "input, select")
  if (/^[a-z]+\[[\w-]+(=|\])/.test(t)) return false // attribute selectors ('meta[name="theme-color"]')
  if (!/\s/.test(t) && /^(\{\}|\?)/.test(t) && /[/?=]/.test(t)) return false // addresses put together (`${origin}/api/...`, `?x=${…}`)
  if (/^[A-Z0-9_]+$/.test(t) && t !== 'WLAN') return false // constants (WLAN is a word)
  if (/^[\w.-]+\.(json|js|css|svg|png|jpg|txt|sh|mp3|zip|log|html)$/i.test(t)) return false
  return true
}

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

// an expression glued to the text is markup (an icon: `${icon('sync')}Jetzt synchronisieren`), not a value
const unglue = (t) => t.replace(/^(\{\})+(?=[\p{L}(„"])/u, '').replace(/(?<=[\p{L}.!?)“"])(\{\})+$/u, '')

// the texts of a piece of HTML (or plain text): what stands between the tags, and the visible attributes
function textsOf(s, out) {
  if (!/[<>]/.test(s)) {
    const t = unglue(s.replace(/\s+/g, ' ').trim())
    if (isText(t)) out.add(decode(t))
    return
  }
  for (const m of s.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]*)"/g)) {
    const t = m[1].trim()
    if (isText(t)) out.add(decode(t))
  }
  const noTags = s.replace(/<[^>]*>/g, '\u0000')
  for (const part of noTags.split('\u0000')) {
    const t = unglue(part.replace(/\s+/g, ' ').trim())
    if (isText(t)) out.add(decode(t))
  }
}

function fromApp(out) {
  const file = path.join(APP, 'app.js')
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // not the keys of objects, imports, css.escape arguments etc.: property names are no texts
      if (!(node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node)) textsOf(node.text, out)
    } else if (ts.isTemplateExpression(node)) {
      // the literal parts with {} for each expression; the expressions are visited on their own
      let s = node.head.text
      for (const span of node.templateSpans) s += `{}${span.literal.text}`
      textsOf(s, out)
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
}

function fromSchema(out) {
  const schema = JSON.parse(fs.readFileSync(path.join(APP, 'schema.json'), 'utf8'))
  const skipKeys = new Set(['id', 'key', 'type', 'icon', 'target', 'parent', 'area', 'kind', 'unit', 'default', 'act', 'slug'])
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (!skipKeys.has(key)) textsOf(v, out)
    } else if (Array.isArray(v)) {
      // buttons: [label, kind, action]
      if (key === 'buttons') for (const b of v) Array.isArray(b) ? textsOf(String(b[0]), out) : walk(b, key)
      else for (const x of v) walk(x, key)
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(schema, '')
}

const out = new Set()
fromApp(out)
fromSchema(out)
// {}-only-glue and pure-number texts are no texts
// the names of the languages stay in their own language (LANGS in i18n.js)
const langBlock = /export const LANGS = \{([\s\S]*?)\}/.exec(fs.readFileSync(path.join(APP, 'i18n.js'), 'utf8'))[1]
const langNames = new Set([...langBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]))
// the names of the themes too: they come from the theme registry (German in German, English in every other language,
// see themeLabel in app.js) - but not the scenes of the boot screen that are called the same ("Weltraum")
const schemaJson = JSON.parse(fs.readFileSync(path.join(APP, 'schema.json'), 'utf8'))
const bootLabels = new Set((schemaJson.bootscreens ?? []).map((b) => b.label))
const themeNames = new Set([...(schemaJson.themes ?? []), ...Object.keys(schemaJson.themePreview ?? {})].filter((n) => !bootLabels.has(n)))
const texts = [...out]
  .filter((t) => !langNames.has(t) && !themeNames.has(t)).filter((t) => t.replace(/\{\}/g, '').replace(/[\s\d.,:%·–—()/+\-×]/g, '').length >= 2).sort((a, b) => a.localeCompare(b, 'de'))

if (process.argv.includes('--check')) {
  const set = new Set(texts)
  for (const f of fs.readdirSync(I18N).filter((n) => /^[a-z]{2}\.json$/.test(n))) {
    const tr = JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8'))
    const missing = texts.filter((t) => !(t in tr))
    const extra = Object.keys(tr).filter((k) => !set.has(k))
    const badPh = Object.entries(tr).filter(([k, v]) => (k.match(/\{\}/g) || []).length !== (String(v).match(/\{\d*\}/g) || []).length)
    console.log(`${f}: ${Object.keys(tr).length} texts, ${missing.length} missing, ${extra.length} not used, ${badPh.length} with wrong placeholders`)
    if (process.argv.includes('-v')) {
      for (const m of missing) console.log('  missing:', m)
      for (const [k, v] of badPh) console.log('  placeholders:', k, '=>', v)
    }
  }
} else {
  fs.mkdirSync(I18N, { recursive: true })
  fs.writeFileSync(path.join(I18N, '_source.json'), `${JSON.stringify(texts, null, 1)}\n`)
  console.log(`${texts.length} texts, ${texts.reduce((n, t) => n + t.length, 0)} characters`)
}
