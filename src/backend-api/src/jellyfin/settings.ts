// Jellyfin's part of the box's config (mupiboxconfig.json "jellyfin"): the server, the signed-in user with the token
// (kept encrypted with the box's own key, as the NAS password), the libraries chosen and the switches. Read with defaults,
// so a box from before (no "jellyfin") and broken values give a box without Jellyfin.

import { randomUUID } from 'node:crypto'
import { cleanAddress } from './client'

export interface JellyfinSettings {
  /** Jellyfin used at all (the library shows its entries, the display plays them) */
  enabled: boolean
  address: string
  /** the confirmed fingerprint of a self-signed certificate ('' none) */
  fingerprint: string
  serverId: string
  serverName: string
  version: string
  userId: string
  userName: string
  /** the token as kept (encrypted); '' not signed in */
  token: string
  /** this box towards Jellyfin, made once */
  deviceId: string
  /** the libraries the library page of the app offers (ids); [] all the box can play */
  libraries: string[]
  /** MP3 192 kbit from Jellyfin instead of the original file (weak WiFi) */
  transcode: boolean
  /** progress and "played" shared with Jellyfin in both ways */
  shareProgress: boolean
}

export const JELLYFIN_DEFAULTS: JellyfinSettings = {
  enabled: false,
  address: '',
  fingerprint: '',
  serverId: '',
  serverName: '',
  version: '',
  userId: '',
  userName: '',
  token: '',
  deviceId: '',
  libraries: [],
  transcode: false,
  shareProgress: false,
}

const str = (v: unknown, max = 400) => (typeof v === 'string' && v.length <= max && !/[\r\n]/.test(v) ? v : '')
const ID = /^[0-9a-f]{32}$/i

export function jellyfinSettings(cfg: Record<string, unknown> | undefined): JellyfinSettings {
  const j = cfg?.jellyfin as Record<string, unknown> | undefined
  if (!j || typeof j !== 'object') return { ...JELLYFIN_DEFAULTS }
  const address = cleanAddress(j.address) ?? ''
  return {
    enabled: j.enabled === true,
    address,
    fingerprint: /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/i.test(str(j.fingerprint)) ? str(j.fingerprint) : '',
    serverId: ID.test(str(j.serverId)) ? str(j.serverId) : '',
    serverName: str(j.serverName, 100),
    version: /^\d+(\.\d+){1,3}$/.test(str(j.version)) ? str(j.version) : '',
    userId: ID.test(str(j.userId)) ? str(j.userId) : '',
    userName: str(j.userName, 100),
    token: str(j.token, 1000),
    deviceId: /^[0-9a-f-]{36}$/.test(str(j.deviceId)) ? str(j.deviceId) : '',
    libraries: Array.isArray(j.libraries) ? [...new Set(j.libraries.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 50) : [],
    transcode: j.transcode === true,
    shareProgress: j.shareProgress === true,
  }
}

/** Signed in: a server and a token for a user */
export const signedIn = (s: JellyfinSettings) => !!(s.address && s.token && s.userId)

/** This box's id towards Jellyfin: the one kept, else a new one (to be saved with the login) */
export const deviceIdOf = (s: JellyfinSettings) => s.deviceId || randomUUID()

/**
 * A change of the switches and the libraries from the app, checked: the reason for a wrong field (nothing written), else
 * null and the fields set in target (the config's "jellyfin" object).
 */
export function applyJellyfinOptions(target: Record<string, unknown>, patch: unknown): string | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'no settings'
  const p = patch as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const k of ['enabled', 'transcode', 'shareProgress'] as const) {
    if (k in p) {
      if (typeof p[k] !== 'boolean') return `${k} must be true or false`
      next[k] = p[k]
    }
  }
  if ('libraries' in p) {
    if (!Array.isArray(p.libraries) || p.libraries.length > 50 || !p.libraries.every((x) => typeof x === 'string' && ID.test(x))) return 'libraries must be a list of ids'
    next.libraries = [...new Set(p.libraries as string[])]
  }
  for (const k of Object.keys(p)) if (!['enabled', 'transcode', 'shareProgress', 'libraries'].includes(k)) return `unknown field ${k}`
  Object.assign(target, next)
  return null
}
