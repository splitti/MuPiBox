// The box without the DSI display (5.1): a switch of the core, "Ohne DSI-Display betreiben" under Einstellungen > Display. It
// was a setting of the extension OLED-Display before; a box that only plays NFC tags (no display, no OLED) needs it as well.
//   - on: the flag mupibox.headless in the configuration (what the scripts read: wait_display_ready.sh, restart_kiosk.sh,
//     mupi_start_led.sh - and the NFC extension, which then starts a tag's medium itself) and DietPi's autostart 0 (no kiosk,
//     no X server, no Chromium); the autostart that was there is kept and comes back when it is switched off.
//   - refused while a DSI display is connected: the box would start with a dark display.
//   - it counts from the next start of the box.
//   GET  /api/app/headless  -> { on, dsi, kiosk, pending }
//   POST /api/app/headless  { on } -> the same, or 409 { error: 'dsi_connected' } / 500 { error: 'failed' }

import { execFile } from 'node:child_process'
import { promises as fsp, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { DATA_DIR } from '../paths'
import { requireCsrf, requireSession } from './middleware'

const DRM_DIR = '/sys/class/drm'
const AUTOSTART_INDEX_FILE = '/boot/dietpi/.dietpi-autostart_index'
/** DietPi's autostart of the kiosk (autosetup.sh) and its "manual login" - no kiosk */
export const KIOSK_AUTOSTART = 11
export const NO_KIOSK_AUTOSTART = 0
/** the autostart the switch replaced (and where the extension OLED-Display kept it before 5.1's switch of the core) */
export const KEPT_AUTOSTART = path.join(DATA_DIR, 'headless-autostart.json')
export const KEPT_AUTOSTART_OLED = path.join(DATA_DIR, 'extensions', 'data', 'oled', 'autostart.json')

export interface HeadlessIo {
  run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }>
  readAutostartIndex(): number | null
  dsiConnected(): boolean
  kioskRunning(): Promise<boolean>
  /** where the autostart the switch replaced is kept (tests: a folder of their own) */
  keptFiles?: string[]
  /** the mark of a change since the box started (tests: a file of their own) */
  switchedFile?: string
}

const run = (cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}` })))

/** A DSI display is plugged in: one of the DSI connectors of /sys/class/drm says "connected" */
export function dsiConnected(drmDir = DRM_DIR): boolean {
  try {
    return readdirSync(drmDir).some((name) => {
      if (!/DSI/.test(name)) return false
      try {
        return readFileSync(path.join(drmDir, name, 'status'), 'utf8').trim() === 'connected'
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export const realIo: HeadlessIo = {
  run: (cmd, args) => run(cmd, args),
  readAutostartIndex: () => {
    try {
      const n = Number.parseInt(readFileSync(AUTOSTART_INDEX_FILE, 'utf8').trim(), 10)
      return Number.isInteger(n) ? n : null
    } catch {
      // (DietPi's "0" deletes its index file instead of writing 0)
      return null
    }
  },
  dsiConnected: () => dsiConnected(),
  // (pidof, not pgrep -x: the name of a process is cut to 15 characters, "chromium-browse" on Bookworm)
  kioskRunning: async () => (await run('pidof', ['chromium', 'chromium-browser'])).ok,
}

export interface HeadlessDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig?: (mutate: (cfg: Record<string, unknown>) => unknown) => Promise<void>
}

const flagOf = (deps: HeadlessDeps) => (deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.headless === true

const keptOf = (io: { keptFiles?: string[] }) => io.keptFiles ?? [KEPT_AUTOSTART, KEPT_AUTOSTART_OLED]
async function readKept(io: { keptFiles?: string[] }): Promise<number | null> {
  for (const file of keptOf(io)) {
    try {
      const index = JSON.parse(await fsp.readFile(file, 'utf8'))?.index
      if (Number.isInteger(index) && index > 0 && index < 100) return index
    } catch {
      // (none kept here)
    }
  }
  return null
}
const dropKept = async (io: { keptFiles?: string[] }) => {
  for (const file of keptOf(io)) await fsp.rm(file, { force: true }).catch(() => undefined)
}

const setFlag = (deps: HeadlessDeps, on: boolean) =>
  deps.updateMupiboxConfig?.((cfg) => {
    const mb = (cfg.mupibox && typeof cfg.mupibox === 'object' ? cfg.mupibox : (cfg.mupibox = {})) as Record<string, unknown>
    if (on) mb.headless = true
    else if (mb.headless === undefined) return false
    else delete mb.headless
  }) ?? Promise.reject(new Error('the configuration cannot be changed here'))

// (switched since the box started - by the app or the check at the start: off and no kiosk is then the restart that has not come
// yet, not a kiosk that is just away; /tmp is emptied at every start of DietPi, and the server may restart in between)
const SWITCHED_FILE = '/tmp/mupibox-headless-switched'
const switchedOf = (io: { switchedFile?: string }) => io.switchedFile ?? SWITCHED_FILE
const markSwitched = (io: { switchedFile?: string }) => fsp.writeFile(switchedOf(io), '').catch(() => undefined)

/** What the switch says, what the box has (a DSI display), what runs now (the kiosk) - pending: it counts after a restart */
export async function headlessState(deps: HeadlessDeps, io: HeadlessIo = realIo) {
  const on = flagOf(deps)
  const kiosk = await io.kioskRunning()
  const switched = await fsp.access(switchedOf(io)).then(() => true, () => false)
  return { on, dsi: io.dsiConnected(), kiosk, pending: on ? kiosk : !kiosk && switched }
}

export class HeadlessError extends Error {
  constructor(readonly code: 'dsi_connected' | 'failed', message: string) {
    super(message)
  }
}

let chain: Promise<unknown> = Promise.resolve()
/** Switches the start without the DSI display on or off (one change at a time) */
export function setHeadless(deps: HeadlessDeps, on: boolean, io: HeadlessIo = realIo): Promise<void> {
  const work = chain.then(() => applyHeadless(deps, on, io)).then(() => markSwitched(io))
  chain = work.catch(() => undefined)
  return work
}

async function applyHeadless(deps: HeadlessDeps, on: boolean, io: HeadlessIo): Promise<void> {
  const flag = flagOf(deps)
  const index = io.readAutostartIndex()
  if (on) {
    if (io.dsiConnected()) throw new HeadlessError('dsi_connected', 'a DSI display is connected')
    if (flag && (index === null || index === NO_KIOSK_AUTOSTART)) return
    // (what was there is brought back when it is switched off: the kiosk, or a choice the user made)
    if (index !== null && index !== NO_KIOSK_AUTOSTART) await fsp.writeFile(keptOf(io)[0], JSON.stringify({ index }), { mode: 0o600 })
    // (the flag first: should the autostart fail, the flag goes back)
    await setFlag(deps, true)
    const r = await io.run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(NO_KIOSK_AUTOSTART)])
    if (!r.ok) {
      await setFlag(deps, false).catch(() => undefined)
      // (nothing kept when DietPi did not change: a later "off" would bring back an old choice; when it did, the check at the
      // next start finds it)
      const after = io.readAutostartIndex()
      if (after !== null && after !== NO_KIOSK_AUTOSTART) await fsp.rm(keptOf(io)[0], { force: true }).catch(() => undefined)
      throw new HeadlessError('failed', `dietpi-autostart: ${r.out.slice(0, 150)}`)
    }
    return
  }
  // off: the autostart back (the one kept, else the kiosk) when it is the one without the kiosk, then the flag
  if (index === null || index === NO_KIOSK_AUTOSTART) {
    const back = (await readKept(io)) ?? KIOSK_AUTOSTART
    const r = await io.run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(back)])
    if (!r.ok) throw new HeadlessError('failed', `dietpi-autostart: ${r.out.slice(0, 150)}`)
  }
  await setFlag(deps, false)
  await dropKept(io)
}

/**
 * At the start of the server (and after a restore): a start without the kiosk on a box that has a DSI display - a backup from
 * another box, a display plugged in later - would leave it dark with no way back but SSH: the kiosk comes back. A flag without
 * DietPi's autostart 0 (a backup from a box without a display) is only cleared. DietPi's autostart 0 with an autostart the switch
 * kept but no flag (a backup from before it was switched on, a switch-on that stopped half-way) gets its flag back - the NFC
 * extension and the scripts would wait for a display that never comes - or, with a DSI display, the kiosk. Returns whether
 * something was done.
 */
export async function checkHeadlessAtStart(deps: HeadlessDeps, io: Pick<HeadlessIo, 'run' | 'readAutostartIndex' | 'dsiConnected' | 'keptFiles' | 'switchedFile'> = realIo): Promise<boolean> {
  if (!deps.updateMupiboxConfig) return false
  const index = io.readAutostartIndex()
  const noKiosk = index === null || index === NO_KIOSK_AUTOSTART
  if (!flagOf(deps)) {
    const kept = noKiosk ? await readKept(io) : null
    if (kept === null) return false
    if (!io.dsiConnected()) {
      await setFlag(deps, true)
      console.log(`${new Date().toLocaleString()}: [headless] the box starts without the kiosk: the switch is on again`)
      return true
    }
    const r = await io.run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(kept)])
    if (!r.ok) {
      console.warn(`${new Date().toLocaleString()}: [headless] a DSI display is connected, but DietPi's autostart could not be set back to ${kept}: ${r.out.slice(0, 150)}`)
      return false
    }
    await dropKept(io)
    await markSwitched(io)
    console.log(`${new Date().toLocaleString()}: [headless] a DSI display is connected: the kiosk starts after the next restart`)
    return true
  }
  if (noKiosk && !io.dsiConnected()) return false
  if (noKiosk) {
    const back = (await readKept(io)) ?? KIOSK_AUTOSTART
    const r = await io.run('sudo', ['-n', '/boot/dietpi/dietpi-autostart', String(back)])
    if (!r.ok) {
      console.warn(`${new Date().toLocaleString()}: [headless] a DSI display is connected, but DietPi's autostart could not be set back to ${back}: ${r.out.slice(0, 150)}`)
      return false
    }
  }
  await setFlag(deps, false)
  await dropKept(io)
  if (noKiosk) await markSwitched(io)
  console.log(`${new Date().toLocaleString()}: [headless] the start without the DSI display is left (${noKiosk ? 'a DSI display is connected' : 'the box starts the kiosk'}) - the kiosk starts after the next restart`)
  return true
}

/** The app's routes: the state and the switch */
export function registerHeadlessRoutes(router: Router, deps: HeadlessDeps): void {
  router.get('/headless', requireSession, async (_req, res) => {
    res.json(await headlessState(deps))
  })
  router.post('/headless', requireSession, requireCsrf, async (req, res) => {
    const on = (req.body as { on?: unknown } | undefined)?.on
    if (typeof on !== 'boolean') {
      res.status(400).json({ error: 'on: true or false' })
      return
    }
    try {
      await setHeadless(deps, on)
      res.json({ ok: true, ...(await headlessState(deps)) })
    } catch (error) {
      const code = error instanceof HeadlessError ? error.code : 'failed'
      console.warn(`${new Date().toLocaleString()}: [headless] ${on ? 'on' : 'off'}: ${(error as Error).message}`)
      res.status(code === 'dsi_connected' ? 409 : 500).json({ error: code })
    }
  })
}
