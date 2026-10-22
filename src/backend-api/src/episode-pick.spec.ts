import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isEpisodePick, pickEpisodes } from './episode-pick'

// ten episodes, newest first: 'e0' is the newest, 'e9' the oldest
const list = Array.from({ length: 10 }, (_, i) => `e${i}`)

describe('pickEpisodes', () => {
  it('keeps all without a choice or with one that does not fit', () => {
    assert.deepEqual(pickEpisodes(list, undefined), list)
    assert.deepEqual(pickEpisodes(list, 'range:x'), list)
  })

  it('newest and oldest', () => {
    assert.deepEqual(pickEpisodes(list, 'newest:3'), ['e0', 'e1', 'e2'])
    assert.deepEqual(pickEpisodes(list, 'oldest:2'), ['e8', 'e9'])
  })

  it('span counts from the newest, 0 is the newest episode', () => {
    assert.deepEqual(pickEpisodes(list, 'span:0-2'), ['e0', 'e1', 'e2'])
    assert.deepEqual(pickEpisodes(list, 'span:3-4'), ['e3', 'e4'])
    assert.deepEqual(pickEpisodes(list, 'span:4-3'), ['e3', 'e4'])
    assert.deepEqual(pickEpisodes(list, 'span:8-50'), ['e8', 'e9'])
    assert.deepEqual(pickEpisodes(list, 'span:20-30'), [])
  })

  it('a range as chosen before counts from the oldest, 1 is the oldest episode', () => {
    assert.deepEqual(pickEpisodes(list, 'range:1-2'), ['e8', 'e9'])
    assert.deepEqual(pickEpisodes(list, 'range:9-10'), ['e0', 'e1'])
  })

  it('knows its own values', () => {
    for (const ok of ['newest:10', 'oldest:5', 'span:0-9', 'range:1-80']) assert.equal(isEpisodePick(ok), true)
    for (const bad of ['span:-1-3', 'span:1', 'next:3', '', 5, null]) assert.equal(isEpisodePick(bad), false)
  })
})
