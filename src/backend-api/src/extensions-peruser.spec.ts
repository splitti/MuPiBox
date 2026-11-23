// Settings of an extension that every user of the box has for himself (hostApi 13): read and written for the user in place or
// for one chosen in the app, the others for the whole box. Runs in a folder of its own (MUPIBOX_EXT_DIR).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'

const dir = mkdtempSync(path.join(tmpdir(), 'mupibox-ext-peruser-'))
process.env.MUPIBOX_EXT_DIR = dir
after(() => rmSync(dir, { recursive: true, force: true }))

type Ext = typeof import('./app-api/extensions')
let ext: Ext

const manifest = {
  id: 'club',
  name: 'Club',
  version: '1.0.0',
  hostApi: 13,
  resources: {},
  settings: {
    league: { type: 'string', default: 'bl1' },
    team: { type: 'string', default: '', perUser: true },
    goals: { type: 'boolean', default: false, perUser: true },
    apiKey: { type: 'secret' },
  },
} as const
const file = () => path.join(dir, 'settings', 'club.json')
const stored = () => JSON.parse(readFileSync(file(), 'utf8'))
let current = 'main'
const known = new Set(['main', 'leni', 'max'])

describe('settings every user has for himself (hostApi 13)', () => {
  beforeEach(async () => {
    ext ??= await import('./app-api/extensions')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    current = 'main'
    ext.setExtensionUsers({ current: () => current, exists: (id) => known.has(id) })
  })

  it('reads the defaults, then what the user in place set for himself', async () => {
    const m = manifest as never
    assert.deepEqual(await ext.readSettings(m), { league: 'bl1', team: '', goals: false })
    assert.equal(await ext.writeSettings(m, { team: 'SVW', league: 'bl2' }), true)
    assert.deepEqual(stored(), { league: 'bl2', '@users': { main: { team: 'SVW' } } })
    assert.deepEqual(await ext.readSettings(m), { league: 'bl2', team: 'SVW', goals: false })
    // (another user in place: his own - none yet, so the defaults - and the box's league)
    current = 'leni'
    assert.deepEqual(await ext.readSettings(m), { league: 'bl2', team: '', goals: false })
  })

  it('writes for a user who is not in place without touching the one in place, and says nothing the box uses changed', async () => {
    const m = manifest as never
    await ext.writeSettings(m, { team: 'SVW' })
    assert.equal(await ext.writeSettings(m, { team: 'FCB', goals: true }, 'leni'), false)
    assert.deepEqual(await ext.readSettings(m), { league: 'bl1', team: 'SVW', goals: false })
    assert.deepEqual(await ext.readSettings(m, 'leni'), { league: 'bl1', team: 'FCB', goals: true })
    // (a setting of the box with it: that one counts for the box in place)
    assert.equal(await ext.writeSettings(m, { team: 'BVB', league: 'bl3' }, 'max'), true)
    assert.deepEqual(stored(), { league: 'bl3', '@users': { main: { team: 'SVW' }, leni: { team: 'FCB', goals: true }, max: { team: 'BVB' } } })
    // (the user in place named: as without a name)
    assert.equal(await ext.writeSettings(m, { goals: true }, 'main'), true)
    assert.equal((await ext.readSettings(m)).goals, true)
  })

  it('takes a value the whole box had before (an older version without settings per user) as every user\'s until he sets his own', async () => {
    const m = manifest as never
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify({ team: 'HSV', '@users': { leni: { team: 'FCB' }, max: 'broken' } }))
    assert.equal((await ext.readSettings(m)).team, 'HSV')
    assert.equal((await ext.readSettings(m, 'leni')).team, 'FCB')
    assert.equal((await ext.readSettings(m, 'max')).team, 'HSV')
  })

  it('never lets a value per user stand in for a setting of the box, and never shows the users\' part', async () => {
    const m = manifest as never
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify({ apiKey: 'secret', '@users': { main: { league: 'xx', apiKey: 'other', team: 'SVW' } } }))
    const all = await ext.readSettings(m)
    assert.equal(all.league, 'bl1')
    assert.equal(all.apiKey, 'secret')
    assert.equal('@users' in all, false)
    const shown = await ext.publicSettings(m)
    assert.deepEqual(shown, { league: 'bl1', team: 'SVW', goals: false, apiKeySet: true })
  })

  it('an extension without settings per user keeps its file as before', async () => {
    const plain = { ...manifest, settings: { league: { type: 'string', default: 'bl1' } } } as never
    assert.equal(await ext.writeSettings(plain, { league: 'bl2' }, 'leni'), true)
    assert.deepEqual(stored(), { league: 'bl2' })
  })

  it('the manifest: only from hostApi 13, never a secret or a pin, and only true', () => {
    const files = new Set<string>()
    const base = (settings: Record<string, unknown>, hostApi = 13) => ({ id: 'club', name: 'Club', version: '1.0.0', hostApi, resources: {}, settings })
    assert.equal(ext.checkManifest(base({ team: { type: 'string', perUser: true } }), files), null)
    assert.ok(ext.checkManifest(base({ team: { type: 'string', perUser: true } }, 12), files))
    assert.ok(ext.checkManifest(base({ key: { type: 'secret', perUser: true } }), files))
    assert.ok(ext.checkManifest(base({ pin: { type: 'gpio', default: 0, perUser: true } }), files))
    assert.ok(ext.checkManifest(base({ team: { type: 'string', perUser: 'yes' } }), files))
    assert.equal(ext.perUserKeys(base({ a: { type: 'string', perUser: true }, b: { type: 'number' } }) as never).join(), 'a')
  })
})

describe('the values per user through a restore and a copy of a user', () => {
  beforeEach(async () => {
    ext ??= await import('./app-api/extensions')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(path.join(dir, 'settings'), { recursive: true })
  })

  it('a restore keeps the values of users the backup does not know; the backup\'s own win', async () => {
    writeFileSync(file(), JSON.stringify({ league: 'bl1', '@users': { main: { team: 'A' }, leni: { team: 'B' } } }))
    const before = await ext.snapshotPerUser()
    // (the backup's file: another league, its own values of main, no leni)
    writeFileSync(file(), JSON.stringify({ league: 'bl2', '@users': { main: { team: 'C' } } }))
    await ext.mergePerUser(before)
    assert.deepEqual(stored(), { league: 'bl2', '@users': { main: { team: 'C' }, leni: { team: 'B' } } })
    // (a backup without users at all)
    writeFileSync(file(), JSON.stringify({ league: 'bl3' }))
    await ext.mergePerUser(before)
    assert.deepEqual(stored()['@users'], { main: { team: 'A' }, leni: { team: 'B' } })
  })

  it('a new user as a copy takes the values per user of the one copied', async () => {
    writeFileSync(file(), JSON.stringify({ league: 'bl1', '@users': { main: { team: 'A', goals: true } } }))
    await ext.copyPerUser('main', 'max')
    assert.deepEqual(stored()['@users'].max, { team: 'A', goals: true })
    // (nothing to copy: nothing written)
    await ext.copyPerUser('nobody', 'tom')
    assert.equal('tom' in stored()['@users'], false)
  })
})
