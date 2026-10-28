import { useDraftSaver } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** Saves or updates the reply draft for a message at the mail provider. Never sends. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useDraftSaver().save(
    user.id,
    getRouterParam(event, 'id') ?? '',
    await readBody(event),
  )
  return r.ok ? r.value : failWith(event, r.error)
})
