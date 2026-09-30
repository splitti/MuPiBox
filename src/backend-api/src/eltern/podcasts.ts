// ARD Sounds in the app (search, the children's shows, a show with its newest episodes) and the podcast episodes kept
// on the SD card (see ../ard-sounds.ts and ../podcast-offline.ts).
//
// A show is added as a podcast through /api/add ({type: 'rss', id: 'ard:<id>'}), like a feed from "Link einfügen".
// How many episodes of a podcast stay on the card is its library entry's field "offline" (changed with /api/edit);
// /podcast-offline/sync then brings the files in line at once instead of at the next hourly run.

import { promises as fsp } from 'node:fs'
import type { RequestHandler, Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { ardKidsShows, ardSearch, ardShow, ardShowIdFromUrl, type ArdShow } from '../ard-sounds'
import { MAX_KEEP, type PodcastOffline } from '../podcast-offline'
import { requireCsrf, requireSession } from './middleware'

export interface PodcastRouteDeps {
  activeDataPath: string
  podcastOffline?: PodcastOffline
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

// ARD Sounds can be switched off (Dienste; mupibox.ardSounds, on unless false) - e.g. a box abroad, for which German
// children's plays are no use: then it is not offered for adding. Shows added before stay in the library and play.
export const ardSoundsOn = (cfg: MupiboxConfig | undefined) => (cfg?.mupibox as Record<string, unknown> | undefined)?.ardSounds !== false

const KIDS_TTL_MS = 60 * 60 * 1000
let kidsCache: { at: number; shows: ArdShow[] } | null = null

export function registerPodcastRoutes(router: Router, deps: PodcastRouteDeps): void {
  const ardOn: RequestHandler = (_req, res, next) => {
    if (ardSoundsOn(deps.getMupiboxConfig())) return next()
    res.status(403).json({ error: 'ard_disabled' })
  }

  /** GET /api/app/ard/enabled - whether ARD Sounds is offered; POST {enabled} switches it */
  router.get('/ard/enabled', requireSession, (_req, res) => {
    res.json({ enabled: ardSoundsOn(deps.getMupiboxConfig()) })
  })
  router.post('/ard/enabled', requireSession, requireCsrf, async (req, res) => {
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be true or false' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), ardSounds: enabled }
    })
    res.json({ enabled })
  })

  /** GET /api/app/ard/search?q=…&kids=1 - shows of ARD Sounds for a search term (kids=1: for children only) */
  router.get('/ard/search', requireSession, ardOn, async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2 || q.length > 100) {
      res.status(400).json({ error: 'invalid_query' })
      return
    }
    try {
      res.json({ shows: await ardSearch(q, req.query.kids === '1') })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ARD search: ${error}`)
      res.status(502).json({ error: 'ard_unavailable' })
    }
  })

  /** GET /api/app/ard/kids - the ARD's children's shows (kept for an hour) */
  router.get('/ard/kids', requireSession, ardOn, async (_req, res) => {
    try {
      if (!kidsCache || Date.now() - kidsCache.at > KIDS_TTL_MS) kidsCache = { at: Date.now(), shows: await ardKidsShows() }
      res.json({ shows: kidsCache.shows })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ARD children's shows: ${error}`)
      res.status(502).json({ error: 'ard_unavailable' })
    }
  })

  /** GET /api/app/ard/show?id=… - a show and its 10 newest episodes (for the details before adding it) */
  router.get('/ard/show', requireSession, ardOn, async (req, res) => {
    try {
      const found = await ardShow(String(req.query.id ?? ''), 10)
      if (!found) {
        res.status(404).json({ error: 'show_not_found' })
        return
      }
      res.json(found)
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] ARD show: ${error}`)
      res.status(502).json({ error: 'ard_unavailable' })
    }
  })

  /** POST /api/app/ard/resolve {url} - the show id behind a link to it on ardsounds.de / ardaudiothek.de */
  router.post('/ard/resolve', requireSession, requireCsrf, ardOn, async (req, res) => {
    const url = String((req.body as { url?: unknown } | undefined)?.url ?? '')
    try {
      const id = url.length < 500 ? await ardShowIdFromUrl(url) : null
      if (!id) {
        res.status(404).json({ error: 'show_not_found' })
        return
      }
      res.json({ id })
    } catch {
      res.status(502).json({ error: 'ard_unavailable' })
    }
  })

  // The podcast of the library with this feed (its entry's id), or null - nothing else is downloaded
  const podcastAt = async (feed: unknown): Promise<{ feed: string; keep: number } | null> => {
    if (typeof feed !== 'string' || !feed) return null
    try {
      const library = JSON.parse(await fsp.readFile(deps.activeDataPath, 'utf8')) as Record<string, unknown>[]
      const item = library.find((e) => e?.type === 'rss' && e.id === feed)
      if (!item) return null
      return { feed, keep: Math.max(0, Math.min(MAX_KEEP, Number(item.offline) || 0)) }
    } catch {
      return null
    }
  }

  /**
   * GET /api/app/podcast-offline?feed=… - what of this podcast is on the SD card (files by episode address, queue,
   * the running download); without index: everything, for the overview
   */
  router.get('/podcast-offline', requireSession, async (req, res) => {
    const offline = deps.podcastOffline
    if (!offline) {
      res.status(503).json({ error: 'unavailable' })
      return
    }
    if (req.query.feed === undefined) {
      res.json(await offline.status())
      return
    }
    const podcast = await podcastAt(req.query.feed)
    if (!podcast) {
      res.status(404).json({ error: 'item_not_found' })
      return
    }
    res.json({ ...(await offline.status(podcast.feed)), keep: podcast.keep })
  })

  /** POST /api/app/podcast-offline/episode {feed, url, keep} - keeps one episode on the card (true) or deletes it */
  router.post('/podcast-offline/episode', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { feed?: unknown; url?: unknown; keep?: unknown } | undefined) ?? {}
    const offline = deps.podcastOffline
    const podcast = await podcastAt(body.feed)
    if (!offline || !podcast || typeof body.url !== 'string') {
      res.status(400).json({ error: 'invalid_request' })
      return
    }
    if (body.keep === true) {
      // (only an episode of this podcast: the box downloads nothing else)
      const episodes = await offline.episodes(podcast.feed)
      const episode = episodes?.find((e) => e.url === body.url)
      if (!episode) {
        res.status(404).json({ error: 'episode_not_found' })
        return
      }
      await offline.add(episode.url, podcast.feed, episode.title, true)
    } else {
      await offline.remove(body.url)
    }
    res.json(await offline.status(podcast.feed))
  })

  /**
   * POST /api/app/podcast-offline/sync {feed} - brings the podcast's files in line with its setting now (without
   * feed: every podcast, e.g. right after one was added)
   */
  router.post('/podcast-offline/sync', requireSession, requireCsrf, async (req, res) => {
    const offline = deps.podcastOffline
    const feed = (req.body as { feed?: unknown } | undefined)?.feed
    if (offline && feed === undefined) {
      void offline.syncAll().catch(() => undefined)
      res.json({ ok: true })
      return
    }
    const podcast = await podcastAt(feed)
    if (!offline || !podcast) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }
    await offline.syncFeed(podcast.feed, podcast.keep)
    res.json({ ...(await offline.status(podcast.feed)), keep: podcast.keep })
  })
}
