// Audible (5.1, docs/audible-5.1.md): the app's page Einstellungen › Dienste › Audible - the store, the sign-in (Amazon's
// page in the parents' own browser; they paste the address it lands on, the box registers a device of its own with the
// code in it) and the switches. The box keeps only that device's key and tokens, encrypted with its own key; signing out
// removes the device from the account again. Unofficial, off by default.

import { randomUUID } from 'node:crypto'
import type { Router } from 'express'
import {
  AudibleError,
  type AudibleCountry,
  type AudibleSession,
  check,
  codeOf,
  deregister,
  isCountry,
  type LoginStart,
  loginStart,
  MARKETS,
  type Registration,
  register,
} from '../audible/client'
import { type AudibleSettings, applyAudibleOptions, audibleSession, audibleSettings, credentialsOf, signedIn } from '../audible/settings'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface AudibleDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  /** how the box keeps the device's key (as the NAS password) */
  secret?: { encrypt(plain: string): string; decrypt(stored: string): string | undefined }
}

// a sign-in waits this long for the address Amazon landed on (the parents switch to the browser and back)
const LOGIN_MS = 15 * 60 * 1000

interface Pending extends LoginStart {
  id: string
  until: number
  busy: boolean
}

/** What the app gets to see (never the key) */
function shown(s: AudibleSettings) {
  const { secret, ...rest } = s
  return { ...rest, signedIn: signedIn(s) }
}

const problemOf = (err: unknown) => (err instanceof AudibleError ? err.problem : 'unreachable')

export function registerAudibleRoutes(router: Router, deps: AudibleDeps): void {
  const encrypt = (x: string) => (deps.secret ? deps.secret.encrypt(x) : x)
  const decrypt = (x: string) => (deps.secret ? deps.secret.decrypt(x) : x)
  const cfg = () => deps.getMupiboxConfig() as Record<string, unknown> | undefined
  const settings = () => audibleSettings(cfg())
  // (one sign-in at a time for the whole box - a new one replaces a waiting one)
  let pending: Pending | null = null
  const waiting = () => (pending && Date.now() <= pending.until ? pending : null)

  // a device registered: kept, and Audible switched on - unless the parents had switched it off. A save that fails
  // removes the new device again (none left behind in the account); the device of before is removed after the save.
  const save = async (country: AudibleCountry, serial: string, reg: Registration) => {
    let before: AudibleSettings | null = null
    const session: AudibleSession = { country, credentials: { adpToken: reg.adpToken, privateKey: reg.privateKey, refreshToken: reg.refreshToken } }
    try {
      await deps.updateMupiboxConfig((c) => {
        const a = (c.audible && typeof c.audible === 'object' ? c.audible : {}) as Record<string, unknown>
        // (read inside the change: two sign-ins at once - the second one sees the first)
        before = audibleSettings(c)
        c.audible = {
          ...a,
          enabled: signedIn(before) && before.enabled === false ? false : true,
          country,
          serial,
          deviceName: reg.deviceName,
          customerName: reg.customerName,
          secret: encrypt(JSON.stringify(session.credentials)),
        }
      })
    } catch (err) {
      void deregister(session)
      throw err
    }
    const was = before as AudibleSettings | null
    if (was && signedIn(was) && was.serial !== serial) {
      const old = credentialsOf(was, decrypt)
      // (usually signed in anew because Audible refused the old device - it is gone already)
      if (old)
        void deregister({ country: was.country, credentials: old }).then((gone) => {
          if (!gone) console.warn('Audible: the device of before could not be removed from the account (remove it under "Manage devices")')
        })
    }
  }

  /** GET /api/app/audible - the settings (without the key), whether the device works right now, a sign-in waiting */
  router.get('/audible', requireSession, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const s = settings()
    const session = audibleSession(cfg(), decrypt)
    let state: 'off' | 'ok' | 'unreachable' | 'unauthorized' = 'off'
    if (session) {
      try {
        // (short: every visit of the page waits for it - no internet must not hold the app)
        await check(session)
        state = 'ok'
      } catch (err) {
        const p = problemOf(err)
        // (asked too often: the device works, Audible only wants a pause)
        state = p === 'unauthorized' ? 'unauthorized' : p === 'rateLimited' ? 'ok' : 'unreachable'
      }
    } else if (signedIn(s)) {
      // (a key this box cannot read: a backup of another box - signed in anew)
      state = 'unauthorized'
    }
    const p = waiting()
    res.json({
      settings: shown(s),
      state,
      countries: Object.keys(MARKETS),
      login: p ? { id: p.id, country: p.country, url: p.url, until: p.until } : null,
    })
  })

  /** POST /api/app/audible/login {country} - Amazon's sign-in page for a new device of this box */
  router.post('/audible/login', requireSession, requireCsrf, (req, res) => {
    const country = (req.body ?? {}).country
    if (!isCountry(country)) return void res.status(400).json({ error: 'bad_country' })
    pending = { ...loginStart(country), id: randomUUID(), until: Date.now() + LOGIN_MS, busy: false }
    res.json({ ok: true, id: pending.id, url: pending.url, until: pending.until })
  })

  /** POST /api/app/audible/login/finish {id, address} - the address Amazon landed on: the box registers its device */
  router.post('/audible/login/finish', requireSession, requireCsrf, async (req, res) => {
    const { id, address } = (req.body ?? {}) as { id?: unknown; address?: unknown }
    const p = waiting()
    if (!p || p.id !== id) return void res.json({ ok: false, error: 'expired' })
    const code = codeOf(address)
    if (!code) return void res.json({ ok: false, error: 'badCode' })
    if (p.busy) return void res.status(409).json({ ok: false, error: 'busy' })
    p.busy = true
    try {
      const reg = await register(p, code)
      // (given up or replaced while it registered: nothing kept - the new device removed again)
      if (pending !== p) {
        void deregister({ country: p.country, credentials: reg })
        return void res.json({ ok: false, error: 'expired' })
      }
      await save(p.country, p.serial, reg)
      // (only this sign-in ends: one begun meanwhile stays)
      if (pending === p) pending = null
      res.json({ ok: true, customerName: reg.customerName })
    } catch (err) {
      // (a refused code: the same sign-in page works again - the parents sign in once more and paste the new address)
      res.json({ ok: false, error: problemOf(err) })
    } finally {
      p.busy = false
    }
  })

  /** DELETE /api/app/audible/login - the sign-in given up */
  router.delete('/audible/login', requireSession, requireCsrf, (_req, res) => {
    pending = null
    res.json({ ok: true })
  })

  /** POST /api/app/audible/settings {enabled?, shareProgress?} */
  router.post('/audible/settings', requireSession, requireCsrf, async (req, res) => {
    let error: string | null = null
    await deps.updateMupiboxConfig((c) => {
      const a = { ...((c.audible && typeof c.audible === 'object' ? c.audible : {}) as Record<string, unknown>) }
      error = applyAudibleOptions(a, req.body)
      if (!error) c.audible = a
    })
    if (error) return void res.status(400).json({ error })
    res.json({ ok: true, settings: shown(settings()) })
  })

  /** POST /api/app/audible/logout - removes the box's device from the account and forgets its key (entries stay) */
  router.post('/audible/logout', requireSession, requireCsrf, async (_req, res) => {
    const s = settings()
    const session = audibleSession(cfg(), decrypt)
    // removed: true removed (or gone already), false Amazon not reached, null a key this box cannot read (a backup of
    // another box - that device is the other box's; or the box's own key changed) - not removed
    const removed = session ? await deregister(session) : signedIn(s) ? null : true
    pending = null
    await deps.updateMupiboxConfig((c) => {
      const a = (c.audible && typeof c.audible === 'object' ? c.audible : {}) as Record<string, unknown>
      // (a sign-in saved meanwhile is another device - it stays)
      if (audibleSettings(c).serial !== s.serial) return
      c.audible = { ...a, serial: '', deviceName: '', customerName: '', secret: '' }
    })
    // (not removed: the key is gone on the box all the same - the device stays in Amazon's list until removed there)
    res.json({ ok: true, removed })
  })
}
