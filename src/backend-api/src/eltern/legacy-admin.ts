// The previous admin interface (PHP pages behind lighttpd, port 80/443) on or off: Einstellungen › System › Experten.
// Off, nothing on the box answers with PHP any more - a flaw of PHP itself reached from the home network (as the two of
// October 2026, CVE-2026-109618/-109619) cannot hit it; the app does everything the admin interface did. The switch is
// scripts/mupibox/legacy_admin.sh (as root): php-fpm, lighttpd's PHP module, and the .php addresses sent to the app.
// mupibox.legacyAdmin: false = off (a new installation), true or not there = on (a box set up before keeps it).
import { execFile } from 'node:child_process'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface LegacyAdminDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const SCRIPT = '/usr/local/bin/mupibox/legacy_admin.sh'

/** The admin interface is on (a box that never chose keeps it on). */
export function legacyAdminOn(cfg: MupiboxConfig | undefined): boolean {
  return (cfg?.mupibox as Record<string, unknown> | undefined)?.legacyAdmin !== false
}

function run(args: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT, ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

// one switch at a time: two at once ran the script over each other
let switching: Promise<unknown> = Promise.resolve()

export function registerLegacyAdminRoutes(router: Router, deps: LegacyAdminDeps): void {
  /** GET /api/app/legacy-admin - {on}: the admin interface is switched on (as the box has it) */
  router.get('/legacy-admin', requireSession, async (_req, res) => {
    const status = (await run(['status'], 10000)).stdout.trim()
    res.json({ on: status === 'off' ? false : status === 'on' ? true : legacyAdminOn(deps.getMupiboxConfig()) })
  })

  /** POST /api/app/legacy-admin {on} - the admin interface on or off */
  router.post('/legacy-admin', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') return void res.status(400).json({ error: 'invalid on' })
    // (lighttpd is read again only after the answer: the app's request goes through it, and its reload cut it off)
    const job = switching.then(() => run([on ? 'on' : 'off', 'noreload'], 90000))
    switching = job.catch(() => undefined)
    const r = await job
    if (!r.ok) return void res.status(500).json({ ok: false, error: 'switch_failed' })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), legacyAdmin: on }
    })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Admin interface switched ${on ? 'on' : 'off'}`)
    res.json({ ok: true })
    const reload = new Promise((resolve) => setTimeout(resolve, 1500)).then(() => run(['reload'], 30000))
    switching = reload.catch(() => undefined)
  })
}
