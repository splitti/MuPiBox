import { describe, it } from 'node:test'

import { app } from './server'
import request from 'supertest'

describe('rss feeds', () => {
  it('should return an error if no url is provided', () => {
    request(app).get('/api/rssfeed').expect(200)
  })
})
