import { z } from 'zod'
import { useAiProviders } from '../../../../container'
import { failWith } from '../../../../utils/respond'
import { requireUser } from '../../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ given: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'given', code: 'invalid' })
  const r = await useAiProviders().setConsent(
    user.id,
    getRouterParam(event, 'id') ?? '',
    b.data.given,
  )
  return r.ok ? r.value : failWith(event, r.error)
})
