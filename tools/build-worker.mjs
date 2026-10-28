// Bundles the worker and the migration command into dist/ so the production image needs no TypeScript runtime.
// Third-party packages stay external (installed with `npm ci --omit=dev`); our own code, including the
// shared/ and server/ modules the worker uses, is bundled. Migrations are copied next to the bundles because
// the migrator looks for ./migrations beside the file that contains it.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
await build({
  entryPoints: { worker: 'worker/index.ts', migrate: 'server/db/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  // ESM bundles have no require(); some packages we keep external still expect it when they are bundled in.
  banner: {},
})
cpSync('server/db/migrations', 'dist/migrations', { recursive: true })
console.log('worker and migrate bundles written to dist/')
