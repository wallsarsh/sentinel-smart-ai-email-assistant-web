import { useAccounts } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const body = (await readBody(event)) as { processed?: unknown } | null
  const r = await useAccounts().chooseFolders(
    user.id,
    getRouterParam(event, 'id') ?? '',
    body?.processed,
  )
  return r.ok ? { ok: true } : failWith(event, r.error)
})
