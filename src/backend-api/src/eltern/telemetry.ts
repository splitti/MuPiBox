// Voluntary Classic installation statistics, compatible with the NG statistics server.
// Nothing is collected or transmitted without an explicit, current consent.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const CONSENT_VERSION = '2026-11-07-v2'
export const REPORT_URL = 'https://stat.mupibox.de/api/v1/report.php'
export const ERASE_URL = 'https://stat.mupibox.de/api/v1/erase.php'

type State = {
  enabled?: boolean
  consent_version?: string
  token?: string
  device_proof?: string
  pending_delete_tokens?: string[]
  last_report?: string
  last_version?: string
  last_reminder_month?: string
  last_error?: string
  send_now?: boolean
  last_attempt?: string
  onoffshim_state?: 'yes' | 'no' | 'unknown'
}
type Config = Record<string, unknown> & {
  installationStatistics?: State
  mupibox?: Record<string, unknown>
  mupihat?: Record<string, unknown>
}
type Deps = {
  getMupiboxConfig: () => unknown
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void | false) => Promise<void>
  post?: (url: string, body: Record<string, unknown>) => Promise<void>
  now?: () => Date
  serial?: () => string | null
}
const validToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
const validSerial = (serial: string): boolean => /^[a-f0-9]{8,32}$/.test(serial)
const statState = (cfg?: Config): State => cfg?.installationStatistics ?? {}
const utcDay = (date: Date): string => date.toISOString()
const load = (file: string): string => {
  try { return fs.readFileSync(file, 'utf8').replace(/\0/g, '').trim() } catch { return '' }
}
const bool = (value: boolean): 'yes' | 'no' => value ? 'yes' : 'no'
const yesNo = (value: unknown): 'yes' | 'no' | 'unknown' =>
  value === true ? 'yes' : value === false ? 'no' : 'unknown'

export function piSerial(): string | null {
  for (const file of ['/proc/device-tree/serial-number', '/sys/firmware/devicetree/base/serial-number']) {
    const value = load(file).toLowerCase().replace(/^0x/, '')
    if (validSerial(value)) return value
  }
  const match = /^Serial\s*:\s*([a-f0-9]+)\s*$/im.exec(load('/proc/cpuinfo'))
  return match && validSerial(match[1]) ? match[1].toLowerCase() : null
}
const safe = (value: string, pattern: RegExp, fallback = 'unknown'): string =>
  pattern.test(value) ? value : fallback
const first = (value: string): string => value.split('\n', 1)[0].trim()

/** Classic's updater writes "DEV 5.0.16 2026-11-10" for dev tags.
 * Accept that actual on-device format, as well as "5.0.16 stable".
 * The server's software_version field only accepts a single safe word. */
export function classicTelemetryVersion(cfg?: Config): string {
  const raw = String(cfg?.mupibox?.version ?? '').trim()
  if (/^[a-zA-Z0-9._+\-]{1,64}$/.test(raw)) return raw
  const dev = /^DEV\s+(\d{1,4}\.\d{1,4}(?:\.\d{1,4})?)(?:\s|$)/i.exec(raw)
  if (dev) return dev[1] + '-dev'
  const match = /^(\d{1,4}\.\d{1,4}(?:\.\d{1,4})?)(?:\s+(stable|beta|dev|alpha))?(?:\s|$)/i.exec(raw)
  if (!match) return 'unknown'
  return match[1] + (match[2] ? '-' + match[2].toLowerCase() : '')
}

export function primaryAudioDevice(cfg?: Config): string {
  const selected = String(cfg?.mupibox?.physicalDevice ?? '').toLowerCase()
  if (cfg?.mupihat?.hat_active === true || /mupihat/.test(selected)) return 'mupihat'
  if (/hifiberry/.test(selected)) return 'hifiberry'
  if (/adafruit/.test(selected)) return 'adafruit'
  if (/max98357/.test(selected)) return 'i2s-other'
  if (/usb-dac|usb/.test(selected)) return 'usb'
  if (/hdmi/.test(selected)) return 'hdmi'
  if (/3\.5mm|headphones|analog/.test(selected)) return 'analog'
  if (selected && selected !== 'none') return 'i2s-other'
  return 'unknown'
}
function displaySize(): string {
  try {
    const drm = '/sys/class/drm'
    for (const entry of fs.readdirSync(drm)) {
      if (!/^card\d+-/.test(entry)) continue
      const m = first(load(path.join(drm, entry, 'modes')))
      if (/^[1-9]\d{2,4}x[1-9]\d{2,4}$/.test(m)) return m
    }
  } catch { /* e.g. headless Pi */ }
  return 'unknown'
}
function presence(patterns: RegExp[], globDir: string, fileName: string): boolean {
  try {
    return fs.readdirSync(globDir).some(entry => patterns.some(p =>
      p.test(load(path.join(globDir, entry, fileName)).toLowerCase())))
  } catch { return false }
}
function videoCamera(): boolean {
  try {
    return fs.readdirSync('/sys/class/video4linux').some(entry => {
      const name = load('/sys/class/video4linux/' + entry + '/name').toLowerCase()
      let device = ''
      try { device = fs.realpathSync('/sys/class/video4linux/' + entry + '/device').toLowerCase() } catch {}
      return /camera|uvc|webcam|usb/.test(name) || device.includes('/usb')
    })
  } catch { return false }
}
export function hardwarePayload(cfg?: Config): Record<string, unknown> {
  let model = load('/proc/device-tree/model') || load('/sys/firmware/devicetree/base/model')
  model = model.split(' Rev ')[0]
  const osLine = /^ID=(.+)$/m.exec(load('/etc/os-release'))
  let osName = safe((osLine?.[1] ?? '').replace(/['"]/g, ''), /^[a-zA-Z0-9._+\-]{1,48}$/)
  if (fs.existsSync('/boot/dietpi')) osName = 'dietpi'
  const debian = safe(load('/etc/debian_version').split('.')[0], /^\d{1,3}$/)
  model = safe(model, /^[a-zA-Z0-9 ._+()\-]{1,80}$/)
  const audioCards = load('/proc/asound/cards').toLowerCase()
  let audio = 'unknown'
  if (/hifiberry|i2s|snd_rpi/.test(audioCards)) audio = 'i2s'
  else if (/usb/.test(audioCards)) audio = 'usb'
  else if (/hdmi/.test(audioCards)) audio = 'hdmi'
  else if (/analog|headphones/.test(audioCards)) audio = 'analog'
  else if (audioCards) audio = 'other'
  const primary = primaryAudioDevice(cfg)
  if (primary === 'mupihat' || primary === 'hifiberry' || primary === 'adafruit' || primary === 'i2s-other') audio = 'i2s'
  else if (primary === 'usb' || primary === 'hdmi' || primary === 'analog') audio = primary
  let joystick = false
  try { joystick = fs.readdirSync('/dev/input').some(x => /^js\d+$/.test(x)) } catch {}
  const controller = joystick || presence([/gamepad|controller|joystick/], '/sys/class/input', 'device/name')
  const mux = cfg?.mupibox ?? {}
  const route = typeof mux.audioRoute === 'string' && /^(local|bluetooth|music-assistant)$/.test(mux.audioRoute) ? mux.audioRoute : 'unknown'
  const hat = cfg?.mupihat?.hat_active === true
  // Classic has no explicit on/off setting for OnOff SHIM: do not infer presence from GPIO.
  const shim = statState(cfg).onoffshim_state
  return {
    pi_model: model, os_name: osName, debian_major: debian,
    display_size: displaySize(), audio_category: audio,
    audio_route: route, primary_audio_device: primary,
    mupihat_state: bool(hat), hifiberry_state: primary === 'hifiberry' ? 'yes' : 'unknown',
    onoffshim_state: yesNo(shim === 'yes' ? true : shim === 'no' ? false : undefined),
    controller, webcam: videoCamera(),
  }
}
export function consentBelongsToDevice(state: State, serial: string | null): boolean {
  if (!serial || !validToken(state.token) || typeof state.device_proof !== 'string' ||
      !/^[a-f0-9]{64}$/.test(state.device_proof)) return false
  const expected = createHmac('sha256', state.token).update(serial).digest()
  return timingSafeEqual(expected, Buffer.from(state.device_proof, 'hex'))
}

export function reportDue(state: State, _version: string, now: Date, forced = false): boolean {
  if (state.enabled !== true || state.consent_version !== CONSENT_VERSION || !validToken(state.token)) return false
  if (forced || state.send_now === true) return true
  // This runs without an open Admin UI and is limited to one report per UTC month.
  const last = Date.parse(state.last_report ?? '')
  return !Number.isFinite(last) || new Date(last).toISOString().slice(0, 7) !== now.toISOString().slice(0, 7)
}

async function defaultPost(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'MuPiBox-Classic-Stat/1' },
    body: JSON.stringify(body),
  })
  if (response.status !== 204) throw new Error('HTTP ' + response.status)
}

let inFlight = false
export async function runStatisticsOnce(deps: Deps): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const now = (deps.now ?? (() => new Date()))()
    const post = deps.post ?? defaultPost
    const initial = deps.getMupiboxConfig() as Config | undefined
    if (!initial) return
    let state = statState(initial)
    const update = (patch: Partial<State>, when?: (s: State) => boolean) =>
      deps.updateMupiboxConfig(cfg => {
        const current = (cfg.installationStatistics ?? {}) as State
        if (when && !when(current)) return false
        cfg.installationStatistics = { ...current, ...patch }
      })
    // A changed collection disclosure invalidates older consent and queues erasure.
    if (state.enabled === true && state.consent_version !== CONSENT_VERSION) {
      await deps.updateMupiboxConfig(cfg => {
        const current = (cfg.installationStatistics ?? {}) as State
        if (current.enabled !== true || current.consent_version === CONSENT_VERSION) return false
        const pending = [...(current.pending_delete_tokens ?? [])]
        if (validToken(current.token) && !pending.includes(current.token)) pending.push(current.token)
        cfg.installationStatistics = {
          ...current, enabled: false, token: '', device_proof: '', consent_version: CONSENT_VERSION,
          last_report: '', last_version: '', pending_delete_tokens: pending,
        }
      })
    }
    state = statState(deps.getMupiboxConfig() as Config | undefined)
    const pending = [...(state.pending_delete_tokens ?? [])].filter(validToken)
    if (pending.length) {
      const serial = (deps.serial ?? piSerial)()
      if (!serial) { await update({ last_error: 'Raspberry Pi serial unavailable for deletion' }); return }
      for (const token of pending) {
        try { await post(ERASE_URL, { product: 'classic', serial, token }) }
        catch { await update({ last_error: 'Deletion request unsuccessful' }); return }
        // Each deletion is committed separately. Never lose another pending token.
        await deps.updateMupiboxConfig(cfg => {
          const old = (cfg.installationStatistics ?? {}) as State
          cfg.installationStatistics = {
            ...old,
            pending_delete_tokens: (old.pending_delete_tokens ?? []).filter(t => t !== token),
            last_error: '',
          }
        })
      }
    }
    const config = deps.getMupiboxConfig() as Config | undefined
    state = statState(config)
    const version = classicTelemetryVersion(config)
    if (!reportDue(state, version, now)) return
    const lastAttempt = Date.parse(state.last_attempt ?? '')
    if (state.send_now !== true && Number.isFinite(lastAttempt) &&
        now.getTime() - lastAttempt < 10 * 60 * 1000) return
    if (!validToken(state.token)) return
    const token = state.token
    const serial = (deps.serial ?? piSerial)()
    if (!serial) { await update({ last_error: 'Raspberry Pi serial unavailable' }); return }
    if (!consentBelongsToDevice(state, serial)) {
      // A restored configuration on another Pi never inherits opt-in.
      await update({
        enabled: false, token: '', device_proof: '', send_now: false,
        last_report: '', last_version: '', last_error: 'Consent not valid for this device',
      }, s => s.enabled === true && s.token === token)
      return
    }
    await update({ last_attempt: utcDay(now), send_now: false },
      s => s.enabled === true && s.token === token && s.consent_version === CONSENT_VERSION)
    // Recheck after the awaited write. An admin may have revoked consent.
    const newest = statState(deps.getMupiboxConfig() as Config | undefined)
    if (newest.enabled !== true || newest.token !== token || newest.consent_version !== CONSENT_VERSION) return
    try {
      await post(REPORT_URL, {
        product: 'classic', consent: true, consent_version: CONSENT_VERSION,
        serial, token, version, ...hardwarePayload(config),
      })
      await update({ last_report: utcDay(now), last_version: version, last_error: '' },
        s => s.enabled === true && s.token === token && s.consent_version === CONSENT_VERSION)
    } catch {
      await update({ last_error: 'Statistics server unavailable' }, s => s.token === token)
    }
  } catch (error) {
    console.warn('[MuPiBox-Classic-Stat] Could not process voluntary statistics:', error instanceof Error ? error.message : error)
  } finally {
    inFlight = false
  }
}
let liveDeps: Deps | null = null
/** A report or a deletion right now (after the consent changed in the app), with the deps of the running server. */
export function runStatisticsNow(): void {
  if (liveDeps) void runStatisticsOnce(liveDeps)
}

export function startInstallationStatistics(deps: Deps): void {
  liveDeps = deps
  const tick = () => void runStatisticsOnce(deps)
  setTimeout(tick, 30_000).unref()
  setInterval(tick, 5 * 60_000).unref()
}

// ---------- the parents' app: the consent and the monthly notices (as the admin interface: admin.php, statistics_reminder.php) ----------

export const DONATION_URL = 'https://mupibox.de/spenden/'
export const PRIVACY_URL = 'https://stat.mupibox.de/datenschutz/'
type Notices = { donation_popup_enabled?: boolean; statistics_popup_enabled?: boolean; last_donation_month?: string }
type ConfigDeps = {
  getMupiboxConfig: () => unknown
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}
const utcMonth = (now: Date): string => now.toISOString().slice(0, 7)
const noticesOf = (cfg?: Config): Notices => {
  const n = (cfg as { adminNotices?: unknown } | undefined)?.adminNotices
  return n && typeof n === 'object' ? (n as Notices) : {}
}
const consentActive = (state: State): boolean => state.enabled === true && state.consent_version === CONSENT_VERSION

export interface NoticeState {
  donation: { popup: boolean; due: boolean; url: string }
  statistics: { popup: boolean; due: boolean; enabled: boolean; lastReport: string; lastError: string; pendingDelete: boolean; privacyUrl: string }
}
/** What the app shows: the switches, whether a monthly notice is due, the state of the consent (no token, no serial). */
export function noticeState(cfg: unknown, now = new Date()): NoticeState {
  const config = cfg as Config | undefined
  const notices = noticesOf(config)
  const state = statState(config)
  const month = utcMonth(now)
  const donationPopup = notices.donation_popup_enabled !== false
  const statisticsPopup = notices.statistics_popup_enabled !== false
  const active = consentActive(state)
  return {
    donation: { popup: donationPopup, due: donationPopup && notices.last_donation_month !== month, url: DONATION_URL },
    statistics: {
      popup: statisticsPopup,
      due: statisticsPopup && !active && state.last_reminder_month !== month,
      enabled: active,
      lastReport: typeof state.last_report === 'string' ? state.last_report : '',
      lastError: typeof state.last_error === 'string' ? state.last_error : '',
      pendingDelete: (state.pending_delete_tokens ?? []).some(validToken),
      privacyUrl: PRIVACY_URL,
    },
  }
}

/** A monthly notice was shown: not again this month (on any device - the month is kept in the box's configuration). */
export async function markNoticeShown(deps: ConfigDeps, kind: 'donation' | 'statistics', now = new Date()): Promise<void> {
  const month = utcMonth(now)
  await deps.updateMupiboxConfig((cfg) => {
    const c = cfg as Config
    const notices = { ...noticesOf(c) }
    if (kind === 'donation') {
      if (notices.donation_popup_enabled === false) return
      cfg.adminNotices = { ...notices, last_donation_month: month }
    } else {
      const state = statState(c)
      if (notices.statistics_popup_enabled === false || consentActive(state)) return
      c.installationStatistics = { ...state, last_reminder_month: month }
    }
  })
}

/** The two switches of the monthly notices; they never change the consent itself. */
export async function setNoticeSwitches(deps: ConfigDeps, set: { donationPopup?: boolean; statisticsPopup?: boolean }): Promise<void> {
  await deps.updateMupiboxConfig((cfg) => {
    const notices = { ...noticesOf(cfg as Config) }
    if (set.donationPopup !== undefined) notices.donation_popup_enabled = set.donationPopup
    if (set.statisticsPopup !== undefined) notices.statistics_popup_enabled = set.statisticsPopup
    cfg.adminNotices = notices
  })
}

/**
 * The consent switched on or off (admin.php "classic_stat_save"): on - a new random token bound to this Pi's serial (a
 * configuration restored on another Pi never carries it over); off - the token goes to the deletion list, the server is
 * asked to remove what it has. Then the report or the deletion runs at once.
 */
export async function setStatisticsConsent(
  deps: ConfigDeps,
  enabled: boolean,
  options: { serial?: () => string | null; now?: Date; run?: () => void } = {},
): Promise<{ enabled: boolean; error?: 'serial_unavailable' }> {
  const serial = (options.serial ?? piSerial)()
  const month = utcMonth(options.now ?? new Date())
  let result: { enabled: boolean; error?: 'serial_unavailable' } = { enabled }
  await deps.updateMupiboxConfig((cfg) => {
    const c = cfg as Config
    const stat: State = { ...statState(c) }
    const oldToken = stat.token ?? ''
    const pending = (stat.pending_delete_tokens ?? []).filter(validToken)
    const currentValid = consentActive(stat) && validToken(oldToken) && consentBelongsToDevice(stat, serial)
    let on = enabled
    if (!on || !currentValid) {
      // (a consent given before is withdrawn or renewed: what the server has of it is deleted)
      if (currentValid && !pending.includes(oldToken)) pending.push(oldToken)
      if (on && !serial) {
        on = false
        result = { enabled: false, error: 'serial_unavailable' }
      }
      stat.token = on ? randomBytes(32).toString('hex') : ''
      stat.device_proof = on && serial ? createHmac('sha256', stat.token).update(serial).digest('hex') : ''
      stat.last_report = ''
      stat.last_version = ''
      stat.last_attempt = ''
    }
    stat.enabled = on
    stat.consent_version = CONSENT_VERSION
    stat.pending_delete_tokens = [...new Set(pending)]
    stat.send_now = on
    stat.last_error = ''
    if (!on) stat.last_reminder_month = month
    c.installationStatistics = stat
  })
  ;(options.run ?? runStatisticsNow)()
  return result
}

/** "Jetzt melden": the report once more, now (only with a current consent). */
export async function requestReportNow(deps: ConfigDeps, run: () => void = runStatisticsNow): Promise<boolean> {
  let ok = false
  await deps.updateMupiboxConfig((cfg) => {
    const c = cfg as Config
    const state = statState(c)
    if (!consentActive(state)) return
    c.installationStatistics = { ...state, send_now: true }
    ok = true
  })
  if (ok) run()
  return ok
}
