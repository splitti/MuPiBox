// Einstellungen › Aussehen › Startbilder: own pictures for the start, the goodbye and the empty battery instead of the
// chosen design's. The app fits a picture to the display (fill or show whole) and sends it as a PNG of the display's
// size; bootscreen_update.sh puts it in place of the design's pictures of that kind (all scenes, so "random" too) and
// takes the start picture's colour for the console and the browser's start (no flash between the pictures).

import { spawn } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { readBody } from './covers'
import { requireCsrf, requireSession } from './middleware'

export interface CustomBootDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const CUSTOM_DIR = '/home/dietpi/MuPiBox/sysmedia/images/bootscreen-custom'
const KINDS = ['splash', 'goodbye', 'battery'] as const
type Kind = (typeof KINDS)[number]
const MAX_BYTES = 8 * 1024 * 1024

// the display's size (as the kiosk's window: chromium.resX / resY), 800 × 480 without
function displaySize(cfg: unknown): { width: number; height: number } {
  const c = ((cfg as { chromium?: { resX?: unknown; resY?: unknown } } | undefined)?.chromium ?? {}) as { resX?: unknown; resY?: unknown }
  const n = (v: unknown, d: number) => {
    const x = Number.parseInt(String(v ?? ''), 10)
    return Number.isInteger(x) && x >= 200 && x <= 7680 ? x : d
  }
  return { width: n(c.resX, 800), height: n(c.resY, 480) }
}

// a PNG's size from its header (IHDR), or null when it is no PNG
function pngSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

// the box puts the pictures together again (with the own ones in place), in the background
function rebuild(): void {
  const child = spawn('sudo', ['/usr/local/bin/mupibox/bootscreen_update.sh'], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as readonly string[]).includes(v)

export function registerCustomBootRoutes(router: Router, deps: CustomBootDeps): void {
  /** GET /api/app/bootscreen/custom - which own pictures there are (with their time, for the previews) and the size
   *  the app fits a picture to. */
  router.get('/bootscreen/custom', requireSession, async (_req, res) => {
    const pictures: Record<string, number | null> = {}
    for (const k of KINDS) pictures[k] = (await fsp.stat(`${CUSTOM_DIR}/${k}.png`).catch(() => null))?.mtimeMs ?? null
    res.json({ ...displaySize(deps.getMupiboxConfig()), pictures })
  })

  /** GET /api/app/bootscreen/custom/:kind.png - an own picture (the preview in the app). */
  router.get('/bootscreen/custom/:kind.png', requireSession, (req, res) => {
    const kind = req.params.kind
    const file = `${CUSTOM_DIR}/${kind}.png`
    if (!isKind(kind) || !existsSync(file)) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(file)
  })

  /** PUT /api/app/bootscreen/custom?kind=splash&color=rrggbb  body: the picture as a PNG of the display's size (the
   *  app fitted it); color: its edge's colour (the console's at the start, only for the start picture). */
  router.put('/bootscreen/custom', requireSession, requireCsrf, async (req, res) => {
    const kind = req.query.kind
    if (!isKind(kind)) {
      res.status(400).json({ error: 'invalid kind' })
      return
    }
    const bytes = await readBody(req, MAX_BYTES)
    if (!bytes) {
      if (!res.headersSent) res.status(413).json({ error: 'too_large' })
      return
    }
    const size = pngSize(bytes)
    const want = displaySize(deps.getMupiboxConfig())
    if (!size || size.width !== want.width || size.height !== want.height) {
      res.status(400).json({ error: 'not_a_display_png', want })
      return
    }
    await fsp.mkdir(CUSTOM_DIR, { recursive: true })
    await fsp.writeFile(`${CUSTOM_DIR}/${kind}.png.part`, bytes)
    await fsp.rename(`${CUSTOM_DIR}/${kind}.png.part`, `${CUSTOM_DIR}/${kind}.png`)
    const color = typeof req.query.color === 'string' && /^[0-9a-f]{6}$/i.test(req.query.color) ? req.query.color : null
    if (kind === 'splash' && color) await fsp.writeFile(`${CUSTOM_DIR}/color`, `${color}\n`)
    // (a picture chosen: the own pictures are the ones shown)
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), bootscreenCustom: true }
    })
    rebuild()
    res.json({ ok: true })
  })

  /** POST /api/app/bootscreen/custom/remove {kind} - the design's picture again. */
  router.post('/bootscreen/custom/remove', requireSession, requireCsrf, async (req, res) => {
    const kind = (req.body as { kind?: unknown } | undefined)?.kind
    if (!isKind(kind)) {
      res.status(400).json({ error: 'invalid kind' })
      return
    }
    await fsp.rm(`${CUSTOM_DIR}/${kind}.png`, { force: true })
    if (kind === 'splash') await fsp.rm(`${CUSTOM_DIR}/color`, { force: true })
    rebuild()
    res.json({ ok: true })
  })
}
