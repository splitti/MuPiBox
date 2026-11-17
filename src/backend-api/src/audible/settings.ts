// Audible's part of the box's config (mupiboxconfig.json "audible"): the store, the device the box registered there and
// its key and tokens (one encrypted string, kept with the box's own key as the NAS password), the switches. Read with
// defaults, so a box from before (no "audible") and broken values give a box without Audible.

import { type AudibleCountry, type AudibleCredentials, type AudibleSession, isCountry } from './client'

export interface AudibleSettings {
  /** Audible used at all (the library shows its entries, the display plays them) */
  enabled: boolean
  /** the store the account belongs to */
  country: AudibleCountry
  /** the device's serial number towards Amazon ('' none registered) */
  serial: string
  /** how Amazon lists the device */
  deviceName: string
  /** the account holder's first name, to show which account it is */
  customerName: string
  /** the device's key and tokens as kept (encrypted JSON; named "secret": hidden in /api/config and the JSON editor); '' not signed in */
  secret: string
  /** the listening position shared with Audible in both ways (A5) */
  shareProgress: boolean
}

export const AUDIBLE_DEFAULTS: AudibleSettings = {
  enabled: false,
  country: 'de',
  serial: '',
  deviceName: '',
  customerName: '',
  secret: '',
  shareProgress: false,
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max && !/[\r\n]/.test(v) ? v : '')

export function audibleSettings(cfg: Record<string, unknown> | undefined): AudibleSettings {
  const a = cfg?.audible as Record<string, unknown> | undefined
  if (!a || typeof a !== 'object') return { ...AUDIBLE_DEFAULTS }
  return {
    enabled: a.enabled === true,
    country: isCountry(a.country) ? a.country : 'de',
    serial: /^[0-9A-F]{32}$/.test(str(a.serial)) ? str(a.serial) : '',
    deviceName: str(a.deviceName),
    customerName: str(a.customerName, 100),
    secret: str(a.secret, 20000),
    shareProgress: a.shareProgress === true,
  }
}

/** Signed in: a device registered and its key kept */
export const signedIn = (s: AudibleSettings) => !!(s.serial && s.secret)

/** The device's key and tokens from what is kept - null when they cannot be read (a backup of another box, broken) */
export function credentialsOf(s: AudibleSettings, decrypt: (stored: string) => string | undefined): AudibleCredentials | null {
  if (!signedIn(s)) return null
  const plain = decrypt(s.secret)
  if (!plain) return null
  try {
    const c = JSON.parse(plain) as Partial<AudibleCredentials>
    if (typeof c.adpToken !== 'string' || typeof c.privateKey !== 'string' || typeof c.refreshToken !== 'string') return null
    if (!c.adpToken || !c.privateKey.includes('PRIVATE KEY') || !c.refreshToken) return null
    return { adpToken: c.adpToken, privateKey: c.privateKey, refreshToken: c.refreshToken }
  } catch {
    return null
  }
}

/** The box's session with Audible (signed in, the key readable), else null */
export function audibleSession(cfg: Record<string, unknown> | undefined, decrypt: (stored: string) => string | undefined): AudibleSession | null {
  const s = audibleSettings(cfg)
  const credentials = credentialsOf(s, decrypt)
  return credentials ? { country: s.country, credentials } : null
}

/**
 * A change of the switches from the app, checked: the reason for a wrong field (nothing written), else null and the
 * fields set in target (the config's "audible" object). The store changes only with a new sign-in.
 */
export function applyAudibleOptions(target: Record<string, unknown>, patch: unknown): string | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'no settings'
  const p = patch as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const k of Object.keys(p)) {
    if (k !== 'enabled' && k !== 'shareProgress') return `unknown field ${k}`
    if (typeof p[k] !== 'boolean') return `${k} must be true or false`
    next[k] = p[k]
  }
  Object.assign(target, next)
  return null
}
