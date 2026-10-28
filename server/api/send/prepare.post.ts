import { z } from 'zod'
import { useSendConfirmation } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Saves the draft and returns exactly what would be sent, with warnings. Sends nothing. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z
    .object({ messageId: z.uuid() })
    .passthrough()
    .safeParse(await readBody(event))
  if (!b.success)
    return failWith(event, { kind: 'validation', field: 'messageId', code: 'invalid' })
  const r = await useSendConfirmation().prepare(user.id, b.data.messageId, b.data)
  return r.ok ? r.value : failWith(event, r.error)
})
