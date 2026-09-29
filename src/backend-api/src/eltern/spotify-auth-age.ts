// How long the box's Spotify login still holds.
//
// Spotify lets a login of a developer app (the refresh token the box gets with "Mit Spotify verbinden") run for 6 months
// from the moment it was given; refreshing the access token every hour does not make it longer (since 20.07.2026, see
// https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration). Then the player plays no Spotify any more
// and the Smart-Sync stops, until the parents log in again. The box itself cannot renew it: Spotify wants a person.
//
// So the box keeps when the login was given (spotify.authorizedAt, with the login it belongs to: authorizedTokenId),
// reminds the parents 14 and 3 days before in the app and by Telegram, and says at once when Spotify refused it
// (invalid_grant: the player writes /tmp/.spotify_auth_invalid, the Smart-Sync its state).

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import type { MupiboxConfig } from '../models/mupibox-config.model'

export const LOGIN_DAYS = 180
const DAY_MS = 24 * 3600 * 1000
// (written by the player when Spotify refuses its login, removed when a refresh works again: see spotify-control.js)
export const PLAYER_AUTH_FLAG = '/tmp/.spotify_auth_invalid'
const SYNC_STATE_FILE = '/tmp/.spotify_sync_state.json'
const TELEGRAM_SCRIPT = '/usr/local/bin/mupibox/telegram_send_message.py'
// the reminders, days before the end (the nearer first: crossed both at once, only it is sent)
const REMIND_DAYS = [3, 14]

/** A short mark of a login (not the login itself): tells whether the stored date belongs to the login there now. */
export const loginMark = (refreshToken: string): string => createHash('sha256').update(refreshToken).digest('hex').slice(0, 12)

type Spotify = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export interface SpotifyLoginAge {
  /** when the login was given (estimated: the box first saw it then, it may be older) */
  authorizedAt: string | null
  estimated: boolean
  /** authorizedAt + 180 days */
  expiresAt: string | null
  daysLeft: number | null
  /** Spotify refused the login (expired or withdrawn): a new login is needed */
  invalid: boolean
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

// When Spotify refused the current login last - the player's mark, or a Smart-Sync run that failed on its login;
// only after the login was given (the state of a run before it says nothing about it)
async function refusedSince(sp: Spotify): Promise<{ player: boolean; sync: boolean }> {
  const given = Date.parse(str(sp.authorizedAt)) || 0
  const flag = await readJson(PLAYER_AUTH_FLAG)
  const player = !!flag && (Date.parse(str(flag.since)) || 0) >= given
  const state = await readJson(SYNC_STATE_FILE)
  const sync = !!state && state.last_sync_status === 'AUTH_FAILED' && (Date.parse(str(state.last_sync_end)) || 0) >= given
  return { player, sync }
}

/** The login's age as the app shows it (GET /api/app/spotify-access). */
export async function spotifyLoginAge(cfg: MupiboxConfig | undefined): Promise<SpotifyLoginAge> {
  const sp = ((cfg?.spotify as Spotify | undefined) ?? {}) as Spotify
  const refresh = str(sp.refreshToken)
  const known = refresh !== '' && str(sp.authorizedTokenId) === loginMark(refresh)
  const at = known ? Date.parse(str(sp.authorizedAt)) : Number.NaN
  const expires = Number.isFinite(at) ? at + LOGIN_DAYS * DAY_MS : Number.NaN
  const refused = refresh ? await refusedSince(sp) : { player: false, sync: false }
  return {
    authorizedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
    estimated: known && sp.authorizedEstimated === true,
    expiresAt: Number.isFinite(expires) ? new Date(expires).toISOString() : null,
    daysLeft: Number.isFinite(expires) ? Math.floor((expires - Date.now()) / DAY_MS) : null,
    invalid: refused.player || refused.sync,
  }
}

/** The fields of a new login (after "Mit Spotify verbinden"): given now, its reminders not sent yet. */
export function markNewLogin(spotify: Spotify, refreshToken: string): void {
  spotify.authorizedAt = new Date().toISOString()
  spotify.authorizedTokenId = loginMark(refreshToken)
  spotify.authorizedEstimated = false
  delete spotify.authRemindedDays
  delete spotify.authInvalidNotified
  delete spotify.authUnknownNotified
}

/** After a new login the player's old mark goes (it would call the new login refused until the player's next refresh). */
export async function forgetRefusedLogin(): Promise<void> {
  await fsp.rm(PLAYER_AUTH_FLAG, { force: true }).catch(() => undefined)
}

function telegram(key: string, values: Record<string, string | number> = {}): void {
  try {
    const child = spawn('/usr/bin/python3', [TELEGRAM_SCRIPT, '--key', key, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)], {
      stdio: 'ignore',
    })
    child.on('error', (err) => console.warn(`${new Date().toLocaleString()}: [spotify-login] telegram: ${err.message}`))
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [spotify-login] telegram: ${(err as Error).message}`)
  }
}

const dayText = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/**
 * Once an hour (and a minute after the start): a login the box has no date for gets one (now, estimated - it was given
 * by the admin interface or before this version), the reminders 14 and 3 days before the end, and a message when the
 * player found the login refused. What was sent is kept with the login (config), so each goes once per login.
 */
export function startSpotifyLoginWatch(deps: {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}): void {
  const change = (fields: Spotify) =>
    deps.updateMupiboxConfig((cfg) => {
      const spotify = ((cfg.spotify as Spotify | undefined) ?? {}) as Spotify
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) delete spotify[k]
        else spotify[k] = v
      }
      cfg.spotify = spotify
    })
  const check = async () => {
    const cfg = deps.getMupiboxConfig()
    const sp = ((cfg?.spotify as Spotify | undefined) ?? {}) as Spotify
    const refresh = str(sp.refreshToken)
    if (!refresh) return
    const mark = loginMark(refresh)
    if (str(sp.authorizedTokenId) !== mark) {
      await change({ authorizedAt: new Date().toISOString(), authorizedTokenId: mark, authorizedEstimated: true, authRemindedDays: undefined, authInvalidNotified: undefined })
      console.log(`${new Date().toLocaleString()}: [spotify-login] a login without a date: counted from now`)
      return
    }
    // (messages only in the daytime, 9 to 20 o'clock: nothing to do at night - the next check in the morning sends them)
    const hour = new Date().getHours()
    if (hour < 9 || hour >= 20) return
    const age = await spotifyLoginAge(cfg)
    if (age.invalid) {
      // (a failed Smart-Sync run sends its own message, see spotify-sync/notify.ts: this one is for the player)
      const refused = await refusedSince(sp)
      if (refused.player && !refused.sync && sp.authInvalidNotified !== mark) {
        telegram('n_spotify_login_refused')
        await change({ authInvalidNotified: mark })
        console.log(`${new Date().toLocaleString()}: [spotify-login] Spotify refused the login: parents told`)
      }
      return
    }
    // (a login without a known date: its end may be near, a reminder by the estimate could come too late - asked once
    // to log in again instead, then the box knows)
    if (age.estimated) {
      if (sp.authUnknownNotified !== mark) {
        telegram('n_spotify_login_unknown')
        await change({ authUnknownNotified: mark })
        console.log(`${new Date().toLocaleString()}: [spotify-login] login date unknown: parents asked to log in again`)
      }
      return
    }
    if (age.daysLeft === null || !age.expiresAt) return
    const sent = typeof sp.authRemindedDays === 'number' ? sp.authRemindedDays : Number.POSITIVE_INFINITY
    const due = REMIND_DAYS.find((d) => age.daysLeft !== null && age.daysLeft <= d && d < sent)
    if (due === undefined) return
    telegram('n_spotify_login_expiring', { days: Math.max(0, age.daysLeft), date: dayText(age.expiresAt) })
    await change({ authRemindedDays: due })
    console.log(`${new Date().toLocaleString()}: [spotify-login] reminder: ${age.daysLeft} days left`)
  }
  const run = () =>
    void check().catch((err) => console.warn(`${new Date().toLocaleString()}: [spotify-login] ${(err as Error).message}`))
  setTimeout(run, 60_000).unref()
  setInterval(run, 3600_000).unref()
}
