// The sentences about an extension the box switched off, and the log of the crashes that tells which extension keeps ending the server.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  clearCrashes,
  crashingExtensions,
  extensionOfStack,
  makeProblem,
  noteCrash,
  PROBLEM_MESSAGES,
  planPinFix,
  readProblem,
} from './app-api/extension-health'

const dir = mkdtempSync(path.join(tmpdir(), 'mupibox-ext-health-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const EXT = '/home/dietpi/.mupibox/data/extensions'
const stackOf = (...frames: string[]) => `Error: boom\n${frames.map((f) => `    at ${f}`).join('\n')}`

describe('the problem of an extension', () => {
  it('is one of the fixed sentences, with the detail kept short and in one line', () => {
    const p = makeProblem(
      'newer_box',
      `it needs hostApi 11\n   this box has 10 ${'x'.repeat(400)}`,
      new Date('2026-11-17T10:00:00Z'),
    )
    assert.equal(p.message, PROBLEM_MESSAGES.newer_box)
    assert.equal(p.at, '2026-11-17T10:00:00.000Z')
    assert.ok(p.detail && p.detail.length <= 300 && !p.detail.includes('\n'))
    assert.equal(makeProblem('crashing').detail, undefined)
  })
  it('is read back from state.json only when it is one; a hand-edited one gets the sentence of its code', () => {
    assert.equal(readProblem(undefined), null)
    assert.equal(readProblem('x'), null)
    assert.equal(readProblem({ code: 'whatever' }), null)
    const p = readProblem({
      code: 'conflict',
      message: 'something else',
      detail: 'GPIO 17 is already used',
      at: 'yesterday',
    })
    assert.deepEqual(
      [p?.code, p?.message, p?.detail],
      ['conflict', PROBLEM_MESSAGES.conflict, 'GPIO 17 is already used'],
    )
    assert.equal(Number.isNaN(Date.parse(p?.at ?? '')), false)
  })
})

describe('which extension an error belongs to', () => {
  it('is the first one whose files the stack goes through', () => {
    assert.equal(
      extensionOfStack(
        stackOf(`activate (${EXT}/nfc/api.js:12:3)`, 'Module._compile (node:internal/modules/cjs/loader:1)'),
        EXT,
      ),
      'nfc',
    )
    assert.equal(
      extensionOfStack(stackOf(`x (${EXT}/data/nfc/tags.json)`, `y (${EXT}/oled/driver.js:1:1)`), EXT),
      'oled',
      'data/ is no extension',
    )
    assert.equal(
      extensionOfStack(stackOf(`f (${EXT}/users/api.js:1:1)`), `${EXT}/`),
      'users',
      'a slash at the end of the folder does no harm',
    )
    assert.equal(extensionOfStack(stackOf(`f (C:\\ext\\clock\\api.js:1:1)`), 'C:\\ext'), 'clock', 'Windows paths')
  })
  it('is none for an error of the box itself', () => {
    assert.equal(extensionOfStack(stackOf('handler (/home/dietpi/MuPiBox/server.js:1:1)'), EXT), null)
    assert.equal(extensionOfStack(undefined, EXT), null)
    assert.equal(extensionOfStack(stackOf(`f (${EXT}/Bad_Name/api.js:1:1)`), EXT), null)
  })
})

describe('the crashes', () => {
  const crash = (id: string) =>
    Object.assign(new Error('boom'), { stack: stackOf(`activate (${dir}/${id}/api.js:1:1)`) })
  it('count up within ten minutes; the third one makes the extension crashing', () => {
    const t0 = 1_700_000_000_000
    assert.equal(noteCrash(dir, crash('nfc'), t0), 'nfc')
    assert.equal(noteCrash(dir, crash('nfc'), t0 + 1000), 'nfc')
    assert.deepEqual(crashingExtensions(dir, t0 + 2000), [])
    noteCrash(dir, crash('nfc'), t0 + 2000)
    assert.equal(CRASH_LIMIT, 3)
    assert.deepEqual(crashingExtensions(dir, t0 + 3000), ['nfc'])
    // ... and not any more when they were long ago
    assert.deepEqual(crashingExtensions(dir, t0 + CRASH_WINDOW_MS + 5000), [])
    // an old crash does not count with the new ones
    noteCrash(dir, crash('nfc'), t0 + CRASH_WINDOW_MS + 10_000)
    assert.deepEqual(crashingExtensions(dir, t0 + CRASH_WINDOW_MS + 11_000), [])
  })
  it('of an error that is not one of an extension are not written down', () => {
    const before = existsSync(path.join(dir, 'crashes.json'))
      ? readFileSync(path.join(dir, 'crashes.json'), 'utf8')
      : ''
    assert.equal(noteCrash(dir, new Error('of the box'), 5), null)
    assert.equal(noteCrash(dir, 'not even an error', 5), null)
    assert.equal(
      existsSync(path.join(dir, 'crashes.json')) ? readFileSync(path.join(dir, 'crashes.json'), 'utf8') : '',
      before,
    )
  })
  it('are forgotten when the user switches the extension on again; a damaged log is no log', () => {
    const t0 = 1_800_000_000_000
    for (let i = 0; i < 3; i++) noteCrash(dir, crash('oled'), t0 + i)
    assert.deepEqual(crashingExtensions(dir, t0 + 10), ['oled'])
    clearCrashes(dir, 'oled')
    assert.deepEqual(crashingExtensions(dir, t0 + 10), [])
    writeFileSync(path.join(dir, 'crashes.json'), '{"nfc": [1, 2')
    assert.deepEqual(crashingExtensions(dir, t0), [])
    noteCrash(dir, crash('clock'), t0)
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'crashes.json'), 'utf8')), { clock: [t0] })
  })
})

describe('a pin that something else holds', () => {
  const settings = [
    { key: 'b1Pin', label: 'Taster 1', pin: 2 },
    { key: 'b2Pin', label: 'Taster 2', pin: 5 },
    { key: 'b3Pin', label: 'Taster 3', pin: 0 },
  ]
  it('is moved to the lowest free pin that no other setting uses; the others stay', () => {
    const plan = planPinFix({ settings, conflictPins: new Set([2]), taken: new Set([4, 6]), action: 'move' })
    assert.deepEqual(plan, { ok: true, changes: [{ key: 'b1Pin', label: 'Taster 1', from: 2, to: 7 }] })
  })
  it('never goes to the serial port, and two pins in conflict get two different pins', () => {
    const many = [
      { key: 'a', label: 'A', pin: 2 },
      { key: 'b', label: 'B', pin: 3 },
    ]
    const taken = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    const plan = planPinFix({ settings: many, conflictPins: new Set([2, 3]), taken, action: 'move' })
    assert.deepEqual(plan.ok && plan.changes.map((c) => c.to), [16, 17], '14 and 15 are the serial port')
  })
  it('is taken away: the setting says no pin (0)', () => {
    const plan = planPinFix({ settings, conflictPins: new Set([2, 5]), taken: new Set(), action: 'remove' })
    assert.deepEqual(plan.ok && plan.changes.map((c) => [c.key, c.to]), [['b1Pin', 0], ['b2Pin', 0]])
  })
  it('says so when nothing is wrong, and when no pin is left', () => {
    assert.deepEqual(planPinFix({ settings, conflictPins: new Set([9]), taken: new Set(), action: 'move' }), { ok: false, error: 'nothing_to_fix' })
    const all = new Set(Array.from({ length: 24 }, (_, i) => i + 4))
    assert.deepEqual(planPinFix({ settings, conflictPins: new Set([2]), taken: all, action: 'move' }), { ok: false, error: 'no_free_pin' })
  })
})
