// Spotify Connect: the box as a speaker in the Spotify app (librespot). Its login is a credentials.json in the Spotify
// cache folder, made once by `librespot --enable-oauth`: librespot names a Spotify login address and waits on the box
// itself (127.0.0.1:5588) for Spotify to come back. On a phone that way back ends at the phone (127.0.0.1 there): the
// browser shows an error page whose address holds the answer. The parents paste that address into the app, the box
// passes it on to librespot here - no SSH needed. Needed again only when the login is gone (e.g. "Zugang
// zurücksetzen" deletes the cache folder).

import { execFile, type ChildProcess, spawn } from 'node:child_process'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

const LIBRESPOT = '/usr/bin/librespot'
const OAUTH_PORT = 5588
// the login is made here (empty: librespot asks for one), then copied into the Spotify cache folder - the login there
// stays until a new one worked
const LOGIN_DIR = '/tmp/.mupibox-connect-login'
// a login not finished in this time is given up (librespot back as before)
const JOB_TIMEOUT_MS = 10 * 60 * 1000

function run(cmd: string, args: string[], timeoutMs = 20000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }))
  })
}

interface Job {
  child: ChildProcess
  url: string
  started: number
  output: string
  timer: NodeJS.Timeout
}
let job: Job | null = null

const cacheOf = (cfg: MupiboxConfig | undefined) => {
  const c = (cfg?.spotify as Record<string, unknown> | undefined)?.cachepath
  return typeof c === 'string' && c.startsWith('/') ? c : '/home/dietpi/.cache/spotify'
}
const nameOf = (cfg: MupiboxConfig | undefined) => {
  const h = (cfg?.mupibox as Record<string, unknown> | undefined)?.host
  return typeof h === 'string' && h.trim() ? h.trim() : 'MuPiBox'
}

// When the Connect login was made (the file's time; it belongs to root, the service runs as root), or null: none
async function loginSince(cache: string): Promise<number | null> {
  const r = await run('sudo', ['stat', '-c', '%Y', `${cache}/credentials.json`], 8000)
  const t = Number(r.stdout.trim())
  return r.ok && Number.isFinite(t) && t > 0 ? t * 1000 : null
}

// Whether the Connect service runs, else the reason librespot gave last (its ERROR line: Spotify refusing the login,
// the network, …). When Spotify refuses, librespot ends a second after its start and systemd tries again a minute later
// (the unit is "activating" in between), so "active" means it got past that.
async function connectState(): Promise<{ running: boolean; error: string | null }> {
  const active = await run('systemctl', ['is-active', 'librespot'], 5000)
  if (active.stdout.trim() === 'active') return { running: true, error: null }
  const log = await run('sudo', ['journalctl', '-u', 'librespot', '-n', '40', '--no-pager', '-o', 'cat'], 8000)
  const line = log.stdout
    .split('\n')
    .reverse()
    .find((l) => /\bERROR\b/.test(l))
  return { running: false, error: line ? line.replace(/^\[[^\]]*\]\s*/, '').slice(0, 300) : null }
}

// The login process ends; librespot runs again as the service
async function endJob(): Promise<void> {
  const current = job
  job = null
  if (current) {
    clearTimeout(current.timer)
    current.child.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 1500))
    if (current.child.exitCode === null) current.child.kill('SIGKILL')
  }
  await run('sudo', ['rm', '-rf', LOGIN_DIR])
  await run('sudo', ['systemctl', 'start', 'librespot'])
}

export function registerSpotifyConnectRoutes(router: Router, deps: { getMupiboxConfig: () => MupiboxConfig | undefined }): void {
  /** GET /api/app/spotify-connect - whether the box has a Connect login, since when, a login going on */
  router.get('/spotify-connect', requireSession, async (_req, res) => {
    const cache = cacheOf(deps.getMupiboxConfig())
    const [since, state] = await Promise.all([loginSince(cache), connectState()])
    res.json({ configured: since !== null, since, running: state.running, error: since !== null ? state.error : null, pending: job ? job.url : null, name: nameOf(deps.getMupiboxConfig()) })
  })

  /**
   * POST /api/app/spotify-connect/start - stops the Connect service, starts `librespot --enable-oauth` with the same
   * cache folder and name, answers the Spotify login address it names
   */
  router.post('/spotify-connect/start', requireSession, requireCsrf, async (_req, res) => {
    if (job) await endJob()
    const cfg = deps.getMupiboxConfig()
    await run('sudo', ['systemctl', 'stop', 'librespot'])
    await run('sudo', ['rm', '-rf', LOGIN_DIR])
    await run('sudo', ['install', '-d', '-m', '700', LOGIN_DIR])
    const child = spawn('sudo', [LIBRESPOT, '--enable-oauth', '--cache', LOGIN_DIR, '--name', nameOf(cfg), '--disable-audio-cache', '--backend', 'pipe', '--device', '/dev/null'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const current: Job = { child, url: '', started: Date.now(), output: '', timer: setTimeout(() => void endJob(), JOB_TIMEOUT_MS) }
    job = current
    const url = await new Promise<string>((resolve) => {
      const done = setTimeout(() => resolve(''), 15000)
      const read = (chunk: Buffer) => {
        current.output = (current.output + chunk.toString()).slice(-8000)
        const m = /Browse to:\s*(https:\/\/accounts\.spotify\.com\/\S+)/.exec(current.output)
        if (m) {
          clearTimeout(done)
          resolve(m[1])
        }
      }
      child.stdout?.on('data', read)
      child.stderr?.on('data', read)
      child.on('exit', () => resolve(''))
    })
    if (!url) {
      console.warn(`${new Date().toLocaleString()}: [spotify-connect] librespot gave no login address: ${current.output.slice(-500)}`)
      await endJob()
      res.status(502).json({ error: 'no_login_url' })
      return
    }
    current.url = url
    console.log(`${new Date().toLocaleString()}: [spotify-connect] login started`)
    res.json({ url })
  })

  /**
   * POST /api/app/spotify-connect/finish {address} - the address the browser ended on after the Spotify login
   * (http://127.0.0.1:5588/login?code=…), handed to librespot on the box; then the service starts with the new login.
   * The login before is kept until the new one worked: when Spotify refuses the new one (librespot does not get
   * going), the old one comes back - a working Connect is never lost to a new try.
   */
  router.post('/spotify-connect/finish', requireSession, requireCsrf, async (req, res) => {
    const current = job
    if (!current) {
      res.status(409).json({ error: 'no_login_running' })
      return
    }
    let answer: URL
    try {
      answer = new URL(String((req.body as { address?: unknown } | undefined)?.address ?? '').trim())
    } catch {
      res.status(400).json({ error: 'bad_address' })
      return
    }
    if (!['127.0.0.1', 'localhost'].includes(answer.hostname) || !answer.searchParams.get('code')) {
      res.status(400).json({ error: 'bad_address' })
      return
    }
    try {
      const r = await fetch(`http://127.0.0.1:${OAUTH_PORT}${answer.pathname}${answer.search}`, { signal: AbortSignal.timeout(15000) })
      await r.arrayBuffer().catch(() => undefined)
    } catch (err) {
      console.warn(`${new Date().toLocaleString()}: [spotify-connect] passing the answer on: ${(err as Error).message}`)
    }
    // librespot writes the login once Spotify took the code; it then replaces the one in the cache folder
    let made = false
    for (let i = 0; i < 20 && job === current; i++) {
      if ((await loginSince(LOGIN_DIR)) !== null) {
        made = true
        break
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    const cache = cacheOf(deps.getMupiboxConfig())
    const creds = `${cache}/credentials.json`
    const previous = `${cache}/credentials.json.previous`
    const hadOne = made && (await run('sudo', ['cp', '-p', creds, previous])).ok
    const ok =
      made &&
      (await run('sudo', ['install', '-d', cache])).ok &&
      (await run('sudo', ['install', '-m', '600', `${LOGIN_DIR}/credentials.json`, creds])).ok
    if (!ok) console.warn(`${new Date().toLocaleString()}: [spotify-connect] no new login: ${current.output.slice(-500)}`)
    await endJob()
    if (!ok) {
      res.status(502).json({ error: 'login_failed' })
      return
    }
    // librespot needs a second or two to sign in with it (then it runs, or ends refused)
    await new Promise((r) => setTimeout(r, 12000))
    const state = await connectState()
    if (!state.running) {
      console.warn(`${new Date().toLocaleString()}: [spotify-connect] the new login is refused: ${state.error ?? '?'}${hadOne ? ' - the one before is back' : ''}`)
      if (hadOne) {
        await run('sudo', ['install', '-m', '600', previous, creds])
        await run('sudo', ['systemctl', 'restart', 'librespot'])
      }
      res.status(502).json({ error: 'login_refused', detail: state.error, restored: hadOne })
      return
    }
    const since = await loginSince(cache)
    console.log(`${new Date().toLocaleString()}: [spotify-connect] new Connect login saved`)
    res.json({ ok: true, since })
  })

  /** POST /api/app/spotify-connect/cancel - gives a login up, the service as before */
  router.post('/spotify-connect/cancel', requireSession, requireCsrf, async (_req, res) => {
    await endJob()
    res.json({ ok: true })
  })
}
