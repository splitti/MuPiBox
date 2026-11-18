// NFC-Reader: which tag belongs to which medium. The idea is the one of TeddyCloud (the Toniebox server): every tag has an entry of its
// own (there: content/<uid>.json), a tag the box does not know yet is noted at its first contact, and a medium chosen in the web app is
// given to the NEXT tag that is laid on ("assign to next unknown tag"). A "flex tag" is one tag that always gets the medium chosen last.
// Plain functions and data, no files and no timers: the API part (api.js) does the reading, writing and playing.
'use strict'

const crypto = require('node:crypto')

const MAX_TAGS = 300
const ARM_SECONDS = 600

// What of a medium of the library is kept with a tag: what it takes to start it again (the display starts it as it starts any tile),
// not where it was left (the resume fields belong to the library, and they would be stale in a day).
const MEDIA_KEYS = [
  'type', 'category', 'artist', 'title', 'id', 'artistid', 'showid', 'playlistid', 'audiobookid', 'release_date', 'cover', 'artistcover',
  'shuffle', 'aPartOfAll', 'aPartOfAllMin', 'aPartOfAllMax', 'episodePick', 'spotify_url', 'tidalKind', 'range_from', 'range_to',
  'range_by', 'exclude_album_ids', 'jellyfinKind', 'audibleKind', 'nasPath', 'libraryPath', 'ownFiles', 'noResume', 'sorting', 'query',
]
const TYPES = ['library', 'nas', 'spotify', 'radio', 'rss', 'tidal', 'jellyfin', 'audible']

/** The part of a medium that is kept; null if it is none or cannot be started (a folder that only opens the next level, an artist). */
function sanitizeMedia(raw) {
  if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type)) return null
  if (raw.libraryIsContainer || raw.nasIsContainer) return null
  const media = {}
  for (const key of MEDIA_KEYS) {
    const value = raw[key]
    if (typeof value === 'string') media[key] = value.slice(0, 600)
    else if (typeof value === 'number' || typeof value === 'boolean') media[key] = value
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) media[key] = value.slice(0, 200).map((v) => v.slice(0, 80))
  }
  if (!media.category) media.category = 'audiobook'
  const has = (k) => typeof media[k] === 'string' && media[k] !== ''
  const startable =
    (media.type === 'library' && (has('libraryPath') || (has('artist') && has('title')))) ||
    (media.type === 'nas' && has('nasPath')) ||
    (media.type === 'spotify' && (has('id') || has('playlistid') || has('showid') || has('audiobookid')) && !(has('artistid') && !has('id') && !has('playlistid'))) ||
    ((media.type === 'radio' || media.type === 'rss') && has('id')) ||
    (media.type === 'tidal' && has('id') && media.tidalKind !== 'artist') ||
    // (Jellyfin: an album, a playlist or an audiobook - a whole artist opens the list of its albums; Audible: one book - a whole
    // series opens the list of its books)
    (media.type === 'jellyfin' && has('id') && ['album', 'playlist', 'book'].includes(media.jellyfinKind)) ||
    (media.type === 'audible' && has('id') && media.audibleKind === 'book')
  return startable ? media : null
}

/** The name of a medium as the user reads it ("Title – Artist"), short enough for a field of the app. */
function mediaLabel(media) {
  const title = String(media?.title ?? '').trim()
  const artist = String(media?.artist ?? '').trim()
  const text = title && artist && title !== artist ? `${title} – ${artist}` : title || artist || String(media?.libraryPath ?? media?.id ?? '').split('/').pop() || 'Medium'
  return text.slice(0, 90)
}

/** A picture a tag shows in the list of the app: an address of the box (/api/...) or of the web (https://...); '' if it is none. */
function sanitizeImage(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > 600) return ''
  // (an own picture comes as http://<box>/cover/<name>; it is kept as /cover/<name>, so it loads whatever address the box is
  // reached by - the host name of the box does not resolve everywhere)
  const own = /^http:\/\/[^\s/"'<>\\]+(\/cover\/[\w\-.%]+)$/.exec(text)
  if (own) return own[1]
  return /^(\/api\/[\w\-./%?=&~+!()*,:;@]*|\/cover\/[\w\-.%]+|https:\/\/[^\s"'<>\\]+)$/.test(text) ? text : ''
}

/** The picture of a tag: the one it was given, else the cover the app showed for its medium when it was assigned (a podcast or a
 *  Spotify entry has none of its own in the data, the app asks the service), else the cover the medium carries ('' if there is none). */
function tagImage(tag) {
  return sanitizeImage(tag?.image) || sanitizeImage(tag?.cover) || sanitizeImage(tag?.media?.cover) || serviceCover(tag?.media)
}

// Where the box itself gets the cover of a podcast or a Spotify entry (the same addresses the app uses for the tiles): a tag that was
// assigned before the app handed the cover over still shows one.
function serviceCover(media) {
  if (!media) return ''
  if (media.type === 'rss' && media.id) return sanitizeImage(`/api/rssfeed/cover?url=${encodeURIComponent(media.id)}&w=400`)
  if (media.type !== 'spotify') return ''
  const ref = media.id ? ['album', media.id] : media.playlistid ? ['playlist', media.playlistid] : media.showid ? ['show', media.showid] : media.audiobookid ? ['audiobook', media.audiobookid] : null
  return ref ? sanitizeImage(`/api/spotify/cover-for/${ref[0]}/${encodeURIComponent(ref[1])}`) : ''
}

// what makes a medium the same medium (not where it was left, not its picture)
const IDENTITY_KEYS = ['type', 'id', 'playlistid', 'showid', 'audiobookid', 'artistid', 'nasPath', 'libraryPath', 'tidalKind', 'jellyfinKind', 'audibleKind']

/** A string that is the same for the same medium - the library entries without a path are told apart by artist and title. */
function mediumKey(media) {
  if (!media || typeof media !== 'object') return ''
  const parts = IDENTITY_KEYS.map((key) => String(media[key] ?? ''))
  if (media.type === 'library' && !media.libraryPath) parts.push(String(media.artist ?? ''), String(media.title ?? ''))
  return JSON.stringify(parts)
}

/** "04a1-b2:c3" -> "04A1B2C3" (what the driver reports, in the form the store keeps); null if it is no UID. */
function normalizeUid(value) {
  const uid = String(value ?? '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
  return /^[0-9A-F]{8,20}$/.test(uid) ? uid : null
}

// (the kind of a tag: a USB reader gives a number as typed, no bytes of a chip - the list shows it as it is)
const techOf = (tech) => (tech === 'ISO15693' || tech === 'HID' ? tech : 'ISO14443A')

// (assignmentsSha: the digest of the assignments as the file of their own held them when tags.json was written last - see api.js)
const emptyData = () => ({ version: 1, flex: null, assignmentsSha: '', tags: {} })

/** What was read from tags.json as data the code can rely on (a damaged or foreign file gives an empty store, never an error). */
function readData(raw) {
  const data = emptyData()
  if (!raw || typeof raw !== 'object' || typeof raw.tags !== 'object' || raw.tags === null) return data
  for (const [key, tag] of Object.entries(raw.tags)) {
    const uid = normalizeUid(key)
    if (!uid || !tag || typeof tag !== 'object') continue
    const media = sanitizeMedia(tag.media)
    data.tags[uid] = {
      uid,
      tech: techOf(tag.tech),
      media,
      title: media ? mediaLabel(media) : '',
      image: media ? sanitizeImage(tag.image) : '',
      cover: media ? sanitizeImage(tag.cover) : '',
      firstSeen: Number(tag.firstSeen) || 0,
      lastSeen: Number(tag.lastSeen) || 0,
      assignedAt: media ? Number(tag.assignedAt) || 0 : 0,
      count: Math.max(0, Math.trunc(Number(tag.count) || 0)),
    }
  }
  const flex = normalizeUid(raw.flex)
  data.flex = flex && data.tags[flex] ? flex : null
  data.assignmentsSha = typeof raw.assignmentsSha === 'string' && /^[0-9a-f]{64}$/.test(raw.assignmentsSha) ? raw.assignmentsSha : ''
  return data
}

/** Keeps the store at its size: the oldest tags without a medium go first, then the longest unused. */
function prune(data) {
  const uids = Object.keys(data.tags)
  if (uids.length <= MAX_TAGS) return
  const rank = (uid) => (data.tags[uid].media ? 1 : 0) * 1e15 + data.tags[uid].lastSeen
  uids.sort((a, b) => rank(a) - rank(b))
  for (const uid of uids.slice(0, uids.length - MAX_TAGS)) {
    if (uid !== data.flex) delete data.tags[uid]
  }
}

const TARGETS = ['new', 'any', 'flex']

/**
 * A tag is laid on. `armed` is what waits for the next tag, `{ target, media, until }` or null:
 *   new   the next tag that has no medium yet gets it (a tag that has one plays it, the waiting goes on)
 *   any   the next tag gets it, a medium it had before is replaced
 *   flex  the next tag becomes the flex tag and gets it
 * `armed.image` is the picture the user gave the tag (else `armed.cover`, the cover the app showed, else the one of the medium), `armed.id`
 * says which assignment it was.
 * Changes `data` and says what happened: `{ kind, tag, previous, armedId, disarm }` with kind
 *   'play'      a known tag: its medium plays
 *   'assigned'  the medium of the waiting assignment was given to it (it plays)
 *   'flex'      it is the flex tag now (it plays)
 *   'unknown'   it has no medium: it is noted, nothing plays
 *   'kept'      the assignment is for new tags and this one has a medium: it plays its own, the assignment waits on
 * `disarm` is true when the waiting is over.
 */
function tagLaidOn(data, armed, event, now) {
  const uid = normalizeUid(event?.uid)
  if (!uid) return { kind: 'ignored', tag: null, disarm: false }
  let tag = data.tags[uid]
  if (!tag) {
    tag = data.tags[uid] = { uid, tech: 'ISO14443A', media: null, title: '', image: '', cover: '', firstSeen: now, lastSeen: now, assignedAt: 0, count: 0 }
  }
  tag.tech = techOf(event.tech)
  tag.lastSeen = now
  tag.count += 1
  const waiting = armed && armed.media && now < armed.until ? armed : null
  let result = { kind: tag.media ? 'play' : 'unknown', tag, disarm: false }
  if (waiting) {
    const give = waiting.target === 'new' ? !tag.media : true
    if (give) {
      const previous = tag.media ? tag.title : ''
      if (waiting.target === 'flex') data.flex = uid
      tag.media = waiting.media
      tag.title = mediaLabel(waiting.media)
      tag.image = sanitizeImage(waiting.image)
      tag.cover = sanitizeImage(waiting.cover)
      tag.assignedAt = now
      result = { kind: waiting.target === 'flex' ? 'flex' : 'assigned', tag, previous, armedId: waiting.id ?? null, disarm: true }
    } else {
      result = { kind: 'kept', tag, disarm: false }
    }
  }
  prune(data)
  return result
}

// ---- a podcast ------------------------------------------------------------------------------------------------------------
// A podcast of the library is a feed, and the player plays one episode: what a tap on the tile does is a list of episodes to choose
// from. A tag has no list - it starts the episode that fits: the one begun and not finished, else the newest not yet heard.

const feedText = (value) => (typeof value === 'string' ? value : typeof value?._cdata === 'string' ? value._cdata : typeof value?._text === 'string' ? value._text : '')
// (a picture of a feed through the box's cache, as the app asks for the covers of the tiles)
const feedPicture = (url) => (!url ? undefined : url.startsWith('/rss-covers/') ? `/api/rssfeed/image?local=${encodeURIComponent(url.slice('/rss-covers/'.length))}&w=400` : `/api/rssfeed/image?url=${encodeURIComponent(url)}&w=400`)
// (what the entry says about how to play it goes along with the episode, as the app copies it)
const ENTRY_KEYS = ['artistcover', 'shuffle', 'aPartOfAll', 'aPartOfAllMin', 'aPartOfAllMax', 'episodePick', 'sorting']

// The episodes of the podcast's tile in the order of its list on the display - the parents' choice (episodePick: the newest
// or oldest N, episodes A to B; the older aPartOfAll) and the entry's sorting, the newest first unless it says otherwise.
// The same as the box's server does for "next" in the player (backend-api episode-neighbour.ts, episode-pick.ts).
// offline: the feed holds only the episodes on the SD card - the chosen ones already, no choice is applied again.
const dateOf = (item) => Date.parse(feedText(item.pubDate))
function newestFirst(items) {
  return items
    .map((item, index) => ({ item, at: Number.isFinite(dateOf(item)) ? dateOf(item) : -index - 1e15 }))
    .sort((a, b) => b.at - a.at)
    .map((entry) => entry.item)
}
function pickEpisodes(list, pick) {
  const m = /^(?:(newest|oldest):(\d{1,4})|(range|span):(\d{1,5})-(\d{1,5}))$/.exec(typeof pick === 'string' ? pick : '')
  if (!m) return list
  const n = list.length
  if (m[1] === 'newest') return list.slice(0, Number(m[2]))
  if (m[1] === 'oldest') return list.slice(Math.max(0, n - Number(m[2])))
  const from = Math.min(Number(m[4]), Number(m[5]))
  const to = Math.max(Number(m[4]), Number(m[5]))
  if (m[3] === 'span') return list.slice(from, to + 1)
  return list.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}
function tileOrder(items, entry, offline) {
  let list = items
  if (!offline && entry?.episodePick) list = pickEpisodes(newestFirst(list), entry.episodePick)
  else if (entry?.aPartOfAll) list = list.slice(Math.max(0, (Number(entry.aPartOfAllMin) || 1) - 1), Number(entry.aPartOfAllMax) || list.length)
  const sorting = entry?.sorting
  if (sorting === 'AlphabeticalAscending' || sorting === 'AlphabeticalDescending') {
    const sign = sorting === 'AlphabeticalAscending' ? 1 : -1
    return [...list].sort((a, b) => sign * feedText(a.title).localeCompare(feedText(b.title), undefined, { numeric: true, sensitivity: 'base' }))
  }
  const byDate = newestFirst(list)
  if (sorting !== 'ReleaseDateAscending') return byDate
  const dated = byDate.filter((item) => Number.isFinite(dateOf(item)))
  return [...dated.reverse(), ...byDate.filter((item) => !Number.isFinite(dateOf(item)))]
}

/**
 * The episode a podcast tag starts, as the medium the display plays: `body` is the answer of /api/rssfeed/cached (with `_pct` for how far
 * an episode was heard and `_done`, set by the box), `entry` the podcast the tag has. Among the episodes its tile shows, in their order:
 * the one begun, else the first not heard (the newest unless the entry sorts otherwise), else the first. Null when there is none.
 */
function pickEpisode(body, entry) {
  const channel = body?.rss?.channel
  const raw = channel?.item
  const all = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((item) => typeof item?.enclosure?._attributes?.url === 'string' && item.enclosure._attributes.url !== '')
  const episodes = tileOrder(all, entry, body?.rss?._offline === true)
  if (episodes.length === 0) return null
  const open = episodes.filter((item) => item._done !== true)
  const item = open.find((it) => typeof it._pct === 'number' && it._pct > 0) ?? open[0] ?? episodes[0]
  const picture = item['itunes:image']?._attributes?.href
  const media = {
    id: item.enclosure._attributes.url,
    artist: feedText(channel.title) || String(entry?.artist ?? ''),
    title: feedText(item.title) || 'Episode',
    release_date: feedText(item.pubDate),
    duration: feedText(item['itunes:duration']),
    type: 'rss',
    category: entry?.category || 'audiobook',
  }
  const cover = feedPicture(typeof picture === 'string' ? picture : '')
  if (cover) media.cover = cover
  const artistcover = feedPicture(feedText(channel.image?.url))
  if (artistcover) media.artistcover = artistcover
  for (const key of ENTRY_KEYS) if (entry?.[key] != null) media[key] = entry[key]
  if (body.rss._offline === true) media.offlineView = true
  return media
}

/** The flex tag gets the medium chosen now without being laid on (TeddyCloud: "this UID always gets the audio selected in the web
 *  interface"). False when there is no flex tag yet: the assignment waits for one. */
function giveToFlex(data, media, now, image = '', cover = '') {
  const tag = data.flex ? data.tags[data.flex] : null
  if (!tag) return false
  tag.media = media
  tag.title = mediaLabel(media)
  tag.image = sanitizeImage(image)
  tag.cover = sanitizeImage(cover)
  tag.assignedAt = now
  return true
}

/** A known tag gets another medium (the "change tag" of the page of tags): its title, cover and picture go with it, the tag stays what it
 *  was otherwise (flex or not). False when the tag is not known. */
function giveToTag(data, uid, media, now, cover = '') {
  const tag = data.tags[uid]
  if (!tag) return false
  tag.media = media
  tag.title = mediaLabel(media)
  tag.image = ''
  tag.cover = sanitizeImage(cover)
  tag.assignedAt = now
  return true
}

/** The tag is forgotten: its entry is gone, a flex tag is none any more. False when it was not known. */
function forgetTag(data, uid) {
  if (!data.tags[uid]) return false
  delete data.tags[uid]
  if (data.flex === uid) data.flex = null
  return true
}

// ---- the list of the tags as a file ---------------------------------------------------------------------------------------------
// The assignments - which tag plays what - are kept in a file of their own (api.js: tag-assignments.json, with copies) and can be saved
// and taken in again by the user on the page of the tags. The same format serves for all of it. Only tags with a medium are in it: the
// others carry nothing worth keeping (when they were laid on, how often).
const EXPORT_FORMAT = 'mupibox-nfc-tags'

/** The tags that have a medium, as the file holds them: { format, version, exportedAt, flex, count, tags: [{ uid, tech, title, media, image, cover, assignedAt }] }. */
function exportData(data, now = Date.now()) {
  const list = Object.values(data.tags)
    .filter((tag) => tag.media)
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
    .map((tag) => ({ uid: tag.uid, tech: tag.tech, title: tag.title, media: tag.media, image: tag.image, cover: tag.cover, assignedAt: tag.assignedAt }))
  const flex = data.flex && data.tags[data.flex]?.media ? data.flex : null
  return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date(now).toISOString(), flex, count: list.length, tags: list }
}

/** A string that is the same for the same assignments (not for when it was exported): what tells whether two stores agree. */
function assignmentsDigest(data) {
  const { tags: list, flex } = exportData(data, 0)
  return crypto.createHash('sha256').update(JSON.stringify({ flex, tags: list.map(({ uid, tech, media, image, cover, assignedAt }) => ({ uid, tech, media, image, cover, assignedAt })) })).digest('hex')
}

/**
 * What a file of tags says, checked entry by entry: { ok: true, flex, tags: [{ uid, tech, media, image, cover, assignedAt }], skipped } or
 * { ok: false, error }. An entry without a usable UID or a medium the box cannot start is skipped (and counted), never taken in. Also read
 * is the tags.json of the extension itself (its tags are a map, not a list).
 */
function parseImport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'bad_format' }
  if (raw.format !== undefined && raw.format !== EXPORT_FORMAT) return { ok: false, error: 'bad_format' }
  const source = Array.isArray(raw.tags) ? raw.tags : raw.tags && typeof raw.tags === 'object' ? Object.entries(raw.tags).map(([uid, tag]) => ({ uid, ...(tag && typeof tag === 'object' ? tag : {}) })) : null
  if (!source) return { ok: false, error: 'bad_format' }
  const byUid = new Map()
  let skipped = 0
  for (const entry of source) {
    const uid = normalizeUid(entry?.uid)
    const media = sanitizeMedia(entry?.media)
    if (!uid || !media || (!byUid.has(uid) && byUid.size >= MAX_TAGS)) {
      skipped += 1
      continue
    }
    byUid.set(uid, { uid, tech: techOf(entry.tech), media, image: sanitizeImage(entry.image), cover: sanitizeImage(entry.cover), assignedAt: Number(entry.assignedAt) || 0 })
  }
  const flex = normalizeUid(raw.flex)
  return { ok: true, flex: flex && byUid.has(flex) ? flex : null, tags: [...byUid.values()], skipped }
}

/**
 * Takes the tags of a parsed file into the store: a tag it does not know is added, one it knows gets the medium of the file (what was
 * seen of it stays). With `replace` the tags that are not in the file lose their medium (a store put back as the file has it). Says what was
 * done: { added, replaced, removed, skipped }.
 */
function applyImport(data, parsed, now, { replace = false } = {}) {
  let added = 0
  let replaced = 0
  let removed = 0
  const inFile = new Set(parsed.tags.map((tag) => tag.uid))
  if (replace) {
    for (const tag of Object.values(data.tags)) {
      if (tag.media && !inFile.has(tag.uid)) {
        Object.assign(tag, { media: null, title: '', image: '', cover: '', assignedAt: 0 })
        removed += 1
      }
    }
  }
  for (const entry of parsed.tags) {
    const known = data.tags[entry.uid]
    if (known?.media) replaced += 1
    else added += 1
    // (a new tag counts as seen now: with lastSeen 0 the store's pruning took it for the longest unused and dropped it at once, while
    // the answer said it was added)
    const tag = known ?? (data.tags[entry.uid] = { uid: entry.uid, tech: entry.tech, media: null, title: '', image: '', cover: '', firstSeen: now, lastSeen: now, assignedAt: 0, count: 0 })
    Object.assign(tag, { media: entry.media, title: mediaLabel(entry.media), image: entry.image, cover: entry.cover, assignedAt: entry.assignedAt })
    if (!known) tag.tech = entry.tech
  }
  if (parsed.flex) data.flex = parsed.flex
  else if (replace) data.flex = null
  if (data.flex && !data.tags[data.flex]?.media) data.flex = null
  prune(data)
  return { added, replaced, removed, skipped: parsed.skipped }
}

// ---- the list of the tags as a table (CSV, which Excel opens) --------------------------------------------------------------------
// One row for each tag with a medium. The columns up to "Cover" are to read (and to write by hand: a new row with a UID, a kind
// and an address is a tag); the last column holds the whole medium as JSON, so that saving and taking in again loses nothing - when
// it is there it wins, when it is empty the medium is made from the columns before it. Semicolons (what German Excel splits at),
// a byte order mark (so that umlauts arrive), CR LF at the end of a line.
const CSV_COLUMNS = ['UID', 'Titel', 'Art', 'Kategorie', 'Interpret', 'Adresse', 'Flex-Tag', 'Bild', 'Cover', 'Medium (technisch)']

// (a cell Excel would take for a formula gets a ' in front, as OWASP says; taking in again takes it off)
const csvCell = (value) => {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// (the address a medium is found at: the folder, the path on the NAS, the id of the album, the stream. Jellyfin has albums, playlists
// and audiobooks under ids of one kind: its address says which, "album:<id>", "playlist:<id>", "book:<id>" - an id alone is an album
// (its ids have no colon), another word ("artist:<id>") is no medium a tag can start. Audible has books only: the address is the ASIN)
const addressOf = (media) => {
  if (media.type === 'library') return media.libraryPath ?? ''
  if (media.type === 'nas') return media.nasPath ?? ''
  if (media.type === 'spotify') return media.id || media.playlistid || media.showid || media.audiobookid || ''
  if (media.type === 'jellyfin') return media.id ? `${media.jellyfinKind}:${media.id}` : ''
  return media.id ?? ''
}
const ADDRESS_KEY = { library: 'libraryPath', nas: 'nasPath', spotify: 'id', radio: 'id', rss: 'id', tidal: 'id', jellyfin: 'id', audible: 'id' }
// (what a row written by hand gives the medium besides its address: the kind of a Jellyfin or an Audible entry)
const kindOf = (type, address) => {
  if (type === 'audible') return { id: address.replace(/^book:/i, ''), audibleKind: 'book' }
  if (type !== 'jellyfin') return { [ADDRESS_KEY[type]]: address }
  const m = /^([a-z]+):(.+)$/i.exec(address)
  return m ? { id: m[2], jellyfinKind: m[1].toLowerCase() } : { id: address, jellyfinKind: 'album' }
}

/** The tags with a medium as a table: a string (with the byte order mark) that Excel opens with a double click. */
function exportCsv(data, now = Date.now()) {
  const file = exportData(data, now)
  const rows = file.tags.map((tag) => [
    tag.uid.match(/.{1,2}/g).join(':'),
    tag.media.title ?? '',
    tag.media.type,
    tag.media.category ?? '',
    tag.media.artist ?? '',
    addressOf(tag.media),
    tag.uid === file.flex ? 'ja' : '',
    tag.image || '',
    tag.cover || '',
    JSON.stringify(tag.media),
  ])
  return `﻿${[CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** The cells of a text in CSV: rows of strings. Quotes may hold the delimiter, a doubled quote and a line break. */
function parseCsv(text) {
  const head = text.split(/\r?\n/, 1)[0]
  const count = (ch) => head.split(ch).length - 1
  const delimiter = [';', ',', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// (the names of the columns as a person may write them: case, spaces and hyphens do not matter, English works too)
const COLUMN_NAMES = {
  uid: 'uid', nummer: 'uid',
  titel: 'title', title: 'title',
  art: 'type', type: 'type', typ: 'type',
  kategorie: 'category', category: 'category',
  interpret: 'artist', artist: 'artist',
  adresse: 'address', address: 'address', pfad: 'address', path: 'address',
  flextag: 'flex', flex: 'flex',
  bild: 'image', image: 'image',
  cover: 'cover',
  mediumtechnisch: 'medium', medium: 'medium', technisch: 'medium',
}
const TYPE_NAMES = { bibliothek: 'library', sdkarte: 'library', library: 'library', nas: 'nas', spotify: 'spotify', radio: 'radio', podcast: 'rss', rss: 'rss', tidal: 'tidal', jellyfin: 'jellyfin', audible: 'audible' }
const YES = /^(ja|yes|y|x|1|true|wahr)$/i

/** What a table says, checked like a file of tags (see parseImport): { ok, flex, tags, skipped } or { ok: false, error }. */
function parseTable(text) {
  const rows = parseCsv(String(text ?? '').replace(/^﻿/, ''))
  if (rows.length === 0) return { ok: false, error: 'bad_format' }
  const columns = rows[0].map((name) => COLUMN_NAMES[name.toLowerCase().replace(/[\s\-()_]/g, '')] ?? null)
  if (!columns.includes('uid')) return { ok: false, error: 'bad_format' }
  const untick = (value) => String(value ?? '').trim().replace(/^'([=+\-@\t\r])/, '$1')
  const entries = []
  let flex = null
  for (const row of rows.slice(1)) {
    const cells = {}
    columns.forEach((name, i) => {
      if (name && cells[name] === undefined) cells[name] = untick(row[i])
    })
    let media = null
    if (cells.medium) {
      try {
        media = JSON.parse(cells.medium)
      } catch {
        media = null
      }
    }
    if (!media) {
      const type = TYPE_NAMES[(cells.type ?? '').toLowerCase().replace(/[\s\-]/g, '')]
      media = type ? { type, category: cells.category || (type === 'radio' ? 'music' : ''), artist: cells.artist ?? '', title: cells.title ?? '', ...kindOf(type, cells.address ?? '') } : null
    }
    entries.push({ uid: cells.uid, media, image: cells.image ?? '', cover: cells.cover ?? '' })
    if (!flex && YES.test(cells.flex ?? '')) flex = cells.uid
  }
  return parseImport({ flex, tags: entries })
}

/** A file the user chose, as text: the JSON of "Tags exportieren" in the old form, or a table. */
function parseText(text) {
  const clean = String(text ?? '').replace(/^﻿/, '').trim()
  if (clean[0] === '{' || clean[0] === '[') {
    try {
      return parseImport(JSON.parse(clean))
    } catch {
      return { ok: false, error: 'bad_format' }
    }
  }
  return clean ? parseTable(clean) : { ok: false, error: 'bad_format' }
}

const countAssigned = (data) => Object.values(data.tags).filter((tag) => tag.media).length

module.exports = {
  MAX_TAGS, ARM_SECONDS, TARGETS, TYPES, sanitizeMedia, mediaLabel, sanitizeImage, tagImage, mediumKey, pickEpisode, normalizeUid, emptyData, readData, EXPORT_FORMAT, exportData, assignmentsDigest, parseImport, applyImport, exportCsv, parseTable, parseText, tagLaidOn, giveToFlex, giveToTag, forgetTag, countAssigned,
}
