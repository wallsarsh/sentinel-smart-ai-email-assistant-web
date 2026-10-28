import { LIMITS, RateLimiter, classify } from '../security/rate-limit'

const limiter = new RateLimiter()

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  const cls = classify(path)
  const who =
    (event.context.userId as string | undefined) ??
    getRequestIP(event, { xForwardedFor: false }) ??
    'unknown'
  const wait = limiter.hit(`${cls}:${who}`, LIMITS[cls])
  if (wait > 0) {
    setResponseHeader(event, 'retry-after', wait)
    throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
  }
})
