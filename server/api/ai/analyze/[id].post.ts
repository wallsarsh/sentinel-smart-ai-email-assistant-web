import { useDb, useTriage } from '../../../container'
import { forUser } from '../../../repos'
import { RateLimiter } from '../../../security/rate-limit'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

const limiter = new RateLimiter()

/** Sorts one message with the AI now (summary, priority, actions), for mail the background run has not reached. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const wait = limiter.hit(`analyze:${user.id}`, { max: 20, windowMs: 60_000 })
  if (wait) return failWith(event, { kind: 'rate_limited', retryAfterSeconds: wait })
  const id = getRouterParam(event, 'id') ?? ''
  if (!(await forUser(useDb(), user.id).mail.getMessage(id)))
    return failWith(event, { kind: 'not_found' })
  const run = await useTriage().triageMessages(user.id, [id])
  if (run.failure) return failWith(event, run.failure)
  return { ok: true, classified: run.byAi + run.byRule }
})
