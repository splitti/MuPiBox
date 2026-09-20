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
}

export interface WifiConfiguredNetwork {
  id: number
  ssid: string
  current: boolean
}
