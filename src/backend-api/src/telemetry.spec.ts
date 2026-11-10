import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import { CONSENT_VERSION, ERASE_URL, REPORT_URL, classicTelemetryVersion, consentBelongsToDevice, markNoticeShown, noticeState, primaryAudioDevice, reportDue, requestReportNow, runStatisticsOnce, setNoticeSwitches, setStatisticsConsent } from './eltern/telemetry'

const token = 'a'.repeat(64)
const device_proof = createHmac('sha256', token).update('0000000012345678').digest('hex')
function harness(initial: Record<string, unknown>) {
  const cfg: Record<string, unknown> = { mupibox: { version: '5.0.0', physicalDevice: 'rpi-bcm2835-3.5mm' }, ...initial }
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  const deps = {
    getMupiboxConfig: () => cfg,
    updateMupiboxConfig: async (mutate: (data: Record<string, unknown>) => void | false) => { mutate(cfg) },
    post: async (url: string, body: Record<string, unknown>) => { requests.push({ url, body }) },
    serial: () => '0000000012345678',
    now: () => new Date('2026-11-07T20:00:00Z'),
  }
  return { cfg, requests, deps }
}

test('opt-out sends no statistics and generates no device identifier', async () => {
  const { requests, deps } = harness({ installationStatistics: { enabled: false } })
  await runStatisticsOnce(deps)
  assert.equal(requests.length, 0)
})

test('current consent and valid token are required before any report is due', () => {
  const now = new Date('2026-11-07T20:00:00Z')
  assert.equal(reportDue({ enabled: true, token }, '5.0', now), false)
  assert.equal(reportDue({ enabled: false, token, consent_version: CONSENT_VERSION }, '5.0', now), false)
  assert.equal(reportDue({ enabled: true, token: 'bad', consent_version: CONSENT_VERSION }, '5.0', now), false)
  assert.equal(reportDue({ enabled: true, token, device_proof, consent_version: CONSENT_VERSION }, '5.0', now), true)
})

test('consented Classic report uses separate product and required fields, at most once monthly', async () => {
  const { cfg, requests, deps } = harness({
    installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION },
  })
  await runStatisticsOnce(deps)
  await runStatisticsOnce(deps)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, REPORT_URL)
  assert.equal(requests[0].body.product, 'classic')
  assert.equal(requests[0].body.consent, true)
  assert.equal(requests[0].body.consent_version, CONSENT_VERSION)
  assert.equal(requests[0].body.primary_audio_device, 'analog')
  assert.equal((cfg.installationStatistics as Record<string, unknown>).last_version, '5.0.0')
})

test('pending opt-out deletion is processed without reactivating reporting', async () => {
  const { cfg, requests, deps } = harness({
    installationStatistics: { enabled: false, token: '', consent_version: CONSENT_VERSION,
      pending_delete_tokens: [token] },
  })
  await runStatisticsOnce(deps)
  assert.deepEqual(requests.map(r => r.url), [ERASE_URL])
  assert.equal(requests[0].body.product, 'classic')
  assert.deepEqual((cfg.installationStatistics as Record<string, unknown>).pending_delete_tokens, [])
})

test('older consent is invalidated, its token erased, without transmitting hardware', async () => {
  const { cfg, requests, deps } = harness({
    installationStatistics: { enabled: true, token, consent_version: 'obsolete-v1' },
  })
  await runStatisticsOnce(deps)
  assert.deepEqual(requests.map(r => r.url), [ERASE_URL])
  assert.equal((cfg.installationStatistics as Record<string, unknown>).enabled, false)
})

test('configured main soundcard is used even when the active route is different', () => {
  assert.equal(primaryAudioDevice({ mupibox: { physicalDevice: 'HiFiBerry MiniAmp' } }), 'hifiberry')
  assert.equal(primaryAudioDevice({ mupibox: { physicalDevice: 'MAX98357A bcm2835-i2s-HiFi HiFi-0' } }), 'i2s-other')
  assert.equal(primaryAudioDevice({ mupihat: { hat_active: true } }), 'mupihat')
  assert.equal(primaryAudioDevice({ mupibox: { physicalDevice: 'rpi-bcm2835-hdmi' } }), 'hdmi')
})

test('a restored Classic configuration does not authorize another Raspberry Pi', async () => {
  const { cfg, requests, deps } = harness({
    installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION },
  })
  assert.equal(consentBelongsToDevice({ enabled: true, token, device_proof }, '0000000099999999'), false)
  await runStatisticsOnce({ ...deps, serial: () => '0000000099999999' })
  assert.equal(requests.length, 0)
  assert.equal((cfg.installationStatistics as Record<string, unknown>).enabled, false)
})

test('background reports stay monthly even when software version changes', () => {
  const now = new Date('2026-11-07T20:00:00Z')
  const state = {
    enabled: true, token, consent_version: CONSENT_VERSION, device_proof,
    last_report: '2026-11-01T08:30:00Z', last_version: '5.0.0'
  }
  assert.equal(reportDue(state, '5.0.1', now), false)
  assert.equal(reportDue(state, '5.0.1', now, true), true)
  assert.equal(reportDue({ ...state, last_report: '2026-10-31T23:00:00Z' }, '5.0.1', now), true)
})

// ---------- the parents' app: consent and monthly notices ----------
function appHarness(initial: Record<string, unknown> = {}) {
  const cfg: Record<string, unknown> = { mupibox: { version: '5.0.15' }, ...initial }
  let runs = 0
  const deps = { getMupiboxConfig: () => cfg, updateMupiboxConfig: async (mutate: (data: Record<string, unknown>) => void) => { mutate(cfg) } }
  return { cfg, deps, run: () => { runs++ }, runs: () => runs }
}
const stat = (cfg: Record<string, unknown>) => cfg.installationStatistics as Record<string, unknown>

test('app: both monthly notices are due on a fresh box, and not again in the month they were shown', async () => {
  const { cfg, deps } = appHarness()
  const now = new Date('2026-11-09T10:00:00Z')
  let s = noticeState(cfg, now)
  assert.equal(s.donation.due, true)
  assert.equal(s.statistics.due, true)
  assert.equal(s.statistics.enabled, false)
  await markNoticeShown(deps, 'donation', now)
  await markNoticeShown(deps, 'statistics', now)
  s = noticeState(cfg, now)
  assert.equal(s.donation.due, false)
  assert.equal(s.statistics.due, false)
  // (the next month: due again)
  s = noticeState(cfg, new Date('2026-12-01T00:00:01Z'))
  assert.equal(s.donation.due, true)
  assert.equal(s.statistics.due, true)
})

test('app: switched-off notices are never due and switching them never touches the consent', async () => {
  const { cfg, deps } = appHarness({ installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION } })
  await setNoticeSwitches(deps, { donationPopup: false, statisticsPopup: false })
  const s = noticeState(cfg)
  assert.equal(s.donation.due, false)
  assert.equal(s.statistics.due, false)
  assert.equal(s.statistics.enabled, true)
  assert.equal(stat(cfg).token, token)
})

test('app: the statistics notice is not due while the consent is on', () => {
  const s = noticeState({ installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION } })
  assert.equal(s.statistics.due, false)
})

test('app: consent on binds a new token to the serial and asks for a report; the state shows no token', async () => {
  const { cfg, deps, run, runs } = appHarness()
  const r = await setStatisticsConsent(deps, true, { serial: () => '0000000012345678', run })
  assert.deepEqual(r, { enabled: true })
  const st = stat(cfg)
  assert.match(String(st.token), /^[a-f0-9]{64}$/)
  assert.equal(st.consent_version, CONSENT_VERSION)
  assert.equal(st.send_now, true)
  assert.equal(consentBelongsToDevice(st, '0000000012345678'), true)
  assert.equal(runs(), 1)
  assert.equal(JSON.stringify(noticeState(cfg)).includes(String(st.token)), false)
  // (on again: the same token stays)
  await setStatisticsConsent(deps, true, { serial: () => '0000000012345678', run })
  assert.equal(stat(cfg).token, st.token)
})

test('app: consent off queues the old token for deletion, without a serial no consent', async () => {
  const { cfg, deps, run } = appHarness({ installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION } })
  await setStatisticsConsent(deps, false, { serial: () => '0000000012345678', run, now: new Date('2026-11-09T10:00:00Z') })
  const st = stat(cfg)
  assert.equal(st.enabled, false)
  assert.equal(st.token, '')
  assert.deepEqual(st.pending_delete_tokens, [token])
  assert.equal(st.last_reminder_month, '2026-11')
  assert.equal(noticeState(cfg).statistics.pendingDelete, true)
  const none = appHarness()
  const r = await setStatisticsConsent(none.deps, true, { serial: () => null, run: none.run })
  assert.deepEqual(r, { enabled: false, error: 'serial_unavailable' })
  assert.equal(stat(none.cfg).enabled, false)
})

test('app: a consent restored from another Pi is renewed with a new token, the old one is not queued', async () => {
  const { cfg, deps, run } = appHarness({ installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION } })
  await setStatisticsConsent(deps, true, { serial: () => 'ffffffff87654321', run })
  const st = stat(cfg)
  assert.notEqual(st.token, token)
  assert.deepEqual(st.pending_delete_tokens, [])
  assert.equal(consentBelongsToDevice(st, 'ffffffff87654321'), true)
})

test('app: report now only with a current consent', async () => {
  const off = appHarness()
  assert.equal(await requestReportNow(off.deps, off.run), false)
  assert.equal(off.runs(), 0)
  const on = appHarness({ installationStatistics: { enabled: true, token, device_proof, consent_version: CONSENT_VERSION } })
  assert.equal(await requestReportNow(on.deps, on.run), true)
  assert.equal(stat(on.cfg).send_now, true)
  assert.equal(on.runs(), 1)
})

test('Classic telemetry normalises an installed version with release channel', () => {
  assert.equal(classicTelemetryVersion({ mupibox: { version: '5.0.15 dev' } }), '5.0.15-dev')
  assert.equal(classicTelemetryVersion({ mupibox: { version: '5.0.15 beta' } }), '5.0.15-beta')
  assert.equal(classicTelemetryVersion({ mupibox: { version: '5.0.15' } }), '5.0.15')
  assert.equal(classicTelemetryVersion({ mupibox: { version: '' } }), 'unknown')
})
