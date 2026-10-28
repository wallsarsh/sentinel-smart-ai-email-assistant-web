import { z } from 'zod'
import { useDb } from '../../../container'
import { forUser } from '../../../repos'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/**
 * Read state is kept in Sentinel only. In v1 nothing is written back to the
 * mailbox, so this route (and its folder) must not import any mail provider;
 * a test enforces that.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const body = z.object({ isRead: z.boolean() }).safeParse(await readBody(event))
  if (!body.success)
    return failWith(event, { kind: 'validation', field: 'isRead', code: 'invalid' })
  const ok = await forUser(useDb(), user.id).mail.setRead(
    getRouterParam(event, 'id') ?? '',
    body.data.isRead,
  )
  return ok ? { ok: true } : failWith(event, { kind: 'not_found' })
})
