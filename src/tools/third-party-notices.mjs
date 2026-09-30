#!/usr/bin/env node
// Third-party notices of MuPiBox: what the release packages contain from others, what the installer fetches, what
// comes from Debian/DietPi packages - with the license of each and, for what MuPiBox ships itself, its license text.
//
//   node src/tools/third-party-notices.mjs          writes THIRD_PARTY_NOTICES.md (repository root) and a copy for the
//                                                   web app (backend-api/src/mupi-app/legal/), with LICENSE and NOTICE
//   node src/tools/third-party-notices.mjs --check  only checks: fails when a shipped package has no license or one
//                                                   that is not on the list below (e.g. a new dependency)
//
// Run after the three builds (npm run build:backend-api / build:backend-player / build:frontend-box): the packages
// in the backend and the player come from esbuild's metafiles (exactly what is in the bundles), the display's from
// the 3rdpartylicenses.txt Angular writes. The parts that are not npm packages are kept by hand in STATIC below.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'THIRD_PARTY_NOTICES.md')
const APP_LEGAL = path.join(SRC, 'backend-api', 'src', 'mupi-app', 'legal')
const CHECK = process.argv.includes('--check')

// Licenses that may be shipped in the bundles without asking first (permissive, compatible with MuPiBox's own)
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'BlueOak-1.0.0',
  'Unlicense',
  'CC0-1.0',
  'Python-2.0',
])

const PARTS = [
  {
    id: 'backend',
    name: 'Backend (server.js)',
    metafile: path.join(SRC, 'backend-api', 'backend-api.esbuild-meta.json'),
  },
  {
    id: 'player',
    name: 'Player (spotify-control.js)',
    metafile: path.join(SRC, 'backend-player', 'backend-player.esbuild-meta.json'),
  },
  { id: 'display', name: 'Display (www)', angular: path.join(SRC, 'deploy', 'www', '3rdpartylicenses.txt') },
]

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const exists = (file) => fs.existsSync(file)

// The package directory of a bundled file: everything up to node_modules/<name> (or node_modules/@scope/<name>)
function packageDirOf(input, base) {
  const i = input.lastIndexOf('node_modules/')
  if (i < 0) return null
  const rest = input.slice(i + 'node_modules/'.length).split('/')
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
  return path.resolve(base, input.slice(0, i + 'node_modules/'.length) + name)
}

function findPackageDir(name) {
  const direct = path.join(ROOT, 'node_modules', name)
  if (exists(path.join(direct, 'package.json'))) return direct
  for (const ws of ['backend-api', 'backend-player', 'frontend-box']) {
    const dir = path.join(SRC, ws, 'node_modules', name)
    if (exists(path.join(dir, 'package.json'))) return dir
  }
  return null
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ')
  return ''
}

function licenseText(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)([-._].*)?$/i.test(f))
  const text = files
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
    .join('\n\n')
  if (text) return text
  // (no license file: the "License" section of the README, where many small packages keep it)
  const readme = fs.readdirSync(dir).find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f))
  if (!readme) return ''
  const m = /^#{1,3}\s*licen[cs]e\s*$([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/im.exec(
    fs.readFileSync(path.join(dir, readme), 'utf8').replace(/\r\n/g, '\n'),
  )
  return m ? m[1].trim() : ''
}

// A license name that is not an SPDX id, taken as one only when the license text says so ("Apache" -> Apache-2.0)
function normalizeLicense(license, text) {
  if (/^apache(\s*license)?$/i.test(license) && /Apache License,?\s+Version 2\.0/i.test(text)) return 'Apache-2.0'
  return license
}

const repoOf = (pkg) => {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const url = (r || pkg.homepage || '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
  return url.replace(/^github:/, 'https://github.com/')
}

// Every license name of an SPDX expression ("(MIT OR Apache-2.0)") is allowed
const allowed = (license) => {
  const names = license
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND)\s+|\s+/)
    .filter(Boolean)
  return names.length > 0 && names.every((n) => ALLOWED.has(n))
}

// name@version -> { name, version, license, repo, text, parts }
const packages = new Map()
function note(dir, part, angularLicense, angularText) {
  const pkg = readJson(path.join(dir, 'package.json'))
  const key = `${pkg.name}@${pkg.version}`
  const have = packages.get(key)
  if (have) {
    have.parts.add(part)
    return
  }
  const text = licenseText(dir) || angularText || ''
  packages.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: normalizeLicense(licenseOf(pkg) || angularLicense || '', text),
    repo: repoOf(pkg),
    text,
    parts: new Set([part]),
  })
}

const problems = []
for (const part of PARTS) {
  if (part.metafile) {
    if (!exists(part.metafile)) {
      problems.push(`${part.name}: ${path.relative(ROOT, part.metafile)} is missing - build it first`)
      continue
    }
    const meta = readJson(part.metafile)
    const base = path.dirname(part.metafile)
    const dirs = new Set(
      Object.keys(meta.inputs)
        .map((i) => packageDirOf(i, base))
        .filter(Boolean),
    )
    for (const dir of dirs) note(dir, part.id)
  } else {
    if (!exists(part.angular)) {
      problems.push(`${part.name}: ${path.relative(ROOT, part.angular)} is missing - build it first`)
      continue
    }
    // Angular's list: "Package: <name>\nLicense: "<license>"\n\n<text>", blocks between lines of dashes
    const blocks = fs
      .readFileSync(part.angular, 'utf8')
      .replace(/\r\n/g, '\n')
      .split(/\n-{20,}\n/)
    for (const block of blocks) {
      const m = /^\s*Package: (.+)\nLicense: "?([^"\n]*)"?\n\n?([\s\S]*)$/.exec(block)
      if (!m) continue
      const dir = findPackageDir(m[1].trim())
      if (dir) note(dir, part.id, m[2], m[3].trim())
      else
        packages.set(`${m[1].trim()}@?`, {
          name: m[1].trim(),
          version: '?',
          license: m[2],
          repo: '',
          text: m[3].trim(),
          parts: new Set([part.id]),
        })
    }
  }
}

const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
for (const p of list) {
  if (!p.license) problems.push(`${p.name}@${p.version}: no license in its package.json`)
  else if (!allowed(p.license))
    problems.push(`${p.name}@${p.version}: license "${p.license}" is not on the list of allowed licenses`)
}

if (CHECK) {
  if (problems.length) {
    console.error(`third-party notices: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`third-party notices: ${list.length} packages, all licenses allowed`)
  process.exit(0)
}

// ------------------------------------------------------------------------------------------------------------------
// The parts that are not npm packages of the bundles, kept by hand. "TODO:" marks what the project still has to clear.
// ------------------------------------------------------------------------------------------------------------------

// The fonts the themes bring along (themes/<theme>/*.ttf|otf|woff2): one with its license text next to it (OFL-*.txt,
// LICENSE*) is named with it; the others are listed as not cleared, one row per font file, with the themes using it
function themeFonts() {
  const dir = path.join(ROOT, 'themes')
  if (!exists(dir)) return []
  const byFont = new Map()
  for (const theme of fs.readdirSync(dir)) {
    const tdir = path.join(dir, theme)
    if (theme === '_fonts' || !fs.statSync(tdir).isDirectory()) continue
    const files = fs.readdirSync(tdir)
    const licensed = files.some((f) => /^(ofl|licen[cs]e)/i.test(f))
    for (const f of files.filter((x) => /\.(ttf|otf|woff2?)$/i.test(x))) {
      const have = byFont.get(f) ?? { themes: [], licensed }
      have.themes.push(theme)
      byFont.set(f, have)
    }
  }
  return [...byFont.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, { themes, licensed }]) => [
      `Font \`${file}\``,
      `theme${themes.length > 1 ? 's' : ''} ${themes.map((t) => `\`${t}\``).join(', ')}`,
      licensed ? 'see the license file next to it' : 'TODO: unclear - to be cleared, replaced or removed',
      '',
    ])
}

const STATIC = {
  shipped: [
    [
      'Fredoka font',
      "web app and kids' themes (`mupi-app/fonts`, `themes/_fonts`)",
      'SIL Open Font License 1.1',
      '`OFL-Fredoka.txt` next to the font',
    ],
    [
      'Nunito Sans font',
      'web app (`mupi-app/fonts`)',
      'SIL Open Font License 1.1',
      '`OFL-NunitoSans.txt` next to the font',
    ],
    [
      'Baloo 2 font',
      "kids' themes (`themes/_fonts`)",
      'SIL Open Font License 1.1',
      '`OFL-Baloo2.txt` next to the font',
    ],
    [
      'fbv (framebuffer image viewer)',
      'boot and shutdown pictures, prebuilt in `bin/fbv`',
      'GPL-2.0',
      'TODO: add the source offer / link to the source of the exact version',
    ],
    ['led_control', 'power LED, compiled on the box from `scripts/led/led_control.c`', 'MuPiBox project code', ''],
    ...themeFonts(),
    [
      'Sounds (`media/sound/*.wav`)',
      'start, shutdown and battery sounds',
      'TODO: origin and license to be cleared',
      '',
    ],
  ],
  installer: [
    ['jq', '1.8.1, from github.com/jqlang/jq (autosetup, update)', 'MIT', 'https://github.com/jqlang/jq'],
    [
      'Node.js',
      '22.x, from deb.nodesource.com (autosetup)',
      'MIT (plus the licenses of its bundled parts)',
      'https://nodejs.org',
    ],
    [
      'pm2',
      'npm, global (autosetup)',
      'AGPL-3.0',
      'https://github.com/Unitech/pm2 - runs the backend and the player as separate processes',
    ],
    ['@ionic/cli', 'npm, global (autosetup)', 'MIT', 'https://github.com/ionic-team/ionic-cli'],
    [
      'requests, pyserial, telepot',
      'Python packages from PyPI (autosetup)',
      'Apache-2.0, BSD-3-Clause, MIT',
      'Telegram bot and serial access',
    ],
    [
      'initramfs-splash',
      'boot picture during start (autosetup), from gitlab.com/DarkElvenAngel/initramfs-splash',
      'TODO: license to be checked',
      'https://gitlab.com/DarkElvenAngel/initramfs-splash',
    ],
    [
      'noVNC',
      'only when remote control is switched on (git clone to /usr/share/novnc)',
      'MPL-2.0 (parts under other licenses)',
      'https://github.com/novnc/noVNC',
    ],
  ],
  cdn: [
    ['jQuery 3.7.1, jQuery UI 1.13.2', 'code.jquery.com', 'MIT'],
    ['Bootstrap 5.3.3', 'cdn.jsdelivr.net', 'MIT'],
    ['Popper.js 1.16.0', 'cdnjs.cloudflare.com', 'MIT'],
    ['CodeMirror 5.65.15', 'cdnjs.cloudflare.com', 'MIT'],
  ],
  debian: [
    ['mplayer', 'playback of files, NAS, radio, podcasts', 'GPL-2.0-or-later'],
    ['Chromium (DietPi software 113)', 'the display', 'BSD-3-Clause and others'],
    [
      'libwidevinecdm0 (Widevine CDM)',
      'Spotify in the display (Web Playback SDK)',
      'proprietary (Google), redistributed by Raspberry Pi',
    ],
    ['lighttpd, lighttpd-mod-openssl (DietPi software 84)', 'web server, https', 'BSD-3-Clause'],
    ['PHP (DietPi software 89)', 'admin interface', 'PHP License 3.01'],
    [
      'ALSA (DietPi software 5), PulseAudio, pulseaudio-module-bluetooth',
      'sound, Bluetooth audio',
      'LGPL-2.1 / GPL-2.0',
    ],
    ['BlueZ', 'Bluetooth', 'GPL-2.0'],
    ['DietPi-Dashboard (DietPi software 200)', 'system dashboard', 'GPL-3.0'],
    ['x11vnc, websockify', 'remote control of the display, only when switched on', 'GPL-2.0, LGPL-3.0'],
    ['Samba, wsdd, ProFTPD', 'network shares, only when switched on', 'GPL-3.0, MIT, GPL-2.0'],
    [
      'rrdtool, scrot, feh, librsvg2-bin, zip, git, bc, net-tools, wireless-tools, rfkill',
      'tools of the scripts',
      'GPL / LGPL / MIT (per package)',
    ],
    [
      'pigpio, gpiod, python3-rpi.gpio, python3-lgpio, python3-smbus2, python3-alsaaudio, python3-netifaces, python3-flask, python3-pil, python3-paho-mqtt, python3-serial, python3-requests',
      'hardware, MuPiHAT, MQTT, scripts',
      'Unlicense / LGPL / MIT / BSD / EPL (per package)',
    ],
    [
      'libjson-c, libi2c, libasound2, libgles2-mesa, preload, build-essential',
      'libraries and build tools',
      'MIT / LGPL / GPL (per package)',
    ],
  ],
}

const partName = Object.fromEntries(
  PARTS.map((p) => [p.id, p.id === 'backend' ? 'backend' : p.id === 'player' ? 'player' : 'display']),
)
const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')

const md = [
  '# Third-Party Notices',
  '',
  'MuPiBox itself is covered by `LICENSE` (and `NOTICE`, if present). The components below are not: each keeps its own',
  "license, and MuPiBox's license never relicenses any of them. They are grouped by how MuPiBox distributes them, since",
  'that decides the obligations.',
  '',
  'This file is generated by `src/tools/third-party-notices.mjs` from the release builds; the npm part lists exactly',
  'the packages in the bundles.',
  '',
  '## A. Shipped in the MuPiBox release packages',
  '',
  '### A.1 npm packages bundled into the backend, the player and the display',
  '',
  table(
    ['Package', 'Version', 'License', 'In', 'Source'],
    list.map((p) => [
      p.name,
      p.version,
      p.license || 'unknown',
      [...p.parts].map((x) => partName[x]).join(', '),
      p.repo,
    ]),
  ),
  '',
  '### A.2 Fonts, programs and media in the repository',
  '',
  table(['Component', 'Use', 'License', 'Notes'], STATIC.shipped),
  '',
  '## B. Downloaded by the installer or updater (not part of the MuPiBox packages)',
  '',
  'The installer makes the box fetch these from their own sources; MuPiBox does not redistribute them.',
  '',
  table(['Component', 'How', 'License', 'Source / notes'], STATIC.installer),
  '',
  '### Loaded at runtime from CDNs (admin interface)',
  '',
  "The browser showing the admin interface loads these from the CDN named (the CDN sees the browser's address).",
  '',
  table(['Library', 'CDN', 'License'], STATIC.cdn),
  '',
  '## C. Installed from Debian / Raspberry Pi OS / DietPi packages',
  '',
  'Installed from the package repositories of the system; the distribution is theirs. The licenses are for',
  'information; the package itself names the exact terms (`/usr/share/doc/<package>/copyright`).',
  '',
  table(['Component', 'Use', 'License (informational)'], STATIC.debian),
  '',
  '## License texts of the bundled npm packages',
  '',
  ...list.map((p) =>
    [
      `### ${p.name} ${p.version} (${p.license || 'unknown'})`,
      '',
      '```',
      p.text || `(no license file in the package; license per package.json: ${p.license || 'none'})`,
      '```',
      '',
    ].join('\n'),
  ),
].join('\n')

fs.writeFileSync(OUT, `${md.trimEnd()}\n`)
fs.mkdirSync(APP_LEGAL, { recursive: true })
fs.copyFileSync(OUT, path.join(APP_LEGAL, 'THIRD_PARTY_NOTICES.md'))
for (const f of ['LICENSE.md', 'LICENSE', 'NOTICE', 'NOTICE.md']) {
  if (exists(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(APP_LEGAL, f))
}
console.log(
  `${path.relative(ROOT, OUT)}: ${list.length} packages${problems.length ? `, ${problems.length} problem(s):\n  ${problems.join('\n  ')}` : ''}`,
)
