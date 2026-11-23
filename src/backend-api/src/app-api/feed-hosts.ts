// Einstellungen › Dienste › Server im Heimnetz: the podcast servers of the home network the box may fetch feeds from
// (see ../lan-feeds.ts). The app asks before a feed of the home network is added, and lists them to take one off.

import type { Router } from 'express'
import { feedHostCheck, feedHostKey, feedHostsOf, MAX_FEED_HOSTS, neverFetched } from '../lan-feeds'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface FeedHostDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

export function registerFeedHostRoutes(router: Router, deps: FeedHostDeps): void {
  /** GET /api/app/feed-hosts - the allowed servers ["192.168.1.20:8040", …] */
  router.get('/feed-hosts', requireSession, (_req, res) => {
    res.json({ hosts: feedHostsOf(deps.getMupiboxConfig()) })
  })

  /** POST /api/app/feed-hosts/check {url} - {host, lan, allowed, never}: whether to ask before the feed is added */
  router.post('/feed-hosts/check', requireSession, requireCsrf, async (req, res) => {
    const url = (req.body as { url?: unknown } | undefined)?.url
    const check = typeof url === 'string' ? await feedHostCheck(url, feedHostsOf(deps.getMupiboxConfig())) : null
    if (!check) {
      res.status(400).json({ error: 'invalid_url' })
      return
    }
    res.json(check)
  })

  /** POST /api/app/feed-hosts {url, allow} - a feed's server allowed (true) or taken off the list (false) */
  router.post('/feed-hosts', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { url?: unknown; host?: unknown; allow?: unknown } | undefined) ?? {}
    let host = typeof body.host === 'string' ? body.host : ''
    if (typeof body.url === 'string') {
      try {
        const url = new URL(body.url)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme')
        if (neverFetched(url.hostname)) {
          res.status(400).json({ error: 'never_allowed' })
          return
        }
        host = feedHostKey(url)
      } catch {
        res.status(400).json({ error: 'invalid_url' })
        return
      }
    }
    if (!/^[^\s/?#@]+:\d{1,5}$/.test(host)) {
      res.status(400).json({ error: 'invalid_host' })
      return
    }
    const allow = body.allow !== false
    if (allow && neverFetched(host.replace(/:\d+$/, ''))) {
      res.status(400).json({ error: 'never_allowed' })
      return
    }
    let full = false
    await deps.updateMupiboxConfig((cfg) => {
      const list = feedHostsOf(cfg).filter((h) => h !== host)
      if (allow && list.length >= MAX_FEED_HOSTS) {
        full = true
        return
      }
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), feedHosts: allow ? [...list, host] : list }
    })
    if (full) {
      res.status(400).json({ error: 'too_many' })
      return
    }
    res.json({ hosts: feedHostsOf(deps.getMupiboxConfig()) })
  })
}
