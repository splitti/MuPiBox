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
 *   GET  /api/users/state            the display: switched on, who is in place, the users (no names of the trash)
 */
export function registerUserRoutes(app: Express, users: Users, guard: { session: RequestHandler; csrf: RequestHandler }): void {
  const router = express.Router()
  const fail = (res: Response, err: unknown) => {
    if (err instanceof UserSwitchError) {
      const status = { busy: 409, disabled: 409, unknown_user: 404, failed: 400 }[err.code]
      res.status(status).json({ error: err.code, reason: err.message })
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
  app.use('/api/app', router)

  app.get('/api/users/state', (_req, res) => {
    const f = users.state()
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      enabled: f.enabled,
      current: f.current,
      switchMode: f.switchMode,
      users: f.enabled ? f.users.map((u) => ({ id: u.id, name: u.name, color: u.color, pin: Boolean(u.pin) })) : [],
    })
  })
}
