// What goes wrong with an installed extension after the box was updated (or something else changed), and what the box says about it.
//
// An extension is a folder in the data of the user (~/.mupibox/data/extensions/<id>/), so a box update leaves it alone - but the box
// it runs on is another one then: the rules for a manifest may be stricter, the extension may be made for a newer box, a pin it
// wants may be taken by the core now, its program may not start, or it takes the whole server down. The box checks this at every
// start (extensions.ts: checkInstalledExtensions); an extension that cannot run is switched off and the reason is kept with it, in
// state.json, so that the app can say what went wrong. This file holds the sentences and the log of the crashes.

import fs from 'node:fs'
import path from 'node:path'

export type ProblemCode =
  | 'manifest_missing'
  | 'newer_box'
  | 'manifest_invalid'
  | 'files_missing'
  | 'conflict'
  | 'api_failed'
  | 'crashing'

export interface Problem {
  code: ProblemCode
  /** one of the fixed sentences below (German; the app translates it) */
  message: string
  /** technical detail, in English, for the user who wants to know more or has to report it */
  detail?: string
  /** when it was found (ISO) */
  at: string
}

// (fixed sentences: the app translates them, so they never carry a name or a number - that is what `detail` is for)
export const PROBLEM_MESSAGES: Record<ProblemCode, string> = {
  manifest_missing:
    'Die Beschreibung der Erweiterung (manifest.json) fehlt oder lässt sich nicht lesen. Bitte die Erweiterung neu installieren.',
  newer_box:
    'Diese Version der Erweiterung ist für eine neuere MuPiBox gemacht. Bitte die MuPiBox aktualisieren oder eine ältere Version der Erweiterung installieren.',
  manifest_invalid:
    'Die Erweiterung passt nicht mehr zu dieser MuPiBox-Version: Ihre Beschreibung wird nicht mehr angenommen. Bitte die Erweiterung aktualisieren oder neu installieren.',
  files_missing: 'Dateien der Erweiterung fehlen. Bitte die Erweiterung neu installieren.',
  conflict: 'Die Erweiterung braucht einen Anschluss oder Port, den jetzt etwas anderes belegt.',
  api_failed: 'Das Programm der Erweiterung ließ sich nicht starten.',
  crashing: 'Die Erweiterung hat die MuPiBox mehrmals kurz hintereinander zum Absturz gebracht.',
}

/** The problem as it is kept in state.json. */
export function makeProblem(code: ProblemCode, detail?: string, now: Date = new Date()): Problem {
  const text = typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
  return { code, message: PROBLEM_MESSAGES[code], ...(text ? { detail: text } : {}), at: now.toISOString() }
}

/** A problem read back from state.json (null when it is not one: the file may have been edited). */
export function readProblem(raw: unknown): Problem | null {
  const p = raw as Partial<Problem> | null
  if (!p || typeof p !== 'object' || typeof p.code !== 'string' || !(p.code in PROBLEM_MESSAGES)) return null
  const at = typeof p.at === 'string' && !Number.isNaN(Date.parse(p.at)) ? p.at : new Date(0).toISOString()
  return { ...makeProblem(p.code as ProblemCode, typeof p.detail === 'string' ? p.detail : undefined), at }
}

// ---------- the crashes ----------
// An uncaught error ends the server (server.ts), and pm2 starts it again. When the stack of that error runs through the files of an
// extension, the crash is written down - at once and synchronously, the process is about to end. At the next start an extension that
// crashed the server CRASH_LIMIT times within CRASH_WINDOW_MS is switched off, so that the box does not restart in a loop.

export const CRASH_LIMIT = 3
export const CRASH_WINDOW_MS = 10 * 60 * 1000
const CRASH_FILE = 'crashes.json'

/** The extension whose files an error went through (the first one in its stack), or null. */
export function extensionOfStack(stack: string | undefined, extDir: string): string | null {
  if (!stack) return null
  const text = stack.replace(/\\/g, '/')
  const base = `${extDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`
  let from = 0
  for (;;) {
    const at = text.indexOf(base, from)
    if (at < 0) return null
    const hit = /^([a-z][a-z0-9-]{1,30})\//.exec(text.slice(at + base.length))
    // ("data/<id>" holds the data of the extensions, no program)
    if (hit && hit[1] !== 'data') return hit[1]
    from = at + base.length
  }
}

type Crashes = Record<string, number[]>

function readCrashes(extDir: string): Crashes {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(extDir, CRASH_FILE), 'utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Crashes = {}
    for (const [id, times] of Object.entries(raw))
      if (Array.isArray(times)) out[id] = times.filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    return out
  } catch {
    return {}
  }
}

function writeCrashes(extDir: string, crashes: Crashes): void {
  try {
    fs.mkdirSync(extDir, { recursive: true })
    const file = path.join(extDir, CRASH_FILE)
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, JSON.stringify(crashes))
    fs.renameSync(temp, file)
  } catch {
    // (the box goes down anyway; nothing to do about a log that cannot be written)
  }
}

/** Writes down that the error went through the files of an extension. Returns its id, or null when it did not. */
export function noteCrash(extDir: string, error: unknown, now: number = Date.now()): string | null {
  const id = extensionOfStack(error instanceof Error ? error.stack : undefined, extDir)
  if (!id) return null
  const crashes = readCrashes(extDir)
  crashes[id] = [...(crashes[id] ?? []).filter((t) => now - t < CRASH_WINDOW_MS), now]
  writeCrashes(extDir, crashes)
  return id
}

/** The extensions that crashed the server CRASH_LIMIT times or more within the window. */
export function crashingExtensions(extDir: string, now: number = Date.now()): string[] {
  return Object.entries(readCrashes(extDir))
    .filter(([, times]) => times.filter((t) => now - t < CRASH_WINDOW_MS).length >= CRASH_LIMIT)
    .map(([id]) => id)
}

/** Forgets the crashes of an extension (it is switched on again by the user: it gets a new chance). */
export function clearCrashes(extDir: string, id: string): void {
  const crashes = readCrashes(extDir)
  if (!(id in crashes)) return
  delete crashes[id]
  writeCrashes(extDir, crashes)
}

// ---------- a pin that is taken ----------
// An extension that cannot be switched on because a pin it was given in its settings is held by something else (the HAT of the box, a
// part of the core, another extension) can be put right in one step: the pin is moved to a free one, or the connection is taken away
// (the pin set to "none"). This works out which setting gets what; extensions.ts reads the box and saves the result.

export interface PinSetting {
  key: string
  label: string
  pin: number
}

export interface PinChange {
  key: string
  label: string
  from: number
  to: number
}

// (the pins a free pin is chosen from: the serial port, GPIO 14 and 15, and the I2C pins 2 and 3 are left alone)
const MOVE_FROM = 4
const MOVE_TO = 27
const NOT_MOVED_TO = new Set([14, 15])

/**
 * What to do with the settings that hold a pin that is in conflict. `taken`: every pin that is not free (what holds it, the pins
 * the core would want, ...). Only the settings whose pin is in `conflictPins` change; `move` gives each the lowest free pin that is
 * not used by another setting of the extension, `remove` sets it to 0 (no pin).
 */
export function planPinFix(options: { settings: PinSetting[]; conflictPins: Set<number>; taken: Set<number>; action: 'move' | 'remove' }): { ok: true; changes: PinChange[] } | { ok: false; error: 'nothing_to_fix' | 'no_free_pin' } {
  const wrong = options.settings.filter((s) => s.pin !== 0 && options.conflictPins.has(s.pin))
  if (wrong.length === 0) return { ok: false, error: 'nothing_to_fix' }
  if (options.action === 'remove') return { ok: true, changes: wrong.map((s) => ({ key: s.key, label: s.label, from: s.pin, to: 0 })) }
  const used = new Set(options.settings.filter((s) => s.pin !== 0 && !options.conflictPins.has(s.pin)).map((s) => s.pin))
  const changes: PinChange[] = []
  for (const setting of wrong) {
    let found = 0
    for (let pin = MOVE_FROM; pin <= MOVE_TO && !found; pin++) if (!NOT_MOVED_TO.has(pin) && !options.taken.has(pin) && !used.has(pin)) found = pin
    if (!found) return { ok: false, error: 'no_free_pin' }
    used.add(found)
    changes.push({ key: setting.key, label: setting.label, from: setting.pin, to: found })
  }
  return { ok: true, changes }
}
