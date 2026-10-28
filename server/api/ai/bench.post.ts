import { useAiBench } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Synthetic samples only. Each side is a metered AI call and needs consent for its provider. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAiBench().compare(user.id, await readBody(event))
  return r.ok ? r.value : failWith(event, r.error)
})
