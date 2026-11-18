import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { applyUserConfig, MAIN_ID, type SwitchHooks, UserFiles, Users, UserSwitchError, userConfigOf } from './users'

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
    assert.deepEqual(fs.readdirSync(path.join(root, 'data', 'users', a.id, 'library')), [])
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

  it('empties the trash after 30 days', async () => {
    const users = new Users(files, hooks)
    const a = await users.add('Anna', null)
    await users.remove(a.id)
    files.purgeTrash(Date.now() + 31 * 24 * 60 * 60 * 1000)
    assert.deepEqual(files.trashList(), [])
  })
})
