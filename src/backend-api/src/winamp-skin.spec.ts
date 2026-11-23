import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { activateSkin, addSkin, bmpSize, ensureDefaultSkin, installSkin, listSkins, parsePledit, parseViscolors, readSkinMeta, readZip, removeSkinById, type SkinDirs } from './app-api/winamp-skin'

// A zip with stored (not packed) files - what a skin needs, made here so the test has no file of anyone else's.
function zip(files: Record<string, Buffer>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    parts.push(local, nameBuf, data)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt32LE(data.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(nameBuf.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

// the head of a Windows bitmap: enough for its size to be read
function bmp(width: number, height: number): Buffer {
  const b = Buffer.alloc(60)
  b.write('BM', 0, 'latin1')
  b.writeInt32LE(width, 18)
  b.writeInt32LE(height, 22)
  return b
}

const skinZip = (extra: Record<string, Buffer> = {}) =>
  zip({ 'Main.BMP': bmp(275, 116), 'CBUTTONS.BMP': bmp(136, 36), 'folder/Titlebar.bmp': bmp(344, 87), 'viscolor.txt': Buffer.from('0,0,0\n10,20,30\n'), 'pledit.txt': Buffer.from('[Text]\nNormal=#00ff00\nFont=Arial\n'), 'readme.txt': Buffer.from('x'), ...extra })

const dirs = (): SkinDirs => {
  const base = mkdtempSync(path.join(tmpdir(), 'winamp-skins-'))
  return { active: path.join(base, 'skin'), library: path.join(base, 'skins') }
}

describe('winamp skins', () => {
  it('reads a skin: lower-case bitmaps, sizes, colours; leaves out what the display does not use', async () => {
    const d = dirs()
    const { id, meta } = await addSkin(skinZip(), 'My Skin.wsz', d)
    assert.match(id, /^my-skin-[a-z0-9]+$/)
    assert.equal(meta.name, 'My Skin')
    assert.deepEqual(meta.files['main.bmp'], [275, 116])
    assert.deepEqual(meta.files['titlebar.bmp'], [344, 87])
    assert.equal(meta.files['readme.txt' as never], undefined)
    assert.deepEqual(meta.viscolors, ['#000000', '#0a141e'])
    assert.equal(meta.pledit.normal, '#00FF00')
    assert.ok(existsSync(path.join(d.active, 'main.bmp')))
    assert.ok(!existsSync(path.join(d.active, 'readme.txt')))
  })

  it('a skin that is added is shown; the list keeps all of them, the newest first', async () => {
    const d = dirs()
    const a = await addSkin(skinZip(), 'First.wsz', d)
    await new Promise((r) => setTimeout(r, 5))
    const b = await addSkin(skinZip(), 'Second.wsz', d)
    const list = await listSkins(d)
    assert.deepEqual(list.map((s) => [s.name, s.active]), [['Second', true], ['First', false]])
    assert.equal(list[0].id, b.id)
    assert.equal(list[1].id, a.id)
    assert.equal((await readSkinMeta(d.active))?.id, b.id)
  })

  it('an earlier skin can be chosen again, and the display is told it is new (a new version)', async () => {
    const d = dirs()
    const a = await addSkin(skinZip(), 'First.wsz', d)
    await new Promise((r) => setTimeout(r, 5))
    await addSkin(skinZip(), 'Second.wsz', d)
    const before = (await readSkinMeta(d.active))?.version ?? 0
    await new Promise((r) => setTimeout(r, 5))
    const meta = await activateSkin(a.id, d)
    assert.equal(meta?.id, a.id)
    assert.ok((meta?.version ?? 0) > before)
    assert.deepEqual((await listSkins(d)).map((s) => [s.name, s.active]).sort(), [['First', true], ['Second', false]])
  })

  it('removing one that is not shown leaves the shown one; removing the shown one empties the display', async () => {
    const d = dirs()
    const a = await addSkin(skinZip(), 'First.wsz', d)
    await new Promise((r) => setTimeout(r, 5))
    const b = await addSkin(skinZip(), 'Second.wsz', d)
    assert.equal(await removeSkinById(a.id, d), true)
    assert.deepEqual((await listSkins(d)).map((s) => s.name), ['Second'])
    assert.ok(existsSync(path.join(d.active, 'main.bmp')))
    assert.equal(await removeSkinById(b.id, d), true)
    assert.deepEqual(await listSkins(d), [])
    assert.ok(!existsSync(d.active))
  })

  it('takes a skin that was uploaded before the list existed into the list', async () => {
    const d = dirs()
    await installSkin(skinZip(), 'Old.wsz', d.active)
    const list = await listSkins(d)
    assert.deepEqual(list.map((s) => [s.name, s.active]), [['Old', true]])
    assert.ok(existsSync(path.join(d.library, list[0].id, 'main.bmp')))
    // (and once: the next look finds the same one)
    assert.equal((await listSkins(d)).length, 1)
  })

  it('refuses ids that are paths, and a zip that is no skin', async () => {
    const d = dirs()
    await addSkin(skinZip(), 'First.wsz', d)
    for (const id of ['../skin', 'a/b', '', 'UPPER', '.hidden', 'x'.repeat(80)]) {
      assert.equal(await activateSkin(id, d), undefined)
      assert.equal(await removeSkinById(id, d), false)
    }
    await assert.rejects(addSkin(zip({ 'readme.txt': Buffer.from('hi') }), 'Nope.wsz', d), /not a Winamp skin/)
    await assert.rejects(addSkin(Buffer.from('this is not a zip at all, just text'), 'Nope.wsz', d), /not a zip/)
    assert.equal((await listSkins(d)).length, 1)
  })

  it('the base skin comes once: first skin of a box, never again after it was taken out', async () => {
    const d = dirs()
    const root = mkdtempSync(path.join(tmpdir(), 'skin-default-'))
    const file = path.join(root, 'base-2.91.wsz')
    const mark = path.join(root, '.default-skin-done')
    // (no file yet: nothing happens, the next start tries again)
    assert.equal(await ensureDefaultSkin(file, mark, d), false)
    assert.equal(existsSync(mark), false)
    writeFileSync(file, skinZip())
    assert.equal(await ensureDefaultSkin(file, mark, d), true)
    const list = await listSkins(d)
    assert.deepEqual(list.map((s) => [s.name, s.active]), [['base-2.91', true]])
    assert.ok(existsSync(path.join(d.active, 'main.bmp')))
    // (taken out by the parents: it does not come back)
    assert.equal(await removeSkinById(list[0].id, d), true)
    assert.equal(await ensureDefaultSkin(file, mark, d), false)
    assert.equal((await listSkins(d)).length, 0)
    // (a box that has a skin already: marked, not changed)
    const d2 = dirs()
    const mark2 = path.join(root, '.mark2')
    await addSkin(skinZip(), 'Mine.wsz', d2)
    assert.equal(await ensureDefaultSkin(file, mark2, d2), false)
    assert.ok(existsSync(mark2))
    assert.deepEqual((await listSkins(d2)).map((s) => s.name), ['Mine'])
  })

  it('small helpers: zip entries, bitmap size, the colours', () => {
    assert.deepEqual(readZip(zip({ 'a.txt': Buffer.from('abc') })).map((e) => [e.name, e.data.toString()]), [['a.txt', 'abc']])
    assert.deepEqual(bmpSize(bmp(10, 20)), [10, 20])
    assert.equal(bmpSize(Buffer.from('nope')), undefined)
    assert.equal(parseViscolors('1,2,3,\n300,0,0').join(), '#010203,#ff0000')
    assert.equal(parsePledit('NormalBG=#112233').normalBg, '#112233')
    assert.ok(readFileSync)
  })
})
