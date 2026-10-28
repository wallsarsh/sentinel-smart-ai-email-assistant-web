import { useDb, useHub } from '../../container'
import { clearMailCache } from '../../accounts/cache'
import { requireUser } from '../../utils/require-user'

/** Drops the local copy of mail; the next background check fetches it again. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await clearMailCache(useDb(), user.id)
  void useHub()
    .publish(user.id, { type: 'inbox.changed', data: { added: 0, removed: r.removed } })
    .catch(() => undefined)
  return r
})
