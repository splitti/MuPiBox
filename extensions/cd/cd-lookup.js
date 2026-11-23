// Who is this CD? The names of the tracks and the cover for an audio CD in the drive, from the internet.
//
// Order: Discogs first, then MusicBrainz.
//  - Discogs cannot be asked by the disc's table of contents (its API searches by text and by barcode only, and only with
//    an access token of the user's own). So it is asked with the barcode the disc carries (the media catalog number,
//    when the disc has one) - and its answer is taken only when its track list fits the disc (same number of tracks,
//    about the same lengths). No token, no barcode, nothing found, or no fit: the next one.
//  - MusicBrainz knows the disc by its id (made from the table of contents: exact), or by a likeness of the table of
//    contents. The cover comes from the Cover Art Archive.
// Pure logic over `fetch` (passed in), so it runs in a test without the internet.

const { createHash } = require('node:crypto')

const USER_AGENT = 'MuPiBox/5 ( https://github.com/splitti/MuPiBox )'
const TIMEOUT_MS = 10000

/**
 * MusicBrainz's disc id: SHA-1 over the first and last track and the 99 track offsets (frames, with the 2 seconds of lead-in
 * added; 0 for a track the disc does not have), the end of the disc at place 0 - in a base64 of its own.
 * `lbas`: the start of tracks first..last and then the end of the disc, as the drive tells them (without the lead-in).
 */
function musicBrainzDiscId(first, last, lbas) {
  const offsets = new Array(100).fill(0)
  offsets[0] = lbas[lbas.length - 1] + 150
  for (let i = 0; i <= last - first; i++) offsets[first + i] = lbas[i] + 150
  const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0')
  const hex8 = (n) => n.toString(16).toUpperCase().padStart(8, '0')
  const text = hex2(first) + hex2(last) + offsets.map(hex8).join('')
  return createHash('sha1').update(text).digest('base64').replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-')
}

/** The table of contents as MusicBrainz's `toc` parameter: first track, last track, end of the disc, the track starts. */
function musicBrainzToc(first, last, lbas) {
  return [first, last, lbas[lbas.length - 1] + 150, ...lbas.slice(0, -1).map((l) => l + 150)].join('+')
}

/** The track lengths of the disc in seconds, from where the tracks start (75 frames a second). */
function trackSeconds(lbas) {
  return lbas.slice(0, -1).map((start, i) => (lbas[i + 1] - start) / 75)
}

// A request that gives up after `ms` (the timer does not keep the process alive, and is gone when the answer is in)
async function request(fetchImpl, url, options, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(fetchImpl, url, headers = {}) {
  const res = await request(fetchImpl, url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } }, TIMEOUT_MS)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const creditOf = (credit) =>
  Array.isArray(credit) ? credit.map((c) => `${c.name ?? c.artist?.name ?? ''}${c.joinphrase ?? ''}`).join('').trim() : ''

/** Do the lengths of a list of tracks fit the disc's? (same count; most of them within 4 seconds - a pressing may differ) */
function fitsDisc(seconds, disc) {
  if (!disc || seconds.length !== disc.length) return false
  const known = seconds.map((s, i) => [s, disc[i]]).filter(([s]) => Number.isFinite(s) && s > 0)
  if (known.length === 0) return true // (no lengths given: the count has to do)
  const near = known.filter(([s, d]) => Math.abs(s - d) <= 4).length
  return near / known.length >= 0.8
}

/** "3:45" or "1:02:03" -> seconds; NaN when empty */
function discogsSeconds(text) {
  if (String(text ?? '').trim() === '') return Number.NaN
  const parts = String(text ?? '').split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return Number.NaN
  return parts.reduce((total, n) => total * 60 + n, 0)
}

/** Discogs by the disc's barcode; null when there is no token, no barcode, no release or none that fits. */
async function lookupDiscogs({ barcode, token, lbas }, fetchImpl) {
  if (!token || !barcode) return null
  const auth = { Authorization: `Discogs token=${token}` }
  const found = await getJson(fetchImpl, `https://api.discogs.com/database/search?type=release&barcode=${encodeURIComponent(barcode)}&per_page=5`, auth)
  const disc = trackSeconds(lbas)
  for (const hit of (found?.results ?? []).slice(0, 5)) {
    const release = await getJson(fetchImpl, `https://api.discogs.com/releases/${hit.id}`, auth)
    const tracks = (release?.tracklist ?? []).filter((t) => (t.type_ ?? 'track') === 'track')
    if (!fitsDisc(tracks.map((t) => discogsSeconds(t.duration)), disc)) continue
    const image = (release.images ?? []).find((i) => i.type === 'primary') ?? release.images?.[0]
    return {
      source: 'discogs',
      artist: (release.artists ?? []).map((a) => `${a.name.replace(/\s\(\d+\)$/, '')}${a.join && a.join !== ',' ? ` ${a.join} ` : ', '}`).join('').replace(/[,\s]+$/, ''),
      album: release.title,
      tracks: tracks.map((t, i) => ({ position: i + 1, title: t.title })),
      coverUrl: image?.uri ?? hit.cover_image ?? null,
      coverHeaders: auth,
    }
  }
  return null
}

/** MusicBrainz by the disc's id, else by the likeness of its table of contents. null when it does not know the disc. */
async function lookupMusicBrainz({ first, last, lbas }, fetchImpl) {
  const id = musicBrainzDiscId(first, last, lbas)
  const toc = musicBrainzToc(first, last, lbas)
  const url = `https://musicbrainz.org/ws/2/discid/${id}?toc=${toc}&inc=recordings+artist-credits&fmt=json`
  const found = await getJson(fetchImpl, url)
  const count = last - first + 1
  for (const release of found?.releases ?? []) {
    // the medium of the release that is this disc (by id), else one with as many tracks
    const media = release.media ?? []
    const medium = media.find((m) => (m.discs ?? []).some((d) => d.id === id)) ?? media.find((m) => (m.tracks ?? []).length === count)
    if (!medium || (medium.tracks ?? []).length !== count) continue
    return {
      source: 'musicbrainz',
      artist: creditOf(release['artist-credit']),
      album: release.title,
      tracks: medium.tracks.map((t, i) => ({ position: i + 1, title: t.title })),
      coverUrl: release['cover-art-archive']?.front ? `https://coverartarchive.org/release/${release.id}/front-500` : null,
      coverHeaders: {},
    }
  }
  return null
}

/**
 * Discogs first, then MusicBrainz. A failure of one (no internet, a refused token) is no reason to skip the other.
 * `disc`: { first, last, lbas, barcode? }; `token`: the Discogs token or ''. Resolves to the info or null; never rejects.
 */
async function lookupDisc(disc, { token = '', fetchImpl = fetch, log = () => {} } = {}) {
  if (!Array.isArray(disc?.lbas) || disc.lbas.length < 2) return null
  for (const [name, ask] of [
    ['Discogs', () => lookupDiscogs({ barcode: disc.barcode, token, lbas: disc.lbas }, fetchImpl)],
    ['MusicBrainz', () => lookupMusicBrainz(disc, fetchImpl)],
  ]) {
    try {
      const info = await ask()
      if (info) {
        log(`${name}: ${info.artist} - ${info.album}`)
        return info
      }
      log(`${name}: nothing found`)
    } catch (err) {
      log(`${name}: ${err.message}`)
    }
  }
  return null
}

/** The picture of the info as a JPEG/PNG in `bytes`, or null (a cover is nice to have, never a reason to lose the names). */
async function downloadCover(info, fetchImpl = fetch) {
  if (!info?.coverUrl) return null
  try {
    const res = await request(fetchImpl, info.coverUrl, { headers: { 'User-Agent': USER_AGENT, ...(info.coverHeaders ?? {}) }, redirect: 'follow' }, TIMEOUT_MS * 2)
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    const isImage = (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50)
    return isImage && bytes.length < 8 * 1024 * 1024 ? bytes : null
  } catch {
    return null
  }
}

module.exports = { musicBrainzDiscId, musicBrainzToc, trackSeconds, fitsDisc, discogsSeconds, lookupDiscogs, lookupMusicBrainz, lookupDisc, downloadCover }
