import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Subject and sender for the messages linked from one brief item. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const ids = z
    .array(z.uuid())
    .max(20)
    .safeParse(
      String(getQuery(event).ids ?? '')
        .split(',')
        .filter(Boolean),
    )
  if (!ids.success) return failWith(event, { kind: 'validation', field: 'ids', code: 'invalid' })
  return { heads: await forUser(useDb(), user.id).briefs.heads(ids.data) }
})
