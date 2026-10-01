// Finding podcasts in the app - one search for every provider: Apple's podcast directory (the shows of most
// broadcasters, as RSS feeds) and, for German, the ARD Audiothek (many of its children's plays have no feed) - and
// the podcast episodes kept on the SD card (see ../podcast-search.ts, ../ard-sounds.ts, ../podcast-offline.ts).
//
// A show is added as a podcast through /api/add ({type: 'rss', id: <feed> or 'ard:<id>'}), like a feed from "Link
// einfügen". How many episodes of a podcast stay on the card is its library entry's field "offline" (changed with
// /api/edit); /podcast-offline/sync then brings the files in line at once instead of at the next hourly run.

import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { ardKidsShows, ardSearch, ardShowIdFromUrl, type ArdShow } from '../ard-sounds'
import { isEpisodePick } from '../episode-pick'
import { MAX_KEEP, mayKeep, type PodcastOffline } from '../podcast-offline'
import { CONTENT_LANGUAGES, mergeHits, type PodcastHit, searchPodcasts, topKidsPodcasts } from '../podcast-search'
import { kidsRadio, radioLanguageKnown, searchRadio } from '../radio-search'
import { requireCsrf, requireSession } from './middleware'

export interface PodcastRouteDeps {
  activeDataPath: string
  podcastOffline?: PodcastOffline
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const mupiboxOf = (cfg: MupiboxConfig | undefined) => (cfg?.mupibox as Record<string, unknown> | undefined) ?? {}
// The podcast search and the radio station search, on unless switched off (Dienste)
export const podcastSearchOn = (cfg: MupiboxConfig | undefined) => mupiboxOf(cfg).podcastSearch !== false
export const radioSearchOn = (cfg: MupiboxConfig | undefined) => mupiboxOf(cfg).radioSearch !== false

// A show of the ARD Audiothek as a hit of the search (its "feed" is ard:<id>, see ard-sounds.ts)
const ardHit = (s: ArdShow): PodcastHit => ({
  title: s.title,
  author: s.station || 'ARD',
  feedUrl: `ard:${s.id}`,
  image: s.image,
  genre: 'ARD Audiothek',
  episodes: s.episodes,
  country: 'DE',
  kids: s.kids,
  explicit: false,
})

const KIDS_TTL_MS = 60 * 60 * 1000
let kidsCache: { at: number; shows: ArdShow[] } | null = null
const ardKids = async () => {
  if (!kidsCache || Date.now() - kidsCache.at > KIDS_TTL_MS) kidsCache = { at: Date.now(), shows: await ardKidsShows() }
  return kidsCache.shows
}

export function registerPodcastRoutes(router: Router, deps: PodcastRouteDeps): void {
  /**
   * GET /api/app/sources - {podcastSearch, radioSearch, available: [{code, name}]}; POST {podcastSearch} and/or
   * {radioSearch} switches a search
   */
  const sources = () => {
    const cfg = deps.getMupiboxConfig()
    return {
      podcastSearch: podcastSearchOn(cfg),
      radioSearch: radioSearchOn(cfg),
      available: Object.entries(CONTENT_LANGUAGES).map(([code, l]) => ({ code, name: l.name })),
    }
  }
  router.get('/sources', requireSession, (_req, res) => {
    res.json(sources())
  })
  router.post('/sources', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { podcastSearch?: unknown; radioSearch?: unknown } | undefined) ?? {}
    const set: Record<string, boolean> = {}
    for (const key of ['podcastSearch', 'radioSearch'] as const) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'boolean') return void res.status(400).json({ error: `${key} must be true or false` })
      set[key] = body[key] as boolean
    }
    if (!Object.keys(set).length) return void res.status(400).json({ error: 'nothing to change' })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), ...set }
    })
    res.json(sources())
  })

  /** GET /api/app/radio-search?q=…&lang=de&kids=1 - radio stations of a language (radio-browser.info) */
  router.get('/radio-search', requireSession, async (req, res) => {
    if (!radioSearchOn(deps.getMupiboxConfig())) return void res.status(403).json({ error: 'radio_search_disabled' })
    const q = String(req.query.q ?? '').trim()
    const lang = String(req.query.lang ?? 'de')
    if (q.length < 2 || q.length > 100 || !radioLanguageKnown(lang)) return void res.status(400).json({ error: 'invalid_query' })
    try {
      res.json({ stations: await searchRadio(q, lang, req.query.kids === '1') })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] radio search: ${error}`)
      res.status(502).json({ error: 'directory_unavailable' })
    }
  })

  /** GET /api/app/radio-suggestions?lang=de - children's stations of a language, before anything is searched */
  router.get('/radio-suggestions', requireSession, async (req, res) => {
    const lang = String(req.query.lang ?? 'de')
    if (!radioLanguageKnown(lang)) return void res.status(400).json({ error: 'invalid_language' })
    try {
      res.json({ stations: await kidsRadio(lang) })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] radio suggestions: ${error}`)
      res.json({ stations: [] })
    }
  })

  /**
   * GET /api/app/podcast-search?q=…&lang=de&kids=1 - shows for a search term in a language: Apple's directory in the
   * language's stores, for German together with the ARD Audiothek (a show found in both once: its feed)
   */
  router.get('/podcast-search', requireSession, async (req, res) => {
    if (!podcastSearchOn(deps.getMupiboxConfig())) return void res.status(403).json({ error: 'podcast_search_disabled' })
    const q = String(req.query.q ?? '').trim()
    const lang = String(req.query.lang ?? 'de')
    const kids = req.query.kids === '1'
    if (q.length < 2 || q.length > 100 || !(lang in CONTENT_LANGUAGES)) return void res.status(400).json({ error: 'invalid_query' })
    const [apple, ard] = await Promise.allSettled([searchPodcasts(q, lang, kids), lang === 'de' ? ardSearch(q, kids) : Promise.resolve([])])
    if (apple.status === 'rejected' && ard.status === 'rejected') {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] podcast search: ${apple.reason}`)
      return void res.status(502).json({ error: 'directory_unavailable' })
    }
    const fromApple = apple.status === 'fulfilled' ? apple.value : []
    const fromArd = ard.status === 'fulfilled' ? ard.value.map(ardHit) : []
    res.json({ shows: mergeHits(fromApple, fromArd) })
  })

  /** GET /api/app/podcast-suggestions?lang=de - shows for children to start with, before anything is searched */
  router.get('/podcast-suggestions', requireSession, async (req, res) => {
    const lang = String(req.query.lang ?? 'de')
    if (!(lang in CONTENT_LANGUAGES)) return void res.status(400).json({ error: 'invalid_language' })
    // Apple's charts of stories and knowledge for children in the language's store; for German together with the
    // ARD Audiothek's children's shows
    const [apple, ard] = await Promise.allSettled([topKidsPodcasts(lang), lang === 'de' ? ardKids() : Promise.resolve([])])
    try {
      res.json({ shows: mergeHits(apple.status === 'fulfilled' ? apple.value : [], ard.status === 'fulfilled' ? ard.value.map(ardHit) : []) })
    } catch (error) {
      console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] podcast suggestions: ${error}`)
      res.json({ shows: [] })
    }
  })

  /** POST /api/app/ard/resolve {url} - the show id behind a link to it on ardsounds.de / ardaudiothek.de */
  router.post('/ard/resolve', requireSession, requireCsrf, async (req, res) => {
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
  const podcastAt = async (feed: unknown): Promise<{ feed: string; keep: number; pick?: string } | null> => {
    if (typeof feed !== 'string' || !feed) return null
    try {
      const library = JSON.parse(await fsp.readFile(deps.activeDataPath, 'utf8')) as Record<string, unknown>[]
      const item = library.find((e) => e?.type === 'rss' && e.id === feed)
      if (!item) return null
      return { feed, keep: Math.max(0, Math.min(MAX_KEEP, Number(item.offline) || 0)), ...(isEpisodePick(item.episodePick) ? { pick: item.episodePick } : {}) }
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
      // (an ARD episode the ARD does not release for download: only streamed, see podcast-offline.ts mayKeep)
      if (!mayKeep(episode)) {
        res.status(403).json({ error: 'not_downloadable' })
        return
      }
      await offline.add(episode, podcast.feed, true)
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
    await offline.syncFeed(podcast.feed, podcast.keep, podcast.pick)
    res.json({ ...(await offline.status(podcast.feed)), keep: podcast.keep })
  })
}
