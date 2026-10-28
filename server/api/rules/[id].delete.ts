import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const ok = await forUser(useDb(), user.id).rules.remove(getRouterParam(event, 'id') ?? '')
  return ok ? { ok: true } : failWith(event, { kind: 'not_found' })
})
