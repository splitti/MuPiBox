// Builds the MuPiBox manual (served at /manual/ on the box) into ../deploy/manual, in every language.
//   content/<lang>/**/*.md   the pages written by hand; content/<lang>/<chapter>/index.md is the chapter's start page.
//                            A page that is missing in a language shows the German one with a note.
//   toc.json                 the order of chapters and pages (the sidebar, the previous/next links); titles per language
//   strings.json             the words of the page itself (search, buttons, table headers of the reference ...)
//   img/<lang>/              pictures per language (screenshots of the display in that language); img/ holds shared ones
//   reference                one page per settings page of the app, built from ../mupi-app/schema.json (labels, help
//                            texts and values come from the very same file the app shows; the English texts from the
//                            app's own translation i18n/en.json), so the manual cannot drift from the app
// Layout of the result: index.html (picks the language), versions.json, <lang>/..., static/, img/
// No dependencies: a small Markdown converter lives below. Run: node src/manual/build.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { icon } from '../mupi-app/icons.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../../deploy/manual'))
const schema = JSON.parse(fs.readFileSync(path.join(here, '../mupi-app/schema.json'), 'utf8'))
const strings = JSON.parse(fs.readFileSync(path.join(here, 'strings.json'), 'utf8'))
const enApp = JSON.parse(fs.readFileSync(path.join(here, '../mupi-app/i18n/en.json'), 'utf8'))
const LANGS = Object.keys(strings) // the first one is the source language
const SOURCE = LANGS[0]

// The version this manual describes: the newest heading of news.txt ("DEV 5.0.7 - changes compared to ...")
function manualVersion() {
  try {
    const news = fs.readFileSync(path.join(here, '../../../../news.txt'), 'utf8')
    const m = news.match(/<h3>\s*(?:(DEV|BETA|STABLE)\s+)?(\d+(?:\.\d+)+)/i)
    if (m) return { id: m[2], channel: (m[1] ?? '').toLowerCase() }
  } catch {
    // no news.txt: the manual then has no version number
  }
  return { id: 'latest', channel: '' }
}
const VERSION = manualVersion()
const VERSION_LABEL = VERSION.channel ? `${VERSION.id} (${VERSION.channel})` : VERSION.id

// ---------------------------------------------------------------- Markdown

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Inline: `code`, **bold**, *italic*, [text](link), ![alt](image), [[Key]] (a key cap)
function inline(text, ctx) {
  const codes = []
  let s = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${esc(c)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = esc(s)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => `<img src="${ctx.asset(src)}" alt="${alt}" loading="lazy">`)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => `<a href="${ctx.link(href)}"${/^https?:/.test(href) ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`)
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)])
}

const ADMONITIONS = { NOTE: 'note', TIP: 'tip', WARNING: 'warning', IMPORTANT: 'important' }

// Block level. Returns { html, headings: [{level, id, text}], text } (text = plain text for the search)
function markdown(src, ctx) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const headings = []
  const plain = []
  let i = 0

  const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/

  function parseList(indent) {
    const first = lines[i].match(listItem)
    const ordered = /\d/.test(first[2])
    let html = ordered ? '<ol>' : '<ul>'
    while (i < lines.length) {
      const m = lines[i].match(listItem)
      if (!m || m[1].length < indent) break
      if (m[1].length > indent) {
        // nested list inside the previous item
        html = html.replace(/<\/li>$/, '') + parseList(m[1].length) + '</li>'
        continue
      }
      let body = m[3]
      i++
      // continuation lines (indented, not a new item)
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !listItem.test(lines[i])) {
        body += ` ${lines[i].trim()}`
        i++
      }
      plain.push(body)
      html += `<li>${inline(body, ctx)}</li>`
    }
    return html + (ordered ? '</ol>' : '</ul>')
  }

  let html = ''
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    // fenced code
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const buf = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++])
      i++
      html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`
      plain.push(buf.join(' '))
      continue
    }
    // heading
    const h = line.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/)
    if (h) {
      const level = h[1].length
      const text = h[2]
      const id = slugify(text.replace(/`/g, '')) || `section-${headings.length + 1}`
      headings.push({ level, id, text: text.replace(/`/g, '') })
      plain.push(text)
      html += level === 1 ? `<h1 id="${id}">${inline(text, ctx)}</h1>` : `<h${level} id="${id}">${inline(text, ctx)}<a class="anchor" href="#${id}" aria-label="#">#</a></h${level}>`
      i++
      continue
    }
    // table
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(line)
      i += 2
      let rows = ''
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows += `<tr>${cells(lines[i]).map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`
        plain.push(cells(lines[i]).join(' '))
        i++
      }
      html += `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
      continue
    }
    // blockquote / admonition
    if (line.startsWith('>')) {
      const buf = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      const kind = buf[0].match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*$/)
      if (kind) {
        const cls = ADMONITIONS[kind[1]]
        const inner = markdown(buf.slice(1).join('\n'), ctx)
        plain.push(inner.text)
        html += `<aside class="admonition ${cls}"><p class="admonition-title">${esc(ctx.t(`admonition.${cls}`))}</p>${inner.html}</aside>`
      } else {
        const inner = markdown(buf.join('\n'), ctx)
        plain.push(inner.text)
        html += `<blockquote>${inner.html}</blockquote>`
      }
      continue
    }
    // list
    if (listItem.test(line)) {
      html += parseList(line.match(listItem)[1].length)
      continue
    }
    // figure: a picture alone on its line, its alt text is the caption
    const fig = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/)
    if (fig) {
      html += `<figure><img src="${ctx.asset(fig[2])}" alt="${esc(fig[1])}" loading="lazy">${fig[1] ? `<figcaption>${inline(fig[1], ctx)}</figcaption>` : ''}</figure>`
      i++
      continue
    }
    // horizontal rule
    if (/^---+\s*$/.test(line)) {
      html += '<hr>'
      i++
      continue
    }
    // paragraph
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i]) && !/^---+\s*$/.test(lines[i])) {
      if (lines[i].includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) break
      buf.push(lines[i++].trim())
    }
    if (!buf.length) {
      i++
      continue
    }
    plain.push(buf.join(' '))
    html += `<p>${inline(buf.join(' '), ctx)}</p>`
  }
  return { html, headings, text: plain.join(' ').replace(/\s+/g, ' ').trim() }
}

// ---------------------------------------------------------------- reference pages built from the schema

const mdEscape = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const num = (v, lang) => (typeof v === 'number' && lang === 'de' ? String(v).replace('.', ',') : String(v))
const groups = schema.settingsGroups
const missingTranslations = new Set()

// the app's own translation (German text -> English text); what it does not know stays as it is (theme names ...)
function tr(text, lang) {
  if (lang === SOURCE || typeof text !== 'string' || !text.trim()) return text
  if (text in enApp) return enApp[text]
  missingTranslations.add(text)
  return text
}

function describeItem(it, lang) {
  const t = (key) => strings[lang][key]
  switch (it.type) {
    case 'toggle':
      return { kind: t('ref.switch'), values: t('ref.onoff') }
    case 'slider':
      return { kind: t('ref.slider'), values: `${num(it.min, lang)} ${t('ref.to')} ${num(it.max, lang)}${it.unit ?? ''}${it.step ? `, ${t('ref.steps')} ${num(it.step, lang)}` : ''}` }
    case 'select':
    case 'seg': {
      const options = it.options ?? []
      return { kind: t('ref.choice'), values: options.length > 40 ? t('ref.manyChoices').replace('{n}', String(options.length)) : options.map((o) => tr(o, lang)).join(' · ') }
    }
    case 'text':
      return { kind: it.kind === 'number' ? t('ref.number') : t('ref.input'), values: '' }
    case 'file':
      return { kind: t('ref.file'), values: tr(it.buttons ?? '', lang) }
    default:
      return null
  }
}

const groupTitle = (id, lang) => tr(groups.find((g) => g.id === id)?.title ?? '', lang)

function referencePage(page, lang) {
  const t = (key) => strings[lang][key]
  let md = `# ${tr(page.title, lang)}\n\n`
  if (page.description) md += `${tr(page.description, lang)}.\n\n`
  md += `> [!NOTE]\n> ${t('ref.inTheApp')}: **${t('ref.settings')} › ${groupTitle(page.parent, lang)} › ${tr(page.title, lang)}**. ${t('ref.generated')}\n\n`
  for (const sec of page.sections) {
    if (sec.title) md += `## ${tr(sec.title, lang)}\n\n`
    if (sec.help) md += `${tr(sec.help, lang)}\n\n`
    const rows = []
    const loose = []
    for (const it of sec.items) {
      const d = describeItem(it, lang)
      if (d && it.label) rows.push(`| **${mdEscape(tr(it.label, lang))}** | ${d.kind}${d.values ? `: ${mdEscape(d.values)}` : ''} | ${mdEscape(tr(it.help, lang))} |`)
      else if (it.type === 'note' && it.text && !/\d/.test(it.text)) loose.push(`${tr(it.text, lang)}\n`)
      else if (it.type === 'warn' && it.text) loose.push(`> [!WARNING]\n> ${tr(it.text, lang)}\n`)
      else if (it.type === 'buttons') loose.push(`${t('ref.buttons')}: ${it.buttons.map((b) => `**${tr(b[0], lang)}**`).join(', ')}\n`)
      else if (it.type === 'nav' && it.label) loose.push(`${t('ref.further')}: **${tr(it.label, lang)}**${it.subtitle ? ` (${tr(it.subtitle, lang)})` : ''}\n`)
    }
    if (rows.length) md += `| ${t('ref.colSetting')} | ${t('ref.colKind')} | ${t('ref.colMeaning')} |\n| --- | --- | --- |\n${rows.join('\n')}\n\n`
    if (loose.length) md += `${loose.join('\n')}\n`
  }
  return md
}

// ---------------------------------------------------------------- the table of contents (one tree per language)

// the symbols of the chapters in the side bar - the app's own (icons.js)
const CHAPTER_ICONS = {
  'erste-schritte': 'home',
  bedienung: 'touch',
  inhalte: 'music',
  spielzeit: 'time',
  hardware: 'chip',
  netzwerk: 'wifi',
  wartung: 'gear',
  fehlerbehebung: 'bulb',
  referenz: 'sliders',
  anhang: 'doc',
}

function buildToc(lang) {
  const toc = JSON.parse(fs.readFileSync(path.join(here, 'toc.json'), 'utf8'))
  const title = (n) => (typeof n.title === 'string' ? n.title : (n.title[lang] ?? n.title[SOURCE]))
  const prepare = (nodes) =>
    nodes.map((n) => {
      const node = { id: n.id, title: title(n), icon: n.icon ?? CHAPTER_ICONS[n.id] }
      if (n.children) node.children = prepare(n.children)
      return node
    })
  const tree = prepare(toc)

  // Reference: the app's settings groups, each with its pages (those that have settings of their own)
  const reference = tree.find((c) => c.id === 'referenz')
  if (reference) {
    reference.children = []
    for (const g of groups) {
      const pages = schema.pages.filter((p) => p.area === 'einstellungen' && p.parent === g.id && p.sections.some((s) => s.items.some((it) => describeItem(it, lang) || it.type === 'note' || it.type === 'warn' || it.type === 'buttons')))
      if (!pages.length) continue
      const gTitle = tr(g.title, lang)
      reference.children.push({
        id: slugify(g.title),
        title: gTitle,
        icon: g.icon,
        generated: `# ${gTitle}\n\n${tr(g.description, lang)}.\n\n${strings[lang]['ref.groupIntro']}\n\n${pages.map((p) => `- [${tr(p.title, lang)}](${p.slug}.md)${p.description ? ` – ${tr(p.description, lang)}` : ''}`).join('\n')}\n`,
        children: pages.map((p) => ({ id: p.slug, title: tr(p.title, lang), generated: referencePage(p, lang) })),
      })
    }
  }
  return tree
}

// ---------------------------------------------------------------- build

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const problems = []

function buildLanguage(lang) {
  const S = strings[lang]
  const t = (key) => S[key] ?? strings[SOURCE][key] ?? key
  const contentDir = path.join(here, 'content', lang)
  const sourceDir = path.join(here, 'content', SOURCE)
  const toc = buildToc(lang)

  // flat list of all pages in reading order, with their output paths
  const flat = []
  const walk = (nodes, trail) => {
    for (const n of nodes) {
      const dir = [...trail, n.id]
      const hasKids = Array.isArray(n.children) && n.children.length
      // (the toc's own objects get the paths, so the sidebar and the page list share them)
      n.trail = trail
      n.dir = dir
      n.out = hasKids ? `${dir.join('/')}/index.html` : `${dir.join('/')}.html`
      n.rel = hasKids ? `${dir.join('/')}/index.md` : `${dir.join('/')}.md`
      flat.push(n)
      if (hasKids) walk(n.children, dir)
    }
  }
  walk(toc, [])
  const byDir = new Map(flat.map((n) => [n.dir.join('/'), n]))
  const home = { id: '', title: t('home'), dir: [], trail: [], out: 'index.html', rel: 'index.md' }

  // from one page (path inside the language folder) to another one or to a file at the root of the manual
  const relTo = (from, to) => `${'../'.repeat(from.split('/').length - 1)}${to}`
  const toRoot = (from, to) => `${'../'.repeat(from.split('/').length)}${to}`

  function navTree(current) {
    const open = new Set()
    for (let n = current; n?.dir.length; n = n.trail.length ? byDir.get(n.trail.join('/')) : null) open.add(n.dir.join('/'))
    const render = (nodes, depth) =>
      `<ul class="d${depth}">${nodes
        .map((node) => {
          const here = node === current
          const sym = depth === 0 ? `<span class="tile">${icon(node.icon ?? 'doc', 18)}</span>` : ''
          const link = `<a class="side-link${depth ? ' sub' : ''}" href="${relTo(current.out, node.out)}"${here ? ' aria-current="page"' : ''}>${sym}<span>${esc(node.title)}</span></a>`
          if (!node.children?.length) return `<li>${link}</li>`
          const isOpen = open.has(node.dir.join('/'))
          return `<li class="has-children"><details${isOpen ? ' open' : ''}><summary>${link}<span class="chev">${icon('chevron', 16)}</span></summary>${render(node.children, depth + 1)}</details></li>`
        })
        .join('')}</ul>`
    return render(toc, 0)
  }

  const i18nForScript = JSON.stringify({ none: t('searchNone'), root: t('crumbRoot') }).replace(/</g, '\\u003c')

  function page(node, bodyHtml, headings, index) {
    const crumbChain = []
    for (let n = node; n?.dir.length; n = n.trail.length ? byDir.get(n.trail.join('/')) : null) crumbChain.unshift(n)
    const crumbs = [`<a href="${relTo(node.out, 'index.html')}">${esc(t('crumbRoot'))}</a>`, ...crumbChain.slice(0, -1).map((c) => `<a href="${relTo(node.out, c.out)}">${esc(c.title)}</a>`), `<span>${esc(node.title)}</span>`].join('<span class="sep">›</span>')
    const i = flat.indexOf(node)
    const prev = i > 0 ? flat[i - 1] : null
    const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null
    const onPage = headings.filter((h) => h.level >= 2 && h.level <= 3)
    const R = (to) => relTo(node.out, to) // inside this language
    const ROOT = (to) => toRoot(node.out, to) // at the root of the manual
    const langOptions = LANGS.map((l) => `<option value="${ROOT(`${l}/${node.out}`)}" lang="${l}"${l === lang ? ' selected' : ''}>${esc(strings[l].languageName)}</option>`).join('')
    const versionOptions = `<option value="${ROOT(`${lang}/${node.out}`)}" selected>${esc(VERSION_LABEL)}</option>`
    const chapter = crumbChain[0]
    const barTitle = chapter && chapter !== node ? chapter.title : t('manualName')
    const mupi = (w) => `<img class="mupi-d" src="${ROOT('static/mupi.svg')}" alt="" width="${w}" height="${w}"><img class="mupi-l" src="${ROOT('static/mupi-hell.svg')}" alt="" width="${w}" height="${w}">`
    const navRow = (n, cls, label) =>
      `<a class="card navrow ${cls}" href="${R(n.out)}">${cls === 'prev' ? `<span class="chev back">${icon('back', 18)}</span>` : ''}<span class="lbl"><small>${esc(label)}</small><b>${esc(n.title)}</b></span>${cls === 'next' ? `<span class="chev">${icon('chevron', 18)}</span>` : ''}</a>`
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0F1522">
<title>${esc(node.title)}${node.out === 'index.html' ? '' : ` – ${esc(t('manualName'))}`}</title>
<meta name="description" content="${esc(index.text.slice(0, 160))}">
<link rel="icon" href="${ROOT('static/mupi.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${ROOT('static/fonts.css')}">
<link rel="stylesheet" href="${ROOT('static/tokens.css')}">
<link rel="stylesheet" href="${ROOT('static/manual.css')}">
<script>try{var t=localStorage.getItem('mupi-theme');if(t==='light'||t==='dark'||t==='auto')document.documentElement.setAttribute('data-theme',t);if(t==='light'||(t==='auto'&&matchMedia('(prefers-color-scheme: light)').matches))document.querySelector('meta[name="theme-color"]').content='#F3F6F9'}catch(e){}</script>
</head>
<body data-root="${ROOT('')}" data-lang="${lang}" data-page="${esc(node.out)}">
<div class="shell">
<nav class="sidebar" aria-label="${esc(t('toc'))}">
  <a class="brand" href="${R('index.html')}"><span class="brand-dot">${mupi(34)}</span><span>${esc(t('manualName'))}</span></a>
  ${navTree(node)}
</nav>
<div class="main">
<header class="topbar">
  <button class="icon-btn menu" type="button" aria-label="${esc(t('menu'))}" aria-expanded="false">${icon('text')}</button>
  <a class="brand-dot" href="${R('index.html')}" aria-label="${esc(t('home'))}">${mupi(32)}</a>
  <div class="title">${esc(barTitle)}</div>
  <form class="search" role="search" onsubmit="return false">${icon('search')}<input class="input" type="search" id="q" placeholder="${esc(t('search'))}" autocomplete="off" aria-label="${esc(t('searchLabel'))}"><div id="results" class="card" hidden></div></form>
  <button class="icon-btn soft search-btn" type="button" aria-label="${esc(t('searchLabel'))}">${icon('search')}</button>
  <label class="lang-btn pick pick-version" hidden>${icon('hist', 20)}<span>${esc(VERSION.id)}</span><select id="version" aria-label="${esc(t('version'))}">${versionOptions}</select></label>
  <label class="lang-btn pick">${icon('globe', 20)}<span translate="no">${esc(lang.toUpperCase())}</span><select id="lang" aria-label="${esc(t('language'))}">${langOptions}</select></label>
  <button class="icon-btn soft theme" type="button" aria-label="${esc(t('theme'))}"><span class="i-sun">${icon('sun')}</span><span class="i-moon">${icon('moon')}</span></button>
  <a class="icon-btn soft toapp" href="/app/" aria-label="${esc(t('toApp'))}" title="${esc(t('toApp'))}">${icon('ext')}</a>
</header>
<div class="page">
<main class="doc">
<div class="crumbs">${crumbs}</div>
<article class="card">${bodyHtml}</article>
<div class="pager">${prev ? navRow(prev, 'prev', t('prev')) : '<span></span>'}${next ? navRow(next, 'next', t('next')) : '<span></span>'}</div>
<footer>${t('footer').replace('{home}', R('index.html'))}</footer>
</main>
<aside class="toc" aria-label="${esc(t('onThisPage'))}">${onPage.length ? `<p>${esc(t('onThisPage'))}</p><ul>${onPage.map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul>` : ''}</aside>
</div>
</div>
</div>
<div class="scrim"></div>
<script id="i18n" type="application/json">${i18nForScript}</script>
<script src="${ROOT('static/manual.js')}" defer></script>
</body>
</html>
`
  }

  const searchIndex = []
  const pages = [home, ...flat]
  for (const node of pages) {
    let src = node.generated
    let fromSource = false
    if (src === undefined) {
      const own = path.join(contentDir, node.rel)
      if (fs.existsSync(own)) src = fs.readFileSync(own, 'utf8')
      else if (lang !== SOURCE && fs.existsSync(path.join(sourceDir, node.rel))) {
        // not translated yet: the source language's page, with a note
        src = fs.readFileSync(path.join(sourceDir, node.rel), 'utf8')
        fromSource = true
        problems.push(`${lang}: not translated: ${node.rel}`)
      } else {
        problems.push(`${lang}: missing: ${node.rel}`)
        src = `# ${node.title}\n`
      }
    }
    const ctx = {
      t,
      link: (href) => {
        if (/^(https?:|mailto:|#|\/)/.test(href)) return href
        const [file, hash] = href.split('#')
        if (!file.endsWith('.md')) return href
        // relative to the source page: resolve against the page's own directory, then point at the output file
        const hasKids = Array.isArray(node.children) && node.children.length
        const base = hasKids ? path.join(contentDir, ...node.dir) : path.join(contentDir, ...node.dir.slice(0, -1))
        const key = path.relative(contentDir, path.resolve(base, file)).replace(/\\/g, '/').replace(/\.md$/, '').replace(/\/index$/, '')
        const target = key === 'index' || key === '' ? home : byDir.get(key)
        if (!target) {
          problems.push(`${lang}: link ${href} in ${node.rel}`)
          return '#'
        }
        return relTo(node.out, target.out) + (hash ? `#${hash}` : '')
      },
      asset: (file) => {
        if (/^(https?:|\/)/.test(file)) return file
        const name = path.basename(file)
        // a picture of this language first, then the shared ones
        if (fs.existsSync(path.join(here, 'img', lang, name))) return toRoot(node.out, `img/${lang}/${name}`)
        if (fs.existsSync(path.join(here, 'img', name))) return toRoot(node.out, `img/${name}`)
        // a picture only another language has (a screenshot of its display): better than none
        for (const other of LANGS) if (fs.existsSync(path.join(here, 'img', other, name))) return toRoot(node.out, `img/${other}/${name}`)
        problems.push(`${lang}: picture ${name} in ${node.rel}`)
        return toRoot(node.out, `img/${name}`)
      },
    }
    if (fromSource) src = src.replace(/^(# .*\n)/, `$1\n> [!NOTE]\n> ${t('notTranslated')}\n`)
    const { html, headings, text } = markdown(src, ctx)
    const title = headings[0]?.level === 1 ? headings[0].text : node.title
    const target = path.join(outDir, lang, node.out)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, page(node, html, headings.slice(1), { text }))
    searchIndex.push({
      u: node.out,
      t: title,
      c: node.trail.map((_id, k) => byDir.get(node.trail.slice(0, k + 1).join('/'))?.title).filter(Boolean).join(' › '),
      h: headings.slice(1).filter((h) => h.level <= 3).map((h) => ({ id: h.id, t: h.text })),
      x: text.slice(0, 6000),
    })
  }
  fs.writeFileSync(path.join(outDir, lang, 'search-index.json'), JSON.stringify(searchIndex))
  return pages.length
}

let total = 0
for (const lang of LANGS) total += buildLanguage(lang)

// the front door: the language of the app (its own choice, "mupi-lang" - the same box, the same browser), else the first
// of the browser's languages the manual has, else English. Nothing is remembered here: the language picker on a page
// only changes that page, the next visit finds the language anew.
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html>
<html lang="${SOURCE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MuPiBox</title>
<script>
(function () {
  var langs = ${JSON.stringify(LANGS)}, lang = null;
  var pick = function (code) { code = String(code || '').toLowerCase().slice(0, 2); return langs.indexOf(code) >= 0 ? code : null; };
  try { lang = pick(localStorage.getItem('mupi-lang')); } catch (e) {}
  if (!lang) {
    var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < wanted.length && !lang; i++) lang = pick(wanted[i]);
  }
  location.replace((lang || (langs.indexOf('en') >= 0 ? 'en' : langs[0])) + '/index.html' + location.hash);
})();
</script></head>
<body>${LANGS.map((l) => `<p><a href="${l}/index.html">${esc(strings[l].languageName)}</a></p>`).join('')}</body></html>
`,
)

// the versions of the manual that this box offers; each entry is a folder next to the language folders
fs.writeFileSync(path.join(outDir, 'versions.json'), JSON.stringify({ current: VERSION.id, versions: [{ id: VERSION.id, label: VERSION_LABEL, path: '.' }], languages: LANGS.map((l) => ({ id: l, name: strings[l].languageName })) }))

// static files: styles, script, logo, fonts, pictures
fs.cpSync(path.join(here, 'static'), path.join(outDir, 'static'), { recursive: true })
const app = path.join(here, '../mupi-app')
// (the app's very files - colours, light and dark, fonts and the MuPi: the manual looks like the app and follows it)
for (const f of ['mupi.svg', 'mupi-hell.svg', 'tokens.css', 'fonts.css']) fs.copyFileSync(path.join(app, f), path.join(outDir, 'static', f))
fs.cpSync(path.join(app, 'fonts'), path.join(outDir, 'static/fonts'), { recursive: true })
if (fs.existsSync(path.join(here, 'img'))) fs.cpSync(path.join(here, 'img'), path.join(outDir, 'img'), { recursive: true })

console.log(`manual ${VERSION_LABEL}: ${total} pages in ${LANGS.length} languages -> ${outDir}`)
if (process.env.MANUAL_VERBOSE && missingTranslations.size) console.log(`manual: ${missingTranslations.size} app texts without English translation:\n  ${[...missingTranslations].slice(0, 40).join('\n  ')}`)
if (problems.length) {
  console.warn(`manual: ${problems.length} problem(s):\n  ${[...new Set(problems)].slice(0, 60).join('\n  ')}`)
  if (process.env.MANUAL_STRICT) process.exit(1)
}
