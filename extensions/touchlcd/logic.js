// Touch display (Waveshare 2.8 inch): what the settings mean, how the library becomes levels of faces (artists, then albums), and what the
// driver's reports turn into for the status block of the app. Without hardware and without a process: plain functions, tested on their own.
'use strict'

const SPI_DEVICES = ['0.0', '0.1']
const ROTATIONS = [0, 90, 180, 270]
const CATEGORIES = ['all', 'music', 'audiobook', 'other', 'nas']
const SLEEP_AFTER = [0, 1, 5, 15, 60]
// the pins the SPI bus (BCM 7 to 11) and the I2C bus 1 (BCM 2 and 3) use: not for DC, RST, the backlight or the touch reset
const BUS_PINS = new Set([2, 3, 7, 8, 9, 10, 11])
const ALBUMS_MAX = 400

/**
 * The settings of the extension as what the driver needs. `problem` is set when it cannot start yet: 'pins' (DC or RST not chosen, a pin
 * twice, or a pin the SPI or I2C bus uses).
 */
function readConfig(settings) {
  const s = settings ?? {}
  const pin = (value) => (Number.isInteger(value) && value >= 2 && value <= 27 ? value : 0)
  const whole = (value, fallback, min, max) => (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback)
  const config = {
    spi: SPI_DEVICES.includes(s.spiDevice) ? s.spiDevice : '0.1',
    dc: pin(s.dcPin),
    rst: pin(s.rstPin),
    bl: pin(s.blPin),
    tpRst: pin(s.tpRstPin),
    i2cBus: whole(s.i2cBus, 1, 0, 9),
    rotation: ROTATIONS.includes(s.rotation) ? s.rotation : 0,
    brightness: whole(s.brightness, 80, 5, 100),
    nightDim: s.nightDim === true,
    nightBrightness: whole(s.nightBrightness, 20, 1, 100),
    sleepAfter: SLEEP_AFTER.includes(s.sleepAfter) ? s.sleepAfter : 5,
    showTitle: s.showTitle === true,
    category: CATEGORIES.includes(s.category) ? s.category : 'all',
    touchSwap: s.touchSwap === true,
    touchFlipX: s.touchFlipX === true,
    touchFlipY: s.touchFlipY === true,
    problem: null,
  }
  const used = [config.dc, config.rst, config.bl, config.tpRst].filter(Boolean)
  if (!config.dc || !config.rst || new Set(used).size !== used.length || used.some((p) => BUS_PINS.has(p))) config.problem = 'pins'
  return config
}

/** What a restart of the driver is needed for (the brightness is told to the running driver). */
function needsRestart(a, b) {
  const keys = ['spi', 'dc', 'rst', 'bl', 'tpRst', 'i2cBus', 'rotation', 'sleepAfter', 'showTitle', 'touchSwap', 'touchFlipX', 'touchFlipY']
  return keys.some((key) => a[key] !== b[key])
}

/** The brightness (percent) now: the normal one, or the evening's - `share` (0 to 1) of the way, never brighter than the normal one. */
function eveningBrightness(config, share) {
  if (!config.nightDim || !(share > 0)) return config.brightness
  const dark = Math.min(config.nightBrightness, config.brightness)
  return Math.round(config.brightness + (dark - config.brightness) * Math.min(1, share))
}

/** The number of the gpiochip with the header pins, from `gpiodetect` ("gpiochip0 [pinctrl-rp1] (54 lines)"); 0 when it cannot be told. */
function headerChipNumber(gpiodetectOutput) {
  const chips = []
  for (const line of String(gpiodetectOutput ?? '').split('\n')) {
    const m = /^gpiochip(\d+)\s+\[([^\]]*)\]/.exec(line.trim())
    if (m) chips.push({ number: Number(m[1]), label: m[2] })
  }
  for (const label of [/^pinctrl-rp1$/, /^pinctrl-bcm2711$/, /^pinctrl-bcm2835$/, /^pinctrl-bcm/]) {
    const hit = chips.find((c) => label.test(c.label))
    if (hit) return hit.number
  }
  return 0
}

/** The command line of the driver (the program itself is added by the caller). `brightness` is what it starts with (the evening's). */
function driverArgs(config, chip, brightness = config.brightness) {
  return [
    '--spi', config.spi,
    '--chip', String(chip),
    '--dc', String(config.dc),
    '--rst', String(config.rst),
    ...(config.bl ? ['--bl', String(config.bl)] : []),
    ...(config.tpRst ? ['--tp-rst', String(config.tpRst)] : []),
    '--i2c-bus', String(config.i2cBus),
    '--rotation', String(config.rotation),
    '--brightness', String(brightness),
    '--sleep-after', String(config.sleepAfter * 60),
    ...(config.showTitle ? ['--show-title'] : []),
    ...(config.touchSwap ? ['--touch-swap'] : []),
    ...(config.touchFlipX ? ['--touch-flip-x'] : []),
    ...(config.touchFlipY ? ['--touch-flip-y'] : []),
  ]
}

/** The report of the driver as an object, or null if the line is none of its reports. */
function readEvent(line) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    return null
  }
  if (!event || typeof event !== 'object' || typeof event.event !== 'string') return null
  switch (event.event) {
    case 'ready':
      return { event: 'ready', width: Number(event.width) || 0, height: Number(event.height) || 0 }
    case 'nav':
      return event.dir === 'next' || event.dir === 'prev' ? { event: 'nav', dir: event.dir } : null
    case 'tap':
    case 'up':
      return { event: event.event }
    case 'error':
      return { event: 'error', code: String(event.code ?? 'other').slice(0, 40), message: String(event.message ?? '').slice(0, 300) }
    default:
      return null
  }
}

// ---- the library as levels of faces ---------------------------------------------------------------------------------------------
// A node is one face: { id, label, cover, kind: 'folder' | 'album', media, via } - a folder opens the next level (its children: via),
// an album plays (its media: what the player is told, see playerPathOf).

/** The player's address for a medium, the same the display builds for a tap on a tile (PlayerService.playMedia); null when there is none. */
function playerPathOf(media) {
  const enc = encodeURIComponent
  const cover = String(media.cover || media.artistcover || '').replace(/^https?:\/\/[^/]+(?=\/api\/)/, '')
  const coverQuery = cover ? `?cover=${enc(cover)}` : ''
  switch (media.type) {
    case 'library':
      return `musicsearch/library/album/${media.libraryPath ? String(media.libraryPath).split('/').filter(Boolean).map(enc).join(':') : `${enc(media.category ?? '')}:${enc(media.artist ?? '')}:${enc(media.title ?? media.id ?? '')}`}`
    case 'nas':
      return media.nasPath ? `musicsearch/nas/${enc(media.nasPath)}` : null
    case 'tidal':
      return media.id ? `musicsearch/tidal/${media.tidalKind === 'playlist' ? 'playlist' : 'album'}:${enc(media.id)}${coverQuery}` : null
    case 'jellyfin':
      return media.id ? `musicsearch/jellyfin/${media.jellyfinKind === 'playlist' || media.jellyfinKind === 'book' ? media.jellyfinKind : 'album'}:${enc(media.id)}${coverQuery}` : null
    case 'audible':
      return media.id ? `musicsearch/audible/book:${enc(media.id)}${coverQuery}` : null
    case 'spotify':
      if (media.playlistid) return `spotify/now/spotify:playlist:${enc(media.playlistid)}:0:0`
      if (media.id) return `spotify/now/spotify:album:${enc(media.id)}:0:0`
      if (media.showid) return `spotify/now/spotify:episode:${enc(media.showid)}:0:0`
      if (media.audiobookid) return `spotify/now/spotify:show:${enc(media.audiobookid)}:0:0`
      return null
    case 'radio':
    case 'rss':
      return media.id ? `${media.type}/${enc(media.id)}/${enc(media.title ?? '')}:title:artist:${enc(media.artist ?? '')}${coverQuery}` : null
    default:
      return null
  }
}

// The tile of the start page a medium belongs to, as the display names it to the player (frontend-box tile-key.ts): its day's limit is
// counted under this key. null: no tile.
function tileKeyOf(media) {
  if (!media || typeof media !== 'object') return null
  if (media.nasPath) return `nas:${media.nasPath}`
  if (media.type === 'library' && media.libraryPath) return `lib:${media.libraryPath}`
  const cat = !media.category ? 'audiobook' : media.category === 'radio' ? 'other' : media.category
  if (!media.artist) {
    if (media.playlistid) return `single:${cat}:${media.playlistid}`
    if (media.type === 'radio' && media.id) return `single:${cat}:${media.id}`
    if (media.type === 'tidal' && media.tidalKind === 'playlist' && media.id) return `single:${cat}:${media.id}`
    if (media.type === 'jellyfin' && media.jellyfinKind === 'playlist' && media.id) return `single:${cat}:${media.id}`
    return null
  }
  return `artist:${cat}:${media.artist}`
}

// What of the library a medium is, for the ticks of what was heard (frontend-box heard-key.ts): null for none
function heardKeyOf(media) {
  if (!media || typeof media !== 'object') return null
  const ok = (key) => (key.length <= 400 && !key.includes('\n') ? key : null)
  if (media.type === 'nas' || media.nasPath) return media.nasIsContainer || !media.nasPath ? null : ok(`nas:${media.nasPath}`)
  if (media.type === 'library') {
    if (media.libraryIsContainer) return null
    if (media.libraryPath) return ok(`lib:${media.libraryPath}`)
    return media.artist && media.title ? ok(`lib:${media.category || 'audiobook'}/${media.artist}/${media.title}`) : null
  }
  if (media.type === 'tidal') return media.tidalKind === 'artist' || !media.id ? null : ok(`tidal:${media.tidalKind === 'playlist' ? 'playlist' : 'album'}:${media.id}`)
  if (media.type === 'audible') return media.audibleKind === 'series' || !media.id ? null : ok(`audible:book:${media.id}`)
  if (media.type === 'jellyfin') {
    const kind = media.jellyfinKind ?? 'album'
    return kind === 'artist' || !media.id ? null : ok(`jellyfin:${kind}:${media.id}`)
  }
  if (media.type === 'spotify') {
    if (media.playlistid) return ok(`spotify:playlist:${media.playlistid}`)
    if (media.id) return ok(`spotify:album:${media.id}`)
    if (media.showid) return ok(`spotify:episode:${media.showid}`)
    if (media.audiobookid) return ok(`spotify:show:${media.audiobookid}`)
  }
  return null
}

/** The query parts the display adds to a start: the tile (its limit of the day) and what was heard; '' when there is neither. */
function startQuery(url, media) {
  const tileKey = tileKeyOf(media)
  const tile = tileKey && tileKey.length <= 400 && !tileKey.includes('\n') ? `${url.includes('?') ? '&' : '?'}tile=${encodeURIComponent(tileKey)}` : ''
  const heardKey = heardKeyOf(media)
  const heard = heardKey ? `${(url + tile).includes('?') ? '&' : '?'}heard=${encodeURIComponent(heardKey)}` : ''
  return tile + heard
}

const text = (value) => (typeof value === 'string' ? value : '')
const byLabel = (a, b) => a.label.localeCompare(b.label, 'de', { numeric: true, sensitivity: 'base' })

/** The cover of a medium as a path of the box's own API (/api/...) or an address on the internet; '' when there is none the display can
 * use (the placeholder of the app is one of its own files). */
function coverOf(raw) {
  const cover = text(raw).trim()
  if (!cover || cover.startsWith('.') || cover.startsWith('data:')) return ''
  if (/^https?:\/\//.test(cover)) return cover.replace(/^https?:\/\/[^/]+(?=\/api\/)/, '')
  return cover.startsWith('/') ? cover : ''
}

/** What of a data.json row the display shows: the names the parents gave a Smart-Sync entry win. */
function effective(item) {
  const media = { ...item }
  for (const key of ['artist', 'title', 'cover', 'artistcover', 'category']) if (item[`${key}_override`]) media[key] = item[`${key}_override`]
  return media
}

/** Which category an entry is in (what the app does: a radio station is under "other"). */
function categoryOf(item) {
  const category = text(item.category_override) || (item.category === 'radio' ? 'other' : text(item.category))
  return category || 'audiobook'
}

const albumNode = (media, label) => ({
  id: `album:${playerPathOf(media) ?? `${media.type}:${label}`}`,
  label: label || text(media.title) || text(media.artist),
  cover: coverOf(media.cover) || coverOf(media.artistcover),
  kind: 'album',
  media,
})

/**
 * The artists of the rows of data.json (Spotify, podcasts, radio, TIDAL ...): one face for each artist, its cover the one of its first album
 * by title (as the app has it); a row without an artist (a playlist, a station) is an album of its own that plays at a tap. Rows of local
 * folders (type library) are read live from the disk; a Spotify row for a whole artist has no album to play from here and is left out.
 * `category`: 'all' or one of music, audiobook, other.
 */
function dataNodes(items, category = 'all') {
  if (!Array.isArray(items)) return []
  const groups = new Map()
  const singles = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || item.isResume === true || item.category === 'resume' || item.type === 'library' || item.type === 'nas') continue
    const cat = categoryOf(item)
    if (cat === 'nas' || (category !== 'all' && cat !== category)) continue
    const media = effective(item)
    if (!playerPathOf(media)) continue
    const artist = text(media.artist).trim()
    if (!artist) {
      singles.push(albumNode(media, text(media.title).trim() || (media.type === 'radio' ? 'Radio' : '')))
      continue
    }
    if (!groups.has(artist)) groups.set(artist, [])
    groups.get(artist).push(media)
  }
  const nodes = [...singles]
  for (const [artist, rows] of groups) {
    const albums = rows.map((media) => albumNode(media, text(media.title).trim() || artist)).sort(byLabel).slice(0, ALBUMS_MAX)
    const first = [...rows].sort((a, b) => (text(a.title) <= text(b.title) ? -1 : 1))[0]
    nodes.push({
      id: `artist:${artist}`,
      label: artist,
      cover: coverOf(first.artistcover) || coverOf(first.cover),
      kind: 'folder',
      children: albums,
    })
  }
  return nodes.sort(byLabel)
}

/** A folder of the SD card or the NAS (the box's own listing: /api/library/artists, /api/library/children, /api/nas/...). */
function folderNode(entry, nas) {
  const path = text(nas ? entry.nasPath : entry.libraryPath)
  const container = nas ? entry.nasIsContainer === true : entry.libraryIsContainer === true
  const label = text(entry.title).trim() || text(entry.artist).trim()
  return {
    id: `${nas ? 'nas' : 'lib'}:${path}`,
    label,
    cover: coverOf(entry.cover) || coverOf(entry.artistcover),
    kind: container ? 'folder' : 'album',
    media: container ? undefined : entry,
    via: container ? { source: nas ? 'nas' : 'library', path } : undefined,
  }
}

/** The faces of a listing of folders: those with nothing to show or to play are left out. */
function folderNodes(entries, nas, { top = false } = {}) {
  if (!Array.isArray(entries)) return []
  const nodes = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const path = text(nas ? entry.nasPath : entry.libraryPath)
    if (!path) continue
    const node = folderNode(entry, nas)
    // (the top level of a library or NAS folder is an artist: a tap opens it, whatever it holds)
    if (top && node.kind === 'album') {
      node.kind = 'folder'
      node.via = { source: nas ? 'nas' : 'library', path }
    }
    if (node.label) nodes.push(node)
  }
  return nodes.sort(byLabel)
}

/** The artists of all sources in one list, in the order of the names. */
function mergeNodes(lists) {
  return lists.flat().sort(byLabel)
}

/** The face for the driver: a name and the address of the cover (relative paths made absolute with the box's API address). */
function faceOf(node, apiUrl) {
  if (!node) return null
  const cover = node.cover ?? ''
  return { label: node.label, cover: cover.startsWith('/') ? `${apiUrl}${cover}` : cover }
}

/** The three faces around `index` of a level for the driver; a level of one face has no neighbours (the cube does not turn). `count` is
 *  how many faces the level has: four or fewer turn as a cube, more as a polygon whose angle is 360 / count (the covers stand flatter). */
function facesOf(nodes, index, apiUrl) {
  const count = nodes.length
  if (count === 0) return null
  return {
    count,
    cur: faceOf(nodes[index], apiUrl),
    prev: count > 1 ? faceOf(nodes[(index - 1 + count) % count], apiUrl) : null,
    next: count > 1 ? faceOf(nodes[(index + 1) % count], apiUrl) : null,
  }
}

// ---- the state of the driver and the buses ---------------------------------------------------------------------------------------
// What the user reads for a problem (these are the texts the app knows and translates, so they are fixed phrases)
const PROBLEMS = {
  pins: 'Bitte die Pins DC und RST wählen: verschiedene Pins, nicht die des SPI- und I2C-Anschlusses (2, 3, 7 bis 11)',
  no_spi: 'SPI ist aus: oben einschalten, dann neu starten',
  spi_access: 'Kein Zugriff auf den SPI-Bus',
  no_i2c: 'I2C ist aus: oben einschalten, dann neu starten',
  i2c_access: 'Kein Zugriff auf den I2C-Bus',
  no_touch: 'Der Touch-Chip antwortet nicht: SDA, SCL, TP_RST und die Stromversorgung prüfen',
  touch_lost: 'Der Touch-Chip antwortet nicht mehr: Kabel prüfen',
  gpio: 'Die Pins lassen sich nicht belegen (ein anderes Programm hat sie)',
  no_python: 'Die Pakete python3-spidev und python3-lgpio fehlen',
  no_pil: 'Das Paket python3-pil fehlt',
  other: 'Fehler im Display-Programm, Näheres im Protokoll der Box',
}
const problemText = (code) => PROBLEMS[code] ?? PROBLEMS.other

/**
 * The lines of the status block: { label, value, tone } with tone ok | warn | error. `view`: { config, phase: 'starting' | 'ready' | 'error',
 * code, level: { depth, count, title } | null, spi: 'on' | 'restart' | 'off', i2c: the same }.
 */
function statusRows(view) {
  const { config } = view
  // (the buses are always told, also while something else is missing: "An" says they are found, so the buttons below need no press)
  const bus = (label, state) => ({ label, value: state === 'on' ? 'An' : state === 'restart' ? 'Eingeschaltet, die Box muss neu starten' : 'Aus', tone: state === 'on' ? 'ok' : 'warn' })
  const rows = [bus('SPI', view.spi), bus('I2C', view.i2c)]
  if (config.problem) return [{ label: 'Display', value: 'Nicht bereit', tone: 'warn' }, { label: 'Hinweis', value: problemText(config.problem), tone: 'warn' }, ...rows]
  if (view.phase === 'error') return [{ label: 'Display', value: 'Nicht bereit', tone: 'error' }, { label: 'Hinweis', value: problemText(view.code), tone: 'error' }, ...rows]
  if (view.phase !== 'ready') return [{ label: 'Display', value: 'Wird gestartet …', tone: 'warn' }, ...rows]
  rows.unshift({ label: 'Display', value: 'Bereit', tone: 'ok' })
  if (view.level) {
    rows.push({ label: 'Ebene', value: view.level.depth <= 1 ? 'Artisten' : 'Alben' })
    if (view.level.depth > 1 && view.level.title) rows.push({ label: 'Artist', value: view.level.title })
    rows.push({ label: 'Titel auf der Ebene', value: String(view.level.count) })
  } else rows.push({ label: 'Bibliothek', value: 'Noch nichts gefunden', tone: 'warn' })
  return rows
}

module.exports = {
  readConfig, needsRestart, eveningBrightness, headerChipNumber, driverArgs, readEvent, playerPathOf, tileKeyOf, heardKeyOf, startQuery,
  coverOf, categoryOf, dataNodes, folderNodes, mergeNodes, faceOf, facesOf, problemText, statusRows, PROBLEMS, BUS_PINS, ALBUMS_MAX,
}
