import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** The notification's "Mark done": closes the message's open action items and marks it read. Nothing else. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ messageId: z.uuid() }).safeParse(await readBody(event))
  if (!b.success)
    return failWith(event, { kind: 'validation', field: 'messageId', code: 'invalid' })
  const repos = forUser(useDb(), user.id)
  if (!(await repos.mail.setRead(b.data.messageId, true)))
    return failWith(event, { kind: 'not_found' })
  const n = await repos.actions.completeForMessage(b.data.messageId)
  return { ok: true, completed: n }
})
