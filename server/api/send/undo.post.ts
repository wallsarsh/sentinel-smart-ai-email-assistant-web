import { z } from 'zod'
import { useSendConfirmation } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ nonce: z.string().regex(/^[0-9a-f]{32}$/) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'nonce', code: 'invalid' })
  return { revoked: await useSendConfirmation().undo(user.id, b.data.nonce) }
})
