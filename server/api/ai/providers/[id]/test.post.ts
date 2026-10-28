import { useAiProviders } from '../../../../container'
import { failWith } from '../../../../utils/respond'
import { requireUser } from '../../../../utils/require-user'

/** Tests the key by listing models and refreshes the stored model list. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAiProviders().refreshModels(user.id, getRouterParam(event, 'id') ?? '')
  return r.ok ? { ok: true, models: r.value } : failWith(event, r.error)
})
