import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { SEGMENTS } from '../../repos/inbox'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const query = z.object({
  segment: z.enum(SEGMENTS).default('all'),
  accountId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const q = query.safeParse(getQuery(event))
  if (!q.success)
    return failWith(event, {
      kind: 'validation',
      field: String(q.error.issues[0]?.path[0] ?? ''),
      code: 'invalid',
    })
  try {
    return await forUser(useDb(), user.id).inbox.list(q.data)
  } catch {
    return failWith(event, { kind: 'validation', field: 'cursor', code: 'invalid' })
  }
})
