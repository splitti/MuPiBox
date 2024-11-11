import { describe, it } from 'node:test'

import { app } from './server'
import assert from 'node:assert'
import nock from 'nock'
import request from 'supertest'
import { response } from 'express'

describe('rss feeds', () => {
  it('should return an error if no url is provided', (_t, done) => {
    request(app).get('/api/rssfeed').expect(500, done)
  })

  it('should request a provided url', (_t, done) => {
    const scope = nock('http://example.com').get('/').reply(200, {
      status: 200,
      message: '<?xml version="1.0" encoding="UTF-8"?><test>This is a mocked response.</test>',
    })
    request(app)
      .get('/api/rssfeed?url=http://example.com')
      .end((_err, res) => {
        assert.equal(res.body.status, 200)
        assert.equal(res.body.message, '<test>This is a mocked response.</test>')
        done()
      })
  })
})
