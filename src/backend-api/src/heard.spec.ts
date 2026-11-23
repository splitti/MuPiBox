import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { HeardStore, heardKeyOf, heardSettings } from './heard'

// What of the library was heard (5.1, issue #180): the ticks at the covers of a list on the display

const ENTRIES: Record<string, unknown>[] = [
  { type: 'library', category: 'audiobook', artist: 'Serie', title: 'Folge 1', libraryPath: 'audiobook/Serie/Folge 1' },
  { type: 'library', category: 'music', artist: 'Band', title: 'Album' },
  { type: 'library', category: 'resume', resumelocalalbum: 'audiobook', artist: 'Serie', title: 'Folge 2', isResume: true },
  { type: 'library', category: 'audiobook', libraryPath: 'audiobook/Serie', libraryIsContainer: true },
  { type: 'nas', category: 'audiobook', nasPath: 'Hörspiele/Serie/01' },
  { type: 'nas', category: 'nas', nasPath: 'Hörspiele/Serie', nasIsContainer: true },
  { type: 'nas', category: 'audiobook', id: 'nas:Hörspiele/Serie/02', nasPath: 'Hörspiele/Serie/02', isResume: true },
  { type: 'tidal', category: 'audiobook', id: '12345', tidalKind: 'album' },
  { type: 'tidal', category: 'music', id: 'abc-def', tidalKind: 'playlist' },
  { type: 'tidal', category: 'audiobook', id: '777', tidalKind: 'artist' },
  { type: 'spotify', category: 'audiobook', id: '4aawyAB9vmqN3uQ7FjRGTy' },
  { type: 'spotify', category: 'music', playlistid: '37i9dQZF1DXcBWIGoYBM5M' },
  { type: 'spotify', category: 'other', showid: '512ojhOuo1ktJprKbVcKyQ' },
  { type: 'spotify', category: 'audiobook', audiobookid: '7iHfbu1YPACw6oZPAFJtqe' },
  { type: 'spotify', category: 'audiobook', artistid: '3meJIgRw7YleJrmbpbJK6S' },
  { type: 'radio', category: 'other', id: 'https://radio.example/stream' },
  { type: 'rss', category: 'other', id: 'https://feed.example/rss' },
]

describe('heardKeyOf', () => {
  it('forms the key of each kind of entry, none for what gets no tick', () => {
    assert.deepEqual(
      ENTRIES.map((e) => heardKeyOf(e)),
      [
        'lib:audiobook/Serie/Folge 1',
        'lib:music/Band/Album',
        'lib:audiobook/Serie/Folge 2',
        null,
        'nas:Hörspiele/Serie/01',
        null,
        'nas:Hörspiele/Serie/02',
        'tidal:album:12345',
        'tidal:playlist:abc-def',
        null,
        'spotify:album:4aawyAB9vmqN3uQ7FjRGTy',
        'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
        'spotify:episode:512ojhOuo1ktJprKbVcKyQ',
        'spotify:show:7iHfbu1YPACw6oZPAFJtqe',
        null,
        null,
        null,
      ],
    )
  })

  it('is the same key the display forms', async () => {
    // (the display's own file - another package, loaded as it comes)
    const mod = (await import('../../frontend-box/src/app/heard-key')) as Record<string, any>
    const displayKeyOf = (mod.heardKeyOf ?? mod.default?.heardKeyOf) as (m: unknown) => string | null
    for (const e of ENTRIES) assert.equal(displayKeyOf(e), heardKeyOf(e), JSON.stringify(e))
  })

  it('is the same key the app forms (its library sheets)', () => {
    // (the app is one script for the browser: its function taken out of it as it stands)
    const app = fs.readFileSync(path.join(process.cwd(), 'src', 'mupi-app', 'app.js'), 'utf8')
    const start = app.indexOf('function heardKeyOfItem(it) {')
    const end = app.indexOf('\nconst heardOf', start)
    assert.ok(start >= 0 && end > start)
    const appKeyOf = new Function(`${app.slice(start, end)}; return heardKeyOfItem`)() as (m: unknown) => string | null
    for (const e of ENTRIES) assert.equal(appKeyOf(e), heardKeyOf(e), JSON.stringify(e))
  })
})

describe('HeardStore', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heard-'))

  it('starts with what "Weiterhören" holds, the first time only', () => {
    const d = dir()
    const store = new HeardStore(d, () => [ENTRIES[0], ENTRIES[10], ENTRIES[16]])
    assert.deepEqual(store.all(), { 'lib:audiobook/Serie/Folge 1': 'started', 'spotify:album:4aawyAB9vmqN3uQ7FjRGTy': 'started' })
    // (a store made again later: the file is there, nothing is taken over again)
    store.set(['lib:audiobook/Serie/Folge 1'], 'unheard')
    const again = new HeardStore(d, () => [ENTRIES[0]])
    assert.deepEqual(again.all(), { 'spotify:album:4aawyAB9vmqN3uQ7FjRGTy': 'started' })
  })

  it('started, then finished; a finished one stays finished when it is heard again', () => {
    const store = new HeardStore(dir())
    const key = 'nas:Hörspiele/Serie/01'
    assert.equal(store.note(key, 'started'), true)
    assert.equal(store.stateOf(key), 'started')
    assert.equal(store.note(key, 'started'), false)
    assert.equal(store.note(key, 'finished'), true)
    assert.equal(store.stateOf(key), 'finished')
    assert.equal(store.note(key, 'started'), false)
    assert.equal(store.stateOf(key), 'finished')
    assert.equal(store.note(key, 'finished'), false)
    // (a key the box does not know is not taken)
    assert.equal(store.note('radio:x', 'started'), false)
  })

  it('the parents: as heard, as not heard - kept in the file', () => {
    const d = dir()
    const store = new HeardStore(d)
    assert.equal(store.set(['tidal:album:1', 'tidal:album:2', 'bad'], 'finished'), 2)
    assert.equal(store.set(['tidal:album:1'], 'finished'), 0)
    assert.equal(store.set(['tidal:album:2', 'tidal:album:3'], 'unheard'), 1)
    assert.deepEqual(new HeardStore(d).all(), { 'tidal:album:1': 'finished' })
  })

  it('keeps no more than 5000 entries - the oldest go', () => {
    const d = dir()
    const many: Record<string, { s: number }> = {}
    for (let i = 0; i < 5000; i++) many[`lib:a/${i}`] = { s: 1000 + i }
    fs.writeFileSync(path.join(d, 'heard.json'), JSON.stringify(many))
    const store = new HeardStore(d)
    store.note('lib:a/new', 'started')
    const all = new HeardStore(d).all()
    assert.equal(Object.keys(all).length, 5000)
    assert.equal(all['lib:a/0'], undefined)
    assert.equal(all['lib:a/new'], 'started')
  })

  it('is on unless the parents switched it off', () => {
    assert.equal(heardSettings(undefined).enabled, true)
    assert.equal(heardSettings({ heardMarks: false }).enabled, false)
  })
})
