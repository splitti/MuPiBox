// NFC-Reader: which tag belongs to which medium. The idea is the one of TeddyCloud (the Toniebox server): every tag has an entry of its
// own (there: content/<uid>.json), a tag the box does not know yet is noted at its first contact, and a medium chosen in the web app is
// given to the NEXT tag that is laid on ("assign to next unknown tag"). A "flex tag" is one tag that always gets the medium chosen last.
// Plain functions and data, no files and no timers: the API part (api.js) does the reading, writing and playing.
'use strict'

const MAX_TAGS = 300
const ARM_SECONDS = 600

// What of a medium of the library is kept with a tag: what it takes to start it again (the display starts it as it starts any tile),
// not where it was left (the resume fields belong to the library, and they would be stale in a day).
const MEDIA_KEYS = [
  'type', 'category', 'artist', 'title', 'id', 'artistid', 'showid', 'playlistid', 'audiobookid', 'release_date', 'cover', 'artistcover',
  'shuffle', 'aPartOfAll', 'aPartOfAllMin', 'aPartOfAllMax', 'episodePick', 'spotify_url', 'tidalKind', 'range_from', 'range_to',
  'range_by', 'exclude_album_ids', 'nasPath', 'libraryPath', 'ownFiles', 'noResume', 'sorting', 'query',
]
const TYPES = ['library', 'nas', 'spotify', 'radio', 'rss', 'tidal']

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
    (media.type === 'tidal' && has('id') && media.tidalKind !== 'artist')
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
  return text.length <= 600 && /^(\/api\/[\w\-./%?=&~+!()*,:;@]*|\/cover\/[\w\-.%]+|https:\/\/[^\s"'<>\\]+|http:\/\/[^\s/"'<>\\]+\/cover\/[\w\-.%]+)$/.test(text) ? text : ''
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
const IDENTITY_KEYS = ['type', 'id', 'playlistid', 'showid', 'audiobookid', 'artistid', 'nasPath', 'libraryPath', 'tidalKind']

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

const emptyData = () => ({ version: 1, flex: null, tags: {} })

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
      tech: tag.tech === 'ISO15693' ? 'ISO15693' : 'ISO14443A',
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
  tag.tech = event.tech === 'ISO15693' ? 'ISO15693' : 'ISO14443A'
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

/**
 * The episode a podcast tag starts, as the medium the display plays: `body` is the answer of /api/rssfeed/cached (with `_pct` for how far
 * an episode was heard and `_done`, set by the box), `entry` the podcast the tag has. Null when the feed has no episode.
 */
function pickEpisode(body, entry) {
  const channel = body?.rss?.channel
  const raw = channel?.item
  const episodes = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((item) => typeof item?.enclosure?._attributes?.url === 'string' && item.enclosure._attributes.url !== '')
  if (episodes.length === 0) return null
  // (the order of the feed: the newest first)
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

/** The tag is forgotten: its entry is gone, a flex tag is none any more. False when it was not known. */
function forgetTag(data, uid) {
  if (!data.tags[uid]) return false
  delete data.tags[uid]
  if (data.flex === uid) data.flex = null
  return true
}

const countAssigned = (data) => Object.values(data.tags).filter((tag) => tag.media).length

module.exports = {
  MAX_TAGS, ARM_SECONDS, TARGETS, TYPES, sanitizeMedia, mediaLabel, sanitizeImage, tagImage, mediumKey, pickEpisode, normalizeUid, emptyData, readData, tagLaidOn, giveToFlex, forgetTag, countAssigned,
}
