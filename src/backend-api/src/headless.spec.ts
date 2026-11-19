// The box without the DSI display (5.1, app-api/headless.ts): the switch of the core and the check at the start. Nothing here runs
// sudo - the commands are noted, the autostart and the DSI display are what the test says.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import { checkHeadlessAtStart, dsiConnected, headlessState, setHeadless } from './app-api/headless'

const dir = mkdtempSync(path.join(tmpdir(), 'mupibox-headless-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const kept = path.join(dir, 'headless-autostart.json')
const keptOled = path.join(dir, 'oled-autostart.json')
const switchedFile = path.join(dir, 'switched')

/** A box: its configuration, DietPi's autostart (null: DietPi's "0", no index file), a DSI display or not, the kiosk running */
function box({ headless, index, dsi = false, kiosk = true, ok = true }: { headless?: boolean; index: number | null; dsi?: boolean; kiosk?: boolean; ok?: boolean }) {
  const b = {
    config: { mupibox: { version: '5.1.0', ...(headless === undefined ? {} : { headless }) } } as Record<string, unknown>,
    index,
    ran: [] as string[],
    deps: {} as Parameters<typeof setHeadless>[0],
    io: {
      run: async (cmd: string, args: string[]) => {
        b.ran.push([cmd, ...args].join(' '))
        if (ok) b.index = Number(args.at(-1))
        return { ok, out: ok ? '' : 'sudo: a password is required' }
      },
      readAutostartIndex: () => b.index,
      dsiConnected: () => dsi,
      kioskRunning: async () => kiosk,
      keptFiles: [kept, keptOled],
      switchedFile,
    },
  }
  b.deps = {
    getMupiboxConfig: () => b.config as never,
    updateMupiboxConfig: async (mutate) => {
      const copy = JSON.parse(JSON.stringify(b.config))
      if (mutate(copy) !== false) b.config = copy
    },
  }
  return b
}
const flag = (b: ReturnType<typeof box>) => (b.config.mupibox as Record<string, unknown>).headless

describe('the start without the DSI display: the switch of the core', () => {
  beforeEach(() => {
    rmSync(kept, { force: true })
    rmSync(keptOled, { force: true })
    rmSync(switchedFile, { force: true })
  })

  it('on: the flag, DietPi\'s autostart 0, the autostart before kept; off: it back, the flag gone', async () => {
    const b = box({ index: 11 })
    await setHeadless(b.deps, true, b.io)
    assert.equal(flag(b), true)
    assert.deepEqual(b.ran, ['sudo -n /boot/dietpi/dietpi-autostart 0'])
    assert.deepEqual(JSON.parse(readFileSync(kept, 'utf8')), { index: 11 })
    // (twice: nothing more)
    await setHeadless(b.deps, true, b.io)
    assert.equal(b.ran.length, 1)
    await setHeadless(b.deps, false, b.io)
    assert.equal(flag(b), undefined)
    assert.deepEqual(b.ran.at(-1), 'sudo -n /boot/dietpi/dietpi-autostart 11')
    assert.equal(existsSync(kept), false)
    assert.equal((b.config.mupibox as Record<string, unknown>).version, '5.1.0')
  })

  it('brings back an autostart the user chose before, also one the extension OLED-Display kept', async () => {
    const b = box({ index: 7 })
    await setHeadless(b.deps, true, b.io)
    await setHeadless(b.deps, false, b.io)
    assert.equal(b.ran.at(-1), 'sudo -n /boot/dietpi/dietpi-autostart 7')
    // (switched on by the extension before 5.1: its file)
    writeFileSync(keptOled, JSON.stringify({ index: 5 }))
    const c = box({ headless: true, index: null })
    await setHeadless(c.deps, false, c.io)
    assert.deepEqual(c.ran, ['sudo -n /boot/dietpi/dietpi-autostart 5'])
    assert.equal(existsSync(keptOled), false)
  })

  it('refused while a DSI display is connected; the flag goes back when DietPi refuses', async () => {
    const b = box({ index: 11, dsi: true })
    await assert.rejects(setHeadless(b.deps, true, b.io), (e: Error & { code?: string }) => e.code === 'dsi_connected')
    assert.equal(flag(b), undefined)
    assert.deepEqual(b.ran, [])
    const c = box({ index: 11, ok: false })
    await assert.rejects(setHeadless(c.deps, true, c.io), (e: Error & { code?: string }) => e.code === 'failed')
    assert.equal(flag(c), undefined)
  })

  it('the state: pending until the box restarted', async () => {
    assert.deepEqual(await headlessState(box({ headless: true, index: null, kiosk: true }).deps, box({ headless: true, index: null, kiosk: true }).io), { on: true, dsi: false, kiosk: true, pending: true })
    const b = box({ headless: true, index: null, kiosk: false })
    assert.equal((await headlessState(b.deps, b.io)).pending, false)
    // (off: no kiosk is the restart to come after it was switched off here)
    const c = box({ headless: true, index: null, kiosk: false })
    await setHeadless(c.deps, false, c.io)
    assert.equal((await headlessState(c.deps, c.io)).pending, true)
    const d = box({ index: 11, kiosk: true })
    assert.equal((await headlessState(d.deps, d.io)).pending, false)
    // (no kiosk without a change since the box started: a kiosk that is just away, nothing to restart for)
    rmSync(switchedFile, { force: true })
    assert.equal((await headlessState(c.deps, c.io)).pending, false)
  })
})

describe('the start without the DSI display: the check at the start of the server', () => {
  beforeEach(() => {
    rmSync(kept, { force: true })
    rmSync(keptOled, { force: true })
    rmSync(switchedFile, { force: true })
  })

  it('leaves it alone without the flag, and on a box without a DSI display', async () => {
    const a = box({ index: null })
    assert.equal(await checkHeadlessAtStart(a.deps, a.io), false)
    const b = box({ headless: true, index: null })
    assert.equal(await checkHeadlessAtStart(b.deps, b.io), false)
    assert.equal(flag(b), true)
    assert.deepEqual(b.ran, [])
  })

  it('brings the kiosk back on a box with a DSI display (a backup from another box, a display plugged in later)', async () => {
    writeFileSync(kept, JSON.stringify({ index: 7 }))
    const b = box({ headless: true, index: null, dsi: true })
    assert.equal(await checkHeadlessAtStart(b.deps, b.io), true)
    assert.deepEqual(b.ran, ['sudo -n /boot/dietpi/dietpi-autostart 7'])
    assert.equal(flag(b), undefined)
    assert.equal(existsSync(kept), false)
    // (the app says: after the restart)
    assert.equal((await headlessState(b.deps, { ...b.io, kioskRunning: async () => false })).pending, true)
  })

  it('only clears a flag the autostart does not go with (the kiosk starts anyway); keeps it when DietPi refuses', async () => {
    const b = box({ headless: true, index: 11 })
    assert.equal(await checkHeadlessAtStart(b.deps, b.io), true)
    assert.deepEqual(b.ran, [])
    assert.equal(flag(b), undefined)
    const c = box({ headless: true, index: 0, dsi: true, ok: false })
    assert.equal(await checkHeadlessAtStart(c.deps, c.io), false)
    assert.equal(flag(c), true)
  })

  it('autostart 0 and a kept autostart but no flag (a backup from before, a switch-on that stopped half-way): the flag back, or the kiosk with a DSI display', async () => {
    writeFileSync(kept, JSON.stringify({ index: 11 }))
    const b = box({ index: null })
    assert.equal(await checkHeadlessAtStart(b.deps, b.io), true)
    assert.equal(flag(b), true)
    assert.deepEqual(b.ran, [])
    const c = box({ index: 0, dsi: true })
    assert.equal(await checkHeadlessAtStart(c.deps, c.io), true)
    assert.deepEqual(c.ran, ['sudo -n /boot/dietpi/dietpi-autostart 11'])
    assert.equal(flag(c), undefined)
    assert.equal(existsSync(kept), false)
    // (nothing kept: autostart 0 is what the user chose, it stays)
    const d = box({ index: 0, dsi: true })
    assert.equal(await checkHeadlessAtStart(d.deps, d.io), false)
    assert.deepEqual(d.ran, [])
  })

  it('nothing kept after a switch-on DietPi refused', async () => {
    const b = box({ index: 11, ok: false })
    await assert.rejects(setHeadless(b.deps, true, b.io))
    assert.equal(existsSync(kept), false)
    assert.equal(flag(b), undefined)
  })

  it('a DSI display: a connector of /sys/class/drm with DSI in its name that says "connected"', () => {
    const drm = path.join(dir, 'drm')
    mkdirSync(path.join(drm, 'card1-DSI-1'), { recursive: true })
    mkdirSync(path.join(drm, 'card1-HDMI-A-1'), { recursive: true })
    writeFileSync(path.join(drm, 'card1-HDMI-A-1', 'status'), 'connected\n')
    writeFileSync(path.join(drm, 'card1-DSI-1', 'status'), 'disconnected\n')
    assert.equal(dsiConnected(drm), false)
    writeFileSync(path.join(drm, 'card1-DSI-1', 'status'), 'connected\n')
    assert.equal(dsiConnected(drm), true)
    assert.equal(dsiConnected(path.join(dir, 'none')), false)
  })
})
