import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import { CONSENT_VERSION, ERASE_URL, REPORT_URL, consentBelongsToDevice, primaryAudioDevice, reportDue, runStatisticsOnce } from './eltern/telemetry'

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

test('consented Classic report uses separate product and required fields, at most once daily', async () => {
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
