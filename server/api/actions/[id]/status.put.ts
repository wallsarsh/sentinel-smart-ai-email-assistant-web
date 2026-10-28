import { z } from 'zod'
import { useDb } from '../../../container'
import { forUser } from '../../../repos'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ status: z.enum(['open', 'done']) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'status', code: 'invalid' })
  const ok = await forUser(useDb(), user.id).actions.setStatus(
    getRouterParam(event, 'id') ?? '',
    b.data.status,
  )
  return ok ? { ok: true } : failWith(event, { kind: 'not_found' })
})
