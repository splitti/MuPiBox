// Hardware settings that only the admin interface could change (MuPi-Conf, mupihat.php): sound card, rotary encoder,
// MuPiHAT and its battery, the OnOffShim's button delay and LED, the fan. The same commands as there, with the values
// checked (the admin interface passed some of them unchecked, e.g. the fan's pin and temperatures).

import { execFile, spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface HardwareDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

// the GPIO pins the admin interface offers for the LED and the fan
const PINS = ['4', '12', '13', '17', '18', '21', '22', '23', '24', '25', '27']
// the I2S driver of the MAX98357A amplifier, as enable_mupihat.sh writes it
const AMP_DRIVER = ['dtoverlay=max98357a,sdmode-pin=16', 'dtoverlay=i2s-mmap']

// The Pi's boot configuration: /boot/firmware/config.txt on newer DietPi, /boot/config.txt before
async function bootConfigPath(): Promise<string> {
  try {
    await fsp.access('/boot/firmware/config.txt')
    return '/boot/firmware/config.txt'
  } catch {
    return '/boot/config.txt'
  }
}

// What is written: DietPi's sound card and whether the amplifier's driver is in the boot configuration
async function soundcardWritten(bootConfig: string): Promise<{ card: string; ampDriver: boolean }> {
  const read = (file: string) => fsp.readFile(file, 'utf8').catch(() => '')
  const [dietpi, config] = await Promise.all([read('/boot/dietpi.txt'), read(bootConfig)])
  return {
    card: /^CONFIG_SOUNDCARD=(.*)$/m.exec(dietpi)?.[1]?.trim() ?? '',
    ampDriver: AMP_DRIVER.every((line) => new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(config)),
  }
}

// The sound cards the system has found (after the restart a new card needs): their names from ALSA
async function detectedSoundcards(): Promise<string[]> {
  const cards = await fsp.readFile('/proc/asound/cards', 'utf8').catch(() => '')
  return cards
    .split('\n')
    .map((line) => /^\s*\d+\s+\[[^\]]*\]:\s*(.+)$/.exec(line)?.[1]?.trim())
    .filter((name): name is string => !!name)
}
const BUTTON = ['off', 'playpause', 'next', 'ffwd']

function run(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: stdout ?? '' }))
  })
}

function detached(script: string): void {
  const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}

// A restart of the box a few seconds after the answer, at most one at a time (as the admin interface's footer.php)
function rebootSoon(): void {
  detached('( flock -n 9 || exit 0; sleep 5; sudo /usr/local/bin/mupibox/restart.sh ) 9>/tmp/.mupibox.reboot.lock')
}

const section = (deps: HardwareDeps, key: string) => ((deps.getMupiboxConfig() as Record<string, unknown> | undefined)?.[key] ?? {}) as Record<string, unknown>

const int = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

async function merge(deps: HardwareDeps, key: string, values: Record<string, unknown>): Promise<void> {
  await deps.updateMupiboxConfig((cfg) => {
    cfg[key] = { ...((cfg[key] as Record<string, unknown>) ?? {}), ...values }
  })
}

export function registerHardwareRoutes(router: Router, deps: HardwareDeps): void {
  /** GET /api/app/hardware - everything the pages Soundkarte, Drehregler, MuPiHAT, Taster and Lüfter show. */
  router.get('/hardware', requireSession, async (_req, res) => {
    const mb = section(deps, 'mupibox')
    const hat = section(deps, 'mupihat')
    const shim = section(deps, 'shim')
    const fan = section(deps, 'fan')
    const rotary = section(deps, 'rotary')
    const timeout = section(deps, 'timeout')
    let dietpiSoundcard = ''
    try {
      dietpiSoundcard = /^CONFIG_SOUNDCARD=(.*)$/m.exec(await fsp.readFile('/boot/dietpi.txt', 'utf8'))?.[1]?.trim() ?? ''
    } catch {
      // not DietPi (development)
    }
    const [fanActive, rotaryActive] = await Promise.all(['mupi_fan', 'mupi_rotary'].map(async (s) => (await run('systemctl', ['is-active', s], 5000)).stdout.trim() === 'active'))
    res.json({
      soundcard: {
        current: typeof mb.physicalDevice === 'string' ? mb.physicalDevice : '',
        dietpi: dietpiSoundcard,
        // what the system has actually found (a card chosen but not here: the driver is missing, or no restart yet)
        detected: await detectedSoundcards(),
        options: (Array.isArray(mb.AudioDevices) ? (mb.AudioDevices as Record<string, unknown>[]) : [])
          .map((d) => ({ id: String(d.tname ?? ''), name: String(d.ufname ?? d.tname ?? '') }))
          .filter((d) => d.id),
      },
      rotary: { active: rotary.active === true, running: rotaryActive, step: int(rotary.step, 1, 10) ?? 5, button: BUTTON.includes(String(rotary.button)) ? rotary.button : 'off' },
      mupihat: {
        active: hat.hat_active === true,
        battery: typeof hat.selected_battery === 'string' ? hat.selected_battery : '',
        batteries: (Array.isArray(hat.battery_types) ? (hat.battery_types as Record<string, unknown>[]) : []).map((b) => String(b.name ?? '')).filter(Boolean),
      },
      shim: {
        pressDelay: Number(timeout.pressDelay ?? 2),
        ledPin: String(shim.ledPin ?? '13'),
        ledMax: Number(shim.ledBrightnessMax ?? 90),
        ledMin: Number(shim.ledBrightnessMin ?? 60),
        // pins the OnOffShim uses itself (not for the LED or the fan)
        reserved: ['poweroffPin', 'triggerPin', 'cutPin'].map((k) => String(shim[k] ?? '')).filter(Boolean),
      },
      fan: {
        active: fan.fan_active === true,
        running: fanActive,
        gpio: String(fan.fan_gpio ?? '13'),
        t100: Number(fan.fan_temp_100 ?? 75),
        t75: Number(fan.fan_temp_75 ?? 65),
        t50: Number(fan.fan_temp_50 ?? 55),
        t25: Number(fan.fan_temp_25 ?? 45),
      },
      pins: PINS,
    })
  })

  /** POST /api/app/soundcard {id} - one of mupibox.AudioDevices; DietPi switches the card, needs a restart. */
  router.post('/soundcard', requireSession, requireCsrf, async (req, res) => {
    const id = String((req.body as { id?: unknown } | undefined)?.id ?? '')
    const known = (Array.isArray(section(deps, 'mupibox').AudioDevices) ? (section(deps, 'mupibox').AudioDevices as Record<string, unknown>[]) : []).map((d) => String(d.tname))
    if (!known.includes(id)) {
      res.status(400).json({ error: 'unknown sound card' })
      return
    }
    const r = await run('sudo', ['/boot/dietpi/func/dietpi-set_hardware', 'soundcard', id], 120000)
    // (only a card DietPi took is noted - and a failure is one for the app, not "saved")
    if (!r.ok) {
      res.status(500).json({ ok: false, error: 'switch_failed' })
      return
    }
    // The MAX98357A (the MuPiHAT's amplifier, also sold as a board of its own) needs its I2S driver in the Pi's boot
    // configuration; only switching the MuPiHAT on wrote it, so chosen without the HAT the box had no sound card at all
    // (DietPi does not know the name: it turns the onboard sound off and leaves the drivers alone). Choosing another
    // card without the HAT takes the driver out again (it would clash with another I2S card).
    const bootConfig = await bootConfigPath()
    const amp = id.startsWith('MAX98357A')
    if (amp) {
      for (const line of AMP_DRIVER) await run('sudo', ['sh', '-c', `grep -qx '${line}' ${bootConfig} || echo '${line}' >> ${bootConfig}`])
    } else if (section(deps, 'mupihat').hat_active !== true) {
      await run('sudo', ['sed', '-i', '/^dtoverlay=max98357a/d;/^dtoverlay=i2s-mmap$/d', bootConfig])
    }
    // Is it there? DietPi's entry and - for the amplifier - the driver (asked by Andreas: "saved" said nothing)
    const written = await soundcardWritten(bootConfig)
    // (DietPi keeps the name in small letters: "max98357a bcm2835-i2s-hifi hifi-0")
    if (written.card.toLowerCase() !== id.toLowerCase() || (amp && !written.ampDriver)) {
      console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] sound card ${id} not applied: dietpi.txt "${written.card}", driver ${written.ampDriver}`)
      res.status(500).json({ ok: false, error: 'not_applied', card: written.card, driver: written.ampDriver })
      return
    }
    await merge(deps, 'mupibox', { physicalDevice: id })
    detached('sudo /usr/local/bin/mupibox/setting_update.sh >/dev/null 2>&1')
    res.json({ ok: true, reboot: true })
  })

  /** POST /api/app/rotary {active?, step?, button?} - the rotary encoder (volume) and its push button. */
  router.post('/rotary', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const values: Record<string, unknown> = {}
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') return void res.status(400).json({ error: 'invalid active' })
      values.active = body.active
    }
    if (body.step !== undefined) {
      const step = int(body.step, 1, 10)
      if (step === undefined) return void res.status(400).json({ error: 'step must be 1-10' })
      values.step = step
    }
    if (body.button !== undefined) {
      if (!BUTTON.includes(String(body.button))) return void res.status(400).json({ error: 'invalid button' })
      values.button = body.button
    }
    await merge(deps, 'rotary', values)
    // step and button are read live by rotary_control.py; switching goes through the service
    if (values.active === true) {
      await run('sudo', ['systemctl', 'enable', 'mupi_rotary.service'])
      await run('sudo', ['systemctl', 'restart', 'mupi_rotary.service'])
    } else if (values.active === false) {
      await run('sudo', ['systemctl', 'stop', 'mupi_rotary.service'])
      await run('sudo', ['systemctl', 'disable', 'mupi_rotary.service'])
    }
    res.json({ ok: true })
  })

  /**
   * POST /api/app/mupihat {active} - switches the MuPiHAT on or off (overlays, services, sound card, see
   * enable_mupihat.sh / disable_mupihat.sh); the box restarts a few seconds later, as in the admin interface.
   */
  router.post('/mupihat', requireSession, requireCsrf, async (req, res) => {
    const active = (req.body as { active?: unknown } | undefined)?.active
    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'active must be true or false' })
      return
    }
    const before = section(deps, 'mupihat').hat_active
    await merge(deps, 'mupihat', { hat_active: active })
    const r = await run('sudo', [`/usr/local/bin/mupibox/${active ? 'enable' : 'disable'}_mupihat.sh`], 120000)
    if (!r.ok) {
      // (the script failed: the switch goes back, and the box is not restarted into a half-done state)
      await merge(deps, 'mupihat', { hat_active: before })
      res.status(500).json({ ok: false, error: 'switch_failed' })
      return
    }
    await run('sudo', ['/usr/local/bin/mupibox/setting_update.sh'], 60000)
    rebootSoon()
    res.json({ ok: true, reboot: true })
  })

  /** POST /api/app/battery {name} - the battery profile (one of mupihat.battery_types); mupi_hat reads it anew. */
  router.post('/battery', requireSession, requireCsrf, async (req, res) => {
    const name = String((req.body as { name?: unknown } | undefined)?.name ?? '')
    const hat = section(deps, 'mupihat')
    const names = (Array.isArray(hat.battery_types) ? (hat.battery_types as Record<string, unknown>[]) : []).map((b) => String(b.name))
    if (!names.includes(name)) {
      res.status(400).json({ error: 'unknown battery' })
      return
    }
    await merge(deps, 'mupihat', { selected_battery: name })
    if (hat.hat_active === true) await run('sudo', ['service', 'mupi_hat', 'restart'])
    res.json({ ok: true, restarted: hat.hat_active === true })
  })

  /** POST /api/app/mupihat/restart - after a change of the battery profile's voltages (read when mupi_hat starts). */
  router.post('/mupihat/restart', requireSession, requireCsrf, async (_req, res) => {
    if (section(deps, 'mupihat').hat_active !== true) {
      res.json({ ok: true, restarted: false })
      return
    }
    const r = await run('sudo', ['service', 'mupi_hat', 'restart'])
    res.json({ ok: r.ok, restarted: r.ok })
  })

  /**
   * POST /api/app/shim {pressDelay?, ledPin?, ledMax?, ledMin?} - the OnOffShim: delay of the power button (read at
   * boot), the LED's pin (pi-blaster, read at boot) and its brightness (read live by mupi_start_led.sh).
   */
  router.post('/shim', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const shim: Record<string, unknown> = {}
    let reboot = false
    if (body.pressDelay !== undefined) {
      const d = int(body.pressDelay, 0, 5)
      if (d === undefined) return void res.status(400).json({ error: 'pressDelay must be 0-5' })
      await merge(deps, 'timeout', { pressDelay: String(d) })
      reboot = true
    }
    if (body.ledPin !== undefined) {
      const pin = String(body.ledPin)
      const reserved = ['poweroffPin', 'triggerPin', 'cutPin'].map((k) => String(section(deps, 'shim')[k] ?? ''))
      if (!PINS.includes(pin) || reserved.includes(pin)) return void res.status(400).json({ error: 'pin not allowed' })
      shim.ledPin = pin
      reboot = true
    }
    for (const [key, field] of [
      ['ledMax', 'ledBrightnessMax'],
      ['ledMin', 'ledBrightnessMin'],
    ] as const) {
      if (body[key] === undefined) continue
      const v = int(body[key], 0, 100)
      if (v === undefined) return void res.status(400).json({ error: `${key} must be 0-100` })
      shim[field] = String(v)
    }
    if (Object.keys(shim).length) await merge(deps, 'shim', shim)
    if (shim.ledPin !== undefined) {
      // the pin pi-blaster drives (only where pi-blaster is installed)
      await run('sudo', ['sh', '-c', `[ -f /etc/init.d/pi-blaster.boot.sh ] && sed -i 's|DAEMON_ARGS=".*"|DAEMON_ARGS="--gpio ${shim.ledPin}"|g' /etc/init.d/pi-blaster.boot.sh; true`])
    }
    if (reboot) detached('sudo /usr/local/bin/mupibox/setting_update.sh >/dev/null 2>&1')
    res.json({ ok: true, rebootNeeded: reboot })
  })

  /**
   * POST /api/app/fan {active, gpio, t100, t75, t50, t25} - the fan (fan_control.py reads pin and temperatures when
   * it starts: the service is restarted, which the admin interface's "start" of a running service did not do).
   */
  router.post('/fan', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (typeof body.active !== 'boolean') return void res.status(400).json({ error: 'active must be true or false' })
    const gpio = String(body.gpio ?? '')
    const reserved = ['poweroffPin', 'triggerPin', 'cutPin', 'ledPin'].map((k) => String(section(deps, 'shim')[k] ?? ''))
    // (a pin the OnOffShim or its LED uses only matters for a running fan: some boxes have both on 13 from the template)
    if (!PINS.includes(gpio) || (body.active && reserved.includes(gpio))) return void res.status(400).json({ error: 'pin not allowed' })
    const t = ['t100', 't75', 't50', 't25'].map((k) => int(body[k], 20, 90))
    if (t.some((v) => v === undefined)) return void res.status(400).json({ error: 'temperatures must be 20-90' })
    const [t100, t75, t50, t25] = t as number[]
    if (!(t100 > t75 && t75 > t50 && t50 > t25)) return void res.status(400).json({ error: 'temperatures must go down: 100 % > 75 % > 50 % > 25 %' })
    await merge(deps, 'fan', { fan_active: body.active, fan_gpio: gpio, fan_temp_100: String(t100), fan_temp_75: String(t75), fan_temp_50: String(t50), fan_temp_25: String(t25) })
    if (body.active) {
      await run('sudo', ['systemctl', 'enable', 'mupi_fan.service'])
      await run('sudo', ['systemctl', 'restart', 'mupi_fan.service'])
    } else {
      await run('sudo', ['systemctl', 'stop', 'mupi_fan.service'])
      await run('sudo', ['systemctl', 'disable', 'mupi_fan.service'])
    }
    res.json({ ok: true })
  })
}
