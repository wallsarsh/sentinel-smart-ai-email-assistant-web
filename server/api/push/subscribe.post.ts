import { usePush } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await usePush().subscribe(
    user.id,
    await readBody(event),
    getRequestHeader(event, 'user-agent') ?? '',
  )
  if (!r.ok) return failWith(event, r.error)
  setResponseStatus(event, 201)
  return r.value
})
