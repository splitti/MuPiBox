// What depends on the version of mpv and on the playlist (src/mpv-compat.js) - no engine, no box (npm test).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { takesLoadfileIndex, loadfileCommand, targetAfterEnd } = require('../src/mpv-compat.js')
const { createShuffler } = require('../src/shuffle.js')
const E = require('../src/extensions.js')

test('"loadfile" takes an index from mpv 0.38 on - Debian 12 has 0.35', () => {
  assert.equal(takesLoadfileIndex('mpv 0.35.1 Copyright © 2000-2023 mpv/MPlayer/mplayer2 projects'), false)
  assert.equal(takesLoadfileIndex('mpv v0.37.0 Copyright'), false)
  assert.equal(takesLoadfileIndex('mpv 0.38.0 Copyright'), true)
  assert.equal(takesLoadfileIndex('mpv v0.40.0-dirty Copyright'), true)
  assert.equal(takesLoadfileIndex('mpv 1.0.0'), true)
  // (0.9 is older than 0.38: the minor number is a number, not a text)
  assert.equal(takesLoadfileIndex('mpv 0.9.2'), false)
})

test('an mpv whose version cannot be read counts as an older one', () => {
  for (const text of ['', undefined, null, 'ffmpeg version 5.1', 'mpv', 'mpv version unknown'])
    assert.equal(takesLoadfileIndex(text), false, String(text))
})

test('the options of an entry come after the index where mpv takes one, else right after the mode', () => {
  const entry = { file: '/media/cd.cda', options: 'start=#2,end=#3' }
  assert.deepEqual(loadfileCommand(true, entry, 0), ['loadfile', '/media/cd.cda', 'replace', -1, 'start=#2,end=#3'])
  assert.deepEqual(loadfileCommand(false, entry, 0), ['loadfile', '/media/cd.cda', 'replace', 'start=#2,end=#3'])
  // the first replaces what plays, the others follow
  assert.deepEqual(loadfileCommand(false, entry, 3), ['loadfile', '/media/cd.cda', 'append', 'start=#2,end=#3'])
  assert.deepEqual(loadfileCommand(true, { file: 'a.mp3' }, 1), ['loadfile', 'a.mp3', 'append', -1, ''])
  assert.deepEqual(loadfileCommand(false, { file: 'a.mp3' }, 1), ['loadfile', 'a.mp3', 'append', ''])
})

test('a list of one track with shuffle ends - or starts again with repeat: keep-open holds it at its end', () => {
  const shuffler = createShuffler(() => 0)
  assert.equal(targetAfterEnd({ shuffler, playlistPos: 0, playlistCount: 1, repeatOn: false }), -1)
  assert.equal(targetAfterEnd({ shuffler, playlistPos: 0, playlistCount: 1, repeatOn: true }), 0)
  assert.equal(targetAfterEnd({ shuffler, playlistPos: 0, playlistCount: 0, repeatOn: false }), -1)
})

test('with several tracks the shuffler chooses, and the album ends when the round is over', () => {
  const shuffler = createShuffler(() => 0)
  shuffler.visit(0)
  assert.equal(targetAfterEnd({ shuffler, playlistPos: 0, playlistCount: 3, repeatOn: false }), 1)
  shuffler.visit(1)
  shuffler.visit(2)
  assert.equal(targetAfterEnd({ shuffler, playlistPos: 2, playlistCount: 3, repeatOn: false }), -1)
  // (with repeat a new round starts)
  assert.ok(targetAfterEnd({ shuffler, playlistPos: 2, playlistCount: 3, repeatOn: true }) >= 0)
})

test("the player's host API is the API's: an extension the server installs must not lose its player part", () => {
  const source = path.join(__dirname, '..', '..', 'backend-api', 'src', 'app-api', 'extensions.ts')
  if (!fs.existsSync(source)) return // (not in the repository: the player alone)
  const server = /export const HOST_API = (\d+)/.exec(fs.readFileSync(source, 'utf8'))
  assert.ok(server, 'HOST_API not found in app-api/extensions.ts')
  assert.equal(E.HOST_API, Number(server[1]))
})

test('an extension for a newer host is left out - and the log says so, once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mupibox-compat-'))
  fs.mkdirSync(path.join(dir, 'newer'))
  fs.writeFileSync(
    path.join(dir, 'newer', 'manifest.json'),
    JSON.stringify({ id: 'newer', name: 'n', version: '1.2.3', hostApi: E.HOST_API + 1, player: 'player.js' }),
  )
  const said = []
  const original = console.warn
  console.warn = (text) => said.push(String(text))
  try {
    assert.equal(E.readManifest(dir, 'newer'), null)
    assert.equal(E.readManifest(dir, 'newer'), null)
  } finally {
    console.warn = original
  }
  assert.equal(said.length, 1)
  assert.match(said[0], /newer 1\.2\.3 is made for host API \d+, this player has \d+/)
})
