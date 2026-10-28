import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { scanFiles, scanText } from '../../tools/secrets-scan.mjs'

describe('secrets scan', () => {
  const key = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
  it.each([
    ['private key', '-----BEGIN RSA PRIVATE KEY-----\nabc'],
    ['AWS access key', 'id = AKIAABCDEFGHIJKLMNOP'],
    ['Anthropic/OpenAI key', `const k = "${key}"`],
    ['GitHub token', 'ghp_' + 'a'.repeat(36)],
    ['Slack token', 'xoxb-1234567890-abcdefghij'],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9abcdef.eyJzdWIiOiIxMjM0NTY3ODkwIn0abc.SflKxwRJSMeKKF2QT4fw'],
    ['VAPID/other private key assignment', 'VAPID_PRIVATE_KEY=' + 'x'.repeat(40)],
  ])('flags a %s in source', (name, text) => {
    expect(scanText('server/x.ts', text)).toEqual([`server/x.ts: ${name}`])
  })

  it('allows placeholders in examples and tests, and ordinary code', () => {
    expect(
      scanText('.env.example', 'SESSION_SECRET=dev-only-session-secret-0123456789abcdef0123456789'),
    ).toEqual([])
    expect(scanText('tests/unit/a.test.ts', `const k = "${key}"`)).toEqual([])
    expect(
      scanText('server/a.ts', 'const apiKey = process.env.KEY; // sk- prefix is checked elsewhere'),
    ).toEqual([])
  })

  it('flags files that must not be committed', () => {
    expect(scanFiles(['.env', 'certs/server.pem'], () => '')).toEqual([
      '.env: file that should not be committed',
      'certs/server.pem: file that should not be committed',
    ])
  })

  it('finds nothing in the repository as committed', () => {
    const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
    expect(scanFiles(files)).toEqual([])
  })
})
