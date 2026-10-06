// MuPiBox manual: menu on small screens, light/dark switch, "on this page" marker and the search.
// The search reads search-index.json once (title, chapter, headings, text of every page) and ranks in the browser.
;(() => {
  const root = document.body.dataset.root || ''
  const lang = document.body.dataset.lang || ''
  const page = document.body.dataset.page || 'index.html'
  let texts = { none: 'Nothing found.' }
  try {
    texts = JSON.parse(document.getElementById('i18n').textContent)
  } catch (_e) {
    // the English default stays
  }
  const html = document.documentElement
  const $ = (s) => document.querySelector(s)

  // menu (phone and tablet): the side bar as a drawer, closed by a tap beside it or Escape
  const menu = $('.menu')
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open)
    menu?.setAttribute('aria-expanded', String(open))
  }
  menu?.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')))
  $('.scrim')?.addEventListener('click', () => setNav(false))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setNav(false)
  })

  // language and version: the same page in another language / version (a version folder holds the languages)
  const go = (select) => select?.addEventListener('change', () => {
    if (select.value) location.href = select.value
  })
  go($('#lang'))
  go($('#version'))
  // other versions of the manual a box offers (versions.json lists them; the page itself only knows its own)
  fetch(`${root}versions.json`)
    .then((r) => r.json())
    .then((v) => {
      const select = $('#version')
      if (!select || !Array.isArray(v.versions) || v.versions.length < 2) return
      select.closest('.pick-version')?.removeAttribute('hidden')
      select.innerHTML = v.versions.map((x) => `<option value="${root}${x.path === '.' ? '' : `${x.path}/`}${lang}/${page}"${x.id === v.current ? ' selected' : ''}>${x.label}</option>`).join('')
    })
    .catch(() => {})

  // light / dark: the app's own choice (the same key) - switched here, the app has it too, and the other way round
  $('.theme')?.addEventListener('click', () => {
    const dark = getComputedStyle(html).colorScheme.startsWith('dark')
    const next = dark ? 'light' : 'dark'
    html.setAttribute('data-theme', next)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = next === 'light' ? '#F3F6F9' : '#0F1522'
    try {
      localStorage.setItem('mupi-theme', next)
    } catch (_e) {
      // storage may be blocked: the choice then lasts for this page only
    }
  })

  // the current entry of the side navigation stays in view
  $('.side [aria-current="page"]')?.scrollIntoView({ block: 'center' })

  // "on this page": mark the section being read
  const links = [...document.querySelectorAll('.toc a')]
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
    const seen = new Set()
    const mark = () => {
      const first = [...byId.keys()].find((id) => seen.has(id))
      for (const a of links) a.classList.toggle('on', a === byId.get(first))
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id))
        mark()
      },
      { rootMargin: '-60px 0px -65% 0px' },
    )
    for (const id of byId.keys()) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
  }

  // search
  const input = $('#q')
  const box = $('#results')
  if (!input || !box) return
  // (the phone: the field below the top bar, behind its button)
  $('.search-btn')?.addEventListener('click', () => {
    const open = document.body.classList.toggle('search-open')
    if (open) input.focus()
    else box.hidden = true
  })
  let index = null
  let loading = null
  let sel = -1
  const load = () => (loading ??= fetch(`${root}${lang}/search-index.json`).then((r) => r.json()).then((j) => (index = j)).catch(() => (index = [])))

  const fold = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  function search(q) {
    const words = fold(q).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const hits = []
    for (const p of index) {
      const title = fold(p.t)
      const text = fold(p.x)
      let score = 0
      let heading = null
      let ok = true
      for (const w of words) {
        let s = 0
        if (title.includes(w)) s += title.startsWith(w) ? 14 : 10
        for (const h of p.h) {
          if (fold(h.t).includes(w)) {
            s += 5
            heading ??= h
          }
        }
        if (fold(p.c).includes(w)) s += 2
        const at = text.indexOf(w)
        if (at >= 0) s += 1 + Math.min(2, text.split(w).length - 1) * 0.3
        if (!s) {
          ok = false
          break
        }
        score += s
      }
      if (ok) hits.push({ p, score, heading, at: text.indexOf(words[0]) })
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 12)
  }

  function render() {
    const q = input.value.trim()
    if (!q) {
      box.hidden = true
      return
    }
    if (!index) {
      load().then(render)
      return
    }
    const hits = search(q)
    sel = -1
    box.innerHTML = hits.length
      ? hits
          .map(({ p, heading, at }) => {
            const snippet = at >= 0 ? `${at > 40 ? '… ' : ''}${escHtml(p.x.slice(Math.max(0, at - 40), at + 110))} …` : ''
            return `<a href="${root}${lang}/${p.u}${heading ? `#${heading.id}` : ''}"><b>${escHtml(p.t)}</b><small>${escHtml(p.c)}${heading ? ` › ${escHtml(heading.t)}` : ''}</small><small>${snippet}</small></a>`
          })
          .join('')
      : `<p class="none">${escHtml(texts.none)}</p>`
    box.hidden = false
  }

  input.addEventListener('input', render)
  input.addEventListener('focus', () => {
    load()
    if (input.value.trim()) render()
  })
  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('a')]
    if (e.key === 'Escape') {
      box.hidden = true
      input.blur()
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
      e.preventDefault()
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items.forEach((a, i) => a.classList.toggle('sel', i === sel))
      items[sel].scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      const target = items[sel] ?? items[0]
      if (target) location.href = target.href
    }
  })
  document.addEventListener('click', (e) => {
    if (e.target.closest('.search') || e.target.closest('.search-btn')) return
    box.hidden = true
    document.body.classList.remove('search-open')
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault()
      document.body.classList.add('search-open')
      input.focus()
      input.select()
    }
  })
})()
