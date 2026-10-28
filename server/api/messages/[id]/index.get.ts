import { useDb } from '../../../container'
import { forUser } from '../../../repos'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** One message plus the other messages of its thread, from Sentinel's own copy. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = forUser(useDb(), user.id).mail
  const m = await r.getMessage(getRouterParam(event, 'id') ?? '')
  if (!m) return failWith(event, { kind: 'not_found' })
  const thread = m.threadId ? await r.threadMessages(m.threadId) : [m]
  return { message: m, thread }
})
