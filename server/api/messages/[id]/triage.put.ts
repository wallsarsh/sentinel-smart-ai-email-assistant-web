import { useCorrections } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** User correction of importance and/or needs-reply (kept in Sentinel; nothing is written to the mailbox). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useCorrections().correct(
    user.id,
    getRouterParam(event, 'id') ?? '',
    await readBody(event),
  )
  return r.ok ? { ok: true } : failWith(event, r.error)
})
