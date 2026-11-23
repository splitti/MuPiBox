import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { applyUserConfig, hashPin, MAIN_ID, pinMatches, PIN_TRIES, type SwitchHooks, UserFiles, Users, UserSwitchError, userConfigOf } from './users'

// Several users of one box (5.1, users.ts): their things exchanged in place at a switch

let root = ''
let files: UserFiles
let config: Record<string, unknown>
let calls: string[]
let busyReason: string | null
let failUpdateConfig = false
let canLink = false

const lib = () => path.join(root, 'data', 'library')
const read = (f: string) => fs.readFileSync(f, 'utf8')
const write = (f: string, text: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, text)
}

const hooks: SwitchHooks = {
  busy: async () => busyReason,
  lock: async () => {
    calls.push('lock')
    return () => calls.push('release')
  },
  playerHold: async () => {
    calls.push('hold')
  },
  playerChanged: async () => {
    calls.push('changed')
  },
  readConfig: async () => JSON.parse(JSON.stringify(config)),
  updateConfig: async (mutate) => {
    if (failUpdateConfig) throw new Error('config not written')
    const c = JSON.parse(JSON.stringify(config))
    mutate(c)
    config = c
  },
  forgetCaches: () => {
    calls.push('forget')
  },
  reload: async () => {
    calls.push('reload')
  },
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'users-'))
  files = new UserFiles({
    usersDir: path.join(root, 'data', 'users'),
    libraryDir: lib(),
    dataDir: path.join(root, 'data'),
    logsDir: path.join(root, 'data', 'logs'),
  })
  // the box as it is before any user: its library, its links, its data
  write(path.join(lib(), 'data.json'), '[{"title":"A"}]')
  write(path.join(lib(), 'resume.json'), '[{"title":"A1"}]')
  write(path.join(lib(), 'heard.json'), '{"lib:a":{"s":1}}')
  write(path.join(lib(), 'backup', 'data-2026-11-18.json'), '[]')
  write(path.join(root, 'server', 'config', 'config.json'), '{}')
  // (a link of the box in the library - not on Windows without the right to make one)
  try {
    fs.symlinkSync(path.join(root, 'server', 'config', 'config.json'), path.join(lib(), 'config.json'))
    canLink = true
  } catch {
    canLink = false
  }
  write(path.join(root, 'data', 'hidden-covers.json'), '["nas:/a"]')
  write(path.join(root, 'data', 'playtime-checkpoint.json'), '{"usedSeconds":60}')
  write(path.join(root, 'data', 'logs', 'play_log.jsonl'), '{"event":"start"}\n')
  write(path.join(root, 'data', 'logs', 'battery_log.jsonl'), 'keep\n')
  config = { mupibox: { theme: 'blue', maxVolume: 80, hostname: 'box' }, playtimeLimit: { enabled: true }, nas: { url: 'x' }, photos: { enabled: true, dailyMinutes: { mon: 5 }, order: 'new' } }
  calls = []
  busyReason = null
  failUpdateConfig = false
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('the configuration of a user', () => {
  it('takes the taste, the limits and the photo time - not the box', () => {
    const part = userConfigOf(config)
    assert.deepEqual(part, { mupibox: { theme: 'blue', maxVolume: 80 }, sections: { playtimeLimit: { enabled: true } }, photos: { dailyMinutes: { mon: 5 } } })
    const other = { mupibox: { theme: 'red' }, sections: {}, photos: {} }
    applyUserConfig(config, other)
    assert.deepEqual(config, { mupibox: { theme: 'red', hostname: 'box' }, nas: { url: 'x' }, photos: { enabled: true, order: 'new' } })
  })
})

describe('a switch', () => {
  it('moves the going user away and the coming one in, the box stays', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    calls = []
    await users.switchTo(leni.id)
    assert.deepEqual(calls, ['lock', 'hold', 'forget', 'release', 'changed', 'reload'])
    // in place: Leni's empty library, the links of the box
    assert.equal(read(path.join(lib(), 'data.json')), '[]')
    assert.equal(fs.existsSync(path.join(lib(), 'heard.json')), false)
    if (canLink) assert.ok(fs.lstatSync(path.join(lib(), 'config.json')).isSymbolicLink())
    assert.equal(fs.existsSync(path.join(root, 'data', 'hidden-covers.json')), false)
    assert.equal(read(path.join(root, 'data', 'logs', 'battery_log.jsonl')), 'keep\n')
    // the first user's things in his folder
    const main = path.join(root, 'data', 'users', MAIN_ID)
    assert.equal(read(path.join(main, 'library', 'data.json')), '[{"title":"A"}]')
    assert.ok(fs.existsSync(path.join(main, 'library', 'backup', 'data-2026-11-18.json')))
    assert.equal(read(path.join(main, 'data', 'playtime-checkpoint.json')), '{"usedSeconds":60}')
    assert.equal(read(path.join(main, 'logs', 'play_log.jsonl')), '{"event":"start"}\n')
    // his settings kept, Leni's (a copy of his, no subscriptions) in place
    assert.equal(files.readConfigPart(MAIN_ID)?.mupibox.theme, 'blue')
    assert.equal(users.state().current, leni.id)
    // and back: everything as before
    config.mupibox = { ...(config.mupibox as object), theme: 'pink' }
    await users.switchTo(MAIN_ID)
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(lib(), 'heard.json')), '{"lib:a":{"s":1}}')
    assert.equal(read(path.join(root, 'data', 'hidden-covers.json')), '["nas:/a"]')
    assert.equal((config.mupibox as Record<string, unknown>).theme, 'blue')
    assert.equal(files.readConfigPart(leni.id)?.mupibox.theme, 'pink')
    assert.equal(files.readConfigPart(MAIN_ID), null)
  })

  it('is refused while the box is busy, and when several users are off', async () => {
    const users = new Users(files, hooks)
    const leni = await users.add('Leni', null)
    await assert.rejects(users.switchTo(leni.id), (e: unknown) => e instanceof UserSwitchError && e.code === 'disabled')
    await users.setEnabled(true)
    busyReason = 'an update runs'
    const at = Date.now()
    await assert.rejects(users.switchTo(leni.id), (e: unknown) => e instanceof UserSwitchError && e.code === 'busy')
    assert.ok(Date.now() - at >= 9_000)
    assert.equal(users.state().current, MAIN_ID)
  })

  it('is finished from where a power cut stopped it', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', MAIN_ID)
    // the going user's part kept, the switch named, half of his library moved away
    files.writeConfigPart(MAIN_ID, userConfigOf(config))
    const f = files.read()
    f.switching = { from: MAIN_ID, to: leni.id, step: 'stash' }
    files.write(f)
    write(path.join(root, 'data', 'users', MAIN_ID, 'library', 'resume.json'), read(path.join(lib(), 'resume.json')))
    fs.rmSync(path.join(lib(), 'resume.json'))
    const done = files.recover()
    assert.deepEqual(done, { from: MAIN_ID, to: leni.id })
    await users.finishCutOff()
    assert.equal(users.state().current, leni.id)
    assert.equal(users.state().switching, undefined)
    // Leni has a copy of the library, not the resume list; the first user's things are whole in his folder
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(lib(), 'resume.json')), '[]')
    assert.equal(read(path.join(root, 'data', 'users', MAIN_ID, 'library', 'resume.json')), '[{"title":"A1"}]')
    assert.equal(read(path.join(root, 'data', 'users', MAIN_ID, 'library', 'heard.json')), '{"lib:a":{"s":1}}')
  })

  it('is finished at once when the configuration cannot be written in the middle - or at the next start', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    failUpdateConfig = true
    await assert.rejects(users.switchTo(leni.id), (e: unknown) => e instanceof UserSwitchError && e.code === 'failed')
    // the files are Leni's, the switch is named for the next start
    assert.equal(read(path.join(lib(), 'data.json')), '[]')
    assert.equal(files.read().switching?.to, leni.id)
    failUpdateConfig = false
    await users.finishCutOff()
    assert.equal(users.state().current, leni.id)
    assert.equal(read(path.join(root, 'data', 'users', MAIN_ID, 'library', 'data.json')), '[{"title":"A"}]')
  })

  it('finishes a switch left open before it begins another', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    const max = await users.add('Max', null)
    failUpdateConfig = true
    await assert.rejects(users.switchTo(leni.id))
    failUpdateConfig = false
    // (open: Leni's files in place, the first user named as the one in place)
    assert.equal(users.state().current, MAIN_ID)
    await users.switchTo(max.id)
    assert.equal(users.state().current, max.id)
    assert.equal(read(path.join(root, 'data', 'users', MAIN_ID, 'library', 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(root, 'data', 'users', leni.id, 'library', 'data.json')), '[]')
  })

  it('keeps what was moved when a file stands in its way after a cut-off switch', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    // cut off after the stash: the first user's library in his folder - then a script made an empty data.json in place
    files.writeConfigPart(MAIN_ID, userConfigOf(config))
    const f = files.read()
    f.switching = { from: MAIN_ID, to: leni.id, step: 'stash' }
    files.write(f)
    files.stash(MAIN_ID)
    write(path.join(lib(), 'data.json'), '[]')
    await users.finishCutOff()
    assert.equal(read(path.join(root, 'data', 'users', MAIN_ID, 'library', 'data.json')), '[{"title":"A"}]')
    const aside = fs.readdirSync(path.join(root, 'data', 'users', MAIN_ID)).find((n) => n.startsWith('aside-'))
    assert.ok(aside)
    await users.switchTo(MAIN_ID)
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
  })
})

describe('the users', () => {
  it('a new user gets an empty library or a copy, and the trash gives one back', async () => {
    config.spotify_sync = { enabled: true }
    const users = new Users(files, hooks)
    const a = await users.add('Anna', null)
    const b = await users.add('Ben', MAIN_ID)
    assert.deepEqual(fs.readdirSync(path.join(root, 'data', 'users', a.id, 'library')), ['data.json'])
    assert.equal(read(path.join(root, 'data', 'users', a.id, 'library', 'data.json')), '[]')
    assert.equal(read(path.join(root, 'data', 'users', b.id, 'library', 'data.json')), '[{"title":"A"}]')
    assert.equal(files.readConfigPart(a.id)?.sections.spotify_sync, undefined)
    assert.deepEqual(files.readConfigPart(b.id)?.sections.spotify_sync, { enabled: true })
    assert.notEqual(a.color, b.color)
    await assert.rejects(users.remove(MAIN_ID))
    await users.remove(b.id)
    assert.deepEqual(
      users.state().users.map((u) => u.name),
      ['Standard', 'Anna'],
    )
    const [t] = files.trashList()
    assert.equal(t.name, 'Ben')
    const back = await users.restore(t.key)
    assert.equal(back.name, 'Ben')
    assert.equal(read(path.join(root, 'data', 'users', back.id, 'library', 'data.json')), '[{"title":"A"}]')
    assert.deepEqual(files.trashList(), [])
  })

  it('no two users with the same name - Telegram, MQTT and Home Assistant pick one by it', async () => {
    const users = new Users(files, hooks)
    const anna = await users.add('Anna', null)
    await assert.rejects(users.add(' anna ', null), (e: UserSwitchError) => e.message === 'name_taken')
    const ben = await users.add('Ben', null)
    await assert.rejects(users.rename(ben.id, 'ANNA'), (e: UserSwitchError) => e.message === 'name_taken')
    // (his own name in other letters is no other user's)
    await users.rename(anna.id, 'ANNA')
    await users.remove(anna.id)
    await users.rename(ben.id, 'Anna')
    const [t] = files.trashList()
    const back = await users.restore(t.key)
    assert.equal(back.name, 'ANNA 2')
  })

  it('switched off with another user kept: the box goes on with him, the others rest', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    const f = await users.setEnabled(false, leni.id)
    assert.equal(f.enabled, false)
    assert.equal(f.current, leni.id)
    assert.equal(read(path.join(lib(), 'data.json')), '[]')
    assert.ok(fs.existsSync(path.join(root, 'data', 'users', MAIN_ID, 'library', 'data.json')))
  })

  it('changes the configuration of a user who is not in place in his kept part - of the one in place in place', async () => {
    config.spotify_sync = { artists: [{ id: 'a' }] }
    const users = new Users(files, hooks)
    const leni = await users.add('Leni', null)
    await users.updateUserConfig(leni.id, (cfg) => {
      cfg.spotify_sync = { artists: [{ id: 'leni' }] }
    })
    assert.deepEqual(files.readConfigPart(leni.id)?.sections.spotify_sync, { artists: [{ id: 'leni' }] })
    assert.deepEqual(config.spotify_sync, { artists: [{ id: 'a' }] })
    assert.deepEqual((await users.userConfig(leni.id)).spotify_sync, { artists: [{ id: 'leni' }] })
    await users.updateUserConfig(MAIN_ID, (cfg) => {
      cfg.spotify_sync = { artists: [{ id: 'main' }] }
    })
    assert.deepEqual(config.spotify_sync, { artists: [{ id: 'main' }] })
    // (and his subscriptions come into place with him)
    await users.setEnabled(true)
    await users.switchTo(leni.id)
    assert.deepEqual(config.spotify_sync, { artists: [{ id: 'leni' }] })
    await assert.rejects(users.updateUserConfig('nobody', () => undefined))
  })

  it('the coming user gets the own files as the media scan made them last (it writes the library in place only)', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    write(path.join(lib(), 'data.json'), JSON.stringify([{ type: 'spotify', id: 'a' }, { type: 'library', category: 'music', artist: 'A', title: 'Neu' }, { type: 'library', category: 'music', artist: 'A', title: 'Beide' }]))
    // (hers: one whose folder is gone, one she changed in the app - her version stays, in her order)
    write(
      path.join(root, 'data', 'users', leni.id, 'library', 'data.json'),
      JSON.stringify([{ type: 'library', category: 'music', artist: 'A', title: 'Beide', cover: 'mine' }, { type: 'library', category: 'music', artist: 'A', title: 'Gelöscht' }, { type: 'rss', id: 'f' }]),
    )
    await users.switchTo(leni.id)
    assert.deepEqual(JSON.parse(read(path.join(lib(), 'data.json'))), [
      { type: 'library', category: 'music', artist: 'A', title: 'Beide', cover: 'mine', index: 0 },
      { type: 'rss', id: 'f', index: 1 },
      { type: 'library', category: 'music', artist: 'A', title: 'Neu', index: 2 },
    ])
  })

  it('a restored backup comes in place whole: the users it does not know into the trash with their things', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    const ben = await users.add('Ben', null)
    write(path.join(root, 'data', 'users', ben.id, 'library', 'data.json'), '[{"title":"Ben"}]')
    await users.switchTo(anna.id)
    write(path.join(lib(), 'data.json'), '[{"title":"Anna vorher"}]')
    write(path.join(lib(), 'resume.json'), '[{"title":"Anna weiter"}]')
    const before = users.state()
    const held = files.prepareRestore()
    // (what unzip puts there: the list - the box in place, Anna not - and the folder of Anna; the library in place)
    write(files.file, JSON.stringify({ ...before, current: MAIN_ID, users: before.users.filter((u) => u.id !== ben.id) }))
    write(path.join(root, 'data', 'users', anna.id, 'library', 'data.json'), '[{"title":"Anna im Backup"}]')
    write(path.join(lib(), 'data.json'), '[{"title":"Box im Backup"}]')
    // (the box's own lists in its folder in the backup - put in place by the restore)
    write(path.join(root, 'data', 'users', MAIN_ID, 'library', 'resume.json'), '[{"title":"Box weiter"}]')
    files.finishRestore(held, before)
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"Box im Backup"}]')
    // (Anna's resume of before is not the box's: the backup's)
    assert.equal(read(path.join(lib(), 'resume.json')), '[{"title":"Box weiter"}]')
    assert.ok(!fs.existsSync(path.join(root, 'data', 'users', MAIN_ID, 'library', 'resume.json')))
    assert.equal(read(path.join(root, 'data', 'users', anna.id, 'library', 'data.json')), '[{"title":"Anna im Backup"}]')
    assert.ok(!fs.existsSync(path.join(root, 'data', 'users', anna.id, 'library', 'resume.json')))
    const [t] = files.trashList()
    assert.equal(t.name, 'Ben')
    assert.equal(read(path.join(root, 'data', 'users', 'trash', t.key, 'library', 'data.json')), '[{"title":"Ben"}]')
    assert.deepEqual(
      fs.readdirSync(path.join(root, 'data', 'users')).filter((n) => n.startsWith('.')),
      [],
    )
    // (no wait for a switch: hold runs in the order of the changes)
    assert.equal(await users.hold(async () => 'held'), 'held')
  })

  it('a restore that failed: the users of before back as they were', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    write(path.join(root, 'data', 'users', anna.id, 'library', 'data.json'), '[{"title":"Anna"}]')
    const before = users.state()
    const held = files.prepareRestore()
    write(files.file, '{"half": true}')
    write(path.join(root, 'data', 'users', 'xx', 'config.json'), '{}')
    files.undoRestore(held, before)
    assert.deepEqual(files.read().users.map((u) => u.name), ['Standard', 'Anna'])
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(lib(), 'resume.json')), '[{"title":"A1"}]')
    assert.equal(read(path.join(root, 'data', 'users', anna.id, 'library', 'data.json')), '[{"title":"Anna"}]')
    assert.ok(!fs.existsSync(path.join(root, 'data', 'users', 'xx')))
  })

  it('a restore that does not know the user in place: his settings go with him into the trash', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    await users.switchTo(anna.id)
    config.mupibox = { ...(config.mupibox as Record<string, unknown>), theme: 'annas' }
    const before = users.state()
    const held = files.prepareRestore(config)
    write(files.file, JSON.stringify({ ...before, current: MAIN_ID, users: before.users.filter((u) => u.id !== anna.id) }))
    write(path.join(lib(), 'data.json'), '[]')
    files.finishRestore(held, before)
    const [t] = files.trashList()
    assert.equal(t.name, 'Anna')
    const kept = JSON.parse(read(path.join(root, 'data', 'users', 'trash', t.key, 'config.json'))) as { mupibox: { theme: string } }
    assert.equal(kept.mupibox.theme, 'annas')
  })

  it('a restore cut off (a power cut during the unzip): the users of before back at the next start', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    write(path.join(root, 'data', 'users', anna.id, 'library', 'data.json'), '[{"title":"Anna"}]')
    files.prepareRestore()
    // (half unpacked: a list of the backup, no library in place)
    write(files.file, '{"version":1,"enabled":false,"current":"main","users":[]}')
    assert.ok(!fs.existsSync(path.join(lib(), 'data.json')))
    assert.equal(files.recoverRestore(), true)
    assert.deepEqual(files.read().users.map((u) => u.name), ['Standard', 'Anna'])
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(root, 'data', 'users', anna.id, 'library', 'data.json')), '[{"title":"Anna"}]')
    assert.deepEqual(fs.readdirSync(path.join(root, 'data', 'users')).filter((n) => n.startsWith('.')), [])
    assert.equal(files.recoverRestore(), false)
  })

  it('a restore cut off while it put the users aside: at the next start nothing of them deleted', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    write(path.join(root, 'data', 'users', anna.id, 'library', 'data.json'), '[{"title":"Anna"}]')
    const held = files.prepareRestore()
    // (as if it stopped before Anna's folder went aside: hers still in the users' folder, the mark of "all aside" not written)
    fs.renameSync(path.join(held, anna.id), path.join(root, 'data', 'users', anna.id))
    fs.rmSync(path.join(held, 'moved.json'))
    assert.equal(files.recoverRestore(), true)
    assert.deepEqual(files.read().users.map((u) => u.name), ['Standard', 'Anna'])
    assert.equal(read(path.join(lib(), 'data.json')), '[{"title":"A"}]')
    assert.equal(read(path.join(root, 'data', 'users', anna.id, 'library', 'data.json')), '[{"title":"Anna"}]')
    assert.deepEqual(fs.readdirSync(path.join(root, 'data', 'users')).filter((n) => n.startsWith('.')), [])
  })

  it('a restore done whose folder was being deleted at a power cut: only that folder goes at the next start', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    write(path.join(root, 'data', 'users', '.restored-1795000000000', 'before.json'), '{"version":1,"enabled":true,"current":"main","users":[]}')
    assert.equal(files.recoverRestore(), false)
    assert.deepEqual(fs.readdirSync(path.join(root, 'data', 'users')).filter((n) => n.startsWith('.')), [])
    assert.deepEqual(files.read().users.map((u) => u.name), ['Standard'])
  })

  it('no change of the users while a backup is restored - the unzip writes their list', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const anna = await users.add('Anna', null)
    const held = files.prepareRestore()
    await assert.rejects(users.add('Ben', null), (e: UserSwitchError) => e.code === 'busy')
    await assert.rejects(users.rename(anna.id, 'Bea'), (e: UserSwitchError) => e.code === 'busy')
    files.undoRestore(held, files.read())
    assert.deepEqual(files.read().users.map((u) => u.name), ['Standard', 'Anna'])
    await users.add('Ben', null)
  })

  it('empties the trash after 30 days', async () => {
    const users = new Users(files, hooks)
    const a = await users.add('Anna', null)
    await users.remove(a.id)
    files.purgeTrash(Date.now() + 31 * 24 * 60 * 60 * 1000)
    assert.deepEqual(files.trashList(), [])
  })

  it('counts the trash days only with the clock right - one put there before the time server answered starts anew', async () => {
    const users = new Users(files, hooks)
    const a = await users.add('Anna', null)
    files.clockSure = () => false
    await users.remove(a.id)
    const day = 24 * 60 * 60 * 1000
    files.purgeTrash(Date.now() + 31 * day)
    assert.equal(files.trashList().length, 1)
    files.clockSure = () => true
    const now = Date.now() + 31 * day
    files.purgeTrash(now)
    const [t] = files.trashList()
    assert.equal(t.deletedAt, now)
    assert.equal(t.clockUnsure, undefined)
    files.purgeTrash(now + 31 * day)
    assert.deepEqual(files.trashList(), [])
  })
})

describe('the PIN of a user', () => {
  it('is kept as a hash that only its own digits match', () => {
    const h = hashPin('1234')
    assert.ok(!h.includes('1234'))
    assert.ok(pinMatches(h, '1234'))
    assert.ok(!pinMatches(h, '1235'))
    assert.ok(!pinMatches(hashPin('1234'), '0000'))
    assert.ok(!pinMatches(undefined, '1234'))
    assert.ok(!pinMatches('1234', '1234'))
  })

  it('is asked at the display before a switch to him - not back, not in the app; 5 wrong, then a pause', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    await assert.rejects(users.setPin(leni.id, '12a4'), (e: UserSwitchError) => e.code === 'failed')
    await users.setPin(leni.id, '2580')
    assert.ok(users.state().users.find((u) => u.id === leni.id)?.pin?.startsWith('s1$'))
    // (none sent - the display did not know of the PIN yet: asked for, no try used up)
    for (let i = 0; i < PIN_TRIES + 1; i++) {
      await assert.rejects(users.switchFromDisplay(leni.id, undefined), (e: UserSwitchError) => e.code === 'pin' && e.message === String(PIN_TRIES))
    }
    for (let i = 1; i < PIN_TRIES; i++) {
      await assert.rejects(users.switchFromDisplay(leni.id, '0000'), (e: UserSwitchError) => e.code === 'pin' && e.message === String(PIN_TRIES - i))
    }
    await assert.rejects(users.switchFromDisplay(leni.id, '0000'), (e: UserSwitchError) => e.code === 'pin_locked')
    // (paused: even the right one waits)
    await assert.rejects(users.switchFromDisplay(leni.id, '2580'), (e: UserSwitchError) => e.code === 'pin_locked')
    assert.equal(users.state().current, MAIN_ID)
    // the app switches without a PIN; back to a user without one at the display without one
    await users.switchTo(leni.id)
    assert.equal(users.state().current, leni.id)
    await users.switchFromDisplay(MAIN_ID, undefined)
    assert.equal(users.state().current, MAIN_ID)
    // "only in the app": the display switches no more
    await users.setSwitchMode('app')
    await assert.rejects(users.switchFromDisplay(leni.id, '2580'), (e: UserSwitchError) => e.code === 'mode')
    // taken away: no more PIN
    await users.setSwitchMode('free')
    await users.setPin(leni.id, '')
    assert.equal(users.state().users.find((u) => u.id === leni.id)?.pin, undefined)
  })

  it('comes back with him out of the trash', async () => {
    const users = new Users(files, hooks)
    await users.setEnabled(true)
    const leni = await users.add('Leni', null)
    await users.setPin(leni.id, '2580')
    await users.remove(leni.id)
    const [t] = files.trashList()
    const back = await users.restore(t.key)
    assert.ok(pinMatches(back.pin, '2580'))
    assert.ok(pinMatches(users.state().users.find((u) => u.id === back.id)?.pin, '2580'))
  })
})
