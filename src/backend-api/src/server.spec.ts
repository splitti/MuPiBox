import { describe, it } from 'node:test'

import { app } from './server'
import assert from 'node:assert'
import nock from 'nock'
import request from 'supertest'

describe('rss feeds', () => {
  it('should return an error if no url is provided', (_t, done) => {
    request(app).get('/api/rssfeed').expect(500, done)
  })

  it('should request a provided url and convert the xml response to json', (_t, done) => {
    nock('http://example.com')
      .get('/')
      .reply(200, '<?xml version="1.0" encoding="UTF-8"?><note><title>Test</title></note>')
    request(app)
      .get('/api/rssfeed?url=http://example.com')
      .end((_err, res) => {
        assert.equal(
          res.text,
          '{"_declaration":{"_attributes":{"version":"1.0","encoding":"UTF-8"}},"note":{"title":{"_text":"Test"}}}',
        )
        done()
      })
  })

  it('should handle error responses from the external urls', (_t, done) => {
    // We need to persist (i.e., expect more than one request) the nock endpoint since
    // ky repeats failed requests.
    nock('http://example.com').persist().get('/').replyWithError('Random error')
    request(app).get('/api/rssfeed?url=http://example.com').expect(500, done)
  })

  // TODO: Test folders endpoint
  // TODO: Test media endpoint.
})
