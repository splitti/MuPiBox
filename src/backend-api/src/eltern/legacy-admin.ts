// The previous admin interface (PHP pages behind lighttpd, port 80/443) on or off: Einstellungen › System › Experten.
// Off, nothing on the box answers with PHP any more - a flaw of PHP itself reached from the home network (as the two of
// October 2026, CVE-2026-109618/-109619) cannot hit it; the app does everything the admin interface did. The switch is
// scripts/mupibox/legacy_admin.sh (as root): php-fpm, lighttpd's PHP module, and the .php addresses sent to the app.
// mupibox.legacyAdmin: false = off (a new installation), true or not there = on (a box set up before keeps it).
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface LegacyAdminDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const SCRIPT = '/usr/local/bin/mupibox/legacy_admin.sh'
// written by the script when it switches off (lighttpd sends the .php addresses to the app): the state as the web
// server has it - the config's key can be gone (a reset of the box configuration) while the admin interface stays off
const OFF_CONF = '/etc/lighttpd/conf-enabled/92-mupibox-admin-off.conf'
// left by the update that switched it off (once, 5.0.12; see update/start_mupibox_update.sh), gone with a switch here
const OFF_BY_UPDATE = '/etc/mupibox/legacy-admin-off-by-update'

/** The admin interface is on: as the web server has it (the config's key only where that cannot be seen). */
export function legacyAdminOn(cfg: MupiboxConfig | undefined): boolean {
  try {
    return !existsSync(OFF_CONF)
  } catch {
    return (cfg?.mupibox as Record<string, unknown> | undefined)?.legacyAdmin !== false
  }
}

function run(args: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT, ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

// one switch at a time: two at once ran the script over each other
let switching: Promise<unknown> = Promise.resolve()

export function registerLegacyAdminRoutes(router: Router, deps: LegacyAdminDeps): void {
  /**
   * GET /api/app/legacy-admin - {on, offByUpdate}: the admin interface is switched on (as the box has it); switched off
   * by the update to 5.0.12, nobody switched since (the start page's notice)
   */
  router.get('/legacy-admin', requireSession, async (_req, res) => {
    const status = (await run(['status'], 10000)).stdout.trim()
    const on = status === 'off' ? false : status === 'on' ? true : legacyAdminOn(deps.getMupiboxConfig())
    res.json({ on, offByUpdate: !on && existsSync(OFF_BY_UPDATE) })
  })

  /** POST /api/app/legacy-admin {on} - the admin interface on or off */
  router.post('/legacy-admin', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') return void res.status(400).json({ error: 'invalid on' })
    // One job in the queue: the switch, its config, and lighttpd read again - only after the answer (the app's request
    // goes through lighttpd, and its reload cut it off). The next switch waits for all of it: two at once ran over each
    // other, and one's reload fell into the other's request.
    // A switch that fails half way - the script, or the config it is saved in (its lock has a timeout) - goes back to
    // what was before, in the same job: the web server and the answers of this server stay of one mind. lighttpd is
    // read again in any case.
    const job = switching.then(async () => {
      const before = legacyAdminOn(deps.getMupiboxConfig())
      const back = () => run([before ? 'on' : 'off', 'noreload'], 90000)
      const r = await run([on ? 'on' : 'off', 'noreload'], 90000)
      if (!r.ok) {
        await back()
        return false
      }
      try {
        await deps.updateMupiboxConfig((cfg) => {
          cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), legacyAdmin: on }
        })
      } catch {
        await back()
        return false
      }
      return true
    })
    const done = job.catch(() => false)
    switching = done
      .then((ok) => new Promise((resolve) => setTimeout(resolve, ok ? 1500 : 0)))
      .then(() => run(['reload'], 30000))
      .catch(() => undefined)
    const ok = await done
    if (!ok) return void res.status(500).json({ ok: false, error: 'switch_failed' })
    console.log(`${new Date().toLocaleString()}: [MuPiBox-Server] Admin interface switched ${on ? 'on' : 'off'}`)
    res.json({ ok: true })
  })
}
