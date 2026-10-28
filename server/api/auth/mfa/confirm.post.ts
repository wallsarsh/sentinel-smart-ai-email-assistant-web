import { z } from 'zod'
import { useMfa } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ code: z.string().max(16) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useMfa().confirm(user.id, b.data.code)
  return r.ok ? r.value : failWith(event, r.error)
})
