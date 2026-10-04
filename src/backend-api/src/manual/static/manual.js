// MuPiBox manual: menu on small screens, light/dark switch, "on this page" marker and the search.
// The search reads search-index.json once (title, chapter, headings, text of every page) and ranks in the browser.
;(() => {
  const root = document.body.dataset.root || ''
  const html = document.documentElement
  const $ = (s) => document.querySelector(s)

  // menu (small screens)
  const menu = $('.menu')
  menu?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open')
    menu.setAttribute('aria-expanded', String(open))
  })
  document.querySelector('main')?.addEventListener('click', () => document.body.classList.remove('nav-open'))

  // light / dark / auto
  $('.theme')?.addEventListener('click', () => {
    const dark = getComputedStyle(html).colorScheme.startsWith('dark')
    const next = dark ? 'light' : 'dark'
    html.dataset.theme = next
    try {
      localStorage.setItem('manual-theme', next)
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
  let index = null
  let loading = null
  let sel = -1
  const load = () => (loading ??= fetch(`${root}search-index.json`).then((r) => r.json()).then((j) => (index = j)).catch(() => (index = [])))

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
            return `<a href="${root}${p.u}${heading ? `#${heading.id}` : ''}"><b>${escHtml(p.t)}</b><small>${escHtml(p.c)}${heading ? ` › ${escHtml(heading.t)}` : ''}</small><small>${snippet}</small></a>`
          })
          .join('')
      : '<p class="none">Nichts gefunden.</p>'
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
    if (!e.target.closest('.search')) box.hidden = true
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault()
      input.focus()
      input.select()
    }
  })
})()
