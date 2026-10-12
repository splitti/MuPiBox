// The DietPi-Dashboard, reached from the app only (Einstellungen › System › Experten). Without a password it gave
// everyone in the Wi-Fi a web terminal as dietpi (sudo without a password): root on the box. Now it has a random
// password nobody knows and listens on an inner port (scripts/mupibox/dietpi_dashboard.sh); this server answers on its
// old port 5252, passes every request and websocket on, and signs a parent of the app in with a one-time ticket: the
// app asks for one (POST /api/app/dietpi-dashboard/ticket) and opens http://<box>:5252/mupibox-open?ticket=…, where
// the dashboard's own token is put into the browser (the dashboard keeps it in localStorage "tokens", per host:port)
// before it is shown. Whoever opens the port without a ticket gets the dashboard's password prompt. Off by default.
//
// The port speaks https as well (the first byte of a connection tells which): an app opened with https opens the
// dashboard with https - with http the token, the cookie it is bound to and the terminal went through the network in
// the clear. The certificate is the box's own one of the web server (tls_cert.sh), read again when it is renewed. With
// "Nur sichere Verbindung" (tls.httpsOnly) http is sent on to https.

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import net from 'node:net'
import type { Duplex } from 'node:stream'
import type { TLSSocket } from 'node:tls'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { isAllowedHost } from '../request-guard'
import { requireCsrf, requireSession } from './middleware'

export interface DashboardDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const SCRIPT = '/usr/local/bin/mupibox/dietpi_dashboard.sh'
const OUTER_PORT = 5252
const INNER_PORT = 5253
const TICKET_MS = 60_000

// the box's certificate with its key, as the web server has it (dietpi_dashboard.sh pem reads it as root)
const PEM_FILE = '/etc/lighttpd/server.pem'
const PEM_CHECK_MS = 30_000

const tickets = new Map<string, number>()
// the port (it hands each connection to the http or the https server below)
let proxy: net.Server | null = null
let plain: Server | null = null
let secure: HttpsServer | null = null
let pemStamp = ''
let pemChecked = 0
let pemLoading = false
let depsRef: DashboardDeps | undefined
// every connection of the port (also a terminal's websocket): ended when the dashboard is switched off
const sockets = new Set<net.Socket>()

function run(args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT, ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

const log = (text: string) => console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] dietpi-dashboard: ${text}`)
const enabledIn = (deps: DashboardDeps) => ((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.dietpiDashboard ?? false) === true
const httpsOnly = () => ((depsRef?.getMupiboxConfig() as { tls?: { httpsOnly?: unknown } } | undefined)?.tls?.httpsOnly ?? false) === true
const encrypted = (req: IncomingMessage) => (req.socket as TLSSocket).encrypted === true

function page(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
  res.end(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DietPi-Dashboard</title></head><body style="font-family:system-ui,sans-serif;margin:2em">${body}</body></html>`)
}

/** GET /mupibox-open?ticket=… - the ticket used once, the dashboard's token into the browser, then the dashboard */
async function open(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ticket = new URL(req.url ?? '/', 'http://box').searchParams.get('ticket') ?? ''
  const until = tickets.get(ticket)
  tickets.delete(ticket)
  if (until === undefined || until < Date.now()) {
    return page(res, 403, '<h1>DietPi-Dashboard</h1><p>Dieser Link ist abgelaufen. Bitte das Dashboard in der MuPiBox-App öffnen (Einstellungen › System › Experten).</p>')
  }
  const r = await run(['token'], 10000)
  const [token = '', fingerprint = ''] = r.stdout.trim().split(' ')
  if (!r.ok || !/^[A-Za-z0-9._-]+$/.test(token) || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    log('no token (is the dashboard running?)')
    return page(res, 503, '<h1>DietPi-Dashboard</h1><p>Das Dashboard antwortet nicht. In der App aus- und wieder einschalten, sonst die Box neu starten.</p>')
  }
  // The token is bound to the cookie FINGERPRINT (its SHA-256 is in the token): set here as the dashboard's login sets
  // it. The key the dashboard keeps the token under: "<hostname>:<port>" of the page. Both only ever in this answer.
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // (Secure over https: never sent along to the same port in the clear)
    'Set-Cookie': `FINGERPRINT=${fingerprint}; Path=/; HttpOnly; SameSite=Strict${encrypted(req) ? '; Secure' : ''}`,
  })
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>DietPi-Dashboard</title></head><body><script>` +
      `try{var k=location.hostname+":"+location.port,t=JSON.parse(localStorage.getItem("tokens")||"{}");t[k]=${JSON.stringify(token)};localStorage.setItem("tokens",JSON.stringify(t))}catch(e){}` +
      `location.replace("/")</script></body></html>`,
  )
}

/** Every other request: to the dashboard on its inner port, as it is */
function pass(req: IncomingMessage, res: ServerResponse): void {
  const upstream = request({ host: '127.0.0.1', port: INNER_PORT, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  upstream.on('error', () => {
    if (!res.headersSent) page(res, 502, '<h1>DietPi-Dashboard</h1><p>Das Dashboard läuft gerade nicht.</p>')
    else res.destroy()
  })
  req.pipe(upstream)
}

/** Its websockets (/ws, terminal, files): the raw connection to the inner port - the dashboard checks its token */
function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  if (!isAllowedHost(req.headers.host) || (httpsOnly() && secure && !encrypted(req))) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    return
  }
  const upstream = net.connect(INNER_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  // (the same names as the app's: a foreign page that took over a name of its own in DNS gets nothing here)
  if (!isAllowedHost(req.headers.host)) {
    res.writeHead(403).end()
    return
  }
  if (httpsOnly() && secure && !encrypted(req)) {
    res.writeHead(308, { Location: `https://${req.headers.host}${req.url ?? '/'}` }).end()
    return
  }
  if ((req.url ?? '').split('?')[0] === '/mupibox-open') {
    open(req, res).catch(() => {
      if (!res.headersSent) page(res, 500, '<h1>DietPi-Dashboard</h1><p>Fehler beim Öffnen.</p>')
    })
    return
  }
  pass(req, res)
}

// The certificate for https: read (again) when it is new - at the start, and at most every 30 s when a connection
// comes (tls_cert.sh renews it for a new address of the box). Without one, the port speaks http only.
function refreshPem(): void {
  const now = Date.now()
  if (pemLoading || now - pemChecked < PEM_CHECK_MS) return
  pemChecked = now
  let stamp = ''
  try {
    const st = fs.statSync(PEM_FILE)
    stamp = `${st.mtimeMs}|${st.size}`
  } catch {
    // none (yet)
  }
  if (stamp === pemStamp) return
  pemLoading = true
  run(['pem'], 10000)
    .then((r) => {
      if (!r.ok || !/PRIVATE KEY-----/.test(r.stdout) || !/BEGIN CERTIFICATE/.test(r.stdout)) {
        if (stamp) log('no certificate for https')
        return
      }
      try {
        if (secure) secure.setSecureContext({ key: r.stdout, cert: r.stdout })
        else {
          const s = createHttpsServer({ key: r.stdout, cert: r.stdout }, handle)
          s.on('upgrade', upgrade)
          s.on('tlsClientError', () => undefined)
          secure = s
        }
        pemStamp = stamp
      } catch (err) {
        log(`certificate not usable: ${(err as Error).message}`)
      }
    })
    .finally(() => {
      pemLoading = false
    })
}

function startProxy(): void {
  if (proxy) return
  plain ??= createServer(handle).on('upgrade', upgrade)
  pemChecked = 0
  refreshPem()
  // One port for both: a TLS connection begins with the byte 22 (a handshake record), http with a letter.
  const s = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.once('data', (first: Buffer) => {
      socket.pause()
      socket.unshift(first)
      refreshPem()
      const target = first[0] === 22 ? secure : plain
      if (!target) return void socket.destroy()
      target.emit('connection', socket)
      process.nextTick(() => socket.resume())
    })
  })
  s.on('error', (err) => {
    log(`port ${OUTER_PORT}: ${err.message}`)
    if (proxy === s) proxy = null
  })
  s.listen(OUTER_PORT)
  proxy = s
}

function stopProxy(): void {
  const s = proxy
  proxy = null
  if (!s) return
  s.close()
  for (const socket of sockets) socket.destroy()
  sockets.clear()
}

/** At the server's start: the port answered when the dashboard is switched on in the app */
export function startDietpiDashboard(deps: DashboardDeps): void {
  depsRef = deps
  // (the config may not be read yet this early: asked again every 2 s, for a minute at most)
  let tries = 0
  const check = () => {
    if (deps.getMupiboxConfig() === undefined && ++tries < 30) return void setTimeout(check, 2000).unref()
    if (enabledIn(deps)) startProxy()
  }
  check()
}

export function registerDietpiDashboardRoutes(router: Router, deps: DashboardDeps): void {
  depsRef = deps
  /** GET /api/app/dietpi-dashboard - switched on, running */
  router.get('/dietpi-dashboard', requireSession, async (_req, res) => {
    const status = (await run(['status'], 10000)).stdout.trim()
    res.json({ enabled: enabledIn(deps), active: status === 'active' })
  })

  /** POST /api/app/dietpi-dashboard {on} - the dashboard on (behind the app) or off */
  router.post('/dietpi-dashboard', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') return void res.status(400).json({ error: 'invalid on' })
    const r = await run([on ? 'on' : 'off'], 60000)
    if (!r.ok) return void res.status(500).json({ ok: false, error: 'switch_failed' })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), dietpiDashboard: on }
    })
    if (on) startProxy()
    else {
      stopProxy()
      tickets.clear()
    }
    log(on ? 'switched on (behind the app)' : 'switched off')
    res.json({ ok: true })
  })

  /** POST /api/app/dietpi-dashboard/ticket - a one-time ticket for http(s)://<box>:5252/mupibox-open (60 s) */
  router.post('/dietpi-dashboard/ticket', requireSession, requireCsrf, (_req, res) => {
    if (!enabledIn(deps)) return void res.status(409).json({ error: 'dashboard_off' })
    const now = Date.now()
    for (const [t, until] of tickets) if (until < now) tickets.delete(t)
    const ticket = randomBytes(32).toString('hex')
    tickets.set(ticket, now + TICKET_MS)
    res.json({ ticket, port: OUTER_PORT })
  })
}
