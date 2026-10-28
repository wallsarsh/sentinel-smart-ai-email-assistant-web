import { useAccounts, useAuditor } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const id = getRouterParam(event, 'id') ?? ''
  const r = await useAccounts().remove(user.id, id)
  if (!r.ok) return failWith(event, r.error)
  await useAuditor().record(user.id, 'account_removed', id)
  return { ok: true }
})
