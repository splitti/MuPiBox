// The box's web server certificate and "Nur sichere Verbindung" (the app's Sicherheit page), see
// scripts/mupibox/tls_cert.sh: the box's own certificate (its small authority, limited to the home network, can be
// installed on the phones - then Android installs the app, and https shows no warning), or an own one uploaded here.
// Everything that changes the web server runs a moment after the answer: its restart ends the connection of a request
// that came through it (the app on port 80/443).

import { execFile, spawn } from 'node:child_process'
import { X509Certificate, createPrivateKey, createHash } from 'node:crypto'
import { existsSync, promises as fsp } from 'node:fs'
import os from 'node:os'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

const SCRIPT = '/usr/local/bin/mupibox/tls_cert.sh'
const CA_CRT = '/etc/mupibox/tls/ca.crt'
const CUSTOM = '/etc/mupibox/tls/custom.pem'
const TELEGRAM_SCRIPT = '/usr/local/bin/mupibox/telegram_send_message.py'
// an own certificate: reminded this many days before it runs out
const REMIND_DAYS = [14, 3]

type Tls = { httpsOnly?: boolean; linkHost?: string; remindedFor?: string; remindedDays?: number }
type Deps = {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

function run(args: string[], timeoutMs = 60000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT, ...args], { timeout: timeoutMs }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }),
    )
  })
}

// (after the answer is out, see above)
function later(args: string[]): void {
  setTimeout(() => {
    void run(args).then((r) => {
      if (!r.ok) console.warn(`${new Date().toLocaleString()}: [tls] ${args[0]}: ${r.stderr.trim()}`)
    })
  }, 800)
}

export const tlsOf = (cfg: MupiboxConfig | undefined): Tls => ((cfg as { tls?: Tls } | undefined)?.tls ?? {}) as Tls

/** The certificate in use, as the app shows it */
async function certInfo() {
  const r = await run(['cert'], 15000)
  if (!r.ok || !r.stdout.includes('BEGIN CERTIFICATE')) return null
  try {
    const c = new X509Certificate(r.stdout)
    return {
      subject: c.subject,
      issuer: c.issuer,
      validTo: new Date(c.validTo).toISOString(),
      names: (c.subjectAltName ?? '').split(', ').filter(Boolean).map((n) => n.replace(/^IP Address:/, '').replace(/^DNS:/, '')),
      fingerprint: c.fingerprint256,
    }
  } catch {
    return null
  }
}

// The addresses the box is reached at here: its IPv4 addresses and <hostname>.local
function boxNames(): string[] {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => (a as os.NetworkInterfaceInfo).address)
  return [...ips, `${os.hostname().toLowerCase()}.local`]
}

function telegram(key: string, values: Record<string, string | number>): void {
  try {
    const child = spawn('/usr/bin/python3', [TELEGRAM_SCRIPT, '--key', key, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)], { stdio: 'ignore' })
    child.on('error', () => undefined)
  } catch {
    // (no Telegram set up: the app shows it)
  }
}

export function registerTlsRoutes(router: Router, deps: Deps): void {
  /** GET /api/app/tls - the certificate in use (own or the box's), "Nur sichere Verbindung", the address for links */
  router.get('/tls', requireSession, async (_req, res) => {
    const tls = tlsOf(deps.getMupiboxConfig())
    const cert = await certInfo()
    const custom = existsSync(CUSTOM)
    const names = boxNames()
    res.json({
      mode: custom ? 'custom' : 'box',
      cert,
      caAvailable: existsSync(CA_CRT),
      // (an own certificate for none of the box's addresses: https shows a warning under these)
      coversBox: cert ? names.some((n) => cert.names.includes(n)) : false,
      boxNames: names,
      httpsOnly: tls.httpsOnly === true,
      linkHost: typeof tls.linkHost === 'string' ? tls.linkHost : '',
    })
  })

  /**
   * GET /api/app/tls/ca.crt - the certificate of the box's authority, to install on a phone or computer (public: the
   * page that explains it, and the phone's browser, need no login for it; its key never leaves the box)
   */
  router.get('/tls/ca.crt', async (_req, res) => {
    const pem = await fsp.readFile(CA_CRT, 'utf8').catch(() => '')
    if (!pem) {
      res.status(404).json({ error: 'no_certificate' })
      return
    }
    const name = os.hostname().replace(/[^A-Za-z0-9-]/g, '') || 'mupibox'
    res.setHeader('Content-Type', 'application/x-x509-ca-cert')
    res.setHeader('Content-Disposition', `attachment; filename="${name}-heimnetz.crt"`)
    res.send(pem)
  })

  /**
   * POST /api/app/tls/custom {cert, key} - an own certificate (PEM, with its chain) and its key (PEM, unencrypted).
   * Checked here first (a certificate, the key belongs to it, not run out); then put in place by tls_cert.sh, which
   * takes the one before back when the web server does not start with it.
   */
  router.post('/tls/custom', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { cert?: unknown; key?: unknown }
    const certPem = typeof body.cert === 'string' ? body.cert.trim() : ''
    const keyPem = typeof body.key === 'string' ? body.key.trim() : ''
    if (!certPem || !keyPem || certPem.length > 65536 || keyPem.length > 65536) {
      res.status(400).json({ error: 'missing' })
      return
    }
    let cert: X509Certificate
    try {
      cert = new X509Certificate(certPem)
    } catch {
      res.status(400).json({ error: 'certificate' })
      return
    }
    let key: ReturnType<typeof createPrivateKey>
    try {
      key = createPrivateKey(keyPem)
    } catch {
      // (an encrypted key too: the web server starts without anyone to type its password)
      res.status(400).json({ error: 'key' })
      return
    }
    if (!cert.checkPrivateKey(key)) {
      res.status(400).json({ error: 'mismatch' })
      return
    }
    if (Date.parse(cert.validTo) <= Date.now()) {
      res.status(400).json({ error: 'expired' })
      return
    }
    const dir = await fsp.mkdtemp(`${os.tmpdir()}/mupibox-tls-`)
    const crtFile = `${dir}/cert.pem`
    const keyFile = `${dir}/key.pem`
    await fsp.writeFile(crtFile, `${certPem}\n`, { mode: 0o600 })
    await fsp.writeFile(keyFile, `${keyPem}\n`, { mode: 0o600 })
    const names = (cert.subjectAltName ?? '').split(', ').map((n) => n.replace(/^IP Address:/, '').replace(/^DNS:/, ''))
    res.json({ ok: true, names, validTo: new Date(cert.validTo).toISOString(), coversBox: boxNames().some((n) => names.includes(n)) })
    setTimeout(() => {
      void run(['custom', crtFile, keyFile]).then(async (r) => {
        await fsp.rm(dir, { recursive: true, force: true })
        if (!r.ok) console.warn(`${new Date().toLocaleString()}: [tls] own certificate not taken: ${r.stderr.trim()}`)
        else console.log(`${new Date().toLocaleString()}: [tls] own certificate in place`)
      })
    }, 800)
  })

  /** POST /api/app/tls/box - back to the box's own certificate */
  router.post('/tls/box', requireSession, requireCsrf, (_req, res) => {
    res.json({ ok: true })
    later(['box'])
  })

  /** POST /api/app/tls/https-only {on} - http on port 80 leads to https (the box itself and port 8200 excepted) */
  router.post('/tls/https-only', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') {
      res.status(400).json({ error: 'on must be true or false' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.tls = { ...((cfg.tls as Tls | undefined) ?? {}), httpsOnly: on }
    })
    res.json({ ok: true })
    later(['https-only', on ? 'on' : 'off'])
  })

  /** POST /api/app/tls/link-host {host} - the box's address in the QR code and Telegram's links ('' = its IP) */
  router.post('/tls/link-host', requireSession, requireCsrf, async (req, res) => {
    const host = String((req.body as { host?: unknown } | undefined)?.host ?? '').trim().toLowerCase()
    if (host && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
      res.status(400).json({ error: 'invalid_host' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      const tls = { ...((cfg.tls as Tls | undefined) ?? {}) }
      if (host) tls.linkHost = host
      else delete tls.linkHost
      cfg.tls = tls
    })
    res.json({ ok: true })
  })
}

/** An own certificate that runs out: Telegram 14 and 3 days before (daytime only), as the Spotify login's reminder */
export function startTlsWatch(deps: Deps): void {
  const check = async () => {
    if (!existsSync(CUSTOM)) return
    const hour = new Date().getHours()
    if (hour < 9 || hour >= 20) return
    const cert = await certInfo()
    if (!cert) return
    const daysLeft = Math.floor((Date.parse(cert.validTo) - Date.now()) / 86400_000)
    const tls = tlsOf(deps.getMupiboxConfig())
    const id = createHash('sha256').update(cert.fingerprint).digest('hex').slice(0, 12)
    const sent = tls.remindedFor === id && typeof tls.remindedDays === 'number' ? tls.remindedDays : Number.POSITIVE_INFINITY
    const due = REMIND_DAYS.find((d) => daysLeft <= d && d < sent)
    if (due === undefined) return
    telegram('n_tls_expiring', { days: Math.max(0, daysLeft), date: new Date(cert.validTo).toLocaleDateString('de-DE') })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.tls = { ...((cfg.tls as Tls | undefined) ?? {}), remindedFor: id, remindedDays: due }
    })
    console.log(`${new Date().toLocaleString()}: [tls] reminder: own certificate runs out in ${daysLeft} days`)
  }
  const tick = () => void check().catch((err) => console.warn(`${new Date().toLocaleString()}: [tls] ${(err as Error).message}`))
  setTimeout(tick, 90_000).unref()
  setInterval(tick, 3600_000).unref()
}
