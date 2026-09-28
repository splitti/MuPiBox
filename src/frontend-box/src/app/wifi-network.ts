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
}

/** Whether the onboard WiFi radio is on or off (rfkill), independent of a USB WiFi adapter. */
export interface OnboardWifiStatus {
  /** False when the box has no onboard WiFi adapter at all. */
  available: boolean
  enabled: boolean
}
