// What an install does when something goes wrong half way: a failed update leaves the version before as it was (files and state),
// a failed first install leaves nothing. Runs in a folder of its own (MUPIBOX_EXT_DIR); nothing here uses sudo.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ExtensionDeps } from './app-api/extensions'

const dir = mkdtempSync(path.join(tmpdir(), 'mupibox-ext-install-'))
process.env.MUPIBOX_EXT_DIR = dir
let install: typeof import('./app-api/extensions')['_forTests']['install']

const manifest = (version: string) => ({
  id: 'demo',
  name: 'Demo',
  version,
  description: 'x',
  hostApi: 1,
  resources: {},
  display: 'display.js',
})
const pkg = (version: string) => ({
  manifest: manifest(version) as never,
  files: new Map<string, Buffer>([
    ['manifest.json', Buffer.from(JSON.stringify(manifest(version)))],
    ['display.js', Buffer.from(`// version ${version}`)],
  ]),
})
const put = (id: string, version: string) => {
  mkdirSync(path.join(dir, id), { recursive: true })
  writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify(manifest(version)))
  writeFileSync(path.join(dir, id, 'display.js'), `// version ${version}`)
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ [id]: { version, enabled: true } }))
}
const installedVersion = () => JSON.parse(readFileSync(path.join(dir, 'demo', 'manifest.json'), 'utf8')).version
// (the box's configuration is asked once the new files are in place: here it is what fails then)
const failsOnceNew: ExtensionDeps = {
  getMupiboxConfig: () => {
    if (existsSync(path.join(dir, 'demo', 'manifest.json')) && installedVersion() === '2.0.0')
      throw new Error('configuration not readable')
    return undefined
  },
}

describe('an install that fails after the new files are in place', () => {
  before(async () => {
    install = (await import('./app-api/extensions'))._forTests.install
  })
  after(() => undefined)

  it('puts the version before back, with its files and its state', async () => {
    put('demo', '1.0.0')
    const job = await install('demo', failsOnceNew, pkg('2.0.0'))
    assert.equal(job.ok, false)
    assert.match(String(job.error), /configuration not readable/)
    assert.equal(installedVersion(), '1.0.0')
    assert.equal(readFileSync(path.join(dir, 'demo', 'display.js'), 'utf8'), '// version 1.0.0')
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).demo.version, '1.0.0')
    // nothing is left beside it
    assert.equal(existsSync(path.join(dir, '.previous-demo')), false)
    assert.equal(existsSync(path.join(dir, '.install-demo')), false)
  })

  it('puts the version before back when the state cannot be written at the very end', async () => {
    put('demo', '1.0.0')
    // (a folder where the state is written first: the write fails, as on a full card)
    mkdirSync(path.join(dir, 'state.json.new'))
    try {
      const job = await install('demo', { getMupiboxConfig: () => undefined }, pkg('2.0.0'))
      assert.equal(job.ok, false)
      assert.equal(installedVersion(), '1.0.0', 'the files of the version before')
      assert.equal(readFileSync(path.join(dir, 'demo', 'display.js'), 'utf8'), '// version 1.0.0')
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).demo.version, '1.0.0', 'and the state says the same')
      assert.equal(existsSync(path.join(dir, '.previous-demo')), false)
      assert.equal(existsSync(path.join(dir, '.install-demo')), false)
    } finally {
      rmSync(path.join(dir, 'state.json.new'), { recursive: true, force: true })
    }
    // ... and with the state writable again the same update goes through
    const job = await install('demo', { getMupiboxConfig: () => undefined }, pkg('2.0.0'))
    assert.equal(job.ok, true)
    assert.equal(installedVersion(), '2.0.0')
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).demo.version, '2.0.0')
    assert.equal(existsSync(path.join(dir, '.previous-demo')), false)
  })

  it('leaves nothing behind when it was the first install', async () => {
    const fresh = path.join(dir, 'fresh')
    mkdirSync(fresh, { recursive: true })
    // (the same package under another id: a folder that never existed)
    const other = {
      manifest: { ...manifest('2.0.0'), id: 'demo2' } as never,
      files: new Map([['manifest.json', Buffer.from(JSON.stringify({ ...manifest('2.0.0'), id: 'demo2' }))]]),
    }
    const job = await install(
      'demo2',
      {
        getMupiboxConfig: () => {
          if (existsSync(path.join(dir, 'demo2'))) throw new Error('boom')
          return undefined
        },
      },
      other,
    )
    assert.equal(job.ok, false)
    assert.equal(existsSync(path.join(dir, 'demo2')), false)
    assert.equal(existsSync(path.join(dir, '.install-demo2')), false)
  })
})
