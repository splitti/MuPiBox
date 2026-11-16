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
// an assignment waits while the app asks for it (every second while its sheet is open): a sheet closed without "Abbrechen"
// (the phone locked, the app reloaded) must not give the next tag laid on - within 10 minutes - the medium silently
const ARM_UNASKED_MS = 15000
// a tag still lying on the reader when its driver started again (settings changed, the driver fell over): reported anew,
// it does not start its medium again - unless it was taken off and laid on after that time
const AGAIN_AFTER_RESTART_MS = 90000
// the display starts a medium within a second or two of taking it - Spotify, when the box was silent, takes up to half a
// minute to start: the first new start within this time is the tag's (asked every second, see watchStart)
const NOTE_WITHIN_MS = 35000
// tags.json is written when something of it changes that matters (a new tag, a medium given); when a known tag was laid
// on only, at most this often - it was written to the SD card at every laying on (a USB reader: at every hold)
const SEEN_SAVE_MS = 6 * 60 * 60 * 1000
// the same error of the reader (not connected, a wire loose) is logged once, then again after this time at the earliest:
// the driver is started again every 10 minutes and says it again each time
const ERROR_LOG_MS = 6 * 60 * 60 * 1000

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
  let savedAt = 0
  const saveTags = () => {
    savedAt = Date.now()
    writeJson(tagsFile, data)
  }

  let armed = null // what waits for the next tag: { id, target, media, image, cover, title, until }
  let armSeq = 0
  const done = new Map() // assignment id -> what came of it: { uid, title, previous, flex }
  const remember = (id, result) => {
    done.set(id, result)
    while (done.size > 20) done.delete(done.keys().next().value)
  }
  let pending = null // a medium the display has to start: { seq, media, at, uid }
  // (not from 1: the display keeps the number of the last start it made - after a restart of the server alone a start with
  // that number again was dropped)
  let seq = Date.now()
  let inField = null // the tag that lies on the reader now (its entry)
  let paused = null // the tag whose medium was paused when it was taken off: { uid, at }
  let lastStart = { uid: '', at: 0 }
  // the start the display made for a tag: { uid, at, rss, generation } - the player's number of that playback, once known
  let handed = null
  let restarted = null // the tag in the field when the driver started again: { uid, until }

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

  // (taking the tag off pauses or stops: a tag laid on only for a moment starts nothing - not for a USB reader, which never
  // says that a card went)
  const removeMatters = (settings) => config.reader !== 'hid' && (settings.onRemove === 'pause' || settings.onRemove === 'stop')

  // A tag with a medium: what it started goes on (it plays on, or a pause is taken back - one made by taking it off only
  // within RESUME_WITHIN_MS), else the display starts the medium.
  const start = async (tag, settings) => {
    const now = Date.now()
    // (first: a tag slipped off and laid on again within the 2 s goes on - the lock below is for the same report twice)
    if (handed && handed.uid === tag.uid) {
      await noteGeneration()
      const meta = await playerMeta()
      // (only what this tag started: something else chosen meanwhile, or stopped, starts the tag's medium anew)
      if (ownPlayback(meta) && meta?.finished !== true) {
        // (laid on again while it plays - a USB reader at every hold: it plays on, it started from its beginning before)
        if (!isPaused(meta)) {
          paused = null
          lastStart = { uid: tag.uid, at: now }
          return
        }
        const pausedLong = paused && paused.uid === tag.uid && now - paused.at >= RESUME_WITHIN_MS
        if (!pausedLong && (await player('play'))) {
          paused = null
          lastStart = { uid: tag.uid, at: now }
          return
        }
      }
    }
    if (lastStart.uid === tag.uid && now - lastStart.at < SAME_TAG_MS) return
    lastStart = { uid: tag.uid, at: now }
    paused = null
    const media = await playable(tag.media)
    if (!media) return log.warn(`[nfc] tag ${tag.uid}: no episode found for ${tag.title}`)
    // (taken off while its episode was looked for: nothing starts)
    if (removeMatters(settings) && inField?.uid !== tag.uid) return log.info(`[nfc] tag ${tag.uid}: taken off before its start`)
    pending = { seq: ++seq, media, at: now, uid: tag.uid }
  }

  // The player's number of the playback the display started for the tag (it counts every new start): taken once the start
  // was made - what plays then is the tag's as long as that number stays (a podcast's next episode by a button too)
  // (the player's /local: origin - the start what plays comes from, kept by a podcast's next episode; older players: generation)
  const originOf = (meta) => (typeof meta?.origin === 'number' ? meta.origin : typeof meta?.generation === 'number' ? meta.generation : null)
  const noteGeneration = async () => {
    if (!handed || handed.generation !== null || Date.now() - handed.at > NOTE_WITHIN_MS) return
    const asked = handed
    const meta = await playerMeta()
    const origin = originOf(meta)
    // (a start refused - the tile's limit, the listening time, Spotify blocked - makes no new one: nothing is the tag's)
    if (handed === asked && handed.generation === null && origin !== null && origin !== handed.before) handed.generation = origin
  }
  // (asked every second after the hand-over until the start is there: a slow Spotify start was not seen after 4 s, and
  // taking the tag off did not pause it)
  const watchStart = (which) => {
    const timer = setInterval(() => {
      if (handed !== which || which.generation !== null || Date.now() - which.at > NOTE_WITHIN_MS) return clearInterval(timer)
      noteGeneration().catch(() => undefined)
    }, 1000)
    timer.unref?.()
  }
  const ownPlayback = (meta) => handed !== null && handed.generation !== null && originOf(meta) === handed.generation
  const playsThisTag = async (tag) => {
    if (!handed || handed.uid !== tag.uid) return false
    await noteGeneration()
    return ownPlayback(await playerMeta())
  }

  const onTag = async (event) => {
    const settings = (await host.settings()) ?? {}
    const now = Date.now()
    if (armed && (armed.until <= now || now - armed.asked > ARM_UNASKED_MS)) armed = null
    const known = Boolean(data.tags[tags.normalizeUid(event?.uid) ?? ''])
    const result = tags.tagLaidOn(data, armed, event, now)
    if (result.disarm) armed = null
    if (result.kind === 'ignored') return
    if (!known || result.armedId || result.kind === 'assigned' || result.kind === 'flex' || now - savedAt >= SEEN_SAVE_MS) saveTags()
    const again = restarted && restarted.uid === result.tag.uid && now < restarted.until
    restarted = null
    inField = result.tag
    if (result.armedId) remember(result.armedId, { uid: result.tag.uid, title: result.tag.title, previous: result.previous ?? '', flex: result.kind === 'flex' })
    log.info(`[nfc] tag ${result.tag.uid}: ${result.kind}${result.tag.title ? ` (${result.tag.title})` : ''}`)
    // (the tag that lay there while the driver started again: its medium plays already)
    if (again && !result.armedId) return
    if (result.kind !== 'unknown' && settings.playOnTag !== false) await start(result.tag, settings)
  }

  const onGone = async () => {
    const tag = inField
    inField = null
    if (!tag?.media) return
    const settings = (await host.settings()) ?? {}
    if (settings.onRemove !== 'pause' && settings.onRemove !== 'stop') return
    // (laid on only for a moment: its start the display has not taken yet is not made)
    if (pending?.uid === tag.uid) {
      pending = null
      return
    }
    // (only when this tag's medium is what plays: another album started meanwhile on the display stays)
    if (!(await playsThisTag(tag))) return
    if (settings.onRemove === 'pause') {
      if (await player('pause')) paused = { uid: tag.uid, at: Date.now() }
    } else if (settings.onRemove === 'stop') {
      await player('stop')
    }
  }

  let lastError = { code: '', at: 0 } // the last error of the reader that was logged
  const onEvent = (event) => {
    switch (event.event) {
      case 'starting':
        view.phase = 'starting'
        break
      case 'ready':
        lastError = { code: '', at: 0 }
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
        if (event.code !== lastError.code || Date.now() - lastError.at >= ERROR_LOG_MS) {
          lastError = { code: event.code, at: Date.now() }
          log.warn(`[nfc] reader: ${event.code}: ${event.message}`)
        }
        break
      default:
    }
  }

  // (one change after the other: the pins and the SPI device of the settings before are free before the new ones are taken)
  let chain = Promise.resolve()
  let running = '' // the driver and its arguments that run now
  const apply = (settings) => {
    chain = chain
      .then(async () => {
        const next = readConfig(settings)
        const chip = next.reader === 'none' || next.problem ? 0 : headerChipNumber(await detect())
        const wanted = next.reader === 'none' || next.problem ? '' : JSON.stringify([driverScript(next), ...driverArgs(next, chip)])
        // (only another setting of the app - on taking off, start on laying on: the driver goes on, the medium plays on)
        if (runner && wanted !== '' && wanted === running && view.phase !== 'error') {
          config = next
          view.config = next
          return
        }
        if (runner) {
          await runner.stop()
          // (the tag on the reader is reported again by the new driver: no new start of what plays - not for a USB reader,
          // which says only when a card comes, never when it goes: its last card lies there no longer)
          if (inField && config.reader !== 'hid') restarted = { uid: inField.uid, until: Date.now() + AGAIN_AFTER_RESTART_MS }
        }
        runner = null
        running = ''
        inField = null
        config = next
        view = fresh()
        if (config.reader === 'none') return
        if (config.problem) {
          log.warn(`[nfc] not started: ${config.problem}`)
          return
        }
        running = wanted
        runner = createRunner({
          command: 'python3',
          args: [path.join(dir, driverScript(config)), ...driverArgs(config, chip)],
          onEvent,
          onEnd: (reason, isNew = true) => {
            // (the driver says what is wrong before it ends; if it did not - it fell over - this is all there is to say)
            if (view.phase !== 'error') Object.assign(view, { phase: 'error', errorCode: 'other' })
            view.inField = false
            if (inField && config.reader !== 'hid') restarted = { uid: inField.uid, until: Date.now() + AGAIN_AFTER_RESTART_MS }
            inField = null
            if (isNew) log.warn(`[nfc] reader program: ${reason}`)
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
      armed = { id, target: body.flex === true ? 'flex' : 'any', media, image, cover, title, until: Date.now() + tags.ARM_SECONDS * 1000, asked: Date.now() }
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
      if (armed && armed.id === id && armed.until > Date.now() && Date.now() - armed.asked <= ARM_UNASKED_MS) {
        armed.asked = Date.now()
        return res.json({ state: 'waiting', title: armed.title, seconds: Math.ceil((armed.until - Date.now()) / 1000) })
      }
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
  host.route('get', '/pending', async (_req, res) => {
    // (what plays before the display starts the tag's medium: only a start after it is the tag's)
    const origin = pending ? originOf(await playerMeta()) : null
    const now = Date.now()
    const command = pending && now - pending.at < PENDING_MS ? pending : null
    pending = null
    if (command) {
      handed = { uid: command.uid, at: now, before: origin, generation: null }
      // (the display starts it within a second or two - Spotify after a silence later: its number is taken then, before
      // another start can come)
      watchStart(handed)
    }
    res.json(command ? { seq: command.seq, media: command.media } : {})
  })

  // (the reports of the driver, handed in directly: for the tests)
  return { feed: onEvent }
}

exports._test = { RESUME_WITHIN_MS }
