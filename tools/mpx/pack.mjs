// Packs an extension into its one file and enters it in the catalog (docs/extensions.md):
//   node tools/mpx/pack.mjs <id> [--branch upstream-v5.1-pr] [--repo wowa1990/MuPiBox]
// extensions/<id>/  ->  extensions/dist/<id>-<version>.mpx  (+ the entry in extensions/catalog.json: size, SHA-256, what it sets up)
// The zip is made the same way every time (sorted names, fixed times), so the same files give the same checksum.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const id = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true)
if (!id) {
  console.error('usage: node tools/mpx/pack.mjs <id> [--branch upstream-v5.1-pr] [--repo wowa1990/MuPiBox]')
  process.exit(1)
}
const branch = flag('branch', 'upstream-v5.1-pr')
const repo = flag('repo', 'wowa1990/MuPiBox')
const MAX_MPX = 16 * 1024 * 1024

const dir = path.join(root, 'extensions', id)
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
if (manifest.id !== id) throw new Error(`manifest id "${manifest.id}" is not "${id}"`)
if (manifest.resources === undefined) throw new Error('manifest has no "resources" (ports, GPIO pins, services it needs; {} for nothing)')

// the files of the extension: everything except tests and notes
const files = []
const walk = (sub) => {
  for (const name of readdirSync(path.join(dir, sub)).sort()) {
    const rel = sub ? `${sub}/${name}` : name
    if (statSync(path.join(dir, rel)).isDirectory()) {
      if (name !== 'test' && name !== 'node_modules' && name !== '__pycache__') walk(rel)
    } else if (!/\.test\.js$|^README/i.test(name)) files.push(rel)
  }
}
walk('')
// Text files go in with LF line ends, whatever the checkout made of them: git on Windows (core.autocrlf) hands them out with
// CRLF - a udev rule or a unit file with those does not work on the box, and the same extension would get another checksum on
// another machine. Done on the bytes (a CR right before an LF goes), so nothing depends on how the text is encoded.
const TEXT = /\.(js|mjs|cjs|json|svg|css|html|txt|md|rules|service|timer|sh|py)$/i
const readPacked = (rel) => {
  const raw = readFileSync(path.join(dir, rel))
  if (!TEXT.test(rel) || !raw.includes(13)) return raw
  return Buffer.from(raw.filter((byte, i) => !(byte === 13 && raw[i + 1] === 10)))
}

// (the manifest first)
files.sort((a, b) => (a === 'manifest.json' ? -1 : b === 'manifest.json' ? 1 : a < b ? -1 : 1))

// ---- the zip ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
// 1980-01-01 00:00 in DOS time
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

const parts = []
const central = []
let offset = 0
for (const rel of files) {
  const data = readPacked(rel)
  const packed = deflateRawSync(data, { level: 9 })
  const useDeflate = packed.length < data.length
  const body = useDeflate ? packed : data
  const name = Buffer.from(rel, 'utf8')
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6) // names are UTF-8
  local.writeUInt16LE(useDeflate ? 8 : 0, 8)
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(body.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  parts.push(local, name, body)
  const head = Buffer.alloc(46)
  head.writeUInt32LE(0x02014b50, 0)
  head.writeUInt16LE(20, 4)
  head.writeUInt16LE(20, 6)
  head.writeUInt16LE(0x0800, 8)
  head.writeUInt16LE(useDeflate ? 8 : 0, 10)
  head.writeUInt16LE(DOS_TIME, 12)
  head.writeUInt16LE(DOS_DATE, 14)
  head.writeUInt32LE(crc, 16)
  head.writeUInt32LE(body.length, 20)
  head.writeUInt32LE(data.length, 24)
  head.writeUInt16LE(name.length, 28)
  head.writeUInt32LE(offset, 42)
  central.push(head, name)
  offset += local.length + name.length + body.length
}
const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)
const zip = Buffer.concat([...parts, centralBuf, end])
if (zip.length > MAX_MPX) throw new Error(`the package is ${zip.length} bytes - more than 16 MB`)

const outName = `${id}-${manifest.version}.mpx`
mkdirSync(path.join(root, 'extensions', 'dist'), { recursive: true })
writeFileSync(path.join(root, 'extensions', 'dist', outName), zip)
const sha256 = createHash('sha256').update(zip).digest('hex')

// ---- the catalog ----
const catalogFile = path.join(root, 'extensions', 'catalog.json')
let catalog = []
try {
  catalog = JSON.parse(readFileSync(catalogFile, 'utf8'))
} catch {
  // the first entry
}
// the icon goes into the catalog as a small data address, so the page of the extensions shows it before the extension is installed
let icon
if (manifest.icon && /\.svg$/i.test(manifest.icon)) {
  const svg = readPacked(manifest.icon)
  if (svg.length <= 4096) icon = `data:image/svg+xml;base64,${svg.toString('base64')}`
}
const entry = {
  id,
  name: manifest.name,
  version: manifest.version,
  description: manifest.description ?? '',
  ...(icon ? { icon } : {}),
  hostApi: manifest.hostApi,
  url: `https://raw.githubusercontent.com/${repo}/${branch}/extensions/dist/${outName}`,
  sha256,
  size: zip.length,
  // what it needs from the box (ports, GPIO pins, services): shown in the app before the install, tested against the box
  resources: manifest.resources,
  system: {
    udev: (manifest.system?.udev ?? []).length,
    units: (manifest.system?.units ?? []).map((u) => u.name),
    groups: manifest.system?.groups ?? [],
    packages: manifest.system?.packages ?? [],
  },
}
catalog = [...catalog.filter((e) => e.id !== id), entry].sort((a, b) => (a.id < b.id ? -1 : 1))
writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`${outName}: ${files.length} files, ${zip.length} bytes, sha256 ${sha256}`)
