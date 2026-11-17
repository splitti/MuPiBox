import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { AudibleError, apiJson, check, codeOf, deregister, hosts, loginStart, MARKETS, register, type AudibleSession } from './audible/client'
import { AUDIBLE_DEFAULTS, applyAudibleOptions, audibleSession, audibleSettings, credentialsOf, signedIn } from './audible/settings'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

// A small Amazon/Audible: registration, access token, removing the device, and the library behind a signature check
const seen: { method: string; url: string; body: string; headers: http.IncomingHttpHeaders }[] = []
let mode: { register?: 'ok' | 'refuse'; library?: 'ok' | 'unauthorized' | 'ratelimit'; token?: 'ok' | 'refuse' | 'changed' } = {}
let base = ''
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', body, headers: req.headers })
    const json = (status: number, v?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
      res.end(v === undefined ? '' : JSON.stringify(v))
    }
    const u = new URL(req.url ?? '/', 'http://x')
    if (u.pathname === '/amazon/auth/register') {
      const b = JSON.parse(body)
      if (mode.register === 'refuse' || b.auth_data.authorization_code !== 'GOODCODE123456') return json(400, { response: { error: { code: 'InvalidValue' } } })
      return json(200, {
        response: {
          success: {
            tokens: { mac_dms: { adp_token: '{enc:abc}{key:def}', device_private_key: privateKey }, bearer: { access_token: 'Atna|x', refresh_token: 'Atnr|y', expires_in: '3600' } },
            extensions: { device_info: { device_name: "Anna's Audible for iPhone" }, customer_info: { given_name: 'Anna' } },
          },
        },
      })
    }
    if (u.pathname === '/amazon/auth/token') {
      const q = new URLSearchParams(body)
      if (mode.token === 'changed') return json(400, { error: 'invalid_request' })
      if (mode.token === 'refuse' || q.get('source_token') !== 'Atnr|y') return json(400, { error: 'invalid_grant' })
      return json(200, { access_token: 'Atna|fresh', expires_in: 3600 })
    }
    if (u.pathname === '/amazon/auth/deregister') return req.headers.authorization === 'Bearer Atna|fresh' ? json(200, { response: { success: {} } }) : json(401)
    if (u.pathname.startsWith('/audible/1.0/')) {
      // the signature: the device key over method, path with query, time, body and token
      // (the time has colons itself: the signature ends at the first one)
      const head = String(req.headers['x-adp-signature'] ?? '')
      const sig = head.slice(0, head.indexOf(':'))
      const date = head.slice(head.indexOf(':') + 1)
      const data = `${req.method}\n${u.pathname}${u.search}\n${date}\n${body}\n${req.headers['x-adp-token']}`
      const valid = !!sig && verify('sha256', Buffer.from(data), publicKey, Buffer.from(sig, 'base64'))
      if (!valid || mode.library === 'unauthorized') return json(403, { message: 'Forbidden' })
      if (mode.library === 'ratelimit') return json(429, { message: 'slow down' }, { 'Retry-After': '30' })
      if (u.pathname === '/audible/1.0/library') return json(200, { items: [{ asin: 'B000000001', title: 'Test' }] })
      if (u.pathname === '/audible/1.0/lastpositions/B000000001' && req.method === 'PUT') return json(204)
      return json(404)
    }
    json(404)
  })
})

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  hosts.signin = () => `${base}/signin`
  hosts.amazon = () => `${base}/amazon`
  hosts.audible = () => `${base}/audible`
})
after(() => server.close())

const session = (): AudibleSession => ({ country: 'de', credentials: { adpToken: '{enc:abc}{key:def}', privateKey, refreshToken: 'Atnr|y' } })

test('audible: the sign-in page carries a PKCE challenge of the verifier kept and the device of this box', () => {
  const s = loginStart('de')
  const q = new URL(s.url).searchParams
  assert.equal(q.get('openid.oa2.code_challenge'), createHash('sha256').update(s.verifier).digest('base64url'))
  assert.equal(q.get('openid.oa2.code_challenge_method'), 'S256')
  assert.equal(q.get('marketPlaceId'), MARKETS.de.marketplace)
  assert.match(s.serial, /^[0-9A-F]{32}$/)
  assert.equal(q.get('openid.oa2.client_id'), `device:${Buffer.from(`${s.serial}#A2CZJZGLK2JJVM`).toString('hex')}`)
  assert.equal(q.get('openid.return_to'), `${base}/signin/ap/maplanding`)
  // (two sign-ins: never the same secret)
  assert.notEqual(loginStart('de').verifier, s.verifier)
})

test('audible: the code from the landing address, also behind the passkey page, or alone', () => {
  const landing = 'https://www.amazon.de/ap/maplanding?openid.mode=id_res&openid.oa2.authorization_code=ABCdef123456&openid.ns.oa2=x'
  assert.equal(codeOf(landing), 'ABCdef123456')
  assert.equal(codeOf(`  ${landing}\n`), 'ABCdef123456')
  const nudge = `https://www.amazon.de/ax/claim/webauthn/nudge?openid.assoc_handle=a&openid.return_to=${encodeURIComponent(landing)}&pageId=amzn_audible_ios`
  assert.equal(codeOf(nudge), 'ABCdef123456')
  assert.equal(codeOf('ABCdef123456'), 'ABCdef123456')
  // (a phone's share text: the page title before the address)
  assert.equal(codeOf(`Amazon Anmelden ${landing}`), 'ABCdef123456')
  assert.equal(codeOf('https://www.amazon.de/ap/signin?openid.mode=checkid_setup'), null)
  assert.equal(codeOf('hallo'), null)
  assert.equal(codeOf(42), null)
  assert.equal(codeOf('https://www.amazon.de/ap/maplanding?openid.oa2.authorization_code=%3Cscript%3E'), null)
})

test('audible: registering keeps the key and tokens; a refused code gives "refused"', async () => {
  const s = loginStart('de')
  const reg = await register(s, 'GOODCODE123456')
  assert.equal(reg.adpToken, '{enc:abc}{key:def}')
  assert.equal(reg.refreshToken, 'Atnr|y')
  assert.equal(reg.customerName, 'Anna')
  assert.equal(reg.deviceName, "Anna's Audible for iPhone")
  const sent = JSON.parse(seen.findLast((x) => x.url === '/amazon/auth/register')!.body)
  assert.equal(sent.auth_data.code_verifier, s.verifier)
  assert.equal(sent.registration_data.device_serial, s.serial)
  await assert.rejects(register(s, 'OLDCODE1234567'), (e: unknown) => e instanceof AudibleError && e.problem === 'refused')
})

test('audible: requests are signed with the device key; 403 is "unauthorized", 429 carries the pause', async () => {
  mode = {}
  const lib = await apiJson(session(), 'GET', 'library', { query: { num_results: 1, response_groups: 'product_desc' } })
  assert.equal(lib.items[0].asin, 'B000000001')
  await check(session())
  // (a body is signed too)
  assert.equal(await apiJson(session(), 'PUT', 'lastpositions/B000000001', { json: { asin: 'B000000001', position_ms: 1000 } }), null)
  // (another key: Audible refuses the signature)
  const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  await assert.rejects(check({ country: 'de', credentials: { ...session().credentials, privateKey: other.privateKey } }), (e: unknown) => e instanceof AudibleError && e.problem === 'unauthorized')
  // (a key that does not load at all)
  await assert.rejects(check({ country: 'de', credentials: { ...session().credentials, privateKey: 'kaputt' } }), (e: unknown) => e instanceof AudibleError && e.problem === 'unauthorized')
  mode = { library: 'ratelimit' }
  await assert.rejects(check(session()), (e: unknown) => e instanceof AudibleError && e.problem === 'rateLimited' && e.retryAfter === 30)
  mode = {}
})

test('audible: no answer is "unreachable"', async () => {
  const was = hosts.audible
  hosts.audible = () => 'http://127.0.0.1:9'
  await assert.rejects(check(session()), (e: unknown) => e instanceof AudibleError && e.problem === 'unreachable')
  hosts.audible = was
})

test('audible: signing out removes only this device; a device gone already counts as removed', async () => {
  mode = {}
  assert.equal(await deregister(session()), true)
  const d = seen.findLast((x) => x.url === '/amazon/auth/deregister')!
  assert.deepEqual(JSON.parse(d.body), { deregister_all_existing_accounts: false })
  mode = { token: 'refuse' }
  assert.equal(await deregister(session()), true)
  // (any other refusal is not "gone": the device may still be in the account)
  mode = { token: 'changed' }
  assert.equal(await deregister(session()), false)
  mode = {}
  const was = hosts.amazon
  hosts.amazon = () => 'http://127.0.0.1:9'
  assert.equal(await deregister(session()), false)
  hosts.amazon = was
})

test('audible: settings with defaults, broken values left out, the key read back only when it decrypts', () => {
  assert.deepEqual(audibleSettings(undefined), AUDIBLE_DEFAULTS)
  assert.deepEqual(audibleSettings({ audible: 'x' }), AUDIBLE_DEFAULTS)
  const s = audibleSettings({ audible: { enabled: 'yes', country: 'xx', serial: 'abc', deviceName: 'a\nb', credentials: 'enc', shareProgress: true } })
  assert.equal(s.enabled, false)
  assert.equal(s.country, 'de')
  assert.equal(s.serial, '')
  assert.equal(s.deviceName, '')
  assert.equal(s.shareProgress, true)
  assert.equal(signedIn(s), false)
  const creds = JSON.stringify(session().credentials)
  const cfg = { audible: { enabled: true, country: 'uk', serial: 'A'.repeat(32), secret: `enc:${creds}` } }
  const decrypt = (x: string) => (x.startsWith('enc:') ? x.slice(4) : undefined)
  assert.equal(signedIn(audibleSettings(cfg)), true)
  assert.equal(audibleSession(cfg, decrypt)?.country, 'uk')
  assert.equal(audibleSession(cfg, decrypt)?.credentials.refreshToken, 'Atnr|y')
  // (a backup of another box: the key does not decrypt here)
  assert.equal(audibleSession(cfg, () => undefined), null)
  assert.equal(credentialsOf(audibleSettings({ audible: { ...cfg.audible, secret: 'enc:{"adpToken":"x"}' } }), decrypt), null)
})

test('audible: the app changes only the switches', () => {
  const t: Record<string, unknown> = { country: 'de' }
  assert.equal(applyAudibleOptions(t, { enabled: true, shareProgress: false }), null)
  assert.deepEqual(t, { country: 'de', enabled: true, shareProgress: false })
  assert.match(applyAudibleOptions(t, { country: 'us' }) ?? '', /unknown field/)
  assert.match(applyAudibleOptions(t, { enabled: 'ja' }) ?? '', /true or false/)
  assert.equal(applyAudibleOptions(t, null), 'no settings')
  assert.equal(t.country, 'de')
})
