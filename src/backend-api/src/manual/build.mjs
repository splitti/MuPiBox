// Builds the MuPiBox manual (served at /manual/ on the box) into ../deploy/manual.
//   content/**/*.md   the pages written by hand (German); content/<chapter>/index.md is the chapter's start page
//   toc.json          the order of chapters and pages (the sidebar, the previous/next links)
//   reference         one page per settings page of the app, built from ../mupi-app/schema.json (labels, help texts,
//                     values and defaults come from the very same file the app shows, so the manual cannot drift)
// No dependencies: a small Markdown converter lives below. Run: node src/manual/build.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../../deploy/manual'))
const contentDir = path.join(here, 'content')
const schema = JSON.parse(fs.readFileSync(path.join(here, '../mupi-app/schema.json'), 'utf8'))

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

// Inline: `code`, **bold**, *italic*, [text](link), ![alt](image), [[Taste]] (a key cap)
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

const ADMONITIONS = { NOTE: ['note', 'Hinweis'], TIP: ['tip', 'Tipp'], WARNING: ['warning', 'Achtung'], IMPORTANT: ['important', 'Wichtig'] }

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
      const id = slugify(text.replace(/`/g, '')) || `abschnitt-${headings.length + 1}`
      headings.push({ level, id, text: text.replace(/`/g, '') })
      plain.push(text)
      html += level === 1 ? `<h1 id="${id}">${inline(text, ctx)}</h1>` : `<h${level} id="${id}">${inline(text, ctx)}<a class="anchor" href="#${id}" aria-label="Link zu diesem Abschnitt">#</a></h${level}>`
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
        const [cls, label] = ADMONITIONS[kind[1]]
        const inner = markdown(buf.slice(1).join('\n'), ctx)
        plain.push(inner.text)
        html += `<aside class="admonition ${cls}"><p class="admonition-title">${label}</p>${inner.html}</aside>`
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
const clock = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v))

function describeItem(it) {
  switch (it.type) {
    case 'toggle':
      return { kind: 'Schalter', values: 'an / aus', def: it.default === undefined ? '' : it.default ? 'an' : 'aus' }
    case 'slider':
      return { kind: 'Regler', values: `${clock(it.min)} bis ${clock(it.max)}${it.unit ?? ''}${it.step ? `, in Schritten von ${clock(it.step)}` : ''}`, def: it.default === undefined ? '' : `${clock(it.default)}${it.unit ?? ''}` }
    case 'select':
    case 'seg':
      return { kind: 'Auswahl', values: (it.options ?? []).length > 40 ? `aus ${it.options.length} Möglichkeiten (die Liste zeigt die App)` : (it.options ?? []).join(' · '), def: it.default ?? '' }
    case 'text':
      return { kind: it.kind === 'number' ? 'Zahl' : 'Eingabe', values: '', def: it.default ?? '' }
    case 'file':
      return { kind: 'Datei', values: it.buttons ?? '', def: '' }
    default:
      return null
  }
}

function referencePage(page) {
  let md = `# ${page.title}\n\n`
  if (page.description) md += `${page.description}.\n\n`
  md += `> [!NOTE]\n> In der App: **Einstellungen › ${groupTitle(page.parent)} › ${page.title}**. Diese Seite wird beim Bauen des Handbuchs aus der App selbst erzeugt.\n\n`
  for (const sec of page.sections) {
    if (sec.title) md += `## ${sec.title}\n\n`
    if (sec.help) md += `${sec.help}\n\n`
    const rows = []
    const loose = []
    for (const it of sec.items) {
      const d = describeItem(it)
      if (d && it.label) rows.push(`| **${mdEscape(it.label)}** | ${d.kind}${d.values ? `: ${mdEscape(d.values)}` : ''} | ${mdEscape(it.help)} |`)
      else if (it.type === 'note' && it.text && !/\d/.test(it.text)) loose.push(`${it.text}\n`)
      else if (it.type === 'warn' && it.text) loose.push(`> [!WARNING]\n> ${it.text}\n`)
      else if (it.type === 'buttons') loose.push(`Schaltflächen: ${it.buttons.map((b) => `**${b[0]}**`).join(', ')}\n`)
      else if (it.type === 'nav' && it.label) loose.push(`Weiterführend: **${it.label}**${it.subtitle ? ` (${it.subtitle})` : ''}\n`)
    }
    if (rows.length) md += `| Einstellung | Art und Werte | Bedeutung |\n| --- | --- | --- |\n${rows.join('\n')}\n\n`
    if (loose.length) md += `${loose.join('\n')}\n`
  }
  return md
}

const groups = schema.settingsGroups
const groupTitle = (id) => groups.find((g) => g.id === id)?.title ?? ''

// ---------------------------------------------------------------- the table of contents

const toc = JSON.parse(fs.readFileSync(path.join(here, 'toc.json'), 'utf8'))

// Reference: groups of the app's settings, each with its pages (those that have settings of their own)
const referenceChapter = toc.find((c) => c.id === 'referenz')
if (referenceChapter) {
  referenceChapter.children = []
  for (const g of groups) {
    const pages = schema.pages.filter((p) => p.area === 'einstellungen' && p.parent === g.id && p.sections.some((s) => s.items.some((it) => describeItem(it) || it.type === 'note' || it.type === 'warn' || it.type === 'buttons')))
    if (!pages.length) continue
    referenceChapter.children.push({
      id: slugify(g.title),
      title: g.title,
      generated: `# ${g.title}\n\n${g.description}.\n\nDie Einstellungen dieser Gruppe:\n\n${pages.map((p) => `- [${p.title}](${p.slug}.md)${p.description ? ` – ${p.description}` : ''}`).join('\n')}\n`,
      children: pages.map((p) => ({ id: p.slug, title: p.title, generated: referencePage(p) })),
    })
  }
}

if (process.env.MANUAL_DUMP) {
  // debugging aid: the generated reference as Markdown files
  const dump = (nodes) => {
    for (const n of nodes) {
      if (n.generated !== undefined) {
        fs.mkdirSync(process.env.MANUAL_DUMP, { recursive: true })
        fs.writeFileSync(path.join(process.env.MANUAL_DUMP, `${n.id}.md`), n.generated)
      }
      if (n.children) dump(n.children)
    }
  }
  dump(toc)
}

// flat list of all pages in reading order, with their output paths
const flat = []
function walk(nodes, trail) {
  for (const n of nodes) {
    const dir = [...trail, n.id]
    const hasKids = Array.isArray(n.children) && n.children.length
    // (the toc's own objects get the paths, so the sidebar and the page list share them)
    n.trail = trail
    n.dir = dir
    n.out = hasKids ? `${dir.join('/')}/index.html` : `${dir.join('/')}.html`
    n.src = hasKids ? path.join(contentDir, ...dir, 'index.md') : path.join(contentDir, `${dir.join('/')}.md`)
    flat.push(n)
    if (hasKids) walk(n.children, dir)
  }
}
walk(toc, [])
const byDir = new Map(flat.map((n) => [n.dir.join('/'), n]))
const home = { id: '', title: 'Startseite', dir: [], trail: [], out: 'index.html', src: path.join(contentDir, 'index.md') }

// ---------------------------------------------------------------- page template

const rel = (from, to) => {
  const up = from.split('/').length - 1
  return `${'../'.repeat(up)}${to}`
}

function navTree(current) {
  const open = new Set()
  for (let n = current; n?.dir.length; n = n.trail.length ? byDir.get(n.trail.join('/')) : null) open.add(n.dir.join('/'))
  const render = (nodes) =>
    `<ul>${nodes
      .map((node) => {
        const here = node === current
        const link = `<a href="${rel(current.out, node.out)}"${here ? ' aria-current="page"' : ''}>${esc(node.title)}</a>`
        if (!node.children?.length) return `<li>${link}</li>`
        const isOpen = open.has(node.dir.join('/'))
        return `<li class="has-children"><details${isOpen ? ' open' : ''}><summary>${link}</summary>${render(node.children)}</details></li>`
      })
      .join('')}</ul>`
  return render(toc)
}

function page(node, bodyHtml, headings, index) {
  const ctxCrumbs = []
  for (let n = node; n && n.dir.length; n = n.trail.length ? byDir.get(n.trail.join('/')) : null) ctxCrumbs.unshift(n)
  const crumbs = [`<a href="${rel(node.out, 'index.html')}">Handbuch</a>`, ...ctxCrumbs.slice(0, -1).map((c) => `<a href="${rel(node.out, c.out)}">${esc(c.title)}</a>`), `<span>${esc(node.title)}</span>`].join('<span class="sep">›</span>')
  const i = flat.indexOf(node)
  const prev = i > 0 ? flat[i - 1] : null
  const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null
  const onPage = headings.filter((h) => h.level >= 2 && h.level <= 3)
  const R = (to) => rel(node.out, to)
  return `<!doctype html>
<html lang="de" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(node.title)}${node.out === 'index.html' ? '' : ' – MuPiBox Handbuch'}</title>
<meta name="description" content="${esc(index.text.slice(0, 160))}">
<link rel="icon" href="${R('static/mupi.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${R('static/manual.css')}">
<script>try{var t=localStorage.getItem('manual-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body data-root="${R('')}">
<header class="top">
  <button class="menu" type="button" aria-label="Menü" aria-expanded="false">☰</button>
  <a class="brand" href="${R('index.html')}"><img src="${R('static/mupi.svg')}" alt="" width="28" height="28"><span>MuPiBox <b>Handbuch</b></span></a>
  <form class="search" role="search" onsubmit="return false"><input type="search" id="q" placeholder="Suchen  ( / )" autocomplete="off" aria-label="Im Handbuch suchen"><div id="results" hidden></div></form>
  <a class="toapp" href="/app/" title="Zur App">App</a>
  <button class="theme" type="button" aria-label="Hell/Dunkel umschalten">◐</button>
</header>
<div class="layout">
<nav class="side" aria-label="Inhaltsverzeichnis">${navTree(node)}</nav>
<main>
<div class="crumbs">${crumbs}</div>
<article>${bodyHtml}</article>
<div class="pager">${prev ? `<a class="prev" href="${R(prev.out)}"><small>Zurück</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${R(next.out)}"><small>Weiter</small>${esc(next.title)}</a>` : '<span></span>'}</div>
<footer>MuPiBox Handbuch · <a href="${R('index.html')}">Startseite</a> · Fehler gefunden? Unter <em>Einstellungen › System › Über die Box › Problem melden</em> melden.</footer>
</main>
<aside class="toc" aria-label="Auf dieser Seite">${onPage.length ? `<p>Auf dieser Seite</p><ul>${onPage.map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul>` : ''}</aside>
</div>
<script src="${R('static/manual.js')}" defer></script>
</body>
</html>
`
}

// ---------------------------------------------------------------- build

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const searchIndex = []
const missing = []
const pages = [home, ...flat]
for (const node of pages) {
  let src = node.generated
  if (src === undefined) {
    if (!fs.existsSync(node.src)) {
      missing.push(path.relative(here, node.src))
      src = `# ${node.title}\n\n> [!NOTE]\n> Diese Seite ist noch in Arbeit.\n`
    } else src = fs.readFileSync(node.src, 'utf8')
  }
  const ctx = {
    link: (href) => {
      if (/^(https?:|mailto:|#|\/)/.test(href)) return href
      const [file, hash] = href.split('#')
      if (!file.endsWith('.md')) return href
      // relative to the source page: resolve against the page's own directory, then point at the output file
      const hasKids = Array.isArray(node.children) && node.children.length
      const base = hasKids ? path.join(contentDir, ...node.dir) : path.join(contentDir, ...node.dir.slice(0, -1))
      const target = path.resolve(base, file)
      const key = path.relative(contentDir, target).replace(/\\/g, '/').replace(/\.md$/, '').replace(/\/index$/, '')
      const t = key === 'index' || key === '' ? home : byDir.get(key)
      if (!t) {
        missing.push(`link ${href} in ${node.title}`)
        return '#'
      }
      return rel(node.out, t.out) + (hash ? `#${hash}` : '')
    },
    asset: (src) => (/^(https?:|\/)/.test(src) ? src : rel(node.out, `img/${path.basename(src)}`)),
  }
  const { html, headings, text } = markdown(src, ctx)
  const title = headings[0]?.level === 1 ? headings[0].text : node.title
  const target = path.join(outDir, node.out)
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

fs.writeFileSync(path.join(outDir, 'search-index.json'), JSON.stringify(searchIndex))

// static files: styles, script, logo, fonts, pictures
const staticDir = path.join(here, 'static')
fs.cpSync(staticDir, path.join(outDir, 'static'), { recursive: true })
const app = path.join(here, '../mupi-app')
fs.copyFileSync(path.join(app, 'mupi.svg'), path.join(outDir, 'static/mupi.svg'))
fs.mkdirSync(path.join(outDir, 'static/fonts'), { recursive: true })
for (const f of ['nunito-sans-latin-wght-normal.woff2', 'nunito-sans-latin-ext-wght-normal.woff2', 'fredoka-latin-wght-normal.woff2', 'fredoka-latin-ext-wght-normal.woff2']) fs.copyFileSync(path.join(app, 'fonts', f), path.join(outDir, 'static/fonts', f))
const imgSrc = path.join(here, 'img')
if (fs.existsSync(imgSrc)) fs.cpSync(imgSrc, path.join(outDir, 'img'), { recursive: true })

console.log(`manual: ${pages.length} pages -> ${outDir}`)
if (missing.length) {
  console.warn(`manual: ${missing.length} problem(s):\n  ${[...new Set(missing)].join('\n  ')}`)
  if (process.env.MANUAL_STRICT) process.exit(1)
}
