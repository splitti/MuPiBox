import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { episodeKey, type FeedSetting, offlineName, PodcastOffline } from './podcast-offline'

// The episodes kept on the SD card are the box's: one podcast on two tiles, or in the libraries of two users (5.1, several
// users), keeps what each of them keeps

const FEED = 'https://feed.example/a.xml'
const episodes = [1, 2, 3, 4].map((n) => ({ url: `https://cdn.example/folge-${n}.mp3`, title: `Folge ${n}` }))

let dir = ''
const kept = () => fs.readdirSync(dir).filter((n) => n !== 'index.json').sort()

function offline(feeds: () => Promise<FeedSetting[] | null>): PodcastOffline {
  return new PodcastOffline({
    dir,
    openRemote: async () => {
      throw new Error('no network in the test')
    },
    episodes: async () => episodes,
    feeds,
    changed: () => undefined,
  })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-offline-'))
  // (all four on the card, none pinned)
  const files: Record<string, unknown> = {}
  for (const e of episodes) {
    const name = offlineName(e.url)
    fs.writeFileSync(path.join(dir, name), 'x')
    files[episodeKey(e.url)] = { name, url: e.url, feed: FEED, title: e.title, bytes: 1, at: 1, pinned: false }
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ files }))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('podcast episodes on the SD card', () => {
  it('keeps what any library keeps: the newest one of one user, the newest three of another', async () => {
    const all = [
      { feed: FEED, keep: 1 },
      { feed: FEED, keep: 3 },
    ]
    await offline(async () => all).syncAll()
    assert.deepEqual(kept(), [1, 2, 3].map((n) => offlineName(`https://cdn.example/folge-${n}.mp3`)).sort())
  })

  it('a change of one tile (the app) keeps what another library keeps', async () => {
    const o = offline(async () => [
      { feed: FEED, keep: 1 },
      { feed: FEED, keep: 0, pick: 'oldest:1' },
      { feed: FEED, keep: 1, pick: 'oldest:1' },
    ])
    await o.syncFeed(FEED, 1)
    assert.deepEqual(kept(), [1, 4].map((n) => offlineName(`https://cdn.example/folge-${n}.mp3`)).sort())
  })

  it('deletes nothing while the libraries cannot be read', async () => {
    await offline(async () => null).syncFeed(FEED, 1)
    assert.equal(kept().length, 4)
  })

  it('a podcast in no library any more: its files go', async () => {
    await offline(async () => [{ feed: 'https://feed.example/other.xml', keep: 1 }]).syncAll()
    assert.deepEqual(kept(), [])
  })
})
