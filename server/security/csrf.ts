import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const CSRF_COOKIE = 'sentinel_csrf'
export const CSRF_HEADER = 'x-csrf-token'
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Token = random.HMAC(random) so a cookie planted by an attacker without the secret is rejected. */
export function newCsrfToken(secret: string): string {
  const r = randomBytes(18).toString('base64url')
  return `${r}.${sign(secret, r)}`
}

const sign = (secret: string, v: string) =>
  createHmac('sha256', secret).update(`csrf:${v}`).digest('base64url')

export function validCsrfToken(secret: string, token: string | undefined): boolean {
  if (!token) return false
  const [r, sig] = token.split('.')
  if (!r || !sig) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(secret, r))
  return a.length === b.length && timingSafeEqual(a, b)
}

export type CsrfDecision = 'ok' | 'reject'

/**
 * Double-submit check for state-changing requests: the header must equal the
 * cookie and carry a valid signature; when an Origin header is present it must
 * match the site (defence in depth against cross-site form posts).
 */
export function checkCsrf(input: {
  method: string
  origin: string | undefined
  baseUrl: string
  cookie: string | undefined
  header: string | undefined
  secret: string
}): CsrfDecision {
  if (SAFE.has(input.method.toUpperCase())) return 'ok'
  if (input.origin && new URL(input.baseUrl).origin !== input.origin) return 'reject'
  if (!input.cookie || !input.header) return 'reject'
  const a = Buffer.from(input.cookie)
  const b = Buffer.from(input.header)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'reject'
  return validCsrfToken(input.secret, input.header) ? 'ok' : 'reject'
}
