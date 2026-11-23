import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import {
  authorization,
  cleanAddress,
  JellyfinError,
  libraries,
  loginWithPassword,
  publicInfo,
  quickConnectConfirmed,
  quickConnectLogin,
  quickConnectStart,
  versionAtLeast,
} from './jellyfin/client'
import { broadcastAddresses, parseAnswer } from './jellyfin/discover'
import { applyJellyfinOptions, JELLYFIN_DEFAULTS, jellyfinSettings, signedIn } from './jellyfin/settings'

const SERVER_ID = 'cd5b5c254a17429d81013af7a8c39be4'
const USER_ID = 'be7cbdb20bef481ba309a7d55369097e'
const DEVICE = { deviceId: '0b6f7e2c-1a2b-4c3d-8e9f-001122334455', deviceName: 'MuPiBox', version: '5.1.0' }

// A small Jellyfin: public info, password and Quick Connect login, the user's libraries
function fakeJellyfin(opts: { product?: string; version?: string; quickConnect?: boolean; oldViews?: boolean } = {}) {
  const seen: { url: string; auth: string; body: string }[] = []
  let confirmed = false
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ url: req.url ?? '', auth: String(req.headers.authorization ?? ''), body })
      const json = (status: number, v?: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(v === undefined ? '' : JSON.stringify(v))
      }
      const token = /Token="([^"]+)"/.exec(String(req.headers.authorization ?? ''))?.[1]
      const u = new URL(req.url ?? '/', 'http://x')
      if (u.pathname === '/System/Info/Public') return json(200, { Id: SERVER_ID, ServerName: 'Wohnzimmer', Version: opts.version ?? '12.4.0', ProductName: opts.product ?? 'Jellyfin Server' })
      if (u.pathname === '/Users/AuthenticateByName') {
        const b = JSON.parse(body || '{}')
        if (b.Username === 'kind' && b.Pw === 'geheim') return json(200, { AccessToken: 'tok-password', ServerId: SERVER_ID, User: { Id: USER_ID, Name: 'kind' } })
        return json(401)
      }
      if (u.pathname === '/QuickConnect/Initiate') return opts.quickConnect === false ? json(401) : json(200, { Code: '123456', Secret: 'sec-1' })
      if (u.pathname === '/QuickConnect/Connect') return u.searchParams.get('secret') === 'sec-1' ? json(200, { Authenticated: confirmed }) : json(404)
      if (u.pathname === '/Users/AuthenticateWithQuickConnect') return JSON.parse(body).Secret === 'sec-1' && confirmed ? json(200, { AccessToken: 'tok-qc', ServerId: SERVER_ID, User: { Id: USER_ID, Name: 'kind' } }) : json(401)
      if (!token) return json(401)
      if (u.pathname === '/UserViews' && !opts.oldViews)
        return json(200, { Items: [{ Id: 'a'.repeat(32), Name: 'Musik', CollectionType: 'music' }, { Id: 'b'.repeat(32), Name: 'Filme', CollectionType: 'movies' }, { Id: 'c'.repeat(32), Name: 'Gemischt' }] })
      if (u.pathname === `/Users/${USER_ID}/Views`) return json(200, { Items: [{ Id: 'd'.repeat(32), Name: 'Hörbücher', CollectionType: 'books' }] })
      return json(404)
    })
  })
  return new Promise<{ address: string; seen: typeof seen; confirm: () => void; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ address: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, confirm: () => (confirmed = true), close: () => server.close() }),
    ),
  )
}

test('jellyfin address: scheme, port 8096 when none is typed, a proxy path kept, junk refused', () => {
  assert.equal(cleanAddress('192.168.1.20'), 'http://192.168.1.20:8096')
  assert.equal(cleanAddress(' Jellyfin.LOCAL '), 'http://jellyfin.local:8096')
  assert.equal(cleanAddress('http://nas:8920/'), 'http://nas:8920')
  assert.equal(cleanAddress('https://media.example/Jellyfin/'), 'https://media.example/Jellyfin')
  assert.equal(cleanAddress('http://nas:80'), 'http://nas')
  assert.equal(cleanAddress('http://media.home/jellyfin'), 'http://media.home/jellyfin')
  // (read again from the config: the same)
  for (const a of ['192.168.1.20', 'http://nas:80', 'https://media.example/Jellyfin/', 'nas:8920']) assert.equal(cleanAddress(cleanAddress(a)), cleanAddress(a), a)
  for (const bad of ['', 'ftp://nas', 'http://user:pw@nas', 'http://nas/?a=1', 'a b', 42]) assert.equal(cleanAddress(bad), null, String(bad))
})

test('jellyfin version: compared part by part', () => {
  assert.equal(versionAtLeast('12.4.0', '10.8.0'), true)
  assert.equal(versionAtLeast('10.10.3', '10.8.0'), true)
  assert.equal(versionAtLeast('10.8.0', '10.8.0'), true)
  assert.equal(versionAtLeast('10.7.7', '10.8.0'), false)
})

test('jellyfin authorization header: the box as a device, quotes and line breaks taken out', () => {
  assert.equal(authorization(DEVICE), `MediaBrowser Client="MuPiBox", Device="MuPiBox", DeviceId="${DEVICE.deviceId}", Version="5.1.0"`)
  assert.match(authorization({ ...DEVICE, deviceName: 'Box "Lena"\n' }, 'abc'), /Device="Box Lena", .*Token="abc"$/)
})

test('jellyfin settings: defaults on a box from before, broken values dropped, signed in only with token and user', () => {
  assert.deepEqual(jellyfinSettings(undefined), JELLYFIN_DEFAULTS)
  const s = jellyfinSettings({ jellyfin: { enabled: true, address: '10.0.0.5', token: 'enc', userId: USER_ID, serverId: 'x', libraries: ['a'.repeat(32), 'nope', 'a'.repeat(32)], transcode: 'yes', fingerprint: 'AB' } })
  assert.equal(s.address, 'http://10.0.0.5:8096')
  assert.equal(s.serverId, '')
  assert.equal(s.fingerprint, '')
  assert.equal(s.transcode, false)
  assert.deepEqual(s.libraries, ['a'.repeat(32)])
  assert.equal(signedIn(s), true)
  assert.equal(signedIn({ ...s, token: '' }), false)
})

test('jellyfin options: switches and libraries checked, a wrong field writes nothing', () => {
  const j: Record<string, unknown> = { enabled: false, token: 'keep' }
  assert.equal(applyJellyfinOptions(j, { enabled: true, shareProgress: true, libraries: ['b'.repeat(32)] }), null)
  assert.deepEqual(j, { enabled: true, token: 'keep', shareProgress: true, libraries: ['b'.repeat(32)] })
  const before = JSON.stringify(j)
  assert.match(String(applyJellyfinOptions(j, { transcode: 1 })), /transcode/)
  assert.match(String(applyJellyfinOptions(j, { token: 'x' })), /unknown field token/)
  assert.match(String(applyJellyfinOptions(j, { libraries: ['../etc'] })), /libraries/)
  assert.equal(JSON.stringify(j), before)
})

test('jellyfin discovery: broadcast address per network, answers parsed, a loopback address replaced by the sender', () => {
  const nets = { eth0: [{ family: 'IPv4', address: '192.168.1.37', netmask: '255.255.255.0', internal: false }], lo: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }] }
  assert.deepEqual(broadcastAddresses(nets as never), ['255.255.255.255', '192.168.1.255'])
  assert.deepEqual(parseAnswer(JSON.stringify({ Address: 'http://192.168.1.20:8096', Id: SERVER_ID, Name: 'NAS' })), { address: 'http://192.168.1.20:8096', id: SERVER_ID, name: 'NAS' })
  assert.equal(parseAnswer(JSON.stringify({ Address: 'http://127.0.0.1:8096', Id: SERVER_ID }), '192.168.1.20')?.address, 'http://192.168.1.20:8096')
  assert.equal(parseAnswer(JSON.stringify({ Address: 'http://172.17.0.2:8096', Id: SERVER_ID }), '192.168.1.20')?.address, 'http://192.168.1.20:8096')
  assert.equal(parseAnswer(JSON.stringify({ Address: 'https://jellyfin.home', Id: SERVER_ID }), '192.168.1.20')?.address, 'https://jellyfin.home')
  assert.equal(parseAnswer('{"Address":"x","Id":"1"}'), null)
  assert.equal(parseAnswer('not json'), null)
})

test('jellyfin client: public info, password login, libraries (and the older address), Emby and the unreachable refused', async () => {
  const jf = await fakeJellyfin()
  const server = { address: jf.address, fingerprint: '' }
  try {
    assert.deepEqual(await publicInfo(server, DEVICE), { id: SERVER_ID, name: 'Wohnzimmer', version: '12.4.0' })
    const login = await loginWithPassword(server, DEVICE, 'kind', 'geheim')
    assert.deepEqual(login, { token: 'tok-password', userId: USER_ID, userName: 'kind', serverId: SERVER_ID })
    assert.match(jf.seen.at(-1)?.auth ?? '', /^MediaBrowser Client="MuPiBox".*DeviceId="0b6f7e2c/)
    await assert.rejects(loginWithPassword(server, DEVICE, 'kind', 'falsch'), (e: unknown) => e instanceof JellyfinError && e.problem === 'unauthorized')
    const libs = await libraries({ ...server, ...DEVICE, token: login.token, userId: USER_ID })
    assert.deepEqual(libs.map((l) => `${l.name}:${l.type}`), ['Musik:music', 'Filme:movies', 'Gemischt:mixed'])
    assert.match(jf.seen.at(-1)?.auth ?? '', /Token="tok-password"/)
  } finally {
    jf.close()
  }
  const old = await fakeJellyfin({ oldViews: true })
  try {
    const libs = await libraries({ address: old.address, fingerprint: '', ...DEVICE, token: 't', userId: USER_ID })
    assert.deepEqual(libs.map((l) => l.type), ['books'])
  } finally {
    old.close()
  }
  const emby = await fakeJellyfin({ product: 'Emby Server' })
  try {
    await assert.rejects(publicInfo({ address: emby.address, fingerprint: '' }, DEVICE), (e: unknown) => e instanceof JellyfinError && e.problem === 'notJellyfin')
  } finally {
    emby.close()
  }
  await assert.rejects(publicInfo({ address: 'http://127.0.0.1:1', fingerprint: '' }, DEVICE), (e: unknown) => e instanceof JellyfinError && e.problem === 'unreachable')
})

test('jellyfin audiobooks: a folder of one book, several tagged books in one folder, numbered untagged parts, loose files', async () => {
  const id = (n: number) => n.toString(16).padStart(32, '0')
  const F1 = id(1)
  const F2 = id(2)
  const F3 = id(3)
  const F4 = id(4)
  const file = (n: number, parent: string, name: string, album = '') => ({ Id: id(100 + n), Type: 'AudioBook', Name: name, ParentId: parent, Album: album, AlbumArtist: 'Autorin' })
  const files = [
    // F1: one book in three files, tagged
    file(1, F1, 'Kapitel 1', 'Buch Eins'),
    file(2, F1, 'Kapitel 2', 'Buch Eins'),
    file(3, F1, 'Kapitel 3', 'Buch Eins'),
    // F2: two books in one folder, kept apart by their tags
    file(4, F2, 'A1', 'Buch A'),
    file(5, F2, 'A2', 'Buch A'),
    file(6, F2, 'B1', 'Buch B'),
    file(7, F2, 'B2', 'Buch B'),
    // F3: untagged, numbered parts - one book
    file(8, F3, '01 Anfang'),
    file(9, F3, '02 Mitte'),
    // F4: untagged single-file books of an author - each its own
    file(10, F4, 'Der Fuchs'),
    file(11, F4, 'Die Eule'),
  ]
  const folders = [
    { Id: F1, Type: 'Folder', Name: 'buch-eins' },
    { Id: F3, Type: 'Folder', Name: 'Ohne Tags' },
  ]
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    const ids = u.searchParams.get('Ids')
    const list = ids ? folders.filter((f) => ids.split(',').includes(f.Id)) : u.searchParams.get('IncludeItemTypes') === 'AudioBook' ? files : []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ Items: list, TotalRecordCount: list.length }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  try {
    const { books } = await import('./jellyfin/library')
    const s = { address: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fingerprint: '', ...DEVICE, token: 't', userId: USER_ID }
    const got = (await books(s)).map((b) => `${b.name}:${b.id === F1 || b.id === F3 ? 'folder' : 'file'}:${b.count}`)
    assert.deepEqual(got, ['Buch A:file:2', 'Buch B:file:2', 'Buch Eins:folder:3', 'Der Fuchs:file:1', 'Die Eule:file:1', 'Ohne Tags:folder:2'])
  } finally {
    server.close()
  }
})

test('jellyfin Quick Connect: code, waiting until confirmed, then the token; switched off and expired told apart', async () => {
  const jf = await fakeJellyfin()
  const server = { address: jf.address, fingerprint: '' }
  try {
    const { code, secret } = await quickConnectStart(server, DEVICE)
    assert.equal(code, '123456')
    assert.equal(await quickConnectConfirmed(server, DEVICE, secret), 'waiting')
    jf.confirm()
    assert.equal(await quickConnectConfirmed(server, DEVICE, secret), 'confirmed')
    assert.equal((await quickConnectLogin(server, DEVICE, secret)).token, 'tok-qc')
    assert.equal(await quickConnectConfirmed(server, DEVICE, 'other'), 'expired')
  } finally {
    jf.close()
  }
  const off = await fakeJellyfin({ quickConnect: false })
  try {
    await assert.rejects(quickConnectStart({ address: off.address, fingerprint: '' }, DEVICE), (e: unknown) => e instanceof JellyfinError && e.problem === 'quickConnectOff')
  } finally {
    off.close()
  }
})
