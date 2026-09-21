export interface Network {
  ip?: string
  host?: string
  onlinestate?: string
  wifi?: string
  wifilink?: string
  wifisignal?: string
  gateway?: string
  /** The WiFi adapter in use, e.g. wlan0 (onboard) or wlan1 (USB). */
  interface?: string
}
