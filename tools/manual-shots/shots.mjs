#!/usr/bin/env node
// Screenshots of the display for the manual (src/backend-api/src/manual/img/<lang>/display-*.png): the real display
// build, a children's theme ("sonnenhof" unless --theme says otherwise, Cover Flow on as on a fresh box) and the made-up demo library of tools/theme-preview (no real
// titles, covers or brands). Like the theme previews, the demo lives only in this script: it serves the display build and
// answers every request of the display itself (Chrome DevTools protocol), the box never has a demo mode.
//
//   node tools/manual-shots/shots.mjs [--www <display build>] [--lang de,en] [--theme <id>] [--chrome <path>]
//
// Needs Node 22+ and Chrome or Chromium; first build the display (cd src/frontend-box && npx ng build).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const www = path.resolve(arg('www', path.join(repo, 'src', 'frontend-box', 'www', 'browser')))
const langs = arg('lang', 'de,en').split(',').filter(Boolean)
const themesDir = path.join(repo, 'themes')
const demoDir = path.join(repo, 'tools', 'theme-preview', 'demo-bibliothek')
const outBase = path.join(repo, 'src', 'backend-api', 'src', 'manual', 'img')
// the theme of the pictures (--theme <id>): Sonnenhof, a children's theme with the Cover Flow
const THEME = arg('theme', 'sonnenhof')
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

// ---------- the demo library (made up) ----------
const demo = JSON.parse(fs.readFileSync(path.join(demoDir, 'demo-bibliothek.json'), 'utf8'))
const ORDER = ['\u200B', '\u200C', '\u200D', '\u2060', '\u2061', '\u2062', '\u2063']
const cover = (i) => `/demo/${demo[i % demo.length].datei}`
const words = {
  de: { albums: ['Der Mondgarten', 'Sternschnuppen', 'Die Nachtwolke'], track: 'Kapitel', songs: ['Morgenlied', 'Regentanz', 'Sonnenstrahl', 'Wolkenreise', 'Gute Nacht', 'Sommerwind'] },
  en: { albums: ['The Moon Garden', 'Shooting Stars', 'The Night Cloud'], track: 'Chapter', songs: ['Morning Song', 'Rain Dance', 'Sunbeam', 'Cloud Journey', 'Good Night', 'Summer Wind'] },
}
let lang = langs[0]
const artists = () =>
  demo.map((entry, i) => ({ type: 'library', category: 'audiobook', artist: ORDER[i] + entry.name, title: ORDER[i] + entry.name, libraryPath: `audiobook/demo-${i}`, libraryIsContainer: true, cover: cover(i), artistcover: cover(i) }))
const music = () =>
  words[lang].songs.map((name, i) => ({ type: 'library', category: 'music', artist: ORDER[i] + name, title: ORDER[i] + name, libraryPath: `music/demo-${i}`, libraryIsContainer: true, cover: cover(i + 2), artistcover: cover(i + 2) }))
const albums = (p) => {
  const i = Number(/demo-(\d+)/.exec(p)?.[1] ?? 0)
  const name = demo[i].name
  return words[lang].albums.map((a, k) => ({ type: 'library', category: 'audiobook', artist: name, title: `${name} ${k + 1}: ${a}`, libraryPath: `${p}/${k + 1}`, libraryIsContainer: false, cover: cover(i), artistcover: cover(i) }))
}
const TRACKS = 8
const tracklist = () => Array.from({ length: TRACKS }, (_, k) => ({ position: k + 1, name: `${String(k + 1).padStart(2, '0')} ${words[lang].track} ${k + 1}` }))

const config = JSON.parse(fs.readFileSync(path.join(repo, 'config', 'templates', 'mupiboxconfig.json'), 'utf8'))
const configNow = () => ({ ...config, displayLanguage: lang, mupibox: { ...config.mupibox, theme: THEME, themeStage: true, hideScrollbar: false, hiddenCategories: [], playerBack: 'minimize' } })
const playtime = {
  enabled: false,
  state: 'normal',
  blockSource: null,
  playtime: { enabled: false, state: 'normal', limitMinutes: 0, usedSeconds: 0, remainingSeconds: 0, graceEndsInSeconds: 0 },
  quiet: { enabled: false, state: 'normal', inWindow: false, graceEndsInSeconds: 0 },
  override: { allowUntil: 0, forceBlockUntil: 0 },
}
const api = {
  '/api/data': [],
  '/api/activeresume': [],
  '/api/resume': [],
  '/api/data-version': { version: 'demo', local: 'demo', nasTab: false },
  '/api/home-lists': {},
  '/api/nas/artists': [],
  '/api/playtime': playtime,
  '/api/monitor': { monitor: 'On' },
  '/api/network': { onlinestate: 'online', host: 'MuPiBox', ip: '192.168.0.10', wifi: 'MuPiBox', wifilink: '100%', wifisignal: '-40 dBm', interface: 'wlan0' },
  '/api/mupihat': { Charger_Status: 'Not Charging', Vbat: 7700, Vbus: 0, Ibat: -300, IBus: 0, Temp: 30, BatteryConnected: 1, Bat_SOC: '80%', Bat_Stat: 'OK', Bat_Percent: 80, Bat_PercentSource: 'voltage' },
  '/api/sonos': { server: 'MuPiBox', ip: '', port: '5005', rooms: [], tts: { enabled: false }, hat_active: true },
  '/api/spotify/config': { clientId: '', deviceName: 'MuPiBox' },
}
const answer = (pathname, search) => {
  const q = new URLSearchParams(search)
  if (pathname === '/api/config') return configNow()
  if (pathname === '/api/library/artists') return q.get('category') === 'audiobook' ? artists() : q.get('category') === 'music' ? music() : []
  if (pathname === '/api/library/children') return albums(q.get('path') ?? '')
  return api[pathname]
}

// the box's player (port 5005): silent until an album was started, then that album at track 3
let playing = null
const local = () =>
  playing
    ? { currentPlayer: 'mplayer', currentType: 'local', playing: true, pause: false, album: playing.title, currentTrackname: `03 ${words[lang].track} 3`, currentTracknr: 3, totalTracks: TRACKS, progressTime: 38, positionSeconds: 152, durationSeconds: 400, volume: 40, path: playing.libraryPath, generation: 1, spotifySilent: true, loading: false }
    : { currentPlayer: '', playing: false, pause: false, generation: 1, spotifySilent: true }

// ---------- web server: display build, theme files, demo covers ----------
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.json': 'application/json' }
const sendFile = (res, file) => {
  res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}
const inside = (dir, file) => file.startsWith(dir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/active_theme.css') return sendFile(res, path.join(themesDir, `${THEME}.css`))
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-manual-'))
const port = 9800 + Math.floor(Math.random() * 500)
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
  if (u.port === '5005') {
    const p = decodeURIComponent(u.pathname)
    if (p === '/local') return json(requestId, local())
    if (p.startsWith('/local/tracklist/')) return json(requestId, tracklist())
    if (p === '/state') return json(requestId, { item: { album: { name: '', total_tracks: '' }, name: '', track_number: '' }, currently_playing_type: '' })
    // a start of a local album: from now on it plays (the album the display handed over)
    if (p.includes('/musicsearch/library/')) playing = pendingAlbum ?? { title: '', libraryPath: '' }
    if (/\/(stop)$/.test(p)) playing = null
    return json(requestId, { status: 'ok', error: 'none' })
  }
  const isLocal = ['127.0.0.1', 'localhost'].includes(u.hostname)
  if (isLocal && u.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return json(requestId, {})
    const body = answer(u.pathname, u.search)
    return body === undefined ? json(requestId, {}, 404) : json(requestId, body)
  }
  if (u.origin === origin) return send('Fetch.continueRequest', { requestId })
  if (isLocal) return send('Fetch.continueRequest', { requestId, url: origin + u.pathname + u.search })
  // nothing leaves the computer
  return send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
}
let pendingAlbum = null
await new Promise((resolve) => (ws.onopen = resolve))
await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 480, deviceScaleFactor: 1, mobile: false })
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const D = Date; const noon = new D(); noon.setHours(12, 0, 0, 0); const off = noon.getTime() - D.now();
    class Day extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off) } static now() { return D.now() + off } }
    window.Date = Day })()`,
})
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
const settled = `(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => { img.onload = img.onerror = r })))
  return true
})()`
const tap = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}
// the middle of an element (the first one the selector finds that is shown)
const centre = (selector) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
const tapOn = async (selector) => {
  const c = await centre(selector)
  if (!c) throw new Error(`not found: ${selector}`)
  await tap(c[0], c[1])
}
// the cover in the middle of the cover flow (or the first one of a row)
const tapMiddleCover = async () => {
  // the Cover Flow (stage): the cover in front is the button with the highest z-index
  const stage = await evaluate(`(() => {
    const items = [...document.querySelectorAll('ion-content .km-stage-item')].filter((s) => s.getBoundingClientRect().width > 0)
    if (!items.length) return false
    items.sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0))[0].click()
    return true
  })()`)
  if (stage) return
  const c = await evaluate(`(() => {
    const slides = [...document.querySelectorAll('ion-content swiper-slide')].filter((s) => s.getBoundingClientRect().width > 0)
    if (!slides.length) return null
    const r = slides.map((s) => (s.querySelector('ion-card') ?? s).getBoundingClientRect()).sort((a, b) => Math.abs(a.x + a.width / 2 - 400) - Math.abs(b.x + b.width / 2 - 400))[0]
    return [r.x + r.width / 2, r.y + r.height / 2]
  })()`)
  if (!c) throw new Error('no cover')
  await tap(c[0], c[1])
}
const shot = async (name) => {
  await evaluate(settled)
  await sleep(1200)
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 800, height: 480, scale: 1 } })
  const file = path.join(outBase, lang, `${name}.png`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  console.log(`${lang}/${name}.png ${Math.round(fs.statSync(file).size / 1024)} KB`)
}

for (lang of langs) {
  playing = null
  pendingAlbum = null
  await send('Page.navigate', { url: `${origin}/home` })
  await sleep(3500)
  await shot('display-home')
  // the second tab: music
  await evaluate(`(() => { const t = document.querySelectorAll('.km-tab'); t[1]?.click(); return t.length })()`)
  await sleep(2500)
  await shot('display-music')
  // back to the first tab, open the artist in the middle, then its first album
  await evaluate(`(() => { document.querySelectorAll('.km-tab')[0]?.click(); return true })()`)
  await sleep(2500)
  await tapMiddleCover()
  await sleep(2500)
  const middleArtist = await evaluate(`location.search`)
  const i = Number(/demo-(\d+)/.exec(decodeURIComponent(middleArtist ?? ''))?.[1] ?? 0)
  pendingAlbum = albums(`audiobook/demo-${i}`)[0]
  await tapMiddleCover()
  await sleep(4000)
  await shot('display-player')
  await tapOn('.kp-tbtn')
  await sleep(2500)
  await shot('display-tracklist')
  await tapOn('.kt-close')
  await sleep(1200)
  // back from the player (minimise): the "Now playing" pill in the header of the list, then of the start page
  await tapOn('.km-hbtn')
  await sleep(2500)
  await tapOn('.km-hbtn')
  await sleep(3000)
  await shot('display-now-playing')
  // the display settings (a long press on WiFi/battery opens them)
  await send('Page.navigate', { url: `${origin}/settings` })
  await sleep(3000)
  await shot('display-settings')
}

ws.close()
chrome.kill()
server.close()
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
