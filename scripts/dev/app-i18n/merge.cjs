// Puts the translated parts (mupi-app/i18n/_parts/<lang>.N.json, see scripts/dev/app-i18n/BRIEF.md) together into
// mupi-app/i18n/<lang>.json, in the order of the source texts (i18n/_source.json).
//
//   node scripts/dev/app-i18n/merge.cjs [lang …]     (without a language: all that have parts)

const fs = require('fs')
const path = require('path')

const I18N = path.join(__dirname, '../../../src/backend-api/src/mupi-app/i18n')
const PARTS = path.join(I18N, '_parts')
const source = JSON.parse(fs.readFileSync(path.join(I18N, '_source.json'), 'utf8'))
const langs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...new Set(fs.readdirSync(PARTS).map((n) => /^([a-z]{2})\.\d+\.json$/.exec(n)?.[1]).filter(Boolean))]

for (const lang of langs) {
  const all = {}
  for (const f of fs.readdirSync(PARTS).filter((n) => new RegExp(`^${lang}\\.\\d+\\.json$`).test(n))) {
    Object.assign(all, JSON.parse(fs.readFileSync(path.join(PARTS, f), 'utf8')))
  }
  // texts added after the parts were made: _parts/delta.json {lang: {text: translation}}
  const deltaFile = path.join(PARTS, 'delta.json')
  if (fs.existsSync(deltaFile)) Object.assign(all, JSON.parse(fs.readFileSync(deltaFile, 'utf8'))[lang] ?? {})
  // an existing file keeps what the parts do not have (texts translated earlier)
  const file = path.join(I18N, `${lang}.json`)
  const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  const out = {}
  for (const k of source) {
    const v = all[k] ?? before[k]
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`)
  console.log(`${lang}: ${Object.keys(out).length} of ${source.length}`)
}
