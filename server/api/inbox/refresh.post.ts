import { useDb } from '../../container'
import { jobQueue } from '../../jobs/queue'
import { requestRefresh } from '../../jobs/sync'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Queues a sync now (rate limited). The worker does the work; the UI hears about it over SSE. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const wait = await requestRefresh(jobQueue(useDb()), user.id)
  if (wait) return failWith(event, { kind: 'rate_limited', retryAfterSeconds: wait })
  setResponseStatus(event, 202)
  return { queued: true }
})
