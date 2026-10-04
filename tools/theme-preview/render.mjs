#!/usr/bin/env node
// Theme previews for the parents' app (Settings › Appearance › Theme): every theme photographed from the real display,
// all with the same neutral demo library (demo-bibliothek/: six made-up covers and names, no real titles), so the
// tiles only differ in what the theme changes. One <id>.png (640 × 384) per file in themes/*.css - a new theme gets
// its picture without any change here. See README.md.
//
//   node tools/theme-preview/render.mjs [--www <display build>] [--out <dir>] [--only id,id] [--chrome <path>]
//
// The demo mode lives only in this script: it serves the display build itself and answers every request of the
// display with the demo data (Chrome DevTools protocol), so the box's own display never sees it. Needs Node 22+
// (global WebSocket and fetch) and Chrome or Chromium.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const www = path.resolve(arg('www', path.join(repo, 'src', 'frontend-box', 'www', 'browser')))
const out = path.resolve(arg('out', path.join(repo, 'AdminInterface', 'www', 'images')))
const themesDir = path.join(repo, 'themes')
const demoDir = path.join(here, 'demo-bibliothek')
const only = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const chromePath =
  arg('chrome', process.env.CHROME) ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => fs.existsSync(p))

if (!fs.existsSync(path.join(www, 'index.html'))) {
  console.error(`No display build in ${www} - first: cd src/frontend-box && npx ng build`)
  process.exit(1)
}
if (!chromePath) {
  console.error('Chrome/Chromium not found - give it with --chrome <path> or CHROME=<path>')
  process.exit(1)
}

// every theme with a stylesheet, in the order of the file names
const themes = fs
  .readdirSync(themesDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.slice(0, -4))
  .filter((id) => only.length === 0 || only.includes(id))
  .sort()

// ---------- the demo library ----------
const demo = JSON.parse(fs.readFileSync(path.join(demoDir, 'demo-bibliothek.json'), 'utf8'))
// The start page sorts by name; an invisible character in front of each name keeps the order of the demo list
// (Lumi, Tilo, Professorin Pimpelbart - the long name third, cut off with "…" - Nuri, Ivo, Sami).
const ORDER = ['\u200B', '\u200C', '\u200D', '\u2060', '\u2061', '\u2062', '\u2063']
const library = demo.map((entry, i) => {
  const name = ORDER[i] + entry.name
  const cover = `/demo/${entry.datei}`
  return { type: 'library', category: 'audiobook', artist: name, title: name, libraryPath: `audiobook/demo-${i}`, libraryIsContainer: true, cover, artistcover: cover }
})
const config = JSON.parse(fs.readFileSync(path.join(repo, 'config', 'templates', 'mupiboxconfig.json'), 'utf8'))
const configFor = (theme) => ({
  ...config,
  mupibox: { ...config.mupibox, theme, themeStage: false, coverflowShowNames: true, hideScrollbar: true, hiddenCategories: [] },
})
const playtime = {
  enabled: false,
  state: 'normal',
  blockSource: null,
  playtime: { enabled: false, state: 'normal', limitMinutes: 0, usedSeconds: 0, remainingSeconds: 0, graceEndsInSeconds: 0 },
  quiet: { enabled: false, state: 'normal', inWindow: false, graceEndsInSeconds: 0 },
  override: { allowUntil: 0, forceBlockUntil: 0 },
}
// the status in the header: WiFi full, the battery at 80 % and not charging
const api = {
  '/api/data': [],
  '/api/data-version': { version: 'demo', local: 'demo', nasTab: true },
  '/api/home-lists': {},
  '/api/nas/artists': [],
  '/api/playtime': playtime,
  '/api/monitor': { monitor: 'On' },
  '/api/network': { onlinestate: 'online', host: 'MuPiBox', ip: '192.168.0.10', wifi: 'MuPiBox', wifilink: '100%', wifisignal: '-40 dBm', interface: 'wlan0' },
  '/api/mupihat': { Charger_Status: 'Not Charging', Vbat: 7700, Vbus: 0, Ibat: -300, IBus: 0, Temp: 30, BatteryConnected: 1, Bat_SOC: '80%', Bat_Stat: 'OK', Bat_Percent: 80, Bat_PercentSource: 'voltage' },
  '/api/sonos': { server: 'MuPiBox', ip: '', port: '5005', rooms: [], tts: { enabled: false }, hat_active: true },
  '/api/spotify/config': { clientId: '', deviceName: 'MuPiBox' },
}
const answer = (pathname, search, theme) => {
  if (pathname === '/api/config') return configFor(theme)
  if (pathname === '/api/library/artists') return new URLSearchParams(search).get('category') === 'audiobook' ? library : []
  return api[pathname]
}

// ---------- the web server: display build, theme files, demo files ----------
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.json': 'application/json' }
let current = themes[0]
const sendFile = (res, file, type) => {
  res.writeHead(200, { 'Content-Type': type ?? types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}
const inside = (dir, file) => file.startsWith(dir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/active_theme.css') return sendFile(res, path.join(themesDir, `${current}.css`))
  // "custom" shows the parents' own picture: here the example landscape
  if (p === '/theme-data/custom/custom-bg.jpg') return sendFile(res, path.join(demoDir, 'custom-beispiel.svg'))
  if (p.startsWith('/theme-data/')) {
    const f = path.join(themesDir, p.slice('/theme-data/'.length))
    if (inside(themesDir, f)) return sendFile(res, f)
  } else if (p.startsWith('/demo/')) {
    const f = path.join(demoDir, p.slice('/demo/'.length))
    if (inside(demoDir, f)) return sendFile(res, f)
  } else {
    const f = path.join(www, p)
    if (inside(www, f)) return sendFile(res, f)
    if (!path.extname(p)) return sendFile(res, path.join(www, 'index.html'))
  }
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

// ---------- Chrome ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-preview-'))
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=800,480', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  target = await fetch(`http://127.0.0.1:${port}/json`)
    .then((r) => r.json())
    .then((list) => list.find((t) => t.type === 'page'))
    .catch(() => undefined)
}
if (!target) throw new Error('Chrome did not start')
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const json = (requestId, body, code = 200) =>
  send('Fetch.fulfillRequest', {
    requestId,
    responseCode: code,
    responseHeaders: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Access-Control-Allow-Origin', value: '*' },
    ],
    body: Buffer.from(JSON.stringify(body ?? {})).toString('base64'),
  })
ws.onmessage = (message) => {
  const data = JSON.parse(message.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data)
    pending.delete(data.id)
    return
  }
  if (data.method !== 'Fetch.requestPaused') return
  const { requestId, request } = data.params
  const u = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 204,
      responseHeaders: [
        { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Access-Control-Allow-Methods', value: '*' },
        { name: 'Access-Control-Allow-Headers', value: '*' },
        { name: 'Access-Control-Allow-Private-Network', value: 'true' },
      ],
    })
  }
  // the player (port 5005): nothing plays
  if (u.port === '5005') return json(requestId, u.pathname === '/local' ? { playing: false, currentPlayer: '' } : {})
  // (the display asks its backend on port 8200 of the same host: answered here)
  const local = ['127.0.0.1', 'localhost'].includes(u.hostname)
  if (local && u.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return json(requestId, {})
    const body = answer(u.pathname, u.search, current)
    return body === undefined ? json(requestId, {}, 404) : json(requestId, body)
  }
  if (u.origin === origin) return send('Fetch.continueRequest', { requestId })
  // files of the box's backend (covers, theme data): from this server
  if (local) return send('Fetch.continueRequest', { requestId, url: origin + u.pathname + u.search })
  // nothing leaves the computer (Spotify, fonts from the internet)
  return send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 480, deviceScaleFactor: 1, mobile: false })
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
await send('Page.enable')
await send('Runtime.enable')
// Tag & Nacht: always the day (12:00), whatever time it is here
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const D = Date; const noon = new D(); noon.setHours(12, 0, 0, 0); const off = noon.getTime() - D.now();
    class Day extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off) } static now() { return D.now() + off } }
    window.Date = Day })()`,
})
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

// everything drawn: fonts, pictures, then a moment for the theme's own fade-ins
const settled = `(async () => {
  for (let i = 0; i < 100 && document.querySelectorAll('ion-content.home-content swiper-slide').length < 3; i++) await new Promise((r) => setTimeout(r, 100))
  await document.fonts.ready
  await Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => { img.onload = img.onerror = r })))
  return document.querySelectorAll('ion-content.home-content swiper-slide').length
})()`

// "custom": the hint that the picture is only an example (a dark pill, 40 high, bottom right)
const exampleBadge = `(() => {
  const b = document.createElement('div')
  b.style.cssText = 'position:fixed;right:14px;bottom:14px;height:40px;padding:0 14px 0 12px;border-radius:20px;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;gap:8px;font:600 15px Fredoka,sans-serif;z-index:100000'
  b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="15" height="14" rx="2"/><path d="M3 16l4-4 3 3 3-3 5 5"/><path d="M19 3v6M16 6h6"/></svg>Beispiel'
  document.body.appendChild(b)
  return 'ok'
})()`

// ---------- 256 colours for the big ones ----------
// The browser reduces the picture (median cut, Floyd-Steinberg dithering) and hands back palette and indices; they are
// written here as an indexed PNG (colour type 3) - no extra package needed.
const LIMIT = 150 * 1024
const reduce = `(async (src) => {
  const img = new Image(); img.src = src; await img.decode()
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, w, h).data
  const n = w * h, px = new Uint32Array(n)
  for (let i = 0; i < n; i++) px[i] = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]
  let boxes = [Array.from(px)]
  const range = (b, s) => { let lo = 255, hi = 0; for (const p of b) { const v = (p >> s) & 255; if (v < lo) lo = v; if (v > hi) hi = v } return hi - lo }
  while (boxes.length < 256) {
    let best = -1, bestR = 0, bestS = 0
    boxes.forEach((b, i) => { if (b.length < 2) return; for (const s of [16, 8, 0]) { const r = range(b, s) * Math.log2(b.length); if (r > bestR) { bestR = r; best = i; bestS = s } } })
    if (best < 0) break
    const b = boxes[best].sort((x, y) => ((x >> bestS) & 255) - ((y >> bestS) & 255)), m = b.length >> 1
    boxes.splice(best, 1, b.slice(0, m), b.slice(m))
  }
  const pal = boxes.map((b) => { let r = 0, g = 0, bl = 0; for (const p of b) { r += (p >> 16) & 255; g += (p >> 8) & 255; bl += p & 255 } return [r / b.length, g / b.length, bl / b.length].map(Math.round) })
  const cache = new Map(), near = (r, g, b) => {
    const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2); let v = cache.get(k); if (v !== undefined) return v
    let bd = Infinity; pal.forEach((p, i) => { const dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (dd < bd) { bd = dd; v = i } }); cache.set(k, v); return v }
  const err = new Float32Array(n * 3), idx = new Uint8Array(n)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
    const r = cl(d[i * 4] + err[i * 3]), g = cl(d[i * 4 + 1] + err[i * 3 + 1]), b = cl(d[i * 4 + 2] + err[i * 3 + 2])
    const k = near(r, g, b); idx[i] = k; const e = [r - pal[k][0], g - pal[k][1], b - pal[k][2]]
    const add = (j, f) => { if (j < 0 || j >= n) return; for (let q = 0; q < 3; q++) err[j * 3 + q] += e[q] * f }
    if (x + 1 < w) add(i + 1, 7 / 16); if (y + 1 < h) { if (x > 0) add(i + w - 1, 3 / 16); add(i + w, 5 / 16); if (x + 1 < w) add(i + w + 1, 1 / 16) }
  }
  let s = ''; for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...idx.subarray(i, i + 8192))
  return { w, h, palette: pal.flat(), indices: btoa(s) }
})`
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}
const paletted = async (png) => {
  const r = await evaluate(`${reduce}('data:image/png;base64,${png.toString('base64')}')`)
  if (!r) return png
  const indices = Buffer.from(r.indices, 'base64')
  const rows = Buffer.alloc((r.w + 1) * r.h)
  for (let y = 0; y < r.h; y++) indices.copy(rows, y * (r.w + 1) + 1, y * r.w, (y + 1) * r.w) // filter byte 0 per row
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(r.w, 0)
  ihdr.writeUInt32BE(r.h, 4)
  ihdr.set([8, 3, 0, 0, 0], 8)
  const small = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(r.palette)),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return small.length < png.length ? small : png
}

fs.mkdirSync(out, { recursive: true })
const results = []
for (const theme of themes) {
  current = theme
  await send('Page.navigate', { url: `${origin}/home` })
  await sleep(2500)
  const slides = await evaluate(settled)
  if (theme === 'coverflow') {
    // the fourth cover (Nuri) in the middle: tapped one step at a time on the part of the next cover that shows
    // beside the one in the middle (the tilted covers overlap), as on the box
    for (let step = 0; step < 6; step++) {
      const next = await evaluate(`(() => {
        const slides = [...document.querySelectorAll('ion-content.home-content swiper-slide')]
        const rects = slides.map((s) => (s.querySelector('ion-card') ?? s).getBoundingClientRect())
        const middle = rects.map((r, i) => [Math.abs(r.x + r.width / 2 - 400), i]).sort((a, b) => a[0] - b[0])[0][1]
        if (middle >= 3 || middle + 1 >= rects.length) return null
        const c = rects[middle], t = rects[middle + 1]
        return [(Math.max(c.right, t.left) + t.right) / 2, t.y + t.height / 2]
      })()`)
      if (!next) break
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: next[0], y: next[1], button: 'left', clickCount: 1 })
      await sleep(900)
    }
  }
  if (theme === 'custom') await evaluate(exampleBadge)
  await sleep(1800)
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 800, height: 480, scale: 0.8 } })
  const file = path.join(out, `${theme}.png`)
  let png = Buffer.from(shot.result.data, 'base64')
  // a picture theme (photo background) is too big as a full colour PNG: 256 colours instead
  if (png.length > LIMIT) png = await paletted(png)
  fs.writeFileSync(file, png)
  const size = fs.statSync(file).size
  results.push({ theme, size, slides })
  console.log(`${theme.padEnd(22)} ${String(Math.round(size / 1024)).padStart(4)} KB${slides >= 3 ? '' : `  (only ${slides} covers!)`}`)
}

ws.close()
chrome.kill()
server.close()
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
const big = results.filter((r) => r.size > 150 * 1024)
console.log(`\n${results.length} pictures in ${out}${big.length ? ` - over 150 KB: ${big.map((r) => r.theme).join(', ')}` : ''}`)
