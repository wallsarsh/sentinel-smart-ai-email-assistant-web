import { useAiProviders } from '../../../../container'
import { failWith } from '../../../../utils/respond'
import { requireUser } from '../../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAiProviders().remove(user.id, getRouterParam(event, 'id') ?? '')
  return r.ok ? { ok: true } : failWith(event, r.error)
})
