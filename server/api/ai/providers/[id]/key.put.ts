import { useAiProviders } from '../../../../container'
import { failWith } from '../../../../utils/respond'
import { requireUser } from '../../../../utils/require-user'

/** Write-only: the key is accepted here and never returned by any route. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const body = (await readBody(event)) as { apiKey?: unknown } | null
  const r = await useAiProviders().replaceKey(
    user.id,
    getRouterParam(event, 'id') ?? '',
    body?.apiKey,
  )
  return r.ok ? r.value : failWith(event, r.error)
})
