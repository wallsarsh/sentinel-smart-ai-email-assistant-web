/** Creates the actual self-contained application payload for Tauri.
 * CI and local builds require Node 22 and npm for packaging only; end users
 * need neither Node nor PostgreSQL installed.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(desktop, '..')
const payload = join(desktop, 'src-tauri', 'runtime')
const run = (cmd, args, dir) => execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' })
if (!existsSync(join(root, 'node_modules', 'esbuild'))) {
  throw new Error('Run npm ci in repository root before preparing desktop runtime')
}
run(process.execPath, [join(root, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs'), 'build'], root)
run(process.execPath, [join(root, 'tools/build-worker.mjs')], root)
rmSync(payload, { recursive: true, force: true })
mkdirSync(join(payload, 'bin'), { recursive: true })
cpSync(join(root, '.output'), join(payload, '.output'), { recursive: true })
cpSync(join(root, 'dist'), join(payload, 'dist'), { recursive: true })
cpSync(join(root, 'package.json'), join(payload, 'package.json'))
cpSync(join(root, 'package-lock.json'), join(payload, 'package-lock.json'))
run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], payload)
const runtimeExe = join(payload, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
cpSync(process.execPath, runtimeExe)
if (process.platform !== 'win32') chmodSync(runtimeExe, 0o755)
for (const file of ['.output/server/index.mjs', 'dist/migrate.mjs', 'node_modules/@electric-sql/pglite/package.json']) {
  if (!existsSync(join(payload, file))) throw new Error(`Missing packaged runtime asset: ${file}`)
}
writeFileSync(join(payload, 'version.json'), JSON.stringify({
  version: '0.2.0', node: process.version, platform: process.platform, arch: process.arch
}))
console.log('Standalone desktop payload ready:', payload)
