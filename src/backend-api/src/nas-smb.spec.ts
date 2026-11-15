import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import type http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { NasApiError } from './nas/provider'
import { parseSmbAddress, smbConnect, smbDisconnect, smbDisplayAddress, smbErrorOf, type SmbSystem } from './nas/smb'
import { smbHelperRange, smbHelperResolve, startSmbHelper } from './nas/smb-helper'

// A box without root and cifs: "mounting" is a folder of the test, the helper runs in this process. mount: what
// nas_smb.sh answers; hang: the helper answers nothing any more (a NAS that hangs).
interface Fake extends SmbSystem {
  calls: string[]
  mount: { code: number; out: string }
  cifs: boolean
  hang: boolean
  /** what is mounted ("//host/share") */
  source: string | undefined
  servers: http.Server[]
}

async function fakeSystem(root: string): Promise<Fake> {
  const fake: Fake = {
    calls: [],
    mount: { code: 0, out: 'mounted' },
    cifs: true,
    hang: false,
    source: undefined,
    servers: [],
    probeMs: 300,
    retryMs: 50,
    async script(args, input) {
      fake.calls.push(`${args.join(' ')}${input ? ` <${input.split('\n')[0]}>` : ''}`)
      if (args[0] === 'install') {
        fake.cifs = true
        return { code: 0, out: '' }
      }
      if (args[0] === 'mount') {
        fake.source = fake.mount.code === 0 ? `//${args[1]}/${args[2]}` : undefined
        return fake.mount
      }
      if (args[0] === 'umount') fake.source = undefined
      return { code: 0, out: '' }
    },
    async mountedSource() {
      return fake.source
    },
    async hasCifs() {
      return fake.cifs
    },
    async startHelper(_root, token) {
      fake.calls.push('helper')
      const server = await startSmbHelper(root, token)
      fake.servers.push(server)
      // a hanging NAS: no request is answered any more
      const [handler] = server.listeners('request') as Array<(req: http.IncomingMessage, res: http.ServerResponse) => void>
      server.removeAllListeners('request')
      server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (!fake.hang) handler(req, res)
      })
      const exit: Array<() => void> = []
      server.once('close', () => {
        for (const cb of exit) cb()
      })
      return {
        port: (server.address() as AddressInfo).port,
        kill: () => {
          server.closeAllConnections()
          server.close()
        },
        onExit: (cb) => exit.push(cb),
      }
    },
  }
  return fake
}

async function shareFolder() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mupibox-smb-'))
  await mkdir(path.join(root, 'Hörspiele', 'Teil 2'), { recursive: true })
  await writeFile(path.join(root, 'Hörspiele', 'Folge 1.mp3'), '0123456789abcdefghij')
  await writeFile(path.join(root, 'Hörspiele', 'cover.jpg'), 'old')
  await writeFile(path.join(root, 'Hörspiele', '._Folge 1.mp3'), 'x')
  await mkdir(path.join(root, 'Hörspiele', '@eaDir'))
  return root
}

const LOGIN = { host: '192.168.1.20', share: 'Musik', account: 'box', password: 'pw' }

test('NAS SMB: share addresses as people type them', () => {
  assert.deepEqual(parseSmbAddress('\\\\192.168.1.20\\Musik'), { host: '192.168.1.20', share: 'Musik', folder: '' })
  assert.deepEqual(parseSmbAddress(' \\\\NAS\\Musik\\Hörspiele\\Neu\\ '), { host: 'nas', share: 'Musik', folder: 'Hörspiele/Neu' })
  assert.deepEqual(parseSmbAddress('//fritz.box/FRITZ.NAS'), { host: 'fritz.box', share: 'FRITZ.NAS', folder: '' })
  assert.deepEqual(parseSmbAddress('smb://user@nas.local/Meine Musik/'), { host: 'nas.local', share: 'Meine Musik', folder: '' })
  assert.deepEqual(parseSmbAddress('nas/Musik'), { host: 'nas', share: 'Musik', folder: '' })
  for (const bad of ['', '\\\\nas', '\\\\nas\\', '\\\\nas\\..', '\\\\nas\\a*b', '\\\\999.1.1.1\\x', '\\\\na_s\\x', '\\\\nas\\x\\..\\y', 'http://nas/x', 42]) {
    assert.equal(parseSmbAddress(bad), undefined, String(bad))
  }
  assert.equal(smbDisplayAddress('nas', 'Musik'), '\\\\nas\\Musik')
  assert.equal(smbErrorOf('error=auth'), 'auth')
  assert.equal(smbErrorOf('mount: something\nerror=smb1\n'), 'smb1')
  assert.equal(smbErrorOf('error=other 22'), 'other')
  assert.equal(smbErrorOf(''), 'other')
})

test('NAS SMB helper: paths stay in the share, ranges', () => {
  assert.equal(smbHelperResolve('/m', '/a/b'), path.join('/m', 'a', 'b'))
  assert.equal(smbHelperResolve('/m', '/'), path.join('/m'))
  assert.equal(smbHelperResolve('/m', '/a/../../etc'), undefined)
  assert.equal(smbHelperResolve('/m', '/a\0'), undefined)
  assert.equal(smbHelperResolve('/m', 7), undefined)
  assert.deepEqual(smbHelperRange('bytes=0-9', 20), [0, 9])
  assert.deepEqual(smbHelperRange('bytes=15-', 20), [15, 19])
  assert.deepEqual(smbHelperRange('bytes=10-99', 20), [10, 19])
  assert.deepEqual(smbHelperRange('bytes=-5', 20), [15, 19])
  assert.equal(smbHelperRange('bytes=20-', 20), 'invalid')
  assert.equal(smbHelperRange('bytes=0-1,5-6', 20), undefined)
  assert.equal(smbHelperRange(undefined, 20), undefined)
})

test('NAS SMB provider: the share as top folder, listing, exists, read whole and a range', async () => {
  const root = await shareFolder()
  const fake = await fakeSystem(root)
  try {
    const { provider, error } = await smbConnect(LOGIN, fake, true)
    assert.equal(error, undefined)
    assert.ok(provider)
    assert.deepEqual(fake.calls, ['mount 192.168.1.20 Musik <box>', 'helper'])

    assert.deepEqual(await provider.list('/'), [{ name: 'Musik', path: '/Musik', isdir: true }])
    const files = await provider.list('/Musik/Hörspiele')
    assert.deepEqual(
      files.map((f) => [f.name, f.path, f.isdir, f.additional?.size]),
      [
        ['Folge 1.mp3', '/Musik/Hörspiele/Folge 1.mp3', false, 20],
        ['Teil 2', '/Musik/Hörspiele/Teil 2', true, undefined],
        ['cover.jpg', '/Musik/Hörspiele/cover.jpg', false, 3],
      ],
    )
    assert.match(files[0].version ?? '', /^\d+-20$/)
    // the folder index: only the subfolders
    assert.deepEqual((await provider.list('/Musik/Hörspiele', undefined, { foldersOnly: true })).map((f) => f.name), ['Teil 2'])
    // the share's name as the NAS knows it, whatever the case
    assert.equal((await provider.list('/musik/Hörspiele')).length, 3)
    await assert.rejects(provider.list('/Musik/gibt es nicht'), NasApiError)
    await assert.rejects(provider.list('/Andere/x'), NasApiError)
    await assert.rejects(provider.list('/Musik/../../etc'), NasApiError)

    assert.equal(await provider.folderExists('/'), true)
    assert.equal(await provider.folderExists('/Musik'), true)
    assert.equal(await provider.folderExists('/Musik/Hörspiele/Teil 2'), true)
    assert.equal(await provider.folderExists('/Musik/Hörspiele/weg'), false)
    // (another share: unknown here, not gone - a profile made over WebDAV must not drop its folders)
    await assert.rejects(provider.folderExists('/Andere'), /another share/)

    const whole = await provider.read('/Musik/Hörspiele/Folge 1.mp3')
    assert.equal(whole.status, 200)
    assert.equal(whole.headers.get('content-type'), 'audio/mpeg')
    assert.equal(whole.headers.get('content-length'), '20')
    assert.equal(whole.headers.get('accept-ranges'), 'bytes')
    assert.equal(await whole.text(), '0123456789abcdefghij')
    const part = await provider.read('/Musik/Hörspiele/Folge 1.mp3', { range: 'bytes=10-' })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), 'bytes 10-19/20')
    assert.equal(await part.text(), 'abcdefghij')
    const beyond = await provider.read('/Musik/Hörspiele/Folge 1.mp3', { range: 'bytes=99-' })
    assert.equal(beyond.status, 416)
    await beyond.arrayBuffer()
    const gone = await provider.read('/Musik/Hörspiele/weg.mp3')
    assert.equal(gone.status, 404)
    await gone.arrayBuffer()
    assert.equal((await provider.read('/Andere/x.mp3')).status, 404)
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
  }
})

test('NAS SMB provider: write (kept without overwrite), move, remove', async () => {
  const root = await shareFolder()
  const fake = await fakeSystem(root)
  try {
    const { provider } = await smbConnect(LOGIN, fake, true)
    assert.ok(provider)
    const cover = path.join(root, 'Hörspiele', 'cover.jpg')
    assert.equal(await provider.write('/Musik/Hörspiele/cover.jpg', Buffer.from('new'), { contentType: 'image/jpeg', overwrite: false }), 'exists')
    assert.equal(await readFile(cover, 'utf8'), 'old')
    assert.equal(await provider.move('/Musik/Hörspiele/cover.jpg', '/Musik/Hörspiele/cover-previous.jpg', { overwrite: false }), 'ok')
    assert.equal(await provider.write('/Musik/Hörspiele/cover.jpg', Buffer.from('new'), { contentType: 'image/jpeg', overwrite: false }), 'ok')
    assert.equal(await readFile(cover, 'utf8'), 'new')
    assert.equal(await provider.move('/Musik/Hörspiele/cover.jpg', '/Musik/Hörspiele/cover-previous.jpg', { overwrite: false }), 'exists')
    assert.equal(await provider.move('/Musik/Hörspiele/cover.jpg', '/Musik/Hörspiele/cover-previous.jpg', { overwrite: true }), 'ok')
    assert.equal(await readFile(path.join(root, 'Hörspiele', 'cover-previous.jpg'), 'utf8'), 'new')
    assert.equal(await provider.remove('/Musik/Hörspiele/cover-previous.jpg'), 'ok')
    assert.equal(await provider.remove('/Musik/Hörspiele/cover-previous.jpg'), 'failed')
    assert.equal(await provider.write('/Andere/cover.jpg', Buffer.from('x'), { contentType: 'image/jpeg', overwrite: true }), 'failed')
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
  }
})

test('NAS SMB: why a mount failed, cifs-utils installed first, the share before kept after a failed login', async () => {
  const root = await shareFolder()
  const fake = await fakeSystem(root)
  try {
    fake.cifs = false
    const first = await smbConnect(LOGIN, fake, true)
    assert.ok(first.provider)
    assert.deepEqual(fake.calls, ['install', 'mount 192.168.1.20 Musik <box>', 'helper'])

    // the same login again (the remembered one after the NAS was away): the running helper, no new mount
    fake.calls = []
    assert.ok((await smbConnect(LOGIN, fake)).provider)
    assert.deepEqual(fake.calls, [])

    // another login in the app that is refused: the answer comes at once; the share before is mounted again with the
    // next request (not right away - its own login may be one the NAS just refused) and keeps working
    fake.calls = []
    fake.mount = { code: 1, out: 'mount error(13): Permission denied\nerror=auth' }
    const wrong = await smbConnect({ ...LOGIN, account: 'other', password: 'nope' }, fake, true)
    assert.equal(wrong.provider, undefined)
    assert.equal(wrong.error, 'auth')
    assert.deepEqual([...fake.calls], ['umount', 'mount 192.168.1.20 Musik <other>'])
    fake.mount = { code: 0, out: 'mounted' }
    assert.equal((await first.provider.list('/Musik/Hörspiele')).length, 3)
    assert.deepEqual(fake.calls.slice(2), ['mount 192.168.1.20 Musik <box>', 'helper'])

    fake.mount = { code: 1, out: 'error=smb1' }
    assert.equal((await smbConnect({ ...LOGIN, share: 'Alt' }, fake, true)).error, 'smb1')
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
  }
})

test('NAS SMB: a share that hangs counts as away - nothing ended, nothing unmounted, the same helper asked again', async () => {
  const root = await shareFolder()
  const fake = await fakeSystem(root)
  try {
    const { provider } = await smbConnect(LOGIN, fake, true)
    assert.ok(provider)

    // the NAS hangs: a request runs into its time limit, the probe does not answer either -> away; the helper stays
    fake.retryMs = 1000
    await new Promise((r) => setTimeout(r, 1100)) // (a probe at most once a second here)
    fake.hang = true
    fake.calls = []
    await assert.rejects(provider.list('/Musik/Hörspiele', AbortSignal.timeout(100)))
    await new Promise((r) => setTimeout(r, 450))
    // (in the wait after it: no request goes to the helper, it is refused at once)
    const t = Date.now()
    await assert.rejects(provider.list('/Musik/Hörspiele'), /not available/)
    assert.ok(Date.now() - t < 100)
    fake.retryMs = 50
    await new Promise((r) => setTimeout(r, 1100))
    assert.deepEqual(fake.calls, [])
    assert.equal(fake.source, '//192.168.1.20/Musik')
    assert.equal(fake.servers.length, 1)

    // the NAS is back: the next request asks the same helper again and works
    fake.hang = false
    await new Promise((r) => setTimeout(r, 60))
    assert.equal((await provider.list('/Musik/Hörspiele')).length, 3)
    assert.deepEqual(fake.calls, [])

    // the same remembered login while it answers: nothing new either
    assert.ok((await smbConnect(LOGIN, fake)).provider)
    assert.deepEqual(fake.calls, [])

    // the helper ended by itself: a new one on the mounted share with the next request
    fake.servers[0].closeAllConnections()
    fake.servers[0].close()
    await new Promise((r) => setTimeout(r, 60))
    assert.equal((await provider.list('/Musik/Hörspiele')).length, 3)
    assert.deepEqual(fake.calls, ['helper'])

    // the server started again with the share still mounted (the remembered login): no new mount
    fake.calls = []
    await smbDisconnect()
    fake.calls = []
    fake.source = '//192.168.1.20/Musik'
    assert.ok((await smbConnect(LOGIN, fake)).provider)
    assert.deepEqual(fake.calls, ['helper'])
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
  }
})

test('NAS SMB: a refused remembered login waits, a failed login in the app leaves no helper, links out of the share are refused', async () => {
  const root = await shareFolder()
  const outside = await mkdtemp(path.join(os.tmpdir(), 'mupibox-box-'))
  await writeFile(path.join(outside, 'secret.txt'), 'box file')
  const fake = await fakeSystem(root)
  try {
    // the remembered login refused: not mounted again on the next tries while it waits
    fake.retryMs = 60_000
    fake.mount = { code: 1, out: 'error=auth' }
    assert.equal((await smbConnect(LOGIN, fake)).error, 'auth')
    assert.equal((await smbConnect(LOGIN, fake)).error, 'auth')
    assert.deepEqual(fake.calls, ['mount 192.168.1.20 Musik <box>'])
    await smbDisconnect()

    // a working share, then a login in the app whose share mounts but does not answer: its helper is ended
    fake.retryMs = 50
    fake.mount = { code: 0, out: 'mounted' }
    const first = await smbConnect(LOGIN, fake, true)
    assert.ok(first.provider)
    const helpersBefore = fake.servers.length
    const realStart = fake.startHelper
    fake.startHelper = async (r, t) => {
      const h = await realStart(r, t)
      fake.hang = true // (this share's NAS does not answer)
      return h
    }
    assert.equal((await smbConnect({ ...LOGIN, share: 'Andere' }, fake, true)).error, 'unreachable')
    fake.startHelper = realStart
    fake.hang = false
    const failedHelper = fake.servers[helpersBefore]
    assert.equal(failedHelper.listening, false, 'the failed login left its helper running')
    await new Promise((r) => setTimeout(r, 80))
    assert.equal((await first.provider.list('/Musik/Hörspiele')).length, 3)

    // a link on the share pointing out of it (on a NAS the box's kernel would follow it)
    let linked = true
    try {
      await symlink(path.join(outside, 'secret.txt'), path.join(root, 'Hörspiele', 'link.mp3'))
      await symlink(outside, path.join(root, 'Hörspiele', 'linkdir'), 'dir')
    } catch {
      linked = false // (no right to make links here: Windows without developer mode)
    }
    if (linked) {
      const read = await first.provider.read('/Musik/Hörspiele/link.mp3')
      assert.equal(read.status, 403)
      await read.arrayBuffer()
      await assert.rejects(first.provider.list('/Musik/Hörspiele/linkdir'), NasApiError)
      assert.equal(await first.provider.write('/Musik/Hörspiele/linkdir/x.jpg', Buffer.from('x'), { contentType: 'image/jpeg', overwrite: true }), 'denied')
      assert.equal(await first.provider.write('/Musik/Hörspiele/link.mp3', Buffer.from('x'), { contentType: 'image/jpeg', overwrite: true }), 'denied')
      assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'), 'box file')
    }
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('NAS SMB helper: the probe fails when nothing is mounted (an empty folder of the box)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mupibox-smb-'))
  const server = await startSmbHelper(root, 'x'.repeat(32), 0, { requireMount: true })
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/probe`, { headers: { 'x-mupibox-token': 'x'.repeat(32) } })
    assert.equal(r.status, 503)
    assert.equal(((await r.json()) as { code: string }).code, 'NOTMOUNTED')
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('NAS SMB: the remembered login in the background does not replace a login from the app; a share that does not answer a read is an error', async () => {
  const root = await shareFolder()
  const fake = await fakeSystem(root)
  try {
    // a login in the app with a new password; the config still holds the old one
    const app = await smbConnect({ ...LOGIN, password: 'new' }, fake, true)
    assert.ok(app.provider)
    fake.calls = []
    const background = await smbConnect({ ...LOGIN, password: 'old' }, fake)
    assert.ok(background.provider, 'the background sign-in uses the share the app mounted')
    assert.deepEqual(fake.calls, [])

    // a read the share does not answer (503 from the helper): thrown, as a request that failed
    const server = fake.servers[fake.servers.length - 1]
    const [handler] = server.listeners('request') as Array<(req: http.IncomingMessage, res: http.ServerResponse) => void>
    server.removeAllListeners('request')
    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url?.startsWith('/file')) return void res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"code":"EIO"}')
      handler(req, res)
    })
    await assert.rejects(app.provider.read('/Musik/Hörspiele/Folge 1.mp3'), /not answering/)
    await smbDisconnect()

    // a login in the app that fails with nothing before it: the remembered login gets its turn again
    fake.calls = []
    fake.mount = { code: 1, out: 'error=auth' }
    assert.equal((await smbConnect({ ...LOGIN, password: 'falsch' }, fake, true)).error, 'auth')
    fake.mount = { code: 0, out: 'mounted' }
    assert.ok((await smbConnect(LOGIN, fake)).provider)
    assert.deepEqual(fake.calls.filter((c) => c.startsWith('mount')), ['mount 192.168.1.20 Musik <box>', 'mount 192.168.1.20 Musik <box>'])
    await smbDisconnect()

    // the remembered login without cifs-utils: installed in the background, said as "installing"
    fake.calls = []
    fake.cifs = false
    const realScript = fake.script
    let finish: () => void = () => undefined
    fake.script = async (args, input, ms) => {
      if (args[0] === 'install') {
        fake.calls.push('install')
        await new Promise<void>((r) => (finish = r))
        fake.cifs = true
        return { code: 0, out: '' }
      }
      return realScript(args, input, ms)
    }
    assert.equal((await smbConnect(LOGIN, fake)).error, 'installing')
    finish()
    fake.script = realScript
  } finally {
    await smbDisconnect()
    await rm(root, { recursive: true, force: true })
  }
})
