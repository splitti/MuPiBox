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
    } else {
      bytes.push(...Buffer.from(raw[i]))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

// wpa_cli's scan_results (the box's WiFi page, server.ts, and the app's scan, eltern/routes.ts)

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
