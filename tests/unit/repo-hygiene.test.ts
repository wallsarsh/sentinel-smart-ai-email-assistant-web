import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('repository hygiene', () => {
  it('.env.example holds placeholders only', () => {
    const text = readFileSync('.env.example', 'utf8')
    for (const line of text.split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line)
      if (!m) continue
      const [, key, value] = m
      if (/(CLIENT_SECRET|PRIVATE_KEY)$/.test(key!)) expect(value, key).toBe('')
      expect(value, key).not.toMatch(/sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}/)
    }
  })
  it('.env is git-ignored', () => {
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.env$/m)
  })
  it('compose file defines the dev services', () => {
    const c = readFileSync('docker-compose.dev.yml', 'utf8')
    for (const s of ['postgres:', 'mailpit:', 'greenmail:']) expect(c).toContain(s)
  })
})
