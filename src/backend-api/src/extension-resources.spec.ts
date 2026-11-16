import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addGpio,
  addPort,
  addUnit,
  checkResources,
  coreResources,
  idleCoreGpio,
  emptyTaken,
  findConflicts,
  gatherTaken,
  normalizeResources,
  parseBootGpio,
  parseGpioInfo,
  parseListening,
  parseUnitFiles,
  type Probe,
  rotaryPins,
  sameResources,
} from './app-api/extension-resources'
import { checkManifest } from './app-api/extensions'

describe('extension resources: the declaration', () => {
  it('is required, and {} says nothing', () => {
    assert.ok(checkResources(undefined))
    assert.equal(checkResources({}), null)
    const m = { id: 'xy', name: 'X', version: '1.0.0', hostApi: 2 }
    assert.match(String(checkManifest(m, new Set())), /resources is missing/)
    assert.equal(checkManifest({ ...m, resources: {} }, new Set()), null)
  })

  it('accepts ports from 1024, BCM pins 2-27 and unit names, and nothing else', () => {
    assert.equal(
      checkResources({
        ports: [{ port: 9000 }, { port: 9000, proto: 'udp', purpose: 'x' }],
        gpio: [{ pin: 17 }, { pin: 27 }],
        services: [{ name: 'foo.service' }, { name: 'bar.timer', provides: true }],
      }),
      null,
    )
    for (const bad of [
      { ports: [{ port: 80 }] },
      { ports: [{ port: 70000 }] },
      { ports: [{ port: 9000.5 }] },
      { ports: [{ port: 9000, proto: 'sctp' }] },
      { ports: [{ port: 9000 }, { port: 9000 }] },
      { gpio: [{ pin: 1 }] },
      { gpio: [{ pin: 28 }] },
      { gpio: [{ pin: 17 }, { pin: 17 }] },
      { services: [{ name: 'foo' }] },
      { services: [{ name: '../x.service' }] },
      { services: [{ name: 'foo.service', provides: 'yes' }] },
      { ports: Array.from({ length: 13 }, (_, i) => ({ port: 2000 + i })) },
      { other: [] },
      [],
    ])
      assert.ok(checkResources(bad), JSON.stringify(bad))
  })

  it('compares two declarations whatever their order and defaults', () => {
    assert.ok(sameResources({ ports: [{ port: 9001 }, { port: 9000 }] }, { ports: [{ port: 9000, proto: 'tcp' }, { port: 9001, proto: 'tcp' }] }))
    assert.ok(!sameResources({ gpio: [{ pin: 17 }] }, { gpio: [{ pin: 18 }] }))
    assert.deepEqual(normalizeResources(undefined), { ports: [], gpio: [], services: [] })
  })
})

describe('extension resources: the test', () => {
  it('finds a port, a pin and a service that are taken, by whom', () => {
    const t = emptyTaken()
    addPort(t, 'tcp', 9000, 'extension clock')
    addGpio(t, 17, 'MuPiBox (power button, shim)')
    addUnit(t, 'foo.service', 'installed on the box')
    const found = findConflicts(
      { ports: [{ port: 9000 }, { port: 9001 }], gpio: [{ pin: 17 }, { pin: 18 }], services: [{ name: 'foo.service', provides: true }, { name: 'bar.service', provides: true }] },
      t,
    )
    assert.deepEqual(
      found.map((c) => [c.kind, c.severity, c.what]),
      [
        ['port', 'error', 'port 9000/tcp'],
        ['gpio', 'error', 'GPIO 17'],
        ['service', 'error', 'service foo.service'],
      ],
    )
    assert.match(found[0].message, /extension clock/)
  })

  it('a udp port is not a tcp port; a service it relies on that is missing is only a warning; nothing wanted, nothing found', () => {
    const t = emptyTaken()
    addPort(t, 'tcp', 9000, 'x')
    assert.deepEqual(findConflicts({ ports: [{ port: 9000, proto: 'udp' }] }, t), [])
    const w = findConflicts({ services: [{ name: 'needed.service' }] }, t)
    assert.deepEqual(
      w.map((c) => [c.severity, c.kind]),
      [['warn', 'service']],
    )
    assert.deepEqual(findConflicts({}, t), [])
    // (a service that it relies on and that exists is fine)
    addUnit(t, 'needed.service', 'installed on the box')
    assert.deepEqual(findConflicts({ services: [{ name: 'needed.service' }] }, t), [])
  })

  it('says so when part of the box could not be looked at', () => {
    const t = emptyTaken()
    t.blind.push('the GPIO lines')
    const found = findConflicts({ gpio: [{ pin: 5 }] }, t)
    assert.equal(found.length, 1)
    assert.equal(found[0].severity, 'warn')
    assert.match(found[0].message, /GPIO lines/)
  })
})

describe('extension resources: reading the box', () => {
  it('ports from ss', () => {
    const text = [
      'udp UNCONN 0 0 0.0.0.0:68 0.0.0.0:* users:(("dhclient",pid=1073,fd=7))',
      'tcp LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("lighttpd",pid=1,fd=7))',
      'tcp LISTEN 0 511 [::]:8200 [::]:*',
      'garbage',
    ].join('\n')
    assert.deepEqual(parseListening(text), [
      { proto: 'udp', port: 68, process: 'dhclient' },
      { proto: 'tcp', port: 80, process: 'lighttpd' },
      { proto: 'tcp', port: 8200, process: 'a running program' },
    ])
  })

  it('pins from the boot configuration: named by parameters, by default, by a sound card or by a bus', () => {
    const text = [
      '# a comment',
      'dtparam=audio=off',
      'dtparam=i2c_arm=on',
      'dtparam=spi=off',
      'dtoverlay=gpio-poweroff,gpiopin=4,active_low=1',
      'dtoverlay=pwm,pin=13,func=4',
      'dtoverlay=gpio-shutdown',
      'dtoverlay=hifiberry-dac',
      'dtoverlay=rotary-encoder,pin_a=5,pin_b=6,relative_axis=1',
      'dtoverlay=vc4-kms-dsi-waveshare-panel-v2,8_8_inch_a',
    ].join('\n')
    const pins = new Set(parseBootGpio(text).map((p) => p.pin))
    for (const pin of [2, 3, 4, 13, 18, 19, 20, 21, 5, 6]) assert.ok(pins.has(pin), `pin ${pin}`)
    // (gpio-poweroff names pin 4: not its default 26; spi is off: no pin 7-11; gpio-shutdown takes its default, 3)
    assert.ok(!pins.has(26))
    assert.ok(!pins.has(7))
    assert.ok(pins.has(3))
  })

  it('pins that programs hold, and unit names', () => {
    const info = ['\tline   4:\t"GPIO4"         \toutput active-low consumer="power_ctrl"', '\tline   5:\t"GPIO5"         \tinput', '\tline  17:\t"GPIO17"        \tinput edges=falling consumer="gpiomon"'].join('\n')
    assert.deepEqual(parseGpioInfo(info), [
      { pin: 4, consumer: 'power_ctrl' },
      { pin: 17, consumer: 'gpiomon' },
    ])
    assert.deepEqual(parseUnitFiles('lighttpd.service enabled enabled\nmupi_fan.service disabled enabled\nfoo.target static -\n'), ['lighttpd.service', 'mupi_fan.service'])
  })

  it('the rotary encoder has the pins of its configuration - three different ones of 2-27, else the ones it shipped with', () => {
    assert.deepEqual(rotaryPins(undefined), { a: 26, b: 24, button: 10 })
    assert.deepEqual(rotaryPins({ rotary: { active: true } }), { a: 26, b: 24, button: 10 })
    assert.deepEqual(rotaryPins({ rotary: { pinA: 5, pinB: 6, pinButton: 13 } }), { a: 5, b: 6, button: 13 })
    assert.deepEqual(rotaryPins({ rotary: { pinA: '5', pinB: '6', pinButton: '13' } }), { a: 5, b: 6, button: 13 })
    // (the same pin twice, a pin outside the header, a missing one: all three fall back, never a half choice)
    for (const rotary of [{ pinA: 5, pinB: 5, pinButton: 13 }, { pinA: 1, pinB: 6, pinButton: 13 }, { pinA: 5, pinB: 6, pinButton: 28 }, { pinA: 5, pinB: 6 }, { pinA: 'x', pinB: 6, pinButton: 13 }]) {
      assert.deepEqual(rotaryPins({ rotary }), { a: 26, b: 24, button: 10 })
    }
    const chosen = { rotary: { active: true, pinA: 5, pinB: 6, pinButton: 13, button: 'playpause' } }
    assert.deepEqual(coreResources(chosen).gpio.map((g) => g.pin), [5, 6, 13])
    // (the button without a function: its pin stays free - an NFC reader on SPI keeps GPIO 10 - and is named as the encoder's)
    const noButton = { rotary: { ...chosen.rotary, button: 'off' } }
    assert.deepEqual(coreResources(noButton).gpio.map((g) => g.pin), [5, 6])
    assert.deepEqual(idleCoreGpio(noButton), [{ pin: 13, by: 'MuPiBox (rotary encoder button, switched off)' }])
    assert.deepEqual(idleCoreGpio({ rotary: { ...chosen.rotary, active: false } }).map((g) => g.pin), [5, 6, 13])
    // (the pins of the old default are free for others once the encoder is somewhere else)
    assert.ok(!coreResources(chosen).gpio.some((g) => [26, 24, 10].includes(g.pin)))
  })

  it('the amplifier of the MuPiHAT takes the I2S pins, also under its own name', () => {
    const pins = parseBootGpio(['dtoverlay=max98357a,sdmode-pin=16', 'dtoverlay=i2s-mmap'].join(String.fromCharCode(10))).map((p) => p.pin)
    assert.deepEqual([...new Set(pins)].sort((a, b) => a - b), [16, 18, 19, 20, 21])
  })

  it('the core: its ports, the pins of its configuration - the fan, the rotary encoder and the HAT only when they are on', () => {
    const base = coreResources({ shim: { poweroffPin: '4', triggerPin: '17', cutPin: '27', ledPin: '13' }, fan: { fan_active: false, fan_gpio: '12' } })
    assert.deepEqual(
      base.gpio.map((g) => g.pin),
      [4, 17, 27, 13],
    )
    assert.ok(base.ports.some((p) => p.port === 8200))
    // (the pins of the rotary encoder are free while it is off - and named as its own for whoever chooses a pin)
    assert.deepEqual(idleCoreGpio({ rotary: { active: false } }).map((g) => g.pin), [26, 24, 10])
    assert.deepEqual(idleCoreGpio(undefined).map((g) => g.pin), [26, 24, 10])
    assert.deepEqual(idleCoreGpio({ rotary: { active: true, button: 'next' } }), [])
    assert.deepEqual(coreResources({ rotary: { active: true, button: 'next' } }).gpio.map((g) => g.pin), [26, 24, 10])
    assert.deepEqual(coreResources({ rotary: { active: true } }).gpio.map((g) => g.pin), [26, 24])
    // (the MuPiHAT: I2C, its amplifier and the amplifier's on/off line, before its overlay is written)
    assert.deepEqual(coreResources({ mupihat: { hat_active: true } }).gpio.map((g) => g.pin), [2, 3, 16, 18, 19, 21])
    const fan = coreResources({ fan: { fan_active: true, fan_gpio: '12' } })
    assert.deepEqual(
      fan.gpio.map((g) => g.pin),
      [12],
    )
  })

  it('gathers it all, and leaves out what the extension itself holds (an update does not collide with itself)', async () => {
    const ss = 'tcp LISTEN 0 5 0.0.0.0:9000 0.0.0.0:* users:(("mine",pid=5,fd=3))\ntcp LISTEN 0 5 0.0.0.0:9100 0.0.0.0:* users:(("other",pid=6,fd=3))'
    const gpioinfo = '\tline   22:\t"GPIO22"        \toutput consumer="mine"\n\tline   23:\t"GPIO23"        \toutput consumer="foreign"'
    const systemctl = 'my.service enabled enabled\nother.service enabled enabled'
    const probe: Probe = {
      run: async (cmd, args) => ({ ok: true, out: cmd === 'systemctl' ? systemctl : args.includes('ss') ? ss : gpioinfo }),
      readFile: async () => 'dtoverlay=pwm,pin=13',
    }
    const taken = await gatherTaken({
      self: 'me',
      config: undefined,
      others: [
        { id: 'me', resources: { ports: [{ port: 9300 }] } },
        { id: 'clock', resources: { gpio: [{ pin: 24 }] } },
      ],
      selfDeclared: { ports: [{ port: 9000 }], gpio: [{ pin: 22 }], services: [{ name: 'my.service', provides: true }] },
      probe,
    })
    assert.equal(taken.ports.has('tcp:9000'), false)
    assert.match(String(taken.ports.get('tcp:9100')), /other/)
    assert.equal(taken.gpio.has(22), false)
    assert.match(String(taken.gpio.get(23)), /foreign/)
    assert.match(String(taken.gpio.get(24)), /extension clock/)
    assert.ok(taken.gpio.has(13))
    assert.equal(taken.units.has('my.service'), false)
    assert.ok(taken.units.has('other.service'))
    // (its own earlier declaration in "others" is skipped too)
    assert.equal(taken.ports.has('tcp:9300'), false)
    assert.deepEqual(taken.blind, [])
  })

  it('a probe that fails is reported, not guessed', async () => {
    const probe: Probe = {
      run: async () => ({ ok: false, out: '' }),
      readFile: async () => {
        throw new Error('no file')
      },
    }
    const taken = await gatherTaken({ config: undefined, others: [], probe })
    assert.deepEqual(taken.blind, ['the boot configuration', 'the open ports', 'the GPIO lines', 'the services'])
  })
})
