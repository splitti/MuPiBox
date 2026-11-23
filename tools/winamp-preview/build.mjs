// Unpacks a .wsz with the backend's own skin code and bundles the preview page (see README.md).
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'out')
const wsz = process.argv[2]
if (!wsz) {
  console.error('usage: node build.mjs <skin.wsz>')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
rmSync(path.join(out, 'skin'), { recursive: true, force: true })
mkdirSync(path.join(out, 'skin'), { recursive: true })

// the backend's skin code, bundled for node
await build({
  entryPoints: [path.join(here, '../../src/backend-api/src/app-api/winamp-skin.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: path.join(out, '_skin.cjs'), logLevel: 'error',
})
const { installSkin } = await import(pathToFileURL(path.join(out, '_skin.cjs')).href).then((m) => m.default ?? m)
await installSkin(readFileSync(wsz), path.basename(wsz), path.join(out, 'skin'))
rmSync(path.join(out, '_skin.cjs'))

await build({
  entryPoints: [path.join(here, 'preview.ts')],
  bundle: true, format: 'esm', outfile: path.join(out, 'preview.js'), logLevel: 'error',
})
writeFileSync(path.join(out, 'index.html'), readFileSync(path.join(here, 'index.html')))
console.log('ready:', out)
