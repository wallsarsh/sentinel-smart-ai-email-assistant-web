import { createHash } from 'node:crypto'
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

export function checkoutSource(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim()
  try {
    const remote = git('remote','get-url','origin').replace(/\.git$/, '')
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+)$/.exec(remote)
    const branch = git('symbolic-ref','--short','HEAD')
    return match && { repo: match[1], branch, commit: git('rev-parse','HEAD') }
  } catch { return null }
}

/** Zips thunderbird/{manifest.json,dist,experiments}. `root` is the repository root. */
export function buildXpi(root, out, { build = true, source = checkoutSource(root), version } = {}) {
  if (build) execFileSync(process.execPath, [join(root, 'tools/build-extension.mjs')], { cwd: root, stdio: 'inherit' })
  const base = join(root, 'thunderbird')
  const files = {}
  for (const f of [join(base, 'manifest.json'), ...walk(join(base, 'dist')), ...walk(join(base, 'experiments'))])
    files[relative(base, f).split('\\').join('/')] = new Uint8Array(readFileSync(f))
  if (source) {
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    const channel = createHash('sha256').update(source.branch).digest('hex').slice(0, 16)
    manifest.browser_specific_settings.gecko.update_url = `https://github.com/${source.repo}/releases/download/sentinel-channel-${channel}/updates.json`
    if (version) manifest.version = version
    files['manifest.json'] = Buffer.from(JSON.stringify(manifest))
    files['source.json'] = Buffer.from(JSON.stringify(source))
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, zipSync(files, { level: 9 }))
  return { out, files: Object.keys(files) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = join(dirname(new URL(import.meta.url).pathname), '..')
  const { out, files } = buildXpi(root, join(root, 'installer', 'sentinel-ai.xpi'))
  console.log(`${out} (${files.length} files)`)
}
