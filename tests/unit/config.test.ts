import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ConfigError } from '../../server/config'
import { loadConfig } from '../../server/config'

function exampleEnv() {
  const env: Record<string, string> = {}
  for (const l of readFileSync('.env.example', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
    if (m) env[m[1]!] = m[2]!
  }
  return env
}

const prod = {
  NODE_ENV: 'production',
  BASE_URL: 'https://sentinel.example.org',
  DATABASE_URL: 'postgres://u:p@db/sentinel',
  SESSION_SECRET: 'r4nd0m-Zq8Vw1LkPx7TnB2cYh5GdFs9JmEa3UoXi',
  KEK_BASE64: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
}

describe('loadConfig', () => {
  it('accepts the development example', () => {
    const c = loadConfig(exampleEnv())
    expect(c.env).toBe('development')
    expect(c.kek).toHaveLength(32)
  })

  it('names every problem without echoing values', () => {
    try {
      loadConfig({ BASE_URL: 'nope', SESSION_SECRET: 'short-secret-value' })
      expect.unreachable()
    } catch (e) {
      const msg = (e as ConfigError).message
      expect(msg).toContain('BASE_URL')
      expect(msg).toContain('SESSION_SECRET')
      expect(msg).toContain('DATABASE_URL')
      expect(msg).toContain('KEK_BASE64')
      expect(msg).not.toContain('short-secret-value')
    }
  })

  it('rejects a KEK of the wrong length', () => {
    expect(() => loadConfig({ ...exampleEnv(), KEK_BASE64: 'c2hvcnQ=' })).toThrow(/32 bytes/)
  })

  it('production needs https and non-placeholder secrets', () => {
    expect(loadConfig(prod).env).toBe('production')
    expect(() => loadConfig({ ...prod, BASE_URL: 'http://x.org' })).toThrow(/https/)
    expect(() =>
      loadConfig({ ...prod, SESSION_SECRET: 'dev-only-session-secret-0123456789abcdef' }),
    ).toThrow(/placeholder/)
    expect(() => loadConfig({ ...prod, KEK_BASE64: exampleEnv().KEK_BASE64! })).toThrow(
      /placeholder/,
    )
  })

  it('normalises the base url', () => {
    expect(loadConfig({ ...prod, BASE_URL: 'https://a.org/' }).baseUrl).toBe('https://a.org')
  })
})

describe('env access', () => {
  it('only server/config reads process.env', async () => {
    const { execSync } = await import('node:child_process')
    const out = execSync(
      "grep -rln 'process\\.env' server shared app worker --include=*.ts --include=*.vue 2>/dev/null || true",
      { encoding: 'utf8' },
    )
    expect(out.trim().split('\n').filter(Boolean)).toEqual(['server/config/index.ts'])
  })
})
