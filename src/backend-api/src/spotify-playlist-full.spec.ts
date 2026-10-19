import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'
import type { SpotifyPlaylistData } from './models/spotify-media-info.model'
import { SpotifyMediaInfo } from './services/spotify-media-info.service'
import { fetchFullPlaylistTracks } from './services/spotify-playlist-full'
import { getValidAccessToken } from './spotify-sync/auth'
import { SpotifyApiException, spotifyGet } from './spotify-sync/playlists'

const realFetch = globalThis.fetch

interface Served {
  requests: string[]
  /** most requests under way at the same time */
  maxInFlight: number
}

// a playlist of `total` tracks at Spotify's snapshot `snapshot`, served in pages of at most `pageSize` entries (Spotify
// gives 50; an app under its 2026 rules may get fewer than it asked for - the paging goes by `next`); a removed track
// comes as null
function servePlaylist(total: number, opts: { pageSize?: number; snapshot?: string } = {}): Served {
  const served: Served = { requests: [], maxInFlight: 0 }
  let inFlight = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    served.requests.push(url.pathname + url.search)
    inFlight++
    served.maxInFlight = Math.max(served.maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight--
    if (!url.pathname.endsWith('/items')) {
      return Response.json({ snapshot_id: opts.snapshot ?? 'snap-1' })
    }
    const offset = Number(url.searchParams.get('offset'))
    const limit = Math.min(Number(url.searchParams.get('limit')), opts.pageSize ?? 50)
    const items = []
    for (let i = offset; i < Math.min(offset + limit, total); i++) {
      items.push({ item: i === 7 ? null : { uri: `spotify:track:t${i}`, name: `Track ${i}`, duration_ms: 1000 + i, artists: [{ name: 'A' }, { name: 'B' }] } })
    }
    const next = offset + limit < total ? 'next-page' : null
    return Response.json({ items, next })
  }) as typeof fetch
  return served
}

const pages = (served: Served) => served.requests.filter((r) => r.includes('/items?'))

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('fetchFullPlaylistTracks', () => {
  it('reads every page of a playlist longer than the 100 tracks of the embed page', async () => {
    const served = servePlaylist(340)
    const full = await fetchFullPlaylistTracks('abc123', 'token')
    assert.match(served.requests[0], /^\/v1\/playlists\/abc123\?fields=snapshot_id/)
    assert.equal(pages(served).length, 7) // 7 pages of 50
    assert.match(pages(served)[0], /^\/v1\/playlists\/abc123\/items\?/)
    assert.equal(full.snapshot, 'snap-1')
    assert.equal(full.tracks.length, 339) // the removed (null) entry is left out
    assert.equal(full.tracks[0].name, 'Track 0')
    assert.equal(full.tracks[338].name, 'Track 339') // the last one is there
    assert.deepEqual(full.tracks[1].artists, [{ name: 'A', uri: '' }, { name: 'B', uri: '' }])
    assert.equal(full.tracks[1].duration_ms, 1001)
  })

  it('follows Spotify paging when it gives fewer entries than asked for (10 per page)', async () => {
    const served = servePlaylist(125, { pageSize: 10 })
    const full = await fetchFullPlaylistTracks('abc123', 'token')
    assert.equal(pages(served).length, 13)
    assert.match(pages(served)[1], /offset=10\b/)
    assert.equal(full.tracks.length, 124)
    assert.equal(full.tracks[123].name, 'Track 124')
  })

  it('stops after the one page of a short playlist', async () => {
    const served = servePlaylist(30)
    const full = await fetchFullPlaylistTracks('abc123', 'token')
    assert.equal(pages(served).length, 1)
    assert.equal(full.tracks.length, 29)
  })

  it('reads 1000 tracks at most', async () => {
    const served = servePlaylist(3000)
    const full = await fetchFullPlaylistTracks('abc123', 'token')
    assert.equal(pages(served).length, 20)
    assert.equal(full.tracks.length, 999)
  })

  it('takes the list read before while Spotify names the same snapshot (one request)', async () => {
    const kept = { snapshot: 'snap-1', tracks: [] }
    const served = servePlaylist(340)
    assert.equal(await fetchFullPlaylistTracks('abc123', 'token', kept), kept)
    assert.equal(served.requests.length, 1)
  })

  it('reads all pages again when the playlist changed (another snapshot)', async () => {
    const served = servePlaylist(340, { snapshot: 'snap-2' })
    const full = await fetchFullPlaylistTracks('abc123', 'token', { snapshot: 'snap-1', tracks: [] })
    assert.equal(full.snapshot, 'snap-2')
    assert.equal(pages(served).length, 7)
  })

  it('reads one playlist after the other, one request at a time', async () => {
    const served = servePlaylist(240)
    const [a, b, c] = await Promise.all([
      fetchFullPlaylistTracks('first', 'token'),
      fetchFullPlaylistTracks('second', 'token'),
      fetchFullPlaylistTracks('third', 'token'),
    ])
    assert.equal(served.maxInFlight, 1)
    assert.deepEqual([a.tracks.length, b.tracks.length, c.tracks.length], [239, 239, 239])
    // (all of one playlist before the next)
    const order = served.requests.map((r) => r.split('/')[3].split('?')[0])
    assert.deepEqual(order, [...Array(6).fill('first'), ...Array(6).fill('second'), ...Array(6).fill('third')])
  })
})

describe('SpotifyMediaInfo: a playlist longer than the embed page', () => {
  const id = 'abc1234567'

  // the embed page of a playlist with `count` tracks listed (it lists 100 at most)
  function serveEmbed(count: number): void {
    const trackList = Array.from({ length: count }, (_, i) => ({ title: `Embed ${i}`, uri: `spotify:track:e${i}`, duration: 1000 }))
    const nextData = { props: { pageProps: { state: { data: { entity: { name: 'List', trackList } } } } } }
    globalThis.fetch = (async () =>
      new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`)) as typeof fetch
  }

  function serviceWithCache(cached?: SpotifyPlaylistData): { svc: SpotifyMediaInfo; file: string } {
    const svc = new SpotifyMediaInfo()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mupi-playlist-'))
    ;(svc as unknown as { cacheDir: string }).cacheDir = dir
    const file = path.join(dir, `playlist_${id}.json`)
    if (cached) fs.writeFileSync(file, JSON.stringify(cached))
    return { svc, file }
  }

  const fetchSync = (svc: SpotifyMediaInfo) =>
    (svc as unknown as { fetchPlaylistDataSync(id: string): Promise<SpotifyPlaylistData> }).fetchPlaylistDataSync(id)

  const fullTracks = Array.from({ length: 340 }, (_, i) => ({ name: `Full ${i}`, uri: `spotify:track:f${i}`, duration_ms: 1, artists: [], album: { name: '', uri: '', images: [] } }))
  const cachedFull: SpotifyPlaylistData = {
    playlist: { name: 'List', images: [], tracks: { total: 340 } },
    tracks: fullTracks,
    fullList: true,
    fullListSnapshot: 'snap-1',
  }

  it('completes the embed list and keeps the snapshot', async () => {
    serveEmbed(100)
    const { svc, file } = serviceWithCache()
    svc.fullPlaylistTracks = async () => ({ snapshot: 'snap-1', tracks: fullTracks })
    const data = await fetchSync(svc)
    assert.equal(data.tracks.length, 340)
    assert.equal(data.fullList, true)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SpotifyPlaylistData
    assert.equal(saved.fullListSnapshot, 'snap-1')
    assert.equal(saved.playlist.tracks.total, 340)
  })

  it('hands the cached full list on to be kept while unchanged', async () => {
    serveEmbed(100)
    const { svc } = serviceWithCache(cachedFull)
    let given: unknown
    svc.fullPlaylistTracks = async (_id, kept) => {
      given = kept
      return kept
    }
    const data = await fetchSync(svc)
    assert.deepEqual(given, { snapshot: 'snap-1', tracks: fullTracks })
    assert.equal(data.tracks.length, 340)
  })

  it('keeps the cached full list when the rest cannot be loaded', async () => {
    serveEmbed(100)
    const { svc, file } = serviceWithCache(cachedFull)
    svc.fullPlaylistTracks = async () => {
      throw new SpotifyApiException({ kind: 'rate-limit', reason: 'blocked', retryAfterSeconds: 60 })
    }
    const data = await fetchSync(svc)
    assert.equal(data.tracks.length, 340)
    assert.equal(data.fullList, true)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SpotifyPlaylistData
    assert.equal(saved.tracks.length, 340)
  })

  it('keeps the cached full list without a Spotify login', async () => {
    serveEmbed(100)
    const { svc } = serviceWithCache(cachedFull)
    svc.fullPlaylistTracks = async () => undefined
    const data = await fetchSync(svc)
    assert.equal(data.tracks.length, 340)
  })

  it('without a login: the embed list stays and is not asked for again after an hour', async () => {
    serveEmbed(100)
    const { svc, file } = serviceWithCache()
    svc.fullPlaylistTracks = async () => undefined
    const data = await fetchSync(svc)
    assert.equal(data.tracks.length, 100)
    assert.equal(data.fullListAttemptAt, undefined)
    // an hour and more later the list is still fresh (12 hours)
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(file, past, past)
    assert.equal((await svc.getCachedPlaylistData(id))?.tracks.length, 100)
    const { isStale } = await (svc as unknown as { getFromCache(id: string, t: 'playlist'): Promise<{ isStale: boolean }> }).getFromCache(id, 'playlist')
    assert.equal(isStale, false)
  })

  it('a block: the embed list is asked for again after an hour', async () => {
    serveEmbed(100)
    const { svc, file } = serviceWithCache()
    svc.fullPlaylistTracks = async () => {
      throw new SpotifyApiException({ kind: 'rate-limit', reason: 'blocked', retryAfterSeconds: 60 })
    }
    const data = await fetchSync(svc)
    assert.equal(data.tracks.length, 100)
    assert.equal(typeof data.fullListAttemptAt, 'number')
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SpotifyPlaylistData
    saved.fullListAttemptAt = Date.now() - 2 * 60 * 60 * 1000
    fs.writeFileSync(file, JSON.stringify(saved))
    const { isStale } = await (svc as unknown as { getFromCache(id: string, t: 'playlist'): Promise<{ isStale: boolean }> }).getFromCache(id, 'playlist')
    assert.equal(isStale, true)
  })

  it('a short playlist is not completed', async () => {
    serveEmbed(40)
    const { svc } = serviceWithCache()
    let asked = false
    svc.fullPlaylistTracks = async () => {
      asked = true
      return undefined
    }
    await fetchSync(svc)
    assert.equal(asked, false)
  })
})

describe('spotifyGet: the pause between two requests', () => {
  it('holds after the server was busy for a moment (no requests all at once)', async () => {
    const sent: number[] = []
    globalThis.fetch = (async () => {
      sent.push(Date.now())
      return Response.json({})
    }) as typeof fetch
    const all = Promise.all([1, 2, 3, 4].map((n) => spotifyGet(`/test/${n}`, 'token')))
    // (the server busy for a second while they wait)
    const until = Date.now() + 1000
    while (Date.now() < until) {
      // busy
    }
    await all
    assert.equal(sent.length, 4)
    for (let i = 1; i < sent.length; i++) assert.ok(sent[i] - sent[i - 1] >= 295, `gap ${sent[i] - sent[i - 1]} ms`)
  })

  it('holds when the block check is slow (the SD card): the time counts from the request itself', async () => {
    const sent: number[] = []
    globalThis.fetch = (async () => {
      sent.push(Date.now())
      return Response.json({})
    }) as typeof fetch
    let first = true
    const original = fs.statSync
    const stat = mock.method(fs, 'statSync', (...args: Parameters<typeof fs.statSync>) => {
      if (first) {
        first = false
        const until = Date.now() + 700
        while (Date.now() < until) {
          // slow
        }
      }
      return original(...args)
    })
    // (spotify-block.ts reads it by "import * as fs": the mock reaches it only like this)
    syncBuiltinESMExports()
    try {
      await Promise.all([1, 2, 3].map((n) => spotifyGet(`/slow/${n}`, 'token')))
    } finally {
      stat.mock.restore()
      syncBuiltinESMExports()
    }
    assert.equal(sent.length, 3)
    for (let i = 1; i < sent.length; i++) assert.ok(sent[i] - sent[i - 1] >= 295, `gap ${sent[i] - sent[i - 1]} ms`)
  })
})

describe('getValidAccessToken: a refresh Spotify refused', () => {
  const expired = { clientId: 'client', accessToken: 'old', refreshToken: 'refresh-429', tokenExpiresAt: new Date(0).toISOString() }
  const noSave = async () => {}

  it("is not tried again before Spotify's Retry-After", async () => {
    let asked = 0
    globalThis.fetch = (async () => {
      asked++
      return new Response('', { status: 429, headers: { 'retry-after': '3600' } })
    }) as typeof fetch
    const first = await getValidAccessToken(expired, noSave)
    const second = await getValidAccessToken(expired, noSave)
    assert.equal(asked, 1)
    assert.equal(first.ok, false)
    assert.equal(second.ok || second.failure.kind, 'rate-limit')
    assert.ok(!second.ok && (second.failure.retryAfterSeconds ?? 0) > 3500)
  })

  it('a new login is tried at once', async () => {
    let asked = 0
    globalThis.fetch = (async () => {
      asked++
      return new Response('', { status: 429, headers: { 'retry-after': '3600' } })
    }) as typeof fetch
    await getValidAccessToken({ ...expired, refreshToken: 'refresh-new-login' }, noSave)
    assert.equal(asked, 1)
  })
})
