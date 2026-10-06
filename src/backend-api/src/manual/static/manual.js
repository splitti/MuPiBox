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

  // GPIO map (page anhang/gpio): a button per accessory marks the pins it uses on the pin header; a pin that two
  // accessories use (apart from a shared bus, like I2C) is shown as an overlap
  const gpio = $('.gpio-map')
  if (gpio) {
    let data = null
    try {
      data = JSON.parse(gpio.querySelector('.gpio-data').textContent)
    } catch (_e) {
      // without the data the table below the map still tells the pins
    }
    if (data) {
      const status = gpio.querySelector('.gpio-status')
      const pins = new Map([...gpio.querySelectorAll('.pin[data-g]')].map((el) => [Number(el.dataset.g), el]))
      const buttons = [...gpio.querySelectorAll('.gpio-btn')]
      const chosen = new Set()
      // where the choice is kept for the next visit (the page itself only knows this browser)
      const KEY = 'mupi-manual-gpio'
      try {
        for (const id of JSON.parse(localStorage.getItem(KEY) || '[]')) if (data.accessories.some((a) => a.id === id)) chosen.add(id)
      } catch (_e) {
        // storage blocked: nothing is remembered
      }
      const paint = () => {
        // gpio -> [{acc, pin}]; "free" pins (routed to a header, but free to use) never clash with anything
        const users = new Map()
        for (const acc of data.accessories.filter((a) => chosen.has(a.id))) {
          for (const pin of acc.pins) users.set(pin.g, [...(users.get(pin.g) ?? []), { acc, pin }])
        }
        const clashes = new Map() // "who clashes" -> [gpio]: one entry per pair of accessories
        for (const [g, el] of pins) {
          const list = users.get(g) ?? []
          const taken = list.filter((u) => !u.pin.free)
          const clash = taken.length > 1 && !(taken[0].pin.bus && taken.every((u) => u.pin.bus === taken[0].pin.bus))
          el.classList.toggle('used', taken.length > 0)
          el.classList.toggle('reserved', taken.length === 0 && list.length > 0)
          el.classList.toggle('clash', clash)
          el.style.setProperty('--c', (taken[0] ?? list[0])?.acc.color ?? 'transparent')
          const label = (taken.length ? taken : list).map((u) => u.acc.short ?? u.acc.name).join(' + ')
          el.querySelector('small').textContent = list.length ? label : ''
          el.title = list.length ? list.map((u) => `${u.acc.name}: ${u.pin.fn}`).join('\n') : data.text.free
          if (clash) clashes.set(label, [...(clashes.get(label) ?? []), g])
        }
        for (const b of buttons) b.setAttribute('aria-pressed', String(chosen.has(b.dataset.acc)))
        for (const row of gpio.querySelectorAll('.gpio-table tr[data-acc]')) row.classList.toggle('on', chosen.has(row.dataset.acc))
        gpio.classList.toggle('has-clash', clashes.size > 0)
        status.textContent = clashes.size ? `${data.text.conflict} ${[...clashes].map(([who, gs]) => `GPIO ${gs.sort((a, b) => a - b).join(', ')} (${who})`).join('; ')}` : chosen.size ? data.text.ok : data.text.none
      }
      for (const b of buttons) {
        b.addEventListener('click', () => {
          if (!chosen.delete(b.dataset.acc)) chosen.add(b.dataset.acc)
          try {
            localStorage.setItem(KEY, JSON.stringify([...chosen]))
          } catch (_e) {
            // storage blocked: the choice then lasts for this page only
          }
          paint()
        })
      }
      paint()
    }
  }

  // GPIO page: the table "Pins the box uses" shows only what this box uses right now (its pins, its switched-on
  // accessories); where the box cannot be asked (the manual somewhere else) it keeps listing everything
  const pinRows = [...document.querySelectorAll('tr[data-pin]')]
  if (pinRows.length) {
    fetch('/api/app/pins-in-use', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        const rows = {
          'rotary-a': { on: s.rotary },
          'rotary-b': { on: s.rotary },
          'rotary-button': { on: s.rotary },
          poweroff: { on: true, pin: s.shim.poweroffPin },
          trigger: { on: true, pin: s.shim.triggerPin },
          cut: { on: true, pin: s.shim.cutPin },
          led: { on: true, pin: s.shim.ledPin },
          fan: { on: s.fan.active, pin: s.fan.gpio },
        }
        for (const tr of pinRows) {
          const r = rows[tr.dataset.pin]
          if (!r) continue
          tr.hidden = !r.on
          if (r.pin) tr.children[2].textContent = r.pin
        }
      })
      .catch(() => {
        // not on a box (or an old one without the endpoint): the table stays as written
      })
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
