// Phase 14c — Eltern-WebApp middleware.
// Three pieces of request-level enforcement that every Eltern-route gets:
//   1. localNetworkOnly — refuses requests from non-private IPs. Box
//      backend listens on 0.0.0.0:8200 (existing behaviour) so anyone on
//      the LAN can reach it; this filter keeps the auth surface invisible
//      from WAN even if port-forwarding is accidentally enabled.
//   2. parseCookies — minimal cookie-header parser; the project doesn't
//      use cookie-parser, so we do it inline to avoid adding a dep.
//   3. requireSession — pulls session id from cookie, validates via auth
//      module, attaches the session to `req.session`. Optional CSRF check
//      for state-changing methods.
//   4. rateLimit — token-bucket per IP for the magic-link redeem endpoint;
//      blocks brute-force token guessing.

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { CSRF_HEADER, SESSION_COOKIE, validateSession } from './auth'

declare module 'express-serve-static-core' {
  interface Request {
    elternSessionId?: string
    elternSessionCsrf?: string
  }
}

/** RFC1918 + loopback + IPv6 link-local. Boxes never speak to anything else. */
function isPrivateIp(ip: string): boolean {
  // Strip IPv6-mapped-IPv4 prefix.
  const v = ip.replace(/^::ffff:/, '')
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost') return true
  if (v.startsWith('10.')) return true
  if (v.startsWith('192.168.')) return true
  if (v.startsWith('172.')) {
    const second = Number.parseInt(v.split('.')[1] ?? '0', 10)
    if (second >= 16 && second <= 31) return true
  }
  if (v.startsWith('169.254.')) return true // link-local
  if (v.startsWith('fe80:')) return true // IPv6 link-local
  if (v.startsWith('fd') || v.startsWith('fc')) return true // IPv6 ULA
  return false
}

/** Refuse non-LAN requests with a 403. Mount before any eltern handler. */
export const localNetworkOnly: RequestHandler = (req, res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? ''
  if (!isPrivateIp(ip)) {
    console.warn(`${new Date().toLocaleString()}: [eltern] rejecting WAN access from ${ip}`)
    res.status(403).json({ error: 'local network only' })
    return
  }
  next()
}

/** Minimal cookie-header parser; mutates Request to add a typed accessor. */
export function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  // Split on '; ', take name=value pairs. Don't decode — session ids are
  // hex, no escaping involved.
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    if (trimmed.slice(0, eqIdx) === name) {
      return trimmed.slice(eqIdx + 1)
    }
  }
  return undefined
}

/** Require a valid session. Attaches sessionId + csrf to req. 401 on fail. */
export const requireSession: RequestHandler = (req, res, next) => {
  const sessionId = parseCookie(req, SESSION_COOKIE)
  const session = validateSession(sessionId)
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  req.elternSessionId = sessionId
  req.elternSessionCsrf = session.csrf
  next()
}

/** Require CSRF token (header) to match the session's stored value.
 *  Use on every state-changing endpoint (POST/PUT/DELETE/PATCH). */
export const requireCsrf: RequestHandler = (req, res, next) => {
  const headerToken = req.headers[CSRF_HEADER]
  if (typeof headerToken !== 'string' || headerToken !== req.elternSessionCsrf) {
    res.status(403).json({ error: 'csrf token missing or invalid' })
    return
  }
  next()
}

/** Token-bucket per IP for the magic-link redeem endpoint. 5 req/min/IP;
 *  exceeded → 429. Simple in-memory counter, resets every minute. Crashes
 *  forget state (acceptable — short-lived attacks reset, real users come
 *  back with a single-use token anyway). */
const buckets = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

export function ipRateLimit(maxPerMin = RATE_LIMIT_MAX): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const bucket = buckets.get(ip)
    if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      buckets.set(ip, { count: 1, windowStart: now })
      next()
      return
    }
    bucket.count++
    if (bucket.count > maxPerMin) {
      res.status(429).json({ error: 'rate limited', retry_after_seconds: 60 })
      return
    }
    next()
  }
}

/** Periodically prune the IP-buckets map so memory doesn't grow boundless. */
export function startBucketCleanup(): void {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, bucket] of buckets) {
      if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        buckets.delete(ip)
      }
    }
  }, RATE_LIMIT_WINDOW_MS).unref?.()
}

/** Required-but-untyped helper to silence unused-NextFunction warnings */
export function _noop(_next: NextFunction, _res: Response): void {
  /* placeholder */
}
