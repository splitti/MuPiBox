#!/usr/bin/env node
// Screenshots of the NFC extension in the app for the manual (src/backend-api/src/manual/img/<lang>/nfc-*.png): the real app
// (src/backend-api/src/mupi-app), the real manifest and status texts of the extension, and a made-up album of the demo library of
// tools/theme-preview. Like shots.mjs, the box is not involved: this script serves the app and answers its requests itself.
//
//   node tools/manual-shots/nfc-shots.mjs [--lang de,en] [--chrome <path>]
//
// Needs Node 22+ and Chrome or Chromium.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const langs = arg('lang', 'de,en').split(',').filter(Boolean)
const appDir = path.join(repo, 'src', 'backend-api', 'src', 'mupi-app')
const extDir = path.join(repo, 'extensions', 'nfc')
const demoDir = path.join(repo, 'tools', 'theme-preview', 'demo-bibliothek')
const outBase = path.join(repo, 'src', 'backend-api', 'src', 'manual', 'img')
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
if (!chromePath) {
  console.error('Chrome/Chromium not found - give it with --chrome <path> or CHROME=<path>')
  process.exit(1)
}

// ---------- what the extension says (its own texts) ----------
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'))
const logic = createRequire(import.meta.url)(path.join(extDir, 'logic.js'))
const settingTypes = Object.fromEntries(Object.entries(manifest.settings).map(([k, d]) => [k, d.type]))
const defaults = Object.fromEntries(Object.entries(manifest.settings).map(([k, d]) => [k, d.default]))
// a box with a PN5180 and, when `second` is on, a USB reader as the second one
const settings = (second) => ({ ...defaults, reader: 'pn5180', busyPin: 25, resetPin: 23, ...(second ? { reader2On: true, reader2: 'hid' } : {}) })
let secondReader = false
const views = {
  1: { config: logic.readConfig({ reader: 'pn5180', busyPin: 25, resetPin: 23 }, 1), phase: 'ready', firmware: '4.0', product: null, inField: false, last: { uid: '04A1B2C3D4E5F6', tech: 'ISO14443A' } },
  2: { config: logic.readConfig({ reader2On: true, reader2: 'hid' }, 2), phase: 'ready', firmware: '', product: 'Tera 5100 dongle', inField: false, last: { uid: '0323311635', tech: 'HID' } },
}
const demo = JSON.parse(fs.readFileSync(path.join(demoDir, 'demo-bibliothek.json'), 'utf8'))
const album = { de: 'Der Mondgarten', en: 'The Moon Garden' }
let lang = langs[0]
let armedAt = 0
const tagRows = () => [
  { id: '04A1B2C3D4E5F6', title: album[lang], text: ['SD-Karte', '04:A1:B2:C3:D4:E5:F6'], image: '/cover/demo-1.svg', imageOwn: false, coverPost: '/api/ext/nfc/tagimage', actions: [{ label: 'Entfernen', post: '/api/ext/nfc/tagremove', confirm: 'Diesen Tag entfernen? Er spielt dann nichts mehr.' }] },
]
// (the rows of the page: the same buttons as the box sends, see tagRow in extensions/nfc/api.js)
const pageActions = [
  { label: 'Album abspielen', icon: 'play', post: '/api/ext/nfc/tagplay', safe: true },
  { label: 'Tag ändern', icon: 'swap', change: true },
  { label: 'Entfernen', icon: 'trash', post: '/api/ext/nfc/tagremove', confirm: 'Diesen Tag entfernen? Er spielt dann nichts mehr.' },
]
const allTags = () => [
  ...tagRows(),
  { id: '0323311635', title: lang === 'de' ? 'Sternschnuppen' : 'Shooting Stars', text: ['SD-Karte', '0323311635', 'Flex-Tag'], image: '/cover/demo-2.svg', imageOwn: false, coverPost: '/api/ext/nfc/tagimage', actions: [{ label: 'Entfernen', post: '/api/ext/nfc/tagremove', confirm: 'Diesen Tag entfernen? Er spielt dann nichts mehr.' }] },
  { id: '04B7C8D9E0F1A2', title: lang === 'de' ? 'Die Nachtwolke und andere Geschichten für mutige Kinder' : 'The Night Cloud and Other Stories for Brave Children', text: ['SD-Karte', '04:B7:C8:D9:E0:F1:A2'], image: '/cover/demo-3.svg', imageOwn: true, coverPost: '/api/ext/nfc/tagimage', actions: [{ label: 'Entfernen', post: '/api/ext/nfc/tagremove', confirm: 'Diesen Tag entfernen? Er spielt dann nichts mehr.' }] },
]
const entry = () => ({
  id: 'nfc', name: manifest.name, version: manifest.version, description: manifest.description, icon: '/api/ext-files/nfc/icon.svg', enabled: true, system: {}, resources: [],
  ui: manifest.ui, settingTypes, settings: settings(secondReader), job: null,
})
const pages = () => [{ id: 'nfc', name: manifest.name, title: manifest.ui.title, description: manifest.description, icon: '/api/ext-files/nfc/icon.svg', adopt: [], pages: manifest.ui.items.filter((i) => i.type === 'heading' && i.page).map((i) => ({ title: i.label, help: i.help ?? '' })) }]
const answer = (method, pathname, query) => {
  if (pathname === '/api/app/session') return { csrf_token: 'manual', open: true }
  if (pathname === '/api/app/extensions/pages') return pages()
  if (pathname === '/api/app/ext/nfc/info') return entry()
  if (pathname === '/api/app/ext/nfc/gpio') return { pins: [], hints: [], blind: false }
  if (pathname === '/api/ext/nfc/iicstate') return { rows: logic.i2cRows({ configured: true, devices: ['i2c-1'] }) }
  if (pathname === '/api/ext/nfc/uartstate') return { rows: logic.uartRows({ configured: true, off: false, device: true, devices: ['serial0'], console: false }) }
  if (pathname === '/api/ext/nfc/spistate') return { rows: logic.spiRows({ configured: true, devices: ['spidev0.0'] }) }
  if (pathname === '/api/ext/nfc/stateone') return { rows: logic.statusRows(views[1]) }
  if (pathname === '/api/ext/nfc/statetwo') return { rows: logic.statusRows(views[2]) }
  if (pathname === '/api/ext/nfc/statethree') return { rows: [{ label: 'Leser', value: 'Aus', tone: 'warn' }] }
  if (pathname === '/api/ext/nfc/usbstate') {
    return { options: { hid: { label: 'USB Reader 1 · Tera 5100 dongle' }, hid2: { label: 'USB Reader 2 · RFID Reader' } }, devices: [] }
  }
  if (pathname === '/api/app/cover-search') {
    // (made-up results: the covers of the demo library)
    return { results: [1, 2, 3, 4, 5, 6].map((n) => ({ thumb: `/demo/cover-${n}.svg`, full: `/demo/cover-${n}.svg`, title: demo[n - 1]?.name ?? `Demo ${n}`, artist: album[lang], source: ['iTunes', 'Deezer', 'Spotify'][n % 3] })) }
  }
  if (pathname === '/api/ext/nfc/tags') return { items: allTags().map((row) => ({ ...row, actions: pageActions })) }
  if (pathname === '/api/ext/nfc/tagsfor') return { items: tagRows() }
  if (pathname === '/api/app/playback') return { player: 'mplayer', playing: true, title: lang === 'de' ? 'Sternschnuppen' : 'Shooting Stars', artist: '', coverUrl: '/demo/cover-2.svg', progressMs: 754000, durationMs: 3456000, volume: 35 }
  if (pathname === '/api/ext/nfc/tagchange') return { ok: true, message: 'Tag geändert' }
  if (pathname === '/api/ext/nfc/arm') {
    armedAt = Date.now()
    return { ok: true, id: 1, state: 'waiting', seconds: 600 }
  }
  if (pathname === '/api/ext/nfc/armstate') {
    return armedAt && Date.now() - armedAt > 1500 && query.get('done') !== '0' && fulfilled ? { state: 'done', uid: '04A1B2C3D4E5F6', id: '04:A1:B2:C3:D4:E5:F6', title: album[lang], previous: '' } : { state: 'waiting', title: album[lang], seconds: 590 }
  }
  return {}
}
let fulfilled = false

// ---------- the server: the app, the demo pictures, the answers ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }
const inside = (dir, file) => path.resolve(file).startsWith(path.resolve(dir) + path.sep)
const sendFile = (res, file, transform) => {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404)
    return res.end()
  }
  let body = fs.readFileSync(file)
  if (transform) body = Buffer.from(transform(body.toString('utf8')))
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(body)
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const p = decodeURIComponent(u.pathname)
  if (p.startsWith('/api/')) {
    if (p === '/api/ext-files/nfc/icon.svg') return sendFile(res, path.join(extDir, 'icon.svg'))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(answer(req.method, p, u.searchParams)))
  }
  if (p.startsWith('/demo/') || p.startsWith('/cover/demo-')) {
    // (the pictures of the tags are /cover/... on a box: the same files of the demo library)
    const f = path.join(demoDir, p.startsWith('/demo/') ? p.slice('/demo/'.length) : p.replace('/cover/demo-', 'cover-'))
    return inside(demoDir, f) ? sendFile(res, f) : (res.writeHead(404), res.end())
  }
  const rel = p.replace(/^\/app\//, '/')
  const f = path.join(appDir, rel === '/' ? 'index.html' : rel)
  // (the app's own module, with the three functions the pictures need put where the script can reach them)
  if (inside(appDir, f) && path.basename(f) === 'app.js') return sendFile(res, f, (s) => `${s}\nwindow.__shots = { openNfcTagsSheet, openNfcSheet, startNfcChange, openLocalAlbumSheet }\n`)
  if (inside(appDir, f)) return sendFile(res, f)
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

// ---------- Chrome ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-manual-'))
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=900,800', 'about:blank'], { stdio: 'ignore' })
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
ws.onmessage = (message) => {
  const data = JSON.parse(message.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data)
    pending.delete(data.id)
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
await send('Runtime.enable')
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
const settled = `(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => { img.onload = img.onerror = r })))
  return true
})()`
// a picture of the visible page (the sheet or the page), `height` high
const shot = async (name, height = 760, width = 640) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  await evaluate(settled)
  await sleep(800)
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })
  const file = path.join(outBase, lang, `${name}.png`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  console.log(`${lang}/${name}.png ${Math.round(fs.statSync(file).size / 1024)} KB`)
}
const clickOn = (selector) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0); if (!el) return false; el.click(); return true })()`)
const media = () => `{ type: 'library', category: 'audiobook', artist: ${JSON.stringify(album[lang])}, title: ${JSON.stringify(album[lang])}, cover: '/demo/cover-1.svg', libraryPath: 'audiobook/demo-0', libraryIsContainer: false }`
const open = async (hash) => {
  await send('Page.navigate', { url: `${origin}/app/#/${hash}` })
  await send('Page.reload')
  await sleep(2800)
}

for (lang of langs) {
  await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 760, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${origin}/app/` })
  await evaluate(`localStorage.setItem('mupi-lang', '${lang}'); localStorage.setItem('mupi-theme', 'light')`)
  secondReader = false
  fulfilled = false
  armedAt = 0
  // the sheet "NFC-Tag" of an album, the sheet that waits for the tag, and the one that says it is done
  await open('start')
  await evaluate(`window.__shots.openNfcTagsSheet(${media()})`)
  await sleep(1500)
  await shot('nfc-sheet-tags', 560)
  // "Bild ändern" of the tag: the sheet to choose a picture
  await clickOn('#nt-list button')
  await sleep(1500)
  await shot('nfc-image', 760)
  await open('start')
  await evaluate(`window.__shots.openNfcTagsSheet(${media()})`)
  await sleep(1500)
  await clickOn('#nt-add')
  await sleep(1500)
  await shot('nfc-sheet-wait', 420)
  fulfilled = true
  await sleep(2800)
  await shot('nfc-sheet-done', 420)
  // the page of the tags, and the page of the readers (one reader, then with a second)
  await open('ext-nfc-2')
  await shot('nfc-tags-page', 1150, 700)
  await shot('nfc-tags-page-wide', 640, 1200)
  // "Tag ändern": the library waits for the new album (a bar at the bottom), and its sheet has "Weise den NFC-Tag diesem Album zu" under "NFC-Tag"
  await clickOn('.ext-tag.tag-tile .tag-tile-btns button:nth-child(4)')
  await sleep(1500)
  await shot('nfc-change-library', 760, 700)
  await evaluate(`window.__shots.openLocalAlbumSheet({ title: ${JSON.stringify(album[lang])}, category: 'audiobook', cover: '/demo/cover-4.svg', libraryPath: 'audiobook/demo-3' }, null)`)
  await sleep(1500)
  await shot('nfc-change-sheet', 760, 700)
  await clickOn('[data-nfc-change]')
  await sleep(1500)
  console.log('after change:', await evaluate('location.hash'))
  await open('ext-nfc-1')
  await shot('nfc-reader-page', 1000, 700)
  secondReader = true
  await open('ext-nfc-1')
  await shot('nfc-reader-page-2', 1500, 700)
}

ws.close()
chrome.kill()
server.close()
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {
  // Chrome may hold the folder a moment longer: the system cleans it up
}
