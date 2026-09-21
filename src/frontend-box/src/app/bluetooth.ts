export interface BluetoothDevice {
  mac: string
  name: string
}

export interface BluetoothPairedDevice extends BluetoothDevice {
  connected: boolean
}

export interface BluetoothStatus {
  powered: boolean
  paired: BluetoothPairedDevice[]
}
