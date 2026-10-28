import { useAiProviders } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAiProviders().create(user.id, await readBody(event))
  if (!r.ok) return failWith(event, r.error)
  setResponseStatus(event, 201)
  return r.value
})
