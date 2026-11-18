import { execFile } from 'node:child_process'
import { pbkdf2Sync } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'

// save_config writes the WiFi configuration anew, readable by everyone (wpa_supplicant's umask): back to root only - it
// holds the key of every network. Everything that reads it goes through sudo. (While it is written, the folder keeps
// others out, see add_wifi.sh.)
export function wifiConfigPrivate(): Promise<void> {
  return new Promise((resolve) =>
    execFile('sudo', ['chmod', '600', '/etc/wpa_supplicant/wpa_supplicant.conf'], { timeout: 5000 }, (err) => {
      if (err) console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] WiFi configuration stays readable: ${err.message}`)
      resolve()
    }),
  )
}

/**
 * The network's name as wpa_cli prints it (list_networks, status, get_network): a character outside ASCII comes as
 * \xNN per byte, a backslash as \\. Decoded here to the name as the box's user wrote it.
 */
export function decodeWpaSsid(raw: string): string {
  const bytes: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && raw[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 2, i + 4))) {
      bytes.push(Number.parseInt(raw.slice(i + 2, i + 4), 16))
      i += 3
    } else if (raw[i] === '\\' && raw[i + 1] === '\\') {
      bytes.push(0x5c)
      i += 1
    } else if (raw[i] === '\\' && raw[i + 1] === '"') {
      bytes.push(0x22)
      i += 1
    } else {
      bytes.push(...Buffer.from(raw[i]))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

// wpa_cli's scan_results (the box's WiFi page, server.ts, and the app's scan, app-api/routes.ts)

export interface WifiScanEntry {
  signalDbm: number
  secured: boolean
  bands: string[] // "2.4", "5" (and "6"): every band the network is broadcast on
}

export function wifiBandOf(frequencyMhz: number): string | undefined {
  if (frequencyMhz >= 2400 && frequencyMhz < 2500) {
    return '2.4'
  }
  if (frequencyMhz >= 4900 && frequencyMhz < 5900) {
    return '5'
  }
  if (frequencyMhz >= 5925) {
    return '6'
  }
  return undefined
}

// "bssid / frequency / signal level / flags / ssid" per line; the strongest access
// point wins when a network is broadcast by several.
export function parseWpaCliScanResults(stdout: string): Map<string, WifiScanEntry> {
  const networks = new Map<string, WifiScanEntry>()
  for (const line of stdout.split('\n').slice(1)) {
    const parts = line.trim().split('\t')
    if (parts.length < 5) {
      continue
    }
    const signalDbm = Number.parseInt(parts[2], 10)
    const ssid = decodeWpaSsid(parts.slice(4).join('\t'))
    // Hidden networks show up with an empty or all-zero SSID.
    if (Number.isNaN(signalDbm) || ssid.replaceAll('\0', '').trim() === '') {
      continue
    }
    const band = wifiBandOf(Number.parseInt(parts[1], 10))
    const previous = networks.get(ssid)
    const bands = new Set(previous?.bands ?? [])
    if (band) {
      bands.add(band)
    }
    if (!previous || signalDbm > previous.signalDbm) {
      networks.set(ssid, { signalDbm, secured: /WPA|WEP|RSN/.test(parts[3]), bands: [...bands] })
    } else {
      previous.bands = [...bands]
    }
  }
  return networks
}

export type WifiKeyKind = 'psk' | 'sae' | 'both'

// The WiFi interface is the Pi's own (driver brcmfmac: Pi 3B+, 4, 5)? It cannot move to another access point of a WPA3
// network while it is connected (the authentication there times out; Raspberry Pi sets roamoff=1, the WPA3 handshake runs
// in wpa_supplicant) - see roams_badly in add_wifi.sh. A USB stick does.
export function wifiRoamsBadly(wifi: string): boolean {
  try {
    return basename(realpathSync(`/sys/class/net/${wifi}/device/driver`)) === 'brcmfmac'
  } catch {
    return false
  }
}

// What the network asks for by the flags of its access points in the scan ("[WPA2-PSK+SAE-CCMP][ESS]"); null when it
// is not in the scan (hidden, out of reach). A network that offers both is taken as WPA2 on the Pi's own WiFi
// (roamsBadly, see wifiRoamsBadly).
export function wifiKeyKindOf(stdout: string, ssid: string, roamsBadly = false): WifiKeyKind | null {
  let psk = false
  let sae = false
  for (const line of stdout.split('\n').slice(1)) {
    const parts = line.trim().split('\t')
    if (parts.length < 5 || decodeWpaSsid(parts.slice(4).join('\t')) !== ssid) continue
    if (/SAE/.test(parts[3])) sae = true
    if (/PSK/.test(parts[3])) psk = true
    if (!/SAE/.test(parts[3]) && !/PSK/.test(parts[3])) psk = true
  }
  if (!psk && !sae) return null
  if (sae && psk) return roamsBadly ? 'psk' : 'both'
  return sae ? 'sae' : 'psk'
}

// The commands that give a saved network its key. WPA3 cannot use the key worked out from the password that WPA2 keeps
// (psk): it needs the password itself (sae_password, here in hex: no character of it can break the command). A password
// with a quote and later a #: save_config writes it as it is, and that line would be cut when it is read again (a
// comment outside a quoted part) - such a password stays with WPA2; null where the network has nothing else.
// On the Pi's own WiFi (roamsBadly) WPA3 gets bgscan="" (no moving to another access point while connected; add_wifi.sh
// reconnects where the signal stays weak). A network that had it (quiet) and does not need it any more gets bgscan as the
// configuration sets it for all - wpa_cli cannot take the setting away from one network.
export const WIFI_BGSCAN = 'simple:30:-70:60'
export function wifiKeyCommands(
  id: string,
  kind: WifiKeyKind,
  ssid: Buffer,
  password: string,
  { quiet = false, roamsBadly = false }: { quiet?: boolean; roamsBadly?: boolean } = {},
): string[] | null {
  const usable = !/".*#/.test(password)
  if (kind === 'sae' && !usable) return null
  const effective: WifiKeyKind = usable ? kind : 'psk'
  const psk = pbkdf2Sync(password, ssid, 4096, 32, 'sha1').toString('hex')
  const sae = Buffer.from(password, 'utf8').toString('hex')
  const set = (name: string, value: string) => `set_network ${id} ${name} ${value}`
  const bgscan = effective !== 'psk' && roamsBadly ? [set('bgscan', '""')] : quiet ? [set('bgscan', `"${WIFI_BGSCAN}"`)] : []
  if (effective === 'psk') return [set('key_mgmt', 'WPA-PSK'), set('ieee80211w', '0'), set('sae_password', '""'), set('psk', psk), ...bgscan]
  if (effective === 'sae') return [set('key_mgmt', 'SAE'), set('ieee80211w', '2'), ...bgscan, set('sae_password', sae)]
  return [set('key_mgmt', 'WPA-PSK SAE'), set('ieee80211w', '1'), ...bgscan, set('psk', psk), set('sae_password', sae)]
}

// A new password for a saved network, for what the network asks for now (the router may have moved to WPA3); not in the
// scan: what the saved network was set up for. The commands go to wpa_cli by its input - sudo writes a command line into
// the system log, and this one holds the password. A network disabled because its old password failed (add_wifi.sh) is
// enabled again. Not saved here: the caller does that with what else it changes.
export async function wifiSetPassword(wifi: string, id: string, ssid: Buffer, password: string): Promise<boolean> {
  const cli = (args: string[]) =>
    new Promise<string>((resolve) => execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifi, ...args], { timeout: 5000 }, (err, out) => resolve(err ? '' : out)))
  const roamsBadly = wifiRoamsBadly(wifi)
  let kind = wifiKeyKindOf(await cli(['scan_results']), ssid.toString('utf8'), roamsBadly)
  if (!kind) {
    const saved = await cli(['get_network', id, 'key_mgmt'])
    kind = /SAE/.test(saved) ? (/WPA-PSK/.test(saved) ? 'both' : 'sae') : 'psk'
  }
  const quiet = (await cli(['get_network', id, 'bgscan'])).trim() === '""'
  const keys = wifiKeyCommands(id, kind, ssid, password, { quiet, roamsBadly })
  if (!keys) return false
  const commands = [...keys, `enable_network ${id}`]
  return new Promise<boolean>((resolve) => {
    const child = execFile('sudo', ['/usr/sbin/wpa_cli', '-i', wifi], { timeout: 5000 }, (err, out) => {
      resolve(!err && (out.match(/^(?:> ?)*OK\s*$/gm)?.length ?? 0) === commands.length && !/FAIL/.test(out))
    })
    child.stdin?.end(`${commands.join('\n')}\nquit\n`)
  })
}
