import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeSyncDiff } from './spotify-sync/diff'
import type { BoxLibraryEntry, SyncItem } from './spotify-sync/types'

const album = (id: string, playlists: string[] = []): BoxLibraryEntry => ({
  type: 'spotify',
  category: 'audiobook',
  source: 'spotify-sync',
  id,
  artist: 'A',
  title: `T ${id}`,
  spotify_sync_playlists: playlists,
  spotify_sync_mode: 'album',
})
const item = (id: string): SyncItem => ({
  groupKey: `album:${id}`,
  mode: 'album',
  identifierField: 'id',
  artist: 'A',
  title: `T ${id}`,
  category: 'audiobook',
  playlistIds: [],
  type: 'spotify',
})

test('a run of only the subscriptions (Smart-Sync off) keeps the entries of playlists and removes subscription orphans', () => {
  const library = [album('fromPlaylist', ['p1']), album('stillSubscribed'), album('leftOut')]
  const diff = computeSyncDiff(new Map([['album:stillSubscribed', item('stillSubscribed')]]), library, { keepPlaylistEntries: true })
  assert.deepEqual(
    diff.removals.map((e) => e.id),
    ['leftOut'],
  )
})

test('a whole run (Smart-Sync on) removes an entry no playlist has any more, as before', () => {
  const library = [album('fromPlaylist', ['p1']), album('stillSubscribed')]
  const diff = computeSyncDiff(new Map([['album:stillSubscribed', item('stillSubscribed')]]), library)
  assert.deepEqual(
    diff.removals.map((e) => e.id),
    ['fromPlaylist'],
  )
})
