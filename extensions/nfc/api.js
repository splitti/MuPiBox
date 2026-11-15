// NFC extension - the API part (runs in the server of the box): starts the driver of the reader (pn5180.py, Python: Node has no way to
// speak SPI), keeps what it reports, gives a tag its medium and tells the app what it sees.
//
//   settings (which reader, which pins)  ->  logic.js
//   the driver program                   ->  runner.js, pn5180.py
//   which tag plays what                 ->  tags.js (the idea of TeddyCloud), the file tags.json in the extension's data folder
//   "NFC-Tag hinzufügen" in the library  ->  POST /arm (the medium of the open album, station or podcast), GET /armstate, POST /cancel
//   the list of the tags                 ->  GET /tags, POST /tagimage, /tagremove (with the login of the parents)
//   the status block of the reader       ->  GET /state
//   starting a medium                    ->  GET /pending, which display.js asks for: the display starts it like a tap on a tile
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { readConfig, driverScript, driverArgs, statusRows, tagNumberText } = require('./logic.js')
const { createRunner, headerChipNumber, detect } = require('./runner.js')
const tags = require('./tags.js')

const RESUME_WITHIN_MS = 30 * 60 * 1000
const PENDING_MS = 20000
const SAME_TAG_MS = 2000

exports.activate = (host) => {
  const log = host.log ?? console
  const dir = host.dir ?? __dirname
  const dataDir = host.dataDir ?? dir
  const tagsFile = path.join(dataDir, 'tags.json')
  let runner = null
  let config = readConfig({})
  let view = null
  const history = []

  // ---- the store of the tags -------------------------------------------------------------------------------------------------
  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }
  const writeJson = (file, value) => {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      const temp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 })
      fs.renameSync(temp, file)
    } catch (error) {
      log.warn(`[nfc] cannot write ${path.basename(file)}: ${error?.message ?? error}`)
    }
  }
  let data = tags.readData(readJson(tagsFile))
  const saveTags = () => writeJson(tagsFile, data)

  let armed = null // what waits for the next tag: { id, target, media, image, cover, title, until }
  let armSeq = 0
  const done = new Map() // assignment id -> what came of it: { uid, title, previous, flex }
  const remember = (id, result) => {
    done.set(id, result)
    while (done.size > 20) done.delete(done.keys().next().value)
  }
  let pending = null // a medium the display has to start: { seq, media, at }
  let seq = 0
  let inField = null // the tag that lies on the reader now (its entry)
  let paused = null // the tag whose medium was paused when it was taken off: { uid, at }
  let lastStart = { uid: '', at: 0 }

  // What a tag is called in the list (fixed phrases: the app translates the ones it knows)
  const KINDS = { library: 'SD-Karte', nas: 'NAS', spotify: 'Spotify', radio: 'Radio', rss: 'Podcast', tidal: 'TIDAL' }
  const fresh = () => ({ config, phase: config.reader === 'none' || config.problem ? 'off' : 'starting', firmware: null, product: null, errorCode: null, inField: false, last: null })
  view = fresh()

  // ---- the player ------------------------------------------------------------------------------------------------------------
  const player = async (command) => {
    try {
      const response = await fetch(`${host.playerUrl}/${command}${command.includes('?') ? '&' : '?'}src=nfc`, { signal: AbortSignal.timeout(4000) })
      return response.ok
    } catch {
      return false
    }
  }
  const playerMeta = async () => {
    try {
      const response = await fetch(`${host.playerUrl}/local`, { signal: AbortSignal.timeout(3000) })
      return response.ok ? await response.json() : null
    } catch {
      return null
    }
  }
  // (what the player reports for a pause: Spotify says `pause`, mpv `playing`)
  const isPaused = (meta) => (meta?.currentPlayer === 'spotify' ? meta.pause === true : meta?.currentPlayer === 'mplayer' ? meta.playing === false && Boolean(meta.currentType) : false)

  // What the display is to play for a medium: itself, but a podcast is a feed - the player plays an episode of it (see tags.pickEpisode)
  const playable = async (media) => {
    if (media.type !== 'rss') return media
    try {
      const response = await fetch(`${host.apiUrl}/api/rssfeed/cached?url=${encodeURIComponent(media.id)}`, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) return null
      const body = await response.json()
      if (typeof body?.rss?._error === 'string') return null
      return tags.pickEpisode(body, media)
    } catch {
      return null
    }
  }

  // A tag with a medium: it goes on where it was paused when the same tag is laid on again soon, else the display starts the medium.
  const start = async (tag) => {
    const now = Date.now()
    if (lastStart.uid === tag.uid && now - lastStart.at < SAME_TAG_MS) return
    lastStart = { uid: tag.uid, at: now }
    if (paused && paused.uid === tag.uid && now - paused.at < RESUME_WITHIN_MS) {
      paused = null
      if (isPaused(await playerMeta()) && (await player('play'))) return
    }
    paused = null
    const media = await playable(tag.media)
    if (!media) return log.warn(`[nfc] tag ${tag.uid}: no episode found for ${tag.title}`)
    pending = { seq: ++seq, media, at: now }
  }

  const onTag = async (event) => {
    const settings = (await host.settings()) ?? {}
    const now = Date.now()
    if (armed && armed.until <= now) armed = null
    const result = tags.tagLaidOn(data, armed, event, now)
    if (result.disarm) armed = null
    if (result.kind === 'ignored') return
    saveTags()
    inField = result.tag
    if (result.armedId) remember(result.armedId, { uid: result.tag.uid, title: result.tag.title, previous: result.previous ?? '', flex: result.kind === 'flex' })
    log.info(`[nfc] tag ${result.tag.uid}: ${result.kind}${result.tag.title ? ` (${result.tag.title})` : ''}`)
    if (result.kind !== 'unknown' && settings.playOnTag !== false) await start(result.tag)
  }

  const onGone = async () => {
    const tag = inField
    inField = null
    if (!tag?.media) return
    const settings = (await host.settings()) ?? {}
    // (only when this tag's medium is what plays: another album started meanwhile stays)
    if (settings.onRemove === 'pause') {
      if (await player('pause')) paused = { uid: tag.uid, at: Date.now() }
    } else if (settings.onRemove === 'stop') {
      await player('stop')
    }
  }

  const onEvent = (event) => {
    switch (event.event) {
      case 'starting':
        view.phase = 'starting'
        break
      case 'ready':
        Object.assign(view, { phase: 'ready', firmware: event.firmware, product: event.product, errorCode: null })
        log.info(`[nfc] reader ready (${[event.product, event.firmware].filter(Boolean).join(' ')})`)
        break
      case 'tag':
        // (a USB reader says when a card comes near, never when it goes: no tag stays in its field)
        view.inField = config.reader !== 'hid'
        view.last = { tech: event.tech, uid: event.uid, at: Date.now() }
        history.push(view.last)
        if (history.length > 20) history.shift()
        log.info(`[nfc] tag ${event.uid} (${event.tech})`)
        onTag(event).catch((error) => log.warn(`[nfc] tag: ${error?.message ?? error}`))
        break
      case 'gone':
        view.inField = false
        if (config.reader === 'hid') break
        onGone().catch((error) => log.warn(`[nfc] gone: ${error?.message ?? error}`))
        break
      case 'error':
        view.phase = 'error'
        view.errorCode = event.code
        log.warn(`[nfc] reader: ${event.code}: ${event.message}`)
        break
      default:
    }
  }

  // (one change after the other: the pins and the SPI device of the settings before are free before the new ones are taken)
  let chain = Promise.resolve()
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        if (runner) await runner.stop()
        runner = null
        config = readConfig(settings)
        view = fresh()
        if (config.reader === 'none') return
        if (config.problem) {
          log.warn(`[nfc] not started: ${config.problem}`)
          return
        }
        const chip = headerChipNumber(await detect())
        runner = createRunner({
          command: 'python3',
          args: [path.join(dir, driverScript(config)), ...driverArgs(config, chip)],
          onEvent,
          onEnd: (reason) => {
            // (the driver says what is wrong before it ends; if it did not - it fell over - this is all there is to say)
            if (view.phase !== 'error') Object.assign(view, { phase: 'error', errorCode: 'other' })
            view.inField = false
            log.warn(`[nfc] reader program: ${reason}`)
          },
          log,
        })
        runner.start()
        log.info(`[nfc] reader ${config.reader} started (${driverArgs(config, chip).join(' ')})`)
      })
      .catch((error) => log.warn(`[nfc] not started: ${error?.message ?? error}`))
    return chain
  }
  // (the server ends: the driver must not stay behind and hold the pins and the SPI device)
  process.once('exit', () => runner?.kill())
  if (typeof host.onSettings === 'function') host.onSettings(apply)
  Promise.resolve(host.settings()).then(apply)

  // ---- what the app shows and asks ---------------------------------------------------------------------------------------------
  // (all with the login of the parents: the tags are what the children play)
  host.route(
    'get',
    '/state',
    (_req, res) => {
      res.json({ rows: statusRows(view), reader: { ...view, config: undefined, reader: config.reader }, process: runner ? runner.state() : null, history })
    },
    { session: true },
  )

  // "NFC-Tag" in the library, "add another tag": the medium of the open album, station or podcast goes to the next tag that is laid on
  // (a tag that had one is given the new one), or - with `flex` - to the flex tag at once. `image` is the picture the user chose,
  // `cover` the one the app showed for the medium. { media, image?, cover?, flex? } -> { ok, id, state }
  host.route(
    'post',
    '/arm',
    (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const media = tags.sanitizeMedia(body.media)
      if (!media) return res.status(400).json({ ok: false, error: 'not_startable', message: 'Dieses Medium lässt sich keinem Tag zuordnen' })
      if (view.phase === 'off' || view.phase === 'error') return res.status(409).json({ ok: false, error: 'no_reader', message: 'Der NFC-Leser ist nicht bereit' })
      const image = tags.sanitizeImage(body.image)
      const cover = tags.sanitizeImage(body.cover)
      const title = tags.mediaLabel(media)
      const id = ++armSeq
      if (body.flex === true && tags.giveToFlex(data, media, Date.now(), image, cover)) {
        saveTags()
        armed = null
        remember(id, { uid: data.flex, title, previous: '', flex: true })
        return res.json({ ok: true, id, state: 'done', message: 'Der Flex-Tag hat das Medium' })
      }
      armed = { id, target: body.flex === true ? 'flex' : 'any', media, image, cover, title, until: Date.now() + tags.ARM_SECONDS * 1000 }
      res.json({ ok: true, id, state: 'waiting', seconds: tags.ARM_SECONDS })
    },
    { session: true },
  )

  // What came of an assignment (the app asks every second while its sheet is open): waiting, done (uid, title, what the tag had
  // before), or gone (cancelled, replaced by another, or the time is over)
  host.route(
    'get',
    '/armstate',
    (req, res) => {
      const id = Number(req.query.id)
      const result = done.get(id)
      if (result) return res.json({ state: 'done', ...result })
      if (armed && armed.id === id && armed.until > Date.now()) return res.json({ state: 'waiting', title: armed.title, seconds: Math.ceil((armed.until - Date.now()) / 1000) })
      res.json({ state: 'gone' })
    },
    { session: true },
  )

  host.route(
    'post',
    '/cancel',
    (req, res) => {
      const id = Number(req.body?.id)
      if (!id || armed?.id === id) armed = null
      res.json({ ok: true, message: 'Zuordnung abgebrochen' })
    },
    { session: true },
  )

  // A row of the list of tags: { id, title, text, image, imageOwn, coverPost, actions }
  const tagRow = (tag) => ({
    id: tag.uid,
    title: tag.title,
    text: [KINDS[tag.media.type], tagNumberText(config, tag.uid), data.flex === tag.uid ? 'Flex-Tag' : ''].filter(Boolean),
    image: tags.tagImage(tag),
    imageOwn: Boolean(tags.sanitizeImage(tag.image)),
    coverPost: '/api/ext/nfc/tagimage',
    actions: [{ label: 'Entfernen', post: '/api/ext/nfc/tagremove', confirm: 'Diesen Tag entfernen? Er spielt dann nichts mehr.' }],
  })
  const byRecent = (a, b) => b.assignedAt - a.assignedAt || b.lastSeen - a.lastSeen

  // The tags that have a medium, for the list on the page "Tags": { items: [...] }
  host.route(
    'get',
    '/tags',
    (_req, res) => {
      res.json({ items: Object.values(data.tags).filter((tag) => tag.media).sort(byRecent).map(tagRow) })
    },
    { session: true },
  )

  // The tags of one medium, for the sheet "NFC-Tag" of an album, station or podcast: { media } -> { items: [...] }
  host.route(
    'post',
    '/tagsfor',
    (req, res) => {
      const media = tags.sanitizeMedia(req.body?.media)
      if (!media) return res.json({ items: [] })
      const key = tags.mediumKey(media)
      res.json({ items: Object.values(data.tags).filter((tag) => tag.media && tags.mediumKey(tag.media) === key).sort(byRecent).map(tagRow) })
    },
    { session: true },
  )

  // A picture for a tag ({ id, image }; an empty image = the cover of the medium again)
  host.route(
    'post',
    '/tagimage',
    (req, res) => {
      const uid = tags.normalizeUid(req.body?.id)
      const tag = uid ? data.tags[uid] : null
      if (!tag?.media) return res.status(404).json({ ok: false, error: 'no_tag', message: 'Diesen Tag gibt es nicht mehr' })
      const wanted = String(req.body?.image ?? '')
      const image = tags.sanitizeImage(wanted)
      if (wanted !== '' && image === '') return res.status(400).json({ ok: false, error: 'bad_image', message: 'Das Bild geht nicht' })
      tag.image = image
      saveTags()
      res.json({ ok: true, message: 'Bild geändert' })
    },
    { session: true },
  )

  // A tag is taken out of the store (it is noted as new when it is laid on again)
  host.route(
    'post',
    '/tagremove',
    (req, res) => {
      const uid = tags.normalizeUid(req.body?.id)
      if (!uid || !tags.forgetTag(data, uid)) return res.status(404).json({ ok: false, error: 'no_tag', message: 'Diesen Tag gibt es nicht mehr' })
      saveTags()
      res.json({ ok: true, message: 'Tag entfernt' })
    },
    { session: true },
  )

  // What the display asks for every second: the medium to start (once - it is gone when it was handed over, and a start older
  // than a few seconds is not wanted any more: the display was away)
  host.route('get', '/pending', (_req, res) => {
    const now = Date.now()
    const command = pending && now - pending.at < PENDING_MS ? pending : null
    pending = null
    res.json(command ? { seq: command.seq, media: command.media } : {})
  })

  // (the reports of the driver, handed in directly: for the tests)
  return { feed: onEvent }
}

exports._test = { RESUME_WITHIN_MS }
