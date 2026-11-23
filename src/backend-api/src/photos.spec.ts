import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ordered } from './app-api/photos/albums'
import { applyPhotoSettings, applyPhotoTimeAction, logicalDate, PHOTO_DEFAULTS, photoSettings } from './app-api/photos/settings'
import { PhotoAborted, processPhoto, setPhotoInstallWait } from './app-api/photos/process'
import type { PhotoAsset } from './app-api/photos/store'

test('photo settings: off with its defaults on a box from before, broken values give the default', () => {
  assert.deepEqual(photoSettings(undefined), PHOTO_DEFAULTS)
  assert.deepEqual(photoSettings({ photos: { enabled: 'yes', slideshowSeconds: 4, order: 'x', screensaver: { afterMinutes: 99 } } }), PHOTO_DEFAULTS)
  const s = photoSettings({ photos: { enabled: true, slideshowSeconds: 3, order: 'taken', screensaver: { enabled: true, afterMinutes: 12 } } })
  assert.equal(s.enabled, true)
  assert.equal(s.slideshowSeconds, 3)
  assert.equal(s.order, 'taken')
  assert.deepEqual(s.screensaver, { enabled: true, afterMinutes: 12, duringPlayback: false })
})

test('photo settings: a change takes only known fields in range, a wrong one writes nothing', () => {
  const target: Record<string, unknown> = { enabled: false, screensaver: { enabled: true, afterMinutes: 5 } }
  assert.equal(applyPhotoSettings(target, { enabled: true, slideshowSeconds: 8, screensaver: { afterMinutes: 30 }, other: 1 }), null)
  assert.deepEqual(target, { enabled: true, slideshowSeconds: 8, screensaver: { enabled: true, afterMinutes: 30 } })
  const before = JSON.stringify(target)
  assert.match(String(applyPhotoSettings(target, { enabled: false, slideshowSeconds: 4 })), /slideshowSeconds/)
  assert.match(String(applyPhotoSettings(target, { screensaver: { afterMinutes: 0 } })), /afterMinutes/)
  assert.match(String(applyPhotoSettings(target, { order: 'random' })), /order/)
  assert.equal(JSON.stringify(target), before)
})

test('photo order: newest first, by the day taken (else the day it came), shuffled keeps every picture', () => {
  const a = (id: string, added: string, taken: string | null): PhotoAsset => ({ id, w: 1, h: 1, added, taken, kind: 'photo' })
  const list = [a('a', '2026-01-02', '2020-05-01T10:00:00'), a('b', '2026-01-03', null), a('c', '2026-01-01', '2019-01-01T08:00:00')]
  assert.deepEqual(ordered(list, 'newest').map((x) => x.id), ['b', 'a', 'c'])
  assert.deepEqual(ordered(list, 'taken').map((x) => x.id), ['c', 'a', 'b'])
  assert.deepEqual(ordered(list, 'shuffle').map((x) => x.id).sort(), ['a', 'b', 'c'])
  assert.deepEqual(list.map((x) => x.id), ['a', 'b', 'c'])
})

test('photo time settings: mode, limit, minutes per weekday, warning and idle pause - checked, broken ones the default', () => {
  const s = photoSettings({ photos: { limitMode: 'shared', limitEnabled: false, dailyMinutes: { mon: 0, tue: 45, wed: -1, thu: '30' }, warnMinutes: 3, idlePauseSeconds: 300 } })
  assert.equal(s.limitMode, 'shared')
  assert.equal(s.limitEnabled, false)
  assert.deepEqual(s.dailyMinutes, { mon: 0, tue: 45, wed: 20, thu: 30, fri: 20, sat: 20, sun: 20 })
  assert.equal(s.warnMinutes, 5)
  assert.equal(s.idlePauseSeconds, 300)
  const target: Record<string, unknown> = { dailyMinutes: { mon: 10 } }
  assert.equal(applyPhotoSettings(target, { limitMode: 'separate', dailyMinutes: { sat: 30 }, warnMinutes: 0, idlePauseSeconds: 60, limitEnabled: true }), null)
  assert.deepEqual(target, { dailyMinutes: { mon: 10, sat: 30 }, limitMode: 'separate', warnMinutes: 0, idlePauseSeconds: 60, limitEnabled: true })
  const before = JSON.stringify(target)
  assert.match(String(applyPhotoSettings(target, { dailyMinutes: { sat: 1441 } })), /dailyMinutes/)
  assert.match(String(applyPhotoSettings(target, { dailyMinutes: { someday: 5 } })), /weekday/)
  assert.match(String(applyPhotoSettings(target, { limitMode: 'both' })), /limitMode/)
  assert.match(String(applyPhotoSettings(target, { warnMinutes: 3 })), /warnMinutes/)
  assert.match(String(applyPhotoSettings(target, { idlePauseSeconds: 30 })), /idlePauseSeconds/)
  assert.equal(JSON.stringify(target), before)
})

test('photo time actions: today by the reset hour, minutes add up, free, reset keeps them; another day starts anew', () => {
  const now = new Date(2026, 10, 11, 2, 30)
  assert.equal(logicalDate(now, 4), '2026-11-10')
  assert.equal(logicalDate(now, 0), '2026-11-11')
  const cfg: Record<string, unknown> = { playtimeLimit: { resetHour: 4 }, photos: { enabled: true, today: { date: '2026-11-09', free: true } } }
  assert.equal(applyPhotoTimeAction(cfg, 'extend', 10, now), null)
  assert.equal(applyPhotoTimeAction(cfg, 'extend', 5, now), null)
  assert.deepEqual((cfg.photos as Record<string, unknown>).today, { date: '2026-11-10', bonusMinutes: 15 })
  assert.equal(applyPhotoTimeAction(cfg, 'free', undefined, now), null)
  assert.equal(applyPhotoTimeAction(cfg, 'reset', undefined, now), null)
  assert.deepEqual((cfg.photos as Record<string, unknown>).today, { date: '2026-11-10', bonusMinutes: 15, free: true, reset: now.getTime() })
  assert.equal((cfg.photos as Record<string, unknown>).enabled, true)
  const before = JSON.stringify(cfg)
  assert.match(String(applyPhotoTimeAction(cfg, 'extend', 0, now)), /minutes/)
  assert.match(String(applyPhotoTimeAction(cfg, 'more', 5, now)), /action/)
  assert.equal(JSON.stringify(cfg), before)
})

test('photo NAS folders: paths cleaned, settings checked, defaults on a box from before', async () => {
  const { applyNasPhotoSettings, cleanNasPath, nasPhotoSettings } = await import('./app-api/photos/nas')
  assert.equal(cleanNasPath('photo//2024/'), '/photo/2024')
  assert.equal(cleanNasPath('/a/../b'), null)
  assert.equal(cleanNasPath('/'), null)
  assert.deepEqual(nasPhotoSettings(undefined), { folders: [], subfoldersAsAlbums: true, syncMinutes: 360, cacheLimitMb: 2048 })
  const cfg: Record<string, unknown> = { photos: { enabled: true, sources: { immich: { url: 'x' } } } }
  assert.equal(applyNasPhotoSettings(cfg, { folders: ['/Fotos/Urlaub', 'Fotos/Urlaub', '/Fotos/Zelten'], subfoldersAsAlbums: false, syncMinutes: 60, cacheLimitMb: 0 }), null)
  assert.deepEqual(nasPhotoSettings(cfg), { folders: ['/Fotos/Urlaub', '/Fotos/Zelten'], subfoldersAsAlbums: false, syncMinutes: 60, cacheLimitMb: 0 })
  assert.deepEqual((cfg.photos as { sources: Record<string, unknown> }).sources.immich, { url: 'x' })
  const before = JSON.stringify(cfg)
  assert.equal(applyNasPhotoSettings(cfg, { folders: ['/ok', '/../x'] }), 'folders')
  assert.equal(applyNasPhotoSettings(cfg, { syncMinutes: 30 }), 'syncMinutes')
  assert.equal(applyNasPhotoSettings(cfg, { cacheLimitMb: 3000 }), 'cacheLimitMb')
  assert.equal(JSON.stringify(cfg), before)
})

test('photo Immich: address and settings checked, the key kept as given to encrypt', async () => {
  const { applyImmichSettings, cleanImmichUrl, immichSettings } = await import('./app-api/photos/immich')
  assert.equal(cleanImmichUrl('192.168.1.20:2283'), 'http://192.168.1.20:2283')
  assert.equal(cleanImmichUrl('https://photos.example.lan/api/'), 'https://photos.example.lan')
  assert.equal(cleanImmichUrl('ftp://x'), null)
  assert.equal(cleanImmichUrl('http://user:pw@x'), null)
  const cfg: Record<string, unknown> = { photos: { sources: { nas: { folders: ['/a'] } } } }
  const id = '0f2b8c1e-1234-4abc-9def-0123456789ab'
  assert.equal(applyImmichSettings(cfg, { url: 'http://10.0.0.5:2283', apiKey: 'abcdefghijklmnop', albumIds: [id, id], keepCopy: false }, (x) => `enc:${x}`), null)
  const s = immichSettings(cfg)
  assert.equal(s.url, 'http://10.0.0.5:2283')
  assert.equal(s.apiKey, 'enc:abcdefghijklmnop')
  assert.deepEqual(s.albumIds, [id])
  assert.equal(s.keepCopy, false)
  assert.deepEqual((cfg.photos as { sources: Record<string, unknown> }).sources.nas, { folders: ['/a'] })
  const before = JSON.stringify(cfg)
  assert.equal(applyImmichSettings(cfg, { albumIds: ['nope'] }), 'albumIds')
  assert.equal(applyImmichSettings(cfg, { apiKey: 'short' }), 'apiKey')
  assert.equal(applyImmichSettings(cfg, { url: 'ftp://x' }), 'url')
  // (another server: the key kept is not handed on to it)
  assert.equal(applyImmichSettings(cfg, { url: 'http://evil.example:2283' }), 'apiKey')
  assert.equal(JSON.stringify(cfg), before)
  assert.equal(applyImmichSettings(cfg, { url: 'http://10.0.0.5:2283/' }), null)
  assert.equal(applyImmichSettings(cfg, { url: 'http://10.0.0.6:2283', apiKey: 'zyxwvutsrqponmlk' }, (x) => `enc:${x}`), null)
  assert.equal(immichSettings(cfg).apiKey, 'enc:zyxwvutsrqponmlk')
})

test('photo Immich: albums of people and the favourites - checked, kept, as the sync asks for them', async () => {
  const { applyImmichSettings, FAVORITES_REF, immichRefs, immichSettings, peopleOfRef, peopleRef, searchLimitOf, spreadChoice } = await import('./app-api/photos/immich')
  // (a choice spread: the same one whatever the order of the list, and a new picture moves at most one out)
  const list = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }))
  const ten = spreadChoice(list, 10).map((x) => x.id)
  assert.equal(ten.length, 10)
  assert.deepEqual(spreadChoice([...list].reverse(), 10).map((x) => x.id).sort(), [...ten].sort())
  const withNew = spreadChoice([{ id: 'id-new' }, ...list], 10).map((x) => x.id)
  assert.ok(ten.filter((x) => !withNew.includes(x)).length <= 1)
  assert.equal(spreadChoice(list, 0).length, 50)
  const A = '0f2b8c1e-1234-4abc-9def-0123456789ab'
  const P1 = '11111111-2222-4333-8444-555555555555'
  const P2 = '22222222-3333-4444-8555-666666666666'
  const cfg: Record<string, unknown> = {}
  assert.equal(applyImmichSettings(cfg, { albumIds: [A], people: [[P1], [P1, P2], [P2, P1]], favorites: true }), null)
  const s = immichSettings(cfg)
  // (the same people in another order: one album)
  assert.deepEqual(s.people, [[P1], [P1, P2]])
  assert.equal(s.favorites, true)
  assert.deepEqual(immichRefs(s), [A, `people-${P1}`, `people-${P1}_${P2}`, FAVORITES_REF])
  assert.deepEqual(peopleOfRef(peopleRef([P1, P2])), [P1, P2])
  assert.equal(peopleOfRef(A), null)
  assert.equal(peopleOfRef(`people-${P1}_x`), null)
  // (an album id at the most 128 characters - the live pictures' check; three people fit)
  assert.ok(peopleRef([P1, P2, A]).length <= 128)
  const before = JSON.stringify(cfg)
  assert.equal(applyImmichSettings(cfg, { people: [[P1, P2, A, P1.replace('1', '3')]] }), 'people')
  assert.equal(applyImmichSettings(cfg, { people: [[]] }), 'people')
  assert.equal(applyImmichSettings(cfg, { people: [['nope']] }), 'people')
  assert.equal(applyImmichSettings(cfg, { people: Array.from({ length: 21 }, () => [P1]) }), 'people')
  assert.equal(applyImmichSettings(cfg, { favorites: 'yes' }), 'favorites')
  assert.equal(applyImmichSettings(cfg, { searchLimit: 1234 }), 'searchLimit')
  assert.equal(JSON.stringify(cfg), before)
  // the pictures at most: not set - 1000 kept on the box, all live; set - as set
  assert.equal(searchLimitOf(immichSettings(cfg)), 1000)
  assert.equal(applyImmichSettings(cfg, { keepCopy: false }), null)
  assert.equal(searchLimitOf(immichSettings(cfg)), 0)
  assert.equal(applyImmichSettings(cfg, { searchLimit: 2000 }), null)
  assert.equal(searchLimitOf(immichSettings(cfg)), 2000)
  // (a config without them: none)
  assert.deepEqual(immichRefs(immichSettings({ photos: { sources: { immich: { albumIds: [A] } } } })), [A])
})

test('photo Immich: a person, two together and the favourites read from a server like Immich - newest first, nothing hidden, faces', async () => {
  const { ImmichClient, peopleRef } = await import('./app-api/photos/immich')
  const http = await import('node:http')
  const P1 = '11111111-2222-4333-8444-555555555555'
  const P2 = '22222222-3333-4444-8555-666666666666'
  const GONE = '33333333-4444-4555-8666-777777777777'
  const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
  const asked: Array<Record<string, unknown>> = []
  let knowsOrder = true
  const server = http.createServer((req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const url = req.url ?? ''
    if (url === `/api/people/${P1}`) return json(200, { id: P1, name: 'Oma' })
    if (url === `/api/people/${P2}`) return json(200, { id: P2, name: 'Mia' })
    if (url.startsWith('/api/people/') && url.endsWith('/thumbnail')) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' })
      return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    }
    if (url.startsWith('/api/people?')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page'))
      if (page === 1) return json(200, { people: [{ id: P2, name: 'Mia' }, { id: GONE, name: '' }, { id: P1, name: 'Oma' }], hasNextPage: true })
      return json(200, { people: [{ id: GONE.replace('3', '4'), name: 'Versteckt', isHidden: true }], hasNextPage: false })
    }
    if (url.startsWith('/api/people/')) return json(404, { message: 'Person not found' })
    if (url === '/api/search/metadata' && req.method === 'POST') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        const body = JSON.parse(raw) as Record<string, unknown>
        asked.push(body)
        if ('order' in body && !knowsOrder) return json(400, { message: 'property order should not exist' })
        const page = Number(body.page)
        // two pages of 1000: the first with a live photo's movie, a locked one and one in the trash
        const items = Array.from({ length: 1000 }, (_, i) => ({ id: id((page - 1) * 1000 + i), type: 'IMAGE', visibility: 'timeline', checksum: `c${i}` }))
        if (page === 1) {
          items[0] = { id: id(0), type: 'VIDEO', visibility: 'hidden', checksum: 'm' }
          items[1] = { id: id(1), type: 'IMAGE', visibility: 'locked', checksum: 'l' }
          ;(items[2] as Record<string, unknown>).isTrashed = true
        }
        json(200, { assets: { items, nextPage: page < 3 ? String(page + 1) : null } })
      })
      return
    }
    json(404, {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    // (all: the 3000 found less the hidden, the locked and the one in the trash - every page asked for)
    const all = await new ImmichClient(base, 'good-key-0123', 'en', 0).album(peopleRef([P1, P2]), AbortSignal.timeout(5000), true)
    assert.equal(all.items.length, 2997)
    assert.ok(!all.items.some((x) => [id(0), id(1), id(2)].includes(x.ref)))
    assert.deepEqual(
      asked.map((b) => [b.page, b.order, b.personIds]),
      [
        [1, 'desc', [P1, P2]],
        [2, 'desc', [P1, P2]],
        [3, 'desc', [P1, P2]],
      ],
    )
    // 1000 at most: a choice from all the pages (the oldest too), newest first as Immich gave them, the same one again
    const client = new ImmichClient(base, 'good-key-0123', 'en', 1000)
    const two = await client.album(peopleRef([P1, P2]), AbortSignal.timeout(5000), true)
    assert.equal(two.name, 'Oma & Mia')
    assert.deepEqual(two.faces, [P1, P2])
    assert.equal(two.items.length, 1000)
    const pageOf = (ref: string) => Math.floor(Number(ref.slice(-12)) / 1000)
    assert.deepEqual([...new Set(two.items.map((x) => pageOf(x.ref)))].sort(), [0, 1, 2])
    const order = all.items.map((x) => x.ref)
    assert.ok(two.items.every((x, i) => i === 0 || order.indexOf(x.ref) > order.indexOf(two.items[i - 1].ref)))
    const again = await client.album(peopleRef([P1, P2]), AbortSignal.timeout(5000), true)
    assert.deepEqual(
      again.items.map((x) => x.ref),
      two.items.map((x) => x.ref),
    )
    // the favourites, in the box's language; an Immich without "order": asked without it
    asked.length = 0
    knowsOrder = false
    const fav = await client.album('favorites', AbortSignal.timeout(5000), false)
    assert.equal(fav.name, 'Favourites')
    assert.equal(fav.faces, undefined)
    assert.equal(asked[0].isFavorite, true)
    assert.equal('order' in asked[1], false)
    // a person deleted in Immich: the album is no longer there (404 - counted as missing by the sync)
    await assert.rejects(client.album(peopleRef([GONE]), AbortSignal.timeout(5000), false), (err: { status?: number }) => err.status === 404)
    // the people to tick: with a name, not hidden, by name, all pages
    assert.deepEqual(await client.people(), [
      { id: P2, name: 'Mia' },
      { id: P1, name: 'Oma' },
    ])
    assert.equal((await client.face(P1)).status, 200)
  } finally {
    server.close()
  }
})

test('photo Immich: the memories of the day - birthday first, then the newest year, each picture once, nothing hidden; no right: none', async () => {
  const { ImmichClient, MEMORIES_REF, localDay, immichRefs, immichSettings, applyImmichSettings } = await import('./app-api/photos/immich')
  const http = await import('node:http')
  const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`
  const pic = (n: number, extra: Record<string, unknown> = {}) => ({ id: id(n), type: 'IMAGE', visibility: 'timeline', checksum: `c${n}`, width: 4000, height: 3000, ...extra })
  let allowed = true
  const asked: string[] = []
  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    asked.push(url)
    res.writeHead(url.startsWith('/api/memories') ? (allowed ? 200 : 403) : 404, { 'Content-Type': 'application/json' })
    if (!url.startsWith('/api/memories') || !allowed) return res.end(JSON.stringify({ message: 'Missing required permission: memory.read' }))
    res.end(
      JSON.stringify([
        { type: 'on_this_day', memoryAt: '2023-11-19T00:00:00.000Z', data: { year: 2023 }, assets: [pic(3), pic(4, { visibility: 'hidden' })] },
        { type: 'on_this_day', memoryAt: '2025-11-19T00:00:00.000Z', data: { year: 2025 }, assets: [pic(1), pic(2, { isTrashed: true }), pic(5, { type: 'VIDEO', duration: 5000 })] },
        { type: 'birthday', memoryAt: '2026-11-21T00:00:00.000Z', data: { year: 2026, personName: 'Oma' }, assets: [pic(9), pic(1)] },
        { type: 'on_this_day', memoryAt: '2024-11-19T00:00:00.000Z' },
      ]),
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    const client = new ImmichClient(base, 'good-key-0123', 'de', 0)
    const day = await client.album(MEMORIES_REF, AbortSignal.timeout(5000), false)
    assert.equal(day.name, 'Erinnerungen')
    assert.deepEqual(
      day.items.map((x) => x.ref),
      [id(9), id(1), id(3)],
    )
    // (the size as Immich gives it - a memory's pictures have no EXIF)
    assert.deepEqual([day.items[0].w, day.items[0].h], [4000, 3000])
    assert.equal(asked[0], `/api/memories?for=${localDay()}`)
    // clips with "Videos anzeigen"
    assert.ok((await client.album(MEMORIES_REF, AbortSignal.timeout(5000), true)).items.some((x) => x.ref === id(5) && x.kind === 'video'))
    // a key without memory.read: no memories, no refused key (the other albums go on)
    allowed = false
    assert.deepEqual((await client.album(MEMORIES_REF, AbortSignal.timeout(5000), false)).items, [])
  } finally {
    server.close()
  }
  // an older Immich: "for" unknown (400) - all memories, those of the day picked by the box; none at all (404): none
  const { memoryOfDay } = await import('./app-api/photos/immich')
  const day = localDay()
  const iso = (offsetDays: number, h: number) => new Date(new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime() + offsetDays * 86_400_000).toISOString()
  let knowsMemories = true
  const old = http.createServer((req, res) => {
    const url = req.url ?? ''
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (!knowsMemories) return json(404, { message: 'Cannot GET' })
    if (url.includes('for=')) return json(400, { message: 'property for should not exist' })
    if (url === '/api/memories')
      return json(200, [
        { type: 'on_this_day', memoryAt: '2024-01-01T00:00:00.000Z', showAt: iso(0, 0), hideAt: iso(0, 23), assets: [pic(21)] },
        { type: 'on_this_day', memoryAt: '2024-01-01T00:00:00.000Z', showAt: iso(1, 0), hideAt: iso(1, 23), assets: [pic(22)] },
        { type: 'on_this_day', memoryAt: '2024-01-01T00:00:00.000Z', showAt: iso(-1, 0), hideAt: iso(-1, 23), assets: [pic(23)] },
      ])
    json(404, {})
  })
  await new Promise<void>((r) => old.listen(0, '127.0.0.1', () => r()))
  try {
    const client = new ImmichClient(`http://127.0.0.1:${(old.address() as { port: number }).port}`, 'good-key-0123', 'en', 0)
    const got = await client.album(MEMORIES_REF, AbortSignal.timeout(5000), false)
    assert.equal(got.name, 'Memories')
    assert.deepEqual(
      got.items.map((x) => x.ref),
      [id(21)],
    )
    knowsMemories = false
    assert.deepEqual((await client.album(MEMORIES_REF, AbortSignal.timeout(5000), false)).items, [])
  } finally {
    old.close()
  }
  // without showAt/hideAt (still older): one of this day in an earlier year
  assert.equal(memoryOfDay({ memoryAt: '2020-03-07T00:00:00.000Z' }, '2026-03-07'), true)
  assert.equal(memoryOfDay({ memoryAt: '2026-03-07T00:00:00.000Z' }, '2026-03-07'), false)
  assert.equal(memoryOfDay({ memoryAt: '2020-03-08T00:00:00.000Z' }, '2026-03-07'), false)
  // the switch: checked, kept, asked for by the sync, after the favourites
  const cfg: Record<string, unknown> = {}
  assert.equal(applyImmichSettings(cfg, { memories: 'yes' }), 'memories')
  assert.equal(applyImmichSettings(cfg, { url: 'immich.local:2283', apiKey: 'k'.repeat(20), favorites: true, memories: true }), null)
  const s = immichSettings(cfg)
  assert.equal(s.memories, true)
  assert.deepEqual(immichRefs(s), ['favorites', MEMORIES_REF])
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

test('photo Immich: the test and an album against a server like Immich (old version, wrong key, assets searched)', async () => {
  const { ImmichClient, testImmich } = await import('./app-api/photos/immich')
  const http = await import('node:http')
  const A = '0f2b8c1e-1234-4abc-9def-0123456789ab'
  const P = '11111111-2222-4333-8444-555555555555'
  let version: unknown = { major: 1, minor: 120, patch: 2 }
  const server = http.createServer((req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const url = req.url ?? ''
    if (url === '/api/server/version') return version ? json(200, version) : json(404, {})
    const key = req.headers['x-api-key']
    if (key === 'no-albums-0123' && url.startsWith('/api/albums')) return json(403, { message: 'Missing required permission: album.read' })
    if (key === 'no-view-01234' && url.startsWith('/api/assets/')) return json(403, { message: 'Missing required permission: asset.view' })
    if (key === 'no-read-01234' && url === '/api/search/metadata') return json(403, { message: 'Missing required permission: asset.read' })
    if (key !== 'good-key-0123' && !String(key).startsWith('no-')) return json(401, { message: 'Invalid API key' })
    if (url === `/api/assets/${P}/thumbnail?size=thumbnail`) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' })
      return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    }
    if (url.startsWith('/api/albums?shared=true')) return json(200, [])
    if (url === '/api/albums') return json(200, [{ id: A, albumName: 'Urlaub', assetCount: 2, albumThumbnailAssetId: P }])
    if (url.startsWith(`/api/albums/${A}`)) return json(200, { id: A, albumName: 'Urlaub', assetCount: 2 })
    if (url === '/api/users/me') return json(200, { name: 'Familie' })
    if (url === '/api/search/metadata' && req.method === 'POST') {
      return json(200, { assets: { items: [{ id: P, type: 'IMAGE', checksum: 'c1' }, { id: A, type: 'VIDEO' }], nextPage: null } })
    }
    json(404, {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  try {
    const base = `http://127.0.0.1:${port}`
    // (no /api/people here: the people are not readable - the albums work all the same)
    assert.deepEqual(await testImmich(new ImmichClient(base, 'good-key-0123')), { ok: true, version: '1.120.2', account: 'Familie', albums: 1, assets: 2, people: false, memories: false })
    assert.deepEqual(await testImmich(new ImmichClient(base, 'wrong-key-0123')), { ok: false, error: 'unauthorized' })
    // (a key with chosen rights: one missing is told apart from a wrong key)
    for (const key of ['no-albums-0123', 'no-view-01234', 'no-read-01234']) assert.deepEqual(await testImmich(new ImmichClient(base, key)), { ok: false, error: 'permissions' }, key)
    const album = await new ImmichClient(base, 'good-key-0123').album(A, AbortSignal.timeout(5000), false)
    assert.equal(album.name, 'Urlaub')
    assert.deepEqual(album.items.map((x) => x.ref), [P])
    version = { major: 1, minor: 105, patch: 0 }
    assert.deepEqual(await testImmich(new ImmichClient(base, 'good-key-0123')), { ok: false, error: 'unsupportedVersion' })
    version = null
    assert.deepEqual(await testImmich(new ImmichClient(base, 'good-key-0123')), { ok: false, error: 'unsupportedVersion' })
  } finally {
    server.close()
  }
  assert.deepEqual(await testImmich(new ImmichClient('http://127.0.0.1:1', 'good-key-0123')), { ok: false, error: 'unreachable' })
})

test('photo Immich: trouble of the server (or a proxy in front of it) counts as away, a missing picture does not', async () => {
  const { immichDown, ImmichAway, ImmichRefused } = await import('./app-api/photos/immich')
  assert.equal(immichDown(new ImmichAway('x')), true)
  for (const status of [500, 502, 503, 504, 429]) assert.equal(immichDown(new ImmichRefused(status)), true, String(status))
  for (const status of [400, 401, 403, 404]) assert.equal(immichDown(new ImmichRefused(status)), false, String(status))
  assert.equal(immichDown(new Error('x')), false)
  // (a time limit that ran out - also while the answer was read - is the service not answering)
  assert.equal(immichDown(new DOMException('timed out', 'TimeoutError')), true)
  // (the connection lost while an answer is read - a socket's error, fetch's 'terminated' - is the service away too; an error of the card is not)
  assert.equal(immichDown(Object.assign(new Error('aborted'), { code: 'ECONNRESET' })), true)
  assert.equal(immichDown(new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })), true)
  assert.equal(immichDown(Object.assign(new Error('no space left'), { code: 'ENOSPC' })), false)
})

test('photo Immich: a clip length from its duration', async () => {
  const { clipSeconds } = await import('./app-api/photos/immich')
  // (Immich 3: milliseconds as a number)
  assert.equal(clipSeconds(24_400), 24)
  assert.equal(clipSeconds(833), 1)
  // (a clip of less than half a second is no "0:00")
  assert.equal(clipSeconds(300), 1)
  assert.equal(clipSeconds(0), 0)
  assert.equal(clipSeconds(Number.NaN), 0)
  assert.equal(clipSeconds('0:00:24.533000'), 25)
  assert.equal(clipSeconds('1:02:03.000000'), 3723)
  assert.equal(clipSeconds(null), 0)
  assert.equal(clipSeconds('nonsense'), 0)
})

test('photo Synology: the address of DSM, the login bound to it, the certificate', async () => {
  const { applySynologySettings, cleanSynologyUrl, synologySettings } = await import('./app-api/photos/synology')
  assert.equal(cleanSynologyUrl('192.168.1.10'), 'https://192.168.1.10:5001')
  assert.equal(cleanSynologyUrl('http://nas.local'), 'http://nas.local:5000')
  assert.equal(cleanSynologyUrl('https://nas.example.lan:8443/'), 'https://nas.example.lan:8443')
  assert.equal(cleanSynologyUrl('https://nas/photo'), null)
  assert.equal(cleanSynologyUrl('ftp://nas'), null)
  assert.equal(cleanSynologyUrl('http://user:pw@nas'), null)
  const cfg: Record<string, unknown> = {}
  const fp = Array.from({ length: 32 }, () => 'ab').join(':')
  assert.equal(applySynologySettings(cfg, { url: '10.0.0.5', account: 'box', password: 'secret', certFingerprint: fp }, (x) => `enc:${x}`), null)
  let s = synologySettings(cfg)
  assert.equal(s.url, 'https://10.0.0.5:5001')
  assert.equal(s.password, 'enc:secret')
  assert.equal(s.certFingerprint, fp.toUpperCase())
  // (the password kept belongs to its address and account: another one only with the password typed in anew)
  assert.equal(applySynologySettings(cfg, { url: '10.0.0.6' }), 'password')
  assert.equal(applySynologySettings(cfg, { account: 'other' }), 'password')
  assert.equal(applySynologySettings(cfg, { enabled: true, albumIds: ['12', '7'] }), null)
  // (another address: the certificate confirmed for the one before goes)
  assert.equal(applySynologySettings(cfg, { url: '10.0.0.6', password: 'new' }, (x) => `enc:${x}`), null)
  s = synologySettings(cfg)
  assert.equal(s.certFingerprint, '')
  assert.deepEqual(s.albumIds, ['12', '7'])
  assert.equal(applySynologySettings(cfg, { albumIds: ['x'] }), 'albumIds')
  assert.equal(applySynologySettings(cfg, { certFingerprint: 'nope' }), 'certFingerprint')
})

test('photo Nextcloud: the address, the WebDAV answer, the login bound to the address', async () => {
  const { applyNextcloudSettings, cleanNextcloudUrl, nextcloudSettings, parseMultistatus } = await import('./app-api/photos/nextcloud')
  assert.equal(cleanNextcloudUrl('cloud.example.lan'), 'https://cloud.example.lan')
  assert.equal(cleanNextcloudUrl('http://10.0.0.5:8080/nextcloud/index.php/apps/photos/'), 'http://10.0.0.5:8080/nextcloud')
  assert.equal(cleanNextcloudUrl('https://cloud.example.lan/apps/photos/albums'), 'https://cloud.example.lan')
  assert.equal(cleanNextcloudUrl('ftp://x'), null)
  assert.equal(cleanNextcloudUrl('https://u:p@x'), null)
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
    <d:response><d:href>/remote.php/dav/photos/box/albums/Urlaub%20%26%20Meer/</d:href><d:propstat><d:prop><nc:nbItems>5</nc:nbItems><nc:last-photo>127</nc:last-photo></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
      <d:propstat><d:prop><nc:location/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>
    <d:response><d:href>/remote.php/dav/photos/box/albums/Urlaub%20%26%20Meer/128-a.jpg</d:href><d:propstat><d:prop><oc:fileid>128</oc:fileid><d:getetag>&quot;158d&quot;</d:getetag><nc:metadata-photos-size><width>1200</width><height>1800</height></nc:metadata-photos-size></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  </d:multistatus>`
  const r = parseMultistatus(xml)
  assert.equal(r.length, 2)
  assert.equal(decodeURIComponent(r[0].href), '/remote.php/dav/photos/box/albums/Urlaub & Meer/')
  assert.deepEqual(r[0].props, { nbItems: '5', 'last-photo': '127' })
  assert.equal(r[1].props.fileid, '128')
  assert.equal(r[1].props.getetag, '"158d"')
  assert.match(r[1].props['metadata-photos-size'], /<width>1200<\/width>/)
  const cfg: Record<string, unknown> = {}
  assert.equal(applyNextcloudSettings(cfg, { url: 'cloud.example.lan', account: 'box', userId: 'box', password: 'app-pass' }, (x) => `enc:${x}`), null)
  assert.equal(nextcloudSettings(cfg).password, 'enc:app-pass')
  assert.equal(applyNextcloudSettings(cfg, { url: 'other.example.lan' }), 'password')
  assert.equal(applyNextcloudSettings(cfg, { userId: '../x' }), 'userId')
  assert.equal(applyNextcloudSettings(cfg, { albumIds: ['nope'] }), 'albumIds')
})

test('photo iCloud: the album key of a link, albums added and removed', async () => {
  const { applyIcloudSettings, icloudKeyOf, icloudSettings } = await import('./app-api/photos/icloud')
  assert.equal(icloudKeyOf('https://photos.icloud.com/shared/album/017vLW1qrDNX8sOcTld_CZOBA'), '017vLW1qrDNX8sOcTld_CZOBA')
  assert.equal(icloudKeyOf(' photos.icloud.com/shared/album/017vLW1qrDNX8sOcTld_CZOBA/?x=1 '), '017vLW1qrDNX8sOcTld_CZOBA')
  assert.equal(icloudKeyOf('https://www.icloud.com/sharedalbum/#B0aGWZuqDGxxxx'), 'old')
  assert.equal(icloudKeyOf('https://evil.example/shared/album/017vLW1qrDNX8sOcTld_CZOBA'), null)
  assert.equal(icloudKeyOf('https://photos.icloud.com/shared/album/../x'), null)
  const cfg: Record<string, unknown> = {}
  assert.equal(applyIcloudSettings(cfg, { add: { key: '017vLW1qrDNX8sOcTld_CZOBA', title: 'Ferien' } }), null)
  assert.equal(applyIcloudSettings(cfg, { add: { key: '017vLW1qrDNX8sOcTld_CZOBA', title: 'twice' } }), null)
  assert.deepEqual(icloudSettings(cfg).albums, [{ key: '017vLW1qrDNX8sOcTld_CZOBA', title: 'Ferien' }])
  assert.equal(applyIcloudSettings(cfg, { add: { key: 'bad key!' } }), 'add')
  assert.equal(applyIcloudSettings(cfg, { remove: '017vLW1qrDNX8sOcTld_CZOBA', keepCopy: false }), null)
  assert.deepEqual(icloudSettings(cfg).albums, [])
  assert.equal(icloudSettings(cfg).keepCopy, false)
})

test('photo PhotoPrism: the address, a picture and its clip, the login bound to the address', async () => {
  const { applyPhotoprismSettings, cleanPhotoprismUrl, photoprismSettings, photoprismVer } = await import('./app-api/photos/photoprism')
  assert.equal(cleanPhotoprismUrl('192.168.1.20:2342'), 'http://192.168.1.20:2342')
  assert.equal(cleanPhotoprismUrl('photos.example.lan'), 'https://photos.example.lan')
  assert.equal(cleanPhotoprismUrl('https://photos.example.lan/pp/library/albums/atoe48cgmajrq1j5/view'), 'https://photos.example.lan/pp')
  assert.equal(cleanPhotoprismUrl('ftp://x'), null)
  assert.equal(cleanPhotoprismUrl('https://u:p@x'), null)
  const h1 = 'a'.repeat(40)
  const h2 = 'b'.repeat(40)
  assert.deepEqual(photoprismVer({ Type: 'image', Hash: h1 }), { kind: 'photo', ver: h1 })
  assert.deepEqual(photoprismVer({ Type: 'live', Hash: h1 }), { kind: 'photo', ver: h1 })
  assert.deepEqual(photoprismVer({ Type: 'video', Hash: h1, Files: [{ Hash: h1, Primary: true }, { Hash: h2, Video: true, Codec: 'avc1' }] }), { kind: 'video', ver: `${h1}.${h2}` })
  assert.equal(photoprismVer({ Type: 'video', Hash: h1, Files: [{ Hash: h1, Primary: true }] }), null)
  assert.equal(photoprismVer({ Type: 'image', Hash: '../x' }), null)
  const cfg: Record<string, unknown> = {}
  assert.equal(applyPhotoprismSettings(cfg, { url: '10.0.0.9:2342', password: 'app-pass', account: 'Box' }, (x) => `enc:${x}`), null)
  assert.equal(photoprismSettings(cfg).password, 'enc:app-pass')
  assert.equal(photoprismSettings(cfg).url, 'http://10.0.0.9:2342')
  assert.equal(applyPhotoprismSettings(cfg, { url: 'other.example.lan' }), 'password')
  assert.equal(applyPhotoprismSettings(cfg, { albumIds: ['nope'] }), 'albumIds')
  assert.equal(applyPhotoprismSettings(cfg, { albumIds: ['atoe48cgmajrq1j5'] }), null)
  assert.deepEqual(photoprismSettings(cfg).albumIds, ['atoe48cgmajrq1j5'])
})

test('photo Synology folders: personal and shared space, a folder takes the pictures below it, thumbnails by the space', async () => {
  const { SynologyClient, applySynologySettings, folderName, synologySettings } = await import('./app-api/photos/synology')
  // what is chosen: an album (12), a folder of the personal space (f5) or of the shared space (t9)
  const cfg: Record<string, unknown> = {}
  assert.equal(applySynologySettings(cfg, { albumIds: ['12', 'f5', 't9'] }), null)
  assert.deepEqual(synologySettings(cfg).albumIds, ['12', 'f5', 't9'])
  for (const bad of ['f', 'x5', 'f5a', 't', 'q5', '../1']) assert.equal(applySynologySettings(cfg, { albumIds: [bad] }), 'albumIds', bad)
  assert.equal(folderName('/2023/Italien', 3), 'Italien')
  assert.equal(folderName('Familie', 3), 'Familie')
  assert.equal(folderName(undefined, 3), 'Ordner 3')

  const asked: Record<string, string>[] = []
  const photo = (id: number, type = 'photo') => ({ id, type, time: 1700000000 + id, additional: { thumbnail: { cache_key: `${id}_k`, xl: 'ready' }, resolution: { width: 800, height: 600 } } })
  // personal space: 5 holds picture 1, below it 6 (pictures 2 and 1 again) and 7 (nothing, with 8 below it: picture 3);
  // shared space: 9 holds picture 4
  const tree: Record<string, { name?: string; folders: number[]; items: ReturnType<typeof photo>[] }> = {
    'SYNO.Foto:0': { folders: [5], items: [] },
    'SYNO.Foto:5': { name: '/Familie', folders: [6, 7], items: [photo(1)] },
    'SYNO.Foto:6': { name: '/Familie/2023', folders: [], items: [photo(2), photo(1)] },
    'SYNO.Foto:7': { name: '/Familie/leer', folders: [8], items: [] },
    'SYNO.Foto:8': { name: '/Familie/leer/tief', folders: [], items: [photo(3), photo(9, 'unknown')] },
    'SYNO.FotoTeam:9': { name: '/Alle', folders: [], items: [photo(4)] },
  }
  class Fake extends SynologyClient {
    protected override async raw(params: Record<string, string>): Promise<globalThis.Response> {
      asked.push(params)
      const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } })
      const api = params.api.replace(/\.[A-Za-z]+\.[A-Za-z]+$|\.[A-Za-z]+$/, '')
      if (/Browse\.Folder$/.test(params.api)) {
        const key = `${api}:${params.id}`
        const f = tree[key]
        if (!f) return new Response(JSON.stringify({ success: false, error: { code: 608 } }), { headers: { 'content-type': 'application/json' } })
        if (params.method === 'get') return json({ folder: { id: Number(params.id), name: f.name } })
        return json({ list: f.folders.map((id) => ({ id, name: tree[`${api}:${id}`]?.name })) })
      }
      if (/Browse\.Item$/.test(params.api)) return json({ list: tree[`${api}:${params.folder_id}`]?.items ?? [] })
      if (/Thumbnail$/.test(params.api)) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } })
      throw new Error(`not expected: ${params.api}`)
    }
  }
  const client = new Fake({ url: 'https://nas:5001', account: 'box', password: 'pw' })
  const signal = new AbortController().signal

  // the folders of a space, one level
  assert.deepEqual(await client.folders('personal', '0'), [{ id: '5', name: 'Familie' }])
  assert.deepEqual((await client.folders('personal', '5')).map((f) => f.name), ['2023', 'leer'])
  await assert.rejects(client.folders('personal', 'x'), { status: 404 })

  // a folder: its name, its own pictures and the ones of every folder below (a picture once, only pictures)
  asked.length = 0
  const got = await client.album('f5', signal, false)
  assert.equal(got.name, 'Familie')
  assert.deepEqual(got.items.map((x) => x.ref).sort(), ['1', '2', '3'])
  assert.ok(asked.every((q) => q.api.startsWith('SYNO.Foto.')), 'the personal space is asked as SYNO.Foto')
  assert.ok(asked.filter((q) => /Browse\.Item$/.test(q.api)).every((q) => q.folder_id && !q.album_id))

  // the shared space has its own API
  asked.length = 0
  const team = await client.album('t9', signal, false)
  assert.equal(team.name, 'Alle')
  assert.deepEqual(team.items.map((x) => x.ref), ['4'])
  assert.ok(asked.every((q) => q.api.startsWith('SYNO.FotoTeam.')), 'the shared space is asked as SYNO.FotoTeam')

  // a folder that is gone: 404 (the sync counts it as missing)
  await assert.rejects(client.album('f404', signal, false), { status: 404 })
  // a picture of a folder: the thumbnail of its space, no album parameters
  asked.length = 0
  const r = await client.picture('t9', { ref: '4', ver: '4_k' }, 'full')
  assert.equal(r.headers.get('content-type'), 'image/webp')
  assert.equal(asked[0].api, 'SYNO.FotoTeam.Thumbnail')
  assert.equal(asked[0].size, 'xl')
  assert.equal(asked[0].passphrase, undefined)
  asked.length = 0
  await client.picture('f5', { ref: '1', ver: '1_k' }, 'grid')
  assert.equal(asked[0].api, 'SYNO.Foto.Thumbnail')
  assert.equal(asked[0].size, 'sm')
})

test('photo Synology smart albums: recently added, videos, people, places, tags and subjects', async () => {
  const { SynologyClient, applySynologySettings, synologySettings } = await import('./app-api/photos/synology')
  const cfg: Record<string, unknown> = {}
  assert.equal(applySynologySettings(cfg, { albumIds: ['rec', 'vid', 'p7', 'l3', 'g4', 'c5', 'P7', 'L3', 'G4', 'C5', '12', 'f5'] }), null)
  assert.deepEqual(synologySettings(cfg).albumIds, ['rec', 'vid', 'p7', 'l3', 'g4', 'c5', 'P7', 'L3', 'G4', 'C5', '12', 'f5'])
  for (const bad of ['p', 'px', 'recent', 'REC', 'p1a', 'fav', 'x3', 'l', 'P', 'REC']) assert.equal(applySynologySettings(cfg, { albumIds: [bad] }), 'albumIds', bad)

  const asked: Record<string, string>[] = []
  const photo = (id: number, time: number, type = 'photo') => ({ id, type, time, additional: { thumbnail: { cache_key: `${id}_k`, xl: 'ready' }, resolution: { width: 800, height: 600 }, video_meta: { duration: 5000 } } })
  class Fake extends SynologyClient {
    protected override async raw(params: Record<string, string>): Promise<globalThis.Response> {
      asked.push(params)
      const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } })
      const no = (code: number) => new Response(JSON.stringify({ success: false, error: { code } }), { headers: { 'content-type': 'application/json' } })
      if (params.api === 'SYNO.Foto.Browse.Person') return ok({ list: [{ id: 7, name: 'Anna', item_count: 2 }, { id: 8, name: '' }, { id: 9, name: 'Ben', item_count: 1 }] })
      if (params.api === 'SYNO.Foto.Browse.Geocoding') return ok({ list: [{ id: 3, name: 'Paris', country: 'Frankreich', item_count: 2 }] })
      if (params.api === 'SYNO.Foto.Browse.GeneralTag') return ok({ list: [{ id: 4, name: 'Urlaub', item_count: 1 }] })
      if (params.api === 'SYNO.Foto.Browse.Concept') return ok({ list: [{ id: 5, name: 'Strand', item_count: 1 }, { id: 6, name: 'Hund', item_count: 1, visibility: false }] })
      if (params.api === 'SYNO.Foto.Browse.RecentlyAdded') return ok({ list: [photo(1, 100), photo(2, 300), photo(3, 200)] })
      if (params.api === 'SYNO.Foto.Search.Search') return params.keyword === 'Strand' ? ok({ list: [photo(11, 5)] }) : ok({ list: [] })
      if (params.api === 'SYNO.Foto.Browse.Item') {
        if (params.person_id === '7') return ok({ list: [photo(4, 10), photo(5, 20)] })
        if (params.geocoding_id === '3') return ok({ list: [photo(7, 1), photo(8, 2)] })
        if (params.general_tag_id === '4') return ok({ list: [photo(9, 1)] })
        if (params.type === 'video') return ok({ list: [photo(6, 50, 'video')] })
        // a DSM that does not know the filter gives the whole library
        if (params.person_id === '9') return ok({ list: Array.from({ length: 100 }, (_, i) => photo(100 + i, i)) })
      }
      // the shared space: its own API, its own people
      if (params.api === 'SYNO.FotoTeam.Browse.Person') return ok({ list: [{ id: 21, name: 'Mama', item_count: 2 }] })
      if (params.api === 'SYNO.FotoTeam.Browse.Item' && params.person_id === '21') return ok({ list: [photo(21, 1), photo(22, 2)] })
      if (params.api === 'SYNO.Foto.Favorite') return no(103)
      throw new Error(`not expected: ${JSON.stringify(params)}`)
    }
  }
  const client = new Fake({ url: 'https://nas:5001', account: 'box', password: 'pw' })
  const signal = new AbortController().signal

  // the named ones only (a person without a name, a subject switched off: left out)
  assert.deepEqual(await client.people(), [{ id: '7', name: 'Anna', count: 2, note: '' }, { id: '9', name: 'Ben', count: 1, note: '' }])
  assert.deepEqual(await client.named('place'), [{ id: '3', name: 'Paris', count: 2, note: 'Frankreich' }])
  assert.deepEqual((await client.named('subject')).map((x) => x.name), ['Strand'])
  // recently added: newest first
  const recent = await client.album('rec', signal, false)
  assert.equal(recent.name, 'Zuletzt hinzugefügt')
  assert.deepEqual(recent.items.map((x) => x.ref), ['2', '3', '1'])
  // a person: by the id, the name from the list
  asked.length = 0
  const anna = await client.album('p7', signal, false)
  assert.equal(anna.name, 'Anna')
  assert.deepEqual(anna.items.map((x) => x.ref), ['4', '5'])
  assert.ok(asked.some((q) => q.api === 'SYNO.Foto.Browse.Item' && q.person_id === '7'))
  // a person that is not named (any more): not there
  await assert.rejects(client.album('p8', signal, false), { status: 404 })
  // a place, a tag: their own filters
  const paris = await client.album('l3', signal, false)
  assert.equal(paris.name, 'Paris')
  assert.deepEqual(paris.items.map((x) => x.ref), ['7', '8'])
  assert.deepEqual((await client.album('g4', signal, false)).items.map((x) => x.ref), ['9'])
  // a subject: the search by its name; one switched off is not there
  assert.deepEqual((await client.album('c5', signal, false)).items.map((x) => x.ref), ['11'])
  await assert.rejects(client.album('c6', signal, false), { status: 404 })
  // a filter the DSM did not take (the whole library came, far more than the person has): nothing of it is used
  await assert.rejects(client.album('p9', signal, false), { status: 404 })
  // a person of the shared space: the capital letter, its own API (and for the picture too)
  asked.length = 0
  const mama = await client.album('P21', signal, false)
  assert.equal(mama.name, 'Mama')
  assert.deepEqual(mama.items.map((x) => x.ref), ['21', '22'])
  assert.ok(asked.every((q) => q.api.startsWith('SYNO.FotoTeam.')))
  assert.deepEqual(await client.people(signal, 'shared'), [{ id: '21', name: 'Mama', count: 2, note: '' }])
  // (the same id in the personal space is somebody else - or nobody)
  await assert.rejects(client.album('p21', signal, false), { status: 404 })
  // videos only with "Videos anzeigen"
  assert.deepEqual((await client.album('vid', signal, false)).items, [])
  assert.deepEqual((await client.album('vid', signal, true)).items.map((x) => `${x.ref}:${x.kind}`), ['6:video'])
  // the picture of a smart album comes from the personal space
  asked.length = 0
  class Pic extends Fake {
    protected override async raw(params: Record<string, string>): Promise<globalThis.Response> {
      asked.push(params)
      return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/webp' } })
    }
  }
  await new Pic({ url: 'https://nas:5001', account: 'box', password: 'pw' }).picture('p7', { ref: '4', ver: '4_k' }, 'full')
  assert.equal(asked[0].api, 'SYNO.Foto.Thumbnail')
})

test('photo Synology: a question DSM does not know - a smart album gone only while Synology Photos answers', async () => {
  const { SynologyClient } = await import('./app-api/photos/synology')
  const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } })
  const no = (code: number) => new Response(JSON.stringify({ success: false, error: { code } }), { headers: { 'content-type': 'application/json' } })
  const photo = (id: number, type = 'photo') => ({ id, type, time: id, additional: { thumbnail: { cache_key: `${id}_k`, xl: 'ready' } } })
  let running = true
  class Fake extends SynologyClient {
    protected override async raw(params: Record<string, string>): Promise<globalThis.Response> {
      // (Synology Photos stopped - its package updated: every question of it gets 102)
      if (!running) return no(102)
      if (params.api === 'SYNO.Foto.Browse.RecentlyAdded') return no(102)
      if (params.api === 'SYNO.Foto.Browse.Album') return ok({ list: [{ id: 12, name: 'Sommer', item_count: 1 }] })
      // a DSM that does not take the filter for videos: the whole library
      if (params.api === 'SYNO.Foto.Browse.Item' && params.type === 'video') return ok({ list: [photo(1), photo(2, 'video'), photo(3)] })
      if (params.api === 'SYNO.Foto.Browse.Item' && params.album_id === '12') return ok({ list: [photo(4)] })
      throw new Error(`not expected: ${JSON.stringify(params)}`)
    }
  }
  const client = new Fake({ url: 'https://nas:5001', account: 'box2', password: 'pw' })
  const signal = new AbortController().signal
  // Synology Photos answers, only this smart album is not known: not there
  await assert.rejects(client.album('rec', signal, false), { status: 404 })
  // the videos: only the clips of the answer
  assert.deepEqual((await client.album('vid', signal, true)).items.map((x) => x.ref), ['2'])
  // Synology Photos not running: the service away - an album and a smart album stay on the box
  running = false
  await assert.rejects(client.album('rec', signal, false), { status: 502 })
  await assert.rejects(client.album('12', signal, false), { status: 502 })
  await assert.rejects(client.album('f5', signal, false), { status: 502 })
})

test('iCloud: only "not there" is an album gone - a throttled or failed answer inside a "200" keeps the pictures on the box', async () => {
  const { IcloudClient } = await import('./app-api/photos/icloud')
  const { RemoteAway } = await import('./app-api/photos/remote')
  const real = globalThis.fetch
  let answer: { status: number; body: unknown } = { status: 200, body: {} }
  globalThis.fetch = (async () => new Response(JSON.stringify(answer.body), { status: answer.status })) as typeof fetch
  try {
    const client = new IcloudClient([])
    const signal = new AbortController().signal
    answer = { status: 200, body: { results: [{ serverErrorCode: 'THROTTLED' }] } }
    await assert.rejects(client.access('k1', signal), (e) => e instanceof RemoteAway)
    answer = { status: 200, body: { results: [{ serverErrorCode: 'NOT_FOUND' }] } }
    await assert.rejects(client.access('k2', signal), { status: 404 })
    answer = { status: 400, body: {} }
    await assert.rejects(client.access('k3', signal), (e) => e instanceof RemoteAway)
    answer = { status: 404, body: {} }
    await assert.rejects(client.access('k4', signal), { status: 404 })
  } finally {
    globalThis.fetch = real
  }
})
test('photo processing waits while a program of the photos is installed - and a stopped upload ends the wait', async () => {
  let release: () => void = () => {}
  setPhotoInstallWait(() => new Promise<void>((resolve) => (release = resolve)))
  try {
    const stop = new AbortController()
    let settled = false
    const run = processPhoto('/nowhere/picture.jpg', '/nowhere/out', '.jpg', stop.signal).finally(() => (settled = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(settled, false)
    stop.abort()
    await assert.rejects(run, PhotoAborted)
  } finally {
    release()
    setPhotoInstallWait(() => Promise.resolve())
  }
})