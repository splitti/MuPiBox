import assert from 'node:assert'
import dns from 'node:dns'
import { after, before, describe, it } from 'node:test'
import nock from 'nock'
import request from 'supertest'
import { app } from './server'

describe('rss feeds', () => {
  // A feed is fetched only after its name was looked up and found to be no address in the home network (fetchRemote):
  // the test's example.com gets an address on the internet without asking the real DNS, and nothing leaves this
  // machine - nock answers in its place (before, the test fetched the real example.com, an HTML page, and failed)
  const lookup = dns.promises.lookup
  before(() => {
    nock.disableNetConnect()
    nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/)
    dns.promises.lookup = (async (hostname: string, options?: unknown) => {
      if (hostname === 'example.com') return [{ address: '93.184.215.14', family: 4 }]
      return (lookup as (h: string, o?: unknown) => Promise<unknown>)(hostname, options)
    }) as typeof dns.promises.lookup
  })
  after(() => {
    dns.promises.lookup = lookup
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it('should return an error if no url is provided', (_t, done) => {
    request(app).get('/api/rssfeed').expect(500, done)
  })

  it('should request a provided url and convert the xml response to json', (_t, done) => {
    nock('http://example.com')
      .get('/')
      .reply(200, '<?xml version="1.0" encoding="UTF-8"?><note><title>Test</title></note>', { 'Content-Type': 'application/rss+xml' })
    request(app)
      .get('/api/rssfeed?url=http://example.com')
      .end((err, res) => {
        try {
          assert.ifError(err)
          assert.equal(res.text, '{"_declaration":{"_attributes":{"version":"1.0","encoding":"UTF-8"}},"note":{"title":{"_text":"Test"}}}')
          done()
        } catch (error) {
          done(error)
        }
      })
  })

  it('should handle error responses from the external urls', (_t, done) => {
    nock('http://example.com').persist().get('/').replyWithError('Random error')
    request(app).get('/api/rssfeed?url=http://example.com').expect(500, done)
  })
})

describe('the size of a JSON body', () => {
  // (100 kB, the default, for every route of the server - also those reached without a login; the extensions' routes under
  // /api/ext/ read their bodies themselves, up to 1 MB only behind the session)
  const big = JSON.stringify({ text: 'x'.repeat(200 * 1024) })

  // (the parser's 413 ends in the central error handler of the server, as a 500)
  it('refuses more than the default before any route', async () => {
    const small = await request(app).post('/api/no-such-route').set('Content-Type', 'application/json').send({ text: 'x' })
    assert.notEqual(small.status, 500)
    const large = await request(app).post('/api/no-such-route').set('Content-Type', 'application/json').send(big)
    assert.equal(large.status, 500)
  })

  it('leaves the routes of the extensions to them', (_t, done) => {
    request(app)
      .post('/api/ext/no-such-extension/x')
      .set('Content-Type', 'application/json')
      .send(big)
      .end((err, res) => {
        try {
          assert.ifError(err)
          assert.notEqual(res.status, 413)
          done()
        } catch (error) {
          done(error)
        }
      })
  })
})
