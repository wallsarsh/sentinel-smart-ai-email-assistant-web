import { useAccounts } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAccounts().folders(user.id, getRouterParam(event, 'id') ?? '')
  return r.ok ? { folders: r.value } : failWith(event, r.error)
})
