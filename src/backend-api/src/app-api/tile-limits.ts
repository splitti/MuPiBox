// A day's limit per tile of the start page (5.1, "Kachel-Limit"): what the parents set (the library's sheet of a tile:
// "Höchstens am Tag") and today's exceptions (Spielzeit › Kacheln mit Limit, Telegram: +10 min, free today). Written
// into mupiboxconfig.json - the player takes it within a second (spotify-control.js "Tile time"):
//   playtimeLimit.tileLimits: [{ key, name, minutes }]            the key as tile-key.ts forms it
//   playtimeLimit.tileToday:  { date, bonus: { key: min }, free: [key] }   today only (the logical day, resetHour)

import { logicalDate } from './photos/settings'

export const TILE_KEY = /^(artist|lib|nas|single):[^\n]{1,400}$/
const MAX_TILES = 500

export interface TileLimit {
  key: string
  name: string
  minutes: number
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** the limits set, the valid ones */
export function tileLimitsOf(cfg: Record<string, unknown>): TileLimit[] {
  const raw = obj(cfg.playtimeLimit).tileLimits
  const out: TileLimit[] = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const r = obj(t)
    const m = Number(r.minutes)
    if (typeof r.key === 'string' && TILE_KEY.test(r.key) && Number.isInteger(m) && m >= 1 && m <= 1440) {
      out.push({ key: r.key, name: typeof r.name === 'string' ? r.name.slice(0, 200) : '', minutes: m })
    }
  }
  return out
}

/**
 * Sets the limit of one or more tiles (a group of the app's library can be more than one tile of the display: entries
 * whose artist was named alike there) - minutes 0 or null takes it away (with today's exceptions for it). Returns the
 * error or null.
 */
export function setTileLimit(cfg: Record<string, unknown>, keys: unknown, name: unknown, minutes: unknown): string | null {
  const list = Array.isArray(keys) ? keys : [keys]
  if (!list.length || list.length > 50 || !list.every((k) => typeof k === 'string' && TILE_KEY.test(k))) return 'keys must be tile keys'
  const m = minutes === null || minutes === undefined ? 0 : Number(minutes)
  if (!Number.isInteger(m) || m < 0 || m > 1440) return 'minutes must be 0-1440'
  // (one name for all, or one per key: a group of the app that is several tiles on the display - each its own name)
  const names = name && typeof name === 'object' && !Array.isArray(name) ? (name as Record<string, unknown>) : null
  const labelOf = (key: string) => {
    const n = names ? names[key] : name
    return typeof n === 'string' ? n.trim().slice(0, 200) : ''
  }
  const block = { ...obj(cfg.playtimeLimit) }
  const kept = tileLimitsOf(cfg).filter((t) => !list.includes(t.key))
  if (m > 0) {
    if (kept.length + list.length > MAX_TILES) return 'too many tiles with a limit'
    for (const key of list as string[]) kept.push({ key, name: labelOf(key), minutes: m })
  }
  block.tileLimits = kept
  if (m === 0) {
    // (today's minutes added and "free" of a tile without a limit: gone with it)
    const today = obj(block.tileToday)
    if (today.date) {
      const bonus = { ...obj(today.bonus) }
      for (const k of list as string[]) delete bonus[k]
      const free = Array.isArray(today.free) ? today.free.filter((k) => !list.includes(k)) : []
      block.tileToday = { ...today, bonus, free }
    }
  }
  cfg.playtimeLimit = block
  return null
}

export type TileTimeAction = 'extend' | 'free'

/**
 * A parent's action on today's time of a tile with a limit: extend +minutes (adds up), free (no limit for the rest of
 * the day). Another day's entry is replaced. Returns the error or null.
 */
export function applyTileTimeAction(cfg: Record<string, unknown>, key: unknown, action: unknown, minutes: unknown, now = new Date()): string | null {
  if (action !== 'extend' && action !== 'free') return 'action must be extend or free'
  if (typeof key !== 'string' || !TILE_KEY.test(key)) return 'key must be a tile key'
  if (!tileLimitsOf(cfg).some((t) => t.key === key)) return 'this tile has no limit'
  const block = { ...obj(cfg.playtimeLimit) }
  const resetHour = Number(block.resetHour)
  const date = logicalDate(now, Number.isInteger(resetHour) && resetHour >= 0 && resetHour < 24 ? resetHour : 0)
  const old = obj(block.tileToday)
  const today: Record<string, unknown> = old.date === date ? { ...old } : { date }
  if (action === 'extend') {
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1 || m > 1440) return 'minutes must be 1-1440'
    const bonus = { ...obj(today.bonus) }
    const before = Number(bonus[key])
    bonus[key] = Math.min(1440, (Number.isFinite(before) && before > 0 ? before : 0) + m)
    today.bonus = bonus
  } else {
    const free = Array.isArray(today.free) ? today.free.filter((k): k is string => typeof k === 'string') : []
    if (!free.includes(key)) free.push(key)
    today.free = free
  }
  block.tileToday = today
  cfg.playtimeLimit = block
  return null
}
