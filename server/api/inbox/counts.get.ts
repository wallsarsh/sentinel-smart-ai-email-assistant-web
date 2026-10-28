import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const q = z.object({ accountId: z.uuid().optional() }).safeParse(getQuery(event))
  if (!q.success)
    return failWith(event, { kind: 'validation', field: 'accountId', code: 'invalid' })
  const inbox = forUser(useDb(), user.id).inbox
  return {
    counts: await inbox.counts(q.data.accountId),
    unread: await inbox.unreadCount(q.data.accountId),
  }
})
