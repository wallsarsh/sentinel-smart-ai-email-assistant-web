import { z } from 'zod'
import { useAuth } from '../../container'
import { RateLimiter } from '../../security/rate-limit'
import { failWith } from '../../utils/respond'
import { sessionToken } from '../../utils/auth-cookie'
import { requireStepUp } from '../../utils/step-up'

const limiter = new RateLimiter()

export default defineEventHandler(async (event) => {
  const { user } = await requireStepUp(event)
  const wait = limiter.hit(`pw:${user.id}`, { max: 5, windowMs: 60_000 })
  if (wait) return failWith(event, { kind: 'rate_limited', retryAfterSeconds: wait })
  const b = z
    .object({ current: z.string().max(256), next: z.string().max(256) })
    .safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useAuth().changePassword(
    user.id,
    b.data.current,
    b.data.next,
    sessionToken(event),
  )
  return r.ok ? { ok: true } : failWith(event, r.error)
})
