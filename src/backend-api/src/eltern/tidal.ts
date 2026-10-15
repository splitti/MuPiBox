// TIDAL (unofficial, python-tidal): the app's page Dienste › TIDAL. Switching on sets up the box's TIDAL service
// (mupibox/tidal_setup.sh: its own Python with tidalapi, mupi_tidal.service) in the background; the sign-in with a code
// and the state go to that service on 127.0.0.1:5011 (mupibox/tidal_service.py), and so do searching TIDAL and an
// artist's albums for adding them to the library (a row of type 'tidal' through /api/add, as radio and podcasts).

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface TidalDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const SERVICE = 'http://127.0.0.1:5011'
const SETUP = '/usr/local/bin/mupibox/tidal_setup.sh'
const VENV_PYTHON = '/opt/mupibox-tidal/bin/python'

// the switch at work (setting up takes a minute: apt, pip)
const job: { running: boolean; ok?: boolean; on?: boolean; at?: number } = { running: false }

function isActive(): Promise<boolean> {
  return new Promise((resolve) => execFile('systemctl', ['is-active', 'mupi_tidal'], { timeout: 5000 }, (_e, out) => resolve(String(out).trim() === 'active')))
}

async function service(method: 'GET' | 'POST', path: string, timeoutMs?: number): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const r = await fetch(`${SERVICE}${path}`, { method, signal: AbortSignal.timeout(timeoutMs ?? (method === 'GET' ? 4000 : 20000)) })
    return { ok: r.ok, status: r.status, body: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 503, body: { error: 'service_unreachable' } }
  }
}

export function registerTidalRoutes(router: Router, deps: TidalDeps): void {
  const enabled = () => ((deps.getMupiboxConfig() as Record<string, unknown> | undefined)?.tidal as { enabled?: unknown } | undefined)?.enabled === true

  /** GET /api/app/tidal - switched on, set up, running, the switch at work, and the sign-in (from the service) */
  router.get('/tidal', requireSession, async (_req, res) => {
    const installed = await fsp
      .access(VENV_PYTHON)
      .then(() => true)
      .catch(() => false)
    const active = await isActive()
    const state = active ? await service('GET', '/status') : null
    res.json({ enabled: enabled(), installed, active, job, account: state?.ok ? state.body : null })
  })

  /** POST /api/app/tidal/enabled {on, confirmed} - switching on needs the hint confirmed (an unofficial way in) */
  router.post('/tidal/enabled', requireSession, requireCsrf, async (req, res) => {
    const { on, confirmed } = (req.body ?? {}) as { on?: unknown; confirmed?: unknown }
    if (typeof on !== 'boolean') return void res.status(400).json({ error: 'on must be true or false' })
    if (on && confirmed !== true) return void res.status(400).json({ error: 'confirm_needed' })
    if (job.running) return void res.status(409).json({ error: 'already switching' })
    // (taken before the first await: two switches at once - on and off from two phones - both passed the check while
    // the setting was written, and the setup of one switched on again what the other had switched off)
    Object.assign(job, { running: true, ok: undefined, on, at: Date.now() })
    try {
      await deps.updateMupiboxConfig((cfg) => {
        cfg.tidal = { ...((cfg.tidal as Record<string, unknown>) ?? {}), enabled: on }
      })
    } catch {
      Object.assign(job, { running: false, ok: false })
      return void res.status(500).json({ error: 'config_not_saved' })
    }
    const child = spawn('sudo', ['bash', SETUP, on ? 'on' : 'off'], { stdio: 'ignore' })
    child.on('error', () => Object.assign(job, { running: false, ok: false }))
    child.on('exit', (code) => Object.assign(job, { running: false, ok: code === 0 }))
    res.json({ ok: true, started: true })
  })

  /** POST /api/app/tidal/login - a code for link.tidal.com (the TIDAL password never comes to the box) */
  router.post('/tidal/login', requireSession, requireCsrf, async (_req, res) => {
    if (!enabled()) return void res.status(409).json({ error: 'tidal_off' })
    const r = await service('POST', '/login/start')
    // (409: given up meanwhile - see tidal_service.py start_login)
    res.status(r.ok ? 200 : r.status === 503 || r.status === 409 ? r.status : 502).json(r.body)
  })

  /** DELETE /api/app/tidal/login - gives the code up */
  router.delete('/tidal/login', requireSession, requireCsrf, async (_req, res) => {
    const r = await service('POST', '/login/cancel')
    res.status(r.ok ? 200 : 503).json(r.body)
  })

  // (a search or a long list of albums asks TIDAL several times: more time than the state)
  const relay = (r: { ok: boolean; status: number; body: Record<string, unknown> }, res: import('express').Response) =>
    res.status(r.ok ? 200 : [400, 401, 404, 409].includes(r.status) ? r.status : r.status === 503 ? 503 : 502).json(r.body)

  /** GET /api/app/tidal/search?q= - albums, artists and playlists of TIDAL for the text */
  router.get('/tidal/search', requireSession, async (req, res) => {
    if (!enabled()) return void res.status(409).json({ error: 'tidal_off' })
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    if (!q) return void res.status(400).json({ error: 'no_query' })
    relay(await service('GET', `/search?q=${encodeURIComponent(q)}&limit=20`, 20000), res)
  })

  /** GET /api/app/tidal/artist/:id/albums - an artist's albums, EPs and singles */
  router.get('/tidal/artist/:id/albums', requireSession, async (req, res) => {
    if (!enabled()) return void res.status(409).json({ error: 'tidal_off' })
    const id = String(req.params.id)
    if (!/^\d{1,15}$/.test(id)) return void res.status(400).json({ error: 'bad_id' })
    // (an artist entry's range and left-out albums, and all=1 for the library's editor - see tidal_service.py narrowed)
    const q = new URLSearchParams()
    for (const k of ['from', 'to']) if (typeof req.query[k] === 'string' && /^\d{1,5}$/.test(req.query[k] as string)) q.set(k, req.query[k] as string)
    if (typeof req.query.exclude === 'string' && /^\d{1,15}(,\d{1,15}){0,499}$/.test(req.query.exclude)) q.set('exclude', req.query.exclude)
    if (req.query.all === '1') q.set('all', '1')
    relay(await service('GET', `/artist/${id}/albums${q.size ? `?${q}` : ''}`, 30000), res)
  })

  /** POST /api/app/tidal/logout - signs out and deletes the saved sign-in on the box */
  router.post('/tidal/logout', requireSession, requireCsrf, async (_req, res) => {
    const r = await service('POST', '/logout')
    res.status(r.ok ? 200 : 503).json(r.body)
  })
}
