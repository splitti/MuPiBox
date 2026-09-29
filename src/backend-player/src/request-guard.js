/*
 * Browser-facing protection for the player API (port 5005), same idea as
 * backend-api/src/request-guard.ts: every GET here is a command (play, stop, volume, shutdown ...),
 * and with `Access-Control-Allow-Origin: *` and no other check any web page could send them through
 * a visitor's browser, e.g. with an <img src="http://box:5005/...">.
 *
 *  - Host header allowlist (anti DNS rebinding): localhost, IP literals, the box's hostname.
 *  - Requests the browser marks as cross-site (Sec-Fetch-Site) are refused; for unsafe methods a
 *    foreign Origin is refused as well (browsers without Fetch Metadata).
 *  - CORS answers only for the box's own pages (kiosk, remote control on port 8200).
 *
 * Callers without these headers (backend-api, Telegram bot, scripts) are not affected.
 */
const os = require('node:os')

const LOCAL_SUFFIXES = ['local', 'lan', 'home', 'fritz.box', 'localdomain', 'home.arpa', 'box', 'speedport.ip', 'internal']

function hostnameOf(hostHeader) {
  if (!hostHeader) return ''
  const h = String(hostHeader).trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0]
}

function isAllowedHost(hostHeader) {
  const host = hostnameOf(hostHeader)
  if (host === '') return true
  if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || (host.startsWith('[') && host.endsWith(']'))) {
    return true
  }
  const boxName = os.hostname().toLowerCase()
  return host === boxName || LOCAL_SUFFIXES.some((suffix) => host === `${boxName}.${suffix}`)
}

function isSameHostOrigin(req) {
  const origin = req.headers.origin
  if (!origin || origin === 'null') return false
  try {
    const url = new URL(origin)
    return url.hostname.toLowerCase() === hostnameOf(req.headers.host) && isAllowedHost(url.host)
  } catch {
    return false
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function reject(req, res, reason) {
  console.warn(
    `${new Date().toLocaleString()}: [Spotify Control] Refused ${req.method} ${req.path} (${reason}; host=${req.headers.host || ''} origin=${req.headers.origin || ''})`,
  )
  res.status(403).send('forbidden')
}

function isLoopback(req) {
  const addr = req.socket.remoteAddress || ''
  // the whole 127.0.0.0/8: a box's own hostname often resolves to 127.0.1.1 (Debian /etc/hosts)
  return addr === '::1' || /^(::ffff:)?127\./.test(addr)
}

function browserGuard(req, res, next) {
  if (!isAllowedHost(req.headers.host)) return reject(req, res, 'host not allowed')
  if (req.headers['sec-fetch-site'] === 'cross-site') return reject(req, res, 'cross-site request')
  if (UNSAFE_METHODS.has(req.method) && req.headers.origin !== undefined && !isSameHostOrigin(req)) {
    return reject(req, res, 'foreign origin')
  }
  const sameHostOrigin = isSameHostOrigin(req)
  if (sameHostOrigin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin)
    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET, POST')
  }
  // CORS preflight: answered here. The command handler below takes every method and path, so a
  // preflight for /<device>/play used to run "play" already.
  if (req.method === 'OPTIONS') {
    return sameHostOrigin ? res.status(204).end() : reject(req, res, 'foreign preflight')
  }

  // Every GET here is a command. Browsers send Sec-Fetch-Site only to "potentially trustworthy"
  // URLs (https, localhost) - not to http://<box-ip>:5005 - and an <img> sends no Origin. So a
  // foreign page could still trigger commands through a visitor's browser. The box's own pages
  // send X-Requested-With (a header a foreign page can only set after a CORS preflight, which is
  // refused above). Requests without it are accepted only from the box itself and only when
  // nothing marks them as coming from a browser (backend-api, Telegram bot, MQTT, scripts).
  const fromBoxPage = req.headers['x-requested-with'] === 'XMLHttpRequest'
  if (!fromBoxPage && !(isLoopback(req) && !req.headers.origin && !req.headers.referer)) {
    return reject(req, res, 'no X-Requested-With')
  }
  next()
}

module.exports = { browserGuard }
