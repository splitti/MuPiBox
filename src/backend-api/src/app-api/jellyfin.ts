// Jellyfin (5.1, docs/jellyfin-5.1.md): the app's page Einstellungen › Dienste › Jellyfin - finding the server, signing in
// (Quick Connect: a code confirmed in a Jellyfin app; or user name and password, used once and never kept), the libraries
// and the switches. The box keeps only the token, encrypted with its own key; signing out ends it in Jellyfin too.

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import type { Router } from 'express'
import {
  AUDIO_LIBRARIES,
  cleanAddress,
  type JellyfinDevice,
  JellyfinError,
  type JellyfinServer,
  type JellyfinSession,
  libraries,
  type LoginResult,
  loginWithPassword,
  logout,
  MIN_VERSION,
  publicInfo,
  quickConnectConfirmed,
  quickConnectLogin,
  quickConnectStart,
  requestJson,
  versionAtLeast,
} from '../jellyfin/client'
import { discover } from '../jellyfin/discover'
import { albums, artistAlbums, artists, books, isJellyfinId, playlists, search } from '../jellyfin/library'
import { applyJellyfinOptions, deviceIdOf, type JellyfinSettings, jellyfinSettings, signedIn } from '../jellyfin/settings'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface JellyfinDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** how the box keeps the token (as the NAS password) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/i
// a Quick Connect code waits this long at most (Jellyfin forgets it after 10 minutes)
const QUICK_CONNECT_MS = 10 * 60 * 1000

/** The box's version as Jellyfin sees it (its list of devices): "DEV 5.1.0 2026-11-16" -> 5.1.0 */
export function boxVersion(cfg: MupiboxConfig | undefined): string {
  const v = String(((cfg as Record<string, unknown> | undefined)?.mupibox as { version?: unknown } | undefined)?.version ?? '')
  return v.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? '5.1.0'
}

/** The session of the box (signed in, the token readable), else null */
export function jellyfinSession(cfg: MupiboxConfig | undefined, decrypt: (stored: string) => string | undefined): JellyfinSession | null {
  const s = jellyfinSettings(cfg as Record<string, unknown> | undefined)
  if (!signedIn(s) || !s.deviceId) return null
  const token = decrypt(s.token)
  if (!token) return null
  return { address: s.address, fingerprint: s.fingerprint, token, userId: s.userId, deviceId: s.deviceId, deviceName: os.hostname() || 'MuPiBox', version: boxVersion(cfg) }
}

/** What the app gets to see (never the token) */
function shown(s: JellyfinSettings) {
  const { token, ...rest } = s
  return { ...rest, hasToken: !!token }
}

// the reason of a failed request for the app ('certificate' with the certificate to confirm)
function problemOf(err: unknown): { error: string; status?: number; certificate?: unknown } {
  if (err instanceof JellyfinError) return { error: err.problem, ...(err.status ? { status: err.status } : {}), ...(err.certificate ? { certificate: err.certificate } : {}) }
  return { error: 'unreachable' }
}

interface Pending {
  id: string
  server: JellyfinServer
  device: JellyfinDevice
  info: { id: string; name: string; version: string }
  secret: string
  code: string
  until: number
  state: 'waiting' | 'done' | 'expired' | 'error'
  error?: string
  asking: boolean
}

export function registerJellyfinRoutes(router: Router, deps: JellyfinDeps): void {
  const encrypt = (x: string) => (deps.secret ? deps.secret.encrypt(x) : x)
  const decrypt = (x: string) => (deps.secret ? deps.secret.decrypt(x) : x)
  const settings = () => jellyfinSettings(deps.getMupiboxConfig() as Record<string, unknown> | undefined)
  // (a token this box cannot read: the settings came with a backup of another box - its device id too. Signed in with it,
  // Jellyfin would end the other box's session and both would sign each other out: this box gets an id of its own)
  const device = (s: JellyfinSettings): JellyfinDevice => ({
    deviceId: s.token && !decrypt(s.token) ? randomUUID() : deviceIdOf(s),
    deviceName: os.hostname() || 'MuPiBox',
    version: boxVersion(deps.getMupiboxConfig()),
  })
  // (one Quick Connect at a time for the whole box - a new one replaces a waiting one)
  let pending: Pending | null = null

  // the address and certificate of a request from the app, checked
  const serverOf = (body: unknown): JellyfinServer | null => {
    const b = (body ?? {}) as { address?: unknown; fingerprint?: unknown }
    const address = cleanAddress(b.address)
    if (!address) return null
    const fingerprint = typeof b.fingerprint === 'string' && FINGERPRINT.test(b.fingerprint) ? b.fingerprint.toUpperCase() : ''
    return { address, fingerprint }
  }

  // Jellyfin at that address, new enough - else the reason
  const check = async (server: JellyfinServer, dev: JellyfinDevice) => {
    const info = await publicInfo(server, dev)
    if (!versionAtLeast(info.version, MIN_VERSION)) throw Object.assign(new JellyfinError('version'), { info })
    return info
  }

  // a login that worked: server, user and token saved - switched on, unless the parents had switched off this same
  // account (signed in anew). A save that fails ends the new token in Jellyfin (no device left there) and throws.
  const save = async (server: JellyfinServer, dev: JellyfinDevice, info: { id: string; name: string; version: string }, login: LoginResult) => {
    const serverId = login.serverId || info.id
    let replaced: JellyfinSettings | null = null
    try {
      await deps.updateMupiboxConfig((cfg) => {
        const j = (cfg.jellyfin && typeof cfg.jellyfin === 'object' ? cfg.jellyfin : {}) as Record<string, unknown>
        // (read inside the change: two logins at once - the second one sees the first)
        const before = jellyfinSettings(cfg)
        replaced = before
        // (another server or another user: the libraries chosen before were of that one)
        const same = before.serverId === serverId && before.userId === login.userId
        cfg.jellyfin = {
          ...j,
          enabled: same && typeof j.enabled === 'boolean' ? j.enabled : true,
          address: server.address,
          fingerprint: server.fingerprint,
          serverId,
          serverName: info.name,
          version: info.version,
          userId: login.userId,
          userName: login.userName,
          token: encrypt(login.token),
          deviceId: dev.deviceId,
          libraries: same ? before.libraries : [],
        }
      })
    } catch (err) {
      void logout({ ...server, ...dev, token: login.token, userId: login.userId })
      throw err
    }
    // (the token of before, of another user or server, is ended there - the same account's Jellyfin replaced itself)
    const was = replaced as JellyfinSettings | null
    const old = was ? jellyfinSession({ jellyfin: was } as unknown as MupiboxConfig, decrypt) : null
    if (was && old && (old.userId !== login.userId || was.serverId !== serverId)) void logout(old)
  }

  /** GET /api/app/jellyfin - the settings (without the token) and whether the server and the login work right now */
  router.get('/jellyfin', requireSession, async (_req, res) => {
    // (it can carry a Quick Connect code)
    res.setHeader('Cache-Control', 'no-store')
    const s = settings()
    const session = jellyfinSession(deps.getMupiboxConfig(), decrypt)
    let state: 'off' | 'ok' | 'unreachable' | 'unauthorized' | 'certificate' = 'off'
    if (session) {
      try {
        // (short: every visit of the page and every change waits for it - a server away must not hold the app)
        await requestJson(session, session, `/Users/${encodeURIComponent(session.userId)}`, { token: session.token, timeoutMs: 3000 })
        state = 'ok'
      } catch (err) {
        const p = problemOf(err).error
        state = p === 'unauthorized' ? 'unauthorized' : p === 'certificate' ? 'certificate' : 'unreachable'
      }
    } else if (signedIn(s)) {
      // (a token this box cannot read: a backup of another box - signed in anew)
      state = 'unauthorized'
    }
    res.json({ settings: shown(s), state, minVersion: MIN_VERSION, quickConnect:
        pending && pending.state === 'waiting' && Date.now() <= pending.until
          ? { id: pending.id, code: pending.code, address: pending.server.address, fingerprint: pending.server.fingerprint, server: pending.info }
          : null,
    })
  })

  /** POST /api/app/jellyfin/discover - the servers that answer in the home network */
  router.post('/jellyfin/discover', requireSession, requireCsrf, async (_req, res) => {
    res.json({ servers: await discover() })
  })

  /** POST /api/app/jellyfin/probe {address, fingerprint?} - a Jellyfin there? Name, version; a certificate to confirm */
  router.post('/jellyfin/probe', requireSession, requireCsrf, async (req, res) => {
    const server = serverOf(req.body)
    if (!server) return void res.status(400).json({ error: 'bad_address' })
    try {
      const info = await check(server, device(settings()))
      res.json({ ok: true, address: server.address, fingerprint: server.fingerprint, server: info })
    } catch (err) {
      const info = (err as { info?: unknown }).info
      res.json({ ok: false, address: server.address, ...problemOf(err), ...(info ? { server: info } : {}) })
    }
  })

  /** POST /api/app/jellyfin/quickconnect {address, fingerprint?} - a code to confirm in a Jellyfin app */
  router.post('/jellyfin/quickconnect', requireSession, requireCsrf, async (req, res) => {
    const server = serverOf(req.body)
    if (!server) return void res.status(400).json({ error: 'bad_address' })
    const dev = device(settings())
    try {
      const info = await check(server, dev)
      const { code, secret } = await quickConnectStart(server, dev)
      pending = { id: randomUUID(), server, device: dev, info, secret, code, until: Date.now() + QUICK_CONNECT_MS, state: 'waiting', asking: false }
      res.json({ ok: true, id: pending.id, code })
    } catch (err) {
      res.json({ ok: false, ...problemOf(err) })
    }
  })

  /** GET /api/app/jellyfin/quickconnect/:id - confirmed yet? Once it is, the box signs in and keeps the token */
  router.get('/jellyfin/quickconnect/:id', requireSession, async (req, res) => {
    const p = pending
    if (!p || p.id !== req.params.id) return void res.json({ state: 'expired' })
    if (p.state !== 'waiting' || p.asking) return void res.json({ state: p.state, ...(p.error ? { error: p.error } : {}) })
    if (Date.now() > p.until) {
      p.state = 'expired'
      return void res.json({ state: 'expired' })
    }
    p.asking = true
    try {
      const answer = await quickConnectConfirmed(p.server, p.device, p.secret)
      if (answer === 'confirmed') {
        const login = await quickConnectLogin(p.server, p.device, p.secret)
        // (cancelled or replaced while it signed in: nothing saved - the token ended in Jellyfin again)
        if (pending !== p) {
          void logout({ ...p.server, ...p.device, token: login.token, userId: login.userId })
          return void res.json({ state: 'expired' })
        }
        try {
          await save(p.server, p.device, p.info, login)
        } catch {
          // (the config not written: the code is used up in Jellyfin - a new one is needed)
          Object.assign(p, { state: 'error', error: 'refused' })
          return void res.json({ state: p.state, error: p.error })
        }
        p.state = 'done'
      } else if (answer === 'expired') p.state = 'expired'
      res.json({ state: p.state })
    } catch (err) {
      // (the server away for a moment: asked again with the next poll)
      const e = problemOf(err).error
      if (e !== 'unreachable') Object.assign(p, { state: 'error', error: e })
      res.json({ state: p.state, error: e })
    } finally {
      p.asking = false
    }
  })

  /** DELETE /api/app/jellyfin/quickconnect - the code given up */
  router.delete('/jellyfin/quickconnect', requireSession, requireCsrf, (_req, res) => {
    pending = null
    res.json({ ok: true })
  })

  /** POST /api/app/jellyfin/login {address, fingerprint?, user, password} - the password is used once and never kept */
  router.post('/jellyfin/login', requireSession, requireCsrf, async (req, res) => {
    const server = serverOf(req.body)
    const { user, password } = (req.body ?? {}) as { user?: unknown; password?: unknown }
    if (!server) return void res.status(400).json({ error: 'bad_address' })
    if (typeof user !== 'string' || !user.trim() || user.length > 200 || typeof password !== 'string' || password.length > 500) return void res.status(400).json({ error: 'bad_login' })
    const dev = device(settings())
    try {
      const info = await check(server, dev)
      const login = await loginWithPassword(server, dev, user.trim(), password)
      pending = null
      await save(server, dev, info, login)
      res.json({ ok: true })
    } catch (err) {
      res.json({ ok: false, ...problemOf(err) })
    }
  })

  /** GET /api/app/jellyfin/libraries - the user's libraries, those the box can play marked */
  router.get('/jellyfin/libraries', requireSession, async (_req, res) => {
    const session = jellyfinSession(deps.getMupiboxConfig(), decrypt)
    if (!session) return void res.status(409).json({ error: 'not_signed_in' })
    try {
      const list = await libraries(session)
      res.json({ libraries: list.map((l) => ({ ...l, playable: AUDIO_LIBRARIES.includes(l.type) })) })
    } catch (err) {
      res.status(502).json(problemOf(err))
    }
  })

  /** POST /api/app/jellyfin/settings {enabled?, libraries?, transcode?, shareProgress?} */
  router.post('/jellyfin/settings', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    await deps.updateMupiboxConfig((cfg) => {
      const j = { ...((cfg.jellyfin && typeof cfg.jellyfin === 'object' ? cfg.jellyfin : {}) as Record<string, unknown>) }
      error = applyJellyfinOptions(j, req.body)
      if (!error) cfg.jellyfin = j
    })
    if (error) return void res.status(400).json({ error })
    res.json({ ok: true, settings: shown(settings()) })
  })

  /** POST /api/app/jellyfin/address {address, fingerprint?} - the same server under a new address (the login stays) */
  router.post('/jellyfin/address', requireSession, requireCsrf, async (req, res) => {
    const server = serverOf(req.body)
    if (!server) return void res.status(400).json({ error: 'bad_address' })
    const s = settings()
    try {
      const info = await check(server, device(s))
      // (another server: its own login - the token of this one is not sent there)
      if (s.serverId && info.id !== s.serverId) return void res.json({ ok: false, error: 'otherServer', server: info })
      await deps.updateMupiboxConfig((cfg) => {
        cfg.jellyfin = { ...((cfg.jellyfin as Record<string, unknown>) ?? {}), address: server.address, fingerprint: server.fingerprint, serverName: info.name, version: info.version }
      })
      res.json({ ok: true })
    } catch (err) {
      res.json({ ok: false, ...problemOf(err) })
    }
  })

  // J2: browsing Jellyfin to add to the box's library - only in the libraries chosen (all the box can play when none is)
  const browsing = async (res: import('express').Response) => {
    const s = settings()
    const session = jellyfinSession(deps.getMupiboxConfig(), decrypt)
    if (!s.enabled || !session) {
      res.status(409).json({ error: s.enabled ? 'not_signed_in' : 'jellyfin_off' })
      return null
    }
    return { s, session }
  }
  const chosenLibraries = async (session: JellyfinSession, s: JellyfinSettings) =>
    (await libraries(session)).filter((l) => AUDIO_LIBRARIES.includes(l.type) && (!s.libraries.length || s.libraries.includes(l.id)))
  const fail = (res: import('express').Response, err: unknown) => {
    const p = problemOf(err)
    res.status(p.error === 'unauthorized' ? 401 : 502).json(p)
  }

  /** GET /api/app/jellyfin/browse - the chosen libraries the box can play from */
  router.get('/jellyfin/browse', requireSession, async (_req, res) => {
    const b = await browsing(res)
    if (!b) return
    try {
      res.json({ libraries: await chosenLibraries(b.session, b.s) })
    } catch (err) {
      fail(res, err)
    }
  })

  /** GET /api/app/jellyfin/library/:id?view=artists|albums|books|playlists - what a library holds */
  router.get('/jellyfin/library/:id', requireSession, async (req, res) => {
    const b = await browsing(res)
    if (!b) return
    const id = String(req.params.id)
    const view = String(req.query.view ?? '')
    if (!isJellyfinId(id) || !['artists', 'albums', 'books', 'playlists'].includes(view)) return void res.status(400).json({ error: 'bad_request' })
    try {
      // (only a library that is one of the chosen ones)
      if (!(await chosenLibraries(b.session, b.s)).some((l) => l.id === id)) return void res.status(404).json({ error: 'not_chosen' })
      const list = view === 'artists' ? await artists(b.session, id) : view === 'albums' ? await albums(b.session, id) : view === 'books' ? await books(b.session, id) : await playlists(b.session)
      res.json({ items: list })
    } catch (err) {
      fail(res, err)
    }
  })

  /** GET /api/app/jellyfin/artist/:id/albums - an artist's albums, newest first */
  router.get('/jellyfin/artist/:id/albums', requireSession, async (req, res) => {
    const b = await browsing(res)
    if (!b) return
    const id = String(req.params.id)
    if (!isJellyfinId(id)) return void res.status(400).json({ error: 'bad_id' })
    try {
      res.json({ items: await artistAlbums(b.session, id) })
    } catch (err) {
      fail(res, err)
    }
  })

  /** GET /api/app/jellyfin/search?q= - artists, albums, playlists and audiobooks */
  router.get('/jellyfin/search', requireSession, async (req, res) => {
    const b = await browsing(res)
    if (!b) return
    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    if (text.length < 2) return void res.status(400).json({ error: 'no_query' })
    try {
      const libs = b.s.libraries.length ? await chosenLibraries(b.session, b.s) : []
      res.json(await search(b.session, text, libs))
    } catch (err) {
      fail(res, err)
    }
  })

  /** POST /api/app/jellyfin/logout - ends the token in Jellyfin and forgets it (the entries of the library stay) */
  router.post('/jellyfin/logout', requireSession, requireCsrf, async (_req, res) => {
    const session = jellyfinSession(deps.getMupiboxConfig(), decrypt)
    if (session) await logout(session)
    pending = null
    // (only the token goes: signed in again with the same account, the libraries and the switches stay)
    await deps.updateMupiboxConfig((cfg) => {
      const j = (cfg.jellyfin as Record<string, unknown>) ?? {}
      cfg.jellyfin = { ...j, token: '' }
    })
    res.json({ ok: true })
  })
}
