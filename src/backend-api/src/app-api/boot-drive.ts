// The drive the box runs from: SD card, USB stick / SSD or NVMe, and for USB how fast it is connected. A stick in one of
// the Pi's black USB 2.0 ports is many times slower than in a blue USB 3.0 port - the box starts slowly, and with little
// memory every bit swapped out stalls it (a box with 1 GB stuttered for seconds at each start of Spotify). Read from
// sysfs only, no shell-out.
import { readdirSync, readFileSync, realpathSync } from 'node:fs'

export interface BootDrive {
  kind: 'sd' | 'usb' | 'nvme' | 'other'
  /** USB only: the speed it runs at (Mbit/s: 480 = USB 2.0, 5000 = USB 3.0) and the USB version the drive can do */
  usbSpeed?: number
  usbVersion?: number
  /**
   * usb2-port: a USB 3 drive running at USB 2.0 speed (in a black port, or behind a USB 2.0 hub or cable);
   * usb2-drive: the drive itself can do USB 2.0 only. Both only where the Pi has USB 3.0 ports at all (Pi 4 and later).
   */
  hint?: 'usb2-port' | 'usb2-drive'
}

const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Whether the Pi has a USB 3.0 root hub (a Pi 3 has USB 2.0 only: nothing to move the stick to). */
function hasUsb3Port(): boolean {
  try {
    return readdirSync('/sys/bus/usb/devices')
      .filter((d) => /^usb\d+$/.test(d))
      .some((d) => Number(read(`/sys/bus/usb/devices/${d}/speed`)) >= 5000)
  } catch {
    return false
  }
}

/**
 * The USB device a sysfs path hangs on: the nearest directory above it with a speed and a version
 * (e.g. .../usb2/2-1/2-1:1.0/host0/.../block/sda/sda2 -> .../usb2/2-1: 5000, 3.2).
 */
export function usbDeviceOf(sysPath: string): { speed: number; version: number } | null {
  let dir = sysPath
  while (dir.includes('/usb')) {
    dir = dir.slice(0, dir.lastIndexOf('/'))
    const speed = Number(read(`${dir}/speed`))
    const version = Number.parseFloat(read(`${dir}/version`))
    if (speed > 0 && Number.isFinite(version)) return { speed, version }
  }
  return null
}

export function bootDrive(): BootDrive | null {
  // the device number of what is mounted at / (mountinfo: "id parent major:minor root mountpoint ...")
  const line = read('/proc/self/mountinfo')
    .split('\n')
    .find((l) => l.split(' ')[4] === '/')
  const devNo = line?.split(' ')[2]
  if (!devNo || !/^\d+:\d+$/.test(devNo)) return null
  let dev: string
  try {
    dev = realpathSync(`/sys/dev/block/${devNo}`)
  } catch {
    return null
  }
  if (/\/mmc_host\/|\/mmcblk\d/.test(dev)) return { kind: 'sd' }
  if (/\/nvme\d/.test(dev)) return { kind: 'nvme' }
  if (!/\/usb\d+\//.test(dev)) return { kind: 'other' }
  const usb = usbDeviceOf(dev)
  if (!usb) return { kind: 'usb' }
  const drive: BootDrive = { kind: 'usb', usbSpeed: usb.speed, usbVersion: usb.version }
  if (usb.speed <= 480 && hasUsb3Port()) drive.hint = usb.version >= 3 ? 'usb2-port' : 'usb2-drive'
  return drive
}
