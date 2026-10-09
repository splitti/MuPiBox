/** A network from the merged list: in range (with signal) and/or saved on the box. */
export interface WifiNetwork {
  ssid: string
  /** Set for networks that are saved on the box. */
  id?: number
  current: boolean
  available: boolean
  signalDbm?: number
  /** Signal strength in percent, only for networks in range. */
  signal?: number
  secured?: boolean
  /** Bands the network is available on: "2.4", "5" (and "6"). */
  bands?: string[]
  /** The band in use, for the connected network only. */
  connectedBand?: string
  /** Saved networks: the band the box may use ('auto' = both). */
  band?: WifiBandChoice
}

export type WifiBandChoice = 'auto' | '2.4' | '5'

/** The WiFi link right now (not the 30-second old network.json). */
export interface WifiStatus {
  interface: string
  /** wpa_supplicant state: COMPLETED = connected; SCANNING, ASSOCIATING ... while it connects. */
  state: string
  ssid?: string
  band?: string
  ip?: string
  gateway?: string
  signalDbm?: number
  signal?: number
}

export interface WifiConfiguredNetwork {
  id: number
  ssid: string
  current: boolean
}

/** Which link carries the default route right now. */
export interface NetworkLink {
  type: 'wifi' | 'ethernet' | 'none'
  interface?: string
}

/** The ethernet stanza of /etc/network/interfaces, for the LAN view of the WiFi settings page. */
export interface EthernetConfig {
  interface: string
  dhcp: boolean
  ip: string
  mask: string
  gateway: string
  dns: string
  /** The live address/gateway, may differ from ip/gateway right after a config change until restart. */
  currentIp?: string
  currentGateway?: string
  /** Whether the port itself is administratively up (see /api/network/ethernet/power). */
  linkUp?: boolean
  /** A cable with a link (null: not known, the port is down). */
  carrier?: boolean | null
  /** Switched off with /api/network/ethernet/power: stays down, also after a restart. */
  off?: boolean
}

/** Whether the onboard WiFi radio is on or off (rfkill), independent of a USB WiFi adapter. */
export interface OnboardWifiStatus {
  /** False when the box has no onboard WiFi adapter at all (one switched off at the start counts as there). */
  available: boolean
  enabled: boolean
  /** Switched off at the start (the app's switch): on comes after a restart. */
  bootDisabled?: boolean
}

/** A fixed address for one saved WiFi network (see backend eltern/wifi-static.ts); paused: taken back to DHCP. */
export interface WifiStaticAddress {
  ip: string
  mask: string
  gateway: string
  dns: string
  paused?: boolean
}

/** GET /api/wifi/static: the networks with a fixed address by name, and the one last taken back to DHCP */
export interface WifiStaticState {
  networks: Record<string, WifiStaticAddress>
  reverted?: { ssid: string; at: number }
}

/** One check of the test before saving a fixed address (network, own, free, router, dns) */
export interface WifiStaticCheck {
  id: string
  ok: boolean
  warn?: boolean
}
