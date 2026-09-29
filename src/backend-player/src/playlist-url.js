'use strict'

const dns = require('node:dns').promises
const net = require('node:net')

// A radio link can point at a playlist (m3u / m3u8 / pls) instead of at the stream itself. mplayer opens such a
// link as one file and does not play what is listed in it, so the playlist is opened here and the FIRST stream of
// the list is played.
//
//   - a plain list (one address per line, optionally with #EXTINF lines) or a .pls file: the first address is used
//   - a playlist inside a playlist is followed (up to MAX_DEPTH levels)
//   - relative addresses are completed with the address of the playlist
//   - a .m3u8 with #EXT-X tags is HLS, i.e. the stream itself: mplayer plays it as it is, the address stays
//   - if the playlist can't be read (no answer, error, empty, no usable address) the original address is used, as before

const PLAYLIST_EXTENSION = /\.(m3u8?|pls)$/i
const STREAM_ADDRESS = /^(https?|mms|mmsh|rtsp|rtmp):\/\//i
const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`)
const NUL = String.fromCharCode(0)
const MAX_DEPTH = 3
const MAX_BYTES = 256 * 1024
const MAX_ADDRESS_LENGTH = 2048
const TIMEOUT_MS = 8000 // for the whole resolve, all levels together
const MAX_REDIRECTS = 3

function isPlaylistUrl(url) {
  try {
    return PLAYLIST_EXTENSION.test(new URL(url).pathname)
  } catch {
    return false
  }
}

// The first usable stream address of a playlist text: { hls: true } for an HLS list, { url } for a list, or
// undefined when there is none.
function firstEntry(text, baseUrl) {
  const clean = text.replace(BYTE_ORDER_MARK, '')
  // binary data is not a playlist (a link that only looks like one, e.g. an audio stream)
  if (clean.includes(NUL)) {
    return undefined
  }
  if (/^#EXT-X-/m.test(clean)) {
    return { hls: true }
  }
  const lines = clean.split(/\r?\n/).map((line) => line.trim())
  const isPls = /^\[playlist\]/i.test(lines.find((line) => line !== '') ?? '')
  for (const line of lines) {
    let entry
    if (isPls) {
      entry = /^File\d+\s*=\s*(.+)$/i.exec(line)?.[1]?.trim()
    } else if (line !== '' && !line.startsWith('#')) {
      entry = line
    }
    if (!entry || entry.length > MAX_ADDRESS_LENGTH) continue
    let absolute
    try {
      absolute = new URL(entry, baseUrl).href
    } catch {
      continue
    }
    if (STREAM_ADDRESS.test(absolute)) {
      return { url: absolute }
    }
  }
  return undefined
}

// At most MAX_BYTES of the answer: a link that only looks like a playlist but is an endless stream must not be read
// to the end.
async function readLimited(response) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    size += value.length
  }
  await reader.cancel().catch(() => {})
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}

// ── Addresses taken from a playlist ──────────────────────────────────────────────────────────────────────────────
// The link the parents entered is trusted (it may well be a radio server in the home network). What a playlist
// lists, and where a server redirects to, is up to that server: it must not point back at the box or into the home
// network. The player runs commands on a plain GET (http://127.0.0.1:5005/shutoff.pls is the command "shutoff"),
// so a playlist listing such an address could switch the box off from the internet.

function ipv4Internal(address) {
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this network, private, loopback, multicast/reserved
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isInternalAddress(address) {
  const ip = address.toLowerCase()
  if (net.isIPv4(ip)) return ipv4Internal(ip)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
  if (mapped) return ipv4Internal(mapped[1])
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) // unspecified, loopback, ULA, link-local
}

// true when every address the host name stands for is on the internet
async function isPublicUrl(url, lookupImpl) {
  let host
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (!host) return false
  try {
    const addresses = net.isIP(host) ? [{ address: host }] : await lookupImpl(host, { all: true })
    return addresses.length > 0 && addresses.every(({ address }) => !isInternalAddress(address))
  } catch {
    return false
  }
}

// fetch that follows redirects itself, so each target is checked like a playlist entry
async function fetchChecked(url, fetchImpl, lookupImpl, signal) {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(current, { signal, redirect: 'manual' })
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return { response, finalUrl: current }
    await response.body?.cancel().catch(() => {})
    const next = new URL(location, current).href
    if (!STREAM_ADDRESS.test(next) || !(await isPublicUrl(next, lookupImpl))) return undefined
    current = next
  }
  return undefined
}

// The address to play for a radio link: the first stream of the playlist when the link is one, else the link itself.
// Everything together takes at most TIMEOUT_MS; whatever fails leaves the address as it was.
async function resolveStreamUrl(url, fetchImpl = fetch, lookupImpl = dns.lookup) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let current = url
  for (let depth = 0; depth < MAX_DEPTH && isPlaylistUrl(current); depth++) {
    try {
      const fetched = await fetchChecked(current, fetchImpl, lookupImpl, signal)
      if (!fetched?.response.ok) return current
      const entry = firstEntry(await readLimited(fetched.response), fetched.finalUrl)
      if (!entry || entry.hls) return current
      if (!(await isPublicUrl(entry.url, lookupImpl))) {
        console.warn(`${new Date().toLocaleString()}: [Radio] Playlist entry ${entry.url} points into the home network, ignored`)
        return current
      }
      current = entry.url
    } catch {
      return current
    }
  }
  return current
}

module.exports = { isPlaylistUrl, firstEntry, isInternalAddress, resolveStreamUrl }
