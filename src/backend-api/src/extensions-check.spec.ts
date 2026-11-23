// The check of the installed extensions at the start of the server: what cannot run on this box is switched off, with the reason.
// Runs in a folder of its own (MUPIBOX_EXT_DIR); nothing here uses sudo (no extension of these has a systemd unit).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import { PROBLEM_MESSAGES } from './app-api/extension-health'

const dir = mkdtempSync(path.join(tmpdir(), 'mupibox-ext-check-'))
process.env.MUPIBOX_EXT_DIR = dir
after(() => rmSync(dir, { recursive: true, force: true }))

type Ext = typeof import('./app-api/extensions')
let ext: Ext

const manifest = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  version: '1.0.0',
  description: 'x',
  hostApi: 1,
  resources: {},
  display: 'display.js',
  ...extra,
})
const put = (
  id: string,
  extra: Record<string, unknown> = {},
  files: Record<string, string> = { 'display.js': '// x' },
) => {
  mkdirSync(path.join(dir, id), { recursive: true })
  writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify(manifest(id, extra)))
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, id, name), text)
}
const state = (s: Record<string, unknown>) => writeFileSync(path.join(dir, 'state.json'), JSON.stringify(s))
const readState = () =>
  JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')) as Record<
    string,
    { enabled: boolean; problem?: { code: string; message: string; detail?: string } }
  >
const on = (version = '1.0.0') => ({ version, enabled: true })
const deps = (config?: Record<string, unknown>) => ({ getMupiboxConfig: () => config as never })

describe('the check of the installed extensions at the start', () => {
  beforeEach(async () => {
    ext ??= await import('./app-api/extensions')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  })

  it('leaves an extension that is fine as it is - and one the user switched off', async () => {
    put('fine')
    put('off', { display: undefined })
    state({ fine: on(), off: { version: '1.0.0', enabled: false } })
    await ext.checkInstalledExtensions(deps())
    assert.deepEqual(readState(), { fine: on(), off: { version: '1.0.0', enabled: false } })
  })

  it('switches off one made for a newer box, and says so', async () => {
    put('future', { hostApi: 99 })
    state({ future: on() })
    await ext.checkInstalledExtensions(deps())
    const p = readState().future
    assert.equal(p.enabled, false)
    assert.equal(p.problem?.code, 'newer_box')
    assert.equal(p.problem?.message, PROBLEM_MESSAGES.newer_box)
    assert.match(String(p.problem?.detail), /hostApi 99/)
  })

  it('switches off one whose manifest is gone, damaged or of another extension', async () => {
    mkdirSync(path.join(dir, 'gone'), { recursive: true })
    mkdirSync(path.join(dir, 'broken'), { recursive: true })
    writeFileSync(path.join(dir, 'broken', 'manifest.json'), '{"id": "broken", ')
    put('liar')
    writeFileSync(path.join(dir, 'liar', 'manifest.json'), JSON.stringify(manifest('someone-else')))
    state({ gone: on(), broken: on(), liar: on() })
    await ext.checkInstalledExtensions(deps())
    for (const id of ['gone', 'broken', 'liar'])
      assert.deepEqual([readState()[id].enabled, readState()[id].problem?.code], [false, 'manifest_missing'], id)
  })

  it('says which ones it switched off (the player starts again when one of them has a part there)', async () => {
    put('fine')
    put('future', { hostApi: 99 })
    state({ fine: on(), future: on() })
    assert.deepEqual(await ext.checkInstalledExtensions(deps()), ['future'])
    assert.deepEqual(await ext.checkInstalledExtensions(deps()), [])
  })

  it('finds what one made for a newer box set up as root, for the cleanup - and only names of its own', async () => {
    put('future', {
      hostApi: 99,
      player: 'player.js',
      system: {
        units: [{ name: 'mpx-future.service', file: 'a.service' }, { name: 'ssh.service', file: 'b.service' }],
        udev: [{ name: '99-mpx-future.rules', file: 'x.rules' }, { name: '99-other.rules', file: 'y.rules' }, null],
      },
    })
    assert.equal(await ext.readManifest('future'), null)
    assert.deepEqual(await ext._forTests.setUpBy('future'), {
      units: [{ name: 'mpx-future.service' }],
      udev: [{ name: '99-mpx-future.rules' }],
      player: true,
    })
    assert.deepEqual(await ext._forTests.setUpBy('nothing-here'), { units: [], udev: [], player: false })
    assert.deepEqual(await ext._forTests.setUpBy('../x'), { units: [], udev: [], player: false })
  })

  it('writes the changes of state.json one after the other', async () => {
    state({})
    await Promise.all(
      ['a', 'b', 'c', 'd'].map((id) =>
        ext._forTests.changeState((s) => {
          s[id] = on()
        }),
      ),
    )
    assert.deepEqual(Object.keys(readState()).sort(), ['a', 'b', 'c', 'd'])
    assert.equal(await ext._forTests.changeState(() => false), false)
  })

  it('switches off one that the box does not accept any more, and one whose files are gone', async () => {
    put('strict', { ui: { title: 'T', items: [{ type: 'action', label: 'Go' }] }, hostApi: 7 })
    put('lost', { api: 'api.js' }, {})
    state({ strict: on(), lost: on() })
    await ext.checkInstalledExtensions(deps())
    assert.equal(readState().strict.problem?.code, 'manifest_invalid')
    assert.match(String(readState().strict.problem?.detail), /action address/)
    assert.equal(readState().lost.problem?.code, 'files_missing')
  })

  it('switches off the one that came last when two want the same pin', async () => {
    const gpio = (pin: number) => ({ resources: { gpio: [{ pin, purpose: 'x' }] } })
    put('first', gpio(17))
    put('second', gpio(17))
    put('third', gpio(18))
    state({ first: on(), second: on(), third: on() })
    await ext.checkInstalledExtensions(deps())
    assert.equal(readState().first.enabled, true)
    assert.equal(readState().third.enabled, true)
    assert.deepEqual([readState().second.enabled, readState().second.problem?.code], [false, 'conflict'])
    assert.match(String(readState().second.problem?.detail), /GPIO 17.*extension first/)
  })

  it('switches off one that crashed the server again and again', async () => {
    put('shaky')
    put('steady')
    state({ shaky: on(), steady: on() })
    const t = Date.now()
    writeFileSync(
      path.join(dir, 'crashes.json'),
      JSON.stringify({ shaky: [t - 3000, t - 2000, t - 1000], steady: [t - 1000] }),
    )
    await ext.checkInstalledExtensions(deps())
    assert.deepEqual([readState().shaky.enabled, readState().shaky.problem?.code], [false, 'crashing'])
    assert.equal(readState().steady.enabled, true)
  })

  it('tells what the app needs to show a card for an extension it cannot read, and to try again', async () => {
    put('future', { hostApi: 99 })
    state({ future: on() })
    assert.deepEqual(await ext.diagnoseFiles('future'), {
      code: 'newer_box',
      detail: 'it needs hostApi 99, this box has ' + (await import('./app-api/extensions')).HOST_API,
    })
    // (repaired: the same files, made for this box)
    put('future')
    assert.equal(await ext.diagnoseFiles('future'), null)
    assert.deepEqual(await ext.diagnoseFiles('nothing-here'), { code: 'manifest_missing' })
  })

  it('accepts every extension of this repository (an update of the box must not switch off what it ships with)', async () => {
    const root = path.join(process.cwd(), '..', '..', 'extensions')
    const { readdirSync, existsSync } = await import('node:fs')
    const ids = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, 'manifest.json')) && d.name !== 'dist')
      .map((d) => d.name)
    assert.ok(ids.length >= 5, ids.join(','))
    const names = (id: string) =>
      new Set(readdirSync(path.join(root, id), { recursive: true }).map((n) => String(n).replace(/\\/g, '/')))
    for (const id of ids) {
      const m = JSON.parse(readFileSync(path.join(root, id, 'manifest.json'), 'utf8'))
      assert.equal(ext.checkManifest(m, names(id)), null, id)
    }
  })
})

