import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeWpaSsid, wifiKeyCommands, wifiKeyKindOf } from './wpa-ssid'

const scan = (...rows: [string, string][]) =>
  ['bssid / frequency / signal level / flags / ssid', ...rows.map(([flags, ssid], i) => `aa:bb:cc:dd:ee:0${i}\t2437\t-60\t${flags}\t${ssid}`)].join('\n')

test('the kind of key comes from the flags of the access points of that network', () => {
  assert.equal(wifiKeyKindOf(scan(['[WPA2-PSK-CCMP][ESS]', 'Home']), 'Home'), 'psk')
  assert.equal(wifiKeyKindOf(scan(['[WPA2-SAE-CCMP][ESS]', 'Home']), 'Home'), 'sae')
  assert.equal(wifiKeyKindOf(scan(['[WPA2-PSK+SAE-CCMP][ESS]', 'Home']), 'Home'), 'both')
  // the Pi's own WiFi: offering both is WPA2
  assert.equal(wifiKeyKindOf(scan(['[WPA2-PSK+SAE-CCMP][ESS]', 'Home']), 'Home', true), 'psk')
  assert.equal(wifiKeyKindOf(scan(['[WPA2-SAE-CCMP][ESS]', 'Home']), 'Home', true), 'sae')
  // one access point each
  assert.equal(wifiKeyKindOf(scan(['[WPA2-PSK-CCMP][ESS]', 'Home'], ['[WPA2-SAE-CCMP][ESS]', 'Home']), 'Home'), 'both')
  // another network of the list says nothing about this one
  assert.equal(wifiKeyKindOf(scan(['[WPA2-SAE-CCMP][ESS]', 'Other'], ['[WPA2-PSK-CCMP][ESS]', 'Home']), 'Home'), 'psk')
})

test('a network that is not in the scan has no kind', () => {
  assert.equal(wifiKeyKindOf(scan(['[WPA2-SAE-CCMP][ESS]', 'Other']), 'Home'), null)
})

test('names with an umlaut and a quote are found as wpa_cli prints them', () => {
  assert.equal(decodeWpaSsid('M\\xc3\\xbcller \\"5\\"'), 'Müller "5"')
  assert.equal(wifiKeyKindOf(scan(['[WPA2-SAE-CCMP][ESS]', 'M\\xc3\\xbcller']), 'Müller'), 'sae')
})

test('WPA2 keeps the worked out key only, WPA3 gets the password in hex', () => {
  const ssid = Buffer.from('Home')
  const psk = wifiKeyCommands('3', 'psk', ssid, 'password1')
  assert.ok(psk?.includes('set_network 3 key_mgmt WPA-PSK'))
  assert.ok(psk?.includes('set_network 3 sae_password ""'), 'a password of before does not stay')
  assert.ok(psk?.every((c) => !c.includes(Buffer.from('password1').toString('hex'))))
  const sae = wifiKeyCommands('3', 'sae', ssid, 'password1')
  assert.ok(sae?.includes(`set_network 3 sae_password ${Buffer.from('password1').toString('hex')}`))
  assert.ok(sae?.includes('set_network 3 ieee80211w 2'))
  assert.ok(!sae?.some((c) => c.includes('bgscan')), 'a USB stick moves between access points with WPA3 too')
  assert.ok(wifiKeyCommands('3', 'sae', ssid, 'password1', { roamsBadly: true })?.includes('set_network 3 bgscan ""'), 'on the Pi own WiFi: no moving while connected')
  assert.ok(!psk?.some((c) => c.includes('bgscan')), 'WPA2 keeps the bgscan of the configuration')
  assert.ok(wifiKeyCommands('3', 'psk', ssid, 'password1', { quiet: true, roamsBadly: true })?.includes('set_network 3 bgscan "simple:30:-70:60"'), 'back from WPA3')
  assert.ok(wifiKeyCommands('3', 'sae', ssid, 'password1', { quiet: true })?.includes('set_network 3 bgscan "simple:30:-70:60"'), 'moved to a USB stick')
  assert.ok(sae?.every((c) => !c.includes('password1')), 'never as plain text in a command')
  const both = wifiKeyCommands('3', 'both', ssid, 'password1')
  assert.ok(both?.includes('set_network 3 key_mgmt WPA-PSK SAE'))
  assert.ok(both?.includes('set_network 3 ieee80211w 1'))
})

test('a password with a quote and later a # stays with WPA2, or is refused without it', () => {
  const ssid = Buffer.from('Home')
  assert.ok(wifiKeyCommands('3', 'both', ssid, 'ab"cd#ef')?.includes('set_network 3 key_mgmt WPA-PSK'))
  assert.equal(wifiKeyCommands('3', 'sae', ssid, 'ab"cd#ef'), null)
  assert.ok(wifiKeyCommands('3', 'sae', ssid, 'ab#cd"ef'), 'the other order reads fine')
})
