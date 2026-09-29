// node check.cjs <lang> - checks <lang>.1.json … <lang>.4.json against source.N.json (see BRIEF.md)
const fs = require('fs')
// the parts are made in src/backend-api/src/mupi-app/i18n/_parts (see BRIEF.md next to this file)
const path = require('path')
const lang = process.argv[2]
if (!lang) throw new Error('usage: node check.cjs <lang>')
const PARTS = path.join(__dirname, '../../../src/backend-api/src/mupi-app/i18n/_parts')
let bad = 0
for (let n = 1; n <= 4; n++) {
  const src = JSON.parse(fs.readFileSync(path.join(PARTS, `source.${n}.json`), 'utf8'))
  const file = path.join(PARTS, `${lang}.${n}.json`)
  if (!fs.existsSync(file)) {
    console.log(`part ${n}: ${lang}.${n}.json missing`)
    bad++
    continue
  }
  let tr
  try {
    tr = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.log(`part ${n}: invalid JSON: ${e.message}`)
    bad++
    continue
  }
  const problems = []
  for (const k of src) {
    const v = tr[k]
    if (typeof v !== 'string' || !v.trim()) {
      problems.push(`missing or empty: ${JSON.stringify(k)}`)
      continue
    }
    const want = (k.match(/\{\}/g) || []).length
    const got = v.match(/\{\d*\}/g) || []
    const numbered = got.filter((g) => g !== '{}')
    if (got.length !== want) problems.push(`placeholders ${want} ≠ ${got.length}: ${JSON.stringify(k)} → ${JSON.stringify(v)}`)
    else if (numbered.length && (numbered.length !== got.length || new Set(numbered).size !== want || numbered.some((g) => Number(g.slice(1, -1)) >= want)))
      problems.push(`numbered placeholders must be {0}…{${want - 1}}, each once: ${JSON.stringify(v)}`)
  }
  const extra = Object.keys(tr).filter((k) => !src.includes(k))
  for (const k of extra) problems.push(`not in the source (key changed?): ${JSON.stringify(k)}`)
  if (problems.length) {
    bad++
    console.log(`part ${n}: ${problems.length} problems`)
    for (const p of problems.slice(0, 40)) console.log(`  ${p}`)
  } else console.log(`part ${n}: ok (${src.length})`)
}
process.exit(bad ? 1 : 0)
