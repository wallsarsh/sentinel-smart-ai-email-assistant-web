// Builds the add-on package (an .xpi is a zip of the extension folder).
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { zipSync } from 'fflate'

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

/** Zips thunderbird/{manifest.json,dist,experiments}. `root` is the repository root. */
export function buildXpi(root, out, { build = true } = {}) {
  if (build) execFileSync(process.execPath, [join(root, 'tools/build-extension.mjs')], { cwd: root, stdio: 'inherit' })
  const base = join(root, 'thunderbird')
  const files = {}
  for (const f of [join(base, 'manifest.json'), ...walk(join(base, 'dist')), ...walk(join(base, 'experiments'))])
    files[relative(base, f).split('\\').join('/')] = new Uint8Array(readFileSync(f))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, zipSync(files, { level: 9 }))
  return { out, files: Object.keys(files) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = join(dirname(new URL(import.meta.url).pathname), '..')
  const { out, files } = buildXpi(root, join(root, 'installer', 'sentinel-ai.xpi'))
  console.log(`${out} (${files.length} files)`)
}
