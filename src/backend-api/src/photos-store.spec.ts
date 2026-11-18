import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import { ALBUMS_DIR, albums, copyLibraryTo, forgetCache, freezeLibrary, PHOTOS_DIR, type PhotoAsset, thawLibrary, update } from './app-api/photos/store'

// The photo display's list (5.1): the albums in library.json, each album's pictures in albums/<album>.json - a file is
// written only when what it holds changed (with everything in one file, every picture of a sync wrote 6.6 MB).
// In tests the photos live in config/photos (paths.ts).

const LIBRARY = path.join(PHOTOS_DIR, 'library.json')
const fileOf = (id: string) => path.join(ALBUMS_DIR, `${id}.json`)
const asset = (id: string): PhotoAsset => ({ id, w: 4, h: 3, taken: null, added: '2026-11-18T20:00:00.000Z', kind: 'photo' })
const album = (id: string, ids: string[], position = 0) => ({
  id,
  title: `Album ${id}`,
  source: 'upload' as const,
  display: true,
  position,
  created: '2026-11-18T20:00:00.000Z',
  assets: ids.map(asset),
})
const A = 'aaaaaaaaaa'
const B = 'bbbbbbbbbb'

const fresh = () => {
  rmSync(PHOTOS_DIR, { recursive: true, force: true })
  forgetCache()
}

describe('photo list split per album', () => {
  beforeEach(fresh)
  after(fresh)

  it('writes the albums without their pictures into library.json and each album into its own file', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111', '2222222222']), album(B, ['3333333333'], 1))
    })
    const index = JSON.parse(readFileSync(LIBRARY, 'utf8'))
    assert.equal(index.version, 2)
    assert.deepEqual(
      index.albums.map((a: { id: string }) => a.id),
      [A, B],
    )
    assert.ok(index.albums.every((a: Record<string, unknown>) => !('assets' in a)))
    assert.deepEqual(
      JSON.parse(readFileSync(fileOf(A), 'utf8')).map((x: PhotoAsset) => x.id),
      ['1111111111', '2222222222'],
    )
    forgetCache()
    assert.deepEqual(
      (await albums()).map((a) => [a.id, a.assets.length]),
      [
        [A, 2],
        [B, 1],
      ],
    )
  })

  it('writes nothing when nothing changed, and only the album that changed', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']), album(B, ['3333333333'], 1))
    })
    // (gone from the card: a file written again would be there again)
    rmSync(fileOf(A))
    rmSync(fileOf(B))
    rmSync(LIBRARY)
    await update(() => undefined)
    assert.equal(existsSync(fileOf(A)), false)
    assert.equal(existsSync(fileOf(B)), false)
    assert.equal(existsSync(LIBRARY), false)
    await update((lib) => {
      lib.albums[1].assets.push(asset('4444444444'))
    })
    assert.equal(existsSync(fileOf(A)), false)
    assert.equal(existsSync(LIBRARY), false)
    assert.equal(JSON.parse(readFileSync(fileOf(B), 'utf8')).length, 2)
    await update((lib) => {
      lib.albums[0].title = 'Neu'
    })
    assert.equal(existsSync(fileOf(A)), false)
    assert.equal(JSON.parse(readFileSync(LIBRARY, 'utf8')).albums[0].title, 'Neu')
  })

  it('removes the file of an album deleted', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']), album(B, ['3333333333'], 1))
    })
    await update((lib) => {
      lib.albums = lib.albums.filter((a) => a.id !== A)
    })
    assert.equal(existsSync(fileOf(A)), false)
    assert.ok(existsSync(fileOf(B)))
  })

  it('reads a list from before (the pictures in library.json) and splits it at its next change', async () => {
    mkdirSync(ALBUMS_DIR, { recursive: true })
    // (a file left by a newer list, the list of before restored over it: the list of before counts)
    writeFileSync(fileOf(A), JSON.stringify([asset('9999999999')]))
    writeFileSync(LIBRARY, JSON.stringify({ version: 1, albums: [album(A, ['1111111111', '2222222222'])], rejected: ['nas:x|1'] }))
    forgetCache()
    assert.deepEqual(
      (await albums())[0].assets.map((x) => x.id),
      ['1111111111', '2222222222'],
    )
    await update(() => undefined)
    const index = JSON.parse(readFileSync(LIBRARY, 'utf8'))
    assert.equal(index.version, 2)
    assert.equal('assets' in index.albums[0], false)
    assert.deepEqual(index.rejected, ['nas:x|1'])
    assert.deepEqual(
      JSON.parse(readFileSync(fileOf(A), 'utf8')).map((x: PhotoAsset) => x.id),
      ['1111111111', '2222222222'],
    )
  })

  it('removes files of albums the list does not name, and keeps a broken one aside', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    writeFileSync(fileOf(B), '[]')
    forgetCache()
    await albums()
    assert.equal(existsSync(fileOf(B)), false)
    writeFileSync(fileOf(A), '{broken')
    forgetCache()
    assert.equal((await albums())[0].assets.length, 0)
    assert.ok(readdirSync(ALBUMS_DIR).some((f) => f.startsWith(`${A}.json.broken-`)))
    // (the album's file is written again at the next change)
    await update((lib) => {
      lib.albums[0].assets.push(asset('5555555555'))
    })
    assert.equal(JSON.parse(readFileSync(fileOf(A), 'utf8')).length, 1)
  })

  it('reads the list once when a reader and a change ask at the same time - the change stays', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    forgetCache()
    const reading = albums()
    const change = update((lib) => {
      lib.albums.push(album(B, ['3333333333'], 1))
    })
    await Promise.all([reading, change])
    assert.ok(existsSync(fileOf(B)))
    assert.deepEqual(
      (await albums()).map((a) => a.id),
      [A, B],
    )
    await update((lib) => {
      lib.albums[0].title = 'Neu'
    })
    forgetCache()
    assert.deepEqual(
      (await albums()).map((a) => a.id),
      [A, B],
    )
  })

  it('keeps the albums files aside with a broken list', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    writeFileSync(LIBRARY, '{broken')
    forgetCache()
    assert.deepEqual(await albums(), [])
    const aside = readdirSync(PHOTOS_DIR).find((f) => f.startsWith('albums.broken-'))
    assert.ok(aside)
    assert.ok(existsSync(path.join(PHOTOS_DIR, aside, `${A}.json`)))
    await update((lib) => {
      lib.albums.push(album(B, ['3333333333']))
    })
    forgetCache()
    await albums()
    assert.ok(existsSync(path.join(PHOTOS_DIR, aside, `${A}.json`)))
  })

  it('does not take the list when an album file cannot be read', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    rmSync(fileOf(A))
    mkdirSync(fileOf(A))
    forgetCache()
    await assert.rejects(albums())
    await assert.rejects(update(() => undefined))
    rmSync(fileOf(A), { recursive: true })
  })

  it('does not take a list it cannot read, and moves nothing aside', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    rmSync(LIBRARY)
    mkdirSync(LIBRARY)
    forgetCache()
    await assert.rejects(albums())
    assert.ok(existsSync(fileOf(A)))
    assert.equal(
      readdirSync(PHOTOS_DIR).some((f) => f.includes('.broken-')),
      false,
    )
    rmSync(LIBRARY, { recursive: true })
  })

  it('moves nothing aside while a backup is being restored', async () => {
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']))
    })
    await freezeLibrary()
    try {
      writeFileSync(LIBRARY, '{half')
      forgetCache()
      assert.deepEqual(await albums(), [])
      assert.ok(existsSync(LIBRARY))
      assert.ok(existsSync(fileOf(A)))
    } finally {
      thawLibrary()
    }
  })

  it('copies the list and its albums files for a backup', async () => {
    const dir = path.join(PHOTOS_DIR, 'copy')
    assert.equal(await copyLibraryTo(dir), false)
    await update((lib) => {
      lib.albums.push(album(A, ['1111111111']), album(B, ['3333333333'], 1))
    })
    writeFileSync(`${fileOf(B)}.broken-1`, '{')
    assert.equal(await copyLibraryTo(dir), true)
    assert.deepEqual(readdirSync(path.join(dir, 'albums')).sort(), [`${A}.json`, `${B}.json`])
    assert.equal(readFileSync(path.join(dir, 'library.json'), 'utf8'), readFileSync(LIBRARY, 'utf8'))
  })
})
