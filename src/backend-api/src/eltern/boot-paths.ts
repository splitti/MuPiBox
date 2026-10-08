// The Pi's boot configuration: /boot/firmware/config.txt on newer DietPi (v10, Debian 13 "Trixie"), /boot/config.txt
// before. Every place that reads or changes config.txt asks here (they all had /boot/config.txt written in, and on a
// newer system read nothing and wrote a file the Pi never reads).
import { promises as fsp } from 'node:fs'

export async function bootConfigPath(): Promise<string> {
  try {
    await fsp.access('/boot/firmware/config.txt')
    return '/boot/firmware/config.txt'
  } catch {
    return '/boot/config.txt'
  }
}
