import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fetchFullPlaylistTracks } from './services/spotify-playlist-full'

const realFetch = globalThis.fetch

// a playlist of `total` tracks, served in the pages Spotify gives (50 entries; a removed track comes as null)
function servePlaylist(total: number, requests: string[]): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    requests.push(url.pathname + url.search)
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    const items = []
    for (let i = offset; i < Math.min(offset + limit, total); i++) {
      items.push({ item: i === 7 ? null : { uri: `spotify:track:t${i}`, name: `Track ${i}`, duration_ms: 1000 + i, artists: [{ name: 'A' }, { name: 'B' }] } })
    }
    const next = offset + limit < total ? 'next-page' : null
    return new Response(JSON.stringify({ items, next }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('fetchFullPlaylistTracks', () => {
  it('reads every page of a playlist longer than the 100 tracks of the embed page', async () => {
    const requests: string[] = []
    servePlaylist(340, requests)
    const tracks = await fetchFullPlaylistTracks('abc123', 'token')
    assert.equal(requests.length, 7) // 7 pages of 50
    assert.match(requests[0], /^\/v1\/playlists\/abc123\/items\?/)
    assert.equal(tracks.length, 339) // the removed (null) entry is left out
    assert.equal(tracks[0].name, 'Track 0')
    assert.equal(tracks[338].name, 'Track 339') // the last one is there
    assert.deepEqual(tracks[1].artists, [{ name: 'A', uri: '' }, { name: 'B', uri: '' }])
    assert.equal(tracks[1].duration_ms, 1001)
  })

  it('stops after the one page of a short playlist', async () => {
    const requests: string[] = []
    servePlaylist(30, requests)
    const tracks = await fetchFullPlaylistTracks('abc123', 'token')
    assert.equal(requests.length, 1)
    assert.equal(tracks.length, 29)
  })
})
