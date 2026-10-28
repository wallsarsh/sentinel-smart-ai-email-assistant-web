import { describe, expect, it } from 'vitest'
import { CSRF_HEADER, checkCsrf, newCsrfToken, validCsrfToken } from '../../server/security/csrf'
import { LIMITS, RateLimiter, classify } from '../../server/security/rate-limit'

const secret = 'x'.repeat(40)
const base = { baseUrl: 'https://app.test', secret, origin: undefined as string | undefined }

describe('csrf', () => {
  it('safe methods pass without a token', () => {
    expect(checkCsrf({ ...base, method: 'GET', cookie: undefined, header: undefined })).toBe('ok')
  })
  it('a cross-site POST is rejected (no header / wrong origin / mismatched)', () => {
    const t = newCsrfToken(secret)
    expect(checkCsrf({ ...base, method: 'POST', cookie: t, header: undefined })).toBe('reject')
    expect(
      checkCsrf({ ...base, method: 'POST', origin: 'https://evil.test', cookie: t, header: t }),
    ).toBe('reject')
    expect(checkCsrf({ ...base, method: 'POST', cookie: t, header: newCsrfToken(secret) })).toBe(
      'reject',
    )
  })
  it('matching, correctly signed token and same origin passes', () => {
    const t = newCsrfToken(secret)
    expect(
      checkCsrf({ ...base, method: 'POST', origin: 'https://app.test', cookie: t, header: t }),
    ).toBe('ok')
    expect(CSRF_HEADER).toBe('x-csrf-token')
  })
  it('a planted unsigned cookie is rejected even when header matches', () => {
    expect(checkCsrf({ ...base, method: 'DELETE', cookie: 'a.b', header: 'a.b' })).toBe('reject')
    expect(validCsrfToken(secret, newCsrfToken('y'.repeat(40)))).toBe(false)
  })
})

describe('rate limiter', () => {
  it('allows up to max, then returns the wait, then resets', () => {
    let now = 0
    const l = new RateLimiter(() => now)
    const lim = { max: 3, windowMs: 1000 }
    expect([1, 2, 3].map(() => l.hit('k', lim))).toEqual([0, 0, 0])
    expect(l.hit('k', lim)).toBe(1)
    expect(l.hit('other', lim)).toBe(0)
    now = 1001
    expect(l.hit('k', lim)).toBe(0)
  })
  it('auth routes are limited tighter than the general api', () => {
    expect(classify('/api/auth/login')).toBe('auth')
    expect(classify('/api/send/confirm')).toBe('sensitive')
    expect(classify('/api/inbox')).toBe('api')
    expect(LIMITS.auth.max).toBeLessThan(LIMITS.api.max)
  })
})

describe('csp configuration', () => {
  it('script-src uses a nonce and never unsafe-inline/eval', async () => {
    const { readFileSync } = await import('node:fs')
    const cfg = readFileSync('nuxt.config.ts', 'utf8')
    const line = cfg.split('\n').find((l) => l.includes("'script-src'"))!
    expect(line).toContain('nonce-')
    expect(line).not.toMatch(/unsafe-inline|unsafe-eval/)
    expect(cfg).toContain("'frame-ancestors': [\"'none'\"]")
  })
})
