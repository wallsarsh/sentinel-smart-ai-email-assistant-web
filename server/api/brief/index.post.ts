import { useBrief, useDb } from '../../container'
import { forUser } from '../../repos'
import { RateLimiter } from '../../security/rate-limit'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'
import { briefWindow } from '../../../shared/brief'

const limiter = new RateLimiter()

/** Writes a new brief now (the refresh button). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const wait = limiter.hit(`brief:${user.id}`, { max: 3, windowMs: 60_000 })
  if (wait) return failWith(event, { kind: 'rate_limited', retryAfterSeconds: wait })
  const repos = forUser(useDb(), user.id)
  const prev = (await repos.briefs.latest())?.row.windowEnd ?? null
  const w = briefWindow(new Date(), prev)
  const r = await useBrief().generate(user.id, w.start, w.end)
  return r.ok ? { brief: r.value } : failWith(event, r.error)
})
