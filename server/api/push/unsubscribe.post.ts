import { z } from 'zod'
import { usePush } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ endpoint: z.string().max(1000) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'endpoint', code: 'invalid' })
  return { removed: await usePush().unsubscribe(user.id, b.data.endpoint) }
})
