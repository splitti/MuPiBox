// Sandbox for the display's themes without a box: serves the built display (src/deploy/www/browser, or --www) on
// http://localhost:8200 like the box does and plays a pretend player on http://localhost:5005 - a small library
// with generated covers, a clock that runs through the tracks, volume, pause, seek, repeat and the Winamp theme's
// equaliser. No sound is made. See README.md.
//
//   node tools/winamp-sandbox/server.mjs [--skin file.wsz] [--theme winamp] [--www dir]
import { build } from 'esbuild'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// the player's own choice of the next track (src/backend-player/src/shuffle.js)
const { createShuffler } = createRequire(import.meta.url)('../../src/backend-player/src/shuffle.js')
const root = path.join(here, '../..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
let THEME = arg('theme', 'winamp')
let themeReloadAt = 0 // (the display polls /local and loads the theme again when this goes up)
// the display options the sandbox keeps (the app's page Display, e.g. the clock in the header)
const OPTIONS = { clockShow: true, clockStyle: 'digital', clockHours: 24 }
const WWW = path.resolve(arg('www', path.join(root, 'src/deploy/www/browser')))
const SKIN_DIR = path.join(here, '.skin')
const SKIN_LIBRARY = path.join(here, '.skins')
const SKIN_DIRS = { active: SKIN_DIR, library: SKIN_LIBRARY }

// ---------- the skin: unpacked with the backend's own code (the same as the app's upload uses) ----------
mkdirSync(SKIN_DIR, { recursive: true })
const skinCode = path.join(here, '.skin-code.cjs')
await build({ entryPoints: [path.join(root, 'src/backend-api/src/app-api/winamp-skin.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: skinCode, logLevel: 'error' })
const skinMod = await import(pathToFileURL(skinCode).href)
const { activateSkin, addSkin, listSkins, removeSkinById } = skinMod.default ?? skinMod
const wsz = arg('skin')
if (wsz) {
  const { meta } = await addSkin(readFileSync(wsz), path.basename(wsz), SKIN_DIRS)
  console.log(`skin: ${meta.name} (${Object.keys(meta.files).length} bitmaps)`)
}

// ---------- the pretend library ----------
const ALBUMS = {
  music: [
    { name: 'Demo Album One', tracks: ['Opening Credits', 'Walking Down the Road', 'A Very Long Track Name That Does Not Fit In One Line Of The Display', 'Interlude', 'Sunset', 'Closing Theme'] },
    { name: 'Demo Album Two', tracks: Array.from({ length: 14 }, (_, i) => `Song number ${i + 1}`) },
    { name: 'Radio Hits', tracks: ['Hit A', 'Hit B', 'Hit C'] },
  ],
  audiobook: [{ name: 'Bedtime Story', tracks: ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4'], long: true }],
  other: [],
}
const colours = ['#d94f4f', '#3f8fd9', '#4fb36b', '#d9a93f', '#8a5fd9', '#d95f9b']
const albumKey = (category, name) => `${category}/${name}`
const albums = new Map()
for (const [category, list] of Object.entries(ALBUMS)) for (const a of list) albums.set(albumKey(category, a.name), { ...a, category })
const durationOf = (album, i) => (album.long ? 900 + i * 130 : 95 + ((i * 37) % 160))

const coverSvg = (n, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colours[n % colours.length]}"/><stop offset="1" stop-color="#1b1b2b"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="130" r="70" fill="#ffffff22"/><text x="150" y="250" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">${label}</text></svg>`

// the audio CD in the pretend drive: put in with http://localhost:5005/sandbox/cd?tracks=9, taken out with ?tracks=0
const CD = { present: false, tracks: 0, id: 0 } // (+ artist, album, cover, source when named)
const CD_FOLDER = '_audio_cd_'
// (with &named=1 the disc is one the internet knows: artist, album, names of the tracks and a cover)
const cdAlbum = () => ({ name: CD.album || 'Audio-CD', category: 'cd', isCd: true, tracks: Array.from({ length: CD.tracks }, (_, i) => (CD.album ? `Song ${i + 1} of ${CD.album}` : `Track ${i + 1}`)) })

// ---------- the pretend player ----------
const player = {
  album: null, // the album that plays, or null
  track: 1,
  position: 0,
  paused: false,
  volume: 40,
  repeat: false,
  finished: false,
  shuffle: false,
  generation: 0,
  sound: { on: false, auto: false, preamp: 0, bands: new Array(10).fill(0), balance: 0 },
  presets: { presets: {}, auto: {}, default: null },
  shuffler: createShuffler(),
}
setInterval(() => {
  if (!player.album || player.paused) return
  player.position += 0.25
  const dur = durationOf(player.album, player.track - 1)
  if (player.position >= dur) {
    if (player.shuffle && player.album.tracks.length > 1) {
      const to = player.shuffler.next(player.track - 1, player.album.tracks.length, player.repeat)
      if (to >= 0) goTo(to + 1)
      else {
        player.album = null
        player.finished = true
        player.shuffle = false
      }
    } else if (player.track < player.album.tracks.length) {
      player.track++
      player.position = 0
    } else if (player.repeat) {
      player.track = 1
      player.position = 0
    } else {
      player.album = null
      player.finished = true
    }
  }
}, 250)

// the queue of the pretend player: what the playlist window's menus edit (the real one is mpv's playlist, see backend-player queue.js)
const savedLists = new Map()
const libraryFolders = { audiobook: { 'Bedtime Story': 4 }, music: { 'Demo Album One': 6, 'Demo Album Two': 14, 'Radio Hits': 3 }, other: {} }
const queueNames = () => player.album?.tracks ?? []
function queueSet(tracks, current) {
  player.album = { ...player.album, tracks }
  player.track = Math.max(1, Math.min(tracks.length, current))
}
function queueRoute(p, url, res) {
  const a = player.album
  const editable = !!a && !a.isCd
  const q = (k) => url.searchParams.get(k) ?? ''
  const positions = () => [...new Set(q('pos').split(',').map(Number).filter((n) => n >= 1 && n <= queueNames().length))].sort((x, y) => x - y)
  if (p === '/queue') return json(res, editable ? { editable, current: player.track, entries: queueNames().map((name, i) => ({ position: i + 1, name, file: `${name}.mp3` })) } : { editable: false, entries: [] })
  const route = p.slice('/queue/'.length)
  if (route === 'dirs') {
    const [top, sub] = q('path').split('/').filter(Boolean)
    if (!top) return json(res, { ok: true, path: '', audio: 0, folders: Object.keys(libraryFolders).map((n) => ({ name: n, path: n, audio: 0 })) })
    if (sub && libraryFolders[top]?.[sub]) return json(res, { ok: true, path: `${top}/${sub}`, audio: libraryFolders[top][sub], folders: [] })
    if (!libraryFolders[top] || sub) return json(res, { ok: false }, 404)
    return json(res, { ok: true, path: top, audio: 0, folders: Object.entries(libraryFolders[top]).map(([name, audio]) => ({ name, path: `${top}/${name}`, audio })) })
  }
  if (route === 'add') {
    const [top, name] = q('path').split('/').filter(Boolean)
    const count = libraryFolders[top]?.[name]
    if (!count) return json(res, { ok: false, error: 'no audio there' }, 404)
    const added = Array.from({ length: count }, (_, i) => `${name} - ${i + 1}`)
    if (editable) queueSet([...queueNames(), ...added], player.track)
    else start({ name, category: top, tracks: added })
    return json(res, { ok: true, added: count })
  }
  if (route === 'lists') return json(res, { ok: true, lists: [...savedLists].map(([name, t]) => ({ name, count: t.length, savedAt: 0 })) })
  if (route === 'deletelist') return json(res, { ok: savedLists.delete(q('name')) })
  if (route === 'load') {
    const tracks = savedLists.get(q('name'))
    if (!tracks) return json(res, { ok: false }, 404)
    start({ name: q('name'), category: 'music', tracks: [...tracks] })
    return json(res, { ok: true, count: tracks.length })
  }
  if (route === 'info') {
    const n = Number(q('pos'))
    const name = queueNames()[n - 1]
    return name ? json(res, { ok: true, position: n, name, file: `${name}.mp3`, folder: `music/${a?.name ?? ''}`, size: 3400000 + n * 1000, extension: 'MP3' }) : json(res, { ok: false }, 404)
  }
  if (!editable) return json(res, { ok: false, error: 'not editable' }, 409)
  if (route === 'remove' || route === 'crop') {
    const chosen = positions()
    const gone = route === 'crop' ? queueNames().map((_, i) => i + 1).filter((n) => !chosen.includes(n)) : chosen
    if (gone.length === 0 || gone.length >= queueNames().length) return json(res, { ok: gone.length === 0, removed: 0 })
    const keep = queueNames().filter((_, i) => !gone.includes(i + 1))
    queueSet(keep, player.track - gone.filter((n) => n < player.track).length)
    return json(res, { ok: true, removed: gone.length })
  }
  if (route.startsWith('sort/')) {
    const mode = route.slice(5)
    const t = [...queueNames()]
    if (mode === 'reverse') t.reverse()
    else if (mode === 'random') t.sort(() => Math.random() - 0.5)
    else t.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    const now = queueNames()[player.track - 1]
    queueSet(t, t.indexOf(now) + 1)
    return json(res, { ok: true })
  }
  if (route === 'new') {
    player.album = null
    player.generation++
    return json(res, { ok: true })
  }
  if (route === 'save') {
    const name = q('name') || `${a.name} 2026-11-05 21.30`
    savedLists.set(name, [...queueNames()])
    return json(res, { ok: true, name })
  }
  return json(res, { ok: false }, 404)
}

function localState() {
  const a = player.album
  const dur = a ? durationOf(a, player.track - 1) : 0
  const mono = a && player.track % 4 === 0
  return {
    activeSpotifyId: '',
    currentPlayer: a ? 'mplayer' : '',
    currentType: 'local',
    playing: !!a && !player.paused,
    pause: !!a && player.paused,
    album: a?.name ?? '',
    path: a ? (a.isCd ? CD_FOLDER : `/home/dietpi/MuPiBox/media/${a.category}/${a.name}`) : '',
    finished: player.finished,
    episode: '',
    currentTrackname: a?.tracks[player.track - 1] ?? '',
    currentTracknr: a ? player.track : '',
    totalTracks: a ? a.tracks.length : '',
    progressTime: a ? Math.round((player.position / dur) * 100) : '',
    positionSeconds: a ? player.position : 0,
    durationSeconds: dur,
    volume: player.volume,
    loading: false,
    cover: '',
    loadProgress: 0,
    triggerSource: 'box',
    triggerAt: 0,
    themeReloadAt,
    pageReloadAt: 0,
    spotifySilentAt: 0,
    trackFile: '',
    generation: player.generation,
    spotifySilent: false,
    bitrate: a ? (mono ? 64 : 192) : 0,
    khz: a ? (mono ? 22 : 44) : 0,
    channels: a ? (mono ? 1 : 2) : 0,
    repeat: player.repeat,
    shuffle: player.shuffle,
    shuffleSupported: true,
  }
}

function goTo(track) {
  player.track = track
  player.position = 0
  if (player.shuffle) player.shuffler.visit(track - 1)
}

function start(album) {
  player.shuffle = false
  player.shuffler.reset()
  player.album = album
  player.track = 1
  player.position = 0
  player.paused = false
  player.finished = false
  player.generation++
}

function command(rest) {
  const segs = rest.split('/')
  const name = segs[segs.length - 1]
  if (rest.startsWith('musicsearch/library/album/') || rest.startsWith('musicsearch/library/resume/')) {
    const param = segs[segs.length - 1].split(':')
    const album = param[0] === CD_FOLDER ? (CD.present ? cdAlbum() : null) : albums.get(`${param[0]}/${param[1]}`)
    if (album) start(album)
  } else if (name === 'pause') player.paused = true
  else if (name === 'play') player.paused = false
  else if (name === 'stop') {
    player.album = null
    player.shuffle = false
    player.generation++
  } else if (name === 'next') {
    if (player.album && player.shuffle && player.album.tracks.length > 1) {
      const to = player.shuffler.next(player.track - 1, player.album.tracks.length, player.repeat)
      if (to >= 0) goTo(to + 1)
    } else if (player.album && player.track < player.album.tracks.length) {
      goTo(player.track + 1)
    }
  } else if (name === 'previous') {
    if (player.album && player.shuffle && player.album.tracks.length > 1) {
      const to = player.shuffler.previous()
      if (to >= 0) goTo(to + 1)
      else player.position = 0
    } else if (player.album) {
      if (player.track > 1) player.track--
      player.position = 0
    }
  } else if (/^[+-]\d+$/.test(name)) player.volume = Math.max(0, Math.min(100, player.volume + Number(name)))
  else if (/^=\d+$/.test(name)) player.volume = Math.min(100, Number(name.slice(1)))
  else if (name.startsWith('seekpos:') && player.album) player.position = (Number(name.slice(8)) / 100) * durationOf(player.album, player.track - 1)
  else if (name === 'seek+30' && player.album) player.position = Math.min(player.position + 30, durationOf(player.album, player.track - 1) - 1)
  else if (name === 'seek-30' && player.album) player.position = Math.max(0, player.position - 30)
  else if (name.startsWith('localtrack:') && player.album) goTo(Number(name.slice(11)))
  else if (name === 'repeaton') player.repeat = true
  else if (name === 'repeatoff') player.repeat = false
  else if (name === 'shuffleon' && player.album) {
    player.shuffle = true
    player.shuffler.reset()
    player.shuffler.visit(player.track - 1)
  } else if (name === 'shuffleoff') player.shuffle = false
}

const cors = (req, res) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
  }
}
const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'))
      } catch {
        resolve({})
      }
    })
  })

createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const url = new URL(req.url, 'http://localhost:5005')
  const p = decodeURIComponent(url.pathname)
  const log = (what) => process.env.SANDBOX_LOG && console.log(`player ${req.method} ${p} ${what ?? ''}`)
  if (p === '/local') return json(res, localState())
  if (p === '/state') return json(res, {})
  if (p === '/winamp/sound') {
    if (req.method === 'POST') {
      const b = await readBody(req)
      player.sound = { on: b.on === true, auto: b.auto === true, preamp: Number(b.preamp) || 0, bands: Array.from({ length: 10 }, (_, i) => Number(b.bands?.[i]) || 0), balance: Number(b.balance) || 0 }
      log(JSON.stringify(player.sound))
      return json(res, { ok: true })
    }
    return json(res, { supported: true, ...player.sound })
  }
  if (p === '/winamp/presets') {
    if (req.method === 'POST') {
      const b = await readBody(req)
      player.presets = { presets: b.presets ?? {}, auto: b.auto ?? {}, default: b.default ?? null }
      log(JSON.stringify(player.presets))
      return json(res, { ok: true })
    }
    return json(res, player.presets)
  }
  if (p === '/display/reload-theme') {
    themeReloadAt = Date.now()
    return json(res, { ok: true })
  }
  if (p.startsWith('/display/')) return json(res, { ok: true })
  if (p === '/ext/cd/state') return json(res, { ...CD, drive: true })
  if (p === '/ext/cd/eject') return json(res, { ok: true })
  if (p === '/queue' || p.startsWith('/queue/')) return queueRoute(p, url, res)
  if (p === '/sandbox/cd') {
    const tracks = Math.max(0, Number(url.searchParams.get('tracks')) || 0)
    const named = url.searchParams.get('named') === '1'
    for (const k of ['artist', 'album', 'cover', 'source']) delete CD[k]
    if (tracks > 0) Object.assign(CD, { present: true, tracks, id: CD.id + 1 }, named ? { artist: 'Pretend Band', album: 'Pretend Album', source: 'musicbrainz', cover: true } : {})
    else Object.assign(CD, { present: false, tracks: 0 })
    return json(res, CD)
  }
  if (p.startsWith('/local/tracklist/')) {
    const param = p.slice('/local/tracklist/'.length).split(':')
    const album = param[0] === CD_FOLDER ? cdAlbum() : albums.get(`${param[0]}/${param[1]}`)
    return json(res, (album?.tracks ?? []).map((name, i) => ({ position: i + 1, name })))
  }
  const m = p.match(/^\/(current|[^/]+)\/(.+)$/)
  if (m) {
    log()
    command(m[2])
    return json(res, { ok: true })
  }
  json(res, {}, 404)
}).listen(5005, () => console.log('pretend player: http://localhost:5005'))

// ---------- the pretend box API and the display's files ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.bmp': 'image/bmp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' }
const send = (res, file) => {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}
const APP_DIR = path.join(root, 'src/backend-api/src/mupi-app')

// The parents' app against the sandbox: a login-free session, the theme page with the skin upload working for real
// (the backend's own unpacking), everything else empty.
const KM = JSON.parse(readFileSync(path.join(root, 'themes/km-themes.json'), 'utf8')).themes
// the weather extension as the app lists it (its manifest from extensions/weather), to try the details sheet with the place search
const weatherSettings = { provider: 'openmeteo', placeName: '' }
function weatherMock() {
  const m = JSON.parse(readFileSync(path.join(root, 'extensions/weather/manifest.json'), 'utf8'))
  return { id: m.id, name: m.name, version: m.version, description: m.description, icon: null, enabled: true, system: {}, ui: m.ui, settingTypes: Object.fromEntries(Object.entries(m.settings).map(([k, d]) => [k, d.type])), settings: { ...weatherSettings }, job: null }
}
async function parentsApi(req, res, url, api) {
  if (api === '/ext/weather/settings' && req.method === 'POST') {
    const b = await readBody(req)
    Object.assign(weatherSettings, b.values ?? {})
    return json(res, { ok: true, ...weatherSettings })
  }
  const csrfOk = () => req.headers['x-mupibox-csrf'] === 'sandbox'
  if (api === '/session') return json(res, { csrf_token: 'sandbox', open: true })
  // extensions page: the CD one installed, the clock one on offer (a pretend catalog)
  if (api === '/extensions') {
    return json(res, {
      installed: [weatherMock(), { id: 'cd', name: 'USB-CD-Laufwerk', version: '1.0.0', description: 'Audio-CDs vom USB-Laufwerk abspielen, mit Titelnamen und Cover aus dem Internet.', icon: '/ext/cd/icon.svg', enabled: true, system: { udev: [1], groups: ['cdrom'] }, settingTypes: { cdLookup: 'boolean', discogsToken: 'secret' }, settings: { cdLookup: true, discogsTokenSet: false }, ui: { title: 'Audio-CD', help: 'Liegt eine Audio-CD im USB-Laufwerk, zeigt das Display oben den Reiter „CD“.', items: [{ key: 'cdLookup', label: 'Titel und Cover im Internet suchen' }, { key: 'discogsToken', label: 'Discogs-Token', dep: 'cdLookup', help: 'Den Token erzeugst du auf discogs.com.' }] } }],
      catalog: [{ id: 'clock', name: 'Uhr in der Kopfleiste', version: '1.0.0', description: 'Zeigt die Uhrzeit in der Kopfleiste des Displays.', system: { udev: 0, groups: [], packages: [] }, installedVersion: null }],
      catalogError: null,
      hostApi: 1,
    })
  }
  if (api === '/theme') {
    if (req.method === 'POST') {
      const b = await readBody(req)
      if (typeof b.theme === 'string' && existsSync(path.join(root, 'themes', `${b.theme}.css`))) THEME = b.theme
      return json(res, { ok: true, theme: THEME })
    }
    const names = readdirSync(path.join(root, 'themes')).filter((n) => n.endsWith('.css')).map((n) => n.slice(0, -4))
    const labels = {}
    const labelsDe = {}
    for (const t of KM) {
      labels[t.id] = t.labelEn ?? t.label
      labelsDe[t.id] = t.label
    }
    return json(res, { current: THEME, available: names, labels, labelsDe, stage: true, stageAutoRead: false, headerBand: true, playerPanel: true, fullscreenGestures: true, bandOptional: [], panelOptional: [] })
  }
  if (api === '/display/reload-theme' || api === '/display/reload-page') {
    themeReloadAt = Date.now()
    return json(res, { ok: true })
  }
  if (api === '/display-options') {
    if (req.method === 'POST') {
      if (!csrfOk()) return json(res, { error: 'csrf token missing or invalid' }, 403)
      Object.assign(OPTIONS, await readBody(req))
      themeReloadAt = Date.now()
      return json(res, { ok: true, reloaded: true })
    }
    const { discogsToken, ...shown } = OPTIONS
    return json(res, { hiddenCategories: [], startCategory: 'audiobook', resume: 9, listviewTimer: 2.5, settingsAccessTimer: 3, resX: 1920, resY: 480, limitWindow: false, brightness: null, nightDim: {}, rotation: {}, dsi: null, hideScrollbar: false, scrollbarStyle: 'standard', ...shown })
  }
  if (api === '/power-config') return json(res, { idleDisplayOff: 10 })
  if (api === '/display/custom-theme') return json(res, { mode: 'auto', resolved: 'dark', veil: 0, accent: null, font: 'fredoka', size: 'm', v: 0, hasPicture: false, active: THEME === 'custom' })
  if (api === '/display/winamp-skin/select' && req.method === 'POST') {
    if (!csrfOk()) return json(res, { error: 'csrf token missing or invalid' }, 403)
    const id = String((await readBody(req)).id ?? '')
    const meta = await activateSkin(id, SKIN_DIRS)
    if (!meta) return json(res, { error: 'no such skin' }, 404)
    themeReloadAt = Date.now()
    return json(res, { ok: true, id, name: meta.name, reloaded: THEME === 'winamp' })
  }
  if (api === '/display/winamp-skin') {
    if (req.method === 'GET') {
      const skins = await listSkins(SKIN_DIRS)
      const shown = skins.find((s) => s.active)
      return json(res, { installed: !!shown, name: shown?.name ?? null, version: shown?.version ?? null, id: shown?.id ?? null, skins, active: THEME === 'winamp' })
    }
    if (!csrfOk()) return json(res, { error: 'csrf token missing or invalid' }, 403)
    if (req.method === 'DELETE') {
      if (!(await removeSkinById(url.searchParams.get('id') ?? '', SKIN_DIRS))) return json(res, { error: 'no such skin' }, 404)
      themeReloadAt = Date.now()
      return json(res, { ok: true, reloaded: THEME === 'winamp' })
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    try {
      const { id, meta } = await addSkin(Buffer.concat(chunks), decodeURIComponent(String(req.headers['x-skin-name'] ?? 'Skin')), SKIN_DIRS)
      themeReloadAt = Date.now()
      console.log(`skin uploaded in the app: ${meta.name} (${Object.keys(meta.files).length} bitmaps)`)
      return json(res, { ok: true, id, name: meta.name, files: Object.keys(meta.files).length, reloaded: THEME === 'winamp' })
    } catch (err) {
      const message = err.message
      return json(res, { error: message }, ['not a Winamp skin', 'not a zip', 'broken zip'].includes(message) ? 422 : 500)
    }
  }
  if (api.startsWith('/theme-preview/')) {
    const f = path.join(root, 'AdminInterface/www/images', `${decodeURIComponent(api.slice('/theme-preview/'.length)).replace(/[^\w.-]/g, '')}.png`)
    return isFile(f) ? send(res, f) : res.writeHead(404).end()
  }
  return json(res, {})
}

const isFile = (f) => existsSync(f) && statSync(f).isFile()
const inside = (base, rel) => {
  const f = path.join(base, rel)
  return f.startsWith(base) ? f : ''
}

createServer((req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const url = new URL(req.url, 'http://localhost:8200')
  const p = decodeURIComponent(url.pathname)
  // (the place search of the weather extension, answered with a few pretend places)
  if (p === '/api/ext/weather/places') {
    const q = String(url.searchParams.get('q') ?? '')
    return json(res, q.length < 2 ? [] : [{ label: `${q}, Niederösterreich, Österreich (48.26, 16.01)`, values: { placeName: `${q}, Niederösterreich, Österreich`, lat: 48.2553, lon: 16.0122 } }, { label: `${q}, Bayern, Deutschland (48.1, 11.5)`, values: { placeName: `${q}, Bayern, Deutschland`, lat: 48.1, lon: 11.5 } }])
  }
  if (p.startsWith('/api/app/')) return parentsApi(req, res, url, p.slice('/api/app'.length))
  if (p.startsWith('/app')) {
    // the parents' app: its files as they are in the source (nothing to build)
    const rel = p === '/app' || p === '/app/' ? 'index.html' : p.slice('/app/'.length)
    const f = inside(APP_DIR, rel)
    if (f && isFile(f)) return send(res, f)
    if (!path.extname(rel)) return send(res, path.join(APP_DIR, 'index.html'))
    return res.writeHead(404).end()
  }
  if (p === '/api/ext/cd/cover') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
    return res.end(coverSvg(3, 'Pretend Album'))
  }
  // extensions: the CD one is on in the sandbox - its files are served from the repository as the box would
  if (p === '/api/ext/active') return json(res, [{ id: 'cd', name: 'USB-CD-Laufwerk', version: '1.0.0', display: '/ext/cd/display.js', icon: '/ext/cd/icon.svg', settings: {} }])
  if (p.startsWith('/ext/cd/')) {
    const rel = p.slice('/ext/cd/'.length)
    const f = inside(path.join(here, '../../extensions/cd'), rel)
    if (f && isFile(f) && /\.(js|svg|json)$/.test(rel) && !/^(player|api)\.js$/.test(rel)) return send(res, f)
    return res.writeHead(404).end()
  }
  if (p.startsWith('/api/')) {
    const api = p.slice(4)
    if (api === '/config') return json(res, { mupibox: { theme: THEME, hiddenCategories: [], settingsAccessTimer: 3, listviewTimer: 2, playerBack: 'minimize', headerBand: true, playerPanel: true, ...OPTIONS } })
    if (api === '/data-version') return json(res, { version: '1', local: '1', nasTab: false })
    if (api === '/data' || api === '/nas/artists' || api === '/home-lists' || api === '/resume' || api === '/activeresume') return json(res, api === '/home-lists' ? {} : [])
    if (api === '/library/artists') {
      const category = url.searchParams.get('category')
      const list = (ALBUMS[category] ?? []).map((a, i) => ({
        type: 'library',
        category,
        artist: a.name,
        title: a.name,
        libraryPath: `${category}/${a.name}`,
        libraryIsContainer: false,
        cover: `/sandbox/cover/${i + (category === 'audiobook' ? 3 : 0)}.svg?t=${encodeURIComponent(a.name)}`,
        artistcover: `/sandbox/cover/${i + (category === 'audiobook' ? 3 : 0)}.svg?t=${encodeURIComponent(a.name)}`,
      }))
      return json(res, list)
    }
    if (api === '/library/children') return json(res, [])
    if (api === '/playtime') return json(res, { enabled: false })
    if (api === '/monitor') return json(res, { monitor: 'On' })
    if (api === '/albumstop') return json(res, { albumstop: 'Off' })
    if (api === '/sonos') return json(res, { tts: { enabled: false } })
    if (api === '/wlan' || api === '/wifi/status') return json(res, [])
    return json(res, {})
  }
  if (p.startsWith('/sandbox/cover/')) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
    return res.end(coverSvg(Number.parseInt(path.basename(p), 10) || 0, url.searchParams.get('t') ?? ''))
  }
  if (p === '/active_theme.css') return send(res, path.join(root, 'themes', `${THEME}.css`))
  if (p.startsWith('/theme-data/winamp/skins/')) {
    const f = inside(SKIN_LIBRARY, p.slice('/theme-data/winamp/skins/'.length))
    return f && isFile(f) ? send(res, f) : res.writeHead(404).end()
  }
  if (p.startsWith('/theme-data/winamp/skin/')) {
    const f = inside(SKIN_DIR, p.slice('/theme-data/winamp/skin/'.length))
    return f && isFile(f) ? send(res, f) : res.writeHead(404).end()
  }
  if (p.startsWith('/theme-data/')) {
    const f = inside(path.join(root, 'themes'), p.slice('/theme-data/'.length))
    return f && isFile(f) ? send(res, f) : res.writeHead(404).end()
  }
  const file = inside(WWW, p === '/' ? 'index.html' : p.slice(1))
  if (file && isFile(file)) return send(res, file)
  // (a page of the display, opened or reloaded by its address)
  if (!path.extname(p)) return send(res, path.join(WWW, 'index.html'))
  res.writeHead(404).end()
}).listen(8200, () => console.log(`display: http://localhost:8200  (theme ${THEME}, ${WWW})`))
