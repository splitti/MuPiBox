import express, { type Express, type RequestHandler, type Response } from 'express'
import { MAX_USERS, USER_COLORS, type Users, UserSwitchError } from '../users'

/**
 * The users of the box (5.1, users.ts) in the app (the parents' login) and for the display.
 *
 *   GET  /api/app/users              the list: switched on, who is in place, how the display switches, the users (with
 *                                    the count of their library), the trash
 *   POST /api/app/users/add          { name, from? }   from: a user whose library the new one gets a copy of
 *   POST /api/app/users/rename       { id, name }
 *   POST /api/app/users/color        { id, color }
 *   POST /api/app/users/remove       { id }            into the trash (30 days)
 *   POST /api/app/users/restore      { key }           back out of it
 *   POST /api/app/users/switch       { id }
 *   POST /api/app/users/enable       { enabled, keep? }   off: keep = the user the box goes on with
 *   POST /api/app/users/switch-mode  { mode }          free | hold | app
 *   POST /api/app/users/pin          { id, pin }       4 digits, '' takes it away (the display asks it before switching to him)
 *   GET  /api/users/state            the display: switched on, who is in place, the users (no names of the trash)
 *   POST /api/users/switch           the display (only on the box itself): { id, pin? } - not with "only in the app";
 *                                    403 pin { left } wrong PIN, 429 pin_locked { seconds } after 5 wrong
 */
export function registerUserRoutes(app: Express, users: Users, guard: { session: RequestHandler; csrf: RequestHandler; local: RequestHandler }): void {
  const router = express.Router()
  const fail = (res: Response, err: unknown) => {
    if (err instanceof UserSwitchError) {
      const status = { busy: 409, disabled: 409, unknown_user: 404, failed: 400, mode: 403, pin: 403, pin_locked: 429 }[err.code]
      const extra = err.code === 'pin' ? { left: Number(err.message) } : err.code === 'pin_locked' ? { seconds: Number(err.message) } : {}
      res.status(status).json({ error: err.code, reason: err.message, ...extra })
      return
    }
    res.status(500).json({ error: 'failed', reason: (err as Error).message })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  const list = () => {
    const f = users.state()
    return {
      enabled: f.enabled,
      current: f.current,
      switchMode: f.switchMode,
      max: MAX_USERS,
      colors: USER_COLORS,
      users: f.users.map((u) => ({ id: u.id, name: u.name, color: u.color, pin: Boolean(u.pin), count: users.files.libraryCount(u.id, f.current) })),
      trash: users.files.trashList().map((t) => ({ key: t.key, name: t.name, color: t.color, deletedAt: t.deletedAt })),
    }
  }

  router.get('/users', guard.session, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(list())
  })
  const post = (route: string, work: (body: Record<string, unknown>) => Promise<unknown>) =>
    router.post(route, guard.session, guard.csrf, async (req, res) => {
      try {
        await work((req.body as Record<string, unknown> | undefined) ?? {})
        res.json({ ok: true, ...list() })
      } catch (err) {
        fail(res, err)
      }
    })
  post('/users/add', (b) => users.add(b.name, str(b.from) || null))
  post('/users/rename', (b) => users.rename(str(b.id), b.name))
  post('/users/color', (b) => users.setColor(str(b.id), str(b.color)))
  post('/users/remove', (b) => users.remove(str(b.id)))
  post('/users/restore', (b) => users.restore(str(b.key)))
  post('/users/switch', (b) => users.switchTo(str(b.id)))
  post('/users/enable', (b) => users.setEnabled(b.enabled === true, str(b.keep) || undefined))
  post('/users/switch-mode', (b) => users.setSwitchMode(b.mode))
  post('/users/pin', (b) => users.setPin(str(b.id), b.pin))
  app.use('/api/app', router)

  const displayState = () => {
    const f = users.state()
    return {
      enabled: f.enabled,
      current: f.current,
      switchMode: f.switchMode,
      users: f.enabled ? f.users.map((u) => ({ id: u.id, name: u.name, color: u.color, pin: Boolean(u.pin) })) : [],
    }
  }
  app.get('/api/users/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(displayState())
  })
  app.post('/api/users/switch', guard.local, express.json(), async (req, res) => {
    const b = (req.body as Record<string, unknown> | undefined) ?? {}
    try {
      await users.switchFromDisplay(str(b.id), b.pin)
      res.json({ ok: true, ...displayState() })
    } catch (err) {
      fail(res, err)
    }
  })
}
