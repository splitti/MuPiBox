// The clock in the header, right of the battery: the time as digits or on a dial, with 12 or 24 hours (settings "style" and "hours").
// The status is on several pages (the start page, the lock screen …); each place gets its own clock, and one timer moves them all on
// at every full minute.

/** 24 hours: "14:35"; 12 hours: "2:35" and "PM" (the suffix is shown smaller next to it). */
export function digitalTime(now, hours) {
  const h = now.getHours()
  const mm = String(now.getMinutes()).padStart(2, '0')
  if (hours !== 12) return { time: `${String(h).padStart(2, '0')}:${mm}`, suffix: '' }
  return { time: `${h % 12 === 0 ? 12 : h % 12}:${mm}`, suffix: h < 12 ? 'AM' : 'PM' }
}

/** The hands of a dial in degrees from 12 o'clock; the hour hand moves on with the minutes. */
export function analogAngles(now) {
  const minutes = now.getMinutes()
  return { hour: (now.getHours() % 12) * 30 + minutes * 0.5, minute: minutes * 6 }
}

/** The settings; whatever is missing or odd is the default. */
export function clockSettings(settings) {
  return { style: settings?.style === 'analog' ? 'analog' : 'digital', hours: Number(settings?.hours) === 12 ? 12 : 24 }
}

const SVG = 'http://www.w3.org/2000/svg'

export function activate(api) {
  const { style, hours } = clockSettings(api.settings())
  const places = new Set() // { draw(now) } of each clock on a page
  let started = false

  const tick = () => {
    const now = new Date()
    for (const place of places) place.draw(now)
    // (a little after the full minute, so the new minute is the one shown)
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
  }

  api.header.add({
    mount(host) {
      const clock = document.createElement('span')
      clock.setAttribute('role', 'img')
      clock.style.cssText = 'display:flex;align-items:baseline;gap:3px;white-space:nowrap;font:700 22px/1 var(--ion-font-family, inherit);font-variant-numeric:tabular-nums'
      host.append(clock)

      let draw
      let observer
      if (style === 'analog') {
        // The dial is 2 px smaller than the header bar is high (1 px free above and below). The bar is measured, its height differs
        // by theme; outside of a bar (the lock screen) the dial stays small.
        const svg = document.createElementNS(SVG, 'svg')
        svg.setAttribute('viewBox', '0 0 28 28')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-linecap', 'round')
        svg.style.cssText = 'display:block;align-self:center;flex:none'
        const part = (tag, attrs, width) => {
          const el = document.createElementNS(SVG, tag)
          for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
          el.setAttribute('vector-effect', 'non-scaling-stroke')
          el.setAttribute('stroke-width', String(width))
          svg.append(el)
          return el
        }
        part('circle', { cx: 14, cy: 14, r: 13 }, 3)
        const hourHand = part('path', { d: 'M14 14V8' }, 3.5)
        const minuteHand = part('path', { d: 'M14 14V3.6' }, 2.5)
        const size = (px) => {
          svg.setAttribute('width', String(px))
          svg.setAttribute('height', String(px))
        }
        size(28)
        const bar = host.closest('ion-header') ?? host.closest('.km-bar')
        if (bar && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => size(Math.max(20, Math.round(bar.getBoundingClientRect().height) - 2)))
          observer.observe(bar)
        }
        clock.append(svg)
        draw = (now) => {
          const angles = analogAngles(now)
          hourHand.setAttribute('transform', `rotate(${angles.hour} 14 14)`)
          minuteHand.setAttribute('transform', `rotate(${angles.minute} 14 14)`)
          clock.setAttribute('aria-label', digitalTime(now, hours).time)
        }
      } else {
        const time = document.createElement('span')
        const suffix = document.createElement('span')
        suffix.style.cssText = 'font-size:12px;font-weight:600'
        clock.append(time, suffix)
        draw = (now) => {
          const t = digitalTime(now, hours)
          time.textContent = t.time
          suffix.textContent = t.suffix
          clock.setAttribute('aria-label', `${t.time} ${t.suffix}`.trim())
        }
      }

      const place = { draw }
      draw(new Date())
      places.add(place)
      if (!started) {
        started = true
        setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
      }
      return () => {
        places.delete(place)
        observer?.disconnect()
        clock.remove()
      }
    },
  })
}
