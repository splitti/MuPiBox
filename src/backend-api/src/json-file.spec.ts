import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { sweepTempFiles, writeFileWhole, writeFileWholeSync, writeJson, writeJsonSync } from './json-file'

// Files of the box's data written whole (next to it, fsync, renamed over it) and only when their content changed

const dir = mkdtempSync(path.join(os.tmpdir(), 'json-file-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const old = new Date('2020-01-01T00:00:00Z')

for (const [name, write] of [
  ['async', (f: string, t: string, o?: { ifChanged?: boolean }) => writeFileWhole(f, t, o)],
  ['sync', async (f: string, t: string, o?: { ifChanged?: boolean }) => writeFileWholeSync(f, t, o)],
] as const) {
  describe(`writeFileWhole (${name})`, () => {
    it('writes a new file and replaces it, leaving no temporary file', async () => {
      const f = path.join(dir, `${name}-a.json`)
      assert.equal(await write(f, '[1]'), true)
      assert.equal(await write(f, '[1,2]'), true)
      assert.equal(readFileSync(f, 'utf8'), '[1,2]')
      assert.deepEqual(
        readdirSync(dir).filter((x) => x.startsWith(`${name}-a.json.tmp`)),
        [],
      )
    })

    it('leaves a file alone that holds the same already', async () => {
      const f = path.join(dir, `${name}-b.json`)
      writeFileSync(f, '{"a":1}')
      utimesSync(f, old, old)
      assert.equal(await write(f, '{"a":1}'), false)
      assert.equal(statSync(f).mtimeMs, old.getTime())
      assert.equal(await write(f, '{"a":1}', { ifChanged: false }), true)
      assert.notEqual(statSync(f).mtimeMs, old.getTime())
    })

    it('fails without leaving a temporary file when it cannot write', async () => {
      const f = path.join(dir, 'missing', `${name}-c.json`)
      await assert.rejects(async () => write(f, '[]'))
      assert.deepEqual(
        readdirSync(dir).filter((x) => x.includes(`${name}-c.json`)),
        [],
      )
    })
  })
}

describe('sweepTempFiles', () => {
  it('removes what a power cut left of these writes, not the scripts files', async () => {
    const d = mkdtempSync(path.join(dir, 'sweep-'))
    for (const f of ['data.json', 'heard.json.tmp.123.4', 'data.json.tmp.99.1700000000000', 'data.json.tmp.555']) writeFileSync(path.join(d, f), '')
    await sweepTempFiles(d)
    assert.deepEqual(readdirSync(d).sort(), ['data.json', 'data.json.tmp.555'])
  })
})

describe('writeJson', () => {
  it('writes JSON with the spaces given, once', async () => {
    const f = path.join(dir, 'j.json')
    assert.equal(await writeJson(f, { a: [1] }, { spaces: 2 }), true)
    assert.equal(readFileSync(f, 'utf8'), '{\n  "a": [\n    1\n  ]\n}')
    assert.equal(writeJsonSync(f, { a: [1] }, { spaces: 2 }), false)
  })
})
