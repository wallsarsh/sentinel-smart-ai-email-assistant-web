import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// End-to-end suite: real Postgres, the built server, a real browser. Run with `npm run e2e`.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts', 'tests/a11y/**/*.e2e.ts', 'tests/perf/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'forks',
  },
})
