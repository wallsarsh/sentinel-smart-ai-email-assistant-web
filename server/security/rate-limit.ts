export type Limit = { max: number; windowMs: number }

/** Fixed-window counter per key; in memory per instance (sufficient as a first line of defence). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()
  constructor(private now: () => number = Date.now) {}

  /** Returns seconds to wait when over the limit, otherwise 0 (and counts the hit). */
  hit(key: string, limit: Limit): number {
    const t = this.now()
    const cur = this.hits.get(key)
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + limit.windowMs })
      this.prune(t)
      return 0
    }
    cur.count++
    return cur.count > limit.max ? Math.ceil((cur.resetAt - t) / 1000) : 0
  }

  private prune(t: number) {
    if (this.hits.size < 5000) return
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k)
  }
}

/** Limits by route class; auth endpoints are the tightest. */
export const LIMITS = {
  auth: { max: 10, windowMs: 60_000 } as Limit,
  sensitive: { max: 5, windowMs: 60_000 } as Limit,
  api: { max: 300, windowMs: 60_000 } as Limit,
}

export function classify(path: string): keyof typeof LIMITS {
  // Only endpoints that check a secret are throttled hard. Reads such as /api/auth/me run on every
  // page load (the route guard), and counting them here would sign people out by 429.
  if (
    /^\/api\/auth\/(login|signup|password|password-reset|password-reset-confirm|mfa\/(login|step-up|confirm|disable|recovery))$/.test(
      path,
    )
  )
    return 'auth'
  if (/^\/api\/auth\//.test(path)) return 'api'
  if (/^\/api\/(send|account|ai\/bench)/.test(path)) return 'sensitive'
  return 'api'
}
