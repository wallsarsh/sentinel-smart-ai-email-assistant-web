// Bundles the Thunderbird extension (src + the shared packages/core code) into thunderbird/dist.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

rmSync('thunderbird/dist', { recursive: true, force: true })
mkdirSync('thunderbird/dist', { recursive: true })
await build({
  entryPoints: {
    popup: 'thunderbird/src/popup.js',
    options: 'thunderbird/src/options.js',
    background: 'thunderbird/src/background.js',
    'brief-popup': 'thunderbird/src/brief-popup.js',
  },
  outdir: 'thunderbird/dist',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'firefox140',
  minify: false, // reviewers of add-on stores read the code
  logLevel: 'info',
})
for (const f of ['popup.html', 'options.html', 'brief.html'])
  cpSync(`thunderbird/src/${f}`, `thunderbird/dist/${f}`)
console.log('extension written to thunderbird/dist (load thunderbird/manifest.json)')
