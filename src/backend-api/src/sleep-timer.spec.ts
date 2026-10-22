// The box's power-off timer: the shared state (sleep-timer.ts) and the Home Assistant API v1 parts of it (POST
// /sleep_timer, sleep_timer in /state, the capability). The countdown script itself is not run here - its own test is
// scripts/tests/sleep_timer_test.sh (on a box, never with a real shutdown).
import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import express from 'express'
import request from 'supertest'

// the pairings of the tests in a folder of their own (read by ha-store at its import)
const haDir = mkdtempSync(path.join(os.tmpdir(), 'mupibox-ha-test-'))
process.env.MUPIBOX_HA_DIR = haDir

const timer = await import('./sleep-timer')
const store = await import('./ha/ha-store')
const ha = await import('./ha/ha-api')

const TOKENS = {
  read: 'read-only-token-0123456789abcdef',
  control: 'control-token-0123456789abcdef',
  power: 'power-token-0123456789abcdefgh',
}
writeFileSync(
  path.join(haDir, 'clients.json'),
  JSON.stringify([
    { client_id: 'c-read', client_name: 'read', token_sha256: store.tokenHash(TOKENS.read), scopes: ['read'], paired_at: '' },
    { client_id: 'c-ctl', client_name: 'control', token_sha256: store.tokenHash(TOKENS.control), scopes: ['read', 'control', 'notify'], paired_at: '' },
    { client_id: 'c-pow', client_name: 'power', token_sha256: store.tokenHash(TOKENS.power), scopes: ['read', 'control', 'power'], paired_at: '' },
  ]),
)
writeFileSync(path.join(haDir, 'device.json'), JSON.stringify({ device_id: '00000000-0000-4000-8000-000000000000' }))

// ---- a simulated box: the state file, the countdown unit and the script ----------------------------------------------

const box = {
  now: 1_800_000_000_000,
  state: null as null | { deadline: number; phase: string },
  unit: false,
  calls: [] as string[][],
  /** exit code the script gives (0 ok, 3 shutting down, 4 not changed) */
  code: 0,
}
function reset(): void {
  box.state = null
  box.unit = false
  box.calls = []
  box.code = 0
}
timer.setSleepTimerIo({
  now: () => box.now,
  readState: async () => {
    if (!box.state) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return JSON.stringify(box.state)
  },
  unitActive: async () => box.unit,
  runScript: async (args) => {
    box.calls.push(args)
    if (box.code !== 0) return { code: box.code, stdout: '' }
    if (args[0] === 'start') {
      box.state = { deadline: Math.floor(box.now / 1000) + Number(args[1]), phase: 'running' }
      box.unit = true
    } else if (args[0] === 'stop') {
      box.state = null
      box.unit = false
    }
    return { code: 0, stdout: '' }
  },
})
after(() => timer.setSleepTimerIo(undefined))

const app = ha.buildApp({
  getMupiboxConfig: () => ({ mupibox: { version: 'DEV 5.0.12' }, homeAssistant: { enabled: true } }),
  updateMupiboxConfig: async () => undefined,
  covers: {} as never,
})
const post = (token: string | null, body: unknown, type = 'application/json') => {
  const r = request(app).post('/api/ha/v1/sleep_timer').set('Content-Type', type)
  if (token) r.set('Authorization', `Bearer ${token}`)
  return r.send(typeof body === 'string' ? body : JSON.stringify(body))
}

// ---- the shared state ----------------------------------------------------------------------------------------------

describe('sleep timer state', () => {
  beforeEach(reset)

  it('is inactive without a state file', async () => {
    assert.deepStrictEqual(timer.haSleepTimer(await timer.sleepTimerState()), { active: false, ends_at: null, remaining_s: 0 })
  })

  it('is inactive when the file stayed behind but no countdown runs', async () => {
    box.state = { deadline: Math.floor(box.now / 1000) + 600, phase: 'running' }
    box.unit = false
    assert.strictEqual((await timer.sleepTimerState()).active, false)
  })

  it('rounds the seconds left upward and gives an RFC 3339 time with offset', async () => {
    box.state = { deadline: Math.floor(box.now / 1000) + 1800, phase: 'running' }
    box.unit = true
    const was = box.now
    box.now += 400 // 1799.6 s left
    const t = await timer.sleepTimerState()
    box.now = was
    assert.strictEqual(t.active, true)
    assert.strictEqual(t.remaining_s, 1800)
    assert.match(String(t.ends_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
    assert.strictEqual(new Date(String(t.ends_at)).getTime(), box.state.deadline * 1000)
  })

  it('stays active with 0 seconds while the box shuts down (also when the unit has gone)', async () => {
    box.state = { deadline: Math.floor(box.now / 1000) - 3, phase: 'shutdown' }
    box.unit = false
    const t = await timer.sleepTimerState()
    assert.deepStrictEqual([t.active, t.remaining_s, t.shutting_down], [true, 0, true])
  })

  it('takes a broken state file for none', async () => {
    box.state = { deadline: Number.NaN, phase: 'running' }
    box.unit = true
    assert.strictEqual((await timer.sleepTimerState()).active, false)
  })
})

describe('starting and stopping', () => {
  beforeEach(reset)

  it('starts with 30 minutes and replaces it with 60', async () => {
    let t = await timer.startSleepTimer(1800)
    assert.strictEqual(t.remaining_s, 1800)
    t = await timer.startSleepTimer(3600)
    assert.strictEqual(t.remaining_s, 3600)
    assert.deepStrictEqual(box.calls, [['start', '1800'], ['start', '3600']])
  })

  it('stops - twice in a row as well', async () => {
    await timer.startSleepTimer(60)
    assert.strictEqual((await timer.stopSleepTimer()).active, false)
    assert.strictEqual((await timer.stopSleepTimer()).active, false)
  })

  it('runs changes from several callers one after the other, in their order', async () => {
    await Promise.all([timer.startSleepTimer(60), timer.stopSleepTimer(), timer.startSleepTimer(120), timer.stopSleepTimer(), timer.startSleepTimer(300)])
    assert.deepStrictEqual(box.calls, [['start', '60'], ['stop'], ['start', '120'], ['stop'], ['start', '300']])
    assert.strictEqual((await timer.sleepTimerState()).remaining_s, 300)
  })

  it('reports a box that shuts down already and a script that failed - no success', async () => {
    box.code = 3
    await assert.rejects(timer.stopSleepTimer(), (e: unknown) => e instanceof timer.SleepTimerError && e.code === 'shutting_down')
    box.code = 4
    await assert.rejects(timer.startSleepTimer(60), (e: unknown) => e instanceof timer.SleepTimerError && e.code === 'unavailable')
  })

  it('passes only whole seconds in range to the script', async () => {
    for (const bad of [0, -1, 1.5, Number.NaN, 1440 * 60 + 1]) await assert.rejects(timer.startSleepTimer(bad), RangeError)
    assert.deepStrictEqual(box.calls, [])
  })
})

describe('Home Assistant request body', () => {
  const ok = (b: unknown) => timer.parseHaSleepTimerRequest(true, b)
  it('takes 0..720 as an integer', () => {
    for (const m of [0, 1, 30, 720]) assert.deepStrictEqual(ok({ minutes: m }), { ok: true, minutes: m })
  })
  it('refuses types, fractions, other fields and other content types as invalid_request', () => {
    for (const b of [{}, { minutes: null }, { minutes: '30' }, { minutes: 1.5 }, { minutes: 30, extra: 1 }, [], null, 'x']) {
      assert.strictEqual((ok(b) as { error?: string }).error, 'invalid_request', JSON.stringify(b))
    }
    assert.strictEqual((timer.parseHaSleepTimerRequest(false, { minutes: 30 }) as { error?: string }).error, 'invalid_request')
  })
  it('refuses integers out of range as invalid_value', () => {
    for (const m of [-1, 721, 1440]) assert.strictEqual((ok({ minutes: m }) as { error?: string }).error, 'invalid_value')
  })
})

// ---- Home Assistant API v1 ------------------------------------------------------------------------------------------

describe('POST /api/ha/v1/sleep_timer', () => {
  beforeEach(reset)

  it('starts with the right "power" and answers the timer as it is', async () => {
    const r = await post(TOKENS.power, { minutes: 30 }).expect(200)
    assert.strictEqual(r.body.success, true)
    assert.deepStrictEqual(Object.keys(r.body.sleep_timer).sort(), ['active', 'ends_at', 'remaining_s'])
    assert.strictEqual(r.body.sleep_timer.active, true)
    assert.strictEqual(r.body.sleep_timer.remaining_s, 1800)
  })

  it('replaces and stops (0), also when none runs', async () => {
    await post(TOKENS.power, { minutes: 30 }).expect(200)
    const r = await post(TOKENS.power, { minutes: 60 }).expect(200)
    assert.strictEqual(r.body.sleep_timer.remaining_s, 3600)
    for (let i = 0; i < 2; i++) {
      const s = await post(TOKENS.power, { minutes: 0 }).expect(200)
      assert.deepStrictEqual(s.body, { success: true, sleep_timer: { active: false, ends_at: null, remaining_s: 0 } })
    }
  })

  it('refuses read, control and notify alone (403) and no token (401) - without a change', async () => {
    for (const token of [TOKENS.read, TOKENS.control]) {
      const r = await post(token, { minutes: 30 }).expect(403)
      assert.strictEqual(r.body.error, 'insufficient_scope')
    }
    const r = await post(null, { minutes: 30 }).expect(401)
    assert.strictEqual(r.body.error, 'unauthorized')
    await post('not-a-paired-token-0123456789', { minutes: 30 }).expect(401)
    assert.deepStrictEqual(box.calls, [])
  })

  it('refuses bad bodies with 400 - without a change', async () => {
    const cases: [unknown, string, string][] = [
      [{ minutes: '30' }, 'application/json', 'invalid_request'],
      [{ minutes: 2.5 }, 'application/json', 'invalid_request'],
      [{ minutes: null }, 'application/json', 'invalid_request'],
      [{ minutes: 30, force: true }, 'application/json', 'invalid_request'],
      [{ minutes: 721 }, 'application/json', 'invalid_value'],
      [{ minutes: -5 }, 'application/json', 'invalid_value'],
      ['{"minutes":30', 'application/json', 'invalid_request'],
      ['minutes=30', 'application/x-www-form-urlencoded', 'invalid_request'],
    ]
    for (const [body, type, error] of cases) {
      const r = await post(TOKENS.power, body, type).expect(400)
      assert.strictEqual(r.body.error, error, JSON.stringify(body))
    }
    assert.deepStrictEqual(box.calls, [])
  })

  it('answers 503 when the timer could not be changed or the box shuts down', async () => {
    box.code = 4
    assert.strictEqual((await post(TOKENS.power, { minutes: 30 }).expect(503)).body.error, 'temporarily_unavailable')
    box.code = 3
    assert.strictEqual((await post(TOKENS.power, { minutes: 0 }).expect(503)).body.error, 'temporarily_unavailable')
  })
})

describe('GET /api/ha/v1/state and /info', () => {
  beforeEach(reset)

  it('shows the timer someone else set (e.g. the app or Telegram) with the right "read"', async () => {
    box.state = { deadline: Math.floor(box.now / 1000) + 900, phase: 'running' }
    box.unit = true
    const r = await request(app).get('/api/ha/v1/state').set('Authorization', `Bearer ${TOKENS.read}`).expect(200)
    assert.strictEqual(r.body.sleep_timer.active, true)
    assert.ok(r.body.playback && r.body.device, 'the fields of before are still there')
  })

  it('shows the inactive timer exactly as the contract wants it', async () => {
    const r = await request(app).get('/api/ha/v1/state').set('Authorization', `Bearer ${TOKENS.read}`).expect(200)
    assert.deepStrictEqual(r.body.sleep_timer, { active: false, ends_at: null, remaining_s: 0 })
  })

  it('tells the capability only where the shared timer is installed', async () => {
    const r = await request(app).get('/api/ha/v1/info').set('Authorization', `Bearer ${TOKENS.read}`).expect(200)
    // (on this computer there is no /usr/local/bin/mupibox/sleep_timer.sh: not told)
    assert.strictEqual(r.body.capabilities.includes('sleep_timer'), await timer.sleepTimerAvailable())
    assert.ok(r.body.capabilities.includes('poweroff'))
  })
})

describe('plain http', () => {
  it('answers the API on the app port with 426', async () => {
    const plain = express()
    ha.registerHaDisplayRoute(plain)
    const r = await request(plain).post('/api/ha/v1/sleep_timer').send({ minutes: 30 }).expect(426)
    assert.strictEqual(r.body.error, 'https_required')
  })
})
