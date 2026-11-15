import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { NasAccess } from './nas/access'
import { NasApiError, type NasProvider, NasSessionExpiredError } from './nas/provider'
import { nasResolveBase, parsePropfind, WebDavProvider, webdavLogin } from './nas/webdav'

// A small WebDAV NAS: /Musik/Hörspiele with two files, a cover, system entries; account "box" / "pw"
const FILE = Buffer.from('0123456789abcdefghij')
const AUTH = `Basic ${Buffer.from('box:pw').toString('base64')}`

function propfind(href: string, children: Array<{ href: string; dir?: boolean; size?: number; etag?: string }>) {
  const one = (h: string, dir?: boolean, size?: number, etag?: string) =>
    `<d:response><d:href>${h}</d:href><d:propstat><d:prop>${dir ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'}${size !== undefined ? `<d:getcontentlength>${size}</d:getcontentlength>` : ''}${etag ? `<d:getetag>${etag}</d:getetag>` : ''}</d:prop></d:propstat></d:response>`
  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${one(href, true)}${children.map((c) => one(c.href, c.dir, c.size, c.etag)).join('')}</d:multistatus>`
}

async function withNas(fn: (base: string, calls: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders }>) => Promise<void>) {
  const calls: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders }> = []
  const files = new Map<string, Buffer>([['/dav/Musik/H%C3%B6rspiele/cover.jpg', Buffer.from('old')]])
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers })
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (req.headers.authorization !== AUTH) return void res.writeHead(401).end()
      const url = req.url ?? ''
      if (req.method === 'PROPFIND') {
        if (url === '/dav/' || url === '/dav') {
          return void res.writeHead(207, { 'Content-Type': 'application/xml' }).end(propfind('/dav/', [{ href: '/dav/Musik/', dir: true }]))
        }
        if (url === '/dav/Musik/H%C3%B6rspiele/') {
          return void res.writeHead(207).end(
            req.headers.depth === '0'
              ? propfind('/dav/Musik/H%C3%B6rspiele/', [])
              : propfind('/dav/Musik/H%C3%B6rspiele/', [
                  { href: '/dav/Musik/H%C3%B6rspiele/Folge%201.mp3', size: FILE.length, etag: '"e1"' },
                  { href: '/dav/Musik/H%C3%B6rspiele/cover.jpg', size: 3 },
                  { href: '/dav/Musik/H%C3%B6rspiele/Teil%202/', dir: true },
                  { href: '/dav/Musik/H%C3%B6rspiele/@eaDir/', dir: true },
                  { href: '/dav/Musik/H%C3%B6rspiele/._Folge%201.mp3', size: 4 },
                ]),
          )
        }
        if (url === '/dav/Privat/') return void res.writeHead(403).end()
        return void res.writeHead(404).end()
      }
      if (req.method === 'GET' && url === '/dav/Musik/H%C3%B6rspiele/Folge%201.mp3') {
        const m = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
        if (m) {
          const start = Number(m[1])
          const end = m[2] ? Number(m[2]) : FILE.length - 1
          return void res
            .writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${FILE.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' })
            .end(FILE.subarray(start, end + 1))
        }
        return void res.writeHead(200, { 'Content-Length': FILE.length, 'Content-Type': 'audio/mpeg' }).end(FILE)
      }
      if (req.method === 'PUT') {
        if (url.startsWith('/dav/Readonly/')) return void res.writeHead(403).end()
        if (req.headers.overwrite === 'F' && files.has(url)) return void res.writeHead(412).end()
        files.set(url, Buffer.concat(chunks))
        return void res.writeHead(201).end()
      }
      if (req.method === 'MOVE') {
        const to = new URL(String(req.headers.destination)).pathname
        const data = files.get(url)
        if (!data) return void res.writeHead(404).end()
        files.delete(url)
        files.set(to, data)
        return void res.writeHead(201).end()
      }
      if (req.method === 'DELETE') return void res.writeHead(files.delete(url) ? 204 : 404).end()
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/dav`, calls)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

test('NAS WebDAV: address field to a base URL', () => {
  assert.equal(nasResolveBase('nas:5005', false), 'http://nas:5005')
  assert.equal(nasResolveBase(' nas:5006/dav/ ', true), 'https://nas:5006/dav')
  assert.equal(nasResolveBase('http://10.0.0.2:5005', true), 'http://10.0.0.2:5005')
})

test('NAS WebDAV: a listing - umlauts decoded, the folder itself and system entries left out, size and version', () => {
  const xml = propfind('/dav/A%20%C3%A4/', [
    { href: '/dav/A%20%C3%A4/x.mp3', size: 7, etag: '&quot;v1&quot;' },
    { href: 'http://nas/dav/A%20%C3%A4/Sub/', dir: true },
    { href: '/dav/A%20%C3%A4/.DS_Store' },
    { href: '/dav/A%20%C3%A4/#recycle/', dir: true },
  ])
  assert.deepEqual(parsePropfind(xml, 'http://nas/dav', '/A ä'), [
    { name: 'x.mp3', path: '/A ä/x.mp3', isdir: false, additional: { size: 7 }, version: '"v1"' },
    { name: 'Sub', path: '/A ä/Sub', isdir: true, additional: undefined, version: undefined },
  ])
})

test('NAS WebDAV: login - right, wrong password, no WebDAV there, not reachable', async () => {
  await withNas(async (base) => {
    const ok = await webdavLogin(base, 'box', 'pw')
    assert.equal(ok.success, true)
    assert.equal(ok.provider?.kind, 'webdav')
    const wrong = await webdavLogin(base, 'box', 'nope')
    assert.equal(wrong.success, false)
    assert.match(wrong.error ?? '', /password/)
    assert.equal(wrong.unreachable, undefined)
    const elsewhere = await webdavLogin(`${base}/nothing`, 'box', 'pw')
    assert.equal(elsewhere.success, false)
  })
  const away = await webdavLogin('http://127.0.0.1:9', 'box', 'pw', 2000)
  assert.equal(away.success, false)
  assert.equal(away.unreachable, true)
})

test('NAS WebDAV provider: list, folder exists, read whole and a range, errors as the layer above expects', async () => {
  await withNas(async (base, calls) => {
    const nas: NasProvider = new WebDavProvider(base, 'box', 'pw')
    const list = await nas.list('/Musik/Hörspiele')
    assert.deepEqual(
      list.map((f) => [f.name, f.path, f.isdir, f.additional?.size, f.version]),
      [
        ['Folge 1.mp3', '/Musik/Hörspiele/Folge 1.mp3', false, 20, '"e1"'],
        ['cover.jpg', '/Musik/Hörspiele/cover.jpg', false, 3, undefined],
        ['Teil 2', '/Musik/Hörspiele/Teil 2', true, undefined, undefined],
      ],
    )
    assert.equal(calls.at(-1)?.headers.depth, '1')
    assert.equal(await nas.folderExists('/Musik/Hörspiele'), true)
    assert.equal(await nas.folderExists('/Musik/Weg'), false)
    await assert.rejects(nas.list('/Privat'), NasApiError)
    await assert.rejects(new WebDavProvider(base, 'box', 'old').list('/Musik/Hörspiele'), NasSessionExpiredError)

    const whole = await nas.read('/Musik/Hörspiele/Folge 1.mp3')
    assert.equal(whole.status, 200)
    assert.equal(whole.headers.get('content-length'), '20')
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), FILE)
    const part = await nas.read('/Musik/Hörspiele/Folge 1.mp3', { range: 'bytes=5-9' })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), 'bytes 5-9/20')
    assert.equal(Buffer.from(await part.arrayBuffer()).toString(), '56789')
    assert.equal((await nas.read('/Musik/Hörspiele/fehlt.mp3')).status, 404)
  })
})

test('NAS WebDAV provider: write (kept without overwrite), move, remove, denied', async () => {
  await withNas(async (base, calls) => {
    const nas = new WebDavProvider(base, 'box', 'pw')
    assert.equal(await nas.write('/Musik/Hörspiele/cover.jpg', Buffer.from('new'), { contentType: 'image/jpeg', overwrite: false }), 'exists')
    assert.equal(await nas.move('/Musik/Hörspiele/cover.jpg', '/Musik/Hörspiele/cover-previous.jpg', { overwrite: true }), 'ok')
    const move = calls.at(-1)
    assert.equal(move?.headers.destination, `${base}/Musik/H%C3%B6rspiele/cover-previous.jpg`)
    assert.equal(move?.headers.overwrite, 'T')
    assert.equal(await nas.write('/Musik/Hörspiele/cover.jpg', Buffer.from('new'), { contentType: 'image/jpeg', overwrite: false }), 'ok')
    assert.equal(calls.at(-1)?.headers['content-type'], 'image/jpeg')
    assert.equal(await nas.remove('/Musik/Hörspiele/cover-previous.jpg'), 'ok')
    assert.equal(await nas.remove('/Musik/Hörspiele/cover-previous.jpg'), 'failed')
    assert.equal(await nas.write('/Readonly/cover.jpg', Buffer.from('x'), { contentType: 'image/jpeg', overwrite: true }), 'denied')
  })
})

test('NAS access: one login for requests at the same time, away after no answer, a refused login once more', async () => {
  const provider = (n: number) => ({ kind: 'webdav', n }) as unknown as NasProvider
  let connects = 0
  let answer: () => { provider?: NasProvider; unreachable?: boolean } = () => ({ provider: provider(++connects) })
  const access = new NasAccess(async () => {
    await new Promise((r) => setTimeout(r, 10))
    return answer()
  }, 50)
  const [a, b] = await Promise.all([access.active(), access.active()])
  assert.equal(connects, 1)
  assert.equal(a, b)
  assert.equal(access.signedIn, a)
  assert.equal(access.last, a)

  // the login no longer accepted: signed in again, fn runs once more with the new provider
  const seen: NasProvider[] = []
  const result = await access.withSession(async (p) => {
    seen.push(p)
    if (seen.length === 1) throw new NasSessionExpiredError('401')
    return 'listed'
  })
  assert.equal(result, 'listed')
  assert.equal(connects, 2)
  assert.notEqual(seen[0], seen[1])

  // away: no login tried until the time is over, the last provider stays for a playing stream
  access.markAway()
  assert.equal(access.isAway(), true)
  assert.equal(access.signedIn, undefined)
  assert.equal(await access.active(), undefined)
  assert.equal(connects, 2)
  assert.equal(access.last, seen[1])
  await new Promise((r) => setTimeout(r, 60))
  answer = () => ({ unreachable: true })
  assert.equal(await access.active(), undefined)
  assert.equal(access.isAway(), true, 'a NAS that does not answer the login is away again')

  // a login in the app: there at once; signed off: nothing left
  const manual = provider(99)
  access.use(manual)
  assert.equal(access.isAway(), false)
  assert.equal(await access.active(), manual)
  access.clear()
  assert.equal(access.signedIn, undefined)
  assert.equal(access.last, undefined)

  // an error that is no refused login is passed on as it is
  access.use(manual)
  await assert.rejects(
    access.withSession(async () => {
      throw new NasApiError('gone')
    }),
    NasApiError,
  )
})

test('NAS access: a sign-in under way does not undo a login in the app or a sign-off', async () => {
  const provider = (n: number) => ({ kind: 'smb', n }) as unknown as NasProvider
  let release: () => void = () => undefined
  const access = new NasAccess(async () => {
    await new Promise<void>((r) => (release = r))
    return { provider: provider(1) }
  }, 50)
  const pending = access.active()
  await new Promise((r) => setTimeout(r, 5))
  const manual = provider(2)
  access.use(manual)
  release()
  assert.equal(await pending, manual)
  assert.equal(access.signedIn, manual)

  const again = (async () => {
    access.clear()
    return access.active()
  })()
  await new Promise((r) => setTimeout(r, 5))
  access.clear() // signed off while it signs in
  release()
  assert.equal(await again, undefined)
  assert.equal(access.signedIn, undefined)
})

test('NAS access: the login made in the app is used again after the NAS was away, not the remembered one', async () => {
  const provider = (n: number) => ({ kind: 'webdav', n }) as unknown as NasProvider
  let connects = 0
  const access = new NasAccess(async () => ({ provider: provider(100 + ++connects) }), 20)
  const app = provider(1)
  access.use(app, { protocol: 'smb', address: 'nas', https: false, share: 'Musik', domain: '', account: 'box' })
  assert.equal(access.appLogin?.share, 'Musik')
  access.markAway()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(await access.active(), app)
  assert.equal(connects, 0)
  // signed off: the remembered login again
  access.clear()
  assert.equal(access.appLogin, undefined)
  assert.notEqual(await access.active(), app)
  assert.equal(connects, 1)
})
