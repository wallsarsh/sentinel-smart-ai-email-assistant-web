import { z } from 'zod'
import { useBrief } from '../../container'
import { RateLimiter } from '../../security/rate-limit'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const limiter = new RateLimiter()
const DAY = 86_400_000

/** "Catch me up": a summary of any recent range, shown but never stored. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z
    .object({ from: z.iso.datetime(), to: z.iso.datetime() })
    .safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'range', code: 'invalid' })
  const from = new Date(b.data.from)
  const to = new Date(b.data.to)
  const now = Date.now()
  if (from >= to || to.getTime() > now + 60_000 || from.getTime() < now - 90 * DAY)
    return failWith(event, { kind: 'validation', field: 'range', code: 'invalid' })
  const wait = limiter.hit(`catchup:${user.id}`, { max: 5, windowMs: 60_000 })
  if (wait) return failWith(event, { kind: 'rate_limited', retryAfterSeconds: wait })
  const r = await useBrief().catchUp(user.id, from, to)
  return r.ok ? { brief: r.value } : failWith(event, r.error)
})
