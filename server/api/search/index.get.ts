import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const query = z.object({
  q: z.string().max(200),
  accountId: z.uuid().optional(),
  unread: z.enum(['1', '0']).optional(),
  offset: z.coerce.number().int().min(0).max(1000).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const p = query.safeParse(getQuery(event))
  if (!p.success)
    return failWith(event, {
      kind: 'validation',
      field: String(p.error.issues[0]?.path[0] ?? ''),
      code: 'invalid',
    })
  const hits = await forUser(useDb(), user.id).search.search({
    text: p.data.q,
    accountId: p.data.accountId,
    unreadOnly: p.data.unread === '1',
    offset: p.data.offset,
  })
  return { hits }
})
