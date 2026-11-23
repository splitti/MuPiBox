import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tileKeyOfRow } from './app-api/tile-key'
import { applyTileTimeAction, setTileLimit, tileLimitsOf } from './app-api/tile-limits'

// A day's limit per tile of the start page (5.1, "Kachel-Limit"): what the app writes into mupiboxconfig.json for the
// player (spotify-control.js "Tile time")

const KEY = 'artist:audiobook:Eine Serie'
const at = (iso: string) => new Date(iso)

describe('setTileLimit', () => {
  it('sets, changes and takes away a limit, the rest of playtimeLimit stays', () => {
    const cfg: Record<string, unknown> = { playtimeLimit: { enabled: true, resetHour: 0 } }
    assert.equal(setTileLimit(cfg, [KEY], 'Eine Serie', 30), null)
    assert.deepEqual(tileLimitsOf(cfg), [{ key: KEY, name: 'Eine Serie', minutes: 30 }])
    assert.equal((cfg.playtimeLimit as Record<string, unknown>).enabled, true)
    assert.equal(setTileLimit(cfg, [KEY], 'Eine Serie', 45), null)
    assert.deepEqual(tileLimitsOf(cfg), [{ key: KEY, name: 'Eine Serie', minutes: 45 }])
    assert.equal(setTileLimit(cfg, [KEY], 'Eine Serie', 0), null)
    assert.deepEqual(tileLimitsOf(cfg), [])
  })

  it('sets several tiles at once (an artist named alike in the app)', () => {
    const cfg: Record<string, unknown> = {}
    assert.equal(setTileLimit(cfg, ['artist:music:A', 'artist:music:B'], 'A', 15), null)
    assert.deepEqual(
      tileLimitsOf(cfg).map((t) => t.key),
      ['artist:music:A', 'artist:music:B'],
    )
  })

  it('gives each tile its own name when they come with one each', () => {
    const cfg: Record<string, unknown> = {}
    assert.equal(setTileLimit(cfg, ['artist:music:A', 'artist:music:B'], { 'artist:music:A': 'A', 'artist:music:B': 'B' }, 15), null)
    assert.deepEqual(
      tileLimitsOf(cfg).map((t) => t.name),
      ['A', 'B'],
    )
  })

  it('refuses what is no tile or no time', () => {
    const cfg: Record<string, unknown> = {}
    assert.notEqual(setTileLimit(cfg, ['other:x'], '', 30), null)
    assert.notEqual(setTileLimit(cfg, [KEY], '', 1441), null)
    assert.notEqual(setTileLimit(cfg, [KEY], '', 2.5), null)
    assert.deepEqual(tileLimitsOf(cfg), [])
  })

  it("takes today's exceptions of a tile away with its limit", () => {
    const cfg: Record<string, unknown> = {}
    setTileLimit(cfg, [KEY], 'Eine Serie', 30)
    applyTileTimeAction(cfg, KEY, 'extend', 10, at('2026-11-12T10:00:00'))
    applyTileTimeAction(cfg, KEY, 'free', undefined, at('2026-11-12T10:00:00'))
    setTileLimit(cfg, [KEY], 'Eine Serie', 0)
    const today = (cfg.playtimeLimit as Record<string, Record<string, unknown>>).tileToday
    assert.deepEqual(today.bonus, {})
    assert.deepEqual(today.free, [])
  })
})

describe('applyTileTimeAction', () => {
  it('adds minutes up and frees a tile for today', () => {
    const cfg: Record<string, unknown> = {}
    setTileLimit(cfg, [KEY], 'Eine Serie', 30)
    assert.equal(applyTileTimeAction(cfg, KEY, 'extend', 10, at('2026-11-12T10:00:00')), null)
    assert.equal(applyTileTimeAction(cfg, KEY, 'extend', 10, at('2026-11-12T11:00:00')), null)
    assert.equal(applyTileTimeAction(cfg, KEY, 'free', undefined, at('2026-11-12T12:00:00')), null)
    assert.deepEqual((cfg.playtimeLimit as Record<string, unknown>).tileToday, { date: '2026-11-12', bonus: { [KEY]: 20 }, free: [KEY] })
  })

  it("replaces another day's entry (the day as the listening time counts it, resetHour)", () => {
    const cfg: Record<string, unknown> = { playtimeLimit: { resetHour: 5 } }
    setTileLimit(cfg, [KEY], 'Eine Serie', 30)
    applyTileTimeAction(cfg, KEY, 'extend', 10, at('2026-11-12T10:00:00'))
    // (4 o'clock the next morning is still the 12th: the day begins at 5)
    applyTileTimeAction(cfg, KEY, 'extend', 10, at('2026-11-13T04:00:00'))
    assert.deepEqual((cfg.playtimeLimit as Record<string, unknown>).tileToday, { date: '2026-11-12', bonus: { [KEY]: 20 } })
    applyTileTimeAction(cfg, KEY, 'free', undefined, at('2026-11-13T06:00:00'))
    assert.deepEqual((cfg.playtimeLimit as Record<string, unknown>).tileToday, { date: '2026-11-13', free: [KEY] })
  })

  it('refuses a tile without a limit and an unknown action', () => {
    const cfg: Record<string, unknown> = {}
    assert.notEqual(applyTileTimeAction(cfg, KEY, 'extend', 10), null)
    setTileLimit(cfg, [KEY], 'Eine Serie', 30)
    assert.notEqual(applyTileTimeAction(cfg, KEY, 'reset', 10), null)
    assert.notEqual(applyTileTimeAction(cfg, KEY, 'extend', 0), null)
  })
})

describe('tileKeyOfRow', () => {
  it('forms the key as the display does', () => {
    assert.equal(tileKeyOfRow({ type: 'spotify', category: 'audiobook', artist: 'Eine Serie', id: 'x' }), KEY)
    assert.equal(tileKeyOfRow({ type: 'spotify', artist: 'Eine Serie', id: 'x' }), KEY)
    assert.equal(tileKeyOfRow({ type: 'radio', category: 'radio', id: 'https://example.org/s' }), 'single:other:https://example.org/s')
    assert.equal(tileKeyOfRow({ type: 'spotify', category: 'music', playlistid: 'p1' }), 'single:music:p1')
    assert.equal(tileKeyOfRow({ type: 'library', libraryPath: 'audiobook/Ordner' }), 'lib:audiobook/Ordner')
    assert.equal(tileKeyOfRow({ type: 'nas', nasPath: 'Hoerspiele/Ordner' }), 'nas:Hoerspiele/Ordner')
    assert.equal(tileKeyOfRow({ type: 'spotify', category: 'music', id: 'x' }), null)
  })
})
