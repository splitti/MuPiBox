// The display model (app: Einstellungen › Display & Bedienung › Display-Modell) and the rotation of a display that runs
// with KMS. A display on the ribbon cable (DSI) does not say what it is (no EDID as with HDMI): the model is chosen, and
// every change is a test - the box restarts with it, the app and the display ask "Siehst du ein Bild?", and without an
// answer within 3 minutes the box goes back by itself (scripts/mupibox/display_profile.sh). The labels of the models
// are the app's (translated there); here they are ids, the same list as the script's.

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'
import { bootConfigPath } from './boot-paths'

const PROFILE_SH = '/usr/local/bin/mupibox/display_profile.sh'
const ROTATION_SH = '/usr/local/bin/mupibox/display_rotation.sh'
const TEST_FILE = '/var/lib/mupibox/display-profile/test'
const TEST_SECONDS = 180
const MAX_SECONDS = 360

// id -> its overlay ('' = the display of the firmware: the official 7" of the 1st generation, HDMI)
const WS_V1 = ['7_0_inchC', '7_0_inchH', '7_9_inch', '8_0_inch', '8_8_inch', '10_1_inch', '11_9_inch']
const WS_V2 = ['7_0_inch_a', '7_0_inch_b', '7_0_inch_c', '8_0_inch_a', '8_8_inch_a', '9_0_inch_b', '10_1_inch_a', '10_1_inch_b', '12_3_inch_a_4lane']
export const DISPLAY_OVERLAYS: Record<string, string> = {
  official7: '',
  'td2-5': 'vc4-kms-dsi-ili9881-5inch',
  'td2-7': 'vc4-kms-dsi-ili9881-7inch',
  'td2-10': 'vc4-kms-dsi-ili79600-10-1inch',
  'ws-5': 'vc4-kms-dsi-7inch',
  'ws-43': 'vc4-kms-dsi-7inch',
  ...Object.fromEntries(WS_V1.map((p) => [`ws-v1-${p}`, `vc4-kms-dsi-waveshare-panel,${p}`])),
  ...Object.fromEntries(WS_V2.map((p) => [`ws-v2-${p}`, `vc4-kms-dsi-waveshare-panel-v2,${p}`])),
  'edatec-7': 'vc4-kms-dsi-edatec-panel-070c',
  'edatec-10': 'vc4-kms-dsi-edatec-panel-101c',
}

export interface DisplayProfileDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
}

function run(cmd: string, args: string[], timeoutMs = 60000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

function detached(script: string): void {
  const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

/** The lines of config.txt that count (no comments, no empty ones) */
function activeLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/**
 * Which model the box runs with now - from config.txt, so a box that shows a picture has its model preselected:
 * a known overlay -> its model (the one noted in the settings when several share the overlay); no display overlay
 * and no KMS -> the official 7" (1st generation; also HDMI or no display); anything else -> 'custom'.
 */
export function detectDisplayProfile(configTxt: string, noted: unknown): string {
  const lines = activeLines(configTxt)
  const dsi = lines.find((l) => /^dtoverlay=vc4-kms-dsi-/.test(l))?.slice('dtoverlay='.length)
  if (!dsi) return lines.some((l) => /^dtoverlay=vc4-(f)?kms-v3d/.test(l)) ? 'custom' : 'official7'
  if (typeof noted === 'string' && DISPLAY_OVERLAYS[noted] === dsi) return noted
  const ids = Object.keys(DISPLAY_OVERLAYS).filter((id) => DISPLAY_OVERLAYS[id] === dsi)
  return ids.length === 1 ? ids[0] : 'custom'
}

/** The display with KMS on the ribbon cable that is connected (card1-DSI-1 -> 'DSI-1', its own mode '720x1280') */
async function dsiDisplay(): Promise<{ output: string; native: string }> {
  const names = await fsp.readdir('/sys/class/drm').catch(() => [] as string[])
  for (const n of names.filter((x) => /^card\d+-DSI-\d+$/.test(x))) {
    const status = await fsp.readFile(`/sys/class/drm/${n}/status`, 'utf8').catch(() => '')
    if (status.trim() !== 'connected') continue
    const modes = await fsp.readFile(`/sys/class/drm/${n}/modes`, 'utf8').catch(() => '')
    const native = /^(\d+x\d+)/.exec(modes.trim())?.[1] ?? ''
    return { output: n.replace(/^card\d+-/, ''), native }
  }
  return { output: '', native: '' }
}
const connectedDsi = async () => (await dsiDisplay()).output

export interface DisplayTest {
  running: boolean
  // (which test: an answer names it - another device may have ended this one and started the next meanwhile)
  id?: string
  profile?: string
  previous?: string
  // the box goes back (its time ran out, or "Nein")
  reverting?: boolean
  endsAt?: number | null
  // seconds until the box goes back (null before the restart with it): for a browser, whose clock may be another
  left?: number | null
}
const TEST_ID = /^\d+-\d+$/

/** The test of a new model: waiting for its answer (endsAt: when the box goes back; null before the restart with it) */
export async function displayTestState(): Promise<DisplayTest> {
  const text = await fsp.readFile(TEST_FILE, 'utf8').catch(() => '')
  if (!text) return { running: false }
  const get = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(text)?.[1]?.trim() ?? ''
  // (state=prepare: the change is being written, or was cut off - the next start goes back)
  const ready = get('state') === 'ready'
  const booted = ready ? Number(get('booted')) : 0
  // The end from the time the box has run since its start (booted_uptime): the clock was not right yet when the test
  // was noted - a Pi starts with the time it last saved and is set from the network later, minutes on, and the end
  // came that much too early here (the box's own timer counts from the start, not by the clock). The clock only for a
  // test noted before.
  // The 3 minutes from the app's first visit after that start (asked_uptime), within 6 from the start - without the
  // app the box waits those 6 (display_profile.sh asked).
  const sinceStart = ready ? Number(get('booted_uptime')) : 0
  const asked = Number(get('asked_uptime'))
  const uptime = Number((await fsp.readFile('/proc/uptime', 'utf8').catch(() => '')).split(' ')[0])
  let endsAt: number | null = null
  if (sinceStart > 0 && uptime > 0) {
    const end = asked > 0 ? Math.min(asked + TEST_SECONDS, sinceStart + MAX_SECONDS) : sinceStart + MAX_SECONDS
    endsAt = Date.now() + Math.max(0, end - uptime) * 1000
  } else if (booted > 0) endsAt = (booted + TEST_SECONDS) * 1000
  const left = endsAt === null ? null : Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  return { running: true, id: get('id'), profile: get('profile'), previous: get('previous'), reverting: get('state') === 'reverting', endsAt, left }
}

/**
 * The picture of the new model is there - only after the start with it (before, the old display still shows one), and
 * for the test the answer was given to (id; checked again by the script under its lock)
 */
export async function confirmDisplayTest(id?: unknown): Promise<boolean> {
  const test = await displayTestState()
  if (!test.endsAt) return false
  if (id === undefined) return (await run('sudo', [PROFILE_SH, 'confirm'])).ok
  if (typeof id !== 'string' || !TEST_ID.test(id) || id !== test.id) return false
  return (await run('sudo', [PROFILE_SH, 'confirm', id])).ok
}

export function registerDisplayProfileRoutes(router: Router, deps: DisplayProfileDeps): void {
  /** GET /api/app/display-profile - the model now (from config.txt), the rotation and a running test */
  router.get('/display-profile', requireSession, async (_req, res) => {
    // (the app reaches the box after the start with a new model: its 3 minutes begin - once, the script knows)
    const first = await displayTestState()
    if (first.endsAt && !/^asked_uptime=\d/m.test(await fsp.readFile(TEST_FILE, 'utf8').catch(() => ''))) {
      await run('sudo', [PROFILE_SH, 'asked'], 20000)
    }
    // The test before the model: the way back puts config.txt and the settings back first and removes the test file
    // last - a test read as over has its model of before in place, read after it (the other way round, a way back
    // finished in between showed the tested model with no test: "kept")
    const test = await displayTestState()
    const mb = (deps.getMupiboxConfig()?.mupibox ?? {}) as Record<string, unknown>
    const configTxt = await fsp.readFile(await bootConfigPath(), 'utf8').catch(() => '')
    const { output, native } = await dsiDisplay()
    const rotation = Number(mb.displayRotation)
    res.json({
      current: detectDisplayProfile(configTxt, mb.displayProfile),
      kms: output !== '',
      output,
      // (its own way up: '720x1280' is upright - turned by 90 or 270 degrees it lies as the MuPiBox needs it)
      native,
      rotation: [0, 90, 180, 270].includes(rotation) ? rotation : 0,
      // mirrored left-right ('x') or top-bottom ('y') instead of turned; null = not
      mirror: mb.displayMirror === 'x' || mb.displayMirror === 'y' ? mb.displayMirror : null,
      test,
    })
  })

  /** POST /api/app/display-profile {profile} - the box restarts with it as a test (back by itself without an answer) */
  router.post('/display-profile', requireSession, requireCsrf, async (req, res) => {
    const profile = String((req.body as { profile?: unknown } | undefined)?.profile ?? '')
    if (!(profile in DISPLAY_OVERLAYS)) {
      res.status(400).json({ error: 'unknown_profile' })
      return
    }
    if ((await displayTestState()).running) {
      res.status(409).json({ error: 'test_running' })
      return
    }
    const mb = (deps.getMupiboxConfig()?.mupibox ?? {}) as Record<string, unknown>
    const before = detectDisplayProfile(await fsp.readFile(await bootConfigPath(), 'utf8').catch(() => ''), mb.displayProfile)
    if (before === profile) {
      res.status(400).json({ error: 'same_profile' })
      return
    }
    const r = await run('sudo', [PROFILE_SH, 'apply', profile, before], 120000)
    if (!r.ok) {
      res.status(500).json({ error: 'apply_failed', detail: r.stdout.trim().slice(-200) })
      return
    }
    const { id } = await displayTestState()
    // (after the answer: the restart cuts the connection)
    detached('sleep 2; sudo /usr/local/bin/mupibox/restart.sh')
    res.json({ ok: true, id, profile, previous: before, rebooting: true })
  })

  /** POST /api/app/display-profile/confirm {id} - the picture is there: the model stays */
  router.post('/display-profile/confirm', requireSession, requireCsrf, async (req, res) => {
    res.json({ ok: await confirmDisplayTest((req.body as { id?: unknown } | undefined)?.id) })
  })

  /** POST /api/app/display-profile/revert {id} - no picture: back to the model of before (the box restarts) */
  router.post('/display-profile/revert', requireSession, requireCsrf, async (req, res) => {
    const id = (req.body as { id?: unknown } | undefined)?.id
    const test = await displayTestState()
    if (!test.running) {
      res.status(409).json({ error: 'no_test' })
      return
    }
    if (id !== undefined && (typeof id !== 'string' || !TEST_ID.test(id) || id !== test.id)) {
      res.status(409).json({ error: 'other_test' })
      return
    }
    // (the id once more for the script: this test ended and another began within that second - not that one)
    detached(`sleep 1; sudo ${PROFILE_SH} revert${id === undefined ? '' : ` ${id}`}`)
    res.json({ ok: true, rebooting: true })
  })

  /**
   * POST /api/app/display-rotation {degrees} or {mirror: 'x'|'y'} - a display with KMS turned or mirrored (picture and
   * touch, not both - as display_hdmi_rotate); the kiosk restarts
   */
  router.post('/display-rotation', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { degrees?: unknown; mirror?: unknown }
    const degrees = Number(body.degrees)
    const mirror = body.mirror === 'x' || body.mirror === 'y' ? body.mirror : null
    if (!mirror && ![0, 90, 180, 270].includes(degrees)) {
      res.status(400).json({ error: "degrees must be 0, 90, 180 or 270, or mirror 'x' or 'y'" })
      return
    }
    if (!(await connectedDsi())) {
      res.status(409).json({ error: 'no_kms_display' })
      return
    }
    const r = await run('sudo', [ROTATION_SH, mirror ? `mirror-${mirror}` : String(degrees)])
    if (!r.ok) {
      res.status(500).json({ error: 'rotation_failed' })
      return
    }
    detached('sudo -i -u dietpi bash -c "setsid nohup /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 < /dev/null &"')
    res.json({ ok: true, degrees: mirror ? 0 : degrees, mirror })
  })
}
