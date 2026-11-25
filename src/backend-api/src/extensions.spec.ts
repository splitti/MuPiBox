// The checks of the extension installer (app-api/extensions.ts): what a package may hold and what it may ask to have set up as root.
// No box needed; the install itself (download, sudo) is tried on a box.
import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { readZip } from './app-api/winamp-skin'
import { HOST_API, verifyPackage, checkManifest, checkSettings, checkUdevRules, checkUnitFile, chosenGpio, gpioSettingError, type Manifest } from './app-api/extensions'

const files = (...names: string[]) => new Set(['manifest.json', ...names])
const base = (extra: Record<string, unknown> = {}) => ({ id: 'cd', name: 'CD', version: '1.0.0', hostApi: 1, resources: {}, ...extra })

describe('udev rules of an extension', () => {
  it('accepts the rule of the CD extension', () => {
    assert.strictEqual(checkUdevRules('# who may read the drive\nSUBSYSTEM=="block", KERNEL=="sr[0-9]*", MODE="0666"\n'), null)
  })
  it('accepts group and symlink assignments', () => {
    assert.strictEqual(checkUdevRules('SUBSYSTEM=="tty", ATTRS{idVendor}=="1234", GROUP="audio", SYMLINK+="mydev"'), null)
  })
  it('refuses anything that runs a program or sets the environment', () => {
    assert.ok(checkUdevRules('SUBSYSTEM=="block", RUN+="/tmp/x.sh"'))
    assert.ok(checkUdevRules('SUBSYSTEM=="block", PROGRAM="/bin/sh -c id"'))
    assert.ok(checkUdevRules('SUBSYSTEM=="block", IMPORT{program}="x"'))
    assert.ok(checkUdevRules('SUBSYSTEM=="block", ENV{X}="1"'))
    assert.ok(checkUdevRules('SUBSYSTEM=="input", ENV{ID_INPUT_KEYBOARD}="1"'), 'the kind of an input device: only to match by')
    assert.ok(checkUdevRules('SUBSYSTEM=="input", ENV{SYSTEMD_WANTS}=="x"'))
  })
  it('matches an input device by its kind (the NFC extension: only USB keyboards)', () => {
    assert.strictEqual(checkUdevRules('SUBSYSTEM=="input", SUBSYSTEMS=="usb", KERNEL=="event[0-9]*", ENV{ID_INPUT_KEYBOARD}=="1", GROUP="gpio", MODE="0660"'), null)
  })
  it('refuses an empty file and text that is no rule', () => {
    assert.ok(checkUdevRules('# only a comment\n'))
    assert.ok(checkUdevRules('rm -rf /'))
  })
  it('does not split a rule at a comma inside quotes', () => {
    assert.strictEqual(checkUdevRules('KERNEL=="a,b", MODE="0660"'), null)
  })
})

describe('manifest of an extension', () => {
  it('accepts the manifest of the CD extension', () => {
    const m = base({
      player: 'player.js',
      icon: 'icon.svg',
      settings: { cdLookup: { type: 'boolean', default: true }, discogsToken: { type: 'secret', pattern: '^[A-Za-z0-9]*$' } },
      system: { udev: [{ name: '99-mpx-cd.rules', file: '99-mpx-cd.rules' }], groups: ['cdrom'] },
    })
    assert.strictEqual(checkManifest(m, files('player.js', 'icon.svg', '99-mpx-cd.rules')), null)
  })
  it('refuses a bad id, a missing part and a newer host', () => {
    assert.ok(checkManifest(base({ id: '../x' }), files()))
    assert.ok(checkManifest(base({ player: 'player.js' }), files()))
    assert.ok(checkManifest(base({ hostApi: HOST_API + 1 }), files()))
    assert.ok(checkManifest(base({ version: '1.0' }), files()))
  })
  it('counts what really unpacks, not the sizes the archive names', () => {
    // one file that says it has 100 bytes and unpacks to 1.5 MB - over a whole limit of 1 MB
    const raw = deflateRawSync(Buffer.alloc(1_500_000))
    const name = Buffer.from('a.txt')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(raw.length, 18)
    local.writeUInt32LE(100, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(raw.length, 20)
    central.writeUInt32LE(100, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(0, 42)
    const cdStart = local.length + name.length + raw.length
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(1, 8)
    end.writeUInt16LE(1, 10)
    end.writeUInt32LE(central.length + name.length, 12)
    end.writeUInt32LE(cdStart, 16)
    const zip = Buffer.concat([local, name, raw, central, name, end])
    assert.throws(() => readZip(zip, { maxFile: 2_000_000, maxTotal: 1_048_576, strict: true }))
  })
  it('refuses the names of the folders all extensions share (settings, data)', () => {
    assert.ok(checkManifest(base({ id: 'settings' }), files()))
    assert.ok(checkManifest(base({ id: 'data' }), files()))
  })
  it('refuses a package name apt-get would read as "remove"', () => {
    assert.ok(checkManifest(base({ system: { packages: ['lighttpd-'] } }), files()))
    assert.strictEqual(checkManifest(base({ system: { packages: ['libcdio-utils', 'g++'] } }), files()), null)
    assert.strictEqual(checkManifest(base({ system: { packages: ['libcdio-utils', 'cd-discid'] } }), files()), null)
  })
  it('refuses file names that leave the folder', () => {
    assert.ok(checkManifest(base({ player: '../player.js' }), files('../player.js')))
    assert.ok(checkManifest(base({ player: '/etc/passwd' }), files('/etc/passwd')))
  })
  it('refuses system steps it does not know: other groups, rule names of another extension', () => {
    assert.ok(checkManifest(base({ system: { groups: ['sudo'] } }), files()))
    assert.ok(checkManifest(base({ system: { udev: [{ name: '99-other.rules', file: 'r.rules' }] } }), files('r.rules')))
    assert.ok(checkManifest(base({ system: { packages: ['x; rm -rf /'] } }), files()))
    assert.strictEqual(checkManifest(base({ system: { packages: ['libcdio-utils'] } }), files()), null)
  })
})

describe('settings of an extension', () => {
  const manifest = base({
    settings: { cdLookup: { type: 'boolean' }, discogsToken: { type: 'secret', pattern: '^[A-Za-z0-9]{0,80}$' }, volume: { type: 'number' } },
  }) as unknown as Manifest
  it('takes values of the kind the manifest names', () => {
    assert.deepStrictEqual(checkSettings(manifest, { cdLookup: false, discogsToken: ' abc123 ', volume: 5 }), { ok: true, clean: { cdLookup: false, discogsToken: 'abc123', volume: 5 } })
  })
  it('refuses unknown keys, wrong kinds and values that do not fit', () => {
    assert.strictEqual(checkSettings(manifest, { nope: 1 }).ok, false)
    assert.strictEqual(checkSettings(manifest, { cdLookup: 'yes' }).ok, false)
    assert.strictEqual(checkSettings(manifest, { discogsToken: 'a b; c' }).ok, false)
    assert.strictEqual(checkSettings(manifest, { volume: Number.NaN }).ok, false)
  })
})

describe('the CD extension of this repository', () => {
  const dir = path.join(process.cwd(), '..', '..', 'extensions', 'cd')
  it('has a manifest and a rule file the installer accepts', () => {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    assert.strictEqual(checkManifest(manifest, new Set(readdirSync(dir))), null)
    assert.strictEqual(checkUdevRules(readFileSync(path.join(dir, manifest.system.udev[0].file), 'utf8')), null)
  })
  it('is packed as the catalog says (the file the box downloads)', () => {
    const catalog = JSON.parse(readFileSync(path.join(dir, '..', 'catalog.json'), 'utf8'))
    const entry = catalog.find((e: { id: string }) => e.id === 'cd')
    const bytes = readFileSync(path.join(dir, '..', 'dist', `cd-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const names = readZip(bytes).map((e) => e.name)
    assert.ok(names.includes('manifest.json') && names.includes('player.js'))
  })
})

describe('settings with a choice', () => {
  const clock = JSON.parse(readFileSync(path.join(process.cwd(), '..', '..', 'extensions', 'clock', 'manifest.json'), 'utf8')) as Manifest
  it('is packed as the catalog says', () => {
    const extDir = path.join(process.cwd(), '..', '..', 'extensions')
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'clock')
    const bytes = readFileSync(path.join(extDir, 'dist', `clock-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
  })
  it('accepts the manifest of the clock extension', () => {
    assert.strictEqual(checkManifest(clock, files('display.js', 'icon.svg')), null)
  })
  it('takes only a value from the options', () => {
    assert.strictEqual(checkSettings(clock, { style: 'analog', hours: 12 }).ok, true)
    assert.strictEqual(checkSettings(clock, { style: 'roman' }).ok, false)
    assert.strictEqual(checkSettings(clock, { hours: 7 }).ok, false)
  })
  it('refuses options of the wrong kind and choices that do not name every option', () => {
    const bad = (settings: unknown, ui?: unknown) => checkManifest({ ...base({ settings, ui }) }, files())
    assert.ok(bad({ a: { type: 'boolean', options: [true, false] } }))
    assert.ok(bad({ a: { type: 'string', options: ['x'] } }))
    assert.ok(bad({ a: { type: 'number', options: ['x', 'y'] } }))
    assert.ok(bad({ a: { type: 'string', options: ['x', 'y'] } }, { title: 'T', items: [{ key: 'a', label: 'A', choices: [{ value: 'x', label: 'X' }] }] }))
    assert.ok(bad({ a: { type: 'string', options: ['x', 'y'] } }, { title: 'T', items: [{ key: 'a', label: 'A', choices: [{ value: 'x', label: 'X' }, { value: 'z', label: 'Z' }] }] }))
    assert.strictEqual(bad({ a: { type: 'string', options: ['x', 'y'] } }, { title: 'T', items: [{ key: 'a', label: 'A', choices: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] }] }), null)
  })
})

describe('a picture above the button of a choice, and a help text as a tooltip', () => {
  const ui = (choices: unknown, extra: Record<string, unknown> = {}) => ({ title: 'T', items: [{ key: 'a', label: 'A', choices, ...extra }] })
  const settings = { a: { type: 'string', options: ['x', 'y'], default: 'x' } }
  const check = (u: unknown) => checkManifest({ ...base({ settings, ui: u }) }, new Set([...files(), 'images/mode-full.png', 'pic.svg']))
  const two = (image?: unknown) => [{ value: 'x', label: 'X', ...(image === undefined ? {} : { image }) }, { value: 'y', label: 'Y' }]
  it('takes a picture of the extension for a choice', () => {
    assert.strictEqual(check(ui(two('images/mode-full.png'))), null)
    assert.strictEqual(check(ui(two('pic.svg'))), null)
  })
  it('refuses a picture outside the extension, of another kind, or that is no text', () => {
    for (const bad of ['../x.png', 'images/../x.png', '/etc/x.png', 'x.exe', 'x.html', 'images/', 42, ''])
      assert.ok(check(ui(two(bad))), String(bad))
    // (one the package does not hold - a typo in the manifest)
    assert.ok(check(ui(two('images/mode-ful.png'))))
  })
  it('takes a tip on a field with a help text and no other', () => {
    assert.strictEqual(check(ui(two(), { tip: true, help: 'text' })), null)
    assert.ok(check(ui(two(), { tip: true })))
    assert.ok(check(ui(two(), { tip: 'yes', help: 'text' })))
  })
  it('takes a card in the look of the box for the settings it needs, and refuses it otherwise', () => {
    const cfg = { contrast: { type: 'number', default: 1, min: 1, max: 255 }, sleepAfter: { type: 'number', default: 0, options: [0, 5] }, nightDim: { type: 'boolean', default: false }, nightContrast: { type: 'number', default: 20, min: 1, max: 255 } }
    const page = (core: unknown, extra: Record<string, unknown> = {}, remove: string[] = []) => {
      const s: Record<string, unknown> = { ...cfg }
      for (const k of remove) delete s[k]
      return checkManifest({ ...base({ hostApi: 5, settings: s, ui: { title: 'T', items: [{ type: 'heading', label: 'H', card: true, core, ...extra }, { key: 'contrast', label: 'C' }] } }) }, files())
    }
    assert.strictEqual(page('brightness'), null)
    assert.strictEqual(page('evening'), null)
    assert.ok(page('sun'))
    assert.ok(page('brightness', { card: undefined }))
    assert.ok(page('brightness', {}, ['sleepAfter']))
    assert.ok(page('evening', {}, ['nightDim']))
  })
  it('is used by the OLED extension: a picture for each mode, which are in the package', () => {
    const extDir = path.join(process.cwd(), '..', '..', 'extensions', 'oled')
    const oled = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8'))
    const mode = oled.ui.items.find((i: { key?: string }) => i.key === 'mode')
    assert.deepStrictEqual(mode.choices.map((c: { value: string }) => c.value), ['full', 'mix', 'lite'])
    for (const c of mode.choices) assert.ok(existsSync(path.join(extDir, c.image)), c.image)
    assert.strictEqual(mode.help, undefined)
    for (const key of ['volumeOverlay', 'playOverlay']) assert.strictEqual(oled.ui.items.find((i: { key?: string }) => i.key === key).tip, true)
  })
})

describe('the weather extension of this repository', () => {
  const extDir = path.join(process.cwd(), '..', '..', 'extensions')
  const weather = JSON.parse(readFileSync(path.join(extDir, 'weather', 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts', () => {
    assert.strictEqual(checkManifest(weather, files('api.js', 'display.js', 'icon.svg')), null)
  })
  it('takes a place only inside the globe and a server from the list', () => {
    assert.strictEqual(checkSettings(weather, { provider: 'metno', placeName: 'Wien', lat: 48.2085, lon: 16.3721 }).ok, true)
    assert.strictEqual(checkSettings(weather, { lat: 91 }).ok, false)
    assert.strictEqual(checkSettings(weather, { lon: -181 }).ok, false)
    assert.strictEqual(checkSettings(weather, { provider: 'wetter.com' }).ok, false)
  })
  it('refuses a search address of another extension, and a lookup on a switch', () => {
    const lookup = (settings: unknown, item: unknown) => checkManifest(base({ id: 'xy', settings, ui: { title: 'T', items: [item] } }), files())
    const str = { a: { type: 'string' } }
    assert.strictEqual(lookup(str, { key: 'a', label: 'A', type: 'lookup', search: '/api/ext/cd/places' }) === null, false)
    assert.ok(lookup(str, { key: 'a', label: 'A', type: 'lookup', search: 'https://example.com/x' }))
    assert.ok(lookup({ a: { type: 'boolean' } }, { key: 'a', label: 'A', type: 'lookup', search: '/api/ext/xy/places' }))
    assert.strictEqual(lookup(str, { key: 'a', label: 'A', type: 'lookup', search: '/api/ext/xy/places' }), null)
    // (hostApi 15: what is chosen as chips - a route of the extension itself)
    const chips = (hostApi: number, list: unknown) => checkManifest(base({ id: 'xy', hostApi, settings: str, ui: { title: 'T', items: [{ key: 'a', label: 'A', type: 'lookup', search: '/api/ext/xy/places', list }] } }), files())
    assert.strictEqual(chips(15, '/api/ext/xy/chosen'), null)
    assert.ok(chips(14, '/api/ext/xy/chosen'))
    assert.ok(chips(15, '/api/ext/cd/chosen'))
    assert.ok(chips(15, 5))
  })
  it('a roster: four routes of the extension itself, no setting', () => {
    const roster = { type: 'roster', label: 'R', list: '/api/ext/xy/list', add: '/api/ext/xy/add', remove: '/api/ext/xy/remove', select: '/api/ext/xy/select' }
    const manifest = (item: unknown, hostApi = 4) => base({ id: 'xy', hostApi, ui: { title: 'T', items: [item] } })
    assert.strictEqual(checkManifest(manifest(roster), files()), null)
    assert.ok(checkManifest(manifest(roster, 3), files()), 'needs hostApi 4')
    assert.ok(checkManifest(manifest({ ...roster, add: 'https://example.com/x' }), files()), 'a route of another place')
    assert.ok(checkManifest(manifest({ ...roster, remove: '/api/ext/other/remove' }), files()), 'a route of another extension')
    assert.ok(checkManifest(manifest({ ...roster, select: undefined }), files()), 'a route missing')
    assert.strictEqual(checkManifest(manifest({ ...roster, color: '/api/ext/xy/color' }), files()), null, 'the colour route may be there')
    assert.ok(checkManifest(manifest({ ...roster, color: '/api/ext/other/color' }), files()), 'but only one of its own')
  })
  it('an order field: a text that names every choice once', () => {
    const choices = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]
    const manifest = (settings: unknown, item: unknown = { key: 'o', label: 'O', type: 'order', choices }) => base({ id: 'xy', hostApi: 3, settings, ui: { title: 'T', items: [item] } })
    const str = { o: { type: 'string', default: 'a,b,c' } }
    assert.strictEqual(checkManifest(manifest(str), files()), null)
    assert.ok(checkManifest(manifest({ o: { type: 'string', default: 'a,b' } }), files()), 'a default that misses a choice')
    assert.ok(checkManifest(manifest({ o: { type: 'boolean' } }), files()))
    assert.ok(checkManifest(manifest(str, { key: 'o', label: 'O', type: 'order', choices: [{ value: 'a', label: 'A' }] }), files()), 'one choice is no order')
    assert.ok(checkManifest(manifest(str, { key: 'o', label: 'O', type: 'order', choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }] }), files()), 'the same choice twice')
    const m = manifest(str) as unknown as Manifest
    assert.deepStrictEqual(checkSettings(m, { o: 'c,a,b' }), { ok: true, clean: { o: 'c,a,b' } })
    assert.strictEqual(checkSettings(m, { o: 'a,b' }).ok, false)
    assert.strictEqual(checkSettings(m, { o: 'a,a,b' }).ok, false)
    assert.strictEqual(checkSettings(m, { o: 'a,b,x' }).ok, false)
  })
  it('is packed as the catalog says', () => {
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'weather')
    const bytes = readFileSync(path.join(extDir, 'dist', `weather-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    assert.strictEqual(verifyPackage(bytes).ok, true)
  })
})

// (the users extension that tried it out is no longer in this repository - multi-user comes into the box itself)
describe('a roster in the app (hostApi 4)', () => {
  const roster = { type: 'roster', label: 'Liste', list: '/api/ext/xy/list', add: '/api/ext/xy/add', remove: '/api/ext/xy/remove', select: '/api/ext/xy/select', color: '/api/ext/xy/color', restore: '/api/ext/xy/restore', addFrom: true }
  const manifest = (item: Record<string, unknown>, hostApi = 4) => base({ id: 'xy', hostApi, api: 'api.js', ui: { title: 'T', items: [item] } }) as unknown as Manifest
  it('is taken with the addresses of its own API part', () => {
    assert.strictEqual(checkManifest(manifest(roster), files('api.js')), null)
  })
  it('is refused with an address of another extension, before hostApi 4 or with a bad addFrom', () => {
    assert.ok(checkManifest(manifest({ ...roster, list: '/api/ext/other/list' }), files('api.js')))
    assert.ok(checkManifest(manifest(roster, 3), files('api.js')))
    assert.ok(checkManifest(manifest({ ...roster, addFrom: 'yes' }), files('api.js')))
  })
})

describe('GPIO pins the user chooses, and a page of its own (hostApi 5)', () => {
  const manifest = (settings: unknown, ui: Record<string, unknown> = {}, hostApi = 5) => base({ id: 'xy', hostApi, settings, ui: { title: 'T', items: [], ...ui } })
  const pin = { type: 'gpio', default: 0 }

  it('a gpio setting starts without a pin and has nothing to choose from in the manifest', () => {
    assert.strictEqual(checkManifest(manifest({ p: pin }, { items: [{ key: 'p', label: 'Pin' }] }), files()), null)
    assert.strictEqual(checkManifest(manifest({ p: { type: 'gpio' } }), files()), null)
    assert.ok(checkManifest(manifest({ p: pin }, {}, 4), files()), 'needs hostApi 5')
    assert.ok(checkManifest(manifest({ p: { type: 'gpio', default: 17 } }), files()), 'a pin named in the manifest could be one that is taken')
    assert.ok(checkManifest(manifest({ p: { type: 'gpio', options: [17, 27] } }), files()))
    assert.ok(checkManifest(manifest({ p: { type: 'gpio', min: 2 } }), files()))
    assert.ok(checkManifest(manifest({ p: { type: 'gpio', legacy: 'fan.fan_gpio' } }), files()))
    assert.ok(checkManifest(manifest({ p: pin }, { items: [{ key: 'p', label: 'Pin', choices: [{ value: 17, label: 'x' }] }] }), files()), 'the app draws the choice')
    assert.ok(checkManifest(manifest({ p: pin }, { items: [{ key: 'p', label: 'Pin', type: 'lookup', search: '/api/ext/xy/pins' }] }), files()))
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`p${i}`, pin]))
    assert.match(String(checkManifest(manifest(many), files())), /too many gpio settings/)
  })

  it('a heading can be named by the user and be one that is added: a text setting and a switch', () => {
    const settings = { p: pin, name: { type: 'string', default: '' }, on: { type: 'boolean', default: false }, kind: { type: 'string', default: 'a', options: ['a', 'b'] } }
    const ui = (heading: Record<string, unknown>, field: Record<string, unknown> = {}) => manifest(settings, { items: [{ type: 'heading', label: 'Taster', ...heading }, { key: 'p', label: 'Pin', ...field }] })
    assert.strictEqual(checkManifest(ui({ rename: 'name', optional: 'on' }), files()), null)
    assert.strictEqual(checkManifest(ui({ rename: 'name' }), files()), null)
    assert.match(String(checkManifest(ui({ rename: 'on' }), files())), /rename must be a text setting/)
    assert.match(String(checkManifest(ui({ rename: 'kind' }), files())), /rename must be a text setting/, 'a text with options is a choice, not a name')
    assert.match(String(checkManifest(ui({ rename: 'nothing' }), files())), /rename must be a text setting/)
    assert.match(String(checkManifest(ui({ rename: '__proto__' }), files())), /rename must be a text setting/)
    assert.match(String(checkManifest(ui({ optional: 'name' }), files())), /optional must be a switch/)
    assert.match(String(checkManifest(ui({ optional: 'p' }), files())), /optional must be a switch/)
    assert.match(String(checkManifest(ui({}, { rename: 'name' }), files())), /only a heading/)
    assert.match(String(checkManifest(ui({}, { optional: 'on' }), files())), /only a heading/)
  })

  it('a heading can be a card of its own: true, and not on a field', () => {
    const settings = { p: pin }
    const ui = (heading: Record<string, unknown>, field: Record<string, unknown> = {}) => manifest(settings, { items: [{ type: 'heading', label: 'Leser', ...heading }, { key: 'p', label: 'Pin', ...field }] })
    assert.strictEqual(checkManifest(ui({ card: true }), files()), null)
    assert.match(String(checkManifest(ui({ card: false }), files())), /card is true/)
    assert.match(String(checkManifest(ui({ card: 'yes' }), files())), /card is true/)
    assert.match(String(checkManifest(ui({}, { card: true }), files())), /only a heading/)
  })

  it('a field with choices can have a second choice beside it, shown for some of its values', () => {
    const settings = { act: { type: 'string', default: 'next', options: ['next', 'up', 'down'] }, step: { type: 'number', default: 5, options: [1, 5, 10] }, free: { type: 'number', default: 5 }, p: pin }
    const choices = [{ value: 'next', label: 'Weiter' }, { value: 'up', label: 'Lauter' }, { value: 'down', label: 'Leiser' }]
    const steps = [{ value: 1, label: '1 %' }, { value: 5, label: '5 %' }, { value: 10, label: '10 %' }]
    const ui = (extra: unknown, hostApi = 5) => manifest(settings, { items: [{ key: 'act', label: 'Aktion', choices, extra }] }, hostApi)
    assert.strictEqual(checkManifest(ui({ key: 'step', label: 'Schritt', when: ['up', 'down'], choices: steps }), files()), null)
    assert.strictEqual(checkManifest(ui({ key: 'step', when: ['up'], choices: steps }), files()), null)
    assert.ok(checkManifest(ui({ key: 'step', when: ['up'], choices: steps }, 4), files()), 'needs hostApi 5')
    assert.match(String(checkManifest(ui({ key: 'free', when: ['up'], choices: steps }), files())), /bad extra/, 'a setting without options')
    assert.match(String(checkManifest(ui({ key: 'act', when: ['up'], choices }), files())), /bad extra/, 'not the field itself')
    assert.match(String(checkManifest(ui({ key: '__proto__', when: ['up'], choices: steps }), files())), /bad extra/)
    assert.match(String(checkManifest(ui({ key: 'step', when: ['loud'], choices: steps }), files())), /when/)
    assert.match(String(checkManifest(ui({ key: 'step', when: [], choices: steps }), files())), /when/)
    assert.match(String(checkManifest(ui({ key: 'step', when: ['up'], choices: steps.slice(1) }), files())), /bad extra choices/)
    assert.match(String(checkManifest(ui({ key: 'step', when: ['up'], choices: [...steps.slice(1), { value: 7, label: '7 %' }] }), files())), /bad extra choices/)
    // (only beside a field with choices: not beside a pin, not on a heading)
    assert.ok(checkManifest(manifest(settings, { items: [{ key: 'p', label: 'Pin', extra: { key: 'step', when: ['up'], choices: steps } }] }), files()))
    assert.ok(checkManifest(manifest(settings, { items: [{ type: 'heading', label: 'H', extra: { key: 'step', when: ['up'], choices: steps } }] }), files()))
    // the extra setting is saved as any setting with options
    const m = ui({ key: 'step', when: ['up'], choices: steps }) as unknown as Manifest
    assert.deepStrictEqual(checkSettings(m, { step: 10 }), { ok: true, clean: { step: 10 } })
    assert.strictEqual(checkSettings(m, { step: 7 }).ok, false)
  })

  it('the card on the page of an extension can have a heading of its own', () => {
    assert.strictEqual(checkManifest(manifest({}, { place: 'system', heading: 'Buttons' }), files()), null)
    assert.match(String(checkManifest(manifest({}, { heading: 'Buttons' }), files())), /bad heading/, 'only on a page of its own')
    assert.match(String(checkManifest(manifest({}, { place: 'system', heading: '' }), files())), /bad heading/)
    assert.match(String(checkManifest(manifest({}, { place: 'system', heading: 'x'.repeat(61) }), files())), /bad heading/)
    assert.match(String(checkManifest(manifest({}, { place: 'system', heading: 7 }), files())), /bad heading/)
  })

  it('a pin is a header pin or 0 for none', () => {
    const m = manifest({ p: pin, on: { type: 'boolean' } }) as unknown as Manifest
    for (const ok of [0, 2, 17, 27]) assert.deepStrictEqual(checkSettings(m, { p: ok }), { ok: true, clean: { p: ok } })
    for (const bad of [1, 28, -17, 17.5, '17', null, true, Number.NaN, [17]]) assert.strictEqual(checkSettings(m, { p: bad }).ok, false, String(bad))
    // (names every object has are no settings)
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.strictEqual(checkSettings(m, { [key]: 17 }).ok, false, key)
  })

  it('the chosen pins are what the extension holds: each once, in range, none for 0', () => {
    const m = manifest({ a: pin, b: pin, c: pin, d: pin, n: { type: 'number' } }, { items: [{ key: 'a', label: 'Taster 1' }] }) as unknown as Manifest
    assert.deepStrictEqual(chosenGpio(m, { a: 17, b: 0, c: 17, d: 27, n: 22 }), [
      { pin: 17, purpose: 'Taster 1' },
      { pin: 27, purpose: 'd' },
    ])
    assert.deepStrictEqual(chosenGpio(m, { a: '17', b: 99, c: 1, d: 2.5 }), [])
    assert.deepStrictEqual(chosenGpio(base() as unknown as Manifest, { a: 17 }), [])
  })

  it('a pin is refused when another field of the extension has it or something else holds it', () => {
    const m = manifest({ a: pin, b: pin, n: { type: 'number' } }) as unknown as Manifest
    const taken = new Map([[13, ['MuPiBox (power LED)']], [26, ['MuPiBox (rotary encoder)']]])
    assert.strictEqual(gpioSettingError(m, { a: 17, b: 27 }, ['a', 'b'], taken), null)
    assert.deepStrictEqual(gpioSettingError(m, { a: 17, b: 17 }, ['b'], taken), { error: 'gpio_twice', key: 'b', pin: 17 })
    assert.deepStrictEqual(gpioSettingError(m, { a: 13, b: 0 }, ['a'], taken), { error: 'gpio_taken', key: 'a', pin: 13, holders: ['MuPiBox (power LED)'] })
    // (two fields without a pin are not "the same pin"; a number that is no pin setting is not looked at)
    assert.strictEqual(gpioSettingError(m, { a: 0, b: 0, n: 13 }, ['a', 'b', 'n'], taken), null)
    // (only what changes is tested: a pin saved before that something took since does not block the other fields)
    assert.strictEqual(gpioSettingError(m, { a: 26, b: 5 }, ['b'], taken), null)
  })

  it('headings, many fields and a field that depends on a pin', () => {
    const settings = { p: pin, on: { type: 'boolean' }, t: { type: 'string' } }
    const items = [{ type: 'heading', label: 'Taster 1', help: 'x' }, { key: 'p', label: 'Pin' }, { key: 't', label: 'Text', dep: 'p' }, { type: 'heading', label: 'Mehr', dep: 'on' }]
    assert.strictEqual(checkManifest(manifest(settings, { items }), files()), null)
    assert.ok(checkManifest(manifest(settings, { items }, 4), files()))
    assert.ok(checkManifest(manifest(settings, { items: [{ type: 'heading', label: 'H', key: 't' }] }), files()), 'a heading has no setting')
    assert.ok(checkManifest(manifest(settings, { items: [{ key: 't', label: 'T', dep: 't' }] }), files()), 'a text is nothing to depend on')
    assert.ok(checkManifest(manifest(settings, { items: [{ key: 'toString', label: 'T' }] }), files()), 'a name every object has is no setting')
    assert.ok(checkManifest(manifest(settings, { items: [{ key: 't', label: 'T', dep: 'constructor' }] }), files()))
    const field = { key: 't', label: 'T' }
    assert.strictEqual(checkManifest(manifest(settings, { items: Array.from({ length: 80 }, () => field) }), files()), null)
    assert.ok(checkManifest(manifest(settings, { items: Array.from({ length: 81 }, () => field) }), files()))
    assert.ok(checkManifest(base({ id: 'xy', hostApi: 4, settings, ui: { title: 'T', items: Array.from({ length: 21 }, () => field) } }), files()), 'twenty before hostApi 5')
  })

  it('a field that is shown only while a choice has one of its values (showIf)', () => {
    const settings = { reader: { type: 'string', default: 'a', options: ['a', 'b', 'c'] }, t: { type: 'string' } }
    const ok = (showIf: unknown) => checkManifest(manifest(settings, { items: [{ key: 't', label: 'T', showIf }, { type: 'heading', label: 'H', showIf }] }), files())
    assert.strictEqual(ok({ key: 'reader', is: ['a', 'c'] }), null)
    assert.ok(ok({ key: 't', is: ['a'] }), 'a text has no values to choose from')
    assert.ok(ok({ key: 'nothing', is: ['a'] }))
    assert.ok(ok({ key: 'reader', is: ['z'] }), 'a value the setting does not have')
    assert.ok(ok({ key: 'reader', is: [] }))
    assert.ok(ok({ key: 'reader' }))
    assert.ok(ok({ key: 'constructor', is: ['a'] }))
    const page = { type: 'heading', label: 'P', page: true, showIf: { key: 'reader', is: ['a'] } }
    assert.ok(checkManifest(manifest(settings, { place: 'system', items: [page] }, 8), files()), 'a page cannot be hidden')
  })

  it('a field that is hidden while another choice has one of its values (hideIf)', () => {
    const settings = { reader: { type: 'string', default: 'a', options: ['a', 'b', 'c'] }, t: { type: 'string' } }
    const ok = (hideIf: unknown) => checkManifest(manifest(settings, { items: [{ key: 't', label: 'T', hideIf }] }), files())
    assert.strictEqual(ok({ key: 'reader', is: ['b', 'c'] }), null)
    assert.ok(ok({ key: 't', is: ['a'] }), 'a text has no values to choose from')
    assert.ok(ok({ key: 'nothing', is: ['a'] }))
    assert.ok(ok({ key: 'reader', is: ['z'] }), 'a value the setting does not have')
    assert.ok(ok({ key: 'reader', is: [] }))
    assert.ok(ok({ key: 'reader' }))
    assert.ok(checkManifest(manifest(settings, { items: [{ type: 'heading', label: 'H', hideIf: { key: 'reader', is: ['a'] } }] }), files()), 'a heading is not hidden this way')
  })

  it('a page of its own under System, and the pages of the core it may take over', () => {
    assert.strictEqual(checkManifest(manifest({}, { place: 'system' }), files()), null)
    assert.strictEqual(checkManifest(manifest({}, { place: 'system', adopt: ['rotary'] }), files()), null)
    assert.ok(checkManifest(manifest({}, { place: 'system' }, 4), files()), 'needs hostApi 5')
    assert.ok(checkManifest(manifest({}, { place: 'audio' }), files()))
    assert.ok(checkManifest(manifest({}, { adopt: ['rotary'] }), files()), 'only on a page of its own')
    assert.ok(checkManifest(manifest({}, { place: 'system', adopt: ['passwort'] }), files()), 'only what the core lets go')
    assert.ok(checkManifest(manifest({}, { place: 'system', adopt: ['rotary', 'rotary'] }), files()))
    assert.ok(checkManifest(manifest({}, { place: 'system', adopt: 'rotary' }), files()))
  })

  it('a sub page may show a page of the core: only on a heading that starts a page, only what the core lets go', () => {
    const heading = (extra: Record<string, unknown>) => manifest({}, { place: 'system', items: [{ type: 'heading', label: 'Erste', page: true }, { type: 'heading', label: 'Drehregler', page: true, ...extra }] }, 12)
    assert.strictEqual(checkManifest(heading({ adopt: ['rotary'] }), files()), null)
    assert.strictEqual(checkManifest(heading({}), files()), null)
    assert.ok(checkManifest(heading({ adopt: ['passwort'] }), files()), 'only what the core lets go')
    assert.ok(checkManifest(heading({ adopt: ['rotary', 'rotary'] }), files()))
    assert.ok(checkManifest(heading({ adopt: [] }), files()))
    assert.ok(checkManifest(heading({ adopt: 'rotary' }), files()))
    assert.ok(checkManifest(manifest({}, { place: 'system', items: [{ type: 'heading', label: 'Karte', card: true, adopt: ['rotary'] }] }, 12), files()), 'a card is no page')
  })
})

describe('a status block (hostApi 6)', () => {
  const manifest = (items: unknown[], hostApi = 6) => base({ id: 'xy', hostApi, settings: { t: { type: 'string' } }, ui: { title: 'T', items } })
  it('a status block names a route of the extension that tells what to show', () => {
    assert.strictEqual(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/xy/state' }, { key: 't', label: 'T' }]), files()), null)
    assert.match(String(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/xy/state' }], 5), files())), /status needs hostApi 6/)
    assert.match(String(checkManifest(manifest([{ type: 'status', label: 'Leser' }]), files())), /status address/)
    assert.match(String(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/other/state' }]), files())), /status address/)
    assert.match(String(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/xy/../state' }]), files())), /status address/)
    assert.ok(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/xy/state', key: 't' }]), files()), 'no setting')
    assert.ok(checkManifest(manifest([{ type: 'status', label: 'Leser', state: '/api/ext/xy/state', choices: [] }]), files()))
  })
})

describe('a button (hostApi 7)', () => {
  const manifest = (items: unknown[], hostApi = 7) => base({ id: 'xy', hostApi, settings: { t: { type: 'string' } }, ui: { title: 'T', items } })
  it('a button names a route of the extension that its tap asks, and has no setting', () => {
    assert.strictEqual(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/arm' }, { key: 't', label: 'T' }]), files()), null)
    assert.strictEqual(checkManifest(manifest([{ type: 'action', label: 'Löschen', post: '/api/ext/xy/forget', confirm: 'Wirklich?', help: 'Hilfe' }]), files()), null)
    assert.match(String(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/arm' }], 6), files())), /action needs hostApi 7/)
    assert.match(String(checkManifest(manifest([{ type: 'action', label: 'Start' }]), files())), /action address/)
    assert.match(String(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/other/arm' }]), files())), /action address/)
    assert.match(String(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/../arm' }]), files())), /action address/)
    assert.match(String(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/arm', confirm: '' }]), files())), /action question/)
    assert.ok(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/arm', key: 't' }]), files()), 'no setting')
    assert.ok(checkManifest(manifest([{ type: 'action', label: 'Start', post: '/api/ext/xy/arm', state: '/api/ext/xy/state' }]), files()), 'no status')
  })
})

describe('a button that saves or takes in a file (hostApi 10)', () => {
  const manifest = (item: Record<string, unknown>, hostApi = 10) => base({ id: 'xy', hostApi, settings: { t: { type: 'string' } }, ui: { title: 'T', items: [{ type: 'action', label: 'Datei', ...item }] } })
  it('download names a route and the start of the file name, upload names a route', () => {
    assert.strictEqual(checkManifest(manifest({ download: '/api/ext/xy/export', file: 'my-list' }), files()), null)
    assert.strictEqual(checkManifest(manifest({ upload: '/api/ext/xy/import', confirm: 'Sicher?', help: 'Hilfe' }), files()), null)
    assert.match(String(checkManifest(manifest({ download: '/api/ext/xy/export', file: 'my-list' }, 9), files())), /download and upload need hostApi 10/)
    assert.match(String(checkManifest(manifest({ upload: '/api/ext/xy/import' }, 9), files())), /download and upload need hostApi 10/)
  })
  it('exactly one of post, download and upload; the address is one of the extension', () => {
    assert.match(String(checkManifest(manifest({}), files())), /action address/)
    assert.match(String(checkManifest(manifest({ post: '/api/ext/xy/a', upload: '/api/ext/xy/b' }), files())), /one of post, download and upload/)
    assert.match(String(checkManifest(manifest({ download: '/api/ext/xy/a', upload: '/api/ext/xy/b', file: 'f' }), files())), /one of post, download and upload/)
    assert.match(String(checkManifest(manifest({ download: '/api/ext/other/export', file: 'f' }), files())), /action address/)
    assert.match(String(checkManifest(manifest({ upload: '/api/ext/xy/../import' }), files())), /action address/)
    assert.match(String(checkManifest(manifest({ upload: 5 }), files())), /action address/)
  })
  it('a download has a file name of letters, digits and hyphens; only a download has one', () => {
    assert.match(String(checkManifest(manifest({ download: '/api/ext/xy/export' }), files())), /download file name/)
    assert.match(String(checkManifest(manifest({ download: '/api/ext/xy/export', file: '../x' }), files())), /download file name/)
    assert.match(String(checkManifest(manifest({ download: '/api/ext/xy/export', file: 'A b' }), files())), /download file name/)
    assert.match(String(checkManifest(manifest({ upload: '/api/ext/xy/import', file: 'f' }), files())), /file belongs to a download/)
    assert.match(String(checkManifest(manifest({ post: '/api/ext/xy/a', file: 'f' }), files())), /file belongs to a download/)
  })
})

describe('a table for a download, the kinds of files of an upload, two buttons in a row (hostApi 11)', () => {
  const items = (...list: Record<string, unknown>[]) => (hostApi = 11) => base({ id: 'xy', hostApi, settings: {}, ui: { title: 'T', items: list.map((i) => ({ type: 'action', label: 'B', ...i })) } })
  const down = { download: '/api/ext/xy/export', file: 'list' }
  const up = { upload: '/api/ext/xy/import' }
  it('ext is a short name for a download; accept is the list of file endings of an upload', () => {
    assert.strictEqual(checkManifest(items({ ...down, ext: 'csv' })(), files()), null)
    assert.strictEqual(checkManifest(items({ ...up, accept: '.csv,.json' })(), files()), null)
    assert.match(String(checkManifest(items({ ...down, ext: 'csv' })(10), files())), /ext belongs to a download, from hostApi 11/)
    assert.match(String(checkManifest(items({ ...up, ext: 'csv' })(), files())), /ext belongs to a download/)
    assert.match(String(checkManifest(items({ ...down, ext: '../x' })(), files())), /ext belongs to a download/)
    assert.match(String(checkManifest(items({ ...down, accept: '.csv' })(), files())), /accept belongs to an upload/)
    for (const accept of ['csv', '.csv;.json', '.CSV', '.csv,', '*/*']) assert.match(String(checkManifest(items({ ...up, accept })(), files())), /accept belongs to an upload/, accept)
  })
  it('beside needs a button before it', () => {
    assert.strictEqual(checkManifest(items({ ...down, ext: 'csv' }, { ...up, beside: true })(), files()), null)
    assert.match(String(checkManifest(items({ ...up, beside: true })(), files())), /beside needs hostApi 11 and a button before it/)
    assert.match(String(checkManifest(items({ ...down }, { ...up, beside: true })(10), files())), /beside needs hostApi 11/)
    assert.match(String(checkManifest(items({ ...down }, { ...up, beside: 'yes' })(), files())), /beside needs/)
  })
})

describe('a slider for a number (hostApi 10)', () => {
  const manifest = (item: Record<string, unknown>, settings: Record<string, unknown>, hostApi = 10) => base({ id: 'xy', hostApi, settings, ui: { title: 'T', items: [{ key: 'n', label: 'N', ...item }] } })
  const range = { n: { type: 'number', default: 20, min: 1, max: 255 } }
  it('is a number with a range, from hostApi 10 on', () => {
    assert.strictEqual(checkManifest(manifest({ slider: true }, range), files()), null)
    assert.match(String(checkManifest(manifest({ slider: true }, range, 9), files())), /slider needs hostApi 10/)
    assert.match(String(checkManifest(manifest({ slider: true }, { n: { type: 'number', default: 20 } }), files())), /slider needs/)
    assert.match(String(checkManifest(manifest({ slider: true }, { n: { type: 'string', default: '' } }), files())), /slider needs/)
    assert.match(String(checkManifest(manifest({ slider: true }, { n: { type: 'number', default: 5, min: 5, max: 5 } }), files())), /slider needs/)
    assert.match(String(checkManifest(manifest({ slider: 'yes' }, range), files())), /slider needs/)
  })
  it('is the host API of this box', () => {
    assert.ok(HOST_API >= 10)
  })
})

describe('a list (hostApi 8)', () => {
  const manifest = (items: unknown[], hostApi = 8) => base({ id: 'xy', hostApi, settings: { t: { type: 'string' } }, ui: { title: 'T', items } })
  it('names a route of the extension that answers its entries, and has no setting', () => {
    assert.strictEqual(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags' }, { key: 't', label: 'T' }]), files()), null)
    assert.strictEqual(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags', empty: 'Nichts da', help: 'Hilfe' }]), files()), null)
    assert.match(String(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags' }], 7), files())), /list needs hostApi 8/)
    assert.match(String(checkManifest(manifest([{ type: 'list', label: 'Tags' }]), files())), /list address/)
    assert.match(String(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/other/tags' }]), files())), /list address/)
    assert.match(String(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/../tags' }]), files())), /list address/)
    assert.match(String(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags', empty: '' }]), files())), /list text/)
    assert.ok(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags', key: 't' }]), files()), 'no setting')
    assert.ok(checkManifest(manifest([{ type: 'list', label: 'Tags', list: '/api/ext/xy/tags', post: '/api/ext/xy/x' }]), files()), 'no button of its own')
  })
})

describe('sub pages (hostApi 7)', () => {
  const page = (label: string, extra: object = {}) => ({ type: 'heading', label, page: true, ...extra })
  const manifest = (items: unknown[], hostApi = 7, place: string | null = 'system') => base({ id: 'xy', hostApi, settings: { t: { type: 'string' }, s: { type: 'boolean' } }, ui: { title: 'T', place: place ?? undefined, items } })
  it('a heading can start a page of its own: two or more, the first line starts the first', () => {
    assert.strictEqual(checkManifest(manifest([page('A'), { key: 't', label: 'T' }, { type: 'heading', label: 'Group' }, page('B'), { key: 's', label: 'S' }]), files()), null)
    assert.match(String(checkManifest(manifest([page('A'), { key: 't', label: 'T' }]), files())), /two to six/)
    assert.match(String(checkManifest(manifest([{ key: 't', label: 'T' }, page('A'), page('B')]), files())), /two to six/)
    assert.match(String(checkManifest(manifest([page('A'), page('B'), page('C'), page('D'), page('E'), page('F'), page('G')]), files())), /two to six/)
  })
  it('needs hostApi 7 and a page of its own for the extension, and no group tricks', () => {
    assert.match(String(checkManifest(manifest([page('A'), page('B')], 6), files())), /a page needs hostApi 7/)
    assert.match(String(checkManifest(manifest([page('A'), page('B')], 7, null), files())), /a page needs hostApi 7/)
    assert.match(String(checkManifest(manifest([page('A', { rename: 't' }), page('B')]), files())), /a page needs hostApi 7/)
    assert.match(String(checkManifest(manifest([page('A', { optional: 's' }), page('B')]), files())), /a page needs hostApi 7/)
    assert.match(String(checkManifest(manifest([page('A', { dep: 's' }), page('B')]), files())), /a page needs hostApi 7/)
    assert.match(String(checkManifest(manifest([{ type: 'heading', label: 'A', page: false }, page('B')]), files())), /a page needs hostApi 7/)
  })
})

describe('the buttons extension of this repository', () => {
  const extDir = path.join(process.cwd(), '..', '..', 'extensions')
  const buttons = JSON.parse(readFileSync(path.join(extDir, 'buttons', 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts: pins to choose, a page under System, the rotary encoder on it', () => {
    assert.strictEqual(checkManifest(buttons, files('api.js', 'icon.svg')), null)
    assert.strictEqual(buttons.ui?.place, 'system')
    assert.deepStrictEqual(buttons.ui?.adopt, ['rotary'])
    assert.deepStrictEqual(buttons.resources, {}, 'no pin of its own: the user chooses them')
  })
  it('shows every button and every double button in a card of its own', () => {
    const headings = (buttons.ui?.items ?? []).filter((i) => i.type === 'heading')
    assert.strictEqual(headings.length, 8, 'six buttons, two double buttons')
    assert.ok(headings.every((h) => h.card === true))
  })
  it('takes the settings the app sends: a pin, an action, a hold time', () => {
    assert.strictEqual(checkSettings(buttons, { b1Pin: 17, b1Short: 'toggle', b1Long: 'replay', b1Hold: 1.5, b1Repeat: true, b1ShortStep: 3 }).ok, true)
    assert.strictEqual(checkSettings(buttons, { b1ShortStep: 4 }).ok, false)
    assert.strictEqual(checkSettings(buttons, { volumeStep: 3 }).ok, false, 'the step for all is gone: every action has its own')
    assert.strictEqual(checkSettings(buttons, { b1Short: 'reboot' }).ok, false)
    assert.strictEqual(checkSettings(buttons, { b1Hold: 0.1 }).ok, false)
    assert.strictEqual(checkSettings(buttons, { b1Pin: 40 }).ok, false)
  })
  it('is packed as the catalog says', () => {
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'buttons')
    const bytes = readFileSync(path.join(extDir, 'dist', `buttons-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
    if (checked.ok) assert.deepStrictEqual(checked.pkg.manifest, buttons, 'the package holds the manifest of the repository')
  })
})

describe('the NFC extension of this repository', () => {
  const extDir = path.join(process.cwd(), '..', '..', 'extensions')
  const nfc = JSON.parse(readFileSync(path.join(extDir, 'nfc', 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts: a status block, two pins to choose, a page under System', () => {
    assert.strictEqual(checkManifest(nfc, files('api.js', 'display.js', 'icon.svg', '99-mpx-nfc.rules')), null)
    // (16: the OLED picture of a tag - the row action says it has one, the app shows it and asks)
    assert.strictEqual(nfc.hostApi, 16)
    assert.strictEqual(nfc.ui?.place, 'system')
    assert.strictEqual(nfc.name, 'NFC-Extension')
    assert.deepStrictEqual(nfc.ui?.items.filter((i) => i.type === 'heading' && i.page).map((i) => i.label), ['NFC-Reader', 'Zugeordnete Tags', 'Drehregler', 'Sprachausgabe'], 'four sub pages')
    assert.deepStrictEqual(nfc.resources, {}, 'no pin of its own: the user chooses BUSY and RST')
    assert.deepStrictEqual(nfc.system?.packages, ['python3-spidev', 'python3-lgpio'])
  })
  it('lists the tags with their pictures, and what to do when a tag is taken off', () => {
    const items = nfc.ui?.items ?? []
    assert.strictEqual(items.find((i) => i.type === 'list')?.list, '/api/ext/nfc/tags')
    const buttons = items.filter((i) => i.type === 'action' || i.type === 'lookup')
    assert.deepStrictEqual(buttons.map((i) => i.download ?? i.upload), ['/api/ext/nfc/tagexportcsv', '/api/ext/nfc/tagimport'], 'the medium is given in the library, not on this page; the only buttons are the list as a file and a file taken in (those of SPI, I2C and the serial port are in the rows of their state)')
    assert.deepStrictEqual([buttons[0].file, buttons[0].ext, buttons[1].accept, buttons[1].beside], ['mupibox-nfc-tags', 'csv', '.csv,.json', true], 'the table for Excel, and the two buttons in one row')
    assert.strictEqual(checkSettings(nfc, { onRemove: 'stop', playOnTag: false }).ok, true)
    assert.strictEqual(checkSettings(nfc, { onRemove: 'rewind' }).ok, false)
    // (the spoken messages: a switch and a text each, in cards of the page Sprachausgabe)
    assert.strictEqual(checkSettings(nfc, { sayLowBatteryOn: false, sayTagNewText: 'Dieser Tag ist neu.' }).ok, true)
    assert.strictEqual(checkSettings(nfc, { sayTagNewText: 'x'.repeat(301) }).ok, false)
    const spoken = (nfc.ui?.items ?? []).slice((nfc.ui?.items ?? []).findIndex((i) => i.label === 'Sprachausgabe'))
    assert.deepStrictEqual(spoken.filter((i) => i.type === 'heading').map((i) => i.label), ['Sprachausgabe', 'WLAN', 'Inhalte', 'Tags und Akku'])
    assert.strictEqual(spoken.filter((i) => i.key?.endsWith('On')).length, 8, 'eight messages')
  })
  it('has a udev rule that opens the SPI device for the group of the header pins - and nothing that runs a program', () => {
    const rule = readFileSync(path.join(extDir, 'nfc', '99-mpx-nfc.rules'), 'utf8')
    assert.strictEqual(checkUdevRules(rule), null)
    assert.match(rule, /SUBSYSTEM=="spidev"/)
    assert.match(rule, /GROUP="gpio"/)
  })
  it('takes the settings the app sends: a reader, a chip select, two pins, the kinds of tags', () => {
    assert.strictEqual(checkSettings(nfc, { reader: 'pn5180', spiDevice: '0.1', busyPin: 25, resetPin: 23, tech: 'v' }).ok, true)
    for (const reader of ['rc522', 'pn532', 'hid']) assert.strictEqual(checkSettings(nfc, { reader }).ok, true, reader)
    assert.strictEqual(checkSettings(nfc, { reader: 'pn532', pn532Link: 'uart', uartDevice: '/dev/ttyAMA0' }).ok, true)
    assert.strictEqual(checkSettings(nfc, { reader: 'hid', hidDevice: 'IC Reader' }).ok, true)
    assert.strictEqual(checkSettings(nfc, { reader: 'mfrc' }).ok, false)
    assert.strictEqual(checkSettings(nfc, { pn532Link: 'usb' }).ok, false)
    assert.strictEqual(checkSettings(nfc, { uartDevice: '/etc/passwd' }).ok, false)
    assert.strictEqual(checkSettings(nfc, { hidDevice: 'a; rm -rf /' }).ok, false, 'a name is plain text')
    assert.strictEqual(checkSettings(nfc, { spiDevice: '1.0' }).ok, false)
    assert.strictEqual(checkSettings(nfc, { busyPin: 40 }).ok, false)
  })
  it('lets the choice of the reader follow what is plugged in: `live` is a route of the extension, on a field with choices', () => {
    const live = (nfc.ui?.items ?? []).filter((i) => i.live)
    assert.deepStrictEqual(live.map((i) => i.key), ['reader', 'reader2', 'reader3'])
    assert.ok(live.every((i) => i.live === '/api/ext/nfc/usbstate'))
    const withLive = (item: Record<string, unknown>) => ({ ...nfc, ui: { ...nfc.ui!, items: nfc.ui!.items.map((i) => (i.key === 'reader' ? { ...i, ...item } : i)) } }) as Manifest
    const check = (m: Manifest) => checkManifest(m, files('api.js', 'display.js', 'icon.svg', '99-mpx-nfc.rules'))
    assert.match(String(check(withLive({ live: '/api/ext/other/usbstate' }))), /live address/)
    assert.match(String(check(withLive({ live: '/api/ext/nfc/usb/state' }))), /live address/)
    const noChoices = { ...nfc, ui: { ...nfc.ui!, items: nfc.ui!.items.map((i) => (i.key === 'busyPin' ? { ...i, live: '/api/ext/nfc/usbstate' } : i)) } } as Manifest
    assert.match(String(check(noChoices)), /live belongs to a field with choices/)
  })
  it('runs up to three readers: the second and third have settings of their own, the fields of each follow its choice', () => {
    assert.strictEqual(checkSettings(nfc, { reader: 'pn5180', busyPin: 25, resetPin: 23, reader2: 'rc522', spiDevice2: '0.1', reader3: 'hid', hidDevice3: 'Tera' }).ok, true)
    assert.strictEqual(checkSettings(nfc, { reader2: 'mfrc' }).ok, false)
    assert.strictEqual(checkSettings(nfc, { reader2On: true, reader3On: false }).ok, true)
    // the page: Reader 1, and the two that are added with the "+" (the groups of a series: the same heading, the later ones optional), each with its status
    const items = nfc.ui?.items ?? []
    const heads = items.filter((i) => i.type === 'heading' && i.label === 'Leser')
    assert.deepStrictEqual(heads.map((h) => h.optional), [undefined, 'reader2On', 'reader3On'])
    assert.deepStrictEqual(items.filter((i) => i.type === 'status').map((i) => i.state), ['/api/ext/nfc/spistate', '/api/ext/nfc/iicstate', '/api/ext/nfc/uartstate', '/api/ext/nfc/stateone', '/api/ext/nfc/statetwo', '/api/ext/nfc/statethree'], 'the card of the ports first (a block for each), then one status per reader')
    const at = (h: unknown) => items.indexOf(h as never)
    assert.strictEqual(items[at(heads[1]) - 1].key, 'tech', 'no heading between the groups of the readers')
    assert.strictEqual(items[at(heads[0]) + 1].type, 'status', 'the status is the first line of its reader')
    assert.strictEqual(checkSettings(nfc, { reader4: 'hid' }).ok, false, 'no fourth reader')
    assert.strictEqual(checkSettings(nfc, { hidDevice2: 'a; rm -rf /' }).ok, false)
    const nss = (n: number) => nfc.ui?.items.find((i) => i.key === `spiDevice${n === 1 ? '' : n}`)
    assert.deepStrictEqual([1, 2, 3].map((n) => nss(n)?.hideIf), [1, 2, 3].map((n) => ({ key: `pn532Link${n === 1 ? '' : n}`, is: ['i2c', 'uart'] })), 'the NSS pin is not asked for while a PN532 is on I2C or serial')
    const shown = (n: number) => (nfc.ui?.items ?? []).filter((i) => i.showIf?.key === `reader${n === 1 ? '' : n}`).map((i) => i.key)
    const base = (keys: (string | undefined)[], n: number) => keys.map((k) => k?.replace(n === 1 ? /$/ : new RegExp(`${n}$`), ''))
    assert.deepStrictEqual(base(shown(2), 2).filter(Boolean), base(shown(1), 1).filter(Boolean), 'the same fields for each reader')
    assert.deepStrictEqual(base(shown(3), 3).filter(Boolean), base(shown(1), 1).filter(Boolean))
  })
  it('has its own pins for the album knob: three pins of the header, none by default; the knob is no longer the one of the core', () => {
    for (const key of ['knobA', 'knobB', 'knobButton']) assert.deepStrictEqual(nfc.settings?.[key], { type: 'gpio', default: 0 }, key)
    assert.strictEqual(nfc.settings?.rotary, undefined, 'no switch that hands the knob of the box over')
    assert.strictEqual(nfc.ui?.items.some((i) => i.type === 'heading' && i.adopt !== undefined), false, 'the page of the volume knob stays with the core')
    assert.strictEqual(checkSettings(nfc, { knobA: 5, knobB: 6, knobButton: 13, rotarySeconds: 0 }).ok, true)
    assert.strictEqual(checkSettings(nfc, { knobA: 40 }).ok, false)
    assert.strictEqual(checkSettings(nfc, { knobButton: 1 }).ok, false)
    // (a pin twice, or one something else holds, is refused when the settings are saved)
    const merged = { knobA: 5, knobB: 5, knobButton: 13 }
    assert.strictEqual(gpioSettingError(nfc, merged, ['knobB'], new Map())?.error, 'gpio_twice')
    assert.strictEqual(gpioSettingError(nfc, { knobA: 26, knobB: 6, knobButton: 13 }, ['knobA'], new Map([[26, ['MuPiBox (rotary encoder)']]]))?.error, 'gpio_taken')
  })
  it('is packed as the catalog says, with its Python driver in it', () => {
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'nfc')
    const bytes = readFileSync(path.join(extDir, 'dist', `nfc-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
    if (checked.ok) {
      assert.deepStrictEqual(checked.pkg.manifest, nfc, 'the package holds the manifest of the repository')
      for (const driver of ['pn5180.py', 'rc522.py', 'pn532.py', 'usbreader.py', 'knob.py']) assert.ok(checked.pkg.files.has(driver), driver)
    }
  })
})

describe('the OLED extension of this repository', () => {
  const extDir = path.join(process.cwd(), '..', '..', 'extensions')
  const oled = JSON.parse(readFileSync(path.join(extDir, 'oled', 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts: a status block, a page under System, Pillow as its one package', () => {
    assert.strictEqual(checkManifest(oled, files('api.js', 'icon.svg', '99-mpx-oled.rules', 'images/mode-full.svg', 'images/mode-mix.svg', 'images/mode-lite.svg')), null)
    assert.strictEqual(oled.ui?.place, 'system')
    assert.strictEqual(oled.name, 'OLED-Display')
    assert.deepStrictEqual(oled.resources, {}, 'the I2C bus is shared: it holds no pin of its own')
    assert.deepStrictEqual(oled.system?.packages, ['python3-pil'])
    assert.deepStrictEqual(oled.ui?.items.filter((i) => i.type === 'status').map((i) => i.state), ['/api/ext/oled/state'])
    assert.deepStrictEqual(oled.ui?.items.filter((i) => i.type === 'action').map((i) => i.post), ['/api/ext/oled/info'])
  })
  it('has a udev rule that opens the I2C bus for the group of the header pins - and nothing that runs a program', () => {
    const rule = readFileSync(path.join(extDir, 'oled', '99-mpx-oled.rules'), 'utf8')
    assert.strictEqual(checkUdevRules(rule), null)
    assert.match(rule, /SUBSYSTEM=="i2c-dev"/)
    assert.match(rule, /GROUP="gpio"/)
  })
  it('an OLED-Display before 0.4.0 is not taken any more: it switched the start without the DSI display itself, now the core does', () => {
    const files = new Set(['api.js', 'icon.svg'])
    const old = { ...oled, version: '0.3.1', settings: {}, ui: undefined, system: undefined }
    assert.match(String(checkManifest(old, files)), /too old/)
    assert.strictEqual(checkManifest({ ...old, version: '0.4.0' }, files), null)
    assert.strictEqual(checkManifest({ ...old, version: '1.0.0' }, files), null)
    assert.strictEqual(checkManifest({ ...old, id: 'other' }, files), null)
  })
  it('takes the settings the app sends: chip, size, address, mode, the time and sleep', () => {
    assert.strictEqual(checkSettings(oled, { controller: 'sh1106', size: '128x32', address: '0x3D', rotate: true, contrast: 80, mode: 'mix', idleScreen: 'clock', timeMode: 'down', sleepAfter: 15 }).ok, true)
    // (the start without the DSI display is a switch of the core since 5.1, no setting of the extension any more)
    assert.strictEqual(checkSettings(oled, { headless: true }).ok, false)
    assert.strictEqual(checkSettings(oled, { controller: 'ssd1331' }).ok, false)
    assert.strictEqual(checkSettings(oled, { size: '64x48' }).ok, false)
    assert.strictEqual(checkSettings(oled, { address: '0x10' }).ok, false)
    assert.strictEqual(checkSettings(oled, { contrast: 300 }).ok, false)
    assert.strictEqual(checkSettings(oled, { sleepAfter: 7 }).ok, false)
    assert.strictEqual(checkSettings(oled, { timeMode: 'sideways' }).ok, false)
    assert.strictEqual(checkSettings(oled, { idleScreen: 'photo' }).ok, false)
  })
  it('has the list of its pictures on the page, and its pictures in the package', () => {
    assert.deepStrictEqual(oled.ui?.items.filter((i) => i.type === 'list').map((i) => i.list), ['/api/ext/oled/images'])
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'oled')
    const checked = verifyPackage(readFileSync(path.join(extDir, 'dist', `oled-${entry.version}.mpx`)))
    assert.strictEqual(checked.ok, true)
    if (checked.ok) for (const name of ['boot', 'nfc', 'barcode', 'shutdown', 'update', 'rest']) assert.ok(checked.pkg.files.has(`images/${name}.png`), name)
  })
  it('is packed as the catalog says, with its Python driver and screens in it - and no test', () => {
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'oled')
    const bytes = readFileSync(path.join(extDir, 'dist', `oled-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
    if (checked.ok) {
      assert.deepStrictEqual(checked.pkg.manifest, oled, 'the package holds the manifest of the repository')
      for (const file of ['oled.py', 'render.py', 'driver.js', 'logic.js', 'api.js']) assert.ok(checked.pkg.files.has(file), file)
      assert.ok(![...checked.pkg.files.keys()].some((name) => name.startsWith('test/')), 'no tests in the package')
    }
  })
})

describe('the touch display extension of this repository', () => {
  const extDir = path.join(process.cwd(), '..', '..', 'extensions')
  const touch = JSON.parse(readFileSync(path.join(extDir, 'touchlcd', 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts: a status block, a page under System, the packages of the SPI and I2C programs and a font', () => {
    assert.strictEqual(checkManifest(touch, files('api.js', 'icon.svg', '99-mpx-touchlcd.rules')), null)
    assert.strictEqual(touch.ui?.place, 'system')
    assert.deepStrictEqual(touch.resources, {}, 'its pins are chosen in the app, which checks them against the box')
    assert.deepStrictEqual(touch.system?.packages, ['python3-pil', 'python3-spidev', 'python3-lgpio', 'fonts-dejavu-core'])
    assert.deepStrictEqual(touch.ui?.items.filter((i) => i.type === 'status').map((i) => i.state), ['/api/ext/touchlcd/state'])
    assert.deepStrictEqual(touch.ui?.items.filter((i) => i.type === 'action').map((i) => i.post), ['/api/ext/touchlcd/spion', '/api/ext/touchlcd/iicon'])
  })
  it('lets the user choose the pins - none is named in the manifest, so none can be one that is taken', () => {
    for (const key of ['dcPin', 'rstPin', 'blPin', 'tpRstPin']) assert.deepStrictEqual(touch.settings?.[key], { type: 'gpio', default: 0 }, key)
  })
  it('has a udev rule that opens the SPI and I2C buses for the group of the header pins - and nothing that runs a program', () => {
    const rule = readFileSync(path.join(extDir, 'touchlcd', '99-mpx-touchlcd.rules'), 'utf8')
    assert.strictEqual(checkUdevRules(rule), null)
    assert.match(rule, /SUBSYSTEM=="spidev"/)
    assert.match(rule, /SUBSYSTEM=="i2c-dev"/)
    assert.match(rule, /GROUP="gpio"/)
  })
  it('takes the settings the app sends: CS, pins, turn, what is shown, brightness and the touch corrections', () => {
    assert.strictEqual(
      checkSettings(touch, { spiDevice: '0.0', dcPin: 24, rstPin: 22, blPin: 18, tpRstPin: 17, rotation: 270, category: 'nas', showTitle: true, brightness: 50, nightDim: true, nightBrightness: 10, sleepAfter: 15, touchSwap: true, touchFlipX: true, touchFlipY: true }).ok,
      true,
    )
    assert.strictEqual(checkSettings(touch, { spiDevice: '1.0' }).ok, false)
    assert.strictEqual(checkSettings(touch, { rotation: 45 }).ok, false)
    assert.strictEqual(checkSettings(touch, { category: 'video' }).ok, false)
    assert.strictEqual(checkSettings(touch, { brightness: 0 }).ok, false)
    assert.strictEqual(checkSettings(touch, { sleepAfter: 7 }).ok, false)
    assert.strictEqual(checkSettings(touch, { dcPin: 40 }).ok, false)
  })
  it('is packed as the catalog says, with its Python programs in it - and no test', () => {
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'touchlcd')
    const bytes = readFileSync(path.join(extDir, 'dist', `touchlcd-${entry.version}.mpx`))
    assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
    if (checked.ok) {
      assert.deepStrictEqual(checked.pkg.manifest, touch, 'the package holds the manifest of the repository')
      for (const file of ['touchlcd.py', 'lcd.py', 'cube.py', 'gesture.py', 'driver.js', 'logic.js', 'api.js']) assert.ok(checked.pkg.files.has(file), file)
      assert.ok(![...checked.pkg.files.keys()].some((name) => name.startsWith('test/')), 'no tests in the package')
    }
  })
})

describe('an uploaded extension file', () => {
  it('is read and checked without installing anything', () => {
    const extDir = path.join(process.cwd(), '..', '..', 'extensions')
    const entry = JSON.parse(readFileSync(path.join(extDir, 'catalog.json'), 'utf8')).find((e: { id: string }) => e.id === 'cd')
    const bytes = readFileSync(path.join(extDir, 'dist', `cd-${entry.version}.mpx`))
    const checked = verifyPackage(bytes)
    assert.strictEqual(checked.ok, true)
    if (checked.ok) assert.strictEqual(checked.pkg.manifest.id, 'cd')
  })
  it('refuses a file that is no zip, and an empty one', () => {
    assert.strictEqual(verifyPackage(Buffer.from('hello')).ok, false)
    assert.strictEqual(verifyPackage(Buffer.alloc(0)).ok, false)
  })
})

describe('systemd units of an extension', () => {
  const service = '[Unit]\nDescription=Test\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=/usr/bin/node @EXT_DIR@/daemon.js\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n'
  it('accepts a plain service and a plain timer', () => {
    assert.strictEqual(checkUnitFile(service, 'service'), null)
    assert.strictEqual(checkUnitFile('[Timer]\nOnCalendar=*-*-* 03:00:00\nPersistent=yes\n\n[Install]\nWantedBy=timers.target\n', 'timer'), null)
  })
  it('refuses what changes who runs it or lifts a restriction', () => {
    for (const extra of ['User=root', 'Group=root', 'AmbientCapabilities=CAP_NET_ADMIN', 'PermissionsStartOnly=yes', 'ExecStartPre=+/bin/sh /tmp/x', 'ExecStartPost=!/bin/true', 'Environment=A=b\nPrivateDevices=no']) {
      assert.ok(checkUnitFile(service.replace('Restart=on-failure', extra), 'service'), extra)
    }
  })
  it('refuses a program without an absolute path, a continued line, other sections and a service without ExecStart', () => {
    assert.ok(checkUnitFile(service.replace('/usr/bin/node', 'node'), 'service'))
    assert.ok(checkUnitFile(service.replace('Restart=on-failure', 'Restart=on-failure \\nalways'), 'service'))
    assert.ok(checkUnitFile(`${service}[Socket]\nListenStream=1234\n`, 'service'))
    assert.ok(checkUnitFile('[Unit]\nDescription=x\n[Service]\nType=simple\n', 'service'))
    assert.ok(checkUnitFile('[Install]\nWantedBy=graphical.target\n[Service]\nExecStart=/bin/true\n', 'service'))
    assert.ok(checkUnitFile('[Timer]\nPersistent=yes\n', 'timer'))
    assert.ok(checkUnitFile(service, 'timer'))
  })
  it('the manifest names the unit by its extension, has its file, and says it in the resources', () => {
    const base = { id: 'xy', name: 'X', version: '1.0.0', hostApi: 2 }
    const ok = { ...base, system: { units: [{ name: 'mpx-xy.service', file: 'units/mpx-xy.service' }] }, resources: { services: [{ name: 'mpx-xy.service', provides: true }] } }
    const files = new Set(['manifest.json', 'units/mpx-xy.service'])
    assert.strictEqual(checkManifest(ok, files), null)
    assert.match(String(checkManifest({ ...ok, system: { units: [{ name: 'other.service', file: 'units/mpx-xy.service' }] } }, files)), /bad unit name/)
    assert.match(String(checkManifest({ ...ok, system: { units: [{ name: 'mpx-xy.timer', file: 'units/mpx-xy.service' }] } }, files)), /unit file missing/)
    assert.match(String(checkManifest(ok, new Set(['manifest.json']))), /unit file missing/)
    assert.match(String(checkManifest({ ...ok, resources: {} }, files)), /not in resources.services/)
    assert.match(String(checkManifest({ ...ok, resources: { services: [{ name: 'mpx-xy.service' }] } }, files)), /not in resources.services/)
  })
})

describe('a form (hostApi 17)', () => {
  const form = { type: 'form', label: 'CD rippen', form: '/api/ext/xy/ripform', post: '/api/ext/xy/rip' }
  const manifest = (items: unknown[], hostApi = 17) => base({ id: 'xy', hostApi, settings: { t: { type: 'string' } }, ui: { title: 'T', items } })
  it('is a button with the routes that describe the dialog and take it', () => {
    assert.strictEqual(checkManifest(manifest([form]), files()), null)
    assert.match(String(checkManifest(manifest([form], 16), files())), /a form needs hostApi 17/)
    assert.match(String(checkManifest(manifest([{ ...form, key: 't' }]), files())), /a form needs hostApi 17 and has no setting/)
    assert.match(String(checkManifest(manifest([{ ...form, form: '/api/ext/other/ripform' }]), files())), /bad form address \(form\)/)
    assert.match(String(checkManifest(manifest([{ ...form, post: 'https://example.com/rip' }]), files())), /bad form address \(post\)/)
    assert.match(String(checkManifest(manifest([{ type: 'form', label: 'x', form: '/api/ext/xy/a' }]), files())), /bad form address \(post\)/)
  })
  it('may lie in the card of the page instead of a popup (inline)', () => {
    assert.strictEqual(checkManifest(manifest([{ ...form, inline: true }]), files()), null)
    assert.match(String(checkManifest(manifest([{ ...form, inline: 'yes' }]), files())), /inline is true/)
  })
  it('is the host API of this box', () => {
    assert.ok(HOST_API >= 17)
  })
})

describe('the CD extension rips (hostApi 17)', () => {
  const dir = path.join(process.cwd(), '..', '..', 'extensions', 'cd')
  const cd = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest
  it('has a manifest the installer accepts, with the programs it needs as packages', () => {
    assert.strictEqual(checkManifest(cd, new Set(readdirSync(dir))), null)
    assert.deepStrictEqual(cd.system?.packages, ['cdparanoia', 'ffmpeg'])
    assert.ok(cd.hostApi >= 17)
  })
  it('lets the user choose the format and the quality, and takes only the ones the ripper knows', () => {
    assert.strictEqual(checkSettings(cd, { ripFormat: 'flac', ripBitrate: 192 }).ok, true)
    assert.strictEqual(checkSettings(cd, { ripFormat: 'ogg' }).ok, false)
    assert.strictEqual(checkSettings(cd, { ripBitrate: 100 }).ok, false)
  })
  it('has the dialog, the status and the routes of its API part', () => {
    const items = cd.ui?.items ?? []
    assert.deepStrictEqual(items.filter((i) => i.type === 'form').map((i) => [i.form, i.post]), [['/api/ext/cd/ripform', '/api/ext/cd/rip']])
    assert.deepStrictEqual(items.filter((i) => i.type === 'status').map((i) => i.state), ['/api/ext/cd/ripstatus'])
  })
})
