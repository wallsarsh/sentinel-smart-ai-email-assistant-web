import { useAccounts } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAccounts().update(
    user.id,
    getRouterParam(event, 'id') ?? '',
    await readBody(event),
  )
  return r.ok ? r.value : failWith(event, r.error)
})
