// The logic of the Winamp playlist's editing (src/queue.js): no mpv, no box - folders in a temporary directory (npm test).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Q = require('../src/queue.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-queue-'))
const entry = (id, filename) => ({ id, filename })

test('the name of a queued file: no folder, no ending, no track number', () => {
  assert.equal(Q.nameOfFile('/home/dietpi/MuPiBox/media/music/A/03 - Stan.mp3'), 'Stan')
  assert.equal(Q.nameOfFile('/x/12_Walk this way.FLAC'), 'Walk this way')
  assert.equal(Q.nameOfFile('/x/2000.mp3'), '2000') // (a name that is only digits stays)
  assert.equal(Q.nameOfFile('/x/Song.v2.m4a'), 'Song.v2')
})

test('the sorts: by title, by file name, by path, reversed; numbers count as numbers', () => {
  const list = [entry(1, '/m/b/10 Zebra.mp3'), entry(2, '/m/a/2 Apple.mp3'), entry(3, '/m/a/1 Mango.mp3')]
  assert.deepEqual(Q.sortedIds(list, 'title'), [2, 3, 1])
  assert.deepEqual(Q.sortedIds(list, 'file'), [3, 2, 1])
  assert.deepEqual(Q.sortedIds(list, 'path'), [3, 2, 1])
  assert.deepEqual(Q.sortedIds(list, 'reverse'), [3, 2, 1])
  assert.throws(() => Q.sortedIds(list, 'sideways'), /unknown sort/)
})

test('a random order is a permutation of all of them, and follows the dice', () => {
  const list = Array.from({ length: 6 }, (_, i) => entry(i + 1, `/m/${i}.mp3`))
  const a = Q.sortedIds(list, 'random', () => 0)
  const b = Q.sortedIds(list, 'random', () => 0.999)
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(b, [1, 2, 3, 4, 5, 6]) // (the last die each time keeps the order)
  assert.notDeepEqual(a, b)
})

test('the moves bring the playlist to the order a sort asked for', () => {
  const current = [10, 20, 30, 40, 50]
  for (const target of [[50, 40, 30, 20, 10], [20, 10, 30, 50, 40], [10, 20, 30, 40, 50], [30, 50, 10, 40, 20]]) {
    const now = [...current]
    for (const [from, to] of Q.movesFor(current, target)) now.splice(to, 0, now.splice(from, 1)[0])
    assert.deepEqual(now, target)
  }
  assert.deepEqual(Q.movesFor(current, current), [])
})

test('positions from the display (1-based, as text) to indexes: only those that exist', () => {
  assert.deepEqual(Q.indexesOf('3,1,3,99,x,0,-2', 5), [0, 2])
  assert.deepEqual(Q.indexesOf('', 5), [])
  assert.deepEqual(Q.indexesOf(undefined, 5), [])
})

test('crop is everything but the chosen ones', () => {
  assert.deepEqual(Q.others([1, 3], 5), [0, 2, 4])
  assert.deepEqual(Q.others([], 3), [0, 1, 2])
})

test('a folder of the library: inside the root, never outside', () => {
  const root = tmp()
  assert.equal(Q.insideRoot(root, 'music/Album'), path.join(root, 'music', 'Album'))
  assert.equal(Q.insideRoot(root, ''), root)
  assert.equal(Q.insideRoot(root, '../etc'), null)
  assert.equal(Q.insideRoot(root, 'music/../../etc'), null)
  assert.equal(Q.insideRoot(root, 'a\0b'), null)
})

test('the folders to add from: the audio of each counted, hidden and "_" folders left out, the audio files in order', () => {
  const root = tmp()
  const make = (rel, files) => {
    fs.mkdirSync(path.join(root, rel), { recursive: true })
    for (const f of files) fs.writeFileSync(path.join(root, rel, f), '')
  }
  make('music/Rock', ['10 b.mp3', '2 a.mp3', 'cover.jpg'])
  make('music/Pop', [])
  make('music/.hidden', ['x.mp3'])
  make('music/_audio_cd_', ['y.mp3'])
  make('audiobook', ['one.mp3'])
  const top = Q.listFolders(root, '')
  assert.deepEqual(top.folders.map((f) => f.name), ['audiobook', 'music'])
  assert.equal(top.audio, 0)
  const music = Q.listFolders(root, 'music')
  assert.deepEqual(music.folders.map((f) => [f.name, f.audio, f.path]), [['Pop', 0, 'music/Pop'], ['Rock', 2, 'music/Rock']])
  assert.deepEqual(Q.audioFilesIn(root, 'music/Rock').map((f) => path.basename(f)), ['2 a.mp3', '10 b.mp3'])
  assert.equal(Q.listFolders(root, '../x'), null)
  assert.equal(Q.audioFilesIn(root, 'nope'), null)
  assert.equal(Q.listFolders(root, 'audiobook').audio, 1)
})

test('names of saved lists: letters, digits and a few signs, nothing that is a path', () => {
  assert.equal(Q.listName('  Road trip (2026)  '), 'Road trip (2026)')
  assert.equal(Q.listName('Käse – Müll'), null) // (the long dash is not one of the signs)
  assert.equal(Q.listName('Käse-Müll'), 'Käse-Müll')
  for (const bad of ['', '../x', 'a/b', '.hidden', 'x'.repeat(61), 'bell\u0007', null]) assert.equal(Q.listName(bad), null)
})

test('saved lists: saved, listed newest first, loaded, removed; an empty list is not saved', () => {
  const store = Q.createListStore(path.join(tmp(), 'lists'))
  assert.deepEqual(store.list(), [])
  assert.equal(store.save('First', ['/a.mp3', '/b.mp3'], 1000), 'First')
  assert.equal(store.save('Second', ['/c.mp3'], 2000), 'Second')
  assert.equal(store.save('Nothing', []), null)
  assert.equal(store.save('../bad', ['/a.mp3']), null)
  assert.deepEqual(store.list().map((l) => [l.name, l.count]), [['Second', 1], ['First', 2]])
  assert.deepEqual(store.load('First'), ['/a.mp3', '/b.mp3'])
  assert.equal(store.load('Missing'), null)
  assert.equal(store.remove('First'), true)
  assert.equal(store.remove('First'), false)
  assert.deepEqual(store.list().map((l) => l.name), ['Second'])
})

test('where an entry comes from, readable: a library file, a NAS album behind the box\'s stream address, a plain address', () => {
  const root = '/home/dietpi/MuPiBox/media'
  assert.deepEqual(Q.describeSource(`${root}/other/Käse Müller & Söhne/1 Lied.wav`, root), {
    file: '1 Lied.wav', folder: 'other/Käse Müller & Söhne', extension: 'WAV', inLibrary: true, full: `${root}/other/Käse Müller & Söhne/1 Lied.wav`,
  })
  const nas = Q.describeSource('http://localhost:8200/api/nas/stream?path=%2Fmusic%2Fbarn%2FBarnradio%2FBamsesaga%2F01%20Kapitel%20%C3%A4.mp3', root)
  assert.equal(nas.file, '01 Kapitel ä.mp3')
  assert.equal(nas.folder, '/music/barn/Barnradio/Bamsesaga')
  assert.equal(nas.extension, 'MP3')
  assert.equal(nas.inLibrary, false)
  assert.equal(Q.describeSource('http://radio.example/live%20stream/high.mp3', root).folder, '/live stream')
  assert.equal(Q.describeSource('https://x/%E0%A4%A.mp3', root).file.length > 0, true) // (an address that does not decode: left as it is)
})

test('a sort by title goes by the title the caller gives (the NAS\'s own name for a track), not by the file name', () => {
  const list = [{ id: 1, filename: '/m/a.mp3', title: 'Zebra' }, { id: 2, filename: '/m/b.mp3', title: 'Apple' }]
  assert.deepEqual(Q.sortedIds(list, 'title'), [2, 1])
  assert.deepEqual(Q.sortedIds(list, 'file'), [1, 2])
})
